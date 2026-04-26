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
		// Pass 1: 同 path + 同 visitor/ip key + 30s bucket 内只保留最早一条。
		// 用 COALESCE(visitor_id, ip) 做 partition key — 真重复（前端
		// React StrictMode 双调 / F5 抖动）会被这条折叠。
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

		// Pass 2: SSR 双计清理。
		// 旧版 AccessLogger middleware 在 SSR 命中时同步写一条 access_log
		// （visitor_id="" + fingerprint=""），紧跟着 PageViewTracker 在
		// 浏览器渲染后 POST /track 又写一条（visitor_id 是浏览器签发的
		// 真值）。两条 dedup key 不一样（IP vs visitor_id）—— Pass 1
		// 折叠不掉。结果同一访客被 dashboard 的 COUNT(DISTINCT) 算成
		// 两个不同访客，admin 误以为统计被爬虫污染。
		//
		// 这里精准删除：visitor_id 空 + fingerprint 空 + UA 是真浏览器
		// + 30s 内同 IP 同 path 有 visitor_id 非空的姐妹行。这种行确定
		// 是 middleware 写入的双计，不是 JS-disabled 真访客。
		q2 := fmt.Sprintf(`
			DELETE FROM %s a
			WHERE COALESCE(a.visitor_id,'') = ''
			  AND COALESCE(a.fingerprint,'') = ''
			  AND a.user_agent IS NOT NULL
			  AND LENGTH(a.user_agent) >= 15
			  AND NOT (%s)
			  AND EXISTS (
				SELECT 1 FROM %s b
				WHERE b.path = a.path
				  AND b.ip = a.ip
				  AND b.visitor_id IS NOT NULL
				  AND b.visitor_id != ''
				  AND b.created_at BETWEEN a.created_at - 30 AND a.created_at + 30
			  )
		`, t, BotSQLPattern(), t)
		if r, err := config.DB.Exec(q2); err == nil && r != nil {
			n, _ := r.RowsAffected()
			if existing, ok := res["duplicates_deleted"].(int64); ok {
				res["duplicates_deleted"] = existing + n
			} else {
				res["duplicates_deleted"] = n
			}
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
