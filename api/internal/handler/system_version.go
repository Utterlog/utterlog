package handler

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"sync"
	"time"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// BuildVersion is populated at link time via -ldflags "-X main.Version=...".
// For dev builds it stays empty and the endpoint reports "dev".
var BuildVersion = ""

// BuildTime is an optional UTC RFC3339 string also injected via ldflags.
var BuildTime = ""

// ============================================================
// GET /api/v1/admin/system/version
//
// Returns the running version plus the latest GitHub release, so the
// admin SPA can show a "new version available" badge and changelog.
// Cached for 10 minutes to stay under GitHub's unauthenticated rate
// limit (60/hour/IP).
// ============================================================

type githubRelease struct {
	TagName     string `json:"tag_name"`
	Name        string `json:"name"`
	Body        string `json:"body"`
	HTMLURL     string `json:"html_url"`
	PublishedAt string `json:"published_at"`
	Prerelease  bool   `json:"prerelease"`
	Draft       bool   `json:"draft"`
}

type versionCache struct {
	mu       sync.Mutex
	fetched  time.Time
	release  *githubRelease
	errorMsg string
}

var verCache = &versionCache{}

const (
	ghReleasesURL     = "https://api.github.com/repos/utterlog/utterlog/releases/latest"
	ghAllReleasesURL  = "https://api.github.com/repos/utterlog/utterlog/releases?per_page=20"
	cacheTTL          = 10 * time.Minute
)

// Separate cache for the full release list (admin changelog view).
type releasesCache struct {
	mu       sync.Mutex
	fetched  time.Time
	items    []githubRelease
	errorMsg string
}

var relCache = &releasesCache{}

// SystemVersion returns current + latest version info.
func SystemVersion(c *gin.Context) {
	refresh := c.Query("refresh") == "1"

	verCache.mu.Lock()
	stale := refresh || verCache.release == nil || time.Since(verCache.fetched) > cacheTTL
	verCache.mu.Unlock()

	if stale {
		fetchLatestRelease()
	}

	verCache.mu.Lock()
	rel := verCache.release
	errMsg := verCache.errorMsg
	fetchedAt := verCache.fetched
	verCache.mu.Unlock()

	current := currentVersion()
	payload := gin.H{
		"current": current,
		"checked_at": func() string {
			if fetchedAt.IsZero() {
				return ""
			}
			return fetchedAt.UTC().Format(time.RFC3339)
		}(),
	}
	if rel != nil {
		payload["latest"] = gin.H{
			"version":      rel.TagName,
			"name":         rel.Name,
			"body":         rel.Body,
			"url":          rel.HTMLURL,
			"published_at": rel.PublishedAt,
			"prerelease":   rel.Prerelease,
		}
		payload["update_available"] = isNewer(current["version"].(string), rel.TagName)
	} else {
		payload["latest"] = nil
		payload["update_available"] = false
		if errMsg != "" {
			payload["error"] = errMsg
		}
	}
	util.Success(c, payload)
}

func currentVersion() gin.H {
	v := BuildVersion
	if v == "" {
		v = "dev"
	}
	return gin.H{
		"version":    v,
		"built_at":   BuildTime,
		"go_version": fmt.Sprintf("utterlog-go/%s", v),
	}
}

// isNewer returns true when latest is considered newer than current.
// - Current == "dev" or starts with "sha-" (untagged build): any tagged
//   semver release counts as newer. This lets dev/local installs see
//   the update badge so the feature is visible while testing.
// - Both semver: lexicographic compare works for monotonic 1.x tags;
//   pre-release gating is surfaced via the prerelease flag separately.
func isNewer(current, latest string) bool {
	c := strings.TrimPrefix(current, "v")
	l := strings.TrimPrefix(latest, "v")
	if c == "" || l == "" {
		return false
	}
	if c == "dev" || strings.HasPrefix(c, "sha-") {
		// Any tagged semver release is "newer" than a dev/sha build.
		return !strings.HasPrefix(l, "sha-")
	}
	return l > c
}

