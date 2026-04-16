package handler

import (
	"bytes"
	"fmt"
	"image"
	"image/jpeg"
	"image/png"
	"io"
	"log"
	"net/http"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/storage"

	"github.com/chai2010/webp"
	"github.com/disintegration/imaging"
)

// SyncContentMedia downloads external cover images and stores them in the media library.
// Called asynchronously after ContentCreate/ContentUpdate.
func SyncContentMedia(contentType string, contentID int, coverURL string) {
	go func() {
		if coverURL == "" || isLocalURL(coverURL) {
			return
		}

		log.Printf("[media-sync] %s#%d downloading %s", contentType, contentID, coverURL)

		resp, err := http.Get(coverURL)
		if err != nil || resp.StatusCode != 200 {
			log.Printf("[media-sync] download failed: %v", err)
			return
		}
		defer resp.Body.Close()

		data, err := io.ReadAll(resp.Body)
		if err != nil {
			log.Printf("[media-sync] read body failed: %v", err)
			return
		}

		ct := resp.Header.Get("Content-Type")
		ext := extFromMime(ct)
		if ext == "" {
			ext = extFromURL(coverURL)
		}
		if ext == "" {
			ext = "jpg"
		}

		// Image processing: convert to target format if configured
		convertFormat := model.GetOption("image_convert_format")
		quality := 82
		if v := model.GetOption("image_quality"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 100 {
				quality = n
			}
		}

		finalExt := ext
		finalData := data
		finalMime := ct

		processable := map[string]bool{"jpg": true, "jpeg": true, "png": true}
		if processable[ext] {
			img, _, decErr := image.Decode(bytes.NewReader(data))
			if decErr == nil {
				if convertFormat == "webp" || convertFormat == "jpg" || convertFormat == "png" {
					finalExt = convertFormat
				}

				maxWidth := 0
				if v := model.GetOption("image_max_width"); v != "" {
					if n, err := strconv.Atoi(v); err == nil && n > 0 {
						maxWidth = n
					}
				}
				if maxWidth > 0 && img.Bounds().Dx() > maxWidth {
					img = imaging.Resize(img, maxWidth, 0, imaging.Lanczos)
				}

				var buf bytes.Buffer
				switch finalExt {
				case "webp":
					webp.Encode(&buf, img, &webp.Options{Quality: float32(quality)})
					finalMime = "image/webp"
				case "png":
					png.Encode(&buf, img)
					finalMime = "image/png"
				default:
					finalExt = "jpg"
					jpeg.Encode(&buf, img, &jpeg.Options{Quality: quality})
					finalMime = "image/jpeg"
				}
				finalData = buf.Bytes()
			}
		}

		// Upload via storage layer
		path := storage.GeneratePath(finalExt)
		url, err := storage.Default.Upload(path, bytes.NewReader(finalData), finalMime)
		if err != nil {
			log.Printf("[media-sync] upload failed: %v", err)
			return
		}

		// Create media record
		t := config.T("media")
		name := fmt.Sprintf("%s-%d-cover.%s", contentType, contentID, finalExt)
		var mediaID int
		config.DB.QueryRow(fmt.Sprintf(
			"INSERT INTO %s (name, filename, url, mime_type, size, driver, category, source_type, source_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id", t),
			name, path, url, finalMime, len(finalData), config.C.StorageDriver, "resource", contentType, contentID, time.Now().Unix(),
		).Scan(&mediaID)

		// Update content cover_url to local/S3 URL
		ct2 := config.T(contentType)
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET cover_url = $1 WHERE id = $2", ct2), url, contentID)

		log.Printf("[media-sync] %s#%d synced to %s (media#%d)", contentType, contentID, url, mediaID)
	}()
}

func isLocalURL(url string) bool {
	if strings.HasPrefix(url, config.C.AppURL) {
		return true
	}
	if strings.HasPrefix(url, "/uploads/") {
		return true
	}
	if config.C.S3PublicURL != "" && strings.HasPrefix(url, config.C.S3PublicURL) {
		return true
	}
	return false
}

func extFromMime(mime string) string {
	m := map[string]string{
		"image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
		"image/gif": "gif", "image/avif": "avif",
	}
	return m[mime]
}

func extFromURL(url string) string {
	u := strings.Split(url, "?")[0]
	ext := strings.ToLower(filepath.Ext(u))
	if ext != "" {
		ext = ext[1:]
	}
	valid := map[string]bool{"jpg": true, "jpeg": true, "png": true, "webp": true, "gif": true, "avif": true}
	if valid[ext] {
		return ext
	}
	return ""
}
