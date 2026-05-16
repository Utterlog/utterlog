// SEO endpoints — /robots.txt, /llms.txt, /llms-full.txt.
//
// Driven by these admin options (Settings.tsx → SEO 与 AI tab):
//   ai_crawl_allowed   bool — Allow / Disallow GPTBot / ClaudeBot / CCBot /
//                              PerplexityBot / Google-Extended in robots.txt
//   llms_txt_enabled   bool — emit /llms.txt index (markdown, llmstxt.org)
//   llms_full_enabled  bool — also emit /llms-full.txt with post bodies
//
// Output is plain text; we set short-lived caching (1 hour) so option
// changes propagate quickly without hammering the DB.
package handler

import (
	"fmt"
	"strings"
	"time"

	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/siteclock"

	"github.com/gin-gonic/gin"
)

// User-agents whose access to the site is gated by `ai_crawl_allowed`.
// Listed explicitly because most respect their own bot tokens — a blanket
// `User-agent: *` Disallow would also nuke search engine indexing.
var aiBots = []string{
	"GPTBot",
	"OAI-SearchBot",
	"ChatGPT-User",
	"ClaudeBot",
	"Claude-Web",
	"anthropic-ai",
	"CCBot",
	"PerplexityBot",
	"Perplexity-User",
	"Google-Extended",
	"Bytespider",
	"FacebookBot",
	"Meta-ExternalAgent",
	"Applebot-Extended",
	"DuckAssistBot",
	"Diffbot",
}

// RobotsTxt serves /robots.txt.
//
// Always emits a permissive default for `*` (general indexing should
// stay open) plus a sitemap link. The AI bot list is appended with
// either Allow: / or Disallow: / based on the admin toggle.
func RobotsTxt(c *gin.Context) {
	siteURL := config.PublicBaseURL()
	allow := model.GetOption("ai_crawl_allowed") != "false"

	var b strings.Builder
	fmt.Fprintln(&b, "User-agent: *")
	fmt.Fprintln(&b, "Allow: /")
	fmt.Fprintln(&b, "Disallow: /admin/")
	fmt.Fprintln(&b, "Disallow: /api/")
	fmt.Fprintln(&b)

	verb := "Allow"
	if !allow {
		verb = "Disallow"
	}
	for _, ua := range aiBots {
		fmt.Fprintf(&b, "User-agent: %s\n", ua)
		fmt.Fprintf(&b, "%s: /\n\n", verb)
	}

	if siteURL != "" {
		fmt.Fprintf(&b, "Sitemap: %s/sitemap.xml\n", strings.TrimRight(siteURL, "/"))
		if model.GetOption("llms_txt_enabled") != "false" {
			fmt.Fprintf(&b, "# llms.txt available at %s/llms.txt\n", strings.TrimRight(siteURL, "/"))
		}
	}

	c.Header("Cache-Control", "public, max-age=3600")
	c.Data(200, "text/plain; charset=utf-8", []byte(b.String()))
}

