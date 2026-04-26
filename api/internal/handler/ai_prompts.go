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
	//
	// 重点防范模型常见的失败模式：
	//   - "本文介绍了 / 通过 X，作者表达了 Y" 套话开头
	//   - 摘抄原文第一段而非提炼
	//   - 字数严重超标或不足
	//   - 输出 Markdown / emoji / 引号包裹
	DefaultSummaryPrompt = `你是一名专业编辑，请为以下文章写一段中文摘要。

要求：
1. 字数严格控制在 {min_len}-{max_len} 字
2. 提炼文章核心观点和关键信息，不要简单复述第一段
3. 用陈述句直接表达，不用"本文介绍了"、"通过…作者表达了"、"这篇文章讨论了"等套话开头
4. 保持中性客观语气，不要加自己的评价
5. 直接输出摘要内容，不要前缀、引号、Markdown 标记、emoji 或解释
6. 不要换行，全部写成一段

标题：{title}
{excerpt_section}正文：{content}`

	// DefaultSlugPrompt — used by AISlug. URL slugs are best in
	// English regardless of the article's source language because
	// non-ASCII paths break some CDNs and analytics tools.
	//
	// 重点防范：
	//   - 整句翻译压缩（output 太长 / 太啰嗦）
	//   - 包含 "the" "a" "of" "and" 等无意义虚词
	//   - 包含版本号 / 数字之外的特殊字符
	//   - 输出引号包裹或加 .html 后缀
	DefaultSlugPrompt = `为以下文章生成 SEO 友好的英文 URL slug。

规则：
- 提取标题里的 2-5 个关键概念词，用 - 连接（不是整句翻译）
- 全小写字母 + 数字 + 连字符 -，禁用下划线 / 空格 / 任何标点
- 长度 20-50 字符为佳，不超过 60 字符
- 跳过冠词 / 介词等无意义词（the / a / an / of / for / to / in / on / and）
- 保留版本号、年份等关键数字（如 v2 / 2024）
- 不要文件后缀（不加 .html / .htm）

好例子：
  标题"Debian + 宝塔面板安装 phpMyAdmin 6" → debian-bt-panel-install-phpmyadmin-6
  标题"我的 2025 年中秋节" → my-2025-mid-autumn
  标题"如何用 React Hooks 重构组件" → react-hooks-refactor-components

直接输出 slug 字符串，不加任何引号、解释或前后缀。

文章标题：{title}`

	// DefaultKeywordsPrompt — used by AITags.
	//
	// 重点防范：
	//   - 输出泛词（"博客 / 技术 / 文章 / 内容"）—— 这些标签做搜索/分类毫无价值
	//   - 把整句压缩成长标签
	//   - 输出英文（除非原文就是英文）
	//   - 输出多于 / 少于要求的数量
	DefaultKeywordsPrompt = `从以下文章中提取恰好 {tags_count} 个最能代表文章主题的关键词作为标签。

要求：
- 优先级：具体技术名 / 工具 / 产品 > 主题领域 > 概念抽象（避免泛词）
- 每个标签 2-6 字，单个名词或专有名词，不要短语或句子
- 禁用泛词：博客、技术、文章、内容、教程、分享、笔记、随笔、生活、思考
- 输出语言跟随原文（中文文章 → 中文标签；英文文章 → 英文标签）
- 仅输出 {tags_count} 个标签，用英文逗号 ", " 分隔
- 不要编号、不要解释、不要 emoji、不要引号

好例子：
  Linux 服务器博客文章 → Debian, 宝塔面板, phpMyAdmin, MySQL, 运维
  React 组件文章       → React, Hooks, 组件设计, 状态管理, TypeScript

标题：{title}
内容：{content}`

	// DefaultPolishPrompt — used by AIFormat (排版/润色 button).
	//
	// 重点防范（这是用户痛点最多的提示词，模型最容易过度改写）：
	//   - 改写技术术语 / 代码内容 / 命令参数（破坏正确性）
	//   - 把作者的"我"改成"我们 / 笔者"（语气漂移）
	//   - 把短句合并成长句、长句拆短句（节奏改变）
	//   - 给文章加"总结 / 引言 / 前言"等额外段落
	//   - 输出包裹在 ``` 代码块里
	DefaultPolishPrompt = `请优化以下 Markdown 格式的文章排版与文字流畅度。这是排版润色，不是改写或改稿。

只能改：
- 错别字、明显的标点误用、多余空格
- 中英文 / 中数字之间的空格规范化
- 段落分布（过长的段落适度拆开，过碎的段落适度合并）
- 必要时补充 Markdown 标题层级（## ###）和列表 / 引用，前提是原文语义已经隐含这些结构
- 表格、代码块、引用块的对齐 / 缩进

绝对不能改：
- 任何代码块（Markdown 三反引号围栏 + 缩进式代码块）的内容一字不改，包括缩进和注释
- 任何技术术语、产品名、命令、URL、文件路径、版本号
- 作者的人称（保持"我 / 你"原样）和口吻
- 文字内容本身：不增加新观点、不删减信息、不替换表述方式
- 文章语言：中文保中文、英文保英文，不翻译

输出要求：
- 只输出优化后的 Markdown 全文，不加任何解释或注释
- 不要在文章前后加"总结 / 前言 / 修改说明"等额外段落
- 不要把整篇文章再包一层 Markdown 代码围栏
- 保留原文开头和结尾的所有内容

文章原文：

{content}`

	// DefaultQuestionsPrompt — used by generateAIQuestions to
	// pre-bake the reader-chat suggested-question chip row.
	//
	// 重点防范：
	//   - 模型常吐套路问题（"这篇文章的主要观点是什么？"）—— 没有信息量
	//   - 问题过长（chip 显示截断）
	//   - 跟文章实际内容无关的"推论问题"
	//   - 输出编号 / Markdown 标记
	DefaultQuestionsPrompt = `阅读以下文章，假设你是一名感兴趣的读者，生成 3 个具体、有价值的提问。

要求：
- 问题必须基于文章实际内容，提到文中出现的具体名词、概念或场景
- 每个问题 8-20 字，简洁直接，便于显示成胶囊式按钮
- 三个问题角度尽量分散：例如「具体细节」「应用场景」「替代方案 / 对比」「注意事项」「下一步」
- 用与文章相同的语言（中文文章用中文、英文文章用英文）
- 每行一个问题，纯文本，不要编号、不要 1./2./3.、不要 -、不要 emoji、不要引号

避免的烂问题模板：
- "这篇文章的主要观点是什么"
- "作者想表达什么"
- "可以详细介绍一下吗"
- "这个工具好用吗"

好问题示例（针对 phpMyAdmin 安装文章）：
- 升级 PHP 8.4 后为什么会冲突？
- 6.0 快照版稳定吗？
- 有没有 Composer 之外的安装方式？

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
	DefaultCoverPrompt = `画面要求：纯视觉抽象插画，画面里不能出现任何文字、字母、数字、英文单词、Logo、水印或 UI 元素。

