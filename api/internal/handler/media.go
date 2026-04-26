package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/storage"
	"utterlog-go/internal/util"

	"github.com/Kagami/go-avif"
	"github.com/chai2010/webp"
	"github.com/disintegration/imaging"
	"github.com/gin-gonic/gin"
	goexif "github.com/rwcarlsen/goexif/exif"
)

// AVIF quality is encoded as a quantizer 0-63, opposite direction of
// the JPEG/WebP 0-100 scale exposed in admin: 0 = lossless, 63 =
// worst. We let admins use the same 0-100 'higher = better' slider
// across all formats and translate at encode time.
//
// Mapping at default 82 → 11 (visually transparent quality with
// significant size savings; Cloudinary's default-strong AVIF preset
// is around quantizer 13).
func avifQuantizerFor(quality int) int {
	if quality < 0 {
		quality = 0
	}
	if quality > 100 {
		quality = 100
	}
	q := (100 - quality) * 63 / 100
	if q < 0 {
		q = 0
	}
	if q > 63 {
		q = 63
	}
	return q
}

var allowedExts = map[string]bool{
	"jpg": true, "jpeg": true, "png": true, "gif": true, "webp": true, "avif": true, "svg": true, "ico": true,
	"mp4": true, "mp3": true, "wav": true, "flac": true, "ogg": true,
	"pdf": true, "doc": true, "docx": true, "xls": true, "xlsx": true, "ppt": true, "pptx": true, "txt": true, "md": true, "csv": true,
	"zip": true, "rar": true, "7z": true, "tar": true, "gz": true,
	"ttf": true, "woff": true, "woff2": true, "otf": true,
}

// Upload concurrency limiter
var uploadSem = make(chan struct{}, 5) // max 5 concurrent uploads
var uploadMu sync.Mutex

func detectCategory(mimeType, ext string) string {
	if strings.HasPrefix(mimeType, "image/") { return "image" }
	if strings.HasPrefix(mimeType, "video/") { return "video" }
	if strings.HasPrefix(mimeType, "audio/") { return "audio" }
	docExts := map[string]bool{"pdf": true, "doc": true, "docx": true, "xls": true, "xlsx": true, "ppt": true, "pptx": true, "txt": true, "md": true, "csv": true}
	if docExts[ext] { return "document" }
	archiveExts := map[string]bool{"zip": true, "rar": true, "7z": true, "tar": true, "gz": true}
	if archiveExts[ext] { return "archive" }
	return "other"
}

// extractExifFields extracts camera/lens/exposure info from EXIF, returns JSON string
func extractExifFields(x *goexif.Exif) string {
	fields := map[string]string{}

	if tag, err := x.Get(goexif.Make); err == nil {
		if v, e := tag.StringVal(); e == nil {
			fields["make"] = strings.TrimSpace(v)
		}
	}
	if tag, err := x.Get(goexif.Model); err == nil {
		if v, e := tag.StringVal(); e == nil {
			fields["model"] = strings.TrimSpace(v)
		}
	}
	if tag, err := x.Get(goexif.LensModel); err == nil {
		if v, e := tag.StringVal(); e == nil {
			fields["lens"] = strings.TrimSpace(v)
		}
	}
	if tag, err := x.Get(goexif.FocalLength); err == nil {
		num, denom, e := tag.Rat2(0)
		if e == nil && denom != 0 {
			fields["focal_length"] = fmt.Sprintf("%.0fmm", float64(num)/float64(denom))
		}
	}
	if tag, err := x.Get(goexif.FNumber); err == nil {
		num, denom, e := tag.Rat2(0)
		if e == nil && denom != 0 {
			v := float64(num) / float64(denom)
			if v == float64(int64(v)) {
				fields["aperture"] = fmt.Sprintf("f/%.0f", v)
			} else {
				fields["aperture"] = fmt.Sprintf("f/%.1f", v)
			}
		}
	}
	if tag, err := x.Get(goexif.ExposureTime); err == nil {
		num, denom, e := tag.Rat2(0)
		if e == nil && denom != 0 {
			if denom > num {
				fields["shutter_speed"] = fmt.Sprintf("1/%d", denom/num)
			} else {
				fields["shutter_speed"] = fmt.Sprintf("%.1fs", float64(num)/float64(denom))
			}
		}
	}
	if tag, err := x.Get(goexif.ISOSpeedRatings); err == nil {
		val, e := tag.Int(0)
		if e == nil {
			fields["iso"] = fmt.Sprintf("ISO %d", val)
		}
	}
	if tm, err := x.DateTime(); err == nil {
		fields["date_taken"] = tm.Format("2006-01-02 15:04:05")
	}

	if len(fields) == 0 {
		return ""
	}
	b, _ := json.Marshal(fields)
	return string(b)
}

