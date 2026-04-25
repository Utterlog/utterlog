package handler

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// Presets
//
// Newest model id is listed first in each models slice so the admin
// form's <select> defaults to the latest option when a preset is
// applied. Older models stay in the list for users who want to pin
// to a specific generation (cost, behaviour stability, etc.).
var AIPresets = gin.H{
	"openai":   gin.H{"name": "OpenAI", "endpoint": "https://api.openai.com/v1/chat/completions", "models": []string{"gpt-5.5", "gpt-5", "gpt-4.1", "gpt-4.1-mini", "o3-mini"}},
	"deepseek": gin.H{"name": "DeepSeek", "endpoint": "https://api.deepseek.com/chat/completions", "models": []string{"deepseek-v4", "deepseek-v3", "deepseek-chat", "deepseek-reasoner"}},
	"gemini":   gin.H{"name": "Google Gemini", "endpoint": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "models": []string{"gemini-2.5-pro", "gemini-2.5-flash"}},
	"qwen":     gin.H{"name": "Qwen · 文本", "endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "models": []string{"qwen3-max", "qwen-plus", "qwen-turbo"}},
	"kimi":     gin.H{"name": "Kimi", "endpoint": "https://api.moonshot.cn/v1/chat/completions", "models": []string{"kimi-k2.6", "kimi-k2.5", "kimi-latest"}},
	"minimax":  gin.H{"name": "MiniMax", "endpoint": "https://api.minimax.chat/v1/text/chatcompletion_v2", "models": []string{"MiniMax-M2.5"}},
	"zhipu":    gin.H{"name": "智谱 AI", "endpoint": "https://open.bigmodel.cn/api/paas/v4/chat/completions", "models": []string{"glm-4.7-flash"}},
	"doubao":   gin.H{"name": "豆包", "endpoint": "https://ark.cn-beijing.volces.com/api/v3/chat/completions", "models": []string{"doubao-seed-1.8"}},
	// Anthropic Claude. Endpoint is Anthropic's native /v1/messages
	// (NOT an OpenAI-compatible /chat/completions). The Go AI caller
	// auto-detects the api.anthropic.com host and switches request
	// format accordingly; if you proxy Claude through a third-party
	// gateway that exposes an OpenAI-compat /chat/completions, change
	// the endpoint after applying the preset.
	"anthropic": gin.H{"name": "Anthropic Claude", "endpoint": "https://api.anthropic.com/v1/messages", "models": []string{"claude-opus-4-7", "claude-sonnet-4-7", "claude-opus-4-5", "claude-sonnet-4-5"}},
	// Embedding presets — only providers that actually expose an
	// OpenAI-compatible /embeddings endpoint. DeepSeek used to live
	// here as 'deepseek-embedding' pointing at api.deepseek.com/
	// embeddings but DeepSeek only ships chat completions; that
	// endpoint 404s and the model name was fictional, so the preset
	// produced a 'looks legit, never works' provider entry. Removed.
	"openai-embedding": gin.H{"name": "OpenAI Embedding", "endpoint": "https://api.openai.com/v1/embeddings", "models": []string{"text-embedding-3-small", "text-embedding-3-large"}, "type": "embedding"},
	"qwen-embedding":   gin.H{"name": "Qwen · Embedding", "endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1/embeddings", "models": []string{"text-embedding-v3"}, "type": "embedding"},

	// Image-generation presets — wired to handler/ai_image.go
	// GenerateAIImage. Three families are dispatched there based on
	// the endpoint URL:
	//
	//   - OpenAI Images API           (gpt-image-1 / dall-e-3)
	//   - Aliyun DashScope compat     (通义万相 wanx2.x)
	//   - Google Imagen native API    (imagen-4 / imagen-3 :predict)
	//
	// Other "image" presets (CogView / SeedDream / MiniMax / FLUX)
	// are deliberately not added — none of them implement the
	// OpenAI-compat shape natively and adding them would create
	// more placebo settings. Users can still self-add via the
	// 添加提供商 modal if they have a working OpenAI-compat proxy
	// in front of those services.
	// gpt-image-2 first (newest; the model behind 'ChatGPT 图像 2.0').
	// gpt-image-1 + dall-e-3 stay listed for users on older API keys
	// that haven't been granted gpt-image-2 access yet.
	"openai-image": gin.H{"name": "OpenAI 图像", "endpoint": "https://api.openai.com/v1/images/generations", "models": []string{"gpt-image-2", "gpt-image-1", "dall-e-3"}, "type": "image"},
	// Aliyun DashScope qwen-image (synchronous multimodal-generation
	// endpoint) on the latest qwen-image-2.0-pro. Single request
	// returns the rendered image URL — no async polling. Beijing
	// region by default; switch to dashscope-intl.aliyuncs.com if
	// outside mainland China.
	//
	// 'Qwen · 文本' / 'Qwen · Embedding' / 'Qwen · 图像' naming so
	// the three Aliyun chips visually cluster in the 添加提供商
	// modal. They still produce three separate ai_providers rows
	// because dispatch reads the type column (text / embedding /
	// image) — but the family relationship is now obvious.
	//
	// 万相 (wanx) async API was previously a sibling preset here.
	// Removed per user request — wanx requires task_id polling and
	// kept the picker noisy alongside the simpler sync qwen-image
	// path. Users who specifically want wanx can still hand-edit a
	// provider's endpoint to:
	//   https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis
	// with a wanx2.x model id; handler/ai_image.go still recognises
	// that pattern and routes to generateDashScopeImage with polling.
	"qwen-image": gin.H{"name": "Qwen · 图像", "endpoint": "https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation", "models": []string{"qwen-image-2.0-pro"}, "type": "image"},
	"imagen":     gin.H{"name": "Google Imagen", "endpoint": "https://generativelanguage.googleapis.com/v1beta/models/imagen-4.0-generate-preview-06-06:predict", "models": []string{"imagen-4.0-generate-preview-06-06", "imagen-3.0-generate-002"}, "type": "image"},
}

func GetAIProviders(c *gin.Context) {
	var providers []model.AIProvider
	config.DB.Select(&providers, "SELECT * FROM "+config.T("ai_providers")+" ORDER BY sort_order ASC, id ASC")
	if providers == nil {
		providers = []model.AIProvider{}
	}
	// purposes lets the admin frontend render the
	// 功能模型分配 dropdowns dynamically — adding a new purpose
	// is a server-side-only change, no admin SPA rebuild needed.
	//
	// prompt_defaults exposes the built-in Chinese fallback prompts
	// (handler/ai_prompts.go) so the admin form can pre-fill the
	// 自定义提示词 textareas with the actual default rather than
	// a vague placeholder. Editing then saving over the default
	// stores a custom value; clearing the textarea and saving
	// restores default behaviour.
	util.Success(c, gin.H{
		"providers":        providers,
		"presets":          AIPresets,
		"purposes":         AIPurposes,
		"prompt_defaults":  AIPromptDefaults,
	})
}

func SaveAIProvider(c *gin.Context) {
	var req model.AIProvider
	c.ShouldBindJSON(&req)
	if req.Name == "" || req.Endpoint == "" || req.Model == "" {
		util.BadRequest(c, "名称、端点和模型为必填项"); return
	}
	now := time.Now().Unix()
	t := config.T("ai_providers")
	// Auto-generate unique slug if empty or duplicate
	if req.Slug == "" {
		req.Slug = fmt.Sprintf("provider-%d", now)
	}
	if req.ID == 0 {
		var exists int
		config.DB.Get(&exists, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE slug=$1", t), req.Slug)
		if exists > 0 {
			req.Slug = fmt.Sprintf("%s-%d", req.Slug, now)
		}
	}

	if req.ID > 0 {
		_, err := config.DB.Exec(fmt.Sprintf("UPDATE %s SET name=$1,slug=$2,type=$3,endpoint=$4,model=$5,api_key=$6,temperature=$7,max_tokens=$8,timeout=$9,is_active=$10,is_default=$11,sort_order=$12,updated_at=$13 WHERE id=$14", t),
			req.Name, req.Slug, req.Type, req.Endpoint, req.Model, req.APIKey, req.Temperature, req.MaxTokens, req.Timeout, req.IsActive, req.IsDefault, req.SortOrder, now, req.ID)
		if err != nil { util.Error(c, 500, "DB_ERROR", err.Error()); return }
		util.Success(c, gin.H{"id": req.ID})
	} else {
		var id int
		err := config.DB.QueryRow(fmt.Sprintf("INSERT INTO %s (name,slug,type,endpoint,model,api_key,temperature,max_tokens,timeout,is_active,is_default,sort_order,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id", t),
			req.Name, req.Slug, req.Type, req.Endpoint, req.Model, req.APIKey, req.Temperature, req.MaxTokens, req.Timeout, req.IsActive, req.IsDefault, req.SortOrder, now, now).Scan(&id)
		if err != nil { util.Error(c, 500, "DB_ERROR", err.Error()); return }
		util.Success(c, gin.H{"id": id})
	}
}

func DeleteAIProvider(c *gin.Context) {
	id := c.Param("id")
	config.DB.Exec("DELETE FROM "+config.T("ai_providers")+" WHERE id = $1", id)
	util.Success(c, nil)
}

func TestAIConnection(c *gin.Context) {
	var req struct {
		Endpoint string `json:"endpoint"`
		Model    string `json:"model"`
		APIKey   string `json:"api_key"`
	}
	c.ShouldBindJSON(&req)
	if req.Endpoint == "" || req.Model == "" || req.APIKey == "" {
		util.BadRequest(c, "端点、模型和 API Key 为必填项"); return
	}

	body, _ := json.Marshal(map[string]interface{}{
		"model": req.Model, "messages": []map[string]string{{"role": "user", "content": "Hi, reply OK"}},
		"max_tokens": 10, "temperature": 0.1,
	})
	httpReq, _ := http.NewRequest("POST", req.Endpoint, bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+req.APIKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil { util.Error(c, 500, "CONNECTION_ERROR", err.Error()); return }
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	if errObj, ok := result["error"]; ok {
		util.Error(c, 400, "API_ERROR", fmt.Sprintf("%v", errObj)); return
	}

	content := ""
	if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
		if msg, ok := choices[0].(map[string]interface{})["message"].(map[string]interface{}); ok {
			content = fmt.Sprintf("%v", msg["content"])
		}
	}
	util.Success(c, gin.H{"content": content, "model": req.Model})
}

// buildAdminSystemPrompt assembles the system prompt for the authenticated admin AI chat.
// It starts from the custom ai_system_prompt option, then injects blogger profile and
// site data according to the ai_data_permissions settings.
func buildAdminSystemPrompt() string {
	t := config.T

	// 1. Base system prompt
	base := model.GetOption("ai_system_prompt")
	if base == "" {
		base = "你是 Utterlog 博客系统的专属 AI 助手，服务于博客管理员。你可以帮助管理文章、评论、主题和插件，分析站点数据，并根据博主资料提供个性化建议。回复时使用与用户相同的语言，格式清晰，内容简洁。"
	}

	// 2. Blogger profile
	var profile strings.Builder
	if name := model.GetOption("ai_blogger_name"); name != "" {
		profile.WriteString("\n博主昵称：" + name)
	}
	if bio := model.GetOption("ai_blogger_bio"); bio != "" {
		profile.WriteString("\n博客简介：" + bio)
	}
	if style := model.GetOption("ai_blogger_style"); style != "" {
		profile.WriteString("\n写作风格：" + style)
	}
	if profile.Len() > 0 {
		base += "\n\n## 博主资料\n" + strings.TrimLeft(profile.String(), "\n")
	}

	// 3. AI memory
	if memory := model.GetOption("ai_blogger_memory"); memory != "" {
		base += "\n\n## AI 记忆\n" + memory
	}

	// 4. Site data based on permissions
	var permsStr string
	config.DB.Get(&permsStr, "SELECT COALESCE(value,'{}') FROM "+t("options")+" WHERE name='ai_data_permissions'")
	var perms map[string]bool
	json.Unmarshal([]byte(permsStr), &perms)

	if len(perms) == 0 {
		return base
	}

	var ctx strings.Builder

	if perms["site_basics"] {
		siteTitle := model.GetOption("site_title")
		siteURL := model.GetOption("site_url")
		var postCount, commentCount int
		config.DB.Get(&postCount, "SELECT COUNT(*) FROM "+t("posts")+" WHERE type='post' AND status='publish'")
		config.DB.Get(&commentCount, "SELECT COUNT(*) FROM "+t("comments")+" WHERE status='approved'")
		ctx.WriteString(fmt.Sprintf("\n\n## 站点信息\n站点名称：%s\nURL：%s\n已发布文章：%d 篇\n已通过评论：%d 条",
			siteTitle, siteURL, postCount, commentCount))
	}

	if perms["posts"] {
		var posts []struct {
			Title  string `db:"title"`
			Slug   string `db:"slug"`
			Views  int    `db:"view_count"`
		}
		config.DB.Select(&posts, "SELECT title, slug, view_count FROM "+t("posts")+" WHERE type='post' AND status='publish' ORDER BY created_at DESC LIMIT 50")
		if len(posts) > 0 {
			ctx.WriteString(fmt.Sprintf("\n\n## 文章列表（最近 %d 篇）", len(posts)))
			for _, p := range posts {
				ctx.WriteString(fmt.Sprintf("\n- %s (slug: %s, 浏览: %d)", p.Title, p.Slug, p.Views))
			}
		}
	}

	if perms["taxonomies"] {
		var cats []struct {
			Name  string `db:"name"`
			Count int    `db:"post_count"`
		}
		config.DB.Select(&cats, "SELECT name, post_count FROM "+t("categories")+" ORDER BY post_count DESC LIMIT 20")
		if len(cats) > 0 {
			catNames := make([]string, len(cats))
			for i, c := range cats { catNames[i] = fmt.Sprintf("%s(%d)", c.Name, c.Count) }
			ctx.WriteString("\n\n## 分类\n" + strings.Join(catNames, "、"))
		}
	}

	if perms["comments"] {
		var recent []struct {
			Author  string `db:"author_name"`
			Content string `db:"content"`
			Status  string `db:"status"`
		}
		config.DB.Select(&recent, "SELECT author_name, content, status FROM "+t("comments")+" ORDER BY created_at DESC LIMIT 10")
		if len(recent) > 0 {
			ctx.WriteString("\n\n## 最近评论（10条）")
			for _, cm := range recent {
				preview := cm.Content
				if len([]rune(preview)) > 60 { preview = string([]rune(preview)[:60]) + "..." }
				ctx.WriteString(fmt.Sprintf("\n- [%s] %s: %s", cm.Status, cm.Author, preview))
			}
		}
	}

	if perms["users_count"] {
		var adminCount, authorCount int
		config.DB.Get(&adminCount, "SELECT COUNT(*) FROM "+t("users")+" WHERE role='admin'")
		config.DB.Get(&authorCount, "SELECT COUNT(*) FROM "+t("users")+" WHERE role='author'")
		ctx.WriteString(fmt.Sprintf("\n\n## 用户\n管理员：%d 人，作者：%d 人", adminCount, authorCount))
	}

	if perms["theme_info"] {
		theme := model.GetOption("active_theme")
		if theme == "" { theme = "Utterlog" }
		ctx.WriteString("\n\n## 主题\n当前主题：" + theme)
	}

	if ctx.Len() > 0 {
		base += "\n\n---\n以下是当前站点数据，你可以根据这些信息回答问题：" + ctx.String()
	}

	if perms["database_query"] {
		base += "\n\n你还可以通过 /query 命令执行只读 SQL 查询获取更多数据（用户发送 `/query SELECT ...` 时说明即可，由系统处理）。"
	}

	return base
}

func AIChat(c *gin.Context) {
	var req struct {
		Message        string `json:"message"`
		ConversationID int    `json:"conversation_id"`
		Stream         bool   `json:"stream"`
	}
	c.ShouldBindJSON(&req)
	if req.Message == "" {
		util.BadRequest(c, "消息不能为空"); return
	}

	userID := middleware.GetUserID(c)
	t := config.T

	// Get provider — purpose-specific 'chat' wins if assigned, else
	// fall back to the default text provider chain (same shape as
	// callAIWithPurpose). NO_PROVIDER only fires when neither path
	// finds an active row.
	var provider model.AIProvider
	if pp := pickAIProvider("chat"); pp != nil {
		provider = *pp
	} else if err := config.DB.Get(&provider, "SELECT * FROM "+t("ai_providers")+" WHERE type='text' AND is_active=true ORDER BY is_default DESC, sort_order ASC LIMIT 1"); err != nil {
		util.Error(c, 400, "NO_PROVIDER", "未配置 AI 提供商"); return
	}

	// Create or get conversation
	convID := req.ConversationID
	now := time.Now().Unix()
	if convID <= 0 {
		config.DB.QueryRow(fmt.Sprintf("INSERT INTO %s (user_id, title, created_at, updated_at) VALUES ($1, $2, $3, $4) RETURNING id", t("ai_conversations")),
			userID, req.Message[:min(len(req.Message), 100)], now, now).Scan(&convID)
	}

	// Save user message
	config.DB.Exec(fmt.Sprintf("INSERT INTO %s (conversation_id, role, content, created_at) VALUES ($1, $2, $3, $4)", t("ai_messages")),
		convID, "user", req.Message, now)

	// Build conversation history (use interface{} to support tool messages later)
	var history []map[string]interface{}
	rows, _ := config.DB.Query(fmt.Sprintf("SELECT role, content FROM %s WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 20", t("ai_messages")), convID)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var role, content string
			rows.Scan(&role, &content)
			history = append([]map[string]interface{}{{"role": role, "content": content}}, history...)
		}
	}

	// System prompt with full site context (admin only)
	systemPrompt := buildAdminSystemPrompt()
	messages := append([]map[string]interface{}{{"role": "system", "content": systemPrompt}}, history...)

	// --- Always SSE ---
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	metaJSON, _ := json.Marshal(gin.H{"type": "meta", "conversation_id": convID})
	fmt.Fprintf(c.Writer, "data: %s\n\n", metaJSON)
	c.Writer.Flush()

	// --- Agentic loop: tool calling rounds (non-streaming) ---
	hadToolCalls := false
	finalContent := ""
	const maxIter = 6

	for iter := 0; iter < maxIter; iter++ {
		// Build request body — include tools
		reqBody := map[string]interface{}{
			"model":       provider.Model,
			"messages":    messages,
			"temperature": provider.Temperature,
			"max_tokens":  provider.MaxTokens,
			"tools":       agentToolDefs,
			"tool_choice": "auto",
		}
		body, _ := json.Marshal(reqBody)

		httpReq, _ := http.NewRequest("POST", provider.Endpoint, bytes.NewReader(body))
		httpReq.Header.Set("Content-Type", "application/json")
		httpReq.Header.Set("Authorization", "Bearer "+provider.APIKey)

		client := &http.Client{Timeout: time.Duration(provider.Timeout+30) * time.Second}
		resp, err := client.Do(httpReq)
		if err != nil {
			errJSON, _ := json.Marshal(gin.H{"type": "chunk", "content": "[Error: " + err.Error() + "]"})
			fmt.Fprintf(c.Writer, "data: %s\n\n", errJSON)
			c.Writer.Flush()
			break
		}

		respBytes, _ := io.ReadAll(resp.Body)
		resp.Body.Close()

		// Parse response
		var result struct {
			Choices []struct {
				Message struct {
					Role      string      `json:"role"`
					Content   interface{} `json:"content"`
					ToolCalls []struct {
						ID       string `json:"id"`
						Type     string `json:"type"`
						Function struct {
							Name      string `json:"name"`
							Arguments string `json:"arguments"`
						} `json:"function"`
					} `json:"tool_calls"`
				} `json:"message"`
				FinishReason string `json:"finish_reason"`
			} `json:"choices"`
			Error interface{} `json:"error"`
		}
		json.Unmarshal(respBytes, &result)

		// Provider might not support tools — fall back to plain streaming
		if result.Error != nil && !hadToolCalls && iter == 0 {
			// Retry without tools using streaming
			aiChatStreamFallback(c, provider, messages)
			finalContent = "__streamed__"
			break
		}

		if len(result.Choices) == 0 {
			break
		}
		choice := result.Choices[0]

		// If tool calls present, execute them
		if len(choice.Message.ToolCalls) > 0 {
			hadToolCalls = true

			// Build the raw assistant message to add to conversation (preserving tool_calls)
			assistantMsg := map[string]interface{}{
				"role":       "assistant",
				"content":    choice.Message.Content,
				"tool_calls": choice.Message.ToolCalls,
			}
			messages = append(messages, assistantMsg)

			for _, tc := range choice.Message.ToolCalls {
				var args map[string]interface{}
				json.Unmarshal([]byte(tc.Function.Arguments), &args)
				if args == nil {
					args = map[string]interface{}{}
				}

				// Send tool_call event to client
				label := toolLabel(tc.Function.Name, args)
				evt, _ := json.Marshal(gin.H{"type": "tool_call", "tool": tc.Function.Name, "label": label})
				fmt.Fprintf(c.Writer, "data: %s\n\n", evt)
				c.Writer.Flush()

				// Execute tool
				toolResult := executeAgentTool(tc.Function.Name, args)

				// Send tool_result event to client
				isOK := !strings.HasPrefix(toolResult, "错误")
				resEvt, _ := json.Marshal(gin.H{
					"type": "tool_result", "tool": tc.Function.Name,
					"result": toolResult, "success": isOK,
				})
				fmt.Fprintf(c.Writer, "data: %s\n\n", resEvt)
				c.Writer.Flush()

				// Add tool result to messages for the next AI round
				messages = append(messages, map[string]interface{}{
					"role":         "tool",
					"tool_call_id": tc.ID,
					"content":      toolResult,
				})
			}
			// Continue loop — AI will process tool results
			continue
		}

		// No tool calls — extract final text content
		if choice.Message.Content != nil {
			switch v := choice.Message.Content.(type) {
			case string:
				finalContent = v
			default:
				finalContent = fmt.Sprintf("%v", v)
			}
		}
		break
	}

	// --- Send final text response ---
	if finalContent != "" && finalContent != "__streamed__" {
		if hadToolCalls {
			// After tool calls: send content as a single chunk (tools gave progress UX)
			chunkJSON, _ := json.Marshal(gin.H{"type": "chunk", "content": finalContent})
			fmt.Fprintf(c.Writer, "data: %s\n\n", chunkJSON)
			c.Writer.Flush()
		} else {
			// No tool calls at all but got content from non-streaming — send as chunk
			chunkJSON, _ := json.Marshal(gin.H{"type": "chunk", "content": finalContent})
			fmt.Fprintf(c.Writer, "data: %s\n\n", chunkJSON)
			c.Writer.Flush()
		}
	}

	// Save assistant message to DB (skip if already streamed)
	if finalContent != "__streamed__" {
		config.DB.Exec(fmt.Sprintf("INSERT INTO %s (conversation_id, role, content, model, created_at) VALUES ($1,$2,$3,$4,$5)", t("ai_messages")),
			convID, "assistant", finalContent, provider.Model, time.Now().Unix())
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET message_count = message_count + 2, updated_at = $1 WHERE id = $2", t("ai_conversations")),
			time.Now().Unix(), convID)
	}

	doneJSON, _ := json.Marshal(gin.H{"type": "done"})
	fmt.Fprintf(c.Writer, "data: %s\n\n", doneJSON)
	c.Writer.Flush()
}

