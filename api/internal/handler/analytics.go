package handler

import (
	"crypto/md5"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/geoip"
	"utterlog-go/internal/model"
	"utterlog-go/internal/siteclock"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// Middleware to log access.
//
// Heavily scoped to avoid blowing up access_logs with asset / scanner
// noise — earlier this middleware only skipped /api/, /uploads/, and
// /_next/, which left /themes/*.css, /admin/assets/*, /favicon.*, and
// every bot-scanned WordPress path (.env, wp-login.php, xmlrpc.php,
// /robots.txt, etc.) landing in the table. One blog page load could
// easily write a dozen rows on top of the single explicit /track POST
// from the frontend, and CC scanners pushed counts into the tens of
// thousands per minute.
//
// Current policy: only log text/html navigations that Go is actually
// meant to serve as pages — today that's effectively nothing (the
// blog frontend is Next.js, the admin is an SPA), so the middleware
// is a thin safety net. All analytics now flow through explicit
// POST /api/v1/track from PageViewTracker.
var skipLogPrefix = []string{
	"/api/", "/uploads/", "/_next/", "/themes/", "/admin", "/static/",
	"/favicon", "/robots.txt", "/sitemap", "/manifest.json", "/ads.txt",
	"/apple-touch-icon", "/browserconfig.xml", "/.well-known/",
}

var assetExt = map[string]bool{
	".js": true, ".css": true, ".map": true,
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true, ".webp": true,
	".avif": true, ".svg": true, ".ico": true,
	".woff": true, ".woff2": true, ".ttf": true, ".otf": true, ".eot": true,
	".json": true, ".xml": true, ".txt": true,
	".mp4": true, ".webm": true, ".ogg": true, ".mp3": true, ".wav": true,
}

func AccessLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		for _, p := range skipLogPrefix {
			if strings.HasPrefix(path, p) {
				c.Next()
				return
			}
		}
		// Skip anything with a file extension — all real pages are
		// extensionless, all assets have one. Keeps bot-scanned junk
		// like /wp-login.php, /.env.bak, /config.json out.
		if i := strings.LastIndex(path, "."); i > 0 {
			if ext := strings.ToLower(path[i:]); assetExt[ext] {
				c.Next()
				return
			}
			// Unknown extension (.php, .asp, .env, etc.) — treat as
			// scanner noise, skip.
			c.Next()
			return
		}

		c.Next()

		// 不再在 SSR 路径记录 access_log。
		//
		// 历史：之前 middleware 在 SSR 命中 HTML 页时同步写一条
		// access_log（visitor_id=""，退化成 IP 做 dedup key），
		// PageViewTracker 在浏览器渲染后又 POST /api/v1/track 写
		// 一条（visitor_id 为浏览器签发的真值）—— 两条 dedup key
		// 不同（IP vs visitor_id）互不拦截，同一访客被算两次，
		// dashboard 的「unique 访客」用 COUNT(DISTINCT COALESCE
		// (visitor_id, ip)) 把这两条当成两个不同访客。结果就是
		// 真实访客被双计 +「visitor_id=空」的那条看起来像爬虫
		// 数据，admin 误以为爬虫泛滥。
		//
		// 现状：让 /track 成为唯一访客记录入口。爬虫绝大多数不
		// 执行 JS，自然不会触发 PageViewTracker → 不写 access_log
		// → 统计数据自动接近真实访客数。代价：JS-disabled 访客
		// 不被记录，但比例极低（< 0.1%），可以接受。
		//
		// middleware 函数本身保留（path filter 还在用，未来想加
		// 错误日志 / 安全审计 hook 也方便），只是不再调 logAccess。
		_ = path
	}
}

