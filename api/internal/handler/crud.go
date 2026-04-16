package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os/exec"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// Generic CRUD handlers for simple tables

func GenericList(table string) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
		items, total, _ := model.GenericList(table, page, perPage, "")
		util.Paginate(c, items, total, page, perPage)
	}
}

func GenericGet(table string) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		row := make(map[string]interface{})
		err := config.DB.QueryRowx(fmt.Sprintf("SELECT * FROM %s WHERE id = $1", config.T(table)), id).MapScan(row)
		if err != nil { util.NotFound(c, table); return }
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
	for _, o := range opts { result[o.Name] = o.Value }
	util.Success(c, result)
}

func UpdateOptions(c *gin.Context) {
	var req map[string]interface{}
	c.ShouldBindJSON(&req)
	t := config.T("options")
	for k, v := range req {
		val := fmt.Sprintf("%v", v)
		config.DB.Exec(fmt.Sprintf("INSERT INTO %s (name, value, created_at, updated_at) VALUES ($1, $2, $3, $4) ON CONFLICT (name) DO UPDATE SET value = $2, updated_at = $4", t),
			k, val, 0, 0)
	}
	util.Success(c, nil)
}

// Test email
func TestEmail(c *gin.Context) {
	var req struct {
		To string `json:"to"`
	}
	c.ShouldBindJSON(&req)

	provider := model.GetOption("email_provider")
	if provider == "" { provider = "smtp" }

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
		if cfg.Host == "" { util.Error(c, 400, "EMAIL_NOT_CONFIGURED", "请先配置 SMTP 服务"); return }
	case "resend":
		if cfg.ResendAPIKey == "" { util.Error(c, 400, "EMAIL_NOT_CONFIGURED", "请先配置 Resend API Key"); return }
	case "sendflare":
		if cfg.SendflareAPIKey == "" { util.Error(c, 400, "EMAIL_NOT_CONFIGURED", "请先配置 Sendflare API Key"); return }
	}

	// Determine recipient
	toAddr := req.To
	if toAddr == "" {
		userID := middleware.GetUserID(c)
		u, _ := model.UserByID(userID)
		if u == nil { util.Error(c, 404, "NOT_FOUND", "用户不存在"); return }
		toAddr = u.Email
	}

	siteName := model.GetOption("site_title")
	if siteName == "" { siteName = "Utterlog" }

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

	// Uptime
	uptime := time.Since(startTime).String()

	// DB ping
	dbOK := config.DB.Ping() == nil

	// Disk usage (macOS/Linux)
	diskTotal, diskUsed, diskPct := getDiskUsage()

	// Memory percentage (system level, not Go process)
	memUsed, memTotal, memPct := sysMem.used, sysMem.total, sysMem.percent

	util.Success(c, gin.H{
		"status":     "ok",
		"time":       time.Now().Format("2006-01-02 15:04:05"),
		"server": gin.H{
			"runtime":    "Go " + runtime.Version(),
			"os":         getOSInfo(),
			"cpus":       runtime.NumCPU(),
			"goroutines": runtime.NumGoroutine(),
			"uptime":     uptime,
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
		if err != nil { return 0 }
		time.Sleep(1 * time.Second)
		out2, _ := exec.Command("sh", "-c", "head -1 /proc/stat").Output()

		parse := func(line string) (idle, total int64) {
			fields := strings.Fields(line)
			if len(fields) < 5 { return 0, 1 }
			var sum int64
			for i := 1; i < len(fields); i++ {
				v, _ := strconv.ParseInt(fields[i], 10, 64)
				sum += v
				if i == 4 { idle = v }
			}
			return idle, sum
		}

		idle1, total1 := parse(strings.TrimSpace(string(out1)))
		idle2, total2 := parse(strings.TrimSpace(string(out2)))
		if total2-total1 == 0 { return 0 }
		return int(100 * (1.0 - float64(idle2-idle1)/float64(total2-total1)))
	}

	// macOS
	out, err := exec.Command("sh", "-c", "ps -A -o %cpu | awk '{s+=$1} END {printf \"%.0f\", s}'").Output()
	if err != nil { return 0 }
	v, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
	// Normalize by CPU count
	cores := runtime.NumCPU()
	if cores > 0 { v = v / float64(cores) }
	return int(v)
}

func getLoadAvg() string {
	out, err := exec.Command("sh", "-c", "uptime | sed 's/.*load average[s]*: *//'").Output()
	if err != nil { return "0 0 0" }
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
		if err != nil { return sysMemInfo{} }
		totalBytes, _ := strconv.ParseFloat(strings.TrimSpace(string(out)), 64)
		totalGB := totalBytes / 1024 / 1024 / 1024

		out2, _ := exec.Command("sh", "-c", "vm_stat | awk '/Pages active/ {print $3}' | tr -d '.'").Output()
		activePages, _ := strconv.ParseFloat(strings.TrimSpace(string(out2)), 64)
		usedGB := activePages * 16384 / 1024 / 1024 / 1024 // 16KB pages on ARM

		pct := 0.0
		if totalGB > 0 { pct = usedGB / totalGB * 100 }
		return sysMemInfo{usedGB, totalGB, pct}
	}
	// Linux: use /proc/meminfo
	out, err := exec.Command("sh", "-c", "free -b | awk '/Mem:/ {printf \"%.1f %.1f %.0f\", $3/1073741824, $2/1073741824, $3/$2*100}'").Output()
	if err != nil { return sysMemInfo{} }
	parts := strings.Fields(strings.TrimSpace(string(out)))
	if len(parts) < 3 { return sysMemInfo{} }
	used, _ := strconv.ParseFloat(parts[0], 64)
	total, _ := strconv.ParseFloat(parts[1], 64)
	pct, _ := strconv.ParseFloat(parts[2], 64)
	return sysMemInfo{used, total, pct}
}

