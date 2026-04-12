package service

import (
	"context"
	"errors"
	"strings"

	"global-ai-bridge/server/internal/config"
	"global-ai-bridge/server/internal/gateway"
	"global-ai-bridge/server/internal/providers"
)

var ErrUnsupportedProvider = errors.New("unsupported provider")

type ChatService struct {
	defaultProvider string
	providers       map[string]providers.Provider
}

func NewChatService(cfg config.Config) *ChatService {
	return &ChatService{
		defaultProvider: strings.ToLower(strings.TrimSpace(cfg.DefaultProvider)),
		providers:       providers.NewProviderCatalog(cfg),
	}
}

func (s *ChatService) Chat(ctx context.Context, request gateway.ChatRequest) (*gateway.ChatResponse, error) {
	provider := strings.ToLower(strings.TrimSpace(request.Provider))
	if provider == "" {
		provider = s.defaultProvider
	}
	request.Provider = provider

	providerHandler, ok := s.providers[provider]
	if !ok {
		return nil, ErrUnsupportedProvider
	}

	return providerHandler.Chat(ctx, request)
}