{excerpt_block}画面表达的氛围（仅供色调和构图参考，不要把这段文字画到画面里）：{title}

视觉风格：
- 现代极简数字插画，柔和渐变色块为主体，配少量几何线条或抽象光影
- 配色：低饱和度，2-3 种和谐色调，留白充足
- 构图：16:9 横版，画面左侧或中间留出 30-40% 干净空白区域（用于后期叠加博客标题文字）
- 画质：高清细腻，专业级数字艺术，柔光过渡

绝对禁止：
- 任何形态的文字 / 字母 / 单词 / 数字 / 符号
- 写实人物面部特写
- 复杂混乱的细节、过度饱和的色彩、噪点纹理过重
- 流行 logo / 品牌元素 / 软件 UI 截图
- 字幕、标题栏、版权水印`

	// DefaultCommentAuditPrompt — used by auditComment to ask the
	// AI whether a visitor's comment should be auto-approved or
	// flagged. JSON-only response is enforced via the system prompt
	// so we can parse {passed, confidence, reason} reliably without
	// regex acrobatics. Audit calls run with low temperature (0.1)
	// for deterministic verdicts; reply calls keep the chat default.
	//
	// Placeholders: {content} — the raw comment text (UTF-8).
	//
	// 重点防范：
	//   - 把"这文章一般"等正常负面评价误判为辱骂
	//   - 把短评论（"赞" / "学到了"）误判为刷屏
	//   - 把表情或重复符号误判为攻击
	//   - 输出非 JSON 格式（解释段、Markdown 包裹、思考过程）
	//   - confidence 缺失或非 0.0-1.0 数值
	DefaultCommentAuditPrompt = `你是博客评论审核员，对访客评论做内容合规判定。请只输出严格 JSON。

