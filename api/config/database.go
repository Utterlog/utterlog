package config

import (
	"fmt"
	"log"
	"os"
	"time"
	"utterlog-go/internal/textutil"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

var DB *sqlx.DB

func normalizePostWordCounts() {
	type row struct {
		ID        int    `db:"id"`
		Content   string `db:"content"`
		WordCount int    `db:"word_count"`
	}
	var posts []row
	if err := DB.Select(&posts, fmt.Sprintf(
		"SELECT id, COALESCE(content,'') AS content, COALESCE(word_count,0) AS word_count FROM %s WHERE type = 'post'",
		T("posts"))); err != nil {
		log.Printf("word_count normalize: select failed: %v", err)
		return
	}
	if len(posts) == 0 {
		return
	}

	tx, err := DB.Beginx()
	if err != nil {
		log.Printf("word_count normalize: begin failed: %v", err)
		return
	}
	defer tx.Rollback()

	stmt, err := tx.Preparex(fmt.Sprintf("UPDATE %s SET word_count = $1 WHERE id = $2", T("posts")))
	if err != nil {
		log.Printf("word_count normalize: prepare failed: %v", err)
		return
	}
	defer stmt.Close()

	updated := 0
	for _, post := range posts {
		count := textutil.ContentWordCount(post.Content)
		if count == post.WordCount {
			continue
		}
		if _, err := stmt.Exec(count, post.ID); err != nil {
			log.Printf("word_count normalize: update post %d failed: %v", post.ID, err)
			return
		}
		updated++
	}
	if err := tx.Commit(); err != nil {
		log.Printf("word_count normalize: commit failed: %v", err)
		return
	}
	if updated > 0 {
		log.Printf("word_count normalize: updated %d posts", updated)
	}
}

// InitDB connects to Postgres and runs migrations. Returns error instead of
// exiting so the caller can fall back to "setup-only mode" (serving the
// install wizard) when config is missing or DB is unreachable.
func InitDB() error {
	// Missing required config → skip connection and let caller enter setup
	// mode. We don't treat this as an error spam because fresh installs
	// genuinely have no credentials yet.
	if C.DBUser == "" || C.DBName == "" {
		log.Println("DB not configured (DB_USER or DB_NAME empty) — entering setup-only mode")
		return fmt.Errorf("db not configured")
	}

	var dsn string
	if C.DBPass != "" {
		dsn = fmt.Sprintf("host=%s port=%s user=%s password=%s dbname=%s sslmode=disable",
			C.DBHost, C.DBPort, C.DBUser, C.DBPass, C.DBName)
	} else {
		dsn = fmt.Sprintf("host=%s port=%s user=%s dbname=%s sslmode=disable",
			C.DBHost, C.DBPort, C.DBUser, C.DBName)
	}

	var err error
	DB, err = sqlx.Connect("postgres", dsn)
	if err != nil {
		log.Printf("Database connection failed: %v — entering setup-only mode", err)
		DB = nil
		return err
	}
	DB.SetMaxOpenConns(25)
	DB.SetMaxIdleConns(5)
	log.Println("Database connected")

	// Fresh-install bootstrap: if core `users` table is missing and schema.sql exists, load it.
	loadSchemaIfFresh()

	// Enable pgvector extension and add embedding column
	DB.Exec("CREATE EXTENSION IF NOT EXISTS vector")
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS embedding vector(1536)", T("posts")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_posts_embedding ON %s USING hnsw (embedding vector_cosine_ops)", T("posts")))

	// Federation follows store remote sites in source_site and use 0 as the
	// opposite-side placeholder. Older schemas had local-user FK constraints
	// and UNIQUE(user_id, follower_id), which makes every remote follow after
	// the first conflict or fail. Keep the legacy columns, but constrain the
	// actual remote-site identity instead.
	DB.Exec(fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT IF EXISTS ul_followers_user_id_follower_id_key", T("followers")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT IF EXISTS ul_followers_user_id_fkey", T("followers")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s DROP CONSTRAINT IF EXISTS ul_followers_follower_id_fkey", T("followers")))
	DB.Exec(fmt.Sprintf("CREATE UNIQUE INDEX IF NOT EXISTS idx_followers_following_site ON %s (user_id, source_site) WHERE source_site != '' AND following_id = 0", T("followers")))
	DB.Exec(fmt.Sprintf("CREATE UNIQUE INDEX IF NOT EXISTS idx_followers_follower_site ON %s (following_id, source_site) WHERE source_site != '' AND user_id = 0", T("followers")))

	// Word count and AI reader questions fields
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0", T("posts")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS ai_questions TEXT", T("posts")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS ai_summary TEXT", T("posts")))

	// Normalize legacy/imported word counts to the shared Markdown-aware
	// article counter. Keeps old installs aligned with newly saved posts.
	normalizePostWordCounts()

	// display_id 索引 + 回填 ——「按发布顺序的连续序号」字段。配合
	// permalink 模板 /archives/%display_id% 给读者看连续递增的 URL，
	// 跟 db pk id（会因草稿删除/事务回滚跳号）解耦。
	//
	// 索引覆盖 (type, display_id) —— 按 type 维度独立分配序号
	// （post / page / moments 等各自一套），permalink 反向查找时
	// 按 type='post' 过滤。partial 索引去掉 display_id=0 的记录
	// 减少索引大小。
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_posts_display_id ON %s (type, display_id) WHERE display_id > 0", T("posts")))
	DB.Exec(fmt.Sprintf("CREATE UNIQUE INDEX IF NOT EXISTS idx_posts_display_id_unique ON %s (type, display_id) WHERE display_id > 0", T("posts")))
	// 一次性回填 display_id=0 的旧 post，按 created_at ASC 升序分配。
	// 详见 model/post.go:BackfillDisplayIDs。幂等，每次启动都跑没事，
	// 但只对 display_id=0 且已发布的行有影响；草稿不占编号。
	{
		q := fmt.Sprintf(`
			WITH ranked AS (
				SELECT id, type,
					ROW_NUMBER() OVER (PARTITION BY type ORDER BY created_at ASC, id ASC) AS rn
				FROM %s
				WHERE display_id = 0 AND status = 'publish'
			),
			base AS (
				SELECT type, COALESCE(MAX(display_id), 0) AS max_id FROM %s GROUP BY type
			)
			UPDATE %s p SET display_id = ranked.rn + COALESCE(base.max_id, 0)
			FROM ranked LEFT JOIN base ON base.type = ranked.type
			WHERE p.id = ranked.id
		`, T("posts"), T("posts"), T("posts"))
		DB.Exec(q)
	}

	// Access logs: duration + visitor fingerprint fields
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0", T("access_logs")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(64) DEFAULT ''", T("access_logs")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(64) DEFAULT ''", T("access_logs")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_access_visitor ON %s (visitor_id) WHERE visitor_id != ''", T("access_logs")))

	// v2.3.0 表名统一:所有 stats 相关表加 `ul_stats_` 前缀。
	//   ul_analytics_daily      → ul_stats_daily
	//   ul_visitor_dates        → ul_stats_visitor_dates
	//   ul_visitor_post_dates   → ul_stats_visitor_post_dates
	// (ul_stats_global / ul_stats_post_daily / ul_access_logs 不变)
	//
	// PG 不支持 ALTER TABLE IF EXISTS RENAME(语法层面 IF EXISTS 是
	// 有效的,但是当**新表名也已存在**时会报错)。用 DO $$ 块包起
	// 来,只在「老表存在 + 新表不存在」时执行 RENAME,跑多次安全。
	for _, m := range []struct{ from, to string }{
		{T("analytics_daily"), T("stats_daily")},
		{T("visitor_dates"), T("stats_visitor_dates")},
		{T("visitor_post_dates"), T("stats_visitor_post_dates")},
	} {
		DB.Exec(fmt.Sprintf(`DO $$ BEGIN
			IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '%s')
			   AND NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = '%s') THEN
				ALTER TABLE %s RENAME TO %s;
			END IF;
		END $$;`, m.from, m.to, m.from, m.to))
	}

	// Analytics rollup: per-day per-dimension aggregates. Permanent —
	// rollup cron summarizes ul_access_logs into this table, then
	// prunes raw rows older than 90 days. Long-window queries UNION
	// raw + this table.
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		date            DATE         NOT NULL,
		dimension       VARCHAR(20)  NOT NULL,
		dim_value       VARCHAR(255) NOT NULL,
		dim_extra       VARCHAR(80)  NOT NULL DEFAULT '',
		visits          INTEGER      NOT NULL DEFAULT 0,
		unique_visitors INTEGER      NOT NULL DEFAULT 0,
		PRIMARY KEY (date, dimension, dim_value, dim_extra)
	)`, T("stats_daily")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_stats_daily_date ON %s (date)", T("stats_daily")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_stats_daily_dim ON %s (dimension, date)", T("stats_daily")))

	// Visitor presence per day. Permanent — lets us answer
	// "unique visitors active in window [t1, t2]" precisely for any
	// window length, including ranges that straddle the raw retention
	// boundary. SUM-of-daily-uniques would over-count repeat visitors.
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		visitor_id  VARCHAR(80) NOT NULL,
		date        DATE        NOT NULL,
		PRIMARY KEY (visitor_id, date)
	)`, T("stats_visitor_dates")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_stats_visitor_dates_date ON %s (date)", T("stats_visitor_dates")))

	// Real-time eternal stats(v2.2.0 引入,v2.3.0 表名前缀统一为 ul_stats_)。
	//
	// Counters that MUST never decrease and never wait for cron rollup:
	//   ul_stats_global              1-row site-level永久 counter
	//   ul_stats_post_daily          per-post per-day PV/UV
	//   ul_stats_visitor_post_dates  per-post per-visitor per-day
	//
	// 全部写入路径事务化(/track 一个事务内 UPSERT 多张表)。
	// ul_access_logs 仅作"热原始"层(90 天保留),数字真相在
	// stats_global / stats_daily / visitor 表里。
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		id              SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
		total_views     BIGINT   NOT NULL DEFAULT 0,
		total_uniques   BIGINT   NOT NULL DEFAULT 0,
		first_event_at  BIGINT   NOT NULL DEFAULT 0,
		updated_at      BIGINT   NOT NULL DEFAULT 0
	)`, T("stats_global")))
	DB.Exec(fmt.Sprintf("INSERT INTO %s (id) VALUES (1) ON CONFLICT DO NOTHING", T("stats_global")))

	// Backfill on first migration (total_views=0 means never seeded).
	// hot count = COUNT(*) ul_access_logs(没跟旧 footer 跳过历史)
	// archived count = SUM(visits) from stats_daily _total rows for
	//                  days strictly OLDER than the oldest access_logs
	//                  row, so prune'd historical days are kept.
	// total_uniques = lifetime distinct visitor_ids in stats_visitor_dates.
	{
		var seeded int64
		DB.Get(&seeded, fmt.Sprintf("SELECT total_views FROM %s WHERE id = 1", T("stats_global")))
		if seeded == 0 {
			var hotCount, archivedCount, lifetimeUniques, firstEvent int64
			DB.Get(&hotCount, fmt.Sprintf("SELECT COUNT(*) FROM %s", T("access_logs")))
			DB.Get(&archivedCount, fmt.Sprintf(`
				SELECT COALESCE(SUM(visits), 0) FROM %s
				WHERE dimension = '_total'
				  AND date < COALESCE(
				    (SELECT DATE(TO_TIMESTAMP(MIN(created_at))) FROM %s),
				    CURRENT_DATE
				  )
			`, T("stats_daily"), T("access_logs")))
			DB.Get(&lifetimeUniques, fmt.Sprintf("SELECT COUNT(DISTINCT visitor_id) FROM %s WHERE visitor_id != ''", T("stats_visitor_dates")))
			DB.Get(&firstEvent, fmt.Sprintf("SELECT COALESCE(MIN(created_at), 0) FROM %s", T("access_logs")))
			total := hotCount + archivedCount
			DB.Exec(fmt.Sprintf(`UPDATE %s SET total_views = $1, total_uniques = $2, first_event_at = $3, updated_at = $4 WHERE id = 1`,
				T("stats_global")), total, lifetimeUniques, firstEvent, time.Now().Unix())
			log.Printf("stats_global seeded: total_views=%d (hot=%d + archived=%d), total_uniques=%d", total, hotCount, archivedCount, lifetimeUniques)
		}
	}

	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		post_id         INTEGER NOT NULL,
		date            DATE    NOT NULL,
		views           INTEGER NOT NULL DEFAULT 0,
		unique_visitors INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (post_id, date)
	)`, T("stats_post_daily")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_stats_post_daily_date ON %s (date)", T("stats_post_daily")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_stats_post_daily_post ON %s (post_id, date)", T("stats_post_daily")))

	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		visitor_id  VARCHAR(80) NOT NULL,
		post_id     INTEGER     NOT NULL,
		date        DATE        NOT NULL,
		PRIMARY KEY (visitor_id, post_id, date)
	)`, T("stats_visitor_post_dates")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_stats_visitor_post_dates_post ON %s (post_id, date)", T("stats_visitor_post_dates")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_stats_visitor_post_dates_date ON %s (date)", T("stats_visitor_post_dates")))

	// Comments: visitor_id for fingerprint matching
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(64) DEFAULT ''", T("comments")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ALTER COLUMN source SET DEFAULT '网页'", T("moments")))

	// Comment geo column (cache geoip data)
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS geo TEXT", T("comments")))
	// Backfill: count comments missing geo
	var missingGeo int
	DB.Get(&missingGeo, fmt.Sprintf("SELECT COUNT(*) FROM %s WHERE (geo IS NULL OR geo = '') AND author_ip IS NOT NULL AND author_ip != ''", T("comments")))
	if missingGeo > 0 {
		log.Printf("Comments: %d comments missing geo data, will backfill in background", missingGeo)
	}

	// Annotations table (段落点评)
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		id SERIAL PRIMARY KEY,
		post_id INTEGER NOT NULL,
		block_id VARCHAR(64) NOT NULL,
		user_name VARCHAR(100) NOT NULL,
		user_email VARCHAR(200),
		user_avatar VARCHAR(500),
		user_site VARCHAR(300),
		utterlog_id VARCHAR(100),
		content TEXT NOT NULL,
		created_at BIGINT NOT NULL
	)`, T("annotations")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_annotations_post ON %s (post_id)", T("annotations")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_annotations_block ON %s (post_id, block_id)", T("annotations")))

	// Footprints: country/city level travel records linked to posts.
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		id SERIAL PRIMARY KEY,
		country_name VARCHAR(128) NOT NULL DEFAULT '',
		country_code VARCHAR(8) NOT NULL DEFAULT '',
		city_name VARCHAR(128) NOT NULL DEFAULT '',
		latitude DOUBLE PRECISION,
		longitude DOUBLE PRECISION,
		cover_url TEXT NOT NULL DEFAULT '',
		visit_count INTEGER NOT NULL DEFAULT 0,
		created_at BIGINT NOT NULL DEFAULT 0,
		updated_at BIGINT NOT NULL DEFAULT 0
	)`, T("footprint_places")))
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		id SERIAL PRIMARY KEY,
		name VARCHAR(160) NOT NULL DEFAULT '',
		slug VARCHAR(180) NOT NULL DEFAULT '',
		description TEXT NOT NULL DEFAULT '',
		sort_order INTEGER NOT NULL DEFAULT 0,
		created_at BIGINT NOT NULL DEFAULT 0,
		updated_at BIGINT NOT NULL DEFAULT 0
	)`, T("footprint_routes")))
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		id SERIAL PRIMARY KEY,
		post_id INTEGER NOT NULL REFERENCES %s(id) ON DELETE CASCADE,
		place_id INTEGER NOT NULL REFERENCES %s(id) ON DELETE CASCADE,
		route_id INTEGER NOT NULL DEFAULT 0,
		visited_at BIGINT NOT NULL DEFAULT 0,
		route_order INTEGER NOT NULL DEFAULT 0,
		keywords TEXT NOT NULL DEFAULT '',
		note TEXT NOT NULL DEFAULT '',
		created_at BIGINT NOT NULL DEFAULT 0,
		updated_at BIGINT NOT NULL DEFAULT 0
	)`, T("post_footprints"), T("posts"), T("footprint_places")))
	// A post can be marked for the footprint page before its city/country is
	// configured in the dedicated admin screen.
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ALTER COLUMN place_id DROP NOT NULL", T("post_footprints")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_footprint_places_country_city ON %s (LOWER(country_code), LOWER(city_name), LOWER(country_name))", T("footprint_places")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_footprint_places_visit ON %s (visit_count DESC, updated_at DESC)", T("footprint_places")))
	DB.Exec(fmt.Sprintf("CREATE UNIQUE INDEX IF NOT EXISTS idx_footprint_routes_name ON %s (LOWER(name)) WHERE name != ''", T("footprint_routes")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_post_footprints_post ON %s (post_id)", T("post_footprints")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_post_footprints_place ON %s (place_id)", T("post_footprints")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_post_footprints_route ON %s (route_id, route_order)", T("post_footprints")))

	// Utterlog ID on users
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS utterlog_id VARCHAR(100) DEFAULT ''", T("users")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS utterlog_avatar VARCHAR(500) DEFAULT ''", T("users")))

	// Password reset (forgot-password): one-time token + expiry stored
	// on the user row, cleared on successful reset. Partial index lets
	// the reset endpoint look up by token in O(log n) without indexing
	// the empty rows that 99 % of users sit at.
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS reset_token VARCHAR(64) DEFAULT ''", T("users")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS reset_token_expires_at BIGINT DEFAULT 0", T("users")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_users_reset_token ON %s (reset_token) WHERE reset_token != ''", T("users")))

	// 2FA: TOTP fields on users
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS totp_secret VARCHAR(64) DEFAULT ''", T("users")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS totp_enabled BOOLEAN DEFAULT false", T("users")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS totp_backup_codes TEXT DEFAULT ''", T("users")))

	// Passkeys table (WebAuthn)
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		id SERIAL PRIMARY KEY,
		user_id INTEGER NOT NULL,
		credential_id BYTEA NOT NULL UNIQUE,
		public_key BYTEA NOT NULL,
		attestation_type VARCHAR(32) DEFAULT '',
		aaguid BYTEA DEFAULT '',
		sign_count INTEGER DEFAULT 0,
		backup_eligible BOOLEAN DEFAULT false,
		backup_state BOOLEAN DEFAULT false,
		name VARCHAR(128) DEFAULT '',
		last_used_at BIGINT DEFAULT 0,
		created_at BIGINT NOT NULL
	)`, T("passkeys")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_passkeys_user ON %s (user_id)", T("passkeys")))
	DB.Exec(fmt.Sprintf("CREATE UNIQUE INDEX IF NOT EXISTS idx_passkeys_cred ON %s (credential_id)", T("passkeys")))

	// Albums table
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		id SERIAL PRIMARY KEY,
		title VARCHAR(255) NOT NULL,
		slug VARCHAR(255) NOT NULL DEFAULT '',
		description TEXT DEFAULT '',
		cover_url TEXT DEFAULT '',
		status VARCHAR(20) NOT NULL DEFAULT 'private',
		sort_order INTEGER DEFAULT 0,
		photo_count INTEGER DEFAULT 0,
		author_id INTEGER DEFAULT 1,
		created_at BIGINT NOT NULL,
		updated_at BIGINT NOT NULL
	)`, T("albums")))
	DB.Exec(fmt.Sprintf("CREATE UNIQUE INDEX IF NOT EXISTS idx_albums_slug ON %s (slug) WHERE slug != ''", T("albums")))

	// Media: add album_id column
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS album_id INTEGER DEFAULT 0", T("media")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_media_album ON %s (album_id) WHERE album_id > 0", T("media")))

	// Media: source tracking for synced resources
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) DEFAULT ''", T("media")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS source_id INTEGER DEFAULT 0", T("media")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_media_source ON %s (source_type, source_id) WHERE source_type != ''", T("media")))

	// Media: EXIF data storage
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS exif_data TEXT DEFAULT ''", T("media")))

	// ================================================================
	// WordPress sync — tables + provenance columns
	// ================================================================

	// Sync sites: one row per registered WordPress site that can push
	// data. token_hash is bcrypt; lookups compare against the hash.
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		id SERIAL PRIMARY KEY,
		site_uuid VARCHAR(64) NOT NULL UNIQUE,
		label VARCHAR(200) NOT NULL DEFAULT '',
		source_url VARCHAR(500) NOT NULL DEFAULT '',
		token_hash VARCHAR(100) NOT NULL,
		disabled BOOLEAN NOT NULL DEFAULT false,
		last_seen_at BIGINT NOT NULL DEFAULT 0,
		created_at BIGINT NOT NULL,
		updated_at BIGINT NOT NULL
	)`, T("sync_sites")))

	// Sync jobs: one row per /start. Status flows running → processing
	// (media/rewrite) → finished | failed.
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		id SERIAL PRIMARY KEY,
		job_id VARCHAR(64) NOT NULL UNIQUE,
		site_uuid VARCHAR(64) NOT NULL,
		status VARCHAR(20) NOT NULL DEFAULT 'running',
		stage VARCHAR(40) NOT NULL DEFAULT 'import',
		manifest JSONB,
		counts JSONB,
		media_total INTEGER NOT NULL DEFAULT 0,
		media_done INTEGER NOT NULL DEFAULT 0,
		posts_rewritten INTEGER NOT NULL DEFAULT 0,
		error_message TEXT,
		started_at BIGINT NOT NULL,
		finished_at BIGINT
	)`, T("sync_jobs")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_sync_jobs_site ON %s (site_uuid, started_at DESC)", T("sync_jobs")))

	// Idempotent batch receipts — server returns early if (job_id,
	// resource, batch_no) was already processed (plugin retries are
	// safe).
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		job_id VARCHAR(64) NOT NULL,
		resource VARCHAR(32) NOT NULL,
		batch_no INTEGER NOT NULL,
		received_at BIGINT NOT NULL,
		item_count INTEGER NOT NULL DEFAULT 0,
		PRIMARY KEY (job_id, resource, batch_no)
	)`, T("sync_batches")))

	// ID map — resolves WP-origin IDs to UL IDs during a single job.
	// Posts' categories/tags references + comments' parent references
	// use this to translate source_ids into target_ids without race.
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		job_id VARCHAR(64) NOT NULL,
		resource VARCHAR(32) NOT NULL,
		source_id BIGINT NOT NULL,
		target_id INTEGER NOT NULL,
		PRIMARY KEY (job_id, resource, source_id)
	)`, T("sync_id_map")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_sync_id_map_target ON %s (resource, target_id)", T("sync_id_map")))

	// Media download queue — server pulls WP URLs after posts are in.
	// Populated by /finish; drained by background worker.
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		id SERIAL PRIMARY KEY,
		job_id VARCHAR(64) NOT NULL,
		original_url TEXT NOT NULL,
		new_url TEXT,
		new_media_id INTEGER,
		status VARCHAR(20) NOT NULL DEFAULT 'pending',
		attempts INTEGER NOT NULL DEFAULT 0,
		error_message TEXT,
		created_at BIGINT NOT NULL,
		completed_at BIGINT,
		UNIQUE (job_id, original_url)
	)`, T("sync_media_queue")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_sync_media_job ON %s (job_id, status)", T("sync_media_queue")))

	// AI 评论审核 + 智能回复队列。访客评论提交时，可选先经
	// AI 审核（不通过按 fail_action 处理），通过后异步生成 AI
	// 回复入队列等待管理员 review，或在 auto 模式下直接发布。
	// reviewer_id=0 表示未审核；processed_at=0 表示未处理。
	// status: pending | approved | rejected | error
	DB.Exec(fmt.Sprintf(`CREATE TABLE IF NOT EXISTS %s (
		id SERIAL PRIMARY KEY,
		comment_id INTEGER NOT NULL REFERENCES %s(id) ON DELETE CASCADE,
		post_id INTEGER NOT NULL,
		comment_text TEXT NOT NULL,
		ai_reply TEXT NOT NULL DEFAULT '',
		status VARCHAR(20) NOT NULL DEFAULT 'pending',
		created_at BIGINT NOT NULL,
		processed_at BIGINT NOT NULL DEFAULT 0,
		error_msg VARCHAR(500) DEFAULT NULL,
		reviewer_id INTEGER NOT NULL DEFAULT 0,
		ai_audit_passed BOOLEAN,
		ai_audit_confidence REAL,
		ai_audit_reason TEXT
	)`, T("ai_comment_queue"), T("comments")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_ai_comment_queue_status ON %s (status, created_at DESC)", T("ai_comment_queue")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_ai_comment_queue_comment ON %s (comment_id)", T("ai_comment_queue")))

	// Mark AI-generated replies on the comment side so the front-end
	// can render '🤖 AI 辅助回复' badge (when admin's
	// ai_comment_reply_badge_text is non-empty). Also lets the admin
	// query "AI 生成的所有评论" without joining the queue.
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS is_ai_reply BOOLEAN NOT NULL DEFAULT FALSE", T("comments")))

	// Provenance columns on content tables — lets us delete-by-site
	// for rollback and dedupe on re-sync via the UNIQUE index below.
	// ul_media already has source_type + source_id; we add site_uuid.
	for _, table := range []string{"posts", "comments", "metas", "media", "links"} {
		DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS source_type VARCHAR(32) DEFAULT ''", T(table)))
		DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS source_id BIGINT DEFAULT 0", T(table)))
		DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS source_site_uuid VARCHAR(64) DEFAULT ''", T(table)))

		// Partial UNIQUE so only synced rows participate; native UL
		// content (source_site_uuid='') isn't constrained.
		//
		// Name must NOT collide with pre-existing idx_<table>_source
		// indexes on ul_comments / ul_media — CREATE UNIQUE INDEX IF
		// NOT EXISTS is a no-op on a name match and will silently
		// leave us without the constraint ON CONFLICT needs.
		//
		// Skip media: its INSERT hardcodes source_id=0 (WP attachment
		// IDs aren't meaningful post-download; dedupe is by SHA-256
		// in pullOneMedia). A UNIQUE on (site, 'wordpress', 0) would
		// let only one media row through per site, and the rest
		// would fail with UNIQUE violation and never land.
		if table == "media" {
			continue
		}
		DB.Exec(fmt.Sprintf(
			"CREATE UNIQUE INDEX IF NOT EXISTS idx_%s_sync_provenance ON %s (source_site_uuid, source_type, source_id) WHERE source_site_uuid != ''",
			table, T(table),
		))
	}
	// Clean up any stale UNIQUE index on media left over from when the
	// migration loop above included "media" — harmless on fresh installs.
	DB.Exec("DROP INDEX IF EXISTS idx_media_sync_provenance")

	// Backfill published_at for legacy imports. Old WP-XML import
	// (handler/import.go) and early Typecho paths only set created_at
	// and left published_at NULL, which broke the "发布时间" column in
	// admin + any theme that surfaces it. Idempotent: only touches
	// rows where published_at is still NULL, so repeating the
	// migration on every boot costs nothing.
	DB.Exec(fmt.Sprintf(
		"UPDATE %s SET published_at = TO_TIMESTAMP(created_at) WHERE published_at IS NULL AND status = 'publish' AND created_at > 0",
		T("posts"),
	))
	DB.Exec(fmt.Sprintf(
		"UPDATE %s SET published_at = NULL WHERE id < 0 AND status != 'publish' AND published_at IS NOT NULL",
		T("posts"),
	))

	// 2026-04: Westlife → Utterlog rename + 2026 theme removed.
	// Migrate any DB that still has those values pointing at active_theme
	// so existing sites don't end up on the fallback path silently.
	// Idempotent — WHERE clause ensures no-op once converted.
	DB.Exec(fmt.Sprintf(
		"UPDATE %s SET value = 'Utterlog' WHERE name = 'active_theme' AND value IN ('Westlife', '2026')",
		T("options"),
	))

	// 2026-04: prune dead image-handling style options.
	// image_lazy_load_placeholder and image_lightbox_style were
	// surfaced in admin → 图片处理 with 5 and 4 choices respectively,
	// but no front-end code ever read them. The toggles
	// (image_lazy_load + image_lightbox) are kept and now actually
	// work; the *_style multi-selects are removed from the form, so
	// drop the residual DB rows so they don't haunt future debugging.
	// Idempotent — DELETE is no-op if the rows are already gone.
	DB.Exec(fmt.Sprintf(
		"DELETE FROM %s WHERE name IN ('image_lazy_load_placeholder', 'image_lightbox_style')",
		T("options"),
	))

	// 2026-04: prune the dead TinyPNG toggle. The admin form had a
	// "TinyPNG 压缩" toggle, but no Go code ever called the TinyPNG
	// API. Uploads always went through the local re-encoder
	// (webp/jpg/avif). Keep tinypng_api_key, which is now a centralized
	// third-party service credential for future TinyPNG integration.
	DB.Exec(fmt.Sprintf(
		"DELETE FROM %s WHERE name = 'tinypng_enabled'",
		T("options"),
	))

	// 2026-04: ai_image_model was a placebo dropdown — image-gen
	// dispatch reads from ai_providers (type='image'), the field
	// label was misleading. Form removed, DB row dropped.
	DB.Exec(fmt.Sprintf(
		"DELETE FROM %s WHERE name = 'ai_image_model'",
		T("options"),
	))

	// 2026-04: heal user-saved 通义千问图像 providers that point at
	// outdated endpoints. Two paths to clean up, in order of how the
	// 'qwen-image' preset evolved:
	//   1. /compatible-mode/v1/images/generations — never existed
	//      (HTTP 404 day one).
	//   2. /api/v1/services/aigc/text2image/image-synthesis — the
	//      wanx async endpoint. Older rev of qwen-image preset
	//      pointed here; replaced by the sync multimodal-generation
	//      endpoint that Aliyun promotes for qwen-image-2.0-pro.
	//
	// Both rewrites land on the working sync URL. Idempotent.
	// Users who specifically want wanx async can hand-edit back via
	// the 'wanx' preset which now points at the async endpoint.
	DB.Exec(fmt.Sprintf(
		"UPDATE %s SET endpoint = 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation', model = 'qwen-image-2.0-pro' "+
			"WHERE type = 'image' AND endpoint IN ("+
			"'https://dashscope.aliyuncs.com/compatible-mode/v1/images/generations',"+
			"'https://dashscope.aliyuncs.com/api/v1/services/aigc/text2image/image-synthesis'"+
			") AND model NOT LIKE 'wanx%%'",
		T("ai_providers"),
	))

	// 2026-04: drop the 3 stale English default prompts that an
	// older rev of the admin form used to seed (ai_slug_prompt /
	// ai_keywords_prompt / ai_polish_prompt). They got persisted
	// when admins clicked Save with the form's pre-filled English
	// values still untouched. The new flow (commit 37cdc28) uses
	// Chinese defaults from handler/ai_prompts.go and stores '' to
	// indicate "use default". The leftover English strings have no
	// {title}/{content} placeholders, so the runtime prompt builder
	// would send them verbatim and the model asks "please provide
	// the article".
	//
	// Match exact text (the literal seed strings) to avoid wiping a
	// user who deliberately wrote an English prompt.
	DB.Exec(fmt.Sprintf(
		"UPDATE %s SET value = '' WHERE name = 'ai_slug_prompt' AND value = 'Generate a concise, SEO-friendly URL slug in English for this article. Output only the slug, lowercase, hyphens instead of spaces, no special characters.'",
		T("options"),
	))
	DB.Exec(fmt.Sprintf(
		"UPDATE %s SET value = '' WHERE name = 'ai_keywords_prompt' AND value = 'Extract 3-5 keywords/tags from this article. Output as comma-separated list. Use the same language as the article.'",
		T("options"),
	))
	DB.Exec(fmt.Sprintf(
		"UPDATE %s SET value = '' WHERE name = 'ai_polish_prompt' AND value = 'Polish and improve the writing quality: fix grammar, improve flow, make it more engaging. Keep the same language and meaning. Output in Markdown.'",
		T("options"),
	))

	// 2026-04: normalise absolute logo/favicon URLs to root-relative.
	// Old UploadBranding returned <site_url>/<purpose>.<ext> as the
	// stored value, which broke as soon as admin changed site_url or
	// moved environments — the URL pointed at the OLD origin. Now
	// returns '/<purpose>.<ext>' so the browser uses the current
	// page's origin. This migration rewrites already-saved absolute
	// URLs to the same shape.
	//
	// Pattern is strict: ONLY rewrites when the URL's path component
	// is exactly /logo.<ext>, /dark-logo.<ext> or /favicon.<ext>.
	// Admins who deliberately host their logo on a CDN
	// (e.g. https://cdn.example.com/static/branding/foo.png) keep
	// their value untouched. Idempotent — already-relative '/logo.png'
	// values don't match the pattern and stay as-is.
	DB.Exec(fmt.Sprintf(
		`UPDATE %s SET value = regexp_replace(value, '^https?://[^/]+(/(?:logo|dark-logo|favicon)\.\w+)$', '\1')
		 WHERE name IN ('site_logo', 'site_logo_dark', 'site_favicon')
		   AND value ~ '^https?://[^/]+/(?:logo|dark-logo|favicon)\.\w+$'`,
		T("options"),
	))

	// 2026-04: drop comment_pagination + comment_per_page placebo.
	// CommentList.tsx never had pagination code — all comments
	// always rendered in one shot. The toggle + 每页评论数 input
	// were UI illusions only. Form removed, DB rows dropped here
	// so they don't haunt future debugging. Idempotent.
	DB.Exec(fmt.Sprintf(
		"DELETE FROM %s WHERE name IN ('comment_pagination', 'comment_per_page')",
		T("options"),
	))

	// 2026-04: collapse the per-feature AI purpose slots from 8 to 2.
	//
	// Earlier rev introduced one option key per feature
	// (ai_purpose_summary_provider, _slug_provider, _tags_provider,
	// _polish_provider, _reader-chat_provider, _questions_provider,
	// _query_provider). User asked to merge those into just
	// 'content' (every text-generation feature) and 'chat' (every
	// conversational feature including reader-chat). The new keys
	// are ai_purpose_content_provider + ai_purpose_chat_provider —
	// dispatch already ignores the old ones, but admins with
	// strong-typing instincts deserve a clean options table.
	//
	// Idempotent. Won't touch the two new keys.
	DB.Exec(fmt.Sprintf(
		"DELETE FROM %s WHERE name IN ("+
			"'ai_purpose_summary_provider',"+
			"'ai_purpose_slug_provider',"+
			"'ai_purpose_tags_provider',"+
			"'ai_purpose_polish_provider',"+
			"'ai_purpose_reader-chat_provider',"+
			"'ai_purpose_questions_provider',"+
			"'ai_purpose_query_provider'"+
			")",
		T("options"),
	))

	// 2026-05: collapse coding_github_token into the site-wide
	// github_access_token. Earlier rev had two duplicate option keys
	// holding the same Token (Coding 页面配置 + 设置→第三方服务 each
	// wrote both keys), which confused admins editing the same value
	// from two places. Now github_access_token is the single source of
	// truth; the Coding page editor no longer asks for a Token.
	//
	// Step 1 — backfill: if github_access_token row is missing OR empty,
	// inherit value from coding_github_token. ON CONFLICT update only
	// fires when the existing row is blank, so a deliberately-set
	// github_access_token is never overwritten.
	// Step 2 — drop coding_github_token rows.
	// Idempotent: once coding_github_token is gone all subsequent runs
	// are no-ops.
	DB.Exec(fmt.Sprintf(
		"INSERT INTO %s (name, value, autoload, created_at, updated_at) "+
			"SELECT 'github_access_token', value, true, "+
			"  EXTRACT(EPOCH FROM NOW())::bigint, EXTRACT(EPOCH FROM NOW())::bigint "+
			"FROM %s WHERE name = 'coding_github_token' AND COALESCE(value, '') <> '' "+
			"ON CONFLICT (name) DO UPDATE SET value = EXCLUDED.value, "+
			"  updated_at = EXTRACT(EPOCH FROM NOW())::bigint "+
			"WHERE COALESCE(%s.value, '') = ''",
		T("options"), T("options"), T("options"),
	))
	DB.Exec(fmt.Sprintf(
		"DELETE FROM %s WHERE name = 'coding_github_token'",
		T("options"),
	))

	// 2026-05: add platform column to ul_sync_sites for Typecho support.
	// Existing rows default to 'wordpress' — the old WP plugin keeps
	// working unchanged. New Typecho sites store platform='typecho'
	// so admin UI can list them in a separate tab.
	// Idempotent — IF NOT EXISTS guards repeated runs.
	DB.Exec(fmt.Sprintf(
		"ALTER TABLE %s ADD COLUMN IF NOT EXISTS platform VARCHAR(32) NOT NULL DEFAULT 'wordpress'",
		T("sync_sites"),
	))

	// 2026-05: decode HTML entities in display name fields.
	// 一些导入路径（RSS channel title / 远端 API 直接落库）让
	// "Kevin&#039;s" / "Foo &amp; Bar" 这种串进了 DB，前台 React
	// 输出文本时原样显示。一次性把所有含 '&' 的行 unescape，
	// 后续写入路径已用 textutil.NormalizeDisplayName 兜底。
	// Idempotent — 干净的值再跑一次仍然是同值。
	decodeHTMLEntitiesIn("links", "name")
	decodeHTMLEntitiesIn("rss_subscriptions", "site_name")
	decodeHTMLEntitiesIn("comments", "author_name")
	decodeHTMLEntitiesIn("posts", "title")

	// 2026-05 (v2.4.2): 影视专业模式 schema 准备。
	// 1. ul_posts 加 `meta` JSONB 列 —— 当 post.type='video' 时存
	//    {video_type, region, year, total_episodes, directors[], actors[],
	//    genres[], douban_rating, douban_url, imdb_id, tips, ...}。
	//    其它内容类型保留扩展位（type='post' 也可放结构化元数据）。
	//    命名特意叫 `meta` 而不是 `post_meta`，避免与既有 EAV 表
	//    ul_post_meta（key-value 模式、几乎不用）混淆。
	// 2. ul_post_episodes —— 每行一集，按 post_id + episode_no 唯一。
	//    支持多线路：alt_sources JSONB 数组 [{label, url, platform, embed_url}]。
	// Idempotent — IF NOT EXISTS 保护重复运行无副作用。
	DB.Exec(fmt.Sprintf(
		"ALTER TABLE %s ADD COLUMN IF NOT EXISTS meta JSONB NOT NULL DEFAULT '{}'::jsonb",
		T("posts"),
	))
	// v2.4.2 dev：若之前误用了 post_meta 列名（同一会话内迁过），删
	// 之保证唯一来源（生产用户不会触发这条，只对本机 dev 同会话有效）。
	DB.Exec(fmt.Sprintf("ALTER TABLE %s DROP COLUMN IF EXISTS post_meta", T("posts")))
	DB.Exec(fmt.Sprintf(`
		CREATE TABLE IF NOT EXISTS %s (
			id          SERIAL PRIMARY KEY,
			post_id     INTEGER NOT NULL,
			episode_no  INTEGER NOT NULL,
			title       VARCHAR(200) NOT NULL DEFAULT '',
			video_url   TEXT NOT NULL DEFAULT '',
			embed_url   TEXT NOT NULL DEFAULT '',
			platform    VARCHAR(50) NOT NULL DEFAULT '',
			alt_sources JSONB NOT NULL DEFAULT '[]'::jsonb,
			duration    VARCHAR(20) NOT NULL DEFAULT '',
			cover_url   VARCHAR(500) NOT NULL DEFAULT '',
			sort_order  INTEGER NOT NULL DEFAULT 0,
			created_at  BIGINT NOT NULL DEFAULT 0,
			updated_at  BIGINT NOT NULL DEFAULT 0,
			CONSTRAINT %s_post_id_fk FOREIGN KEY (post_id)
				REFERENCES %s(id) ON DELETE CASCADE,
			CONSTRAINT %s_post_ep_uq UNIQUE (post_id, episode_no)
		)`,
		T("post_episodes"), T("post_episodes"), T("posts"), T("post_episodes"),
	))
	DB.Exec(fmt.Sprintf(
		"CREATE INDEX IF NOT EXISTS idx_%s_post_sort ON %s(post_id, sort_order, episode_no)",
		T("post_episodes"), T("post_episodes"),
	))

	return nil
}