func fetchLatestRelease() {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", ghReleasesURL, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "utterlog-api")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		verCache.mu.Lock()
		verCache.fetched = time.Now()
		verCache.errorMsg = "github API: " + err.Error()
		verCache.mu.Unlock()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == 404 {
		// No releases yet — treat as "up to date" with dev.
		verCache.mu.Lock()
		verCache.fetched = time.Now()
		verCache.release = nil
		verCache.errorMsg = ""
		verCache.mu.Unlock()
		return
	}
	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		verCache.mu.Lock()
		verCache.fetched = time.Now()
		verCache.errorMsg = fmt.Sprintf("github API %d: %s", resp.StatusCode, string(body))
		verCache.mu.Unlock()
		return
	}

	var rel githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		verCache.mu.Lock()
		verCache.fetched = time.Now()
		verCache.errorMsg = "decode: " + err.Error()
		verCache.mu.Unlock()
		return
	}

	verCache.mu.Lock()
	verCache.fetched = time.Now()
	verCache.release = &rel
	verCache.errorMsg = ""
	verCache.mu.Unlock()
}

// ============================================================
// GET /api/v1/admin/system/releases
//
// Returns the 20 most recent GitHub releases for the admin changelog
// view. Cached 10 min. On error returns an empty list + error field so
// the UI can show a fallback "check GitHub" link.
// ============================================================
func SystemReleases(c *gin.Context) {
	refresh := c.Query("refresh") == "1"

	relCache.mu.Lock()
	stale := refresh || relCache.items == nil || time.Since(relCache.fetched) > cacheTTL
	relCache.mu.Unlock()

	if stale {
		fetchReleases()
	}

	relCache.mu.Lock()
	items := relCache.items
	errMsg := relCache.errorMsg
	fetchedAt := relCache.fetched
	relCache.mu.Unlock()

	util.Success(c, gin.H{
		"releases": items,
		"checked_at": func() string {
			if fetchedAt.IsZero() {
				return ""
			}
			return fetchedAt.UTC().Format(time.RFC3339)
		}(),
		"error": errMsg,
	})
}

func fetchReleases() {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	req, _ := http.NewRequestWithContext(ctx, "GET", ghAllReleasesURL, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "utterlog-api")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		relCache.mu.Lock()
		relCache.fetched = time.Now()
		relCache.errorMsg = "github API: " + err.Error()
		relCache.mu.Unlock()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		relCache.mu.Lock()
		relCache.fetched = time.Now()
		relCache.errorMsg = fmt.Sprintf("github API %d: %s", resp.StatusCode, string(body))
		// keep existing items so UI shows stale data rather than a blank list
		relCache.mu.Unlock()
		return
	}

	var items []githubRelease
	if err := json.NewDecoder(resp.Body).Decode(&items); err != nil {
		relCache.mu.Lock()
		relCache.fetched = time.Now()
		relCache.errorMsg = "decode: " + err.Error()
		relCache.mu.Unlock()
		return
	}

	relCache.mu.Lock()
	relCache.fetched = time.Now()
	relCache.items = items
	relCache.errorMsg = ""
	relCache.mu.Unlock()
}

// ============================================================
// POST /api/v1/admin/system/upgrade
// ============================================================

type upgradeState struct {
	mu        sync.Mutex
	running   bool
	startedAt time.Time
	finished  bool
	success   bool
	noop      bool // true when the script exited successfully without doing anything (dev mode)
	message   string
	logPath   string
}

var upgrade = &upgradeState{
	logPath: "./public/uploads/upgrade.log",
}

