package handler

import (
	"bytes"
	"encoding/json"
	"encoding/xml"
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
	"github.com/golang-jwt/jwt/v5"
)

// ===================== Federation Identity =====================

// Generate a federation token for the current user (used when visiting other sites)
func GenerateFederationToken(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := model.UserByID(userID)
	if err != nil {
		util.NotFound(c, "用户"); return
	}

	// Create a federation JWT valid for 24 hours
	claims := jwt.MapClaims{
		"iss":      config.C.AppURL,
		"sub":      userID,
		"username": user.Username,
		"nickname": user.NicknameStr(),
		"email":    user.Email,
		"avatar":   user.AvatarURL(),
		"site":     config.C.AppURL,
		"iat":      time.Now().Unix(),
		"exp":      time.Now().Add(24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, _ := token.SignedString([]byte(config.C.JWTSecret))

	// Store token
	config.DB.Exec(fmt.Sprintf("INSERT INTO %s (user_id, token, expires_at, created_at) VALUES ($1,$2,$3,$4)",
		config.T("federation_tokens")), userID, signed, time.Now().Add(24*time.Hour).Unix(), time.Now().Unix())

	util.Success(c, gin.H{
		"token": signed,
		"user": gin.H{
			"id": user.ID, "username": user.Username, "nickname": user.NicknameStr(),
			"email": user.Email, "avatar": user.AvatarURL(), "site": config.C.AppURL,
		},
	})
}

// Verify a federation token from another site's user
func VerifyFederationToken(c *gin.Context) {
	var req struct {
		Token string `json:"token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "token 不能为空"); return
	}

	// Parse without verification first to get the issuer
	parser := jwt.NewParser(jwt.WithoutClaimsValidation())
	unverified, _, _ := parser.ParseUnverified(req.Token, jwt.MapClaims{})
	if unverified == nil {
		util.Error(c, 400, "INVALID_TOKEN", "Token 格式无效"); return
	}

	claims := unverified.Claims.(jwt.MapClaims)
	issuer, _ := claims["iss"].(string)

	// If issued by this site, verify locally
	if issuer == config.C.AppURL {
		verified, err := jwt.Parse(req.Token, func(t *jwt.Token) (interface{}, error) {
			return []byte(config.C.JWTSecret), nil
		})
		if err != nil || !verified.Valid {
			util.Error(c, 401, "EXPIRED", "Token 已过期"); return
		}
		vc := verified.Claims.(jwt.MapClaims)
		util.Success(c, gin.H{
			"valid": true,
			"user": gin.H{
				"id":       vc["sub"],
				"username": vc["username"],
				"nickname": vc["nickname"],
				"email":    vc["email"],
				"avatar":   vc["avatar"],
				"site":     vc["site"],
			},
		})
		return
	}

	// Otherwise, verify with the issuing site
	resp, err := http.Post(issuer+"/api/v1/federation/verify",
		"application/json", jsonReader(gin.H{"token": req.Token}))
	if err != nil {
		util.Error(c, 502, "VERIFY_FAILED", "无法连接发行站点"); return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(body, &result)

	if success, ok := result["success"].(bool); ok && success {
		util.Success(c, result["data"])
	} else {
		util.Error(c, 401, "INVALID", "身份验证失败")
	}
}

// ===================== Follow System =====================

func FollowSite(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct {
		SiteURL  string `json:"site_url" binding:"required"`
		Username string `json:"username"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "site_url 不能为空"); return
	}

	t := config.T
	now := time.Now().Unix()

	// 1. Discover the remote site
	resp, err := http.Get(req.SiteURL + "/api/v1/federation/metadata")
	if err != nil {
		util.Error(c, 400, "DISCOVERY_FAILED", "无法连接目标站点"); return
	}
	defer resp.Body.Close()
	var meta map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&meta)
	data, _ := meta["data"].(map[string]interface{})
	siteName, _ := data["name"].(string)
	if siteName == "" { siteName = req.SiteURL }

	// 2. Send follow request to remote site
	user, _ := model.UserByID(userID)
	followReq := gin.H{
		"follower_site": config.C.AppURL,
		"follower_name": user.NicknameStr(),
		"follower_avatar": user.AvatarURL(),
		"follower_url":  config.C.AppURL,
	}
	http.Post(req.SiteURL+"/api/v1/federation/follow", "application/json", jsonReader(followReq))

	// 3. Store follow locally
	config.DB.Exec(fmt.Sprintf(
		"INSERT INTO %s (user_id, following_id, source_site, status, created_at) VALUES ($1, 0, $2, 'active', $3) ON CONFLICT DO NOTHING",
		t("followers")), userID, req.SiteURL, now)

	// 4. Auto subscribe to RSS
	feedURL := req.SiteURL + "/api/v1/feed"
	config.DB.Exec(fmt.Sprintf(
		"INSERT INTO %s (user_id, site_url, feed_url, site_name, created_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT DO NOTHING",
		t("rss_subscriptions")), userID, req.SiteURL, feedURL, siteName, now)

	// 5. Check mutual follow → auto link exchange
	var count int
	config.DB.Get(&count, fmt.Sprintf(
		"SELECT COUNT(*) FROM %s WHERE source_site = $1 AND following_id = $2",
		t("followers")), req.SiteURL, userID)

	if count > 0 {
		// Mutual! Auto add link
		config.DB.Exec(fmt.Sprintf(
			"UPDATE %s SET mutual = true WHERE user_id = $1 AND source_site = $2",
			t("followers")), userID, req.SiteURL)

		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (name, url, description, logo, status, sort_order, created_at, updated_at) VALUES ($1,$2,$3,$4,'publish',0,$5,$6) ON CONFLICT DO NOTHING",
			t("links")), siteName, req.SiteURL, "互关好友", "", now, now)

		// Notify
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (user_id, type, title, content, created_at) VALUES ($1,'follow',$2,$3,$4)",
			t("notifications")), userID, "互关成功", siteName+" 已互相关注，友链已自动添加", now)
	}

	util.Success(c, gin.H{"followed": true, "mutual": count > 0, "rss_subscribed": true})
}

