package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html"
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
		Message *struct {
			MessageID int `json:"message_id"`
			From      struct {
				ID       int    `json:"id"`
				Username string `json:"username"`
			} `json:"from"`
			Chat struct {
				ID       int64  `json:"id"`
				Type     string `json:"type"`
				Title    string `json:"title"`
				Username string `json:"username"`
			} `json:"chat"`
			Text  string `json:"text"`
			Photo []struct {
				FileID string `json:"file_id"`
			} `json:"photo"`
		} `json:"message"`
		CallbackQuery *struct {
			ID   string `json:"id"`
			Data string `json:"data"`
			From struct {
				ID int `json:"id"`
			} `json:"from"`
			Message struct {
				MessageID int `json:"message_id"`
				Chat      struct {
					ID int64 `json:"id"`
				} `json:"chat"`
				Text string `json:"text"`
			} `json:"message"`
		} `json:"callback_query"`
	}
	if err := c.ShouldBindJSON(&update); err != nil {
		c.JSON(200, gin.H{"ok": true}); return
	}

	configuredChatID := model.GetOption("telegram_chat_id")
	botToken := model.GetOption("telegram_bot_token")

	// ——— Handle inline button presses ———
	if update.CallbackQuery != nil {
		cq := update.CallbackQuery
		cqChatID := cq.Message.Chat.ID

		if configuredChatID == "" || fmt.Sprintf("%d", cqChatID) != configuredChatID {
			c.JSON(200, gin.H{"ok": true}); return
		}

		parts := strings.SplitN(cq.Data, ":", 2)
		if len(parts) != 2 || botToken == "" {
			c.JSON(200, gin.H{"ok": true}); return
		}
		action, commentID := parts[0], parts[1]

		var toast string
		switch action {
		case "approve":
			var oldStatus string
			config.DB.Get(&oldStatus, "SELECT status FROM "+config.T("comments")+" WHERE id = $1", commentID)
			config.DB.Exec(fmt.Sprintf("UPDATE %s SET status = 'approved' WHERE id = $1", config.T("comments")), commentID)
			if oldStatus == "pending" || oldStatus == "spam" {
				var postID int
				config.DB.Get(&postID, "SELECT post_id FROM "+config.T("comments")+" WHERE id = $1", commentID)
				if postID > 0 {
					config.DB.Exec(fmt.Sprintf("UPDATE %s SET comment_count = comment_count + 1 WHERE id = $1", config.T("posts")), postID)
				}
			}
			toast = "✅ 评论已通过审核"
		case "reject":
			config.DB.Exec(fmt.Sprintf("UPDATE %s SET status = 'trash' WHERE id = $1", config.T("comments")), commentID)
			toast = "❌ 评论已拒绝"
		default:
			c.JSON(200, gin.H{"ok": true}); return
		}

		// Answer callback (dismiss button loading state)
		tgAnswerCallback(botToken, cq.ID, toast)
		// Edit message: remove inline keyboard, append result
		tgEditMessageAppendResult(botToken, cqChatID, cq.Message.MessageID, cq.Message.Text, toast)

		c.JSON(200, gin.H{"ok": true}); return
	}

	// ——— Handle regular messages ———
	if update.Message == nil {
		c.JSON(200, gin.H{"ok": true}); return
	}

	msg := update.Message
	text := strings.TrimSpace(msg.Text)
	chatID := msg.Chat.ID

	// Always capture incoming chat IDs for admin discovery (before configured-ID check)
	tgDiscoverChat(chatID, msg.Chat.Type, func() string {
		if msg.Chat.Title != "" { return msg.Chat.Title }
		if msg.Chat.Username != "" { return "@" + msg.Chat.Username }
		return msg.From.Username
	}())

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
			"/stats — 数据报告\n" +
			"/help — 帮助\n\n" +
			"直接发送文字 → 发布说说\n" +
			"发送图片 → 上传到媒体库并发布说说"
		tgSend(chatID, help)

	// Photo — upload image + publish moment
	case len(msg.Photo) > 0:
		photo := msg.Photo[len(msg.Photo)-1]
		if botToken == "" { tgSend(chatID, "❌ Bot Token 未配置"); break }

		fileURL := getTelegramFileURL(botToken, photo.FileID)
		if fileURL == "" { tgSend(chatID, "❌ 获取图片失败"); break }

		resp, err := http.Get(fileURL)
		if err != nil { tgSend(chatID, "❌ 下载图片失败"); break }
		defer resp.Body.Close()

		filename := fmt.Sprintf("%s/tg_%d.jpg", time.Now().Format("2006/01/02"), now)
		fullPath := "public/uploads/" + filename
		dst, err := createFile(fullPath)
		if err != nil { tgSend(chatID, "❌ 保存图片失败"); break }
		io.Copy(dst, resp.Body)
		dst.Close()

		imgURL := strings.TrimRight(config.PublicBaseURL(), "/") + "/uploads/" + filename

		config.DB.Exec(fmt.Sprintf(
			"INSERT INTO %s (name, filename, url, mime_type, size, driver, category, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
			t("media")), "telegram_photo.jpg", filename, imgURL, "image/jpeg", 0, "local", "image", now)

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

