package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/i18n"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// Generic CRUD handlers for simple tables

// Tables whose string columns should be HTML-unescaped on read.
// Typecho / WordPress exports store user-entered titles/names with
// their own entity encoding (Kevin&#039;s instead of Kevin's), which
// reads fine in those platforms because their themes decode before
// render but renders as literal garbage text in a React JSX {value}.
// Rather than push the fix to every theme + the admin SPA, clean on
// the API boundary so everyone downstream sees real Unicode.
var htmlUnescapeTables = map[string][]string{
	"links": {"name", "description", "group_name"},
}

// unescapeRow mutates string fields in-place for the given table's
// whitelist. A no-op when the table isn't listed or fields are already
// clean (html.UnescapeString returns the input unchanged for text
// without entities).
func unescapeRow(table string, row map[string]interface{}) {
	fields, ok := htmlUnescapeTables[table]
	if !ok {
		return
	}
	for _, f := range fields {
		if v, has := row[f]; has {
			if s, isStr := v.(string); isStr {
				row[f] = html.UnescapeString(s)
			}
		}
	}
}

func GenericList(table string) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
		orderBy := ""
		if table == "links" {
			orderBy = "CASE WHEN order_num > 0 THEN order_num ELSE id END ASC, id ASC"
		}
		items, total, _ := model.GenericList(table, page, perPage, orderBy)
		if _, ok := htmlUnescapeTables[table]; ok {
			for _, row := range items {
				unescapeRow(table, row)
			}
		}
		util.Paginate(c, items, total, page, perPage)
	}
}

func GenericGet(table string) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		row := make(map[string]interface{})
		err := config.DB.QueryRowx(fmt.Sprintf("SELECT * FROM %s WHERE id = $1", config.T(table)), id).MapScan(row)
		if err != nil {
			util.NotFound(c, table)
			return
		}
		util.Success(c, row)
	}
}

func GenericDelete(table string) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE id = $1", config.T(table)), id)
		util.Success(c, nil)
	}
}

// Options
func ListOptions(c *gin.Context) {
	t := config.T("options")
	var opts []model.Option
	config.DB.Select(&opts, "SELECT * FROM "+t+" ORDER BY name ASC")
	result := make(map[string]string)
	for _, o := range opts {
		result[o.Name] = o.Value
	}
	util.Success(c, result)
}

func UpdateOptions(c *gin.Context) {
	var req map[string]interface{}
	c.ShouldBindJSON(&req)
	t := config.T("options")

	// Capture pre-save site_url so we can migrate references in DB
	// (cover URLs, media URLs) when the admin changes the site origin —
	// e.g. https://www.example.com → https://example.com. Prevents the
	// "I edited site_url but my old www links still show" footgun.
	oldSiteURL := model.GetOption("site_url")

	for k, v := range req {
		val := fmt.Sprintf("%v", v)
		config.DB.Exec(fmt.Sprintf("INSERT INTO %s (name, value, created_at, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO UPDATE SET value = $2, updated_at = $4", t),
			k, val, 0, 0)
	}

	if rawNew, ok := req["site_url"]; ok {
		newSiteURL := fmt.Sprintf("%v", rawNew)
		migrateSiteOrigin(oldSiteURL, newSiteURL)
	}

	util.Success(c, nil)
}

