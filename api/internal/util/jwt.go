package util

import (
	"fmt"
	"time"
	"utterlog-go/config"

	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
)

type TokenClaims struct {
	jwt.RegisteredClaims
	Type string    `json:"type"`
	Data TokenData `json:"data,omitempty"`
}

type TokenData struct {
	Username string `json:"username"`
	Email    string `json:"email"`
	Role     string `json:"role"`
	Nickname string `json:"nickname"`
}

func GenerateAccessToken(userID int, data TokenData) (string, int64, error) {
	ttl := config.C.JWTTTL
	exp := time.Now().Add(time.Duration(ttl) * time.Second)
	claims := TokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "utterlog-api",
			Audience:  jwt.ClaimStrings{"utterlog-client"},
			Subject:   intToStr(userID),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(exp),
			ID:        uuid.New().String(),
		},
		Type: "access",
		Data: data,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	signed, err := token.SignedString([]byte(config.C.JWTSecret))
	return signed, exp.Unix(), err
}

func GenerateRefreshToken(userID int) (string, error) {
	exp := time.Now().Add(30 * 24 * time.Hour) // 30 days
	claims := jwt.RegisteredClaims{
		Issuer:    "utterlog-api",
		Subject:   intToStr(userID),
		IssuedAt:  jwt.NewNumericDate(time.Now()),
		ExpiresAt: jwt.NewNumericDate(exp),
		ID:        uuid.New().String(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.C.JWTSecret))
}

func ValidateToken(tokenStr string) (*TokenClaims, error) {
	token, err := jwt.ParseWithClaims(tokenStr, &TokenClaims{}, func(t *jwt.Token) (interface{}, error) {
		return []byte(config.C.JWTSecret), nil
	})
	if err != nil {
		return nil, err
	}
	claims, ok := token.Claims.(*TokenClaims)
	if !ok || !token.Valid {
		return nil, jwt.ErrTokenNotValidYet
	}
	return claims, nil
}

func GetUserIDFromToken(tokenStr string) (int, error) {
	claims, err := ValidateToken(tokenStr)
	if err != nil {
		return 0, err
	}
	return strToInt(claims.Subject), nil
}

// GenerateShortToken creates a short-lived token with custom type
func GenerateShortToken(userID int, tokenType string, ttl time.Duration) (string, error) {
	exp := time.Now().Add(ttl)
	claims := TokenClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    "utterlog-api",
			Subject:   intToStr(userID),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
			ExpiresAt: jwt.NewNumericDate(exp),
			ID:        uuid.New().String(),
		},
		Type: tokenType,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(config.C.JWTSecret))
}

func intToStr(i int) string {
	return fmt.Sprintf("%d", i)
}

func StrToInt(s string) int {
	var i int
	fmt.Sscanf(s, "%d", &i)
	return i
}

// keep unexported alias for internal use
func strToInt(s string) int {
	return StrToInt(s)
}
