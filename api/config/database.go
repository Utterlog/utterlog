package config

import (
	"fmt"
	"log"
	"os"

	"github.com/jmoiron/sqlx"
	_ "github.com/lib/pq"
)

var DB *sqlx.DB

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

	// Word count and AI reader questions fields
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS word_count INTEGER DEFAULT 0", T("posts")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS ai_questions TEXT", T("posts")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS ai_summary TEXT", T("posts")))

	// Backfill word_count for existing posts (one-time, uses char_length as approximation)
	DB.Exec(fmt.Sprintf(
		"UPDATE %s SET word_count = CHAR_LENGTH(content) WHERE word_count = 0 AND content IS NOT NULL AND content != ''",
		T("posts")))

	// Access logs: duration + visitor fingerprint fields
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS duration INTEGER DEFAULT 0", T("access_logs")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(64) DEFAULT ''", T("access_logs")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS fingerprint VARCHAR(64) DEFAULT ''", T("access_logs")))
	DB.Exec(fmt.Sprintf("CREATE INDEX IF NOT EXISTS idx_access_visitor ON %s (visitor_id) WHERE visitor_id != ''", T("access_logs")))

	// Comments: visitor_id for fingerprint matching
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS visitor_id VARCHAR(64) DEFAULT ''", T("comments")))

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

	// Utterlog ID on users
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS utterlog_id VARCHAR(100) DEFAULT ''", T("users")))
	DB.Exec(fmt.Sprintf("ALTER TABLE %s ADD COLUMN IF NOT EXISTS utterlog_avatar VARCHAR(500) DEFAULT ''", T("users")))

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

	return nil
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
