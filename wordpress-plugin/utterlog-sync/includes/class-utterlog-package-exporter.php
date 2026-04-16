<?php

if (!defined('ABSPATH')) {
	exit;
}

final class Utterlog_Package_Exporter {
	const DEFAULT_BATCH_SIZE = 200;
	const MAX_BATCH_SIZE = 1000;

	private $settings;
	private $wpdb;
	private $logger;
	private $file_checksums = array();
	private $last_preview = null;

	public function __construct($settings = array(), $logger = null) {
		global $wpdb;
		$this->wpdb = $wpdb;
		$this->settings = is_array($settings) ? $settings : array();
		$this->logger = $logger;
	}

	public function collect_preview($args = array()) {
		$args = $this->normalize_args($args);
		if ($this->last_preview !== null && $this->last_preview['signature'] === md5(wp_json_encode($args))) {
			return $this->last_preview['data'];
		}

		$user_counts = count_users();
		$menus = wp_get_nav_menus();
		$menu_items = 0;
		if (is_array($menus)) {
			foreach ($menus as $menu) {
				$items = wp_get_nav_menu_items($menu->term_id, array('post_status' => 'any'));
				$menu_items += is_array($items) ? count($items) : 0;
			}
		}

		$data = array(
			'site' => array(
				'title' => get_bloginfo('name'),
				'home_url' => home_url('/'),
				'wordpress_version' => get_bloginfo('version'),
				'language' => get_bloginfo('language'),
			),
			'counts' => array(
				'authors' => isset($user_counts['total_users']) ? (int) $user_counts['total_users'] : 0,
				'categories' => (int) wp_count_terms(array('taxonomy' => 'category', 'hide_empty' => false)),
				'tags' => (int) wp_count_terms(array('taxonomy' => 'post_tag', 'hide_empty' => false)),
				'posts' => $this->count_rows($this->wpdb->posts, "post_type = 'post' AND post_status != 'auto-draft'"),
				'pages' => $this->count_rows($this->wpdb->posts, "post_type = 'page' AND post_status != 'auto-draft'"),
				'media' => $this->count_rows($this->wpdb->posts, "post_type = 'attachment'"),
				'comments' => $this->count_rows($this->wpdb->comments),
				'comment_meta' => $this->table_exists($this->wpdb->commentmeta) ? $this->count_rows($this->wpdb->commentmeta) : 0,
				'links' => $this->table_exists($this->wpdb->links) ? $this->count_rows($this->wpdb->links) : 0,
				'menus' => is_array($menus) ? count($menus) : 0,
				'menu_items' => $menu_items,
				'redirects' => $this->table_exists($this->wpdb->postmeta) ? $this->count_rows($this->wpdb->postmeta, "meta_key = '_wp_old_slug'") : 0,
			),
			'options' => array(
				'batch_size' => $args['batch_size'],
				'include_assets' => $args['include_assets'],
				'include_raw_wordpress' => $args['include_raw_wordpress'],
			),
		);

		$this->last_preview = array(
			'signature' => md5(wp_json_encode($args)),
			'data' => $data,
		);

		return $data;
	}

	public function build_package($args = array()) {
		if (!class_exists('ZipArchive')) {
			return new WP_Error('zip_missing', '服务器缺少 ZipArchive 扩展，无法生成导出包。');
		}

		$workspace = $this->build_workspace($args);
		if (is_wp_error($workspace)) {
			return $workspace;
		}

		$filename = sanitize_file_name(parse_url(home_url(), PHP_URL_HOST) . '-' . gmdate('Y-m-d-His') . '.ulbk');
		$zip_path = $workspace['base_tmp_dir'] . '/' . $filename;

		$result = $this->zip_directory($workspace['package_root'], $zip_path);
		if (is_wp_error($result)) {
			self::rrmdir($workspace['base_tmp_dir']);
			return $result;
		}

		if ($this->logger) {
			$this->logger->append('已生成导出包：' . $filename, 'success', array('path' => $zip_path));
		}

		return array(
			'path' => $zip_path,
			'filename' => $filename,
			'cleanup_paths' => array($workspace['base_tmp_dir']),
			'manifest' => $workspace['manifest'],
			'counts' => $workspace['manifest']['counts'],
			'package_root' => $workspace['package_root'],
		);
	}