// aiChatStreamFallback is the original streaming path, used when the provider does not support function calling.
func aiChatStreamFallback(c *gin.Context, provider model.AIProvider, messages []map[string]interface{}) {
	body, _ := json.Marshal(map[string]interface{}{
		"model": provider.Model, "messages": messages, "stream": true,
		"temperature": provider.Temperature, "max_tokens": provider.MaxTokens,
	})
	httpReq, _ := http.NewRequest("POST", provider.Endpoint, bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+provider.APIKey)

	client := &http.Client{Timeout: time.Duration(provider.Timeout) * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		errJSON, _ := json.Marshal(gin.H{"type": "chunk", "content": "[Error: " + err.Error() + "]"})
		fmt.Fprintf(c.Writer, "data: %s\n\n", errJSON)
		c.Writer.Flush()
		return
	}
	defer resp.Body.Close()

	fullContent := ""
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || line == "data: [DONE]" {
			continue
		}
		if len(line) > 6 && line[:6] == "data: " {
			var chunk map[string]interface{}
			if json.Unmarshal([]byte(line[6:]), &chunk) == nil {
				if choices, ok := chunk["choices"].([]interface{}); ok && len(choices) > 0 {
					if delta, ok := choices[0].(map[string]interface{})["delta"].(map[string]interface{}); ok {
						if content, ok := delta["content"].(string); ok {
							fullContent += content
							chunkJSON, _ := json.Marshal(gin.H{"type": "chunk", "content": content})
							fmt.Fprintf(c.Writer, "data: %s\n\n", chunkJSON)
							c.Writer.Flush()
						}
					}
				}
			}
		}
	}

	// Save to DB
	t := config.T
	config.DB.Exec(fmt.Sprintf("INSERT INTO %s (conversation_id, role, content, model, created_at) VALUES ($1,$2,$3,$4,$5)", t("ai_messages")),
		0, "assistant", fullContent, provider.Model, time.Now().Unix())
}

