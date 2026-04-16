package handler

import (
	"fmt"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

// IsInstalled reports whether the initial setup is complete.
// Criteria: core `users` table exists AND at least one admin user exists.
func IsInstalled() bool {
	if config.DB == nil {
		return false
	}
	// Check users table exists
	var tableExists bool
	err := config.DB.Get(&tableExists,
		"SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name=$1)",
		config.T("users"))
	if err != nil || !tableExists {
		return false
	}
	// Check at least one admin user
	var count int
	config.DB.Get(&count, "SELECT COUNT(*) FROM "+config.T("users")+" WHERE role='admin'")
	return count > 0
}

// InstallStatus — GET /api/v1/install/status
// Reports install state + readiness of DB/Redis/schema.
func InstallStatus(c *gin.Context) {
	dbOK := config.DB != nil
	var schemaOK bool
	if dbOK {
		config.DB.Get(&schemaOK,
			"SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name=$1)",
			config.T("users"))
	}
	var adminCount int
	if schemaOK {
		config.DB.Get(&adminCount, "SELECT COUNT(*) FROM "+config.T("users")+" WHERE role='admin'")
	}
	installed := dbOK && schemaOK && adminCount > 0

	util.Success(c, gin.H{
		"installed": installed,
		"checks": gin.H{
			"database":    dbOK,
			"schema":      schemaOK,
			"admin_count": adminCount,
		},
		"version": "1.0.0",
	})
}

// InstallCreateAdmin — POST /api/v1/install/create-admin
// Creates the first admin user. Refuses if already installed.
func InstallCreateAdmin(c *gin.Context) {
	if IsInstalled() {
		util.Error(c, 403, "ALREADY_INSTALLED", "系统已完成安装")
		return
	}
	// Ensure schema is present
	var tableExists bool
	config.DB.Get(&tableExists,
		"SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name=$1)",
		config.T("users"))
	if !tableExists {
		util.Error(c, 500, "NO_SCHEMA", "数据库 schema 尚未初始化，请检查 api/schema.sql 是否存在，并重启 API 服务")
		return
	}

	var req struct {
		Username string `json:"username" binding:"required"`
		Email    string `json:"email" binding:"required"`
		Password string `json:"password" binding:"required"`
		Nickname string `json:"nickname"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "用户名、邮箱、密码为必填项")
		return
	}
	req.Username = strings.TrimSpace(req.Username)
	req.Email = strings.TrimSpace(req.Email)
	if len(req.Password) < 6 {
		util.BadRequest(c, "密码长度至少 6 位")
		return
	}
	if !strings.Contains(req.Email, "@") {
		util.BadRequest(c, "邮箱格式不正确")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		util.Error(c, 500, "HASH_ERROR", "密码加密失败")
		return
	}

	nickname := req.Nickname
	if nickname == "" {
		nickname = req.Username
	}
	now := time.Now().Unix()

	var id int
	err = config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (username, email, password, nickname, role, status, created_at, updated_at) VALUES ($1,$2,$3,$4,'admin','active',$5,$5) RETURNING id",
		config.T("users")),
		req.Username, req.Email, string(hash), nickname, now,
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "duplicate") || strings.Contains(err.Error(), "unique") {
			util.Error(c, 400, "DUPLICATE", "用户名或邮箱已存在")
			return
		}
		util.Error(c, 500, "CREATE_ERROR", "创建管理员失败: "+err.Error())
		return
	}

	util.Success(c, gin.H{"id": id, "username": req.Username})
}

// InstallFinish — POST /api/v1/install/finish
// Saves site basics (title, url, description). Called after admin creation.
// Also writes a marker option to explicitly record install time.
func InstallFinish(c *gin.Context) {
	if !IsInstalled() {
		util.Error(c, 400, "NO_ADMIN", "请先创建管理员账号")
		return
	}

	var req struct {
		SiteTitle   string `json:"site_title"`
		SiteURL     string `json:"site_url"`
		Description string `json:"description"`
	}
	c.ShouldBindJSON(&req)

	now := time.Now().Unix()
	opts := map[string]string{
		"site_title":       strings.TrimSpace(req.SiteTitle),
		"site_url":         strings.TrimSpace(req.SiteURL),
		"site_description": strings.TrimSpace(req.Description),
		"installed_at":     fmt.Sprintf("%d", now),
	}
	for k, v := range opts {
		if v == "" && k != "installed_at" {
			continue
		}
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (name, value, created_at, updated_at) VALUES ($1,$2,$3,$4) ON CONFLICT (name) DO UPDATE SET value=$2, updated_at=$4",
			config.T("options")), k, v, now, now)
	}

	util.Success(c, nil)
}
