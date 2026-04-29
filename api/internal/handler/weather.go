package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
	"utterlog-go/internal/geoip"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

const (
	defaultWeatherCity        = "塔什干"
	defaultWeatherCountry     = "乌兹别克斯坦"
	defaultWeatherCountryCode = "UZ"
	defaultWeatherLatitude    = 41.2995
	defaultWeatherLongitude   = 69.2401
	weatherCacheTTL           = 30 * time.Minute
)

type WeatherLocation struct {
	City        string  `json:"city"`
	Country     string  `json:"country"`
	CountryCode string  `json:"country_code"`
	Latitude    float64 `json:"latitude"`
	Longitude   float64 `json:"longitude"`
	Source      string  `json:"source"`
}

type visitorWeatherResponse struct {
	WeatherLocation
	Temperature         *float64 `json:"temperature"`
	ApparentTemperature *float64 `json:"apparent_temperature,omitempty"`
	Humidity            *int     `json:"humidity,omitempty"`
	WeatherCode         *int     `json:"weather_code,omitempty"`
	IsDay               bool     `json:"is_day"`
	WindSpeed           *float64 `json:"wind_speed,omitempty"`
	Timezone            string   `json:"timezone,omitempty"`
	Time                string   `json:"time,omitempty"`
	Fallback            bool     `json:"fallback"`
	Stale               bool     `json:"stale"`
}

type cachedWeather struct {
	data      visitorWeatherResponse
	expiresAt time.Time
}

var (
	weatherCacheMu sync.RWMutex
	weatherCache   = map[string]cachedWeather{}
)

// VisitorWeather returns a small weather payload for the current visitor.
// It never exposes the visitor IP to the browser or to the weather provider:
// GeoIP runs server-side, then weather is fetched by coordinates. If visitor
// location or Open-Meteo is unavailable, Tashkent is used as the default city.
func VisitorWeather(c *gin.Context) {
	c.Header("Cache-Control", "private, max-age=600")

	location, fallback := visitorWeatherLocation(c)
	data, err := getWeather(location)
	if err != nil && location.Source != "default" {
		location = defaultWeatherLocation()
		fallback = true
		data, err = getWeather(location)
	}
	if err != nil {
		data = staticWeather(defaultWeatherLocation())
		fallback = true
	}
	data.Fallback = data.Fallback || fallback

	util.Success(c, data)
}

func visitorWeatherLocation(c *gin.Context) (WeatherLocation, bool) {
	ip := strings.TrimSpace(getRealIP(c))
	if ip == "" || !isPublicIP(ip) {
		return defaultWeatherLocation(), true
	}

	result, err := geoip.Lookup(ip)
	if err != nil || result == nil {
		return defaultWeatherLocation(), true
	}

	location := WeatherLocation{
		City:        firstWeatherText(result.City, result.Province, result.Country),
		Country:     result.Country,
		CountryCode: strings.ToUpper(result.CountryCode),
		Latitude:    result.Latitude,
		Longitude:   result.Longitude,
		Source:      "visitor",
	}
	if hasCoordinates(location) {
		return normalizeLocation(location), false
	}

	query := strings.TrimSpace(strings.Join(nonEmptyWeatherText(location.City, location.Country), " "))
	if query == "" {
		return defaultWeatherLocation(), true
	}
	if geo, err := geocodeWeatherLocation(query); err == nil && hasCoordinates(geo) {
		geo.Source = "visitor"
		if geo.City == "" {
			geo.City = location.City
		}
		if geo.Country == "" {
			geo.Country = location.Country
		}
		if geo.CountryCode == "" {
			geo.CountryCode = location.CountryCode
		}
		return normalizeLocation(geo), false
	}

	return defaultWeatherLocation(), true
}

func defaultWeatherLocation() WeatherLocation {
	lat := parseOptionFloat("azure_sidebar_weather_default_latitude", defaultWeatherLatitude)
	lon := parseOptionFloat("azure_sidebar_weather_default_longitude", defaultWeatherLongitude)
	if lat == 0 && lon == 0 {
		lat = defaultWeatherLatitude
		lon = defaultWeatherLongitude
	}
	return WeatherLocation{
		City:        optionOr("azure_sidebar_weather_default_city", defaultWeatherCity),
		Country:     optionOr("azure_sidebar_weather_default_country", defaultWeatherCountry),
		CountryCode: strings.ToUpper(optionOr("azure_sidebar_weather_default_country_code", defaultWeatherCountryCode)),
		Latitude:    lat,
		Longitude:   lon,
		Source:      "default",
	}
}