// resolveFolder returns the folder name if valid, else ""
func resolveFolder(folder string) string {
	if storage.ValidFolders[folder] {
		return folder
	}
	return ""
}

// resolveStorageForFolder returns the storage backend for a given folder,
// respecting per-folder driver settings (folder_driver_<name> option).
func resolveStorageForFolder(folder string) storage.Storage {
	if folder != "" {
		key := "folder_driver_" + folder
		setting := model.GetOption(key)
		if setting == "local" {
			return storage.NewLocalStorage()
		}
		if setting == "cloud" {
			if s := storage.NewS3IfConfigured(); s != nil {
				return s
			}
		}
	}
	// Fall back to global default
	return storage.Default
}

func UploadMedia(c *gin.Context) {
	// Concurrency limit
	select {
	case uploadSem <- struct{}{}:
		defer func() { <-uploadSem }()
	default:
		util.Error(c, http.StatusTooManyRequests, "TOO_MANY_UPLOADS", "上传并发数已满，请稍后再试")
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		util.BadRequest(c, "未收到文件"); return
	}
	defer file.Close()

	folder := resolveFolder(c.PostForm("folder"))
	if folder == "" {
		folder = resolveFolder(c.Query("folder"))
	}

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != "" { ext = ext[1:] }
	if !allowedExts[ext] {
		util.Error(c, http.StatusBadRequest, "VALIDATION_ERROR", "不支持的文件类型: "+ext); return
	}

	// Configurable max size (default 50MB)
	maxSizeMB := 50
	if v := model.GetOption("max_upload_size"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 { maxSizeMB = n }
	}
	if header.Size > int64(maxSizeMB)*1024*1024 {
		util.BadRequest(c, fmt.Sprintf("文件大小超过 %dMB 限制", maxSizeMB)); return
	}

	// Check if we need to convert image format
	convertFormat := model.GetOption("image_convert_format") // "", "webp", "jpg"
	quality := 82
	if v := model.GetOption("image_quality"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 { quality = n }
	}
	maxWidth := 0
	if v := model.GetOption("image_max_width"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 { maxWidth = n }
	}
	stripExif := model.GetOption("image_strip_exif") == "true" || model.GetOption("image_strip_exif") == "1"

	category := detectCategory(header.Header.Get("Content-Type"), ext)
	finalExt := ext

	stg := resolveStorageForFolder(folder)
	driverName := config.C.StorageDriver
	if _, isLocal := stg.(*storage.LocalStorage); isLocal {
		driverName = "local"
	} else if driverName == "" {
		driverName = "local"
	}

	// Image processing (only for PNG/JPEG — WebP/AVIF/SVG/GIF/ICO pass through)
	processable := map[string]bool{"jpg": true, "jpeg": true, "png": true}
	if category == "image" && processable[ext] {
		var exifJSON string
		if !stripExif {
			exifData, exifErr := goexif.Decode(file)
			if exifErr == nil {
				exifJSON = extractExifFields(exifData)
			}
			file.Seek(0, 0)
		}

		if convertFormat != "" && (convertFormat == "webp" || convertFormat == "jpg" || convertFormat == "png" || convertFormat == "avif") {
			finalExt = convertFormat
		}

		filename := storage.GeneratePath(finalExt, folder)

		img, _, decErr := image.Decode(file)
		var buf bytes.Buffer
		if decErr != nil {
			file.Seek(0, 0)
			io.Copy(&buf, file)
		} else {
			if maxWidth > 0 && img.Bounds().Dx() > maxWidth {
				img = imaging.Resize(img, maxWidth, 0, imaging.Lanczos)
			}
			// EXIF handling note: Go's stdlib jpeg/png encoders + chai2010/webp
			// + gen2brain/avif all encode WITHOUT writing an EXIF segment.
			// So once we hit image.Decode → re-encode below, the output is
			// guaranteed to have no EXIF metadata regardless of the
			// stripExif flag. The flag's real job is upstream (line 207-213):
			// it controls whether we read the original file's EXIF into
			// the media row's exif_data column for later display in the
			// post body (camera/lens/aperture readout). The label "去除
			// EXIF 信息" is therefore lossy in practice — the only thing
			// the toggle controls is whether the metadata is preserved
			// for display, never whether it ships in the output bytes.
			switch finalExt {
			case "webp":
				webp.Encode(&buf, img, &webp.Options{Quality: float32(quality)})
			case "avif":
				// CGO-backed AVIF encoder (Kagami/go-avif → libaom-av1).
				// 5-10× faster than the previous pure-Go WASM library:
				// 1080p encodes drop from 1-3s to ~150-300ms. Speed=8
				// is the libaom default — best balance of encode time
				// vs file size for upload-time encoding. Threads=0
				// asks the encoder to use all available cores.
				avifQ := avifQuantizerFor(quality)
				if encErr := avif.Encode(&buf, img, &avif.Options{Quality: avifQ, Speed: 8}); encErr != nil {
					// Fall back to WebP on encoder failure rather than
					// 500ing — easier to diagnose when WebP succeeds
					// while AVIF doesn't.
					buf.Reset()
					finalExt = "webp"
					webp.Encode(&buf, img, &webp.Options{Quality: float32(quality)})
				}
			case "png":
				png.Encode(&buf, img)
			default:
				finalExt = "jpg"
				jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality})
			}
		}

		mimeMap := map[string]string{"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp", "avif": "image/avif"}
		mimeType := mimeMap[finalExt]
		if mimeType == "" { mimeType = "image/" + finalExt }

		fileURL, uploadErr := stg.Upload(filename, &buf, mimeType)
		if uploadErr != nil {
			util.Error(c, 500, "SAVE_ERROR", "文件保存失败: "+uploadErr.Error()); return
		}
		finalSize := int64(buf.Len())

		thumbs := gin.H{}
		if img != nil {
			baseName := strings.TrimSuffix(filename, "."+finalExt)
			thumbs = generateThumbnailsToStorage(img, baseName, stg)
		}

		t := config.T("media")
		var id int
		config.DB.QueryRow(fmt.Sprintf(
			"INSERT INTO %s (name, filename, url, mime_type, size, driver, category, exif_data, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", t),
			header.Filename, filename, fileURL, mimeType, finalSize, driverName, category, exifJSON, time.Now().Unix(),
		).Scan(&id)

		util.Success(c, gin.H{
			"id": id, "name": header.Filename, "url": fileURL,
			"size": finalSize, "original_size": header.Size,
			"mime_type": mimeType, "category": category,
			"compressed": finalSize < header.Size, "converted": finalExt != ext,
			"thumbnails": thumbs, "folder": folder,
		})
		return
	}

	// Non-image: save directly via storage interface
	filename := storage.GeneratePath(ext, folder)
	mimeType := header.Header.Get("Content-Type")

	fileURL, uploadErr := stg.Upload(filename, file, mimeType)
	if uploadErr != nil {
		util.Error(c, 500, "SAVE_ERROR", "文件保存失败: "+uploadErr.Error()); return
	}

	t := config.T("media")
	var id int
	config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (name, filename, url, mime_type, size, driver, category, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", t),
		header.Filename, filename, fileURL, mimeType, header.Size, driverName, category, time.Now().Unix(),
	).Scan(&id)

	util.Success(c, gin.H{
		"id": id, "name": header.Filename, "url": fileURL,
		"size": header.Size, "mime_type": mimeType,
		"category": category, "folder": folder,
	})
}

