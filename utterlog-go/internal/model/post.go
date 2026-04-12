package model

import (
	"fmt"
	"strings"
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
	CreatedAt    int64   `db:"created_at" json:"created_at"`
	UpdatedAt    int64   `db:"updated_at" json:"updated_at"`
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
}

type MetaBrief struct {
	ID   int    `json:"id"`
	Name string `json:"name"`
	Slug string `json:"slug"`
}

const postListCols = "id, title, slug, excerpt, type, display_id, status, author_id, cover_url, view_count, comment_count, created_at, updated_at"
const postDetailCols = "id, title, slug, content, excerpt, type, display_id, status, author_id, cover_url, password, allow_comment, pinned, view_count, comment_count, created_at, updated_at"

func PostsList(typ, status, search, orderBy, order string, page, perPage int) ([]Post, int, error) {
	t := config.T("posts")
	where := []string{}
	args := []interface{}{}
	idx := 1

	if typ != "" {
		where = append(where, fmt.Sprintf("type = $%d", idx)); args = append(args, typ); idx++
	}
	if status != "" {
		where = append(where, fmt.Sprintf("status = $%d", idx)); args = append(args, status); idx++
	}
	if search != "" {
		where = append(where, fmt.Sprintf("(title ILIKE $%d OR content ILIKE $%d)", idx, idx+1))
		args = append(args, "%"+search+"%", "%"+search+"%"); idx += 2
	}

	whereStr := ""
	if len(where) > 0 {
		whereStr = "WHERE " + strings.Join(where, " AND ")
	}

	allowed := map[string]bool{"created_at": true, "updated_at": true, "display_id": true, "view_count": true, "title": true}
	if !allowed[orderBy] { orderBy = "created_at" }
	if order != "ASC" && order != "DESC" { order = "DESC" }

	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s %s", t, whereStr), args...)

	offset := (page - 1) * perPage
	countArgs := append(args, perPage, offset)
	query := fmt.Sprintf("SELECT %s FROM %s %s ORDER BY %s %s LIMIT $%d OFFSET $%d",
		postListCols, t, whereStr, orderBy, order, idx, idx+1)

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
		"SELECT m.id, m.name, m.slug FROM %s m JOIN %s r ON m.id = r.meta_id WHERE r.post_id = $1 AND m.type = 'category'",
		config.T("metas"), config.T("relationships")), postID)
	if cats == nil { cats = []MetaBrief{} }
	return cats
}

func PostTags(postID int) []MetaBrief {
	var tags []MetaBrief
	config.DB.Select(&tags, fmt.Sprintf(
		"SELECT m.id, m.name, m.slug FROM %s m JOIN %s r ON m.id = r.meta_id WHERE r.post_id = $1 AND m.type = 'tag'",
		config.T("metas"), config.T("relationships")), postID)
	if tags == nil { tags = []MetaBrief{} }
	return tags
}

func PostAuthor(authorID int) *UserBrief {
	u, err := UserByID(authorID)
	if err != nil { return nil }
	return &UserBrief{ID: u.ID, Username: u.Username, Nickname: u.NicknameStr()}
}

func FormatPost(p *Post, detail bool) PostWithRelations {
	pr := PostWithRelations{Post: *p}
	if !detail { p.Content = nil }
	pr.Author = PostAuthor(p.AuthorID)
	pr.Categories = PostCategories(p.ID)
	pr.Tags = PostTags(p.ID)
	return pr
}

func CreatePost(p *Post) (int, error) {
	var id int
	err := config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (title, slug, content, excerpt, type, status, author_id, cover_url, password, allow_comment, pinned, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13) RETURNING id",
		config.T("posts")),
		p.Title, p.Slug, p.Content, p.Excerpt, p.Type, p.Status, p.AuthorID,
		p.CoverURL, p.Password, p.AllowComment, p.Pinned, p.CreatedAt, p.UpdatedAt,
	).Scan(&id)
	return id, err
}

func UpdatePost(id int, p *Post) error {
	_, err := config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET title=$1, slug=$2, content=$3, excerpt=$4, status=$5, cover_url=$6, password=$7, allow_comment=$8, pinned=$9, updated_at=$10 WHERE id=$11",
		config.T("posts")),
		p.Title, p.Slug, p.Content, p.Excerpt, p.Status, p.CoverURL, p.Password, p.AllowComment, p.Pinned, p.UpdatedAt, id,
	)
	return err
}

func DeletePost(id int) error {
	_, err := config.DB.Exec("DELETE FROM "+config.T("posts")+" WHERE id = $1", id)
	return err
}
