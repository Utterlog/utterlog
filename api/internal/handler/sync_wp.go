package handler

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// ============================================================
// WordPress → Utterlog sync endpoints
//
//   POST /api/v1/sync/wordpress/start       create job
//   POST /api/v1/sync/wordpress/batch       ingest a resource batch
//   POST /api/v1/sync/wordpress/finish      close job, trigger async media+rewrite
//   GET  /api/v1/sync/wordpress/job/:id     poll status
//   POST /api/v1/sync/wordpress/rollback    delete everything from a site_uuid
//
// Auth: body-level {site_uuid, token}. Token is verified against a
// bcrypt hash in ul_sync_sites. Comparison is constant-time.
//
// Resources: categories, tags, posts, pages, comments.
// Media is NOT a batch — it's extracted from post content URLs after
// /finish by a background worker (see sync_wp_worker.go).
// ============================================================

// ---------------- auth ----------------

type syncAuthEnvelope struct {
	SiteUUID string `json:"site_uuid"`
	Token    string `json:"token"`
}

// authSyncRequest verifies the body-level site_uuid + token against
// ul_sync_sites and returns the site row (or 401). It also updates
// last_seen_at to help admins spot dead tokens.
func authSyncRequest(c *gin.Context, env syncAuthEnvelope) (*syncSite, bool) {
	if env.SiteUUID == "" || env.Token == "" {
		util.Error(c, 401, "BAD_AUTH", "缺少 site_uuid 或 token")
		return nil, false
	}
	site := syncSite{}
	err := config.DB.Get(&site,
		fmt.Sprintf("SELECT * FROM %s WHERE site_uuid = $1 LIMIT 1", config.T("sync_sites")),
		env.SiteUUID)
	if err != nil {
		util.Error(c, 401, "BAD_AUTH", "site_uuid 未注册")
		return nil, false
	}
	if site.Disabled {
		util.Error(c, 403, "DISABLED", "site 已禁用")
		return nil, false
	}
	// bcrypt compare (constant-time inside CompareHashAndPassword)
	if err := bcrypt.CompareHashAndPassword([]byte(site.TokenHash), []byte(env.Token)); err != nil {
		// fallback: some deployments may store plaintext tokens from
		// earlier iteration — try constant-time string compare too.
		if subtle.ConstantTimeCompare([]byte(site.TokenHash), []byte(env.Token)) != 1 {
			util.Error(c, 401, "BAD_AUTH", "token 不匹配")
			return nil, false
		}
	}
	_, _ = config.DB.Exec(
		fmt.Sprintf("UPDATE %s SET last_seen_at = $1 WHERE site_uuid = $2", config.T("sync_sites")),
		time.Now().Unix(), env.SiteUUID)
	return &site, true
}

type syncSite struct {
	ID         int    `db:"id" json:"id"`
	SiteUUID   string `db:"site_uuid" json:"site_uuid"`
	Label      string `db:"label" json:"label"`
	SourceURL  string `db:"source_url" json:"source_url"`
	TokenHash  string `db:"token_hash" json:"-"` // never expose to client
	Disabled   bool   `db:"disabled" json:"disabled"`
	LastSeenAt int64  `db:"last_seen_at" json:"last_seen_at"`
	CreatedAt  int64  `db:"created_at" json:"created_at"`
	UpdatedAt  int64  `db:"updated_at" json:"updated_at"`
}

// ---------------- /ping ----------------

// SyncWPPing is a lightweight auth-only endpoint for the plugin's
// "测试连接" button: verifies that the Utterlog URL is reachable AND
// that the {site_uuid, token} pair matches a registered, non-disabled
// site. Returns the site's label + last-seen time so the plugin can
// show a friendly confirmation.
func SyncWPPing(c *gin.Context) {
	var req syncAuthEnvelope
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "JSON 解析失败")
		return
	}
	site, ok := authSyncRequest(c, req)
	if !ok {
		return
	}
	util.Success(c, gin.H{
		"ok":            true,
		"site_uuid":     site.SiteUUID,
		"label":         site.Label,
		"source_url":    site.SourceURL,
		"last_seen_at":  site.LastSeenAt,
		"server_time":   time.Now().Unix(),
		"server_version": "1.0.0",
	})
}

