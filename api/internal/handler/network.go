package handler

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// Utterlog Network hub — fixed, not configurable
const utterlogHub = "https://id.utterlog.com"

// siteFingerprint generates a unique, deterministic key for this site
// based on site URL + JWT secret (unique per installation)
func siteFingerprint() string {
	raw := config.C.AppURL + ":" + config.C.JWTSecret
	h := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(h[:])
}

// getSiteID returns the cached site_id, or empty if not yet registered
func getSiteID() string {
	return model.GetOption("utterlog_site_id")
}

// hubRequest makes an authenticated request to the Utterlog hub
func hubRequest(method, path string, body interface{}) (*http.Response, error) {
	var reader io.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		reader = bytes.NewReader(b)
	}
	req, _ := http.NewRequest(method, utterlogHub+path, reader)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Site-Fingerprint", siteFingerprint())
	if sid := getSiteID(); sid != "" {
		req.Header.Set("X-Site-ID", sid)
	}
	client := &http.Client{Timeout: 15 * time.Second}
	return client.Do(req)
}

// ensureRegistered auto-registers the site if not yet connected.
// Called lazily on first network status check.
func ensureRegistered() (siteID string, connected bool) {
	siteID = getSiteID()
	if siteID != "" && model.GetOption("utterlog_connected") == "true" {
		return siteID, true
	}

	// Auto-register with the hub
	siteTitle := model.GetOption("site_title")
	if siteTitle == "" {
		siteTitle = "Utterlog!"
	}
	admin, _ := model.UserByID(1)

	payload := gin.H{
		"fingerprint": siteFingerprint(),
		"url":         config.C.AppURL,
		"name":        siteTitle,
		"description": model.GetOption("site_description"),
		"logo":        model.GetOption("site_logo"),
		"protocol":    "utterlog-federation/1.0",
	}
	if admin != nil {
		payload["admin"] = gin.H{
			"username": admin.Username,
			"nickname": admin.NicknameStr(),
			"avatar":   admin.Avatar,
			"email":    admin.Email,
		}
	}

	resp, err := hubRequest("POST", "/api/v1/sites/register", payload)
	if err != nil {
		return "", false
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	if resp.StatusCode == 200 || resp.StatusCode == 201 {
		if data, ok := result["data"].(map[string]interface{}); ok {
			if id, ok := data["site_id"].(string); ok {
				model.SetOption("utterlog_site_id", id)
				siteID = id
			}
		}
		model.SetOption("utterlog_connected", "true")
		return siteID, true
	}
	return "", false
}

// ===================== Network Status & Sync =====================

// GetNetworkStatus returns connection status, auto-registering if needed
func GetNetworkStatus(c *gin.Context) {
	siteID, connected := ensureRegistered()

	util.Success(c, gin.H{
		"hub":         utterlogHub,
		"site_id":     siteID,
		"fingerprint": siteFingerprint()[:12] + "...",
		"connected":   connected,
	})
}

// PushSiteInfo pushes updated site info to the hub
func PushSiteInfo(c *gin.Context) {
	siteID, connected := ensureRegistered()
	if !connected {
		util.Error(c, 502, "NOT_CONNECTED", "无法连接 Utterlog 网络")
		return
	}

	siteTitle := model.GetOption("site_title")
	if siteTitle == "" {
		siteTitle = "Utterlog!"
	}

	var postCount, commentCount int
	config.DB.Get(&postCount, "SELECT COUNT(*) FROM "+config.T("posts")+" WHERE status = 'publish'")
	config.DB.Get(&commentCount, "SELECT COUNT(*) FROM "+config.T("comments")+" WHERE status = 'approved'")

	payload := gin.H{
		"site_id":       siteID,
		"fingerprint":   siteFingerprint(),
		"url":           config.C.AppURL,
		"name":          siteTitle,
		"description":   model.GetOption("site_description"),
		"logo":          model.GetOption("site_logo"),
		"post_count":    postCount,
		"comment_count": commentCount,
	}

	resp, err := hubRequest("PUT", "/api/v1/sites/"+siteID, payload)
	if err != nil {
		util.Error(c, 502, "HUB_UNREACHABLE", "无法连接 Utterlog 中心")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 200 {
		util.Success(c, gin.H{"pushed": true})
	} else {
		util.Error(c, resp.StatusCode, "PUSH_FAILED", "推送站点信息失败")
	}
}

// ===================== Content Sharing Protocol =====================

// ShareableContent returns published posts for external subscription
func ShareableContent(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "20"))
	since := c.Query("since")
	contentType := c.DefaultQuery("type", "post")
	offset := (page - 1) * perPage

	t := config.T
	var items []map[string]interface{}
	var total int

	if contentType == "moment" {
		query := fmt.Sprintf("SELECT * FROM %s WHERE visibility = 'public' ", t("moments"))
		countQuery := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE visibility = 'public' ", t("moments"))
		if since != "" {
			query += "AND created_at > " + since + " "
			countQuery += "AND created_at > " + since + " "
		}
		config.DB.Get(&total, countQuery)
		rows, _ := config.DB.Queryx(query+"ORDER BY created_at DESC LIMIT $1 OFFSET $2", perPage, offset)
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				row := make(map[string]interface{})
				rows.MapScan(row)
				items = append(items, row)
			}
		}
	} else {
		query := fmt.Sprintf("SELECT id, title, slug, content, excerpt, cover_url, view_count, comment_count, created_at, updated_at FROM %s WHERE status = 'publish' ", t("posts"))
		countQuery := fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE status = 'publish' ", t("posts"))
		if since != "" {
			query += "AND created_at > " + since + " "
			countQuery += "AND created_at > " + since + " "
		}
		config.DB.Get(&total, countQuery)
		rows, _ := config.DB.Queryx(query+"ORDER BY created_at DESC LIMIT $1 OFFSET $2", perPage, offset)
		if rows != nil {
			defer rows.Close()
			for rows.Next() {
				row := make(map[string]interface{})
				rows.MapScan(row)
				items = append(items, row)
			}
		}
	}

	if items == nil {
		items = []map[string]interface{}{}
	}

	siteTitle := model.GetOption("site_title")
	if siteTitle == "" {
		siteTitle = "Utterlog!"
	}

	util.Success(c, gin.H{
		"site": gin.H{
			"name": siteTitle,
			"url":  config.C.AppURL,
			"logo": model.GetOption("site_logo"),
		},
		"items":    items,
		"total":    total,
		"page":     page,
		"per_page": perPage,
	})
}

