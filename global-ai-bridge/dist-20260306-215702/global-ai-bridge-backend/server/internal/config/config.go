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
	}

	cfg.SiteTokens = parseCSVSet(os.Getenv("SITE_TOKENS"))
	if len(cfg.SiteTokens) == 0 {
		single := strings.TrimSpace(os.Getenv("SITE_TOKEN"))
		if single != "" {
			cfg.SiteTokens[single] = struct{}{}
		}
	}

	if len(cfg.SiteTokens) == 0 {
		return Config{}, errors.New("SITE_TOKEN or SITE_TOKENS is required")
	}

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
