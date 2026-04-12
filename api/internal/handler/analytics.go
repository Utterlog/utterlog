package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// Middleware to log access
func AccessLogger() gin.HandlerFunc {
	return func(c *gin.Context) {
		// Skip API and static paths
		path := c.Request.URL.Path
		if strings.HasPrefix(path, "/api/") || strings.HasPrefix(path, "/uploads/") || strings.HasPrefix(path, "/_next/") {
			c.Next(); return
		}

		c.Next()

		// Get real IP: CF-Connecting-IP > X-Real-IP > X-Forwarded-For > ClientIP
		realIP := c.Request.Header.Get("CF-Connecting-IP")
		if realIP == "" { realIP = c.Request.Header.Get("X-Real-IP") }
		if realIP == "" { realIP = c.ClientIP() }
		go logAccess(realIP, path, c.Request.Method, c.Request.Referer(), c.Request.UserAgent(), c.Request.Header.Get("X-Forwarded-For"))
	}
}

func logAccess(ip, path, method, referer, ua, xff string) {
	// Priority: CF-Connecting-IP > X-Real-IP > X-Forwarded-For > RemoteAddr
	if xff != "" { ip = strings.TrimSpace(strings.Split(xff, ",")[0]) }

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
	config.DB.Exec(fmt.Sprintf(
		"INSERT INTO %s (ip, ip_masked, path, method, referer, referer_host, user_agent, device_type, browser, browser_version, os, os_version, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
		t), ip, ipMasked, path, method, referer, refHost, ua, device, browser, browserVer, os, osVer, time.Now().Unix())
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

	// Summary stats
	var totalVisits, uniqueIPs int
	config.DB.Get(&totalVisits, fmt.Sprintf("SELECT COUNT(*) FROM %s %s", t, where))
	config.DB.Get(&uniqueIPs, fmt.Sprintf("SELECT COUNT(DISTINCT ip) FROM %s %s", t, where))

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

	resp, err := http.Get("https://api.cnip.io/geoip?ip=" + ip)
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
		resp, err := http.Get("https://api.cnip.io/geoip?ip=" + item.IP)
		if err != nil { continue }
		var geo struct {
			CountryCode string  `json:"country_code"`
			Country     string  `json:"country"`
			Region      string  `json:"province"`
			City        string  `json:"city"`
			Lat         float64 `json:"latitude"`
			Lon         float64 `json:"longitude"`
		}
		json.NewDecoder(resp.Body).Decode(&geo)
		resp.Body.Close()

		if geo.CountryCode != "" {
			config.DB.Exec(fmt.Sprintf(
				"UPDATE %s SET country=$1, country_name=$2, region=$3, city=$4, latitude=$5, longitude=$6 WHERE ip=$7",
				t), strings.ToLower(geo.CountryCode), geo.Country, geo.Region, geo.City, geo.Lat, geo.Lon, item.IP)
			enriched++
		}
		time.Sleep(200 * time.Millisecond) // Rate limit
	}

	util.Success(c, gin.H{"enriched": enriched})
}

// Recent access logs
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
