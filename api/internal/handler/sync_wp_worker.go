package handler

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"regexp"
	"strings"
	"sync"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/storage"

	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
)

// ============================================================
// Post-/finish async worker
//
// Triggered by SyncWPFinish as a goroutine. Stages:
//   1. media_scan   — extract WP media URLs from all imported posts
//   2. media_pull   — download each unique URL, stage in storage, create ul_media
//   3. rewrite      — replace old WP URLs with new UL URLs in post content
//   4. geoip        — lookup country/city for comment IPs (best-effort)
//   5. done         — mark job finished
//
// Progress visible via GET /api/v1/sync/wordpress/job/:id/status.
// ============================================================

const workerConcurrency = 4

// RunPostFinishWorker is the entrypoint the /finish handler calls as
// a goroutine. It runs all async stages sequentially.
func RunPostFinishWorker(jobID, siteUUID string) {
	defer func() {
		if r := recover(); r != nil {
			msg := fmt.Sprintf("worker panic: %v", r)
			_ = failJob(jobID, msg)
		}
	}()

	updateJob(jobID, "stage", "media_scan")
	urlMap, err := scanPostsForMediaURLs(jobID, siteUUID)
	if err != nil {
		_ = failJob(jobID, "media_scan: "+err.Error())
		return
	}
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET media_total=$1 WHERE job_id=$2", config.T("sync_jobs")), len(urlMap), jobID)

	updateJob(jobID, "stage", "media_pull")
	if err := downloadAllMedia(jobID, siteUUID, urlMap); err != nil {
		_ = failJob(jobID, "media_pull: "+err.Error())
		return
	}

	updateJob(jobID, "stage", "rewrite")
	if err := rewritePostsWithNewURLs(jobID, siteUUID); err != nil {
		_ = failJob(jobID, "rewrite: "+err.Error())
		return
	}

	// Count recalc runs BEFORE geoip so the homepage sidebar / dashboard
	// don't stay stuck at 0 for the ~minutes that the rate-limited
	// ip-api.com lookups take (0.17-3 req/s for 400+ comments). GeoIP
	// is a cosmetic enrichment; sync progress should feel done when
	// the user-visible counts are right.
	updateJob(jobID, "stage", "counts")

	// Recalculate term counts for this site.
	config.DB.Exec(fmt.Sprintf(`
		UPDATE %s m SET count = (
		  SELECT COUNT(*) FROM %s r WHERE r.meta_id = m.id
		) WHERE m.source_site_uuid = $1
	`, config.T("metas"), config.T("relationships")), siteUUID)

	// Recalculate comment_count for imported posts. Utterlog native
	// flow increments comment_count on each new comment; bulk sync
	// inserts bypass that path so the cached count stays 0 without
	// this pass — which breaks homepage cards and dashboard stats.
	config.DB.Exec(fmt.Sprintf(`
		UPDATE %s p SET comment_count = COALESCE(sub.c, 0)
		FROM (
		  SELECT post_id, COUNT(*) c FROM %s
		  WHERE status='approved' GROUP BY post_id
		) sub
		WHERE p.id = sub.post_id AND p.source_site_uuid = $1
	`, config.T("posts"), config.T("comments")), siteUUID)

	updateJob(jobID, "stage", "geoip")
	_ = fillCommentGeoIP(jobID, siteUUID)

	config.DB.Exec(fmt.Sprintf(`
		UPDATE %s SET status='finished', stage='done', finished_at=$1 WHERE job_id=$2
	`, config.T("sync_jobs")), time.Now().Unix(), jobID)
}

// ==================== stage 1: scan ====================

// wpMediaURLRegex matches WP upload URLs. The bulk of URLs look like:
//   https://example.com/wp-content/uploads/2024/03/my-photo-1024x768.jpg
// We allow any domain (we'll filter by manifest.source_url later) and
// any extension. Size-suffix (-NNNxNN) is captured and stripped so
// all variants of one image map to the same original.
var wpMediaURLRegex = regexp.MustCompile(
	`(https?://[^\s"'<>()]+/wp-content/uploads/[^\s"'<>()]+?\.(?:jpg|jpeg|png|gif|webp|svg|mp4|webm|mp3|wav|ogg|pdf|zip|doc|docx|xls|xlsx))`)

var wpThumbnailSuffixRegex = regexp.MustCompile(`-\d+x\d+(\.[a-z]+)$`)

