package providers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/gentpan/ai-bridge/internal/config"
	"github.com/gentpan/ai-bridge/internal/gateway"
)

type CompatibleProvider struct {
	name         string
	baseURL      string
	client       *http.Client
	defaultModel string
}

type compatibleRequest struct {
	Model       string                 `json:"model"`
	Messages    []gateway.Message      `json:"messages"`
	Temperature *float64               `json:"temperature,omitempty"`
	MaxTokens   *int                   `json:"max_tokens,omitempty"`
	Stream      bool                   `json:"stream"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

type compatibleResponse struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Choices []struct {
		Message struct {
			Content string `json:"content"`
		} `json:"message"`
		Text string `json:"text"`
	} `json:"choices"`
	Usage struct {
		PromptTokens     int `json:"prompt_tokens"`
		CompletionTokens int `json:"completion_tokens"`
		TotalTokens      int `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

func NewCompatibleProvider(name string, providerCfg config.ProviderConfig, requestTimeout time.Duration) *CompatibleProvider {
	return &CompatibleProvider{
		name:    name,
		baseURL: strings.TrimRight(providerCfg.BaseURL, "/"),
		client: &http.Client{
			Timeout: requestTimeout,
		},
		defaultModel: providerCfg.DefaultModel,
	}
}

func (p *CompatibleProvider) Chat(ctx context.Context, req gateway.ChatRequest) (*gateway.ChatResponse, error) {
	if strings.TrimSpace(p.baseURL) == "" {
		return nil, fmt.Errorf("%s provider is not configured", p.name)
	}
	if strings.TrimSpace(req.ProviderToken) == "" {
		return nil, fmt.Errorf("%s provider token is required", p.name)
	}

	model := strings.TrimSpace(req.Model)
	if model == "" {
		model = p.defaultModel
	}
	if model == "" {
		return nil, fmt.Errorf("%s model is required", p.name)
	}

	payload := compatibleRequest{
		Model:       model,
		Messages:    req.Messages,
		Temperature: req.Temperature,
		MaxTokens:   req.MaxTokens,
		Stream:      false,
		Metadata: map[string]interface{}{
			"source":          req.Meta.Source,
			"site":            req.Meta.Site,
			"connection_mode": req.Meta.ConnectionMode,
			"cloud_region":    req.Meta.CloudRegion,
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal %s request: %w", p.name, err)
	}

	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/chat/completions", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build %s request: %w", p.name, err)
	}

	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Accept", "application/json")
	httpRequest.Header.Set("Authorization", "Bearer "+req.ProviderToken)

	start := time.Now()
	httpResponse, err := p.client.Do(httpRequest)
	if err != nil {
		return nil, fmt.Errorf("send %s request: %w", p.name, err)
	}
	defer httpResponse.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(httpResponse.Body, 10*1024*1024))
	if err != nil {
		return nil, fmt.Errorf("read %s response: %w", p.name, err)
	}

	var parsed compatibleResponse
	if err := json.Unmarshal(responseBody, &parsed); err != nil {
		return nil, fmt.Errorf("parse %s response: %w", p.name, err)
	}

	if httpResponse.StatusCode < 200 || httpResponse.StatusCode >= 300 {
		if parsed.Error != nil && parsed.Error.Message != "" {
			return nil, fmt.Errorf("%s error: %s", p.name, parsed.Error.Message)
		}
		return nil, fmt.Errorf("%s returned status %d", p.name, httpResponse.StatusCode)
	}

	content := ""
	if len(parsed.Choices) > 0 {
		content = firstNonEmpty(parsed.Choices[0].Message.Content, parsed.Choices[0].Text)
	}

	return &gateway.ChatResponse{
		ID:       parsed.ID,
		Provider: p.name,
		Model:    firstNonEmpty(parsed.Model, model),
		Content:  content,
		Raw: map[string]any{
			"latency_ms": time.Since(start).Milliseconds(),
		},
		Usage: gateway.Usage{
			PromptTokens:     parsed.Usage.PromptTokens,
			CompletionTokens: parsed.Usage.CompletionTokens,
			TotalTokens:      parsed.Usage.TotalTokens,
		},
	}, nil
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}

	return ""
}
