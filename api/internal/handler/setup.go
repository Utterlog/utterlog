package handler

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"net/http"
	"os"
	"sort"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
	"github.com/redis/go-redis/v9"
)

// The setup wizard runs BEFORE the main DB/Redis connections are ready.
// It exposes a minimal surface:
//   GET  /api/v1/setup/status      — can frontend show wizard?
//   POST /api/v1/setup/test-db     — try a DB connection, don't persist
//   POST /api/v1/setup/test-redis  — try Redis, scan for free DB numbers
//   POST /api/v1/setup/save        — write .env then os.Exit(0) → docker
//                                    restart policy reloads the container
//                                    with the new config.

// ========== Status ==========

// SetupStatus reports whether the wizard is needed. The frontend calls this
// on load; if configured=false it routes to /admin/setup instead of the
// regular login / dashboard.
func SetupStatus(c *gin.Context) {
	envPath := findEnvPath()
	_, envErr := os.Stat(envPath)

	dbOK := config.DB != nil
	redisOK := config.RDB != nil

	// configured = env file present AND DB connection alive. Without DB we
	// can't even check if the install is "finished", so configured implies
	// the server is running normally.
	configured := envErr == nil && dbOK

	// Pre-fill values for the install wizard. These come from whatever
	// is currently in the env (compose defaults, or a random password
	// written by scripts/deploy.sh). The frontend uses them so the user
	// doesn't have to type anything on a clean docker-compose deploy.
	redisHost, redisPort := "127.0.0.1", "6379"
	if addr := config.C.RedisAddr; addr != "" {
		if i := strings.LastIndex(addr, ":"); i > 0 {
			redisHost, redisPort = addr[:i], addr[i+1:]
		}
	}

	util.Success(c, gin.H{
		"configured":  configured,
		"db_ok":       dbOK,
		"redis_ok":    redisOK,
		"env_exists":  envErr == nil,
		"env_path":    envPath,
		"defaults": gin.H{
			"db_host":        config.C.DBHost,
			"db_port":        config.C.DBPort,
			"db_name":        config.C.DBName,
			"db_user":        config.C.DBUser,
			"db_password":    config.C.DBPass,
			"db_prefix":      config.C.DBPrefix,
			"redis_host":     redisHost,
			"redis_port":     redisPort,
			"redis_password": config.C.RedisPass,
			"redis_db":       config.C.RedisDB,
		},
	})
}

// ========== Test DB ==========

type dbTestReq struct {
	Host     string `json:"host" binding:"required"`
	Port     string `json:"port"`
	User     string `json:"user" binding:"required"`
	Password string `json:"password"`
	DBName   string `json:"db_name" binding:"required"`
}

