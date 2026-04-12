package providers

import (
	"github.com/gentpan/ai-bridge/internal/config"
)

func NewProviderCatalog(cfg config.Config) map[string]Provider {
	catalog := make(map[string]Provider)

	for name, providerCfg := range cfg.Providers {
		if !providerCfg.Enabled {
			continue
		}

		switch name {
		case "claude":
			catalog[name] = NewClaudeProvider(providerCfg, cfg.RequestTimeout)
		case "google", "gemini":
			catalog[name] = NewGoogleProvider(name, providerCfg, cfg.RequestTimeout)
		default:
			catalog[name] = NewCompatibleProvider(name, providerCfg, cfg.RequestTimeout)
		}
	}

	return catalog
}
