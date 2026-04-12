package handler

import (
	"bufio"
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// Presets
var AIPresets = gin.H{
	"openai":  gin.H{"name": "OpenAI", "endpoint": "https://api.openai.com/v1/chat/completions", "models": []string{"gpt-4.1", "gpt-4.1-mini", "o3-mini"}},
	"deepseek": gin.H{"name": "DeepSeek", "endpoint": "https://api.deepseek.com/chat/completions", "models": []string{"deepseek-chat", "deepseek-reasoner"}},
	"gemini":  gin.H{"name": "Google Gemini", "endpoint": "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", "models": []string{"gemini-2.5-flash", "gemini-2.5-pro"}},
	"qwen":   gin.H{"name": "通义千问", "endpoint": "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions", "models": []string{"qwen3-max", "qwen-plus", "qwen-turbo"}},
	"kimi":   gin.H{"name": "Kimi", "endpoint": "https://api.moonshot.cn/v1/chat/completions", "models": []string{"kimi-k2.5", "kimi-latest"}},
	"minimax": gin.H{"name": "MiniMax", "endpoint": "https://api.minimax.chat/v1/text/chatcompletion_v2", "models": []string{"MiniMax-M2.5"}},
	"zhipu":  gin.H{"name": "智谱 AI", "endpoint": "https://open.bigmodel.cn/api/paas/v4/chat/completions", "models": []string{"glm-4.7-flash"}},
	"doubao": gin.H{"name": "豆包", "endpoint": "https://ark.cn-beijing.volces.com/api/v3/chat/completions", "models": []string{"doubao-seed-1.8"}},
}

func GetAIProviders(c *gin.Context) {
	var providers []model.AIProvider
	config.DB.Select(&providers, "SELECT * FROM "+config.T("ai_providers")+" ORDER BY sort_order ASC, id ASC")
	if providers == nil { providers = []model.AIProvider{} }
	util.Success(c, gin.H{"providers": providers, "presets": AIPresets})
}

func SaveAIProvider(c *gin.Context) {
	var req model.AIProvider
	c.ShouldBindJSON(&req)
	if req.Name == "" || req.Endpoint == "" || req.Model == "" {
		util.BadRequest(c, "名称、端点和模型为必填项"); return
	}
	now := time.Now().Unix()
	t := config.T("ai_providers")

	if req.ID > 0 {
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET name=$1,slug=$2,type=$3,endpoint=$4,model=$5,api_key=$6,temperature=$7,max_tokens=$8,timeout=$9,is_active=$10,is_default=$11,sort_order=$12,updated_at=$13 WHERE id=$14", t),
			req.Name, req.Slug, req.Type, req.Endpoint, req.Model, req.APIKey, req.Temperature, req.MaxTokens, req.Timeout, req.IsActive, req.IsDefault, req.SortOrder, now, req.ID)
		util.Success(c, gin.H{"id": req.ID})
	} else {
		var id int
		config.DB.QueryRow(fmt.Sprintf("INSERT INTO %s (name,slug,type,endpoint,model,api_key,temperature,max_tokens,timeout,is_active,is_default,sort_order,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id", t),
			req.Name, req.Slug, req.Type, req.Endpoint, req.Model, req.APIKey, req.Temperature, req.MaxTokens, req.Timeout, req.IsActive, req.IsDefault, req.SortOrder, now, now).Scan(&id)
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

func AIChat(c *gin.Context) {
	var req struct {
		Message        string `json:"message"`
		ConversationID int    `json:"conversation_id"`
		Stream         bool   `json:"stream"`
	}
	c.ShouldBindJSON(&req)
	if req.Message == "" { util.BadRequest(c, "消息不能为空"); return }

	userID := middleware.GetUserID(c)
	t := config.T

	// Get default provider
	var provider model.AIProvider
	err := config.DB.Get(&provider, "SELECT * FROM "+t("ai_providers")+" WHERE type='text' AND is_active=true ORDER BY is_default DESC, sort_order ASC LIMIT 1")
	if err != nil { util.Error(c, 400, "NO_PROVIDER", "未配置 AI 提供商"); return }

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

	// Build context
	var history []map[string]string
	rows, _ := config.DB.Query(fmt.Sprintf("SELECT role, content FROM %s WHERE conversation_id = $1 ORDER BY created_at DESC LIMIT 20", t("ai_messages")), convID)
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var role, content string
			rows.Scan(&role, &content)
			history = append([]map[string]string{{"role": role, "content": content}}, history...)
		}
	}

	messages := append([]map[string]string{{"role": "system", "content": "You are a helpful AI assistant for Utterlog blog. Respond in the same language the user uses."}}, history...)

	if req.Stream {
		// SSE streaming
		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")

		// Send meta
		metaJSON, _ := json.Marshal(gin.H{"type": "meta", "conversation_id": convID})
		fmt.Fprintf(c.Writer, "data: %s\n\n", metaJSON)
		c.Writer.Flush()

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

		// Save assistant message
		config.DB.Exec(fmt.Sprintf("INSERT INTO %s (conversation_id, role, content, model, created_at) VALUES ($1,$2,$3,$4,$5)", t("ai_messages")),
			convID, "assistant", fullContent, provider.Model, time.Now().Unix())
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET message_count = message_count + 2, updated_at = $1 WHERE id = $2", t("ai_conversations")), time.Now().Unix(), convID)

		doneJSON, _ := json.Marshal(gin.H{"type": "done"})
		fmt.Fprintf(c.Writer, "data: %s\n\n", doneJSON)
		c.Writer.Flush()
		return
	}

	// Non-streaming
	body, _ := json.Marshal(map[string]interface{}{
		"model": provider.Model, "messages": messages,
		"temperature": provider.Temperature, "max_tokens": provider.MaxTokens,
	})
	httpReq, _ := http.NewRequest("POST", provider.Endpoint, bytes.NewReader(body))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+provider.APIKey)

	client := &http.Client{Timeout: time.Duration(provider.Timeout) * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil { util.Error(c, 500, "API_ERROR", err.Error()); return }
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	json.Unmarshal(respBody, &result)

	content := ""
	if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
		if msg, ok := choices[0].(map[string]interface{})["message"].(map[string]interface{}); ok {
			content = fmt.Sprintf("%v", msg["content"])
		}
	}

	config.DB.Exec(fmt.Sprintf("INSERT INTO %s (conversation_id, role, content, model, created_at) VALUES ($1,$2,$3,$4,$5)", t("ai_messages")),
		convID, "assistant", content, provider.Model, time.Now().Unix())
	config.DB.Exec(fmt.Sprintf("UPDATE %s SET message_count = message_count + 2, updated_at = $1 WHERE id = $2", t("ai_conversations")), time.Now().Unix(), convID)

	util.Success(c, gin.H{"conversation_id": convID, "content": content, "model": provider.Model})
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
	content := callAI("Generate a concise SEO-friendly URL slug for: "+req.Title+". Return ONLY the slug.", 50)
	if content == "" { util.Error(c, 500, "AI_ERROR", "AI 服务不可用"); return }
	util.Success(c, gin.H{"slug": content})
}