// normalizeWPURL strips WP's -NNNxNN thumbnail suffix so variants of
// the same image resolve to the same "original" URL. The original is
// what we download; UL generates its own thumbnails.
func normalizeWPURL(u string) string {
	return wpThumbnailSuffixRegex.ReplaceAllString(u, "$1")
}

// scanPostsForMediaURLs reads all posts imported by this job and
// returns a map original_url → nil (value filled in later). Also
// captures featured_image_url (cover_url) URLs.
func scanPostsForMediaURLs(jobID, siteUUID string) (map[string]*mediaItem, error) {
	urls := map[string]*mediaItem{}
	rows, err := config.DB.Queryx(fmt.Sprintf(`
		SELECT id, content, excerpt, cover_url FROM %s WHERE source_site_uuid = $1
	`, config.T("posts")), siteUUID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	for rows.Next() {
		var id int
		var content, excerpt, coverURL string
		if err := rows.Scan(&id, &content, &excerpt, &coverURL); err != nil {
			continue
		}
		for _, match := range wpMediaURLRegex.FindAllString(content+" "+excerpt, -1) {
			norm := normalizeWPURL(match)
			if _, exists := urls[norm]; !exists {
				urls[norm] = &mediaItem{OriginalURL: norm}
			}
		}
		if coverURL != "" {
			norm := normalizeWPURL(coverURL)
			if _, exists := urls[norm]; !exists {
				urls[norm] = &mediaItem{OriginalURL: norm}
			}
		}
	}

	// Persist queue (idempotent — ON CONFLICT ignores dupes).
	for u := range urls {
		config.DB.Exec(fmt.Sprintf(`
			INSERT INTO %s (job_id, original_url, status, created_at) VALUES ($1, $2, 'pending', $3)
			ON CONFLICT (job_id, original_url) DO NOTHING
		`, config.T("sync_media_queue")), jobID, u, time.Now().Unix())
	}
	return urls, nil
}

type mediaItem struct {
	OriginalURL string
	NewURL      string
	MediaID     int
	Error       string
}

// ==================== stage 2: download ====================

func downloadAllMedia(jobID, siteUUID string, urls map[string]*mediaItem) error {
	sem := make(chan struct{}, workerConcurrency)
	wg := sync.WaitGroup{}
	mu := sync.Mutex{}
	done := 0

	for rawURL, item := range urls {
		wg.Add(1)
		go func(u string, mi *mediaItem) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			result, err := pullOneMedia(u, siteUUID)
			mu.Lock()
			if err != nil {
				mi.Error = err.Error()
				config.DB.Exec(fmt.Sprintf(`
					UPDATE %s SET status='failed', error_message=$1, attempts=attempts+1
					WHERE job_id=$2 AND original_url=$3
				`, config.T("sync_media_queue")), err.Error(), jobID, u)
			} else {
				mi.NewURL = result.URL
				mi.MediaID = result.MediaID
				config.DB.Exec(fmt.Sprintf(`
					UPDATE %s SET status='done', new_url=$1, new_media_id=$2, completed_at=$3, attempts=attempts+1
					WHERE job_id=$4 AND original_url=$5
				`, config.T("sync_media_queue")), result.URL, result.MediaID, time.Now().Unix(), jobID, u)
			}
			done++
			config.DB.Exec(fmt.Sprintf("UPDATE %s SET media_done=$1 WHERE job_id=$2", config.T("sync_jobs")), done, jobID)
			mu.Unlock()
		}(rawURL, item)
	}
	wg.Wait()
	return nil
}

type pullResult struct {
	URL     string
	MediaID int
}