func UnfollowSite(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var req struct { SiteURL string `json:"site_url" binding:"required"` }
	c.ShouldBindJSON(&req)
	t := config.T
	config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE user_id = $1 AND source_site = $2", t("followers")), userID, req.SiteURL)
	config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE user_id = $1 AND site_url = $2", t("rss_subscriptions")), userID, req.SiteURL)
	util.Success(c, gin.H{"unfollowed": true})
}

// Receive follow from remote site
func ReceiveFollow(c *gin.Context) {
	var req struct {
		FollowerSite   string `json:"follower_site"`
		FollowerName   string `json:"follower_name"`
		FollowerAvatar string `json:"follower_avatar"`
		FollowerURL    string `json:"follower_url"`
	}
	c.ShouldBindJSON(&req)
	if req.FollowerSite == "" { util.BadRequest(c, "follower_site 不能为空"); return }

	t := config.T
	now := time.Now().Unix()

	// Store as follower of admin (user_id=1)
	config.DB.Exec(fmt.Sprintf(
		"INSERT INTO %s (user_id, following_id, source_site, status, created_at) VALUES (0, 1, $1, 'active', $2) ON CONFLICT DO NOTHING",
		t("followers")), req.FollowerSite, now)

	// Notify admin
	config.DB.Exec(fmt.Sprintf(
		"INSERT INTO %s (user_id, type, title, content, created_at) VALUES (1,'follow',$1,$2,$3)",
		t("notifications")), req.FollowerName+" 关注了你", "来自 "+req.FollowerSite, now)

	// Check if we already follow them back → mutual
	var count int
	config.DB.Get(&count, fmt.Sprintf(
		"SELECT COUNT(*) FROM %s WHERE user_id = 1 AND source_site = $1",
		t("followers")), req.FollowerSite)

	if count > 0 {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET mutual = true WHERE source_site = $1", t("followers")), req.FollowerSite)
		// Auto add link
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (name, url, description, status, sort_order, created_at, updated_at) VALUES ($1,$2,'互关好友','publish',0,$3,$4) ON CONFLICT DO NOTHING",
			t("links")), req.FollowerName, req.FollowerSite, now, now)
	}

	util.Success(c, gin.H{"accepted": true, "mutual": count > 0})
}

// Get follow status
func FollowStatus(c *gin.Context) {
	siteURL := c.Query("site_url")
	if siteURL == "" { util.BadRequest(c, "site_url 参数不能为空"); return }
	userID := middleware.GetUserID(c)

	var following int
	config.DB.Get(&following, fmt.Sprintf(
		"SELECT COUNT(*) FROM %s WHERE user_id = $1 AND source_site = $2",
		config.T("followers")), userID, siteURL)

	var mutual bool
	if following > 0 {
		config.DB.Get(&mutual, fmt.Sprintf(
			"SELECT COALESCE(mutual, false) FROM %s WHERE user_id = $1 AND source_site = $2",
			config.T("followers")), userID, siteURL)
	}

	util.Success(c, gin.H{"following": following > 0, "mutual": mutual})
}

