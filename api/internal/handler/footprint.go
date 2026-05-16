package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/siteclock"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

type FootprintPayload struct {
	PlaceID     int      `json:"place_id"`
	CountryName string   `json:"country_name"`
	CountryCode string   `json:"country_code"`
	CityName    string   `json:"city_name"`
	Latitude    *float64 `json:"latitude"`
	Longitude   *float64 `json:"longitude"`
	CoverURL    string   `json:"cover_url"`
	RouteID     int      `json:"route_id"`
	RouteName   string   `json:"route_name"`
	VisitedAt   string   `json:"visited_at"`
	RouteOrder  int      `json:"route_order"`
	Keywords    string   `json:"keywords"`
	Note        string   `json:"note"`
}

type geocodeResult struct {
	LongName  string   `json:"long_name"`
	ShortName string   `json:"short_name"`
	Types     []string `json:"types"`
}

type footprintTimelineRow struct {
	ID          int      `db:"id" json:"id"`
	PostID      int      `db:"post_id" json:"post_id"`
	Status      string   `db:"status" json:"status"`
	Title       string   `db:"title" json:"title"`
	Slug        string   `db:"slug" json:"slug"`
	CoverURL    *string  `db:"cover_url" json:"cover_url"`
	DisplayID   int      `db:"display_id" json:"display_id"`
	CreatedAt   int64    `db:"created_at" json:"created_at"`
	VisitedAt   int64    `db:"visited_at" json:"visited_at"`
	RouteOrder  int      `db:"route_order" json:"route_order"`
	Keywords    string   `db:"keywords" json:"keywords"`
	PlaceID     int      `db:"place_id" json:"place_id"`
	CountryName string   `db:"country_name" json:"country_name"`
	CountryCode string   `db:"country_code" json:"country_code"`
	CityName    string   `db:"city_name" json:"city_name"`
	Latitude    *float64 `db:"latitude" json:"latitude"`
	Longitude   *float64 `db:"longitude" json:"longitude"`
	RouteID     int      `db:"route_id" json:"route_id"`
	RouteName   string   `db:"route_name" json:"route_name"`
}

func normalizeFootprintPayloads(payloads []FootprintPayload) []model.FootprintInput {
	out := make([]model.FootprintInput, 0, len(payloads))
	for _, fp := range payloads {
		out = append(out, model.FootprintInput{
			PlaceID:     fp.PlaceID,
			CountryName: strings.TrimSpace(fp.CountryName),
			CountryCode: strings.ToUpper(strings.TrimSpace(fp.CountryCode)),
			CityName:    strings.TrimSpace(fp.CityName),
			Latitude:    fp.Latitude,
			Longitude:   fp.Longitude,
			CoverURL:    strings.TrimSpace(fp.CoverURL),
			RouteID:     fp.RouteID,
			RouteName:   strings.TrimSpace(fp.RouteName),
			VisitedAt:   parseFootprintDate(fp.VisitedAt),
			RouteOrder:  fp.RouteOrder,
			Keywords:    strings.TrimSpace(fp.Keywords),
			Note:        strings.TrimSpace(fp.Note),
		})
	}
	return out
}

func parseFootprintDate(value string) int64 {
	value = strings.TrimSpace(value)
	if value == "" {
		return 0
	}
	// 用 site_timezone 解释用户输入的"2026-05-16" —— 之前用 time.Local
	// (= 容器 TZ，通常是 UTC) 会把 +0800 用户填的"今天"算成"今天 00:00 UTC"
	// = 站点时区"今天 08:00"，时间线视图错位一整天。RFC3339 自带偏移所以
	// ParseInLocation 的 loc 参数被忽略，行为不变。
	for _, layout := range []string{"2006-01-02", "2006-01-02T15:04", "2006-01-02T15:04:05", time.RFC3339} {
		if t, err := time.ParseInLocation(layout, value, siteclock.Location()); err == nil {
			return t.Unix()
		}
	}
	return 0
}

func AdminListFootprintPlaces(c *gin.Context) {
	search := c.Query("search")
	util.Success(c, model.ListFootprintPlaces(search, 100))
}

