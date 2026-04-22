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

// BuildVersion is populated at link time via -ldflags "-X ...BuildVersion=".
// Expected to be a release tag like "v1.0.3" (or "dev" for local runs).
var BuildVersion = ""

// BuildCommit is the 7-char git SHA of the build, injected via -ldflags.
// Displayed as small subtitle in the admin UI so devs can trace the
// exact build without the ugly "sha-" prefix dominating the version line.
var BuildCommit = ""

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
	// Commit is filled after the Releases API response by a second call
	// to /commits/{tag}. 7-char short form so the UI can render it the
	// same way as current build's commit.
	Commit string `json:"commit,omitempty"`
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
			"commit":       rel.Commit,
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
	// Legacy images that only have "sha-xxxxxxx" in BuildVersion —
	// split it into a friendlier version + commit pair so the UI
	// can render "dev · 6a60b01" instead of "sha-6a60b01".
	commit := BuildCommit
	if commit == "" && strings.HasPrefix(v, "sha-") {
		commit = strings.TrimPrefix(v, "sha-")
		v = "dev"
	}
	return gin.H{
		"version":    v,
		"commit":     commit,
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

	// Second call: resolve tag → commit SHA so the admin UI can show
	// the "latest" commit hash alongside the version label, matching
	// how the current build displays v1.0.3 · 3ac2f03. Silent on
	// failure — commit is decorative, don't let it block the release.
	rel.Commit = fetchTagCommit(rel.TagName)

	verCache.mu.Lock()
	verCache.fetched = time.Now()
	verCache.release = &rel
	verCache.errorMsg = ""
	verCache.mu.Unlock()
}

// fetchTagCommit hits GitHub's commits-by-ref endpoint to turn a tag
// name (e.g., "v1.0.3") into the 7-char short SHA of the commit it
// points to. Returns "" on any failure.
func fetchTagCommit(tag string) string {
	if tag == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 4*time.Second)
	defer cancel()
	url := "https://api.github.com/repos/utterlog/utterlog/commits/" + tag
	req, _ := http.NewRequestWithContext(ctx, "GET", url, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "utterlog-api")
	resp, err := http.DefaultClient.Do(req)
	if err != nil || resp == nil {
		return ""
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		return ""
	}
	var body struct {
		SHA string `json:"sha"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&body); err != nil {
		return ""
	}
	if len(body.SHA) >= 7 {
		return body.SHA[:7]
	}
	return body.SHA
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

	appendLog("Launching upgrade sidecar (survives api recreation)...")

	// CRITICAL: we cannot run `docker compose up -d` from within the
	// api container's own process tree. The moment compose recreates
	// the api service it SIGKILLs everything inside — and our shell
	// hasn't finished yet. The old api is gone, the new api container
	// sits in `Created` state without the rest of the `up -d` run to
	// start it. Result: total outage.
	//
	// Fix: spawn an independent sidecar container on the host docker
	// daemon. The sidecar has its own process space, runs `docker
	// compose pull + up -d` to completion, and doesn't care that
	// api-1 gets recreated. Its log tail is written to
	// ./public/uploads/upgrade.log which is bind-mounted so the UI
	// can still read it.
	installDir := os.Getenv("UTTERLOG_INSTALL_DIR")
	if installDir == "" {
		installDir = "/opt/utterlog"
	}
	sidecarScript := `
set -e
cd "$INSTALL_DIR"

MODE="${UTTERLOG_COMPOSE_MODE:-}"
if [ -z "$MODE" ]; then
  if [ -f docker-compose.prod.yml ] && [ -f docker-compose.pull.yml ]; then
    MODE=overlay
  elif [ -f docker-compose.yml ]; then
    MODE=slim
  else
    echo "[upgrade] ERROR: no docker-compose files under $(pwd)"
    exit 1
  fi
fi

echo "[upgrade] mode=$MODE — pulling ..."
case "$MODE" in
  overlay)
    docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml pull
    echo "[upgrade] recreating containers ..."
    docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml up -d --remove-orphans
    ;;
  slim)
    docker compose pull
    echo "[upgrade] recreating containers ..."
    docker compose up -d --remove-orphans
    ;;
  *)
    echo "[upgrade] ERROR: unknown UTTERLOG_COMPOSE_MODE=$MODE"
    exit 1
    ;;
esac

echo "[upgrade] waiting for api health..."
for i in $(seq 1 60); do
  code=$(docker inspect --format='{{.State.Health.Status}}' utterlog-api-1 2>/dev/null || echo unknown)
  [ "$code" = "healthy" ] && { echo "[upgrade] api healthy"; break; }
  sleep 2
done
echo "[upgrade] done"
`

	// Name the sidecar so we can find/cleanup stale runs.
	sidecarName := "utterlog-upgrade-" + fmt.Sprintf("%d", time.Now().Unix())
	// Remove any previous sidecar first (ignore error).
	exec.Command("docker", "rm", "-f", "utterlog-upgrade-worker").Run()

	cmd := exec.Command("docker", "run", "--rm", "-d",
		"--name", sidecarName,
		"-v", "/var/run/docker.sock:/var/run/docker.sock",
		"-v", installDir+":"+installDir,
		"-e", "INSTALL_DIR="+installDir,
		"-e", "UTTERLOG_COMPOSE_MODE="+os.Getenv("UTTERLOG_COMPOSE_MODE"),
		"-w", installDir,
		// Official Docker CLI image — includes compose v2 plugin.
		"docker:27-cli",
		"sh", "-c", sidecarScript,
	)
	cmd.Stdout, _ = os.OpenFile(upgrade.logPath, os.O_APPEND|os.O_WRONLY, 0o644)
	cmd.Stderr = cmd.Stdout

	if err := cmd.Run(); err != nil {
		appendLog("failed to launch sidecar: " + err.Error())
		upgrade.mu.Lock()
		upgrade.running = false
		upgrade.finished = true
		upgrade.success = false
		upgrade.message = err.Error()
		upgrade.mu.Unlock()
		return
	}

	appendLog(fmt.Sprintf("sidecar %s launched (docker logs %s -f)", sidecarName, sidecarName))
	appendLog("API will restart shortly; sidecar continues independently.")

	// Can't wait for the sidecar — our api will be recreated mid-run,
	// killing this goroutine. Optimistic success: the sidecar owns the
	// real outcome. On restart, upgrade state resets to zero and the
	// UI's version poll will show the new image's VERSION label.
	upgrade.mu.Lock()
	upgrade.running = false
	upgrade.finished = true
	upgrade.success = true
	upgrade.message = "升级 worker 已启动，API 即将自动重启。如果前端一直 502，可以刷新页面看版本号是否已更新。"
	upgrade.mu.Unlock()
}
