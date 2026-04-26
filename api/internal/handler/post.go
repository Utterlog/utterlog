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

	categorySlug := c.Query("category")
	tagSlug := c.Query("tag")
	categoryID, _ := strconv.Atoi(c.Query("category_id"))
	tagID, _ := strconv.Atoi(c.Query("tag_id"))

	// category_id / tag_id → slug 转换
	if categoryID > 0 && categorySlug == "" {
		config.DB.Get(&categorySlug, fmt.Sprintf("SELECT slug FROM %s WHERE id = $1 AND type = 'category'", config.T("metas")), categoryID)
	}
	if tagID > 0 && tagSlug == "" {
		config.DB.Get(&tagSlug, fmt.Sprintf("SELECT slug FROM %s WHERE id = $1 AND type = 'tag'", config.T("metas")), tagID)
	}

	posts, total, _ := model.PostsList(typ, status, search, orderBy, order, page, perPage, categorySlug, tagSlug)
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
		Title        string   `json:"title" binding:"required"`
		Slug         string   `json:"slug"`
		Content      string   `json:"content"`
		Excerpt      string   `json:"excerpt"`
		Type         string   `json:"type"`
		Status       string   `json:"status"`
		CoverURL     string   `json:"cover_url"`
		Password     string   `json:"password"`
		AllowComment *bool    `json:"allow_comment"`
		Pinned       *bool    `json:"pinned"`
		CategoryIDs  []int    `json:"category_ids"`
		TagNames     []string `json:"tag_names"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "标题不能为空"); return
	}

	now := time.Now().Unix()
	typ := req.Type; if typ == "" { typ = "post" }
	status := req.Status; if status == "" { status = "draft" }
	slug := req.Slug; if slug == "" { slug = strconv.FormatInt(now, 36) }

	// Auto-extract excerpt from content if not provided
	excerpt := req.Excerpt
	if excerpt == "" && req.Content != "" {
		excerpt = extractExcerpt(req.Content, 200)
	}

	p := &model.Post{
		Title: req.Title, Slug: slug, Type: typ, Status: status,
		AuthorID: middleware.GetUserID(c), CreatedAt: now, UpdatedAt: now,
	}
	if req.Content != "" {
		p.Content = &req.Content
		p.WordCount = countWords(req.Content)
	}
	if excerpt != "" { p.Excerpt = &excerpt }
	// Admin-provided summary is authoritative — mirror it into
	// ai_summary so the post page renders it instead of waiting for
	// the BG auto-generator (which only fills ai_summary when empty).
	if req.Excerpt != "" { p.AISummary = &req.Excerpt }
	if req.CoverURL != "" { p.CoverURL = &req.CoverURL }
	if req.Password != "" { p.Password = &req.Password }
	p.AllowComment = req.AllowComment
	p.Pinned = req.Pinned

	id, err := model.CreatePost(p)
	if err != nil { util.Error(c, 500, "CREATE_ERROR", err.Error()); return }

	// Save category and tag relationships
	syncRelationships(id, req.CategoryIDs, req.TagNames, now)

	// Notify followers if published
	if status == "publish" {
		go notifyFollowersNewContent(req.Title, typ, id)
		go embedPost(id)
		go generateAIQuestions(id)
		go generateAISummary(id)
	}

	util.Success(c, gin.H{"id": id})
}

func UpdatePost(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	existing, err := model.PostByID(id)
	if err != nil { util.NotFound(c, "文章"); return }

	var req struct {
		Title        string   `json:"title"`
		Slug         string   `json:"slug"`
		Content      string   `json:"content"`
		Excerpt      string   `json:"excerpt"`
		Status       string   `json:"status"`
		CoverURL     string   `json:"cover_url"`
		Password     string   `json:"password"`
		AllowComment *bool    `json:"allow_comment"`
		Pinned       *bool    `json:"pinned"`
		CategoryIDs  []int    `json:"category_ids"`
		TagNames     []string `json:"tag_names"`
		// RFC3339 / ISO8601 string or empty. Admin edit page sends the
		// datetime-local value here so authors can backdate or reschedule.
		// Empty string clears it back to NULL.
		PublishedAt  *string  `json:"published_at"`
	}
	c.ShouldBindJSON(&req)

	wasDraft := existing.Status == "draft"

	if req.Title != "" { existing.Title = req.Title }
	if req.Slug != "" { existing.Slug = req.Slug }
	if req.Content != "" {
		existing.Content = &req.Content
		existing.WordCount = countWords(req.Content)
	}
	if req.Status != "" { existing.Status = req.Status }
	if req.CoverURL != "" { existing.CoverURL = &req.CoverURL }
	if req.Password != "" { existing.Password = &req.Password }
	if req.AllowComment != nil { existing.AllowComment = req.AllowComment }
	if req.Pinned != nil { existing.Pinned = req.Pinned }

	// Explicit published_at from the client wins. Empty string clears.
	if req.PublishedAt != nil {
		if *req.PublishedAt == "" {
			existing.PublishedAt = nil
		} else {
			// Accept both "2026-04-24T15:30" (datetime-local) and full
			// RFC3339. Treat naive strings as local time in the server's
			// TZ — same way a bare datetime-local input renders.
			layouts := []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02T15:04"}
			for _, l := range layouts {
				if t, err := time.ParseInLocation(l, *req.PublishedAt, time.Local); err == nil {
					existing.PublishedAt = &t
					break
				}
			}
		}
	}
	// Auto-backfill: draft → publish and no explicit date supplied.
	if wasDraft && existing.Status == "publish" && existing.PublishedAt == nil {
		now := time.Now()
		existing.PublishedAt = &now
	}

	// Handle excerpt: use provided, or auto-extract if content changed and no excerpt
	if req.Excerpt != "" {
		existing.Excerpt = &req.Excerpt
		// Mirror the manually-edited excerpt into ai_summary so the
		// public post page (which renders ai_summary, not excerpt)
		// reflects the admin's edit on the very next request. Without
		// this, the BG generateAISummary job below would skip because
		// ai_summary is already non-empty (the one-line guard at
		// search.go:201), and the page would keep showing the
		// previously-generated text — exactly the "saved but not
		// synced" symptom.
		existing.AISummary = &req.Excerpt
	} else if req.Content != "" && (existing.Excerpt == nil || *existing.Excerpt == "") {
		exc := extractExcerpt(req.Content, 200)
		if exc != "" { existing.Excerpt = &exc }
	}

	existing.UpdatedAt = time.Now().Unix()

	model.UpdatePost(id, existing)

	// Sync category and tag relationships
	now := time.Now().Unix()
	syncRelationships(id, req.CategoryIDs, req.TagNames, now)

	// Update embedding and AI questions if published
	if existing.Status == "publish" {
		go embedPost(id)
		go generateAIQuestions(id)
		go generateAISummary(id)
	}

	util.Success(c, gin.H{"id": id})
}

func DeletePostHandler(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	t := config.T

	// Delete relationships first
	config.DB.Exec("DELETE FROM "+t("relationships")+" WHERE post_id = $1", id)

	// Delete associated comments
	config.DB.Exec("DELETE FROM "+t("comments")+" WHERE post_id = $1", id)

	// Delete associated annotations
	config.DB.Exec("DELETE FROM "+t("annotations")+" WHERE post_id = $1", id)

	// Delete the post
	if err := model.DeletePost(id); err != nil {
		util.Error(c, 500, "DELETE_ERROR", err.Error()); return
	}

	// Recalculate category/tag counts
	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET count = (SELECT COUNT(*) FROM %s WHERE meta_id = %s.id) WHERE type IN ('category','tag')",
		t("metas"), t("relationships"), t("metas")))

	util.Success(c, nil)
}

// getDefaultCategoryID returns the default category ID, creating one if needed
func getDefaultCategoryID() int {
	t := config.T
	// Check options for default_category
	var catID int
	var slug string
	config.DB.Get(&slug, "SELECT COALESCE(value,'') FROM "+t("options")+" WHERE name = 'default_category'")
	if slug != "" {
		config.DB.Get(&catID, "SELECT id FROM "+t("metas")+" WHERE slug = $1 AND type = 'category'", slug)
		if catID > 0 { return catID }
	}
	// Fallback: first category by ID
	config.DB.Get(&catID, "SELECT id FROM "+t("metas")+" WHERE type = 'category' ORDER BY id LIMIT 1")
	if catID > 0 { return catID }
	// No categories exist: create "日常"
	config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (name, slug, type, count, created_at, updated_at) VALUES ('日常','life','category',0,$1,$2) RETURNING id",
		t("metas")), time.Now().Unix(), time.Now().Unix()).Scan(&catID)
	return catID
}

// syncRelationships replaces all category/tag associations for a post
func syncRelationships(postID int, categoryIDs []int, tagNames []string, now int64) {
	t := config.T

	// Ensure at least one category (use default if none provided)
	if len(categoryIDs) == 0 {
		if defaultCat := getDefaultCategoryID(); defaultCat > 0 {
			categoryIDs = []int{defaultCat}
		}
	}

	// Delete existing relationships
	config.DB.Exec("DELETE FROM "+t("relationships")+" WHERE post_id = $1", postID)

	// Insert category relationships
	for _, catID := range categoryIDs {
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (post_id, meta_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
			t("relationships")), postID, catID, now)
	}

	// Insert tag relationships (create tags if they don't exist)
	for _, name := range tagNames {
		name = strings.TrimSpace(name)
		if name == "" { continue }
		slug := name
		var tagID int
		err := config.DB.Get(&tagID, "SELECT id FROM "+t("metas")+" WHERE slug = $1 AND type = 'tag'", slug)
		if err != nil {
			config.DB.QueryRow(fmt.Sprintf(
				"INSERT INTO %s (name, slug, type, count, created_at, updated_at) VALUES ($1, $2, 'tag', 0, $3, $4) RETURNING id",
				t("metas")), name, slug, now, now).Scan(&tagID)
		}
		if tagID > 0 {
			config.DB.Exec(fmt.Sprintf(
				"INSERT INTO %s (post_id, meta_id, created_at) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
				t("relationships")), postID, tagID, now)
		}
	}

	// Update counts for all categories and tags
	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET count = (SELECT COUNT(*) FROM %s WHERE meta_id = %s.id) WHERE type IN ('category', 'tag')",
		t("metas"), t("relationships"), t("metas")))
}

// extractExcerpt generates a plain text excerpt from markdown content
func extractExcerpt(content string, maxLen int) string {
	text := content
	// Remove fenced code blocks
	for {
		start := strings.Index(text, "```")
		if start == -1 { break }
		end := strings.Index(text[start+3:], "```")
		if end == -1 { text = text[:start]; break }
		text = text[:start] + text[start+3+end+3:]
	}
	text = strings.NewReplacer("**", "", "*", "", "~~", "", "`", "").Replace(text)
	// Remove markdown images
	for strings.Contains(text, "![") {
		s := strings.Index(text, "![")
		e := strings.Index(text[s:], ")")
		if e == -1 { break }
		text = text[:s] + text[s+e+1:]
	}
	// Remove headers, blockquotes, horizontal rules
	lines := strings.Split(text, "\n")
	var clean []string
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l == "" || strings.HasPrefix(l, "#") || strings.HasPrefix(l, "---") || strings.HasPrefix(l, ">") { continue }
		clean = append(clean, l)
	}
	text = strings.Join(clean, " ")
	text = strings.TrimSpace(text)
	runes := []rune(text)
	if len(runes) > maxLen {
		text = string(runes[:maxLen])
	}
	return text
}

