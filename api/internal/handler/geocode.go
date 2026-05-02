package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

type reverseGeocodeResult struct {
	Location string `json:"location"`
	City     string `json:"city,omitempty"`
	Region   string `json:"region,omitempty"`
	Country  string `json:"country,omitempty"`
	Provider string `json:"provider,omitempty"`
}

func ReverseGeocode(c *gin.Context) {
	lat, errLat := strconv.ParseFloat(c.Query("lat"), 64)
	lng, errLng := strconv.ParseFloat(c.Query("lng"), 64)
	if errLat != nil || errLng != nil || lat < -90 || lat > 90 || lng < -180 || lng > 180 {
		util.BadRequest(c, "无效的坐标")
		return
	}

	for _, fn := range []func(float64, float64) (reverseGeocodeResult, error){
		reverseGeocodeMapbox,
		reverseGeocodeAmap,
		reverseGeocodeTencent,
	} {
		result, err := fn(lat, lng)
		if err == nil && strings.TrimSpace(result.Location) != "" {
			util.Success(c, result)
			return
		}
	}

	// Do not return raw latitude/longitude to the frontend. The caller can
	// leave the field empty or ask the user to fill a city manually.
	util.Success(c, reverseGeocodeResult{})
}

func reverseGeocodeMapbox(lat, lng float64) (reverseGeocodeResult, error) {
	token := strings.TrimSpace(model.GetOption("mapbox_access_token"))
	if token == "" {
		token = strings.TrimSpace(model.GetOption("footprint_mapbox_token"))
	}
	if token == "" {
		return reverseGeocodeResult{}, fmt.Errorf("mapbox token missing")
	}

	apiURL := strings.TrimRight(strings.TrimSpace(model.GetOption("mapbox_api_url")), "/")
	if apiURL == "" {
		apiURL = "https://api.mapbox.com"
	}
	endpoint := fmt.Sprintf("%s/geocoding/v5/mapbox.places/%s.json", apiURL, url.PathEscape(fmt.Sprintf("%.6f,%.6f", lng, lat)))
	q := url.Values{}
	q.Set("access_token", token)
	q.Set("language", "zh")
	q.Set("types", "place,locality,district,region,country")
	endpoint += "?" + q.Encode()

	var payload struct {
		Features []struct {
			Text      string   `json:"text"`
			PlaceName string   `json:"place_name"`
			PlaceType []string `json:"place_type"`
			Context   []struct {
				ID   string `json:"id"`
				Text string `json:"text"`
			} `json:"context"`
		} `json:"features"`
	}
	if err := getJSON(endpoint, &payload); err != nil {
		return reverseGeocodeResult{}, err
	}

	for _, preferred := range []string{"place", "locality", "district", "region", "country"} {
		for _, feature := range payload.Features {
			if !hasString(feature.PlaceType, preferred) {
				continue
			}
			name := strings.TrimSpace(feature.Text)
			if name == "" {
				name = strings.TrimSpace(feature.PlaceName)
			}
			if name == "" {
				continue
			}
			result := reverseGeocodeResult{Location: name, Provider: "mapbox"}
			switch preferred {
			case "place", "locality", "district":
				result.City = name
			case "region":
				result.Region = name
			case "country":
				result.Country = name
			}
			for _, ctx := range feature.Context {
				if result.Region == "" && strings.HasPrefix(ctx.ID, "region.") {
					result.Region = strings.TrimSpace(ctx.Text)
				}
				if result.Country == "" && strings.HasPrefix(ctx.ID, "country.") {
					result.Country = strings.TrimSpace(ctx.Text)
				}
			}
			return result, nil
		}
	}
	return reverseGeocodeResult{}, fmt.Errorf("mapbox no result")
}

func reverseGeocodeAmap(lat, lng float64) (reverseGeocodeResult, error) {
	key := strings.TrimSpace(model.GetOption("amap_api_key"))
	if key == "" {
		return reverseGeocodeResult{}, fmt.Errorf("amap key missing")
	}
	q := url.Values{}
	q.Set("key", key)
	q.Set("location", fmt.Sprintf("%.6f,%.6f", lng, lat))
	q.Set("extensions", "base")
	q.Set("output", "json")
	endpoint := "https://restapi.amap.com/v3/geocode/regeo?" + q.Encode()

	var payload map[string]interface{}
	if err := getJSON(endpoint, &payload); err != nil {
		return reverseGeocodeResult{}, err
	}
	if fmt.Sprint(payload["status"]) != "1" {
		return reverseGeocodeResult{}, fmt.Errorf("amap status %v", payload["status"])
	}
	regeo := mapValue(payload["regeocode"])
	component := mapValue(regeo["addressComponent"])
	city := firstString(component["city"], component["district"], component["province"])
	region := firstString(component["province"])
	country := firstString(component["country"])
	location := firstNonEmptyGeoText(city, region, country)
	if location == "" {
		return reverseGeocodeResult{}, fmt.Errorf("amap no result")
	}
	return reverseGeocodeResult{
		Location: location,
		City:     city,
		Region:   region,
		Country:  country,
		Provider: "amap",
	}, nil
}

func reverseGeocodeTencent(lat, lng float64) (reverseGeocodeResult, error) {
	key := strings.TrimSpace(model.GetOption("tencent_maps_api_key"))
	if key == "" {
		return reverseGeocodeResult{}, fmt.Errorf("tencent key missing")
	}
	q := url.Values{}
	q.Set("key", key)
	q.Set("location", fmt.Sprintf("%.6f,%.6f", lat, lng))
	q.Set("get_poi", "0")
	endpoint := "https://apis.map.qq.com/ws/geocoder/v1/?" + q.Encode()

	var payload struct {
		Status int `json:"status"`
		Result struct {
			AddressComponent struct {
				Nation   string `json:"nation"`
				Province string `json:"province"`
				City     string `json:"city"`
				District string `json:"district"`
			} `json:"address_component"`
		} `json:"result"`
	}
	if err := getJSON(endpoint, &payload); err != nil {
		return reverseGeocodeResult{}, err
	}
	if payload.Status != 0 {
		return reverseGeocodeResult{}, fmt.Errorf("tencent status %d", payload.Status)
	}
	component := payload.Result.AddressComponent
	city := firstNonEmptyGeoText(component.City, component.District, component.Province)
	location := firstNonEmptyGeoText(city, component.Province, component.Nation)
	if location == "" {
		return reverseGeocodeResult{}, fmt.Errorf("tencent no result")
	}
	return reverseGeocodeResult{
		Location: location,
		City:     city,
		Region:   component.Province,
		Country:  component.Nation,
		Provider: "tencent",
	}, nil
}

func getJSON(endpoint string, dest interface{}) error {
	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Get(endpoint)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("http status %d", resp.StatusCode)
	}
	return json.NewDecoder(resp.Body).Decode(dest)
}

func hasString(items []string, value string) bool {
	for _, item := range items {
		if item == value {
			return true
		}
	}
	return false
}

func mapValue(value interface{}) map[string]interface{} {
	if m, ok := value.(map[string]interface{}); ok {
		return m
	}
	return map[string]interface{}{}
}

func firstString(values ...interface{}) string {
	for _, value := range values {
		switch v := value.(type) {
		case string:
			if strings.TrimSpace(v) != "" {
				return strings.TrimSpace(v)
			}
		case []interface{}:
			for _, item := range v {
				if s := strings.TrimSpace(fmt.Sprint(item)); s != "" {
					return s
				}
			}
		}
	}
	return ""
}

func firstNonEmptyGeoText(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return strings.TrimSpace(value)
		}
	}
	return ""
}
