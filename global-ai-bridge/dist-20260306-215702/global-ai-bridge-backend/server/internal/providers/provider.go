package providers

import (
	"context"

	"global-ai-bridge/server/internal/gateway"
)

type Provider interface {
	Chat(ctx context.Context, request gateway.ChatRequest) (*gateway.ChatResponse, error)
}