// SystemUpgrade kicks off an in-place upgrade. Streams logs to a file on
// the bind-mounted uploads volume so the UI can poll for progress and
// so the log survives the api container restart.
func SystemUpgrade(c *gin.Context) {
	upgrade.mu.Lock()
	if upgrade.running {
		upgrade.mu.Unlock()
		util.Error(c, 409, "UPGRADE_IN_PROGRESS", "升级正在进行，请稍候")
		return
	}
	upgrade.running = true
	upgrade.finished = false
	upgrade.success = false
	upgrade.startedAt = time.Now()
	upgrade.message = ""
	upgrade.mu.Unlock()

	// Truncate log file
	_ = os.MkdirAll("./public/uploads", 0o755)
	_ = os.WriteFile(upgrade.logPath, []byte(fmt.Sprintf("[%s] upgrade starting\n", time.Now().UTC().Format(time.RFC3339))), 0o644)

	// Detach: run the upgrade in the background so we can return 202
	// before the api container recreates itself.
	go runUpgrade()

	util.Success(c, gin.H{
		"started":  true,
		"log_path": "/uploads/upgrade.log",
		"hint":     "API 将在 15-30 秒内重启；期间请勿刷新页面",
	})
}

// SystemUpgradeStatus reports whether an upgrade is in progress plus a
// tail of the log. After the api container restarts, "running" resets
// to false but the log file persists so the UI can show the final
// result on next poll.
func SystemUpgradeStatus(c *gin.Context) {
	upgrade.mu.Lock()
	running := upgrade.running
	finished := upgrade.finished
	success := upgrade.success
	noop := upgrade.noop
	msg := upgrade.message
	startedAt := upgrade.startedAt
	logPath := upgrade.logPath
	upgrade.mu.Unlock()

	tail := ""
	if b, err := os.ReadFile(logPath); err == nil {
		if len(b) > 4096 {
			b = b[len(b)-4096:]
		}
		tail = string(b)
	}

	util.Success(c, gin.H{
		"running":    running,
		"finished":   finished,
		"success":    success,
		"noop":       noop,
		"message":    msg,
		"started_at": startedAt.UTC().Format(time.RFC3339),
		"log_tail":   tail,
	})
}

