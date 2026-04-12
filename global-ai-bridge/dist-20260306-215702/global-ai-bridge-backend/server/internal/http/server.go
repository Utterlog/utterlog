package http

import (
	"encoding/json"
	"errors"
	"log"
	nethttp "net/http"
	"strings"
	"time"

	"global-ai-bridge/server/internal/config"
	"global-ai-bridge/server/internal/gateway"
	"global-ai-bridge/server/internal/service"
)

type Server struct {
	config      config.Config
	chatService *service.ChatService
	metrics     *Metrics
	rateLimiter *rateLimiter
}

func NewServer(cfg config.Config) nethttp.Handler {
	server := &Server{
		config:      cfg,
		chatService: service.NewChatService(cfg),
		metrics:     NewMetrics(),
		rateLimiter: newRateLimiter(cfg.RateLimitPerMinute),
	}

	mux := nethttp.NewServeMux()
	mux.HandleFunc("/healthz", server.handleHealth)
	mux.HandleFunc("/metrics", server.handleMetrics)
	mux.HandleFunc("/v1/chat/completions", server.handleChat)

	return server.withAccessLog(mux)
}

func (s *Server) handleHealth(writer nethttp.ResponseWriter, request *nethttp.Request) {
	writeJSON(writer, nethttp.StatusOK, map[string]any{
		"ok":   true,
		"time": time.Now().UTC().Format(time.RFC3339),
	})
}

func (s *Server) handleMetrics(writer nethttp.ResponseWriter, request *nethttp.Request) {
	if s.config.MetricsToken != "" {
		header := strings.TrimSpace(request.Header.Get("Authorization"))
		expected := "Bearer " + s.config.MetricsToken
		if header != expected {
			writeError(writer, nethttp.StatusUnauthorized, "unauthorized", "invalid metrics token")
			return
		}
	}

	writeJSON(writer, nethttp.StatusOK, s.metrics.Snapshot())
}

func (s *Server) handleChat(writer nethttp.ResponseWriter, request *nethttp.Request) {
	if request.Method != nethttp.MethodPost {
		s.metrics.RecordRequest(nethttp.StatusMethodNotAllowed, "POST required")
		writeError(writer, nethttp.StatusMethodNotAllowed, "method_not_allowed", "POST required")
		return
	}

	if !s.authorize(request) {
		s.metrics.RecordAuthFailure()
		s.metrics.RecordRequest(nethttp.StatusUnauthorized, "invalid site token")
		writeError(writer, nethttp.StatusUnauthorized, "unauthorized", "invalid site token")
		return
	}

	if !s.rateLimiter.Allow(request) {
		s.metrics.RecordRateLimited()
		s.metrics.RecordRequest(nethttp.StatusTooManyRequests, "rate limit exceeded")
		writeError(writer, nethttp.StatusTooManyRequests, "rate_limited", "rate limit exceeded")
		return
	}

	defer request.Body.Close()

	var chatRequest gateway.ChatRequest
	if err := json.NewDecoder(request.Body).Decode(&chatRequest); err != nil {
		s.metrics.RecordRequest(nethttp.StatusBadRequest, "request body must be valid JSON")
		writeError(writer, nethttp.StatusBadRequest, "invalid_json", "request body must be valid JSON")
		return
	}

	if len(chatRequest.Messages) == 0 {
		s.metrics.RecordRequest(nethttp.StatusBadRequest, "messages is required")
		writeError(writer, nethttp.StatusBadRequest, "missing_messages", "messages is required")
		return
	}

	chatRequest.SiteUUID = firstNonEmpty(
		chatRequest.SiteUUID,
		strings.TrimSpace(request.Header.Get("X-AIBRIDGE-SITE-UUID")),
	)
	chatRequest.ProviderToken = strings.TrimSpace(request.Header.Get("X-AIBRIDGE-PROVIDER-TOKEN"))

	if chatRequest.SiteUUID == "" {
		s.metrics.RecordRequest(nethttp.StatusBadRequest, "site UUID is required")
		writeError(writer, nethttp.StatusBadRequest, "missing_site_uuid", "site UUID is required")
		return
	}

	if chatRequest.ProviderToken == "" {
		s.metrics.RecordRequest(nethttp.StatusBadRequest, "provider token is required")
		writeError(writer, nethttp.StatusBadRequest, "missing_provider_token", "provider token is required")
		return
	}

	response, err := s.chatService.Chat(request.Context(), chatRequest)
	if err != nil {
		status := nethttp.StatusBadGateway
		code := "upstream_error"

		if errors.Is(err, service.ErrUnsupportedProvider) {
			status = nethttp.StatusBadRequest
			code = "unsupported_provider"
		}

		s.metrics.RecordRequest(status, err.Error())
		writeError(writer, status, code, err.Error())
		return
	}

	s.metrics.RecordRequest(nethttp.StatusOK, "")
	writeJSON(writer, nethttp.StatusOK, response)
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}

	return ""
}

func (s *Server) authorize(request *nethttp.Request) bool {
	header := strings.TrimSpace(request.Header.Get("Authorization"))
	if header == "" || !strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return false
	}

	token := strings.TrimSpace(header[7:])
	_, ok := s.config.SiteTokens[token]
	return ok
}

func (s *Server) withAccessLog(next nethttp.Handler) nethttp.Handler {
	return nethttp.HandlerFunc(func(writer nethttp.ResponseWriter, request *nethttp.Request) {
		start := time.Now()
		next.ServeHTTP(writer, request)
		log.Printf("%s %s %s", request.Method, request.URL.Path, time.Since(start))
	})
}

func writeJSON(writer nethttp.ResponseWriter, status int, payload any) {
	writer.Header().Set("Content-Type", "application/json")
	writer.WriteHeader(status)
	_ = json.NewEncoder(writer).Encode(payload)
}

func writeError(writer nethttp.ResponseWriter, status int, code, message string) {
	writeJSON(writer, status, map[string]any{
		"error": map[string]string{
			"code":    code,
			"message": message,
		},
	})
}