// SendCommentModerationTG sends a pending comment notification with approve/reject buttons.
// Call this in a goroutine after inserting a pending comment.
func SendCommentModerationTG(commentID int, author, email, authorURL, content, ip string, postTitle string) {
	if model.GetOption("tg_notify_comment") == "false" {
		return
	}
	botToken := model.GetOption("telegram_bot_token")
	chatIDStr := model.GetOption("telegram_chat_id")
	if botToken == "" || chatIDStr == "" {
		return
	}
	var chatID int64
	fmt.Sscanf(chatIDStr, "%d", &chatID)

	// GeoIP lookup
	geo := model.LookupAndStoreGeo(commentID, ip)
	location := ip
	if geo != nil && geo.Country != "" {
		parts := []string{}
		if geo.Country != "" { parts = append(parts, geo.Country) }
		if geo.Province != "" && geo.Province != geo.Country { parts = append(parts, geo.Province) }
		if geo.City != "" && geo.City != geo.Province { parts = append(parts, geo.City) }
		location = strings.Join(parts, " · ")
		if location != "" { location = location + "  (" + ip + ")" } else { location = ip }
	}

	// Build message (plain text — user content may contain markdown special chars)
	urlLine := ""
	if authorURL != "" { urlLine = "\n🔗 " + authorURL }
	msg := fmt.Sprintf(
		"💬 新评论待审核\n\n文章：%s\n昵称：%s\n邮箱：%s%s\nIP：%s\n\n%s",
		postTitle,
		author,
		email,
		urlLine,
		location,
		content,
	)

	// Inline keyboard: approve / reject
	keyboard := map[string]interface{}{
		"inline_keyboard": [][]map[string]string{
			{
				{"text": "✅ 通过", "callback_data": fmt.Sprintf("approve:%d", commentID)},
				{"text": "❌ 拒绝", "callback_data": fmt.Sprintf("reject:%d", commentID)},
			},
		},
	}
	replyMarkup, _ := json.Marshal(keyboard)

	body, _ := json.Marshal(map[string]interface{}{
		"chat_id":      chatID,
		"text":         msg,
		"reply_markup": json.RawMessage(replyMarkup),
	})
	resp, err := http.Post(
		fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken),
		"application/json", bytes.NewReader(body))
	if err != nil { return }
	resp.Body.Close()
}

// Test Telegram connection
func TelegramTest(c *gin.Context) {
	var req struct {
		BotToken string `json:"bot_token"`
		ChatID   string `json:"chat_id"`
	}
	c.ShouldBindJSON(&req)

	botToken := req.BotToken
	if botToken == "" { botToken = model.GetOption("telegram_bot_token") }
	chatID := req.ChatID
	if chatID == "" { chatID = model.GetOption("telegram_chat_id") }

	if botToken == "" || chatID == "" {
		util.BadRequest(c, "请先配置 Bot Token 和 Chat ID"); return
	}

	var id int64
	fmt.Sscanf(chatID, "%d", &id)
	errMsg := tgSendWithDetail(botToken, id, "✅ Utterlog! Bot 连接测试成功\n⏰ "+time.Now().Format("2006-01-02 15:04:05"))
	if errMsg == "" {
		util.Success(c, gin.H{"connected": true})
	} else {
		util.Error(c, 500, "SEND_FAILED", errMsg)
	}
}