// SitemapXML serves /sitemap.xml — XML sitemap per sitemaps.org/protocol.
//
// Includes:
//   - Static index pages (home, about, archives, films, moments, ...)
//   - Every published post (permalink follows admin permalink_structure
//     so the URL matches what the frontend renders)
//   - Every published video at /films/<slug>
//   - Every category and tag
//
// <lastmod> is W3C datetime in site_timezone (RFC3339 with offset) so the
// dates line up with what visitors see on the post page.
//
// Cache 1h — sitemap doesn't have to be live; search engine crawl
// frequency is way slower than that.
func SitemapXML(c *gin.Context) {
	siteURL := strings.TrimRight(config.PublicBaseURL(), "/")
	if siteURL == "" {
		c.String(200, `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"/>`)
		return
	}
	permalinkTpl := model.GetOption("permalink_structure")
	loc := siteclock.Location()

	type sitemapRow struct {
		URL     string
		LastMod string
		Change  string
		Prio    string
	}
	var urls []sitemapRow

	now := time.Now().In(loc).Format(time.RFC3339)
	urls = append(urls, sitemapRow{URL: siteURL + "/", LastMod: now, Change: "daily", Prio: "1.0"})

	// 静态索引页 —— 跟前端 web/app/(blog) 下目录对齐。功能未启用时这些
	// 路径会返回内容为空但 200，对 SEO 影响微小，索引开销也低，统一列出。
	for _, path := range []string{
		"/about", "/archives", "/films", "/moments", "/footprints",
		"/coding", "/links", "/albums", "/music", "/books", "/games",
		"/movies", "/goods", "/feeds",
	} {
		urls = append(urls, sitemapRow{URL: siteURL + path, LastMod: now, Change: "weekly", Prio: "0.6"})
	}

	// Posts + Videos —— 取 published 状态的全量，按 published_at 倒序。
	var posts []struct {
		ID          int        `db:"id"`
		Slug        string     `db:"slug"`
		DisplayID   int        `db:"display_id"`
		Type        string     `db:"type"`
		CreatedAt   int64      `db:"created_at"`
		UpdatedAt   int64      `db:"updated_at"`
		PublishedAt *time.Time `db:"published_at"`
	}
	_ = config.DB.Select(&posts, fmt.Sprintf(
		`SELECT id, slug, display_id, type, created_at, updated_at, published_at FROM %s WHERE status='publish' ORDER BY COALESCE(published_at, TO_TIMESTAMP(created_at)) DESC LIMIT 5000`,
		config.T("posts"),
	))
	for _, p := range posts {
		var ts time.Time
		switch {
		case p.UpdatedAt > 0:
			ts = time.Unix(p.UpdatedAt, 0)
		case p.PublishedAt != nil:
			ts = *p.PublishedAt
		default:
			ts = time.Unix(p.CreatedAt, 0)
		}
		var link string
		if p.Type == "video" {
			link = siteURL + "/films/" + p.Slug
		} else {
			// BuildPostPermalink expects model.Post; reconstruct minimally.
			pm := model.Post{ID: p.ID, Slug: p.Slug, DisplayID: p.DisplayID, CreatedAt: p.CreatedAt}
			link = siteURL + BuildPostPermalink(&pm, permalinkTpl)
		}
		urls = append(urls, sitemapRow{
			URL:     link,
			LastMod: ts.In(loc).Format(time.RFC3339),
			Change:  "monthly",
			Prio:    "0.8",
		})
	}

	// Categories + tags（ul_metas type 区分）。SEO 上 category 比 tag 重要，
	// 优先级稍高。lastmod 用 updated_at（meta 自身），不是其下文章的最新值。
	type metaRow struct {
		Slug      string `db:"slug"`
		Type      string `db:"type"`
		UpdatedAt int64  `db:"updated_at"`
		CreatedAt int64  `db:"created_at"`
	}
	var metas []metaRow
	_ = config.DB.Select(&metas, fmt.Sprintf(
		`SELECT slug, type, updated_at, created_at FROM %s WHERE type IN ('category','tag') AND COALESCE(slug,'') <> ''`,
		config.T("metas"),
	))
	for _, m := range metas {
		ts := m.UpdatedAt
		if ts == 0 {
			ts = m.CreatedAt
		}
		base := "/tags/"
		prio := "0.4"
		if m.Type == "category" {
			base = "/categories/"
			prio = "0.5"
		}
		lastmod := now
		if ts > 0 {
			lastmod = time.Unix(ts, 0).In(loc).Format(time.RFC3339)
		}
		urls = append(urls, sitemapRow{
			URL:     siteURL + base + m.Slug,
			LastMod: lastmod,
			Change:  "weekly",
			Prio:    prio,
		})
	}

	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8"?>` + "\n")
	b.WriteString(`<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">` + "\n")
	for _, u := range urls {
		fmt.Fprintf(&b, "  <url><loc>%s</loc><lastmod>%s</lastmod><changefreq>%s</changefreq><priority>%s</priority></url>\n",
			xmlEscape(u.URL), u.LastMod, u.Change, u.Prio)
	}
	b.WriteString(`</urlset>` + "\n")

	c.Header("Cache-Control", "public, max-age=3600")
	c.Data(200, "application/xml; charset=utf-8", []byte(b.String()))
}

