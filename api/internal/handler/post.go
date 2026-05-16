package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/siteclock"
	"utterlog-go/internal/textutil"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

func ListPosts(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	typ := c.DefaultQuery("type", "post")
	status := c.Query("status")
	search := c.Query("search")
	orderBy := c.DefaultQuery("order_by", "published_at")
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
	if err != nil {
		util.NotFound(c, "文章")
		return
	}
	if p.Status != "publish" && middleware.GetUserID(c) == 0 {
		util.NotFound(c, "文章")
		return
	}
	maybeBumpPostView(c, p)
	util.Success(c, model.FormatPost(p, true))
}

func GetPostBySlug(c *gin.Context) {
	slug := c.Param("slug")
	p, err := model.PostBySlug(slug)
	if err != nil {
		util.NotFound(c, "文章")
		return
	}
	if p.Status != "publish" && middleware.GetUserID(c) == 0 {
		util.NotFound(c, "文章")
		return
	}
	maybeBumpPostView(c, p)
	util.Success(c, model.FormatPost(p, true))
}

// GetPostByDisplayID —— 配合 permalink 模板里的 %display_id% token。
// 前端 SSR 在 /[...permalink]/page.tsx 里 parsePermalink 拿到 display_id
// 后调用本接口拿真实 post。display_id 跟 db 主键 id 解耦，作者删过
// 草稿 / 失败插入造成 id 跳号时 display_id 仍然连续。
func GetPostByDisplayID(c *gin.Context) {
	d, _ := strconv.Atoi(c.Param("display_id"))
	p, err := model.PostByDisplayID(d)
	if err != nil {
		util.NotFound(c, "文章")
		return
	}
	if p.Status != "publish" && middleware.GetUserID(c) == 0 {
		util.NotFound(c, "文章")
		return
	}
	maybeBumpPostView(c, p)
	util.Success(c, model.FormatPost(p, true))
}

// maybeBumpPostView is the WordPress-style server-side view-count
// increment. The frontend SSR for an article detail page calls
// /api/v1/posts/<id>?track=1 — which means "this is the visitor
// reading the article, count it now". Conditions:
//
//   - track=1 query param must be present (so admin / search / list
//     callers don't bump);
//   - request must NOT match the bot UA list (crawlers shouldn't
//     inflate view counts).
//
// v2.2.0: 不再 skip 登录用户 / 管理员；不再做去重；刷新就 +1（用户要求）。
//
// Mutates p.ViewCount in-place so the response reflects the
// already-bumped value, matching what the next visitor will read.
//
// view_count 自增 + ul_stats_post_daily.views 同时同步增量，保持「文章
// 永久 PV 计数」和「文章日聚合」之间不漂移。post UV 不在 SSR 端做
// （SSR 拿不到 visitor_id），统一让浏览器 /track 流程更新
// ul_visitor_post_dates / ul_stats_post_daily.unique_visitors。
func maybeBumpPostView(c *gin.Context, p *model.Post) {
	if p == nil || p.ID <= 0 {
		return
	}
	if c.Query("track") != "1" {
		return
	}
	// v2.2.0: 不再做 IsBot UA 检查。
	//
	// 这条路径的 UA 永远是 Next.js SSR 的 `node`（Node fetch 默认 UA），
	// 对它做 bot 检测会把每个真实访客的第一次文章访问都拦掉。访客的
	// 浏览器真实 UA 在 SSR 层后才出现，到不了这里。
	//
	// 数据质量护栏放在 /track POST（logAccess）那一侧 —— 那条路径是
	// 浏览器直接打到 api 的，UA 真实，bot 拦截有意义。这里的 view_count
	// 等同于"文章被渲染过几次"，对 SSR 渲染请求一律 +1，符合用户
	// "刷新就 +1" 的要求。
	IncrPostViews(p.ID)
	p.ViewCount++
}

