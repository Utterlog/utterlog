package handler

import (
	_ "embed"
	"net/http"

	"github.com/gin-gonic/gin"
)

//go:embed installer.html
var installerHTML []byte

//go:embed favicon.svg
var faviconSVG []byte

// InstallPage serves the standalone install wizard at /install. It runs
// in both setup-only and full mode: in setup-only the JS walks the user
// through DB+Redis config, then the process restarts; in full mode, if
// an admin already exists, we bounce to /admin/login instead.
func InstallPage(c *gin.Context) {
	if IsInstalled() {
		c.Redirect(http.StatusFound, "/admin/login")
		return
	}
	c.Header("Cache-Control", "no-store")
	c.Data(http.StatusOK, "text/html; charset=utf-8", installerHTML)
}

// FaviconSVG serves the Utterlog brand favicon. Available in both setup-only
// and full mode so the install page and any branding route always work.
func FaviconSVG(c *gin.Context) {
	c.Header("Cache-Control", "public, max-age=86400")
	c.Data(http.StatusOK, "image/svg+xml", faviconSVG)
}
