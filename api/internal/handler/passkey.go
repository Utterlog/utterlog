package handler

import (
	"encoding/binary"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
	"github.com/go-webauthn/webauthn/webauthn"
	"github.com/google/uuid"
)

// Cached per-origin instance. The library itself is thread-safe once
// constructed, so re-using one instance while the site URL is stable is
// fine — but if the admin switches site_url (e.g. attaching a new
// domain in the install wizard) we need to rebuild, otherwise every
// browser would keep getting "Error validating origin" because the
// cached RPID / RPOrigin still point at the old URL.
var (
	webAuthnInstance *webauthn.WebAuthn
	webAuthnOrigin   string
)

func getWebAuthn() (*webauthn.WebAuthn, error) {
	// Source of truth: the same helper every other handler uses to
	// build user-facing URLs — ul_options.site_url first, then
	// config.C.AppURL. Before this, we queried a non-existent
	// `app_url` option and silently fell back to
	// `http://localhost:3000`, which never matches the browser's
	// real origin → "Error validating origin" on every passkey
	// register / login attempt.
	appURL := strings.TrimRight(strings.TrimSpace(config.PublicBaseURL()), "/")
	if appURL == "" {
		appURL = "http://localhost:8080"
	}

	if webAuthnInstance != nil && webAuthnOrigin == appURL {
		return webAuthnInstance, nil
	}

	parsed, err := url.Parse(appURL)
	if err != nil {
		return nil, err
	}

	var siteName string
	config.DB.Get(&siteName, fmt.Sprintf("SELECT COALESCE(value,'Utterlog') FROM %s WHERE name='site_title'", config.T("options")))
	if siteName == "" {
		siteName = "Utterlog"
	}

	inst, err := webauthn.New(&webauthn.Config{
		RPID:          parsed.Hostname(),
		RPDisplayName: siteName,
		RPOrigins:     []string{appURL},
	})
	if err != nil {
		return nil, err
	}
	webAuthnInstance = inst
	webAuthnOrigin = appURL
	return inst, nil
}

// webauthnUser wraps model.User to implement webauthn.User interface
type webauthnUser struct {
	*model.User
	credentials []webauthn.Credential
}

func (u *webauthnUser) WebAuthnID() []byte {
	b := make([]byte, 8)
	binary.BigEndian.PutUint64(b, uint64(u.ID))
	return b
}

func (u *webauthnUser) WebAuthnName() string {
	return u.Email
}

func (u *webauthnUser) WebAuthnDisplayName() string {
	return u.NicknameStr()
}

func (u *webauthnUser) WebAuthnCredentials() []webauthn.Credential {
	return u.credentials
}

func loadUserCredentials(userID int) []webauthn.Credential {
	t := config.T("passkeys")
	var rows []struct {
		CredentialID    []byte `db:"credential_id"`
		PublicKey       []byte `db:"public_key"`
		AttestationType string `db:"attestation_type"`
		AAGUID          []byte `db:"aaguid"`
		SignCount       uint32 `db:"sign_count"`
		BackupEligible  bool   `db:"backup_eligible"`
		BackupState     bool   `db:"backup_state"`
	}
	config.DB.Select(&rows, fmt.Sprintf("SELECT credential_id, public_key, attestation_type, aaguid, sign_count, backup_eligible, backup_state FROM %s WHERE user_id = $1", t), userID)

	creds := make([]webauthn.Credential, len(rows))
	for i, r := range rows {
		aaguid := make([]byte, 16)
		copy(aaguid, r.AAGUID)
		creds[i] = webauthn.Credential{
			ID:              r.CredentialID,
			PublicKey:       r.PublicKey,
			AttestationType: r.AttestationType,
			Flags: webauthn.CredentialFlags{
				BackupEligible: r.BackupEligible,
				BackupState:    r.BackupState,
			},
			Authenticator: webauthn.Authenticator{
				AAGUID:    aaguid,
				SignCount: r.SignCount,
			},
		}
	}
	return creds
}

// In-memory fallback for WebAuthn sessions when Redis is unavailable
var webauthnMemStore = newMemTTLStore()

type memTTLStore struct {
	mu    sync.RWMutex
	items map[string]memTTLItem
}

type memTTLItem struct {
	data      []byte
	expiresAt time.Time
}

func newMemTTLStore() *memTTLStore {
	s := &memTTLStore{items: make(map[string]memTTLItem)}
	go func() {
		for range time.Tick(time.Minute) {
			now := time.Now()
			s.mu.Lock()
			for k, v := range s.items {
				if now.After(v.expiresAt) {
					delete(s.items, k)
				}
			}
			s.mu.Unlock()
		}
	}()
	return s
}

