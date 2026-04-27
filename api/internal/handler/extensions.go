package handler

import (
	"archive/zip"
	"encoding/json"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// Extensions = Themes + Plugins. Both share the same lifecycle: scan a directory,
// list manifests, enable/disable via a DB option, install via zip upload.

type ExtensionKind string

const (
	KindTheme  ExtensionKind = "theme"
	KindPlugin ExtensionKind = "plugin"
)

// Extension describes a single theme or plugin discovered on disk.
type Extension struct {
	ID            string         `json:"id"` // slug / dir name
	Name          string         `json:"name"`
	Version       string         `json:"version"`
	Author        string         `json:"author,omitempty"`
	Description   string         `json:"description,omitempty"`
	Homepage      string         `json:"homepage,omitempty"`
	Kind          string         `json:"kind"`    // "theme" | "plugin"
	Builtin       bool           `json:"builtin"` // shipped with binary
	Enabled       bool           `json:"enabled"` // currently active
	Preview       string         `json:"preview,omitempty"`
	Path          string         `json:"-"` // filesystem path, not returned to client
	MenuPositions []MenuPosition `json:"menuPositions,omitempty"`
}

type MenuPosition struct {
	Key         string `json:"key"`
	Label       string `json:"label"`
	Description string `json:"description,omitempty"`
}

// directory layout:
//
//	./themes/<id>/manifest.json       — user-installed
//	./themes-builtin/<id>/...         — shipped with binary (reserved for future)
//	./plugins/<id>/manifest.json
func extensionsDir(kind ExtensionKind) string {
	switch kind {
	case KindTheme:
		return "themes"
	case KindPlugin:
		return "plugins"
	}
	return ""
}

// enabledOptionKey returns the options key for enabled list of this extension kind.
func enabledOptionKey(kind ExtensionKind) string {
	switch kind {
	case KindTheme:
		return "active_theme" // single active
	case KindPlugin:
		return "active_plugins" // JSON array
	}
	return ""
}

// builtInThemes — themes compiled into the Next.js bundle (web/themes/*).
// They live in the web container, not the Go container, so we hard-code
// their manifest so the admin can list + activate them.
//
// Utterlog (renamed from Westlife in 2026-04) is the official default
// theme. The "Utterlog 2026" theme was removed in the same change —
// any site whose active_theme is still "2026" or "Westlife" falls
// through to Utterlog via the default fallback in listExtensions.
var builtInThemes = []Extension{
	{
		ID: "Utterlog", Name: "Utterlog", Version: "1.0.0",
		Author:      "Utterlog Team",
		Description: "Utterlog 官方默认主题 — 优雅功能丰富的博客主题",
		Kind:        "theme",
		Builtin:     true,
		Preview:     "/themes/Utterlog/screenshot.svg",
		MenuPositions: []MenuPosition{
			{Key: "header", Label: "顶部导航", Description: "网站顶部 Header 的导航菜单"},
		},
	},
	{
		ID: "Azure", Name: "Azure", Version: "1.0.0",
		Author:      "Utterlog Team",
		Description: "蔚蓝极简内容优先主题 — 直角设计，蓝色配色",
		Kind:        "theme",
		Builtin:     true,
		Preview:     "/themes/Azure/screenshot.svg",
		MenuPositions: []MenuPosition{
			{Key: "header", Label: "顶部导航", Description: "网站顶部 Header 的导航菜单"},
			{Key: "sidebar", Label: "侧栏导航", Description: "首页左侧分类标签导航"},
		},
	},
	{
		ID: "Flux", Name: "Flux", Version: "1.0.0",
		Author:      "Utterlog Team",
		Description: "极简金融科技风 · 单一绿色强调 · 大量留白 · 受 Stripe Link 启发",
		Kind:        "theme",
		Builtin:     true,
		Preview:     "/themes/Flux/screenshot.svg",
		MenuPositions: []MenuPosition{
			{Key: "header", Label: "顶部导航", Description: "顶部 Header 的导航链接"},
			{Key: "footer", Label: "底部导航", Description: "Footer 的辅助链接"},
		},
	},
	{
		ID: "Chred", Name: "Chred", Version: "1.0.0",
		Author:      "Utterlog Team",
		Description: "红色商务主题 — 卡片式布局，高对比度",
		Kind:        "theme",
		Builtin:     true,
		Preview:     "/themes/Chred/screenshot.svg",
		MenuPositions: []MenuPosition{
			{Key: "header", Label: "顶部导航", Description: "网站顶部 Header 的导航菜单"},
			{Key: "sidebar", Label: "侧栏导航", Description: "首页左侧分类标签导航"},
		},
	},
}

// listExtensions scans directories and returns metadata.
// For themes, built-in themes from the Next.js bundle are included as well.
func listExtensions(kind ExtensionKind) []Extension {
	dir := extensionsDir(kind)
	os.MkdirAll(dir, 0755)

	activeTheme := ""
	activePlugins := map[string]bool{}
	if kind == KindTheme {
		activeTheme = model.GetOption("active_theme")
		if activeTheme == "" {
			activeTheme = "Utterlog" // official default theme
		}
	} else {
		raw := model.GetOption("active_plugins")
		if raw != "" {
			var arr []string
			json.Unmarshal([]byte(raw), &arr)
			for _, id := range arr {
				activePlugins[id] = true
			}
		}
	}

	out := []Extension{}

	// 1. Built-in themes (compiled into Next.js)
	if kind == KindTheme {
		for _, t := range builtInThemes {
			tt := t
			tt.Enabled = activeTheme == tt.ID
			out = append(out, tt)
		}
	}

	// 2. User-uploaded themes / plugins from disk
	entries, err := os.ReadDir(dir)
	if err != nil {
		return out
	}
	for _, e := range entries {
		if !e.IsDir() {
			continue
		}
		manifestPath := filepath.Join(dir, e.Name(), "manifest.json")
		data, err := os.ReadFile(manifestPath)
		if err != nil {
			continue
		}
		var m Extension
		if err := json.Unmarshal(data, &m); err != nil {
			continue
		}
		if m.ID == "" {
			m.ID = e.Name()
		}
		m.Kind = string(kind)
		m.Path = filepath.Join(dir, e.Name())
		if kind == KindTheme {
			m.Enabled = activeTheme == m.ID
		} else {
			m.Enabled = activePlugins[m.ID]
		}
		// Preview asset path (if present)
		previewRel := filepath.Join(dir, e.Name(), "preview.png")
		if _, err := os.Stat(previewRel); err == nil {
			m.Preview = "/" + previewRel
		}
		out = append(out, m)
	}
	return out
}

// ListThemes — GET /api/v1/themes
func ListThemes(c *gin.Context) {
	util.Success(c, gin.H{"themes": listExtensions(KindTheme), "active": model.GetOption("active_theme")})
}

// ListPlugins — GET /api/v1/plugins
func ListPlugins(c *gin.Context) {
	exts := listExtensions(KindPlugin)
	active := []string{}
	for _, e := range exts {
		if e.Enabled {
			active = append(active, e.ID)
		}
	}
	util.Success(c, gin.H{"plugins": exts, "active": active})
}

// ActivateExtension — POST /api/v1/themes/:id/activate  or  /plugins/:id/activate
func ActivateExtension(kind ExtensionKind) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if id == "" || strings.ContainsAny(id, "/\\") {
			util.BadRequest(c, "无效的扩展 ID")
			return
		}
		// Must exist
		exts := listExtensions(kind)
		var found *Extension
		for i := range exts {
			if exts[i].ID == id {
				found = &exts[i]
				break
			}
		}
		if found == nil {
			util.NotFound(c, "扩展")
			return
		}

		now := time.Now().Unix()
		if kind == KindTheme {
			saveOption("active_theme", id, now)
			util.Success(c, gin.H{"active": id})
			return
		}
		// Plugin: add to active_plugins array
		active := []string{}
		raw := model.GetOption("active_plugins")
		if raw != "" {
			json.Unmarshal([]byte(raw), &active)
		}
		for _, aid := range active {
			if aid == id {
				util.Success(c, gin.H{"active": active})
				return
			}
		}
		active = append(active, id)
		b, _ := json.Marshal(active)
		saveOption("active_plugins", string(b), now)
		util.Success(c, gin.H{"active": active})
	}
}

