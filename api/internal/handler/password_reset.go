// Forgot-password / reset-password flow.
//
// Routes (registered in main.go):
//   POST /api/v1/auth/forgot-password  { email }
//        Generates a one-time token, stores it on the user row with a
//        1-hour expiry, sends the password_reset email template. To
//        avoid email enumeration the response is the same regardless
//        of whether the address exists.
//
//   POST /api/v1/auth/reset-password   { token, new_password }
//        Validates the token (still active and not expired), bcrypts
//        the new password, clears the token row in the same UPDATE.
//
// DB columns added by InitDB() (idempotent ADD COLUMN IF NOT EXISTS):
//   reset_token              VARCHAR(64)  hex of 32 random bytes
//   reset_token_expires_at   BIGINT       unix seconds; 0 means none
package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"strings"
	"time"

	"utterlog-go/config"
	"utterlog-go/internal/email"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
)

const passwordResetTTLMinutes = 60

// ForgotPassword starts the reset flow. Always returns the same
// "if the email exists, a link was sent" message — never confirm or
// deny that a given email is registered.
func ForgotPassword(c *gin.Context) {
	var req struct {
		Email string `json:"email" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Email) == "" {
		util.BadRequest(c, "请填写邮箱")
		return
	}
	emailAddr := strings.TrimSpace(req.Email)

	// Lookup is best-effort. Any error (user not found, etc.) is
	// swallowed so the response time and shape stay constant. Status
	// (active / banned / etc.) is not gated here — Login() will reject
	// the credentials anyway if the account is disabled, so leaking
	// "this email is registered" via differential timing here would
	// be silly.
	user, _ := model.UserByEmail(emailAddr)
	if user != nil {
		token, err := newResetToken()
		if err == nil {
			expires := time.Now().Add(passwordResetTTLMinutes * time.Minute).Unix()
			now := time.Now().Unix()
			_, err := config.DB.Exec(fmt.Sprintf(
				"UPDATE %s SET reset_token=$1, reset_token_expires_at=$2, updated_at=$3 WHERE id=$4",
				config.T("users"),
			), token, expires, now, user.ID)
			if err == nil {
				go sendPasswordResetEmail(user, token)
			} else {
				log.Printf("[forgot-password] DB update failed for user %d: %v", user.ID, err)
			}
		} else {
			log.Printf("[forgot-password] random token generation failed: %v", err)
		}
	} else if user == nil {
		log.Printf("[forgot-password] no active user for email=%s (response still success to avoid enumeration)", emailAddr)
	}

	util.Success(c, gin.H{
		"message": fmt.Sprintf(
			"如果该邮箱已注册，重置链接已发送，请查收（含垃圾箱）。链接 %d 分钟内有效。",
			passwordResetTTLMinutes,
		),
	})
}

// ResetPassword validates the token, bcrypts the new password, and
// clears the token in the same UPDATE so the link can't be reused.
func ResetPassword(c *gin.Context) {
	var req struct {
		Token       string `json:"token" binding:"required"`
		NewPassword string `json:"new_password" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "请求参数缺失")
		return
	}
	if len(req.NewPassword) < 6 {
		util.BadRequest(c, "新密码至少 6 位")
		return
	}

	var u struct {
		ID                  int   `db:"id"`
		ResetTokenExpiresAt int64 `db:"reset_token_expires_at"`
	}
	err := config.DB.Get(&u, fmt.Sprintf(
		"SELECT id, reset_token_expires_at FROM %s WHERE reset_token=$1 LIMIT 1",
		config.T("users"),
	), req.Token)
	if err != nil || u.ID == 0 {
		util.Error(c, 400, "INVALID_TOKEN", "重置链接无效或已使用，请重新申请")
		return
	}
	if time.Now().Unix() > u.ResetTokenExpiresAt {
		util.Error(c, 400, "EXPIRED", "重置链接已过期，请重新申请")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		util.Error(c, 500, "HASH_ERROR", "密码加密失败")
		return
	}

	now := time.Now().Unix()
	_, err = config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET password=$1, reset_token='', reset_token_expires_at=0, updated_at=$2 WHERE id=$3",
		config.T("users"),
	), string(hash), now, u.ID)
	if err != nil {
		util.Error(c, 500, "UPDATE_FAILED", "密码更新失败")
		return
	}

	log.Printf("[reset-password] user id=%d password reset successful", u.ID)
	util.Success(c, gin.H{"message": "密码已重置，请用新密码登录"})
}

// newResetToken returns 64 hex chars sourced from crypto/rand. Using
// rand.Read so we surface entropy errors rather than silently weaken
// the token (math/rand would be unsafe).
func newResetToken() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

func sendPasswordResetEmail(user *model.User, token string) {
	site := email.LoadSiteData()
	resetURL := strings.TrimRight(site.URL, "/") + "/admin/reset-password?token=" + token

	body, rerr := email.Render("password_reset", email.PasswordResetData{
		Site:       site,
		UserName:   user.NicknameStr(),
		ResetURL:   resetURL,
		ExpireMins: passwordResetTTLMinutes,
	})
	if rerr != nil {
		log.Printf("[reset-password] render template failed: %v", rerr)
		return
	}

	provider := model.GetOption("email_provider")
	if provider == "" {
		provider = "smtp"
	}
	cfg := util.EmailConfig{
		Provider:        provider,
		Host:            model.GetOption("smtp_host"),
		Port:            model.GetOption("smtp_port"),
		User:            model.GetOption("smtp_user"),
		Pass:            model.GetOption("smtp_pass"),
		Encryption:      model.GetOption("smtp_encryption"),
		From:            model.GetOption("email_from"),
		FromName:        model.GetOption("email_from_name"),
		ResendAPIKey:    model.GetOption("resend_api_key"),
		SendflareAPIKey: model.GetOption("sendflare_api_key"),
	}

	subject := fmt.Sprintf("🔐 %s 密码重置链接", site.Title)
	if err := util.SendEmail(cfg, user.Email, subject, body); err != nil {
		log.Printf("[reset-password] send email failed (provider=%s to=%s): %v", provider, user.Email, err)
	}
}
