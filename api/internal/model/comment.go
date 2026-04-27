package model

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"
	"utterlog-go/config"
)

type Comment struct {
	ID          int     `db:"id" json:"id"`
	PostID      int     `db:"post_id" json:"post_id"`
	ParentID    *int    `db:"parent_id" json:"parent_id,omitempty"`
	AuthorName  string  `db:"author_name" json:"author"`
	AuthorEmail *string `db:"author_email" json:"email,omitempty"`
	AuthorURL   *string `db:"author_url" json:"url,omitempty"`
	AuthorIP    *string `db:"author_ip" json:"ip,omitempty"`
	AuthorAgent *string `db:"author_agent" json:"user_agent,omitempty"`
	Content     string  `db:"content" json:"content"`
	Status      string  `db:"status" json:"status"`
	UserID      *int    `db:"user_id" json:"user_id,omitempty"`
	Source      *string `db:"source" json:"source,omitempty"`
	SourceID    *string `db:"source_id" json:"source_id,omitempty"`
	LikeCount   int     `db:"like_count" json:"like_count"`
	Featured    bool    `db:"featured" json:"featured"`
	DisplayID   int     `db:"display_id" json:"display_id"`
	GeoData     *string `db:"geo" json:"-"`           // stored JSON, parsed in FormatComments
	ClientHints *string `db:"client_hints" json:"-"` // JSON from UA Client Hints API
	VisitorID   string  `db:"visitor_id" json:"-"`
	CreatedAt   int64   `db:"created_at" json:"created_at"`
	UpdatedAt   int64   `db:"updated_at" json:"updated_at"`
	// Sync provenance. SELECT * queries that feed this struct panic
	// silently into []Comment{} if these columns aren't modeled.
	SourceType     string `db:"source_type" json:"source_type,omitempty"`
	SourceSiteUUID string `db:"source_site_uuid" json:"source_site_uuid,omitempty"`
	// AI 智能回复标记。前端检测到 true 时按 ai_comment_reply_badge_text
	// 展示「🤖 AI 辅助回复」徽标。由 publishAIReply 在写入新评论时置位。
	IsAIReply bool `db:"is_ai_reply" json:"is_ai_reply"`
}

type GeoInfo struct {
	CountryCode string `json:"country_code"`
	Country     string `json:"country"`
	Province    string `json:"province"`
	City        string `json:"city"`
}

var (
	geoCache   = map[string]*GeoInfo{}
	geoCacheMu sync.RWMutex
)

