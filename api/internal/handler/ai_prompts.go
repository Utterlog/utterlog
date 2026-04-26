package handler

import "strings"

// Default Chinese-language prompts for the five customisable AI text
// features. Stored as constants so admins always see the actual
// fallback in the prompt-defaults API response (rather than a vague
// "use built-in default" placeholder), can copy/edit them in the
// 自定义提示词 form, and reset to default with a single click.
//
// Placeholder syntax: {title} {content} {excerpt} {min_len}
// {max_len} {tags_count}. renderPrompt does a literal string replace
// so a typo in the placeholder stays as-is in the final prompt
// rather than blowing up the request — easier to spot when the
// admin previews the rendered output.
const (
	// DefaultSummaryPrompt — used by AISummary (foreground ✨ button)
	// and generateAISummary (background batch / on-publish job).
	DefaultSummaryPrompt = `用中文总结以下文章，控制在 {min_len}-{max_len} 字之间，直接输出总结内容，不要任何前缀、Markdown 标记或 emoji。内容需完整概括文章要点，不要只写一句话：

标题：{title}
{excerpt_section}内容：{content}`

	// DefaultSlugPrompt — used by AISlug. URL slugs are best in
	// English regardless of the article's source language because
	// non-ASCII paths break some CDNs and analytics tools.
	DefaultSlugPrompt = `为以下文章生成简洁、SEO 友好的英文 URL 别名（slug）：
- 全部小写英文字母
- 用连字符 - 分隔，不要下划线
- 不超过 60 个字符
- 不要标点、特殊字符或前后空格

只输出 slug 本身，不要任何解释、引号或前缀。

文章标题：{title}`

	// DefaultKeywordsPrompt — used by AITags.
	DefaultKeywordsPrompt = `从以下文章中提取恰好 {tags_count} 个最能代表主题的关键词或标签，仅返回逗号分隔的列表，不要解释、不要编号、不要 emoji，使用与原文相同的语言：

标题：{title}
内容：{content}`

	// DefaultPolishPrompt — used by AIFormat (排版/润色 button).
	DefaultPolishPrompt = `请优化以下 Markdown 格式的文章，提升排版和可读性：
- 修正错别字、语法、标点
- 改善段落分布与过渡
- 用 Markdown 增加合适的标题层级、列表、引用
- 保持原文语言、原意和作者口吻
- 不要新增内容，不要删除关键信息
- 不要在前后添加总结或解释

直接输出优化后的 Markdown 全文：

{content}`

	// DefaultQuestionsPrompt — used by generateAIQuestions to
	// pre-bake the reader-chat suggested-question chip row.
	DefaultQuestionsPrompt = `根据以下文章，生成 3 个读者可能感兴趣的问题，每行一个，不要编号、不要解释、不要 emoji，使用与原文相同的语言：

标题：{title}
{excerpt_section}内容：{content}`

	// DefaultCoverPrompt — used by AICover to build the prompt sent
	// to the image-generation provider.
	//
	// Why excerpt-first instead of title-first: image-gen models
	// (gpt-image, qwen-image, imagen) treat any string near the
	// front of the prompt as text-to-render. If the title contains
	// English words, code identifiers, or version numbers — e.g.
	// "Debian + 宝塔 安装phpMyAdmin 6" — the model paints a garbled
	// version of those literals onto the canvas. {excerpt_block}
	// describes what the article is about in natural prose, which
	// the model interprets as subject matter instead of label text.
	// {title} is kept only as a low-weight topic hint at the tail.
	//
	// Why "no text" runs at both ends: image models weight leading
	// tokens far more than trailing ones, so a single "不要文字" at
	// the bottom is the weakest possible position. We open with a
	// strong English+Chinese no-text directive, then repeat it at
	// the close as a guard.
	//
	// Placeholders recognised:
	//   {title}         — article title (topic hint only)
	//   {excerpt}       — raw excerpt or empty
	//   {excerpt_block} — '文章主题：<excerpt>\n' OR empty
	//   {style}         — coverStylePhrase output (admin dropdown)
	//   {text_policy}   — coverTextPolicyPhrase output (admin dropdown)
	//
	// Admin can clear the textarea + 保存 to fall back to this
	// constant, or edit freely.
	DefaultCoverPrompt = `Absolutely no text, no letters, no numbers, no words, no logos, no watermarks, no UI elements anywhere in the image. 纯视觉画面，禁止出现任何文字字符。

{excerpt_block}主题参考：{title}

极简风格的现代博客封面插画，抽象柔和的视觉意象，低饱和度配色，柔和渐变背景，轻微颗粒纹理，留白构图，专业柔光，空间层次感，中间或左侧大面积留白便于后期叠加标题文字，高质量数字插画，16:9 横版，避免人物面部特写。

再次强调：画面中不得出现任何文字、字母、数字或符号。`

	// DefaultCommentAuditPrompt — used by auditComment to ask the
	// AI whether a visitor's comment should be auto-approved or
	// flagged. JSON-only response is enforced via the system prompt
	// so we can parse {passed, confidence, reason} reliably without
	// regex acrobatics. Audit calls run with low temperature (0.1)
	// for deterministic verdicts; reply calls keep the chat default.
	//
	// Placeholders: {content} — the raw comment text (UTF-8).
	DefaultCommentAuditPrompt = `你是博客评论审核员，需要判断访客评论是否符合社区规范。

审核维度：
1. 不含政治敏感、辱华、煽动内容
2. 不含色情、暴力、恐怖描述
3. 不含赌博、毒品、违法引导
4. 不含人身攻击、恶意辱骂
5. 不含垃圾广告、推广链接、诱导诈骗
6. 不含纯刷屏、无意义重复字符

只返回严格 JSON，不要任何额外文字 / Markdown 标记 / 代码块包裹：
{"passed": true|false, "confidence": 0.0-1.0, "reason": "简要原因"}

待审核评论：
{content}`

	// DefaultCommentReplyPrompt — used by generateAICommentReply to
	// produce the reply text that lands in ul_ai_comment_queue.
	// {context_block} expands to optional 文章标题/摘要/父评论 lines
	// (controlled by admin's ai_comment_reply_context_* toggles).
	// Empty context_block collapses cleanly when no context is on.
	//
	// Placeholders: {content}, {context_block}.
	DefaultCommentReplyPrompt = `你是这个博客的博主，需要用自然亲切、有人情味的语气回复读者评论。

回复要求：
1. 针对评论内容给出有价值、有针对性的回应
2. 提问类评论给出明确的答案
3. 赞美类评论表示感谢并鼓励交流
4. 批评类评论理性回应，不卑不亢
5. 长度控制在 50-150 字
6. 使用与读者评论相同的语言（中文为主）
7. 不要使用过于正式或机械化的开头（如"感谢您的评论"）
8. 不要复述评论内容，直接回应观点

{context_block}读者评论：
{content}

请直接给出回复内容，不要任何前缀、署名或解释：`
)

