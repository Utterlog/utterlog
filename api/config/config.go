package config

import (
	"bufio"
	"os"
	"strconv"
	"strings"
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
	// Merge .env into os env: non-empty values override, empty keys are
	// left to whatever docker-compose already injected. This lets the
	// installer-written .env take priority while still allowing the
	// compose defaults (DB_USER=utterlog, etc.) to work when .env is
	// freshly initialized with blank values.
	loadEnvFile(".env")

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
		RedisDB:   func() int { n, _ := strconv.Atoi(getEnv("REDIS_DB", "0")); return n }(),
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

// loadEnvFile parses a KEY=VALUE file and exports non-empty values into
// os env, leaving already-set env vars alone when the file's value is
// empty. This is the critical difference vs godotenv.Overload — it lets
// a blank DB_USER= line in .env fall through to compose's default
// instead of wiping it out.
func loadEnvFile(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	s := bufio.NewScanner(f)
	for s.Scan() {
		line := strings.TrimSpace(s.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eq := strings.Index(line, "=")
		if eq < 0 {
			continue
		}
		key := strings.TrimSpace(line[:eq])
		val := strings.TrimSpace(line[eq+1:])
		if len(val) >= 2 {
			first, last := val[0], val[len(val)-1]
			if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
				val = val[1 : len(val)-1]
			}
		}
		if val == "" {
			continue
		}
		os.Setenv(key, val)
	}
}