// migrateSiteOrigin rewrites absolute URLs in user-data tables when the
// admin changes the site_url's origin (scheme + host + port). Local uploads
// are normalized to /uploads/... so future domain changes do not touch them.
// Other cover/media URLs under the old origin still move to the new origin.
// Post bodies are only touched for the strict oldOrigin/uploads/ prefix,
// leaving quoted third-party links and plain old-domain links intact.
func migrateSiteOrigin(oldVal, newVal string) {
	oldOrigin := normaliseOrigin(oldVal)
	newOrigin := normaliseOrigin(newVal)
	if oldOrigin == "" || newOrigin == "" || oldOrigin == newOrigin {
		return
	}
	if config.DB == nil {
		return
	}
	// Trailing slash insulates against accidentally rewriting an
	// origin that's a prefix of another one (https://foo.com vs
	// https://foo.com.attacker.io). The pattern matches `oldOrigin/`
	// only, then REPLACE drops the slash too — substituting the
	// origin alone keeps every path/query character intact.
	likePat := oldOrigin + "/%"
	oldUploads := oldOrigin + "/uploads/"
	uploadsLike := oldUploads + "%"
	posts := config.T("posts")
	media := config.T("media")

	res, err := config.DB.Exec(
		fmt.Sprintf("UPDATE %s SET content = REPLACE(content, $1, $2) WHERE content LIKE $3", posts),
		oldUploads, "/uploads/", "%"+oldUploads+"%",
	)
	if err == nil {
		n, _ := res.RowsAffected()
		log.Printf("[site_url-migrate] %s.content uploads: %d rows %s → /uploads/", posts, n, oldUploads)
	}
	res, err = config.DB.Exec(
		fmt.Sprintf("UPDATE %s SET cover_url = REPLACE(cover_url, $1, $2) WHERE cover_url LIKE $3", posts),
		oldUploads, "/uploads/", uploadsLike,
	)
	if err == nil {
		n, _ := res.RowsAffected()
		log.Printf("[site_url-migrate] %s.cover_url uploads: %d rows %s → /uploads/", posts, n, oldUploads)
	}
	res, err = config.DB.Exec(
		fmt.Sprintf("UPDATE %s SET url = REPLACE(url, $1, $2) WHERE url LIKE $3", media),
		oldUploads, "/uploads/", uploadsLike,
	)
	if err == nil {
		n, _ := res.RowsAffected()
		log.Printf("[site_url-migrate] %s.url uploads: %d rows %s → /uploads/", media, n, oldUploads)
	}

	res, err = config.DB.Exec(
		fmt.Sprintf("UPDATE %s SET cover_url = REPLACE(cover_url, $1, $2) WHERE cover_url LIKE $3", posts),
		oldOrigin, newOrigin, likePat,
	)
	if err == nil {
		n, _ := res.RowsAffected()
		log.Printf("[site_url-migrate] %s.cover_url: %d rows %s → %s", posts, n, oldOrigin, newOrigin)
	}
	res, err = config.DB.Exec(
		fmt.Sprintf("UPDATE %s SET url = REPLACE(url, $1, $2) WHERE url LIKE $3", media),
		oldOrigin, newOrigin, likePat,
	)
	if err == nil {
		n, _ := res.RowsAffected()
		log.Printf("[site_url-migrate] %s.url: %d rows %s → %s", media, n, oldOrigin, newOrigin)
	}
}

// normaliseOrigin strips trailing slashes and any path/query fragment
// from a URL string, leaving just `scheme://host[:port]`. Returns ""
// for anything not parseable as a URL with both scheme and host so a
// malformed admin save can't accidentally rewrite the whole DB.
func normaliseOrigin(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	u, err := url.Parse(raw)
	if err != nil || u.Scheme == "" || u.Host == "" {
		return ""
	}
	return strings.TrimRight(u.Scheme+"://"+u.Host, "/")
}

// Test email
func TestEmail(c *gin.Context) {
	var req struct {
		To string `json:"to"`
	}
	c.ShouldBindJSON(&req)

	provider := model.GetOption("email_provider")
	if provider == "" {
		provider = "smtp"
	}

	cfg := util.EmailConfig{
		Provider:        provider,
		Host:            model.GetOption("smtp_host"),
		Port:            model.GetOption("smtp_port"),
		User:            model.GetOption("smtp_user"),
		Pass:            model.GetOption("smtp_pass"),
		Encryption:      model.GetOption("smtp_encryption"),
		From:            model.GetOption("email_from"),
		FromName:        model.GetOption("email_from_name"),
		ResendAPIKey:    model.GetOption("resend_api_key"),
		SendflareAPIKey: model.GetOption("sendflare_api_key"),
	}

	// Validate provider config
	switch provider {
	case "smtp":
		if cfg.Host == "" {
			util.Error(c, 400, "EMAIL_NOT_CONFIGURED", "请先配置 SMTP 服务")
			return
		}
	case "resend":
		if cfg.ResendAPIKey == "" {
			util.Error(c, 400, "EMAIL_NOT_CONFIGURED", "请先配置 Resend API Key")
			return
		}
	case "sendflare":
		if cfg.SendflareAPIKey == "" {
			util.Error(c, 400, "EMAIL_NOT_CONFIGURED", "请先配置 Sendflare API Key")
			return
		}
	}

	// Determine recipient
	toAddr := req.To
	if toAddr == "" {
		userID := middleware.GetUserID(c)
		u, _ := model.UserByID(userID)
		if u == nil {
			util.Error(c, 404, "NOT_FOUND", "用户不存在")
			return
		}
		toAddr = u.Email
	}

	siteName := model.GetOption("site_title")
	if siteName == "" {
		siteName = "Utterlog"
	}

	body := fmt.Sprintf(`<div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:20px;">
		<h2>%s</h2>
		<p>这是一封测试邮件，如果您收到了此邮件，说明邮件服务配置正确。</p>
		<p style="color:#999;font-size:12px;">当前服务商：%s</p>
		<p style="color:#999;font-size:12px;">— %s</p>
	</div>`, siteName+" 测试邮件", provider, siteName)

	if err := util.SendEmail(cfg, toAddr, siteName+" — 测试邮件", body); err != nil {
		util.Error(c, 500, "EMAIL_SEND_FAILED", fmt.Sprintf("发送失败: %v", err))
		return
	}

	util.Success(c, gin.H{"message": "测试邮件已发送到 " + toAddr})
}