func ListPostComments(c *gin.Context) {
	ref := strings.TrimSpace(c.Param("id"))
	if decoded, err := url.PathUnescape(ref); err == nil {
		ref = decoded
	}

	p, err := postByIDOrSlug(ref)
	if err != nil {
		util.NotFound(c, "文章")
		return
	}
	if p.Status != "publish" && middleware.GetUserID(c) == 0 {
		util.NotFound(c, "文章")
		return
	}

	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "500"))
	order := c.DefaultQuery("order", "asc")
	topLevel := c.Query("top_level") == "true"
	excludeAdmin := c.Query("exclude_admin") == "1" || c.Query("exclude_admin") == "true"

	status := c.Query("status")
	if status == "" || middleware.GetUserID(c) == 0 {
		status = "approved"
	}

	comments, total, err := model.CommentsList(page, perPage, status, c.Query("search"), order, p.ID, 0, topLevel, excludeAdmin)
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "QUERY_ERROR", "评论列表读取失败")
		return
	}
	util.Paginate(c, model.FormatComments(comments), total, page, perPage)
}

func postByIDOrSlug(ref string) (*model.Post, error) {
	if id, err := strconv.Atoi(ref); err == nil && id > 0 {
		if p, err := model.PostByID(id); err == nil {
			return p, nil
		}
	}
	return model.PostBySlug(ref)
}

func parsePostPublishedAt(input string) (*time.Time, error) {
	input = strings.TrimSpace(input)
	if input == "" {
		return nil, nil
	}
	layouts := []string{time.RFC3339, "2006-01-02T15:04:05", "2006-01-02T15:04"}
	loc := siteclock.Location()
	for _, layout := range layouts {
		if t, err := time.ParseInLocation(layout, input, loc); err == nil {
			return &t, nil
		}
	}
	return nil, fmt.Errorf("invalid published_at")
}