	public function build_workspace($args = array()) {
		$args = $this->normalize_args($args);
		$preview = $this->collect_preview($args);
		$this->file_checksums = array();

		$upload = wp_upload_dir();
		$base_tmp_dir = trailingslashit($upload['basedir']) . 'utterlog-export/' . gmdate('Ymd-His') . '-' . wp_generate_password(8, false, false);
		$package_root = $base_tmp_dir . '/package';

		$this->mkdir($package_root . '/normalized');
		$this->mkdir($package_root . '/raw/wordpress');
		$this->mkdir($package_root . '/assets/uploads');

		if ($this->logger) {
			$this->logger->append('开始构建 Utterlog Package', 'info', $preview['options']);
		}

		$this->write_json($package_root . '/normalized/site.json', $this->collect_site());

		$counts = array();
		$counts['authors'] = $this->write_authors_ndjson($package_root . '/normalized/authors.ndjson', $args['batch_size']);
		$counts['categories'] = $this->write_terms_ndjson($package_root . '/normalized/categories.ndjson', 'category');
		$counts['tags'] = $this->write_terms_ndjson($package_root . '/normalized/tags.ndjson', 'post_tag');
		$counts['posts'] = $this->write_posts_ndjson($package_root . '/normalized/posts.ndjson', 'post', $args['batch_size']);
		$counts['pages'] = $this->write_posts_ndjson($package_root . '/normalized/pages.ndjson', 'page', $args['batch_size']);
		$counts['media'] = $this->write_media_ndjson($package_root . '/normalized/media.ndjson', $args['include_assets'], $package_root . '/assets/uploads', $args['batch_size']);
		$counts['comments'] = $this->write_comments_ndjson($package_root . '/normalized/comments.ndjson', $args['batch_size']);
		$counts['comment_meta'] = $this->write_comment_meta_ndjson($package_root . '/normalized/comment_meta.ndjson', $args['batch_size']);
		$counts['links'] = $this->write_links_ndjson($package_root . '/normalized/links.ndjson', $args['batch_size']);
		$counts['menus'] = $this->write_menus_ndjson($package_root . '/normalized/menus.ndjson');
		$counts['menu_items'] = $this->write_menu_items_ndjson($package_root . '/normalized/menu_items.ndjson');
		$counts['redirects'] = $this->write_redirects_ndjson($package_root . '/normalized/redirects.ndjson', $args['batch_size']);

		if ($args['include_raw_wordpress']) {
			$this->write_raw_wordpress($package_root . '/raw/wordpress', $args['batch_size']);
		}

		file_put_contents($package_root . '/checksums.sha256', $this->render_checksums());
		$this->remember_file($package_root . '/checksums.sha256');

		$manifest = $this->build_manifest(
			array(
				'include_assets' => $args['include_assets'],
				'include_raw_wordpress' => $args['include_raw_wordpress'],
				'counts' => $counts,
				'batch_size' => $args['batch_size'],
			)
		);
		$this->write_json($package_root . '/manifest.json', $manifest);

		return array(
			'base_tmp_dir' => $base_tmp_dir,
			'package_root' => $package_root,
			'manifest' => $manifest,
			'preview' => $preview,
		);
	}

	public static function rrmdir($path) {
		if (empty($path) || !file_exists($path)) {
			return;
		}
		if (is_file($path) || is_link($path)) {
			@unlink($path);
			return;
		}
		$items = scandir($path);
		if (!is_array($items)) {
			return;
		}
		foreach ($items as $item) {
			if ($item === '.' || $item === '..') {
				continue;
			}
			self::rrmdir($path . '/' . $item);
		}
		@rmdir($path);
	}

	private function collect_site() {
		return array(
			'title' => get_bloginfo('name'),
			'description' => get_bloginfo('description'),
			'site_url' => get_option('siteurl'),
			'home_url' => get_option('home'),
			'admin_email' => get_option('admin_email'),
			'timezone' => get_option('timezone_string') ? get_option('timezone_string') : get_option('gmt_offset'),
			'language' => get_bloginfo('language'),
			'charset' => get_option('blog_charset'),
			'date_format' => get_option('date_format'),
			'time_format' => get_option('time_format'),
			'permalink_structure' => get_option('permalink_structure'),
			'posts_per_page' => (int) get_option('posts_per_page'),
			'allow_comments' => get_option('default_comment_status') === 'open',
			'comment_moderation' => (bool) get_option('comment_moderation'),
			'require_name_email' => (bool) get_option('require_name_email'),
			'thread_comments' => (bool) get_option('thread_comments'),
			'thread_comments_depth' => (int) get_option('thread_comments_depth'),
			'close_comments_for_old_posts' => (bool) get_option('close_comments_for_old_posts'),
			'close_comments_days_old' => (int) get_option('close_comments_days_old'),
			'blog_public' => (int) get_option('blog_public'),
			'start_of_week' => (int) get_option('start_of_week'),
		);
	}