func AdminFootprintGeocode(c *gin.Context) {
	var req struct {
		Query   string `json:"query"`
		Country string `json:"country"`
		City    string `json:"city"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "参数错误")
		return
	}
	query := strings.TrimSpace(req.Query)
	if query == "" {
		query = strings.TrimSpace(strings.TrimSpace(req.Country) + " " + strings.TrimSpace(req.City))
	}
	if query == "" {
		util.BadRequest(c, "请输入国家或城市")
		return
	}

	endpoint := "https://v.wpista.com/marker/geocode?address=" + url.QueryEscape(query)
	client := &http.Client{Timeout: 8 * time.Second}
	resp, err := client.Get(endpoint)
	if err != nil {
		util.Error(c, 502, "GEOCODE_FAILED", err.Error())
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		util.Error(c, 502, "GEOCODE_FAILED", fmt.Sprintf("HTTP %d", resp.StatusCode))
		return
	}

	var body struct {
		Status  string `json:"status"`
		Code    int    `json:"code"`
		Message struct {
			Address     string          `json:"adresss"`
			Lat         float64         `json:"lat"`
			Lng         float64         `json:"lng"`
			Country     string          `json:"country"`
			CountryCode string          `json:"country_code"`
			Province    string          `json:"province"`
			Results     []geocodeResult `json:"results"`
		} `json:"message"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		util.Error(c, 502, "GEOCODE_FAILED", err.Error())
		return
	}
	if body.Status != "success" || body.Code != 200 {
		util.Error(c, 502, "GEOCODE_FAILED", "地理编码服务没有返回有效结果")
		return
	}

	city := strings.TrimSpace(req.City)
	if city == "" {
		city = pickGeocodeCity(body.Message.Results)
	}
	if city == "" && body.Message.CountryCode == "" {
		city = body.Message.Province
	}
	util.Success(c, gin.H{
		"query":        query,
		"address":      body.Message.Address,
		"country_name": body.Message.Country,
		"country_code": strings.ToUpper(body.Message.CountryCode),
		"city_name":    city,
		"latitude":     body.Message.Lat,
		"longitude":    body.Message.Lng,
		"provider":     "wpista",
	})
}

func pickGeocodeCity(results []geocodeResult) string {
	for _, preferred := range []string{"locality", "administrative_area_level_1"} {
		for _, r := range results {
			for _, typ := range r.Types {
				if typ == preferred {
					return r.LongName
				}
			}
		}
	}
	return ""
}

func listFootprints(c *gin.Context, admin bool) {
	where := []string{"p.type = 'post'"}
	if !admin {
		where = append(where, "p.status = 'publish'", "pf.place_id IS NOT NULL")
	}
	args := []interface{}{}
	idx := 1
	if city := strings.TrimSpace(c.Query("city")); city != "" {
		where = append(where, fmt.Sprintf("COALESCE(fp.city_name,'') ILIKE $%d", idx))
		args = append(args, "%"+city+"%")
		idx++
	}
	if country := strings.TrimSpace(c.Query("country")); country != "" {
		where = append(where, fmt.Sprintf("(COALESCE(fp.country_name,'') ILIKE $%d OR COALESCE(fp.country_code,'') ILIKE $%d)", idx, idx))
		args = append(args, "%"+country+"%")
		idx++
	}
	if route := strings.TrimSpace(c.Query("route")); route != "" {
		where = append(where, fmt.Sprintf("fr.name ILIKE $%d", idx))
		args = append(args, "%"+route+"%")
		idx++
	}
	if keyword := strings.TrimSpace(c.Query("keyword")); keyword != "" {
		where = append(where, fmt.Sprintf(`(
			COALESCE(fp.city_name,'') ILIKE $%d OR
			COALESCE(fp.country_name,'') ILIKE $%d OR
			COALESCE(fp.country_code,'') ILIKE $%d
		)`, idx, idx, idx))
		args = append(args, "%"+keyword+"%")
		idx++
	}
	limit := 200
	var rows []footprintTimelineRow
	err := config.DB.Select(&rows, fmt.Sprintf(`
		SELECT pf.id, pf.post_id, p.status, p.title, p.slug, p.cover_url, p.display_id, p.created_at,
		       pf.visited_at, pf.route_order, COALESCE(pf.keywords,'') AS keywords,
		       COALESCE(fp.id,0) AS place_id,
		       COALESCE(fp.country_name,'') AS country_name,
		       COALESCE(fp.country_code,'') AS country_code,
		       COALESCE(fp.city_name,'') AS city_name,
		       fp.latitude, fp.longitude,
		       COALESCE(fr.id,0) AS route_id, COALESCE(fr.name,'') AS route_name
		FROM %s pf
		JOIN %s p ON p.id = pf.post_id
		LEFT JOIN %s fp ON fp.id = pf.place_id
		LEFT JOIN %s fr ON fr.id = pf.route_id
		WHERE %s
		ORDER BY COALESCE(NULLIF(pf.visited_at,0), p.created_at) DESC, pf.id DESC
		LIMIT %d
	`, config.T("post_footprints"), config.T("posts"), config.T("footprint_places"), config.T("footprint_routes"), strings.Join(where, " AND "), limit), args...)
	if err != nil {
		util.Error(c, 500, "FOOTPRINTS_ERROR", err.Error())
		return
	}
	if rows == nil {
		rows = []footprintTimelineRow{}
	}
	util.Success(c, rows)
}

func ListFootprints(c *gin.Context) {
	listFootprints(c, false)
}

func AdminListFootprints(c *gin.Context) {
	listFootprints(c, true)
}

func AdminUpdateFootprint(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	if id <= 0 {
		util.BadRequest(c, "参数错误")
		return
	}
	var req FootprintPayload
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "参数错误")
		return
	}
	inputs := normalizeFootprintPayloads([]FootprintPayload{req})
	if len(inputs) == 0 {
		util.BadRequest(c, "参数错误")
		return
	}
	if err := model.UpdatePostFootprint(id, inputs[0]); err != nil {
		util.Error(c, 500, "FOOTPRINT_UPDATE_ERROR", err.Error())
		return
	}
	util.Success(c, nil)
}
