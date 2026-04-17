package main

import (
	"embed"
	"io/fs"
	"mime"
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"

	"utterlog-go/internal/handler"
)

// adminDistFS holds the compiled Vite output. Populated by the embed directive in admin_embed.go
// so that `api/admin/dist` is baked into the final binary.

// ServeAdmin returns a Gin handler that serves the React SPA under /admin/*.
// Strategy:
//   - If the requested path matches a real file in dist/ → serve it with correct MIME
//   - Otherwise (SPA route like /admin/posts) → fall back to dist/index.html
func ServeAdmin(distFS embed.FS) gin.HandlerFunc {
	// Unwrap the "admin/dist" prefix so we can do fs.Sub for cleaner file access.
	sub, err := fs.Sub(distFS, "admin/dist")
	if err != nil {
		// Dist not built yet — serve a friendly placeholder
		return func(c *gin.Context) {
			c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(adminPlaceholderHTML))
		}
	}

	return func(c *gin.Context) {
		rel := strings.TrimPrefix(c.Param("filepath"), "/")
		if rel == "" || rel == "/" {
			rel = "index.html"
		}

		// Install gate: if no admin account exists yet, redirect HTML page
		// loads to the install wizard. Static assets (.js/.css/.svg/etc) are
		// not redirected — only the SPA shell, which is what the user sees.
		// Once installed, this branch is skipped on every request (cheap
		// query: SELECT count(*) FROM ul_users WHERE role='admin' LIMIT 1).
		if isHTMLRequest(rel, c.Request.Header.Get("Accept")) && !handler.IsInstalled() {
			c.Redirect(http.StatusFound, "/install")
			return
		}

		// Try exact file (or SPA fallback)
		data, encoding, realRel, err := readAdminAsset(sub, rel, c.Request.Header.Get("Accept-Encoding"))
		if err != nil {
			// SPA fallback
			data, encoding, _, err = readAdminAsset(sub, "index.html", c.Request.Header.Get("Accept-Encoding"))
			if err != nil {
				c.Data(http.StatusOK, "text/html; charset=utf-8", []byte(adminPlaceholderHTML))
				return
			}
			realRel = "index.html"
		}

		// MIME from extension — always use the ORIGINAL extension, not .gz / .br
		ct := mime.TypeByExtension(filepath.Ext(realRel))
		if ct == "" {
			ct = http.DetectContentType(data)
		}

		// Cache policy: hashed assets immutable; index.html never cached
		if realRel == "index.html" {
			c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
		} else if strings.HasPrefix(realRel, "assets/") {
			c.Header("Cache-Control", "public, max-age=31536000, immutable")
		}

		if encoding != "" {
			c.Header("Content-Encoding", encoding)
			c.Header("Vary", "Accept-Encoding")
		}

		c.Data(http.StatusOK, ct, data)
	}
}

const adminPlaceholderHTML = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>Utterlog Admin — 未构建</title>
<style>
body { font-family: system-ui, sans-serif; background: #f5f8fc; color: #1a2b3d;
       display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; }
.box { max-width: 520px; padding: 32px; background: #fff; border: 1px solid #c8dae8; }
h1 { font-size: 18px; margin: 0 0 12px; }
code { background: #eaf1fa; padding: 2px 6px; font-size: 13px; }
p { font-size: 13px; line-height: 1.8; color: #5a7a94; }
</style>
</head>
<body>
<div class="box">
<h1>管理后台尚未构建</h1>
<p>Dashboard SPA 还没编译。在项目根目录执行：</p>
<p><code>cd api/admin && npm install && npm run build</code></p>
<p>然后重启 API 服务，再次访问 <code>/admin</code> 就能看到后台了。</p>
</div>
</body>
</html>`

// isHTMLRequest returns true when the request is for the SPA shell — either
// the bare path (e.g. /admin/, /admin/login, /admin/posts) or any URL whose
// Accept header prefers HTML. Used by the install gate to avoid 302-ing
// hashed JS/CSS asset requests.
func isHTMLRequest(rel, acceptHeader string) bool {
	// Anything under assets/ or with a known asset extension → static, never HTML
	if strings.HasPrefix(rel, "assets/") {
		return false
	}
	switch filepath.Ext(rel) {
	case ".js", ".css", ".map", ".svg", ".png", ".jpg", ".jpeg", ".gif",
		".webp", ".avif", ".ico", ".woff", ".woff2", ".ttf", ".json":
		return false
	}
	// Otherwise treat as HTML (SPA shell or explicit text/html accept)
	return rel == "index.html" || strings.Contains(acceptHeader, "text/html")
}

// readAdminAsset reads a file from the embedded admin dist, picking the best
// pre-compressed variant based on the client's Accept-Encoding header.
// Returns: raw bytes, encoding ("br" | "gzip" | ""), original rel path, err.
func readAdminAsset(sub fs.FS, rel string, acceptEncoding string) ([]byte, string, string, error) {
	accept := strings.ToLower(acceptEncoding)
	acceptsBr := strings.Contains(accept, "br")
	acceptsGzip := strings.Contains(accept, "gzip")

	// Prefer brotli → gzip → plain
	if acceptsBr {
		if data, err := fs.ReadFile(sub, rel+".br"); err == nil {
			return data, "br", rel, nil
		}
	}
	if acceptsGzip {
		if data, err := fs.ReadFile(sub, rel+".gz"); err == nil {
			return data, "gzip", rel, nil
		}
	}
	// Plain
	data, err := fs.ReadFile(sub, rel)
	if err != nil {
		return nil, "", rel, err
	}
	return data, "", rel, nil
}
