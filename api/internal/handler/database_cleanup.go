package handler

import (
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
	"utterlog-go/config"
	"utterlog-go/internal/util"

	"github.com/gin-gonic/gin"
	"github.com/lib/pq"
)

type databaseCleanupResult struct {
	MediaMissingFiles      int64 `json:"media_missing_files"`
	AlbumLinksReset        int64 `json:"album_links_reset"`
	AlbumCoversCleared     int64 `json:"album_covers_cleared"`
	AlbumCountsRebuilt     int64 `json:"album_counts_rebuilt"`
	RelationshipsDeleted   int64 `json:"relationships_deleted"`
	MetaCountsRebuilt      int64 `json:"meta_counts_rebuilt"`
	PostMetaDeleted        int64 `json:"post_meta_deleted"`
	AnnotationsDeleted     int64 `json:"annotations_deleted"`
	CommentsDeleted        int64 `json:"comments_deleted"`
	CommentParentsReset    int64 `json:"comment_parents_reset"`
	CommentCountsRebuilt   int64 `json:"comment_counts_rebuilt"`
	FootprintsDeleted      int64 `json:"footprints_deleted"`
	FootprintCountsRebuilt int64 `json:"footprint_counts_rebuilt"`
	ExpiredTokensDeleted   int64 `json:"expired_tokens_deleted"`
	ExpiredBansDeleted     int64 `json:"expired_bans_deleted"`
	Total                  int64 `json:"total"`
}

type cleanupMediaRow struct {
	ID       int    `db:"id"`
	Filename string `db:"filename"`
	URL      string `db:"url"`
}

type cleanupAlbumCoverRow struct {
	ID       int    `db:"id"`
	CoverURL string `db:"cover_url"`
}

