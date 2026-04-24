package handler

import (
	"bytes"
	"crypto/md5"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/png"
	"log"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/email"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
	"golang.org/x/image/font"
	"golang.org/x/image/font/basicfont"
	"golang.org/x/image/font/gofont/gobold"
	"golang.org/x/image/font/opentype"
	"golang.org/x/image/math/fixed"
)

// captchaFace is a 26pt bold Go font face used for the image CAPTCHA.
// basicfont.Face7x13 was the original — at 7x13 px it's barely legible
// on a 120x40 noisy background, hence the user feedback that letters
// looked too small. Built once at startup to avoid re-parsing per
// request; no failure mode other than a broken embedded font binary.
var captchaFace font.Face

func init() {
	parsed, err := opentype.Parse(gobold.TTF)
	if err != nil {
		captchaFace = basicfont.Face7x13
		return
	}
	face, err := opentype.NewFace(parsed, &opentype.FaceOptions{
		Size:    26,
		DPI:     72,
		Hinting: font.HintingFull,
	})
	if err != nil {
		captchaFace = basicfont.Face7x13
		return
	}
	captchaFace = face
}

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

		// Async: sync external cover image to media library
		if coverURL, ok := req["cover_url"].(string); ok && coverURL != "" {
			SyncContentMedia(table, id, coverURL)
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

		// Async: sync external cover image if changed
		if coverURL, ok := req["cover_url"].(string); ok && coverURL != "" {
			idInt, _ := strconv.Atoi(id)
			SyncContentMedia(table, idInt, coverURL)
		}

		util.Success(c, gin.H{"id": id})
	}
}

