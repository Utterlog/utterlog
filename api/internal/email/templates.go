// Package email provides site-branded HTML email templates.
//
// Templates live in the tpl/ subdir and are embedded at compile time.
// Each template receives a TemplateData struct with site-level branding
// (SiteTitle, SiteLogo, SiteDomain, SiteURL) plus template-specific fields.
//
// Usage:
//   body, err := email.Render("new_comment", email.NewCommentData{
//     Site: email.LoadSiteData(),
//     PostTitle: post.Title,
//     ...
//   })
package email

import (
	"bytes"
	"embed"
	"fmt"
	"html/template"
	"net/url"
	"strings"

	"utterlog-go/config"
	"utterlog-go/internal/model"
)

//go:embed tpl/*.html tpl/_base.html
var tplFS embed.FS

var parsedTemplates *template.Template

func init() {
	funcs := template.FuncMap{
		"firstChar": firstChar,
	}
	parsed, err := template.New("email").Funcs(funcs).ParseFS(tplFS, "tpl/*.html")
	if err != nil {
		// Parse error at startup is a bug — don't mask it
		panic(fmt.Errorf("email templates parse: %w", err))
	}
	parsedTemplates = parsed
}

// SiteData holds branding info shared by every email template.
type SiteData struct {
	Title      string // site_title
	URL        string // site_url (no trailing slash)
	Domain     string // hostname only, e.g. "example.com"
	Logo       string // full URL to logo.* or empty
	FirstChar  string // first rune of title for logo fallback
	AdminURL   string // site_url + "/admin" (admin dashboard)
	MailFrom   string // no-reply@domain
	BrandColor string // always #0052D9
}

// LoadSiteData resolves site branding from DB options + app config.
func LoadSiteData() SiteData {
	title := strings.TrimSpace(model.GetOption("site_title"))
	if title == "" {
		title = "Utterlog"
	}
	siteURL := strings.TrimRight(strings.TrimSpace(model.GetOption("site_url")), "/")
	if siteURL == "" {
		siteURL = strings.TrimRight(config.C.AppURL, "/")
	}

	domain := extractDomain(siteURL)

	logo := strings.TrimSpace(model.GetOption("site_logo"))
	if logo != "" && !strings.HasPrefix(logo, "http") {
		logo = siteURL + logo
	}

	mailFrom := strings.TrimSpace(model.GetOption("email_from"))
	if mailFrom == "" && domain != "" {
		mailFrom = "no-reply@" + domain
	}

	return SiteData{
		Title:      title,
		URL:        siteURL,
		Domain:     domain,
		Logo:       logo,
		FirstChar:  firstChar(title),
		AdminURL:   siteURL + "/admin",
		MailFrom:   mailFrom,
		BrandColor: "#0052D9",
	}
}

// firstChar returns the first visible character of a string (for logo fallback).
func firstChar(s string) string {
	for _, r := range s {
		if r > 0 {
			return string(r)
		}
	}
	return "U"
}

func extractDomain(rawURL string) string {
	if rawURL == "" {
		return ""
	}
	u, err := url.Parse(rawURL)
	if err != nil || u.Host == "" {
		return strings.TrimPrefix(strings.TrimPrefix(rawURL, "https://"), "http://")
	}
	return u.Host
}

// Render a named template (e.g. "new_comment") with data.
//
// An empty result is treated as an error — silently sending a blank
// email wastes the recipient's attention and hides the real bug.
// Every template in tpl/ has static markup outside the {{define}}
// blocks, so a zero-length render means something went wrong in
// html/template's escape-context pass.
func Render(name string, data any) (string, error) {
	var buf bytes.Buffer
	tpl := parsedTemplates.Lookup(name + ".html")
	if tpl == nil {
		return "", fmt.Errorf("email template %q not found", name)
	}
	if err := tpl.Execute(&buf, data); err != nil {
		return "", fmt.Errorf("render %s: %w", name, err)
	}
	out := buf.String()
	if strings.TrimSpace(out) == "" {
		return "", fmt.Errorf("render %s: empty output (template produced no content)", name)
	}
	return out, nil
}

/* ========================================================================
   Template-specific data structs
   ======================================================================== */

type NewCommentData struct {
	Site            SiteData
	Author          string
	Email           string
	Content         string
	PostTitle       string
	PostURL         string
	PostedAt        string // "2 分钟前" or "2026-04-17 10:42"
	ManageCommentURL string
}

type PendingCommentData struct {
	Site         SiteData
	Author       string
	Email        string
	Content      string
	IP           string
	IPLocation   string
	PostTitle    string
	PostedAt     string
	ModerateURL  string
	ApproveURL   string // direct approve via signed link (optional)
}

type CommentReplyData struct {
	Site             SiteData
	RecipientName    string
	ReplierName      string
	PostTitle        string
	OriginalContent  string
	ReplyContent     string
	PostURL          string
	UnsubscribeURL   string
}

type UpgradeData struct {
	Site       SiteData
	Version    string
	Highlights []string
	ChangelogURL string
}

type IncidentData struct {
	Site         SiteData
	ErrorType    string
	Location     string
	Component    string
	OccurredAt   string
	Host         string
	Duration     string
	UserImpact   string
	LogsURL      string
	StatusURL    string
}

type LinkRequestData struct {
	Site          SiteData
	RequesterName string
	RequesterURL  string
	RequesterAvatar string
	Email         string
	Description   string
	RSSURL        string
	UtterlogID    string
	ApproveURL    string
	RejectURL     string
}

type VerifyCodeData struct {
	Site        SiteData
	Code        string
	ExpireMins  int // default 10
	Purpose     string // "登录" / "注册" / "修改密码" 等
	SupportURL  string
}

type PasswordResetData struct {
	Site       SiteData
	UserName   string
	ResetURL   string
	ExpireMins int // typically 60
}
