// Command preview-emails renders every built-in email template with a
// realistic sample payload and writes a single combined preview HTML.
//
// Usage:
//   cd api && go run ./cmd/preview-emails -o /tmp/utterlog-email-preview.html
//
// The output page wraps each rendered email in its own iframe so the
// templates' own <html><body> isolation is preserved (real mail clients
// each render their own document).
package main

import (
	"flag"
	"fmt"
	"html"
	"log"
	"os"
	"strings"

	"utterlog-go/internal/email"
)

type sample struct {
	name    string // template basename, e.g. "verify_code"
	label   string // human label
	subject string // typical subject line
	data    any
}

func main() {
	out := flag.String("o", "/tmp/utterlog-email-preview.html", "output HTML path")
	flag.Parse()

	site := email.SiteData{
		Title:      "西风日志",
		URL:        "https://xifeng.net",
		Domain:     "xifeng.net",
		Logo:       "https://xifeng.net/logo.jpg", // 真实站点 logo
		FirstChar:  "西",
		AdminURL:   "https://xifeng.net/admin",
		MailFrom:   "no-reply@xifeng.net",
		BrandColor: "#0052D9",
	}

	samples := []sample{
		{
			name:    "verify_code",
			label:   "验证码",
			subject: "你的登录验证码：284615",
			data: email.VerifyCodeData{
				Site:       site,
				Code:       "284615",
				ExpireMins: 10,
				Purpose:    "登录",
				SupportURL: "https://xifeng.net/contact",
			},
		},
		{
			name:    "password_reset",
			label:   "密码重置",
			subject: "重置你的西风日志后台密码",
			data: email.PasswordResetData{
				Site:        site,
				UserName:    "西风",
				ResetURL:    "https://xifeng.net/admin/reset?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.demo.preview",
				ExpireMins:  60,
				IP:          "120.245.32.18",
				IPLocation:  "广东 广州 · 移动",
				CountryCode: "cn",
				RequestedAt: "2026-05-04 11:32:18",
			},
		},
		{
			name:    "new_comment",
			label:   "新评论(站长通知)",
			subject: "皇家元林 在《Utterlog 上线公告》发表了新评论",
			data: email.NewCommentData{
				Site:             site,
				Author:           "皇家元林",
				Email:            "yuanlin@example.com",
				URL:              "https://yuanlin.example.com",
				IP:               "120.245.32.18",
				IPLocation:       "广东 广州 · 移动",
				CountryCode:      "cn",
				Content:          "挺不错的[:dacall:]，项目不少啊! [:tieba_yes:] domain.ls 是你的吗？怎么打不开了",
				PostTitle:        "Utterlog 上线公告",
				PostURL:          "https://xifeng.net/p/utterlog-launch#comment-128",
				PostedAt:         "2026-05-03 20:05:32",
				ManageCommentURL: "https://xifeng.net/admin/comments",
			},
		},
		{
			name:    "pending_comment",
			label:   "待审核评论",
			subject: "《Utterlog 上线公告》收到一条新评论，等待审核",
			data: email.PendingCommentData{
				Site:        site,
				Author:      "皇家元林",
				Email:       "yuanlin@example.com",
				URL:         "https://yuanlin.example.com",
				Content:     "demo.utterlog.io 这个也打不开了[:weixiao:]，utterlog 只支持 docker 部署吗？能不能源码部署，或者 go 程序运行？",
				IP:          "120.245.32.18",
				IPLocation:  "广东 广州 · 移动",
				CountryCode: "cn",
				PostTitle:   "Utterlog 上线公告",
				PostURL:     "https://xifeng.net/p/utterlog-launch#comment-128",
				PostedAt:    "2026-05-03 20:05:32",
				ModerateURL: "https://xifeng.net/admin/comments?status=pending",
				ApproveURL:  "https://xifeng.net/admin/comments/9527/approve?sig=preview",
			},
		},
		{
			name:    "comment_reply",
			label:   "评论回复(访客通知)",
			subject: "西风 回复了你在《Utterlog 上线公告》的评论",
			data: email.CommentReplyData{
				Site:            site,
				RecipientName:   "皇家元林",
				ReplierName:     "西风",
				PostTitle:       "Utterlog 上线公告",
				OriginalContent: "demo.utterlog.io 这个也打不开了[:weixiao:]，utterlog 只支持 docker 部署吗？",
				ReplyContent:    "分前端后端，所以 docker 比较好[:dacall:]，但是占用资源不多的，demo 这个站因为这个程序一直还没完善好，我就没去搭建检测试站。我晚点搭建一个我把账号密码发你邮箱你看看[:fadai:]。",
				PostURL:         "https://xifeng.net/p/utterlog-launch#comment-129",
				UnsubscribeURL:  "https://xifeng.net/unsubscribe?token=preview",
			},
		},
		{
			name:    "link_request",
			label:   "友链申请",
			subject: "新的友链申请：皇家元林",
			data: email.LinkRequestData{
				Site:            site,
				RequesterName:   "皇家元林",
				RequesterURL:    "https://yuanlin.example.com",
				RequesterAvatar: "",
				Email:           "yuanlin@example.com",
				Description:     "一个分享技术与生活的小站，主要写 Web 开发、Linux 运维相关。",
				RSSURL:          "https://yuanlin.example.com/rss.xml",
				UtterlogID:      "yuanlin",
				ApproveURL:      "https://xifeng.net/admin/links/12/approve?sig=preview",
				RejectURL:       "https://xifeng.net/admin/links/12/reject?sig=preview",
			},
		},
		{
			name:    "upgrade",
			label:   "升级成功",
			subject: "西风日志已升级到 v2.1.2",
			data: email.UpgradeData{
				Site:    site,
				Version: "v2.1.2",
				Highlights: []string{
					"修复评论深层回复链在前端被重复渲染的问题",
					"Azure 主题侧栏欢迎卡片右侧分割线消除",
					"友链更新板块切换时支持随机刷新 5 条订阅",
				},
				ChangelogURL: "https://utterlog.io/changelog",
			},
		},
		{
			name:    "incident",
			label:   "异常告警",
			subject: "[告警] 西风日志检测到 SMTP 发送异常",
			data: email.IncidentData{
				Site:       site,
				ErrorType:  "SMTP send failure",
				Location:   "internal/handler/comment.go:482",
				Component:  "EmailQueue",
				OccurredAt: "2026-05-03 20:14:32 +08:00",
				Host:       "hz-utterlog (116.202.171.136)",
				Duration:   "已持续 4 分 12 秒",
				UserImpact: "约 6 条评论通知未送达",
				LogsURL:    "https://xifeng.net/admin/logs?level=error",
				StatusURL:  "https://status.utterlog.io",
			},
		},
	}

	var b strings.Builder
	b.WriteString(`<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>Utterlog 邮件模板预览</title>
<style>
  body { margin: 0; font: 14px/1.6 -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif; background: #eef1f5; color: #0d1a2d; }
  .topbar { position: sticky; top: 0; z-index: 10; background: #0d1a2d; color: #fff; padding: 14px 28px; box-shadow: 0 2px 8px rgba(0,0,0,0.15); }
  .topbar h1 { margin: 0 0 6px; font-size: 16px; font-weight: 600; letter-spacing: -0.2px; }
  .topbar nav { display: flex; flex-wrap: wrap; gap: 8px; font-size: 12px; }
  .topbar nav a { color: #a8c4ff; text-decoration: none; padding: 4px 10px; background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08); }
  .topbar nav a:hover { background: rgba(255,255,255,0.14); color: #fff; }
  .wrap { max-width: 760px; margin: 0 auto; padding: 28px 24px 80px; }
  .card { background: #fff; border: 1px solid #d9dee5; margin-bottom: 28px; }
  .card-head { padding: 14px 18px; border-bottom: 1px solid #e5e9ee; background: #f8fafc; }
  .card-head .label { font-size: 11px; color: #8ea0b4; letter-spacing: 0.5px; text-transform: uppercase; }
  .card-head .name { font-size: 15px; font-weight: 600; margin: 2px 0 4px; }
  .card-head .subject { font-size: 13px; color: #5a6b7f; }
  .card-head .subject b { color: #0d1a2d; font-weight: 500; }
  iframe { display: block; width: 100%; border: 0; background: #f4f6f9; }
</style>
</head>
<body>
<div class="topbar">
  <h1>Utterlog 邮件模板预览 · 共 ` + fmt.Sprint(len(samples)) + ` 个</h1>
  <nav>`)
	for _, s := range samples {
		b.WriteString(fmt.Sprintf(`<a href="#%s">%s</a>`, s.name, html.EscapeString(s.label)))
	}
	b.WriteString(`</nav>
</div>
<div class="wrap">
`)

	for _, s := range samples {
		body, err := email.Render(s.name, s.data)
		if err != nil {
			log.Printf("render %s: %v", s.name, err)
			continue
		}
		// 估算高度:每行约 22px,加上 padding 余量
		approxHeight := 600 + strings.Count(body, "\n")*4
		if approxHeight < 700 {
			approxHeight = 700
		}
		b.WriteString(fmt.Sprintf(`
<section id="%s" class="card">
  <div class="card-head">
    <div class="label">%s</div>
    <div class="name">%s.html</div>
    <div class="subject">主题示例：<b>%s</b></div>
  </div>
  <iframe srcdoc="%s" style="height:%dpx"></iframe>
</section>
`, s.name, html.EscapeString(s.label), s.name,
			html.EscapeString(s.subject),
			html.EscapeString(body),
			approxHeight,
		))
	}
	b.WriteString(`</div>
</body>
</html>
`)

	if err := os.WriteFile(*out, []byte(b.String()), 0644); err != nil {
		log.Fatalf("write %s: %v", *out, err)
	}
	fmt.Printf("preview written: %s (%d templates)\n", *out, len(samples))
}