// Store session in Redis, fallback to memory
func storeWebAuthnSession(sessionID string, data *webauthn.SessionData) error {
	j, err := json.Marshal(data)
	if err != nil {
		return err
	}
	if config.RDB != nil {
		return config.RDB.Set(config.Ctx, "webauthn:"+sessionID, j, 5*time.Minute).Err()
	}
	webauthnMemStore.mu.Lock()
	webauthnMemStore.items[sessionID] = memTTLItem{data: j, expiresAt: time.Now().Add(5 * time.Minute)}
	webauthnMemStore.mu.Unlock()
	return nil
}

func loadWebAuthnSession(sessionID string) (*webauthn.SessionData, error) {
	var raw []byte

	if config.RDB != nil {
		val, err := config.RDB.Get(config.Ctx, "webauthn:"+sessionID).Result()
		if err != nil {
			return nil, err
		}
		config.RDB.Del(config.Ctx, "webauthn:"+sessionID)
		raw = []byte(val)
	} else {
		webauthnMemStore.mu.Lock()
		item, ok := webauthnMemStore.items[sessionID]
		if !ok || time.Now().After(item.expiresAt) {
			webauthnMemStore.mu.Unlock()
			return nil, fmt.Errorf("session not found or expired")
		}
		raw = item.data
		delete(webauthnMemStore.items, sessionID)
		webauthnMemStore.mu.Unlock()
	}

	var session webauthn.SessionData
	err := json.Unmarshal(raw, &session)
	return &session, err
}

// PasskeyRegisterBegin starts passkey registration
func PasskeyRegisterBegin(c *gin.Context) {
	wa, err := getWebAuthn()
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "WEBAUTHN_ERROR", "WebAuthn 配置错误: "+err.Error())
		return
	}

	userID := middleware.GetUserID(c)
	user, err := model.UserByID(userID)
	if err != nil {
		util.NotFound(c, "用户")
		return
	}

	wUser := &webauthnUser{User: user, credentials: loadUserCredentials(userID)}

	options, session, err := wa.BeginRegistration(wUser)
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "WEBAUTHN_ERROR", "开始注册失败: "+err.Error())
		return
	}

	sessionID := uuid.New().String()
	if err := storeWebAuthnSession(sessionID, session); err != nil {
		util.Error(c, http.StatusInternalServerError, "SESSION_ERROR", "保存会话失败")
		return
	}

	// Return options + session_id
	util.Success(c, gin.H{
		"publicKey":  options.Response,
		"session_id": sessionID,
	})
}

// PasskeyRegisterFinish completes passkey registration
func PasskeyRegisterFinish(c *gin.Context) {
	wa, err := getWebAuthn()
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "WEBAUTHN_ERROR", "WebAuthn 配置错误")
		return
	}

	sessionID := c.GetHeader("X-WebAuthn-Session")
	if sessionID == "" {
		// Also try from JSON body
		var peek struct{ SessionID string `json:"session_id"` }
		c.ShouldBindJSON(&peek)
		sessionID = peek.SessionID
	}

	session, err := loadWebAuthnSession(sessionID)
	if err != nil {
		util.Error(c, http.StatusBadRequest, "SESSION_EXPIRED", "会话已过期，请重试")
		return
	}

	userID := middleware.GetUserID(c)
	user, err := model.UserByID(userID)
	if err != nil {
		util.NotFound(c, "用户")
		return
	}

	wUser := &webauthnUser{User: user, credentials: loadUserCredentials(userID)}

	credential, err := wa.FinishRegistration(wUser, *session, c.Request)
	if err != nil {
		util.Error(c, http.StatusBadRequest, "REGISTRATION_FAILED", "注册失败: "+err.Error())
		return
	}

	// Get passkey name from query or header
	name := c.Query("name")
	if name == "" {
		name = c.GetHeader("X-Passkey-Name")
	}
	if name == "" {
		name = "通行密钥"
	}

	// Store credential
	t := config.T("passkeys")
	aaguid := credential.Authenticator.AAGUID[:]
	config.DB.Exec(fmt.Sprintf(
		"INSERT INTO %s (user_id, credential_id, public_key, attestation_type, aaguid, sign_count, backup_eligible, backup_state, name, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
		t), userID, credential.ID, credential.PublicKey, credential.AttestationType, aaguid, credential.Authenticator.SignCount, credential.Flags.BackupEligible, credential.Flags.BackupState, name, time.Now().Unix())

	util.Success(c, gin.H{"ok": true, "name": name})
}

