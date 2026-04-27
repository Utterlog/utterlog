package handler

import (
	"fmt"
	"net/url"
	"strings"
	"time"

	"utterlog-go/internal/model"
)

// BuildPostPermalink renders a post's URL path according to admin's
// permalink_structure option. Mirrors web/lib/permalink.ts:buildPermalink
// so RSS feeds, email notifications, and any other server-side URL
// emission stay in sync with what visitors actually see in the browser.
//
// Returned value is just the path (e.g. "/archives/19", "/posts/foo"),
// not absolute. Callers that need an absolute URL prepend their own
// site_url / PublicBaseURL().
//
// Tokens supported (must match the frontend list):
//
//	%postname%   — post slug (URL-encoded)
//	%post_id%    — db primary key (raw, can have gaps from drafts/rollbacks)
//	%display_id% — sequential publication-order number (1, 2, 3, ...)
//	               assigned on first publish, never gaps. Use this when
//	               you want clean /archives/29 URLs.
//	%year%       — 4-digit year of published_at, or created_at fallback
//	%month%      — 2-digit month of published_at, or created_at fallback
//	%day%        — 2-digit day of published_at, or created_at fallback
//	%category%   — first category slug (URL-encoded). Lazy: only
//	               fetched from DB when the template actually uses it.
//
// Empty or whitespace template falls back to "/posts/%postname%" so
// fresh installs that haven't visited Settings → 固定链接 still get
// sensible URLs.
func BuildPostPermalink(post *model.Post, template string) string {
	tpl := strings.TrimSpace(template)
	if tpl == "" {
		tpl = "/posts/%postname%"
	}

	// Date tokens must mirror web/lib/permalink.ts: published_at wins,
	// created_at is the fallback for old rows.
	var y, m, d string
	var dt time.Time
	if post.PublishedAt != nil && !post.PublishedAt.IsZero() {
		dt = post.PublishedAt.Local()
	} else if post.CreatedAt > 0 {
		dt = time.Unix(post.CreatedAt, 0).Local()
	}
	if !dt.IsZero() {
		t := dt
		y = fmt.Sprintf("%04d", t.Year())
		m = fmt.Sprintf("%02d", int(t.Month()))
		d = fmt.Sprintf("%02d", t.Day())
	}

	out := tpl
	out = strings.ReplaceAll(out, "%postname%", url.PathEscape(post.Slug))
	out = strings.ReplaceAll(out, "%post_id%", fmt.Sprintf("%d", post.ID))
	out = strings.ReplaceAll(out, "%display_id%", fmt.Sprintf("%d", post.DisplayID))
	out = strings.ReplaceAll(out, "%year%", y)
	out = strings.ReplaceAll(out, "%month%", m)
	out = strings.ReplaceAll(out, "%day%", d)

	// Category lazy lookup — skip the PostCategories DB roundtrip
	// unless the template actually contains %category%. Saves N+1
	// queries on RSS feed for the common /posts/%postname% case.
	if strings.Contains(out, "%category%") {
		cat := "uncategorized"
		if cs := model.PostCategories(post.ID); len(cs) > 0 && cs[0].Slug != "" {
			cat = cs[0].Slug
		}
		out = strings.ReplaceAll(out, "%category%", url.PathEscape(cat))
	}

	return out
}
