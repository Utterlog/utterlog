package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// Telegram webhook handler — receives all messages from Telegram Bot
func TelegramWebhook(c *gin.Context) {
	var update struct {
		Message struct {
			MessageID int `json:"message_id"`
			From      struct {
				ID       int    `json:"id"`
				Username string `json:"username"`
			} `json:"from"`
			Chat struct {
				ID int64 `json:"id"`
			} `json:"chat"`
			Text  string `json:"text"`
			Photo []struct {
				FileID string `json:"file_id"`
			} `json:"photo"`
			ReplyToMessage *struct {
				Text string `json:"text"`
			} `json:"reply_to_message"`
		} `json:"message"`
	}
	if err := c.ShouldBindJSON(&update); err != nil {
		c.JSON(200, gin.H{"ok": true}); return
	}

	msg := update.Message
	text := strings.TrimSpace(msg.Text)
	chatID := msg.Chat.ID

	// Verify chat ID matches configured
	configuredChatID := model.GetOption("telegram_chat_id")
	if configuredChatID == "" || fmt.Sprintf("%d", chatID) != configuredChatID {
		c.JSON(200, gin.H{"ok": true}); return
	}

	t := config.T
	now := time.Now().Unix()

	switch {
	// /ai <message> — AI chat
	case strings.HasPrefix(text, "/ai "):
		prompt := strings.TrimPrefix(text, "/ai ")
		response := callAI(prompt, 2048)
		if response == "" { response = "AI 服务暂时不可用" }
		tgSend(chatID, response)

	// /approve <comment_id> — approve comment
	case strings.HasPrefix(text, "/approve "):
		commentID := strings.TrimPrefix(text, "/approve ")
		config.DB.Exec(fmt.Sprintf("UPDATE %s SET status = 'approved' WHERE id = $1", t("comments")), commentID)
		tgSend(chatID, "✅ 评论 #"+commentID+" 已通过审核")

	// /stats — daily report
	case text == "/stats" || text == "/report":
		var postCount, commentCount, viewCount int
		config.DB.Get(&postCount, "SELECT COUNT(*) FROM "+t("posts")+" WHERE type='post'")
		config.DB.Get(&commentCount, "SELECT COUNT(*) FROM "+t("comments"))
		config.DB.Get(&viewCount, "SELECT COALESCE(SUM(view_count),0) FROM "+t("posts"))
		report := fmt.Sprintf("📊 *每日报告*\n\n📝 文章: %d\n💬 评论: %d\n👁 浏览: %d\n⏰ %s",
			postCount, commentCount, viewCount, time.Now().Format("2006-01-02 15:04"))
		tgSend(chatID, report)

	// /help
	case text == "/help" || text == "/start":
		help := "🤖 *Utterlog! Bot*\n\n" +
			"/ai <消息> — AI 聊天\n" +
			"/approve <ID> — 审核评论\n" +
			"/stats — 数据报告\n" +
			"/help — 帮助\n\n" +
			"直接发送文字 → 发布说说\n" +
			"发送图片 → 上传到媒体库并发布说说"
		tgSend(chatID, help)

	// Photo — upload image + publish moment
	case len(msg.Photo) > 0:
		// Get largest photo
		photo := msg.Photo[len(msg.Photo)-1]
		botToken := model.GetOption("telegram_bot_token")
		if botToken == "" { tgSend(chatID, "❌ Bot Token 未配置"); break }

		// Download file from Telegram
		fileURL := getTelegramFileURL(botToken, photo.FileID)
		if fileURL == "" { tgSend(chatID, "❌ 获取图片失败"); break }

		// Download and save locally
		resp, err := http.Get(fileURL)
		if err != nil { tgSend(chatID, "❌ 下载图片失败"); break }
		defer resp.Body.Close()

		// Save to uploads
		filename := fmt.Sprintf("%s/tg_%d.jpg", time.Now().Format("2006/01/02"), now)
		fullPath := "public/uploads/" + filename
		dst, err := createFile(fullPath)
		if err != nil { tgSend(chatID, "❌ 保存图片失败"); break }
		io.Copy(dst, resp.Body)
		dst.Close()

		imgURL := config.C.AppURL + "/uploads/" + filename

		// Save to media
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (name, filename, url, mime_type, size, driver, category, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
			t("media")), "telegram_photo.jpg", filename, imgURL, "image/jpeg", 0, "local", "image", now)

		// Publish moment with image
		caption := text
		if caption == "" { caption = "📷 来自 Telegram" }
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (content, images, source, author_id, visibility, created_at) VALUES ($1, $2, 'telegram', 1, 'public', $3)",
			t("moments")), caption, fmt.Sprintf("{%s}", imgURL), now)

		tgSend(chatID, fmt.Sprintf("✅ 图片已上传并发布说说\n🔗 %s", imgURL))

	// Plain text — publish as moment
	default:
		if text == "" { break }
		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (content, source, author_id, visibility, created_at) VALUES ($1, 'telegram', 1, 'public', $2)",
			t("moments")), text, now)
		tgSend(chatID, "✅ 说说已发布\n\n"+text)
	}

	c.JSON(200, gin.H{"ok": true})
}