// SubscribeSite creates a content subscription to a remote site
func SubscribeSite(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		SiteURL string `json:"site_url" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "site_url 不能为空")
		return
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(req.SiteURL + "/api/v1/federation/metadata")
	if err != nil {
		util.Error(c, 400, "DISCOVERY_FAILED", "无法连接目标站点: "+err.Error())
		return
	}
	defer resp.Body.Close()

	var meta map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&meta)
	data, _ := meta["data"].(map[string]interface{})
	siteName, _ := data["name"].(string)
	if siteName == "" {
		siteName = req.SiteURL
	}
	siteLogo, _ := data["logo"].(string)

	t := config.T
	now := time.Now().Unix()

	config.DB.Exec(fmt.Sprintf(
		`INSERT INTO %s (user_id, site_url, site_name, site_logo, feed_url, subscription_type, created_at)
		 VALUES ($1,$2,$3,$4,$5,'content',$6) ON CONFLICT (user_id, site_url) DO UPDATE SET site_name=$3, site_logo=$4`,
		t("rss_subscriptions")),
		userID, req.SiteURL, siteName, siteLogo, req.SiteURL+"/api/v1/feed", now)

	go func() {
		payload := gin.H{
			"type": "subscribe",
			"site": config.C.AppURL,
			"name": model.GetOption("site_title"),
		}
		body, _ := json.Marshal(payload)
		http.Post(req.SiteURL+"/api/v1/federation/webhook", "application/json", bytes.NewReader(body))
	}()

	util.Success(c, gin.H{
		"subscribed": true,
		"site_name":  siteName,
		"site_logo":  siteLogo,
	})
}

// UnsubscribeSite removes a content subscription
func UnsubscribeSite(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		SiteURL string `json:"site_url" binding:"required"`
	}
	c.ShouldBindJSON(&req)

	config.DB.Exec(fmt.Sprintf(
		"DELETE FROM %s WHERE user_id = $1 AND site_url = $2",
		config.T("rss_subscriptions")), userID, req.SiteURL)

	util.Success(c, gin.H{"unsubscribed": true})
}

// ListSubscriptions returns all content subscriptions
func ListSubscriptions(c *gin.Context) {
	userID := middleware.GetUserID(c)

	var subs []map[string]interface{}
	rows, _ := config.DB.Queryx(fmt.Sprintf(
		"SELECT * FROM %s WHERE user_id = $1 ORDER BY created_at DESC",
		config.T("rss_subscriptions")), userID)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			subs = append(subs, row)
		}
	}
	if subs == nil {
		subs = []map[string]interface{}{}
	}
	util.Success(c, subs)
}

// PullContent fetches latest content from a subscribed site
func PullContent(c *gin.Context) {
	siteURL := c.Query("site_url")
	if siteURL == "" {
		util.BadRequest(c, "site_url 参数不能为空")
		return
	}
	contentType := c.DefaultQuery("type", "post")
	since := c.Query("since")

	url := siteURL + "/api/v1/network/content?type=" + contentType
	if since != "" {
		url += "&since=" + since
	}

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		util.Error(c, 502, "PULL_FAILED", "无法连接目标站点")
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)

	if success, ok := result["success"].(bool); ok && success {
		util.Success(c, result["data"])
	} else {
		util.Error(c, 502, "PULL_FAILED", "拉取内容失败")
	}
}

// PublishNotify notifies all subscribers when new content is published
func PublishNotify(c *gin.Context) {
	var req struct {
		PostID      int    `json:"post_id"`
		Title       string `json:"title"`
		ContentType string `json:"content_type"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "参数不完整")
		return
	}

	siteTitle := model.GetOption("site_title")
	if siteTitle == "" {
		siteTitle = "Utterlog!"
	}

	// Notify follower sites
	t := config.T
	var subscribers []string
	config.DB.Select(&subscribers, fmt.Sprintf(
		"SELECT DISTINCT source_site FROM %s WHERE source_site != '' AND following_id = 1",
		t("followers")))

	notified := 0
	for _, subSite := range subscribers {
		payload := gin.H{
			"type":         "new_content",
			"site":         config.C.AppURL,
			"name":         siteTitle,
			"title":        req.Title,
			"content_type": req.ContentType,
			"post_id":      req.PostID,
		}
		body, _ := json.Marshal(payload)
		go func(url string) {
			c := &http.Client{Timeout: 10 * time.Second}
			c.Post(url+"/api/v1/federation/webhook", "application/json", bytes.NewReader(body))
		}(subSite)
		notified++
	}

	// Also notify hub
	siteID := getSiteID()
	if siteID != "" {
		go func() {
			hubRequest("POST", "/api/v1/activity", gin.H{
				"site_id":      siteID,
				"type":         "new_content",
				"title":        req.Title,
				"content_type": req.ContentType,
				"url":          config.C.AppURL,
			})
		}()
	}

	util.Success(c, gin.H{"notified": notified})
}