func getWeather(location WeatherLocation) (visitorWeatherResponse, error) {
	location = normalizeLocation(location)
	cacheKey := fmt.Sprintf("%.2f:%.2f", location.Latitude, location.Longitude)
	now := time.Now()

	weatherCacheMu.RLock()
	if cached, ok := weatherCache[cacheKey]; ok && cached.expiresAt.After(now) {
		weatherCacheMu.RUnlock()
		data := cached.data
		data.WeatherLocation = location
		return data, nil
	}
	weatherCacheMu.RUnlock()

	endpoint := fmt.Sprintf(
		"https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day,wind_speed_10m&timezone=auto&forecast_days=1",
		strconv.FormatFloat(location.Latitude, 'f', 4, 64),
		strconv.FormatFloat(location.Longitude, 'f', 4, 64),
	)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return visitorWeatherResponse{}, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return visitorWeatherResponse{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return visitorWeatherResponse{}, fmt.Errorf("open-meteo returned status %d", resp.StatusCode)
	}

	var payload struct {
		Timezone string `json:"timezone"`
		Current  struct {
			Time                string   `json:"time"`
			Temperature         *float64 `json:"temperature_2m"`
			ApparentTemperature *float64 `json:"apparent_temperature"`
			Humidity            *int     `json:"relative_humidity_2m"`
			WeatherCode         *int     `json:"weather_code"`
			IsDay               *int     `json:"is_day"`
			WindSpeed           *float64 `json:"wind_speed_10m"`
		} `json:"current"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return visitorWeatherResponse{}, err
	}

	isDay := true
	if payload.Current.IsDay != nil {
		isDay = *payload.Current.IsDay == 1
	}
	data := visitorWeatherResponse{
		WeatherLocation:     location,
		Temperature:         payload.Current.Temperature,
		ApparentTemperature: payload.Current.ApparentTemperature,
		Humidity:            payload.Current.Humidity,
		WeatherCode:         payload.Current.WeatherCode,
		IsDay:               isDay,
		WindSpeed:           payload.Current.WindSpeed,
		Timezone:            payload.Timezone,
		Time:                payload.Current.Time,
		Fallback:            location.Source == "default",
	}

	weatherCacheMu.Lock()
	weatherCache[cacheKey] = cachedWeather{data: data, expiresAt: now.Add(weatherCacheTTL)}
	weatherCacheMu.Unlock()

	return data, nil
}

func geocodeWeatherLocation(query string) (WeatherLocation, error) {
	endpoint := "https://geocoding-api.open-meteo.com/v1/search?name=" + url.QueryEscape(query) + "&count=1&language=zh&format=json"
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return WeatherLocation{}, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return WeatherLocation{}, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return WeatherLocation{}, fmt.Errorf("open-meteo geocode returned status %d", resp.StatusCode)
	}

	var payload struct {
		Results []struct {
			Name        string  `json:"name"`
			Country     string  `json:"country"`
			CountryCode string  `json:"country_code"`
			Latitude    float64 `json:"latitude"`
			Longitude   float64 `json:"longitude"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&payload); err != nil {
		return WeatherLocation{}, err
	}
	if len(payload.Results) == 0 {
		return WeatherLocation{}, fmt.Errorf("no geocode result")
	}
	result := payload.Results[0]
	return normalizeLocation(WeatherLocation{
		City:        result.Name,
		Country:     result.Country,
		CountryCode: strings.ToUpper(result.CountryCode),
		Latitude:    result.Latitude,
		Longitude:   result.Longitude,
	}), nil
}

func staticWeather(location WeatherLocation) visitorWeatherResponse {
	return visitorWeatherResponse{
		WeatherLocation: normalizeLocation(location),
		IsDay:           true,
		Fallback:        true,
		Stale:           true,
	}
}

func normalizeLocation(location WeatherLocation) WeatherLocation {
	location.City = strings.TrimSpace(location.City)
	location.Country = strings.TrimSpace(location.Country)
	location.CountryCode = strings.ToUpper(strings.TrimSpace(location.CountryCode))
	if location.City == "" {
		location.City = firstWeatherText(location.Country, defaultWeatherCity)
	}
	return location
}

func hasCoordinates(location WeatherLocation) bool {
	if math.IsNaN(location.Latitude) || math.IsNaN(location.Longitude) {
		return false
	}
	if location.Latitude < -90 || location.Latitude > 90 || location.Longitude < -180 || location.Longitude > 180 {
		return false
	}
	return location.Latitude != 0 || location.Longitude != 0
}

func isPublicIP(value string) bool {
	ip := net.ParseIP(value)
	if ip == nil {
		return false
	}
	return !(ip.IsLoopback() || ip.IsPrivate() || ip.IsUnspecified() || ip.IsMulticast())
}

func optionOr(name, fallback string) string {
	if value := strings.TrimSpace(model.GetOption(name)); value != "" {
		return value
	}
	return fallback
}

func parseOptionFloat(name string, fallback float64) float64 {
	value := strings.TrimSpace(model.GetOption(name))
	if value == "" {
		return fallback
	}
	parsed, err := strconv.ParseFloat(value, 64)
	if err != nil {
		return fallback
	}
	return parsed
}

func firstWeatherText(values ...string) string {
	for _, value := range values {
		if s := strings.TrimSpace(value); s != "" {
			return s
		}
	}
	return ""
}

func nonEmptyWeatherText(values ...string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if s := strings.TrimSpace(value); s != "" {
			result = append(result, s)
		}
	}
	return result
}
