package model

import (
	"fmt"
	"utterlog-go/config"
)

// Meta represents both categories and tags (type field distinguishes)
type Meta struct {
	ID          int     `db:"id" json:"id"`
	Name        string  `db:"name" json:"name"`
	Slug        string  `db:"slug" json:"slug"`
	Type        string  `db:"type" json:"type"`
	Description *string `db:"description" json:"description,omitempty"`
	ParentID    *int    `db:"parent_id" json:"parent_id,omitempty"`
	Count       int     `db:"count" json:"count"`
	CreatedAt   int64   `db:"created_at" json:"created_at"`
	UpdatedAt   int64   `db:"updated_at" json:"updated_at"`
}

func MetasByType(typ string) ([]Meta, error) {
	var metas []Meta
	err := config.DB.Select(&metas, "SELECT * FROM "+config.T("metas")+" WHERE type = $1 ORDER BY name ASC", typ)
	if metas == nil { metas = []Meta{} }
	return metas, err
}

func MetaByID(id int) (*Meta, error) {
	var m Meta
	err := config.DB.Get(&m, "SELECT * FROM "+config.T("metas")+" WHERE id = $1", id)
	if err != nil { return nil, err }
	return &m, nil
}

func MetaBySlugAndType(slug, typ string) (*Meta, error) {
	var m Meta
	err := config.DB.Get(&m, "SELECT * FROM "+config.T("metas")+" WHERE slug = $1 AND type = $2", slug, typ)
	if err != nil { return nil, err }
	return &m, nil
}

func CreateMeta(m *Meta) (int, error) {
	var id int
	err := config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (name, slug, type, description, parent_id, count, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id",
		config.T("metas")),
		m.Name, m.Slug, m.Type, m.Description, m.ParentID, 0, m.CreatedAt, m.UpdatedAt,
	).Scan(&id)
	return id, err
}

func UpdateMeta(id int, m *Meta) error {
	_, err := config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET name=$1, slug=$2, description=$3, parent_id=$4, updated_at=$5 WHERE id=$6",
		config.T("metas")),
		m.Name, m.Slug, m.Description, m.ParentID, m.UpdatedAt, id,
	)
	return err
}

func DeleteMeta(id int) error {
	_, err := config.DB.Exec("DELETE FROM "+config.T("metas")+" WHERE id = $1", id)
	return err
}