// tgDiscoverChat stores an incoming chat ID to the DB for admin discovery.
// Called for every incoming webhook message regardless of configured chat ID.
func tgDiscoverChat(chatID int64, chatType, username string) {
	if chatID == 0 { return }
	idStr := fmt.Sprintf("%d", chatID)

	var existing string
	config.DB.Get(&existing, "SELECT COALESCE(value,'[]') FROM "+config.T("options")+" WHERE name='telegram_discovered_chats'")
	var chats []map[string]interface{}
	json.Unmarshal([]byte(existing), &chats)

	// Update or insert
	found := false
	for i, ch := range chats {
		if fmt.Sprintf("%v", ch["id"]) == idStr {
			if username != "" { chats[i]["name"] = username }
			chats[i]["seen_at"] = time.Now().Unix()
			found = true; break
		}
	}
	if !found {
		name := idStr
		if username != "" { name = "@" + username }
		chats = append(chats, map[string]interface{}{
			"id": idStr, "type": chatType, "name": name, "seen_at": time.Now().Unix(),
		})
	}
	// Keep last 20
	if len(chats) > 20 { chats = chats[len(chats)-20:] }
	b, _ := json.Marshal(chats)
	config.DB.Exec("INSERT INTO "+config.T("options")+" (name,value,created_at,updated_at) VALUES ('telegram_discovered_chats',$1,0,$2) ON CONFLICT (name) DO UPDATE SET value=$1,updated_at=$2",
		string(b), time.Now().Unix())
}

// TelegramGetChatID finds chat IDs for the bot.
// Strategy:
//  1. Read discovered chats from DB (captured by webhook in real time)
//  2. Temporarily delete webhook → getUpdates → restore webhook
//  3. Merge and return deduplicated list
func TelegramGetChatID(c *gin.Context) {
	var req struct {
		BotToken string `json:"bot_token"`
	}
	c.ShouldBindJSON(&req)
	botToken := req.BotToken
	if botToken == "" { botToken = model.GetOption("telegram_bot_token") }
	if botToken == "" { util.BadRequest(c, "Bot Token 未配置"); return }

	seen := map[string]bool{}
	var chats []map[string]interface{}

	// 1. Read webhook-discovered chats from DB
	var discovered string
	config.DB.Get(&discovered, "SELECT COALESCE(value,'[]') FROM "+config.T("options")+" WHERE name='telegram_discovered_chats'")
	var dbChats []map[string]interface{}
	if json.Unmarshal([]byte(discovered), &dbChats) == nil {
		for _, ch := range dbChats {
			id := fmt.Sprintf("%v", ch["id"])
			if id == "" || id == "0" { continue }
			seen[id] = true
			chats = append(chats, map[string]interface{}{
				"id": id, "type": ch["type"], "name": ch["name"], "source": "webhook",
			})
		}
	}

	// 2. Try getUpdates (may fail if webhook is active — we temporarily delete it)
	webhookURL := strings.TrimRight(config.PublicBaseURL(), "/") + "/api/v1/telegram/webhook"

	// Delete webhook
	delResp, err := http.Get(fmt.Sprintf("https://api.telegram.org/bot%s/deleteWebhook", botToken))
	if err == nil { delResp.Body.Close() }

	// Get updates
	updResp, err := http.Get(fmt.Sprintf("https://api.telegram.org/bot%s/getUpdates?limit=20&timeout=0", botToken))

	// Always restore webhook (even if getUpdates failed)
	go func() {
		time.Sleep(500 * time.Millisecond)
		restoreResp, e := http.Get(fmt.Sprintf("https://api.telegram.org/bot%s/setWebhook?url=%s", botToken, webhookURL))
		if e == nil { restoreResp.Body.Close() }
	}()

	if err == nil {
		defer updResp.Body.Close()
		var result struct {
			OK     bool `json:"ok"`
			Result []struct {
				Message *struct {
					Chat struct {
						ID        int64  `json:"id"`
						Type      string `json:"type"`
						Title     string `json:"title"`
						Username  string `json:"username"`
						FirstName string `json:"first_name"`
						LastName  string `json:"last_name"`
					} `json:"chat"`
				} `json:"message"`
				ChannelPost *struct {
					Chat struct {
						ID       int64  `json:"id"`
						Type     string `json:"type"`
						Title    string `json:"title"`
						Username string `json:"username"`
					} `json:"chat"`
				} `json:"channel_post"`
			} `json:"result"`
		}
		json.NewDecoder(updResp.Body).Decode(&result)

		if result.OK {
			for _, u := range result.Result {
				var chatID int64
				var chatType, name string
				if u.Message != nil {
					chatID = u.Message.Chat.ID; chatType = u.Message.Chat.Type
					if u.Message.Chat.Title != "" { name = u.Message.Chat.Title } else {
						name = strings.TrimSpace(u.Message.Chat.FirstName + " " + u.Message.Chat.LastName)
						if u.Message.Chat.Username != "" { name += " (@" + u.Message.Chat.Username + ")" }
					}
				} else if u.ChannelPost != nil {
					chatID = u.ChannelPost.Chat.ID; chatType = u.ChannelPost.Chat.Type
					name = u.ChannelPost.Chat.Title
					if u.ChannelPost.Chat.Username != "" { name += " (@" + u.ChannelPost.Chat.Username + ")" }
				}
				if chatID == 0 { continue }
				idStr := fmt.Sprintf("%d", chatID)
				if seen[idStr] { continue }
				seen[idStr] = true
				chats = append(chats, map[string]interface{}{
					"id": idStr, "type": chatType, "name": name, "source": "updates",
				})
			}
		}
	}

	if len(chats) == 0 {
		util.Success(c, gin.H{
			"chats": []interface{}{},
			"hint":  "未找到聊天记录。请向 Bot 发送任意一条消息后再点击获取。",
		})
		return
	}
	util.Success(c, gin.H{"chats": chats})
}

