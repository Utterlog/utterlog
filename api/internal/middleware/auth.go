package middleware

import (
	"net/http"
	"strings"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

func Auth() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			util.Unauthorized(c, "缺少认证信息")
			c.Abort()
			return
		}
		parts := strings.SplitN(header, " ", 2)
		if len(parts) != 2 || parts[0] != "Bearer" {
			util.Unauthorized(c, "认证格式错误")
			c.Abort()
			return
		}
		userID, err := util.GetUserIDFromToken(parts[1])
		if err != nil || userID == 0 {
			util.Error(c, http.StatusUnauthorized, "UNAUTHORIZED", "Token 无效或已过期")
			c.Abort()
			return
		}
		c.Set("user_id", userID)
		c.Next()
	}
}

// OptionalAuth tries to extract user but doesn't block if missing
func OptionalAuth() gin.HandlerFunc {
	return func(c *gin.Context) {
		header := c.GetHeader("Authorization")
		if header == "" {
			c.Next()
			return
		}
		parts := strings.SplitN(header, " ", 2)
		if len(parts) == 2 && parts[0] == "Bearer" {
			if userID, err := util.GetUserIDFromToken(parts[1]); err == nil && userID > 0 {
				c.Set("user_id", userID)
			}
		}
		c.Next()
	}
}

func GetUserID(c *gin.Context) int {
	id, _ := c.Get("user_id")
	if v, ok := id.(int); ok {
		return v
	}
	return 0
}