// logAccess writes one访客 hit to all real-time stats tables atomically.
//
// v2.2.0 重构：
//   - 不再去重（30s dedup）—— 用户要求刷新就算
//   - 不再做行为闸（60s ≥8 hits 拒绝）—— 同上
//   - 全部副作用进事务，包括 ul_stats_global / ul_analytics_daily（_total
//     实时维度）/ ul_visitor_dates / ul_stats_post_daily / ul_visitor_post_dates
//     / ul_access_logs
//   - GeoIP 留在事务外异步补 access_logs.country/city（这条单行 UPDATE 失败
//     不影响永久计数器）
//   - bot UA 仍然全跳过（数据质量护栏，不属于"管理员/限流"范畴）
func logAccess(ip, path, method, referer, ua, xff, visitorID, fingerprint string) {
	if IsBot(ua) {
		return
	}

	if xff != "" {
		ip = strings.TrimSpace(strings.Split(xff, ",")[0])
	}

	now := time.Now().Unix()
	today := time.Unix(now, 0).UTC().Format("2006-01-02")

	visitorKey := visitorID
	if visitorKey == "" {
		visitorKey = ip
	}

	device, browser, browserVer, osName, osVer := parseUserAgent(ua)
	refHost := ""
	if referer != "" {
		parts := strings.SplitN(referer, "//", 2)
		if len(parts) > 1 {
			refHost = strings.Split(parts[1], "/")[0]
		}
	}

	ipMasked := ip
	if ipParts := strings.Split(ip, "."); len(ipParts) == 4 {
		ipMasked = ipParts[0] + "." + ipParts[1] + ".*.*"
	}

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

	// 1. 站点 visitor 是否今日首次？UPSERT + RETURNING (xmax=0) 是
	//    PG 探测「真的新插入了」的标准法子。老访客 ON CONFLICT 走
	//    DO UPDATE 设回原值 → 总能 RETURNING 一行；xmax=0 表示这次
	//    确实是 INSERT 而不是 UPDATE（PG MVCC：UPDATE 会把当前事务
	//    号写到旧行的 xmax）。直接 RETURNING bool 避免 xid → Go 类型转换。
	siteNewToday := false
	if visitorKey != "" {
		var inserted bool
		errv := tx.QueryRow(fmt.Sprintf(`
			INSERT INTO %s (visitor_id, date) VALUES ($1, $2::date)
			ON CONFLICT (visitor_id, date) DO UPDATE SET visitor_id = EXCLUDED.visitor_id
			RETURNING (xmax = 0)`, config.T("visitor_dates")), visitorKey, today).Scan(&inserted)
		if errv == nil && inserted {
			siteNewToday = true
		}
	}

	// 2. 永久站点累计：PV +1，UV 仅当首次今日
	uniqInc := 0
	if siteNewToday {
		uniqInc = 1
	}
	tx.Exec(fmt.Sprintf(`UPDATE %s SET
		total_views   = total_views + 1,
		total_uniques = total_uniques + $1,
		first_event_at = CASE WHEN first_event_at = 0 THEN $2 ELSE first_event_at END,
		updated_at    = $2
		WHERE id = 1`, config.T("stats_global")), uniqInc, now)

	// 3. 永久日聚合（_total 维度）：写入时实时 +1，不再等 cron
	tx.Exec(fmt.Sprintf(`
		INSERT INTO %s (date, dimension, dim_value, dim_extra, visits, unique_visitors)
		VALUES ($1::date, '_total', '', '', 1, $2)
		ON CONFLICT (date, dimension, dim_value, dim_extra)
		DO UPDATE SET visits = %s.visits + 1,
		              unique_visitors = %s.unique_visitors + EXCLUDED.unique_visitors`,
		config.T("analytics_daily"), config.T("analytics_daily"), config.T("analytics_daily")),
		today, uniqInc)

	// 4. 文章级实时统计（仅文章详情页路径能解析出 post_id）
	if postID, _ := parsePostFromPath(path); postID > 0 && visitorKey != "" {
		var postInserted bool
		errp := tx.QueryRow(fmt.Sprintf(`
			INSERT INTO %s (visitor_id, post_id, date) VALUES ($1, $2, $3::date)
			ON CONFLICT (visitor_id, post_id, date) DO UPDATE SET visitor_id = EXCLUDED.visitor_id
			RETURNING (xmax = 0)`, config.T("visitor_post_dates")), visitorKey, postID, today).Scan(&postInserted)
		postNewToday := errp == nil && postInserted
		postUniqInc := 0
		if postNewToday {
			postUniqInc = 1
		}
		// 只更新 unique_visitors —— views 由 IncrPostViews（SSR ?track=1
		// 路径）独占。否则一次 F5 触发 SSR + /track 两条路径，stats_post_daily.views
		// 会被 +2 而 ul_posts.view_count 只 +1，两者漂移。INSERT 时 views=0
		// 是兜底（极少数情况：/track 比 SSR 先到 / SSR 失败而 /track 成功）。
		tx.Exec(fmt.Sprintf(`
			INSERT INTO %s (post_id, date, views, unique_visitors)
			VALUES ($1, $2::date, 0, $3)
			ON CONFLICT (post_id, date)
			DO UPDATE SET unique_visitors = %s.unique_visitors + EXCLUDED.unique_visitors`,
			config.T("stats_post_daily"), config.T("stats_post_daily")),
			postID, today, postUniqInc)
	}

	// 5. 热原始行（90 天保留，供"最近访客 / 维度 breakdown"读取）
	var logID int
	tx.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (ip, ip_masked, path, method, referer, referer_host, user_agent, device_type, browser, browser_version, os, os_version, visitor_id, fingerprint, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id",
		config.T("access_logs")), ip, ipMasked, path, method, referer, refHost, ua, device, browser, browserVer, osName, osVer, visitorID, fingerprint, now).Scan(&logID)

	if commitErr := tx.Commit(); commitErr != nil {
		return
	}
	committed = true

	// GeoIP enrich 在事务外异步：失败只影响这条 raw 行的 country/city，
	// 永久计数器已经原子落库。
	if logID > 0 && ip != "" && ip != "127.0.0.1" {
		go enrichAccessGeo(logID, ip)
	}
}

func enrichAccessGeo(logID int, ip string) {
	geo, err := geoip.Lookup(ip)
	if err != nil || geo == nil || geo.CountryCode == "" {
		return
	}

	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET country=$1, country_name=$2, region=$3, city=$4, latitude=$5, longitude=$6 WHERE id=$7",
		config.T("access_logs")),
		strings.ToLower(geo.CountryCode), geo.Country, geo.Province, geo.City, geo.Latitude, geo.Longitude, logID)
}

// User-Agent parser
func parseUserAgent(ua string) (device, browser, browserVer, os, osVer string) {
	ua = strings.ToLower(ua)
	// Device
	if strings.Contains(ua, "mobile") || strings.Contains(ua, "android") {
		device = "Mobile"
	} else if strings.Contains(ua, "tablet") || strings.Contains(ua, "ipad") {
		device = "Tablet"
	} else {
		device = "Desktop"
	}

	// Browser
	if m := regexp.MustCompile(`edg[e/](\d+[\.\d]*)`).FindStringSubmatch(ua); len(m) > 1 {
		browser = "Edge"
		browserVer = m[1]
	} else if m := regexp.MustCompile(`chrome/(\d+[\.\d]*)`).FindStringSubmatch(ua); len(m) > 1 {
		browser = "Chrome"
		browserVer = m[1]
	} else if m := regexp.MustCompile(`firefox/(\d+[\.\d]*)`).FindStringSubmatch(ua); len(m) > 1 {
		browser = "Firefox"
		browserVer = m[1]
	} else if m := regexp.MustCompile(`safari/(\d+[\.\d]*)`).FindStringSubmatch(ua); len(m) > 1 && strings.Contains(ua, "version/") {
		browser = "Safari"
		if vm := regexp.MustCompile(`version/(\d+[\.\d]*)`).FindStringSubmatch(ua); len(vm) > 1 {
			browserVer = vm[1]
		}
	} else {
		browser = "Other"
	}

	// OS
	if strings.Contains(ua, "windows") {
		os = "Windows"
		if m := regexp.MustCompile(`windows nt (\d+\.\d+)`).FindStringSubmatch(ua); len(m) > 1 {
			osVer = m[1]
		}
	} else if strings.Contains(ua, "mac os") {
		os = "macOS"
		if m := regexp.MustCompile(`mac os x (\d+[_.\d]*)`).FindStringSubmatch(ua); len(m) > 1 {
			osVer = strings.ReplaceAll(m[1], "_", ".")
		}
	} else if strings.Contains(ua, "linux") {
		os = "Linux"
	} else if strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") {
		os = "iOS"
		if m := regexp.MustCompile(`os (\d+[_.\d]*)`).FindStringSubmatch(ua); len(m) > 1 {
			osVer = strings.ReplaceAll(m[1], "_", ".")
		}
	} else if strings.Contains(ua, "android") {
		os = "Android"
		if m := regexp.MustCompile(`android (\d+[\.\d]*)`).FindStringSubmatch(ua); len(m) > 1 {
			osVer = m[1]
		}
	} else {
		os = "Other"
	}

	return
}

