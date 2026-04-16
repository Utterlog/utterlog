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
	// Storage
	StorageDriver string // "local" or "s3"
	S3Endpoint    string
	S3Bucket      string
	S3AccessKey   string
	S3SecretKey   string
	S3Region      string
	S3PublicURL   string // CDN public URL prefix
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
		JWTSecret:     getEnv("JWT_SECRET", "change-this-secret-key"),
		JWTTTL:        86400,
		AppURL:        getEnv("APP_URL", "http://localhost:8080"),
		StorageDriver: getEnv("STORAGE_DRIVER", "local"),
		S3Endpoint:    getEnv("S3_ENDPOINT", ""),
		S3Bucket:      getEnv("S3_BUCKET", ""),
		S3AccessKey:   getEnv("S3_ACCESS_KEY", ""),
		S3SecretKey:   getEnv("S3_SECRET_KEY", ""),
		S3Region:      getEnv("S3_REGION", "auto"),
		S3PublicURL:   getEnv("S3_PUBLIC_URL", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