// Comments full CRUD
func CreateComment(c *gin.Context) {
	var req struct {
		PostID           int    `json:"post_id" binding:"required"`
		ParentID         *int   `json:"parent_id"`
		Author           string `json:"author" binding:"required"`
		Email            string `json:"email" binding:"required"`
		URL              string `json:"url"`
		Content          string `json:"content" binding:"required"`
		VisitorID        string `json:"visitor_id"`
		ClientHints      string `json:"client_hints"`
		CaptchaChallenge string `json:"captcha_challenge"`
		CaptchaNonce     string `json:"captcha_nonce"`
		CaptchaID        string `json:"captcha_id"`
		CaptchaCode      string `json:"captcha_code"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "必填字段不能为空"); return
	}
	if len([]rune(strings.TrimSpace(req.Content))) < 5 {
		util.BadRequest(c, "评论内容至少 5 个字"); return
	}

	t := config.T("comments")
	now := time.Now().Unix()
	ip := c.ClientIP()
	ua := c.Request.UserAgent()

	// Determine status: admin auto-approved, passport auto-approved, spam check, otherwise pending
	status := "pending"

	// Check if authenticated admin
	userID := middleware.GetUserID(c)
	if userID > 0 {
		var role string
		config.DB.Get(&role, "SELECT role FROM "+config.T("users")+" WHERE id = $1", userID)
		if role == "admin" {
			status = "approved"
		}
	}

	// Check Utterlog Network Passport (auto-approve verified network users)
	passportToken := c.GetHeader("X-Utterlog-Passport")
	if status == "pending" && passportToken != "" {
		if identity, err := verifyPassportToken(passportToken); err == nil && identity.UtterlogID != "" {
			status = "approved"
		}
	}

	// Captcha verification (if enabled and not admin/passport)
	if status == "pending" {
		mode := getCaptchaMode()
		switch mode {
		case "pow":
			if !verifyCaptcha(req.CaptchaChallenge, req.CaptchaNonce) {
				util.Error(c, 400, "CAPTCHA_FAILED", "人机验证失败，请重试"); return
			}
		case "image":
			if !verifyImageCaptcha(req.CaptchaID, req.CaptchaCode) {
				util.Error(c, 400, "CAPTCHA_FAILED", "验证码错误，请重试"); return
			}
		}
	}

	// Basic spam detection (if not admin and not passport-approved)
	if status == "pending" && isSpamComment(req.Content, req.Email, req.URL, ip) {
		status = "spam"
	}

	// Auto-approve if commenter has prior approved comment (email or visitor_id match).
	// Gated by `comment_trust_returning` option — default ON (option absent means ""),
	// admins can disable via Settings → 评论设置. Toggle stores "true"/"false" via
	// UpdateOptions' fmt.Sprintf("%v", bool), so we treat anything except "false" as on.
	if status == "pending" && model.GetOption("comment_trust_returning") != "false" {
		var prevApproved int
		config.DB.Get(&prevApproved, fmt.Sprintf(
			"SELECT COUNT(*) FROM %s WHERE status = 'approved' AND (author_email = $1 OR (visitor_id = $2 AND visitor_id != '')) LIMIT 1", t),
			req.Email, req.VisitorID)
		if prevApproved > 0 {
			status = "approved"
		}
	}

	var id int
	config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (post_id, parent_id, author_name, author_email, author_url, content, status, author_ip, author_agent, user_id, visitor_id, client_hints, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id", t),
		req.PostID, req.ParentID, req.Author, req.Email, req.URL, req.Content, status, ip, ua, userID, req.VisitorID, req.ClientHints, now,
	).Scan(&id)

	// Update post comment count (only for approved)
	if status == "approved" {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET comment_count = comment_count + 1 WHERE id = $1", config.T("posts")), req.PostID)
	}

	// Create notification for admin (if not admin's own comment)
	if userID <= 0 || status == "pending" {
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (user_id, type, title, content, is_read, created_at) VALUES (1, 'comment', $1, $2, false, $3)",
			config.T("notifications")),
			fmt.Sprintf("%s 发表了新评论", req.Author),
			fmt.Sprintf("状态: %s | %s", status, req.Content[:min(len(req.Content), 100)]),
			now)
	}

	// Async: Telegram moderation notification (pending only) + GeoIP + email
	if status == "pending" {
		go func(commentID int, postID int, author, email, authorURL, content, commentIP string) {
			var postTitle string
			config.DB.Get(&postTitle, "SELECT title FROM "+config.T("posts")+" WHERE id = $1", postID)
			SendCommentModerationTG(commentID, author, email, authorURL, content, commentIP, postTitle)
		}(id, req.PostID, req.Author, req.Email, req.URL, req.Content, ip)
	}

	// Async: lookup geoip and store in comment
	go func(commentID int, commentIP string) {
		model.LookupAndStoreGeo(commentID, commentIP)
	}(id, ip)

	// Send email notifications
	go sendCommentNotifications(req.PostID, req.ParentID, req.Author, req.Content, id)

	util.Success(c, gin.H{"id": id, "status": status})
}

// isSpamComment checks for common spam patterns
func isSpamComment(content, email, url, ip string) bool {
	lower := strings.ToLower(content)

	// 1. Excessive links (>2 URLs in content)
	linkCount := strings.Count(lower, "http://") + strings.Count(lower, "https://")
	if linkCount > 2 { return true }

	// 2. Spam keywords
	spamWords := []string{
		"casino", "poker", "viagra", "cialis", "lottery", "free money",
		"buy now", "click here", "subscribe", "earn money", "make money",
		"adult", "xxx", "porn", "sex", "药", "赌博", "彩票", "代开发票",
		"刷单", "兼职日赚", "加微信", "加QQ", "代孕",
	}
	for _, w := range spamWords {
		if strings.Contains(lower, w) { return true }
	}

	// 3. Suspicious email patterns
	emailLower := strings.ToLower(email)
	spamEmailDomains := []string{"tempmail.", "guerrillamail.", "throwaway.", "yopmail.", "sharklasers."}
	for _, d := range spamEmailDomains {
		if strings.Contains(emailLower, d) { return true }
	}

	// 4. Too many repeated characters (e.g., "aaaaaaa")
	for i := 0; i < len(content)-10; i++ {
		if len(content) > i+10 {
			allSame := true
			for j := i + 1; j < i+10; j++ {
				if content[j] != content[i] { allSame = false; break }
			}
			if allSame { return true }
		}
	}

	// 5. IP-based rate limiting: >5 comments in 10 minutes from same IP
	var recentCount int
	config.DB.Get(&recentCount, fmt.Sprintf(
		"SELECT COUNT(*) FROM %s WHERE author_ip = $1 AND created_at > $2",
		config.T("comments")), ip, time.Now().Unix()-600)
	if recentCount >= 5 { return true }

	return false
}

// ReplyComment creates an admin reply to a comment
func ReplyComment(c *gin.Context) {
	commentID, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Content string `json:"content" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "回复内容不能为空"); return
	}

	// Get original comment's post_id
	var postID int
	config.DB.Get(&postID, "SELECT post_id FROM "+config.T("comments")+" WHERE id = $1", commentID)
	if postID == 0 { util.NotFound(c, "评论"); return }

	// Get admin user info
	userID := middleware.GetUserID(c)
	user, _ := model.UserByID(userID)
	if user == nil { util.Error(c, 403, "FORBIDDEN", "未授权"); return }

	now := time.Now().Unix()
	var id int
	config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (post_id, parent_id, author_name, author_email, author_url, content, status, user_id, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
		config.T("comments")),
		postID, commentID, user.NicknameStr(), user.Email, config.C.AppURL, req.Content, "approved", userID, now,
	).Scan(&id)

	// Update post comment count
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET comment_count = comment_count + 1 WHERE id = $1", config.T("posts")), postID)

	util.Success(c, gin.H{"id": id})
}