// ---------------- /start ----------------

type startReq struct {
	syncAuthEnvelope
	Manifest map[string]interface{} `json:"manifest"`
}

// SyncWPStart creates a job and returns its job_id.
func SyncWPStart(c *gin.Context) {
	var req startReq
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "JSON 解析失败")
		return
	}
	site, ok := authSyncRequest(c, req.syncAuthEnvelope)
	if !ok {
		return
	}

	// source_url in manifest is authoritative — overrides whatever's
	// stored on the site row so reused UUIDs don't mismatch.
	if src, _ := req.Manifest["source_url"].(string); src != "" {
		config.DB.Exec(
			fmt.Sprintf("UPDATE %s SET source_url = $1, updated_at = $2 WHERE site_uuid = $3", config.T("sync_sites")),
			src, time.Now().Unix(), site.SiteUUID)
	}

	jobID := "job_" + randHex(12)
	manifestJSON, _ := json.Marshal(req.Manifest)
	now := time.Now().Unix()

	_, err := config.DB.Exec(fmt.Sprintf(`
		INSERT INTO %s (job_id, site_uuid, status, stage, manifest, started_at)
		VALUES ($1, $2, 'running', 'import', $3, $4)
	`, config.T("sync_jobs")),
		jobID, site.SiteUUID, manifestJSON, now)
	if err != nil {
		util.Error(c, 500, "DB_ERR", err.Error())
		return
	}

	util.Success(c, gin.H{
		"job_id":     jobID,
		"started_at": now,
	})
}

// ---------------- /batch ----------------

type batchReq struct {
	syncAuthEnvelope
	JobID    string                   `json:"job_id"`
	Resource string                   `json:"resource"`
	BatchNo  int                      `json:"batch_no"`
	Items    []map[string]interface{} `json:"items"`
}

// SyncWPBatch ingests one batch of one resource. Idempotent by
// (job_id, resource, batch_no): retries return early without double-
// inserting.
func SyncWPBatch(c *gin.Context) {
	var req batchReq
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "JSON 解析失败")
		return
	}
	site, ok := authSyncRequest(c, req.syncAuthEnvelope)
	if !ok {
		return
	}
	if req.JobID == "" || req.Resource == "" || req.BatchNo <= 0 {
		util.BadRequest(c, "缺少 job_id / resource / batch_no")
		return
	}

	// Dedup: if we've already processed this batch, return 200 quickly.
	var seen int
	config.DB.Get(&seen, fmt.Sprintf(`
		SELECT COUNT(*) FROM %s WHERE job_id=$1 AND resource=$2 AND batch_no=$3
	`, config.T("sync_batches")), req.JobID, req.Resource, req.BatchNo)
	if seen > 0 {
		util.Success(c, gin.H{"duplicate": true, "items_received": len(req.Items)})
		return
	}

	// Dispatch per resource.
	var imported int
	var err error
	switch req.Resource {
	case "categories":
		imported, err = importTerms(req.JobID, site.SiteUUID, "category", req.Items)
	case "tags":
		imported, err = importTerms(req.JobID, site.SiteUUID, "tag", req.Items)
	case "posts":
		imported, err = importPostsOrPages(req.JobID, site.SiteUUID, "post", req.Items)
	case "pages":
		imported, err = importPostsOrPages(req.JobID, site.SiteUUID, "page", req.Items)
	case "comments":
		imported, err = importComments(req.JobID, site.SiteUUID, req.Items)
	default:
		util.Error(c, 400, "BAD_RESOURCE", "未知 resource: "+req.Resource)
		return
	}
	if err != nil {
		util.Error(c, 500, "IMPORT_ERR", err.Error())
		return
	}

	_, _ = config.DB.Exec(fmt.Sprintf(`
		INSERT INTO %s (job_id, resource, batch_no, received_at, item_count)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (job_id, resource, batch_no) DO NOTHING
	`, config.T("sync_batches")),
		req.JobID, req.Resource, req.BatchNo, time.Now().Unix(), imported)

	util.Success(c, gin.H{
		"imported": imported,
		"resource": req.Resource,
		"batch_no": req.BatchNo,
	})
}

// ---------------- /finish ----------------