	private function write_authors_ndjson($path, $batch_size) {
		$count = 0;
		$this->write_ndjson_stream($path, function ($handle) use ($batch_size, &$count) {
			$offset = 0;
			while (true) {
				$users = get_users(
					array(
						'fields' => 'all_with_meta',
						'number' => $batch_size,
						'offset' => $offset,
						'orderby' => 'ID',
						'order' => 'ASC',
					)
				);
				if (empty($users)) {
					break;
				}
				foreach ($users as $user) {
					$this->write_ndjson_row($handle, array(
						'source_id' => (int) $user->ID,
						'username' => $user->user_login,
						'email' => $user->user_email,
						'display_name' => $user->display_name,
						'nickname' => get_user_meta($user->ID, 'nickname', true),
						'first_name' => get_user_meta($user->ID, 'first_name', true),
						'last_name' => get_user_meta($user->ID, 'last_name', true),
						'url' => $user->user_url,
						'bio' => get_user_meta($user->ID, 'description', true),
						'roles' => array_values((array) $user->roles),
						'registered_at' => $this->to_iso8601($user->user_registered),
					));
					$count++;
				}
				$offset += $batch_size;
			}
		});

		$this->log_resource('authors', $count);
		return $count;
	}

	private function write_terms_ndjson($path, $taxonomy) {
		$terms = get_terms(
			array(
				'taxonomy' => $taxonomy,
				'hide_empty' => false,
			)
		);
		$count = 0;
		$this->write_ndjson_stream($path, function ($handle) use ($terms, $taxonomy, &$count) {
			if (is_wp_error($terms) || empty($terms)) {
				return;
			}
			foreach ($terms as $term) {
				$taxonomy_row = $this->wpdb->get_row(
					$this->wpdb->prepare(
						"SELECT term_taxonomy_id, parent, description, count FROM {$this->wpdb->term_taxonomy} WHERE term_id = %d AND taxonomy = %s",
						$term->term_id,
						$taxonomy
					),
					ARRAY_A
				);
				$meta = get_term_meta($term->term_id);
				$this->write_ndjson_row($handle, array(
					'source_term_id' => (int) $term->term_id,
					'source_taxonomy_id' => isset($taxonomy_row['term_taxonomy_id']) ? (int) $taxonomy_row['term_taxonomy_id'] : 0,
					'taxonomy' => $taxonomy,
					'name' => $term->name,
					'slug' => $term->slug,
					'description' => isset($taxonomy_row['description']) ? $taxonomy_row['description'] : $term->description,
					'parent_source_term_id' => isset($taxonomy_row['parent']) ? (int) $taxonomy_row['parent'] : 0,
					'count' => isset($taxonomy_row['count']) ? (int) $taxonomy_row['count'] : (int) $term->count,
					'seo_title' => $this->pick_first_meta($meta, array('wpseo_title', 'rank_math_title')),
					'seo_description' => $this->pick_first_meta($meta, array('wpseo_desc', 'rank_math_description')),
					'seo_keywords' => $this->pick_first_meta($meta, array('rank_math_focus_keyword')),
				));
				$count++;
			}
		});

		$this->log_resource($taxonomy, $count);
		return $count;
	}

