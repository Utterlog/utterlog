package config

import (
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	Port      string
	DBDriver  string
	DBHost    string
	DBPort    string
	DBName    string
	DBUser    string
	DBPass    string
	DBPrefix  string
	RedisAddr string
	RedisPass string
	RedisDB   int
	JWTSecret string
	JWTTTL    int // access token TTL in seconds
	AppURL    string
}

var C Config

func Load() {
	godotenv.Load()

	C = Config{
		Port:      getEnv("PORT", "8080"),
		DBDriver:  getEnv("DB_DRIVER", "pgsql"),
		DBHost:    getEnv("DB_HOST", "localhost"),
		DBPort:    getEnv("DB_PORT", "5432"),
		DBName:    getEnv("DB_NAME", "utterlog"),
		DBUser:    getEnv("DB_USER", ""),
		DBPass:    getEnv("DB_PASSWORD", ""),
		DBPrefix:  getEnv("DB_PREFIX", "ul_"),
		RedisAddr: getEnv("REDIS_HOST", "127.0.0.1") + ":" + getEnv("REDIS_PORT", "6379"),
		RedisPass: getEnv("REDIS_PASSWORD", ""),
		JWTSecret: getEnv("JWT_SECRET", "change-this-secret-key"),
		JWTTTL:    86400,
		AppURL:    getEnv("APP_URL", "http://localhost:8080"),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