// countWords counts characters in content, excluding code blocks and markdown syntax
func countWords(content string) int {
	text := content
	// Remove fenced code blocks
	for {
		start := strings.Index(text, "```")
		if start == -1 { break }
		end := strings.Index(text[start+3:], "```")
		if end == -1 { text = text[:start]; break }
		text = text[:start] + text[start+3+end+3:]
	}
	// Remove markdown formatting
	text = strings.NewReplacer("**", "", "*", "", "~~", "", "`", "").Replace(text)
	// Remove images
	for strings.Contains(text, "![") {
		s := strings.Index(text, "![")
		e := strings.Index(text[s:], ")")
		if e == -1 { break }
		text = text[:s] + text[s+e+1:]
	}
	// Remove links: [text](url) → text
	for strings.Contains(text, "](") {
		s := strings.LastIndex(text[:strings.Index(text, "](")], "[")
		if s == -1 { break }
		e := strings.Index(text[s:], ")")
		if e == -1 { break }
		linkText := text[s+1 : strings.Index(text[s:], "](")+s]
		text = text[:s] + linkText + text[s+e+1:]
	}
	// Remove headers, blockquotes
	lines := strings.Split(text, "\n")
	var clean []string
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l == "" || strings.HasPrefix(l, "---") { continue }
		l = strings.TrimLeft(l, "#> ")
		clean = append(clean, l)
	}
	text = strings.Join(clean, " ")
	return len([]rune(strings.TrimSpace(text)))
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

