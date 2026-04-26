// Package handler — AI 评论审核 + 智能回复
//
// Architecture overview:
//   - auditComment(text)             → AI 审核单条评论，返回结构化结果
//   - generateAICommentReply(...)    → AI 生成回复文本
//   - processCommentAudit(...)       → 同步 hook：CreateComment 评论为 pending 时调，
//                                      返回最终 status（可能从 pending 降级为 spam）
//   - processCommentReply(...)       → 异步 hook：approved 后 goroutine 触发，
//                                      生成 reply 写入 ul_ai_comment_queue，
//                                      auto 模式下立刻发布为博主回复评论
//   - AICommentQueueList / Approve / Reject / Regenerate / Delete
//                                    → admin 后台队列 CRUD endpoints
//
// 复用现有 ai_providers + callAIWithPurpose dispatch；admin 在
// 「常规设置 → AI → 用途路由」可把 'comment-audit' 和 'comment-reply'
// 分别绑定到独立 provider（也可不绑，自动 fallback 到默认链）。
package handler

import (
	"encoding/json"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"utterlog-go/config"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// auditCommentResult is what we expect the AI to return as JSON.
type auditCommentResult struct {
	Passed     bool    `json:"passed"`
	Confidence float64 `json:"confidence"`
	Reason     string  `json:"reason"`
}

// shouldAuditComments — admin master switch for AI 审核.
func shouldAuditComments() bool {
	return model.GetOption("ai_comment_audit_enabled") == "true"
}

// shouldReplyComments — admin master switch for AI 智能回复.
func shouldReplyComments() bool {
	return model.GetOption("ai_comment_reply_enabled") == "true"
}

// auditComment runs one AI audit pass. Uses the 'comment-audit'
// purpose so admins can route to a dedicated provider via
// ai_purpose_comment-audit_provider option (falls back to the
// default chain when unset). Returns a structured result + nil
// error on success, or nil + error if the provider is unavailable.
func auditComment(text string) (*auditCommentResult, error) {
	tpl := resolvePrompt(model.GetOption("ai_comment_audit_prompt"), DefaultCommentAuditPrompt)
	prompt := renderPrompt(tpl, map[string]string{"content": text})

	reply := callAIWithPurpose("comment-audit", prompt, 200)
	if reply == "" {
		return nil, fmt.Errorf("AI 审核服务返回为空（检查 provider 配置）")
	}

	jsonStr := extractAuditJSON(reply)
	var r auditCommentResult
	if err := json.Unmarshal([]byte(jsonStr), &r); err != nil {
		// Fallback heuristic when the model wraps prose around JSON or
		// drops the JSON entirely. We bias toward "通过" only when the
		// reply explicitly says so — anything ambiguous defaults to
		// "未通过" so spam doesn't slip through on parse failure.
		lower := strings.ToLower(reply)
		if strings.Contains(lower, "\"passed\":true") || strings.Contains(reply, "审核通过") || strings.Contains(lower, "approved") {
			return &auditCommentResult{Passed: true, Confidence: 0.7, Reason: "解析失败但识别为通过：" + truncateUTF8(reply, 120)}, nil
		}
		return &auditCommentResult{Passed: false, Confidence: 0.7, Reason: "JSON 解析失败：" + truncateUTF8(reply, 120)}, nil
	}
	return &r, nil
}

// extractAuditJSON pulls the first JSON object containing "passed"
// out of a reply, so we tolerate ```json fences / leading prose.
var auditJSONRe = regexp.MustCompile(`\{[^{}]*"passed"[^{}]*\}`)

func extractAuditJSON(s string) string {
	if m := auditJSONRe.FindString(s); m != "" {
		return m
	}
	return s
}

// truncateUTF8 trims a string to the first n runes (not bytes), so
// Chinese text doesn't mid-character mojibake.
func truncateUTF8(s string, n int) string {
	r := []rune(s)
	if len(r) <= n {
		return s
	}
	return string(r[:n]) + "..."
}

// processCommentAudit is called synchronously from CreateComment when
// the admin enabled AI 审核. Returns the (possibly downgraded) final
// status. Does NOT write to the AI queue — the queue is reserved for
// reply generation; audit results decorate the queue row created when
// a reply gets generated later.
//
// fail_action mapping:
//
//	reject (default) → spam
//	pending          → pending
//	ignore           → keep currentStatus unchanged
func processCommentAudit(content, currentStatus string) (string, *auditCommentResult) {
	res, err := auditComment(content)
	if err != nil {
		fmt.Printf("[ai-comment] audit error: %s\n", err)
		// Fail-open: if AI itself errored, don't downgrade — let the
		// regular spam heuristics + admin review handle it.
		return currentStatus, nil
	}

	threshold := 0.8
	if v := model.GetOption("ai_comment_audit_threshold"); v != "" {
		if f, perr := strconv.ParseFloat(v, 64); perr == nil {
			threshold = f
		}
	}

	if res.Passed && res.Confidence >= threshold {
		return currentStatus, res
	}

	switch model.GetOption("ai_comment_audit_fail_action") {
	case "ignore":
		return currentStatus, res
	case "pending":
		return "pending", res
	case "reject", "":
		fallthrough
	default:
		return "spam", res
	}
}

// buildReplyContext assembles the optional 文章标题/摘要/父评论 block
// that gets inserted into the reply prompt. Each piece is gated by an
// admin toggle (defaults ON when option absent — first-run friendly).
func buildReplyContext(commentID int) string {
	var b strings.Builder

	type ctxRow struct {
		PostTitle   string `db:"post_title"`
		PostExcerpt string `db:"post_excerpt"`
		ParentText  string `db:"parent_text"`
	}
	var ci ctxRow
	config.DB.Get(&ci, fmt.Sprintf(
		`SELECT
			COALESCE(p.title, '') AS post_title,
			COALESCE(p.excerpt, '') AS post_excerpt,
			COALESCE((SELECT content FROM %s WHERE id = c.parent_id), '') AS parent_text
		 FROM %s c
		 LEFT JOIN %s p ON p.id = c.post_id
		 WHERE c.id = $1`,
		config.T("comments"), config.T("comments"), config.T("posts")), commentID)

	if model.GetOption("ai_comment_reply_context_title") != "false" && ci.PostTitle != "" {
		b.WriteString("【文章标题】" + ci.PostTitle + "\n")
	}
	if model.GetOption("ai_comment_reply_context_excerpt") != "false" && ci.PostExcerpt != "" {
		b.WriteString("【文章摘要】" + truncateUTF8(ci.PostExcerpt, 300) + "\n")
	}
	if model.GetOption("ai_comment_reply_context_parent") != "false" && ci.ParentText != "" {
		b.WriteString("【正在回复的评论】" + truncateUTF8(ci.ParentText, 200) + "\n")
	}
	if b.Len() > 0 {
		b.WriteString("\n")
	}
	return b.String()
}

// generateAICommentReply asks the AI for a reply text. Uses the
// 'comment-reply' purpose. Trims trailing whitespace.
func generateAICommentReply(commentText, contextBlock string) (string, error) {
	tpl := resolvePrompt(model.GetOption("ai_comment_reply_prompt"), DefaultCommentReplyPrompt)
	prompt := renderPrompt(tpl, map[string]string{
		"content":       commentText,
		"context_block": contextBlock,
	})

	reply := callAIWithPurpose("comment-reply", prompt, 400)
	if reply == "" {
		return "", fmt.Errorf("AI 回复生成失败（检查 provider 配置）")
	}
	return strings.TrimSpace(reply), nil
}

// processCommentReply is the async entry point — kicked off from
// CreateComment / ApproveComment via `go processCommentReply(id, ...)`.
//
// Filters:
//   - Skip if a queue entry for this comment already exists
//     (idempotent under accidental double-approve clicks).
//   - Skip admin's own comments (would self-reply).
//   - Skip non-'comment' types (trackback / pingback).
//   - Skip if `ai_comment_reply_only_first` is on AND there's already
//     an approved comment on this post predating the current one.
//   - Honour hourly rate limit (`ai_comment_reply_rate_limit`).
//   - Sleep `ai_comment_reply_delay` seconds before generating
//     (admin can humanise the timing — replies that pop up within
//     0.5s of an approval feel obviously botted).
func processCommentReply(commentID int, audit *auditCommentResult, adminUserID int) {
	if !shouldReplyComments() {
		return
	}

	var existingID int
	config.DB.Get(&existingID, "SELECT id FROM "+config.T("ai_comment_queue")+
		" WHERE comment_id = $1 AND status IN ('pending','approved') LIMIT 1", commentID)
	if existingID > 0 {
		return
	}

	var ci struct {
		Content  string `db:"content"`
		PostID   int    `db:"post_id"`
		AuthorID int    `db:"user_id"`
		Type     string `db:"type"`
	}
	err := config.DB.Get(&ci, fmt.Sprintf(
		"SELECT content, post_id, COALESCE(user_id,0) AS user_id, COALESCE(type,'comment') AS type FROM %s WHERE id = $1",
		config.T("comments")), commentID)
	if err != nil {
		return
	}

	// Skip admin's own comments
	if ci.AuthorID > 0 && ci.AuthorID == adminUserID {
		return
	}
	// Skip trackback / pingback
	if ci.Type != "" && ci.Type != "comment" {
		return
	}

	// Trigger filter: only first comment per post
	if model.GetOption("ai_comment_reply_only_first") == "true" {
		var prevCount int
		config.DB.Get(&prevCount, fmt.Sprintf(
			"SELECT COUNT(*) FROM %s WHERE post_id = $1 AND id < $2 AND status = 'approved'",
			config.T("comments")), ci.PostID, commentID)
		if prevCount > 0 {
			return
		}
	}

	if !checkAIReplyRateLimit() {
		fmt.Printf("[ai-comment] rate limit exceeded, skipping cid=%d\n", commentID)
		return
	}

	// Optional delay
	if d := model.GetOption("ai_comment_reply_delay"); d != "" {
		if secs, perr := strconv.Atoi(d); perr == nil && secs > 0 {
			time.Sleep(time.Duration(secs) * time.Second)
		}
	}

	contextBlock := buildReplyContext(commentID)
	reply, err := generateAICommentReply(ci.Content, contextBlock)
	now := time.Now().Unix()

	if err != nil {
		// Persist the failure so admin can inspect it in the queue
		// instead of silently dropping (helps debug provider issues).
		auditCols, auditVals := auditFields(audit)
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (comment_id, post_id, comment_text, ai_reply, status, created_at, processed_at, error_msg%s) "+
				"VALUES ($1, $2, $3, '', 'error', $4, $4, $5%s)",
			config.T("ai_comment_queue"), auditCols, auditVals),
			commentID, ci.PostID, ci.Content, now, truncateUTF8(err.Error(), 500))
		return
	}

	auditCols, auditVals := auditFields(audit)
	var queueID int
	err = config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (comment_id, post_id, comment_text, ai_reply, status, created_at%s) "+
			"VALUES ($1,$2,$3,$4,'pending',$5%s) RETURNING id",
		config.T("ai_comment_queue"), auditCols, auditVals),
		commentID, ci.PostID, ci.Content, reply, now).Scan(&queueID)
	if err != nil {
		fmt.Printf("[ai-comment] queue insert failed cid=%d: %s\n", commentID, err)
		return
	}

	// Auto mode → publish immediately
	if model.GetOption("ai_comment_reply_mode") == "auto" {
		publishAIReply(queueID, commentID, ci.PostID, reply, adminUserID)
	}
}

