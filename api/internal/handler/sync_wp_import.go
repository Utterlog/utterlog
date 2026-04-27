package handler

import (
	"fmt"
	"net/url"
	"regexp"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
)

// excerptStripRE drops HTML tags, markdown code fences, shortcodes, and
// leading markdown syntax from a post body so what's left reads as
// prose. The order matters: kill block-level markers first (code
// fences), then HTML tags, then inline markers.
var excerptStripRE = regexp.MustCompile("(?s)```.*?```|<[^>]+>|\\[/?[a-zA-Z][^\\]]*\\]|[#*_`>~]")

// deriveExcerptFromContent returns up to `limit` runes of clean prose
// from a post body. Used when WordPress's post_excerpt was empty — no
// excerpt at all is worse than a content-derived one. No trailing
// ellipsis: the frontend homepage CSS-truncates with its own "…" at
// the three-line mark; the post inner page shows this excerpt in
// full, so a hard appended "…" on the DB row would break that.
func deriveExcerptFromContent(content string, limit int) string {
	s := excerptStripRE.ReplaceAllString(content, " ")
	s = strings.ReplaceAll(s, "\r", " ")
	s = strings.ReplaceAll(s, "\n", " ")
	fields := strings.Fields(s)
	s = strings.Join(fields, " ")
	runes := []rune(strings.TrimSpace(s))
	if len(runes) > limit {
		return string(runes[:limit])
	}
	return string(runes)
}

// decodeURLSlug handles the case where the source (WordPress) sent a
// percent-encoded slug — historically WP stored non-ASCII slugs that
// way (域名 -> %e5%9f%9f%e5%90%8d). Plugins v0.5.4+ decode on the PHP
// side, but older plugins / manual retrigger may still send encoded
// strings. This is a belt-and-braces pass so the DB always has
// readable slugs.
func decodeURLSlug(s string) string {
	if !strings.Contains(s, "%") {
		return s
	}
	if decoded, err := url.QueryUnescape(s); err == nil && decoded != "" {
		return decoded
	}
	return s
}

// ============================================================
// Resource importers for WordPress sync.
//
// Each function accepts a batch of item maps and upserts rows via
// UNIQUE INDEX on (source_site_uuid, source_type, source_id) so a
// re-run just updates the same rows. All imported rows get:
//   source_site_uuid = <sync site uuid>
//   source_type      = 'wordpress'
//   source_id        = <WP original ID>
//
// ID mapping (WP id → UL id) is recorded in ul_sync_id_map so later
// batches (posts → categories/tags, comments → parent) can translate.
// ============================================================

// importTerms handles both categories and tags. termType is
// "category" or "tag" (written to ul_metas.type).
func importTerms(jobID, siteUUID, termType string, items []map[string]interface{}) (int, error) {
	t := config.T("metas")
	now := time.Now().Unix()
	imported := 0

	for i, item := range items {
		srcID := itemInt64(item, "source_id")
		name := itemStr(item, "name")
		slug := decodeURLSlug(itemStr(item, "slug"))
		if name == "" || slug == "" || srcID == 0 {
			continue
		}

		// Upsert by (source_site_uuid, source_type, source_id).
		// Since ul_metas has no UNIQUE on (type, slug) historically,
		// we dedupe by source_* only. Users with existing metas
		// that collide on slug will see WP entries appended with
		// auto-id — that's fine.
		var id int
		err := config.DB.QueryRow(fmt.Sprintf(`
			INSERT INTO %s (name, slug, type, parent_id, count, order_num,
			                created_at, updated_at,
			                source_type, source_id, source_site_uuid)
			VALUES ($1, $2, $3, 0, 0, $4, $5, $5, 'wordpress', $6, $7)
			ON CONFLICT (source_site_uuid, source_type, source_id) WHERE source_site_uuid != ''
			DO UPDATE SET name = EXCLUDED.name, slug = EXCLUDED.slug, updated_at = EXCLUDED.updated_at
			RETURNING id
		`, t),
			name, slug, termType, i+1, now, srcID, siteUUID).Scan(&id)
		if err != nil {
			// Fallback: insert might fail if ON CONFLICT predicate
			// isn't matched (old PG versions handling partial indexes
			// differently). Try plain insert + lookup.
			config.DB.QueryRow(fmt.Sprintf(`
				INSERT INTO %s (name, slug, type, parent_id, count, order_num,
				                created_at, updated_at,
				                source_type, source_id, source_site_uuid)
				VALUES ($1, $2, $3, 0, 0, $4, $5, $5, 'wordpress', $6, $7)
				ON CONFLICT DO NOTHING
				RETURNING id
			`, t),
				name, slug, termType, i+1, now, srcID, siteUUID).Scan(&id)
			if id == 0 {
				config.DB.Get(&id, fmt.Sprintf(`
					SELECT id FROM %s WHERE source_site_uuid=$1 AND source_type='wordpress' AND source_id=$2 LIMIT 1
				`, t), siteUUID, srcID)
			}
		}
		if id > 0 {
			syncMapSet(jobID, "term", srcID, id)
			// Also key by name/slug so post importer can resolve
			// categories: [slug, ...] without knowing the source_id.
			syncMapSet(jobID, "term_slug_"+termType+":"+slug, 0, id)
			imported++
		}
	}
	return imported, nil
}

