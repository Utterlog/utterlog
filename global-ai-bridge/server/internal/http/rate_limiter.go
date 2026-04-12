package http

import (
	"net"
	nethttp "net/http"
	"strings"
	"sync"
	"time"
)

type rateLimiter struct {
	limitPerMinute int
	mu             sync.Mutex
	buckets        map[string]*rateBucket
}

type rateBucket struct {
	windowStart time.Time
	count       int
}

func newRateLimiter(limitPerMinute int) *rateLimiter {
	if limitPerMinute <= 0 {
		limitPerMinute = 120
	}

	return &rateLimiter{
		limitPerMinute: limitPerMinute,
		buckets:        make(map[string]*rateBucket),
	}
}

func (r *rateLimiter) Allow(request *nethttp.Request) bool {
	key := clientIP(request)
	now := time.Now().UTC()

	r.mu.Lock()
	defer r.mu.Unlock()

	bucket, ok := r.buckets[key]
	if !ok || now.Sub(bucket.windowStart) >= time.Minute {
		r.buckets[key] = &rateBucket{
			windowStart: now,
			count:       1,
		}
		r.cleanupLocked(now)
		return true
	}

	if bucket.count >= r.limitPerMinute {
		return false
	}

	bucket.count++
	return true
}

func (r *rateLimiter) cleanupLocked(now time.Time) {
	for key, bucket := range r.buckets {
		if now.Sub(bucket.windowStart) >= 2*time.Minute {
			delete(r.buckets, key)
		}
	}
}

func clientIP(request *nethttp.Request) string {
	for _, header := range []string{"CF-Connecting-IP", "X-Forwarded-For", "X-Real-IP"} {
		value := strings.TrimSpace(request.Header.Get(header))
		if value == "" {
			continue
		}
		if header == "X-Forwarded-For" {
			parts := strings.Split(value, ",")
			value = strings.TrimSpace(parts[0])
		}
		if value != "" {
			return value
		}
	}

	host, _, err := net.SplitHostPort(request.RemoteAddr)
	if err == nil && host != "" {
		return host
	}

	return request.RemoteAddr
}
