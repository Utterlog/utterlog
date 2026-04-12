package service

import (
	"crypto/rand"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
)

// TokenEntry 存储 token 和邮箱的映射关系
type TokenEntry struct {
	Token         string    `json:"token"`
	Email         string    `json:"email"`
	CreatedAt     time.Time `json:"created_at"`
	LastUsedAt    time.Time `json:"last_used_at,omitempty"`
	TotalRequests int       `json:"total_requests"`
	TotalTokens   int       `json:"total_tokens"`
	Status        string    `json:"status"` // active, revoked
}

// TokenUsage 单次使用记录
type TokenUsage struct {
	Token      string    `json:"token"`
	Timestamp  time.Time `json:"timestamp"`
	Provider   string    `json:"provider"`
	Model      string    `json:"model"`
	TokensUsed int       `json:"tokens_used"`
	LatencyMs  int       `json:"latency_ms"`
	Status     string    `json:"status"` // success, error
}

// TokenService 管理 token 的申请和验证
type TokenService struct {
	mu          sync.RWMutex
	tokens      map[string]*TokenEntry // token -> entry
	emails      map[string]string      // email -> token
	usageData   []TokenUsage           // 使用记录（最近N条）
	dataFile    string
	usageFile   string
	maxUsageLog int
	emailSvc    *EmailService
	nodeName    string
}

// TokenServiceConfig Token 服务配置
type TokenServiceConfig struct {
	DataDir     string
	MaxUsageLog int
	EmailSvc    *EmailService
	NodeName    string
}

// NewTokenService 创建一个新的 token 服务
func NewTokenService(cfg TokenServiceConfig) *TokenService {
	if cfg.DataDir == "" {
		cfg.DataDir = "./data"
	}
	if cfg.MaxUsageLog == 0 {
		cfg.MaxUsageLog = 10000 // 默认保存最近10000条记录
	}

	svc := &TokenService{
		tokens:      make(map[string]*TokenEntry),
		emails:      make(map[string]string),
		usageData:   make([]TokenUsage, 0),
		dataFile:    filepath.Join(cfg.DataDir, "tokens.json"),
		usageFile:   filepath.Join(cfg.DataDir, "token_usage.json"),
		maxUsageLog: cfg.MaxUsageLog,
		emailSvc:    cfg.EmailSvc,
		nodeName:    cfg.NodeName,
	}

	// 确保数据目录存在
	_ = os.MkdirAll(cfg.DataDir, 0755)

	// 加载已有数据
	svc.load()
	svc.loadUsage()

	return svc
}

// ApplyRequest Token 申请请求
type ApplyRequest struct {
	Email string `json:"email"`
}

// ApplyResponse Token 申请响应
type ApplyResponse struct {
	Success bool   `json:"success"`
	Token   string `json:"token,omitempty"`
	Message string `json:"message,omitempty"`
}

// Apply 申请一个新的 token
func (s *TokenService) Apply(email string) (*ApplyResponse, error) {
	// 验证邮箱格式
	email = strings.ToLower(strings.TrimSpace(email))
	if !isValidEmail(email) {
		return &ApplyResponse{
			Success: false,
			Message: "请输入有效的邮箱地址",
		}, nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// 检查邮箱是否已申请过
	if existingToken, exists := s.emails[email]; exists {
		// 返回已有的 token
		if entry, ok := s.tokens[existingToken]; ok {
			// 发送邮件通知（即使是重复申请）
			if s.emailSvc != nil && s.emailSvc.IsEnabled() {
				go s.emailSvc.SendTokenEmail(email, entry.Token, s.nodeName)
			}
			return &ApplyResponse{
				Success: true,
				Token:   entry.Token,
				Message: "该邮箱已申请过 Token，已返回已有的 Token，邮件已发送",
			}, nil
		}
	}

	// 生成新 token
	token, err := generateToken()
	if err != nil {
		return nil, fmt.Errorf("generate token failed: %w", err)
	}

	// 存储映射关系
	entry := &TokenEntry{
		Token:     token,
		Email:     email,
		CreatedAt: time.Now(),
		Status:    "active",
	}
	s.tokens[token] = entry
	s.emails[email] = token

	// 持久化
	if err := s.saveLocked(); err != nil {
		// 回滚内存更改
		delete(s.tokens, token)
		delete(s.emails, email)
		return nil, fmt.Errorf("save token failed: %w", err)
	}

	// 发送邮件通知
	if s.emailSvc != nil && s.emailSvc.IsEnabled() {
		go s.emailSvc.SendTokenEmail(email, token, s.nodeName)
	}

	return &ApplyResponse{
		Success: true,
		Token:   token,
		Message: "Token 申请成功，请查收邮件",
	}, nil
}

// Validate 验证 token 是否有效
func (s *TokenService) Validate(token string) (bool, *TokenEntry) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entry, exists := s.tokens[token]
	if !exists || entry.Status != "active" {
		return false, nil
	}

	return true, entry
}