func CreatePost(c *gin.Context) {
	var req struct {
		Title        string             `json:"title"`
		Slug         string             `json:"slug"`
		Content      string             `json:"content"`
		Excerpt      string             `json:"excerpt"`
		Type         string             `json:"type"`
		Status       string             `json:"status"`
		CoverURL     string             `json:"cover_url"`
		Password     string             `json:"password"`
		AllowComment *bool              `json:"allow_comment"`
		Pinned       *bool              `json:"pinned"`
		PublishedAt  *string            `json:"published_at"`
		CategoryIDs  []int              `json:"category_ids"`
		TagNames     []string           `json:"tag_names"`
		Footprints   []FootprintPayload `json:"footprints"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "请求格式错误")
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		if h1, body := firstMarkdownH1Title(req.Content); h1 != "" {
			title = h1
			req.Content = body
		}
	}
	if title == "" {
		util.BadRequest(c, "标题不能为空")
		return
	}

	now := time.Now().Unix()
	typ := req.Type
	if typ == "" {
		typ = "post"
	}
	status := req.Status
	if status == "" {
		status = "draft"
	}
	slug := req.Slug
	if slug == "" {
		slug = strconv.FormatInt(now, 36)
	}
	var publishedAt *time.Time
	if status == "publish" {
		if req.PublishedAt != nil && strings.TrimSpace(*req.PublishedAt) != "" {
			t, err := parsePostPublishedAt(*req.PublishedAt)
			if err != nil {
				util.BadRequest(c, "发布时间格式错误")
				return
			}
			publishedAt = t
		}
		if publishedAt == nil {
			t := siteclock.Now()
			publishedAt = &t
		}
	}

	// Auto-extract excerpt from content if not provided
	excerpt := req.Excerpt
	if excerpt == "" && req.Content != "" {
		excerpt = extractExcerpt(req.Content, 200)
	}

	p := &model.Post{
		Title: title, Slug: slug, Type: typ, Status: status,
		AuthorID: middleware.GetUserID(c), CreatedAt: now, UpdatedAt: now, PublishedAt: publishedAt,
	}
	if req.Content != "" {
		p.Content = &req.Content
		p.WordCount = countWords(req.Content)
	}
	if excerpt != "" {
		p.Excerpt = &excerpt
	}
	// Admin-provided summary is authoritative — mirror it into
	// ai_summary so the post page renders it instead of waiting for
	// the BG auto-generator (which only fills ai_summary when empty).
	if req.Excerpt != "" {
		p.AISummary = &req.Excerpt
	}
	if req.CoverURL != "" {
		p.CoverURL = &req.CoverURL
	}
	if req.Password != "" {
		p.Password = &req.Password
	}
	p.AllowComment = req.AllowComment
	p.Pinned = req.Pinned

	id, err := model.CreatePost(p)
	if err != nil {
		util.Error(c, 500, "CREATE_ERROR", err.Error())
		return
	}

	// Save category and tag relationships
	syncRelationships(id, req.CategoryIDs, req.TagNames, now)
	if err := model.SyncPostFootprints(id, normalizeFootprintPayloads(req.Footprints)); err != nil {
		util.Error(c, 500, "FOOTPRINT_ERROR", err.Error())
		return
	}

	// Notify followers if published
	if status == "publish" {
		// CreatePost gives published posts their official public ID directly:
		// ul_posts.id == display_id == /archives/<id>. Drafts use a separate
		// temporary ID and never consume this public series.
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
	if err != nil {
		util.NotFound(c, "文章")
		return
	}

	var req struct {
		Title    string  `json:"title"`
		Slug     string  `json:"slug"`
		Content  *string `json:"content"`
		Excerpt  string  `json:"excerpt"`
		Status   string  `json:"status"`
		// CoverURL 用指针区分「没传字段」(nil → 不动) 和「传了空串」
		// (非 nil → 清空)。之前 string 类型没法表达"清空"语义，导致
		// admin 在文章编辑页删 URL 保存时前端发了 "" 也被后端忽略。
		CoverURL     *string             `json:"cover_url"`
		Password     string              `json:"password"`
		AllowComment *bool               `json:"allow_comment"`
		Pinned       *bool               `json:"pinned"`
		CategoryIDs  *[]int              `json:"category_ids"`
		TagNames     *[]string           `json:"tag_names"`
		Footprints   *[]FootprintPayload `json:"footprints"`
		// RFC3339 / ISO8601 string or empty. Admin edit page sends the
		// datetime-local value here so authors can backdate or reschedule.
		// Empty string clears it back to NULL.
		PublishedAt *string `json:"published_at"`
	}
	c.ShouldBindJSON(&req)

	wasDraft := existing.Status == "draft"

	if req.Title != "" {
		existing.Title = req.Title
	} else if strings.TrimSpace(existing.Title) == "" && req.Content != nil {
		if h1, body := firstMarkdownH1Title(*req.Content); h1 != "" {
			existing.Title = h1
			existing.Content = &body
			existing.WordCount = countWords(body)
			req.Content = &body
		}
	}
	if req.Slug != "" {
		existing.Slug = req.Slug
	}
	if req.Content != nil {
		existing.Content = req.Content
		existing.WordCount = countWords(*req.Content)
	}
	if req.Status != "" {
		existing.Status = req.Status
	}
	if req.CoverURL != nil {
		// 非 nil 即代表 admin 主动设了字段：值为 "" 时存 NULL 让前台
		// 走"无封面 → 走随机图 / 首图 fallback"；否则存用户给的 URL。
		if v := strings.TrimSpace(*req.CoverURL); v != "" {
			existing.CoverURL = &v
		} else {
			existing.CoverURL = nil
		}
	}
	if req.Password != "" {
		existing.Password = &req.Password
	}
	if req.AllowComment != nil {
		existing.AllowComment = req.AllowComment
	}
	if req.Pinned != nil {
		existing.Pinned = req.Pinned
	}

	// Explicit published_at from the client wins. Empty string clears.
	if req.PublishedAt != nil {
		t, err := parsePostPublishedAt(*req.PublishedAt)
		if err != nil {
			util.BadRequest(c, "发布时间格式错误")
			return
		}
		existing.PublishedAt = t
	}
	// Auto-backfill: draft → publish and no explicit date supplied.
	if wasDraft && existing.Status == "publish" && existing.PublishedAt == nil {
		now := siteclock.Now()
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
	} else if (req.Content != nil || (wasDraft && existing.Status == "publish")) && (existing.Excerpt == nil || *existing.Excerpt == "") {
		content := ""
		if existing.Content != nil {
			content = *existing.Content
		}
		exc := extractExcerpt(content, 200)
		if exc != "" {
			existing.Excerpt = &exc
		}
	}

	existing.UpdatedAt = time.Now().Unix()

	finalID, err := model.UpdatePost(id, existing)
	if err != nil {
		util.Error(c, 500, "UPDATE_ERROR", err.Error())
		return
	}
	id = finalID

	// Sync category and tag relationships only when the client explicitly
	// includes those fields. Status-only updates from the list page must keep
	// the draft's categories and tags instead of replacing them with defaults.
	now := time.Now().Unix()
	if req.CategoryIDs != nil || req.TagNames != nil {
		categoryIDs := relationshipCategoryIDs(id)
		tagNames := relationshipTagNames(id)
		if req.CategoryIDs != nil {
			categoryIDs = *req.CategoryIDs
		}
		if req.TagNames != nil {
			tagNames = *req.TagNames
		}
		syncRelationships(id, categoryIDs, tagNames, now)
	}
	if req.Footprints != nil {
		if err := model.SyncPostFootprints(id, normalizeFootprintPayloads(*req.Footprints)); err != nil {
			util.Error(c, 500, "FOOTPRINT_ERROR", err.Error())
			return
		}
	}

	// Update embedding and AI questions if published
	if existing.Status == "publish" {
		// 草稿 → 发布时 UpdatePost 会创建正式文章 ID，并删除原草稿 ID。
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
		util.Error(c, 500, "DELETE_ERROR", err.Error())
		return
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
		if catID > 0 {
			return catID
		}
	}
	// Fallback: first category by ID
	config.DB.Get(&catID, "SELECT id FROM "+t("metas")+" WHERE type = 'category' ORDER BY id LIMIT 1")
	if catID > 0 {
		return catID
	}
	// No categories exist: create "日常"
	config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (name, slug, type, count, created_at, updated_at) VALUES ('日常','life','category',0,$1,$2) RETURNING id",
		t("metas")), time.Now().Unix(), time.Now().Unix()).Scan(&catID)
	return catID
}

func relationshipCategoryIDs(postID int) []int {
	categories := model.PostCategories(postID)
	ids := make([]int, 0, len(categories))
	for _, cat := range categories {
		ids = append(ids, cat.ID)
	}
	return ids
}

func relationshipTagNames(postID int) []string {
	tags := model.PostTags(postID)
	names := make([]string, 0, len(tags))
	for _, tag := range tags {
		names = append(names, tag.Name)
	}
	return names
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
		if name == "" {
			continue
		}
		slug := name
		var tagID int
		err := config.DB.Get(&tagID, "SELECT id FROM "+t("metas")+" WHERE LOWER(slug) = LOWER($1) AND type = 'tag' ORDER BY count DESC, id ASC LIMIT 1", slug)
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

func firstMarkdownH1Title(content string) (string, string) {
	lines := strings.Split(content, "\n")
	inFence := false
	for i, line := range lines {
		trimmed := strings.TrimLeft(line, " \t")
		if strings.HasPrefix(trimmed, "```") || strings.HasPrefix(trimmed, "~~~") {
			inFence = !inFence
			continue
		}
		if inFence {
			continue
		}
		if !strings.HasPrefix(trimmed, "# ") && !strings.HasPrefix(trimmed, "#\t") {
			continue
		}
		title := strings.TrimSpace(trimmed[1:])
		title = strings.Trim(title, "# \t")
		if title == "" {
			continue
		}
		bodyLines := append([]string{}, lines[:i]...)
		bodyLines = append(bodyLines, lines[i+1:]...)
		body := strings.TrimSpace(strings.Join(bodyLines, "\n"))
		return title, body
	}
	return "", content
}