// SystemCleanupDatabase removes records that Utterlog can prove are
// leftovers: local media rows whose file no longer exists, orphan relation
// rows, broken album/comment/footprint references, and expired auth/security
// records. It intentionally does not rewrite post content or delete remote
// object-storage records because those require an explicit user policy.
func SystemCleanupDatabase(c *gin.Context) {
	t := config.T
	result := databaseCleanupResult{}

	missingMediaIDs, err := findMissingLocalMediaIDs(t("media"))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", err.Error())
		return
	}
	staleAlbumCoverIDs, err := findStaleAlbumCoverIDs(t("albums"))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", err.Error())
		return
	}

	tx, err := config.DB.Beginx()
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "无法开始数据库清理")
		return
	}
	committed := false
	defer func() {
		if !committed {
			_ = tx.Rollback()
		}
	}()

	if len(missingMediaIDs) > 0 {
		res, err := tx.Exec(fmt.Sprintf("DELETE FROM %s WHERE id = ANY($1)", t("media")), pq.Array(missingMediaIDs))
		if err != nil {
			util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "清理缺失媒体记录失败")
			return
		}
		result.MediaMissingFiles = rowsAffected(res)
	}

	if len(staleAlbumCoverIDs) > 0 {
		res, err := tx.Exec(fmt.Sprintf("UPDATE %s SET cover_url = '' WHERE id = ANY($1)", t("albums")), pq.Array(staleAlbumCoverIDs))
		if err != nil {
			util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "清理失效相册封面失败")
			return
		}
		result.AlbumCoversCleared = rowsAffected(res)
	}

	res, err := tx.Exec(fmt.Sprintf(`
		UPDATE %[1]s m SET album_id = 0
		WHERE COALESCE(m.album_id, 0) > 0
		  AND NOT EXISTS (SELECT 1 FROM %[2]s a WHERE a.id = m.album_id)
	`, t("media"), t("albums")))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "清理失效相册关联失败")
		return
	}
	result.AlbumLinksReset = rowsAffected(res)

	res, err = tx.Exec(fmt.Sprintf(`
		UPDATE %[1]s a SET photo_count = COALESCE(sub.c, 0)
		FROM (
			SELECT a2.id, COUNT(m.id) AS c
			FROM %[1]s a2
			LEFT JOIN %[2]s m ON m.album_id = a2.id AND COALESCE(m.category, '') = 'image'
			GROUP BY a2.id
		) sub
		WHERE a.id = sub.id AND a.photo_count IS DISTINCT FROM sub.c
	`, t("albums"), t("media")))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "重建相册计数失败")
		return
	}
	result.AlbumCountsRebuilt = rowsAffected(res)

	res, err = tx.Exec(fmt.Sprintf(`
		DELETE FROM %[1]s r
		WHERE NOT EXISTS (SELECT 1 FROM %[2]s p WHERE p.id = r.post_id)
		   OR NOT EXISTS (SELECT 1 FROM %[3]s m WHERE m.id = r.meta_id)
	`, t("relationships"), t("posts"), t("metas")))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "清理孤儿文章分类标签关联失败")
		return
	}
	result.RelationshipsDeleted = rowsAffected(res)

	res, err = tx.Exec(fmt.Sprintf(`
		UPDATE %[1]s m SET count = COALESCE(sub.c, 0)
		FROM (
			SELECT m2.id, COUNT(r.meta_id) AS c
			FROM %[1]s m2
			LEFT JOIN %[2]s r ON r.meta_id = m2.id
			GROUP BY m2.id
		) sub
		WHERE m.id = sub.id AND m.count IS DISTINCT FROM sub.c
	`, t("metas"), t("relationships")))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "重建分类标签计数失败")
		return
	}
	result.MetaCountsRebuilt = rowsAffected(res)

	res, err = tx.Exec(fmt.Sprintf(`
		DELETE FROM %[1]s pm
		WHERE NOT EXISTS (SELECT 1 FROM %[2]s p WHERE p.id = pm.post_id)
	`, t("post_meta"), t("posts")))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "清理孤儿文章扩展数据失败")
		return
	}
	result.PostMetaDeleted = rowsAffected(res)

	res, err = tx.Exec(fmt.Sprintf(`
		DELETE FROM %[1]s an
		WHERE NOT EXISTS (SELECT 1 FROM %[2]s p WHERE p.id = an.post_id)
	`, t("annotations"), t("posts")))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "清理孤儿文章批注失败")
		return
	}
	result.AnnotationsDeleted = rowsAffected(res)

	res, err = tx.Exec(fmt.Sprintf(`
		DELETE FROM %[1]s c
		WHERE NOT EXISTS (SELECT 1 FROM %[2]s p WHERE p.id = c.post_id)
	`, t("comments"), t("posts")))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "清理孤儿评论失败")
		return
	}
	result.CommentsDeleted = rowsAffected(res)

	res, err = tx.Exec(fmt.Sprintf(`
		UPDATE %[1]s c SET parent_id = 0
		WHERE COALESCE(c.parent_id, 0) > 0
		  AND NOT EXISTS (SELECT 1 FROM %[1]s p WHERE p.id = c.parent_id)
	`, t("comments")))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "修复失效评论父级失败")
		return
	}
	result.CommentParentsReset = rowsAffected(res)

	res, err = tx.Exec(fmt.Sprintf(`
		UPDATE %[1]s p SET comment_count = COALESCE(sub.c, 0)
		FROM (
			SELECT p2.id, COUNT(c.id) AS c
			FROM %[1]s p2
			LEFT JOIN %[2]s c ON c.post_id = p2.id AND c.status = 'approved'
			GROUP BY p2.id
		) sub
		WHERE p.id = sub.id AND p.comment_count IS DISTINCT FROM sub.c
	`, t("posts"), t("comments")))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "重建评论计数失败")
		return
	}
	result.CommentCountsRebuilt = rowsAffected(res)

	res, err = tx.Exec(fmt.Sprintf(`
		DELETE FROM %[1]s pf
		WHERE NOT EXISTS (SELECT 1 FROM %[2]s p WHERE p.id = pf.post_id)
		   OR (
		   	COALESCE(pf.place_id, 0) > 0
		   	AND NOT EXISTS (SELECT 1 FROM %[3]s fp WHERE fp.id = pf.place_id)
		   )
	`, t("post_footprints"), t("posts"), t("footprint_places")))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "清理孤儿足迹关联失败")
		return
	}
	result.FootprintsDeleted = rowsAffected(res)

	res, err = tx.Exec(fmt.Sprintf(`
		UPDATE %[1]s fp SET visit_count = COALESCE(sub.c, 0)
		FROM (
			SELECT fp2.id, COUNT(pf.id) AS c
			FROM %[1]s fp2
			LEFT JOIN %[2]s pf ON pf.place_id = fp2.id
			GROUP BY fp2.id
		) sub
		WHERE fp.id = sub.id AND fp.visit_count IS DISTINCT FROM sub.c
	`, t("footprint_places"), t("post_footprints")))
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "重建足迹计数失败")
		return
	}
	result.FootprintCountsRebuilt = rowsAffected(res)

	now := time.Now().Unix()
	res, err = tx.Exec(fmt.Sprintf("DELETE FROM %s WHERE expires_at > 0 AND expires_at < $1", t("federation_tokens")), now)
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "清理过期联邦令牌失败")
		return
	}
	result.ExpiredTokensDeleted = rowsAffected(res)

	res, err = tx.Exec(fmt.Sprintf("DELETE FROM %s WHERE expires_at > 0 AND expires_at < $1", t("ip_bans")), now)
	if err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "清理过期 IP 封禁失败")
		return
	}
	result.ExpiredBansDeleted = rowsAffected(res)

	result.Total = result.MediaMissingFiles + result.AlbumLinksReset + result.AlbumCoversCleared +
		result.AlbumCountsRebuilt + result.RelationshipsDeleted + result.MetaCountsRebuilt +
		result.PostMetaDeleted + result.AnnotationsDeleted + result.CommentsDeleted +
		result.CommentParentsReset + result.CommentCountsRebuilt + result.FootprintsDeleted +
		result.FootprintCountsRebuilt + result.ExpiredTokensDeleted + result.ExpiredBansDeleted

	if err := tx.Commit(); err != nil {
		util.Error(c, http.StatusInternalServerError, "CLEANUP_FAILED", "提交数据库清理失败")
		return
	}
	committed = true
	util.Success(c, result)
}

