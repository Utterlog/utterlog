package handler

import (
	"fmt"
	"strconv"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// Generic content CRUD for moments, music, movies, books, goods, links, playlists

func ContentCreate(table string) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req map[string]interface{}
		if err := c.ShouldBindJSON(&req); err != nil {
			util.BadRequest(c, "无效的请求数据"); return
		}

		req["author_id"] = middleware.GetUserID(c)
		now := time.Now().Unix()
		req["created_at"] = now
		req["updated_at"] = now

		// Build INSERT
		cols := []string{}
		placeholders := []string{}
		vals := []interface{}{}
		idx := 1
		for k, v := range req {
			cols = append(cols, k)
			placeholders = append(placeholders, fmt.Sprintf("$%d", idx))
			vals = append(vals, v)
			idx++
		}

		t := config.T(table)
		var id int
		err := config.DB.QueryRow(fmt.Sprintf(
			"INSERT INTO %s (%s) VALUES (%s) RETURNING id",
			t, join(cols, ","), join(placeholders, ","),
		), vals...).Scan(&id)

		if err != nil {
			util.Error(c, 500, "CREATE_ERROR", err.Error()); return
		}
		util.Success(c, gin.H{"id": id})
	}
}

func ContentUpdate(table string) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		var req map[string]interface{}
		if err := c.ShouldBindJSON(&req); err != nil {
			util.BadRequest(c, "无效的请求数据"); return
		}

		req["updated_at"] = time.Now().Unix()
		// Remove fields that shouldn't be updated
		delete(req, "id")
		delete(req, "created_at")
		delete(req, "author_id")

		sets := []string{}
		vals := []interface{}{}
		idx := 1
		for k, v := range req {
			sets = append(sets, fmt.Sprintf("%s = $%d", k, idx))
			vals = append(vals, v)
			idx++
		}
		vals = append(vals, id)

		t := config.T(table)
		_, err := config.DB.Exec(fmt.Sprintf(
			"UPDATE %s SET %s WHERE id = $%d",
			t, join(sets, ", "), idx,
		), vals...)

		if err != nil {
			util.Error(c, 500, "UPDATE_ERROR", err.Error()); return
		}
		util.Success(c, gin.H{"id": id})
	}
}

// Comments full CRUD
func CreateComment(c *gin.Context) {
	var req struct {
		PostID   int    `json:"post_id" binding:"required"`
		ParentID *int   `json:"parent_id"`
		Author   string `json:"author" binding:"required"`
		Email    string `json:"email" binding:"required"`
		URL      string `json:"url"`
		Content  string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "必填字段不能为空"); return
	}

	t := config.T("comments")
	now := time.Now().Unix()
	ip := c.ClientIP()
	ua := c.Request.UserAgent()

	var id int
	config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (post_id, parent_id, author, email, url, content, status, ip, user_agent, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id", t),
		req.PostID, req.ParentID, req.Author, req.Email, req.URL, req.Content, "pending", ip, ua, now,
	).Scan(&id)

	// Update post comment count
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET comment_count = comment_count + 1 WHERE id = $1", config.T("posts")), req.PostID)

	util.Success(c, gin.H{"id": id})
}

func UpdateComment(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Content string `json:"content"`
		Status  string `json:"status"`
	}
	c.ShouldBindJSON(&req)
	t := config.T("comments")

	if req.Content != "" {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET content = $1 WHERE id = $2", t), req.Content, id)
	}
	if req.Status != "" {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET status = $1 WHERE id = $2", t), req.Status, id)
	}
	util.Success(c, gin.H{"id": id})
}

func ApproveComment(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET status = 'approved' WHERE id = $1", config.T("comments")), id)
	util.Success(c, gin.H{"id": id})
}