// importPostsOrPages handles posts and pages (postType = "post" or
// "page"). The author is set to the current admin — we don't import
// users. Relations to terms are written to ul_relationships using
// the slugs + syncMapGet("term_slug_*").
func importPostsOrPages(jobID, siteUUID, postType string, items []map[string]interface{}) (int, error) {
	t := config.T("posts")
	now := time.Now().Unix()
	adminID := resolveAdminUserID()
	imported := 0

	for _, item := range items {
		srcID := itemInt64(item, "source_id")
		title := itemStr(item, "title")
		slug := itemStr(item, "slug")
		content := itemStr(item, "content")
		if title == "" || slug == "" || srcID == 0 {
			continue
		}

		status := mapStatusWP(itemStr(item, "status"))
		publishedAtUnix := parseISOTime(item["published_at_gmt"])
		updatedAtUnix := parseISOTime(item["updated_at_gmt"])
		if updatedAtUnix == 0 {
			updatedAtUnix = publishedAtUnix
		}
		if publishedAtUnix == 0 {
			publishedAtUnix = now
		}

		excerpt := strings.TrimSpace(itemStr(item, "excerpt"))
		// If WP didn't provide a manual excerpt, derive one from content.
		// Target 100-200 runes: homepage CSS clamps to 3 lines anyway,
		// and the inner-page AISummary block renders the stored excerpt
		// in full, so 200 keeps both reads clean without a trailing
		// ellipsis (no "…" — the CSS adds its own visual one only on
		// overflow, and the inner page shouldn't have any ellipsis).
		if excerpt == "" && content != "" {
			excerpt = deriveExcerptFromContent(content, 200)
		}
		password := itemStr(item, "password")
		coverURL := itemStr(item, "featured_image_url") // will be rewritten post-finish
		template := itemStr(item, "template")
		allowComment := true
		if v, ok := item["allow_comment"]; ok {
			allowComment = itemBool(map[string]interface{}{"_": v}, "_")
		}
		pinned := postType == "post" && itemBool(item, "is_sticky")
		viewCount := int(itemInt64(item, "view_count"))

		publishedAtTS := time.Unix(publishedAtUnix, 0).UTC()

		var id int
		err := config.DB.Get(&id, fmt.Sprintf(
			"SELECT id FROM %s WHERE source_site_uuid = $1 AND source_type = 'wordpress' AND source_id = $2",
			t), siteUUID, srcID)
		post := &model.Post{
			Title:        title,
			Slug:         slug,
			Content:      nilIfEmpty(content),
			Excerpt:      nilIfEmpty(excerpt),
			Type:         postType,
			Status:       status,
			AuthorID:     adminID,
			Password:     nilIfEmpty(password),
			CoverURL:     nilIfEmpty(coverURL),
			AllowComment: &allowComment,
			Pinned:       &pinned,
			ViewCount:    viewCount,
			CreatedAt:    publishedAtUnix,
			UpdatedAt:    updatedAtUnix,
			PublishedAt:  &publishedAtTS,
		}
		if err == nil && id != 0 {
			if existing, err := model.PostByID(id); err == nil {
				post.CreatedAt = existing.CreatedAt
			}
			id, err = model.UpdatePost(id, post)
		} else {
			id, err = model.CreatePost(post)
		}
		if err != nil {
			continue
		}
		config.DB.Exec(fmt.Sprintf(`
				UPDATE %s SET template = $1, view_count = $2,
				              source_type = 'wordpress', source_id = $3, source_site_uuid = $4
				WHERE id = $5
			`, t), template, viewCount, srcID, siteUUID, id)
		syncMapSet(jobID, "post", srcID, id)

		// Write term relationships from categories + tags slugs.
		// WP stores non-ASCII slugs URL-encoded (域名 -> %e5%9f%9f...),
		// and wp_get_object_terms returns them in that raw form. Decode
		// here so the lookup key matches the decoded form we stored in
		// importTerms — otherwise any term with a non-ASCII slug would
		// never link, and the post↔tag graph would silently collapse.
		for _, slug := range itemStrSlice(item, "categories") {
			slug = decodeURLSlug(slug)
			if termID, ok := syncMapGet(jobID, "term_slug_category:"+slug, 0); ok {
				config.DB.Exec(fmt.Sprintf(`
					INSERT INTO %s (post_id, meta_id, created_at) VALUES ($1, $2, $3)
					ON CONFLICT DO NOTHING
				`, config.T("relationships")), id, termID, now)
			}
		}
		for _, slug := range itemStrSlice(item, "tags") {
			slug = decodeURLSlug(slug)
			if termID, ok := syncMapGet(jobID, "term_slug_tag:"+slug, 0); ok {
				config.DB.Exec(fmt.Sprintf(`
					INSERT INTO %s (post_id, meta_id, created_at) VALUES ($1, $2, $3)
					ON CONFLICT DO NOTHING
				`, config.T("relationships")), id, termID, now)
			}
		}
		imported++
	}
	return imported, nil
}

