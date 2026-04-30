package main

import (
	"context"
	"crypto/tls"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"os"
	"strings"
	"sync"
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
//	/themes/*    → runtime theme assets, built-in theme assets, then web fallback
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
		originalHost := req.Host
		originalProto := forwardedProto(req)
		originalDirector(req)
		req.Host = u.Host
		if req.Header.Get("X-Forwarded-Proto") == "" {
			req.Header.Set("X-Forwarded-Proto", originalProto)
		}
		req.Header.Set("X-Forwarded-Host", originalHost)
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
		if isWebSocketUpgrade(c.Request) {
			proxyWebSocket(c, u)
			return
		}
		proxy.ServeHTTP(c.Writer, c.Request)
	}
}

func isWebSocketUpgrade(r *http.Request) bool {
	return strings.EqualFold(r.Header.Get("Upgrade"), "websocket") &&
		strings.Contains(strings.ToLower(r.Header.Get("Connection")), "upgrade")
}

func proxyWebSocket(c *gin.Context, target *url.URL) {
	hijacker, ok := c.Writer.(http.Hijacker)
	if !ok {
		http.Error(c.Writer, "websocket proxy unsupported", http.StatusInternalServerError)
		return
	}

	ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
	defer cancel()

	upstream, err := dialProxyTarget(ctx, target)
	if err != nil {
		log.Printf("web proxy websocket dial error %s %s: %v", c.Request.Method, c.Request.URL.Path, err)
		http.Error(c.Writer, "websocket upstream unavailable", http.StatusBadGateway)
		return
	}

	req := c.Request.Clone(context.Background())
	req.URL.Scheme = target.Scheme
	req.URL.Host = target.Host
	req.RequestURI = ""
	req.Host = target.Host
	req.Header.Set("X-Forwarded-Proto", forwardedProto(c.Request))
	req.Header.Set("X-Forwarded-Host", c.Request.Host)
	appendForwardedFor(req, c.Request.RemoteAddr)

	if err := req.Write(upstream); err != nil {
		upstream.Close()
		log.Printf("web proxy websocket request error %s %s: %v", c.Request.Method, c.Request.URL.Path, err)
		http.Error(c.Writer, "websocket proxy failed", http.StatusBadGateway)
		return
	}

	c.Status(http.StatusSwitchingProtocols)
	downstream, _, err := hijacker.Hijack()
	if err != nil {
		upstream.Close()
		log.Printf("web proxy websocket hijack error %s %s: %v", c.Request.Method, c.Request.URL.Path, err)
		return
	}

	var wg sync.WaitGroup
	wg.Add(2)
	go pipeWebSocket(&wg, upstream, downstream)
	go pipeWebSocket(&wg, downstream, upstream)
	wg.Wait()
}

func dialProxyTarget(ctx context.Context, target *url.URL) (net.Conn, error) {
	address := target.Host
	if _, _, err := net.SplitHostPort(address); err != nil {
		if target.Scheme == "https" {
			address = net.JoinHostPort(address, "443")
		} else {
			address = net.JoinHostPort(address, "80")
		}
	}

	dialer := &net.Dialer{Timeout: 30 * time.Second, KeepAlive: 30 * time.Second}
	if target.Scheme == "https" {
		return tls.DialWithDialer(dialer, "tcp", address, &tls.Config{
			ServerName: targetHostname(target.Host),
			MinVersion: tls.VersionTLS12,
		})
	}
	return dialer.DialContext(ctx, "tcp", address)
}

func pipeWebSocket(wg *sync.WaitGroup, dst net.Conn, src net.Conn) {
	defer wg.Done()
	_, _ = io.Copy(dst, src)
	_ = dst.Close()
	_ = src.Close()
}

func forwardedProto(r *http.Request) string {
	if r.TLS != nil {
		return "https"
	}
	return "http"
}

func appendForwardedFor(req *http.Request, remoteAddr string) {
	host, _, err := net.SplitHostPort(remoteAddr)
	if err != nil {
		host = remoteAddr
	}
	if host == "" {
		return
	}
	if prior := req.Header.Get("X-Forwarded-For"); prior != "" {
		req.Header.Set("X-Forwarded-For", prior+", "+host)
		return
	}
	req.Header.Set("X-Forwarded-For", host)
}

func targetHostname(host string) string {
	if h, _, err := net.SplitHostPort(host); err == nil {
		return h
	}
	return host
}