// ===================== Network Community Feed =====================

// GetNetworkFeed returns aggregated community activity from the hub
func GetNetworkFeed(c *gin.Context) {
	page := c.DefaultQuery("page", "1")
	perPage := c.DefaultQuery("per_page", "20")

	resp, err := hubRequest("GET", "/api/v1/activity?page="+page+"&per_page="+perPage, nil)
	if err != nil {
		util.Success(c, gin.H{
			"items":      []interface{}{},
			"total":      0,
			"hub_status": "offline",
		})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)

	if success, ok := result["success"].(bool); ok && success {
		data := result["data"]
		if data == nil {
			data = gin.H{"items": []interface{}{}, "total": 0}
		}
		util.Success(c, data)
	} else {
		util.Success(c, gin.H{
			"items":      []interface{}{},
			"total":      0,
			"hub_status": "error",
		})
	}
}

// GetNetworkSites returns discovered sites in the Utterlog Network
func GetNetworkSites(c *gin.Context) {
	page := c.DefaultQuery("page", "1")

	resp, err := hubRequest("GET", "/api/v1/sites?page="+page, nil)
	if err != nil {
		util.Success(c, gin.H{"sites": []interface{}{}, "total": 0})
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)

	if success, ok := result["success"].(bool); ok && success {
		util.Success(c, result["data"])
	} else {
		util.Success(c, gin.H{"sites": []interface{}{}, "total": 0})
	}
}