// decodeHTMLEntitiesIn 把指定表指定列里所有含 '&' 的行（可能是 HTML
// 实体）跑一遍 html.UnescapeString 写回。无 '&' 的行不查不动。
//
// 注意：列内容真有合法 '&' 字符的话，UnescapeString 也只会按实体语法
// 解一次 —— "A & B" 解出来还是 "A & B"，无副作用。
func decodeHTMLEntitiesIn(table, col string) {
	if DB == nil {
		return
	}
	type row struct {
		ID  int    `db:"id"`
		Val string `db:"val"`
	}
	var rows []row
	q := fmt.Sprintf("SELECT id, COALESCE(%s,'') AS val FROM %s WHERE %s LIKE '%%&%%'", col, T(table), col)
	if err := DB.Select(&rows, q); err != nil {
		return
	}
	if len(rows) == 0 {
		return
	}
	u := fmt.Sprintf("UPDATE %s SET %s = $1 WHERE id = $2", T(table), col)
	for _, r := range rows {
		decoded := textutil.NormalizeDisplayName(r.Val)
		if decoded == r.Val {
			continue
		}
		DB.Exec(u, decoded, r.ID)
	}
}

// T returns table name with prefix
func T(name string) string {
	return C.DBPrefix + name
}

// loadSchemaIfFresh detects a fresh install (no users table) and loads schema.sql if present.
// Paths tried (in order): ./schema.sql, ./api/schema.sql (useful when binary is run from project root).
func loadSchemaIfFresh() {
	var exists bool
	err := DB.Get(&exists, "SELECT EXISTS(SELECT FROM information_schema.tables WHERE table_name=$1)", T("users"))
	if err == nil && exists {
		return // already installed
	}

	// Look for schema file
	candidates := []string{"schema.sql", "api/schema.sql", "/app/schema.sql"}
	var schemaPath string
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			schemaPath = p
			break
		}
	}
	if schemaPath == "" {
		log.Println("Fresh install detected but no schema.sql found — install wizard will surface this to the user")
		return
	}

	data, err := os.ReadFile(schemaPath)
	if err != nil {
		log.Printf("Failed to read %s: %v", schemaPath, err)
		return
	}

	log.Printf("Fresh install: loading schema from %s ...", schemaPath)
	if _, err := DB.Exec(string(data)); err != nil {
		log.Printf("Schema load error (non-fatal, continuing): %v", err)
		return
	}
	log.Println("Schema loaded successfully")
}