// DeactivateExtension — POST /api/v1/plugins/:id/deactivate (themes always have one active)
func DeactivateExtension(kind ExtensionKind) gin.HandlerFunc {
	return func(c *gin.Context) {
		if kind == KindTheme {
			util.BadRequest(c, "主题必须始终启用一个，请切换到另一个")
			return
		}
		id := c.Param("id")
		raw := model.GetOption("active_plugins")
		if raw == "" {
			util.Success(c, gin.H{"active": []string{}})
			return
		}
		var active []string
		json.Unmarshal([]byte(raw), &active)
		next := make([]string, 0, len(active))
		for _, aid := range active {
			if aid != id {
				next = append(next, aid)
			}
		}
		b, _ := json.Marshal(next)
		saveOption("active_plugins", string(b), time.Now().Unix())
		util.Success(c, gin.H{"active": next})
	}
}

// UploadExtension — POST /api/v1/themes/upload  or  /plugins/upload (multipart .zip)
func UploadExtension(kind ExtensionKind) gin.HandlerFunc {
	return func(c *gin.Context) {
		file, err := c.FormFile("file")
		if err != nil {
			util.BadRequest(c, "请选择 .zip 文件")
			return
		}
		if !strings.HasSuffix(strings.ToLower(file.Filename), ".zip") {
			util.BadRequest(c, "仅支持 .zip 格式")
			return
		}
		if file.Size > 50*1024*1024 {
			util.BadRequest(c, "文件过大（最大 50MB）")
			return
		}

		baseDir := extensionsDir(kind)
		os.MkdirAll(baseDir, 0755)

		// Save to temp
		tmpPath := filepath.Join(baseDir, ".upload-"+fmt.Sprintf("%d", time.Now().UnixNano())+".zip")
		if err := c.SaveUploadedFile(file, tmpPath); err != nil {
			util.Error(c, 500, "SAVE_FAILED", "保存失败: "+err.Error())
			return
		}
		defer os.Remove(tmpPath)

		// Open and validate
		r, err := zip.OpenReader(tmpPath)
		if err != nil {
			util.Error(c, 400, "INVALID_ZIP", "无法解压: "+err.Error())
			return
		}
		defer r.Close()

		// Find manifest.json to determine ID
		var manifestBytes []byte
		var topDir string
		for _, f := range r.File {
			// Manifest must be at root or single-level top directory
			parts := strings.Split(f.Name, "/")
			if len(parts) == 1 && parts[0] == "manifest.json" {
				rc, _ := f.Open()
				manifestBytes, _ = io.ReadAll(rc)
				rc.Close()
				break
			}
			if len(parts) == 2 && parts[1] == "manifest.json" && topDir == "" {
				topDir = parts[0]
				rc, _ := f.Open()
				manifestBytes, _ = io.ReadAll(rc)
				rc.Close()
				break
			}
		}
		if manifestBytes == nil {
			util.Error(c, 400, "NO_MANIFEST", "zip 中未找到 manifest.json")
			return
		}
		var m Extension
		if err := json.Unmarshal(manifestBytes, &m); err != nil {
			util.Error(c, 400, "INVALID_MANIFEST", "manifest.json 格式错误: "+err.Error())
			return
		}
		if m.ID == "" {
			if topDir != "" {
				m.ID = topDir
			} else {
				util.Error(c, 400, "NO_ID", "manifest.json 缺少 id 字段")
				return
			}
		}
		// Sanitize ID
		if strings.ContainsAny(m.ID, "/\\.") {
			util.BadRequest(c, "无效的扩展 ID")
			return
		}

		destDir := filepath.Join(baseDir, m.ID)
		// Delete old if present (reinstall / upgrade)
		os.RemoveAll(destDir)
		os.MkdirAll(destDir, 0755)

		// Extract
		for _, f := range r.File {
			name := f.Name
			if topDir != "" && strings.HasPrefix(name, topDir+"/") {
				name = strings.TrimPrefix(name, topDir+"/")
			}
			if name == "" {
				continue
			}
			// Prevent zip slip
			destPath := filepath.Join(destDir, name)
			if !strings.HasPrefix(destPath, filepath.Clean(destDir)+string(os.PathSeparator)) && destPath != destDir {
				continue
			}
			if f.FileInfo().IsDir() {
				os.MkdirAll(destPath, 0755)
				continue
			}
			os.MkdirAll(filepath.Dir(destPath), 0755)
			rc, err := f.Open()
			if err != nil {
				continue
			}
			w, err := os.Create(destPath)
			if err != nil {
				rc.Close()
				continue
			}
			io.Copy(w, rc)
			w.Close()
			rc.Close()
		}

		util.Success(c, gin.H{"id": m.ID, "name": m.Name, "version": m.Version, "kind": string(kind)})
	}
}

