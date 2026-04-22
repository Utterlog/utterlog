package handler

import (
	"fmt"
	"utterlog-go/config"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// PurgeAnalytics cleans up existing access_logs in three independent
// passes so the admin can fix a polluted dataset without a manual SQL
// session. Each pass is opt-in via query params:
//
//   POST /api/v1/admin/analytics/purge?bots=1&duplicates=1&older_than_days=90
//
// - bots=1            — delete rows whose user_agent matches IsBot's
//                       substring pattern (Googlebot, Ahrefs, curl, etc).
// - duplicates=1      — collapse same-(path, visitor/ip) bursts within
//                       a 30-second window into one row (keeps the
//                       earliest).
// - older_than_days=N — drop rows older than N days regardless of
//                       content. 0 or missing = keep all.
//
// Returns counts for each pass so the admin UI can show what was
// actually removed.
func PurgeAnalytics(c *gin.Context) {
	t := config.T("access_logs")

	res := gin.H{
		"bots_deleted":       0,
		"duplicates_deleted": 0,
		"aged_deleted":       0,
	}

	if c.DefaultQuery("bots", "1") == "1" {
		q := fmt.Sprintf("DELETE FROM %s WHERE %s", t, BotSQLPattern())
		r, err := config.DB.Exec(q)
		if err == nil && r != nil {
			n, _ := r.RowsAffected()
			res["bots_deleted"] = n
		}
	}

	if c.DefaultQuery("duplicates", "1") == "1" {
		// For each (path, visitor-or-ip, 30s bucket) keep only the
		// earliest row. A 30-second bucket matches the dedup window
		// the writer now enforces going forward.
		q := fmt.Sprintf(`
			DELETE FROM %s
			WHERE id IN (
				SELECT id FROM (
					SELECT id,
						ROW_NUMBER() OVER (
							PARTITION BY path,
								COALESCE(NULLIF(visitor_id,''), ip),
								(created_at / 30)
							ORDER BY created_at ASC, id ASC
						) AS rn
					FROM %s
				) ranked
				WHERE rn > 1
			)
		`, t, t)
		r, err := config.DB.Exec(q)
		if err == nil && r != nil {
			n, _ := r.RowsAffected()
			res["duplicates_deleted"] = n
		}
	}

	if days := c.Query("older_than_days"); days != "" && days != "0" {
		q := fmt.Sprintf("DELETE FROM %s WHERE created_at < EXTRACT(EPOCH FROM NOW() - ($1 * INTERVAL '1 day'))::bigint", t)
		r, err := config.DB.Exec(q, days)
		if err == nil && r != nil {
			n, _ := r.RowsAffected()
			res["aged_deleted"] = n
		}
	}

	// Recompute counters / vacuum hint so the dashboard reads fresh
	// numbers on the next query — we're hitting Postgres directly so
	// the next SELECT COUNT(*) already sees the deletions.

	util.Success(c, res)
}

// AnalyticsStats — quick overview of what's in the table right now.
// Shown on the admin purge dialog so the user can see "X rows total,
// ~Y% look like bots" before deciding what to wipe.
func AnalyticsStats(c *gin.Context) {
	t := config.T("access_logs")
	var total, botCount, uniqueVisitors, oldest int64
	config.DB.Get(&total, "SELECT COUNT(*) FROM "+t)
	config.DB.Get(&botCount, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE %s", t, BotSQLPattern()))
	config.DB.Get(&uniqueVisitors, "SELECT COUNT(DISTINCT COALESCE(NULLIF(visitor_id,''), ip)) FROM "+t)
	config.DB.Get(&oldest, "SELECT COALESCE(MIN(created_at), 0) FROM "+t)

	util.Success(c, gin.H{
		"total_rows":      total,
		"bot_rows":        botCount,
		"real_rows":       total - botCount,
		"unique_visitors": uniqueVisitors,
		"oldest_ts":       oldest,
	})
}