判定 不通过 的情形：
1. 政治敏感、辱华、煽动民族 / 群体对立
2. 色情、淫秽、暴力血腥、恐怖威胁
3. 赌博、毒品、违法行为引导或宣传
4. 针对个人的辱骂、攻击性脏话、人身羞辱
5. 垃圾广告（推销、推广链接、刷单兼职诱导、诈骗）
6. 完全无意义的字符重复 / 刷屏（连续超过 10 个相同字符）

判定 通过 的情形（要保护正常交流）：
- 简短表态（"赞" / "学到了" / "+1" / "顶"）—— 是正常评论
- 正常负面观点（"我不太同意" / "这做法不太好" / "感觉一般"）—— 不是辱骂
- 表情符号 / 颜文字 / Emoji —— 不是刷屏
- 跟文章无关但合规的闲聊
- 包含建议、提问、纠错的反馈

confidence 评分标准：
- 1.0 = 极度肯定（明显合规或明显违规）
- 0.8 = 比较确定
- 0.5 = 模糊边界
- 0.3 以下不要输出，遇到完全模糊的归 0.5 + passed=true

只输出严格 JSON，单行，不加任何前后说明 / Markdown / 代码块：
{"passed": true|false, "confidence": 0.0-1.0, "reason": "简要原因，限 30 字内"}

待审核评论：
{content}`

	// DefaultCommentReplyPrompt — used by generateAICommentReply to
	// produce the reply text that lands in ul_ai_comment_queue.
	// {context_block} expands to optional 文章标题/摘要/父评论 lines
	// (controlled by admin's ai_comment_reply_context_* toggles).
	// Empty context_block collapses cleanly when no context is on.
	//
	// Placeholders: {content}, {context_block}.
	//
	// 重点防范（这是用户体验最敏感的提示词）：
	//   - "感谢您的评论 / 谢谢分享"等机械化开头让人一眼识破
	//   - 复述评论内容（用户问什么，AI 重复一遍再答）
	//   - 把博主写成"小编 / 笔者 / 编辑"
	//   - 套用"非常 / 确实 / 的确"等冗余副词
	//   - 对所有评论都说"很高兴和你交流"
	//   - 输出署名 / "—— 博主"等结尾
	DefaultCommentReplyPrompt = `你是这个博客的博主本人，正在用自己的语气回复读者评论。请像跟朋友聊天一样自然，避免任何机械感。

回复风格：
- 直接切入主题，**不要任何客套开头**（禁用："感谢您的评论"、"谢谢分享"、"您好"、"很高兴看到您的留言"）
- 第一人称用"我"，不用"小编 / 笔者 / 编辑 / 博主"
- 不要复述对方说了什么，直接回应观点
- 提问 → 给具体答案；赞同 → 简短回谢 + 补充观点；不同意 → 礼貌但坚定回应；建议 → 表示考虑
- 长度 30-100 字（短评论简短回；长讨论多展开几句）
- 跟评论同语言（中文 → 中文，英文 → 英文）
- 自然口语感，可以用"嗯"、"对"、"其实"、"哈哈"等语气词，但克制使用
- 不加签名、不加"祝好"等结尾

避免这些烂回复：
- "感谢您的关注，您说得很有道理！"（套话 + 没内容）
- "您提到的 X 问题，我想说 Y..."（复述 + 啰嗦）
- "非常感谢您的提问 ❤️"（emoji + 客套）

好回复示例：
- 读者「升级到 PHP 8.4 真的有性能提升吗？」
  → "实测我自己的博客响应快了大概 15-20%，主要是 JIT 优化对老代码也生效。不过不少 WP 插件还没适配，要看你跑什么。"
- 读者「这个排版好难看」
  → "哈哈直接 😂。具体哪里别扭可以说一下，我看看能不能改进。"
- 读者「写得不错」
  → "谢谢，最近在试着把技术文写得更口语化一点，欢迎多反馈。"

{context_block}读者评论：
{content}

直接输出回复内容（纯文本，不加引号 / 前缀 / 署名 / 任何解释）：`
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
