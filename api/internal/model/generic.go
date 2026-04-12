package model

import (
	"fmt"
	"utterlog-go/config"
)

// Generic CRUD for simple content tables (link, moment, music, movie, book, good)
// Each has: id, display_id, status/visibility, author_id, created_at, updated_at

type Link struct {
	ID          int     `db:"id" json:"id"`
	Name        string  `db:"name" json:"name"`
	URL         string  `db:"url" json:"url"`
	Description *string `db:"description" json:"description,omitempty"`
	Logo        *string `db:"logo" json:"logo,omitempty"`
	SortOrder   int     `db:"sort_order" json:"sort_order"`
	Status      string  `db:"status" json:"status"`
	DisplayID   int     `db:"display_id" json:"display_id"`
	CreatedAt   int64   `db:"created_at" json:"created_at"`
	UpdatedAt   int64   `db:"updated_at" json:"updated_at"`
}

type Moment struct {
	ID         int     `db:"id" json:"id"`
	Content    string  `db:"content" json:"content"`
	Images     *string `db:"images" json:"images,omitempty"`
	Location   *string `db:"location" json:"location,omitempty"`
	Mood       *string `db:"mood" json:"mood,omitempty"`
	Source     string  `db:"source" json:"source"`
	AuthorID   int     `db:"author_id" json:"author_id"`
	Visibility string  `db:"visibility" json:"visibility"`
	IsPinned   bool    `db:"is_pinned" json:"is_pinned"`
	DisplayID  int     `db:"display_id" json:"display_id"`
	CreatedAt  int64   `db:"created_at" json:"created_at"`
}

type Music struct {
	ID         int     `db:"id" json:"id"`
	Title      string  `db:"title" json:"title"`
	Artist     *string `db:"artist" json:"artist,omitempty"`
	Album      *string `db:"album" json:"album,omitempty"`
	CoverURL   *string `db:"cover_url" json:"cover_url,omitempty"`
	PlayURL    *string `db:"play_url" json:"play_url,omitempty"`
	Platform   string  `db:"platform" json:"platform"`
	PlatformID *string `db:"platform_id" json:"platform_id,omitempty"`
	Rating     int     `db:"rating" json:"rating"`
	Comment    *string `db:"comment" json:"comment,omitempty"`
	Status     string  `db:"status" json:"status"`
	DisplayID  int     `db:"display_id" json:"display_id"`
	AuthorID   int     `db:"author_id" json:"author_id"`
	CreatedAt  int64   `db:"created_at" json:"created_at"`
	UpdatedAt  int64   `db:"updated_at" json:"updated_at"`
}

type Movie struct {
	ID        int     `db:"id" json:"id"`
	Title     string  `db:"title" json:"title"`
	CoverURL  *string `db:"cover_url" json:"cover_url,omitempty"`
	Rating    int     `db:"rating" json:"rating"`
	Comment   *string `db:"comment" json:"comment,omitempty"`
	Status    string  `db:"status" json:"status"`
	DisplayID int     `db:"display_id" json:"display_id"`
	AuthorID  int     `db:"author_id" json:"author_id"`
	CreatedAt int64   `db:"created_at" json:"created_at"`
	UpdatedAt int64   `db:"updated_at" json:"updated_at"`
}

type Book struct {
	ID        int     `db:"id" json:"id"`
	Title     string  `db:"title" json:"title"`
	Author    *string `db:"author" json:"author,omitempty"`
	CoverURL  *string `db:"cover_url" json:"cover_url,omitempty"`
	Rating    int     `db:"rating" json:"rating"`
	Comment   *string `db:"comment" json:"comment,omitempty"`
	Status    string  `db:"status" json:"status"`
	DisplayID int     `db:"display_id" json:"display_id"`
	AuthorID  int     `db:"author_id" json:"author_id"`
	CreatedAt int64   `db:"created_at" json:"created_at"`
	UpdatedAt int64   `db:"updated_at" json:"updated_at"`
}

type Good struct {
	ID        int     `db:"id" json:"id"`
	Title     string  `db:"title" json:"title"`
	CoverURL  *string `db:"cover_url" json:"cover_url,omitempty"`
	URL       *string `db:"url" json:"url,omitempty"`
	Price     *string `db:"price" json:"price,omitempty"`
	Rating    int     `db:"rating" json:"rating"`
	Comment   *string `db:"comment" json:"comment,omitempty"`
	Status    string  `db:"status" json:"status"`
	DisplayID int     `db:"display_id" json:"display_id"`
	AuthorID  int     `db:"author_id" json:"author_id"`
	CreatedAt int64   `db:"created_at" json:"created_at"`
	UpdatedAt int64   `db:"updated_at" json:"updated_at"`
}

