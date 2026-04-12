package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/chai2010/webp"
	"github.com/disintegration/imaging"
	"github.com/gin-gonic/gin"
)

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

	// Generate path
	dateDir := time.Now().Format("2006/01/02")
	randBytes := make([]byte, 8)
	rand.Read(randBytes)

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

	// Image processing (only for PNG/JPEG — WebP/AVIF/SVG/GIF/ICO pass through)
	processable := map[string]bool{"jpg": true, "jpeg": true, "png": true}
	if category == "image" && processable[ext] {
		// Determine output format: only convert PNG/JPEG → webp/jpg/png
		if convertFormat != "" && (convertFormat == "webp" || convertFormat == "jpg" || convertFormat == "png") {
			finalExt = convertFormat
		}

		filename := dateDir + "/" + hex.EncodeToString(randBytes) + "." + finalExt
		fullPath := filepath.Join("public/uploads", filename)
		os.MkdirAll(filepath.Dir(fullPath), 0755)

		// Decode image
		img, _, decErr := image.Decode(file)
		if decErr != nil {
			file.Seek(0, 0)
			saveRawFile(file, fullPath)
		} else {
			// Resize if max width configured
			if maxWidth > 0 && img.Bounds().Dx() > maxWidth {
				img = imaging.Resize(img, maxWidth, 0, imaging.Lanczos)
			}

			// Strip EXIF: re-encoding inherently removes EXIF
			_ = stripExif

			// Encode to target format
			dst, err := os.Create(fullPath)
			if err != nil {
				util.Error(c, 500, "SAVE_ERROR", "文件保存失败"); return
			}
			defer dst.Close()

			switch finalExt {
			case "webp":
				webp.Encode(dst, img, &webp.Options{Quality: float32(quality)})
			case "png":
				png.Encode(dst, img)
			default: // jpg
				finalExt = "jpg"
				jpeg.Encode(dst, img, &jpeg.Options{Quality: quality})
			}
		}

		fi, _ := os.Stat(filepath.Join("public/uploads", filename))
		finalSize := int64(0)
		if fi != nil { finalSize = fi.Size() }

		url := config.C.AppURL + "/uploads/" + filename
		mimeMap := map[string]string{"jpg": "image/jpeg", "png": "image/png", "webp": "image/webp"}
		mime := mimeMap[finalExt]
		if mime == "" { mime = "image/" + finalExt }

		t := config.T("media")
		var id int
		config.DB.QueryRow(fmt.Sprintf(
			"INSERT INTO %s (name, filename, url, mime_type, size, driver, category, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", t),
			header.Filename, filename, url, mime, finalSize, "local", category, time.Now().Unix(),
		).Scan(&id)

		util.Success(c, gin.H{
			"id": id, "name": header.Filename, "url": url,
			"size": finalSize, "original_size": header.Size,
			"mime_type": mime, "category": category,
			"compressed": finalSize < header.Size, "converted": finalExt != ext,
		})
		return
	}

	// Non-image file: save directly
	filename := dateDir + "/" + hex.EncodeToString(randBytes) + "." + ext
	fullPath := filepath.Join("public/uploads", filename)
	os.MkdirAll(filepath.Dir(fullPath), 0755)

	dst, err := os.Create(fullPath)
	if err != nil {
		util.Error(c, 500, "SAVE_ERROR", "文件保存失败"); return
	}
	defer dst.Close()
	io.Copy(dst, file)

	url := config.C.AppURL + "/uploads/" + filename

	t := config.T("media")
	var id int
	config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (name, filename, url, mime_type, size, driver, category, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", t),
		header.Filename, filename, url, header.Header.Get("Content-Type"), header.Size, "local", category, time.Now().Unix(),
	).Scan(&id)

	util.Success(c, gin.H{
		"id": id, "name": header.Filename, "url": url,
		"size": header.Size, "mime_type": header.Header.Get("Content-Type"), "category": category,
	})
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
	t := config.T("media")

	where := ""
	args := []interface{}{}
	idx := 1
	if category != "" {
		where = fmt.Sprintf("WHERE category = $%d", idx)
		args = append(args, category); idx++
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
	}
	config.DB.Exec("DELETE FROM "+t+" WHERE id = $1", id)
	util.Success(c, nil)
}