// System status
func SystemStatus(c *gin.Context) {
	var postCount, commentCount, linkCount int
	config.DB.Get(&postCount, "SELECT COUNT(*) FROM "+config.T("posts")+" WHERE type='post'")
	config.DB.Get(&commentCount, "SELECT COUNT(*) FROM "+config.T("comments"))
	config.DB.Get(&linkCount, "SELECT COUNT(*) FROM "+config.T("links"))

	// System memory (total physical RAM)
	sysMem := getSystemMemory()

	// Go process memory
	var m runtime.MemStats
	runtime.ReadMemStats(&m)

	// Uptime — host system uptime, not the api process. The old
	// time.Since(startTime) reported ~1 minute after every docker
	// compose up -d recreate, which is useless for the admin.
	// /proc/uptime inside a Linux container isn't namespaced, so
	// reading it returns the real host uptime (verified: container
	// + host values match exactly).
	uptime := getHostUptime()

	// DB ping
	dbOK := config.DB.Ping() == nil

	// Disk usage (macOS/Linux)
	diskTotal, diskUsed, diskPct := getDiskUsage()

	// Memory percentage (system level, not Go process)
	memUsed, memTotal, memPct := sysMem.used, sysMem.total, sysMem.percent

	util.Success(c, gin.H{
		"status": "ok",
		"time":   time.Now().Format("2006-01-02 15:04:05"),
		"server": gin.H{
			"runtime":      "Go " + runtime.Version(),
			"os":           getOSInfo(),
			"cpus":         runtime.NumCPU(),
			"goroutines":   runtime.NumGoroutine(),
			"uptime":       uptime,
			"hostname":     getHostname(),
			"ip":           getLocalIP(),
			"country_code": getServerCountry(),
		},
		"cpu": gin.H{
			"cores":   runtime.NumCPU(),
			"percent": getCPUPercent(),
		},
		"load": gin.H{
			"avg": getLoadAvg(),
		},
		"memory": gin.H{
			"used_gb":  fmt.Sprintf("%.1f", memUsed),
			"total_gb": fmt.Sprintf("%.1f", memTotal),
			"percent":  fmt.Sprintf("%.0f", memPct),
		},
		"disk": gin.H{
			"total":   diskTotal,
			"used":    diskUsed,
			"percent": diskPct,
		},
		"database": gin.H{
			"driver":    "postgresql",
			"version":   getPGVersion(),
			"connected": dbOK,
		},
		"redis": getRedisInfo(),
		"counts": gin.H{
			"posts":    postCount,
			"comments": commentCount,
			"links":    linkCount,
		},
		"version": "1.0.0",
	})
}

var startTime = time.Now()

// getHostUptime reads /proc/uptime and formats as "X天 Y小时 Z分钟".
// Falls back to the container process uptime on non-Linux dev setups
// where /proc/uptime doesn't exist.
func getHostUptime() string {
	var secs float64
	if b, err := os.ReadFile("/proc/uptime"); err == nil {
		// "860230.80 13747132.14\n" — first field is seconds since boot
		parts := strings.Fields(string(b))
		if len(parts) > 0 {
			if v, err := strconv.ParseFloat(parts[0], 64); err == nil {
				secs = v
			}
		}
	}
	if secs <= 0 {
		secs = time.Since(startTime).Seconds()
	}
	return formatUptime(int64(secs))
}