func runUpgrade() {
	// Give the HTTP response time to flush before the container restarts.
	time.Sleep(1 * time.Second)

	appendLog := func(line string) {
		f, err := os.OpenFile(upgrade.logPath, os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			return
		}
		defer f.Close()
		fmt.Fprintf(f, "[%s] %s\n", time.Now().UTC().Format(time.RFC3339), line)
	}

	// Validate docker socket access — api image must mount /var/run/docker.sock
	if _, err := os.Stat("/var/run/docker.sock"); err != nil {
		appendLog("ERROR: /var/run/docker.sock not mounted. Add `-v /var/run/docker.sock:/var/run/docker.sock` to docker-compose.prod.yml api service to enable one-click upgrade.")
		upgrade.mu.Lock()
		upgrade.running = false
		upgrade.finished = true
		upgrade.success = false
		upgrade.message = "docker socket not mounted"
		upgrade.mu.Unlock()
		return
	}

	appendLog("Pulling latest images (this may take 1-3 minutes)...")

	// Run the sequence in a detached shell so it survives when this api
	// container is recreated. The shell uses `docker compose` via the
	// mounted socket — it talks to the HOST's docker daemon, not the
	// api container's internals.
	//
	// Compose file selection priority:
	//   1. UTTERLOG_COMPOSE_MODE env explicit (slim|overlay|dev|noop)
	//   2. docker-compose.yml references a registry image → slim install
	//   3. overlay files (docker-compose.prod.yml + .pull.yml) present
	//      AND docker-compose.yml doesn't have build: → prod overlay
	//   4. docker-compose.yml has build: → dev source repo, noop (dev
	//      workflow is `git pull + docker compose restart`, not a
	//      registry pull)
	//   5. error
	//
	// Plain-grep patterns (no ${...} / curly braces) avoid POSIX ERE's
	// treatment of { as a quantifier delimiter — that was the bug that
	// caused the earlier "Invalid contents of {}" fall-through.
	script := `
set -e
cd "${UTTERLOG_INSTALL_DIR:-/opt/utterlog}"

uses_registry_images() {
  [ -f docker-compose.yml ] || return 1
  grep -q 'registry\.utterlog\.io' docker-compose.yml && return 0
  grep -q 'ghcr\.io/utterlog'       docker-compose.yml && return 0
  grep -q 'UTTERLOG_IMAGE_PREFIX'   docker-compose.yml && return 0
  return 1
}
uses_local_build() {
  [ -f docker-compose.yml ] && grep -qE '^[[:space:]]*build:' docker-compose.yml
}

MODE="${UTTERLOG_COMPOSE_MODE:-}"
if [ -z "$MODE" ]; then
  if uses_registry_images; then
    MODE=slim
  elif [ -f docker-compose.prod.yml ] && [ -f docker-compose.pull.yml ] && ! uses_local_build; then
    MODE=overlay
  elif uses_local_build; then
    MODE=dev
  else
    MODE=error
  fi
fi

case "$MODE" in
  slim)
    echo "[upgrade] slim install mode — single file with registry images"
    docker compose pull
    docker compose up -d --remove-orphans
    ;;
  overlay)
    echo "[upgrade] prod overlay mode — docker-compose.prod.yml + docker-compose.pull.yml"
    docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml pull
    docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml up -d --remove-orphans
    ;;
  dev)
    echo "[upgrade] dev source repo detected — one-click upgrade skipped."
    echo "[upgrade] Dev workflow: 'git pull' + rebuild + 'docker compose restart api'"
    echo "[upgrade] Set UTTERLOG_COMPOSE_MODE=slim to force a registry pull anyway."
    echo "[upgrade] done (noop)"
    ;;
  *)
    echo "[upgrade] ERROR: cannot determine deployment mode under $(pwd)"
    echo "[upgrade] Set UTTERLOG_COMPOSE_MODE=slim|overlay|dev to override."
    exit 1
    ;;
esac
`
	cmd := exec.Command("nohup", "bash", "-c", script)
	cmd.Stdout, _ = os.OpenFile(upgrade.logPath, os.O_APPEND|os.O_WRONLY, 0o644)
	cmd.Stderr = cmd.Stdout

	if err := cmd.Start(); err != nil {
		appendLog("failed to start upgrade: " + err.Error())
		upgrade.mu.Lock()
		upgrade.running = false
		upgrade.finished = true
		upgrade.success = false
		upgrade.message = err.Error()
		upgrade.mu.Unlock()
		return
	}

	appendLog(fmt.Sprintf("upgrade shell detached (pid %d). API will restart momentarily.", cmd.Process.Pid))

	// Wait for the shell to finish so the UI can poll /upgrade/status
	// and see success=true. For real upgrades the api container gets
	// recreated by `compose up -d` and this goroutine dies with it —
	// that's fine, the new container boots with a clean upgrade state
	// and the admin page reads the fresh version. For dev/noop paths
	// the shell exits quickly and we mark finished here.
	waitErr := cmd.Wait()

	// Detect "dev source repo — noop" by scanning the log for the
	// marker our shell emits when it takes the skip path. This lets
	// the UI distinguish "really upgraded" from "did nothing (dev)".
	isNoop := false
	if b, err := os.ReadFile(upgrade.logPath); err == nil {
		if strings.Contains(string(b), "done (noop)") {
			isNoop = true
		}
	}

	upgrade.mu.Lock()
	upgrade.running = false
	upgrade.finished = true
	upgrade.success = waitErr == nil
	upgrade.noop = isNoop
	if waitErr != nil {
		upgrade.message = waitErr.Error()
		appendLog("upgrade shell exited with error: " + waitErr.Error())
	} else if isNoop {
		upgrade.message = "dev 源代码模式 — 本次未执行实际升级。开发流程请用 git pull + 重启容器。"
		appendLog("upgrade shell completed (noop — dev source repo)")
	} else {
		appendLog("upgrade shell completed successfully")
	}
	upgrade.mu.Unlock()
}
