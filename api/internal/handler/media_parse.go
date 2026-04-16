package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// ParsedMedia represents parsed media metadata from external URLs
type ParsedMedia struct {
	Type     string `json:"type"`     // movie, book, music, game, tv
	Title    string `json:"title"`
	Cover    string `json:"cover_url"`
	Artist   string `json:"artist,omitempty"`   // music artist, movie director, book author
	Album    string `json:"album,omitempty"`
	Year     string `json:"year,omitempty"`
	Rating   float64 `json:"rating,omitempty"`
	Summary  string `json:"summary,omitempty"`
	Platform string `json:"platform"`
	URL      string `json:"url"`
	Extra    map[string]string `json:"extra,omitempty"`
}

var httpClient = &http.Client{Timeout: 15 * time.Second}

// ParseMediaURL parses a URL and returns structured metadata
func ParseMediaURL(c *gin.Context) {
	var req struct {
		URL string `json:"url" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "URL 不能为空")
		return
	}

	url := strings.TrimSpace(req.URL)
	var result *ParsedMedia
	var err error

	switch {
	case strings.Contains(url, "neodb.social"):
		result, err = parseNeoDB(url)
	case strings.Contains(url, "douban.com"):
		result, err = parseDouban(url)
	case strings.Contains(url, "music.163.com") || strings.Contains(url, "163cn.tv"):
		result, err = parseNetease(url)
	case strings.Contains(url, "y.qq.com") || strings.Contains(url, "qq.com/n/ryqq"):
		result, err = parseQQMusic(url)
	case strings.Contains(url, "youtube.com") || strings.Contains(url, "youtu.be"):
		result, err = parseYouTube(url)
	case strings.Contains(url, "bilibili.com") || strings.Contains(url, "b23.tv"):
		result, err = parseBilibili(url)
	case strings.Contains(url, "v.qq.com"):
		result, err = parseOGP(url)
		if result != nil { result.Platform = "tencent_video"; result.Type = "video" }
	case strings.Contains(url, "youku.com"):
		result, err = parseOGP(url)
		if result != nil { result.Platform = "youku"; result.Type = "video" }
	case strings.Contains(url, "iqiyi.com"):
		result, err = parseOGP(url)
		if result != nil { result.Platform = "iqiyi"; result.Type = "video" }
	case strings.Contains(url, "imdb.com"):
		result, err = parseOGP(url)
		if result != nil { result.Platform = "imdb"; result.Type = "movie" }
	default:
		result, err = parseOGP(url)
	}

	if err != nil {
		util.Error(c, 400, "PARSE_ERROR", err.Error())
		return
	}
	if result == nil {
		util.Error(c, 400, "PARSE_ERROR", "无法解析此链接")
		return
	}

	result.URL = url
	util.Success(c, result)
}

// NeoDB API: https://neodb.social/api/
func parseNeoDB(url string) (*ParsedMedia, error) {
	// Extract UUID from URL like /movie/xxx, /book/xxx, /game/xxx
	re := regexp.MustCompile(`neodb\.social/(movie|book|game|tv|music|podcast|performance)/([a-zA-Z0-9]+)`)
	m := re.FindStringSubmatch(url)
	if len(m) < 3 {
		return nil, fmt.Errorf("无法解析 NeoDB 链接格式")
	}

	itemType := m[1]
	uuid := m[2]
	apiURL := fmt.Sprintf("https://neodb.social/api/%s/%s", itemType, uuid)

	resp, err := httpClient.Get(apiURL)
	if err != nil {
		return nil, fmt.Errorf("请求 NeoDB 失败: %v", err)
	}
	defer resp.Body.Close()

	var data map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&data)

	result := &ParsedMedia{
		Type:     mapNeoDBType(itemType),
		Platform: "neodb",
	}

	if v, ok := data["title"].(string); ok { result.Title = v }
	if v, ok := data["cover_image_url"].(string); ok { result.Cover = v }
	if v, ok := data["description"].(string); ok { result.Summary = v }
	if v, ok := data["rating"].(float64); ok { result.Rating = v }
	if v, ok := data["pub_year"].(string); ok { result.Year = v }
	if v, ok := data["pub_year"].(float64); ok { result.Year = fmt.Sprintf("%.0f", v) }

	result.Extra = make(map[string]string)

	// Extract creator info
	if v, ok := data["author"].([]interface{}); ok && len(v) > 0 {
		names := make([]string, len(v))
		for i, a := range v { names[i] = fmt.Sprintf("%v", a) }
		result.Artist = strings.Join(names, ", ")
	}
	if v, ok := data["director"].([]interface{}); ok && len(v) > 0 {
		names := make([]string, len(v))
		for i, a := range v { names[i] = fmt.Sprintf("%v", a) }
		result.Artist = strings.Join(names, ", ")
	}
	if v, ok := data["artist"].([]interface{}); ok && len(v) > 0 {
		names := make([]string, len(v))
		for i, a := range v { names[i] = fmt.Sprintf("%v", a) }
		result.Artist = strings.Join(names, ", ")
	}

	// Book-specific fields
	if v, ok := data["pub_house"].(string); ok { result.Extra["publisher"] = v }
	if v, ok := data["isbn"].(string); ok { result.Extra["isbn"] = v }
	if v, ok := data["pages"].(float64); ok { result.Extra["pages"] = fmt.Sprintf("%.0f", v) }

	// Movie/TV specific
	if v, ok := data["year"].(float64); ok && result.Year == "" { result.Year = fmt.Sprintf("%.0f", v) }
	if v, ok := data["area"].([]interface{}); ok && len(v) > 0 { result.Extra["area"] = fmt.Sprintf("%v", v[0]) }
	if v, ok := data["genre"].([]interface{}); ok && len(v) > 0 {
		genres := make([]string, 0)
		for _, g := range v { genres = append(genres, fmt.Sprintf("%v", g)) }
		result.Extra["genre"] = strings.Join(genres, ", ")
	}
	if v, ok := data["duration"].(string); ok { result.Extra["duration"] = v }

	return result, nil
}

func mapNeoDBType(t string) string {
	switch t {
	case "movie": return "movie"
	case "book": return "book"
	case "game": return "game"
	case "tv": return "tv"
	case "music": return "music"
	default: return t
	}
}

// Douban: scrape OGP meta tags
func parseDouban(url string) (*ParsedMedia, error) {
	result, err := parseOGP(url)
	if err != nil { return nil, err }

	// Detect type from URL
	if strings.Contains(url, "movie.douban.com") || strings.Contains(url, "/subject/") {
		if strings.Contains(url, "book.douban.com") {
			result.Type = "book"
		} else {
			result.Type = "movie"
		}
	}
	if strings.Contains(url, "music.douban.com") { result.Type = "music" }
	result.Platform = "douban"

	return result, nil
}

// Netease Cloud Music
func parseNetease(url string) (*ParsedMedia, error) {
	// Extract song ID
	re := regexp.MustCompile(`(?:song\?id=|song/)(\d+)`)
	m := re.FindStringSubmatch(url)
	if len(m) < 2 {
		return parseOGP(url)
	}

	songID := m[1]
	apiURL := fmt.Sprintf("https://music.163.com/api/song/detail/?ids=[%s]&id=%s", songID, songID)

	req, _ := http.NewRequest("GET", apiURL, nil)
	req.Header.Set("Referer", "https://music.163.com/")
	req.Header.Set("User-Agent", "Mozilla/5.0")

	resp, err := httpClient.Do(req)
	if err != nil { return nil, err }
	defer resp.Body.Close()

	var data map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&data)

	songs, ok := data["songs"].([]interface{})
	if !ok || len(songs) == 0 { return parseOGP(url) }

	song := songs[0].(map[string]interface{})
	result := &ParsedMedia{
		Type:     "music",
		Platform: "netease",
	}

	if v, ok := song["name"].(string); ok { result.Title = v }
	if album, ok := song["album"].(map[string]interface{}); ok {
		if v, ok := album["name"].(string); ok { result.Album = v }
		if v, ok := album["picUrl"].(string); ok { result.Cover = v }
	}
	if artists, ok := song["artists"].([]interface{}); ok && len(artists) > 0 {
		if a, ok := artists[0].(map[string]interface{}); ok {
			if v, ok := a["name"].(string); ok { result.Artist = v }
		}
	}

	return result, nil
}

// QQ Music
func parseQQMusic(url string) (*ParsedMedia, error) {
	result, err := parseOGP(url)
	if result != nil { result.Platform = "qqmusic"; result.Type = "music" }
	return result, err
}

// YouTube
func parseYouTube(url string) (*ParsedMedia, error) {
	// Extract video ID
	re := regexp.MustCompile(`(?:v=|youtu\.be/)([a-zA-Z0-9_-]{11})`)
	m := re.FindStringSubmatch(url)
	if len(m) < 2 { return parseOGP(url) }

	videoID := m[1]
	result, err := parseOGP(url)
	if err != nil { return nil, err }
	if result == nil { result = &ParsedMedia{} }

	result.Platform = "youtube"
	result.Type = "video"
	if result.Cover == "" {
		result.Cover = fmt.Sprintf("https://img.youtube.com/vi/%s/maxresdefault.jpg", videoID)
	}
	result.Extra = map[string]string{"video_id": videoID, "embed_url": fmt.Sprintf("https://www.youtube.com/embed/%s", videoID)}

	return result, nil
}

// Bilibili
func parseBilibili(url string) (*ParsedMedia, error) {
	// Extract BV or av ID
	re := regexp.MustCompile(`(?:BV[a-zA-Z0-9]+|av\d+)`)
	m := re.FindStringSubmatch(url)

	result, err := parseOGP(url)
	if err != nil { return nil, err }
	if result == nil { result = &ParsedMedia{} }

	result.Platform = "bilibili"
	result.Type = "video"
	if len(m) > 0 {
		result.Extra = map[string]string{"bvid": m[0], "embed_url": fmt.Sprintf("https://player.bilibili.com/player.html?bvid=%s", m[0])}
	}

	return result, nil
}

// Generic OGP (Open Graph Protocol) parser
func parseOGP(url string) (*ParsedMedia, error) {
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (compatible; Utterlog/1.0)")

	resp, err := httpClient.Do(req)
	if err != nil { return nil, fmt.Errorf("请求失败: %v", err) }
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 200*1024)) // 200KB max
	html := string(body)

	result := &ParsedMedia{
		Platform: "web",
	}

	// Parse og:title, og:image, og:description, og:type
	if v := extractMeta(html, "og:title"); v != "" { result.Title = v }
	if v := extractMeta(html, "og:image"); v != "" { result.Cover = v }
	if v := extractMeta(html, "og:description"); v != "" { result.Summary = v }
	if v := extractMeta(html, "og:type"); v != "" { result.Type = v }

	// Fallback to <title>
	if result.Title == "" {
		re := regexp.MustCompile(`<title[^>]*>([^<]+)</title>`)
		if m := re.FindStringSubmatch(html); len(m) > 1 {
			result.Title = strings.TrimSpace(m[1])
		}
	}

	if result.Title == "" { return nil, fmt.Errorf("无法解析页面元数据") }

	return result, nil
}

// DoubanImport fetches a user's Douban collection
func DoubanImport(c *gin.Context) {
	var req struct {
		DoubanID string `json:"douban_id" binding:"required"`
		Type     string `json:"type"` // movie, book, music
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "豆瓣 ID 不能为空"); return
	}

	typ := req.Type
	if typ == "" { typ = "movie" }
	apiType := map[string]string{"movie": "movie", "book": "book", "music": "music"}[typ]
	if apiType == "" { apiType = "movie" }

	// Scrape user's collection page
	url := fmt.Sprintf("https://%s.douban.com/people/%s/collect", apiType, req.DoubanID)
	result, err := parseOGP(url)
	if err != nil {
		util.Error(c, 400, "DOUBAN_ERROR", "无法访问豆瓣页面: "+err.Error()); return
	}

	// For now, return basic info — full scraping needs more work
	util.Success(c, gin.H{
		"message": "豆瓣导入功能需要豆瓣 API 或 RSS 支持，建议使用 NeoDB 导入",
		"douban_url": url,
		"profile": result,
		"tip": "推荐使用 NeoDB (neodb.social) 绑定豆瓣账号后，通过 NeoDB API 批量导入",
	})
}

func extractMeta(html, property string) string {
	// Match both property= and name= patterns
	patterns := []string{
		fmt.Sprintf(`<meta[^>]*property="%s"[^>]*content="([^"]*)"`, property),
		fmt.Sprintf(`<meta[^>]*content="([^"]*)"[^>]*property="%s"`, property),
		fmt.Sprintf(`<meta[^>]*name="%s"[^>]*content="([^"]*)"`, property),
	}
	for _, p := range patterns {
		re := regexp.MustCompile(p)
		if m := re.FindStringSubmatch(html); len(m) > 1 {
			return strings.TrimSpace(m[1])
		}
	}
	return ""
}