type finishReq struct {
	syncAuthEnvelope
	JobID   string                 `json:"job_id"`
	Summary map[string]interface{} `json:"summary"`
}

// SyncWPFinish closes the job and kicks off the async media + rewrite
// + geoip worker. Returns immediately; use /job/:id to poll progress.
func SyncWPFinish(c *gin.Context) {
	var req finishReq
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "JSON 解析失败")
		return
	}
	site, ok := authSyncRequest(c, req.syncAuthEnvelope)
	if !ok {
		return
	}
	if req.JobID == "" {
		util.BadRequest(c, "缺少 job_id")
		return
	}

	// Transition to 'processing' — the async stages run next.
	countsJSON, _ := json.Marshal(req.Summary)
	_, err := config.DB.Exec(fmt.Sprintf(`
		UPDATE %s SET status='processing', stage='media_scan', counts=$1 WHERE job_id=$2
	`, config.T("sync_jobs")), countsJSON, req.JobID)
	if err != nil {
		util.Error(c, 500, "DB_ERR", err.Error())
		return
	}

	// Fire-and-forget worker; progress visible via /job/:id.
	go RunPostFinishWorker(req.JobID, site.SiteUUID)

	util.Success(c, gin.H{
		"job_id":    req.JobID,
		"status":    "processing",
		"next_stage": "media download + content rewrite",
		"hint":      "轮询 /api/v1/sync/wordpress/job/" + req.JobID + "/status",
	})
}

// ---------------- /job/:id/status ----------------

func SyncWPJobStatus(c *gin.Context) {
	jobID := c.Param("id")
	if jobID == "" {
		util.BadRequest(c, "缺少 job_id")
		return
	}
	row := struct {
		JobID          string  `db:"job_id"`
		SiteUUID       string  `db:"site_uuid"`
		Status         string  `db:"status"`
		Stage          string  `db:"stage"`
		MediaTotal     int     `db:"media_total"`
		MediaDone      int     `db:"media_done"`
		PostsRewritten int     `db:"posts_rewritten"`
		ErrorMessage   *string `db:"error_message"`
		StartedAt      int64   `db:"started_at"`
		FinishedAt     *int64  `db:"finished_at"`
	}{}
	err := config.DB.Get(&row, fmt.Sprintf(`
		SELECT job_id, site_uuid, status, stage,
		       media_total, media_done, posts_rewritten,
		       error_message, started_at, finished_at
		FROM %s WHERE job_id = $1
	`, config.T("sync_jobs")), jobID)
	if err != nil {
		util.Error(c, 404, "NOT_FOUND", "job 不存在")
		return
	}
	payload := gin.H{
		"job_id":          row.JobID,
		"site_uuid":       row.SiteUUID,
		"status":          row.Status,
		"stage":           row.Stage,
		"media_total":     row.MediaTotal,
		"media_done":      row.MediaDone,
		"posts_rewritten": row.PostsRewritten,
		"started_at":      row.StartedAt,
	}
	if row.ErrorMessage != nil && *row.ErrorMessage != "" {
		payload["error"] = *row.ErrorMessage
	}
	if row.FinishedAt != nil {
		payload["finished_at"] = *row.FinishedAt
	}
	util.Success(c, payload)
}

// ---------------- /rollback ----------------

type rollbackReq struct {
	syncAuthEnvelope
	Confirm string `json:"confirm"` // must be the site_uuid to actually run
}

