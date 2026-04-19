package model

import (
	"fmt"
	"utterlog-go/config"
)

// Meta represents both categories and tags (type field distinguishes)
type Meta struct {
	ID             int     `db:"id" json:"id"`
	Name           string  `db:"name" json:"name"`
	Slug           string  `db:"slug" json:"slug"`
	Type           string  `db:"type" json:"type"`
	Icon           *string `db:"icon" json:"icon,omitempty"`
	Color          *string `db:"color" json:"color,omitempty"`
	Description    *string `db:"description" json:"description,omitempty"`
	ParentID       *int    `db:"parent_id" json:"parent_id,omitempty"`
	Count          int     `db:"count" json:"count"`
	OrderNum       int     `db:"order_num" json:"order_num"`
	SeoTitle       *string `db:"seo_title" json:"seo_title,omitempty"`
	SeoDescription *string `db:"seo_description" json:"seo_description,omitempty"`
	SeoKeywords    *string `db:"seo_keywords" json:"seo_keywords,omitempty"`
	CreatedAt      int64   `db:"created_at" json:"created_at"`
	UpdatedAt      int64   `db:"updated_at" json:"updated_at"`
	// Sync provenance (populated only for WP-imported terms). Optional
	// on JSON output so native terms don't carry empty strings.
	SourceType     string  `db:"source_type" json:"source_type,omitempty"`
	SourceID       int64   `db:"source_id" json:"source_id,omitempty"`
	SourceSiteUUID string  `db:"source_site_uuid" json:"source_site_uuid,omitempty"`
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
		"INSERT INTO %s (name, slug, type, icon, description, parent_id, count, seo_keywords, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) RETURNING id",
		config.T("metas")),
		m.Name, m.Slug, m.Type, m.Icon, m.Description, m.ParentID, 0, m.SeoKeywords, m.CreatedAt, m.UpdatedAt,
	).Scan(&id)
	return id, err
}

func UpdateMeta(id int, m *Meta) error {
	_, err := config.DB.Exec(fmt.Sprintf(
		"UPDATE %s SET name=$1, slug=$2, icon=$3, description=$4, parent_id=$5, seo_keywords=$6, updated_at=$7 WHERE id=$8",
		config.T("metas")),
		m.Name, m.Slug, m.Icon, m.Description, m.ParentID, m.SeoKeywords, m.UpdatedAt, id,
	)
	return err
}

func DeleteMeta(id int) error {
	_, err := config.DB.Exec("DELETE FROM "+config.T("metas")+" WHERE id = $1", id)
	return err
}
