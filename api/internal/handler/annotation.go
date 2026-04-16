package handler

import (
	"fmt"
	"strconv"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/middleware"
	"utterlog-go/internal/model"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// ListAnnotations returns all annotations for a post, grouped by block_id
// GET /api/v1/annotations?post_id=X
func ListAnnotations(c *gin.Context) {
	postID := c.Query("post_id")
	if postID == "" {
		util.BadRequest(c, "post_id 不能为空"); return
	}

	type Annotation struct {
		ID         int    `json:"id" db:"id"`
		PostID     int    `json:"post_id" db:"post_id"`
		BlockID    string `json:"block_id" db:"block_id"`
		UserName   string `json:"user_name" db:"user_name"`
		UserAvatar string `json:"user_avatar" db:"user_avatar"`
		UserSite   string `json:"user_site" db:"user_site"`
		UtterlogID string `json:"utterlog_id" db:"utterlog_id"`
		Content    string `json:"content" db:"content"`
		CreatedAt  int64  `json:"created_at" db:"created_at"`
	}

	var annotations []Annotation
	config.DB.Select(&annotations, fmt.Sprintf(
		"SELECT id, post_id, block_id, user_name, COALESCE(user_avatar,'') as user_avatar, COALESCE(user_site,'') as user_site, COALESCE(utterlog_id,'') as utterlog_id, content, created_at FROM %s WHERE post_id = $1 ORDER BY created_at ASC",
		config.T("annotations")), postID)

	if annotations == nil {
		annotations = []Annotation{}
	}

	// Group by block_id
	grouped := make(map[string][]Annotation)
	for _, a := range annotations {
		grouped[a.BlockID] = append(grouped[a.BlockID], a)
	}

	util.Success(c, gin.H{"annotations": grouped, "total": len(annotations)})
}

// CreateAnnotation creates a new annotation (requires Utterlog Network identity)
// POST /api/v1/annotations
func CreateAnnotation(c *gin.Context) {
	var req struct {
		PostID          int    `json:"post_id" binding:"required"`
		BlockID         string `json:"block_id" binding:"required"`
		Content         string `json:"content" binding:"required"`
		FederationToken string `json:"federation_token"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "post_id、block_id、content 不能为空"); return
	}

	if strings.TrimSpace(req.Content) == "" {
		util.BadRequest(c, "点评内容不能为空"); return
	}

	userName := ""
	userEmail := ""
	userAvatar := ""
	userSite := ""
	utterlogID := ""

	// Try federation token first
	if req.FederationToken != "" {
		token, err := jwt.Parse(req.FederationToken, func(t *jwt.Token) (interface{}, error) {
			return []byte(config.C.JWTSecret), nil
		})
		if err == nil && token.Valid {
			claims := token.Claims.(jwt.MapClaims)
			if n, ok := claims["nickname"].(string); ok { userName = n }
			if e, ok := claims["email"].(string); ok { userEmail = e }
			if a, ok := claims["avatar"].(string); ok { userAvatar = a }
			if s, ok := claims["site"].(string); ok { userSite = s }
			if uid, ok := claims["utterlog_id"].(string); ok { utterlogID = uid }
		} else {
			// Try parsing unverified for remote tokens
			unverified, _, _ := jwt.NewParser(jwt.WithoutClaimsValidation()).ParseUnverified(req.FederationToken, jwt.MapClaims{})
			if unverified != nil {
				claims := unverified.Claims.(jwt.MapClaims)
				if n, ok := claims["nickname"].(string); ok { userName = n }
				if e, ok := claims["email"].(string); ok { userEmail = e }
				if a, ok := claims["avatar"].(string); ok { userAvatar = a }
				if s, ok := claims["site"].(string); ok { userSite = s }
				if uid, ok := claims["utterlog_id"].(string); ok { utterlogID = uid }
			}
		}
	}

	// Fallback: try local authenticated user
	if userName == "" {
		userID := middleware.GetUserID(c)
		if userID > 0 {
			user, _ := model.UserByID(userID)
			if user != nil {
				userName = user.NicknameStr()
				userEmail = user.Email
				userAvatar = user.AvatarURL() // unified: utterlog_avatar > avatar
				userSite = config.C.AppURL
				utterlogID = user.UtterlogIDStr()
			}
		}
	}

	// Must have an identity (Utterlog Network or local admin)
	if userName == "" {
		util.Error(c, 403, "IDENTITY_REQUIRED", "需要登录才能发表点评"); return
	}

	now := time.Now().Unix()
	var id int
	err := config.DB.QueryRow(fmt.Sprintf(
		"INSERT INTO %s (post_id, block_id, user_name, user_email, user_avatar, user_site, utterlog_id, content, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
		config.T("annotations")),
		req.PostID, req.BlockID, userName, userEmail, userAvatar, userSite, utterlogID, strings.TrimSpace(req.Content), now,
	).Scan(&id)

	if err != nil {
		util.Error(c, 500, "CREATE_ERROR", err.Error()); return
	}

	util.Success(c, gin.H{"id": id})
}

// ==================== Admin endpoints ====================

// AdminListAnnotations — GET /api/v1/admin/annotations?page=&per_page=&post_id=
// Returns a flat paginated list joined with post title/slug for the management table.
func AdminListAnnotations(c *gin.Context) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	if page < 1 { page = 1 }
	perPage, _ := strconv.Atoi(c.DefaultQuery("per_page", "30"))
	if perPage < 1 || perPage > 200 { perPage = 30 }
	postIDFilter := c.Query("post_id")

	type AdminAnnotation struct {
		ID         int    `json:"id" db:"id"`
		PostID     int    `json:"post_id" db:"post_id"`
		BlockID    string `json:"block_id" db:"block_id"`
		UserName   string `json:"user_name" db:"user_name"`
		UserEmail  string `json:"user_email" db:"user_email"`
		UserAvatar string `json:"user_avatar" db:"user_avatar"`
		UserSite   string `json:"user_site" db:"user_site"`
		UtterlogID string `json:"utterlog_id" db:"utterlog_id"`
		Content    string `json:"content" db:"content"`
		CreatedAt  int64  `json:"created_at" db:"created_at"`
		PostTitle  string `json:"post_title" db:"post_title"`
		PostSlug   string `json:"post_slug" db:"post_slug"`
	}

	where := ""
	args := []interface{}{}
	idx := 1
	if postIDFilter != "" {
		where = fmt.Sprintf("WHERE a.post_id = $%d", idx)
		args = append(args, postIDFilter); idx++
	}

	var total int
	config.DB.Get(&total, fmt.Sprintf("SELECT COUNT(*) FROM %s a %s", config.T("annotations"), where), args...)

	args = append(args, perPage, (page-1)*perPage)
	var items []AdminAnnotation
	query := fmt.Sprintf(`
		SELECT a.id, a.post_id, a.block_id, a.user_name,
		       COALESCE(a.user_email,'') as user_email,
		       COALESCE(a.user_avatar,'') as user_avatar,
		       COALESCE(a.user_site,'') as user_site,
		       COALESCE(a.utterlog_id,'') as utterlog_id,
		       a.content, a.created_at,
		       COALESCE(p.title,'') as post_title,
		       COALESCE(p.slug,'') as post_slug
		FROM %s a
		LEFT JOIN %s p ON p.id = a.post_id
		%s
		ORDER BY a.created_at DESC
		LIMIT $%d OFFSET $%d`,
		config.T("annotations"), config.T("posts"), where, idx, idx+1)
	config.DB.Select(&items, query, args...)
	if items == nil { items = []AdminAnnotation{} }

	util.Paginate(c, items, total, page, perPage)
}

// AdminDeleteAnnotation — DELETE /api/v1/admin/annotations/:id
func AdminDeleteAnnotation(c *gin.Context) {
	id := c.Param("id")
	_, err := config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE id = $1", config.T("annotations")), id)
	if err != nil {
		util.Error(c, 500, "DELETE_ERROR", err.Error()); return
	}
	util.Success(c, gin.H{"deleted": true})
}

// AdminBatchDeleteAnnotations — POST /api/v1/admin/annotations/batch-delete { ids: [] }
func AdminBatchDeleteAnnotations(c *gin.Context) {
	var req struct { IDs []int `json:"ids" binding:"required"` }
	if err := c.ShouldBindJSON(&req); err != nil || len(req.IDs) == 0 {
		util.BadRequest(c, "ids 不能为空"); return
	}
	// Build placeholders $1,$2,...
	args := make([]interface{}, len(req.IDs))
	placeholders := make([]string, len(req.IDs))
	for i, id := range req.IDs {
		args[i] = id
		placeholders[i] = fmt.Sprintf("$%d", i+1)
	}
	_, err := config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE id IN (%s)",
		config.T("annotations"), strings.Join(placeholders, ",")), args...)
	if err != nil {
		util.Error(c, 500, "DELETE_ERROR", err.Error()); return
	}
	util.Success(c, gin.H{"deleted": len(req.IDs)})
}