// SyncWPRollback deletes all content that was imported from the given
// site_uuid. Requires confirm == site_uuid to avoid accidents.
func SyncWPRollback(c *gin.Context) {
	var req rollbackReq
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "JSON 解析失败")
		return
	}
	site, ok := authSyncRequest(c, req.syncAuthEnvelope)
	if !ok {
		return
	}
	if req.Confirm != site.SiteUUID {
		util.Error(c, 400, "CONFIRM_MISMATCH",
			"confirm 字段必须等于 site_uuid ("+site.SiteUUID+") 才能执行回滚")
		return
	}

	counts := gin.H{}
	for _, table := range []string{"posts", "comments", "metas", "media"} {
		res, err := config.DB.Exec(
			fmt.Sprintf("DELETE FROM %s WHERE source_site_uuid=$1", config.T(table)),
			site.SiteUUID)
		if err != nil {
			counts[table+"_error"] = err.Error()
			continue
		}
		n, _ := res.RowsAffected()
		counts[table] = n
	}
	// Also clean up sync state
	config.DB.Exec(fmt.Sprintf(
		"DELETE FROM %s WHERE job_id IN (SELECT job_id FROM %s WHERE site_uuid=$1)",
		config.T("sync_id_map"), config.T("sync_jobs")), site.SiteUUID)
	config.DB.Exec(fmt.Sprintf(
		"DELETE FROM %s WHERE job_id IN (SELECT job_id FROM %s WHERE site_uuid=$1)",
		config.T("sync_batches"), config.T("sync_jobs")), site.SiteUUID)
	config.DB.Exec(fmt.Sprintf(
		"DELETE FROM %s WHERE job_id IN (SELECT job_id FROM %s WHERE site_uuid=$1)",
		config.T("sync_media_queue"), config.T("sync_jobs")), site.SiteUUID)
	config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE site_uuid=$1", config.T("sync_jobs")), site.SiteUUID)

	util.Success(c, gin.H{
		"rolled_back":  true,
		"site_uuid":    site.SiteUUID,
		"rows_removed": counts,
	})
}

// ================== Admin-facing site management ==================
//
// These run behind middleware.Auth() + role check; users with admin
// role can create / list / revoke sync sites.

type createSiteReq struct {
	Label     string `json:"label"`
	SourceURL string `json:"source_url"`
}

// AdminSyncSiteCreate generates a new site_uuid + plaintext token,
// stores the bcrypt hash, and returns the plaintext ONCE. Admin must
// copy it immediately — token is not retrievable later.
func AdminSyncSiteCreate(c *gin.Context) {
	var req createSiteReq
	c.ShouldBindJSON(&req)

	uuid := "wp_" + randHex(16)
	token := randHex(24) // 48 hex chars
	hash, _ := bcrypt.GenerateFromPassword([]byte(token), bcrypt.DefaultCost)
	now := time.Now().Unix()

	_, err := config.DB.Exec(fmt.Sprintf(`
		INSERT INTO %s (site_uuid, label, source_url, token_hash, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $5)
	`, config.T("sync_sites")),
		uuid, req.Label, req.SourceURL, string(hash), now)
	if err != nil {
		util.Error(c, 500, "DB_ERR", err.Error())
		return
	}

	util.Success(c, gin.H{
		"site_uuid": uuid,
		"token":     token,
		"label":     req.Label,
		"note":      "请立即保存 token — 之后无法再次查看",
	})
}

// AdminSyncSiteList returns all registered sync sites (no token).
func AdminSyncSiteList(c *gin.Context) {
	rows := []struct {
		syncSite
		RecentJobs int `db:"recent_jobs" json:"recent_jobs"`
	}{}
	config.DB.Select(&rows, fmt.Sprintf(`
		SELECT s.*, COALESCE((SELECT COUNT(*) FROM %s j WHERE j.site_uuid = s.site_uuid), 0) AS recent_jobs
		FROM %s s
		ORDER BY s.created_at DESC
	`, config.T("sync_jobs"), config.T("sync_sites")))
	util.Success(c, gin.H{"sites": rows})
}

// AdminSyncSiteDelete revokes a site (deletes the row; all imported
// data is preserved — use /rollback to also wipe content).
func AdminSyncSiteDelete(c *gin.Context) {
	uuid := c.Param("uuid")
	if uuid == "" {
		util.BadRequest(c, "缺少 uuid")
		return
	}
	_, err := config.DB.Exec(fmt.Sprintf(
		"DELETE FROM %s WHERE site_uuid = $1", config.T("sync_sites")), uuid)
	if err != nil {
		util.Error(c, 500, "DB_ERR", err.Error())
		return
	}
	util.Success(c, gin.H{"deleted": uuid})
}

