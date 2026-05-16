// Analytics retention + rollup pipeline.
//
// Pre-existing problem: ul_access_logs grew unbounded and every stats
// query GROUP BY'd straight off it. Beyond a few hundred MB this slows
// the dashboard and makes long-window queries (year-to-date, all-time)
// expensive.
//
// Two-tier scheme:
//
//   tier 1  ul_access_logs        last 30 days, raw rows
//   tier 2  ul_analytics_daily    permanent, per-day per-dimension
//                                  visits + unique_visitors counts
//
// Stat queries use raw for ≤30d windows, daily-aggregate (UNION raw
// for the live 30d tail) for longer windows.
//
// This file owns the daily rollup that moves data from tier 1 to
// tier 2 and prunes raw rows past 30 days. Idempotent: re-running for
// a date that's already aggregated overwrites the same primary-key
// rows (ON CONFLICT DO UPDATE) instead of double-counting. Once the
// raw rows for a date are pruned, re-running silently produces no
// rows for that date — safe.
package handler

import (
	"fmt"
	"log"
	"strings"
	"time"

	"utterlog-go/config"
	"utterlog-go/internal/siteclock"
)

// dayStartInSite returns midnight of t's date in the configured site
// timezone. All analytics date keys (ul_analytics_daily.date,
// ul_stats_post_daily.date, ul_visitor_dates.date) are bucketed by site
// natural day so admins see "stats since I went to bed last night" align
// with their wall clock, not UTC.
func dayStartInSite(t time.Time) time.Time {
	loc := siteclock.Location()
	t = t.In(loc)
	return time.Date(t.Year(), t.Month(), t.Day(), 0, 0, 0, 0, loc)
}

// rollupRetentionDays is how long raw access_logs rows are kept.
// Anything older is aggregated into ul_analytics_daily (if not
// already) and then deleted from the raw table.
//
// v2.2.0: 30 → 90。永久 PV 真相已经移到 ul_stats_global 实时累计，
// access_logs 仅作"最近访客 / 维度 breakdown"的热数据。90 天足以
// 覆盖站长日常的"近期分析"，再老的访问详情对个人博客无意义。
const rollupRetentionDays = 90

// dimColumn maps a dimension name to the raw-table column it groups by.
// Mirrored on the read side in analytics_breakdown.go.
var dimColumn = map[string]string{
	"browser": "browser",
	"os":      "os",
	"device":  "device_type",
	"country": "country_name",
}

// RollupAccessLogs aggregates all "complete" days from ul_access_logs
// into ul_analytics_daily, then prunes raw rows older than the
// retention window.
//
// "Complete day" = any UTC date in [oldest_raw_date, today - 1] that
// either (a) has no row in ul_analytics_daily yet, or (b) has rows
// but is still inside the retention window (re-aggregated to pick up
// late-arriving GeoIP enrichment that filled in country / city after
// the row was first written).
//
// Returns (rolledDays, prunedRaws, err) for cron logging.
func RollupAccessLogs() (int, int, error) {
	t := config.T
	access := t("access_logs")
	daily := t("stats_daily")

	// Pick the date range to process. Lower bound = earliest raw row's
	// date; upper bound = yesterday. Today is intentionally excluded
	// because more rows are still arriving — we'd rather wait until
	// the day is "closed" than over-write a partial day's aggregate
	// repeatedly.
	var oldestUnix, newestUnix int64
	config.DB.Get(&oldestUnix, fmt.Sprintf("SELECT COALESCE(MIN(created_at), 0) FROM %s", access))
	config.DB.Get(&newestUnix, fmt.Sprintf("SELECT COALESCE(MAX(created_at), 0) FROM %s", access))
	if oldestUnix == 0 || newestUnix == 0 {
		return 0, 0, nil
	}

	oldestDay := dayStartInSite(time.Unix(oldestUnix, 0))
	yesterday := dayStartInSite(time.Now()).Add(-24 * time.Hour)
	if oldestDay.After(yesterday) {
		// Only today's rows present — nothing to aggregate yet.
		return 0, 0, nil
	}

	rolled := 0
	for d := oldestDay; !d.After(yesterday); d = d.Add(24 * time.Hour) {
		if err := rollupOneDay(access, daily, d); err != nil {
			log.Printf("[analytics-rollup] day=%s failed: %v", d.Format("2006-01-02"), err)
			continue
		}
		rolled++
	}

	// Prune raw rows past the retention window. We compute the cutoff
	// in-DB rather than passing time.Now() to keep the math consistent
	// with the rollup we just performed.
	cutoff := time.Now().Add(-time.Duration(rollupRetentionDays) * 24 * time.Hour).Unix()
	res, err := config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE created_at < $1", access), cutoff)
	if err != nil {
		return rolled, 0, fmt.Errorf("prune raw: %w", err)
	}
	pruned := int64(0)
	if res != nil {
		pruned, _ = res.RowsAffected()
	}
	return rolled, int(pruned), nil
}