// RecordUsage 记录 Token 使用量
func (s *TokenService) RecordUsage(token, provider, model string, tokensUsed, latencyMs int, status string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// 更新 Token 统计
	if entry, exists := s.tokens[token]; exists {
		entry.LastUsedAt = time.Now()
		entry.TotalRequests++
		entry.TotalTokens += tokensUsed
	}

	// 记录详细使用日志
	usage := TokenUsage{
		Token:      token,
		Timestamp:  time.Now(),
		Provider:   provider,
		Model:      model,
		TokensUsed: tokensUsed,
		LatencyMs:  latencyMs,
		Status:     status,
	}
	s.usageData = append(s.usageData, usage)

	// 限制日志数量
	if len(s.usageData) > s.maxUsageLog {
		s.usageData = s.usageData[len(s.usageData)-s.maxUsageLog:]
	}

	// 异步保存（goroutine 内部各自加锁，主调方释放锁后再运行）
	go s.save()
	go s.saveUsage()
}

// GetTokenStats 获取指定 Token 的统计信息
func (s *TokenService) GetTokenStats(token string) (*TokenEntry, []TokenUsage, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	entry, exists := s.tokens[token]
	if !exists {
		return nil, nil, false
	}

	// 获取该 token 的使用记录（最近 100 条）
	var usages []TokenUsage
	count := 0
	for i := len(s.usageData) - 1; i >= 0 && count < 100; i-- {
		if s.usageData[i].Token == token {
			usages = append(usages, s.usageData[i])
			count++
		}
	}

	return entry, usages, true
}

// GetAllTokenStats 获取所有 Token 的统计摘要
func (s *TokenService) GetAllTokenStats() []map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]map[string]interface{}, 0, len(s.tokens))
	for _, entry := range s.tokens {
		// 计算今日使用量
		today := time.Now().Format("2006-01-02")
		todayRequests := 0
		todayTokens := 0

		for _, usage := range s.usageData {
			if usage.Token == entry.Token && usage.Timestamp.Format("2006-01-02") == today {
				todayRequests++
				todayTokens += usage.TokensUsed
			}
		}

		result = append(result, map[string]interface{}{
			"token_prefix":   entry.Token[:12] + "...",
			"email":          entry.Email,
			"created_at":     entry.CreatedAt,
			"last_used_at":   entry.LastUsedAt,
			"total_requests": entry.TotalRequests,
			"total_tokens":   entry.TotalTokens,
			"today_requests": todayRequests,
			"today_tokens":   todayTokens,
			"status":         entry.Status,
		})
	}

	return result
}

// GetUsageStats 获取全局使用统计
func (s *TokenService) GetUsageStats() map[string]interface{} {
	s.mu.RLock()
	defer s.mu.RUnlock()

	totalRequests := 0
	totalTokens := 0
	todayRequests := 0
	todayTokens := 0
	today := time.Now().Format("2006-01-02")

	for _, usage := range s.usageData {
		totalRequests++
		totalTokens += usage.TokensUsed
		if usage.Timestamp.Format("2006-01-02") == today {
			todayRequests++
			todayTokens += usage.TokensUsed
		}
	}

	return map[string]interface{}{
		"total_tokens_count": len(s.tokens),
		"total_requests":     totalRequests,
		"total_tokens_used":  totalTokens,
		"today_requests":     todayRequests,
		"today_tokens_used":  todayTokens,
	}
}

// GetAllTokens 获取所有 token（用于管理）
func (s *TokenService) GetAllTokens() []*TokenEntry {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]*TokenEntry, 0, len(s.tokens))
	for _, entry := range s.tokens {
		result = append(result, entry)
	}

	return result
}

// Revoke 吊销一个 token
func (s *TokenService) Revoke(token string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	entry, exists := s.tokens[token]
	if !exists {
		return false
	}

	entry.Status = "revoked"
	s.saveLocked()
	return true
}

