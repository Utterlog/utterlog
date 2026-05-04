// Unified analytics breakdown over flexible time windows.
//
// Endpoint
//   GET /api/v1/analytics/breakdown?period=<p>&dimension=<d>
//
// where p ∈ { 24h, 7d, 30d, year, 365d, all } and d ∈ { browser, os,
// device, country, all }. dimension=all returns the four breakdowns
// in one response so the visitor-stats page makes a single round trip.
//
// Data sources
//
//   ≤ 30d windows  → ul_access_logs (raw rows still available)
//   > 30d windows  → daily aggregate (ul_analytics_daily) for dates
//                    < cutoff, raw rows for dates ≥ cutoff. UNION.
//
// Unique visitors over windows that span both sides come from the
// permanent ul_visitor_dates table — summing daily uniques would
// over-count visitors who showed up on multiple days.
package handler

import (
	"fmt"
	"sort"
	"time"

	"github.com/gin-gonic/gin"

	"utterlog-go/config"
	"utterlog-go/internal/util"
)

// periodWindow returns (startUnix, startDate, label) for a period
// keyword. startDate is used for ul_analytics_daily (date column);
// startUnix is used for ul_access_logs (created_at column). label is
// just the canonical name echoed back in the response.
func periodWindow(period string) (startUnix int64, startDate time.Time, label string) {
	now := time.Now()
	today := now.UTC().Truncate(24 * time.Hour)
	switch period {
	case "24h":
		return now.Add(-24 * time.Hour).Unix(), today, "24h"
	case "7d":
		return now.Add(-7 * 24 * time.Hour).Unix(), today.Add(-6 * 24 * time.Hour), "7d"
	case "30d":
		return now.Add(-30 * 24 * time.Hour).Unix(), today.Add(-29 * 24 * time.Hour), "30d"
	case "year":
		// Year-to-date: from Jan 1 of current year (in UTC) to now.
		jan1 := time.Date(now.UTC().Year(), 1, 1, 0, 0, 0, 0, time.UTC)
		return jan1.Unix(), jan1, "year"
	case "365d":
		return now.Add(-365 * 24 * time.Hour).Unix(), today.Add(-364 * 24 * time.Hour), "365d"
	case "all":
		return 0, time.Date(2000, 1, 1, 0, 0, 0, 0, time.UTC), "all"
	default:
		// Unknown period falls through to 24h — same as the old
		// AnalyticsOverview default. Caller already validated, this
		// is just defense in depth.
		return now.Add(-24 * time.Hour).Unix(), today, "24h"
	}
}

// BreakdownResult is the wire shape returned to the admin UI. Each
// dimension list is sorted descending by count and includes a ratio
// (count / SUM(counts)) so the frontend can render percentages without
// re-summing.
type BreakdownResult struct {
	Period         string          `json:"period"`
	Visits         int64           `json:"visits"`
	UniqueVisitors int64           `json:"unique_visitors"`
	Browsers       []DimensionItem `json:"browsers,omitempty"`
	OS             []DimensionItem `json:"os,omitempty"`
	Devices        []DimensionItem `json:"devices,omitempty"`
	Countries      []DimensionItem `json:"countries,omitempty"`
}

// DimensionItem is one row of a breakdown list (e.g. {"Chrome", 1234,
// 0.61}). Code holds the country code when the dimension is country;
// for other dimensions it stays empty.
type DimensionItem struct {
	Name  string  `json:"name"`
	Code  string  `json:"code,omitempty"`
	Count int64   `json:"count"`
	Ratio float64 `json:"ratio"`
}

// AnalyticsBreakdown serves the unified breakdown endpoint.
func AnalyticsBreakdown(c *gin.Context) {
	period := c.DefaultQuery("period", "24h")
	if !stringInSlice(period, []string{"24h", "7d", "30d", "year", "365d", "all"}) {
		util.BadRequest(c, "period 必须是 24h / 7d / 30d / year / 365d / all 之一")
		return
	}

	dimension := c.DefaultQuery("dimension", "all")
	if !stringInSlice(dimension, []string{"browser", "os", "device", "country", "all"}) {
		util.BadRequest(c, "dimension 必须是 browser / os / device / country / all 之一")
		return
	}

	startUnix, startDate, label := periodWindow(period)
	cutoff := rollupCutoffDate() // raw rows ≥ this date, daily-aggregate < this

	result := BreakdownResult{Period: label}

	// ---- visits + unique_visitors ------------------------------------
	result.Visits = sumVisits(startUnix, startDate, cutoff)
	result.UniqueVisitors = sumUniqueVisitors(period, startUnix, startDate)

	// ---- per-dimension lists -----------------------------------------
	if dimension == "browser" || dimension == "all" {
		result.Browsers = breakdownDimension("browser", "browser", startUnix, startDate, cutoff)
	}
	if dimension == "os" || dimension == "all" {
		result.OS = breakdownDimension("os", "os", startUnix, startDate, cutoff)
	}
	if dimension == "device" || dimension == "all" {
		result.Devices = breakdownDimension("device", "device_type", startUnix, startDate, cutoff)
	}
	if dimension == "country" || dimension == "all" {
		result.Countries = breakdownCountry(startUnix, startDate, cutoff)
	}

	util.Success(c, result)
}

