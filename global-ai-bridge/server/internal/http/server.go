package http

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"log"
	nethttp "net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/gentpan/ai-bridge/internal/config"
	"github.com/gentpan/ai-bridge/internal/gateway"
	"github.com/gentpan/ai-bridge/internal/service"
)

type Server struct {
	config       config.Config
	chatService  *service.ChatService
	tokenService *service.TokenService
	emailService *service.EmailService
	metrics      *Metrics
	rateLimiter  *rateLimiter
	staticPath   string
}

func NewServer(cfg config.Config) nethttp.Handler {
	return NewServerWithStatic(cfg, "")
}

// NewServerWithStatic 创建带有静态文件服务的 HTTP 服务器
func NewServerWithStatic(cfg config.Config, staticPath string) nethttp.Handler {
	// 初始化邮件服务
	emailCfg := service.EmailConfig{
		Provider: cfg.EmailProvider,
		APIKey:   cfg.EmailAPIKey,
		FromAddr: cfg.EmailFromAddr,
		FromName: cfg.EmailFromName,
	}
	emailSvc := service.NewEmailService(emailCfg)

	// 初始化 Token 服务
	tokenCfg := service.TokenServiceConfig{
		DataDir:     cfg.DataDir,
		MaxUsageLog: 10000,
		EmailSvc:    emailSvc,
		NodeName:    cfg.NodeName,
	}

	server := &Server{
		config:       cfg,
		chatService:  service.NewChatService(cfg),
		tokenService: service.NewTokenService(tokenCfg),
		emailService: emailSvc,
		metrics:      NewMetrics(),
		rateLimiter:  newRateLimiter(cfg.RateLimitPerMinute),
		staticPath:   staticPath,
	}

	mux := nethttp.NewServeMux()
	mux.HandleFunc("/healthz", server.handleHealth)
	mux.HandleFunc("/metrics", server.handleMetrics)
	mux.HandleFunc("/v1/connectors/proxy", server.handleConnectorProxy)
	mux.HandleFunc("/v1/chat/completions", server.handleChat)

	// 如果配置了 SiteTokens（托管模式），启用 Token 管理 API
	if len(cfg.SiteTokens) > 0 {
		mux.HandleFunc("/api/apply-token", server.handleTokenApply)
		mux.HandleFunc("/api/tokens", server.handleTokenList)
		mux.HandleFunc("/api/tokens/stats", server.handleTokenStats)
		mux.HandleFunc("/api/tokens/revoke", server.handleTokenRevoke)
		mux.HandleFunc("/api/", server.handleAPI404)
	}

	// 静态文件服务
	if staticPath != "" {
		mux.Handle("/static/", nethttp.StripPrefix("/static/", nethttp.FileServer(nethttp.Dir(staticPath))))
		mux.HandleFunc("/", server.handleRoot)
	}

	return server.withAccessLog(mux)
}

func (s *Server) handleRoot(writer nethttp.ResponseWriter, request *nethttp.Request) {
	if request.URL.Path != "/" {
		nethttp.NotFound(writer, request)
		return
	}

	// 如果配置了 SiteTokens（托管模式），显示 Token 申请页面
	if len(s.config.SiteTokens) > 0 {
		applyPage := filepath.Join(s.staticPath, "apply-token.html")
		if _, err := os.Stat(applyPage); err == nil {
			nethttp.ServeFile(writer, request, applyPage)
			return
		}
	}

	// 自托管模式或申请页面不存在时，显示简单信息
	info := "AI Bridge Gateway\n\n"
	info += "Endpoints:\n"
	info += "  GET  /healthz              - Health check\n"
	info += "  POST /v1/chat/completions  - Chat completions\n"
	info += "  POST /v1/connectors/proxy  - Proxy connector\n"

	if len(s.config.SiteTokens) > 0 {
		info += "  POST /api/apply-token      - Apply for token\n"
	}

	writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
	writer.WriteHeader(nethttp.StatusOK)
	writer.Write([]byte(info))
}

func (s *Server) handleAPI404(writer nethttp.ResponseWriter, request *nethttp.Request) {
	writeError(writer, nethttp.StatusNotFound, "not_found", "API endpoint not found")
}