// Links full CRUD
func CreateLink(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		URL         string `json:"url" binding:"required"`
		Description string `json:"description"`
		Logo        string `json:"logo"`
		SortOrder   int    `json:"sort_order"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "名称和链接不能为空"); return
	}
	now := time.Now().Unix()
	t := config.T("links")
	var id int
	config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (name, url, description, logo, sort_order, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", t),
		req.Name, req.URL, req.Description, req.Logo, req.SortOrder, "publish", now, now,
	).Scan(&id)
	util.Success(c, gin.H{"id": id})
}

func UpdateLink(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Name        string `json:"name"`
		URL         string `json:"url"`
		Description string `json:"description"`
		Logo        string `json:"logo"`
		SortOrder   int    `json:"sort_order"`
		Status      string `json:"status"`
	}
	c.ShouldBindJSON(&req)
	now := time.Now().Unix()
	t := config.T("links")
	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET name=$1, url=$2, description=$3, logo=$4, sort_order=$5, status=$6, updated_at=$7 WHERE id=$8", t),
		req.Name, req.URL, req.Description, req.Logo, req.SortOrder, req.Status, now, id,
	)
	util.Success(c, gin.H{"id": id})
}

// Notifications
func MarkNotificationRead(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET is_read = true WHERE id = $1", config.T("notifications")), id)
	util.Success(c, nil)
}

func MarkAllNotificationsRead(c *gin.Context) {
	userID := middleware.GetUserID(c)
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET is_read = true WHERE user_id = $1", config.T("notifications")), userID)
	util.Success(c, nil)
}

func UnreadNotificationCount(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var count int
	config.DB.Get(&count, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE user_id = $1 AND is_read = false", config.T("notifications")), userID)
	util.Success(c, gin.H{"count": count})
}

func DeleteNotification(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	config.DB.Exec("DELETE FROM "+config.T("notifications")+" WHERE id = $1", id)
	util.Success(c, nil)
}

// Password change
func ChangePassword(c *gin.Context) {
	var req struct {
		CurrentPassword string `json:"current_password" binding:"required"`
		NewPassword     string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "当前密码和新密码不能为空"); return
	}

	userID := middleware.GetUserID(c)
	var hash string
	config.DB.Get(&hash, "SELECT password FROM "+config.T("users")+" WHERE id = $1", userID)

	if !util.CheckPassword(req.CurrentPassword, hash) {
		util.Error(c, 400, "WRONG_PASSWORD", "当前密码错误"); return
	}

	newHash, _ := util.HashPassword(req.NewPassword)
	config.DB.Exec("UPDATE "+config.T("users")+" SET password = $1, updated_at = $2 WHERE id = $3",
		newHash, time.Now().Unix(), userID)
	util.Success(c, nil)
}

// Update profile
func UpdateProfile(c *gin.Context) {
	var req struct {
		Nickname string `json:"nickname"`
		Bio      string `json:"bio"`
		URL      string `json:"url"`
	}
	c.ShouldBindJSON(&req)
	userID := middleware.GetUserID(c)
	now := time.Now().Unix()
	config.DB.Exec("UPDATE "+config.T("users")+" SET nickname=$1, bio=$2, url=$3, updated_at=$4 WHERE id=$5",
		req.Nickname, req.Bio, req.URL, now, userID)
	util.Success(c, nil)
}

// Playlist songs management
func PlaylistSongs(c *gin.Context) {
	id := c.Param("id")
	t := config.T("playlist_songs")
	mt := config.T("music")
	var songs []map[string]interface{}
	rows, _ := config.DB.Queryx(fmt.Sprintf(
		"SELECT m.* FROM %s m JOIN %s ps ON m.id = ps.music_id WHERE ps.playlist_id = $1 ORDER BY ps.sort_order ASC", mt, t), id)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			songs = append(songs, row)
		}
	}
	if songs == nil { songs = []map[string]interface{}{} }

	// Get playlist info
	var playlist map[string]interface{}
	prow := config.DB.QueryRowx("SELECT * FROM "+config.T("playlists")+" WHERE id = $1", id)
	playlist = make(map[string]interface{})
	prow.MapScan(playlist)
	playlist["songs"] = songs
	util.Success(c, playlist)
}

func AddSongToPlaylist(c *gin.Context) {
	playlistID, _ := strconv.Atoi(c.Param("id"))
	var req struct { MusicID int `json:"music_id" binding:"required"` }
	if err := c.ShouldBindJSON(&req); err != nil { util.BadRequest(c, "music_id 不能为空"); return }
	t := config.T("playlist_songs")
	now := time.Now().Unix()
	config.DB.Exec(fmt.Sprintf("INSERT INTO %s (playlist_id, music_id, created_at) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING", t), playlistID, req.MusicID, now)
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET song_count = (SELECT COUNT(*) FROM %s WHERE playlist_id = $1) WHERE id = $1", config.T("playlists"), t), playlistID)
	util.Success(c, nil)
}

func RemoveSongFromPlaylist(c *gin.Context) {
	playlistID, _ := strconv.Atoi(c.Param("id"))
	var req struct { MusicID int `json:"music_id" binding:"required"` }
	c.ShouldBindJSON(&req)
	t := config.T("playlist_songs")
	config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE playlist_id = $1 AND music_id = $2", t), playlistID, req.MusicID)
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET song_count = (SELECT COUNT(*) FROM %s WHERE playlist_id = $1) WHERE id = $1", config.T("playlists"), t), playlistID)
	util.Success(c, nil)
}

// Social / Federation (basic)
func FederationMetadata(c *gin.Context) {
	siteTitle := model.GetOption("site_title")
	if siteTitle == "" { siteTitle = "Utterlog!" }
	siteDesc := model.GetOption("site_description")
	siteLogo := model.GetOption("site_logo")
	siteLogoDark := model.GetOption("site_logo_dark")
	siteFavicon := model.GetOption("site_favicon")

	// Get admin user info
	admin, _ := model.UserByID(1)
	var adminInfo gin.H
	if admin != nil {
		adminInfo = gin.H{
			"username": admin.Username, "nickname": admin.NicknameStr(),
			"email": admin.Email, "avatar": admin.Avatar,
		}
	}

	util.Success(c, gin.H{
		"name":        siteTitle,
		"description": siteDesc,
		"url":         config.C.AppURL,
		"logo":        siteLogo,
		"logo_dark":   siteLogoDark,
		"favicon":     siteFavicon,
		"admin":       adminInfo,
		"protocol":    "utterlog-federation/1.0",
	})
}

// Import placeholder
func ImportWordPress(c *gin.Context) {
	util.Error(c, 501, "NOT_IMPLEMENTED", "WordPress 导入功能开发中")
}

func ImportTypecho(c *gin.Context) {
	util.Error(c, 501, "NOT_IMPLEMENTED", "Typecho 导入功能开发中")
}

// RSS parse proxy
func ParseRSS(c *gin.Context) {
	url := c.Query("url")
	if url == "" { util.BadRequest(c, "url 参数不能为空"); return }
	// TODO: fetch and parse RSS
	util.Success(c, gin.H{"url": url, "items": []interface{}{}})
}

func join(s []string, sep string) string {
	result := ""
	for i, v := range s {
		if i > 0 { result += sep }
		result += v
	}
	return result
}