/* ===================================================================
   Private helpers — visits / unique counters
   =================================================================== */

// sumVisits returns the total page-view count over [startUnix, now].
// Pulls from ul_analytics_daily for whole days < cutoff (where raw
// rows have been pruned) and from ul_access_logs for live data.
func sumVisits(startUnix int64, startDate, cutoff time.Time) int64 {
	access := config.T("access_logs")
	daily := config.T("analytics_daily")

	var aggSum, rawCount int64

	// Daily aggregate side: dates in [startDate, cutoff) that have
	// already been rolled up. dim_value='' AND dimension='_total'.
	if startDate.Before(cutoff) {
		_ = config.DB.Get(&aggSum, fmt.Sprintf(
			"SELECT COALESCE(SUM(visits), 0) FROM %s WHERE dimension='_total' AND date >= $1 AND date < $2",
			daily,
		), formatYMD(startDate), formatYMD(cutoff))
	}

	// Raw side: created_at >= max(startUnix, cutoffUnix).
	rawStart := startUnix
	cutoffUnix := cutoff.Unix()
	if cutoffUnix > rawStart {
		rawStart = cutoffUnix
	}
	if rawStart == 0 {
		// "all" with empty raw still works — scan whole table.
		_ = config.DB.Get(&rawCount, fmt.Sprintf("SELECT COUNT(*) FROM %s", access))
	} else {
		_ = config.DB.Get(&rawCount, fmt.Sprintf(
			"SELECT COUNT(*) FROM %s WHERE created_at >= $1", access,
		), rawStart)
	}

	return aggSum + rawCount
}

// sumUniqueVisitors handles the cross-day unique-counting nuance.
//
// For windows ≤ 30d we still hit the raw table (DISTINCT visitor_id
// is precise and the raw set is small). For longer windows we go
// through the permanent ul_visitor_dates table because summing daily
// uniques would over-count multi-day visitors.
func sumUniqueVisitors(period string, startUnix int64, startDate time.Time) int64 {
	access := config.T("access_logs")
	visitorDates := config.T("visitor_dates")

	if period == "24h" || period == "7d" || period == "30d" {
		var n int64
		_ = config.DB.Get(&n, fmt.Sprintf(
			"SELECT COUNT(DISTINCT COALESCE(NULLIF(visitor_id,''), ip)) FROM %s WHERE created_at >= $1",
			access,
		), startUnix)
		return n
	}

	// year / 365d / all → query visitor_dates.
	var n int64
	if period == "all" {
		_ = config.DB.Get(&n, fmt.Sprintf("SELECT COUNT(DISTINCT visitor_id) FROM %s", visitorDates))
		return n
	}
	_ = config.DB.Get(&n, fmt.Sprintf(
		"SELECT COUNT(DISTINCT visitor_id) FROM %s WHERE date >= $1", visitorDates,
	), formatYMD(startDate))
	return n
}

/* ===================================================================
   Private helpers — dimension breakdowns
   =================================================================== */