// ===================== Utterlog ID Binding =====================

// BindUtterlogID links the local user account to an Utterlog ID
func BindUtterlogID(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		UtterlogID string `json:"utterlog_id" binding:"required"`
		Token      string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "utterlog_id 和 token 不能为空")
		return
	}

	// Verify the token with the hub
	verifyReq, _ := http.NewRequest("GET", utterlogHub+"/api/v1/auth/verify", nil)
	verifyReq.Header.Set("Authorization", "Bearer "+req.Token)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(verifyReq)
	if err != nil {
		util.Error(c, 502, "HUB_UNREACHABLE", "无法连接 Utterlog 认证中心")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		util.Error(c, 401, "INVALID_TOKEN", "Utterlog ID 验证失败")
		return
	}

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	data, _ := result["data"].(map[string]interface{})
	verifiedID, _ := data["utterlog_id"].(string)

	if verifiedID != req.UtterlogID {
		util.Error(c, 401, "ID_MISMATCH", "Utterlog ID 不匹配")
		return
	}

	t := config.T
	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET utterlog_id = $1 WHERE id = $2",
		t("users")), req.UtterlogID, userID)

	if avatar, ok := data["avatar"].(string); ok && avatar != "" {
		config.DB.Exec(fmt.Sprintf(
			"UPDATE %s SET utterlog_avatar = $1 WHERE id = $2",
			t("users")), avatar, userID)
	}

	util.Success(c, gin.H{"bound": true, "utterlog_id": req.UtterlogID})
}

// UnbindUtterlogID removes the Utterlog ID binding
func UnbindUtterlogID(c *gin.Context) {
	userID := middleware.GetUserID(c)
	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET utterlog_id = '', utterlog_avatar = '' WHERE id = $1",
		config.T("users")), userID)
	util.Success(c, gin.H{"unbound": true})
}

// GetUtterlogProfile returns the user's Utterlog Network profile
func GetUtterlogProfile(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := model.UserByID(userID)
	if err != nil {
		util.NotFound(c, "用户")
		return
	}

	var utterlogID, utterlogAvatar string
	config.DB.Get(&utterlogID, fmt.Sprintf(
		"SELECT COALESCE(utterlog_id, '') FROM %s WHERE id = $1",
		config.T("users")), userID)
	config.DB.Get(&utterlogAvatar, fmt.Sprintf(
		"SELECT COALESCE(utterlog_avatar, '') FROM %s WHERE id = $1",
		config.T("users")), userID)

	localAvatar := ""
	if user.Avatar != nil { localAvatar = *user.Avatar }
	util.Success(c, gin.H{
		"utterlog_id":     utterlogID,
		"utterlog_avatar": utterlogAvatar,
		"username":        user.Username,
		"nickname":        user.NicknameStr(),
		"email":           user.Email,
		"avatar":          localAvatar,       // raw local avatar (for Profile edit UI)
		"avatar_url":      user.AvatarURL(),  // resolved (utterlog > local) for unified display
		"bound":           utterlogID != "",
	})
}