func formatUptime(secs int64) string {
	if secs <= 0 {
		return "—"
	}
	days := secs / 86400
	hours := (secs % 86400) / 3600
	mins := (secs % 3600) / 60
	if days > 0 {
		return fmt.Sprintf("%d天 %d小时 %d分钟", days, hours, mins)
	}
	if hours > 0 {
		return fmt.Sprintf("%d小时 %d分钟", hours, mins)
	}
	if mins > 0 {
		return fmt.Sprintf("%d分钟", mins)
	}
	return fmt.Sprintf("%d秒", secs)
}

var cachedCPU int
var cpuMu sync.Mutex

func init() {
	// Background CPU monitor — updates every 2 seconds
	go func() {
		for {
			v := measureCPU()
			cpuMu.Lock()
			cachedCPU = v
			cpuMu.Unlock()
			time.Sleep(2 * time.Second)
		}
	}()
}

func getCPUPercent() int {
	cpuMu.Lock()
	defer cpuMu.Unlock()
	return cachedCPU
}

func measureCPU() int {
	if runtime.GOOS == "linux" {
		out1, err := exec.Command("sh", "-c", "head -1 /proc/stat").Output()
		if err != nil {
			return 0
		}
		time.Sleep(1 * time.Second)
		out2, _ := exec.Command("sh", "-c", "head -1 /proc/stat").Output()

		parse := func(line string) (idle, total int64) {
			fields := strings.Fields(line)
			if len(fields) < 5 {
				return 0, 1
			}
			var sum int64
			for i := 1; i < len(fields); i++ {
				v, _ := strconv.ParseInt(fields[i], 10, 64)
				sum += v
				if i == 4 {
					idle = v
				}
			}
			return idle, sum
		}

		idle1, total1 := parse(strings.TrimSpace(string(out1)))
		idle2, total2 := parse(strings.TrimSpace(string(out2)))
		if total2-total1 == 0 {
			return 0
		}
		return int(100 * (1.0 - float64(idle2-idle1)/float64(total2-total1)))
	}

	// macOS
	out, err := exec.Command("sh", "-c", "ps -A -o %cpu | awk '{s+=$1} END {printf \"%.0f\", s}'").Output()
	if err != nil {
		return 0
	}
	v, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	// Normalize by CPU count
	cores := runtime.NumCPU()
	if cores > 0 {
		v = v / float64(cores)
	}
	return int(v)
}

func getLoadAvg() string {
	out, err := exec.Command("sh", "-c", "uptime | sed 's/.*load average[s]*: *//'").Output()
	if err != nil {
		return "0 0 0"
	}
	// Normalize: remove commas, ensure space-separated
	s := strings.TrimSpace(string(out))
	s = strings.ReplaceAll(s, ",", "")
	return s
}

type sysMemInfo struct {
	used, total, percent float64
}

func getSystemMemory() sysMemInfo {
	if runtime.GOOS == "darwin" {
		// macOS: use sysctl for total, vm_stat for used
		out, err := exec.Command("sysctl", "-n", "hw.memsize").Output()
		if err != nil {
			return sysMemInfo{}
		}
		totalBytes, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
		totalGB := totalBytes / 1024 / 1024 / 1024

		out2, _ := exec.Command("sh", "-c", "vm_stat | awk '/Pages active/ {print $3}' | tr -d '.'").Output()
		activePages, _ := strconv.ParseFloat(strings.TrimSpace(string(out2)), 64)
		usedGB := activePages * 16384 / 1024 / 1024 / 1024 // 16KB pages on ARM

		pct := 0.0
		if totalGB > 0 {
			pct = usedGB / totalGB * 100
		}
		return sysMemInfo{usedGB, totalGB, pct}
	}
	// Linux: use /proc/meminfo
	out, err := exec.Command("sh", "-c", "free -b | awk '/Mem:/ {printf \"%.1f %.1f %.0f\", $3/1073741824, $2/1073741824, $3/$2*100}'").Output()
	if err != nil {
		return sysMemInfo{}
	}
	parts := strings.Fields(strings.TrimSpace(string(out)))
	if len(parts) < 3 {
		return sysMemInfo{}
	}
	used, _ := strconv.ParseFloat(parts[0], 64)
	total, _ := strconv.ParseFloat(parts[1], 64)
	pct, _ := strconv.ParseFloat(parts[2], 64)
	return sysMemInfo{used, total, pct}
}

