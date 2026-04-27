package handler

import (
	"encoding/xml"
	"fmt"
	"io"
	"net/url"
	"sort"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	htmltomarkdown "github.com/JohannesKaufmann/html-to-markdown/v2"
	"github.com/gin-gonic/gin"
)

// WXR XML structures
type wxrRSS struct {
	XMLName xml.Name   `xml:"rss"`
	Channel wxrChannel `xml:"channel"`
}

type wxrChannel struct {
	Categories []wxrCategory `xml:"category"`
	Tags       []wxrTag      `xml:"tag"`
	Items      []wxrItem     `xml:"item"`
}

type wxrCategory struct {
	TermID      int    `xml:"term_id"`
	Nicename    string `xml:"category_nicename"`
	Parent      string `xml:"category_parent"`
	Name        string `xml:"cat_name"`
	Description string `xml:"category_description"`
}

type wxrTag struct {
	TermID int    `xml:"term_id"`
	Slug   string `xml:"tag_slug"`
	Name   string `xml:"tag_name"`
}

type wxrItem struct {
	Title         string            `xml:"title"`
	Content       string            `xml:"encoded"`
	Excerpt       string            `xml:"excerpt>encoded"`
	PostID        int               `xml:"post_id"`
	PostDate      string            `xml:"post_date"`
	PostDateGMT   string            `xml:"post_date_gmt"`
	PostName      string            `xml:"post_name"`
	Status        string            `xml:"status"`
	PostType      string            `xml:"post_type"`
	PostPassword  string            `xml:"post_password"`
	IsSticky      int               `xml:"is_sticky"`
	CommentStatus string            `xml:"comment_status"`
	Categories    []wxrItemCategory `xml:"category"`
	PostMetas     []wxrPostMeta     `xml:"postmeta"`
	Comments      []wxrComment      `xml:"comment"`
}

type wxrItemCategory struct {
	Domain   string `xml:"domain,attr"`
	Nicename string `xml:"nicename,attr"`
	Name     string `xml:",chardata"`
}

type wxrPostMeta struct {
	Key   string `xml:"meta_key"`
	Value string `xml:"meta_value"`
}

type wxrComment struct {
	ID          int              `xml:"comment_id"`
	Author      string           `xml:"comment_author"`
	AuthorEmail string           `xml:"comment_author_email"`
	AuthorURL   string           `xml:"comment_author_url"`
	AuthorIP    string           `xml:"comment_author_IP"`
	Date        string           `xml:"comment_date"`
	DateGMT     string           `xml:"comment_date_gmt"`
	Content     string           `xml:"comment_content"`
	Approved    string           `xml:"comment_approved"`
	Type        string           `xml:"comment_type"`
	Parent      int              `xml:"comment_parent"`
	UserID      int              `xml:"comment_user_id"`
	Metas       []wxrCommentMeta `xml:"commentmeta"`
}

type wxrCommentMeta struct {
	Key   string `xml:"meta_key"`
	Value string `xml:"meta_value"`
}