func ListAIConversations(c *gin.Context) {
	userID := middleware.GetUserID(c)
	var convs []model.AIConversation
	config.DB.Select(&convs, "SELECT * FROM "+config.T("ai_conversations")+" WHERE user_id = $1 ORDER BY updated_at DESC LIMIT 50", userID)
	if convs == nil { convs = []model.AIConversation{} }
	util.Success(c, convs)
}

func GetAIConversation(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userID := middleware.GetUserID(c)
	var conv model.AIConversation
	err := config.DB.Get(&conv, "SELECT * FROM "+config.T("ai_conversations")+" WHERE id = $1 AND user_id = $2", id, userID)
	if err != nil { util.NotFound(c, "对话"); return }
	var msgs []model.AIMessage
	config.DB.Select(&msgs, "SELECT * FROM "+config.T("ai_messages")+" WHERE conversation_id = $1 ORDER BY created_at ASC", id)
	if msgs == nil { msgs = []model.AIMessage{} }
	util.Success(c, gin.H{"id": conv.ID, "title": conv.Title, "messages": msgs, "message_count": conv.MessageCount})
}

func DeleteAIConversation(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	userID := middleware.GetUserID(c)
	config.DB.Exec("DELETE FROM "+config.T("ai_conversations")+" WHERE id = $1 AND user_id = $2", id, userID)
	util.Success(c, nil)
}

