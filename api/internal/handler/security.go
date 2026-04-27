package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// ===================== CC Rate Limiter =====================

type rateBucket struct {
	count   int
	resetAt time.Time
}

var (
	rateLimits = make(map[string]*rateBucket)
	rateMu     sync.RWMutex
	ccEnabled  = false
	ccLimit5s  = 30  // max requests per 5 seconds
	ccLimit60s = 120 // max requests per 60 seconds
)

var rateLimits60 = make(map[string]*rateBucket)

func CCProtection() gin.HandlerFunc {
	// Cleanup every 60s
	go func() {
		for {
			time.Sleep(60 * time.Second)
			rateMu.Lock()
			now := time.Now()
			for k, v := range rateLimits {
				if now.After(v.resetAt) {
					delete(rateLimits, k)
				}
			}
			for k, v := range rateLimits60 {
				if now.After(v.resetAt) {
					delete(rateLimits60, k)
				}
			}
			rateMu.Unlock()
		}
	}()

	return func(c *gin.Context) {
		if !ccEnabled {
			c.Next()
			return
		}

		// Authenticated admin surface is gated by JWT + role already —
		// CC protection here only creates false-positive lockouts when
		// the dashboard polls (sync progress, analytics, etc). Skip it
		// entirely for /admin/* paths so operators can't ban themselves
		// by using the app normally.
		if strings.HasPrefix(c.Request.URL.Path, "/api/v1/admin/") ||
			strings.HasPrefix(c.Request.URL.Path, "/api/v1/sync/") {
			c.Next()
			return
		}

		ip := getRealIP(c)

		// Check if banned
		if isIPBanned(ip) {
			c.AbortWithStatusJSON(403, gin.H{"error": "IP banned"})
			return
		}

		rateMu.Lock()
		// 5-second bucket
		b5 := rateLimits[ip]
		if b5 == nil || time.Now().After(b5.resetAt) {
			b5 = &rateBucket{count: 0, resetAt: time.Now().Add(5 * time.Second)}
			rateLimits[ip] = b5
		}
		b5.count++

		// 60-second bucket
		b60 := rateLimits60[ip]
		if b60 == nil || time.Now().After(b60.resetAt) {
			b60 = &rateBucket{count: 0, resetAt: time.Now().Add(60 * time.Second)}
			rateLimits60[ip] = b60
		}
		b60.count++
		rateMu.Unlock()

		if b5.count > ccLimit5s || b60.count > ccLimit60s {
			// Log event and increment reputation
			go logSecurityEvent(ip, "cc_block", fmt.Sprintf("5s:%d/60s:%d", b5.count, b60.count), 5)
			c.AbortWithStatusJSON(429, gin.H{"error": "Too many requests"})
			return
		}

		// Update reputation request count
		go updateReputation(ip, 0)

		c.Next()
	}
}

// ===================== GeoIP Blocking =====================

var (
	geoEnabled   = false
	geoMode      = "whitelist"                      // "whitelist" or "blacklist"
	geoCountries = []string{"CN", "HK", "TW", "MO"} // default whitelist
)

func GeoIPBlocking() gin.HandlerFunc {
	return func(c *gin.Context) {
		if !geoEnabled {
			c.Next()
			return
		}

		ip := getRealIP(c)
		country := getIPCountry(ip)
		if country == "" {
			c.Next()
			return
		}

		allowed := false
		countryUpper := strings.ToUpper(country)
		for _, c2 := range geoCountries {
			if strings.ToUpper(c2) == countryUpper {
				allowed = true
				break
			}
		}

		if geoMode == "whitelist" && !allowed {
			go logSecurityEvent(ip, "geoip_block", "country:"+country, 3)
			c.AbortWithStatusJSON(403, gin.H{"error": "Access denied from your region"})
			return
		}
		if geoMode == "blacklist" && allowed {
			go logSecurityEvent(ip, "geoip_block", "country:"+country, 3)
			c.AbortWithStatusJSON(403, gin.H{"error": "Access denied from your region"})
			return
		}

		c.Next()
	}
}

func getIPCountry(ip string) string {
	// Check cache in reputation table first
	var country string
	config.DB.Get(&country, "SELECT country FROM "+config.T("ip_reputation")+" WHERE ip = $1", ip)
	if country != "" {
		return country
	}

	// Fetch from API
	resp, err := http.Get("https://api.ipx.ee/ip/" + ip)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var geo struct {
		CountryCode string `json:"country_code"`
	}
	json.NewDecoder(resp.Body).Decode(&geo)
	return geo.CountryCode
}

// ===================== IP Ban Management =====================

func isIPBanned(ip string) bool {
	var count int
	config.DB.Get(&count, fmt.Sprintf(
		"SELECT COUNT(*) FROM %s WHERE ip = $1 AND (expires_at = 0 OR expires_at > $2)",
		config.T("ip_bans")), ip, time.Now().Unix())
	return count > 0
}

