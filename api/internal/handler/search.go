package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

// callEmbedding calls the embedding provider to generate a vector for the given text
func callEmbedding(text string) ([]float64, error) {
	var provider model.AIProvider
	err := config.DB.Get(&provider,
		"SELECT * FROM "+config.T("ai_providers")+" WHERE type='embedding' AND is_active=true ORDER BY is_default DESC LIMIT 1")
	if err != nil {
		return nil, fmt.Errorf("no embedding provider configured")
	}

	body, _ := json.Marshal(map[string]interface{}{
		"model": provider.Model,
		"input": text,
	})
	req, _ := http.NewRequest("POST", provider.Endpoint, bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+provider.APIKey)

	resp, err := (&http.Client{Timeout: 30 * time.Second}).Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	var result struct {
		Data []struct {
			Embedding []float64 `json:"embedding"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, err
	}
	if len(result.Data) == 0 || len(result.Data[0].Embedding) == 0 {
		return nil, fmt.Errorf("empty embedding response")
	}
	return result.Data[0].Embedding, nil
}

// embeddingToString converts a float64 slice to pgvector string format: [0.1,0.2,...]
func embeddingToString(emb []float64) string {
	parts := make([]string, len(emb))
	for i, v := range emb {
		parts[i] = strconv.FormatFloat(v, 'f', -1, 64)
	}
	return "[" + strings.Join(parts, ",") + "]"
}

// stripMarkdown removes Markdown formatting to get plain text for embedding
func stripMarkdown(md string) string {
	text := md
	// Remove fenced code blocks
	for {
		start := strings.Index(text, "```")
		if start == -1 {
			break
		}
		end := strings.Index(text[start+3:], "```")
		if end == -1 {
			text = text[:start]
			break
		}
		text = text[:start] + text[start+3+end+3:]
	}
	text = strings.NewReplacer("**", "", "*", "", "~~", "", "`", "").Replace(text)
	// Remove markdown images
	for strings.Contains(text, "![") {
		s := strings.Index(text, "![")
		e := strings.Index(text[s:], ")")
		if e == -1 {
			break
		}
		text = text[:s] + text[s+e+1:]
	}
	// Remove markdown links: [text](url) → text
	for strings.Contains(text, "](") {
		s := strings.LastIndex(text[:strings.Index(text, "](")], "[")
		if s == -1 {
			break
		}
		e := strings.Index(text[s:], ")")
		if e == -1 {
			break
		}
		linkText := text[s+1 : strings.Index(text[s:], "](")+s]
		text = text[:s] + linkText + text[s+e+1:]
	}
	// Remove headers, blockquotes, horizontal rules
	lines := strings.Split(text, "\n")
	var clean []string
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l == "" || strings.HasPrefix(l, "---") {
			continue
		}
		l = strings.TrimLeft(l, "#> ")
		clean = append(clean, l)
	}
	return strings.Join(clean, " ")
}

// embedPost generates and stores embedding for a single post
func embedPost(postID int) {
	p, err := model.PostByID(postID)
	if err != nil || p.Status != "publish" {
		return
	}

	content := p.Title
	if p.Content != nil {
		text := stripMarkdown(*p.Content)
		runes := []rune(text)
		if len(runes) > 8000 {
			text = string(runes[:8000])
		}
		content += " " + text
	}

	emb, err := callEmbedding(content)
	if err != nil {
		return
	}

	config.DB.Exec(
		fmt.Sprintf("UPDATE %s SET embedding = $1 WHERE id = $2", config.T("posts")),
		embeddingToString(emb), postID)
}

// generateAIQuestions generates 3 suggested questions for a post and stores them
func generateAIQuestions(postID int) {
	p, err := model.PostByID(postID)
	if err != nil || p.Status != "publish" {
		return
	}

	prompt := fmt.Sprintf("根据以下文章，生成3个读者可能感兴趣的问题，每行一个问题，不要编号，不要解释，不要使用任何emoji：\n\n标题：%s", p.Title)
	if p.Excerpt != nil && *p.Excerpt != "" {
		prompt += "\n摘要：" + *p.Excerpt
	}
	if p.Content != nil {
		text := stripMarkdown(*p.Content)
		runes := []rune(text)
		if len(runes) > 2000 {
			text = string(runes[:2000])
		}
		prompt += "\n内容：" + text
	}

	result := callAI(prompt, 200)
	if result == "" {
		return
	}

	// Clean up and store as JSON array
	var questions []string
	for _, line := range strings.Split(result, "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		line = strings.TrimLeft(line, "0123456789.-) ")
		if line != "" {
			questions = append(questions, line)
		}
	}
	if len(questions) > 3 {
		questions = questions[:3]
	}
	if len(questions) == 0 {
		return
	}

	questionsJSON, _ := json.Marshal(questions)
	config.DB.Exec(
		fmt.Sprintf("UPDATE %s SET ai_questions = $1 WHERE id = $2", config.T("posts")),
		string(questionsJSON), postID)
}