func AISlug(c *gin.Context) {
	var req struct { Title string `json:"title"`; Content string `json:"content"` }
	c.ShouldBindJSON(&req)
	if req.Title == "" { util.BadRequest(c, "标题不能为空"); return }
	tpl := resolvePrompt(model.GetOption("ai_slug_prompt"), DefaultSlugPrompt)
	prompt := renderPrompt(tpl, map[string]string{
		"title": req.Title,
	})
	content := callAIWithPurpose("content", prompt, 50)
	if content == "" { util.Error(c, 500, "AI_ERROR", "AI 服务不可用"); return }
	util.Success(c, gin.H{"slug": content})
}

func AISummary(c *gin.Context) {
	var req struct { Title string `json:"title"`; Content string `json:"content"` }
	c.ShouldBindJSON(&req)
	if req.Content == "" { util.BadRequest(c, "内容不能为空"); return }
	text := req.Content; if len(text) > 2000 { text = text[:2000] }

	// Same min/max length resolution as the background generateAISummary
	// path so foreground ✨ button and batch jobs honour the same admin
	// 摘要长度 setting. Defaults to 200 ±50 if option absent.
	maxLen := 200
	if v := strings.TrimSpace(model.GetOption("ai_summary_max_length")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 50 && n <= 1000 { maxLen = n }
	}
	minLen := maxLen / 2
	if minLen < 50 { minLen = 50 }

	excerptSection := ""
	// req.Content carries the full article body; AISummary doesn't take
	// excerpt separately, so leave the {excerpt_section} placeholder
	// blank for the foreground call. (background generateAISummary
	// fills it when the post has its own excerpt.)

	tpl := resolvePrompt(model.GetOption("ai_summary_prompt"), DefaultSummaryPrompt)
	prompt := renderPrompt(tpl, map[string]string{
		"title":           req.Title,
		"content":         text,
		"min_len":         strconv.Itoa(minLen),
		"max_len":         strconv.Itoa(maxLen),
		"excerpt_section": excerptSection,
	})
	content := callAIWithPurpose("content", prompt, 500)
	if content == "" { util.Error(c, 500, "AI_ERROR", "AI 服务不可用"); return }
	util.Success(c, gin.H{"summary": content})
}

func AITags(c *gin.Context) {
	var req struct { Title string `json:"title"`; Content string `json:"content"` }
	c.ShouldBindJSON(&req)
	if req.Title == "" && req.Content == "" { util.BadRequest(c, "标题或内容不能为空"); return }
	text := req.Content; if len(text) > 1000 { text = text[:1000] }
	tpl := resolvePrompt(model.GetOption("ai_keywords_prompt"), DefaultKeywordsPrompt)
	prompt := renderPrompt(tpl, map[string]string{
		"title":       req.Title,
		"content":     text,
		"tags_count":  "3",
	})
	content := callAIWithPurpose("content", prompt, 100)
	if content == "" { util.Error(c, 500, "AI_ERROR", "AI 服务不可用"); return }
	// Parse comma-separated tags
	tags := []string{}
	for _, t := range strings.Split(content, ",") {
		t = strings.TrimSpace(t)
		if t != "" { tags = append(tags, t) }
	}
	util.Success(c, gin.H{"tags": tags})
}

func AIFormat(c *gin.Context) {
	var req struct { Content string `json:"content"` }
	c.ShouldBindJSON(&req)
	if req.Content == "" { util.BadRequest(c, "内容不能为空"); return }
	tpl := resolvePrompt(model.GetOption("ai_polish_prompt"), DefaultPolishPrompt)
	prompt := renderPrompt(tpl, map[string]string{
		"content": req.Content,
	})
	content := callAIWithPurpose("content", prompt, 4096)
	if content == "" { util.Error(c, 500, "AI_ERROR", "AI 服务不可用"); return }
	util.Success(c, gin.H{"content": content})
}

func AILogs(c *gin.Context) {
	GenericList("ai_logs")(c)
}