func (s *Server) handleTokenApply(writer nethttp.ResponseWriter, request *nethttp.Request) {
	if request.Method != nethttp.MethodPost {
		writeError(writer, nethttp.StatusMethodNotAllowed, "method_not_allowed", "POST required")
		return
	}

	defer request.Body.Close()

	var req service.ApplyRequest
	if err := json.NewDecoder(request.Body).Decode(&req); err != nil {
		writeError(writer, nethttp.StatusBadRequest, "invalid_json", "Request body must be valid JSON")
		return
	}

	resp, err := s.tokenService.Apply(req.Email)
	if err != nil {
		log.Printf("token_apply_error email=%s err=%v", req.Email, err)
		writeError(writer, nethttp.StatusInternalServerError, "internal_error", "Failed to process token application")
		return
	}

	if resp.Success {
		log.Printf("token_apply_success email=%s token_prefix=%s...", req.Email, resp.Token[:8])
		writeJSON(writer, nethttp.StatusOK, resp)
	} else {
		writeJSON(writer, nethttp.StatusBadRequest, resp)
	}
}

// handleTokenList 管理员接口：获取所有已申请的Token列表
// handleTokenList 管理员接口：获取所有已申请的Token列表（带统计信息）
func (s *Server) handleTokenList(writer nethttp.ResponseWriter, request *nethttp.Request) {
	if request.Method != nethttp.MethodGet {
		writeError(writer, nethttp.StatusMethodNotAllowed, "method_not_allowed", "GET required")
		return
	}

	// 验证管理员权限（只允许静态配置的SiteToken）
	if !s.authorizeAdmin(request) {
		writeError(writer, nethttp.StatusUnauthorized, "unauthorized", "Admin token required")
		return
	}

	stats := s.tokenService.GetAllTokenStats()
	globalStats := s.tokenService.GetUsageStats()

	writeJSON(writer, nethttp.StatusOK, map[string]any{
		"global": globalStats,
		"tokens": stats,
	})
}

// handleTokenStats 管理员接口：获取全局统计信息
func (s *Server) handleTokenStats(writer nethttp.ResponseWriter, request *nethttp.Request) {
	if request.Method != nethttp.MethodGet {
		writeError(writer, nethttp.StatusMethodNotAllowed, "method_not_allowed", "GET required")
		return
	}

	// 验证管理员权限
	if !s.authorizeAdmin(request) {
		writeError(writer, nethttp.StatusUnauthorized, "unauthorized", "Admin token required")
		return
	}

	// 获取全局统计
	globalStats := s.tokenService.GetUsageStats()

	// 检查邮件服务状态
	emailStatus := "disabled"
	if s.emailService != nil && s.emailService.IsEnabled() {
		emailStatus = "enabled"
	}

	writeJSON(writer, nethttp.StatusOK, map[string]any{
		"usage":  globalStats,
		"email":  emailStatus,
		"server": s.config.NodeName,
	})
}

// handleTokenRevoke 管理员接口：吊销指定Token
func (s *Server) handleTokenRevoke(writer nethttp.ResponseWriter, request *nethttp.Request) {
	if request.Method != nethttp.MethodPost {
		writeError(writer, nethttp.StatusMethodNotAllowed, "method_not_allowed", "POST required")
		return
	}

	// 验证管理员权限
	if !s.authorizeAdmin(request) {
		writeError(writer, nethttp.StatusUnauthorized, "unauthorized", "Admin token required")
		return
	}

	defer request.Body.Close()

	var req struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(request.Body).Decode(&req); err != nil {
		writeError(writer, nethttp.StatusBadRequest, "invalid_json", "Request body must be valid JSON")
		return
	}

	if req.Token == "" {
		writeError(writer, nethttp.StatusBadRequest, "missing_token", "Token is required")
		return
	}

	if s.tokenService.Revoke(req.Token) {
		log.Printf("token_revoked token_prefix=%s...", req.Token[:8])
		writeJSON(writer, nethttp.StatusOK, map[string]any{
			"success": true,
			"message": "Token revoked successfully",
		})
	} else {
		writeError(writer, nethttp.StatusNotFound, "token_not_found", "Token not found")
	}
}