type Media struct {
	ID        int    `db:"id" json:"id"`
	Name      string `db:"name" json:"name"`
	Filename  string `db:"filename" json:"filename"`
	URL       string `db:"url" json:"url"`
	MimeType  string `db:"mime_type" json:"mime_type"`
	Size      int64  `db:"size" json:"size"`
	Driver    string `db:"driver" json:"driver"`
	Category  string `db:"category" json:"category"`
	CreatedAt int64  `db:"created_at" json:"created_at"`
}

type Option struct {
	ID        int    `db:"id" json:"id"`
	Name      string `db:"name" json:"name"`
	Value     string `db:"value" json:"value"`
	Autoload  bool   `db:"autoload" json:"autoload"`
	CreatedAt int64  `db:"created_at" json:"created_at"`
	UpdatedAt int64  `db:"updated_at" json:"updated_at"`
	UserID    int    `db:"user_id" json:"user_id"`
}

type Notification struct {
	ID        int     `db:"id" json:"id"`
	UserID    int     `db:"user_id" json:"user_id"`
	Type      string  `db:"type" json:"type"`
	Title     string  `db:"title" json:"title"`
	Content   *string `db:"content" json:"content,omitempty"`
	IsRead    bool    `db:"is_read" json:"is_read"`
	CreatedAt int64   `db:"created_at" json:"created_at"`
}

type Playlist struct {
	ID        int     `db:"id" json:"id"`
	Title     string  `db:"title" json:"title"`
	Description *string `db:"description" json:"description,omitempty"`
	CoverURL  *string `db:"cover_url" json:"cover_url,omitempty"`
	IsDefault bool    `db:"is_default" json:"is_default"`
	Status    string  `db:"status" json:"status"`
	AuthorID  int     `db:"author_id" json:"author_id"`
	SongCount int     `db:"song_count" json:"song_count"`
	DisplayID int     `db:"display_id" json:"display_id"`
	CreatedAt int64   `db:"created_at" json:"created_at"`
	UpdatedAt int64   `db:"updated_at" json:"updated_at"`
}

// AI Models
type AIProvider struct {
	ID          int     `db:"id" json:"id"`
	Name        string  `db:"name" json:"name"`
	Slug        string  `db:"slug" json:"slug"`
	Type        string  `db:"type" json:"type"`
	Endpoint    string  `db:"endpoint" json:"endpoint"`
	Model       string  `db:"model" json:"model"`
	APIKey      string  `db:"api_key" json:"api_key,omitempty"`
	Temperature float64 `db:"temperature" json:"temperature"`
	MaxTokens   int     `db:"max_tokens" json:"max_tokens"`
	Timeout     int     `db:"timeout" json:"timeout"`
	IsActive    bool    `db:"is_active" json:"is_active"`
	IsDefault   bool    `db:"is_default" json:"is_default"`
	SortOrder   int     `db:"sort_order" json:"sort_order"`
	CreatedAt   int64   `db:"created_at" json:"created_at"`
	UpdatedAt   int64   `db:"updated_at" json:"updated_at"`
}

type AIConversation struct {
	ID           int    `db:"id" json:"id"`
	UserID       int    `db:"user_id" json:"user_id"`
	Title        string `db:"title" json:"title"`
	MessageCount int    `db:"message_count" json:"message_count"`
	TotalTokens  int    `db:"total_tokens" json:"total_tokens"`
	CreatedAt    int64  `db:"created_at" json:"created_at"`
	UpdatedAt    int64  `db:"updated_at" json:"updated_at"`
}

type AIMessage struct {
	ID             int    `db:"id" json:"id"`
	ConversationID int    `db:"conversation_id" json:"conversation_id"`
	Role           string `db:"role" json:"role"`
	Content        string `db:"content" json:"content"`
	Tokens         int    `db:"tokens" json:"tokens"`
	Model          string `db:"model" json:"model"`
	CreatedAt      int64  `db:"created_at" json:"created_at"`
}

// Generic list helper
func GenericList(table string, page, perPage int, orderBy string) ([]map[string]interface{}, int, error) {
	t := config.T(table)
	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s", t))
	offset := (page - 1) * perPage
	if orderBy == "" { orderBy = "created_at DESC" }
	rows, err := config.DB.Queryx(fmt.Sprintf("SELECT * FROM %s ORDER BY %s LIMIT $1 OFFSET $2", t, orderBy), perPage, offset)
	if err != nil { return nil, total, err }
	defer rows.Close()
	var results []map[string]interface{}
	for rows.Next() {
		row := make(map[string]interface{})
		rows.MapScan(row)
		results = append(results, row)
	}
	if results == nil { results = []map[string]interface{}{} }
	return results, total, nil
}

func GetOption(name string) string {
	var val string
	config.DB.Get(&val, "SELECT value FROM "+config.T("options")+" WHERE name = $1", name)
	return val
}
