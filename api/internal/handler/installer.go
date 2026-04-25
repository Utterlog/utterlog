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

// FaviconSVG serves /favicon.svg. If the admin uploaded a custom SVG
// favicon (saved as public/favicon.svg by UploadBranding), serve that
// instead; otherwise fall back to the embedded Utterlog brand SVG so
// the install page + a fresh install always have a working favicon.
//
// Why a fallback dance instead of just letting the wildcard
// /favicon.:ext serve from disk: gin matches the explicit
// "/favicon.svg" route before the ":ext" pattern, so without this
// handler reading from disk the user's uploaded favicon.svg would be
// shadowed forever by the embedded brand. We can't drop the embed
// either — fresh installs (and the install wizard itself) need a
// working /favicon.svg before any upload has happened.
func FaviconSVG(c *gin.Context) {
	if _, err := os.Stat("./public/favicon.svg"); err == nil {
		c.File("./public/favicon.svg")
		return
	}
	c.Header("Cache-Control", "public, max-age=86400")
	c.Data(http.StatusOK, "image/svg+xml", faviconSVG)
}