// PendingCommentCount returns count of pending comments (for notification badge)
func PendingCommentCount(c *gin.Context) {
	var pending, spam int
	config.DB.Get(&pending, "SELECT COUNT(*) FROM "+config.T("comments")+" WHERE status = 'pending'")
	config.DB.Get(&spam, "SELECT COUNT(*) FROM "+config.T("comments")+" WHERE status = 'spam'")
	util.Success(c, gin.H{"pending": pending, "spam": spam})
}

// sendCommentNotifications sends email to site admin for new comments,
// and to the parent comment author for replies. Honors
// `comment_notify_admin` (default on) for the admin path. The reply
// path is user-to-user and fires regardless of that toggle.
//
// Supports all three providers (smtp / resend / sendflare) — earlier
// this function only populated SMTP fields, so sites configured with
// Resend or Sendflare saw no admin emails at all. The short-circuit
// also hinged on smtp_host being non-empty, which made the whole
// notification path dead weight in those deployments.
func sendCommentNotifications(postID int, parentID *int, commenterName, content string, commentID int) {
	provider := model.GetOption("email_provider")
	if provider == "" { provider = "smtp" }

	cfg := util.EmailConfig{
		Provider:        provider,
		Host:            model.GetOption("smtp_host"),
		Port:            model.GetOption("smtp_port"),
		User:            model.GetOption("smtp_user"),
		Pass:            model.GetOption("smtp_pass"),
		Encryption:      model.GetOption("smtp_encryption"),
		From:            model.GetOption("email_from"),
		FromName:        model.GetOption("email_from_name"),
		ResendAPIKey:    model.GetOption("resend_api_key"),
		SendflareAPIKey: model.GetOption("sendflare_api_key"),
	}

	// Gate early only when the active provider is unconfigured — e.g.
	// provider=smtp with no smtp_host. Otherwise keep going.
	switch provider {
	case "smtp":
		if cfg.Host == "" {
			log.Printf("[comment-notify] skipped — provider=smtp but smtp_host is empty")
			return
		}
	case "resend":
		if cfg.ResendAPIKey == "" {
			log.Printf("[comment-notify] skipped — provider=resend but resend_api_key is empty")
			return
		}
	case "sendflare":
		if cfg.SendflareAPIKey == "" {
			log.Printf("[comment-notify] skipped — provider=sendflare but sendflare_api_key is empty")
			return
		}
	}

	siteName := model.GetOption("site_title")
	if siteName == "" { siteName = "Utterlog" }
	siteURL := model.GetOption("site_url")
	if siteURL == "" { siteURL = config.C.AppURL }

	// Get post info
	post, err := model.PostByID(postID)
	if err != nil { return }
	postURL := fmt.Sprintf("%s/posts/%s", siteURL, post.Slug)

	// Truncate content for email
	preview := content
	if len([]rune(preview)) > 200 { preview = string([]rune(preview)[:200]) + "..." }

	// 1. Notify site admin — gated by comment_notify_admin (default on;
	// option absent means the user hasn't touched it → we assume yes).
	admin, _ := model.UserByID(1)
	site := email.LoadSiteData()
	notifyAdmin := model.GetOption("comment_notify_admin") != "false"
	if notifyAdmin && admin != nil && admin.Email != "" {
		body, err := email.Render("new_comment", email.NewCommentData{
			Site:             site,
			Author:           commenterName,
			Email:            "",
			Content:          preview,
			PostTitle:        post.Title,
			PostURL:          postURL,
			PostedAt:         "",
			ManageCommentURL: site.AdminURL + "/comments",
		})
		if err == nil {
			subject := fmt.Sprintf("💬 新评论 — 《%s》", post.Title)
			if err := util.SendEmail(cfg, admin.Email, subject, body); err != nil {
				log.Printf("[comment-notify] admin email failed (provider=%s to=%s): %v", provider, admin.Email, err)
			}
		} else {
			log.Printf("[comment-notify] render new_comment template failed: %v", err)
		}
	}

	// 2. Notify parent comment author (reply notification)
	if parentID != nil && *parentID > 0 {
		var parent struct {
			AuthorName  string  `db:"author_name"`
			AuthorEmail *string `db:"author_email"`
			Content     string  `db:"content"`
		}
		err := config.DB.Get(&parent, "SELECT author_name, author_email, content FROM "+config.T("comments")+" WHERE id = $1", *parentID)
		if err != nil || parent.AuthorEmail == nil || *parent.AuthorEmail == "" {
			return
		}
		if admin != nil && *parent.AuthorEmail == admin.Email {
			return
		}

		// Truncate parent preview too
		parentPreview := parent.Content
		if len([]rune(parentPreview)) > 160 {
			parentPreview = string([]rune(parentPreview)[:160]) + "..."
		}

		body, err := email.Render("comment_reply", email.CommentReplyData{
			Site:            site,
			RecipientName:   parent.AuthorName,
			ReplierName:     commenterName,
			PostTitle:       post.Title,
			OriginalContent: parentPreview,
			ReplyContent:    preview,
			PostURL:         fmt.Sprintf("%s#comment-%d", postURL, commentID),
			UnsubscribeURL:  "", // TODO: generate signed unsubscribe link
		})
		if err == nil {
			subject := fmt.Sprintf("💬 你的评论收到了回复 — %s", siteName)
			if err := util.SendEmail(cfg, *parent.AuthorEmail, subject, body); err != nil {
				log.Printf("[comment-notify] reply email failed (provider=%s to=%s): %v", provider, *parent.AuthorEmail, err)
			}
		} else {
			log.Printf("[comment-notify] render comment_reply template failed: %v", err)
		}
	}
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
	// Check if was pending (only increment comment_count if transitioning from non-approved)
	var oldStatus string
	config.DB.Get(&oldStatus, "SELECT status FROM "+config.T("comments")+" WHERE id = $1", id)

	config.DB.Exec(fmt.Sprintf("UPDATE %s SET status = 'approved' WHERE id = $1", config.T("comments")), id)

	// Increment post comment_count if approving a pending/spam comment
	if oldStatus == "pending" || oldStatus == "spam" {
		var postID int
		config.DB.Get(&postID, "SELECT post_id FROM "+config.T("comments")+" WHERE id = $1", id)
		if postID > 0 {
			config.DB.Exec(fmt.Sprintf("UPDATE %s SET comment_count = comment_count + 1 WHERE id = $1", config.T("posts")), postID)
		}
	}
	util.Success(c, gin.H{"id": id})
}