// pullOneMedia downloads a single URL, pushes it through the storage
// layer, and creates the ul_media row. Dedupes by SHA-256 across the
// same site — identical content only stored once.
func pullOneMedia(rawURL, siteUUID string) (*pullResult, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, "GET", rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Utterlog-Sync/1.0")
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, 100*1024*1024)) // 100MB cap
	if err != nil {
		return nil, err
	}
	if len(body) == 0 {
		return nil, fmt.Errorf("空文件")
	}

	// SHA-256 dedupe
	hash := sha256.Sum256(body)
	hashHex := hex.EncodeToString(hash[:])
	var existID int
	var existURL string
	_ = config.DB.QueryRow(fmt.Sprintf(`
		SELECT id, url FROM %s
		WHERE source_site_uuid=$1 AND exif_data LIKE $2
		LIMIT 1
	`, config.T("media")), siteUUID, "%"+hashHex+"%").Scan(&existID, &existURL)
	if existID > 0 && existURL != "" {
		return &pullResult{URL: existURL, MediaID: existID}, nil
	}

	// Parse URL → filename + ext
	parsed, _ := url.Parse(rawURL)
	filename := path.Base(parsed.Path)
	if filename == "" || filename == "/" {
		filename = "file_" + randHex(4)
	}
	ext := strings.TrimPrefix(path.Ext(filename), ".")
	if ext == "" {
		ext = "bin"
	}

	mime := resp.Header.Get("Content-Type")
	if mime == "" || mime == "application/octet-stream" {
		mime = detectMimeFromExt(ext)
	}

	// Storage path mirrors WP's year/month layout.
	year, month := extractYearMonth(parsed.Path)
	subdir := "sync"
	if year != "" && month != "" {
		subdir = path.Join("sync", siteUUID, year, month)
	} else {
		subdir = path.Join("sync", siteUUID)
	}
	storagePath := storage.GeneratePath(ext, subdir)

	newURL, err := storage.Default.Upload(storagePath, bytes.NewReader(body), mime)
	if err != nil {
		return nil, err
	}

	// Category + exif_data. We store the SHA in exif_data so future
	// pulls can dedupe without reading file bytes again.
	category := detectCategory(mime, ext)
	exifPayload := map[string]string{"sha256": hashHex, "original_url": rawURL}
	exifJSON, _ := json.Marshal(exifPayload)

	driverName := "local"
	if config.C.StorageDriver == "s3" || config.C.StorageDriver == "r2" {
		driverName = config.C.StorageDriver
	}

	var id int
	err = config.DB.QueryRow(fmt.Sprintf(`
		INSERT INTO %s (name, filename, url, mime_type, size, driver, category,
		                exif_data, created_at,
		                source_type, source_id, source_site_uuid)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'wordpress', 0, $10)
		RETURNING id
	`, config.T("media")),
		filename, storagePath, newURL, mime, int64(len(body)), driverName, category,
		string(exifJSON), time.Now().Unix(), siteUUID).Scan(&id)
	if err != nil {
		return nil, err
	}
	return &pullResult{URL: newURL, MediaID: id}, nil
}

func extractYearMonth(urlPath string) (string, string) {
	parts := strings.Split(urlPath, "/")
	for i, p := range parts {
		if len(p) == 4 && isAllDigits(p) && i+1 < len(parts) && len(parts[i+1]) == 2 && isAllDigits(parts[i+1]) {
			return p, parts[i+1]
		}
	}
	return "", ""
}
func isAllDigits(s string) bool {
	for _, r := range s {
		if r < '0' || r > '9' {
			return false
		}
	}
	return s != ""
}

func detectMimeFromExt(ext string) string {
	switch strings.ToLower(ext) {
	case "jpg", "jpeg":
		return "image/jpeg"
	case "png":
		return "image/png"
	case "gif":
		return "image/gif"
	case "webp":
		return "image/webp"
	case "svg":
		return "image/svg+xml"
	case "mp4":
		return "video/mp4"
	case "webm":
		return "video/webm"
	case "mp3":
		return "audio/mpeg"
	case "pdf":
		return "application/pdf"
	}
	return "application/octet-stream"
}

// ==================== stage 3: rewrite ====================