func ImportWordPressHandler(c *gin.Context) {
	file, _, err := c.Request.FormFile("file")
	if err != nil {
		util.BadRequest(c, "请上传 XML 文件")
		return
	}
	defer file.Close()

	data, err := io.ReadAll(file)
	if err != nil {
		util.Error(c, 500, "READ_ERROR", "读取文件失败")
		return
	}

	// Fix namespace issue: xml decoder needs custom handling for WP namespaces
	// Replace namespace prefixed tags with underscore versions
	content := string(data)
	content = strings.ReplaceAll(content, "content:encoded", "encoded")
	content = strings.ReplaceAll(content, "excerpt:encoded", "excerpt_encoded")
	content = strings.ReplaceAll(content, "dc:creator", "dc_creator")
	content = strings.ReplaceAll(content, "wp:", "wp_")
	content = strings.ReplaceAll(content, "wfw:", "wfw_")

	// Re-map struct tags after namespace removal
	type item struct {
		Title         string            `xml:"title"`
		Content       string            `xml:"encoded"`
		Excerpt       string            `xml:"excerpt_encoded"`
		PostID        int               `xml:"wp_post_id"`
		PostDate      string            `xml:"wp_post_date"`
		PostDateGMT   string            `xml:"wp_post_date_gmt"`
		PostName      string            `xml:"wp_post_name"`
		Status        string            `xml:"wp_status"`
		PostType      string            `xml:"wp_post_type"`
		PostPassword  string            `xml:"wp_post_password"`
		IsSticky      int               `xml:"wp_is_sticky"`
		CommentStatus string            `xml:"wp_comment_status"`
		Categories    []wxrItemCategory `xml:"category"`
		PostMetas     []struct {
			Key   string `xml:"wp_meta_key"`
			Value string `xml:"wp_meta_value"`
		} `xml:"wp_postmeta"`
		Comments []struct {
			ID          int    `xml:"wp_comment_id"`
			Author      string `xml:"wp_comment_author"`
			AuthorEmail string `xml:"wp_comment_author_email"`
			AuthorURL   string `xml:"wp_comment_author_url"`
			AuthorIP    string `xml:"wp_comment_author_IP"`
			Date        string `xml:"wp_comment_date"`
			DateGMT     string `xml:"wp_comment_date_gmt"`
			Content     string `xml:"wp_comment_content"`
			Approved    string `xml:"wp_comment_approved"`
			Type        string `xml:"wp_comment_type"`
			Parent      int    `xml:"wp_comment_parent"`
			UserID      int    `xml:"wp_comment_user_id"`
			Metas       []struct {
				Key   string `xml:"wp_meta_key"`
				Value string `xml:"wp_meta_value"`
			} `xml:"wp_commentmeta"`
		} `xml:"wp_comment"`
	}

	type category struct {
		TermID      int    `xml:"wp_term_id"`
		Nicename    string `xml:"wp_category_nicename"`
		Parent      string `xml:"wp_category_parent"`
		Name        string `xml:"wp_cat_name"`
		Description string `xml:"wp_category_description"`
	}

	type tag struct {
		TermID int    `xml:"wp_term_id"`
		Slug   string `xml:"wp_tag_slug"`
		Name   string `xml:"wp_tag_name"`
	}

	type channel struct {
		Categories []category `xml:"wp_category"`
		Tags       []tag      `xml:"wp_tag"`
		Items      []item     `xml:"item"`
	}

	type rss struct {
		XMLName xml.Name `xml:"rss"`
		Channel channel  `xml:"channel"`
	}

	var wxr rss
	if err := xml.Unmarshal([]byte(content), &wxr); err != nil {
		util.Error(c, 400, "PARSE_ERROR", fmt.Sprintf("XML 解析失败: %v", err))
		return
	}

	ch := wxr.Channel

	// Truncate tables and reset sequences
	tables := []string{"posts", "metas", "relationships", "comments", "post_meta"}
	tableNames := make([]string, len(tables))
	for i, t := range tables {
		tableNames[i] = config.T(t)
	}
	truncateSQL := fmt.Sprintf("TRUNCATE %s RESTART IDENTITY CASCADE", strings.Join(tableNames, ", "))
	if _, err := config.DB.Exec(truncateSQL); err != nil {
		util.Error(c, 500, "DB_ERROR", fmt.Sprintf("清空数据表失败: %v", err))
		return
	}

	now := time.Now().Unix()

	// 1. Import categories
	catSlugToID := map[string]int{}
	catCount := 0
	for _, cat := range ch.Categories {
		slug := decodeSlug(cat.Nicename)
		var id int
		err := config.DB.QueryRow(fmt.Sprintf(
			"INSERT INTO %s (name, slug, type, description, count, created_at, updated_at) VALUES ($1,$2,'category',$3,0,$4,$5) RETURNING id",
			config.T("metas")),
			cat.Name, slug, nilIfEmpty(cat.Description), now, now,
		).Scan(&id)
		if err != nil {
			continue
		}
		catSlugToID[cat.Nicename] = id
		catCount++
	}

	// 2. Import tags
	tagSlugToID := map[string]int{}
	tagCount := 0
	for _, t := range ch.Tags {
		slug := decodeSlug(t.Slug)
		var id int
		err := config.DB.QueryRow(fmt.Sprintf(
			"INSERT INTO %s (name, slug, type, count, created_at, updated_at) VALUES ($1,$2,'tag',0,$3,$4) RETURNING id",
			config.T("metas")),
			t.Name, slug, now, now,
		).Scan(&id)
		if err != nil {
			continue
		}
		tagSlugToID[t.Slug] = id
		tagCount++
	}

	// 3. Filter and sort posts by date (earliest first)
	var posts []item
	for _, it := range ch.Items {
		if it.PostType == "post" && it.Status != "trash" {
			posts = append(posts, it)
		}
	}
	sort.Slice(posts, func(i, j int) bool {
		return posts[i].PostDate < posts[j].PostDate
	})

	// 4. Import posts with sequential IDs
	wpIDToNewID := map[int]int{}
	postCount := 0
	commentCount := 0

	for _, p := range posts {
		// Parse dates
		createdAt := parseWPDate(p.PostDate)
		updatedAt := createdAt

		// Decode slug
		slug := decodeSlug(p.PostName)

		// Map status
		status := p.Status
		if status == "inherit" {
			status = "publish"
		}

		// Convert HTML content to Markdown
		contentMD := p.Content
		if contentMD != "" {
			if md, err := htmltomarkdown.ConvertString(contentMD); err == nil {
				contentMD = md
			}
		}

		// Get excerpt
		excerpt := strings.TrimSpace(p.Excerpt)

		// Get view count from meta
		viewCount := 0
		for _, m := range p.PostMetas {
			if m.Key == "post_views" {
				fmt.Sscanf(m.Value, "%d", &viewCount)
			}
		}

		// Allow comments
		allowComment := p.CommentStatus == "open"

		// Insert post — fill published_at too, not just created_at. The
		// admin post-edit page surfaces published_at as the "发布时间"
		// field and some themes display it on the inner page; leaving
		// it NULL produced jarring gaps in the UI for every WP-XML
		// imported post.
		publishedAtTS := time.Unix(createdAt, 0).UTC()
		newID, err := model.CreatePost(&model.Post{
			Title:        p.Title,
			Slug:         slug,
			Content:      nilIfEmpty(contentMD),
			Excerpt:      nilIfEmpty(excerpt),
			Type:         "post",
			Status:       status,
			AuthorID:     1,
			AllowComment: &allowComment,
			Pinned:       boolPtr(false),
			CreatedAt:    createdAt,
			UpdatedAt:    updatedAt,
			PublishedAt:  &publishedAtTS,
		})
		if err != nil {
			continue
		}
		config.DB.Exec("UPDATE "+config.T("posts")+" SET view_count = $1 WHERE id = $2", viewCount, newID)
		wpIDToNewID[p.PostID] = newID
		postCount++

		// 5. Create relationships (categories + tags)
		for _, cat := range p.Categories {
			var metaID int
			if cat.Domain == "category" {
				metaID = catSlugToID[cat.Nicename]
			} else if cat.Domain == "post_tag" {
				metaID = tagSlugToID[cat.Nicename]
			}
			if metaID > 0 {
				config.DB.Exec(fmt.Sprintf(
					"INSERT INTO %s (post_id, meta_id) VALUES ($1, $2) ON CONFLICT DO NOTHING",
					config.T("relationships")),
					newID, metaID)
				// Update count
				config.DB.Exec(fmt.Sprintf(
					"UPDATE %s SET count = count + 1 WHERE id = $1",
					config.T("metas")), metaID)
			}
		}

		// 6. Import comments
		wpCommentIDToNewID := map[int]int{}
		// Sort comments by ID to ensure parents are inserted first
		sort.Slice(p.Comments, func(i, j int) bool {
			return p.Comments[i].ID < p.Comments[j].ID
		})

		postCommentCount := 0
		for _, cm := range p.Comments {
			if cm.Approved != "1" {
				continue
			}

			commentCreatedAt := parseWPDate(cm.Date)
			status := "approved"

			var parentID *int
			if cm.Parent > 0 {
				if newParent, ok := wpCommentIDToNewID[cm.Parent]; ok {
					parentID = &newParent
				}
			}

			var commentURL *string
			if cm.AuthorURL != "" {
				commentURL = &cm.AuthorURL
			}
			var commentIP *string
			if cm.AuthorIP != "" {
				commentIP = &cm.AuthorIP
			}

			// Extract browser/OS from _comment_info PHP serialized data
			var commentAgent *string
			for _, meta := range cm.Metas {
				if meta.Key == "_comment_info" {
					agent := parsePHPCommentInfo(meta.Value)
					if agent != "" {
						commentAgent = &agent
					}
				}
			}

			var newCommentID int
			err := config.DB.QueryRow(fmt.Sprintf(
				"INSERT INTO %s (post_id, parent_id, author_name, author_email, author_url, author_ip, author_agent, content, status, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
				config.T("comments")),
				newID, parentID, cm.Author, cm.AuthorEmail, commentURL,
				commentIP, commentAgent, cm.Content, status, commentCreatedAt,
			).Scan(&newCommentID)
			if err != nil {
				continue
			}
			wpCommentIDToNewID[cm.ID] = newCommentID
			postCommentCount++
			commentCount++
		}

		// Update post comment_count
		if postCommentCount > 0 {
			config.DB.Exec(fmt.Sprintf(
				"UPDATE %s SET comment_count = $1 WHERE id = $2",
				config.T("posts")), postCommentCount, newID)
		}
	}

	util.Success(c, gin.H{
		"posts":      postCount,
		"categories": catCount,
		"tags":       tagCount,
		"comments":   commentCount,
	})
}