func (s *Server) handleHealth(writer nethttp.ResponseWriter, request *nethttp.Request) {
	// 通过是否有 SiteTokens 判断是否为托管模式
	hasTokens := len(s.config.SiteTokens) > 0
	mode := "Self-Hosted"
	if hasTokens {
		mode = "Managed"
	}

	writeJSON(writer, nethttp.StatusOK, map[string]any{
		"ok":           true,
		"time":         time.Now().UTC().Format(time.RFC3339),
		"node_name":    s.config.NodeName,
		"traffic_mode": s.config.NodeTrafficMode,
		"mode":         mode,
		"version":      "1.0.0",
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

	// 如果配置了 SiteTokens（托管模式），需要验证 Token；否则跳过
	if len(s.config.SiteTokens) > 0 && !s.authorize(request) {
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

	chatRequest.ProviderToken = strings.TrimSpace(request.Header.Get("X-AIBRIDGE-PROVIDER-TOKEN"))

	if chatRequest.ProviderToken == "" {
		s.metrics.RecordRequest(nethttp.StatusBadRequest, "provider token is required")
		writeError(writer, nethttp.StatusBadRequest, "missing_provider_token", "provider token is required")
		return
	}

	// 获取请求的 Token（用于后续统计）
	authHeader := strings.TrimSpace(request.Header.Get("Authorization"))
	requestToken := ""
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		requestToken = strings.TrimSpace(authHeader[7:])
	}

	requestTrafficMode := strings.TrimSpace(chatRequest.Meta.TrafficMode)
	if requestTrafficMode == "" {
		requestTrafficMode = "outbound"
	}
	if requestTrafficMode != s.config.NodeTrafficMode {
		s.metrics.RecordRequest(nethttp.StatusBadRequest, "traffic mode mismatch")
		writeError(writer, nethttp.StatusBadRequest, "traffic_mode_mismatch", "request traffic mode does not match this node")
		log.Printf(
			"chat_rejected node=%s node_mode=%s request_mode=%s provider=%s reason=traffic_mode_mismatch",
			s.config.NodeName,
			s.config.NodeTrafficMode,
			requestTrafficMode,
			chatRequest.Provider,
		)
		return
	}

	start := time.Now()
	response, err := s.chatService.Chat(request.Context(), chatRequest)
	latencyMs := int(time.Since(start).Milliseconds())

	if err != nil {
		status := nethttp.StatusBadGateway
		code := "upstream_error"

		if errors.Is(err, service.ErrUnsupportedProvider) {
			status = nethttp.StatusBadRequest
			code = "unsupported_provider"
		}

		s.metrics.RecordRequest(status, err.Error())
		// 记录失败的使用量
		if requestToken != "" {
			s.tokenService.RecordUsage(requestToken, chatRequest.Provider, chatRequest.Model, 0, latencyMs, "error")
		}
		log.Printf(
			"chat_error node=%s node_mode=%s request_mode=%s provider=%s model=%s status=%d err=%q",
			s.config.NodeName,
			s.config.NodeTrafficMode,
			requestTrafficMode,
			chatRequest.Provider,
			chatRequest.Model,
			status,
			err.Error(),
		)
		writeError(writer, status, code, err.Error())
		return
	}

	s.metrics.RecordRequest(nethttp.StatusOK, "")
	// 记录成功的使用量
	if requestToken != "" {
		s.tokenService.RecordUsage(requestToken, response.Provider, response.Model, response.Usage.TotalTokens, latencyMs, "success")
	}
	log.Printf(
		"chat_ok node=%s node_mode=%s request_mode=%s provider=%s model=%s tokens=%d",
		s.config.NodeName,
		s.config.NodeTrafficMode,
		requestTrafficMode,
		response.Provider,
		response.Model,
		response.Usage.TotalTokens,
	)
	writeJSON(writer, nethttp.StatusOK, response)
}

type connectorProxyRequest struct {
	TargetURL string            `json:"target_url"`
	Method    string            `json:"method"`
	Headers   map[string]string `json:"headers"`
	Body      string            `json:"body"`
	Timeout   int               `json:"timeout"`
	Meta      gateway.Meta      `json:"meta"`
}

func (s *Server) handleConnectorProxy(writer nethttp.ResponseWriter, request *nethttp.Request) {
	if request.Method != nethttp.MethodPost {
		writeError(writer, nethttp.StatusMethodNotAllowed, "method_not_allowed", "POST required")
		return
	}

	// 如果配置了 SiteTokens（托管模式），需要验证 Token；否则跳过
	if len(s.config.SiteTokens) > 0 && !s.authorize(request) {
		writeError(writer, nethttp.StatusUnauthorized, "unauthorized", "invalid site token")
		return
	}

	defer request.Body.Close()

	var payload connectorProxyRequest
	if err := json.NewDecoder(request.Body).Decode(&payload); err != nil {
		writeError(writer, nethttp.StatusBadRequest, "invalid_json", "request body must be valid JSON")
		return
	}

	target, err := url.Parse(payload.TargetURL)
	if err != nil || target.Host == "" {
		writeError(writer, nethttp.StatusBadRequest, "invalid_target_url", "target_url is invalid")
		return
	}

	host := strings.ToLower(target.Hostname())
	if _, ok := s.config.AllowedProxyHosts[host]; !ok {
		writeError(writer, nethttp.StatusBadRequest, "target_not_allowed", "target host is not allowed")
		return
	}

	requestTrafficMode := strings.TrimSpace(payload.Meta.TrafficMode)
	if requestTrafficMode == "" {
		requestTrafficMode = "outbound"
	}
	if requestTrafficMode != s.config.NodeTrafficMode {
		writeError(writer, nethttp.StatusBadRequest, "traffic_mode_mismatch", "request traffic mode does not match this node")
		return
	}

	method := strings.ToUpper(strings.TrimSpace(payload.Method))
	if method == "" {
		method = nethttp.MethodGet
	}

	upstreamRequest, err := nethttp.NewRequestWithContext(request.Context(), method, payload.TargetURL, bytes.NewBufferString(payload.Body))
	if err != nil {
		writeError(writer, nethttp.StatusBadRequest, "build_upstream_request_failed", "could not build upstream request")
		return
	}

	for key, value := range payload.Headers {
		headerKey := nethttp.CanonicalHeaderKey(key)
		if strings.EqualFold(headerKey, "Host") || strings.EqualFold(headerKey, "Content-Length") {
			continue
		}
		upstreamRequest.Header.Set(headerKey, value)
	}

	client := &nethttp.Client{Timeout: s.config.RequestTimeout}
	if payload.Timeout > 0 {
		client.Timeout = time.Duration(payload.Timeout) * time.Second
	}

	upstreamResponse, err := client.Do(upstreamRequest)
	if err != nil {
		writeError(writer, nethttp.StatusBadGateway, "upstream_request_failed", err.Error())
		return
	}
	defer upstreamResponse.Body.Close()

	upstreamBody, err := io.ReadAll(io.LimitReader(upstreamResponse.Body, 20*1024*1024))
	if err != nil {
		writeError(writer, nethttp.StatusBadGateway, "read_upstream_failed", "could not read upstream response")
		return
	}

	responseHeaders := map[string]string{}
	for key, values := range upstreamResponse.Header {
		if len(values) > 0 {
			responseHeaders[key] = strings.Join(values, ", ")
		}
	}

	writeJSON(writer, nethttp.StatusOK, map[string]any{
		"status":  upstreamResponse.StatusCode,
		"headers": responseHeaders,
		"body":    string(upstreamBody),
	})
}

func firstNonEmpty(values ...string) string {
	for _, value := range values {
		if strings.TrimSpace(value) != "" {
			return value
		}
	}

	return ""
}

// authorize 验证请求Token，支持静态SiteToken和动态申请的Token
func (s *Server) authorize(request *nethttp.Request) bool {
	header := strings.TrimSpace(request.Header.Get("Authorization"))
	if header == "" || !strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return false
	}

	token := strings.TrimSpace(header[7:])

	// 1. 先检查静态配置的 SiteToken（管理员Token）
	if _, ok := s.config.SiteTokens[token]; ok {
		return true
	}

	// 2. 再检查动态申请的Token
	if valid, _ := s.tokenService.Validate(token); valid {
		return true
	}

	return false
}

// authorizeAdmin 验证管理员Token（仅静态配置的管理员Token有效）
func (s *Server) authorizeAdmin(request *nethttp.Request) bool {
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