// breakdownDimension assembles a {name, count, ratio} list for a
// single dimension by merging daily-aggregate rows (date < cutoff)
// with raw rows (created_at >= cutoff_unix), then computing ratios.
//
// dimName is the label used in ul_analytics_daily.dimension; rawCol
// is the column name to GROUP BY in ul_access_logs.
func breakdownDimension(dimName, rawCol string, startUnix int64, startDate, cutoff time.Time) []DimensionItem {
	access := config.T("access_logs")
	daily := config.T("analytics_daily")

	merged := map[string]int64{}

	// Daily aggregate.
	if startDate.Before(cutoff) {
		rows, err := config.DB.Query(fmt.Sprintf(
			"SELECT dim_value, COALESCE(SUM(visits),0) FROM %s WHERE dimension=$1 AND date >= $2 AND date < $3 GROUP BY dim_value",
			daily,
		), dimName, formatYMD(startDate), formatYMD(cutoff))
		if err == nil {
			for rows.Next() {
				var name string
				var count int64
				if err := rows.Scan(&name, &count); err == nil {
					merged[name] += count
				}
			}
			rows.Close()
		}
	}

	// Raw side.
	rawStart := startUnix
	cutoffUnix := cutoff.Unix()
	if cutoffUnix > rawStart {
		rawStart = cutoffUnix
	}
	rawSQL := fmt.Sprintf("SELECT COALESCE(%s,''), COUNT(*) FROM %s", rawCol, access)
	args := []interface{}{}
	if rawStart > 0 {
		rawSQL += " WHERE created_at >= $1"
		args = append(args, rawStart)
	}
	rawSQL += fmt.Sprintf(" GROUP BY %s", rawCol)
	rows, err := config.DB.Query(rawSQL, args...)
	if err == nil {
		for rows.Next() {
			var name string
			var count int64
			if err := rows.Scan(&name, &count); err == nil {
				merged[name] += count
			}
		}
		rows.Close()
	}

	return finalize(merged, "")
}

// breakdownCountry is a near-clone of breakdownDimension but keeps
// (country_name, country_code) as a 2-key tuple so the UI can show
// flag images keyed on code while displaying the localized name.
func breakdownCountry(startUnix int64, startDate, cutoff time.Time) []DimensionItem {
	access := config.T("access_logs")
	daily := config.T("analytics_daily")

	type key struct{ Name, Code string }
	merged := map[key]int64{}

	if startDate.Before(cutoff) {
		rows, err := config.DB.Query(fmt.Sprintf(
			"SELECT dim_value, dim_extra, COALESCE(SUM(visits),0) FROM %s WHERE dimension='country' AND date >= $1 AND date < $2 GROUP BY dim_value, dim_extra",
			daily,
		), formatYMD(startDate), formatYMD(cutoff))
		if err == nil {
			for rows.Next() {
				var name, code string
				var count int64
				if err := rows.Scan(&name, &code, &count); err == nil {
					merged[key{name, code}] += count
				}
			}
			rows.Close()
		}
	}

	rawStart := startUnix
	cutoffUnix := cutoff.Unix()
	if cutoffUnix > rawStart {
		rawStart = cutoffUnix
	}
	rawSQL := fmt.Sprintf("SELECT COALESCE(country_name,''), COALESCE(country,''), COUNT(*) FROM %s", access)
	args := []interface{}{}
	if rawStart > 0 {
		rawSQL += " WHERE created_at >= $1"
		args = append(args, rawStart)
	}
	rawSQL += " GROUP BY country_name, country"
	rows, err := config.DB.Query(rawSQL, args...)
	if err == nil {
		for rows.Next() {
			var name, code string
			var count int64
			if err := rows.Scan(&name, &code, &count); err == nil {
				merged[key{name, code}] += count
			}
		}
		rows.Close()
	}

	// Convert to slice, drop empty-name rows (visitors GeoIP couldn't
	// resolve — they'd render as blank rows in the UI), then ratio.
	items := make([]DimensionItem, 0, len(merged))
	var total int64
	for k, v := range merged {
		if k.Name == "" {
			continue
		}
		items = append(items, DimensionItem{Name: k.Name, Code: k.Code, Count: v})
		total += v
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Count > items[j].Count })
	if total > 0 {
		for i := range items {
			items[i].Ratio = float64(items[i].Count) / float64(total)
		}
	}
	return items
}

// finalize converts a name→count map into a sorted slice with
// ratios. defaultName is substituted for empty keys (e.g. "未知")
// or pass "" to drop empty keys entirely.
func finalize(m map[string]int64, defaultName string) []DimensionItem {
	items := make([]DimensionItem, 0, len(m))
	var total int64
	for name, count := range m {
		if name == "" {
			if defaultName == "" {
				continue
			}
			name = defaultName
		}
		items = append(items, DimensionItem{Name: name, Count: count})
		total += count
	}
	sort.Slice(items, func(i, j int) bool { return items[i].Count > items[j].Count })
	if total > 0 {
		for i := range items {
			items[i].Ratio = float64(items[i].Count) / float64(total)
		}
	}
	return items
}