// ArchiveStats returns stats for the archive page: total posts, days, words, comments, and daily post counts for heatmap
func ArchiveStats(c *gin.Context) {
	t := config.T

	var postCount, commentCount int
	config.DB.Get(&postCount, "SELECT COUNT(*) FROM "+t("posts")+" WHERE status = 'publish' AND type = 'post'")
	config.DB.Get(&commentCount, "SELECT COUNT(*) FROM "+t("comments")+" WHERE status = 'approved'")

	// Total word count from stored word_count column
	var totalWords int
	config.DB.Get(&totalWords, "SELECT COALESCE(SUM(word_count), 0) FROM "+t("posts")+" WHERE status = 'publish' AND type = 'post'")

	// Days since site_since option or first post
	var siteSince string
	config.DB.Get(&siteSince, "SELECT COALESCE(value, '') FROM "+t("options")+" WHERE name = 'site_since'")
	var sinceTime int64
	if siteSince != "" {
		if parsed, err := time.Parse("2006-01-02", siteSince); err == nil {
			sinceTime = parsed.Unix()
		}
	}
	if sinceTime == 0 {
		config.DB.Get(&sinceTime, "SELECT COALESCE(MIN(created_at), 0) FROM "+t("posts")+" WHERE status = 'publish' AND type = 'post'")
	}
	days := 0
	if sinceTime > 0 {
		days = int((time.Now().Unix() - sinceTime) / 86400) + 1
	}

	// Daily post counts for heatmap (last 365 days)
	type dayCount struct {
		Date  string `db:"date" json:"date"`
		Count int    `db:"count" json:"count"`
	}
	var heatmap []dayCount
	config.DB.Select(&heatmap, fmt.Sprintf(
		"SELECT TO_CHAR(TO_TIMESTAMP(created_at), 'YYYY-MM-DD') as date, COUNT(*) as count FROM %s WHERE status = 'publish' AND type = 'post' AND created_at > EXTRACT(EPOCH FROM NOW() - INTERVAL '365 days') GROUP BY date ORDER BY date",
		t("posts")))
	if heatmap == nil {
		heatmap = []dayCount{}
	}

	// Total page views — read fresh from DB (SELECT COUNT is cheap on the
	// access_logs indexed PK). Redis was a stale source of truth: if the
	// IncrTotalViews side of the write path ever got skipped the Redis
	// counter drifted and stats looked permanently out of date.
	var totalViews int
	config.DB.Get(&totalViews, "SELECT COUNT(*) FROM "+t("access_logs"))

	util.Success(c, gin.H{
		"post_count":    postCount,
		"comment_count": commentCount,
		"word_count":    totalWords,
		"days":          days,
		"total_views":   totalViews,
		"heatmap":       heatmap,
	})
}

