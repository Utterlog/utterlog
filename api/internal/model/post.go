package model

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"
	"utterlog-go/config"

	"github.com/jmoiron/sqlx"
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
	CreatedAt    int64   `db:"created_at" json:"created_at"`
	UpdatedAt    int64   `db:"updated_at" json:"updated_at"`
	// Null when the post has never been published (draft never promoted).
	// Stored as a proper timestamp column so WP-style backdated imports
	// keep real publish dates, independent of created_at.
	PublishedAt *time.Time `db:"published_at" json:"published_at,omitempty"`
	// Meta JSONB —— 当 post.type='video' 时存影视元数据
	// {video_type, region, year, total_episodes, directors[], actors[],
	//  genres[], douban_rating, douban_url, imdb_id, tips, ...}。
	// 其他 type 默认 '{}'，未来其他富内容类型也可复用此扩展位。
	// 注意：是 ul_posts 上的 JSONB 列，不是 legacy EAV 表 ul_post_meta。
	Meta json.RawMessage `db:"meta" json:"meta,omitempty"`
}

type PostWithRelations struct {
	Post
	Author             *UserBrief         `json:"author"`
	Categories         []MetaBrief        `json:"categories"`
	Tags               []MetaBrief        `json:"tags"`
	Footprints         []PostFootprint    `json:"footprints,omitempty"`
	FootprintCountries []FootprintCountry `json:"footprint_countries,omitempty"`
	// Episodes 只在 detail=true 且 post.type='video' 时填充（其它场景
	// 不查 ul_post_episodes，避免无谓 JOIN）。omitempty 让普通博客文章
	// 返回不含此字段，前端区分简单。
	Episodes []PostEpisode `json:"episodes,omitempty"`
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
const postListCols = "id, title, slug, excerpt, ai_summary, type, display_id, status, author_id, cover_url, view_count, comment_count, word_count, created_at, updated_at, published_at, meta"
const postDetailCols = "id, title, slug, content, excerpt, ai_summary, ai_questions, type, display_id, status, author_id, cover_url, password, allow_comment, pinned, view_count, comment_count, word_count, created_at, updated_at, published_at, meta"

// PostsListOptions —— ListPosts 的可选过滤参数。
// v2.4.2 起为影视列表新增 meta JSONB 字段过滤（VideoType / Region / Year / Genre）。
// 普通 /posts API 调用不传这些字段即可，只在 type='video' 场景下才生效。
type PostsListOptions struct {
	CategorySlug string
	TagSlug      string
	VideoType    string // meta->>'video_type' = $ —— tv / movie / show / anime / doc
	Region       string // meta->>'region' = $
	Year         string // meta->>'year' = $（按字符串比较，因为 meta 里数字也会被 ->> 拿成字符串）
	Genre        string // meta->'genres' @> '["xxx"]'::jsonb（JSONB 数组包含）
}

func PostsList(typ, status, search, orderBy, order string, page, perPage int, opts PostsListOptions) ([]Post, int, error) {
	t := config.T("posts")
	where := []string{}
	args := []interface{}{}
	idx := 1
	joinClause := ""

	if typ != "" {
		where = append(where, fmt.Sprintf("p.type = $%d", idx))
		args = append(args, typ)
		idx++
	}
	if status != "" {
		where = append(where, fmt.Sprintf("p.status = $%d", idx))
		args = append(args, status)
		idx++
	}
	if search != "" {
		where = append(where, fmt.Sprintf("(p.title ILIKE $%d OR p.content ILIKE $%d)", idx, idx+1))
		args = append(args, "%"+search+"%", "%"+search+"%")
		idx += 2
	}
	if opts.CategorySlug != "" {
		joinClause = fmt.Sprintf(
			" JOIN %s r ON r.post_id = p.id JOIN %s m ON m.id = r.meta_id AND m.type = 'category' AND m.slug = $%d",
			config.T("relationships"), config.T("metas"), idx)
		args = append(args, opts.CategorySlug)
		idx++
	}
	if opts.TagSlug != "" {
		joinClause += fmt.Sprintf(
			" JOIN %s rt ON rt.post_id = p.id JOIN %s mt ON mt.id = rt.meta_id AND mt.type = 'tag' AND mt.slug = $%d",
			config.T("relationships"), config.T("metas"), idx)
		args = append(args, opts.TagSlug)
		idx++
	}
	// 影视 meta 过滤 —— 仅当传入对应值时拼 WHERE
	if opts.VideoType != "" {
		where = append(where, fmt.Sprintf("p.meta->>'video_type' = $%d", idx))
		args = append(args, opts.VideoType)
		idx++
	}
	if opts.Region != "" {
		where = append(where, fmt.Sprintf("p.meta->>'region' = $%d", idx))
		args = append(args, opts.Region)
		idx++
	}
	if opts.Year != "" {
		where = append(where, fmt.Sprintf("(p.meta->>'year') = $%d", idx))
		args = append(args, opts.Year)
		idx++
	}
	if opts.Genre != "" {
		// meta.genres 是 string[] —— 用 @> JSONB 包含；先把 genre 字符串包成 JSON 数组
		where = append(where, fmt.Sprintf("p.meta->'genres' @> $%d::jsonb", idx))
		args = append(args, fmt.Sprintf(`["%s"]`, strings.ReplaceAll(opts.Genre, `"`, `\"`)))
		idx++
	}

	whereStr := ""
	if len(where) > 0 {
		whereStr = "WHERE " + strings.Join(where, " AND ")
	}

	allowed := map[string]bool{"created_at": true, "updated_at": true, "published_at": true, "display_id": true, "view_count": true, "comment_count": true, "title": true}
	isRandom := orderBy == "random"
	if isRandom {
		orderBy = "RANDOM()"
		order = ""
	} else {
		if !allowed[orderBy] {
			orderBy = "published_at"
		}
		if order != "ASC" && order != "DESC" {
			order = "DESC"
		}
		if orderBy == "published_at" {
			orderBy = "COALESCE(p.published_at, TO_TIMESTAMP(p.created_at))"
		} else {
			orderBy = "p." + orderBy
		}
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
	for i, col := range parts {
		parts[i] = "p." + strings.TrimSpace(col)
	}
	cols := strings.Join(parts, ", ")
	query := fmt.Sprintf("SELECT %s FROM %s p%s %s ORDER BY %s LIMIT $%d OFFSET $%d",
		cols, t, joinClause, whereStr, orderClause, idx, idx+1)

	var posts []Post
	config.DB.Select(&posts, query, countArgs...)
	if posts == nil {
		posts = []Post{}
	}
	return posts, total, nil
}

func PostByID(id int) (*Post, error) {
	var p Post
	err := config.DB.Get(&p, "SELECT "+postDetailCols+" FROM "+config.T("posts")+" WHERE id = $1", id)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

func PostBySlug(slug string) (*Post, error) {
	var p Post
	err := config.DB.Get(&p, "SELECT "+postDetailCols+" FROM "+config.T("posts")+" WHERE slug = $1", slug)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// PostByDisplayID lookup —— 配合 permalink 模板里的 %display_id% token。
// display_id 是「发布顺序的连续序号」，跟 db 主键 id 解耦：作者删过草稿、
// 测试过失败插入导致 id 跳号时，display_id 仍然 1, 2, 3, ... 严格递增。
// 用 type='post' 限定避免 page / moments 等其他类型混淆。
func PostByDisplayID(displayID int) (*Post, error) {
	var p Post
	err := config.DB.Get(&p, "SELECT "+postDetailCols+" FROM "+config.T("posts")+" WHERE display_id = $1 AND type = 'post'", displayID)
	if err != nil {
		return nil, err
	}
	return &p, nil
}

// AssignDisplayID keeps legacy callers safe: published public posts expose
// id itself as display_id. New writes go through CreatePost/UpdatePost and
// already keep both values equal.
//
// 触发时机：
//   - 新建 post 时 status=publish → CreatePost handler 调用
//   - 草稿 → 发布的状态切换 → UpdatePost handler 调用
//   - 旧库一次性 backfill → 启动时 BackfillDisplayIDs 调用
func AssignDisplayID(postID int) error {
	t := config.T("posts")
	_, err := config.DB.Exec(fmt.Sprintf(`
		UPDATE %s
		SET display_id = id
		WHERE id = $1 AND id > 0 AND type = 'post' AND status = 'publish'
	`, t), postID)
	return err
}

// BackfillDisplayIDs —— 一次性给老 post 批量分配 display_id。
// 启动时调用：旧库可能有大批 post 的 display_id=0（v1.5.x 之前压根
// 没用过这个字段），按 created_at ASC 同 type 分组依次分配。
//
// 幂等：display_id > 0 的 post 完全不动，所以重启多次也只会处理新增
// 的「漏网之鱼」。草稿不参与编号；只有发布成功的 post 才会拿到 display_id，
// 且 display_id 始终等于正式文章 id。
func BackfillDisplayIDs() error {
	t := config.T("posts")
	// 用 window function ROW_NUMBER 一次性给所有 display_id=0 的 row
	// 算出顺序号。OVER 按 type 分区、按 created_at 排序，同 type 内
	// 按发布时间从早到晚 1, 2, 3...
	//
	// 关键：起始号要接在「该 type 已存在的最大 display_id」之后，避免
	// 跟已分配的 row 冲突。
	q := fmt.Sprintf(`
		WITH ranked AS (
				SELECT id, type,
					ROW_NUMBER() OVER (ORDER BY created_at ASC, id ASC) AS rn
				FROM %s
				WHERE id > 0 AND display_id = 0 AND type = 'post' AND status = 'publish'
			),
			base AS (
				SELECT COALESCE(MAX(display_id), 0) AS max_id FROM %s WHERE type = 'post' AND status = 'publish'
			)
			UPDATE %s p SET display_id = p.id
			FROM ranked, base
			WHERE p.id = ranked.id
	`, t, t, t)
	_, err := config.DB.Exec(q)
	return err
}

func PostCategories(postID int) []MetaBrief {
	var cats []MetaBrief
	config.DB.Select(&cats, fmt.Sprintf(
		"SELECT m.id, m.name, m.slug, COALESCE(m.icon,'') as icon FROM %s m JOIN %s r ON m.id = r.meta_id WHERE r.post_id = $1 AND m.type = 'category'",
		config.T("metas"), config.T("relationships")), postID)
	if cats == nil {
		cats = []MetaBrief{}
	}
	return cats
}

func PostTags(postID int) []MetaBrief {
	var tags []MetaBrief
	config.DB.Select(&tags, fmt.Sprintf(
		"SELECT m.id, m.name, m.slug, COALESCE(m.icon,'') as icon, COALESCE(m.count,0) as count FROM %s m JOIN %s r ON m.id = r.meta_id WHERE r.post_id = $1 AND m.type = 'tag'",
		config.T("metas"), config.T("relationships")), postID)
	if tags == nil {
		tags = []MetaBrief{}
	}
	return tags
}

func PostAuthor(authorID int) *UserBrief {
	u, err := UserByID(authorID)
	if err != nil {
		return nil
	}
	url := ""
	if u.URL != nil {
		url = *u.URL
	}
	bio := ""
	if u.Bio != nil {
		bio = *u.Bio
	}
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
			// Remove markdown images ![...](...) and links [...](...) keeping text
			for strings.Contains(text, "![") {
				s := strings.Index(text, "![")
				e := strings.Index(text[s:], ")")
				if e == -1 {
					break
				}
				text = text[:s] + text[s+e+1:]
			}
			// Remove headers
			lines := strings.Split(text, "\n")
			var clean []string
			for _, l := range lines {
				l = strings.TrimSpace(l)
				if l == "" || strings.HasPrefix(l, "#") || strings.HasPrefix(l, "---") || strings.HasPrefix(l, ">") {
					continue
				}
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
	if detail {
		pr.Footprints = PostFootprints(p.ID)
		pr.FootprintCountries = FootprintCountriesFrom(pr.Footprints)
		// 影视类型才查剧集 —— 普通 post / page / moment 不触发额外 SQL
		if p.Type == "video" {
			if eps, err := ListEpisodesByPost(p.ID); err == nil {
				pr.Episodes = eps
			}
		}
	}
	return pr
}

func CreatePost(p *Post) (int, error) {
	t := config.T("posts")
	tx, err := config.DB.Beginx()
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	if _, err := tx.Exec("SELECT pg_advisory_xact_lock(hashtext($1))", "utterlog:post-id"); err != nil {
		return 0, err
	}

	id, err := nextPostID(tx, t, p.Type == "post" && p.Status == "publish")
	if err != nil {
		return 0, err
	}
	displayID := 0
	if p.Type == "post" && p.Status == "publish" {
		displayID = id
	}
	if err := insertPostWithID(tx, t, id, displayID, p); err != nil {
		return 0, err
	}
	return id, tx.Commit()
}

func UpdatePost(id int, p *Post) (int, error) {
	t := config.T("posts")

	// Draft-like rows use negative IDs. Publishing one creates a new official
	// positive article ID, copies the row, then deletes the draft row. The
	// old draft ID disappears instead of becoming part of the public series.
	if id < 0 && p.Type == "post" && p.Status == "publish" {
		tx, err := config.DB.Beginx()
		if err != nil {
			return id, err
		}
		defer tx.Rollback()

		if _, err := tx.Exec("SELECT pg_advisory_xact_lock(hashtext($1))", "utterlog:post-id"); err != nil {
			return id, err
		}
		newID, err := nextPostID(tx, t, true)
		if err != nil {
			return id, err
		}
		if _, err := tx.Exec("UPDATE "+t+" SET slug = $1 WHERE id = $2", draftReleaseSlug(id), id); err != nil {
			return id, err
		}
		if err := insertPostWithID(tx, t, newID, newID, p); err != nil {
			return id, err
		}
		for _, relTable := range []string{"relationships", "post_footprints", "post_meta", "annotations", "comments"} {
			if _, err := tx.Exec("UPDATE "+config.T(relTable)+" SET post_id = $1 WHERE post_id = $2", newID, id); err != nil {
				return id, err
			}
		}
		if _, err := tx.Exec("DELETE FROM "+t+" WHERE id = $1", id); err != nil {
			return id, err
		}
		return newID, tx.Commit()
	}

	displayIDSQL := "display_id"
	meta := p.Meta
	if len(meta) == 0 {
		meta = json.RawMessage("{}")
	}
	args := []interface{}{
		p.Title, p.Slug, p.Content, p.Excerpt, p.AISummary, p.Status, p.CoverURL, p.Password, p.AllowComment, p.Pinned, p.WordCount, p.UpdatedAt, p.PublishedAt, []byte(meta), id,
	}
	if id > 0 && p.Type == "post" && p.Status == "publish" {
		displayIDSQL = "id"
	}
	_, err := config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET title=$1, slug=$2, content=$3, excerpt=$4, ai_summary=$5, status=$6, cover_url=$7, password=$8, allow_comment=$9, pinned=$10, word_count=$11, updated_at=$12, published_at=$13, meta=$14, display_id=%s WHERE id=$15",
		t, displayIDSQL), args...)
	return id, err
}

func nextPostID(tx *sqlx.Tx, table string, publicPost bool) (int, error) {
	var id int
	if publicPost {
		err := tx.Get(&id, fmt.Sprintf("SELECT COALESCE(MAX(id), 0) + 1 FROM %s WHERE id > 0", table))
		return id, err
	}
	err := tx.Get(&id, fmt.Sprintf("SELECT COALESCE(MIN(id), 0) - 1 FROM %s WHERE id < 0", table))
	return id, err
}

func insertPostWithID(tx *sqlx.Tx, table string, id int, displayID int, p *Post) error {
	meta := p.Meta
	if len(meta) == 0 {
		meta = json.RawMessage("{}")
	}
	_, err := tx.Exec(fmt.Sprintf(
		"INSERT INTO %s (id, display_id, title, slug, content, excerpt, ai_summary, type, status, author_id, cover_url, password, allow_comment, pinned, word_count, created_at, updated_at, published_at, meta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)",
		table),
		id, displayID,
		p.Title, p.Slug, p.Content, p.Excerpt, p.AISummary, p.Type, p.Status, p.AuthorID,
		p.CoverURL, p.Password, p.AllowComment, p.Pinned, p.WordCount, p.CreatedAt, p.UpdatedAt, p.PublishedAt,
		[]byte(meta),
	)
	return err
}

func draftReleaseSlug(id int) string {
	return fmt.Sprintf("__draft_released_%d_%d", -id, time.Now().UnixNano())
}

func DeletePost(id int) error {
	_, err := config.DB.Exec("DELETE FROM "+config.T("posts")+" WHERE id = $1", id)
	return err
}