// Links full CRUD
func CreateLink(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		URL         string `json:"url" binding:"required"`
		Description string `json:"description"`
		Logo        string `json:"logo"`
		RssURL      string `json:"rss_url"`
		GroupName   string `json:"group_name"`
		OrderNum    int    `json:"order_num"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "名称和链接不能为空"); return
	}
	if req.GroupName == "" { req.GroupName = "default" }
	now := time.Now().Unix()
	t := config.T("links")
	var id int
	config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (name, url, description, logo, rss_url, group_name, order_num, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id", t),
		req.Name, req.URL, req.Description, req.Logo, req.RssURL, req.GroupName, req.OrderNum, 1, now, now,
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
		RssURL      string `json:"rss_url"`
		GroupName   string `json:"group_name"`
		OrderNum    int    `json:"order_num"`
		Status      int    `json:"status"`
	}
	c.ShouldBindJSON(&req)
	if req.GroupName == "" { req.GroupName = "default" }
	if req.Status == 0 { req.Status = 1 }
	now := time.Now().Unix()
	t := config.T("links")
	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET name=$1, url=$2, description=$3, logo=$4, rss_url=$5, group_name=$6, order_num=$7, status=$8, updated_at=$9 WHERE id=$10", t),
		req.Name, req.URL, req.Description, req.Logo, req.RssURL, req.GroupName, req.OrderNum, req.Status, now, id,
	)
	util.Success(c, gin.H{"id": id})
}

// ApplyLink allows public users to submit a friend link application (status=pending)
func ApplyLink(c *gin.Context) {
	var req struct {
		Name        string `json:"name" binding:"required"`
		URL         string `json:"url" binding:"required"`
		Description string `json:"description"`
		Logo        string `json:"logo"`
		Email       string `json:"email"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "站点名称和地址不能为空"); return
	}
	now := time.Now().Unix()
	t := config.T("links")

	// Check duplicate URL
	var exists int
	config.DB.Get(&exists, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE url = $1", t), req.URL)
	if exists > 0 {
		util.Error(c, 409, "DUPLICATE", "该站点已存在"); return
	}

	var id int
	err := config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (name, url, description, logo, sort_order, status, group_name, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id", t),
		req.Name, req.URL, req.Description, req.Logo, 0, "pending", "申请中", now, now,
	).Scan(&id)
	if err != nil {
		util.Error(c, 500, "CREATE_ERROR", err.Error()); return
	}
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
		VerifyCode      string `json:"verify_code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "当前密码、新密码和验证码不能为空"); return
	}

	userID := middleware.GetUserID(c)

	if !checkVerifyCode(userID, req.VerifyCode) {
		util.Error(c, 400, "INVALID_CODE", "验证码错误或已过期"); return
	}

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

// resolveDisplayAvatar returns the correct avatar URL based on avatar_source setting.
// Thin wrapper kept for internal callers; new code should use model.ResolveAvatarByEmail.
func resolveDisplayAvatar(email string) string {
	return model.ResolveAvatarByEmail(email)
}

// GetSiteOwner returns the site owner's public profile (no auth required).
//
// `avatar` uses the same resolver as Login / Me / comments / federation
// (resolveDisplayAvatar → ResolveAvatarByEmail), so every surface in the
// app — header, footer avatar menu, sidebar, comment cards — renders
// the same URL for the same user. The site-wide `avatar_source` option
// picks between Gravatar and Utterlog ID.
func GetSiteOwner(c *gin.Context) {
	u, err := model.SiteOwner()
	if err != nil {
		util.Error(c, 404, "NOT_FOUND", "站长信息不存在")
		return
	}
	url := ""
	if u.URL != nil {
		url = *u.URL
	}
	bio := ""
	if u.Bio != nil {
		bio = *u.Bio
	}
	emailHash := fmt.Sprintf("%x", md5.Sum([]byte(strings.TrimSpace(strings.ToLower(u.Email)))))
	gravatarURL := fmt.Sprintf("https://gravatar.bluecdn.com/avatar/%s?s=128&d=mp", emailHash)
	utterlogAvatarURL := fmt.Sprintf("https://id.utterlog.com/avatar/%s", emailHash)

	util.Success(c, gin.H{
		"nickname":        u.NicknameStr(),
		"avatar":          resolveDisplayAvatar(u.Email),
		"gravatar_url":    gravatarURL,
		"utterlog_avatar": utterlogAvatarURL,
		"url":             url,
		"bio":             bio,
	})
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

	// Utterlog ID avatar sync: pull latest from ID center
	var utterlogID, utterlogAvatar string
	config.DB.Get(&utterlogID, "SELECT COALESCE(utterlog_id, '') FROM "+config.T("users")+" WHERE id = $1", userID)
	config.DB.Get(&utterlogAvatar, "SELECT COALESCE(utterlog_avatar, '') FROM "+config.T("users")+" WHERE id = $1", userID)

	if utterlogID != "" {
		go syncUtterlogAvatar(userID, utterlogID)
	}

	avatarSource := model.GetOption("avatar_source")
	if avatarSource == "" {
		avatarSource = "gravatar"
	}

	util.Success(c, gin.H{
		"id": u.ID, "username": u.Username, "email": u.Email,
		"nickname": u.NicknameStr(), "avatar": avatar, "gravatar_url": gravatarURL, "url": url, "bio": bio,
		"totp_enabled": u.TOTPEnabled,
		"utterlog_id": utterlogID, "utterlog_avatar": utterlogAvatar,
		"avatar_source": avatarSource,
	})
}

// syncUtterlogAvatar pulls the latest avatar from ID center and updates local cache
func syncUtterlogAvatar(userID int, utterlogID string) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(utterlogHub + "/api/v1/users/" + utterlogID + "/avatar")
	if err != nil || resp.StatusCode != 200 {
		return
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	data, _ := result["data"].(map[string]interface{})
	if data == nil {
		return
	}

	avatar, _ := data["avatar"].(string)
	if avatar != "" {
		config.DB.Exec("UPDATE "+config.T("users")+" SET utterlog_avatar = $1 WHERE id = $2", avatar, userID)
	}
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

	site := email.LoadSiteData()
	body, rerr := email.Render("verify_code", email.VerifyCodeData{
		Site:       site,
		Code:       code,
		ExpireMins: 5,
		Purpose:    "账户操作",
	})
	if rerr != nil {
		util.Error(c, 500, "TEMPLATE_ERROR", fmt.Sprintf("模板渲染失败: %v", rerr))
		return
	}

	if err := util.SendEmail(cfg, u.Email, fmt.Sprintf("🔐 %s 验证码：%s", site.Title, code), body); err != nil {
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

		// Push avatar to ID center if bound
		var utterlogID string
		config.DB.Get(&utterlogID, "SELECT COALESCE(utterlog_id, '') FROM "+config.T("users")+" WHERE id = $1", userID)
		if utterlogID != "" {
			go pushAvatarToIDCenter(utterlogID, *req.Avatar)
		}
	}

	util.Success(c, nil)
}

// pushAvatarToIDCenter pushes the avatar update to ID center via site auth
func pushAvatarToIDCenter(utterlogID, avatarURL string) {
	payload := map[string]string{
		"fingerprint": siteFingerprint(),
		"utterlog_id": utterlogID,
		"avatar_url":  avatarURL,
	}
	b, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", utterlogHub+"/api/v1/sites/sync-avatar", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 10 * time.Second}
	client.Do(req)
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
			"email": admin.Email, "avatar": admin.AvatarURL(),
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

// EditComment allows the original commenter to edit within 60 seconds
func EditComment(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Content   string `json:"content" binding:"required"`
		VisitorID string `json:"visitor_id" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "参数错误"); return
	}
	if len([]rune(strings.TrimSpace(req.Content))) < 5 {
		util.BadRequest(c, "评论内容至少 5 个字"); return
	}

	t := config.T("comments")
	var visitorID string
	var createdAt int64
	err := config.DB.QueryRow(fmt.Sprintf("SELECT COALESCE(visitor_id,''), created_at FROM %s WHERE id = $1", t), id).Scan(&visitorID, &createdAt)
	if err != nil { util.Error(c, 404, "NOT_FOUND", "评论不存在"); return }
	if visitorID == "" || visitorID != req.VisitorID {
		util.Error(c, 403, "FORBIDDEN", "无权编辑此评论"); return
	}
	if time.Now().Unix()-createdAt > 60 {
		util.Error(c, 403, "EXPIRED", "编辑时间已过期"); return
	}

	config.DB.Exec(fmt.Sprintf("UPDATE %s SET content = $1 WHERE id = $2", t), strings.TrimSpace(req.Content), id)
	util.Success(c, gin.H{"id": id})
}