// ===================== OAuth 2.0 =====================

// OAuthAuthorize initiates OAuth flow with id.utterlog.com
func OAuthAuthorize(c *gin.Context) {
	siteID, connected := ensureRegistered()
	if !connected {
		util.Error(c, 502, "NOT_CONNECTED", "无法连接 Utterlog 网络")
		return
	}
	// Must be the public origin (https://yourdomain), not AppURL which
	// in Docker resolves to the container loopback and makes the OAuth
	// provider redirect the browser back to http://localhost:9260/…
	redirectURI := config.PublicBaseURL() + "/api/v1/network/oauth/callback"
	state := fmt.Sprintf("%d-%d", time.Now().UnixNano(), middleware.GetUserID(c))

	authURL := fmt.Sprintf("%s/oauth/authorize?client_id=%s&redirect_uri=%s&state=%s&response_type=code&scope=profile",
		utterlogHub, siteID, redirectURI, state)

	util.Success(c, gin.H{
		"auth_url": authURL,
		"state":    state,
	})
}

// OAuthCallback handles the OAuth callback from id.utterlog.com
func OAuthCallback(c *gin.Context) {
	code := c.Query("code")
	state := c.Query("state")

	if code == "" || state == "" {
		util.BadRequest(c, "无效的 OAuth 回调参数")
		return
	}

	siteID := getSiteID()

	payload := gin.H{
		"grant_type":    "authorization_code",
		"code":          code,
		"client_id":     siteID,
		"fingerprint":   siteFingerprint(),
		// Same as OAuthAuthorize — must match the URI sent at authorize time.
		"redirect_uri":  config.PublicBaseURL() + "/api/v1/network/oauth/callback",
	}
	resp, err := hubRequest("POST", "/oauth/token", payload)
	if err != nil {
		c.Redirect(302, "/dashboard/profile?error=hub_unreachable")
		return
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	// Determine frontend URL (differs from API URL in dev)
	frontendURL := model.GetOption("site_url")
	if frontendURL == "" {
		frontendURL = config.C.AppURL
	}
	// Dev: API is 8080, frontend is 3000
	if strings.Contains(frontendURL, "localhost:8080") {
		frontendURL = strings.Replace(frontendURL, ":8080", ":3000", 1)
	}

	if resp.StatusCode == 200 {
		data, _ := result["data"].(map[string]interface{})
		utterlogID, _ := data["utterlog_id"].(string)
		utterlogAvatar, _ := data["avatar"].(string)

		// Save to user record
		parts := strings.Split(state, "-")
		if len(parts) >= 2 {
			userID := parts[len(parts)-1]
			config.DB.Exec(fmt.Sprintf("UPDATE %s SET utterlog_id = $1, utterlog_avatar = $2 WHERE id = $3", config.T("users")),
				utterlogID, utterlogAvatar, userID)
		}

		// Return HTML that closes the popup and refreshes the opener
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(200, fmt.Sprintf(`<!DOCTYPE html><html><body><script>
			if (window.opener) { window.opener.location.reload(); }
			window.close();
			setTimeout(function(){ window.location.href = '%s/dashboard/utterlog'; }, 500);
		</script><p>绑定成功，正在关闭...</p></body></html>`, frontendURL))
	} else {
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(200, fmt.Sprintf(`<!DOCTYPE html><html><body><script>
			if (window.opener) { window.opener.location.reload(); }
			window.close();
			setTimeout(function(){ window.location.href = '%s/dashboard/utterlog?error=oauth_failed'; }, 500);
		</script><p>绑定失败，正在关闭...</p></body></html>`, frontendURL))
	}
}