// rollupOneDay generates / refreshes all dim rows for a single date.
// Uses ON CONFLICT DO UPDATE so re-running is safe.
//
// v2.2.0: _total 维度不再 rollup —— 由 logAccess 在每次访问时实时
// UPSERT。如果 cron 再 GROUP BY access_logs 一次，access_logs 90 天后
// 被 prune 的旧行会让重算结果"变小"，覆盖掉真实累计值。维度 breakdown
// （browser / os / device / country）仍走 cron，因为它们没在写入路径
// 实时维护，且它们的"准确度"对个人博客而言够用（只用于 admin 后台分析）。
func rollupOneDay(access, daily string, day time.Time) error {
	dayStart := day.Unix()
	dayEnd := day.Add(24 * time.Hour).Unix()
	dateStr := day.Format("2006-01-02")

	// browser / os / device — straightforward GROUP BY on the column.
	for dim, col := range dimColumn {
		if dim == "country" {
			continue // country has 2-column key (name + code), handled below
		}
		_, err := config.DB.Exec(fmt.Sprintf(`
			INSERT INTO %s (date, dimension, dim_value, dim_extra, visits, unique_visitors)
			SELECT $1::date, $2, COALESCE(%s, ''), '',
			       COUNT(*),
			       COUNT(DISTINCT COALESCE(NULLIF(visitor_id,''), ip))
			FROM %s
			WHERE created_at >= $3 AND created_at < $4
			GROUP BY %s
			ON CONFLICT (date, dimension, dim_value, dim_extra) DO UPDATE
			SET visits = EXCLUDED.visits, unique_visitors = EXCLUDED.unique_visitors
		`, daily, col, access, col), dateStr, dim, dayStart, dayEnd)
		if err != nil {
			return fmt.Errorf("%s: %w", dim, err)
		}
	}

	// country: dim_value = country_name (display), dim_extra = country code.
	_, err := config.DB.Exec(fmt.Sprintf(`
		INSERT INTO %s (date, dimension, dim_value, dim_extra, visits, unique_visitors)
		SELECT $1::date, 'country',
		       COALESCE(country_name, ''),
		       COALESCE(country, ''),
		       COUNT(*),
		       COUNT(DISTINCT COALESCE(NULLIF(visitor_id,''), ip))
		FROM %s
		WHERE created_at >= $2 AND created_at < $3
		GROUP BY country_name, country
		ON CONFLICT (date, dimension, dim_value, dim_extra) DO UPDATE
		SET visits = EXCLUDED.visits, unique_visitors = EXCLUDED.unique_visitors
	`, daily, access), dateStr, dayStart, dayEnd)
	if err != nil {
		return fmt.Errorf("country: %w", err)
	}

	return nil
}

// StartAnalyticsRollupCron runs RollupAccessLogs daily. The first tick
// fires 5 minutes after process start so InitDB has a chance to settle
// (creating ul_analytics_daily etc), then every 24h after.
//
// We don't try to align to 03:00 in any specific timezone — the day-
// boundary math above uses UTC, and the rollup is idempotent, so the
// exact wall-clock time of the daily run doesn't matter.
func StartAnalyticsRollupCron() {
	go func() {
		time.Sleep(5 * time.Minute)
		runAnalyticsRollup()
		ticker := time.NewTicker(24 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			runAnalyticsRollup()
		}
	}()
}

func runAnalyticsRollup() {
	rolled, pruned, err := RollupAccessLogs()
	if err != nil {
		log.Printf("[analytics-rollup] error: %v", err)
		return
	}
	log.Printf("[analytics-rollup] rolled_days=%d pruned_raw=%d", rolled, pruned)
}

// rollupCutoffDate returns the date that splits raw vs aggregate
// data. Reads happen "raw side" >= this date, "aggregate side" < this.
// Used by the breakdown queries. Uses site_timezone day boundary so
// it lines up with the rollup writer.
func rollupCutoffDate() time.Time {
	return dayStartInSite(time.Now()).Add(-time.Duration(rollupRetentionDays) * 24 * time.Hour)
}

// dateOnly truncates a Unix second to site-tz midnight. Helper for tests.
func dateOnly(unix int64) time.Time {
	return dayStartInSite(time.Unix(unix, 0))
}

// formatYMD formats a time as YYYY-MM-DD in site_timezone — all date
// keys in ul_analytics_daily are bucketed by site natural day.
func formatYMD(t time.Time) string {
	return t.In(siteclock.Location()).Format("2006-01-02")
}

// stringInSlice — tiny helper used by the breakdown query when
// composing a dimension list. Avoids pulling in a slices package
// dependency for one call.
func stringInSlice(s string, list []string) bool {
	for _, v := range list {
		if strings.EqualFold(v, s) {
			return true
		}
	}
	return false
}