func parseWPDate(s string) int64 {
	// WordPress date format: 2024-10-01 03:03:03
	t, err := time.Parse("2006-01-02 15:04:05", s)
	if err != nil {
		return time.Now().Unix()
	}
	return t.Unix()
}

func decodeSlug(s string) string {
	decoded, err := url.QueryUnescape(s)
	if err != nil {
		return s
	}
	return decoded
}

func nilIfEmpty(s string) *string {
	if s == "" {
		return nil
	}
	return &s
}

func boolPtr(v bool) *bool {
	return &v
}

// Parse PHP serialized _comment_info to extract browser and OS
// Format: a:5:{s:7:"browser";s:4:"Edge";s:11:"browser_ver";s:9:"141.0.0.0";s:2:"os";s:5:"macOS";...}
func parsePHPCommentInfo(s string) string {
	extract := func(key string) string {
		needle := fmt.Sprintf(`"%s";s:`, key)
		idx := strings.Index(s, needle)
		if idx < 0 {
			return ""
		}
		rest := s[idx+len(needle):]
		// Parse s:N:"value"
		colonIdx := strings.Index(rest, ":")
		if colonIdx < 0 {
			return ""
		}
		rest = rest[colonIdx+1:]
		// Find opening quote
		qStart := strings.Index(rest, `"`)
		if qStart < 0 {
			return ""
		}
		rest = rest[qStart+1:]
		qEnd := strings.Index(rest, `"`)
		if qEnd < 0 {
			return ""
		}
		return rest[:qEnd]
	}

	browser := extract("browser")
	os := extract("os")

	parts := []string{}
	if os != "" {
		parts = append(parts, os)
	}
	if browser != "" {
		parts = append(parts, browser)
	}
	return strings.Join(parts, " / ")
}
