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

	payload, err := generateAIImageAndPersist(req.Prompt, req.Size, req.N)
	if err != nil {
		// generateAIImageAndPersist returns errors with stable codes
		// so the dispatch decision (400 vs 500) is centralised.
		switch err.Error() {
		case "NO_PROVIDER":
			util.Error(c, 400, "NO_PROVIDER", "未配置图片生成提供商。请在 AI 设置 → 提供商 中添加一个 type=图片 的提供商并启用")
		case "UNSUPPORTED_ENDPOINT":
			util.Error(c, 400, "UNSUPPORTED_ENDPOINT", "不支持的图片提供商端点。受支持：OpenAI / DashScope (通义万相) / Google Imagen。")
		default:
			util.Error(c, 500, "GENERATION_FAILED", err.Error())
		}
		return
	}
	util.Success(c, payload)
}

// AICover — POST /api/v1/admin/ai/cover
//
// Endpoint hit by the post editor's '✨ AI 生成封面' button. Reads the
// post's title + a content excerpt from the request body, blends in
// the admin's preferred style + text policy + ratio from options
// (Settings → 图片处理 → 特色图设置), builds an editorial prompt and
// runs it through the same dispatch as GenerateAIImage so OpenAI /
// 通义万相 / Imagen all work.
//
// This used to be wired in the admin UI but the backend handler was
// never written — the front-end caught the resulting 404 as
// 'AI 服务不可用'. That made the spark button look broken even when
// the user had a working image provider configured.
func AICover(c *gin.Context) {
	var req struct {
		Title   string `json:"title"`
		Content string `json:"content"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "请求体解析失败：" + err.Error())
		return
	}
	title := strings.TrimSpace(req.Title)
	if title == "" {
		util.BadRequest(c, "title 不能为空（请先填写文章标题）")
		return
	}

	// Content excerpt — front-end already trims to 500 chars but
	// double-cap defensively in case someone hits this endpoint
	// directly (e.g. from a script).
	excerpt := strings.TrimSpace(req.Content)
	if len([]rune(excerpt)) > 500 {
		excerpt = string([]rune(excerpt)[:500])
	}

	// Pull the admin's saved style preferences. All optional —
	// defaults match the form's pre-filled values in AiSettings.tsx.
	style := strings.TrimSpace(model.GetOption("ai_image_style"))
	if style == "" {
		style = "editorial"
	}
	textPolicy := strings.TrimSpace(model.GetOption("ai_image_text"))
	if textPolicy == "" {
		textPolicy = "no_text"
	}
	ratio := strings.TrimSpace(model.GetOption("ai_image_ratio"))
	if ratio == "" {
		ratio = "16:9"
	}

	prompt := buildCoverPrompt(title, excerpt, style, textPolicy)
	size := pixelSizeForRatio(ratio)

	payload, err := generateAIImageAndPersist(prompt, size, 1)
	if err != nil {
		switch err.Error() {
		case "NO_PROVIDER":
			util.Error(c, 400, "NO_PROVIDER", "未配置图片生成提供商。请在 AI 设置 → 提供商 中添加 type=图片 的提供商。")
		case "UNSUPPORTED_ENDPOINT":
			util.Error(c, 400, "UNSUPPORTED_ENDPOINT", "图片提供商端点不被识别（仅支持 OpenAI / 通义万相 / Imagen）")
		default:
			util.Error(c, 500, "GENERATION_FAILED", "AI 生成封面失败：" + err.Error())
		}
		return
	}
	// Echo the prompt back so the admin can see what was actually
	// sent — useful when the result doesn't match expectations and
	// the user wants to tweak title/content for a better generation.
	if m, ok := payload.(gin.H); ok {
		m["prompt"] = prompt
	}
	util.Success(c, payload)
}

// generateAIImageAndPersist is the shared core: provider lookup +
// dispatch + storage upload + media row insert. Returns the same
// success payload as GenerateAIImage so AICover can reuse it.
//
// Errors come back as plain error values whose Error() string is one
// of a small set of stable codes ('NO_PROVIDER', 'UNSUPPORTED_ENDPOINT')
// or a free-form 'generation/upload/...: <detail>' message. Callers
// translate codes to HTTP status; free-form goes through as 500.
func generateAIImageAndPersist(prompt, size string, n int) (interface{}, error) {
	if size == "" {
		size = "1024x1024"
	}
	if n <= 0 {
		n = 1
	}
	if n > 4 {
		n = 4
	}

	var provider model.AIProvider
	if err := config.DB.Get(&provider,
		"SELECT * FROM "+config.T("ai_providers")+
			" WHERE type='image' AND is_active=true ORDER BY is_default DESC, sort_order ASC, id ASC LIMIT 1",
	); err != nil {
		return nil, fmt.Errorf("NO_PROVIDER")
	}

	flavor := detectImageFlavor(provider.Endpoint)
	var imgBytes []byte
	var mimeType string
	var err error
	switch flavor {
	case "openai":
		imgBytes, mimeType, err = generateOpenAICompatImage(provider, prompt, size, n)
	case "imagen":
		imgBytes, mimeType, err = generateImagenImage(provider, prompt, size, n)
	default:
		return nil, fmt.Errorf("UNSUPPORTED_ENDPOINT")
	}
	if err != nil {
		return nil, fmt.Errorf("generation: %v", err)
	}
	if len(imgBytes) == 0 {
		return nil, fmt.Errorf("provider returned empty image")
	}

	ext := extFromMimeFuzzy(mimeType)
	filename := storage.GeneratePath(ext, "ai")
	url, uploadErr := storage.Default.Upload(filename, bytes.NewReader(imgBytes), mimeType)
	if uploadErr != nil {
		return nil, fmt.Errorf("upload: %v", uploadErr)
	}

	driverName := config.C.StorageDriver
	if driverName == "" {
		driverName = "local"
	}

	t := config.T("media")
	var mediaID int
	if insErr := config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (name, filename, url, mime_type, size, driver, category, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id", t),
		fmt.Sprintf("ai-generated-%d.%s", time.Now().Unix(), ext),
		filename, url, mimeType, len(imgBytes), driverName, "image", time.Now().Unix(),
	).Scan(&mediaID); insErr != nil {
		// File is on disk; just log the orphan media row.
		fmt.Printf("[ai-image] media insert failed (file uploaded as %s): %v\n", url, insErr)
	}

	return gin.H{
		"url":      url,
		"media_id": mediaID,
		"provider": provider.Name,
		"model":    provider.Model,
		"size":     len(imgBytes),
		"mime":     mimeType,
	}, nil
}

// buildCoverPrompt translates the post metadata + admin preferences
// into an English image-gen prompt. The image models all speak
// English better than CJK regardless of the post language, so the
// natural-language directives stay English; the title/excerpt stay
// in whatever the post is actually written in (the models are happy
// to render based on a non-English subject phrase).
func buildCoverPrompt(title, excerpt, style, textPolicy string) string {
	var b strings.Builder

	// Style preface — gives the model a clear visual direction.
	switch style {
	case "realistic":
		b.WriteString("Photorealistic professional photography, ")
	case "cinematic":
		b.WriteString("Cinematic film still, dramatic lighting, shallow depth of field, ")
	case "illustration":
		b.WriteString("Polished digital illustration, vector-art clarity, ")
	case "minimal":
		b.WriteString("Minimalist composition, clean negative space, muted palette, ")
	case "watercolor":
		b.WriteString("Soft watercolor painting, delicate brush textures, ")
	default: // editorial
		b.WriteString("Editorial blog cover image, magazine-quality composition, ")
	}

	// Subject — title verbatim. Keeping the original language helps
	// the models pick up cultural context that pure-English paraphrase
	// would lose.
	b.WriteString("for an article titled \"")
	b.WriteString(title)
	b.WriteString("\". ")

	if excerpt != "" {
		b.WriteString("Article context: ")
		b.WriteString(excerpt)
		b.WriteString(" ")
	}

	// Text policy.
	switch textPolicy {
	case "title_only":
		b.WriteString("Optionally overlay the title text in a tasteful editorial typography. ")
	case "subtle_caption":
		b.WriteString("Optionally include subtle decorative text elements at the edges. ")
	default: // no_text
		b.WriteString("Do not include any visible text, letters, or watermarks. ")
	}

	// Universal trailers.
	b.WriteString("High quality, professional composition, suitable for a blog post header.")
	return b.String()
}

// pixelSizeForRatio maps the admin-configured aspect ratio string
// (16:9 / 1:1 / 4:3 / 3:2) to the closest pixel size accepted by
// OpenAI's images API. Imagen ignores this and uses the ratio directly
// (handled in generateImagenImage), but it doesn't hurt to be precise.
func pixelSizeForRatio(ratio string) string {
	switch ratio {
	case "16:9":
		return "1536x1024" // gpt-image-2 native, also dall-e-3's 1792x1024 alt
	case "9:16":
		return "1024x1536"
	case "1:1":
		return "1024x1024"
	case "4:3", "3:2":
		// gpt-image doesn't have a native 4:3 / 3:2 — 1536x1024 is
		// closer to 3:2 (~1.5) than 4:3 (~1.33) and avoids the
		// portrait regime, which is wrong for cover images.
		return "1536x1024"
	default:
		return "1024x1024"
	}
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