// RevokeByEmail 通过邮箱吊销 token
func (s *TokenService) RevokeByEmail(email string) bool {
	s.mu.Lock()
	defer s.mu.Unlock()

	email = strings.ToLower(strings.TrimSpace(email))
	token, exists := s.emails[email]
	if !exists {
		return false
	}

	if entry, ok := s.tokens[token]; ok {
		entry.Status = "revoked"
	}

	s.saveLocked()
	return true
}

// GetByEmail 通过邮箱查找 token
func (s *TokenService) GetByEmail(email string) (*TokenEntry, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	email = strings.ToLower(strings.TrimSpace(email))
	token, exists := s.emails[email]
	if !exists {
		return nil, false
	}

	entry, ok := s.tokens[token]
	return entry, ok
}

// GetStats 获取统计信息
func (s *TokenService) GetStats() map[string]any {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return map[string]any{
		"total_tokens": len(s.tokens),
		"total_emails": len(s.emails),
	}
}

// 加载已有数据
func (s *TokenService) load() error {
	data, err := os.ReadFile(s.dataFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var entries []*TokenEntry
	if err := json.Unmarshal(data, &entries); err != nil {
		return err
	}

	for _, entry := range entries {
		s.tokens[entry.Token] = entry
		s.emails[entry.Email] = entry.Token
	}

	return nil
}

// 保存数据到文件
func (s *TokenService) save() error {
	s.mu.RLock()
	entries := make([]*TokenEntry, 0, len(s.tokens))
	for _, entry := range s.tokens {
		copy := *entry
		entries = append(entries, &copy)
	}
	s.mu.RUnlock()

	return s.writeTokenFile(entries)
}

// saveLocked 在调用方已持有锁时保存数据
func (s *TokenService) saveLocked() error {
	entries := make([]*TokenEntry, 0, len(s.tokens))
	for _, entry := range s.tokens {
		copy := *entry
		entries = append(entries, &copy)
	}

	return s.writeTokenFile(entries)
}

func (s *TokenService) writeTokenFile(entries []*TokenEntry) error {
	data, err := json.MarshalIndent(entries, "", "  ")
	if err != nil {
		return err
	}

	tmpFile := s.dataFile + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return err
	}

	return os.Rename(tmpFile, s.dataFile)
}

// 加载使用记录
func (s *TokenService) loadUsage() error {
	data, err := os.ReadFile(s.usageFile)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}

	var usages []TokenUsage
	if err := json.Unmarshal(data, &usages); err != nil {
		return err
	}

	s.usageData = usages
	return nil
}

// 保存使用记录
func (s *TokenService) saveUsage() error {
	s.mu.RLock()
	usageCopy := make([]TokenUsage, len(s.usageData))
	copy(usageCopy, s.usageData)
	s.mu.RUnlock()

	data, err := json.MarshalIndent(usageCopy, "", "  ")

	if err != nil {
		return err
	}

	tmpFile := s.usageFile + ".tmp"
	if err := os.WriteFile(tmpFile, data, 0644); err != nil {
		return err
	}

	return os.Rename(tmpFile, s.usageFile)
}

// 生成随机 token
func generateToken() (string, error) {
	bytes := make([]byte, 32)
	if _, err := rand.Read(bytes); err != nil {
		return "", err
	}

	return "abt_" + hex.EncodeToString(bytes), nil
}

// 邮箱验证正则
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

func isValidEmail(email string) bool {
	return emailRegex.MatchString(email)
}

// IsTokenValid 检查 token 是否与给定值完全匹配（恒定时间比较）
func IsTokenValid(expected, actual string) bool {
	if expected == "" || actual == "" {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(expected), []byte(actual)) == 1
}

// HTTPHandler 返回 http.Handler 用于处理 token 申请请求
func (s *TokenService) HTTPHandler() http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		// 只允许 POST 请求
		if r.Method != http.MethodPost {
			w.WriteHeader(http.StatusMethodNotAllowed)
			json.NewEncoder(w).Encode(ApplyResponse{
				Success: false,
				Message: "Method not allowed",
			})
			return
		}

		// 解析请求
		var req ApplyRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			json.NewEncoder(w).Encode(ApplyResponse{
				Success: false,
				Message: "Invalid request body",
			})
			return
		}
		defer r.Body.Close()

		// 处理申请
		resp, err := s.Apply(req.Email)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			json.NewEncoder(w).Encode(ApplyResponse{
				Success: false,
				Message: "Internal server error",
			})
			return
		}

		// 返回响应
		if !resp.Success {
			w.WriteHeader(http.StatusBadRequest)
		} else {
			w.WriteHeader(http.StatusOK)
		}

		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(resp)
	}
}
