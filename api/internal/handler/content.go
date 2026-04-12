package handler

import (
	"crypto/md5"
	"fmt"
	"strconv"
	"strings"
	"sync"
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
		"INSERT INTO %s (post_id, parent_id, author_name, author_email, author_url, content, status, author_ip, author_agent, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id", t),
		req.PostID, req.ParentID, req.Author, req.Email, req.URL, req.Content, "pending", ip, ua, now,
	).Scan(&id)

	// Update post comment count
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET comment_count = comment_count + 1 WHERE id = $1", config.T("posts")), req.PostID)

	util.Success(c, gin.H{"id": id})
}

func UpdateComment(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Content     *string `json:"content"`
		Status      *string `json:"status"`
		AuthorName  *string `json:"author"`
		AuthorEmail *string `json:"email"`
		AuthorURL   *string `json:"url"`
		Featured    *bool   `json:"featured"`
	}
	c.ShouldBindJSON(&req)
	t := config.T("comments")
	now := time.Now().Unix()

	if req.Content != nil {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET content = $1, updated_at = $2 WHERE id = $3", t), *req.Content, now, id)
	}
	if req.Status != nil {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET status = $1 WHERE id = $2", t), *req.Status, id)
	}
	if req.AuthorName != nil {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET author_name = $1 WHERE id = $2", t), *req.AuthorName, id)
	}
	if req.AuthorEmail != nil {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET author_email = $1 WHERE id = $2", t), *req.AuthorEmail, id)
	}
	if req.AuthorURL != nil {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET author_url = $1 WHERE id = $2", t), *req.AuthorURL, id)
	}
	if req.Featured != nil {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET featured = $1 WHERE id = $2", t), *req.Featured, id)
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

// Get profile
func GetProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	u, err := model.UserByID(userID)
	if err != nil { util.Error(c, 404, "NOT_FOUND", "用户不存在"); return }
	url := ""; if u.URL != nil { url = *u.URL }
	bio := ""; if u.Bio != nil { bio = *u.Bio }
	avatar := ""; if u.Avatar != nil { avatar = *u.Avatar }
	emailHash := fmt.Sprintf("%x", md5.Sum([]byte(strings.TrimSpace(strings.ToLower(u.Email)))))
	gravatarURL := fmt.Sprintf("https://gravatar.bluecdn.com/avatar/%s?s=128&d=mp", emailHash)
	util.Success(c, gin.H{
		"id": u.ID, "username": u.Username, "email": u.Email,
		"nickname": u.NicknameStr(), "avatar": avatar, "gravatar_url": gravatarURL, "url": url, "bio": bio,
	})
}

// Verify code storage (in-memory, keyed by userID)
var (
	verifyCodes   = map[int]verifyEntry{}
	verifyCodesMu sync.Mutex
)

type verifyEntry struct {
	Code      string
	ExpiresAt time.Time
}

// Send verification code to current user's email
func SendVerifyCode(c *gin.Context) {
	// Check if email service is configured
	smtpHost := model.GetOption("smtp_host")
	if smtpHost == "" {
		util.Error(c, 400, "EMAIL_NOT_CONFIGURED", "请先在系统设置 > 邮件设置中配置 SMTP 服务")
		return
	}

	userID := middleware.GetUserID(c)
	u, err := model.UserByID(userID)
	if err != nil {
		util.Error(c, 404, "NOT_FOUND", "用户不存在")
		return
	}

	// Generate 6-digit code
	code := fmt.Sprintf("%06d", time.Now().UnixNano()%1000000)

	verifyCodesMu.Lock()
	verifyCodes[userID] = verifyEntry{Code: code, ExpiresAt: time.Now().Add(5 * time.Minute)}
	verifyCodesMu.Unlock()

	// Send email
	cfg := util.EmailConfig{
		Host:       smtpHost,
		Port:       model.GetOption("smtp_port"),
		User:       model.GetOption("smtp_user"),
		Pass:       model.GetOption("smtp_pass"),
		Encryption: model.GetOption("smtp_encryption"),
		From:       model.GetOption("email_from"),
		FromName:   model.GetOption("email_from_name"),
	}

	siteName := model.GetOption("site_title")
	if siteName == "" {
		siteName = "Utterlog"
	}

	body := fmt.Sprintf(`<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;">
		<h2>验证码</h2>
		<p>您正在修改账户信息，验证码为：</p>
		<div style="font-size:32px;font-weight:bold;letter-spacing:8px;padding:16px;background:#f5f5f5;text-align:center;border-radius:8px;margin:16px 0;">%s</div>
		<p style="color:#666;font-size:13px;">验证码 5 分钟内有效，请勿泄露给他人。</p>
		<p style="color:#999;font-size:12px;">— %s</p>
	</div>`, code, siteName)

	if err := util.SendEmail(cfg, u.Email, siteName+" — 验证码", body); err != nil {
		util.Error(c, 500, "EMAIL_SEND_FAILED", fmt.Sprintf("邮件发送失败: %v", err))
		return
	}

	util.Success(c, gin.H{"message": "验证码已发送到 " + maskEmail(u.Email)})
}