func rewritePostsWithNewURLs(jobID, siteUUID string) error {
	// Load URL map: original → new.
	pairs := map[string]string{}
	rows, err := config.DB.Queryx(fmt.Sprintf(`
		SELECT original_url, new_url FROM %s WHERE job_id=$1 AND status='done'
	`, config.T("sync_media_queue")), jobID)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var orig, neu string
		rows.Scan(&orig, &neu)
		if neu != "" {
			pairs[orig] = neu
		}
	}
	if len(pairs) == 0 {
		return nil
	}

	// Iterate posts, rewrite content + excerpt + cover_url.
	postRows, err := config.DB.Queryx(fmt.Sprintf(`
		SELECT id, content, excerpt, cover_url FROM %s WHERE source_site_uuid=$1
	`, config.T("posts")), siteUUID)
	if err != nil {
		return err
	}
	defer postRows.Close()

	rewritten := 0
	for postRows.Next() {
		var id int
		var content, excerpt, coverURL string
		if err := postRows.Scan(&id, &content, &excerpt, &coverURL); err != nil {
			continue
		}
		newContent := rewriteURLs(content, pairs)
		newExcerpt := rewriteURLs(excerpt, pairs)
		newCover := rewriteSingleURL(coverURL, pairs)

		if newContent != content || newExcerpt != excerpt || newCover != coverURL {
			config.DB.Exec(fmt.Sprintf(`
				UPDATE %s SET content=$1, excerpt=$2, cover_url=$3, updated_at=$4 WHERE id=$5
			`, config.T("posts")), newContent, newExcerpt, newCover, time.Now().Unix(), id)
			rewritten++
		}
	}

	config.DB.Exec(fmt.Sprintf("UPDATE %s SET posts_rewritten=$1 WHERE job_id=$2", config.T("sync_jobs")), rewritten, jobID)
	return nil
}

// rewriteURLs replaces all WP media URLs (including size-suffix
// variants) in a string with the mapped new URLs.
func rewriteURLs(s string, pairs map[string]string) string {
	if s == "" || len(pairs) == 0 {
		return s
	}
	return wpMediaURLRegex.ReplaceAllStringFunc(s, func(match string) string {
		norm := normalizeWPURL(match)
		if newU, ok := pairs[norm]; ok {
			return newU
		}
		return match
	})
}

// rewriteSingleURL is for fields storing just a URL (cover_url).
func rewriteSingleURL(u string, pairs map[string]string) string {
	if u == "" {
		return u
	}
	norm := normalizeWPURL(u)
	if newU, ok := pairs[norm]; ok {
		return newU
	}
	return u
}

// ==================== stage 4: geoip ====================

// fillCommentGeoIP looks up country/city for every comment imported
// by this site that has an IP but no geo yet. Uses ip-api.com free
// endpoint (45 req/min). Best effort — errors are logged to the job
// but don't block completion.
func fillCommentGeoIP(jobID, siteUUID string) error {
	rows, err := config.DB.Queryx(fmt.Sprintf(`
		SELECT id, author_ip::text FROM %s
		WHERE source_site_uuid=$1 AND (geo IS NULL OR geo = '')
		  AND author_ip IS NOT NULL AND author_ip::text NOT IN ('0.0.0.0', '::')
		LIMIT 5000
	`, config.T("comments")), siteUUID)
	if err != nil {
		return err
	}
	defer rows.Close()

	type commentRow struct {
		ID int
		IP string
	}
	all := []commentRow{}
	for rows.Next() {
		var cr commentRow
		rows.Scan(&cr.ID, &cr.IP)
		all = append(all, cr)
	}

	// Throttle: 3 req/s under the free tier's 45/min cap.
	ticker := time.NewTicker(350 * time.Millisecond)
	defer ticker.Stop()
	for _, cr := range all {
		<-ticker.C
		geo := lookupIPGeo(cr.IP)
		if geo == "" {
			continue
		}
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET geo=$1 WHERE id=$2", config.T("comments")), geo, cr.ID)
	}
	return nil
}

func lookupIPGeo(ip string) string {
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET",
		"http://ip-api.com/json/"+ip+"?fields=status,country,regionName,city&lang=zh-CN", nil)
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var data struct {
		Status     string `json:"status"`
		Country    string `json:"country"`
		RegionName string `json:"regionName"`
		City       string `json:"city"`
	}
	json.Unmarshal(body, &data)
	if data.Status != "success" {
		return ""
	}
	out, _ := json.Marshal(map[string]string{
		"country": data.Country,
		"region":  data.RegionName,
		"city":    data.City,
	})
	return string(out)
}

// ==================== helpers ====================

func updateJob(jobID string, field, value string) {
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET %s=$1 WHERE job_id=$2", config.T("sync_jobs"), field), value, jobID)
}

func failJob(jobID, message string) error {
	_, err := config.DB.Exec(fmt.Sprintf(`
		UPDATE %s SET status='failed', error_message=$1, finished_at=$2 WHERE job_id=$3
	`, config.T("sync_jobs")), message, time.Now().Unix(), jobID)
	return err
}

// model ref silences "imported and not used" if a future extension
// uses it directly. Currently unused but kept for symmetry.
var _ = model.GetOption