	private function write_posts_ndjson($path, $post_type, $batch_size) {
		$total = $this->count_rows($this->wpdb->posts, $this->wpdb->prepare("post_type = %s AND post_status != 'auto-draft'", $post_type));
		$sticky_posts = get_option('sticky_posts', array());
		$count = 0;

		$this->write_ndjson_stream($path, function ($handle) use ($post_type, $batch_size, $total, $sticky_posts, &$count) {
			for ($offset = 0; $offset < $total; $offset += $batch_size) {
				$rows = $this->wpdb->get_results(
					$this->wpdb->prepare(
						"SELECT * FROM {$this->wpdb->posts} WHERE post_type = %s AND post_status != 'auto-draft' ORDER BY post_date_gmt ASC, ID ASC LIMIT %d OFFSET %d",
						$post_type,
						$batch_size,
						$offset
					),
					ARRAY_A
				);
				if (empty($rows)) {
					break;
				}
				foreach ($rows as $row) {
					$post_id = (int) $row['ID'];
					$post_meta = get_post_meta($post_id);
					$summary = $this->pick_first_meta($post_meta, array('lared_ai_summary'));
					$thumbnail_id = (int) $this->pick_first_meta($post_meta, array('_thumbnail_id'));
					$featured_url = $thumbnail_id > 0 ? wp_get_attachment_url($thumbnail_id) : null;
					$seo_title = $this->pick_first_meta($post_meta, array('_yoast_wpseo_title', 'rank_math_title'));
					$seo_description = $this->pick_first_meta($post_meta, array('_yoast_wpseo_metadesc', 'rank_math_description'));
					$seo_keywords = $this->pick_first_meta($post_meta, array('rank_math_focus_keyword'));
					$canonical_url = $this->pick_first_meta($post_meta, array('_yoast_wpseo_canonical', 'rank_math_canonical_url'));
					$content_text = wp_strip_all_tags($row['post_content']);
					$word_count = (int) $this->pick_first_meta($post_meta, array('_word_count'));
					if ($word_count <= 0) {
						$word_count = $this->calculate_word_count($content_text);
					}
					$reading_time = (int) $this->pick_first_meta($post_meta, array('_reading_time'));
					if ($reading_time <= 0) {
						$reading_time = max(1, (int) ceil($word_count / 400));
					}

					$item = array(
						'source_id' => $post_id,
						'source_post_type' => $row['post_type'],
						'author_source_id' => (int) $row['post_author'],
						'title' => $row['post_title'],
						'slug' => $row['post_name'],
						'content_html' => $row['post_content'],
						'excerpt' => $row['post_excerpt'] ? $row['post_excerpt'] : $summary,
						'excerpt_source' => $row['post_excerpt'] ? 'post_excerpt' : ($summary ? 'custom_meta' : 'none'),
						'status' => $row['post_status'],
						'allow_comment' => $row['comment_status'] === 'open',
						'password' => $row['post_password'],
						'view_count' => (int) $this->pick_first_meta($post_meta, array('post_views')),
						'comment_count' => (int) $row['comment_count'],
						'cover_media_source_id' => $thumbnail_id > 0 ? $thumbnail_id : null,
						'cover_media_url' => $featured_url,
						'categories' => array_map('intval', wp_get_post_categories($post_id, array('fields' => 'ids'))),
						'tags' => array_map('intval', wp_get_post_tags($post_id, array('fields' => 'ids'))),
						'seo_title' => $seo_title ? $seo_title : null,
						'seo_description' => $seo_description ? $seo_description : null,
						'seo_keywords' => $seo_keywords ? $seo_keywords : null,
						'canonical_url' => $canonical_url ? $canonical_url : null,
						'pinned' => in_array($post_id, $sticky_posts, true),
						'menu_order' => (int) $row['menu_order'],
						'guid' => $row['guid'],
						'word_count' => $word_count,
						'reading_time' => $reading_time,
						'legacy_url' => get_permalink($post_id),
						'old_slug' => $this->pick_first_meta($post_meta, array('_wp_old_slug')),
						'old_date' => $this->pick_first_meta($post_meta, array('_wp_old_date')),
						'created_at' => $this->to_iso8601($row['post_date_gmt'] ? $row['post_date_gmt'] : $row['post_date']),
						'updated_at' => $this->to_iso8601($row['post_modified_gmt'] ? $row['post_modified_gmt'] : $row['post_modified']),
						'published_at' => $this->to_iso8601($row['post_date_gmt'] ? $row['post_date_gmt'] : $row['post_date']),
					);

					if ($post_type === 'page') {
						$item['parent_source_id'] = (int) $row['post_parent'];
						$item['template'] = $this->pick_first_meta($post_meta, array('_wp_page_template'));
					}

					$this->write_ndjson_row($handle, $item);
					$count++;
				}
			}
		});

		$this->log_resource($post_type . 's', $count);
		return $count;
	}

	private function write_media_ndjson($path, $include_assets, $asset_root, $batch_size) {
		$total = $this->count_rows($this->wpdb->posts, "post_type = 'attachment'");
		$count = 0;
		$upload = wp_upload_dir();

		$this->write_ndjson_stream($path, function ($handle) use ($batch_size, $total, $include_assets, $asset_root, $upload, &$count) {
			for ($offset = 0; $offset < $total; $offset += $batch_size) {
				$rows = $this->wpdb->get_results(
					$this->wpdb->prepare(
						"SELECT * FROM {$this->wpdb->posts} WHERE post_type = 'attachment' ORDER BY post_date_gmt ASC, ID ASC LIMIT %d OFFSET %d",
						$batch_size,
						$offset
					),
					ARRAY_A
				);
				if (empty($rows)) {
					break;
				}
				foreach ($rows as $row) {
					$attachment_id = (int) $row['ID'];
					$relative_path = get_post_meta($attachment_id, '_wp_attached_file', true);
					$metadata = wp_get_attachment_metadata($attachment_id);
					$alt = get_post_meta($attachment_id, '_wp_attachment_image_alt', true);
					$owner_type = null;
					$owner_id = (int) $row['post_parent'];
					if ($owner_id > 0) {
						$parent_type = get_post_type($owner_id);
						if ($parent_type === 'post' || $parent_type === 'page') {
							$owner_type = $parent_type;
						}
					}

					$file_size = 0;
					if ($relative_path) {
						$absolute_path = trailingslashit($upload['basedir']) . ltrim($relative_path, '/');
						if (file_exists($absolute_path) && !is_dir($absolute_path)) {
							$file_size = (int) filesize($absolute_path);
						}
						if ($include_assets) {
							$this->copy_media_variants($upload['basedir'], $relative_path, $metadata, $asset_root);
						}
					}

					$this->write_ndjson_row($handle, array(
						'source_id' => $attachment_id,
						'title' => $row['post_title'],
						'slug' => $row['post_name'],
						'caption' => $row['post_excerpt'],
						'description' => $row['post_content'],
						'url' => wp_get_attachment_url($attachment_id),
						'relative_path' => $relative_path,
						'mime_type' => $row['post_mime_type'],
						'alt' => $alt ? $alt : null,
						'metadata_json' => $metadata ? wp_json_encode($metadata) : null,
						'owner_source_type' => $owner_type,
						'owner_source_id' => $owner_id > 0 ? $owner_id : null,
						'file_size' => $file_size,
						'asset_included' => $include_assets && !empty($relative_path),
						'created_at' => $this->to_iso8601($row['post_date_gmt'] ? $row['post_date_gmt'] : $row['post_date']),
					));
					$count++;
				}
			}
		});

		$this->log_resource('media', $count);
		return $count;
	}