func maskEmail(email string) string {
	parts := strings.SplitN(email, "@", 2)
	if len(parts) != 2 {
		return email
	}
	name := parts[0]
	if len(name) <= 2 {
		return name[:1] + "***@" + parts[1]
	}
	return name[:2] + "***@" + parts[1]
}

func checkVerifyCode(userID int, code string) bool {
	verifyCodesMu.Lock()
	defer verifyCodesMu.Unlock()
	entry, ok := verifyCodes[userID]
	if !ok {
		return false
	}
	if time.Now().After(entry.ExpiresAt) {
		delete(verifyCodes, userID)
		return false
	}
	if entry.Code != code {
		return false
	}
	delete(verifyCodes, userID)
	return true
}

// Update profile
func UpdateProfile(c *gin.Context) {
	var req struct {
		Nickname   string  `json:"nickname"`
		Email      string  `json:"email"`
		Username   string  `json:"username"`
		Bio        string  `json:"bio"`
		URL        string  `json:"url"`
		Avatar     *string `json:"avatar"`
		Password   string  `json:"password"`
		VerifyCode string  `json:"verify_code"`
	}
	c.ShouldBindJSON(&req)
	userID := middleware.GetUserID(c)
	now := time.Now().Unix()

	// Get current user
	u, err := model.UserByID(userID)
	if err != nil {
		util.Error(c, 404, "NOT_FOUND", "用户不存在")
		return
	}

	// Check if sensitive fields changed
	emailChanged := req.Email != "" && req.Email != u.Email
	usernameChanged := req.Username != "" && req.Username != u.Username

	if emailChanged || usernameChanged {
		// Require password verification
		if req.Password == "" {
			util.Error(c, 400, "PASSWORD_REQUIRED", "修改邮箱或登录账号需要验证密码")
			return
		}
		if !util.CheckPassword(req.Password, u.Password) {
			util.Error(c, 400, "WRONG_PASSWORD", "密码验证失败")
			return
		}
		// Require email verification code
		if req.VerifyCode == "" {
			util.Error(c, 400, "CODE_REQUIRED", "修改邮箱或登录账号需要邮箱验证码")
			return
		}
		if !checkVerifyCode(userID, req.VerifyCode) {
			util.Error(c, 400, "INVALID_CODE", "验证码错误或已过期")
			return
		}
	}

	// Build update
	if emailChanged {
		config.DB.Exec("UPDATE "+config.T("users")+" SET email=$1 WHERE id=$2", req.Email, userID)
	}
	if usernameChanged {
		config.DB.Exec("UPDATE "+config.T("users")+" SET username=$1 WHERE id=$2", req.Username, userID)
	}
	if req.Nickname != "" {
		config.DB.Exec("UPDATE "+config.T("users")+" SET nickname=$1 WHERE id=$2", req.Nickname, userID)
	}
	config.DB.Exec("UPDATE "+config.T("users")+" SET bio=$1, url=$2, updated_at=$3 WHERE id=$4",
		req.Bio, req.URL, now, userID)
	if req.Avatar != nil {
		config.DB.Exec("UPDATE "+config.T("users")+" SET avatar=$1 WHERE id=$2", *req.Avatar, userID)
	}

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