// getCaptchaMode reads the captcha mode from options: "pow", "image", or "off"
func getCaptchaMode() string {
	var mode string
	config.DB.Get(&mode, "SELECT COALESCE(value,'pow') FROM "+config.T("options")+" WHERE name='comment_captcha_mode'")
	// Backward compat: check old comment_captcha_enabled if mode not set
	if mode == "" {
		var enabled string
		config.DB.Get(&enabled, "SELECT COALESCE(value,'1') FROM "+config.T("options")+" WHERE name='comment_captcha_enabled'")
		if enabled == "0" || enabled == "false" { return "off" }
		return "pow"
	}
	if mode != "pow" && mode != "image" && mode != "off" { return "pow" }
	return mode
}

// CaptchaChallenge generates a PoW challenge (also returns mode for frontend)
func CaptchaChallenge(c *gin.Context) {
	mode := getCaptchaMode()
	if mode == "off" {
		util.Success(c, gin.H{"enabled": false, "mode": "off"}); return
	}
	if mode == "image" {
		util.Success(c, gin.H{"enabled": true, "mode": "image"}); return
	}

	// PoW mode
	var diffStr string
	config.DB.Get(&diffStr, "SELECT COALESCE(value,'4') FROM "+config.T("options")+" WHERE name='comment_captcha_difficulty'")
	difficulty, _ := strconv.Atoi(diffStr)
	if difficulty < 1 { difficulty = 4 }
	if difficulty > 6 { difficulty = 6 }

	challenge := fmt.Sprintf("%x", md5.Sum([]byte(fmt.Sprintf("%d-%s", time.Now().UnixNano(), c.ClientIP()))))
	expires := time.Now().Add(2 * time.Minute).Unix()
	config.RDB.Set(c, "captcha:"+challenge, fmt.Sprintf("%d:%d", difficulty, expires), 2*time.Minute)

	util.Success(c, gin.H{
		"enabled":    true,
		"mode":       "pow",
		"challenge":  challenge,
		"difficulty": difficulty,
		"expires":    expires,
	})
}