	private function write_comments_ndjson($path, $batch_size) {
		$total = $this->count_rows($this->wpdb->comments);
		$count = 0;

		$this->write_ndjson_stream($path, function ($handle) use ($batch_size, $total, &$count) {
			for ($offset = 0; $offset < $total; $offset += $batch_size) {
				$rows = $this->wpdb->get_results(
					$this->wpdb->prepare(
						"SELECT * FROM {$this->wpdb->comments} ORDER BY comment_date_gmt ASC, comment_ID ASC LIMIT %d OFFSET %d",
						$batch_size,
						$offset
					),
					ARRAY_A
				);
				if (empty($rows)) {
					break;
				}
				foreach ($rows as $row) {
					$post_type = get_post_type((int) $row['comment_post_ID']);
					if ($post_type !== 'post' && $post_type !== 'page') {
						$post_type = 'post';
					}
					$this->write_ndjson_row($handle, array(
						'source_id' => (int) $row['comment_ID'],
						'target_source_type' => $post_type,
						'target_source_id' => (int) $row['comment_post_ID'],
						'parent_source_id' => (int) $row['comment_parent'],
						'author_name' => $row['comment_author'],
						'author_email' => $row['comment_author_email'],
						'author_url' => $row['comment_author_url'],
						'author_ip' => $row['comment_author_IP'],
						'author_agent' => $row['comment_agent'],
						'content' => $row['comment_content'],
						'status' => $this->map_comment_status($row['comment_approved']),
						'type' => $row['comment_type'],
						'karma' => isset($row['comment_karma']) ? (int) $row['comment_karma'] : 0,
						'user_source_id' => (int) $row['user_id'],
						'created_at' => $this->to_iso8601($row['comment_date_gmt'] ? $row['comment_date_gmt'] : $row['comment_date']),
					));
					$count++;
				}
			}
		});

		$this->log_resource('comments', $count);
		return $count;
	}

	private function write_comment_meta_ndjson($path, $batch_size) {
		if (!$this->table_exists($this->wpdb->commentmeta)) {
			$this->write_ndjson_stream($path, function ($handle) {
			});
			return 0;
		}

		$total = $this->count_rows($this->wpdb->commentmeta);
		$count = 0;
		$this->write_ndjson_stream($path, function ($handle) use ($batch_size, $total, &$count) {
			for ($offset = 0; $offset < $total; $offset += $batch_size) {
				$rows = $this->wpdb->get_results(
					$this->wpdb->prepare(
						"SELECT comment_id, meta_key, meta_value FROM {$this->wpdb->commentmeta} ORDER BY meta_id ASC LIMIT %d OFFSET %d",
						$batch_size,
						$offset
					),
					ARRAY_A
				);
				if (empty($rows)) {
					break;
				}
				foreach ($rows as $row) {
					$this->write_ndjson_row($handle, array(
						'comment_source_id' => (int) $row['comment_id'],
						'meta_key' => $row['meta_key'],
						'meta_value' => $row['meta_value'],
					));
					$count++;
				}
			}
		});

		$this->log_resource('comment_meta', $count);
		return $count;
	}

	private function write_links_ndjson($path, $batch_size) {
		if (!$this->table_exists($this->wpdb->links)) {
			$this->write_ndjson_stream($path, function ($handle) {
			});
			return 0;
		}

		$total = $this->count_rows($this->wpdb->links);
		$count = 0;
		$this->write_ndjson_stream($path, function ($handle) use ($batch_size, $total, &$count) {
			for ($offset = 0; $offset < $total; $offset += $batch_size) {
				$rows = $this->wpdb->get_results(
					$this->wpdb->prepare(
						"SELECT * FROM {$this->wpdb->links} ORDER BY link_id ASC LIMIT %d OFFSET %d",
						$batch_size,
						$offset
					),
					ARRAY_A
				);
				if (empty($rows)) {
					break;
				}
				foreach ($rows as $row) {
					$this->write_ndjson_row($handle, array(
						'source_id' => (int) $row['link_id'],
						'name' => $row['link_name'],
						'url' => $row['link_url'],
						'description' => $row['link_description'],
						'logo' => $row['link_image'],
						'target' => $row['link_target'],
						'visible' => $row['link_visible'],
						'owner_id' => isset($row['link_owner']) ? (int) $row['link_owner'] : 0,
						'rating' => isset($row['link_rating']) ? (int) $row['link_rating'] : 0,
						'updated_at' => $this->to_iso8601($row['link_updated']),
						'rel' => $row['link_rel'],
						'notes' => $row['link_notes'],
						'rss_url' => $row['link_rss'],
						'status' => $row['link_visible'] === 'Y' ? 'publish' : 'draft',
					));
					$count++;
				}
			}
		});

		$this->log_resource('links', $count);
		return $count;
	}