func getPGVersion() string {
	var ver string
	err := config.DB.Get(&ver, "SHOW server_version")
	if err != nil { return "-" }
	// e.g. "17.4" or "16.2 (Ubuntu 16.2-1.pgdg22.04+1)"
	parts := strings.Fields(ver)
	v := parts[0]
	if !strings.Contains(v, ".") { v += ".0" }
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
	out, _ := exec.Command("hostname").Output()
	return strings.TrimSpace(string(out))
}

func getLocalIP() string {
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
	countryOnce.Do(func() {
		resp, err := http.Get("https://api.ipx.ee/ip")
		if err != nil { cachedCountry = ""; return }
		defer resp.Body.Close()
		var geo struct { CountryCode string `json:"country_code"` }
		json.NewDecoder(resp.Body).Decode(&geo)
		cachedCountry = strings.ToLower(geo.CountryCode)
	})
	return cachedCountry
}

func getOSInfo() string {
	// Try to read /etc/os-release for Linux
	out, err := exec.Command("sh", "-c", "cat /etc/os-release 2>/dev/null | grep PRETTY_NAME | cut -d'\"' -f2").Output()
	if err == nil && len(strings.TrimSpace(string(out))) > 0 {
		return strings.TrimSpace(string(out))
	}
	// macOS
	out, err = exec.Command("sw_vers", "-productName").Output()
	if err == nil {
		name := strings.TrimSpace(string(out))
		ver, _ := exec.Command("sw_vers", "-productVersion").Output()
		return name + " " + strings.TrimSpace(string(ver))
	}
	return runtime.GOOS + "/" + runtime.GOARCH
}

func getDiskUsage() (string, string, string) {
	out, err := exec.Command("df", "-h", "/").Output()
	if err != nil { return "-", "-", "0" }
	lines := strings.Split(string(out), "\n")
	if len(lines) < 2 { return "-", "-", "0" }
	fields := strings.Fields(lines[1])
	if len(fields) < 5 { return "-", "-", "0" }
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
	if siteTitle == "" { siteTitle = "Utterlog" }
	siteURL := model.GetOption("site_url")
	if siteURL == "" { siteURL = config.C.AppURL }

	var posts []model.Post
	config.DB.Select(&posts, fmt.Sprintf("SELECT id, title, slug, excerpt, content, created_at, updated_at FROM %s WHERE status='publish' AND type='post' ORDER BY created_at DESC LIMIT 20", t))

	c.Header("Content-Type", "application/xml; charset=utf-8")
	c.Header("Cache-Control", "public, max-age=3600")
	xml := `<?xml version="1.0" encoding="UTF-8"?>` + "\n"
	xml += `<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel>` + "\n"
	xml += fmt.Sprintf("<title>%s</title><link>%s</link><language>zh-CN</language>\n", siteTitle, siteURL)
	for _, p := range posts {
		content := ""; if p.Content != nil { content = *p.Content }
		excerpt := ""; if p.Excerpt != nil { excerpt = *p.Excerpt }
		if excerpt == "" && len(content) > 300 { excerpt = content[:300] }
		xml += fmt.Sprintf("<item><title>%s</title><link>%s/posts/%s</link><description><![CDATA[%s]]></description></item>\n",
			p.Title, siteURL, p.Slug, excerpt)
	}
	xml += "</channel></rss>"
	c.String(200, xml)
}

func MemosFeed(c *gin.Context) {
	siteTitle := model.GetOption("site_title")
	if siteTitle == "" { siteTitle = "Utterlog" }
	siteURL := model.GetOption("site_url")
	if siteURL == "" { siteURL = config.C.AppURL }

	var moments []model.Moment
	config.DB.Select(&moments, fmt.Sprintf("SELECT id, content, created_at FROM %s WHERE visibility='public' ORDER BY created_at DESC LIMIT 30", config.T("moments")))

	c.Header("Content-Type", "application/xml; charset=utf-8")
	xml := `<?xml version="1.0" encoding="UTF-8"?>` + "\n"
	xml += `<rss version="2.0"><channel>` + "\n"
	xml += fmt.Sprintf("<title>%s - 说说</title><link>%s/moments</link><language>zh-CN</language>\n", siteTitle, siteURL)
	for _, m := range moments {
		title := m.Content; if len(title) > 80 { title = title[:80] + "..." }
		xml += fmt.Sprintf("<item><title>%s</title><description><![CDATA[%s]]></description></item>\n", title, m.Content)
	}
	xml += "</channel></rss>"
	c.String(200, xml)
}