// DownloadFromURL downloads a remote file (e.g. streaming music cover/audio) and saves to storage
func DownloadFromURL(c *gin.Context) {
	var req struct {
		URL    string `json:"url" form:"url"`
		Folder string `json:"folder" form:"folder"`
		Name   string `json:"name" form:"name"`
	}
	if err := c.ShouldBind(&req); err != nil || req.URL == "" {
		util.BadRequest(c, "url 不能为空"); return
	}

	folder := resolveFolder(req.Folder)

	// Validate URL
	parsed, err := url.ParseRequestURI(req.URL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		util.BadRequest(c, "无效的 URL"); return
	}

	// Download
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Get(req.URL)
	if err != nil {
		util.Error(c, 500, "DOWNLOAD_FAILED", "下载失败: "+err.Error()); return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		util.Error(c, 500, "DOWNLOAD_FAILED", fmt.Sprintf("远程服务器返回 %d", resp.StatusCode)); return
	}

	// Determine extension from Content-Type or URL
	ct := resp.Header.Get("Content-Type")
	ext := ""
	if ct != "" {
		exts, _ := mime.ExtensionsByType(ct)
		if len(exts) > 0 {
			ext = strings.TrimPrefix(exts[0], ".")
			// Normalize
			if ext == "jfif" || ext == "jpe" { ext = "jpg" }
		}
	}
	if ext == "" {
		// Try from URL path
		urlPath := parsed.Path
		if e := filepath.Ext(urlPath); e != "" {
			ext = strings.ToLower(strings.TrimPrefix(e, "."))
		}
	}
	if ext == "" { ext = "bin" }

	// Max 100MB for downloads
	maxSizeMB := 100
	if v := model.GetOption("max_upload_size"); v != "" {
		if n, err2 := strconv.Atoi(v); err2 == nil && n > 0 { maxSizeMB = n * 2 }
	}
	limited := io.LimitReader(resp.Body, int64(maxSizeMB)*1024*1024)

	var buf bytes.Buffer
	written, copyErr := io.Copy(&buf, limited)
	if copyErr != nil {
		util.Error(c, 500, "SAVE_ERROR", "读取失败: "+copyErr.Error()); return
	}

	stg := resolveStorageForFolder(folder)
	driverName := config.C.StorageDriver
	if _, isLocal := stg.(*storage.LocalStorage); isLocal {
		driverName = "local"
	} else if driverName == "" {
		driverName = "local"
	}

	filename := storage.GeneratePath(ext, folder)
	fileURL, uploadErr := stg.Upload(filename, &buf, ct)
	if uploadErr != nil {
		util.Error(c, 500, "SAVE_ERROR", "保存失败: "+uploadErr.Error()); return
	}

	name := req.Name
	if name == "" {
		name = filepath.Base(parsed.Path)
		if name == "" || name == "/" { name = "download." + ext }
	}

	category := detectCategory(ct, ext)

	t := config.T("media")
	var id int
	config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (name, filename, url, mime_type, size, driver, category, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", t),
		name, filename, fileURL, ct, written, driverName, category, time.Now().Unix(),
	).Scan(&id)

	util.Success(c, gin.H{
		"id": id, "name": name, "url": fileURL,
		"size": written, "mime_type": ct, "category": category, "folder": folder,
	})
}

