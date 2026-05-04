// Comment-reply unsubscribe — signed link generator + storage gate.
//
// Flow
//
//  1. When sending a "your comment got a reply" email, we embed
//     <site_url>/unsubscribe/comment-reply?e=<base64(email)>&t=<sig>
//     where sig = HMAC-SHA256(secret, "comment_reply:"+email) base64,
//     truncated to 22 chars (~132 bits). Constant-time compared on
//     verify, so length is enough to defeat brute force.
//
//  2. Recipient clicks the link → handler verifies sig → adds the
//     email to an opt-out list stored as a JSON map in the
//     `comment_reply_optouts_v1` option (single row).
//
//  3. Before each reply email, sendCommentNotifications calls
//     IsCommentReplyOptedOut(email) and skips if true.
//
// Why options table instead of a new table:
//   - No migration needed (works on existing 1.x deployments without
//     extra db migration step).
//   - Blogs typically have <10k unique commenter emails, so a JSON
//     map fits fine in a TEXT option (~30 bytes per entry).
//
// Secret rotation:
//   - The HMAC secret lives in option `unsubscribe_secret`.
//     Auto-generated on first call (32 bytes hex). Rotating it
//     invalidates all outstanding unsubscribe links — that's only
//     done manually on incident response.
package email

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"sync"
	"time"

	"utterlog-go/internal/model"
)

const (
	unsubscribeSecretOption  = "unsubscribe_secret"
	commentReplyOptoutOption = "comment_reply_optouts_v1"
	commentReplySigContext   = "comment_reply:"
)

// 22 base64url chars → 132 bits. Anything past ~80 bits is overkill,
// but truncating below 16 bytes (128 bits) is widely considered weak
// for HMAC-on-shortened-output.
const sigLen = 22

var (
	unsubscribeSecretCache string
	unsubscribeSecretMu    sync.RWMutex

	optoutMu sync.Mutex
)

// loadUnsubscribeSecret returns the per-site HMAC secret, auto-creating
// one on first call. Cached process-wide so we don't hit the DB on
// every email.
func loadUnsubscribeSecret() string {
	unsubscribeSecretMu.RLock()
	if unsubscribeSecretCache != "" {
		s := unsubscribeSecretCache
		unsubscribeSecretMu.RUnlock()
		return s
	}
	unsubscribeSecretMu.RUnlock()

	unsubscribeSecretMu.Lock()
	defer unsubscribeSecretMu.Unlock()
	// Re-check inside write lock to avoid double-init under contention.
	if unsubscribeSecretCache != "" {
		return unsubscribeSecretCache
	}

	s := strings.TrimSpace(model.GetOption(unsubscribeSecretOption))
	if s == "" {
		buf := make([]byte, 32)
		if _, err := rand.Read(buf); err == nil {
			s = hex.EncodeToString(buf)
			model.SetOption(unsubscribeSecretOption, s)
		}
	}
	unsubscribeSecretCache = s
	return s
}

// commentReplySig returns the truncated HMAC for the given email.
func commentReplySig(emailAddr string) string {
	mac := hmac.New(sha256.New, []byte(loadUnsubscribeSecret()))
	mac.Write([]byte(commentReplySigContext + strings.ToLower(emailAddr)))
	full := base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	if len(full) > sigLen {
		full = full[:sigLen]
	}
	return full
}

// GenerateCommentReplyUnsubscribeURL returns the signed unsubscribe URL
// for `emailAddr`. Empty emailAddr → empty URL (template hides the link).
func GenerateCommentReplyUnsubscribeURL(siteURL, emailAddr string) string {
	emailAddr = strings.TrimSpace(emailAddr)
	if emailAddr == "" {
		return ""
	}
	enc := base64.RawURLEncoding.EncodeToString([]byte(strings.ToLower(emailAddr)))
	sig := commentReplySig(emailAddr)
	// /api/v1/ prefix because the path is served by the Go api
	// container; OpenResty routes /api/v1/* to api, everything else
	// to the Next.js web container.
	return fmt.Sprintf(
		"%s/api/v1/unsubscribe/comment-reply?e=%s&t=%s",
		strings.TrimRight(siteURL, "/"), enc, sig,
	)
}

// VerifyCommentReplyUnsubscribe decodes + verifies the URL params.
// Returns the email address on success, or "" on bad params / sig.
func VerifyCommentReplyUnsubscribe(emailEnc, sig string) string {
	if emailEnc == "" || sig == "" {
		return ""
	}
	raw, err := base64.RawURLEncoding.DecodeString(emailEnc)
	if err != nil {
		return ""
	}
	emailAddr := strings.ToLower(string(raw))
	expected := commentReplySig(emailAddr)
	if !hmac.Equal([]byte(sig), []byte(expected)) {
		return ""
	}
	return emailAddr
}

/* ---- opt-out storage ----------------------------------------------- */

// IsCommentReplyOptedOut reports whether `emailAddr` has previously
// unsubscribed from comment-reply notifications.
func IsCommentReplyOptedOut(emailAddr string) bool {
	emailAddr = strings.ToLower(strings.TrimSpace(emailAddr))
	if emailAddr == "" {
		return false
	}
	m := readOptouts()
	_, ok := m[emailAddr]
	return ok
}

// AddCommentReplyOptout records an opt-out (idempotent).
func AddCommentReplyOptout(emailAddr string) {
	emailAddr = strings.ToLower(strings.TrimSpace(emailAddr))
	if emailAddr == "" {
		return
	}
	optoutMu.Lock()
	defer optoutMu.Unlock()
	m := readOptouts()
	m[emailAddr] = time.Now().Unix()
	writeOptouts(m)
}

// readOptouts loads the JSON map from the option row. Empty map on
// any error so a corrupt option row degrades to "no one is opted out"
// rather than crashing the email path.
func readOptouts() map[string]int64 {
	raw := model.GetOption(commentReplyOptoutOption)
	if strings.TrimSpace(raw) == "" {
		return map[string]int64{}
	}
	var m map[string]int64
	if err := json.Unmarshal([]byte(raw), &m); err != nil || m == nil {
		return map[string]int64{}
	}
	return m
}

func writeOptouts(m map[string]int64) {
	b, err := json.Marshal(m)
	if err != nil {
		return
	}
	model.SetOption(commentReplyOptoutOption, string(b))
}