// Setup Telegram webhook
func TelegramSetupWebhook(c *gin.Context) {
	botToken := model.GetOption("telegram_bot_token")
	if botToken == "" { util.BadRequest(c, "Bot Token 未配置"); return }

	webhookURL := strings.TrimRight(config.PublicBaseURL(), "/") + "/api/v1/telegram/webhook"
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
	return tgSendWithDetail(botToken, chatID, text) == ""
}

// tgSendWithDetail returns "" on success, or the error description from Telegram API
func tgSendWithDetail(botToken string, chatID int64, text string) string {
	body, _ := json.Marshal(map[string]interface{}{
		"chat_id": chatID, "text": text, "parse_mode": "Markdown",
	})
	resp, err := http.Post(
		fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", botToken),
		"application/json", bytes.NewReader(body))
	if err != nil { return "网络请求失败: " + err.Error() }
	defer resp.Body.Close()

	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
		ErrorCode   int    `json:"error_code"`
	}
	json.NewDecoder(resp.Body).Decode(&result)
	if result.OK { return "" }
	if result.Description != "" {
		return fmt.Sprintf("Telegram 错误 %d: %s", result.ErrorCode, result.Description)
	}
	return fmt.Sprintf("HTTP %d", resp.StatusCode)
}

// tgAnswerCallback answers a callback_query to dismiss the button loading state
func tgAnswerCallback(botToken, callbackQueryID, text string) {
	body, _ := json.Marshal(map[string]interface{}{
		"callback_query_id": callbackQueryID,
		"text":              text,
		"show_alert":        false,
	})
	resp, err := http.Post(
		fmt.Sprintf("https://api.telegram.org/bot%s/answerCallbackQuery", botToken),
		"application/json", bytes.NewReader(body))
	if err != nil { return }
	resp.Body.Close()
}

// tgEditMessageAppendResult edits a message to remove inline keyboard and append result line
func tgEditMessageAppendResult(botToken string, chatID int64, messageID int, originalText, result string) {
	newText := originalText + "\n\n" + result
	// Clamp to Telegram's 4096 char limit
	if len([]rune(newText)) > 4096 {
		newText = string([]rune(newText)[:4093]) + "..."
	}
	body, _ := json.Marshal(map[string]interface{}{
		"chat_id":      chatID,
		"message_id":   messageID,
		"text":         newText,
		"reply_markup": map[string]interface{}{"inline_keyboard": []interface{}{}},
	})
	resp, err := http.Post(
		fmt.Sprintf("https://api.telegram.org/bot%s/editMessageText", botToken),
		"application/json", bytes.NewReader(body))
	if err != nil { return }
	resp.Body.Close()
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

// htmlEsc escapes a string for safe use in HTML-mode Telegram messages (unused now but kept for reference)
func htmlEsc(s string) string { return html.EscapeString(s) }