// ImageCaptchaChallenge generates an image captcha with random alphanumeric code
func ImageCaptchaChallenge(c *gin.Context) {
	mode := getCaptchaMode()
	if mode != "image" {
		util.Error(c, 400, "WRONG_MODE", "图片验证码未启用"); return
	}

	// Generate 4-char code (digits + uppercase letters, exclude confusing chars)
	chars := "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
	code := make([]byte, 4)
	for i := range code { code[i] = chars[rand.Intn(len(chars))] }
	codeStr := string(code)

	// Store in Redis
	id := fmt.Sprintf("%x", md5.Sum([]byte(fmt.Sprintf("%d-%s-%s", time.Now().UnixNano(), c.ClientIP(), codeStr))))
	config.RDB.Set(c, "captcha:img:"+id, strings.ToLower(codeStr), 5*time.Minute)

	// Draw image 120x40
	img := image.NewRGBA(image.Rect(0, 0, 120, 40))
	// Background
	for x := 0; x < 120; x++ {
		for y := 0; y < 40; y++ {
			img.Set(x, y, color.RGBA{245, 245, 245, 255})
		}
	}
	// Noise dots
	for i := 0; i < 80; i++ {
		x, y := rand.Intn(120), rand.Intn(40)
		img.Set(x, y, color.RGBA{uint8(rand.Intn(200)), uint8(rand.Intn(200)), uint8(rand.Intn(200)), 255})
	}
	// Interference lines
	for i := 0; i < 3; i++ {
		x1, y1, x2, y2 := rand.Intn(120), rand.Intn(40), rand.Intn(120), rand.Intn(40)
		lineColor := color.RGBA{uint8(150 + rand.Intn(80)), uint8(150 + rand.Intn(80)), uint8(150 + rand.Intn(80)), 255}
		dx, dy := x2-x1, y2-y1
		steps := abs(dx); if abs(dy) > steps { steps = abs(dy) }
		if steps == 0 { steps = 1 }
		for s := 0; s <= steps; s++ {
			px := x1 + s*dx/steps; py := y1 + s*dy/steps
			if px >= 0 && px < 120 && py >= 0 && py < 40 { img.Set(px, py, lineColor) }
		}
	}
	// Draw text with the larger TTF face so letters fill more of the
	// 120x40 image. Each char randomly offset for mild distortion.
	d := &font.Drawer{Dst: img, Src: image.NewUniform(color.RGBA{50, 50, 120, 255}), Face: captchaFace}
	for i, ch := range codeStr {
		d.Dot = fixed.Point26_6{
			X: fixed.I(8 + i*26 + rand.Intn(4)),
			Y: fixed.I(30 + rand.Intn(4)),
		}
		d.DrawString(string(ch))
	}

	// Encode to base64 PNG
	var buf bytes.Buffer
	png.Encode(&buf, img)
	b64 := base64.StdEncoding.EncodeToString(buf.Bytes())

	util.Success(c, gin.H{
		"id":    id,
		"image": "data:image/png;base64," + b64,
	})
}

