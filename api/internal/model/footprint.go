package model

import (
	"fmt"
	"strings"
	"time"
	"utterlog-go/config"

	"github.com/jmoiron/sqlx"
)

type FootprintPlace struct {
	ID          int      `db:"id" json:"id"`
	CountryName string   `db:"country_name" json:"country_name"`
	CountryCode string   `db:"country_code" json:"country_code"`
	CityName    string   `db:"city_name" json:"city_name"`
	Latitude    *float64 `db:"latitude" json:"latitude,omitempty"`
	Longitude   *float64 `db:"longitude" json:"longitude,omitempty"`
	CoverURL    string   `db:"cover_url" json:"cover_url"`
	VisitCount  int      `db:"visit_count" json:"visit_count"`
	CreatedAt   int64    `db:"created_at" json:"created_at"`
	UpdatedAt   int64    `db:"updated_at" json:"updated_at"`
}

type FootprintRoute struct {
	ID          int    `db:"id" json:"id"`
	Name        string `db:"name" json:"name"`
	Slug        string `db:"slug" json:"slug"`
	Description string `db:"description" json:"description"`
	SortOrder   int    `db:"sort_order" json:"sort_order"`
	CreatedAt   int64  `db:"created_at" json:"created_at"`
	UpdatedAt   int64  `db:"updated_at" json:"updated_at"`
}

type PostFootprint struct {
	ID         int             `db:"id" json:"id"`
	PostID     int             `db:"post_id" json:"post_id"`
	PlaceID    int             `db:"place_id" json:"place_id"`
	RouteID    int             `db:"route_id" json:"route_id"`
	VisitedAt  int64           `db:"visited_at" json:"visited_at"`
	RouteOrder int             `db:"route_order" json:"route_order"`
	Keywords   string          `db:"keywords" json:"keywords"`
	Note       string          `db:"note" json:"note"`
	CreatedAt  int64           `db:"created_at" json:"created_at"`
	UpdatedAt  int64           `db:"updated_at" json:"updated_at"`
	Place      *FootprintPlace `db:"-" json:"place,omitempty"`
	Route      *FootprintRoute `db:"-" json:"route,omitempty"`
}

type FootprintCountry struct {
	Code string `json:"code"`
	Name string `json:"name"`
}

type FootprintInput struct {
	PlaceID     int      `json:"place_id"`
	CountryName string   `json:"country_name"`
	CountryCode string   `json:"country_code"`
	CityName    string   `json:"city_name"`
	Latitude    *float64 `json:"latitude"`
	Longitude   *float64 `json:"longitude"`
	CoverURL    string   `json:"cover_url"`
	RouteID     int      `json:"route_id"`
	RouteName   string   `json:"route_name"`
	VisitedAt   int64    `json:"visited_at"`
	RouteOrder  int      `json:"route_order"`
	Keywords    string   `json:"keywords"`
	Note        string   `json:"note"`
}

func PostFootprints(postID int) []PostFootprint {
	var rows []struct {
		ID          int      `db:"id"`
		PostID      int      `db:"post_id"`
		PlaceID     int      `db:"place_id"`
		RouteID     int      `db:"route_id"`
		VisitedAt   int64    `db:"visited_at"`
		RouteOrder  int      `db:"route_order"`
		Keywords    string   `db:"keywords"`
		Note        string   `db:"note"`
		CreatedAt   int64    `db:"created_at"`
		UpdatedAt   int64    `db:"updated_at"`
		CountryName string   `db:"country_name"`
		CountryCode string   `db:"country_code"`
		CityName    string   `db:"city_name"`
		Latitude    *float64 `db:"latitude"`
		Longitude   *float64 `db:"longitude"`
		CoverURL    string   `db:"cover_url"`
		VisitCount  int      `db:"visit_count"`
		RouteName   string   `db:"route_name"`
		RouteSlug   string   `db:"route_slug"`
	}
	config.DB.Select(&rows, fmt.Sprintf(`
		SELECT pf.id, pf.post_id, COALESCE(pf.place_id,0) AS place_id, pf.route_id, pf.visited_at, pf.route_order,
		       COALESCE(pf.keywords,'') AS keywords, COALESCE(pf.note,'') AS note,
		       pf.created_at, pf.updated_at,
		       COALESCE(fp.country_name,'') AS country_name,
		       COALESCE(fp.country_code,'') AS country_code,
		       COALESCE(fp.city_name,'') AS city_name,
		       fp.latitude, fp.longitude,
		       COALESCE(fp.cover_url,'') AS cover_url,
		       COALESCE(fp.visit_count,0) AS visit_count,
		       COALESCE(fr.name,'') AS route_name,
		       COALESCE(fr.slug,'') AS route_slug
		FROM %s pf
		LEFT JOIN %s fp ON fp.id = pf.place_id
		LEFT JOIN %s fr ON fr.id = pf.route_id
		WHERE pf.post_id = $1
		ORDER BY COALESCE(NULLIF(pf.route_order, 0), 2147483647), pf.visited_at DESC, pf.id ASC
	`, config.T("post_footprints"), config.T("footprint_places"), config.T("footprint_routes")), postID)
	out := make([]PostFootprint, 0, len(rows))
	for _, r := range rows {
		fp := PostFootprint{
			ID: r.ID, PostID: r.PostID, PlaceID: r.PlaceID, RouteID: r.RouteID,
			VisitedAt: r.VisitedAt, RouteOrder: r.RouteOrder, Keywords: r.Keywords, Note: r.Note,
			CreatedAt: r.CreatedAt, UpdatedAt: r.UpdatedAt,
		}
		if r.PlaceID > 0 {
			fp.Place = &FootprintPlace{
				ID: r.PlaceID, CountryName: r.CountryName, CountryCode: r.CountryCode,
				CityName: r.CityName, Latitude: r.Latitude, Longitude: r.Longitude,
				CoverURL: r.CoverURL, VisitCount: r.VisitCount,
			}
		}
		if r.RouteID > 0 {
			fp.Route = &FootprintRoute{ID: r.RouteID, Name: r.RouteName, Slug: r.RouteSlug}
		}
		out = append(out, fp)
	}
	return out
}

