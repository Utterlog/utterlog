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
	// to the image-generation provider. {style} and {text_policy} are
	// short English directive phrases (image models respond best to
	// concrete visual vocabulary in English regardless of the rest
	// of the prompt language) that the handler resolves from the
	// admin's 图片风格 / 文字策略 dropdown choices. {excerpt_block}
	// is a pre-formatted "文章主题：..." line OR empty when the post
	// has no excerpt — saves the template from needing conditional
	// logic.
	DefaultCoverPrompt = `{style}为文章《{title}》生成封面图。{excerpt_block}{text_policy}画质要求：高质量、专业构图、适合作为博客文章题图。`
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
	"summary":   DefaultSummaryPrompt,
	"slug":      DefaultSlugPrompt,
	"keywords":  DefaultKeywordsPrompt,
	"polish":    DefaultPolishPrompt,
	"questions": DefaultQuestionsPrompt,
	"cover":     DefaultCoverPrompt,
}