func lookupGeo(ip string) *GeoInfo {
	if ip == "" {
		return nil
	}
	geoCacheMu.RLock()
	if g, ok := geoCache[ip]; ok {
		geoCacheMu.RUnlock()
		return g
	}
	geoCacheMu.RUnlock()

	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Get("https://api.ipx.ee/ip/" + ip)
	if err != nil {
		return nil
	}
	defer resp.Body.Close()

	var raw struct {
		CountryCode string `json:"country_code"`
		Country     string `json:"country"`
		Province    string `json:"province"`
		City        string `json:"city"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&raw); err != nil {
		return nil
	}

	geo := &GeoInfo{
		CountryCode: strings.ToLower(raw.CountryCode),
		Country:     raw.Country,
		Province:    raw.Province,
		City:        raw.City,
	}

	geoCacheMu.Lock()
	geoCache[ip] = geo
	geoCacheMu.Unlock()

	return geo
}

// LookupAndStoreGeo looks up geoip for a comment and persists it to the geo column
func LookupAndStoreGeo(commentID int, ip string) *GeoInfo {
	geo := lookupGeo(ip)
	if geo != nil && geo.CountryCode != "" {
		geoJSON, _ := json.Marshal(geo)
		config.DB.Exec("UPDATE "+config.T("comments")+" SET geo = $1 WHERE id = $2", string(geoJSON), commentID)
	}
	return geo
}

type ParentComment struct {
	ID        int    `json:"id"`
	Author    string `json:"author"`
	Content   string `json:"content"`
	CreatedAt int64  `json:"created_at"`
}

type CommentWithPost struct {
	Comment
	PostTitle        string         `json:"post_title"`
	PostSlug         string         `json:"post_slug"`
	PostCommentCount int            `json:"post_comment_count"`
	PostCategories   []MetaBrief    `json:"post_categories,omitempty"`
	AvatarURL    string         `json:"avatar_url"`
	Geo          *GeoInfo       `json:"geo,omitempty"`
	IsAdmin      bool           `json:"is_admin"`
	Parent       *ParentComment `json:"parent,omitempty"`
	CommentCount int            `json:"comment_count"`
	Level        int            `json:"level"`
	IsFriendLink bool           `json:"is_friend_link"`
	FollowStatus string         `json:"follow_status,omitempty"` // "follower" | "following" | "mutual" | ""
	OSName       string         `json:"os_name,omitempty"`
	OSVersion    string         `json:"os_version,omitempty"`
	BrowserName  string         `json:"browser_name,omitempty"`
	BrowserVer   string         `json:"browser_version,omitempty"`
	IsMobile     bool           `json:"is_mobile,omitempty"`
}

func commentLevel(count int) int {
	switch {
	case count >= 500:
		return 10
	case count >= 300:
		return 9
	case count >= 200:
		return 8
	case count >= 100:
		return 7
	case count >= 60:
		return 6
	case count >= 35:
		return 5
	case count >= 20:
		return 4
	case count >= 10:
		return 3
	case count >= 5:
		return 2
	default:
		return 1
	}
}

func extractDomain(rawURL string) string {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ""
	}
	if !strings.Contains(rawURL, "://") {
		rawURL = "https://" + rawURL
	}
	u, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	return strings.TrimPrefix(strings.ToLower(u.Host), "www.")
}

func FormatComments(comments []Comment) []CommentWithPost {
	result := make([]CommentWithPost, len(comments))
	postCache := map[int]*Post{}

	// Admin identity can come from logged-in comments (user_id) or legacy
	// comments that only stored the author's email.
	type adminIdentity struct {
		ID    int    `db:"id"`
		Email string `db:"email"`
	}
	adminID := 0
	adminIDs := map[int]bool{}
	adminEmails := map[string]bool{}
	adminEmailByID := map[int]string{}
	var admins []adminIdentity
	config.DB.Select(&admins, "SELECT id, email FROM "+config.T("users")+" WHERE role = 'admin'")
	for _, admin := range admins {
		adminIDs[admin.ID] = true
		if admin.ID == 1 || adminID == 0 {
			adminID = admin.ID
		}
		email := strings.TrimSpace(strings.ToLower(admin.Email))
		if email != "" {
			adminEmails[email] = true
			adminEmailByID[admin.ID] = email
		}
	}

	// Batch query: comment count per identity (for levels)
	emailCountMap := map[string]int{}
	userIDCountMap := map[int]int{}
	emails := []string{}
	userIDs := []int{}
	for _, c := range comments {
		if c.AuthorEmail != nil && *c.AuthorEmail != "" {
			e := strings.TrimSpace(strings.ToLower(*c.AuthorEmail))
			if _, ok := emailCountMap[e]; !ok {
				emailCountMap[e] = 0
				emails = append(emails, e)
			}
		}
		if c.UserID != nil && *c.UserID > 0 {
			uid := *c.UserID
			if _, ok := userIDCountMap[uid]; !ok {
				userIDCountMap[uid] = 0
				userIDs = append(userIDs, uid)
			}
		}
	}
	if len(emails) > 0 {
		type emailCount struct {
			Email string `db:"email"`
			Count int    `db:"cnt"`
		}
		placeholders := make([]string, len(emails))
		args := make([]interface{}, len(emails))
		for i, e := range emails {
			placeholders[i] = fmt.Sprintf("$%d", i+1)
			args[i] = e
		}
		q := fmt.Sprintf(
			"SELECT LOWER(TRIM(author_email)) as email, COUNT(*) as cnt FROM %s WHERE status='approved' AND LOWER(TRIM(author_email)) IN (%s) GROUP BY LOWER(TRIM(author_email))",
			config.T("comments"), strings.Join(placeholders, ","),
		)
		var counts []emailCount
		config.DB.Select(&counts, q, args...)
		for _, ec := range counts {
			emailCountMap[ec.Email] = ec.Count
		}
	}
	if len(userIDs) > 0 {
		type userCount struct {
			UserID int `db:"user_id"`
			Count  int `db:"cnt"`
		}
		placeholders := make([]string, len(userIDs))
		args := make([]interface{}, len(userIDs))
		for i, uid := range userIDs {
			placeholders[i] = fmt.Sprintf("$%d", i+1)
			args[i] = uid
		}
		q := fmt.Sprintf(
			"SELECT user_id, COUNT(*) as cnt FROM %s WHERE status='approved' AND user_id IN (%s) GROUP BY user_id",
			config.T("comments"), strings.Join(placeholders, ","),
		)
		var counts []userCount
		config.DB.Select(&counts, q, args...)
		for _, uc := range counts {
			userIDCountMap[uc.UserID] = uc.Count
		}
	}
	// Admin totals include both current logged-in comments and older comments
	// that only stored the admin email.
	for _, admin := range admins {
		if admin.ID <= 0 {
			continue
		}
		email := adminEmailByID[admin.ID]
		var cnt int
		if email != "" {
			config.DB.Get(&cnt,
				"SELECT COUNT(*) FROM "+config.T("comments")+" WHERE status='approved' AND (COALESCE(user_id, 0) = $1 OR LOWER(TRIM(author_email)) = $2)",
				admin.ID, email,
			)
		} else {
			config.DB.Get(&cnt,
				"SELECT COUNT(*) FROM "+config.T("comments")+" WHERE status='approved' AND COALESCE(user_id, 0) = $1",
				admin.ID,
			)
		}
		if cnt > 0 {
			userIDCountMap[admin.ID] = cnt
		}
	}

	// Friend links: load all published links
	friendDomains := map[string]bool{}
	var links []Link
	config.DB.Select(&links, "SELECT url FROM "+config.T("links")+" WHERE status='publish'")
	for _, l := range links {
		d := extractDomain(l.URL)
		if d != "" {
			friendDomains[d] = true
		}
	}

	// Followers: load all follow relationships
	type followerRow struct {
		SourceSite string `db:"source_site"`
		FollowingID int   `db:"following_id"`
		UserID      int   `db:"user_id"`
		Mutual      bool  `db:"mutual"`
	}
	var followers []followerRow
	config.DB.Select(&followers, "SELECT source_site, following_id, user_id, COALESCE(mutual, false) as mutual FROM "+config.T("followers")+" WHERE source_site != ''")
	// Build domain → status map
	followMap := map[string]string{} // domain → "follower" | "following" | "mutual"
	for _, f := range followers {
		d := extractDomain(f.SourceSite)
		if d == "" {
			continue
		}
		if f.Mutual {
			followMap[d] = "mutual"
		} else if f.FollowingID == 1 {
			// They follow me
			if followMap[d] != "mutual" {
				followMap[d] = "follower"
			}
		} else if f.UserID == adminID {
			// I follow them
			if followMap[d] != "mutual" && followMap[d] != "follower" {
				followMap[d] = "following"
			}
		}
	}

	parentCache := map[int]*Comment{}
	for i, c := range comments {
		result[i] = CommentWithPost{Comment: c}
		// Gravatar MD5 hash
		email := ""
		if c.AuthorEmail != nil {
			email = strings.TrimSpace(strings.ToLower(*c.AuthorEmail))
		}
		userID := 0
		if c.UserID != nil {
			userID = *c.UserID
		}
		avatarEmail := email
		if adminEmail, ok := adminEmailByID[userID]; ok {
			avatarEmail = adminEmail
		}
		hash := fmt.Sprintf("%x", md5.Sum([]byte(email)))
		result[i].IsAdmin = (userID > 0 && adminIDs[userID]) || (email != "" && adminEmails[email])
		// Admin comments follow site-wide avatar_source (Gravatar / Utterlog Network).
		// Visitors always use Gravatar since they may not have Utterlog accounts.
		if result[i].IsAdmin {
			result[i].AvatarURL = ResolveAvatarByEmail(avatarEmail)
		} else {
			result[i].AvatarURL = fmt.Sprintf("https://gravatar.bluecdn.com/avatar/%s?s=64&d=mp", hash)
		}

		// Comment level
		cnt := 0
		if userID > 0 {
			cnt = userIDCountMap[userID]
		}
		if cnt == 0 && email != "" {
			cnt = emailCountMap[email]
		}
		if cnt > 0 {
			result[i].CommentCount = cnt
			result[i].Level = commentLevel(cnt)
		} else {
			result[i].CommentCount = 1
			result[i].Level = 1
		}

		// Friend link check
		if c.AuthorURL != nil && *c.AuthorURL != "" {
			d := extractDomain(*c.AuthorURL)
			if d != "" && friendDomains[d] {
				result[i].IsFriendLink = true
			}
			// Follow status
			if status, ok := followMap[d]; ok {
				result[i].FollowStatus = status
			}
		}

		// Parse Client Hints (high-fidelity OS/browser info)
		if c.ClientHints != nil && *c.ClientHints != "" {
			var ch struct {
				Platform        string `json:"platform"`
				PlatformVersion string `json:"platformVersion"`
				Browser         string `json:"browser"`
				BrowserVersion  string `json:"browserVersion"`
				Mobile          bool   `json:"mobile"`
				Architecture    string `json:"architecture"`
			}
			if json.Unmarshal([]byte(*c.ClientHints), &ch) == nil && ch.Platform != "" {
				result[i].OSName = ch.Platform
				result[i].OSVersion = ch.PlatformVersion
				// Normalize browser names
				bn := ch.Browser
				bn = strings.Replace(bn, "Google Chrome", "Chrome", 1)
				bn = strings.Replace(bn, "Microsoft Edge", "Edge", 1)
				bn = strings.Replace(bn, "Mozilla Firefox", "Firefox", 1)
				result[i].BrowserName = bn
				result[i].BrowserVer = ch.BrowserVersion
				result[i].IsMobile = ch.Mobile
			}
		}

		// GeoIP: read from stored geo column first, fallback to API lookup + save
		if c.GeoData != nil && *c.GeoData != "" {
			var geo GeoInfo
			if json.Unmarshal([]byte(*c.GeoData), &geo) == nil && geo.CountryCode != "" {
				result[i].Geo = &geo
			}
		}
		if result[i].Geo == nil && c.AuthorIP != nil && *c.AuthorIP != "" {
			geo := lookupGeo(*c.AuthorIP)
			if geo != nil && geo.CountryCode != "" {
				result[i].Geo = geo
				// Persist to DB so we don't look up again
				geoJSON, _ := json.Marshal(geo)
				go config.DB.Exec("UPDATE "+config.T("comments")+" SET geo = $1 WHERE id = $2", string(geoJSON), c.ID)
			}
		}

		// Post info
		if _, ok := postCache[c.PostID]; !ok {
			p, err := PostByID(c.PostID)
			if err == nil {
				postCache[c.PostID] = p
			}
		}
		if p, ok := postCache[c.PostID]; ok {
			result[i].PostTitle = p.Title
			result[i].PostSlug = p.Slug
			result[i].PostCommentCount = p.CommentCount
			result[i].PostCategories = PostCategories(p.ID)
		}

		// Parent comment info (for replies)
		if c.ParentID != nil && *c.ParentID > 0 {
			pid := *c.ParentID
			if _, ok := parentCache[pid]; !ok {
				var pc Comment
				err := config.DB.Get(&pc, "SELECT id, author_name, content, created_at FROM "+config.T("comments")+" WHERE id = $1", pid)
				if err == nil {
					parentCache[pid] = &pc
				}
			}
			if pc, ok := parentCache[pid]; ok {
				contentPreview := pc.Content
				runes := []rune(contentPreview)
				if len(runes) > 100 {
					contentPreview = string(runes[:100]) + "..."
				}
				result[i].Parent = &ParentComment{
					ID:        pc.ID,
					Author:    pc.AuthorName,
					Content:   contentPreview,
					CreatedAt: pc.CreatedAt,
				}
			}
		}
	}
	return result
}

func CommentsList(page, perPage int, status, search, order string, postID, userID int, topLevel bool, excludeAdmin ...bool) ([]Comment, int, error) {
	t := config.T("comments")
	where := []string{}
	args := []interface{}{}
	idx := 1

	// Exclude admin (site owner) comments when requested
	if len(excludeAdmin) > 0 && excludeAdmin[0] {
		adminEmail := ""
		if admin, err := UserByID(1); err == nil {
			adminEmail = strings.TrimSpace(strings.ToLower(admin.Email))
		}
		if adminEmail != "" {
			where = append(where, fmt.Sprintf("LOWER(TRIM(author_email)) != $%d", idx))
			args = append(args, adminEmail)
			idx++
		}
		// Also exclude comments from logged-in admin (user_id = 1)
		where = append(where, fmt.Sprintf("COALESCE(user_id, 0) != $%d", idx))
		args = append(args, 1)
		idx++
	}

	if status != "" {
		if strings.Contains(status, ",") {
			parts := strings.Split(status, ",")
			placeholders := make([]string, len(parts))
			for i, s := range parts {
				placeholders[i] = fmt.Sprintf("$%d", idx)
				args = append(args, strings.TrimSpace(s))
				idx++
			}
			where = append(where, fmt.Sprintf("status IN (%s)", strings.Join(placeholders, ",")))
		} else {
			where = append(where, fmt.Sprintf("status = $%d", idx)); args = append(args, status); idx++
		}
	}
	if postID > 0 {
		where = append(where, fmt.Sprintf("post_id = $%d", idx)); args = append(args, postID); idx++
	}
	if userID > 0 {
		where = append(where, fmt.Sprintf("user_id = $%d", idx)); args = append(args, userID); idx++
	}
	if search != "" {
		where = append(where, fmt.Sprintf("(content ILIKE $%d OR author_name ILIKE $%d OR author_email ILIKE $%d)", idx, idx+1, idx+2))
		args = append(args, "%"+search+"%", "%"+search+"%", "%"+search+"%"); idx += 3
	}
	whereStr := ""
	if len(where) > 0 {
		whereStr = "WHERE " + strings.Join(where, " AND ")
	}

	orderDir := "DESC"
	if order == "asc" { orderDir = "ASC" }

	if !topLevel {
		// Original behavior: paginate all comments
		var total int
		config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s %s", t, whereStr), args...)
		args = append(args, perPage, (page-1)*perPage)
		var comments []Comment
		config.DB.Select(&comments, fmt.Sprintf("SELECT * FROM %s %s ORDER BY created_at %s LIMIT $%d OFFSET $%d", t, whereStr, orderDir, idx, idx+1), args...)
		if comments == nil { comments = []Comment{} }
		return comments, total, nil
	}

	// Top-level pagination: only count/paginate root comments, then fetch all their replies
	topWhere := whereStr
	if topWhere == "" {
		topWhere = "WHERE (parent_id IS NULL OR parent_id = 0)"
	} else {
		topWhere += " AND (parent_id IS NULL OR parent_id = 0)"
	}

	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s %s", t, topWhere), args...)

	// Get top-level comment IDs for this page
	topArgs := append([]interface{}{}, args...)
	topArgs = append(topArgs, perPage, (page-1)*perPage)
	var topIDs []int
	config.DB.Select(&topIDs, fmt.Sprintf("SELECT id FROM %s %s ORDER BY created_at %s LIMIT $%d OFFSET $%d", t, topWhere, orderDir, idx, idx+1), topArgs...)
	if len(topIDs) == 0 {
		return []Comment{}, total, nil
	}

	// Fetch top-level comments + all their replies in one query
	ph1 := make([]string, len(topIDs))
	ph2 := make([]string, len(topIDs))
	fetchArgs := make([]interface{}, 0, len(topIDs)*2)
	for i, id := range topIDs {
		ph1[i] = fmt.Sprintf("$%d", i+1)
		ph2[i] = fmt.Sprintf("$%d", len(topIDs)+i+1)
		fetchArgs = append(fetchArgs, id)
	}
	for _, id := range topIDs {
		fetchArgs = append(fetchArgs, id)
	}

	var comments []Comment
	config.DB.Select(&comments, fmt.Sprintf(
		"SELECT * FROM %s WHERE id IN (%s) OR parent_id IN (%s) ORDER BY created_at %s",
		t, strings.Join(ph1, ","), strings.Join(ph2, ","), orderDir), fetchArgs...)
	if comments == nil { comments = []Comment{} }
	return comments, total, nil
}

func DeleteComment(id int) error {
	_, err := config.DB.Exec("DELETE FROM "+config.T("comments")+" WHERE id = $1", id)
	return err
}
