package handler

import (
	"fmt"
	"utterlog-go/config"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// SystemClearCache flushes ephemeral Redis entries that the app can
// safely rebuild on next access. Intentionally DOES NOT touch
// `webauthn:*` (in-flight passkey challenges — clearing would break a
// user mid-login). Also skips JWT/session keys.
func SystemClearCache(c *gin.Context) {
	if config.RDB == nil {
		util.Success(c, gin.H{"cleared": 0, "note": "redis 未配置，无缓存可清"})
		return
	}
	cleared := 0
	patterns := []string{
		"captcha:*",   // PoW + image captchas (ephemeral, user refetches on demand)
		"captcha:img:*",
		"online:*",    // online visitor tracker — repopulates from heartbeats
		"stats:*",     // any stats caches we might add later
		"views:*",     // per-post view counter cache
		"geo:*",       // ip→country cache, rebuilds on next comment
	}
	for _, pat := range patterns {
		iter := config.RDB.Scan(config.Ctx, 0, pat, 500).Iterator()
		for iter.Next(config.Ctx) {
			config.RDB.Del(config.Ctx, iter.Val())
			cleared++
		}
	}
	util.Success(c, gin.H{"cleared": cleared})
}

// SystemClearRSSCache truncates the RSS aggregator tables so the next
// cron / manual refresh pulls everything fresh. Sync subscriptions
// themselves are preserved — only their cached items and
// last_fetched_at marker are reset.
func SystemClearRSSCache(c *gin.Context) {
	t := config.T
	cleared := 0

	if r, err := config.DB.Exec(fmt.Sprintf("DELETE FROM %s", t("feed_items"))); err == nil && r != nil {
		n, _ := r.RowsAffected()
		cleared = int(n)
	}
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET last_fetched_at = 0", t("rss_subscriptions")))

	util.Success(c, gin.H{"cleared_items": cleared, "note": "下次 cron 或手动刷新订阅时会重新拉取"})
}

// SystemRebuildStats recomputes every denormalized counter Utterlog
// caches on content rows — useful after a WordPress sync, a manual
// DB restore, or any time the admin suspects the cached numbers
// drifted from the ground truth. Idempotent: running it on already
// consistent data is a no-op.
//
// Scope:
//   - ul_metas.count       ← COUNT(*) FROM ul_relationships per meta
//   - ul_posts.comment_count ← COUNT(*) FROM ul_comments (approved) per post
//   - ul_posts.word_count  ← LENGTH(content) strip HTML, count chars
//     (Chinese-heavy; chars ≈ words)
//
// View counts live in Redis, not touched here.
func SystemRebuildStats(c *gin.Context) {
	result := gin.H{}

	// Meta counts — covers all terms regardless of source (local + synced).
	var metaUpdated int64
	r1, err1 := config.DB.Exec(fmt.Sprintf(`
		UPDATE %s m SET count = COALESCE(sub.c, 0)
		FROM (
		  SELECT meta_id, COUNT(*) AS c FROM %s GROUP BY meta_id
		) sub
		WHERE m.id = sub.meta_id AND m.count IS DISTINCT FROM sub.c
	`, config.T("metas"), config.T("relationships")))
	if err1 == nil {
		metaUpdated, _ = r1.RowsAffected()
	}
	// Zero out metas that have lost all their relationships.
	config.DB.Exec(fmt.Sprintf(`
		UPDATE %s SET count = 0
		WHERE count > 0 AND id NOT IN (SELECT DISTINCT meta_id FROM %s)
	`, config.T("metas"), config.T("relationships")))
	result["meta_count_updated"] = metaUpdated

	// Post comment_count — approved comments only, matching the native
	// increment path.
	var ccUpdated int64
	r2, err2 := config.DB.Exec(fmt.Sprintf(`
		UPDATE %s p SET comment_count = COALESCE(sub.c, 0)
		FROM (
		  SELECT post_id, COUNT(*) AS c FROM %s
		  WHERE status = 'approved' GROUP BY post_id
		) sub
		WHERE p.id = sub.post_id AND p.comment_count IS DISTINCT FROM sub.c
	`, config.T("posts"), config.T("comments")))
	if err2 == nil {
		ccUpdated, _ = r2.RowsAffected()
	}
	// Posts that lost all their approved comments.
	config.DB.Exec(fmt.Sprintf(`
		UPDATE %s SET comment_count = 0
		WHERE comment_count > 0 AND id NOT IN (
		  SELECT post_id FROM %s WHERE status='approved'
		)
	`, config.T("posts"), config.T("comments")))
	result["comment_count_updated"] = ccUpdated

	// Word count — strip HTML, count non-whitespace characters. Mostly a
	// post-migration concern; native editor updates word_count on save.
	var wcUpdated int64
	r3, err3 := config.DB.Exec(fmt.Sprintf(`
		UPDATE %s SET word_count = LENGTH(
		  REGEXP_REPLACE(
		    REGEXP_REPLACE(COALESCE(content, ''), '<[^>]+>', '', 'g'),
		    '\s+', '', 'g'
		  )
		)
		WHERE type = 'post' AND status = 'publish'
		  AND (word_count = 0 OR word_count IS NULL)
	`, config.T("posts")))
	if err3 == nil {
		wcUpdated, _ = r3.RowsAffected()
	}
	result["word_count_updated"] = wcUpdated

	util.Success(c, result)
}