// TestDBConnection opens a short-lived connection with caller-provided
// credentials. Never persists anything; the answer tells the frontend
// whether the config is usable before save.
func TestDBConnection(c *gin.Context) {
	var req dbTestReq
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "缺少必填字段 (host, user, db_name)")
		return
	}
	if req.Port == "" {
		req.Port = "5432"
	}

	var dsn string
	if req.Password != "" {
		dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable connect_timeout=5",
			req.Host, req.Port, req.User, req.Password, req.DBName)
	} else {
		dsn = fmt.Sprintf("host=%s port=%s user=%s dbname=%s sslmode=disable connect_timeout=5",
			req.Host, req.Port, req.User, req.DBName)
	}

	db, err := sqlx.Connect("postgres", dsn)
	if err != nil {
		util.Success(c, gin.H{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}
	defer db.Close()

	// Inspect: does the schema already have our tables? Lets the frontend
	// warn "此库已有 utterlog 数据" so user doesn't accidentally overwrite.
	var hasExisting bool
	prefix := config.C.DBPrefix
	if prefix == "" {
		prefix = "ul_"
	}
	db.Get(&hasExisting,
		"SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name = $1)",
		prefix+"users")

	// Grab server version + address so the UI can show a confirmation card.
	var versionFull string
	db.Get(&versionFull, "SHOW server_version")
	var serverAddr string
	db.Get(&serverAddr, "SELECT COALESCE(inet_server_addr()::text, '')")

	// Short version (e.g. "18.1" from "18.1 (Debian 18.1-1.pgdg13+1)")
	versionShort := strings.SplitN(strings.TrimSpace(versionFull), " ", 2)[0]

	util.Success(c, gin.H{
		"ok":                  true,
		"has_utterlog_tables": hasExisting,
		"version":             versionShort,
		"version_full":        versionFull,
		"server_addr":         serverAddr,
		"address":             req.Host + ":" + req.Port,
		"deployment":          detectDBDeployment(req.Host, serverAddr),
	})
}

// detectDBDeployment returns "docker" when the target host looks like a
// docker-compose service (service name, container name, or a bridge-
// network IP) and "external" otherwise. Purely heuristic — for the
// install UI's "Docker 内置 vs 独立安装" label.
func detectDBDeployment(host, serverAddr string) string {
	h := strings.ToLower(strings.TrimSpace(host))
	dockerServiceHosts := map[string]bool{
		"postgres": true, "pgsql": true, "db": true, "database": true,
	}
	if dockerServiceHosts[h] {
		return "docker"
	}
	// IP in docker's default bridge range (172.16.0.0/12). Covers most
	// compose setups where the caller connected via localhost but the
	// server itself reports a bridge IP.
	if strings.HasPrefix(serverAddr, "172.") {
		parts := strings.Split(serverAddr, ".")
		if len(parts) >= 2 {
			if n, err := strconv.Atoi(parts[1]); err == nil && n >= 16 && n <= 31 {
				return "docker"
			}
		}
	}
	return "external"
}

// ========== Test Redis ==========

type redisTestReq struct {
	Host     string `json:"host" binding:"required"`
	Port     string `json:"port"`
	Password string `json:"password"`
	DB       int    `json:"db"`
}

// TestRedisConnection pings Redis and runs INFO keyspace to discover which
// DB numbers already hold data, so the UI can suggest an empty one. Doesn't
// persist config.
func TestRedisConnection(c *gin.Context) {
	var req redisTestReq
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "缺少必填字段 (host)")
		return
	}
	if req.Port == "" {
		req.Port = "6379"
	}

	client := redis.NewClient(&redis.Options{
		Addr:        req.Host + ":" + req.Port,
		Password:    req.Password,
		DB:          req.DB,
		DialTimeout: 5 * time.Second,
	})
	defer client.Close()

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		util.Success(c, gin.H{
			"ok":    false,
			"error": err.Error(),
		})
		return
	}

	// Parse INFO keyspace output, e.g.:
	//   db0:keys=123,expires=1,avg_ttl=0
	//   db2:keys=5,expires=0,avg_ttl=0
	info, _ := client.Info(ctx, "keyspace").Result()
	usedDBs := []int{}
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimSpace(line)
		if strings.HasPrefix(line, "db") {
			colon := strings.Index(line, ":")
			if colon > 2 {
				if n, err := strconv.Atoi(line[2:colon]); err == nil {
					usedDBs = append(usedDBs, n)
				}
			}
		}
	}
	sort.Ints(usedDBs)

	// Recommend the lowest DB number (0-15) not currently in the used set.
	recommended := 0
	used := make(map[int]bool, len(usedDBs))
	for _, n := range usedDBs {
		used[n] = true
	}
	for i := 0; i < 16; i++ {
		if !used[i] {
			recommended = i
			break
		}
	}

	// Server info — redis_version / os from INFO server
	serverInfo, _ := client.Info(ctx, "server").Result()
	redisVersion := parseInfoField(serverInfo, "redis_version")
	redisMode := parseInfoField(serverInfo, "redis_mode")

	util.Success(c, gin.H{
		"ok":          true,
		"used_dbs":    usedDBs,
		"recommended": recommended,
		"version":     redisVersion,
		"mode":        redisMode,
		"address":     req.Host + ":" + req.Port,
		"deployment":  detectRedisDeployment(req.Host),
	})
}

// parseInfoField extracts a single KEY:VALUE pair from a redis INFO
// section output. Returns "" if not found.
func parseInfoField(info, key string) string {
	prefix := key + ":"
	for _, line := range strings.Split(info, "\n") {
		line = strings.TrimRight(line, "\r")
		if strings.HasPrefix(line, prefix) {
			return strings.TrimSpace(line[len(prefix):])
		}
	}
	return ""
}

// detectRedisDeployment mirrors the DB heuristic for the Redis host.
func detectRedisDeployment(host string) string {
	h := strings.ToLower(strings.TrimSpace(host))
	if h == "redis" || h == "cache" || h == "kv" {
		return "docker"
	}
	return "external"
}

// ========== Save Config ==========

type saveReq struct {
	DB struct {
		Host     string `json:"host"`
		Port     string `json:"port"`
		User     string `json:"user"`
		Password string `json:"password"`
		DBName   string `json:"db_name"`
		Prefix   string `json:"prefix"`
	} `json:"db"`
	Redis struct {
		Host     string `json:"host"`
		Port     string `json:"port"`
		Password string `json:"password"`
		DB       int    `json:"db"`
	} `json:"redis"`
	Site struct {
		URL       string `json:"url"`
		JWTSecret string `json:"jwt_secret"`
	} `json:"site"`
}