func getPGVersion() string {
	var ver string
	err := config.DB.Get(&ver, "SHOW server_version")
	if err != nil {
		return "-"
	}
	// e.g. "17.4" or "16.2 (Ubuntu 16.2-1.pgdg22.04+1)"
	parts := strings.Fields(ver)
	v := parts[0]
	if !strings.Contains(v, ".") {
		v += ".0"
	}
	return v
}

func getRedisInfo() gin.H {
	if config.RDB == nil {
		return gin.H{"enabled": false}
	}
	info := gin.H{"enabled": true, "connected": true}
	result, err := config.RDB.Info(config.Ctx, "server").Result()
	if err != nil {
		info["connected"] = false
		return info
	}
	for _, line := range strings.Split(result, "\n") {
		if strings.HasPrefix(line, "redis_version:") {
			info["version"] = strings.TrimSpace(strings.TrimPrefix(line, "redis_version:"))
		} else if strings.HasPrefix(line, "uptime_in_seconds:") {
			info["uptime"] = strings.TrimSpace(strings.TrimPrefix(line, "uptime_in_seconds:"))
		}
	}
	// Memory usage
	memResult, err := config.RDB.Info(config.Ctx, "memory").Result()
	if err == nil {
		for _, line := range strings.Split(memResult, "\n") {
			if strings.HasPrefix(line, "used_memory_human:") {
				info["memory"] = strings.TrimSpace(strings.TrimPrefix(line, "used_memory_human:"))
			}
		}
	}
	return info
}

func getHostname() string {
	// Inside a container, `hostname` returns the container ID (e.g.
	// "566ddbfe4c8a") which is meaningless to the admin. Prefer the
	// host's /etc/hostname bind-mounted to /host/etc/hostname — added
	// to docker-compose.yml alongside /etc/os-release.
	if b, err := os.ReadFile("/host/etc/hostname"); err == nil {
		if name := strings.TrimSpace(string(b)); name != "" {
			return name
		}
	}
	out, _ := exec.Command("hostname").Output()
	return strings.TrimSpace(string(out))
}

// getLocalIP returns the public IP of the host the api is running on.
// Inside a Docker container, `hostname -I` / `ifconfig` report the
// container's internal bridge IP (172.x.x.x), which is useless to show
// as "主机 IP" in the admin sidebar — visitors never hit that address.
// Probe api.ipx.ee which returns whatever outbound IP the egress gets,
// cached for the process lifetime. Fall back to local interface IP when
// the probe fails (offline dev).
var cachedPublicIP string
var publicIPOnce sync.Once

func getLocalIP() string {
	publicIPOnce.Do(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.ipx.ee/ip", nil)
		resp, err := http.DefaultClient.Do(req)
		if err != nil || resp == nil {
			cachedPublicIP = localInterfaceIP()
			return
		}
		defer resp.Body.Close()
		var d struct {
			IP          string `json:"ip"`
			CountryCode string `json:"country_code"`
		}
		if err := json.NewDecoder(resp.Body).Decode(&d); err != nil || d.IP == "" {
			cachedPublicIP = localInterfaceIP()
			return
		}
		cachedPublicIP = d.IP
		// Warm the country cache from the same response so we don't
		// need a second HTTP round-trip.
		if d.CountryCode != "" && cachedCountry == "" {
			cachedCountry = strings.ToLower(d.CountryCode)
		}
	})
	return cachedPublicIP
}

// localInterfaceIP is the old "hostname -I" style fallback, kept for
// local dev where there's no internet. Returns the first non-loopback
// IPv4.
func localInterfaceIP() string {
	out, err := exec.Command("sh", "-c", "hostname -i 2>/dev/null | awk '{print $1}' || hostname -I 2>/dev/null | awk '{print $1}' || ipconfig getifaddr en0 2>/dev/null").Output()
	if err != nil || len(strings.TrimSpace(string(out))) == 0 {
		out, _ = exec.Command("sh", "-c", "ifconfig | grep 'inet ' | grep -v 127.0.0.1 | head -1 | awk '{print $2}'").Output()
	}
	ip := strings.TrimSpace(string(out))
	ip = strings.TrimPrefix(ip, "addr:")
	return ip
}

var cachedCountry string
var countryOnce sync.Once

