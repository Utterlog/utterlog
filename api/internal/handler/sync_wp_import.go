package handler

import (
	"fmt"
	"net/url"
	"strings"
	"time"
	"utterlog-go/config"
)

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

		excerpt := itemStr(item, "excerpt")
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
		err := config.DB.QueryRow(fmt.Sprintf(`
			INSERT INTO %s (title, slug, content, excerpt, author_id, status, password,
			                type, template, cover_url, allow_comment, pinned, view_count,
			                published_at, created_at, updated_at,
			                source_type, source_id, source_site_uuid)
			VALUES ($1, $2, $3, $4, $5, $6, $7,
			        $8, $9, $10, $11, $12, $13,
			        $14, $15, $16,
			        'wordpress', $17, $18)
			ON CONFLICT (source_site_uuid, source_type, source_id) WHERE source_site_uuid != ''
			DO UPDATE SET title = EXCLUDED.title, slug = EXCLUDED.slug, content = EXCLUDED.content,
			              excerpt = EXCLUDED.excerpt, status = EXCLUDED.status,
			              cover_url = EXCLUDED.cover_url, template = EXCLUDED.template,
			              allow_comment = EXCLUDED.allow_comment, pinned = EXCLUDED.pinned,
			              view_count = EXCLUDED.view_count, updated_at = EXCLUDED.updated_at,
			              published_at = EXCLUDED.published_at
			RETURNING id
		`, t),
			title, slug, content, excerpt, adminID, status, password,
			postType, template, coverURL, allowComment, pinned, viewCount,
			publishedAtTS, publishedAtUnix, updatedAtUnix,
			srcID, siteUUID).Scan(&id)
		if err != nil {
			continue
		}
		syncMapSet(jobID, "post", srcID, id)

		// Write term relationships from categories + tags slugs.
		for _, slug := range itemStrSlice(item, "categories") {
			if termID, ok := syncMapGet(jobID, "term_slug_category:"+slug, 0); ok {
				config.DB.Exec(fmt.Sprintf(`
					INSERT INTO %s (post_id, meta_id, created_at) VALUES ($1, $2, $3)
					ON CONFLICT DO NOTHING
				`, config.T("relationships")), id, termID, now)
			}
		}
		for _, slug := range itemStrSlice(item, "tags") {
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

	for _, item := range items {
		srcID := itemInt64(item, "source_id")
		srcPostID := itemInt64(item, "source_post_id")
		authorName := itemStr(item, "author_name")
		content := itemStr(item, "content")
		if srcID == 0 || srcPostID == 0 || content == "" {
			continue
		}

		postID, ok := syncMapGet(jobID, "post", srcPostID)
		if !ok {
			// Parent post wasn't imported (maybe filtered or failed) —
			// skip the comment.
			continue
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
