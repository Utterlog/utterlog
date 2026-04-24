package model

import (
	"fmt"
	"strings"
	"time"
	"utterlog-go/config"
)

type Post struct {
	ID           int     `db:"id" json:"id"`
	Title        string  `db:"title" json:"title"`
	Slug         string  `db:"slug" json:"slug"`
	Content      *string `db:"content" json:"content,omitempty"`
	Excerpt      *string `db:"excerpt" json:"excerpt"`
	Type         string  `db:"type" json:"type"`
	DisplayID    int     `db:"display_id" json:"display_id"`
	Status       string  `db:"status" json:"status"`
	AuthorID     int     `db:"author_id" json:"author_id"`
	CoverURL     *string `db:"cover_url" json:"cover_url,omitempty"`
	Password     *string `db:"password" json:"-"`
	AllowComment *bool   `db:"allow_comment" json:"allow_comment,omitempty"`
	Pinned       *bool   `db:"pinned" json:"pinned,omitempty"`
	ViewCount    int     `db:"view_count" json:"view_count"`
	CommentCount int     `db:"comment_count" json:"comment_count"`
	WordCount    int     `db:"word_count" json:"word_count"`
	AISummary    *string `db:"ai_summary" json:"ai_summary,omitempty"`
	AIQuestions  *string `db:"ai_questions" json:"ai_questions,omitempty"`
	CreatedAt    int64      `db:"created_at" json:"created_at"`
	UpdatedAt    int64      `db:"updated_at" json:"updated_at"`
	// Null when the post has never been published (draft never promoted).
	// Stored as a proper timestamp column so WP-style backdated imports
	// keep real publish dates, independent of created_at.
	PublishedAt  *time.Time `db:"published_at" json:"published_at,omitempty"`
}

type PostWithRelations struct {
	Post
	Author     *UserBrief   `json:"author"`
	Categories []MetaBrief  `json:"categories"`
	Tags       []MetaBrief  `json:"tags"`
}

type UserBrief struct {
	ID       int    `json:"id"`
	Username string `json:"username"`
	Nickname string `json:"nickname"`
	Avatar   string `json:"avatar,omitempty"`
	Email    string `json:"email,omitempty"`
	URL      string `json:"url,omitempty"`
	Bio      string `json:"bio,omitempty"`
}

type MetaBrief struct {
	ID    int    `json:"id"`
	Name  string `json:"name"`
	Slug  string `json:"slug"`
	Icon  string `json:"icon,omitempty"`
	Count int    `json:"count"`
}

// ai_summary included so list views (homepage cards, search results)
// can prefer AI-generated summary over plain excerpt without a second
// round-trip. ~80 runes per row is cheap.
const postListCols = "id, title, slug, excerpt, ai_summary, type, display_id, status, author_id, cover_url, view_count, comment_count, word_count, created_at, updated_at, published_at"
const postDetailCols = "id, title, slug, content, excerpt, ai_summary, ai_questions, type, display_id, status, author_id, cover_url, password, allow_comment, pinned, view_count, comment_count, word_count, created_at, updated_at, published_at"

func PostsList(typ, status, search, orderBy, order string, page, perPage int, categorySlug string, tagSlug ...string) ([]Post, int, error) {
	t := config.T("posts")
	where := []string{}
	args := []interface{}{}
	idx := 1
	joinClause := ""

	if typ != "" {
		where = append(where, fmt.Sprintf("p.type = $%d", idx)); args = append(args, typ); idx++
	}
	if status != "" {
		where = append(where, fmt.Sprintf("p.status = $%d", idx)); args = append(args, status); idx++
	}
	if search != "" {
		where = append(where, fmt.Sprintf("(p.title ILIKE $%d OR p.content ILIKE $%d)", idx, idx+1))
		args = append(args, "%"+search+"%", "%"+search+"%"); idx += 2
	}
	if categorySlug != "" {
		joinClause = fmt.Sprintf(
			" JOIN %s r ON r.post_id = p.id JOIN %s m ON m.id = r.meta_id AND m.type = 'category' AND m.slug = $%d",
			config.T("relationships"), config.T("metas"), idx)
		args = append(args, categorySlug); idx++
	}
	if len(tagSlug) > 0 && tagSlug[0] != "" {
		joinClause += fmt.Sprintf(
			" JOIN %s rt ON rt.post_id = p.id JOIN %s mt ON mt.id = rt.meta_id AND mt.type = 'tag' AND mt.slug = $%d",
			config.T("relationships"), config.T("metas"), idx)
		args = append(args, tagSlug[0]); idx++
	}

	whereStr := ""
	if len(where) > 0 {
		whereStr = "WHERE " + strings.Join(where, " AND ")
	}

	allowed := map[string]bool{"created_at": true, "updated_at": true, "display_id": true, "view_count": true, "comment_count": true, "title": true}
	isRandom := orderBy == "random"
	if isRandom {
		orderBy = "RANDOM()"
		order = ""
	} else {
		if !allowed[orderBy] { orderBy = "created_at" }
		if order != "ASC" && order != "DESC" { order = "DESC" }
		orderBy = "p." + orderBy
	}

	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s p%s %s", t, joinClause, whereStr), args...)

	offset := (page - 1) * perPage
	countArgs := append(args, perPage, offset)

	orderClause := orderBy
	if order != "" {
		orderClause += " " + order
	}
	// Build prefixed column list
	parts := strings.Split(postListCols, ", ")
	for i, col := range parts { parts[i] = "p." + strings.TrimSpace(col) }
	cols := strings.Join(parts, ", ")
	query := fmt.Sprintf("SELECT %s FROM %s p%s %s ORDER BY %s LIMIT $%d OFFSET $%d",
		cols, t, joinClause, whereStr, orderClause, idx, idx+1)

	var posts []Post
	config.DB.Select(&posts, query, countArgs...)
	if posts == nil { posts = []Post{} }
	return posts, total, nil
}