// renderPrompt performs literal {placeholder} substitution. A missing
// vars[k] silently leaves the placeholder visible in the output —
// makes typos obvious during preview rather than crashing the call.
//
// Compat shim: if the template references NO known placeholders at
// all (legacy admin-customised prompts written before placeholders
// existed all looked like "Extract keywords from this article."
// without any way to inject the article body), append a tail
// containing 标题/内容 so the article actually reaches the model.
// Without this, an old saved prompt produces requests where the AI
// asks "please provide the article" because the body never made it
// past the template.
func renderPrompt(tpl string, vars map[string]string) string {
	out := tpl
	if !templateHasContentRef(tpl) {
		// Append the standard article tail using whatever vars are
		// available. excerpt_section already includes its own
		// "摘要：...\n" wrapper when populated.
		var tail strings.Builder
		tail.WriteString("\n\n")
		if _, ok := vars["title"]; ok {
			tail.WriteString("标题：{title}\n")
		}
		if v, ok := vars["excerpt_section"]; ok && v != "" {
			tail.WriteString("{excerpt_section}")
		}
		if _, ok := vars["content"]; ok {
			tail.WriteString("内容：{content}")
		}
		out = out + tail.String()
	}
	for k, v := range vars {
		out = strings.ReplaceAll(out, "{"+k+"}", v)
	}
	return out
}

// templateHasContentRef returns true if the template references at
// least one of the post-content placeholders. We don't count
// {min_len}/{max_len}/{tags_count} because those are knobs, not
// the actual article body.
func templateHasContentRef(tpl string) bool {
	for _, k := range []string{"{title}", "{content}", "{excerpt}", "{excerpt_section}"} {
		if strings.Contains(tpl, k) {
			return true
		}
	}
	return false
}

// resolvePrompt returns the admin-saved prompt (trimmed) when set,
// else the constant default. Caller passes the raw option value
// fetched via model.GetOption — this keeps the import graph
// straight (handler/ai_prompts.go has no Go-side dependencies).
func resolvePrompt(saved, defaultPrompt string) string {
	if v := strings.TrimSpace(saved); v != "" {
		return v
	}
	return defaultPrompt
}

// AIPromptDefaults — the payload returned by GET
// /api/v1/admin/ai/prompt-defaults so the admin form can pre-fill
// textareas with the actual fallback string instead of a generic
// "留空使用默认" placeholder. Keeps the form and the dispatcher
// in lockstep — admins see exactly what runs when they leave a
// field empty.
var AIPromptDefaults = map[string]string{
	"summary":       DefaultSummaryPrompt,
	"slug":          DefaultSlugPrompt,
	"keywords":      DefaultKeywordsPrompt,
	"polish":        DefaultPolishPrompt,
	"questions":     DefaultQuestionsPrompt,
	"cover":         DefaultCoverPrompt,
	"comment-audit": DefaultCommentAuditPrompt,
	"comment-reply": DefaultCommentReplyPrompt,
}