// extractExcerpt generates a plain text excerpt from markdown content
func extractExcerpt(content string, maxLen int) string {
	text := content
	// Remove fenced code blocks
	for {
		start := strings.Index(text, "```")
		if start == -1 {
			break
		}
		end := strings.Index(text[start+3:], "```")
		if end == -1 {
			text = text[:start]
			break
		}
		text = text[:start] + text[start+3+end+3:]
	}
	text = strings.NewReplacer("**", "", "*", "", "~~", "", "`", "").Replace(text)
	// Remove markdown images
	for strings.Contains(text, "![") {
		s := strings.Index(text, "![")
		e := strings.Index(text[s:], ")")
		if e == -1 {
			break
		}
		text = text[:s] + text[s+e+1:]
	}
	// Remove headers, blockquotes, horizontal rules
	lines := strings.Split(text, "\n")
	var clean []string
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l == "" || strings.HasPrefix(l, "#") || strings.HasPrefix(l, "---") || strings.HasPrefix(l, ">") {
			continue
		}
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

// countWords keeps the old handler-local name while delegating to the shared
// article counter used by rebuild/admin stats.
func countWords(content string) int {
	return textutil.ContentWordCount(content)
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
	if siteTitle == "" {
		siteTitle = "Utterlog!"
	}

	for _, f := range followers {
		if f.SourceSite == "" {
			continue
		}
		// Send webhook to follower's site
		payload, _ := json.Marshal(map[string]interface{}{
			"type":         "new_content",
			"site":         config.C.AppURL,
			"name":         siteTitle,
			"title":        title,
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
		if req.ContentType == "moment" {
			typeName = "说说"
		}
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
		if parsed, err := siteclock.ParseDate(siteSince); err == nil {
			sinceTime = parsed.Unix()
		}
	}
	if sinceTime == 0 {
		config.DB.Get(&sinceTime, "SELECT COALESCE(EXTRACT(EPOCH FROM MIN(COALESCE(published_at, TO_TIMESTAMP(created_at))))::bigint, 0) FROM "+t("posts")+" WHERE status = 'publish' AND type = 'post'")
	}
	days := 0
	if sinceTime > 0 {
		days = int((siteclock.Now().Unix()-sinceTime)/86400) + 1
	}

	// Daily post counts for heatmap (last 365 days)
	type dayCount struct {
		Date  string `db:"date" json:"date"`
		Count int    `db:"count" json:"count"`
	}
	var heatmap []dayCount
	tzName := siteclock.Name()
	cutoff := siteclock.Now().Add(-365 * 24 * time.Hour).Unix()
	config.DB.Select(&heatmap, fmt.Sprintf(
		"SELECT TO_CHAR(COALESCE(published_at, TO_TIMESTAMP(created_at)) AT TIME ZONE $1, 'YYYY-MM-DD') as date, COUNT(*) as count FROM %s WHERE status = 'publish' AND type = 'post' AND COALESCE(published_at, TO_TIMESTAMP(created_at)) > TO_TIMESTAMP($2) GROUP BY date ORDER BY date",
		t("posts")), tzName, cutoff)
	if heatmap == nil {
		heatmap = []dayCount{}
	}

	// 永久 PV 真相源。v2.2.0 改用 ul_stats_global 单行读，O(1)。
	// 此前是 COUNT(*) FROM ul_access_logs，access_logs 30 天 prune 一批
	// 数字会缓慢「变小」。现在 ul_stats_global.total_views 由 logAccess
	// 事务化每次访问 +1，永不减少。
	var totalViews int64
	config.DB.Get(&totalViews, fmt.Sprintf("SELECT total_views FROM %s WHERE id = 1", t("stats_global")))

	util.Success(c, gin.H{
		"post_count":    postCount,
		"comment_count": commentCount,
		"word_count":    totalWords,
		"days":          days,
		"total_views":   totalViews,
		"heatmap":       heatmap,
	})
}

func splitNavigationKeywords(input string) []string {
	seen := map[string]bool{}
	terms := []string{}
	for _, term := range strings.FieldsFunc(input, func(r rune) bool {
		return r == ',' || r == '，' || r == ';' || r == '；' || r == '、' || r == '\n' || r == '\t' || r == ' '
	}) {
		term = strings.TrimSpace(term)
		if term == "" {
			continue
		}
		key := strings.ToLower(term)
		if seen[key] {
			continue
		}
		seen[key] = true
		terms = append(terms, term)
		if len(terms) >= 12 {
			break
		}
	}
	return terms
}

// PostNavigation returns prev/next post and related/random/popular/category posts
func PostNavigation(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	t := config.T

	// Current post info (for category matching)
	var publishAt int64
	var categoryIDs []int
	config.DB.Get(&publishAt, "SELECT EXTRACT(EPOCH FROM COALESCE(published_at, TO_TIMESTAMP(created_at)))::bigint FROM "+t("posts")+" WHERE id = $1", id)
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
		ID           int               `db:"id" json:"id"`
		Title        string            `db:"title" json:"title"`
		Slug         string            `db:"slug" json:"slug"`
		CoverURL     *string           `db:"cover_url" json:"cover_url"`
		CreatedAt    int64             `db:"created_at" json:"created_at"`
		PublishedAt  *time.Time        `db:"published_at" json:"published_at,omitempty"`
		ViewCount    int               `db:"view_count" json:"view_count"`
		CommentCount int               `db:"comment_count" json:"comment_count"`
		Categories   []model.MetaBrief `db:"-" json:"categories"`
	}

	cols := "id, title, slug, cover_url, created_at, published_at, view_count, comment_count"
	pCols := "p.id, p.title, p.slug, p.cover_url, p.created_at, p.published_at, p.view_count, p.comment_count"

	// Prev post (older)
	var prev *navPost
	var p navPost
	err := config.DB.Get(&p, fmt.Sprintf(
		"SELECT %s FROM %s WHERE status = 'publish' AND type = 'post' AND EXTRACT(EPOCH FROM COALESCE(published_at, TO_TIMESTAMP(created_at))) < $1 ORDER BY COALESCE(published_at, TO_TIMESTAMP(created_at)) DESC, id DESC LIMIT 1",
		cols, t("posts")), publishAt)
	if err == nil {
		prev = &p
	}

	// Next post (newer)
	var next *navPost
	var n navPost
	err = config.DB.Get(&n, fmt.Sprintf(
		"SELECT %s FROM %s WHERE status = 'publish' AND type = 'post' AND EXTRACT(EPOCH FROM COALESCE(published_at, TO_TIMESTAMP(created_at))) > $1 ORDER BY COALESCE(published_at, TO_TIMESTAMP(created_at)) ASC, id ASC LIMIT 1",
		cols, t("posts")), publishAt)
	if err == nil {
		next = &n
	}

	// Related posts: keyword/tag matches plus category matches. Tags are
	// treated as stronger keyword signals, categories as a weaker topic
	// signal. The category tab below stays a pure same-category list.
	var related []navPost
	// Get all tag IDs for current post
	var tagIDs []int
	config.DB.Select(&tagIDs, fmt.Sprintf(
		"SELECT r.meta_id FROM %s r JOIN %s m ON r.meta_id = m.id WHERE r.post_id = $1 AND m.type = 'tag'",
		t("relationships"), t("metas")), id)

	tagIDStr := ""
	for _, tid := range tagIDs {
		if tagIDStr != "" {
			tagIDStr += ","
		}
		tagIDStr += strconv.Itoa(tid)
	}
	catIDStr := ""
	for _, cid := range categoryIDs {
		if catIDStr != "" {
			catIDStr += ","
		}
		catIDStr += strconv.Itoa(cid)
	}

	if tagIDStr != "" {
		categoryJoin := ""
		categoryScore := "0"
		if catIDStr != "" {
			categoryJoin = fmt.Sprintf(" LEFT JOIN %s cr ON cr.post_id = p.id AND cr.meta_id IN (%s)", t("relationships"), catIDStr)
			categoryScore = "COUNT(DISTINCT cr.meta_id)"
		}
		config.DB.Select(&related, fmt.Sprintf(
			"SELECT %s FROM %s p JOIN %s tr ON p.id = tr.post_id%s WHERE tr.meta_id IN (%s) AND p.id != $1 AND p.status = 'publish' AND p.type = 'post' GROUP BY p.id, p.title, p.slug, p.cover_url, p.created_at, p.published_at, p.view_count, p.comment_count ORDER BY (COUNT(DISTINCT tr.meta_id) * 5 + %s) DESC, p.view_count DESC, COALESCE(p.published_at, TO_TIMESTAMP(p.created_at)) DESC LIMIT 20",
			pCols, t("posts"), t("relationships"), categoryJoin, tagIDStr, categoryScore), id)
	}

	// Fallback: use explicit keyword text from the post and its metas.
	if len(related) < 20 {
		excludeIDs := strconv.Itoa(id)
		for _, r := range related {
			excludeIDs += "," + strconv.Itoa(r.ID)
		}
		var keywordText string
		config.DB.Get(&keywordText, fmt.Sprintf(
			"SELECT TRIM(CONCAT_WS(' ', COALESCE(p.seo_keywords, ''), COALESCE(string_agg(DISTINCT m.name, ' '), ''), COALESCE(string_agg(DISTINCT m.seo_keywords, ' '), ''))) FROM %s p LEFT JOIN %s r ON r.post_id = p.id LEFT JOIN %s m ON m.id = r.meta_id AND m.type IN ('tag', 'category') WHERE p.id = $1 GROUP BY p.seo_keywords",
			t("posts"), t("relationships"), t("metas")), id)
		keywordTerms := splitNavigationKeywords(keywordText)
		if len(keywordTerms) > 0 {
			categoryJoin := ""
			categoryOrder := "p.view_count"
			if catIDStr != "" {
				categoryJoin = fmt.Sprintf(" LEFT JOIN %s cr ON cr.post_id = p.id AND cr.meta_id IN (%s)", t("relationships"), catIDStr)
				categoryOrder = "COUNT(DISTINCT cr.meta_id)"
			}
			whereParts := make([]string, 0, len(keywordTerms))
			scoreParts := make([]string, 0, len(keywordTerms))
			args := make([]interface{}, 0, len(keywordTerms))
			for i, term := range keywordTerms {
				param := i + 1
				args = append(args, "%"+term+"%")
				whereParts = append(whereParts, fmt.Sprintf("(p.title ILIKE $%d OR COALESCE(p.content, '') ILIKE $%d OR COALESCE(p.seo_keywords, '') ILIKE $%d)", param, param, param))
				scoreParts = append(scoreParts, fmt.Sprintf("(CASE WHEN p.title ILIKE $%d THEN 3 ELSE 0 END + CASE WHEN COALESCE(p.seo_keywords, '') ILIKE $%d THEN 2 ELSE 0 END + CASE WHEN COALESCE(p.content, '') ILIKE $%d THEN 1 ELSE 0 END)", param, param, param))
			}
			var ftsRelated []navPost
			// Keep the fill capped at the same 20-item budget used by
			// relationship-based suggestions.
			config.DB.Select(&ftsRelated, fmt.Sprintf(
				"SELECT %s FROM %s p%s WHERE p.status = 'publish' AND p.type = 'post' AND p.id NOT IN (%s) AND (%s) GROUP BY p.id, p.title, p.slug, p.cover_url, p.created_at, p.published_at, p.view_count, p.comment_count ORDER BY (%s) DESC, %s DESC, p.view_count DESC, COALESCE(p.published_at, TO_TIMESTAMP(p.created_at)) DESC LIMIT %d",
				pCols, t("posts"), categoryJoin, excludeIDs, strings.Join(whereParts, " OR "), strings.Join(scoreParts, " + "), categoryOrder, 20-len(related)), args...)
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
			"SELECT %s FROM %s p JOIN %s r ON p.id = r.post_id WHERE r.meta_id = $1 AND p.id != $2 AND p.status = 'publish' AND p.type = 'post' ORDER BY COALESCE(p.published_at, TO_TIMESTAMP(p.created_at)) DESC LIMIT 20",
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
	if prev != nil {
		prev.Categories = model.PostCategories(prev.ID)
	}
	if next != nil {
		next.Categories = model.PostCategories(next.ID)
	}

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
	// 取随机 5 条（按用户需求），每次请求 navigation 接口都会换一批；
	// 前端「换一批」按钮在 feeds tab 时也会调一次以拿新的随机集合。
	config.DB.Select(&feedItems, fmt.Sprintf(
		"SELECT fi.title, fi.link, rs.site_name, rs.site_url, fi.pub_date FROM %s fi JOIN %s rs ON fi.subscription_id = rs.id ORDER BY RANDOM() LIMIT 5",
		t("feed_items"), t("rss_subscriptions")))
	if feedItems == nil {
		feedItems = []feedItem{}
	}

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
	currentVersion := "2.0.2"

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