func BanIP(c *gin.Context) {
	var req struct {
		IP       string `json:"ip" binding:"required"`
		Reason   string `json:"reason"`
		Duration int    `json:"duration"` // minutes, 0 = permanent
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "IP 不能为空")
		return
	}

	now := time.Now().Unix()
	expiresAt := int64(0)
	if req.Duration > 0 {
		expiresAt = now + int64(req.Duration*60)
	}

	config.DB.Exec(fmt.Sprintf(
		"INSERT INTO %s (ip, reason, ban_type, duration, expires_at, created_at) VALUES ($1,$2,'manual',$3,$4,$5) ON CONFLICT (ip) DO UPDATE SET reason=$2, duration=$3, expires_at=$4",
		config.T("ip_bans")), req.IP, req.Reason, req.Duration, expiresAt, now)

	go logSecurityEvent(req.IP, "manual_ban", req.Reason, 0)
	util.Success(c, gin.H{"banned": true})
}

func UnbanIP(c *gin.Context) {
	var req struct {
		IP string `json:"ip" binding:"required"`
	}
	c.ShouldBindJSON(&req)
	config.DB.Exec("DELETE FROM "+config.T("ip_bans")+" WHERE ip = $1", req.IP)
	go logSecurityEvent(req.IP, "manual_unban", "", 0)
	util.Success(c, gin.H{"unbanned": true})
}

func ListBans(c *gin.Context) {
	t := config.T("ip_bans")
	var bans []map[string]interface{}
	rows, _ := config.DB.Queryx(fmt.Sprintf("SELECT * FROM %s ORDER BY created_at DESC", t))
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			bans = append(bans, row)
		}
	}
	if bans == nil {
		bans = []map[string]interface{}{}
	}

	// Clean expired bans
	config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE expires_at > 0 AND expires_at < $1", t), time.Now().Unix())

	util.Success(c, bans)
}

// ===================== IP Reputation =====================

func updateReputation(ip string, scoreDelta int) {
	t := config.T("ip_reputation")
	now := time.Now().Unix()
	config.DB.Exec(fmt.Sprintf(
		"INSERT INTO %s (ip, score, request_count, last_seen, updated_at) VALUES ($1,$2,1,$3,$4) ON CONFLICT (ip) DO UPDATE SET score = %s.score + $2, request_count = %s.request_count + 1, last_seen = $3, updated_at = $4",
		t, t, t), ip, scoreDelta, now, now)

	// Update risk level
	if scoreDelta > 0 {
		var score int
		config.DB.Get(&score, "SELECT score FROM "+t+" WHERE ip = $1", ip)
		risk := "safe"
		if score >= 35 {
			risk = "danger"
		} else if score >= 14 {
			risk = "warning"
		}
		config.DB.Exec("UPDATE "+t+" SET risk_level = $1 WHERE ip = $2", risk, ip)

		// Auto-ban at high score
		if score >= 35 {
			config.DB.Exec(fmt.Sprintf(
				"INSERT INTO %s (ip, reason, ban_type, duration, expires_at, created_at) VALUES ($1,'auto:high_score','auto',60,$2,$3) ON CONFLICT (ip) DO NOTHING",
				config.T("ip_bans")), ip, now+3600, now)
		}
	}
}

func logSecurityEvent(ip, eventType, detail string, scoreDelta int) {
	config.DB.Exec(fmt.Sprintf(
		"INSERT INTO %s (ip, event_type, detail, score_delta, created_at) VALUES ($1,$2,$3,$4,$5)",
		config.T("security_events")), ip, eventType, detail, scoreDelta, time.Now().Unix())
	if scoreDelta > 0 {
		updateReputation(ip, scoreDelta)
	}
}

func ListReputation(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage := 30
	t := config.T("ip_reputation")

	var total int
	config.DB.Get(&total, "SELECT COUNT(*) FROM "+t)

	var reps []map[string]interface{}
	rows, _ := config.DB.Queryx(fmt.Sprintf("SELECT * FROM %s ORDER BY score DESC LIMIT $1 OFFSET $2", t), perPage, (page-1)*perPage)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			reps = append(reps, row)
		}
	}
	if reps == nil {
		reps = []map[string]interface{}{}
	}
	util.Paginate(c, reps, total, page, perPage)
}

func ResetReputation(c *gin.Context) {
	var req struct {
		IP string `json:"ip" binding:"required"`
	}
	c.ShouldBindJSON(&req)
	config.DB.Exec("UPDATE "+config.T("ip_reputation")+" SET score = 0, risk_level = 'safe' WHERE ip = $1", req.IP)
	util.Success(c, gin.H{"reset": true})
}

// ===================== Security Events Timeline =====================