// Thumbnail sizes
var thumbSizes = []struct {
	Name   string
	Width  int
	Height int
}{
	{"large", 1200, 630},
	{"medium", 480, 300},
	{"small", 300, 300},
}

// generateThumbnails creates 3 WebP thumbnails from the source image (local only, legacy)
func generateThumbnails(src image.Image, baseName string) gin.H {
	return generateThumbnailsToStorage(src, baseName, storage.Default)
}

// generateThumbnailsToStorage creates 3 WebP thumbnails and uploads via the given storage backend
func generateThumbnailsToStorage(src image.Image, baseName string, stg storage.Storage) gin.H {
	result := gin.H{}
	quality := 80
	if v := model.GetOption("image_quality"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 { quality = n }
	}

	for _, size := range thumbSizes {
		thumbFilename := baseName + "-" + size.Name + ".webp"
		thumb := imaging.Fill(src, size.Width, size.Height, imaging.Center, imaging.Lanczos)

		var buf bytes.Buffer
		webp.Encode(&buf, thumb, &webp.Options{Quality: float32(quality)})

		thumbURL, err := stg.Upload(thumbFilename, &buf, "image/webp")
		if err != nil {
			continue
		}
		result[size.Name] = thumbURL
	}
	return result
}

func saveRawFile(src io.ReadSeeker, path string) {
	dst, err := os.Create(path)
	if err != nil { return }
	defer dst.Close()
	io.Copy(dst, src)
}