// DeleteExtension — DELETE /api/v1/themes/:id  or  /plugins/:id
func DeleteExtension(kind ExtensionKind) gin.HandlerFunc {
	return func(c *gin.Context) {
		id := c.Param("id")
		if id == "" || strings.ContainsAny(id, "/\\.") {
			util.BadRequest(c, "无效的扩展 ID")
			return
		}
		// Refuse to delete built-in themes
		if kind == KindTheme {
			for _, bt := range builtInThemes {
				if bt.ID == id {
					util.BadRequest(c, "内置主题无法删除")
					return
				}
			}
			if model.GetOption("active_theme") == id {
				util.BadRequest(c, "无法删除当前启用的主题，请先切换到其他主题")
				return
			}
		}
		// Remove from active plugins if present
		if kind == KindPlugin {
			raw := model.GetOption("active_plugins")
			if raw != "" {
				var active []string
				json.Unmarshal([]byte(raw), &active)
				next := make([]string, 0, len(active))
				for _, aid := range active {
					if aid != id {
						next = append(next, aid)
					}
				}
				b, _ := json.Marshal(next)
				saveOption("active_plugins", string(b), time.Now().Unix())
			}
		}

		dir := filepath.Join(extensionsDir(kind), id)
		if err := os.RemoveAll(dir); err != nil {
			util.Error(c, 500, "DELETE_FAILED", err.Error())
			return
		}
		util.Success(c, gin.H{"id": id, "deleted": true})
	}
}

// saveOption is a small helper to upsert an option row.
func saveOption(name, value string, now int64) {
	config.DB.Exec(fmt.Sprintf(
		"INSERT INTO %s (name, value, created_at, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (name) DO UPDATE SET value=$2,updated_at=$4",
		config.T("options")), name, value, now, now)
}