func getServerCountry() string {
	// Prefer whatever getLocalIP already cached (same probe). Only
	// fall back to a dedicated call if the IP probe hasn't run yet.
	if cachedCountry != "" {
		return cachedCountry
	}
	countryOnce.Do(func() {
		if cachedCountry != "" {
			return
		}
		ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
		defer cancel()
		req, _ := http.NewRequestWithContext(ctx, "GET", "https://api.ipx.ee/ip", nil)
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			cachedCountry = ""
			return
		}
		defer resp.Body.Close()
		var geo struct {
			CountryCode string `json:"country_code"`
		}
		json.NewDecoder(resp.Body).Decode(&geo)
		cachedCountry = strings.ToLower(geo.CountryCode)
	})
	return cachedCountry
}

// getOSInfo returns the HOST OS description. Go runs inside an Alpine
// container, so reading the container's own /etc/os-release always
// says "Alpine Linux v3.20" no matter what the user's actual server is.
// Look for a bind-mounted /host/... release file across the common
// locations (distros put it in one of these three); fall back to the
// container's own file with a "(容器)" suffix so the UI is honest
// about what we can see.
func getOSInfo() string {
	// Preferred: host OS via bind mount. Try multiple standard paths
	// since some distros only populate one.
	for _, p := range []string{
		"/host/etc/os-release",
		"/host/usr/lib/os-release",
	} {
		if b, err := os.ReadFile(p); err == nil {
			if name := parseOsReleasePretty(string(b)); name != "" {
				return name
			}
		}
	}
	// Older RHEL / CentOS < 7 — only /etc/redhat-release
	if b, err := os.ReadFile("/host/etc/redhat-release"); err == nil {
		if s := strings.TrimSpace(string(b)); s != "" {
			return s
		}
	}
	// Debian / Ubuntu LSB fallback
	if b, err := os.ReadFile("/host/etc/lsb-release"); err == nil {
		if name := parseLSBDescription(string(b)); name != "" {
			return name
		}
	}
	// macOS host with Go binary running natively (dev)
	if out, err := exec.Command("sw_vers", "-productName").Output(); err == nil {
		name := strings.TrimSpace(string(out))
		ver, _ := exec.Command("sw_vers", "-productVersion").Output()
		if name != "" {
			return name + " " + strings.TrimSpace(string(ver))
		}
	}
	// Fallback: container's own OS (accurate for local-run, labeled
	// in-container for dockerized deploys so the admin knows we're
	// not reading the actual host). If /host/etc/os-release *should*
	// be mounted but isn't, log it once so the admin can spot a
	// compose misconfiguration in `docker logs utterlog-api-1`.
	if inDocker() {
		osReleaseMountWarnOnce.Do(func() {
			if _, err := os.Stat("/host/etc"); err != nil {
				fmt.Printf("[system-status] /host/etc not mounted — host OS will show as the container base image. Update docker-compose.yml via `bash update.sh` to pick up the new bind mounts.\n")
			}
		})
	}
	if b, err := os.ReadFile("/etc/os-release"); err == nil {
		if name := parseOsReleasePretty(string(b)); name != "" {
			if inDocker() {
				return name + " (容器)"
			}
			return name
		}
	}
	return runtime.GOOS + "/" + runtime.GOARCH
}

var osReleaseMountWarnOnce sync.Once

// parseLSBDescription reads /etc/lsb-release style files. Key is
// DISTRIB_DESCRIPTION, which is quoted just like PRETTY_NAME in
// os-release.
func parseLSBDescription(s string) string {
	for _, line := range strings.Split(s, "\n") {
		if strings.HasPrefix(line, "DISTRIB_DESCRIPTION=") {
			v := strings.TrimPrefix(line, "DISTRIB_DESCRIPTION=")
			return strings.TrimSpace(strings.Trim(v, "\"'"))
		}
	}
	return ""
}

func parseOsReleasePretty(s string) string {
	for _, line := range strings.Split(s, "\n") {
		if strings.HasPrefix(line, "PRETTY_NAME=") {
			v := strings.TrimPrefix(line, "PRETTY_NAME=")
			v = strings.Trim(v, "\"'")
			return strings.TrimSpace(v)
		}
	}
	return ""
}

func inDocker() bool {
	if _, err := os.Stat("/.dockerenv"); err == nil {
		return true
	}
	return false
}

func getDiskUsage() (string, string, string) {
	out, err := exec.Command("df", "-h", "/").Output()
	if err != nil {
		return "-", "-", "0"
	}
	lines := strings.Split(string(out), "\n")
	if len(lines) < 2 {
		return "-", "-", "0"
	}
	fields := strings.Fields(lines[1])
	if len(fields) < 5 {
		return "-", "-", "0"
	}
	return fields[1], fields[2], strings.TrimSuffix(fields[4], "%")
}

