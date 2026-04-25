package handler

import (
	_ "embed"
	"net/http"
	"os"

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

// FaviconSVG serves /favicon.svg. Same persist-first-then-legacy-then-
// embedded fallback chain as the other branding routes:
//
//   1. public/uploads/branding/favicon.svg  (volumized, survives upgrade)
//   2. public/favicon.svg                   (legacy, pre-persistence rev)
//   3. embedded Utterlog brand SVG          (default for fresh installs +
//                                            the install wizard, which
//                                            needs a working favicon
//                                            before any upload happens)
func FaviconSVG(c *gin.Context) {
	if _, err := os.Stat("./public/uploads/branding/favicon.svg"); err == nil {
		c.File("./public/uploads/branding/favicon.svg")
		return
	}
	if _, err := os.Stat("./public/favicon.svg"); err == nil {
		c.File("./public/favicon.svg")
		return
	}
	c.Header("Cache-Control", "public, max-age=86400")
	c.Data(http.StatusOK, "image/svg+xml", faviconSVG)
}
