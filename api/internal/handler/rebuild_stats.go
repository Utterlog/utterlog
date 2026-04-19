package handler

import (
	"fmt"
	"utterlog-go/config"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

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