// Test Telegram connection
func TelegramTest(c *gin.Context) {
	botToken := model.GetOption("telegram_bot_token")
	chatID := model.GetOption("telegram_chat_id")
	if botToken == "" || chatID == "" {
		util.BadRequest(c, "请先配置 Bot Token 和 Chat ID"); return
	}

	var id int64
	fmt.Sscanf(chatID, "%d", &id)
	ok := tgSendWithToken(botToken, id, "✅ Utterlog! Bot 连接测试成功\n⏰ "+time.Now().Format("2006-01-02 15:04:05"))
	if ok {
		util.Success(c, gin.H{"connected": true})
	} else {
		util.Error(c, 500, "SEND_FAILED", "发送测试消息失败")
	}
}

// Setup Telegram webhook
func TelegramSetupWebhook(c *gin.Context) {
	botToken := model.GetOption("telegram_bot_token")
	if botToken == "" { util.BadRequest(c, "Bot Token 未配置"); return }

	webhookURL := config.C.AppURL + "/api/v1/telegram/webhook"
	resp, err := http.Get(fmt.Sprintf("https://api.telegram.org/bot%s/setWebhook?url=%s", botToken, webhookURL))
	if err != nil { util.Error(c, 500, "WEBHOOK_ERROR", err.Error()); return }
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	util.Success(c, result)
}

// Helpers
func tgSend(chatID int64, text string) bool {
	botToken := model.GetOption("telegram_bot_token")
	if botToken == "" { return false }
	return tgSendWithToken(botToken, chatID, text)
}

func tgSendWithToken(botToken string, chatID int64, text string) bool {
	body, _ := json.Marshal(map[string]interface{}{
		"chat_id": chatID, "text": text, "parse_mode": "Markdown",
	})
	resp, err := http.Post(
		fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken),
		"application/json", bytes.NewReader(body))
	if err != nil { return false }
	defer resp.Body.Close()
	return resp.StatusCode == 200
}

func getTelegramFileURL(botToken, fileID string) string {
	resp, err := http.Get(fmt.Sprintf("https://api.telegram.org/bot%s/getFile?file_id=%s", botToken, fileID))
	if err != nil { return "" }
	defer resp.Body.Close()
	var result struct {
		OK     bool `json:"ok"`
		Result struct {
			FilePath string `json:"file_path"`
		} `json:"result"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if !result.OK || result.Result.FilePath == "" { return "" }
	return fmt.Sprintf("https://api.telegram.org/file/bot%s/%s", botToken, result.Result.FilePath)
}

func ensureDir(path string) {
	os.MkdirAll(filepath.Dir(path), 0755)
}

func createFile(path string) (*os.File, error) {
	ensureDir(path)
	return os.Create(path)
}
