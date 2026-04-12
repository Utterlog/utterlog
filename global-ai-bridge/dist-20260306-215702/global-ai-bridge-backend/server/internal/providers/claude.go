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

	"global-ai-bridge/server/internal/config"
	"global-ai-bridge/server/internal/gateway"
)

type ClaudeProvider struct {
	baseURL      string
	apiVersion   string
	client       *http.Client
	defaultModel string
}

type claudeMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type claudeRequest struct {
	Model       string          `json:"model"`
	MaxTokens   int             `json:"max_tokens"`
	Temperature *float64        `json:"temperature,omitempty"`
	Messages    []claudeMessage `json:"messages"`
	System      string          `json:"system,omitempty"`
	Stream      bool            `json:"stream"`
}

type claudeResponse struct {
	ID      string `json:"id"`
	Model   string `json:"model"`
	Content []struct {
		Type string `json:"type"`
		Text string `json:"text"`
	} `json:"content"`
	Usage struct {
		InputTokens  int `json:"input_tokens"`
		OutputTokens int `json:"output_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error,omitempty"`
}

func NewClaudeProvider(providerCfg config.ProviderConfig, requestTimeout time.Duration) *ClaudeProvider {
	version := providerCfg.APIVersion
	if version == "" {
		version = "2023-06-01"
	}

	return &ClaudeProvider{
		baseURL:      strings.TrimRight(providerCfg.BaseURL, "/"),
		apiVersion:   version,
		client:       &http.Client{Timeout: requestTimeout},
		defaultModel: providerCfg.DefaultModel,
	}
}

func (p *ClaudeProvider) Chat(ctx context.Context, req gateway.ChatRequest) (*gateway.ChatResponse, error) {
	if p.baseURL == "" {
		return nil, fmt.Errorf("claude provider is not configured")
	}
	if strings.TrimSpace(req.ProviderToken) == "" {
		return nil, fmt.Errorf("claude provider token is required")
	}

	model := firstNonEmpty(strings.TrimSpace(req.Model), p.defaultModel)
	if model == "" {
		return nil, fmt.Errorf("claude model is required")
	}

	system, messages := splitSystemMessage(req.Messages)
	claudeMessages := make([]claudeMessage, 0, len(messages))
	for _, message := range messages {
		claudeMessages = append(claudeMessages, claudeMessage{
			Role:    message.Role,
			Content: message.Content,
		})
	}

	maxTokens := 1024
	if req.MaxTokens != nil && *req.MaxTokens > 0 {
		maxTokens = *req.MaxTokens
	}

	payload := claudeRequest{
		Model:       model,
		MaxTokens:   maxTokens,
		Temperature: req.Temperature,
		Messages:    claudeMessages,
		System:      system,
		Stream:      false,
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal claude request: %w", err)
	}

	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, p.baseURL+"/messages", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build claude request: %w", err)
	}

	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Accept", "application/json")
	httpRequest.Header.Set("x-api-key", req.ProviderToken)
	httpRequest.Header.Set("anthropic-version", p.apiVersion)

	start := time.Now()
	httpResponse, err := p.client.Do(httpRequest)
	if err != nil {
		return nil, fmt.Errorf("send claude request: %w", err)
	}
	defer httpResponse.Body.Close()

	responseBody, err := io.ReadAll(io.LimitReader(httpResponse.Body, 10*1024*1024))
	if err != nil {
		return nil, fmt.Errorf("read claude response: %w", err)
	}

	var parsed claudeResponse
	if err := json.Unmarshal(responseBody, &parsed); err != nil {
		return nil, fmt.Errorf("parse claude response: %w", err)
	}

	if httpResponse.StatusCode < 200 || httpResponse.StatusCode >= 300 {
		if parsed.Error != nil && parsed.Error.Message != "" {
			return nil, fmt.Errorf("claude error: %s", parsed.Error.Message)
		}
		return nil, fmt.Errorf("claude returned status %d", httpResponse.StatusCode)
	}

	contentParts := make([]string, 0, len(parsed.Content))
	for _, part := range parsed.Content {
		if part.Type == "text" && strings.TrimSpace(part.Text) != "" {
			contentParts = append(contentParts, part.Text)
		}
	}

	return &gateway.ChatResponse{
		ID:       parsed.ID,
		Provider: "claude",
		Model:    firstNonEmpty(parsed.Model, model),
		Content:  strings.Join(contentParts, "\n"),
		Raw: map[string]any{
			"latency_ms": time.Since(start).Milliseconds(),
		},
		Usage: gateway.Usage{
			PromptTokens:     parsed.Usage.InputTokens,
			CompletionTokens: parsed.Usage.OutputTokens,
			TotalTokens:      parsed.Usage.InputTokens + parsed.Usage.OutputTokens,
		},
	}, nil
}

func splitSystemMessage(messages []gateway.Message) (string, []gateway.Message) {
	if len(messages) == 0 {
		return "", nil
	}

	filtered := make([]gateway.Message, 0, len(messages))
	systemParts := make([]string, 0, 1)

	for _, message := range messages {
		if strings.EqualFold(message.Role, "system") {
			if strings.TrimSpace(message.Content) != "" {
				systemParts = append(systemParts, message.Content)
			}
			continue
		}
		filtered = append(filtered, message)
	}

	return strings.Join(systemParts, "\n\n"), filtered
}