func abs(x int) int { if x < 0 { return -x }; return x }

// verifyImageCaptcha checks the image captcha code
func verifyImageCaptcha(id, code string) bool {
	if id == "" || code == "" { return false }
	if config.RDB == nil { return true }

	val, err := config.RDB.Get(config.Ctx, "captcha:img:"+id).Result()
	if err != nil { return false }

	if strings.ToLower(strings.TrimSpace(code)) != val { return false }

	config.RDB.Del(config.Ctx, "captcha:img:"+id)
	return true
}

// verifyCaptcha checks the PoW solution
func verifyCaptcha(challenge, nonce string) bool {
	if challenge == "" || nonce == "" { return false }
	if config.RDB == nil { return true }

	val, err := config.RDB.Get(config.Ctx, "captcha:"+challenge).Result()
	if err != nil { return false }

	parts := strings.Split(val, ":")
	if len(parts) != 2 { return false }
	difficulty, _ := strconv.Atoi(parts[0])
	expires, _ := strconv.ParseInt(parts[1], 10, 64)
	if time.Now().Unix() > expires { return false }

	h := sha256.Sum256([]byte(challenge + nonce))
	hexHash := fmt.Sprintf("%x", h)
	prefix := strings.Repeat("0", difficulty)
	if !strings.HasPrefix(hexHash, prefix) { return false }

	config.RDB.Del(config.Ctx, "captcha:"+challenge)
	return true
}
