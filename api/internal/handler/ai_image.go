package handler

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/storage"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// GenerateAIImage — POST /api/v1/admin/ai/generate-image
//
// Body: { "prompt": "...", "size": "1024x1024", "n": 1 }
//
// Picks the active image provider (ai_providers row with type='image',
// is_active=true, ordered default-first), dispatches to the right
// API path based on the endpoint URL, downloads the resulting image,
// uploads it through the configured storage driver, inserts a row in
// the media table, and returns { url, media_id, provider }.
//
// Three flavours supported, matching the user's three target backends:
//
//   1. OpenAI Images API (api.openai.com/v1/images/generations).
//      Standard /images/generations request. b64_json response
//      preferred so we can save the image without a second HTTP
//      round-trip for the URL.
//
//   2. Aliyun DashScope OpenAI-compatible mode (通义万相).
//      dashscope.aliyuncs.com/compatible-mode/v1/images/generations.
//      Same request format as OpenAI, returns b64_json or url.
//      Treated by the same code path as #1.
//
//   3. Google Imagen native API.
//      generativelanguage.googleapis.com/v1beta/models/imagen-X:predict.
//      NOT OpenAI-compatible — uses the Imagen `instances` /
//      `parameters` shape and returns predictions[].bytesBase64Encoded.
//
// Endpoint pattern matching is intentionally loose so users who
// proxy through a gateway (e.g. an OpenAI-compat router that exposes
// gpt-image-1 + wanx + imagen behind one URL) still hit the right
// handler — the gateway either uses /images/generations and we treat
// it as OpenAI-compat, or it uses Imagen's :predict path and we
// treat it as Imagen native.
func GenerateAIImage(c *gin.Context) {
	var req struct {
		Prompt string `json:"prompt"`
		Size   string `json:"size"`
		N      int    `json:"n"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "请求体解析失败：" + err.Error())
		return
	}
	if strings.TrimSpace(req.Prompt) == "" {
		util.BadRequest(c, "prompt 不能为空")
		return
	}
	if req.Size == "" {
		req.Size = "1024x1024"
	}
	if req.N <= 0 {
		req.N = 1
	}
	if req.N > 4 {
		req.N = 4 // hard cap so a typo doesn't burn API credits
	}

	// Pick the active image provider. Same query shape as callAI's
	// text-provider lookup but filtered on type='image'.
	var provider model.AIProvider
	err := config.DB.Get(&provider,
		"SELECT * FROM "+config.T("ai_providers")+
			" WHERE type='image' AND is_active=true ORDER BY is_default DESC, sort_order ASC, id ASC LIMIT 1",
	)
	if err != nil {
		util.Error(c, 400, "NO_PROVIDER", "未配置图片生成提供商。请在 AI 设置 → 提供商 中添加一个 type=图片 的提供商并启用")
		return
	}

	flavor := detectImageFlavor(provider.Endpoint)
	var imgBytes []byte
	var mimeType string
	switch flavor {
	case "openai":
		imgBytes, mimeType, err = generateOpenAICompatImage(provider, req.Prompt, req.Size, req.N)
	case "imagen":
		imgBytes, mimeType, err = generateImagenImage(provider, req.Prompt, req.Size, req.N)
	default:
		util.Error(c, 400, "UNSUPPORTED_ENDPOINT",
			"不支持的图片提供商端点：" + provider.Endpoint +
				"\n受支持：OpenAI / DashScope (通义万相) / Google Imagen。其他厂商请走 OpenAI-兼容代理。")
		return
	}
	if err != nil {
		util.Error(c, 500, "GENERATION_FAILED", "图片生成失败：" + err.Error())
		return
	}
	if len(imgBytes) == 0 {
		util.Error(c, 500, "EMPTY_RESPONSE", "提供商返回了空图片")
		return
	}

	// Persist via the same storage layer as user uploads — keeps
	// driver-agnostic (works for local / S3 / R2) and AI images show
	// up in the admin Media library alongside everything else.
	ext := extFromMimeFuzzy(mimeType)
	filename := storage.GeneratePath(ext, "ai")
	url, uploadErr := storage.Default.Upload(filename, bytes.NewReader(imgBytes), mimeType)
	if uploadErr != nil {
		util.Error(c, 500, "UPLOAD_FAILED", "图片保存失败：" + uploadErr.Error())
		return
	}

	driverName := config.C.StorageDriver
	if driverName == "" {
		driverName = "local"
	}

	// Insert media row. category='image', name reflects that it was
	// AI-generated (so admin Media listing shows a meaningful label
	// rather than a UUID slug).
	t := config.T("media")
	var mediaID int
	insErr := config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (name, filename, url, mime_type, size, driver, category, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", t),
		fmt.Sprintf("ai-generated-%d.%s", time.Now().Unix(), ext),
		filename, url, mimeType, len(imgBytes), driverName, "image", time.Now().Unix(),
	).Scan(&mediaID)
	if insErr != nil {
		// Image is uploaded but DB row failed — still return the URL
		// so the caller has something usable. Log so the operator can
		// chase the orphan.
		fmt.Printf("[ai-image] media insert failed (file uploaded as %s): %v\n", url, insErr)
	}

	util.Success(c, gin.H{
		"url":      url,
		"media_id": mediaID,
		"provider": provider.Name,
		"model":    provider.Model,
		"size":     len(imgBytes),
		"mime":     mimeType,
	})
}

// detectImageFlavor classifies the provider endpoint into one of the
// supported request-format families.
func detectImageFlavor(endpoint string) string {
	e := strings.ToLower(endpoint)
	switch {
	// Google Imagen — the only family that needs a native
	// (non-OpenAI-compat) request shape.
	case strings.Contains(e, "googleapis.com") && strings.Contains(e, ":predict"):
		return "imagen"
	case strings.Contains(e, "googleapis.com") && strings.Contains(e, "imagen"):
		return "imagen"
	// Everything else with a /images/generations-style path is
	// treated as OpenAI-compatible. Covers OpenAI proper, DashScope
	// (通义万相 in compatible-mode), Together AI, OpenRouter, etc.
	default:
		return "openai"
	}
}

// extFromMimeFuzzy is like media_sync.go's extFromMime but tolerates
// charset suffixes ('image/png; charset=binary') that some providers
// include and falls back to png rather than '' so AI uploads always
// get a valid file extension. Kept package-private with a distinct
// name to avoid colliding with the strict map-lookup version used
// by media_sync.go.
func extFromMimeFuzzy(mime string) string {
	m := strings.ToLower(mime)
	switch {
	case strings.Contains(m, "jpeg"), strings.Contains(m, "jpg"):
		return "jpg"
	case strings.Contains(m, "webp"):
		return "webp"
	case strings.Contains(m, "avif"):
		return "avif"
	case strings.Contains(m, "gif"):
		return "gif"
	default:
		return "png"
	}
}

// generateOpenAICompatImage handles OpenAI + DashScope-compatible-mode +
// any other provider exposing /v1/images/generations. Asks for
// b64_json so we can save the image without a second HTTP round-trip;
// falls back to following the URL if the provider only returned that.
func generateOpenAICompatImage(p model.AIProvider, prompt, size string, n int) ([]byte, string, error) {
	// gpt-image-1 only returns b64; dall-e-3 supports both. Always
	// asking for b64_json works for both (and skips a fetch hop).
	body, _ := json.Marshal(map[string]interface{}{
		"model":           p.Model,
		"prompt":          prompt,
		"n":               n,
		"size":            size,
		"response_format": "b64_json",
	})
	req, err := http.NewRequest("POST", p.Endpoint, bytes.NewReader(body))
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+p.APIKey)

	timeout := time.Duration(p.Timeout) * time.Second
	if timeout < 30*time.Second {
		// Image gen is slow — gpt-image-1 can take 30-90s, wanx can
		// take 60-180s for 1024x1024. The default chat-completion
		// 90s timeout is too short for the heaviest models. 180s.
		timeout = 180 * time.Second
	}
	resp, err := (&http.Client{Timeout: timeout}).Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	rawBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		preview := string(rawBody)
		if len(preview) > 400 {
			preview = preview[:400]
		}
		return nil, "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, preview)
	}

	var result struct {
		Data []struct {
			B64Json string `json:"b64_json"`
			URL     string `json:"url"`
		} `json:"data"`
	}
	if jerr := json.Unmarshal(rawBody, &result); jerr != nil {
		return nil, "", fmt.Errorf("response parse: %v (body: %s)", jerr, truncate(string(rawBody), 200))
	}
	if len(result.Data) == 0 {
		return nil, "", fmt.Errorf("响应中没有 data 字段，原文：%s", truncate(string(rawBody), 200))
	}

	d := result.Data[0]
	var imgBytes []byte
	if d.B64Json != "" {
		var berr error
		imgBytes, berr = base64.StdEncoding.DecodeString(d.B64Json)
		if berr != nil {
			return nil, "", fmt.Errorf("base64 decode: %v", berr)
		}
	} else if d.URL != "" {
		// Fallback: provider only returned a URL (some DashScope
		// configs do this). Download it now.
		imgResp, gerr := (&http.Client{Timeout: 60 * time.Second}).Get(d.URL)
		if gerr != nil {
			return nil, "", fmt.Errorf("fetch image url: %v", gerr)
		}
		defer imgResp.Body.Close()
		imgBytes, _ = io.ReadAll(imgResp.Body)
	} else {
		return nil, "", fmt.Errorf("响应既没有 b64_json 也没有 url 字段")
	}

	mime := http.DetectContentType(imgBytes)
	return imgBytes, mime, nil
}

// generateImagenImage handles Google Imagen via the native :predict
// endpoint. Aspect ratio is derived from the size string so the same
// admin-facing 'size' parameter works across all three backends.
func generateImagenImage(p model.AIProvider, prompt, size string, n int) ([]byte, string, error) {
	// Imagen takes aspectRatio (e.g. "1:1") instead of pixel size.
	// Map common pixel sizes to the closest supported ratio.
	aspect := "1:1"
	switch size {
	case "1536x1024", "1792x1024":
		aspect = "16:9"
	case "1024x1536", "1024x1792":
		aspect = "9:16"
	case "1216x768", "1344x768":
		aspect = "3:2"
	case "768x1216", "768x1344":
		aspect = "2:3"
	}

	body, _ := json.Marshal(map[string]interface{}{
		"instances": []map[string]string{{"prompt": prompt}},
		"parameters": map[string]interface{}{
			"sampleCount": n,
			"aspectRatio": aspect,
		},
	})

	// Google AI Studio uses ?key=API_KEY query param auth (NOT
	// Authorization header). If the user pasted a full URL with the
	// key already embedded leave it; otherwise append.
	url := p.Endpoint
	if !strings.Contains(url, "key=") {
		sep := "?"
		if strings.Contains(url, "?") {
			sep = "&"
		}
		url += sep + "key=" + p.APIKey
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(body))
	if err != nil {
		return nil, "", err
	}
	req.Header.Set("Content-Type", "application/json")

	timeout := 180 * time.Second
	resp, err := (&http.Client{Timeout: timeout}).Do(req)
	if err != nil {
		return nil, "", err
	}
	defer resp.Body.Close()

	rawBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 400 {
		preview := string(rawBody)
		if len(preview) > 400 {
			preview = preview[:400]
		}
		return nil, "", fmt.Errorf("HTTP %d: %s", resp.StatusCode, preview)
	}

	var result struct {
		Predictions []struct {
			BytesBase64Encoded string `json:"bytesBase64Encoded"`
			MimeType           string `json:"mimeType"`
		} `json:"predictions"`
	}
	if jerr := json.Unmarshal(rawBody, &result); jerr != nil {
		return nil, "", fmt.Errorf("response parse: %v (body: %s)", jerr, truncate(string(rawBody), 200))
	}
	if len(result.Predictions) == 0 {
		return nil, "", fmt.Errorf("Imagen 响应中没有 predictions 字段，原文：%s", truncate(string(rawBody), 200))
	}

	imgBytes, berr := base64.StdEncoding.DecodeString(result.Predictions[0].BytesBase64Encoded)
	if berr != nil {
		return nil, "", fmt.Errorf("base64 decode: %v", berr)
	}
	mime := result.Predictions[0].MimeType
	if mime == "" {
		mime = "image/png"
	}
	return imgBytes, mime, nil
}

// truncate is the safer string-prefix helper used by the diagnostic
// error messages above; avoids panicking on shorter inputs.
func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "..."
}
