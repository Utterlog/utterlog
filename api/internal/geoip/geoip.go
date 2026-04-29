package geoip

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
)

const (
	OptionProvider = "ip_geo_provider"

	ProviderIPX  = "ipx"
	ProviderCNIP = "cnip"
)

type Result struct {
	Provider    string  `json:"provider"`
	IP          string  `json:"ip,omitempty"`
	CountryCode string  `json:"country_code,omitempty"`
	Country     string  `json:"country,omitempty"`
	Province    string  `json:"province,omitempty"`
	City        string  `json:"city,omitempty"`
	Latitude    float64 `json:"latitude,omitempty"`
	Longitude   float64 `json:"longitude,omitempty"`
}

func NormalizeProvider(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case ProviderCNIP, "cnip.io":
		return ProviderCNIP
	default:
		return ProviderIPX
	}
}

func CurrentProvider() string {
	if config.DB == nil {
		return ProviderIPX
	}
	var provider string
	_ = config.DB.Get(&provider, "SELECT COALESCE(value,'') FROM "+config.T("options")+" WHERE name=$1", OptionProvider)
	return NormalizeProvider(provider)
}

func Lookup(ip string) (*Result, error) {
	ip = strings.TrimSpace(ip)
	if ip == "" {
		return LookupCurrent()
	}
	provider := CurrentProvider()
	switch provider {
	case ProviderCNIP:
		return fetch(provider, "https://api.cnip.io/geoip/"+url.PathEscape(ip))
	default:
		return fetch(provider, "https://api.ipx.ee/ip/"+url.PathEscape(ip))
	}
}

func LookupCurrent() (*Result, error) {
	provider := CurrentProvider()
	switch provider {
	case ProviderCNIP:
		return fetch(provider, "https://api.cnip.io/geoip")
	default:
		return fetch(provider, "https://api.ipx.ee/ip")
	}
}

func fetch(provider, endpoint string) (*Result, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("geoip %s returned status %d", provider, resp.StatusCode)
	}

	var raw map[string]interface{}
	dec := json.NewDecoder(resp.Body)
	dec.UseNumber()
	if err := dec.Decode(&raw); err != nil {
		return nil, err
	}

	result := &Result{
		Provider:    provider,
		IP:          str(raw["ip"]),
		CountryCode: strings.ToUpper(str(raw["country_code"])),
		Country:     str(raw["country"]),
		Province:    firstStr(raw["province"], raw["region"], raw["regionName"]),
		City:        str(raw["city"]),
		Latitude:    number(raw["latitude"], raw["lat"]),
		Longitude:   number(raw["longitude"], raw["lon"]),
	}
	return result, nil
}

func str(value interface{}) string {
	switch v := value.(type) {
	case string:
		return strings.TrimSpace(v)
	case json.Number:
		return v.String()
	case float64:
		return strconv.FormatFloat(v, 'f', -1, 64)
	case int:
		return strconv.Itoa(v)
	default:
		return ""
	}
}

func firstStr(values ...interface{}) string {
	for _, value := range values {
		if s := str(value); s != "" {
			return s
		}
	}
	return ""
}

func number(values ...interface{}) float64 {
	for _, value := range values {
		switch v := value.(type) {
		case json.Number:
			if f, err := v.Float64(); err == nil {
				return f
			}
		case float64:
			return v
		case string:
			if f, err := strconv.ParseFloat(strings.TrimSpace(v), 64); err == nil {
				return f
			}
		}
	}
	return 0
}
