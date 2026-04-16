package main

import (
	"fmt"
	"log"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// webProxyHandler returns a Gin handler that reverse-proxies requests to the
// Next.js blog container. It is used as NoRoute fallback so the Go API is the
// single public entry point:
//
//	/admin/*     → embedded SPA (served by ServeAdmin)
//	/api/*       → Go handlers
//	/uploads/*   → local filesystem
//	/themes/*    → theme preview assets
//	/logo.*, /favicon.*  → branding files
//	everything else (/, /posts/:slug, /tags, RSC, _next/*, static pages)
//	                     → this proxy → Next.js on port 3000
//
// Enabled only when WEB_PROXY_TARGET is set (typically "http://web:3000" in
// docker compose). If unset, NoRoute falls back to 404 so dev users running
// Next.js on a different host/port aren't surprised.
func webProxyHandler() gin.HandlerFunc {
	target := os.Getenv("WEB_PROXY_TARGET")
	if target == "" {
		return nil
	}

	u, err := url.Parse(target)
	if err != nil {
		log.Printf("WEB_PROXY_TARGET invalid url %q: %v — web proxy disabled", target, err)
		return nil
	}

	proxy := httputil.NewSingleHostReverseProxy(u)

	// Preserve original Host + forwarded headers so Next.js sees the real
	// request (needed by middleware.ts for /install/status check and by SSR
	// for absolute URL construction).
	originalDirector := proxy.Director
	proxy.Director = func(req *http.Request) {
		originalDirector(req)
		req.Host = u.Host
		if req.Header.Get("X-Forwarded-Proto") == "" {
			req.Header.Set("X-Forwarded-Proto", "http")
		}
		req.Header.Set("X-Forwarded-Host", req.Host)
	}

	// Short timeout so a broken Next.js doesn't hang Go indefinitely; Next.js
	// SSR normally responds in <500ms, so 30s is very generous.
	proxy.Transport = &http.Transport{
		ResponseHeaderTimeout: 30 * time.Second,
		IdleConnTimeout:       90 * time.Second,
		MaxIdleConns:          100,
	}

	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		log.Printf("web proxy error %s %s: %v", r.Method, r.URL.Path, err)
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.WriteHeader(http.StatusBadGateway)
		fmt.Fprintf(w, `<!doctype html><html><body style="font-family:system-ui;padding:40px">
<h1>502 · Blog renderer unavailable</h1>
<p>Go API reached but the Next.js web container is not responding.</p>
<p><code>WEB_PROXY_TARGET = %s</code></p>
<p>Run <code>docker compose -f docker-compose.prod.yml ps</code> to check the <code>web</code> container.</p>
</body></html>`, strings.ReplaceAll(target, "<", "&lt;"))
	}

	return func(c *gin.Context) {
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}
