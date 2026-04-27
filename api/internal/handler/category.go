package handler

import (
	"strconv"
	"time"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
)

func ListCategories(c *gin.Context) {
	cats, _ := model.MetasByType("category")
	util.Success(c, cats)
}

func GetCategory(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	m, err := model.MetaByID(id)
	if err != nil || m.Type != "category" {
		util.NotFound(c, "分类")
		return
	}
	util.Success(c, m)
}

func CreateCategory(c *gin.Context) {
	var req struct {
		Name        string  `json:"name" binding:"required"`
		Slug        string  `json:"slug"`
		Icon        *string `json:"icon"`
		Description *string `json:"description"`
		ParentID    *int    `json:"parent_id"`
		SeoKeywords *string `json:"seo_keywords"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "名称不能为空")
		return
	}
	now := time.Now().Unix()
	slug := req.Slug
	if slug == "" {
		slug = req.Name
	}
	m := &model.Meta{Name: req.Name, Slug: slug, Type: "category", Icon: req.Icon, Description: req.Description, ParentID: req.ParentID, SeoKeywords: req.SeoKeywords, CreatedAt: now, UpdatedAt: now}
	id, err := model.CreateMeta(m)
	if err != nil {
		util.Error(c, 500, "CREATE_ERROR", err.Error())
		return
	}
	util.Success(c, gin.H{"id": id})
}

func UpdateCategory(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Name        string  `json:"name"`
		Slug        string  `json:"slug"`
		Icon        *string `json:"icon"`
		Description *string `json:"description"`
		ParentID    *int    `json:"parent_id"`
		SeoKeywords *string `json:"seo_keywords"`
	}
	c.ShouldBindJSON(&req)
	m := &model.Meta{Name: req.Name, Slug: req.Slug, Icon: req.Icon, Description: req.Description, ParentID: req.ParentID, SeoKeywords: req.SeoKeywords, UpdatedAt: time.Now().Unix()}
	model.UpdateMeta(id, m)
	util.Success(c, gin.H{"id": id})
}

func DeleteCategory(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	model.DeleteMeta(id)
	util.Success(c, nil)
}

// Tags
func ListTags(c *gin.Context) {
	tags, _ := model.MetasByType("tag")
	if c.Query("include_empty") != "true" {
		visible := make([]model.Meta, 0, len(tags))
		for _, tag := range tags {
			if tag.Count > 0 {
				visible = append(visible, tag)
			}
		}
		tags = visible
	}
	util.Success(c, tags)
}

func GetTag(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	m, err := model.MetaByID(id)
	if err != nil || m.Type != "tag" {
		util.NotFound(c, "标签")
		return
	}
	util.Success(c, m)
}

func CreateTag(c *gin.Context) {
	var req struct {
		Name string `json:"name" binding:"required"`
		Slug string `json:"slug"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "名称不能为空")
		return
	}
	now := time.Now().Unix()
	slug := req.Slug
	if slug == "" {
		slug = req.Name
	}
	id, _ := model.CreateMeta(&model.Meta{Name: req.Name, Slug: slug, Type: "tag", CreatedAt: now, UpdatedAt: now})
	util.Success(c, gin.H{"id": id})
}

func UpdateTag(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var req struct {
		Name string `json:"name"`
		Slug string `json:"slug"`
	}
	c.ShouldBindJSON(&req)
	model.UpdateMeta(id, &model.Meta{Name: req.Name, Slug: req.Slug, UpdatedAt: time.Now().Unix()})
	util.Success(c, gin.H{"id": id})
}

func DeleteTag(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	model.DeleteMeta(id)
	util.Success(c, nil)
}