// auditFields builds the optional column suffix when audit metadata
// is present. Postgres won't accept NULL inserts via $-placeholders
// for nullable columns without explicit casting, so we emit the
// columns conditionally instead. Returns (extraCols, extraValues).
func auditFields(a *auditCommentResult) (string, string) {
	if a == nil {
		return "", ""
	}
	cols := ", ai_audit_passed, ai_audit_confidence, ai_audit_reason"
	// Embed values directly — they're constrained to bool/float/string
	// from auditCommentResult, no SQL injection surface.
	vals := fmt.Sprintf(", %t, %g, '%s'",
		a.Passed,
		a.Confidence,
		strings.ReplaceAll(a.Reason, "'", "''"),
	)
	return cols, vals
}

// checkAIReplyRateLimit caps queue inserts per hour. 0 / unset = no limit.
func checkAIReplyRateLimit() bool {
	v := model.GetOption("ai_comment_reply_rate_limit")
	if v == "" {
		return true
	}
	limit, err := strconv.Atoi(v)
	if err != nil || limit <= 0 {
		return true
	}
	oneHourAgo := time.Now().Unix() - 3600
	var count int
	config.DB.Get(&count, fmt.Sprintf(
		"SELECT COUNT(*) FROM %s WHERE created_at > $1", config.T("ai_comment_queue")), oneHourAgo)
	return count < limit
}