	private function write_menus_ndjson($path) {
		$menus = wp_get_nav_menus();
		$count = 0;
		$this->write_ndjson_stream($path, function ($handle) use ($menus, &$count) {
			if (empty($menus)) {
				return;
			}
			foreach ($menus as $menu) {
				$taxonomy_row = $this->wpdb->get_row(
					$this->wpdb->prepare(
						"SELECT term_taxonomy_id FROM {$this->wpdb->term_taxonomy} WHERE term_id = %d AND taxonomy = 'nav_menu'",
						$menu->term_id
					),
					ARRAY_A
				);
				$this->write_ndjson_row($handle, array(
					'source_taxonomy_id' => isset($taxonomy_row['term_taxonomy_id']) ? (int) $taxonomy_row['term_taxonomy_id'] : 0,
					'source_term_id' => (int) $menu->term_id,
					'name' => $menu->name,
					'slug' => $menu->slug,
					'description' => $menu->description,
				));
				$count++;
			}
		});

		$this->log_resource('menus', $count);
		return $count;
	}

	private function write_menu_items_ndjson($path) {
		$menus = wp_get_nav_menus();
		$count = 0;
		$this->write_ndjson_stream($path, function ($handle) use ($menus, &$count) {
			if (empty($menus)) {
				return;
			}
			foreach ($menus as $menu) {
				$taxonomy_row = $this->wpdb->get_row(
					$this->wpdb->prepare(
						"SELECT term_taxonomy_id FROM {$this->wpdb->term_taxonomy} WHERE term_id = %d AND taxonomy = 'nav_menu'",
						$menu->term_id
					),
					ARRAY_A
				);
				$menu_taxonomy_id = isset($taxonomy_row['term_taxonomy_id']) ? (int) $taxonomy_row['term_taxonomy_id'] : 0;
				$items = wp_get_nav_menu_items($menu->term_id, array('post_status' => 'any'));
				if (!is_array($items)) {
					continue;
				}
				foreach ($items as $item) {
					$this->write_ndjson_row($handle, array(
						'source_id' => (int) $item->ID,
						'menu_source_taxonomy_id' => $menu_taxonomy_id,
						'parent_source_id' => (int) $item->menu_item_parent,
						'object_type' => $item->object,
						'object_source_id' => (int) $item->object_id,
						'item_type' => $item->type,
						'custom_url' => $item->url,
						'title' => $item->title,
						'description' => $item->description,
						'target' => $item->target,
						'classes' => array_values(array_filter((array) $item->classes)),
						'sort_order' => (int) $item->menu_order,
					));
					$count++;
				}
			}
		});

		$this->log_resource('menu_items', $count);
		return $count;
	}

	private function write_redirects_ndjson($path, $batch_size) {
		if (!$this->table_exists($this->wpdb->postmeta)) {
			$this->write_ndjson_stream($path, function ($handle) {
			});
			return 0;
		}

		$total = $this->count_rows($this->wpdb->postmeta, "meta_key = '_wp_old_slug'");
		$count = 0;
		$this->write_ndjson_stream($path, function ($handle) use ($batch_size, $total, &$count) {
			for ($offset = 0; $offset < $total; $offset += $batch_size) {
				$rows = $this->wpdb->get_results(
					$this->wpdb->prepare(
						"SELECT pm.post_id, pm.meta_value AS old_slug, pm2.meta_value AS old_date
						 FROM {$this->wpdb->postmeta} pm
						 LEFT JOIN {$this->wpdb->postmeta} pm2
						   ON pm2.post_id = pm.post_id AND pm2.meta_key = '_wp_old_date'
						 WHERE pm.meta_key = '_wp_old_slug'
						 ORDER BY pm.post_id ASC LIMIT %d OFFSET %d",
						$batch_size,
						$offset
					),
					ARRAY_A
				);
				if (empty($rows)) {
					break;
				}
				foreach ($rows as $row) {
					$post_type = get_post_type((int) $row['post_id']);
					if ($post_type !== 'post' && $post_type !== 'page') {
						continue;
					}
					$this->write_ndjson_row($handle, array(
						'target_source_type' => $post_type,
						'target_source_id' => (int) $row['post_id'],
						'old_slug' => $row['old_slug'],
						'old_date' => $row['old_date'],
					));
					$count++;
				}
			}
		});

		$this->log_resource('redirects', $count);
		return $count;
	}

