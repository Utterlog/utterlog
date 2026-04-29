package main

import (
	"net/http"
	"os"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
)

func themeAssetHandler(fallback gin.HandlerFunc) gin.HandlerFunc {
	roots := []string{
		filepath.Join(".", "content", "themes"),
		// Compatibility for older installs that wrote theme assets here.
		filepath.Join(".", "public", "themes"),
	}

	return func(c *gin.Context) {
		rel, ok := cleanStaticPath(c.Param("filepath"))
		if !ok {
			c.Status(http.StatusNotFound)
			return
		}

		for _, root := range roots {
			candidate := filepath.Join(root, rel)
			if st, err := os.Stat(candidate); err == nil && !st.IsDir() {
				c.File(candidate)
				return
			}
		}

		if fallback != nil {
			fallback(c)
			return
		}
		c.Status(http.StatusNotFound)
	}
}

func cleanStaticPath(param string) (string, bool) {
	rel := strings.TrimPrefix(param, "/")
	if rel == "" {
		return "", false
	}

	parts := strings.Split(filepath.ToSlash(rel), "/")
	cleanParts := make([]string, 0, len(parts))
	for _, part := range parts {
		if part == "" || part == "." || part == ".." || strings.HasPrefix(part, ".") {
			return "", false
		}
		cleanParts = append(cleanParts, part)
	}
	return filepath.FromSlash(strings.Join(cleanParts, "/")), true
}