func PostFootprintCountries(postID int) []FootprintCountry {
	return FootprintCountriesFrom(PostFootprints(postID))
}

func FootprintCountriesFrom(footprints []PostFootprint) []FootprintCountry {
	seen := map[string]bool{}
	out := []FootprintCountry{}
	for _, fp := range footprints {
		if fp.Place == nil {
			continue
		}
		code := strings.ToUpper(strings.TrimSpace(fp.Place.CountryCode))
		name := strings.TrimSpace(fp.Place.CountryName)
		key := code
		if key == "" {
			key = strings.ToLower(name)
		}
		if key == "" || seen[key] {
			continue
		}
		seen[key] = true
		out = append(out, FootprintCountry{Code: code, Name: name})
	}
	return out
}

func ListFootprintPlaces(search string, limit int) []FootprintPlace {
	if limit <= 0 || limit > 200 {
		limit = 100
	}
	args := []interface{}{limit}
	where := ""
	if strings.TrimSpace(search) != "" {
		where = "WHERE country_name ILIKE $2 OR country_code ILIKE $2 OR city_name ILIKE $2"
		args = append(args, "%"+strings.TrimSpace(search)+"%")
	}
	var places []FootprintPlace
	config.DB.Select(&places, fmt.Sprintf(`
		SELECT id, country_name, country_code, city_name, latitude, longitude, COALESCE(cover_url,'') AS cover_url,
		       COALESCE(visit_count,0) AS visit_count, created_at, updated_at
		FROM %s
		%s
		ORDER BY visit_count DESC, updated_at DESC, id DESC
		LIMIT $1
	`, config.T("footprint_places"), where), args...)
	if places == nil {
		return []FootprintPlace{}
	}
	return places
}

