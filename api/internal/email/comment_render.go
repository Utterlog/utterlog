// Comment content rendering for emails.
//
// Plain comment text in the DB looks like:
//
//	"我同意，[:tieba_yes:] 这个想法不错"
//
// In the blog frontend the [:slug:] markers are turned into <img>
// elements via web/themes/*/CommentList.tsx + pack-bilibili.json.
// Emails went through {{.Content}} which html-escapes everything,
// so recipients used to see literal "[:tieba_yes:]" instead of an
// emoji image.
//
// This file gives email templates the same treatment: HTML-escape the
// raw comment first (so attacker-controlled text can't inject markup),
// then expand [:slug:] to <img> tags pointing at the site's
// /emoji/bilibili/<file> static path. The result is template.HTML so
// html/template doesn't escape it again.
package email

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"html"
	"html/template"
	"net/url"
	"regexp"
	"strings"
)

//go:embed bilibili-emoji.json
var bilibiliEmojiPackBytes []byte

var bilibiliEmojiSlugFile map[string]string

func init() {
	var pack struct {
		Emojis []struct {
			Slug string `json:"slug"`
			File string `json:"file"`
			Name string `json:"name"`
		} `json:"emojis"`
	}
	if err := json.Unmarshal(bilibiliEmojiPackBytes, &pack); err != nil {
		// Parse failure means our bundled JSON is corrupt — that's a
		// build-time bug we want loud, not a silent fallback.
		panic(fmt.Errorf("bilibili emoji pack parse: %w", err))
	}
	bilibiliEmojiSlugFile = make(map[string]string, len(pack.Emojis))
	for _, e := range pack.Emojis {
		if e.Slug != "" && e.File != "" {
			bilibiliEmojiSlugFile[e.Slug] = e.File
		}
	}
}

// Slugs in pack-bilibili.json are ascii (a-z, 0-9, _). Anchoring the
// character class keeps us from matching weird payloads that happen to
// contain colons.
var emojiSlugRE = regexp.MustCompile(`\[:([a-zA-Z0-9_]+):\]`)

// renderCommentContent escapes the raw comment text and expands
// [:slug:] markers into <img> tags hosted at siteURL/emoji/bilibili/.
//
// Registered as a template function so call sites just write
// {{renderCommentContent .Content .Site.URL}} — handler code stays
// uninvolved and Content stays a plain string in the data struct.
func renderCommentContent(content, siteURL string) template.HTML {
	siteURL = strings.TrimRight(strings.TrimSpace(siteURL), "/")
	// Note: html.EscapeString escapes < > & " ' but leaves [ ] : alone,
	// so the [:slug:] markers survive intact for the next pass.
	escaped := html.EscapeString(content)
	out := emojiSlugRE.ReplaceAllStringFunc(escaped, func(m string) string {
		slug := m[2 : len(m)-2]
		file, ok := bilibiliEmojiSlugFile[slug]
		if !ok {
			return m // unknown slug — leave as literal
		}
		// File names in the pack use Chinese characters (e.g. "傲娇.png")
		// — must be path-escaped for the URL.
		safeFile := url.PathEscape(file)
		safeSlug := html.EscapeString(slug)
		return fmt.Sprintf(
			`<img src="%s/emoji/bilibili/%s" alt="%s" width="20" height="20" style="vertical-align:middle;display:inline-block;margin:0 1px;">`,
			siteURL, safeFile, safeSlug,
		)
	})
	return template.HTML(out)
}
