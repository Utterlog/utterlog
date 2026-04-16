package handler

import (
	"net/http"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

type loginReq struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

func Login(c *gin.Context) {
	var req loginReq
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "邮箱和密码不能为空")
		return
	}

	user, err := model.UserByEmail(req.Email)
	if err != nil || !util.CheckPassword(req.Password, user.Password) {
		util.Error(c, http.StatusUnauthorized, "INVALID_CREDENTIALS", "用户名或密码错误")
		return
	}

	// Check if 2FA is enabled
	if user.TOTPEnabled {
		tempToken, err := Generate2FATempToken(user.ID)
		if err != nil {
			util.Error(c, http.StatusInternalServerError, "TOKEN_ERROR", "生成临时 Token 失败")
			return
		}
		util.Success(c, gin.H{
			"require_2fa": true,
			"temp_token":  tempToken,
		})
		return
	}

	tokenData := util.TokenData{
		Username: user.Username,
		Email:    user.Email,
		Role:     user.Role,
		Nickname: user.NicknameStr(),
	}
	accessToken, expiresAt, err := util.GenerateAccessToken(user.ID, tokenData)
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "TOKEN_ERROR", "生成 Token 失败")
		return
	}

	refreshToken, err := util.GenerateRefreshToken(user.ID)
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "TOKEN_ERROR", "生成 Token 失败")
		return
	}

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
			"avatar":   resolveDisplayAvatar(user.Email),
			"role":     user.Role,
		},
	})
}

func Me(c *gin.Context) {
	userID := middleware.GetUserID(c)
	user, err := model.UserByID(userID)
	if err != nil {
		util.NotFound(c, "用户")
		return
	}
	util.Success(c, gin.H{
		"id":       user.ID,
		"username": user.Username,
		"email":    user.Email,
		"nickname": user.NicknameStr(),
		"avatar":   resolveDisplayAvatar(user.Email),
		"role":     user.Role,
	})
}

func Refresh(c *gin.Context) {
	var req struct {
		RefreshToken string `json:"refresh_token" binding:"required"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "refresh_token 不能为空")
		return
	}

	userID, err := util.GetUserIDFromToken(req.RefreshToken)
	if err != nil || userID == 0 {
		util.Unauthorized(c, "Refresh Token 无效")
		return
	}

	user, err := model.UserByID(userID)
	if err != nil {
		util.Unauthorized(c, "用户不存在")
		return
	}

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
	})
}

func Logout(c *gin.Context) {
	util.Success(c, nil)
}