func SecurityTimeline(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage := 50
	ip := c.Query("ip")
	t := config.T("security_events")

	where := ""
	args := []interface{}{}
	idx := 1
	if ip != "" {
		where = fmt.Sprintf("WHERE ip = $%d", idx)
		args = append(args, ip)
		idx++
	}

	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s %s", t, where), args...)

	args = append(args, perPage, (page-1)*perPage)
	var events []map[string]interface{}
	rows, _ := config.DB.Queryx(fmt.Sprintf("SELECT * FROM %s %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d", t, where, idx, idx+1), args...)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			events = append(events, row)
		}
	}
	if events == nil {
		events = []map[string]interface{}{}
	}
	util.Paginate(c, events, total, page, perPage)
}

// ===================== Security Settings =====================

func GetSecuritySettings(c *gin.Context) {
	util.Success(c, gin.H{
		"cc_enabled":    ccEnabled,
		"cc_limit_5s":   ccLimit5s,
		"cc_limit_60s":  ccLimit60s,
		"geo_enabled":   geoEnabled,
		"geo_mode":      geoMode,
		"geo_countries": geoCountries,
	})
}

func UpdateSecuritySettings(c *gin.Context) {
	var req struct {
		CCEnabled    *bool    `json:"cc_enabled"`
		CCLimit5s    *int     `json:"cc_limit_5s"`
		CCLimit60s   *int     `json:"cc_limit_60s"`
		GeoEnabled   *bool    `json:"geo_enabled"`
		GeoMode      *string  `json:"geo_mode"`
		GeoCountries []string `json:"geo_countries"`
	}
	c.ShouldBindJSON(&req)

	if req.CCEnabled != nil {
		ccEnabled = *req.CCEnabled
	}
	if req.CCLimit5s != nil {
		ccLimit5s = *req.CCLimit5s
	}
	if req.CCLimit60s != nil {
		ccLimit60s = *req.CCLimit60s
	}
	if req.GeoEnabled != nil {
		geoEnabled = *req.GeoEnabled
	}
	if req.GeoMode != nil {
		geoMode = *req.GeoMode
	}
	if req.GeoCountries != nil {
		geoCountries = req.GeoCountries
	}

	// Persist to options
	save := func(k, v string) {
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (name, value, created_at, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (name) DO UPDATE SET value=$2, updated_at=$4",
			config.T("options")), k, v, 0, time.Now().Unix())
	}
	save("cc_enabled", fmt.Sprintf("%v", ccEnabled))
	save("cc_limit_5s", fmt.Sprintf("%d", ccLimit5s))
	save("cc_limit_60s", fmt.Sprintf("%d", ccLimit60s))
	save("geo_enabled", fmt.Sprintf("%v", geoEnabled))
	save("geo_mode", geoMode)
	save("geo_countries", strings.Join(geoCountries, ","))

	util.Success(c, gin.H{"saved": true})
}

// Security overview stats
func SecurityOverview(c *gin.Context) {
	t := config.T
	now := time.Now().Unix()
	h24 := now - 86400

	var totalBans, activeBans, totalEvents, events24h, totalIPs, riskyIPs int
	config.DB.Get(&totalBans, "SELECT COUNT(*) FROM "+t("ip_bans"))
	config.DB.Get(&activeBans, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE expires_at = 0 OR expires_at > $1", t("ip_bans")), now)
	config.DB.Get(&totalEvents, "SELECT COUNT(*) FROM "+t("security_events"))
	config.DB.Get(&events24h, "SELECT COUNT(*) FROM "+t("security_events")+" WHERE created_at >= $1", h24)
	config.DB.Get(&totalIPs, "SELECT COUNT(*) FROM "+t("ip_reputation"))
	config.DB.Get(&riskyIPs, "SELECT COUNT(*) FROM "+t("ip_reputation")+" WHERE risk_level != 'safe'")

	util.Success(c, gin.H{
		"total_bans":   totalBans,
		"active_bans":  activeBans,
		"total_events": totalEvents,
		"events_24h":   events24h,
		"tracked_ips":  totalIPs,
		"risky_ips":    riskyIPs,
		"cc_enabled":   ccEnabled,
		"geo_enabled":  geoEnabled,
	})
}

// ===================== Helpers =====================

func getRealIP(c *gin.Context) string {
	if ip := c.Request.Header.Get("CF-Connecting-IP"); ip != "" {
		return ip
	}
	if ip := c.Request.Header.Get("X-Real-IP"); ip != "" {
		return ip
	}
	return c.ClientIP()
}

func init() {
	// Load security settings from DB on startup
	go func() {
		time.Sleep(2 * time.Second) // wait for DB init
		if v := model.GetOption("cc_enabled"); v != "" {
			ccEnabled = v == "true"
		}
		if v := model.GetOption("cc_limit_5s"); v != "" {
			ccLimit5s, _ = strconv.Atoi(v)
		}
		if v := model.GetOption("cc_limit_60s"); v != "" {
			ccLimit60s, _ = strconv.Atoi(v)
		}
		if v := model.GetOption("geo_enabled"); v == "true" {
			geoEnabled = true
		}
		if v := model.GetOption("geo_mode"); v != "" {
			geoMode = v
		}
		if v := model.GetOption("geo_countries"); v != "" {
			geoCountries = strings.Split(v, ",")
		}
	}()
}