func PostByID(id int) (*Post, error) {
	var p Post
	err := config.DB.Get(&p, "SELECT "+postDetailCols+" FROM "+config.T("posts")+" WHERE id = $1", id)
	if err != nil { return nil, err }
	return &p, nil
}

func PostBySlug(slug string) (*Post, error) {
	var p Post
	err := config.DB.Get(&p, "SELECT "+postDetailCols+" FROM "+config.T("posts")+" WHERE slug = $1", slug)
	if err != nil { return nil, err }
	return &p, nil
}

func PostCategories(postID int) []MetaBrief {
	var cats []MetaBrief
	config.DB.Select(&cats, fmt.Sprintf(
		"SELECT m.id, m.name, m.slug, COALESCE(m.icon,'') as icon FROM %s m JOIN %s r ON m.id = r.meta_id WHERE r.post_id = $1 AND m.type = 'category'",
		config.T("metas"), config.T("relationships")), postID)
	if cats == nil { cats = []MetaBrief{} }
	return cats
}

func PostTags(postID int) []MetaBrief {
	var tags []MetaBrief
	config.DB.Select(&tags, fmt.Sprintf(
		"SELECT m.id, m.name, m.slug, COALESCE(m.icon,'') as icon, COALESCE(m.count,0) as count FROM %s m JOIN %s r ON m.id = r.meta_id WHERE r.post_id = $1 AND m.type = 'tag'",
		config.T("metas"), config.T("relationships")), postID)
	if tags == nil { tags = []MetaBrief{} }
	return tags
}

func PostAuthor(authorID int) *UserBrief {
	u, err := UserByID(authorID)
	if err != nil { return nil }
	url := ""
	if u.URL != nil { url = *u.URL }
	bio := ""
	if u.Bio != nil { bio = *u.Bio }
	return &UserBrief{ID: u.ID, Username: u.Username, Nickname: u.NicknameStr(), Avatar: u.AvatarURL(), Email: u.Email, URL: url, Bio: bio}
}

func FormatPost(p *Post, detail bool) PostWithRelations {
	pr := PostWithRelations{Post: *p}
	if !detail {
		// Consolidate to a single display excerpt for list views
		// (homepage cards, archive, category/tag listings). Priority:
		//   ai_summary → hand-written excerpt → derived from content.
		// Themes can now read `excerpt` as the single source of truth
		// without having to branch on ai_summary themselves. Detail
		// view (!detail=false) keeps the raw excerpt so the admin edit
		// form shows what the author actually typed, separate from the
		// AI-generated summary.
		if p.AISummary != nil && strings.TrimSpace(*p.AISummary) != "" {
			s := strings.TrimSpace(*p.AISummary)
			pr.Excerpt = &s
		}
		// Auto-generate excerpt from content if not set
		if (pr.Excerpt == nil || *pr.Excerpt == "") && p.Content != nil && *p.Content != "" {
			text := *p.Content
			// Strip markdown: code blocks, images, links, headers, bold, etc.
			for {
				start := strings.Index(text, "```")
				if start == -1 { break }
				end := strings.Index(text[start+3:], "```")
				if end == -1 { text = text[:start]; break }
				text = text[:start] + text[start+3+end+3:]
			}
			text = strings.NewReplacer("**", "", "*", "", "~~", "", "`", "").Replace(text)
			// Remove markdown images ![...](...) and links [...](...) keeping text
			for strings.Contains(text, "![") {
				s := strings.Index(text, "![")
				e := strings.Index(text[s:], ")")
				if e == -1 { break }
				text = text[:s] + text[s+e+1:]
			}
			// Remove headers
			lines := strings.Split(text, "\n")
			var clean []string
			for _, l := range lines {
				l = strings.TrimSpace(l)
				if l == "" || strings.HasPrefix(l, "#") || strings.HasPrefix(l, "---") || strings.HasPrefix(l, ">") { continue }
				clean = append(clean, l)
			}
			text = strings.Join(clean, " ")
			text = strings.TrimSpace(text)
			runes := []rune(text)
			if len(runes) > 200 {
				text = string(runes[:200])
			}
			if text != "" {
				pr.Excerpt = &text
			}
		}
		p.Content = nil
	}
	pr.Author = PostAuthor(p.AuthorID)
	pr.Categories = PostCategories(p.ID)
	pr.Tags = PostTags(p.ID)
	return pr
}

func CreatePost(p *Post) (int, error) {
	var id int
	err := config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (title, slug, content, excerpt, type, status, author_id, cover_url, password, allow_comment, pinned, word_count, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id",
		config.T("posts")),
		p.Title, p.Slug, p.Content, p.Excerpt, p.Type, p.Status, p.AuthorID,
		p.CoverURL, p.Password, p.AllowComment, p.Pinned, p.WordCount, p.CreatedAt, p.UpdatedAt,
	).Scan(&id)
	return id, err
}

func UpdatePost(id int, p *Post) error {
	_, err := config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET title=$1, slug=$2, content=$3, excerpt=$4, status=$5, cover_url=$6, password=$7, allow_comment=$8, pinned=$9, word_count=$10, updated_at=$11, published_at=$12 WHERE id=$13",
		config.T("posts")),
		p.Title, p.Slug, p.Content, p.Excerpt, p.Status, p.CoverURL, p.Password, p.AllowComment, p.Pinned, p.WordCount, p.UpdatedAt, p.PublishedAt, id,
	)
	return err
}

func DeletePost(id int) error {
	_, err := config.DB.Exec("DELETE FROM "+config.T("posts")+" WHERE id = $1", id)
	return err
}