// LlmsTxt serves /llms.txt — the structured index variant.
// Format follows llmstxt.org: H1 site title, blockquote tagline, then
// H2 sections with markdown link lists. AI tools fetch this once and
// learn the site shape without paginating through HTML.
func LlmsTxt(c *gin.Context) {
	if model.GetOption("llms_txt_enabled") == "false" {
		c.String(404, "llms.txt is disabled in this site's SEO settings")
		return
	}

	siteTitle := strings.TrimSpace(model.GetOption("site_title"))
	if siteTitle == "" {
		siteTitle = "Utterlog"
	}
	tagline := strings.TrimSpace(model.GetOption("seo_default_description"))
	if tagline == "" {
		tagline = strings.TrimSpace(model.GetOption("site_description"))
	}
	siteURL := strings.TrimRight(config.PublicBaseURL(), "/")

	posts := fetchPostsForLLMs(200)

	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n", siteTitle)
	if tagline != "" {
		fmt.Fprintf(&b, "> %s\n\n", oneLine(tagline))
	}
	if siteURL != "" {
		fmt.Fprintf(&b, "Site: %s\n\n", siteURL)
	}

	if len(posts) > 0 {
		fmt.Fprintln(&b, "## Posts")
		fmt.Fprintln(&b)
		for _, p := range posts {
			url := siteURL + "/posts/" + p.Slug
			summary := oneLine(firstNonEmpty(p.Excerpt, p.Title))
			if summary == p.Title {
				fmt.Fprintf(&b, "- [%s](%s)\n", p.Title, url)
			} else {
				fmt.Fprintf(&b, "- [%s](%s): %s\n", p.Title, url, summary)
			}
		}
	}

	c.Header("Cache-Control", "public, max-age=3600")
	c.Data(200, "text/markdown; charset=utf-8", []byte(b.String()))
}

// LlmsFullTxt serves /llms-full.txt — same index plus post bodies.
// Substantially heavier (every post's markdown content); only emit
// when the admin explicitly opts in.
func LlmsFullTxt(c *gin.Context) {
	if model.GetOption("llms_full_enabled") != "true" {
		c.String(404, "llms-full.txt is disabled in this site's SEO settings")
		return
	}

	siteTitle := strings.TrimSpace(model.GetOption("site_title"))
	if siteTitle == "" {
		siteTitle = "Utterlog"
	}
	tagline := strings.TrimSpace(model.GetOption("seo_default_description"))
	if tagline == "" {
		tagline = strings.TrimSpace(model.GetOption("site_description"))
	}
	siteURL := strings.TrimRight(config.PublicBaseURL(), "/")

	posts := fetchPostsForLLMs(500)

	var b strings.Builder
	fmt.Fprintf(&b, "# %s\n\n", siteTitle)
	if tagline != "" {
		fmt.Fprintf(&b, "> %s\n\n", oneLine(tagline))
	}
	if siteURL != "" {
		fmt.Fprintf(&b, "Site: %s\n", siteURL)
		fmt.Fprintf(&b, "Generated: %s\n\n", time.Now().In(siteclock.Location()).Format(time.RFC3339))
	}

	for _, p := range posts {
		url := siteURL + "/posts/" + p.Slug
		fmt.Fprintf(&b, "## %s\n", p.Title)
		fmt.Fprintf(&b, "URL: %s\n\n", url)
		if p.Content != "" {
			fmt.Fprintln(&b, p.Content)
			fmt.Fprintln(&b)
		}
		fmt.Fprintln(&b, "---")
		fmt.Fprintln(&b)
	}

	c.Header("Cache-Control", "public, max-age=3600")
	c.Data(200, "text/markdown; charset=utf-8", []byte(b.String()))
}

// ─────────────────────────────────────────────────────────────────────

type llmsPost struct {
	Slug    string `db:"slug"`
	Title   string `db:"title"`
	Excerpt string `db:"excerpt"`
	Content string `db:"content"`
}

func fetchPostsForLLMs(limit int) []llmsPost {
	if config.DB == nil {
		return nil
	}
	rows := []llmsPost{}
	q := `
		SELECT slug, title, COALESCE(excerpt,'') AS excerpt, COALESCE(content,'') AS content
		FROM ` + config.T("posts") + `
		WHERE status = 'publish'
		ORDER BY created_at DESC
		LIMIT $1
	`
	_ = config.DB.Select(&rows, q, limit)
	return rows
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if strings.TrimSpace(v) != "" {
			return v
		}
	}
	return ""
}

// oneLine collapses whitespace + truncates so a markdown link's tail
// stays on a single line. Critical for `- [title](url): summary`
// entries — newlines inside a list item break llmstxt.org parsers.
func oneLine(s string) string {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, "\r\n", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	for strings.Contains(s, "  ") {
		s = strings.ReplaceAll(s, "  ", " ")
	}
	if len([]rune(s)) > 240 {
		r := []rune(s)
		s = string(r[:240]) + "…"
	}
	return s
}