// Comments
func ListComments(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	status := c.Query("status")
	search := c.Query("search")
	postID, _ := strconv.Atoi(c.Query("post_id"))
	userID, _ := strconv.Atoi(c.Query("user_id"))
	order := c.DefaultQuery("order", "desc")
	topLevel := c.Query("top_level") == "true"
	excludeAdmin := c.Query("exclude_admin") == "1" || c.Query("exclude_admin") == "true"
	comments, total, _ := model.CommentsList(page, perPage, status, search, order, postID, userID, topLevel, excludeAdmin)
	util.Paginate(c, model.FormatComments(comments), total, page, perPage)
}

func DeleteCommentHandler(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	// Get post_id before deleting, so we can decrement comment_count
	var postID int
	config.DB.Get(&postID, "SELECT COALESCE(post_id, 0) FROM "+config.T("comments")+" WHERE id = $1", id)

	model.DeleteComment(id)

	// Decrement post comment_count
	if postID > 0 {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = $1", config.T("posts")), postID)
	}

	util.Success(c, nil)
}

// Notifications
func ListNotifications(c *gin.Context) {
	GenericList("notifications")(c)
}

// Feed
func PostsFeed(c *gin.Context) {
	t := config.T("posts")
	siteTitle := model.GetOption("site_title")
	if siteTitle == "" {
		siteTitle = "Utterlog"
	}
	siteDesc := model.GetOption("site_description")
	siteURL := strings.TrimRight(config.PublicBaseURL(), "/")
	siteLocale := i18n.NormalizeLocale(model.GetOption("site_locale"))

	// 用户可能改了固定链接结构（比如 /archives/%display_id%），RSS 输出
	// 必须跟着 admin 配置走，不然订阅源里的 link 还是老的 /posts/<slug>
	// 点进去 404。读 permalink_structure option 走 BuildPostPermalink
	// 渲染，跟前端 web/lib/permalink.ts:buildPermalink 完全对齐。
	permalinkTpl := model.GetOption("permalink_structure")

	var posts []model.Post
	config.DB.Select(&posts, fmt.Sprintf("SELECT id, title, slug, excerpt, content, display_id, created_at, updated_at, published_at FROM %s WHERE status='publish' AND type='post' ORDER BY created_at DESC LIMIT 20", t))

	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=3600")
	xml := `<?xml version="1.0" encoding="UTF-8"?>` + "\n"
	xml += `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` + "\n"
	xml += fmt.Sprintf("<title>%s</title><link>%s</link><description>%s</description><language>%s</language>\n",
		xmlEscape(siteTitle), xmlEscape(siteURL), xmlEscape(siteDesc), xmlEscape(siteLocale))
	xml += fmt.Sprintf(`<atom:link href="%s/api/v1/feed" rel="self" type="application/rss+xml"/>`+"\n", xmlEscape(siteURL))
	for _, p := range posts {
		content := ""
		if p.Content != nil {
			content = *p.Content
		}
		excerpt := ""
		if p.Excerpt != nil {
			excerpt = *p.Excerpt
		}
		if excerpt == "" && len(content) > 300 {
			excerpt = content[:300]
		}
		link := siteURL + BuildPostPermalink(&p, permalinkTpl)
		pubDate := time.Unix(p.CreatedAt, 0).UTC().Format(time.RFC1123Z)
		xml += fmt.Sprintf("<item><title>%s</title><link>%s</link><guid isPermaLink=\"true\">%s</guid><pubDate>%s</pubDate><description><![CDATA[%s]]></description></item>\n",
			xmlEscape(p.Title), xmlEscape(link), xmlEscape(link), pubDate, cdataSafe(excerpt))
	}
	xml += "</channel></rss>"
	c.String(200, xml)
}

// xmlEscape escapes the 5 predefined XML entities for safe use inside
// element text or attribute values. Apostrophe is escaped too because
// some feed readers choke on raw ' inside attributes.
func xmlEscape(s string) string {
	r := strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;", "\"", "&quot;", "'", "&apos;")
	return r.Replace(s)
}

// cdataSafe breaks any "]]>" sequences inside content so a raw CDATA
// block stays well-formed.
func cdataSafe(s string) string {
	return strings.ReplaceAll(s, "]]>", "]]]]><![CDATA[>")
}
