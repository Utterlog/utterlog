package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
	"github.com/pquerna/otp/totp"
)

// TOTPSetup generates a new TOTP secret and returns the provisioning URI
func TOTPSetup(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := model.UserByID(userID)
	if err != nil {
		util.NotFound(c, "用户")
		return
	}

	if user.TOTPEnabled {
		util.Error(c, http.StatusBadRequest, "TOTP_ALREADY_ENABLED", "两步验证已启用")
		return
	}

	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "Utterlog",
		AccountName: user.Email,
	})
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "TOTP_ERROR", "生成密钥失败")
		return
	}

	// Store secret temporarily (not enabled yet)
	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET totp_secret = $1, updated_at = $2 WHERE id = $3",
		config.T("users")), key.Secret(), time.Now().Unix(), userID)

	util.Success(c, gin.H{
		"secret": key.Secret(),
		"uri":    key.URL(),
	})
}

// TOTPVerify validates a TOTP code and enables 2FA
func TOTPVerify(c *gin.Context) {
	var req struct {
		Code string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "验证码不能为空")
		return
	}

	userID := middleware.GetUserID(c)
	user, err := model.UserByID(userID)
	if err != nil {
		util.NotFound(c, "用户")
		return
	}

	if user.TOTPEnabled {
		util.Error(c, http.StatusBadRequest, "TOTP_ALREADY_ENABLED", "两步验证已启用")
		return
	}
	if user.TOTPSecret == "" {
		util.Error(c, http.StatusBadRequest, "TOTP_NOT_SETUP", "请先设置两步验证")
		return
	}

	if !totp.Validate(req.Code, user.TOTPSecret) {
		util.Error(c, http.StatusBadRequest, "INVALID_CODE", "验证码错误")
		return
	}

	// Generate 8 backup codes
	backupCodes := make([]string, 8)
	backupHashes := make([]string, 8)
	for i := 0; i < 8; i++ {
		code := generateBackupCode()
		backupCodes[i] = code
		hash, _ := util.HashPassword(code)
		backupHashes[i] = hash
	}
	hashesJSON, _ := json.Marshal(backupHashes)

	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET totp_enabled = true, totp_backup_codes = $1, updated_at = $2 WHERE id = $3",
		config.T("users")), string(hashesJSON), time.Now().Unix(), userID)

	util.Success(c, gin.H{
		"enabled":      true,
		"backup_codes": backupCodes,
	})
}

// TOTPDisable disables 2FA (requires password + code)
func TOTPDisable(c *gin.Context) {
	var req struct {
		Password string `json:"password" binding:"required"`
		Code     string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "密码和验证码不能为空")
		return
	}

	userID := middleware.GetUserID(c)
	user, err := model.UserByID(userID)
	if err != nil {
		util.NotFound(c, "用户")
		return
	}

	if !user.TOTPEnabled {
		util.Error(c, http.StatusBadRequest, "TOTP_NOT_ENABLED", "两步验证未启用")
		return
	}

	if !util.CheckPassword(req.Password, user.Password) {
		util.Error(c, http.StatusUnauthorized, "INVALID_PASSWORD", "密码错误")
		return
	}

	// Allow either TOTP code or backup code
	if !totp.Validate(req.Code, user.TOTPSecret) && !validateBackupCode(user, req.Code) {
		util.Error(c, http.StatusBadRequest, "INVALID_CODE", "验证码错误")
		return
	}

	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET totp_enabled = false, totp_secret = '', totp_backup_codes = '', updated_at = $1 WHERE id = $2",
		config.T("users")), time.Now().Unix(), userID)

	util.Success(c, gin.H{"enabled": false})
}

// TOTPValidate validates 2FA during login (uses temp_token)
func TOTPValidate(c *gin.Context) {
	var req struct {
		TempToken string `json:"temp_token" binding:"required"`
		Code      string `json:"code" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "temp_token 和验证码不能为空")
		return
	}

	// Validate temp token (same JWT, but type must be "2fa_pending")
	claims, err := util.ValidateToken(req.TempToken)
	if err != nil || claims.Type != "2fa_pending" {
		util.Unauthorized(c, "临时 Token 无效或已过期")
		return
	}

	userID := util.StrToInt(claims.Subject)
	user, err := model.UserByID(userID)
	if err != nil {
		util.Unauthorized(c, "用户不存在")
		return
	}

	// Validate TOTP code or backup code
	if !totp.Validate(req.Code, user.TOTPSecret) {
		if !validateBackupCode(user, req.Code) {
			util.Error(c, http.StatusBadRequest, "INVALID_CODE", "验证码错误")
			return
		}
	}

	// Issue real tokens
	tokenData := util.TokenData{
		Username: user.Username,
		Email:    user.Email,
		Role:     user.Role,
		Nickname: user.NicknameStr(),
	}
	accessToken, expiresAt, _ := util.GenerateAccessToken(user.ID, tokenData)
	refreshToken, _ := util.GenerateRefreshToken(user.ID)

	util.Success(c, gin.H{
		"access_token":  accessToken,
		"refresh_token": refreshToken,
		"expires_in":    86400,
		"expires_at":    expiresAt,
		"token_type":    "Bearer",
		"user": gin.H{
			"id":       user.ID,
			"username": user.Username,
			"email":    user.Email,
			"nickname": user.NicknameStr(),
			"avatar":   user.AvatarURL(),
			"role":     user.Role,
		},
	})
}

// Generate2FATempToken creates a short-lived token for 2FA validation
func Generate2FATempToken(userID int) (string, error) {
	return util.GenerateShortToken(userID, "2fa_pending", 5*time.Minute)
}

func generateBackupCode() string {
	b := make([]byte, 5)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func validateBackupCode(user *model.User, code string) bool {
	if user.TOTPBackupCodes == "" {
		return false
	}

	var hashes []string
	if err := json.Unmarshal([]byte(user.TOTPBackupCodes), &hashes); err != nil {
		return false
	}

	for i, hash := range hashes {
		if util.CheckPassword(code, hash) {
			// Remove used backup code
			hashes = append(hashes[:i], hashes[i+1:]...)
			updated, _ := json.Marshal(hashes)
			config.DB.Exec(fmt.Sprintf(
				"UPDATE %s SET totp_backup_codes = $1, updated_at = $2 WHERE id = $3",
				config.T("users")), string(updated), time.Now().Unix(), user.ID)
			return true
		}
	}
	return false
}
