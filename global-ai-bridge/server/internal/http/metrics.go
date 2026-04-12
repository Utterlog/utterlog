package http

import (
	"sync"
	"sync/atomic"
	"time"
)

type Metrics struct {
	startedAt      time.Time
	totalRequests  uint64
	totalErrors    uint64
	totalAuthFails uint64
	totalRateLimit uint64

	mu               sync.RWMutex
	lastStatusCode   int
	lastErrorMessage string
	lastRequestAt    time.Time
	lastSuccessfulAt time.Time
}

func NewMetrics() *Metrics {
	return &Metrics{
		startedAt: time.Now().UTC(),
	}
}

func (m *Metrics) RecordRequest(status int, errMessage string) {
	atomic.AddUint64(&m.totalRequests, 1)
	if status >= 400 {
		atomic.AddUint64(&m.totalErrors, 1)
	}

	m.mu.Lock()
	defer m.mu.Unlock()
	m.lastStatusCode = status
	m.lastErrorMessage = errMessage
	m.lastRequestAt = time.Now().UTC()
	if status >= 200 && status < 400 {
		m.lastSuccessfulAt = m.lastRequestAt
	}
}

func (m *Metrics) RecordAuthFailure() {
	atomic.AddUint64(&m.totalAuthFails, 1)
}

func (m *Metrics) RecordRateLimited() {
	atomic.AddUint64(&m.totalRateLimit, 1)
}

func (m *Metrics) Snapshot() map[string]any {
	m.mu.RLock()
	defer m.mu.RUnlock()

	return map[string]any{
		"started_at":          m.startedAt.Format(time.RFC3339),
		"uptime_seconds":      int(time.Since(m.startedAt).Seconds()),
		"total_requests":      atomic.LoadUint64(&m.totalRequests),
		"total_errors":        atomic.LoadUint64(&m.totalErrors),
		"total_auth_failures": atomic.LoadUint64(&m.totalAuthFails),
		"total_rate_limited":  atomic.LoadUint64(&m.totalRateLimit),
		"last_status_code":    m.lastStatusCode,
		"last_error_message":  m.lastErrorMessage,
		"last_request_at":     formatTime(m.lastRequestAt),
		"last_success_at":     formatTime(m.lastSuccessfulAt),
	}
}

func formatTime(value time.Time) string {
	if value.IsZero() {
		return ""
	}

	return value.Format(time.RFC3339)
}