// Analytics dashboard data
func AnalyticsOverview(c *gin.Context) {
	period := c.DefaultQuery("period", "24h")
	if !stringInSlice(period, []string{"24h", "7d", "30d", "year", "365d", "all"}) {
		period = "24h"
	}
	t := config.T("access_logs")

	startUnix, startDate, _ := periodWindow(period)
	cutoff := rollupCutoffDate()

	// Summary stats — long-window visits / unique numbers come from the
	// rollup helpers (UNION raw + ul_analytics_daily). uniquePaths
	// remains raw-only because we don't aggregate path-level data
	// (would explode the daily table).
	totalVisits := sumVisits(startUnix, startDate, cutoff)
	uniqueIPs := sumUniqueVisitors(period, startUnix, startDate)

	whereRaw := ""
	if startUnix > 0 {
		whereRaw = fmt.Sprintf("WHERE created_at >= %d", startUnix)
	}
	var uniquePaths int
	config.DB.Get(&uniquePaths, fmt.Sprintf("SELECT COUNT(DISTINCT path) FROM %s %s", t, whereRaw))

	// Top pages — raw only, capped to retention window. For long-window
	// queries the answer is "top pages in the last 30 days" which is a
	// reasonable approximation; aggregating per-path forever would
	// blow up storage.
	var topPages []struct {
		Path  string `db:"path" json:"path"`
		Count int    `db:"count" json:"count"`
	}
	config.DB.Select(&topPages, fmt.Sprintf("SELECT path, COUNT(*) as count FROM %s %s GROUP BY path ORDER BY count DESC LIMIT 10", t, whereRaw))

	// Top referers — same caveat as Top pages.
	var topReferers []struct {
		Host  string `db:"referer_host" json:"host"`
		Count int    `db:"count" json:"count"`
	}
	refererWhere := analyticsWhereAnd(whereRaw, "referer_host != ''")
	config.DB.Select(&topReferers, fmt.Sprintf("SELECT referer_host, COUNT(*) as count FROM %s %s GROUP BY referer_host ORDER BY count DESC LIMIT 10", t, refererWhere))

	// Browsers / OS / Devices / Countries — long-window safe. The
	// breakdownDimension helpers UNION raw rows with the daily-aggregate
	// table so 'year' / 'all' returns historical data even after rows
	// have been pruned from ul_access_logs.
	browsers := breakdownDimension("browser", "browser", startUnix, startDate, cutoff)
	osList := breakdownDimension("os", "os", startUnix, startDate, cutoff)
	devices := breakdownDimension("device", "device_type", startUnix, startDate, cutoff)
	countries := breakdownCountry(startUnix, startDate, cutoff)
	if len(browsers) > 10 {
		browsers = browsers[:10]
	}
	if len(osList) > 10 {
		osList = osList[:10]
	}
	if len(countries) > 20 {
		countries = countries[:20]
	}

	// Hourly chart (last 24h)
	var hourly []struct {
		Hour  string `db:"hour" json:"hour"`
		Count int    `db:"count" json:"count"`
	}
	h24ago := time.Now().Add(-24 * time.Hour).Unix()
	tzName := siteclock.Name()
	config.DB.Select(&hourly, fmt.Sprintf(
		"SELECT TO_CHAR(TO_TIMESTAMP(created_at) AT TIME ZONE $1, 'HH24') as hour, COUNT(*) as count FROM %s WHERE created_at >= $2 GROUP BY hour ORDER BY hour", t), tzName, h24ago)

	// Daily chart (last 30d)
	var daily []struct {
		Date  string `db:"date" json:"date"`
		Count int    `db:"count" json:"count"`
	}
	d30ago := time.Now().Add(-30 * 24 * time.Hour).Unix()
	config.DB.Select(&daily, fmt.Sprintf(
		"SELECT TO_CHAR(TO_TIMESTAMP(created_at) AT TIME ZONE $1, 'MM-DD') as date, COUNT(*) as count FROM %s WHERE created_at >= $2 GROUP BY date ORDER BY date", t), tzName, d30ago)

	// Recent visitors
	var recent []struct {
		IP        string `db:"ip_masked" json:"ip"`
		Path      string `db:"path" json:"path"`
		Browser   string `db:"browser" json:"browser"`
		OS        string `db:"os" json:"os"`
		Device    string `db:"device_type" json:"device"`
		Country   string `db:"country_name" json:"country"`
		CreatedAt int64  `db:"created_at" json:"created_at"`
	}
	config.DB.Select(&recent, recentVisitorEntryCTE(t)+
		`SELECT ip_masked, path, browser, os, device_type, country_name, created_at
		FROM entry_logs
		WHERE entry_rank = 1
		ORDER BY session_last_at DESC, id DESC
		LIMIT 20`)

	util.Success(c, gin.H{
		"summary": gin.H{
			"total_visits": totalVisits,
			"unique_ips":   uniqueIPs,
			"unique_pages": uniquePaths,
		},
		"top_pages":    topPages,
		"top_referers": topReferers,
		"browsers":     browsers,
		"os":           osList,
		"devices":      devices,
		"countries":    countries,
		"hourly":       hourly,
		"daily":        daily,
		"recent":       recent,
	})
}

func analyticsWhereAnd(where, condition string) string {
	condition = strings.TrimSpace(condition)
	if condition == "" {
		return where
	}
	if strings.TrimSpace(where) == "" {
		return "WHERE " + condition
	}
	return where + " AND " + condition
}

// GeoIP lookup for a single IP
func GeoIPLookup(c *gin.Context) {
	ip := c.Query("ip")
	if ip == "" {
		ip = c.ClientIP()
	}

	result, err := geoip.Lookup(ip)
	if err != nil {
		util.Error(c, 502, "GEOIP_ERROR", err.Error())
		return
	}
	util.Success(c, result)
}

// Enrich access log with GeoIP (batch job)
func EnrichGeoIP(c *gin.Context) {
	t := config.T("access_logs")
	var ips []struct {
		IP string `db:"ip"`
	}
	config.DB.Select(&ips, fmt.Sprintf("SELECT DISTINCT ip FROM %s WHERE country = '' LIMIT 50", t))

	enriched := 0
	for _, item := range ips {
		geo, err := geoip.Lookup(item.IP)
		if err != nil || geo == nil || geo.CountryCode == "" {
			continue
		}
		config.DB.Exec(fmt.Sprintf(
			"UPDATE %s SET country=$1, country_name=$2, region=$3, city=$4, latitude=$5, longitude=$6 WHERE ip=$7",
			t), strings.ToLower(geo.CountryCode), geo.Country, geo.Province, geo.City, geo.Latitude, geo.Longitude, item.IP)
		enriched++
		time.Sleep(200 * time.Millisecond) // Rate limit
	}

	util.Success(c, gin.H{"enriched": enriched})
}