func ListMedia(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	category := c.Query("category")
	excludeCategory := c.Query("exclude_category")
	t := config.T("media")

	conditions := []string{}
	args := []interface{}{}
	idx := 1
	if category != "" {
		conditions = append(conditions, fmt.Sprintf("category = $%d", idx))
		args = append(args, category)
		idx++
	}
	if excludeCategory != "" {
		conditions = append(conditions, fmt.Sprintf("category != $%d", idx))
		args = append(args, excludeCategory)
		idx++
	}

	where := ""
	if len(conditions) > 0 {
		where = "WHERE " + strings.Join(conditions, " AND ")
	}

	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s %s", t, where), args...)

	args = append(args, perPage, (page-1)*perPage)
	var files []map[string]interface{}
	rows, _ := config.DB.Queryx(fmt.Sprintf("SELECT * FROM %s %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d", t, where, idx, idx+1), args...)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			files = append(files, row)
		}
	}
	if files == nil { files = []map[string]interface{}{} }

	util.Success(c, gin.H{
		"files": files, "total": total, "page": page, "limit": perPage,
		"totalPages": (total + perPage - 1) / perPage,
	})
}

func DeleteMedia(c *gin.Context) {
	id := c.Param("id")
	t := config.T("media")

	var filename string
	config.DB.Get(&filename, "SELECT filename FROM "+t+" WHERE id = $1", id)
	if filename != "" {
		os.Remove(filepath.Join("public/uploads", filename))
		// Also remove thumbnails
		ext := filepath.Ext(filename)
		baseName := strings.TrimSuffix(filename, ext)
		for _, size := range thumbSizes {
			os.Remove(filepath.Join("public/uploads", baseName+"-"+size.Name+".webp"))
		}
	}
	config.DB.Exec("DELETE FROM "+t+" WHERE id = $1", id)
	util.Success(c, nil)
}

// GetMediaExif returns EXIF data for given image URLs (batch query)
func GetMediaExif(c *gin.Context) {
	urls := c.Query("urls")
	if urls == "" {
		util.BadRequest(c, "urls parameter required")
		return
	}

	urlList := strings.Split(urls, ",")
	if len(urlList) > 50 {
		util.BadRequest(c, "maximum 50 URLs per request")
		return
	}

	t := config.T("media")
	result := map[string]interface{}{}

	for _, u := range urlList {
		u = strings.TrimSpace(u)
		if u == "" {
			continue
		}
		var exifData string
		err := config.DB.Get(&exifData,
			fmt.Sprintf("SELECT COALESCE(exif_data, '') FROM %s WHERE url = $1", t), u)
		if err == nil && exifData != "" {
			var parsed map[string]string
			if json.Unmarshal([]byte(exifData), &parsed) == nil && len(parsed) > 0 {
				result[u] = parsed
			}
		}
	}

	util.Success(c, result)
}

