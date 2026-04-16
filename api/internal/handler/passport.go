package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// IdentifyPassport — POST /api/v1/passport/identify
// 接收 passport.js SDK 发来的 passport token，向 id.utterlog.com 验证，返回身份 + 关注状态
func IdentifyPassport(c *gin.Context) {
	var req struct {
		Token      string `json:"token" binding:"required"`
		UtterlogID string `json:"utterlog_id"`
		Nickname   string `json:"nickname"`
		Avatar     string `json:"avatar"`
		EmailHash  string `json:"email_hash"`
		SiteURL    string `json:"site_url"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "缺少 token")
		return
	}

	// 向 id.utterlog.com 验证 passport token
	identity, err := verifyPassportToken(req.Token)
	if err != nil {
		util.Error(c, http.StatusUnauthorized, "INVALID_PASSPORT", "身份验证失败")
		return
	}

	// 查询关注关系
	followStatus := ""
	if identity.SiteURL != "" {
		followStatus = checkFollowByURL(identity.SiteURL)
	}

	// 查询是否友链
	isFriendLink := false
	if identity.SiteURL != "" {
		domain := extractDomainSimple(identity.SiteURL)
		if domain != "" {
			var count int
			config.DB.Get(&count, "SELECT COUNT(*) FROM "+config.T("links")+" WHERE status='publish' AND url ILIKE $1", "%"+domain+"%")
			isFriendLink = count > 0
		}
	}

	// 记录为 Utterlog 网络访客（access_logs）
	go func() {
		ip := c.ClientIP()
		config.DB.Exec(
			"UPDATE "+config.T("access_logs")+" SET visitor_id = $1 WHERE ip = $2 AND visitor_id = '' AND created_at > $3",
			"utterlog:"+identity.UtterlogID, ip, time.Now().Add(-5*time.Minute).Unix(),
		)
	}()

	util.Success(c, gin.H{
		"identified":    true,
		"utterlog_id":   identity.UtterlogID,
		"nickname":      identity.Nickname,
		"avatar":        identity.Avatar,
		"email":         identity.Email,
		"email_hash":    identity.EmailHash,
		"site_url":      identity.SiteURL,
		"follow_status": followStatus,
		"is_friend_link": isFriendLink,
	})
}

type passportIdentity struct {
	UtterlogID string `json:"utterlog_id"`
	Nickname   string `json:"nickname"`
	Avatar     string `json:"avatar"`
	Email      string `json:"email"`
	EmailHash  string `json:"email_hash"`
	SiteURL    string `json:"site_url"`
}

func verifyPassportToken(token string) (*passportIdentity, error) {
	body, _ := json.Marshal(map[string]string{"token": token})
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Post(utterlogHub+"/api/v1/passport/verify", "application/json", bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Success bool `json:"success"`
		Data    struct {
			Valid      bool   `json:"valid"`
			UtterlogID string `json:"utterlog_id"`
			Nickname   string `json:"nickname"`
			Avatar     string `json:"avatar"`
			Email      string `json:"email"`
			EmailHash  string `json:"email_hash"`
			SiteURL    string `json:"site_url"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if !result.Success || !result.Data.Valid {
		return nil, fmt.Errorf("invalid passport")
	}

	return &passportIdentity{
		UtterlogID: result.Data.UtterlogID,
		Nickname:   result.Data.Nickname,
		Avatar:     result.Data.Avatar,
		Email:      result.Data.Email,
		EmailHash:  result.Data.EmailHash,
		SiteURL:    result.Data.SiteURL,
	}, nil
}

func checkFollowByURL(siteURL string) string {
	domain := extractDomainSimple(siteURL)
	if domain == "" {
		return ""
	}

	type followerRow struct {
		FollowingID int  `db:"following_id"`
		UserID      int  `db:"user_id"`
		Mutual      bool `db:"mutual"`
	}
	var rows []followerRow
	config.DB.Select(&rows, "SELECT following_id, user_id, COALESCE(mutual, false) as mutual FROM "+config.T("followers")+" WHERE source_site ILIKE $1", "%"+domain+"%")

	for _, r := range rows {
		if r.Mutual {
			return "mutual"
		}
	}
	for _, r := range rows {
		if r.FollowingID == 1 {
			return "follower"
		}
	}
	for _, r := range rows {
		if r.UserID > 0 {
			return "following"
		}
	}
	return ""
}

func extractDomainSimple(rawURL string) string {
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