func AISummary(c *gin.Context) {
	var req struct { Title string `json:"title"`; Content string `json:"content"` }
	c.ShouldBindJSON(&req)
	if req.Content == "" { util.BadRequest(c, "内容不能为空"); return }
	text := req.Content; if len(text) > 2000 { text = text[:2000] }
	content := callAI("Summarize in same language, max 200 chars: "+req.Title+" - "+text, 300)
	if content == "" { util.Error(c, 500, "AI_ERROR", "AI 服务不可用"); return }
	util.Success(c, gin.H{"summary": content})
}

func AIFormat(c *gin.Context) {
	var req struct { Content string `json:"content"` }
	c.ShouldBindJSON(&req)
	if req.Content == "" { util.BadRequest(c, "内容不能为空"); return }
	content := callAI("Improve formatting and readability, keep original language, use Markdown: "+req.Content, 4096)
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

func callAI(prompt string, maxTokens int) string {
	var provider model.AIProvider
	err := config.DB.Get(&provider, "SELECT * FROM "+config.T("ai_providers")+" WHERE type='text' AND is_active=true ORDER BY is_default DESC LIMIT 1")
	if err != nil { return "" }

	body, _ := json.Marshal(map[string]interface{}{
		"model": provider.Model, "messages": []map[string]string{{"role": "user", "content": prompt}},
		"max_tokens": maxTokens, "temperature": 0.3,
	})
	req, _ := http.NewRequest("POST", provider.Endpoint, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)
	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil { return "" }
	defer resp.Body.Close()
	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	if choices, ok := result["choices"].([]interface{}); ok && len(choices) > 0 {
		if msg, ok := choices[0].(map[string]interface{})["message"].(map[string]interface{}); ok {
			return fmt.Sprintf("%v", msg["content"])
		}
	}
	return ""
}

func min(a, b int) int { if a < b { return a }; return b }