// UploadBranding handles logo/favicon uploads with fixed filenames, no processing
func UploadBranding(c *gin.Context) {
	purpose := c.PostForm("purpose") // "logo", "dark-logo", "favicon"
	if purpose != "logo" && purpose != "dark-logo" && purpose != "favicon" {
		util.BadRequest(c, "purpose 必须为 logo、dark-logo 或 favicon")
		return
	}

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		util.BadRequest(c, "未收到文件")
		return
	}
	defer file.Close()

	brandingExts := map[string]bool{
		"png": true, "jpg": true, "jpeg": true, "gif": true,
		"webp": true, "avif": true, "ico": true, "svg": true,
	}
	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != "" {
		ext = ext[1:]
	}
	if !brandingExts[ext] {
		util.BadRequest(c, "不支持的图片格式，请使用 PNG/JPG/GIF/WebP/AVIF/ICO/SVG")
		return
	}

	if header.Size > 5*1024*1024 {
		util.BadRequest(c, "文件大小不能超过 5MB")
		return
	}

	// Fixed filename: logo.ext / dark-logo.ext / favicon.ext
	filename := purpose + "." + ext

	// Persist into public/uploads/branding/ — the existing uploads/
	// volume mount (./uploads:/app/public/uploads in compose) means
	// these files survive container recreation. The previous code
	// saved into public/ at the image root, which lives in the
	// container's writable layer and gets wiped on every
	// `docker compose pull && up -d`. Result: every upgrade nuked
	// the admin's uploaded logo / favicon / dark-logo back to the
	// baked-in defaults.
	brandingDir := filepath.Join("public", "uploads", "branding")
	if err := os.MkdirAll(brandingDir, 0755); err != nil {
		util.Error(c, 500, "SAVE_FAILED", "创建 branding 目录失败：" + err.Error())
		return
	}

	// Remove old files with same purpose but different extension —
	// in BOTH the new persistent location AND the legacy public/
	// root (so an upgrade from a previous install doesn't leave a
	// stale public/favicon.png shadowing the new uploads/branding/
	// favicon.svg).
	oldExts := []string{"png", "jpg", "jpeg", "gif", "webp", "avif", "ico", "svg"}
	for _, oe := range oldExts {
		oldName := purpose + "." + oe
		if oldName == filename {
			continue
		}
		os.Remove(filepath.Join(brandingDir, oldName))
		os.Remove(filepath.Join("public", oldName))
	}

	fullPath := filepath.Join(brandingDir, filename)
	out, err := os.Create(fullPath)
	if err != nil {
		util.Error(c, 500, "SAVE_FAILED", "保存文件失败：" + err.Error())
		return
	}
	defer out.Close()

	if _, err := io.Copy(out, file); err != nil {
		util.Error(c, 500, "SAVE_FAILED", "写入文件失败")
		return
	}

	// Return a ROOT-RELATIVE path like '/logo.png', NOT the full
	// '<site_url>/logo.png'. Why:
	//
	//   * site_url 改了不影响。Admin 改了「常规设置 → 站点网址」
	//     之后 logo 路径不会指向旧域名。
	//
	//   * 跨环境通用。本地 docker（site_url 可能是空 / localhost:9260）
	//     和正式环境（site_url 是 https://xxx.com）共用同一份 DB
	//     option，浏览器都能正确加载。
	//
	//   * 真正"写死的固定地址"。/logo.<ext> 由 main.go 的
	//     servePersistent 路由解析到 public/uploads/branding/，
	//     无论 host 是什么都走同一条路由。
	//
	// 浏览器渲染 <img src="/logo.png"> 时自动以当前页面 origin 拼接，
	// 不需要 admin 关心 site_url。手动粘贴外部 CDN 绝对 URL 的情况
	// 不走这个 handler（直接打到 input 框上），不受影响。
	url := "/" + filename

	util.Success(c, gin.H{
		"url":      url,
		"filename": filename,
		"purpose":  purpose,
	})
}

