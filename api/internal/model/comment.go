package model

import (
	"crypto/md5"
	"encoding/json"
	"fmt"
	"net/http"
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
	CreatedAt   int64   `db:"created_at" json:"created_at"`
	UpdatedAt   int64   `db:"updated_at" json:"updated_at"`
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
	resp, err := client.Get("https://api.cnip.io/geoip/" + ip)
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

type CommentWithPost struct {
	Comment
	PostTitle string   `json:"post_title"`
	PostSlug  string   `json:"post_slug"`
	AvatarURL string   `json:"avatar_url"`
	Geo       *GeoInfo `json:"geo,omitempty"`
	IsAdmin   bool     `json:"is_admin"`
}

func FormatComments(comments []Comment) []CommentWithPost {
	result := make([]CommentWithPost, len(comments))
	postCache := map[int]*Post{}

	// Get admin email for is_admin detection
	adminEmail := ""
	if admin, err := UserByID(1); err == nil {
		adminEmail = strings.ToLower(admin.Email)
	}
	for i, c := range comments {
		result[i] = CommentWithPost{Comment: c}
		// Gravatar MD5 hash
		email := ""
		if c.AuthorEmail != nil {
			email = strings.TrimSpace(strings.ToLower(*c.AuthorEmail))
		}
		hash := fmt.Sprintf("%x", md5.Sum([]byte(email)))
		result[i].AvatarURL = fmt.Sprintf("https://gravatar.bluecdn.com/avatar/%s?s=64&d=mp", hash)
		result[i].IsAdmin = adminEmail != "" && email == adminEmail

		// GeoIP lookup
		if c.AuthorIP != nil && *c.AuthorIP != "" {
			result[i].Geo = lookupGeo(*c.AuthorIP)
		}

		if _, ok := postCache[c.PostID]; !ok {
			p, err := PostByID(c.PostID)
			if err == nil {
				postCache[c.PostID] = p
			}
		}
		if p, ok := postCache[c.PostID]; ok {
			result[i].PostTitle = p.Title
			result[i].PostSlug = p.Slug
		}
	}
	return result
}

func CommentsList(page, perPage int, status, search string, postID, userID int) ([]Comment, int, error) {
	t := config.T("comments")
	where := []string{}
	args := []interface{}{}
	idx := 1
	if status != "" {
		where = append(where, fmt.Sprintf("status = $%d", idx)); args = append(args, status); idx++
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
	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s %s", t, whereStr), args...)

	args = append(args, perPage, (page-1)*perPage)
	var comments []Comment
	config.DB.Select(&comments, fmt.Sprintf("SELECT * FROM %s %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d", t, whereStr, idx, idx+1), args...)
	if comments == nil { comments = []Comment{} }
	return comments, total, nil
}

func DeleteComment(id int) error {
	_, err := config.DB.Exec("DELETE FROM "+config.T("comments")+" WHERE id = $1", id)
	return err
}