	private function build_manifest($args) {
		$counts = isset($args['counts']) && is_array($args['counts']) ? $args['counts'] : array();
		$features = array(
			'assets' => !empty($args['include_assets']),
			'raw_wordpress' => !empty($args['include_raw_wordpress']),
			'comment_meta' => true,
			'direct_sync' => true,
			'batch_export' => true,
		);

		$files = array();
		foreach ($this->file_checksums as $path => $sha) {
			$files[$this->file_key($path)] = array(
				'path' => $path,
				'sha256' => $sha,
			);
		}

		return array(
			'format' => 'utterlog-package',
			'version' => 1,
			'kind' => 'wordpress-export',
			'exported_at' => gmdate('c'),
			'source' => array(
				'type' => 'wordpress-plugin',
				'site_url' => home_url('/'),
				'site_name' => get_bloginfo('name'),
				'app_version' => '0.2.0',
				'wordpress_version' => get_bloginfo('version'),
			),
			'target' => array(
				'site_uuid' => isset($this->settings['site_uuid']) ? $this->settings['site_uuid'] : '',
			),
			'features' => $features,
			'counts' => $counts,
			'options' => array(
				'batch_size' => isset($args['batch_size']) ? (int) $args['batch_size'] : self::DEFAULT_BATCH_SIZE,
			),
			'files' => $files,
		);
	}

	private function write_raw_wordpress($dir, $batch_size) {
		$this->mkdir($dir);
		$tables = array(
			'wp_options' => array('table' => $this->wpdb->options, 'order_by' => 'option_id ASC'),
			'wp_users' => array('table' => $this->wpdb->users, 'order_by' => 'ID ASC'),
			'wp_usermeta' => array('table' => $this->wpdb->usermeta, 'order_by' => 'umeta_id ASC'),
			'wp_posts' => array('table' => $this->wpdb->posts, 'order_by' => 'ID ASC'),
			'wp_postmeta' => array('table' => $this->wpdb->postmeta, 'order_by' => 'meta_id ASC'),
			'wp_comments' => array('table' => $this->wpdb->comments, 'order_by' => 'comment_ID ASC'),
			'wp_commentmeta' => array('table' => $this->wpdb->commentmeta, 'order_by' => 'meta_id ASC'),
			'wp_terms' => array('table' => $this->wpdb->terms, 'order_by' => 'term_id ASC'),
			'wp_term_taxonomy' => array('table' => $this->wpdb->term_taxonomy, 'order_by' => 'term_taxonomy_id ASC'),
			'wp_term_relationships' => array('table' => $this->wpdb->term_relationships, 'order_by' => 'object_id ASC, term_taxonomy_id ASC'),
			'wp_links' => array('table' => $this->wpdb->links, 'order_by' => 'link_id ASC'),
		);

		foreach ($tables as $alias => $table_config) {
			if (!$this->table_exists($table_config['table'])) {
				continue;
			}
			$target = $dir . '/' . $alias . '.ndjson';
			$total = $this->count_rows($table_config['table']);
			$this->write_ndjson_stream($target, function ($handle) use ($table_config, $batch_size, $total) {
				for ($offset = 0; $offset < $total; $offset += $batch_size) {
					$rows = $this->wpdb->get_results(
						"SELECT * FROM {$table_config['table']} ORDER BY {$table_config['order_by']} LIMIT {$batch_size} OFFSET {$offset}",
						ARRAY_A
					);
					if (empty($rows)) {
						break;
					}
					foreach ($rows as $row) {
						$this->write_ndjson_row($handle, $row);
					}
				}
			});
			$this->log_resource('raw/' . $alias, $total);
		}
	}

	private function write_ndjson_stream($path, $callback) {
		$this->mkdir(dirname($path));
		$handle = fopen($path, 'w');
		if (!$handle) {
			return;
		}
		call_user_func($callback, $handle);
		fclose($handle);
		$this->remember_file($path);
	}

	private function write_ndjson_row($handle, $row) {
		fwrite($handle, wp_json_encode($row, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE) . "\n");
	}

	private function copy_media_variants($uploads_basedir, $relative_path, $metadata, $asset_root) {
		$source = trailingslashit($uploads_basedir) . ltrim($relative_path, '/');
		$this->copy_asset($source, $asset_root . '/' . ltrim($relative_path, '/'));

		if (!is_array($metadata) || empty($metadata['sizes']) || empty($relative_path)) {
			return;
		}

		$base_dir = dirname($relative_path);
		foreach ($metadata['sizes'] as $size) {
			if (empty($size['file'])) {
				continue;
			}
			$variant_relative = ('.' === $base_dir ? '' : $base_dir . '/') . $size['file'];
			$variant_source = trailingslashit($uploads_basedir) . ltrim($variant_relative, '/');
			$this->copy_asset($variant_source, $asset_root . '/' . ltrim($variant_relative, '/'));
		}
	}

