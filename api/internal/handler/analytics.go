package handler

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
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
				c.Next(); return
			}
		}
		// Skip anything with a file extension — all real pages are
		// extensionless, all assets have one. Keeps bot-scanned junk
		// like /wp-login.php, /.env.bak, /config.json out.
		if i := strings.LastIndex(path, "."); i > 0 {
			if ext := strings.ToLower(path[i:]); assetExt[ext] {
				c.Next(); return
			}
			// Unknown extension (.php, .asp, .env, etc.) — treat as
			// scanner noise, skip.
			c.Next(); return
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

func logAccess(ip, path, method, referer, ua, xff, visitorID, fingerprint string) {
	// Bot early-out — never write bot traffic to access_logs. This is
	// the single chokepoint for both the AccessLogger middleware and
	// the explicit /track POST, so one check here keeps crawlers,
	// monitoring probes, and scripting libraries entirely out of the
	// dataset (no row to purge, no GeoIP fetch, no Redis mark-online).
	if IsBot(ua) {
		return
	}

	// Priority: CF-Connecting-IP > X-Real-IP > X-Forwarded-For > RemoteAddr
	if xff != "" { ip = strings.TrimSpace(strings.Split(xff, ",")[0]) }

	// Session dedup: if this visitor_id (or IP when vid is empty) has
	// already been recorded on this exact path in the last 30 seconds,
	// drop the new row. Protects against React StrictMode double-effect,
	// navigation jitter, and legitimate refreshes that would otherwise
	// inflate "最近访客" with identical rows on every F5.
	now := time.Now().Unix()
	dedupKey := visitorID
	if dedupKey == "" { dedupKey = ip }
	if dedupKey != "" {
		var existing int
		config.DB.Get(&existing, fmt.Sprintf(
			"SELECT COUNT(*) FROM %s WHERE path = $1 AND COALESCE(NULLIF(visitor_id,''), ip) = $2 AND created_at >= $3",
			config.T("access_logs")), path, dedupKey, now-30)
		if existing > 0 {
			return
		}
	}

	// Behavioral bot gate — catches crawlers that spoof a real browser
	// UA (so IsBot() misses them) by looking at request rate. A human
	// reader almost never opens 8+ distinct pages inside 60s; a tag /
	// archive scraper routinely does. Once an IP trips the gate we
	// stop logging them for the rest of the minute, which keeps the
	// access_logs table clean without a background cleanup job.
	if dedupKey != "" {
		var recent int
		config.DB.Get(&recent, fmt.Sprintf(
			"SELECT COUNT(*) FROM %s WHERE COALESCE(NULLIF(visitor_id,''), ip) = $1 AND created_at >= $2",
			config.T("access_logs")), dedupKey, now-60)
		if recent >= 8 {
			return
		}
	}

	device, browser, browserVer, os, osVer := parseUserAgent(ua)
	refHost := ""
	if referer != "" {
		parts := strings.SplitN(referer, "//", 2)
		if len(parts) > 1 { refHost = strings.Split(parts[1], "/")[0] }
	}

	// Mask IP
	ipParts := strings.Split(ip, ".")
	ipMasked := ip
	if len(ipParts) == 4 { ipMasked = ipParts[0] + "." + ipParts[1] + ".*.*" }

	t := config.T("access_logs")
	var logID int
	config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (ip, ip_masked, path, method, referer, referer_host, user_agent, device_type, browser, browser_version, os, os_version, visitor_id, fingerprint, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id",
		t), ip, ipMasked, path, method, referer, refHost, ua, device, browser, browserVer, os, osVer, visitorID, fingerprint, now).Scan(&logID)

	// Async: enrich with GeoIP
	if logID > 0 && ip != "" && ip != "127.0.0.1" {
		go enrichAccessGeo(logID, ip)
	}
}

