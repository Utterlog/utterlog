package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

func ListPosts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	typ := c.DefaultQuery("type", "post")
	status := c.Query("status")
	search := c.Query("search")
	orderBy := c.DefaultQuery("order_by", "created_at")
	order := strings.ToUpper(c.DefaultQuery("order", "DESC"))

	// If authenticated, allow all statuses; otherwise only publish
	userID := middleware.GetUserID(c)
	if userID == 0 {
		status = "publish"
	}

	posts, total, _ := model.PostsList(typ, status, search, orderBy, order, page, perPage)
	formatted := make([]model.PostWithRelations, len(posts))
	for i, p := range posts {
		formatted[i] = model.FormatPost(&p, false)
	}
	util.Paginate(c, formatted, total, page, perPage)
}

func GetPost(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	p, err := model.PostByID(id)
	if err != nil { util.NotFound(c, "文章"); return }
	if p.Status != "publish" && middleware.GetUserID(c) == 0 {
		util.NotFound(c, "文章"); return
	}
	util.Success(c, model.FormatPost(p, true))
}

func GetPostBySlug(c *gin.Context) {
	slug := c.Param("slug")
	p, err := model.PostBySlug(slug)
	if err != nil { util.NotFound(c, "文章"); return }
	if p.Status != "publish" && middleware.GetUserID(c) == 0 {
		util.NotFound(c, "文章"); return
	}
	util.Success(c, model.FormatPost(p, true))
}

func CreatePost(c *gin.Context) {
	var req struct {
		Title        string  `json:"title" binding:"required"`
		Slug         string  `json:"slug"`
		Content      string  `json:"content"`
		Excerpt      string  `json:"excerpt"`
		Type         string  `json:"type"`
		Status       string  `json:"status"`
		CoverURL     string  `json:"cover_url"`
		Password     string  `json:"password"`
		AllowComment *bool   `json:"allow_comment"`
		Pinned       *bool   `json:"pinned"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "标题不能为空"); return
	}

	now := time.Now().Unix()
	typ := req.Type; if typ == "" { typ = "post" }
	status := req.Status; if status == "" { status = "draft" }
	slug := req.Slug; if slug == "" { slug = strconv.FormatInt(now, 36) }

	p := &model.Post{
		Title: req.Title, Slug: slug, Type: typ, Status: status,
		AuthorID: middleware.GetUserID(c), CreatedAt: now, UpdatedAt: now,
	}
	if req.Content != "" { p.Content = &req.Content }
	if req.Excerpt != "" { p.Excerpt = &req.Excerpt }
	if req.CoverURL != "" { p.CoverURL = &req.CoverURL }
	if req.Password != "" { p.Password = &req.Password }
	p.AllowComment = req.AllowComment
	p.Pinned = req.Pinned

	id, err := model.CreatePost(p)
	if err != nil { util.Error(c, 500, "CREATE_ERROR", err.Error()); return }

	// Notify followers if published
	if status == "publish" {
		go notifyFollowersNewContent(req.Title, typ, id)
	}

	util.Success(c, gin.H{"id": id})
}

func UpdatePost(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	existing, err := model.PostByID(id)
	if err != nil { util.NotFound(c, "文章"); return }

	var req struct {
		Title    string `json:"title"`
		Slug     string `json:"slug"`
		Content  string `json:"content"`
		Excerpt  string `json:"excerpt"`
		Status   string `json:"status"`
		CoverURL string `json:"cover_url"`
		Password string `json:"password"`
		AllowComment *bool `json:"allow_comment"`
		Pinned   *bool  `json:"pinned"`
	}
	c.ShouldBindJSON(&req)

	if req.Title != "" { existing.Title = req.Title }
	if req.Slug != "" { existing.Slug = req.Slug }
	if req.Content != "" { existing.Content = &req.Content }
	if req.Excerpt != "" { existing.Excerpt = &req.Excerpt }
	if req.Status != "" { existing.Status = req.Status }
	if req.CoverURL != "" { existing.CoverURL = &req.CoverURL }
	if req.Password != "" { existing.Password = &req.Password }
	if req.AllowComment != nil { existing.AllowComment = req.AllowComment }
	if req.Pinned != nil { existing.Pinned = req.Pinned }
	existing.UpdatedAt = time.Now().Unix()

	model.UpdatePost(id, existing)
	util.Success(c, gin.H{"id": id})
}

func DeletePostHandler(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if err := model.DeletePost(id); err != nil {
		util.Error(c, 500, "DELETE_ERROR", err.Error()); return
	}
	util.Success(c, nil)
}

// Notify all sites that follow us when we publish new content
func notifyFollowersNewContent(title, contentType string, contentID int) {
	t := config.T

	// Get all remote followers
	var followers []struct {
		SourceSite string `db:"source_site"`
	}
	config.DB.Select(&followers, fmt.Sprintf(
		"SELECT source_site FROM %s WHERE following_id = 1 AND source_site != ''", t("followers")))

	siteTitle := model.GetOption("site_title")
	if siteTitle == "" { siteTitle = "Utterlog!" }

	for _, f := range followers {
		if f.SourceSite == "" { continue }
		// Send webhook to follower's site
		payload, _ := json.Marshal(map[string]interface{}{
			"type":    "new_content",
			"site":    config.C.AppURL,
			"name":    siteTitle,
			"title":   title,
			"content_type": contentType,
		})
		http.Post(f.SourceSite+"/api/v1/federation/webhook",
			"application/json", bytes.NewReader(payload))
	}
}

// Receive webhook from followed site about new content
func ReceiveWebhook(c *gin.Context) {
	var req struct {
		Type        string `json:"type"`
		Site        string `json:"site"`
		Name        string `json:"name"`
		Title       string `json:"title"`
		ContentType string `json:"content_type"`
	}
	c.ShouldBindJSON(&req)

	t := config.T
	now := time.Now().Unix()

	switch req.Type {
	case "new_content":
		typeName := "文章"
		if req.ContentType == "moment" { typeName = "说说" }
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (user_id, type, title, content, created_at) VALUES (1,'feed',$1,$2,$3)",
			t("notifications")),
			req.Name+" 发布了新"+typeName, req.Title, now)
	}

	util.Success(c, gin.H{"received": true})
}

// System update check
func CheckSystemUpdate(c *gin.Context) {
	currentVersion := "1.0.0"

	// Check latest version from utterlog.io
	resp, err := http.Get("https://utterlog.io/api/version")
	if err != nil {
		util.Success(c, gin.H{"current": currentVersion, "latest": currentVersion, "update_available": false})
		return
	}
	defer resp.Body.Close()
	var result struct {
		Version string `json:"version"`
		URL     string `json:"url"`
	}
	json.NewDecoder(resp.Body).Decode(&result)

	hasUpdate := result.Version != "" && result.Version != currentVersion
	if hasUpdate {
		// Create notification
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (user_id, type, title, content, created_at) VALUES (1,'system',$1,$2,$3) ON CONFLICT DO NOTHING",
			config.T("notifications")),
			"系统更新可用", fmt.Sprintf("Utterlog! %s 已发布", result.Version), time.Now().Unix())
	}

	util.Success(c, gin.H{
		"current":          currentVersion,
		"latest":           result.Version,
		"update_available": hasUpdate,
		"url":              result.URL,
	})
}