func AIStats(c *gin.Context) {
	userID := middleware.GetUserID(c)
	t := config.T("ai_logs")
	var totalCalls int; var totalTokens int
	config.DB.Get(&totalCalls, "SELECT COUNT(*) FROM "+t+" WHERE user_id = $1", userID)
	config.DB.Get(&totalTokens, "SELECT COALESCE(SUM(total_tokens),0) FROM "+t+" WHERE user_id = $1", userID)
	util.Success(c, gin.H{"totals": gin.H{"total_calls": totalCalls, "total_tokens": totalTokens}})
}

// aiBatchState tracks in-progress batch jobs so the frontend can poll progress.
// Keyed by job type ("questions" / "summary" / "tags").
var aiBatchState = struct {
	sync.Mutex
	jobs map[string]*AIBatchJob
}{jobs: map[string]*AIBatchJob{}}

type AIBatchJob struct {
	Type      string `json:"type"`
	Total     int    `json:"total"`
	Done      int    `json:"done"`
	Failed    int    `json:"failed"`
	Running   bool   `json:"running"`
	StartedAt int64  `json:"started_at"`
	FinishAt  int64  `json:"finished_at"`
	LastError string `json:"last_error,omitempty"`
	// Cancel is set by AIBatchStop. The batch goroutine checks this
	// at every iteration and exits cleanly — no racing/leaking.
	Cancel bool `json:"-"`
}

// AIBatchStop — POST /api/v1/ai/batch-stop?type=questions|summary|all
// Flips the cancel flag on a running job so its goroutine bails out at
// the next iteration. Does not kill in-flight HTTP requests; worst case
// we wait up to one (provider timeout + 800ms) before exit.
func AIBatchStop(c *gin.Context) {
	t := c.DefaultQuery("type", "all")
	aiBatchState.Lock()
	j := aiBatchState.jobs[t]
	if j == nil || !j.Running {
		aiBatchState.Unlock()
		util.Success(c, gin.H{"stopped": false, "note": "无正在运行的任务"})
		return
	}
	j.Cancel = true
	aiBatchState.Unlock()
	util.Success(c, gin.H{"stopped": true, "type": t})
}

// hasActiveAITextProvider returns true if there's at least one active
// provider with type='text' configured. Used to fail fast on batch
// jobs — without this, users kick off a 28-post run that chugs through
// every row writing "AI returned empty" as each request 404s at the
// provider layer. One upfront check saves several minutes of pointless
// rate-limited looping.
func hasActiveAITextProvider() bool {
	var count int
	_ = config.DB.Get(&count, "SELECT COUNT(*) FROM "+config.T("ai_providers")+" WHERE type='text' AND is_active=true")
	return count > 0
}

// AIBatchQuestions — POST /api/v1/ai/batch-questions
// Starts an async background job that generates ai_questions for every
// published post that doesn't have one cached yet. Rate-limited to ~1/sec.
func AIBatchQuestions(c *gin.Context) {
	if !hasActiveAITextProvider() {
		util.Error(c, 400, "NO_AI_PROVIDER", "尚未配置 AI 服务商，请先在 AI 设置里添加并启用一个文本模型")
		return
	}
	aiBatchState.Lock()
	if j := aiBatchState.jobs["questions"]; j != nil && j.Running {
		aiBatchState.Unlock()
		util.Success(c, j)
		return
	}

	// Find candidates
	var ids []int
	config.DB.Select(&ids, fmt.Sprintf(
		"SELECT id FROM %s WHERE type='post' AND status='publish' AND (ai_questions IS NULL OR ai_questions = '') ORDER BY id DESC",
		config.T("posts")))

	job := &AIBatchJob{
		Type:      "questions",
		Total:     len(ids),
		Running:   true,
		StartedAt: time.Now().Unix(),
	}
	aiBatchState.jobs["questions"] = job
	aiBatchState.Unlock()

	if len(ids) == 0 {
		job.Running = false
		job.FinishAt = time.Now().Unix()
		util.Success(c, job)
		return
	}

	// Async: run in background so the API returns immediately
	go func() {
		for _, id := range ids {
			aiBatchState.Lock()
			cancel := job.Cancel
			aiBatchState.Unlock()
			if cancel {
				break
			}
			generateAIQuestions(id)
			aiBatchState.Lock()
			// Verify if it actually got written
			var q string
			config.DB.Get(&q, fmt.Sprintf("SELECT COALESCE(ai_questions,'') FROM %s WHERE id=$1", config.T("posts")), id)
			if q != "" {
				job.Done++
			} else {
				job.Failed++
				errDetail := aiLastError
				if errDetail == "" {
					errDetail = "AI returned empty"
				}
				job.LastError = fmt.Sprintf("post #%d: %s", id, errDetail)
			}
			aiBatchState.Unlock()
			// Rate-limit — don't hammer the AI provider
			time.Sleep(800 * time.Millisecond)
		}
		aiBatchState.Lock()
		job.Running = false
		job.FinishAt = time.Now().Unix()
		aiBatchState.Unlock()
	}()

	util.Success(c, job)
}

// AIBatchStatus — GET /api/v1/ai/batch-status?type=questions|summary|all
func AIBatchStatus(c *gin.Context) {
	t := c.DefaultQuery("type", "questions")
	aiBatchState.Lock()
	defer aiBatchState.Unlock()
	j := aiBatchState.jobs[t]
	if j == nil {
		util.Success(c, &AIBatchJob{Type: t, Running: false})
		return
	}
	util.Success(c, j)
}

// AIBatchSummary — POST /api/v1/ai/batch-summary
// Generate ai_summary for every published post that doesn't have one.
func AIBatchSummary(c *gin.Context) {
	if !hasActiveAITextProvider() {
		util.Error(c, 400, "NO_AI_PROVIDER", "尚未配置 AI 服务商，请先在 AI 设置里添加并启用一个文本模型")
		return
	}
	aiBatchState.Lock()
	if j := aiBatchState.jobs["summary"]; j != nil && j.Running {
		aiBatchState.Unlock()
		util.Success(c, j)
		return
	}

	var ids []int
	config.DB.Select(&ids, fmt.Sprintf(
		"SELECT id FROM %s WHERE type='post' AND status='publish' AND (ai_summary IS NULL OR ai_summary = '') ORDER BY id DESC",
		config.T("posts")))

	job := &AIBatchJob{Type: "summary", Total: len(ids), Running: true, StartedAt: time.Now().Unix()}
	aiBatchState.jobs["summary"] = job
	aiBatchState.Unlock()

	if len(ids) == 0 {
		job.Running = false
		job.FinishAt = time.Now().Unix()
		util.Success(c, job)
		return
	}

	go func() {
		for _, id := range ids {
			aiBatchState.Lock()
			cancel := job.Cancel
			aiBatchState.Unlock()
			if cancel {
				break
			}
			generateAISummary(id)
			aiBatchState.Lock()
			var s string
			config.DB.Get(&s, fmt.Sprintf("SELECT COALESCE(ai_summary,'') FROM %s WHERE id=$1", config.T("posts")), id)
			if s != "" {
				job.Done++
			} else {
				job.Failed++
				errDetail := aiLastError
				if errDetail == "" {
					errDetail = "AI returned empty"
				}
				job.LastError = fmt.Sprintf("post #%d: %s", id, errDetail)
			}
			aiBatchState.Unlock()
			time.Sleep(800 * time.Millisecond)
		}
		aiBatchState.Lock()
		job.Running = false
		job.FinishAt = time.Now().Unix()
		aiBatchState.Unlock()
	}()

	util.Success(c, job)
}