// TrackPageView handles page view reporting from the frontend
func TrackPageView(c *gin.Context) {
	var req struct {
		Path        string `json:"path" binding:"required"`
		Referer     string `json:"referer"`
		VisitorID   string `json:"visitor_id"`
		Fingerprint string `json:"fingerprint"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "path is required")
		return
	}

	// v2.2.0: 不再 skip 管理员；管理员自己访问也计入统计（用户明确要求）
	ua := c.Request.UserAgent()
	if IsBot(ua) {
		util.Success(c, gin.H{"ok": true})
		return
	}

	realIP := c.Request.Header.Get("CF-Connecting-IP")
	if realIP == "" {
		realIP = c.Request.Header.Get("X-Real-IP")
	}
	if realIP == "" {
		realIP = c.ClientIP()
	}

	// 异步：logAccess 现在事务化写入所有永久统计表（ul_stats_global /
	// ul_analytics_daily / ul_visitor_dates / ul_stats_post_daily /
	// ul_visitor_post_dates / ul_access_logs），不再依赖 Redis 当 PV
	// 真相源。MarkOnline 仍走 Redis（5min TTL，本来就是临时态）。
	go func() {
		logAccess(realIP, req.Path, "GET", req.Referer, ua, c.Request.Header.Get("X-Forwarded-For"), req.VisitorID, req.Fingerprint)
		MarkOnline(req.VisitorID, realIP, req.Path)
	}()

	util.Success(c, gin.H{"ok": true})
}

func currentUserIsAdmin(c *gin.Context) bool {
	id, ok := c.Get("user_id")
	if !ok {
		return false
	}
	userID, ok := id.(int)
	if !ok || userID <= 0 {
		return false
	}
	var role string
	if err := config.DB.Get(&role, "SELECT role FROM "+config.T("users")+" WHERE id = $1", userID); err != nil {
		return false
	}
	return strings.EqualFold(role, "admin")
}

// permalinkRegexCache caches one compiled regex per template so we
// don't pay the parsePermalink template-compile cost on every /track
// request. Entries are invalidated by template string identity —
// admin changing permalink_structure produces a different cache key.
var permalinkRegexCache sync.Map // template (string) → *permalinkMatcher

type permalinkMatcher struct {
	re     *regexp.Regexp
	tokens []string // token names in capture-group order: postname / post_id / display_id / year / month / day / category
}

// parsePostFromPath: 把请求 URL path 按 admin 配置的 permalink_structure
// 模板反向解析出 (post_id, slug)，两者只有一个非零（id 优先）。
// 镜像 web/lib/permalink.ts 的 parsePermalink 实现，但只关心真实 db id/slug。
//
// 模板支持的占位符（来自 frontend lib）:
//
//	%postname%   — post slug
//	%post_id%    — db primary key
//	%display_id% — public sequential article id
//	%year%       — 4-digit year
//	%month%      — 2-digit month
//	%day%        — 2-digit day
//	%category%   — first-category slug
//
// 默认模板 /posts/%postname%（向后兼容，admin 没设过 option 时也能 work）。
func parsePostFromPath(path string) (postID int, slug string) {
	template := strings.TrimSpace(model.GetOption("permalink_structure"))
	if template == "" {
		template = "/posts/%postname%"
	}

	matcher := getOrCompilePermalinkMatcher(template)
	if matcher == nil {
		return 0, ""
	}

	cleanPath := strings.TrimRight(path, "/")
	if cleanPath == "" {
		cleanPath = "/"
	}
	// drop query / hash fragments before matching
	if i := strings.IndexAny(cleanPath, "?#"); i >= 0 {
		cleanPath = cleanPath[:i]
	}

	m := matcher.re.FindStringSubmatch(cleanPath)
	if m == nil {
		return 0, ""
	}
	for i, tok := range matcher.tokens {
		val := m[i+1]
		switch tok {
		case "post_id":
			if id, err := strconv.Atoi(val); err == nil && id > 0 {
				return id, ""
			}
		case "display_id":
			// display_id 是「按发布顺序连续递增」的对外编号，跟 db 主键
			// 解耦。/track 拿到 path 上的 display_id 后回查 posts 表
			// 拿真实 db id 用于 IncrPostViews。
			if d, err := strconv.Atoi(val); err == nil && d > 0 {
				var realID int
				config.DB.Get(&realID, fmt.Sprintf(
					"SELECT id FROM %s WHERE display_id = $1 AND type = 'post' AND status = 'publish'",
					config.T("posts")), d)
				if realID > 0 {
					return realID, ""
				}
			}
		case "postname":
			if val != "" {
				slug = val
			}
		}
	}
	return 0, slug
}

// getOrCompilePermalinkMatcher builds (and caches) a regex matcher for
// the given template. Returns nil if the template is malformed.
func getOrCompilePermalinkMatcher(template string) *permalinkMatcher {
	if cached, ok := permalinkRegexCache.Load(template); ok {
		return cached.(*permalinkMatcher)
	}

	tpl := strings.TrimRight(template, "/")
	tokenRe := regexp.MustCompile(`%(postname|post_id|display_id|year|month|day|category)%`)

	var tokens []string
	var sb strings.Builder
	sb.WriteString("^")
	last := 0
	for _, idx := range tokenRe.FindAllStringSubmatchIndex(tpl, -1) {
		// idx = [matchStart, matchEnd, groupStart, groupEnd]
		sb.WriteString(regexp.QuoteMeta(tpl[last:idx[0]]))
		tok := tpl[idx[2]:idx[3]]
		tokens = append(tokens, tok)
		switch tok {
		case "postname":
			sb.WriteString(`([^/]+)`)
		case "post_id", "display_id":
			sb.WriteString(`(\d+)`)
		case "year":
			sb.WriteString(`(\d{4})`)
		case "month", "day":
			sb.WriteString(`(\d{2})`)
		case "category":
			sb.WriteString(`([^/]+)`)
		}
		last = idx[1]
	}
	sb.WriteString(regexp.QuoteMeta(tpl[last:]))
	sb.WriteString("$")

	re, err := regexp.Compile(sb.String())
	if err != nil {
		fmt.Printf("[analytics] permalink template invalid: %q (%s)\n", template, err)
		return nil
	}
	matcher := &permalinkMatcher{re: re, tokens: tokens}
	permalinkRegexCache.Store(template, matcher)
	return matcher
}

// 历史上这里有 isFirstPostViewToday() 做「同访客同篇文章当日去重」，
// 但用户明确要求「访客点击就 +1，刷新一次再 +1」不要任何限制，所以
// 已删除。爬虫 IsBot 早退路径仍然在 /track 入口生效，bot 流量不会进
// 这个增量逻辑。如果未来需要重启「按访客唯一计」策略，可以从 git
// 历史里恢复这个函数，并在 /track handler 里重新加守门条件。

// Recent access logs
// OnlineUsers returns currently active visitors with comment author matching
func OnlineUsers(c *gin.Context) {
	online := GetOnlineUsers()
	if online == nil {
		online = []map[string]string{}
	}

	t := config.T

	type OnlineUser struct {
		VisitorID   string `json:"visitor_id"`
		IP          string `json:"ip"`
		Path        string `json:"path"`
		Ts          string `json:"ts"`
		Name        string `json:"name,omitempty"`
		Avatar      string `json:"avatar,omitempty"`
		Country     string `json:"country,omitempty"`
		CountryCode string `json:"country_code,omitempty"`
		City        string `json:"city,omitempty"`
	}

	result := make([]OnlineUser, 0, len(online))
	for _, o := range online {
		u := OnlineUser{
			VisitorID: o["visitor_id"],
			IP:        o["ip"],
			Path:      o["path"],
			Ts:        o["ts"],
		}

		// Match to comment author
		vid := o["visitor_id"]
		ip := o["ip"]
		var name, email string
		matched := false
		if vid != "" {
			err := config.DB.QueryRow(fmt.Sprintf(
				"SELECT author_name, COALESCE(author_email,'') FROM %s WHERE visitor_id = $1 AND visitor_id != '' ORDER BY created_at DESC LIMIT 1",
				t("comments")), vid).Scan(&name, &email)
			if err == nil && name != "" {
				matched = true
			}
		}
		if !matched && ip != "" {
			config.DB.QueryRow(fmt.Sprintf(
				"SELECT author_name, COALESCE(author_email,'') FROM %s WHERE author_ip = $1 ORDER BY created_at DESC LIMIT 1",
				t("comments")), ip).Scan(&name, &email)
		}
		if name != "" {
			u.Name = name
			if email != "" {
				hash := fmt.Sprintf("%x", md5.Sum([]byte(strings.TrimSpace(strings.ToLower(email)))))
				u.Avatar = "https://gravatar.bluecdn.com/avatar/" + hash + "?s=64&d=mp"
			}
		}

		// GeoIP from latest access log
		var country, countryCode, city string
		config.DB.QueryRow(fmt.Sprintf(
			"SELECT COALESCE(country_name,''), COALESCE(country,''), COALESCE(city,'') FROM %s WHERE ip = $1 AND country != '' ORDER BY created_at DESC LIMIT 1",
			t("access_logs")), ip).Scan(&country, &countryCode, &city)
		u.Country = country
		u.CountryCode = countryCode
		u.City = city

		result = append(result, u)
	}

	util.Success(c, gin.H{"online": result, "count": len(result)})
}

// OnlineCount returns public online visitor count + basic info (no sensitive data)
func OnlineCount(c *gin.Context) {
	online := GetOnlineUsers()
	if online == nil {
		online = []map[string]string{}
	}

	// Check if frontend display is enabled
	var showOnline string
	config.DB.Get(&showOnline, "SELECT COALESCE(value,'1') FROM "+config.T("options")+" WHERE name='show_online_visitors'")
	if showOnline == "0" || showOnline == "false" {
		util.Success(c, gin.H{"count": 0, "enabled": false})
		return
	}

	t := config.T
	type PublicOnline struct {
		Country     string `json:"country,omitempty"`
		CountryCode string `json:"country_code,omitempty"`
		City        string `json:"city,omitempty"`
		Path        string `json:"path"`
		Name        string `json:"name,omitempty"`
		Avatar      string `json:"avatar,omitempty"`
		IPMasked    string `json:"ip_masked,omitempty"`
	}

	result := make([]PublicOnline, 0, len(online))
	for _, o := range online {
		u := PublicOnline{Path: o["path"]}
		ip := o["ip"]
		vid := o["visitor_id"]

		// Mask IP: show first 2 segments only
		parts := strings.Split(ip, ".")
		if len(parts) == 4 {
			u.IPMasked = parts[0] + "." + parts[1] + ".*.*"
		} else if strings.Contains(ip, ":") {
			segs := strings.Split(ip, ":")
			if len(segs) > 2 {
				u.IPMasked = segs[0] + ":" + segs[1] + "::*"
			} else {
				u.IPMasked = ip
			}
		}

		// Match name + email for avatar
		var name, email string
		if vid != "" {
			config.DB.QueryRow(fmt.Sprintf("SELECT author_name, COALESCE(author_email,'') FROM %s WHERE visitor_id = $1 AND visitor_id != '' ORDER BY created_at DESC LIMIT 1", t("comments")), vid).Scan(&name, &email)
		}
		if name == "" && ip != "" {
			config.DB.QueryRow(fmt.Sprintf("SELECT author_name, COALESCE(author_email,'') FROM %s WHERE author_ip = $1 ORDER BY created_at DESC LIMIT 1", t("comments")), ip).Scan(&name, &email)
		}
		u.Name = name
		if email != "" {
			hash := fmt.Sprintf("%x", md5.Sum([]byte(strings.TrimSpace(strings.ToLower(email)))))
			u.Avatar = "https://gravatar.bluecdn.com/avatar/" + hash + "?s=64&d=mp"
		}

		// GeoIP
		var country, code, city string
		config.DB.QueryRow(fmt.Sprintf("SELECT COALESCE(country_name,''), COALESCE(country,''), COALESCE(city,'') FROM %s WHERE ip = $1 AND country != '' ORDER BY created_at DESC LIMIT 1", t("access_logs")), ip).Scan(&country, &code, &city)
		u.Country = country
		u.CountryCode = code
		u.City = city

		result = append(result, u)
	}

	util.Success(c, gin.H{"count": len(result), "online": result, "enabled": true})
}

func AccessLogs(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage := 50
	offset := (page - 1) * perPage
	t := config.T("access_logs")

	var total int
	config.DB.Get(&total, "SELECT COUNT(*) FROM "+t)

	var logs []map[string]interface{}
	rows, _ := config.DB.Queryx(fmt.Sprintf("SELECT * FROM %s ORDER BY created_at DESC LIMIT $1 OFFSET $2", t), perPage, offset)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			logs = append(logs, row)
		}
	}
	if logs == nil {
		logs = []map[string]interface{}{}
	}
	util.Paginate(c, logs, total, page, perPage)
}

// recentVisitorMaxRows caps how many distinct entry-page rows the
// "最近访客" panel will return. Combined with the 7-day created_at
// window below, this keeps the panel snappy even on busy sites and
// puts a hard ceiling on the data shipped to the admin UI.
const recentVisitorMaxRows = 1000

// recentVisitorWindowDays bounds the "最近访客" panel to the most
// recent N days of access logs. Older raw rows are still retained
// until rollupRetentionDays kicks in; the panel just hides them.
const recentVisitorWindowDays = 7

func recentVisitorPageWhere() string {
	cutoff := time.Now().Add(-time.Duration(recentVisitorWindowDays) * 24 * time.Hour).Unix()
	return strings.Join([]string{
		"path <> ''",
		"path LIKE '/%'",
		"path NOT LIKE '/api/%'",
		"path NOT LIKE '/admin%'",
		"path NOT LIKE '/uploads/%'",
		"path NOT LIKE '/_next/%'",
		"path NOT LIKE '/themes/%'",
		"path NOT LIKE '/static/%'",
		"path NOT LIKE '/.well-known/%'",
		"path NOT LIKE '/wp-%'",
		"path NOT IN ('/feed', '/feed/', '/rss', '/rss/', '/rss.xml', '/atom.xml', '/xmlrpc.php', '/favicon.ico', '/robots.txt', '/sitemap.xml', '/manifest.json', '/ads.txt')",
		"path !~ '\\.[A-Za-z0-9]{1,8}$'",
		fmt.Sprintf("created_at >= %d", cutoff),
	}, " AND ")
}

func recentVisitorEntryCTE(accessLogTable string) string {
	visitorKey := "COALESCE(NULLIF(fingerprint,''), NULLIF(visitor_id,''), NULLIF(ip,''), id::text)"
	return fmt.Sprintf(`
WITH page_logs AS (
	SELECT id, ip, ip_masked, path, referer_host, browser, browser_version, os, os_version, device_type,
		country_name, country, region, city, duration, visitor_id, fingerprint, created_at,
		%s AS visitor_key
	FROM %s
	WHERE %s
),
ordered AS (
	SELECT *,
		LAG(created_at) OVER (PARTITION BY visitor_key ORDER BY created_at ASC, id ASC) AS prev_created_at
	FROM page_logs
),
marked AS (
	SELECT *,
		CASE WHEN prev_created_at IS NULL OR created_at - prev_created_at > 1800 THEN 1 ELSE 0 END AS new_session
	FROM ordered
),
sessions AS (
	SELECT *,
		SUM(new_session) OVER (PARTITION BY visitor_key ORDER BY created_at ASC, id ASC) AS session_no
	FROM marked
),
latest_session AS (
	SELECT *,
		MAX(session_no) OVER (PARTITION BY visitor_key) AS latest_session_no,
		MAX(created_at) OVER (PARTITION BY visitor_key, session_no) AS session_last_at
	FROM sessions
),
session_rows AS (
	SELECT *,
		MIN(created_at) OVER (PARTITION BY visitor_key, session_no) AS session_start_at,
		MAX(created_at) OVER (PARTITION BY visitor_key, session_no) AS session_end_at,
		GREATEST(
			COALESCE(SUM(CASE WHEN COALESCE(duration,0) > 0 THEN duration ELSE 0 END) OVER (PARTITION BY visitor_key, session_no), 0),
			MAX(created_at) OVER (PARTITION BY visitor_key, session_no) - MIN(created_at) OVER (PARTITION BY visitor_key, session_no)
		)::int AS session_duration,
		ROW_NUMBER() OVER (PARTITION BY visitor_key, session_no ORDER BY created_at ASC, id ASC) AS entry_rank
	FROM latest_session
),
entry_logs AS (
	SELECT id, ip, ip_masked, path, referer_host, browser, browser_version, os, os_version, device_type,
		country_name, country, region, city, session_duration AS duration, visitor_id, fingerprint,
		session_start_at AS created_at, session_end_at AS session_last_at, visitor_key, session_no, entry_rank
	FROM session_rows
	WHERE session_no = latest_session_no AND entry_rank = 1
)
`, visitorKey, accessLogTable, recentVisitorPageWhere())
}

// RecentVisitors returns paginated visitors with comment author matching
func RecentVisitors(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "10"))
	if perPage <= 0 || perPage > 100 {
		perPage = 10
	}
	offset := (page - 1) * perPage
	t := config.T
	entryCTE := recentVisitorEntryCTE(t("access_logs"))

	type Visitor struct {
		ID          int    `db:"id" json:"id"`
		IP          string `db:"ip" json:"ip"`
		IPMasked    string `db:"ip_masked" json:"ip_masked"`
		Path        string `db:"path" json:"path"`
		Referer     string `db:"referer_host" json:"referer"`
		Browser     string `db:"browser" json:"browser"`
		BrowserVer  string `db:"browser_version" json:"browser_version"`
		OS          string `db:"os" json:"os"`
		OSVer       string `db:"os_version" json:"os_version"`
		Device      string `db:"device_type" json:"device"`
		Country     string `db:"country_name" json:"country"`
		CountryCode string `db:"country" json:"country_code"`
		Region      string `db:"region" json:"region"`
		City        string `db:"city" json:"city"`
		Duration    int    `db:"duration" json:"duration"`
		VisitorID   string `db:"visitor_id" json:"visitor_id"`
		Fingerprint string `db:"fingerprint" json:"fingerprint"`
		CreatedAt   int64  `db:"created_at" json:"created_at"`
	}

	var total int
	config.DB.Get(&total, entryCTE+"SELECT COUNT(*) FROM entry_logs WHERE entry_rank = 1")
	// Cap displayed total + offset to recentVisitorMaxRows. The 7-day
	// WHERE filter inside the CTE already prunes the bulk; this hard
	// ceiling stops a noisy week from blowing past a thousand rows.
	if total > recentVisitorMaxRows {
		total = recentVisitorMaxRows
	}
	if offset >= total {
		// Past the cap — return empty page rather than spending a CTE
		// cycle to compute rows that won't render.
		util.Paginate(c, []map[string]interface{}{}, total, page, perPage)
		return
	}
	limit := perPage
	if offset+limit > recentVisitorMaxRows {
		limit = recentVisitorMaxRows - offset
	}

	var visitors []Visitor
	config.DB.Select(&visitors, entryCTE+
		`SELECT id, ip, ip_masked, path, referer_host, browser, browser_version, os, os_version, device_type,
			COALESCE(country_name,'') as country_name, COALESCE(country,'') as country,
			COALESCE(region,'') as region, COALESCE(city,'') as city, COALESCE(duration,0) as duration,
			COALESCE(visitor_id,'') as visitor_id, COALESCE(fingerprint,'') as fingerprint, created_at
		FROM entry_logs
		WHERE entry_rank = 1
		ORDER BY session_last_at DESC, id DESC
		LIMIT $1 OFFSET $2`,
		limit, offset)

	// Match visitors to comment authors: visitor_id > IP
	type authorInfo struct{ Name, Email, Avatar string }
	type MatchedVisitor struct {
		Visitor
		AuthorName   string `json:"author_name,omitempty"`
		AuthorEmail  string `json:"author_email,omitempty"`
		AuthorAvatar string `json:"author_avatar,omitempty"`
	}

	resolveAuthor := func(name, email string) authorInfo {
		avatar := ""
		if email != "" {
			hash := fmt.Sprintf("%x", md5.Sum([]byte(strings.TrimSpace(strings.ToLower(email)))))
			avatar = "https://gravatar.bluecdn.com/avatar/" + hash + "?s=64&d=mp"
		}
		return authorInfo{name, email, avatar}
	}

	// Cache to avoid duplicate queries
	cache := map[string]*authorInfo{}
	findAuthor := func(vid, ip string) *authorInfo {
		// Priority 1: visitor_id match
		if vid != "" {
			if a, ok := cache["vid:"+vid]; ok {
				return a
			}
			var name, email string
			err := config.DB.QueryRow(fmt.Sprintf(
				"SELECT author_name, COALESCE(author_email,'') FROM %s WHERE visitor_id = $1 AND visitor_id != '' ORDER BY created_at DESC LIMIT 1",
				t("comments")), vid).Scan(&name, &email)
			if err == nil && name != "" {
				a := resolveAuthor(name, email)
				cache["vid:"+vid] = &a
				return &a
			}
			cache["vid:"+vid] = nil
		}
		// Priority 2: IP match
		if a, ok := cache["ip:"+ip]; ok {
			return a
		}
		var name, email string
		err := config.DB.QueryRow(fmt.Sprintf(
			"SELECT author_name, COALESCE(author_email,'') FROM %s WHERE author_ip = $1 ORDER BY created_at DESC LIMIT 1",
			t("comments")), ip).Scan(&name, &email)
		if err == nil && name != "" {
			a := resolveAuthor(name, email)
			cache["ip:"+ip] = &a
			return &a
		}
		cache["ip:"+ip] = nil
		return nil
	}

	result := make([]MatchedVisitor, len(visitors))
	for i, v := range visitors {
		result[i] = MatchedVisitor{Visitor: v}
		if a := findAuthor(v.VisitorID, v.IP); a != nil {
			result[i].AuthorName = a.Name
			result[i].AuthorEmail = a.Email
			result[i].AuthorAvatar = a.Avatar
		}
	}

	util.Paginate(c, result, total, page, perPage)
}

// TrackDuration updates the duration of a recent access log entry
func TrackDuration(c *gin.Context) {
	var req struct {
		Path     string `json:"path" binding:"required"`
		Duration int    `json:"duration" binding:"required"` // seconds
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "path and duration required")
		return
	}

	// v2.2.0: 不再 skip 管理员

	ip := c.Request.Header.Get("CF-Connecting-IP")
	if ip == "" {
		ip = c.Request.Header.Get("X-Real-IP")
	}
	if ip == "" {
		ip = c.ClientIP()
	}

	// Update the most recent access log for this IP + path
	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET duration = $1 WHERE id = (SELECT id FROM %s WHERE ip = $2 AND path = $3 ORDER BY created_at DESC LIMIT 1)",
		config.T("access_logs"), config.T("access_logs")), req.Duration, ip, req.Path)

	util.Success(c, gin.H{"ok": true})
}

// DashboardStats returns all stats needed for dashboard cards
func DashboardStats(c *gin.Context) {
	t := config.T

	var postCount, commentCount, linkCount, categoryCount, tagCount int
	config.DB.Get(&postCount, "SELECT COUNT(*) FROM "+t("posts")+" WHERE status='publish' AND type='post'")
	config.DB.Get(&commentCount, "SELECT COUNT(*) FROM "+t("comments")+" WHERE status='approved'")
	config.DB.Get(&linkCount, "SELECT COUNT(*) FROM "+t("links"))
	config.DB.Get(&categoryCount, "SELECT COUNT(*) FROM "+t("metas")+" WHERE type='category'")
	config.DB.Get(&tagCount, "SELECT COUNT(*) FROM "+t("metas")+" WHERE type='tag'")

	// DB-sourced count so admin dashboard never shows a stale Redis value
	var totalViews int
	config.DB.Get(&totalViews, "SELECT COUNT(*) FROM "+t("access_logs"))

	var totalWords int
	config.DB.Get(&totalWords, "SELECT COALESCE(SUM(word_count),0) FROM "+t("posts")+" WHERE status='publish' AND type='post'")

	// Days since
	var siteSince string
	config.DB.Get(&siteSince, "SELECT COALESCE(value,'') FROM "+t("options")+" WHERE name='site_since'")
	var sinceTime int64
	if siteSince != "" {
		if parsed, err := siteclock.ParseDate(siteSince); err == nil {
			sinceTime = parsed.Unix()
		}
	}
	if sinceTime == 0 {
		config.DB.Get(&sinceTime, "SELECT COALESCE(MIN(created_at),0) FROM "+t("posts")+" WHERE status='publish'")
	}
	days := 0
	if sinceTime > 0 {
		days = int((siteclock.Now().Unix()-sinceTime)/86400) + 1
	}

	// 30-day trend — visits (PV, total requests) and visitors (UV, distinct IPs)
	type dayCount struct {
		Date     string `db:"date" json:"date"`
		Count    int    `db:"count" json:"count"` // kept for backward-compat (same as visits)
		Visits   int    `db:"visits" json:"visits"`
		Visitors int    `db:"visitors" json:"visitors"`
	}
	var trend []dayCount
	d30ago := time.Now().Add(-30 * 24 * time.Hour).Unix()
	tzName := siteclock.Name()
	config.DB.Select(&trend, fmt.Sprintf(
		"SELECT TO_CHAR(TO_TIMESTAMP(created_at) AT TIME ZONE $1, 'MM-DD') as date, COUNT(*) as count, COUNT(*) as visits, COUNT(DISTINCT COALESCE(NULLIF(visitor_id,''), ip)) as visitors FROM %s WHERE created_at >= $2 GROUP BY date ORDER BY date",
		t("access_logs")), tzName, d30ago)

	// Today visits
	todayStart := siteclock.TodayStartUnix()
	var todayVisits int
	config.DB.Get(&todayVisits, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE created_at >= $1", t("access_logs")), todayStart)

	// Redis status
	redisStatus := gin.H{"enabled": false}
	if config.RDB != nil {
		redisStatus["enabled"] = true
		if info, err := config.RDB.Info(config.Ctx, "server").Result(); err == nil {
			for _, line := range strings.Split(info, "\n") {
				if strings.HasPrefix(line, "redis_version:") {
					redisStatus["version"] = strings.TrimSpace(strings.TrimPrefix(line, "redis_version:"))
					break
				}
			}
		}
	}

	util.Success(c, gin.H{
		"posts":        postCount,
		"comments":     commentCount,
		"links":        linkCount,
		"categories":   categoryCount,
		"tags":         tagCount,
		"total_views":  totalViews,
		"today_visits": todayVisits,
		"total_words":  totalWords,
		"days":         days,
		"trend":        trend,
		"redis":        redisStatus,
	})
}

// VisitorMapData returns aggregated geo points for the visitor map
func VisitorMapData(c *gin.Context) {
	t := config.T("access_logs")
	period := c.DefaultQuery("period", "30d")

	var since int64
	now := time.Now()
	switch period {
	case "24h":
		since = now.Add(-24 * time.Hour).Unix()
	case "7d":
		since = now.Add(-7 * 24 * time.Hour).Unix()
	case "all":
		since = 0
	default: // 30d
		since = now.Add(-30 * 24 * time.Hour).Unix()
	}

	type mapPoint struct {
		Lat     float64 `db:"lat" json:"lat"`
		Lon     float64 `db:"lon" json:"lon"`
		Country string  `db:"country" json:"country"`
		City    string  `db:"city" json:"city"`
		Code    string  `db:"code" json:"code"`
		Count   int     `db:"count" json:"count"`
	}

	var points []mapPoint
	where := "WHERE latitude != 0 AND longitude != 0"
	args := []interface{}{}
	if since > 0 {
		where += " AND created_at >= $1"
		args = append(args, since)
	}

	q := fmt.Sprintf(
		"SELECT ROUND(latitude::numeric, 1) as lat, ROUND(longitude::numeric, 1) as lon, "+
			"MAX(country_name) as country, MAX(city) as city, MAX(country) as code, COUNT(*) as count "+
			"FROM %s %s GROUP BY lat, lon ORDER BY count DESC LIMIT 500", t, where)

	if len(args) > 0 {
		config.DB.Select(&points, q, args...)
	} else {
		config.DB.Select(&points, q)
	}
	if points == nil {
		points = []mapPoint{}
	}

	util.Success(c, gin.H{"points": points})
}

// CleanupBotLogsPreview returns counts of how many access_log rows
// would be removed by CleanupBotLogs, broken down by category. Lets
// admin see the impact before committing the delete. Read-only.
//
// GET /api/v1/admin/analytics/cleanup-bots/preview
func CleanupBotLogsPreview(c *gin.Context) {
	t := config.T("access_logs")
	var totalRows, botRows, ssrDoublecount int

	config.DB.Get(&totalRows, fmt.Sprintf("SELECT COUNT(*) FROM %s", t))
	config.DB.Get(&botRows, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE %s", t, BotSQLPattern()))
	// SSR double-count: rows written by the old AccessLogger middleware
	// (visitor_id is empty AND fingerprint is empty AND user_agent looks
	// like a real browser — short-UA bots already covered by botRows).
	// These were written alongside the legitimate /track row from the
	// browser, inflating "unique visitors" via DISTINCT ip fallback.
	config.DB.Get(&ssrDoublecount, fmt.Sprintf(
		`SELECT COUNT(*) FROM %s
		 WHERE COALESCE(visitor_id,'') = ''
		   AND COALESCE(fingerprint,'') = ''
		   AND user_agent IS NOT NULL
		   AND LENGTH(user_agent) >= 15
		   AND NOT (%s)`, t, BotSQLPattern()))

	util.Success(c, gin.H{
		"total_rows":      totalRows,
		"bot_rows":        botRows,
		"ssr_doublecount": ssrDoublecount,
		"will_remove":     botRows + ssrDoublecount,
		"will_keep":       totalRows - botRows - ssrDoublecount,
	})
}

// CleanupBotLogs removes the rows identified by CleanupBotLogsPreview:
//
//  1. Bot-UA hits (BotSQLPattern — Mozilla/5.0 too short, "bot/crawler/spider"
//     anywhere in UA, social fetcher, AI scraper, headless framework, etc.)
//  2. SSR double-count (visitor_id=” AND fingerprint=” on real-browser UA —
//     the old middleware writes pre-fix where the same visit was counted twice
//     because the /track POST also wrote a row with the real visitor_id).
//
// POST /api/v1/admin/analytics/cleanup-bots
func CleanupBotLogs(c *gin.Context) {
	t := config.T("access_logs")

	res, err := config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE %s", t, BotSQLPattern()))
	if err != nil {
		util.Error(c, 500, "DB_ERROR", err.Error())
		return
	}
	botDel, _ := res.RowsAffected()

	res, err = config.DB.Exec(fmt.Sprintf(
		`DELETE FROM %s
		 WHERE COALESCE(visitor_id,'') = ''
		   AND COALESCE(fingerprint,'') = ''
		   AND user_agent IS NOT NULL
		   AND LENGTH(user_agent) >= 15
		   AND NOT (%s)`, t, BotSQLPattern()))
	if err != nil {
		util.Error(c, 500, "DB_ERROR", err.Error())
		return
	}
	ssrDel, _ := res.RowsAffected()

	util.Success(c, gin.H{
		"deleted_bot":             botDel,
		"deleted_ssr_doublecount": ssrDel,
		"deleted_total":           botDel + ssrDel,
	})
}