// importComments handles the comments batch. user_id is always 0
// (imported comments are treated as guest posts). parent_id is
// resolved through sync_id_map; missing parents fall back to 0
// (becomes a top-level comment) rather than losing content.
func importComments(jobID, siteUUID string, items []map[string]interface{}) (int, error) {
	t := config.T("comments")
	now := time.Now().Unix()
	imported := 0
	skipNoID, skipNoPostSrc, skipEmpty, skipNoPostMap := 0, 0, 0, 0
	var firstOrphanSrc int64
	var sampleMissingPostIDs []int64

	defer func() {
		if len(items) > 0 {
			fmt.Printf("[sync/comments job=%s] received=%d imported=%d skip(no_id=%d no_post_src=%d empty=%d no_post_map=%d) first_orphan_src=%d sample_missing_post_ids=%v\n",
				jobID, len(items), imported, skipNoID, skipNoPostSrc, skipEmpty, skipNoPostMap, firstOrphanSrc, sampleMissingPostIDs)
		}
	}()

	for _, item := range items {
		srcID := itemInt64(item, "source_id")
		srcPostID := itemInt64(item, "source_post_id")
		authorName := itemStr(item, "author_name")
		content := itemStr(item, "content")
		if srcID == 0 {
			skipNoID++
			continue
		}
		if srcPostID == 0 {
			skipNoPostSrc++
			continue
		}
		if content == "" {
			skipEmpty++
			continue
		}

		postID, ok := syncMapGet(jobID, "post", srcPostID)
		if !ok {
			// Fallback: look up in ul_posts by source provenance — the
			// parent post may have been imported in a previous job.
			var existingID int
			_ = config.DB.Get(&existingID, fmt.Sprintf(`
				SELECT id FROM %s
				WHERE source_site_uuid=$1 AND source_type='wordpress' AND source_id=$2
				LIMIT 1
			`, config.T("posts")), siteUUID, srcPostID)
			if existingID > 0 {
				postID = existingID
				syncMapSet(jobID, "post", srcPostID, existingID)
			} else {
				skipNoPostMap++
				if firstOrphanSrc == 0 {
					firstOrphanSrc = srcID
				}
				if len(sampleMissingPostIDs) < 10 {
					sampleMissingPostIDs = append(sampleMissingPostIDs, srcPostID)
				}
				continue
			}
		}

		var parentID int
		if parentSrc := itemInt64(item, "parent_source_id"); parentSrc > 0 {
			if pid, ok := syncMapGet(jobID, "comment", parentSrc); ok {
				parentID = pid
			}
		}

		status := mapCommentStatusWP(item["status"])
		createdAt := parseISOTime(item["comment_date_gmt"])
		if createdAt == 0 {
			createdAt = now
		}

		email := itemStr(item, "author_email")
		url := itemStr(item, "author_url")
		ip := strings.TrimSpace(itemStr(item, "author_ip"))
		if ip == "" {
			ip = "0.0.0.0"
		}
		agent := itemStr(item, "author_agent")
		if len(agent) > 511 {
			agent = agent[:511]
		}
		clientHints := itemStr(item, "client_hints")

		var id int
		// ul_comments.author_ip is `inet`; non-parseable values fail
		// the insert. Wrap in a sub-expression with fallback.
		err := config.DB.QueryRow(fmt.Sprintf(`
			INSERT INTO %s (post_id, author_name, author_email, author_url,
			                author_ip, author_agent, content, parent_id, user_id, status,
			                source, source_id, created_at, updated_at,
			                client_hints,
			                source_type, source_site_uuid)
			VALUES ($1, $2, $3, $4,
			        (CASE WHEN $5 ~ '^[0-9a-fA-F:.]+$' THEN $5::inet ELSE '0.0.0.0'::inet END),
			        $6, $7, $8, 0, $9,
			        'wordpress', $10, $11, $11,
			        $12,
			        'wordpress', $13)
			ON CONFLICT (source_site_uuid, source_type, source_id) WHERE source_site_uuid != ''
			DO UPDATE SET content = EXCLUDED.content, status = EXCLUDED.status,
			              updated_at = EXCLUDED.updated_at
			RETURNING id
		`, t),
			postID, authorName, email, url,
			ip, agent, content, parentID, status,
			fmt.Sprintf("%d", srcID), createdAt,
			clientHints,
			siteUUID).Scan(&id)
		if err != nil {
			// Don't swallow insert failures — surface once per batch so
			// bugs like missing UNIQUE constraints are visible. Using
			// fmt.Printf so it lands in container stdout regardless of
			// the configured logger.
			if skipNoPostMap == 0 && imported == 0 {
				fmt.Printf("[sync/comments job=%s] insert err on src=%d post=%d: %v\n", jobID, srcID, postID, err)
			}
			continue
		}
		syncMapSet(jobID, "comment", srcID, id)
		imported++
	}
	return imported, nil
}