// publishAIReply moves a queue entry to status='approved', creates a
// child comment under the original (author = admin user), bumps the
// post comment_count, and optionally appends the AI badge text.
//
// Re-used by: auto mode in processCommentReply, and by the manual
// AICommentApprove admin endpoint.
func publishAIReply(queueID, parentCommentID, postID int, reply string, adminUserID int) {
	badge := strings.TrimSpace(model.GetOption("ai_comment_reply_badge_text"))
	finalContent := reply
	if badge != "" {
		finalContent = reply + "\n\n" + badge
	}

	var adminName, adminEmail string
	config.DB.Get(&adminName, "SELECT COALESCE(NULLIF(nickname,''), '博主') FROM "+
		config.T("users")+" WHERE id = $1", adminUserID)
	config.DB.Get(&adminEmail, "SELECT COALESCE(email, '') FROM "+
		config.T("users")+" WHERE id = $1", adminUserID)
	if adminName == "" {
		adminName = "博主"
	}

	now := time.Now().Unix()
	var newCommentID int
	err := config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (post_id, parent_id, author_name, author_email, content, status, user_id, is_ai_reply, created_at) "+
			"VALUES ($1, $2, $3, $4, $5, 'approved', $6, true, $7) RETURNING id",
		config.T("comments")),
		postID, parentCommentID, adminName, adminEmail, finalContent, adminUserID, now).Scan(&newCommentID)
	if err != nil {
		config.DB.Exec(fmt.Sprintf(
			"UPDATE %s SET status = 'error', error_msg = $1, processed_at = $2 WHERE id = $3",
			config.T("ai_comment_queue")), truncateUTF8(err.Error(), 500), now, queueID)
		return
	}

	config.DB.Exec(fmt.Sprintf("UPDATE %s SET comment_count = comment_count + 1 WHERE id = $1",
		config.T("posts")), postID)

	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET status = 'approved', processed_at = $1, reviewer_id = $2 WHERE id = $3",
		config.T("ai_comment_queue")), now, adminUserID, queueID)
}

