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

type GoogleProvider struct {
	name         string
	baseURL      string
	client       *http.Client
	defaultModel string
}

type googleRequest struct {
	Contents          []googleContent          `json:"contents"`
	SystemInstruction *googleSystemInstruction `json:"systemInstruction,omitempty"`
	GenerationConfig  *googleGenerationConfig  `json:"generationConfig,omitempty"`
}

type googleContent struct {
	Role  string       `json:"role,omitempty"`
	Parts []googlePart `json:"parts"`
}

type googlePart struct {
	Text string `json:"text"`
}

type googleSystemInstruction struct {
	Parts []googlePart `json:"parts"`
}

type googleGenerationConfig struct {
	Temperature     *float64 `json:"temperature,omitempty"`
	MaxOutputTokens *int     `json:"maxOutputTokens,omitempty"`
}

type googleResponse struct {
	Candidates []struct {
		Content struct {
			Parts []struct {
				Text string `json:"text"`
			} `json:"parts"`
		} `json:"content"`
	} `json:"candidates"`
	UsageMetadata struct {
		PromptTokenCount     int `json:"promptTokenCount"`
		CandidatesTokenCount int `json:"candidatesTokenCount"`
		TotalTokenCount      int `json:"totalTokenCount"`
	} `json:"usageMetadata"`
	Error *struct {
		Message string `json:"message"`
		Status  string `json:"status"`
	} `json:"error,omitempty"`
}

func NewGoogleProvider(name string, providerCfg config.ProviderConfig, requestTimeout time.Duration) *GoogleProvider {
	return &GoogleProvider{
		name:         name,
		baseURL:      strings.TrimRight(providerCfg.BaseURL, "/"),
		client:       &http.Client{Timeout: requestTimeout},
		defaultModel: providerCfg.DefaultModel,
	}
}

func (p *GoogleProvider) Chat(ctx context.Context, req gateway.ChatRequest) (*gateway.ChatResponse, error) {
	if p.baseURL == "" {
		return nil, fmt.Errorf("%s provider is not configured", p.name)
	}
	if strings.TrimSpace(req.ProviderToken) == "" {
		return nil, fmt.Errorf("%s provider token is required", p.name)
	}

	model := firstNonEmpty(strings.TrimSpace(req.Model), p.defaultModel)
	if model == "" {
		return nil, fmt.Errorf("%s model is required", p.name)
	}

	system, messages := splitSystemMessage(req.Messages)
	contents := make([]googleContent, 0, len(messages))
	for _, message := range messages {
		role := "user"
		if strings.EqualFold(message.Role, "assistant") {
			role = "model"
		}

		contents = append(contents, googleContent{
			Role: role,
			Parts: []googlePart{
				{Text: message.Content},
			},
		})
	}

	payload := googleRequest{
		Contents: contents,
	}
	if system != "" {
		payload.SystemInstruction = &googleSystemInstruction{
			Parts: []googlePart{{Text: system}},
		}
	}
	if req.Temperature != nil || req.MaxTokens != nil {
		payload.GenerationConfig = &googleGenerationConfig{
			Temperature:     req.Temperature,
			MaxOutputTokens: req.MaxTokens,
		}
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal %s request: %w", p.name, err)
	}

	url := p.baseURL + "/models/" + model + ":generateContent"
	httpRequest, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("build %s request: %w", p.name, err)
	}

	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Accept", "application/json")
	httpRequest.Header.Set("x-goog-api-key", req.ProviderToken)

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

	var parsed googleResponse
	if err := json.Unmarshal(responseBody, &parsed); err != nil {
		return nil, fmt.Errorf("parse %s response: %w", p.name, err)
	}

	if httpResponse.StatusCode < 200 || httpResponse.StatusCode >= 300 {
		if parsed.Error != nil && parsed.Error.Message != "" {
			return nil, fmt.Errorf("%s error: %s", p.name, parsed.Error.Message)
		}
		return nil, fmt.Errorf("%s returned status %d", p.name, httpResponse.StatusCode)
	}

	contentParts := make([]string, 0, 1)
	if len(parsed.Candidates) > 0 {
		for _, part := range parsed.Candidates[0].Content.Parts {
			if strings.TrimSpace(part.Text) != "" {
				contentParts = append(contentParts, part.Text)
			}
		}
	}

	return &gateway.ChatResponse{
		Provider: p.name,
		Model:    model,
		Content:  strings.Join(contentParts, "\n"),
		Raw: map[string]any{
			"latency_ms": time.Since(start).Milliseconds(),
		},
		Usage: gateway.Usage{
			PromptTokens:     parsed.UsageMetadata.PromptTokenCount,
			CompletionTokens: parsed.UsageMetadata.CandidatesTokenCount,
			TotalTokens:      parsed.UsageMetadata.TotalTokenCount,
		},
	}, nil
}