// AIBatchAll — POST /api/v1/ai/batch-all
// One-click: generate both ai_questions AND ai_summary for posts missing them.
// Runs two chained background jobs, tracked under key "all".
func AIBatchAll(c *gin.Context) {
	if !hasActiveAITextProvider() {
		util.Error(c, 400, "NO_AI_PROVIDER", "尚未配置 AI 服务商，请先在 AI 设置里添加并启用一个文本模型")
		return
	}
	aiBatchState.Lock()
	if j := aiBatchState.jobs["all"]; j != nil && j.Running {
		aiBatchState.Unlock()
		util.Success(c, j)
		return
	}

	// Collect posts needing EITHER questions or summary
	type Candidate struct {
		ID         int  `db:"id"`
		NeedQ      bool `db:"need_q"`
		NeedS      bool `db:"need_s"`
	}
	var cands []Candidate
	config.DB.Select(&cands, fmt.Sprintf(
		`SELECT id,
		  (ai_questions IS NULL OR ai_questions = '') AS need_q,
		  (ai_summary IS NULL OR ai_summary = '') AS need_s
		 FROM %s WHERE type='post' AND status='publish'
		 AND ((ai_questions IS NULL OR ai_questions = '') OR (ai_summary IS NULL OR ai_summary = ''))
		 ORDER BY id DESC`,
		config.T("posts")))

	// Total = sum of missing tasks (a post missing both counts as 2)
	total := 0
	for _, c := range cands {
		if c.NeedQ { total++ }
		if c.NeedS { total++ }
	}

	job := &AIBatchJob{Type: "all", Total: total, Running: true, StartedAt: time.Now().Unix()}
	aiBatchState.jobs["all"] = job
	aiBatchState.Unlock()

	if total == 0 {
		job.Running = false
		job.FinishAt = time.Now().Unix()
		util.Success(c, job)
		return
	}

	go func() {
		for _, cand := range cands {
			aiBatchState.Lock()
			cancel := job.Cancel
			aiBatchState.Unlock()
			if cancel {
				break
			}
			if cand.NeedQ {
				generateAIQuestions(cand.ID)
				aiBatchState.Lock()
				var q string
				config.DB.Get(&q, fmt.Sprintf("SELECT COALESCE(ai_questions,'') FROM %s WHERE id=$1", config.T("posts")), cand.ID)
				if q != "" {
					job.Done++
				} else {
					job.Failed++
					d := aiLastError
					if d == "" {
						d = "questions failed"
					}
					job.LastError = fmt.Sprintf("post #%d: %s", cand.ID, d)
				}
				aiBatchState.Unlock()
				time.Sleep(800 * time.Millisecond)
			}
			if cand.NeedS {
				generateAISummary(cand.ID)
				aiBatchState.Lock()
				var s string
				config.DB.Get(&s, fmt.Sprintf("SELECT COALESCE(ai_summary,'') FROM %s WHERE id=$1", config.T("posts")), cand.ID)
				if s != "" {
					job.Done++
				} else {
					job.Failed++
					d := aiLastError
					if d == "" {
						d = "summary failed"
					}
					job.LastError = fmt.Sprintf("post #%d: %s", cand.ID, d)
				}
				aiBatchState.Unlock()
				time.Sleep(800 * time.Millisecond)
			}
		}
		aiBatchState.Lock()
		job.Running = false
		job.FinishAt = time.Now().Unix()
		aiBatchState.Unlock()
	}()

	util.Success(c, job)
}

// AIBatchDelete — POST /api/v1/ai/batch-delete
// Wipes ai_summary and ai_questions from every post so a subsequent
// /ai/batch-all regenerates from scratch. Accepts JSON body:
//   {"fields": ["summary","questions"]}  — what to wipe (defaults to both)
func AIBatchDelete(c *gin.Context) {
	var req struct {
		Fields []string `json:"fields"`
	}
	c.ShouldBindJSON(&req)
	wipeSummary, wipeQuestions := true, true
	if len(req.Fields) > 0 {
		wipeSummary, wipeQuestions = false, false
		for _, f := range req.Fields {
			switch strings.ToLower(strings.TrimSpace(f)) {
			case "summary", "ai_summary":
				wipeSummary = true
			case "questions", "ai_questions":
				wipeQuestions = true
			}
		}
	}
	setParts := []string{}
	if wipeSummary {
		setParts = append(setParts, "ai_summary = NULL")
	}
	if wipeQuestions {
		setParts = append(setParts, "ai_questions = NULL")
	}
	if len(setParts) == 0 {
		util.BadRequest(c, "fields 必须包含 summary 或 questions")
		return
	}
	r, err := config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET %s WHERE type='post' AND status='publish'",
		config.T("posts"), strings.Join(setParts, ", ")))
	if err != nil {
		util.Error(c, 500, "DB_ERR", err.Error())
		return
	}
	rows, _ := r.RowsAffected()
	util.Success(c, gin.H{
		"updated":         rows,
		"wiped_summary":   wipeSummary,
		"wiped_questions": wipeQuestions,
	})
}

// aiLastError records the most recent callAI failure so batch jobs can
// surface it in job.LastError — previous code returned "" on any error,
// which collapsed "no provider" / "bad key" / "rate limited" / "empty
// response" all into the same opaque "AI returned empty" message.
var aiLastError string

// AIPurposes lists every per-feature dispatch slot the admin can wire
// to a specific provider (Settings → AI 设置 → 功能模型分配). Each
// entry is the option key suffix; the full key stored in the options
// table is "ai_purpose_<key>_provider" and holds an ai_providers.id.
//
// Adding a new purpose requires touching three places:
//   1. This list (so the admin form renders a row for it).
//   2. The handler call site — pass the purpose to callAIWithPurpose
//      or pickAIProvider so the dispatcher knows to consult it.
//   3. AiSettings.tsx (frontend) — add the matching FormRowSelectC.
type AIPurpose struct {
	Key   string `json:"key"`
	Label string `json:"label"`
	Hint  string `json:"hint"`
}

var AIPurposes = []AIPurpose{
	{
		Key:   "content",
		Label: "内容生成",
		Hint:  "AI 摘要 / Slug / 关键词 / 排版润色 / 批量问答 / SQL 查询都走这一个",
	},
	{
		Key:   "chat",
		Label: "聊天",
		Hint:  "后台 AI 助手 + 前台读者陪读 + Telegram /ai 命令统一走这一个",
	},
}

// pickAIProvider returns the provider explicitly assigned to a purpose,
// or nil to indicate "use the default chain". A purpose is honoured
// only if (a) the option key is set, (b) it parses to a positive id,
// and (c) that provider is still active and type='text'. Any other
// state silently falls back so misconfiguration doesn't block the
// feature entirely — callers see the default behaviour, not a 500.
func pickAIProvider(purpose string) *model.AIProvider {
	if purpose == "" {
		return nil
	}
	pid := model.GetOption("ai_purpose_" + purpose + "_provider")
	if pid == "" || pid == "0" {
		return nil
	}
	id, err := strconv.Atoi(pid)
	if err != nil || id <= 0 {
		return nil
	}
	var p model.AIProvider
	err = config.DB.Get(&p, "SELECT * FROM "+config.T("ai_providers")+
		" WHERE id=$1 AND is_active=true AND type='text'", id)
	if err != nil {
		return nil
	}
	return &p
}

// chatTemperature reads ai_chat_temp from options, clamps to [0, 2],
// returns 0.7 default. Used for chat-style purposes only — content
// generation (summary / slug / tags / polish) keeps the original
// 0.3 because a creative output for those would mostly add noise.
func chatTemperature() float64 {
	v := strings.TrimSpace(model.GetOption("ai_chat_temp"))
	if v == "" {
		return 0.7
	}
	f, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0.7
	}
	if f < 0 {
		f = 0
	}
	if f > 2 {
		f = 2
	}
	return f
}