// List my following sites
func ListFollowing(c *gin.Context) {
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
	if subs == nil { subs = []map[string]interface{}{} }
	util.Success(c, subs)
}

// ===================== Federated Comment =====================

func FederatedComment(c *gin.Context) {
	var req struct {
		PostID  int    `json:"post_id" binding:"required"`
		Content string `json:"content" binding:"required"`
		Token   string `json:"federation_token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "post_id 和 content 不能为空"); return
	}

	t := config.T
	now := time.Now().Unix()
	ip := c.ClientIP()
	ua := c.Request.UserAgent()

	author := "匿名"
	email := ""
	url := ""

	// If federation token provided, verify identity
	if req.Token != "" {
		token, err := jwt.Parse(req.Token, func(t *jwt.Token) (interface{}, error) {
			return []byte(config.C.JWTSecret), nil
		})

		if err == nil && token.Valid {
			claims := token.Claims.(jwt.MapClaims)
			if n, ok := claims["nickname"].(string); ok && n != "" { author = n }
			if e, ok := claims["email"].(string); ok { email = e }
			if s, ok := claims["site"].(string); ok { url = s }
		} else {
			// Try remote verification
			issuer := ""
			unverified, _, _ := jwt.NewParser(jwt.WithoutClaimsValidation()).ParseUnverified(req.Token, jwt.MapClaims{})
			if unverified != nil {
				claims := unverified.Claims.(jwt.MapClaims)
				issuer, _ = claims["iss"].(string)
				if n, ok := claims["nickname"].(string); ok { author = n }
				if e, ok := claims["email"].(string); ok { email = e }
				if s, ok := claims["site"].(string); ok { url = s }
			}
			_ = issuer // Could verify with remote site
		}
	} else if middleware.GetUserID(c) > 0 {
		// Local authenticated user
		user, _ := model.UserByID(middleware.GetUserID(c))
		if user != nil {
			author = user.NicknameStr()
			email = user.Email
			url = config.C.AppURL
		}
	}

	var id int
	config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (post_id, author, email, url, content, status, ip, user_agent, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
		t("comments")),
		req.PostID, author, email, url, req.Content,
		func() string { if req.Token != "" || middleware.GetUserID(c) > 0 { return "approved" }; return "pending" }(),
		ip, ua, now,
	).Scan(&id)

	// Update post comment count
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET comment_count = comment_count + 1 WHERE id = $1", t("posts")), req.PostID)

	// Notify post author
	var authorID int
	config.DB.Get(&authorID, "SELECT author_id FROM "+t("posts")+" WHERE id = $1", req.PostID)
	if authorID > 0 {
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (user_id, type, title, content, created_at) VALUES ($1,'comment',$2,$3,$4)",
			t("notifications")), authorID, author+" 评论了你的文章", req.Content[:min(len(req.Content), 100)], now)
	}

	util.Success(c, gin.H{
		"id": id, "author": author, "verified": req.Token != "" || middleware.GetUserID(c) > 0,
	})
}

// ===================== RSS Aggregation =====================

// Fetch RSS feeds from all subscriptions (called by cron or manually)
func FetchFeeds(c *gin.Context) {
	fetched, newItems := runFeedFetch(0)
	util.Success(c, gin.H{"fetched": fetched, "new_items": newItems})
}

// runFeedFetch does one pass over stale subscriptions and returns
// counts. Called by both the manual HTTP endpoint and the 6-hour cron
// started in main.go. Passing limit=0 means "every subscription"; a
// positive limit caps per-call work for the manual HTTP path so the
// request returns in a reasonable time on large follow graphs.
func runFeedFetch(limit int) (fetched, newItems int) {
	t := config.T
	// First, mirror every ul_links.rss_url into ul_rss_subscriptions so
	// adding a link with an RSS address is all the admin needs to do —
	// no separate /social/follow dance. user_id=1 is the default admin
	// owner of these auto-imported subscriptions; site_url comes from
	// the link's url and site_name from its display name.
	config.DB.Exec(fmt.Sprintf(`
		INSERT INTO %s (user_id, site_url, feed_url, site_name, site_avatar, last_fetched_at, created_at)
		SELECT 1, l.url, l.rss_url, l.name, COALESCE(l.logo,''), 0, EXTRACT(EPOCH FROM NOW())::bigint
		FROM %s l
		WHERE l.rss_url IS NOT NULL AND l.rss_url <> ''
		ON CONFLICT (user_id, feed_url) DO NOTHING
	`, t("rss_subscriptions"), t("links")))

	var subs []struct {
		ID      int    `db:"id"`
		FeedURL string `db:"feed_url"`
	}
	q := fmt.Sprintf("SELECT id, feed_url FROM %s ORDER BY last_fetched_at ASC", t("rss_subscriptions"))
	if limit > 0 {
		q += fmt.Sprintf(" LIMIT %d", limit)
	}
	config.DB.Select(&subs, q)

	for _, sub := range subs {
		items, err := fetchRSSFeed(sub.FeedURL)
		if err != nil {
			continue
		}
		fetched++

		now := time.Now().Unix()
		for _, item := range items {
			result, ierr := config.DB.Exec(fmt.Sprintf(
				"INSERT INTO %s (subscription_id, title, link, description, pub_date, guid, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING",
				t("feed_items")), sub.ID, item.Title, item.Link, item.Description, item.PubDate, item.GUID, now)
			// result is nil on driver error; previous code blindly
			// called RowsAffected() and panicked out the whole
			// /fetch-feeds request when a single row overflowed the
			// pub_date INTEGER column.
			if ierr != nil || result == nil {
				continue
			}
			if rows, _ := result.RowsAffected(); rows > 0 {
				newItems++
			}
		}
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET last_fetched_at = $1 WHERE id = $2", t("rss_subscriptions")), now, sub.ID)
	}

	if newItems > 0 {
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (user_id, type, title, content, created_at) VALUES (1,'feed','关注动态更新',$1,$2)",
			t("notifications")), fmt.Sprintf("发现 %d 条新内容", newItems), time.Now().Unix())
	}
	return
}

// StartFeedFetchCron runs runFeedFetch every 6 hours for the lifetime
// of the process. Called once from main after DB init. The first tick
// fires after an initial 2-minute warmup so the main listener is
// healthy before we start outbound HTTP. Errors are swallowed inside
// runFeedFetch (continue on fail) so a single bad feed never stops
// the whole pass.
func StartFeedFetchCron() {
	go func() {
		time.Sleep(2 * time.Minute)
		runFeedFetch(0)
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for range ticker.C {
			f, n := runFeedFetch(0)
			fmt.Printf("[rss-cron] fetched=%d new_items=%d\n", f, n)
		}
	}()
}

// Get aggregated feed timeline
func FeedTimeline(c *gin.Context) {
	userID := middleware.GetUserID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage := 20
	offset := (page - 1) * perPage

	t := config.T
	var items []map[string]interface{}
	rows, _ := config.DB.Queryx(fmt.Sprintf(
		"SELECT fi.*, rs.site_name, rs.site_url FROM %s fi JOIN %s rs ON fi.subscription_id = rs.id WHERE rs.user_id = $1 ORDER BY fi.pub_date DESC LIMIT $2 OFFSET $3",
		t("feed_items"), t("rss_subscriptions")), userID, perPage, offset)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			items = append(items, row)
		}
	}
	if items == nil { items = []map[string]interface{}{} }

	var total int
	config.DB.Get(&total, fmt.Sprintf(
		"SELECT COUNT(*) FROM %s fi JOIN %s rs ON fi.subscription_id = rs.id WHERE rs.user_id = $1",
		t("feed_items"), t("rss_subscriptions")), userID)

	util.Paginate(c, items, total, page, perPage)
}

// ===================== Notification Bell =====================

func NotificationsList(c *gin.Context) {
	userID := middleware.GetUserID(c)
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	perPage := 20
	offset := (page - 1) * perPage
	t := config.T("notifications")

	var total int
	config.DB.Get(&total, "SELECT COUNT(*) FROM "+t+" WHERE user_id = $1", userID)

	var notifs []map[string]interface{}
	rows, _ := config.DB.Queryx(fmt.Sprintf(
		"SELECT * FROM %s WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", t), userID, perPage, offset)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			notifs = append(notifs, row)
		}
	}
	if notifs == nil { notifs = []map[string]interface{}{} }
	util.Paginate(c, notifs, total, page, perPage)
}

// ===================== Follow Management =====================

// List all follows with rich site info (for dashboard)
func FollowManagement(c *gin.Context) {
	userID := middleware.GetUserID(c)
	t := config.T

	// My following (sites I follow)
	var following []map[string]interface{}
	rows, _ := config.DB.Queryx(fmt.Sprintf(
		"SELECT f.*, rs.site_name, rs.site_url FROM %s f LEFT JOIN %s rs ON f.source_site = rs.site_url AND rs.user_id = $1 WHERE f.user_id = $1 AND f.source_site != '' ORDER BY f.created_at DESC",
		t("followers"), t("rss_subscriptions")), userID)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			row := make(map[string]interface{})
			rows.MapScan(row)
			following = append(following, row)
		}
	}
	if following == nil { following = []map[string]interface{}{} }

	// My followers (sites that follow me)
	var followers []map[string]interface{}
	rows2, _ := config.DB.Queryx(fmt.Sprintf(
		"SELECT * FROM %s WHERE following_id = $1 AND source_site != '' ORDER BY created_at DESC",
		t("followers")), userID)
	if rows2 != nil {
		defer rows2.Close()
		for rows2.Next() {
			row := make(map[string]interface{})
			rows2.MapScan(row)
			followers = append(followers, row)
		}
	}
	if followers == nil { followers = []map[string]interface{}{} }

	// Fetch rich metadata for each site (in background for speed)
	enrichSiteInfo := func(items []map[string]interface{}) {
		for i, item := range items {
			siteURL, _ := item["source_site"].(string)
			if siteURL == "" { continue }
			resp, err := http.Get(siteURL + "/api/v1/federation/metadata")
			if err != nil { continue }
			defer resp.Body.Close()
			var result map[string]interface{}
			json.NewDecoder(resp.Body).Decode(&result)
			if data, ok := result["data"].(map[string]interface{}); ok {
				items[i]["site_info"] = data
			}
		}
	}

	enrichSiteInfo(following)
	enrichSiteInfo(followers)

	// Mutual follows
	var mutual []map[string]interface{}
	for _, f := range following {
		if m, ok := f["mutual"].(bool); ok && m {
			mutual = append(mutual, f)
		}
	}
	if mutual == nil { mutual = []map[string]interface{}{} }

	util.Success(c, gin.H{
		"following": following,
		"followers": followers,
		"mutual":    mutual,
		"counts": gin.H{
			"following": len(following),
			"followers": len(followers),
			"mutual":    len(mutual),
		},
	})
}

// ===================== Helpers =====================

type rssItem struct {
	Title       string
	Link        string
	Description string
	PubDate     int64
	GUID        string
}

type rssXML struct {
	XMLName xml.Name `xml:"rss"`
	Channel struct {
		Items []struct {
			Title       string `xml:"title"`
			Link        string `xml:"link"`
			Description string `xml:"description"`
			PubDate     string `xml:"pubDate"`
			GUID        string `xml:"guid"`
		} `xml:"item"`
	} `xml:"channel"`
}

func fetchRSSFeed(feedURL string) ([]rssItem, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(feedURL)
	if err != nil { return nil, err }
	defer resp.Body.Close()

	var rss rssXML
	if err := xml.NewDecoder(resp.Body).Decode(&rss); err != nil { return nil, err }

	now := time.Now().Unix()
	var items []rssItem
	for _, item := range rss.Channel.Items {
		pubDate := parseRSSDate(item.PubDate, now)
		guid := item.GUID
		if guid == "" {
			guid = item.Link
		}
		items = append(items, rssItem{
			Title: item.Title, Link: item.Link, Description: item.Description,
			PubDate: pubDate, GUID: guid,
		})
	}
	return items, nil
}

// parseRSSDate tries the handful of formats real feeds use in the wild,
// falling back to "now" so we never store the Go zero time (-62135596800)
// which overflows the pub_date INTEGER column. Also clamps: RSS from the
// year 0001 or the far future both get coerced to now.
func parseRSSDate(s string, fallback int64) int64 {
	s = strings.TrimSpace(s)
	if s == "" {
		return fallback
	}
	formats := []string{
		time.RFC1123Z,                     // RFC 822 with numeric TZ
		time.RFC1123,                      // RFC 822 with named TZ
		time.RFC3339,                      // Atom / modern
		"2006-01-02T15:04:05Z07:00",       // Atom shorthand
		"Mon, 2 Jan 2006 15:04:05 MST",    // lax RFC1123
		"Mon, 2 Jan 2006 15:04:05 -0700",  // lax RFC1123Z
		"2006-01-02 15:04:05",             // bare
	}
	for _, f := range formats {
		if t, err := time.Parse(f, s); err == nil {
			ts := t.Unix()
			// Clamp: int32 min is -2^31 (~1901), max is 2^31-1 (~2038).
			// pub_date column is INTEGER so anything outside that range
			// fails at the driver. Feeds with year-0001 dates (common
			// for auto-generated placeholders) trip this.
			if ts < 0 || ts > 2147483000 {
				return fallback
			}
			return ts
		}
	}
	return fallback
}

func jsonReader(data interface{}) io.Reader {
	b, _ := json.Marshal(data)
	return bytes.NewReader(b)
}