// PostNavigation returns prev/next post and related/random/popular/category posts
func PostNavigation(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	t := config.T

	// Current post info (for category matching)
	var createdAt int64
	var categoryIDs []int
	config.DB.Get(&createdAt, "SELECT created_at FROM "+t("posts")+" WHERE id = $1", id)
	rows, _ := config.DB.Query("SELECT meta_id FROM "+t("relationships")+" WHERE post_id = $1", id)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var mid int
			rows.Scan(&mid)
			// Check if it's a category
			var typ string
			config.DB.Get(&typ, "SELECT type FROM "+t("metas")+" WHERE id = $1", mid)
			if typ == "category" {
				categoryIDs = append(categoryIDs, mid)
			}
		}
	}

	type navPost struct {
		ID           int              `db:"id" json:"id"`
		Title        string           `db:"title" json:"title"`
		Slug         string           `db:"slug" json:"slug"`
		CoverURL     *string          `db:"cover_url" json:"cover_url"`
		CreatedAt    int64            `db:"created_at" json:"created_at"`
		ViewCount    int              `db:"view_count" json:"view_count"`
		CommentCount int              `db:"comment_count" json:"comment_count"`
		Categories   []model.MetaBrief `db:"-" json:"categories"`
	}

	cols := "id, title, slug, cover_url, created_at, view_count, comment_count"
	pCols := "p.id, p.title, p.slug, p.cover_url, p.created_at, p.view_count, p.comment_count"

	// Prev post (older)
	var prev *navPost
	var p navPost
	err := config.DB.Get(&p, fmt.Sprintf(
		"SELECT %s FROM %s WHERE status = 'publish' AND type = 'post' AND created_at < $1 ORDER BY created_at DESC LIMIT 1",
		cols, t("posts")), createdAt)
	if err == nil {
		prev = &p
	}

	// Next post (newer)
	var next *navPost
	var n navPost
	err = config.DB.Get(&n, fmt.Sprintf(
		"SELECT %s FROM %s WHERE status = 'publish' AND type = 'post' AND created_at > $1 ORDER BY created_at ASC LIMIT 1",
		cols, t("posts")), createdAt)
	if err == nil {
		next = &n
	}

	// Related posts — by shared tags (most tag overlap first), fallback to full-text similarity
	var related []navPost
	// Get all tag IDs for current post
	var tagIDs []int
	config.DB.Select(&tagIDs, fmt.Sprintf(
		"SELECT r.meta_id FROM %s r JOIN %s m ON r.meta_id = m.id WHERE r.post_id = $1 AND m.type = 'tag'",
		t("relationships"), t("metas")), id)

	if len(tagIDs) > 0 {
		// Find posts sharing the most tags with current post
		tagIDStr := ""
		for i, tid := range tagIDs {
			if i > 0 { tagIDStr += "," }
			tagIDStr += strconv.Itoa(tid)
		}
		config.DB.Select(&related, fmt.Sprintf(
			"SELECT %s FROM %s p JOIN %s r ON p.id = r.post_id WHERE r.meta_id IN (%s) AND p.id != $1 AND p.status = 'publish' AND p.type = 'post' GROUP BY p.id, p.title, p.slug, p.cover_url, p.created_at, p.view_count, p.comment_count ORDER BY COUNT(*) DESC, p.created_at DESC LIMIT 20",
			pCols, t("posts"), t("relationships"), tagIDStr), id)
	}

	// Fallback 1: same category posts if not enough from tags
	if len(related) < 20 && len(categoryIDs) > 0 {
		excludeIDs := strconv.Itoa(id)
		for _, r := range related {
			excludeIDs += "," + strconv.Itoa(r.ID)
		}
		catIDStr := ""
		for i, cid := range categoryIDs {
			if i > 0 { catIDStr += "," }
			catIDStr += strconv.Itoa(cid)
		}
		var catRelated []navPost
		// LIMIT 20-len(related) keeps the fill consistent with the
		// outer `len(related) < 20` cap. The previous 5-len(related)
		// went negative once tag-based hits returned 6+ rows, which
		// Postgres rejects ('LIMIT must not be negative') — sqlx
		// swallowed the error and the fallback silently disappeared.
		config.DB.Select(&catRelated, fmt.Sprintf(
			"SELECT %s FROM %s p JOIN %s r ON p.id = r.post_id WHERE r.meta_id IN (%s) AND p.id NOT IN (%s) AND p.status = 'publish' AND p.type = 'post' GROUP BY p.id, p.title, p.slug, p.cover_url, p.created_at, p.view_count, p.comment_count ORDER BY p.created_at DESC LIMIT %d",
			pCols, t("posts"), t("relationships"), catIDStr, excludeIDs, 20-len(related)), )
		related = append(related, catRelated...)
	}

	// Fallback 2: full-text similarity if still not enough
	if len(related) < 20 {
		var title string
		config.DB.Get(&title, "SELECT title FROM "+t("posts")+" WHERE id = $1", id)
		if title != "" {
			excludeIDs := strconv.Itoa(id)
			for _, r := range related {
				excludeIDs += "," + strconv.Itoa(r.ID)
			}
			var ftsRelated []navPost
			// Same 20-len(related) fix as the category fallback —
			// negative LIMITs were dropping FTS suggestions whenever
			// tags+category had already filled 5+ rows.
			config.DB.Select(&ftsRelated, fmt.Sprintf(
				"SELECT %s FROM %s WHERE status = 'publish' AND type = 'post' AND id NOT IN (%s) AND to_tsvector('simple', title || ' ' || COALESCE(content, '')) @@ plainto_tsquery('simple', $1) ORDER BY view_count DESC LIMIT %d",
				cols, t("posts"), excludeIDs, 20-len(related)), title)
			related = append(related, ftsRelated...)
		}
	}
	if related == nil {
		related = []navPost{}
	}

	// Random posts
	var random []navPost
	config.DB.Select(&random, fmt.Sprintf(
		"SELECT %s FROM %s WHERE status = 'publish' AND type = 'post' AND id != $1 ORDER BY RANDOM() LIMIT 20",
		cols, t("posts")), id)
	if random == nil {
		random = []navPost{}
	}

	// Popular posts (by view_count)
	var popular []navPost
	config.DB.Select(&popular, fmt.Sprintf(
		"SELECT %s FROM %s WHERE status = 'publish' AND type = 'post' AND id != $1 ORDER BY view_count DESC LIMIT 20",
		cols, t("posts")), id)
	if popular == nil {
		popular = []navPost{}
	}

	// Category posts (same category, by date, exclude self)
	var categoryPosts []navPost
	if len(categoryIDs) > 0 {
		config.DB.Select(&categoryPosts, fmt.Sprintf(
			"SELECT DISTINCT %s FROM %s p JOIN %s r ON p.id = r.post_id WHERE r.meta_id = $1 AND p.id != $2 AND p.status = 'publish' AND p.type = 'post' ORDER BY p.created_at DESC LIMIT 20",
			pCols, t("posts"), t("relationships")), categoryIDs[0], id)
	}
	if categoryPosts == nil {
		categoryPosts = []navPost{}
	}

	// 给所有 navPost 附加 categories
	enrichNav := func(posts []navPost) []navPost {
		for i := range posts {
			posts[i].Categories = model.PostCategories(posts[i].ID)
		}
		return posts
	}
	related = enrichNav(related)
	random = enrichNav(random)
	popular = enrichNav(popular)
	categoryPosts = enrichNav(categoryPosts)
	if prev != nil { prev.Categories = model.PostCategories(prev.ID) }
	if next != nil { next.Categories = model.PostCategories(next.ID) }

	// 友链最新更新（feed_items from rss_subscriptions）
	type feedItem struct {
		Title    string `db:"title" json:"title"`
		Link     string `db:"link" json:"link"`
		SiteName string `db:"site_name" json:"site_name"`
		SiteURL  string `db:"site_url" json:"site_url"`
		PubDate  int64  `db:"pub_date" json:"pub_date"`
	}
	var feedItems []feedItem
	// fi.pub_date must be in the SELECT list — without it sqlx leaves
	// PubDate=0 and the front-end's `new Date(pub_date * 1000)` paints
	// every related-tab feed entry as 1970-01-01.
	config.DB.Select(&feedItems, fmt.Sprintf(
		"SELECT fi.title, fi.link, rs.site_name, rs.site_url, fi.pub_date FROM %s fi JOIN %s rs ON fi.subscription_id = rs.id ORDER BY fi.pub_date DESC LIMIT 20",
		t("feed_items"), t("rss_subscriptions")))
	if feedItems == nil { feedItems = []feedItem{} }

	util.Success(c, gin.H{
		"prev":     prev,
		"next":     next,
		"related":  related,
		"random":   random,
		"popular":  popular,
		"category": categoryPosts,
		"feeds":    feedItems,
	})
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