// ============================================================
//   Admin REST API — registered in main.go under /api/v1/admin
// ============================================================

// AICommentQueueList returns paginated queue entries + summary stats.
// GET /admin/ai-comments?status=pending|approved|rejected|error&limit=N
func AICommentQueueList(c *gin.Context) {
	status := c.Query("status")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
	if limit <= 0 || limit > 200 {
		limit = 50
	}

	type queueRow struct {
		ID                int      `db:"id" json:"id"`
		CommentID         int      `db:"comment_id" json:"comment_id"`
		PostID            int      `db:"post_id" json:"post_id"`
		PostTitle         string   `db:"post_title" json:"post_title"`
		CommentText       string   `db:"comment_text" json:"comment_text"`
		CommentAuthor     string   `db:"comment_author" json:"comment_author"`
		AIReply           string   `db:"ai_reply" json:"ai_reply"`
		Status            string   `db:"status" json:"status"`
		CreatedAt         int64    `db:"created_at" json:"created_at"`
		ProcessedAt       int64    `db:"processed_at" json:"processed_at"`
		ErrorMsg          *string  `db:"error_msg" json:"error_msg"`
		AIAuditPassed     *bool    `db:"ai_audit_passed" json:"ai_audit_passed"`
		AIAuditConfidence *float64 `db:"ai_audit_confidence" json:"ai_audit_confidence"`
		AIAuditReason     *string  `db:"ai_audit_reason" json:"ai_audit_reason"`
	}

	q := fmt.Sprintf(
		`SELECT q.id, q.comment_id, q.post_id, COALESCE(p.title,'') AS post_title,
				q.comment_text, COALESCE(c.author_name,'') AS comment_author,
				q.ai_reply, q.status, q.created_at, q.processed_at, q.error_msg,
				q.ai_audit_passed, q.ai_audit_confidence, q.ai_audit_reason
		 FROM %s q
		 LEFT JOIN %s c ON c.id = q.comment_id
		 LEFT JOIN %s p ON p.id = q.post_id`,
		config.T("ai_comment_queue"), config.T("comments"), config.T("posts"))

	args := []interface{}{}
	if status != "" {
		q += " WHERE q.status = $1"
		args = append(args, status)
	}
	q += fmt.Sprintf(" ORDER BY q.created_at DESC LIMIT %d", limit)

	var rows []queueRow
	config.DB.Select(&rows, q, args...)
	if rows == nil {
		rows = []queueRow{}
	}

	type stats struct {
		Pending  int `db:"pending" json:"pending"`
		Approved int `db:"approved" json:"approved"`
		Rejected int `db:"rejected" json:"rejected"`
		Error    int `db:"error" json:"error"`
	}
	var s stats
	config.DB.Get(&s, fmt.Sprintf(
		`SELECT
			COUNT(*) FILTER (WHERE status='pending') AS pending,
			COUNT(*) FILTER (WHERE status='approved') AS approved,
			COUNT(*) FILTER (WHERE status='rejected') AS rejected,
			COUNT(*) FILTER (WHERE status='error') AS error
		 FROM %s`, config.T("ai_comment_queue")))

	util.Success(c, gin.H{"items": rows, "stats": s})
}