// generateAISummary generates a one-line AI summary for a post
func generateAISummary(postID int) {
	p, err := model.PostByID(postID)
	if err != nil || p.Status != "publish" {
		return
	}
	// Skip if already has summary
	if p.AISummary != nil && *p.AISummary != "" {
		return
	}

	prompt := fmt.Sprintf("用一句简洁的中文总结以下文章，不超过80字，直接输出总结内容，不要任何前缀，不要使用任何emoji：\n\n标题：%s", p.Title)
	if p.Excerpt != nil && *p.Excerpt != "" {
		prompt += "\n摘要：" + *p.Excerpt
	}
	if p.Content != nil {
		text := stripMarkdown(*p.Content)
		runes := []rune(text)
		if len(runes) > 2000 {
			text = string(runes[:2000])
		}
		prompt += "\n内容：" + text
	}

	result := callAI(prompt, 120)
	if result == "" {
		return
	}
	result = strings.TrimSpace(result)

	config.DB.Exec(
		fmt.Sprintf("UPDATE %s SET ai_summary = $1 WHERE id = $2", config.T("posts")),
		result, postID)
}

// SemanticSearch handles public search requests
// GET /api/v1/search?q=keyword&limit=10
func SemanticSearch(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		util.BadRequest(c, "搜索关键词不能为空")
		return
	}

	limit := 10
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 50 {
		limit = l
	}

	t := config.T("posts")

	// Try semantic search first
	emb, err := callEmbedding(q)
	if err == nil {
		// Semantic search with cosine similarity
		query := fmt.Sprintf(`
			SELECT id, title, slug, excerpt, cover_url, view_count, comment_count, created_at,
				   1 - (embedding <=> $1) AS score
			FROM %s
			WHERE status = 'publish' AND type = 'post' AND embedding IS NOT NULL
			ORDER BY embedding <=> $1
			LIMIT $2`, t)

		type SearchResult struct {
			ID           int      `json:"id" db:"id"`
			Title        string   `json:"title" db:"title"`
			Slug         string   `json:"slug" db:"slug"`
			Excerpt      *string  `json:"excerpt" db:"excerpt"`
			CoverURL     *string  `json:"cover_url" db:"cover_url"`
			ViewCount    int      `json:"view_count" db:"view_count"`
			CommentCount int      `json:"comment_count" db:"comment_count"`
			CreatedAt    int64    `json:"created_at" db:"created_at"`
			Score        float64  `json:"score" db:"score"`
		}

		var results []SearchResult
		err := config.DB.Select(&results, query, embeddingToString(emb), limit)
		if err == nil && len(results) > 0 {
			util.Success(c, gin.H{"results": results, "mode": "semantic", "total": len(results)})
			return
		}
	}

	// Fallback: keyword search with ILIKE
	query := fmt.Sprintf(`
		SELECT id, title, slug, excerpt, cover_url, view_count, comment_count, created_at
		FROM %s
		WHERE status = 'publish' AND type = 'post'
		  AND (title ILIKE $1 OR COALESCE(content,'') ILIKE $1)
		ORDER BY created_at DESC
		LIMIT $2`, t)

	type KeywordResult struct {
		ID           int     `json:"id" db:"id"`
		Title        string  `json:"title" db:"title"`
		Slug         string  `json:"slug" db:"slug"`
		Excerpt      *string `json:"excerpt" db:"excerpt"`
		CoverURL     *string `json:"cover_url" db:"cover_url"`
		ViewCount    int     `json:"view_count" db:"view_count"`
		CommentCount int     `json:"comment_count" db:"comment_count"`
		CreatedAt    int64   `json:"created_at" db:"created_at"`
	}

	var results []KeywordResult
	config.DB.Select(&results, query, "%"+q+"%", limit)
	if results == nil {
		results = []KeywordResult{}
	}

	util.Success(c, gin.H{"results": results, "mode": "keyword", "total": len(results)})
}

// RebuildEmbeddings regenerates embeddings for all published posts (admin only)
// POST /api/v1/search/rebuild
func RebuildEmbeddings(c *gin.Context) {
	t := config.T("posts")

	// Check embedding provider exists
	_, err := callEmbedding("test")
	if err != nil {
		util.Error(c, 400, "NO_PROVIDER", "请先配置 embedding 类型的 AI 提供商")
		return
	}

	var posts []struct {
		ID      int     `db:"id"`
		Title   string  `db:"title"`
		Content *string `db:"content"`
	}
	config.DB.Select(&posts, fmt.Sprintf("SELECT id, title, content FROM %s WHERE status = 'publish' AND type = 'post' ORDER BY id", t))

	total := len(posts)
	embedded := 0
	failed := 0

	for _, p := range posts {
		content := p.Title
		if p.Content != nil {
			text := stripMarkdown(*p.Content)
			runes := []rune(text)
			if len(runes) > 8000 {
				text = string(runes[:8000])
			}
			content += " " + text
		}

		emb, err := callEmbedding(content)
		if err != nil {
			failed++
			continue
		}

		_, err = config.DB.Exec(
			fmt.Sprintf("UPDATE %s SET embedding = $1 WHERE id = $2", t),
			embeddingToString(emb), p.ID)
		if err != nil {
			failed++
			continue
		}
		embedded++

		// Rate limit: 200ms between calls
		time.Sleep(200 * time.Millisecond)
	}

	util.Success(c, gin.H{"total": total, "embedded": embedded, "failed": failed})
}