// temperatureForPurpose picks the right temperature based on the
// purpose. 'chat' purpose flows (assistant / reader / Telegram bot)
// honour the admin-configured ai_chat_temp; everything else stays
// at 0.3 so summaries / slugs / tags don't drift into freelance
// territory.
func temperatureForPurpose(purpose string) float64 {
	if purpose == "chat" {
		return chatTemperature()
	}
	return 0.3
}

// callAIWithPurpose tries the purpose-specific provider first; if
// that fails (network blip / rate limit / model rejection), falls
// through to the default chain so a single bad config can't kill
// the feature entirely.
func callAIWithPurpose(purpose, prompt string, maxTokens int) string {
	temp := temperatureForPurpose(purpose)
	if p := pickAIProvider(purpose); p != nil {
		content, errStr := callOneProviderWithTemp(*p, prompt, maxTokens, temp)
		if content != "" {
			aiLastError = ""
			return content
		}
		fmt.Printf("[ai] purpose=%q provider=%q model=%q failed: %s — falling back to default chain\n",
			purpose, p.Name, p.Model, errStr)
	}
	return callAI(prompt, maxTokens)
}

func callAI(prompt string, maxTokens int) string {
	// Try every active provider in default-first order. First one that
	// returns non-empty content wins. This gives users a real fallback
	// when their preferred provider (e.g. aliyun dashscope from an
	// overseas server) is slow or blocked — the generator doesn't have
	// to stall every single post waiting 90s on the timeout.
	var providers []model.AIProvider
	err := config.DB.Select(&providers, "SELECT * FROM "+config.T("ai_providers")+" WHERE type='text' AND is_active=true ORDER BY is_default DESC, sort_order ASC, id ASC")
	if err != nil || len(providers) == 0 {
		if err != nil {
			aiLastError = "no active provider: " + err.Error()
		} else {
			aiLastError = "no active provider configured"
		}
		return ""
	}

	var attemptErrs []string
	for _, p := range providers {
		content, errStr := callOneProvider(p, prompt, maxTokens)
		if content != "" {
			aiLastError = ""
			return content
		}
		attemptErrs = append(attemptErrs, fmt.Sprintf("[%s] %s", p.Name, errStr))
		// stdout log — so the operator can `docker logs` and see exactly
		// which provider failed with what reason, without having to poll
		// the batch-status endpoint at just the right millisecond.
		fmt.Printf("[ai] provider=%q model=%q failed: %s\n", p.Name, p.Model, errStr)
	}
	aiLastError = strings.Join(attemptErrs, " · ")
	return ""
}

// callOneProvider hits a single provider with the historical 0.3
// temperature. Kept as a thin wrapper so older call sites that
// don't care about temperature stay clean. New code should call
// callOneProviderWithTemp directly so chat / reader-chat respect
// the admin's ai_chat_temp setting.
func callOneProvider(p model.AIProvider, prompt string, maxTokens int) (string, string) {
	return callOneProviderWithTemp(p, prompt, maxTokens, 0.3)
}

// callOneProviderWithTemp is the actual HTTP caller. Temperature is
// now a parameter rather than the hard-coded 0.3 — that constant
// quietly overrode AI 设置 → 聊天配置 → 对话温度 even after admins
// thought they'd dialled the chat hotter or colder.
func callOneProviderWithTemp(p model.AIProvider, prompt string, maxTokens int, temperature float64) (string, string) {
	body, _ := json.Marshal(map[string]interface{}{
		"model": p.Model, "messages": []map[string]string{{"role": "user", "content": prompt}},
		"max_tokens": maxTokens, "temperature": temperature,
	})
	req, _ := http.NewRequest("POST", p.Endpoint, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)
	// 90s timeout — providers like aliyun dashscope with qwen3-max can
	// take 40-60s cold. 30s was below their typical TTFB for long prompts.
	resp, err := (&http.Client{Timeout: 90 * time.Second}).Do(req)
	if err != nil {
		return "", "http: " + err.Error()
	}
	defer resp.Body.Close()

	rawBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		preview := string(rawBody)
		if len(preview) > 200 {
			preview = preview[:200]
		}
		return "", fmt.Sprintf("HTTP %d: %s", resp.StatusCode, preview)
	}

	var result map[string]interface{}
	if err := json.Unmarshal(rawBody, &result); err != nil {
		return "", "decode: " + err.Error()
	}
	if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
		if msg, ok := choices[0].(map[string]interface{})["message"].(map[string]interface{}); ok {
			content := fmt.Sprintf("%v", msg["content"])
			if strings.TrimSpace(content) == "" {
				return "", "empty content in choices[0].message"
			}
			return content, ""
		}
	}
	preview := string(rawBody)
	if len(preview) > 200 {
		preview = preview[:200]
	}
	return "", "unexpected response shape: " + preview
}

// AIQuery executes a read-only SQL query for AI data access (admin only)
func AIQuery(c *gin.Context) {
	var req struct {
		Query string `json:"query"`
	}
	c.ShouldBindJSON(&req)
	if req.Query == "" {
		util.BadRequest(c, "查询不能为空"); return
	}

	// Security: only allow SELECT statements
	q := strings.TrimSpace(strings.ToUpper(req.Query))
	if !strings.HasPrefix(q, "SELECT") {
		util.Error(c, 403, "FORBIDDEN", "仅允许 SELECT 查询"); return
	}
	// Block dangerous keywords
	for _, kw := range []string{"DROP", "DELETE", "UPDATE", "INSERT", "ALTER", "TRUNCATE", "EXEC", "GRANT", "REVOKE"} {
		if strings.Contains(q, kw) {
			util.Error(c, 403, "FORBIDDEN", "查询包含不允许的操作: "+kw); return
		}
	}

	// Check permission
	var perms string
	config.DB.Get(&perms, "SELECT COALESCE(value,'{}') FROM "+config.T("options")+" WHERE name='ai_data_permissions'")
	if !strings.Contains(perms, `"database_query":true`) {
		util.Error(c, 403, "FORBIDDEN", "数据库查询权限未开启"); return
	}

	// Execute with timeout and row limit
	rows, err := config.DB.Queryx(req.Query + " LIMIT 100")
	if err != nil {
		util.Error(c, 400, "QUERY_ERROR", err.Error()); return
	}
	defer rows.Close()

	var results []map[string]interface{}
	for rows.Next() {
		row := make(map[string]interface{})
		rows.MapScan(row)
		// Convert []byte to string
		for k, v := range row {
			if b, ok := v.([]byte); ok {
				row[k] = string(b)
			}
		}
		results = append(results, row)
	}
	if results == nil { results = []map[string]interface{}{} }

	cols, _ := rows.Columns()
	util.Success(c, gin.H{"columns": cols, "rows": results, "count": len(results)})
}

func min(a, b int) int { if a < b { return a }; return b }

// ===================== AI Reader Chat (公开，无需登录) =====================

// In-memory session store for reader chat (TTL managed by periodic cleanup)
var readerSessions = struct {
	sync.RWMutex
	m map[string]*readerSession
}{m: make(map[string]*readerSession)}

type readerSession struct {
	messages []map[string]string
	lastUsed int64
}

func init() {
	// Cleanup expired sessions every 10 minutes
	go func() {
		for {
			time.Sleep(10 * time.Minute)
			now := time.Now().Unix()
			readerSessions.Lock()
			for k, v := range readerSessions.m {
				if now-v.lastUsed > 1800 { // 30 min TTL
					delete(readerSessions.m, k)
				}
			}
			readerSessions.Unlock()
		}
	}()
}

