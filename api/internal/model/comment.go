package model

import (
	"fmt"
	"utterlog-go/config"
)

type Comment struct {
	ID        int     `db:"id" json:"id"`
	PostID    int     `db:"post_id" json:"post_id"`
	ParentID  *int    `db:"parent_id" json:"parent_id,omitempty"`
	Author    string  `db:"author" json:"author"`
	Email     string  `db:"email" json:"email"`
	URL       *string `db:"url" json:"url,omitempty"`
	Content   string  `db:"content" json:"content"`
	Status    string  `db:"status" json:"status"`
	IP        *string `db:"ip" json:"ip,omitempty"`
	UserAgent *string `db:"user_agent" json:"user_agent,omitempty"`
	DisplayID int     `db:"display_id" json:"display_id"`
	CreatedAt int64   `db:"created_at" json:"created_at"`
}

func CommentsList(page, perPage int, status string) ([]Comment, int, error) {
	t := config.T("comments")
	where := ""
	args := []interface{}{}
	idx := 1
	if status != "" {
		where = fmt.Sprintf("WHERE status = $%d", idx); args = append(args, status); idx++
	}
	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s %s", t, where), args...)

	args = append(args, perPage, (page-1)*perPage)
	var comments []Comment
	config.DB.Select(&comments, fmt.Sprintf("SELECT * FROM %s %s ORDER BY created_at DESC LIMIT $%d OFFSET $%d", t, where, idx, idx+1), args...)
	if comments == nil { comments = []Comment{} }
	return comments, total, nil
}

func DeleteComment(id int) error {
	_, err := config.DB.Exec("DELETE FROM "+config.T("comments")+" WHERE id = $1", id)
	return err
}