// AdminSyncJobList returns recent sync jobs across all sites.
func AdminSyncJobList(c *gin.Context) {
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit <= 0 || limit > 200 {
		limit = 20
	}
	rows := []map[string]interface{}{}
	r, err := config.DB.Queryx(fmt.Sprintf(`
		SELECT job_id, site_uuid, status, stage, media_total, media_done,
		       posts_rewritten, started_at, finished_at
		FROM %s ORDER BY started_at DESC LIMIT $1
	`, config.T("sync_jobs")), limit)
	if err != nil {
		util.Error(c, 500, "DB_ERR", err.Error())
		return
	}
	defer r.Close()
	for r.Next() {
		m := map[string]interface{}{}
		r.MapScan(m)
		rows = append(rows, m)
	}
	util.Success(c, gin.H{"jobs": rows})
}

// ================== shared helpers ==================

func randHex(bytes int) string {
	b := make([]byte, bytes)
	rand.Read(b)
	return hex.EncodeToString(b)
}

// mapStatusWP translates WordPress post_status into UL's enum.
func mapStatusWP(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "publish", "published":
		return "published"
	case "private":
		return "private"
	case "draft", "pending":
		return "draft"
	default:
		return "draft"
	}
}

// mapCommentStatusWP translates comment_approved into UL's enum.
func mapCommentStatusWP(v interface{}) string {
	s := fmt.Sprintf("%v", v)
	switch s {
	case "1", "true", "approved":
		return "approved"
	case "0", "false":
		return "pending"
	case "spam":
		return "spam"
	case "trash":
		return "trash"
	default:
		return "pending"
	}
}

// parseISOTime accepts RFC3339 / WP's "Y-m-d H:i:s" / unix integer.
func parseISOTime(v interface{}) int64 {
	if v == nil {
		return 0
	}
	switch t := v.(type) {
	case float64:
		return int64(t)
	case int64:
		return t
	case string:
		if t == "" {
			return 0
		}
		formats := []string{
			time.RFC3339, time.RFC3339Nano,
			"2006-01-02T15:04:05Z",
			"2006-01-02 15:04:05",
			"2006-01-02T15:04:05",
		}
		for _, f := range formats {
			if parsed, err := time.Parse(f, t); err == nil {
				return parsed.Unix()
			}
		}
	}
	return 0
}

// itemStr fetches a string field from an item map safely.
func itemStr(m map[string]interface{}, key string) string {
	if v, ok := m[key]; ok && v != nil {
		return fmt.Sprintf("%v", v)
	}
	return ""
}

// itemInt64 fetches an int field from an item map.
func itemInt64(m map[string]interface{}, key string) int64 {
	if v, ok := m[key]; ok && v != nil {
		switch n := v.(type) {
		case float64:
			return int64(n)
		case int:
			return int64(n)
		case int64:
			return n
		case string:
			if parsed, err := strconv.ParseInt(n, 10, 64); err == nil {
				return parsed
			}
		}
	}
	return 0
}

// itemBool fetches a bool field.
func itemBool(m map[string]interface{}, key string) bool {
	if v, ok := m[key]; ok && v != nil {
		switch b := v.(type) {
		case bool:
			return b
		case string:
			return b == "true" || b == "1" || b == "open" || b == "yes"
		}
	}
	return false
}

// itemStrSlice fetches a string slice field (e.g., categories).
func itemStrSlice(m map[string]interface{}, key string) []string {
	out := []string{}
	if v, ok := m[key]; ok && v != nil {
		if arr, ok := v.([]interface{}); ok {
			for _, x := range arr {
				if s, ok := x.(string); ok && s != "" {
					out = append(out, s)
				}
			}
		}
	}
	return out
}

// mapSet / mapGet for the ul_sync_id_map table.
func syncMapSet(jobID, resource string, sourceID int64, targetID int) {
	config.DB.Exec(fmt.Sprintf(`
		INSERT INTO %s (job_id, resource, source_id, target_id) VALUES ($1, $2, $3, $4)
		ON CONFLICT (job_id, resource, source_id) DO UPDATE SET target_id = EXCLUDED.target_id
	`, config.T("sync_id_map")),
		jobID, resource, sourceID, targetID)
}

func syncMapGet(jobID, resource string, sourceID int64) (int, bool) {
	var id int
	err := config.DB.Get(&id, fmt.Sprintf(`
		SELECT target_id FROM %s WHERE job_id=$1 AND resource=$2 AND source_id=$3
	`, config.T("sync_id_map")), jobID, resource, sourceID)
	if err != nil {
		return 0, false
	}
	return id, true
}
