package handler

import (
	"fmt"
	"time"
	"utterlog-go/config"
)

// Redis keys
const keyOnlinePrefix = "online:" // + visitor_id, TTL 5min

// v2.2.0 删除：IncrTotalViews / GetTotalViews / Redis stats:total_views。
// v2.3.0 删除：InitStatsSync 空 hook(已经没有任何 background sync 任务)。
// PV 真相源在 ul_stats_global.total_views(永久、事务化、O(1) 读)。

// IncrPostViews increments a post's永久 view count and the per-day
// PV row atomically. Called from SSR `?track=1` so刷新就 +1。Daily
// row 没记 unique_visitors(SSR 端拿不到 visitor_id),UV 一侧由
// 浏览器 /track 流程的 logAccess() 补 ul_stats_visitor_post_dates +
// ul_stats_post_daily.unique_visitors。
func IncrPostViews(postID int) {
	tx, err := config.DB.Beginx()
	if err != nil {
		return
	}
	committed := false
	defer func() {
		if !committed {
			tx.Rollback()
		}
	}()

	tx.Exec(fmt.Sprintf(
		"UPDATE %s SET view_count = view_count + 1 WHERE id = $1",
		config.T("posts")), postID)

	tx.Exec(fmt.Sprintf(`
		INSERT INTO %s (post_id, date, views, unique_visitors)
		VALUES ($1, CURRENT_DATE, 1, 0)
		ON CONFLICT (post_id, date)
		DO UPDATE SET views = %s.views + 1`,
		config.T("stats_post_daily"), config.T("stats_post_daily")), postID)

	if err := tx.Commit(); err != nil {
		return
	}
	committed = true
}

// GlobalStats returns the永久 site-level totals from ul_stats_global.
// Single read of one row — O(1). Used by everything that wants
// "lifetime stats" (footer 总访问量 / DashboardStats / period=all
// in AnalyticsOverview). Replaces the old COUNT(*) FROM ul_access_logs
// scattering, which decreased every time access_logs got pruned.
func GlobalStats() (totalViews, totalUniques int64) {
	if config.DB == nil {
		return 0, 0
	}
	var row struct {
		TotalViews   int64 `db:"total_views"`
		TotalUniques int64 `db:"total_uniques"`
	}
	_ = config.DB.Get(&row,
		"SELECT total_views, total_uniques FROM "+config.T("stats_global")+" WHERE id = 1")
	return row.TotalViews, row.TotalUniques
}

// MarkOnline marks a visitor as online (5 min TTL)
func MarkOnline(visitorID, ip, path string) {
	if config.RDB == nil || (visitorID == "" && ip == "") {
		return
	}
	key := visitorID
	if key == "" { key = ip }
	// Store as hash: visitor info
	config.RDB.HSet(config.Ctx, keyOnlinePrefix+key, map[string]interface{}{
		"visitor_id": visitorID,
		"ip":         ip,
		"path":       path,
		"ts":         fmt.Sprintf("%d", time.Now().Unix()),
	})
	config.RDB.Expire(config.Ctx, keyOnlinePrefix+key, 5*time.Minute)
}

// GetOnlineUsers returns list of currently online visitors
func GetOnlineUsers() []map[string]string {
	if config.RDB == nil {
		return nil
	}
	var result []map[string]string
	iter := config.RDB.Scan(config.Ctx, 0, keyOnlinePrefix+"*", 500).Iterator()
	for iter.Next(config.Ctx) {
		key := iter.Val()
		data := config.RDB.HGetAll(config.Ctx, key).Val()
		if len(data) > 0 {
			result = append(result, data)
		}
	}
	return result
}