	private function copy_asset($source, $dest) {
		if (!file_exists($source) || is_dir($source)) {
			return;
		}
		$this->mkdir(dirname($dest));
		if (copy($source, $dest)) {
			$this->remember_file($dest);
		}
	}

	private function write_json($path, $data) {
		$this->mkdir(dirname($path));
		file_put_contents($path, wp_json_encode($data, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
		$this->remember_file($path);
	}

	private function remember_file($absolute_path) {
		$path = $this->relative_package_path($absolute_path);
		$this->file_checksums[$path] = hash_file('sha256', $absolute_path);
	}

	private function relative_package_path($absolute_path) {
		$marker = '/package/';
		$pos = strpos($absolute_path, $marker);
		if ($pos === false) {
			return basename($absolute_path);
		}
		return ltrim(substr($absolute_path, $pos + strlen($marker)), '/');
	}

	private function render_checksums() {
		ksort($this->file_checksums);
		$lines = array();
		foreach ($this->file_checksums as $path => $sha) {
			$lines[] = $sha . '  ' . $path;
		}
		return implode("\n", $lines) . "\n";
	}

	private function file_key($path) {
		return preg_replace('/[^a-z0-9_]+/i', '_', $path);
	}

	private function zip_directory($source_dir, $zip_path) {
		$zip = new ZipArchive();
		if (true !== $zip->open($zip_path, ZipArchive::CREATE | ZipArchive::OVERWRITE)) {
			return new WP_Error('zip_create_failed', '无法创建导出压缩包。');
		}

		$iterator = new RecursiveIteratorIterator(
			new RecursiveDirectoryIterator($source_dir, FilesystemIterator::SKIP_DOTS),
			RecursiveIteratorIterator::SELF_FIRST
		);
		foreach ($iterator as $file_info) {
			$absolute = $file_info->getPathname();
			$relative = ltrim(str_replace($source_dir, '', $absolute), '/');
			if ($file_info->isDir()) {
				$zip->addEmptyDir($relative);
				continue;
			}
			$zip->addFile($absolute, $relative);
		}
		$zip->close();
		return true;
	}

	private function count_rows($table_name, $where = '') {
		if (empty($table_name)) {
			return 0;
		}
		$sql = "SELECT COUNT(*) FROM {$table_name}";
		if (!empty($where)) {
			$sql .= ' WHERE ' . $where;
		}
		return (int) $this->wpdb->get_var($sql);
	}

	private function pick_first_meta($meta, $keys) {
		foreach ((array) $keys as $key) {
			if (isset($meta[$key])) {
				if (is_array($meta[$key])) {
					return isset($meta[$key][0]) ? maybe_unserialize($meta[$key][0]) : null;
				}
				return maybe_unserialize($meta[$key]);
			}
		}
		return null;
	}

	private function calculate_word_count($text) {
		$text = trim((string) $text);
		if ($text === '') {
			return 0;
		}
		if (function_exists('mb_strlen')) {
			return mb_strlen($text, 'UTF-8');
		}
		return strlen($text);
	}

	private function to_iso8601($mysql_datetime) {
		if (empty($mysql_datetime) || $mysql_datetime === '0000-00-00 00:00:00') {
			return null;
		}
		$ts = strtotime($mysql_datetime);
		if (!$ts) {
			return null;
		}
		return gmdate('c', $ts);
	}

	private function map_comment_status($value) {
		if ((string) $value === '1') {
			return 'approved';
		}
		if ((string) $value === '0') {
			return 'pending';
		}
		if ($value === 'spam') {
			return 'spam';
		}
		if ($value === 'trash') {
			return 'trash';
		}
		return (string) $value;
	}

	private function table_exists($table_name) {
		if (empty($table_name)) {
			return false;
		}
		$like = $this->wpdb->esc_like($table_name);
		$found = $this->wpdb->get_var($this->wpdb->prepare('SHOW TABLES LIKE %s', $like));
		return $found === $table_name;
	}

	private function mkdir($path) {
		if (!file_exists($path)) {
			wp_mkdir_p($path);
		}
	}

	private function normalize_args($args) {
		$args = wp_parse_args(
			$args,
			array(
				'include_assets' => true,
				'include_raw_wordpress' => true,
				'batch_size' => isset($this->settings['batch_size']) ? (int) $this->settings['batch_size'] : self::DEFAULT_BATCH_SIZE,
			)
		);
		$args['batch_size'] = max(20, min(self::MAX_BATCH_SIZE, (int) $args['batch_size']));
		$args['include_assets'] = !empty($args['include_assets']);
		$args['include_raw_wordpress'] = !empty($args['include_raw_wordpress']);
		return $args;
	}

	private function log_resource($resource, $count) {
		if ($this->logger) {
			$this->logger->append(
				sprintf('已导出 %s：%d 条', $resource, (int) $count),
				'info',
				array('resource' => $resource, 'count' => (int) $count)
			);
		}
	}
}