// PasskeyLoginBegin starts passkey authentication (no auth required)
func PasskeyLoginBegin(c *gin.Context) {
	wa, err := getWebAuthn()
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "WEBAUTHN_ERROR", "WebAuthn 配置错误")
		return
	}

	// Find admin user (single-user blog)
	user, err := model.SiteOwner()
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "NO_USER", "未找到管理员")
		return
	}

	wUser := &webauthnUser{User: user, credentials: loadUserCredentials(user.ID)}
	if len(wUser.credentials) == 0 {
		util.Error(c, http.StatusBadRequest, "NO_PASSKEYS", "未注册通行密钥")
		return
	}

	options, session, err := wa.BeginLogin(wUser)
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "WEBAUTHN_ERROR", "开始认证失败: "+err.Error())
		return
	}

	sessionID := uuid.New().String()
	storeWebAuthnSession(sessionID, session)

	util.Success(c, gin.H{
		"publicKey":  options.Response,
		"session_id": sessionID,
	})
}

// PasskeyLoginFinish completes passkey authentication
func PasskeyLoginFinish(c *gin.Context) {
	wa, err := getWebAuthn()
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "WEBAUTHN_ERROR", "WebAuthn 配置错误")
		return
	}

	sessionID := c.GetHeader("X-WebAuthn-Session")
	if sessionID == "" {
		var peek struct{ SessionID string `json:"session_id"` }
		c.ShouldBindJSON(&peek)
		sessionID = peek.SessionID
	}

	session, err := loadWebAuthnSession(sessionID)
	if err != nil {
		util.Error(c, http.StatusBadRequest, "SESSION_EXPIRED", "会话已过期")
		return
	}

	user, err := model.SiteOwner()
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "NO_USER", "未找到管理员")
		return
	}

	wUser := &webauthnUser{User: user, credentials: loadUserCredentials(user.ID)}

	credential, err := wa.FinishLogin(wUser, *session, c.Request)
	if err != nil {
		util.Error(c, http.StatusUnauthorized, "AUTH_FAILED", "认证失败: "+err.Error())
		return
	}

	// Update sign count, flags + last used
	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET sign_count = $1, backup_eligible = $2, backup_state = $3, last_used_at = $4 WHERE credential_id = $5",
		config.T("passkeys")), credential.Authenticator.SignCount, credential.Flags.BackupEligible, credential.Flags.BackupState, time.Now().Unix(), credential.ID)

	// Issue tokens (bypass 2FA since passkey is already strong auth)
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

// PasskeyAvailable reports whether ANY passkey is registered system-wide
// (public, unauth). Used by the login page to decide whether to show the
// "use passkey" button — hides it when nothing is registered to avoid a
// dead option.
func PasskeyAvailable(c *gin.Context) {
	var exists bool
	config.DB.Get(&exists, fmt.Sprintf("SELECT EXISTS(SELECT 1 FROM %s)", config.T("passkeys")))
	util.Success(c, gin.H{"available": exists})
}

// ListPasskeys returns registered passkeys for the authenticated user
func ListPasskeys(c *gin.Context) {
	userID := middleware.GetUserID(c)
	t := config.T("passkeys")

	type passkey struct {
		ID         int    `db:"id" json:"id"`
		Name       string `db:"name" json:"name"`
		LastUsedAt int64  `db:"last_used_at" json:"last_used_at"`
		CreatedAt  int64  `db:"created_at" json:"created_at"`
	}

	var keys []passkey
	config.DB.Select(&keys, fmt.Sprintf("SELECT id, name, last_used_at, created_at FROM %s WHERE user_id = $1 ORDER BY created_at DESC", t), userID)
	if keys == nil {
		keys = []passkey{}
	}

	util.Success(c, keys)
}

// DeletePasskey removes a passkey
func DeletePasskey(c *gin.Context) {
	userID := middleware.GetUserID(c)
	id, _ := strconv.Atoi(c.Param("id"))
	if id == 0 {
		util.BadRequest(c, "无效 ID")
		return
	}

	t := config.T("passkeys")
	result, _ := config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE id = $1 AND user_id = $2", t), id, userID)
	if rows, _ := result.RowsAffected(); rows == 0 {
		util.NotFound(c, "通行密钥")
		return
	}

	// Reset WebAuthn instance to refresh config
	webAuthnInstance = nil

	util.Success(c, gin.H{"ok": true})
}