// MediaStats returns file count and total size per storage driver,
// plus the real host disk usage of the uploads directory so the
// admin progress bar can show actual free space (not a synthetic
// admin-configured quota).
func MediaStats(c *gin.Context) {
	t := config.T("media")
	type driverStat struct {
		Driver string `db:"driver" json:"driver"`
		Files  int    `db:"files" json:"files"`
		Size   int64  `db:"size" json:"size"`
	}
	var stats []driverStat
	config.DB.Select(&stats, fmt.Sprintf(
		"SELECT COALESCE(driver,'local') as driver, COUNT(*) as files, COALESCE(SUM(size),0) as size FROM %s GROUP BY driver", t))

	// Total
	var totalFiles int
	var totalSize int64
	byDriver := map[string]driverStat{}
	for _, s := range stats {
		totalFiles += s.Files
		totalSize += s.Size
		byDriver[s.Driver] = s
	}

	// Real disk usage of the uploads directory (or its parent if
	// uploads doesn't exist yet on a fresh install). statfs reports
	// the underlying filesystem regardless of bind-mount layering, so
	// in the dev container it sees the host's mounted disk and in
	// production it sees whatever volume the operator mounted to
	// /app/public/uploads. Falls back to the api process working
	// directory if the uploads path can't be stat'd.
	disk := getUploadsDiskInfo()

	util.Success(c, gin.H{
		"files":   totalFiles,
		"size":    totalSize,
		"drivers": byDriver,
		"disk":    disk,
	})
}

// getUploadsDiskInfo runs statfs against the uploads directory and
// returns total / used / free in bytes plus a percent-used integer
// 0-100. Cross-platform via syscall.Statfs_t (Linux + macOS dev).
// Returns zero values on failure rather than an error so the admin
// just sees a missing bar instead of a 500.
func getUploadsDiskInfo() gin.H {
	target := "./public/uploads"
	if _, err := os.Stat(target); err != nil {
		// Fresh install before any upload — fall back to the api's
		// CWD which should sit on the same filesystem.
		target = "."
	}
	total, used, free, percent := statfsBytes(target)
	return gin.H{
		"total":   total,
		"used":    used,
		"free":    free,
		"percent": percent,
		"path":    target,
	}
}

// TestStorageConnection tests S3/R2 connectivity
func TestStorageConnection(c *gin.Context) {
	var req struct {
		Driver    string `json:"driver"`
		Endpoint  string `json:"endpoint"`
		Region    string `json:"region"`
		Bucket    string `json:"bucket"`
		AccessKey string `json:"access_key"`
		SecretKey string `json:"secret_key"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "参数错误")
		return
	}
	if req.Driver != "s3" && req.Driver != "r2" {
		util.BadRequest(c, "仅支持 S3/R2 驱动测试")
		return
	}
	if req.Bucket == "" || req.AccessKey == "" || req.SecretKey == "" {
		util.BadRequest(c, "Bucket、Access Key、Secret Key 不能为空")
		return
	}

	if err := storage.TestConnection(req.Endpoint, req.Region, req.Bucket, req.AccessKey, req.SecretKey); err != nil {
		util.Error(c, 400, "CONNECTION_FAILED", fmt.Sprintf("连接失败: %v", err))
		return
	}
	util.Success(c, gin.H{"message": "连接成功"})
}

// statfsBytes returns total / used / free disk bytes plus a 0-100
// percent-used integer for the filesystem hosting the given path.
//
// Uses syscall.Statfs_t which works on Linux + macOS (the only OSes
// utterlog runs on). The Bsize field type differs between platforms
// (int64 on Linux, uint32 on darwin), but a single int64 cast covers
// both since neither value approaches int64 overflow.
//
// Bavail (available to non-root) is preferred over Bfree (total free)
// because reserved root-only blocks aren't actually usable for
// uploads — surfacing them as "free" would let the bar reach 100%
// while writes start failing with ENOSPC.
//
// Failure returns zeros so the admin UI just hides the bar gracefully
// instead of crashing the request.
func statfsBytes(path string) (total, used, free uint64, percent int) {
	var buf syscall.Statfs_t
	if err := syscall.Statfs(path, &buf); err != nil {
		return 0, 0, 0, 0
	}
	bsize := uint64(buf.Bsize) //nolint:gosec // bsize is always small + non-negative
	total = uint64(buf.Blocks) * bsize
	free = uint64(buf.Bavail) * bsize
	used = total - free
	if total > 0 {
		percent = int(used * 100 / total)
	}
	return
}