// SaveSetupConfig writes the merged config to .env and quits so docker's
// restart policy brings up a fresh process that picks up the new env. The
// frontend shows a "waiting for restart" screen, polls /setup/status until
// configured=true, then navigates to the /install admin-creation wizard.
func SaveSetupConfig(c *gin.Context) {
	var req saveReq
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "请求格式错误")
		return
	}

	// Fill defaults
	if req.DB.Port == "" {
		req.DB.Port = "5432"
	}
	if req.DB.Prefix == "" {
		req.DB.Prefix = "ul_"
	}
	if req.Redis.Host == "" {
		req.Redis.Host = "127.0.0.1"
	}
	if req.Redis.Port == "" {
		req.Redis.Port = "6379"
	}
	generatedJWT := false
	if req.Site.JWTSecret == "" {
		req.Site.JWTSecret = randString(48)
		generatedJWT = true
	}

	// Build the env map: preserve any keys that were already in the file
	// (e.g. STORAGE_DRIVER, S3_* the deploy script put there) — only
	// overwrite the DB / Redis / site basics.
	envPath := findEnvPath()
	kv := readEnvFile(envPath)
	kv["DB_HOST"] = req.DB.Host
	kv["DB_PORT"] = req.DB.Port
	kv["DB_NAME"] = req.DB.DBName
	kv["DB_USER"] = req.DB.User
	kv["DB_PASSWORD"] = req.DB.Password
	kv["DB_PREFIX"] = req.DB.Prefix
	kv["REDIS_HOST"] = req.Redis.Host
	kv["REDIS_PORT"] = req.Redis.Port
	kv["REDIS_PASSWORD"] = req.Redis.Password
	kv["REDIS_DB"] = strconv.Itoa(req.Redis.DB)
	if req.Site.URL != "" {
		kv["APP_URL"] = req.Site.URL
	}
	kv["JWT_SECRET"] = req.Site.JWTSecret

	if err := writeEnvFile(envPath, kv); err != nil {
		util.Error(c, 500, "WRITE_FAILED", "写入 .env 失败: "+err.Error())
		return
	}

	// Tell the client the restart is coming, then bail. Flush is important:
	// once we os.Exit the response is already on the wire so the browser
	// gets the 200 instead of a connection reset.
	util.Success(c, gin.H{
		"restarting":    true,
		"env_path":      envPath,
		"jwt_secret":    req.Site.JWTSecret,
		"jwt_generated": generatedJWT,
	})
	if f, ok := c.Writer.(http.Flusher); ok {
		f.Flush()
	}
	go func() {
		// Small delay so any pending writes finish; docker restart=always
		// will bring us right back up with the new config.
		time.Sleep(600 * time.Millisecond)
		os.Exit(0)
	}()
}

// ========== helpers ==========

// findEnvPath walks up the CWD looking for a writable .env. Order:
//  1. $UTTERLOG_ENV explicit override
//  2. ./.env    (production: Dockerfile sets WORKDIR /app, bind-mounted)
//  3. ../.env   (dev: api/ is CWD, ../.env at repo root)
func findEnvPath() string {
	if p := os.Getenv("UTTERLOG_ENV"); p != "" {
		return p
	}
	for _, p := range []string{".env", "../.env", "/app/.env"} {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ".env" // doesn't exist yet → will be created
}

func readEnvFile(path string) map[string]string {
	out := map[string]string{}
	f, err := os.Open(path)
	if err != nil {
		return out
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if eq := strings.Index(line, "="); eq > 0 {
			out[strings.TrimSpace(line[:eq])] = strings.TrimSpace(line[eq+1:])
		}
	}
	return out
}

func writeEnvFile(path string, kv map[string]string) error {
	// Deterministic order: sort keys so diffs are stable
	keys := make([]string, 0, len(kv))
	for k := range kv {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	var b strings.Builder
	b.WriteString("# Generated by Utterlog setup wizard\n")
	b.WriteString("# Re-run /admin/setup to regenerate\n\n")
	for _, k := range keys {
		v := kv[k]
		// Quote if value has whitespace or special chars
		if strings.ContainsAny(v, " \t#\"'") {
			v = strconv.Quote(v)
		}
		fmt.Fprintf(&b, "%s=%s\n", k, v)
	}
	return os.WriteFile(path, []byte(b.String()), 0o600)
}

func randString(n int) string {
	// n hex chars ⇒ n/2 bytes of entropy from crypto/rand. Good enough
	// for a JWT secret that the user can also override via the env.
	b := make([]byte, (n+1)/2)
	if _, err := rand.Read(b); err != nil {
		// Extremely unlikely — /dev/urandom failure. Fall back to a
		// timestamp-based filler just so the server can keep booting.
		for i := range b {
			b[i] = byte((time.Now().UnixNano() >> (uint(i) * 8)) & 0xff)
		}
	}
	return hex.EncodeToString(b)[:n]
}