// AICommentApprove publishes a queue entry. Admin can edit the reply
// text via { "content": "..." }; empty body uses the AI-generated text.
// POST /admin/ai-comments/:id/approve
func AICommentApprove(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Content string `json:"content"`
	}
	c.ShouldBindJSON(&req)

	var q struct {
		CommentID int    `db:"comment_id"`
		PostID    int    `db:"post_id"`
		AIReply   string `db:"ai_reply"`
		Status    string `db:"status"`
	}
	err := config.DB.Get(&q,
		"SELECT comment_id, post_id, ai_reply, status FROM "+config.T("ai_comment_queue")+" WHERE id = $1", id)
	if err != nil {
		util.NotFound(c, "队列条目")
		return
	}
	if q.Status != "pending" && q.Status != "error" {
		util.BadRequest(c, "该队列条目已处理")
		return
	}

	reply := strings.TrimSpace(req.Content)
	if reply == "" {
		reply = q.AIReply
	}
	if reply == "" {
		util.BadRequest(c, "回复内容不能为空")
		return
	}

	publishAIReply(id, q.CommentID, q.PostID, reply, middleware.GetUserID(c))
	util.Success(c, gin.H{"id": id})
}

// AICommentReject marks a queue entry as rejected (no comment created).
// POST /admin/ai-comments/:id/reject
func AICommentReject(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET status = 'rejected', processed_at = $1, reviewer_id = $2 "+
			"WHERE id = $3 AND status IN ('pending','error')",
		config.T("ai_comment_queue")), time.Now().Unix(), middleware.GetUserID(c), id)
	util.Success(c, gin.H{"id": id})
}

// AICommentRegenerate re-asks the AI for a fresh reply on the same
// comment. Useful when first attempt was off-tone.
// POST /admin/ai-comments/:id/regenerate
func AICommentRegenerate(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))

	var q struct {
		CommentID   int    `db:"comment_id"`
		CommentText string `db:"comment_text"`
	}
	err := config.DB.Get(&q,
		"SELECT comment_id, comment_text FROM "+config.T("ai_comment_queue")+" WHERE id = $1", id)
	if err != nil {
		util.NotFound(c, "队列条目")
		return
	}

	contextBlock := buildReplyContext(q.CommentID)
	reply, err := generateAICommentReply(q.CommentText, contextBlock)
	if err != nil {
		config.DB.Exec(fmt.Sprintf(
			"UPDATE %s SET status = 'error', error_msg = $1 WHERE id = $2",
			config.T("ai_comment_queue")), truncateUTF8(err.Error(), 500), id)
		util.Error(c, 500, "AI_FAILED", err.Error())
		return
	}

	config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET ai_reply = $1, status = 'pending', error_msg = NULL WHERE id = $2",
		config.T("ai_comment_queue")), reply, id)
	util.Success(c, gin.H{"id": id, "reply": reply})
}

// AICommentDelete drops a queue entry permanently.
// DELETE /admin/ai-comments/:id
func AICommentDelete(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	config.DB.Exec("DELETE FROM "+config.T("ai_comment_queue")+" WHERE id = $1", id)
	util.Success(c, gin.H{"id": id})
}
