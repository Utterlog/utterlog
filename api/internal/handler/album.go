package handler

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// ListAlbums — GET /api/v1/albums (public: only published; authed: all)
func ListAlbums(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	status := c.Query("status")
	t := config.T("albums")

	where := ""
	args := []interface{}{}
	idx := 1

	if status != "" {
		where = fmt.Sprintf("WHERE status = $%d", idx)
		args = append(args, status)
		idx++
	}

	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s %s", t, where), args...)

	args = append(args, perPage, (page-1)*perPage)
	var albums []model.Album
	config.DB.Select(&albums, fmt.Sprintf(
		"SELECT * FROM %s %s ORDER BY sort_order ASC, created_at DESC LIMIT $%d OFFSET $%d",
		t, where, idx, idx+1), args...)
	if albums == nil {
		albums = []model.Album{}
	}

	util.Paginate(c, albums, total, page, perPage)
}

// GetAlbum — GET /api/v1/albums/:id
func GetAlbum(c *gin.Context) {
	id := c.Param("id")
	t := config.T("albums")

	var album model.Album
	// Try by slug first, then by ID
	err := config.DB.Get(&album, fmt.Sprintf("SELECT * FROM %s WHERE slug = $1", t), id)
	if err != nil {
		err = config.DB.Get(&album, fmt.Sprintf("SELECT * FROM %s WHERE id = $1", t), id)
	}
	if err != nil {
		util.NotFound(c, "相册")
		return
	}
	util.Success(c, album)
}

// CreateAlbum — POST /api/v1/albums
func CreateAlbum(c *gin.Context) {
	var req struct {
		Title       string `json:"title" binding:"required"`
		Slug        string `json:"slug"`
		Description string `json:"description"`
		CoverURL    string `json:"cover_url"`
		Status      string `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "标题不能为空")
		return
	}

	if req.Status == "" {
		req.Status = "private"
	}
	if req.Slug == "" {
		req.Slug = generateSlug(req.Title)
	}

	now := time.Now().Unix()
	t := config.T("albums")
	var id int
	err := config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (title, slug, description, cover_url, status, author_id, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
		t), req.Title, req.Slug, req.Description, req.CoverURL, req.Status, 1, now, now,
	).Scan(&id)
	if err != nil {
		util.Error(c, 500, "CREATE_ERROR", "创建相册失败: "+err.Error())
		return
	}

	util.Success(c, gin.H{"id": id})
}

// UpdateAlbum — PUT /api/v1/albums/:id
func UpdateAlbum(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id == 0 {
		util.BadRequest(c, "无效 ID")
		return
	}

	var req struct {
		Title       *string `json:"title"`
		Slug        *string `json:"slug"`
		Description *string `json:"description"`
		CoverURL    *string `json:"cover_url"`
		Status      *string `json:"status"`
		SortOrder   *int    `json:"sort_order"`
	}
	c.ShouldBindJSON(&req)

	t := config.T("albums")
	now := time.Now().Unix()

	sets := []string{"updated_at = $1"}
	args := []interface{}{now}
	idx := 2

	if req.Title != nil {
		sets = append(sets, fmt.Sprintf("title = $%d", idx))
		args = append(args, *req.Title)
		idx++
	}
	if req.Slug != nil {
		sets = append(sets, fmt.Sprintf("slug = $%d", idx))
		args = append(args, *req.Slug)
		idx++
	}
	if req.Description != nil {
		sets = append(sets, fmt.Sprintf("description = $%d", idx))
		args = append(args, *req.Description)
		idx++
	}
	if req.CoverURL != nil {
		sets = append(sets, fmt.Sprintf("cover_url = $%d", idx))
		args = append(args, *req.CoverURL)
		idx++
	}
	if req.Status != nil {
		sets = append(sets, fmt.Sprintf("status = $%d", idx))
		args = append(args, *req.Status)
		idx++
	}
	if req.SortOrder != nil {
		sets = append(sets, fmt.Sprintf("sort_order = $%d", idx))
		args = append(args, *req.SortOrder)
		idx++
	}

	args = append(args, id)
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET %s WHERE id = $%d", t, strings.Join(sets, ", "), idx), args...)

	util.Success(c, gin.H{"updated": true})
}

// DeleteAlbum — DELETE /api/v1/albums/:id
func DeleteAlbum(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id == 0 {
		util.BadRequest(c, "无效 ID")
		return
	}

	t := config.T("albums")
	config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE id = $1", t), id)
	// Unlink media from this album
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET album_id = 0 WHERE album_id = $1", config.T("media")), id)

	util.Success(c, gin.H{"deleted": true})
}

// AlbumPhotos — GET /api/v1/albums/:id/photos
func AlbumPhotos(c *gin.Context) {
	albumID, _ := strconv.Atoi(c.Param("id"))
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "50"))
	t := config.T("media")

	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE album_id = $1 AND category = 'image'", t), albumID)

	offset := (page - 1) * perPage
	var photos []map[string]interface{}
	rows, _ := config.DB.Queryx(fmt.Sprintf(
		"SELECT id, name, filename, url, mime_type, size, created_at FROM %s WHERE album_id = $1 AND category = 'image' ORDER BY created_at DESC LIMIT $2 OFFSET $3",
		t), albumID, perPage, offset)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			photos = append(photos, row)
		}
	}
	if photos == nil {
		photos = []map[string]interface{}{}
	}

	util.Paginate(c, photos, total, page, perPage)
}

// AddPhotosToAlbum — POST /api/v1/albums/:id/photos
func AddPhotosToAlbum(c *gin.Context) {
	albumID, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		MediaIDs []int `json:"media_ids" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "media_ids 不能为空")
		return
	}

	t := config.T("media")
	for _, mid := range req.MediaIDs {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET album_id = $1 WHERE id = $2", t), albumID, mid)
	}

	// Update photo count
	var count int
	config.DB.Get(&count, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE album_id = $1 AND category = 'image'", t), albumID)
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET photo_count = $1, updated_at = $2 WHERE id = $3", config.T("albums")), count, time.Now().Unix(), albumID)

	util.Success(c, gin.H{"added": len(req.MediaIDs), "photo_count": count})
}

