package config

import (
	"errors"
	"fmt"
	"os"
	"strings"
	"time"
)

type Config struct {
	ListenAddr         string
	SiteTokens         map[string]struct{}
	RequestTimeout     time.Duration
	DefaultProvider    string
	DefaultModel       string
	Providers          map[string]ProviderConfig
	RateLimitPerMinute int
	MetricsToken       string
	NodeName           string
	NodeTrafficMode    string
	AllowedProxyHosts  map[string]struct{}
	DataDir            string
	// 邮件配置
	EmailProvider string // sendflare, resend
	EmailAPIKey   string
	EmailFromAddr string
	EmailFromName string
}

type ProviderConfig struct {
	Enabled      bool
	BaseURL      string
	DefaultModel string
	APIVersion   string
}

func Load() (Config, error) {
	cfg := Config{
		ListenAddr:         envOrDefault("LISTEN_ADDR", ":8080"),
		RequestTimeout:     time.Duration(envIntOrDefault("REQUEST_TIMEOUT_SECONDS", 60)) * time.Second,
		DefaultProvider:    strings.TrimSpace(envOrDefault("DEFAULT_PROVIDER", "openai")),
		DefaultModel:       strings.TrimSpace(envOrDefault("DEFAULT_MODEL", "gpt-4.1-mini")),
		Providers:          loadProviderConfigs(),
		RateLimitPerMinute: envIntOrDefault("RATE_LIMIT_PER_MINUTE", 120),
		MetricsToken:       strings.TrimSpace(os.Getenv("METRICS_TOKEN")),
		NodeName:           strings.TrimSpace(envOrDefault("NODE_NAME", "ai-bridge-node")),
		NodeTrafficMode:    strings.TrimSpace(envOrDefault("NODE_TRAFFIC_MODE", "outbound")),
		DataDir:            envOrDefault("DATA_DIR", "./data"),
		// 邮件配置
		EmailProvider: strings.ToLower(strings.TrimSpace(os.Getenv("EMAIL_PROVIDER"))),
		EmailAPIKey:   strings.TrimSpace(os.Getenv("EMAIL_API_KEY")),
		EmailFromAddr: strings.TrimSpace(os.Getenv("EMAIL_FROM_ADDR")),
		EmailFromName: strings.TrimSpace(os.Getenv("EMAIL_FROM_NAME")),
	}

	cfg.SiteTokens = parseCSVSet(os.Getenv("SITE_TOKENS"))
	if len(cfg.SiteTokens) == 0 {
		single := strings.TrimSpace(os.Getenv("SITE_TOKEN"))
		if single != "" {
			cfg.SiteTokens[single] = struct{}{}
		}
	}

	// SiteTokens 现在可选，因为可以通过动态 Token 服务申请的 Token 进行认证
	// 但如果没有任何 Token 配置，会记录警告（实际鉴权时也会失败）

	if cfg.NodeTrafficMode != "outbound" && cfg.NodeTrafficMode != "inbound" {
		return Config{}, errors.New("NODE_TRAFFIC_MODE must be outbound or inbound")
	}

	cfg.AllowedProxyHosts = buildAllowedProxyHosts(cfg.Providers)

	if _, ok := cfg.Providers[cfg.DefaultProvider]; !ok {
		return Config{}, fmt.Errorf("DEFAULT_PROVIDER %q is not configured", cfg.DefaultProvider)
	}

	return cfg, nil
}

func loadProviderConfigs() map[string]ProviderConfig {
	providers := map[string]ProviderConfig{
		"openai":   loadProviderConfig("OPENAI", "https://api.openai.com/v1", "gpt-4.1-mini", true),
		"claude":   loadProviderConfig("ANTHROPIC", "https://api.anthropic.com/v1", "", true),
		"google":   loadProviderConfig("GOOGLE", "https://generativelanguage.googleapis.com/v1beta", "", true),
		"gemini":   loadProviderConfig("GOOGLE", "https://generativelanguage.googleapis.com/v1beta", "", true),
		"qwen":     loadProviderConfig("QWEN", "", "", false),
		"baidu":    loadProviderConfig("BAIDU", "", "", false),
		"deepseek": loadProviderConfig("DEEPSEEK", "https://api.deepseek.com/v1", "", true),
		"doubao":   loadProviderConfig("DOUBAO", "", "", false),
		"kimi":     loadProviderConfig("KIMI", "", "", false),
		"minimax":  loadProviderConfig("MINIMAX", "", "", false),
	}

	for name, provider := range providers {
		if strings.TrimSpace(provider.BaseURL) == "" {
			delete(providers, name)
		}
	}

	return providers
}

func buildAllowedProxyHosts(providers map[string]ProviderConfig) map[string]struct{} {
	hosts := make(map[string]struct{})
	for _, provider := range providers {
		host := hostFromURL(provider.BaseURL)
		if host != "" {
			hosts[host] = struct{}{}
		}
	}

	return hosts
}

func hostFromURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	raw = strings.TrimPrefix(raw, "https://")
	raw = strings.TrimPrefix(raw, "http://")
	parts := strings.SplitN(raw, "/", 2)
	return strings.ToLower(strings.TrimSpace(parts[0]))
}

func loadProviderConfig(prefix, defaultBaseURL, defaultModel string, enabledByDefault bool) ProviderConfig {
	baseURL := strings.TrimRight(envOrDefault(prefix+"_BASE_URL", defaultBaseURL), "/")

	enabled := enabledByDefault
	if _, exists := os.LookupEnv(prefix + "_ENABLED"); exists {
		enabled = envBool(prefix + "_ENABLED")
	}
	if baseURL == "" {
		enabled = false
	}

	return ProviderConfig{
		Enabled:      enabled,
		BaseURL:      baseURL,
		DefaultModel: strings.TrimSpace(envOrDefault(prefix+"_DEFAULT_MODEL", defaultModel)),
		APIVersion:   strings.TrimSpace(os.Getenv(prefix + "_API_VERSION")),
	}
}

func envOrDefault(key, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	return value
}

func envIntOrDefault(key string, fallback int) int {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}

	var parsed int
	if _, err := fmt.Sscanf(value, "%d", &parsed); err != nil || parsed <= 0 {
		return fallback
	}

	return parsed
}

func envBool(key string) bool {
	value := strings.ToLower(strings.TrimSpace(os.Getenv(key)))
	return value == "1" || value == "true" || value == "yes" || value == "on"
}

func parseCSVSet(raw string) map[string]struct{} {
	set := make(map[string]struct{})
	for _, item := range strings.Split(raw, ",") {
		item = strings.TrimSpace(item)
		if item == "" {
			continue
		}
		set[item] = struct{}{}
	}

	return set
}