func SyncPostFootprints(postID int, inputs []FootprintInput) error {
	now := time.Now().Unix()
	tx, err := config.DB.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var oldPlaceIDs []int
	_ = tx.Select(&oldPlaceIDs, fmt.Sprintf("SELECT place_id FROM %s WHERE post_id = $1 AND place_id IS NOT NULL", config.T("post_footprints")), postID)
	if _, err := tx.Exec(fmt.Sprintf("DELETE FROM %s WHERE post_id = $1", config.T("post_footprints")), postID); err != nil {
		return err
	}

	touched := map[int]bool{}
	for _, in := range inputs {
		placeID := in.PlaceID
		hasPlaceData := strings.TrimSpace(in.CountryName) != "" || strings.TrimSpace(in.CountryCode) != "" || strings.TrimSpace(in.CityName) != ""
		if placeID <= 0 {
			if hasPlaceData {
				var err error
				placeID, err = upsertFootprintPlaceTx(tx, in, now)
				if err != nil {
					return err
				}
			}
		}
		routeID := in.RouteID
		if routeID <= 0 && strings.TrimSpace(in.RouteName) != "" {
			var err error
			routeID, err = upsertFootprintRouteTx(tx, strings.TrimSpace(in.RouteName), now)
			if err != nil {
				return err
			}
		}
		var placeArg interface{}
		if placeID > 0 {
			placeArg = placeID
			touched[placeID] = true
		}
		if _, err := tx.Exec(fmt.Sprintf(`
			INSERT INTO %s (post_id, place_id, route_id, visited_at, route_order, keywords, note, created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
		`, config.T("post_footprints")), postID, placeArg, routeID, in.VisitedAt, in.RouteOrder, strings.TrimSpace(in.Keywords), strings.TrimSpace(in.Note), now, now); err != nil {
			return err
		}
	}
	for _, id := range oldPlaceIDs {
		touched[id] = true
	}
	for id := range touched {
		if _, err := tx.Exec(fmt.Sprintf(`
			UPDATE %s SET visit_count = (
				SELECT COUNT(DISTINCT post_id) FROM %s WHERE place_id = $1
			), updated_at = $2 WHERE id = $1
		`, config.T("footprint_places"), config.T("post_footprints")), id, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func UpdatePostFootprint(id int, in FootprintInput) error {
	now := time.Now().Unix()
	tx, err := config.DB.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()

	var oldPlaceID int
	_ = tx.Get(&oldPlaceID, fmt.Sprintf("SELECT COALESCE(place_id,0) FROM %s WHERE id = $1", config.T("post_footprints")), id)

	placeID := in.PlaceID
	hasPlaceData := strings.TrimSpace(in.CountryName) != "" || strings.TrimSpace(in.CountryCode) != "" || strings.TrimSpace(in.CityName) != ""
	if placeID <= 0 && hasPlaceData {
		placeID, err = upsertFootprintPlaceTx(tx, in, now)
		if err != nil {
			return err
		}
	}

	routeID := in.RouteID
	if routeID <= 0 && strings.TrimSpace(in.RouteName) != "" {
		routeID, err = upsertFootprintRouteTx(tx, strings.TrimSpace(in.RouteName), now)
		if err != nil {
			return err
		}
	}

	var placeArg interface{}
	if placeID > 0 {
		placeArg = placeID
	}
	if _, err := tx.Exec(fmt.Sprintf(`
		UPDATE %s
		SET place_id=$1, route_id=$2, visited_at=$3, route_order=$4, keywords=$5, note=$6, updated_at=$7
		WHERE id=$8
	`, config.T("post_footprints")), placeArg, routeID, in.VisitedAt, in.RouteOrder, strings.TrimSpace(in.Keywords), strings.TrimSpace(in.Note), now, id); err != nil {
		return err
	}

	touched := map[int]bool{}
	if oldPlaceID > 0 {
		touched[oldPlaceID] = true
	}
	if placeID > 0 {
		touched[placeID] = true
	}
	for placeID := range touched {
		if _, err := tx.Exec(fmt.Sprintf(`
			UPDATE %s SET visit_count = (
				SELECT COUNT(DISTINCT post_id) FROM %s WHERE place_id = $1
			), updated_at = $2 WHERE id = $1
		`, config.T("footprint_places"), config.T("post_footprints")), placeID, now); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func upsertFootprintPlaceTx(tx *sqlx.Tx, in FootprintInput, now int64) (int, error) {
	countryName := strings.TrimSpace(in.CountryName)
	countryCode := strings.ToUpper(strings.TrimSpace(in.CountryCode))
	cityName := strings.TrimSpace(in.CityName)
	if countryName == "" && countryCode == "" && cityName == "" {
		return 0, nil
	}

	var id int
	findQuery := fmt.Sprintf(`
		SELECT id FROM %s
		WHERE LOWER(COALESCE(country_code,'')) = LOWER($1)
		  AND LOWER(COALESCE(country_name,'')) = LOWER($2)
		  AND LOWER(COALESCE(city_name,'')) = LOWER($3)
		LIMIT 1
	`, config.T("footprint_places"))
	_ = tx.Get(&id, findQuery, countryCode, countryName, cityName)
	if id > 0 {
		_, err := tx.Exec(fmt.Sprintf(`
			UPDATE %s SET country_name=$1, country_code=$2, city_name=$3,
				latitude=COALESCE($4, latitude), longitude=COALESCE($5, longitude),
				cover_url=CASE WHEN $6 != '' THEN $6 ELSE cover_url END,
				updated_at=$7
			WHERE id=$8
		`, config.T("footprint_places")), countryName, countryCode, cityName, in.Latitude, in.Longitude, strings.TrimSpace(in.CoverURL), now, id)
		return id, err
	}
	err := tx.Get(&id, fmt.Sprintf(`
		INSERT INTO %s (country_name, country_code, city_name, latitude, longitude, cover_url, visit_count, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,0,$7,$7)
		RETURNING id
	`, config.T("footprint_places")), countryName, countryCode, cityName, in.Latitude, in.Longitude, strings.TrimSpace(in.CoverURL), now)
	return id, err
}

func upsertFootprintRouteTx(tx *sqlx.Tx, name string, now int64) (int, error) {
	slug := strings.ToLower(strings.ReplaceAll(strings.TrimSpace(name), " ", "-"))
	var id int
	_ = tx.Get(&id, fmt.Sprintf("SELECT id FROM %s WHERE LOWER(name)=LOWER($1) LIMIT 1", config.T("footprint_routes")), name)
	if id > 0 {
		return id, nil
	}
	err := tx.Get(&id, fmt.Sprintf(`
		INSERT INTO %s (name, slug, description, sort_order, created_at, updated_at)
		VALUES ($1,$2,'',0,$3,$3)
		RETURNING id
	`, config.T("footprint_routes")), name, slug, now)
	return id, err
}