// importLinks maps WP's Links Manager (wp_links) entries into ul_links.
// WP has no "group" concept so every imported link lands in the default
// group; admins can reorganize after the fact. visibility=Y -> status=1.
func importLinks(jobID, siteUUID string, items []map[string]interface{}) (int, error) {
	t := config.T("links")
	now := time.Now().Unix()
	imported := 0

	for i, item := range items {
		srcID := itemInt64(item, "source_id")
		name := itemStr(item, "name")
		urlStr := itemStr(item, "url")
		if name == "" || urlStr == "" || srcID == 0 {
			continue
		}
		status := 1
		if v, ok := item["visible"].(bool); ok && !v {
			status = 0
		}
		desc := itemStr(item, "description")
		logo := itemStr(item, "logo")
		rel := itemStr(item, "rel")
		rssURL := itemStr(item, "rss_url")

		_, err := config.DB.Exec(fmt.Sprintf(`
			INSERT INTO %s (name, url, description, logo, rel, rss_url,
			                order_num, status, group_name,
			                created_at, updated_at,
			                source_type, source_id, source_site_uuid)
			VALUES ($1, $2, $3, $4, $5, $6,
			        $7, $8, 'default',
			        $9, $9,
			        'wordpress', $10, $11)
			ON CONFLICT (source_site_uuid, source_type, source_id) WHERE source_site_uuid != ''
			DO UPDATE SET name = EXCLUDED.name, url = EXCLUDED.url,
			              description = EXCLUDED.description, logo = EXCLUDED.logo,
			              rel = EXCLUDED.rel, rss_url = EXCLUDED.rss_url,
			              status = EXCLUDED.status, updated_at = EXCLUDED.updated_at
		`, t),
			name, urlStr, desc, logo, rel, rssURL,
			i+1, status,
			now,
			srcID, siteUUID)
		if err == nil {
			imported++
		}
	}
	return imported, nil
}

// resolveAdminUserID returns the ID of the first admin user, or 1 as
// a last-resort fallback. Used as author_id for every imported post
// (single-user blog assumption).
func resolveAdminUserID() int {
	var id int
	err := config.DB.Get(&id, fmt.Sprintf(`
		SELECT id FROM %s WHERE role='admin' ORDER BY id ASC LIMIT 1
	`, config.T("users")))
	if err != nil || id == 0 {
		return 1
	}
	return id
}