// AIReaderChat handles public AI reading companion chat
// POST /api/v1/ai/reader-chat
func AIReaderChat(c *gin.Context) {
	var req struct {
		PostID    int    `json:"post_id" binding:"required"`
		Message   string `json:"message"`
		SessionID string `json:"session_id"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "post_id 不能为空"); return
	}

	// Honour the admin's '允许访客（未登录）使用 AI 聊天' toggle.
	// Default open (existing behaviour) so this is purely an
	// opt-out. When closed, the suggestion-fetch path (empty
	// message) still works so the chip row renders, but actually
	// chatting requires a logged-in user. middleware.GetUserID
	// returns 0 for unauthed reader-chat (the route is public).
	if strings.TrimSpace(req.Message) != "" {
		guestAllowed := strings.ToLower(strings.TrimSpace(model.GetOption("ai_chat_guest"))) == "true"
		if !guestAllowed && middleware.GetUserID(c) == 0 {
			util.Error(c, 401, "GUEST_BLOCKED", "请先登录后再使用 AI 聊天")
			return
		}
	}

	// Get AI provider — 'chat' purpose first (covers reader chat too),
	// then default chain.
	var provider model.AIProvider
	if pp := pickAIProvider("chat"); pp != nil {
		provider = *pp
	} else if err := config.DB.Get(&provider, "SELECT * FROM "+config.T("ai_providers")+" WHERE type='text' AND is_active=true ORDER BY is_default DESC, sort_order ASC LIMIT 1"); err != nil {
		util.Error(c, 400, "NO_PROVIDER", "未配置 AI 提供商"); return
	}

	// Get post content
	post, err := model.PostByID(req.PostID)
	if err != nil {
		util.NotFound(c, "文章"); return
	}

	// Build article context for system prompt
	articleContent := post.Title
	if post.Content != nil {
		text := *post.Content
		runes := []rune(text)
		if len(runes) > 4000 {
			text = string(runes[:4000])
		}
		articleContent += "\n\n" + text
	}

	// Base: custom system prompt or default reader prompt
	readerBase := model.GetOption("ai_system_prompt")
	if readerBase == "" {
		readerBase = "你是一个友好的 AI 阅读助手，专注于帮助读者理解和探讨博客文章。"
	}
	// Append blogger memory if available (gives AI personality context)
	if memory := model.GetOption("ai_blogger_memory"); memory != "" {
		readerBase += "\n\n## 背景记忆\n" + memory
	}
	systemPrompt := fmt.Sprintf("%s\n\n你正在陪读的文章：\n\n标题：%s\n\n内容：%s\n\n请围绕这篇文章回答用户的问题，可以总结、解释、延伸讨论，但不要透露站点内部数据。使用与用户相同的语言回复。回答简洁精炼。使用 Markdown 格式排版。严禁使用任何 emoji 表情符号。", readerBase, post.Title, articleContent)

	// First message: return pre-generated questions (or generate on the fly)
	if req.Message == "" {
		// Try pre-generated questions from DB
		var aiQuestions string
		config.DB.Get(&aiQuestions, fmt.Sprintf("SELECT COALESCE(ai_questions, '') FROM %s WHERE id = $1", config.T("posts")), req.PostID)
		if aiQuestions != "" {
			var questions []string
			if json.Unmarshal([]byte(aiQuestions), &questions) == nil && len(questions) > 0 {
				util.Success(c, gin.H{"questions": questions})
				return
			}
		}

		// Fallback: generate on the fly
		suggestPrompt := fmt.Sprintf("根据以下文章，生成3个读者可能感兴趣的问题，每行一个问题，不要编号，不要解释：\n\n标题：%s", post.Title)
		if post.Excerpt != nil {
			suggestPrompt += "\n摘要：" + *post.Excerpt
		}
		// 'reader-chat' purpose mirrors the conversational provider
		// since these suggested questions ride alongside the same UX.
		result := callAIWithPurpose("chat", suggestPrompt, 200)
		questions := []string{}
		for _, line := range strings.Split(result, "\n") {
			line = strings.TrimSpace(line)
			if line != "" && !strings.HasPrefix(line, "#") {
				line = strings.TrimLeft(line, "0123456789.-) ")
				if line != "" {
					questions = append(questions, line)
				}
			}
		}
		if len(questions) > 3 { questions = questions[:3] }
		// Cache for future requests
		if len(questions) > 0 {
			qJSON, _ := json.Marshal(questions)
			config.DB.Exec(fmt.Sprintf("UPDATE %s SET ai_questions = $1 WHERE id = $2", config.T("posts")), string(qJSON), req.PostID)
		}
		util.Success(c, gin.H{"questions": questions})
		return
	}

	// Get or create session
	sessionID := req.SessionID
	if sessionID == "" {
		sessionID = fmt.Sprintf("r_%d_%d", req.PostID, time.Now().UnixNano())
	}

	readerSessions.Lock()
	session, exists := readerSessions.m[sessionID]
	if !exists {
		session = &readerSession{messages: []map[string]string{}, lastUsed: time.Now().Unix()}
		readerSessions.m[sessionID] = session
	}
	session.lastUsed = time.Now().Unix()
	session.messages = append(session.messages, map[string]string{"role": "user", "content": req.Message})
	// Keep last 10 messages
	if len(session.messages) > 10 {
		session.messages = session.messages[len(session.messages)-10:]
	}
	history := make([]map[string]string, len(session.messages))
	copy(history, session.messages)
	readerSessions.Unlock()

	// Build messages
	messages := append([]map[string]string{{"role": "system", "content": systemPrompt}}, history...)

	// Stream response
	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")

	metaJSON, _ := json.Marshal(gin.H{"type": "meta", "session_id": sessionID})
	fmt.Fprintf(c.Writer, "data: %s\n\n", metaJSON)
	c.Writer.Flush()

	// Honour AI 设置 → 聊天配置 → 对话温度. Was hard-coded 0.7 even
	// after admins thought the slider applied here; chatTemperature()
	// reads ai_chat_temp with safe defaults + clamping.
	body, _ := json.Marshal(map[string]interface{}{
		"model": provider.Model, "messages": messages, "stream": true,
		"temperature": chatTemperature(), "max_tokens": 1024,
	})
	httpReq, _ := http.NewRequest("POST", provider.Endpoint, bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+provider.APIKey)

	client := &http.Client{Timeout: time.Duration(provider.Timeout) * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		errJSON, _ := json.Marshal(gin.H{"type": "chunk", "content": "[Error: " + err.Error() + "]"})
		fmt.Fprintf(c.Writer, "data: %s\n\n", errJSON)
		c.Writer.Flush()
		return
	}
	defer resp.Body.Close()

	fullContent := ""
	scanner := bufio.NewScanner(resp.Body)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" || line == "data: [DONE]" { continue }
		if len(line) > 6 && line[:6] == "data: " {
			var chunk map[string]interface{}
			if json.Unmarshal([]byte(line[6:]), &chunk) == nil {
				if choices, ok := chunk["choices"].([]interface{}); ok && len(choices) > 0 {
					if delta, ok := choices[0].(map[string]interface{})["delta"].(map[string]interface{}); ok {
						if content, ok := delta["content"].(string); ok {
							fullContent += content
							chunkJSON, _ := json.Marshal(gin.H{"type": "chunk", "content": content})
							fmt.Fprintf(c.Writer, "data: %s\n\n", chunkJSON)
							c.Writer.Flush()
						}
					}
				}
			}
		}
	}

	// Save assistant message to session
	readerSessions.Lock()
	if s, ok := readerSessions.m[sessionID]; ok {
		s.messages = append(s.messages, map[string]string{"role": "assistant", "content": fullContent})
		if len(s.messages) > 10 {
			s.messages = s.messages[len(s.messages)-10:]
		}
	}
	readerSessions.Unlock()

	doneJSON, _ := json.Marshal(gin.H{"type": "done"})
	fmt.Fprintf(c.Writer, "data: %s\n\n", doneJSON)
	c.Writer.Flush()
}