// RemovePhotoFromAlbum — DELETE /api/v1/albums/:id/photos/:mediaId
func RemovePhotoFromAlbum(c *gin.Context) {
	albumID, _ := strconv.Atoi(c.Param("id"))
	mediaID, _ := strconv.Atoi(c.Param("mediaId"))

	config.DB.Exec(fmt.Sprintf("UPDATE %s SET album_id = 0 WHERE id = $1 AND album_id = $2", config.T("media")), mediaID, albumID)

	var count int
	config.DB.Get(&count, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE album_id = $1 AND category = 'image'", config.T("media")), albumID)
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET photo_count = $1, updated_at = $2 WHERE id = $3", config.T("albums")), count, time.Now().Unix(), albumID)

	util.Success(c, gin.H{"removed": true, "photo_count": count})
}

// PublicAlbums — GET /api/v1/public/albums (only published albums)
func PublicAlbums(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	t := config.T("albums")

	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE status = 'public'", t))

	offset := (page - 1) * perPage
	var albums []model.Album
	config.DB.Select(&albums, fmt.Sprintf(
		"SELECT * FROM %s WHERE status = 'public' ORDER BY sort_order ASC, created_at DESC LIMIT $1 OFFSET $2", t),
		perPage, offset)
	if albums == nil {
		albums = []model.Album{}
	}

	util.Paginate(c, albums, total, page, perPage)
}

// PublicAlbumDetail — GET /api/v1/public/albums/:id (album + photos)
func PublicAlbumDetail(c *gin.Context) {
	id := c.Param("id")
	t := config.T("albums")
	mt := config.T("media")

	var album model.Album
	err := config.DB.Get(&album, fmt.Sprintf("SELECT * FROM %s WHERE slug = $1 AND status = 'public'", t), id)
	if err != nil {
		err = config.DB.Get(&album, fmt.Sprintf("SELECT * FROM %s WHERE id = $1 AND status = 'public'", t), id)
	}
	if err != nil {
		util.NotFound(c, "相册")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "50"))
	offset := (page - 1) * perPage

	var photos []map[string]interface{}
	rows, _ := config.DB.Queryx(fmt.Sprintf(
		"SELECT id, name, url, mime_type, size, created_at FROM %s WHERE album_id = $1 AND category = 'image' ORDER BY created_at DESC LIMIT $2 OFFSET $3",
		mt), album.ID, perPage, offset)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			photos = append(photos, row)
		}
	}
	if photos == nil {
		photos = []map[string]interface{}{}
	}

	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE album_id = $1 AND category = 'image'", mt), album.ID)

	util.Success(c, gin.H{
		"album":  album,
		"photos": photos,
		"total":  total,
		"page":   page,
	})
}

func generateSlug(title string) string {
	slug := strings.ToLower(strings.TrimSpace(title))
	slug = strings.ReplaceAll(slug, " ", "-")
	// Keep only alphanumeric, dash, underscore, and CJK characters
	var result []rune
	for _, r := range slug {
		if (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '-' || r == '_' || r > 0x4E00 {
			result = append(result, r)
		}
	}
	if len(result) == 0 {
		return fmt.Sprintf("album-%d", time.Now().Unix())
	}
	return string(result)
}