func findMissingLocalMediaIDs(table string) ([]int, error) {
	rows := []cleanupMediaRow{}
	err := config.DB.Select(&rows, fmt.Sprintf(`
		SELECT id, COALESCE(filename, '') AS filename, COALESCE(url, '') AS url
		FROM %s
		WHERE COALESCE(driver, '') = '' OR LOWER(COALESCE(driver, '')) = 'local'
	`, table))
	if err != nil {
		return nil, err
	}

	ids := make([]int, 0)
	for _, row := range rows {
		if localUploadMissing(localUploadPathFromFilename(row.Filename), localUploadPathFromURL(row.URL)) {
			ids = append(ids, row.ID)
		}
	}
	return ids, nil
}

func findStaleAlbumCoverIDs(table string) ([]int, error) {
	rows := []cleanupAlbumCoverRow{}
	err := config.DB.Select(&rows, fmt.Sprintf(`
		SELECT id, COALESCE(cover_url, '') AS cover_url
		FROM %s
		WHERE cover_url LIKE '/uploads/%%'
	`, table))
	if err != nil {
		return nil, err
	}

	ids := make([]int, 0)
	for _, row := range rows {
		if localUploadMissing(localUploadPathFromURL(row.CoverURL)) {
			ids = append(ids, row.ID)
		}
	}
	return ids, nil
}

func localUploadPathFromFilename(filename string) string {
	return safeUploadPath(filename)
}

func localUploadPathFromURL(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}
	pathValue := raw
	if u, err := url.Parse(raw); err == nil && u.Path != "" {
		pathValue = u.Path
	}
	idx := strings.Index(pathValue, "/uploads/")
	if idx < 0 {
		return ""
	}
	return safeUploadPath(pathValue[idx+len("/uploads/"):])
}

func safeUploadPath(rel string) string {
	rel = strings.TrimSpace(rel)
	if rel == "" {
		return ""
	}
	rel = strings.TrimPrefix(filepath.ToSlash(rel), "/")
	clean := filepath.Clean(filepath.FromSlash(rel))
	if clean == "." || clean == ".." || filepath.IsAbs(clean) || strings.HasPrefix(clean, ".."+string(os.PathSeparator)) {
		return ""
	}
	return filepath.Join("public", "uploads", clean)
}

func localUploadMissing(paths ...string) bool {
	checked := false
	for _, path := range paths {
		if path == "" {
			continue
		}
		checked = true
		if _, err := os.Stat(path); err == nil {
			return false
		} else if err != nil && !errors.Is(err, os.ErrNotExist) {
			return false
		}
	}
	return checked
}

type rowsAffectedResult interface {
	RowsAffected() (int64, error)
}

func rowsAffected(result rowsAffectedResult) int64 {
	if result == nil {
		return 0
	}
	n, err := result.RowsAffected()
	if err != nil {
		return 0
	}
	return n
}