func enrichAccessGeo(logID int, ip string) {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get("https://api.ipx.ee/ip/" + ip)
	if err != nil { return }
	defer resp.Body.Close()

	var raw struct {
		CountryCode string `json:"country_code"`
		Country     string `json:"country"`
		Province    string `json:"province"`
		City        string `json:"city"`
		Latitude    float64 `json:"latitude"`
		Longitude   float64 `json:"longitude"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil || raw.CountryCode == "" { return }

	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET country=$1, country_name=$2, region=$3, city=$4, latitude=$5, longitude=$6 WHERE id=$7",
		config.T("access_logs")),
		strings.ToLower(raw.CountryCode), raw.Country, raw.Province, raw.City, raw.Latitude, raw.Longitude, logID)
}

// User-Agent parser
func parseUserAgent(ua string) (device, browser, browserVer, os, osVer string) {
	ua = strings.ToLower(ua)
	// Device
	if strings.Contains(ua, "mobile") || strings.Contains(ua, "android") { device = "Mobile" } else
	if strings.Contains(ua, "tablet") || strings.Contains(ua, "ipad") { device = "Tablet" } else { device = "Desktop" }

	// Browser
	if m := regexp.MustCompile(`edg[e/](\d+[\.\d]*)`).FindStringSubmatch(ua); len(m) > 1 { browser = "Edge"; browserVer = m[1] } else
	if m := regexp.MustCompile(`chrome/(\d+[\.\d]*)`).FindStringSubmatch(ua); len(m) > 1 { browser = "Chrome"; browserVer = m[1] } else
	if m := regexp.MustCompile(`firefox/(\d+[\.\d]*)`).FindStringSubmatch(ua); len(m) > 1 { browser = "Firefox"; browserVer = m[1] } else
	if m := regexp.MustCompile(`safari/(\d+[\.\d]*)`).FindStringSubmatch(ua); len(m) > 1 && strings.Contains(ua, "version/") {
		browser = "Safari"; if vm := regexp.MustCompile(`version/(\d+[\.\d]*)`).FindStringSubmatch(ua); len(vm) > 1 { browserVer = vm[1] }
	} else { browser = "Other" }

	// OS
	if strings.Contains(ua, "windows") { os = "Windows"
		if m := regexp.MustCompile(`windows nt (\d+\.\d+)`).FindStringSubmatch(ua); len(m) > 1 { osVer = m[1] }
	} else if strings.Contains(ua, "mac os") { os = "macOS"
		if m := regexp.MustCompile(`mac os x (\d+[_.\d]*)`).FindStringSubmatch(ua); len(m) > 1 { osVer = strings.ReplaceAll(m[1], "_", ".") }
	} else if strings.Contains(ua, "linux") { os = "Linux"
	} else if strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") { os = "iOS"
		if m := regexp.MustCompile(`os (\d+[_.\d]*)`).FindStringSubmatch(ua); len(m) > 1 { osVer = strings.ReplaceAll(m[1], "_", ".") }
	} else if strings.Contains(ua, "android") { os = "Android"
		if m := regexp.MustCompile(`android (\d+[\.\d]*)`).FindStringSubmatch(ua); len(m) > 1 { osVer = m[1] }
	} else { os = "Other" }

	return
}

// Analytics dashboard data
func AnalyticsOverview(c *gin.Context) {
	period := c.DefaultQuery("period", "24h")
	t := config.T("access_logs")

	var since int64
	switch period {
	case "24h": since = time.Now().Add(-24 * time.Hour).Unix()
	case "7d": since = time.Now().Add(-7 * 24 * time.Hour).Unix()
	case "30d": since = time.Now().Add(-30 * 24 * time.Hour).Unix()
	default: since = 0
	}

	where := ""
	if since > 0 { where = fmt.Sprintf("WHERE created_at >= %d", since) }

	// Summary stats — "unique visitors" prefers the browser-issued
	// visitor_id over IP so multiple users behind the same NAT don't
	// collapse into one visitor, and a single user clearing cookies
	// doesn't count as a distinct visitor until their IP changes too.
	var totalVisits, uniqueIPs int
	config.DB.Get(&totalVisits, fmt.Sprintf("SELECT COUNT(*) FROM %s %s", t, where))
	config.DB.Get(&uniqueIPs, fmt.Sprintf("SELECT COUNT(DISTINCT COALESCE(NULLIF(visitor_id,''), ip)) FROM %s %s", t, where))

	var uniquePaths int
	config.DB.Get(&uniquePaths, fmt.Sprintf("SELECT COUNT(DISTINCT path) FROM %s %s", t, where))

	// Top pages
	var topPages []struct {
		Path  string `db:"path" json:"path"`
		Count int    `db:"count" json:"count"`
	}
	config.DB.Select(&topPages, fmt.Sprintf("SELECT path, COUNT(*) as count FROM %s %s GROUP BY path ORDER BY count DESC LIMIT 10", t, where))

	// Top referers
	var topReferers []struct {
		Host  string `db:"referer_host" json:"host"`
		Count int    `db:"count" json:"count"`
	}
	config.DB.Select(&topReferers, fmt.Sprintf("SELECT referer_host, COUNT(*) as count FROM %s %s AND referer_host != '' GROUP BY referer_host ORDER BY count DESC LIMIT 10", t, strings.Replace(where, "WHERE", "WHERE 1=1 AND", 1)))

	// Browsers
	var browsers []struct {
		Name  string `db:"browser" json:"name"`
		Count int    `db:"count" json:"count"`
	}
	config.DB.Select(&browsers, fmt.Sprintf("SELECT browser as browser, COUNT(*) as count FROM %s %s GROUP BY browser ORDER BY count DESC LIMIT 10", t, where))

	// OS
	var osList []struct {
		Name  string `db:"os" json:"name"`
		Count int    `db:"count" json:"count"`
	}
	config.DB.Select(&osList, fmt.Sprintf("SELECT os, COUNT(*) as count FROM %s %s GROUP BY os ORDER BY count DESC", t, where))

	// Devices
	var devices []struct {
		Type  string `db:"device_type" json:"type"`
		Count int    `db:"count" json:"count"`
	}
	config.DB.Select(&devices, fmt.Sprintf("SELECT device_type, COUNT(*) as count FROM %s %s GROUP BY device_type ORDER BY count DESC", t, where))

	// Countries
	var countries []struct {
		Country string `db:"country_name" json:"country"`
		Code    string `db:"country" json:"code"`
		Count   int    `db:"count" json:"count"`
	}
	config.DB.Select(&countries, fmt.Sprintf("SELECT country_name, country, COUNT(*) as count FROM %s %s AND country != '' GROUP BY country_name, country ORDER BY count DESC LIMIT 20", t, strings.Replace(where, "WHERE", "WHERE 1=1 AND", 1)))

	// Hourly chart (last 24h)
	var hourly []struct {
		Hour  string `db:"hour" json:"hour"`
		Count int    `db:"count" json:"count"`
	}
	h24ago := time.Now().Add(-24 * time.Hour).Unix()
	config.DB.Select(&hourly, fmt.Sprintf(
		"SELECT TO_CHAR(TO_TIMESTAMP(created_at), 'HH24') as hour, COUNT(*) as count FROM %s WHERE created_at >= $1 GROUP BY hour ORDER BY hour", t), h24ago)

	// Daily chart (last 30d)
	var daily []struct {
		Date  string `db:"date" json:"date"`
		Count int    `db:"count" json:"count"`
	}
	d30ago := time.Now().Add(-30 * 24 * time.Hour).Unix()
	config.DB.Select(&daily, fmt.Sprintf(
		"SELECT TO_CHAR(TO_TIMESTAMP(created_at), 'MM-DD') as date, COUNT(*) as count FROM %s WHERE created_at >= $1 GROUP BY date ORDER BY date", t), d30ago)

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
	config.DB.Select(&recent, fmt.Sprintf("SELECT ip_masked, path, browser, os, device_type, country_name, created_at FROM %s ORDER BY created_at DESC LIMIT 20", t))

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

// GeoIP lookup for a single IP
func GeoIPLookup(c *gin.Context) {
	ip := c.Query("ip")
	if ip == "" { ip = c.ClientIP() }

	resp, err := http.Get("https://api.ipx.ee/ip/" + ip)
	if err != nil { util.Error(c, 502, "GEOIP_ERROR", err.Error()); return }
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
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
		resp, err := http.Get("https://api.ipx.ee/ip/" + item.IP)
		if err != nil { continue }
		var geo struct {
			CountryCode string  `json:"country_code"`
			Country     string  `json:"country"`
			Province    string  `json:"province"`
			City        string  `json:"city"`
			Lat         float64 `json:"latitude"`
			Lon         float64 `json:"longitude"`
		}
		json.NewDecoder(resp.Body).Decode(&geo)
		resp.Body.Close()

		if geo.CountryCode != "" {
			config.DB.Exec(fmt.Sprintf(
				"UPDATE %s SET country=$1, country_name=$2, region=$3, city=$4, latitude=$5, longitude=$6 WHERE ip=$7",
				t), strings.ToLower(geo.CountryCode), geo.Country, geo.Province, geo.City, geo.Lat, geo.Lon, item.IP)
			enriched++
		}
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
		util.BadRequest(c, "path is required"); return
	}

	ua := c.Request.UserAgent()
	// Bot early-out — respond 200 with {ok:true} so bots don't retry,
	// but skip every downstream side-effect (DB insert, post view++,
	// Redis counters, mark-online).
	if IsBot(ua) {
		util.Success(c, gin.H{"ok": true})
		return
	}

	// Get real IP
	realIP := c.Request.Header.Get("CF-Connecting-IP")
	if realIP == "" { realIP = c.Request.Header.Get("X-Real-IP") }
	if realIP == "" { realIP = c.ClientIP() }

	// Async: log access + increment counters via Redis
	go func() {
		logAccess(realIP, req.Path, "GET", req.Referer, ua, c.Request.Header.Get("X-Forwarded-For"), req.VisitorID, req.Fingerprint)

		// Global PV counter + mark online
		IncrTotalViews()
		MarkOnline(req.VisitorID, realIP, req.Path)

		// Per-post view counter — 每次 /track 命中文章 path 就 +1。
		//
		// 历史上这里有 isFirstPostViewToday(visitor+ip 当日去重) 守门，
		// 想做「unique reader 计数」。但实际效果违反用户直觉：
		//   - 文章页前端写死 view_count + 1 做「乐观显示」
		//   - 同访客今天再访问一次 → /track 被 dedup 拦截 → DB 不变
		//   - 但前端照样 +1 → 首页（raw DB）跟文章页（cosmetic +1）数字
		//     永远差 1，看着像统计 bug
		// 用户明确要求「访客点击访问页面就 +1，刷新一次再 +1」—— 不要
		// 任何限制。所以这里直接 always +1，跟 IsBot 早退路径配合
		// （爬虫不进这里），自然规避 bot 干扰。前端可以放心还原 +1
		// cosmetic，因为 /track 必然增量，cosmetic 永远跟 DB 对齐。
		//
		// Path 反向解析按 admin 配的 permalink_structure 模板走，而不是
		// 硬编码 /posts/<slug>。否则 admin 用 /archives/%post_id% 等
		// 模板后 view_count 一直 +0。
		if id, slug := parsePostFromPath(req.Path); id > 0 || slug != "" {
			var postID int
			if id > 0 {
				postID = id
			} else if slug != "" {
				config.DB.Get(&postID, fmt.Sprintf(
					"SELECT id FROM %s WHERE slug = $1 AND status = 'publish'",
					config.T("posts")), slug)
			}
			if postID > 0 {
				IncrPostViews(postID)
			}
		}
	}()

	util.Success(c, gin.H{"ok": true})
}

// permalinkRegexCache caches one compiled regex per template so we
// don't pay the parsePermalink template-compile cost on every /track
// request. Entries are invalidated by template string identity —
// admin changing permalink_structure produces a different cache key.
var permalinkRegexCache sync.Map // template (string) → *permalinkMatcher

type permalinkMatcher struct {
	re     *regexp.Regexp
	tokens []string // token names in capture-group order: postname / post_id / year / month / day / category
}

// parsePostFromPath: 把请求 URL path 按 admin 配置的 permalink_structure
// 模板反向解析出 (post_id, slug)，两者只有一个非零（id 优先）。
// 镜像 web/lib/permalink.ts 的 parsePermalink 实现，但只关心 id/slug。
//
// 模板支持的占位符（来自 frontend lib）:
//   %postname%   — post slug
//   %post_id%    — post numeric id
//   %year%       — 4-digit year
//   %month%      — 2-digit month
//   %day%        — 2-digit day
//   %category%   — first-category slug
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
	tokenRe := regexp.MustCompile(`%(postname|post_id|year|month|day|category)%`)

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
		case "post_id":
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
	if online == nil { online = []map[string]string{} }

	t := config.T

	type OnlineUser struct {
		VisitorID string `json:"visitor_id"`
		IP        string `json:"ip"`
		Path      string `json:"path"`
		Ts        string `json:"ts"`
		Name      string `json:"name,omitempty"`
		Avatar    string `json:"avatar,omitempty"`
		Country   string `json:"country,omitempty"`
		CountryCode string `json:"country_code,omitempty"`
		City      string `json:"city,omitempty"`
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
			if err == nil && name != "" { matched = true }
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
	if online == nil { online = []map[string]string{} }

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
			if len(segs) > 2 { u.IPMasked = segs[0] + ":" + segs[1] + "::*" } else { u.IPMasked = ip }
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
	if logs == nil { logs = []map[string]interface{}{} }
	util.Paginate(c, logs, total, page, perPage)
}

// RecentVisitors returns paginated visitors with comment author matching
func RecentVisitors(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "10"))
	if perPage <= 0 || perPage > 100 { perPage = 10 }
	offset := (page - 1) * perPage
	t := config.T

	type Visitor struct {
		ID         int    `db:"id" json:"id"`
		IP         string `db:"ip" json:"ip"`
		IPMasked   string `db:"ip_masked" json:"ip_masked"`
		Path       string `db:"path" json:"path"`
		Referer    string `db:"referer_host" json:"referer"`
		Browser    string `db:"browser" json:"browser"`
		BrowserVer string `db:"browser_version" json:"browser_version"`
		OS         string `db:"os" json:"os"`
		OSVer      string `db:"os_version" json:"os_version"`
		Device     string `db:"device_type" json:"device"`
		Country    string `db:"country_name" json:"country"`
		CountryCode string `db:"country" json:"country_code"`
		Region     string `db:"region" json:"region"`
		City       string `db:"city" json:"city"`
		Duration    int    `db:"duration" json:"duration"`
		VisitorID   string `db:"visitor_id" json:"visitor_id"`
		Fingerprint string `db:"fingerprint" json:"fingerprint"`
		CreatedAt   int64  `db:"created_at" json:"created_at"`
	}

	var total int
	config.DB.Get(&total, "SELECT COUNT(*) FROM "+t("access_logs"))

	var visitors []Visitor
	config.DB.Select(&visitors, fmt.Sprintf(
		"SELECT id, ip, ip_masked, path, referer_host, browser, browser_version, os, os_version, device_type, COALESCE(country_name,'') as country_name, COALESCE(country,'') as country, COALESCE(region,'') as region, COALESCE(city,'') as city, COALESCE(duration,0) as duration, COALESCE(visitor_id,'') as visitor_id, COALESCE(fingerprint,'') as fingerprint, created_at FROM %s ORDER BY created_at DESC LIMIT $1 OFFSET $2",
		t("access_logs")), perPage, offset)

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
			if a, ok := cache["vid:"+vid]; ok { return a }
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
		if a, ok := cache["ip:"+ip]; ok { return a }
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
		util.BadRequest(c, "path and duration required"); return
	}

	ip := c.Request.Header.Get("CF-Connecting-IP")
	if ip == "" { ip = c.Request.Header.Get("X-Real-IP") }
	if ip == "" { ip = c.ClientIP() }

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
		if parsed, err := time.Parse("2006-01-02", siteSince); err == nil {
			sinceTime = parsed.Unix()
		}
	}
	if sinceTime == 0 {
		config.DB.Get(&sinceTime, "SELECT COALESCE(MIN(created_at),0) FROM "+t("posts")+" WHERE status='publish'")
	}
	days := 0
	if sinceTime > 0 { days = int((time.Now().Unix()-sinceTime)/86400) + 1 }

	// 30-day trend — visits (PV, total requests) and visitors (UV, distinct IPs)
	type dayCount struct {
		Date     string `db:"date" json:"date"`
		Count    int    `db:"count" json:"count"` // kept for backward-compat (same as visits)
		Visits   int    `db:"visits" json:"visits"`
		Visitors int    `db:"visitors" json:"visitors"`
	}
	var trend []dayCount
	d30ago := time.Now().Add(-30 * 24 * time.Hour).Unix()
	config.DB.Select(&trend, fmt.Sprintf(
		"SELECT TO_CHAR(TO_TIMESTAMP(created_at), 'MM-DD') as date, COUNT(*) as count, COUNT(*) as visits, COUNT(DISTINCT COALESCE(NULLIF(visitor_id,''), ip)) as visitors FROM %s WHERE created_at >= $1 GROUP BY date ORDER BY date",
		t("access_logs")), d30ago)

	// Today visits
	todayStart := time.Date(time.Now().Year(), time.Now().Month(), time.Now().Day(), 0, 0, 0, 0, time.Now().Location()).Unix()
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
//  2. SSR double-count (visitor_id='' AND fingerprint='' on real-browser UA —
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
