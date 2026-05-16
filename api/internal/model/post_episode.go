package model

import (
	"encoding/json"
	"fmt"
	"time"
	"utterlog-go/config"
)

// PostEpisode 对应 ul_post_episodes 表 —— 一行一集，归属 post.type='video'
// 的一篇文章。alt_sources 是 [{label, url, platform, embed_url}, ...] 多
// 线路数组（主线路存在 video_url/embed_url；备线路才进这里）。
type PostEpisode struct {
	ID         int             `db:"id" json:"id"`
	PostID     int             `db:"post_id" json:"post_id"`
	EpisodeNo  int             `db:"episode_no" json:"episode_no"`
	Title      string          `db:"title" json:"title"`
	VideoURL   string          `db:"video_url" json:"video_url"`
	EmbedURL   string          `db:"embed_url" json:"embed_url"`
	Platform   string          `db:"platform" json:"platform"`
	AltSources json.RawMessage `db:"alt_sources" json:"alt_sources"`
	Duration   string          `db:"duration" json:"duration"`
	CoverURL   string          `db:"cover_url" json:"cover_url"`
	SortOrder  int             `db:"sort_order" json:"sort_order"`
	CreatedAt  int64           `db:"created_at" json:"created_at"`
	UpdatedAt  int64           `db:"updated_at" json:"updated_at"`
}

// ListEpisodesByPost 拉一个 post 的全部剧集，按 sort_order 升序、
// 同 sort_order 再按 episode_no 升序，保证稳定渲染顺序。
func ListEpisodesByPost(postID int) ([]PostEpisode, error) {
	var rows []PostEpisode
	err := config.DB.Select(&rows, fmt.Sprintf(`
		SELECT id, post_id, episode_no, title, video_url, embed_url,
		       platform, alt_sources, duration, cover_url, sort_order,
		       created_at, updated_at
		FROM %s WHERE post_id = $1
		ORDER BY sort_order ASC, episode_no ASC`,
		config.T("post_episodes")), postID)
	if err != nil {
		return nil, err
	}
	// alt_sources 默认值规范化：DB 默认 '[]' 但老行可能为 nil
	for i := range rows {
		if len(rows[i].AltSources) == 0 {
			rows[i].AltSources = json.RawMessage("[]")
		}
	}
	return rows, nil
}

// ReplaceEpisodes 把一个 post 的全部剧集替换为新列表（事务内 delete +
// 批量 insert）。Admin 编辑器一次保存整集列表的简化语义，避免增量 diff。
// 调用方负责把 alt_sources 序列化好（json.RawMessage）。
func ReplaceEpisodes(postID int, eps []PostEpisode) error {
	if config.DB == nil {
		return fmt.Errorf("db not initialized")
	}
	tx, err := config.DB.Beginx()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	t := config.T("post_episodes")
	if _, err := tx.Exec(fmt.Sprintf("DELETE FROM %s WHERE post_id = $1", t), postID); err != nil {
		return err
	}
	if len(eps) == 0 {
		return tx.Commit()
	}
	now := time.Now().Unix()
	for _, e := range eps {
		alt := e.AltSources
		if len(alt) == 0 {
			alt = json.RawMessage("[]")
		}
		_, err := tx.Exec(fmt.Sprintf(`
			INSERT INTO %s (post_id, episode_no, title, video_url, embed_url,
			                platform, alt_sources, duration, cover_url, sort_order,
			                created_at, updated_at)
			VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)`, t),
			postID, e.EpisodeNo, e.Title, e.VideoURL, e.EmbedURL,
			e.Platform, []byte(alt), e.Duration, e.CoverURL, e.SortOrder,
			now,
		)
		if err != nil {
			return fmt.Errorf("insert episode no=%d: %w", e.EpisodeNo, err)
		}
	}
	return tx.Commit()
}

// DeleteEpisodesByPost 单独删除某 post 的所有剧集（极少用 —— 通常走
// ON DELETE CASCADE；这里给"切换 type 从 video 改回 post"等场景）。
func DeleteEpisodesByPost(postID int) error {
	if config.DB == nil {
		return nil
	}
	_, err := config.DB.Exec(fmt.Sprintf("DELETE FROM %s WHERE post_id = $1", config.T("post_episodes")), postID)
	return err
}
