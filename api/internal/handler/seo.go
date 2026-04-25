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
		fmt.Fprintf(&b, "Generated: %s\n\n", time.Now().UTC().Format(time.RFC3339))
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
