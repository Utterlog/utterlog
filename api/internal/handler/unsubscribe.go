// Public unsubscribe endpoint reached from the link inside
// "your comment got a reply" emails:
//
//	GET /api/v1/unsubscribe/comment-reply?e=<base64(email)>&t=<sig>
//
// Verifies the HMAC, persists the opt-out, then renders a tiny
// HTML confirmation page in the recipient's browser. Anyone landing
// here from a forged/expired link sees a "链接无效" page instead.
//
// We render HTML directly here rather than redirecting into the
// Next.js site because:
//  1. The api owns the opt-out store (single round-trip).
//  2. No risk of broken Next.js routes or stale builds.
//  3. The confirmation page is dirt-cheap inline HTML.
package handler

import (
	"net/http"

	"github.com/gin-gonic/gin"

	"utterlog-go/internal/email"
)

const unsubPageOK = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>已退订 — %s</title>
<style>
  body { margin: 0; font: 14px/1.7 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
         background: #f4f6f9; color: #0d1a2d; min-height: 100vh; display: flex;
         align-items: center; justify-content: center; padding: 24px; }
  .card { background: #fff; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          padding: 36px 40px; max-width: 460px; width: 100%%; text-align: center; }
  h1 { font-size: 18px; font-weight: 700; color: #0052d9; margin: 0 0 12px; letter-spacing: -0.3px; }
  p { font-size: 13px; color: #5a6b7f; margin: 8px 0; }
  .email { font-family: ui-monospace, SFMono-Regular, monospace; color: #0d1a2d;
           background: #f5f7fa; padding: 2px 6px; border-radius: 2px; font-size: 12px; }
  .home { display: inline-block; margin-top: 18px; font-size: 12px; color: #8ea0b4;
          text-decoration: none; border-bottom: 1px solid #cdd5df; padding-bottom: 1px; }
</style>
</head>
<body>
<div class="card">
  <h1>已退订</h1>
  <p><span class="email">%s</span> 后续不再接收来自《%s》的评论回复通知。</p>
  <p style="font-size:12px;color:#8ea0b4;margin-top:18px;">
    若想恢复接收，回复任意一条评论或在站点重新留言即可。
  </p>
  <a class="home" href="%s">返回首页</a>
</div>
</body>
</html>`

const unsubPageBad = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>链接无效 — %s</title>
<style>
  body { margin: 0; font: 14px/1.7 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif;
         background: #f4f6f9; color: #0d1a2d; min-height: 100vh; display: flex;
         align-items: center; justify-content: center; padding: 24px; }
  .card { background: #fff; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,0.05);
          padding: 36px 40px; max-width: 460px; width: 100%%; text-align: center; }
  h1 { font-size: 18px; font-weight: 700; color: #dc2626; margin: 0 0 12px; letter-spacing: -0.3px; }
  p { font-size: 13px; color: #5a6b7f; margin: 8px 0; }
  .home { display: inline-block; margin-top: 18px; font-size: 12px; color: #8ea0b4;
          text-decoration: none; border-bottom: 1px solid #cdd5df; padding-bottom: 1px; }
</style>
</head>
<body>
<div class="card">
  <h1>链接无效</h1>
  <p>这条退订链接已损坏或过期。如果你确实想停止接收通知，请到任一邮件底部点击新的退订链接。</p>
  <a class="home" href="%s">返回首页</a>
</div>
</body>
</html>`

// UnsubscribeCommentReply handles GET /api/v1/unsubscribe/comment-reply.
// Public route — no auth.
func UnsubscribeCommentReply(c *gin.Context) {
	site := email.LoadSiteData()
	emailEnc := c.Query("e")
	sig := c.Query("t")

	addr := email.VerifyCommentReplyUnsubscribe(emailEnc, sig)
	if addr == "" {
		c.Header("Content-Type", "text/html; charset=utf-8")
		c.String(http.StatusBadRequest, unsubPageBad, site.Title, site.URL)
		return
	}

	email.AddCommentReplyOptout(addr)

	c.Header("Content-Type", "text/html; charset=utf-8")
	c.String(http.StatusOK, unsubPageOK, site.Title, addr, site.Title, site.URL)
}
