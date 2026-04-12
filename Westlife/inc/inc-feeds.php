<?php

if (!defined('ABSPATH')) exit;

function westlife_feeds_debug_log($message)
{
    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log($message);
    }
}

function westlife_get_feeds_cache_base_dir()
{
    if (function_exists('westlife_ensure_cache_directories')) {
        westlife_ensure_cache_directories();
    }
    $uploads = wp_upload_dir();
    return trailingslashit($uploads['basedir']) . 'westlife-cache/feeds/';
}

function westlife_get_feeds_cache_path($path = '')
{
    return westlife_get_feeds_cache_base_dir() . ltrim($path, '/');
}

function westlife_get_home_feeds_snapshot($limit = 3)
{
    $limit = max(1, min(10, (int) $limit));
    $quick_cache_file = westlife_get_feeds_cache_path('quick_cache.json');
    $items = [];

    if (file_exists($quick_cache_file)) {
        $quick_data = json_decode((string) file_get_contents($quick_cache_file), true);
        if (is_array($quick_data) && !empty($quick_data['items']) && is_array($quick_data['items'])) {
            $items = $quick_data['items'];
        }
    }

    if (empty($items)) {
        $feeds_data = westlife_get_feeds(false);
        if (is_array($feeds_data) && !empty($feeds_data['items']) && is_array($feeds_data['items'])) {
            $items = $feeds_data['items'];
        }
    }

    if (empty($items)) {
        return [];
    }

    usort($items, function ($a, $b) {
        return (int) ($b['pubDate'] ?? 0) - (int) ($a['pubDate'] ?? 0);
    });

    return array_slice($items, 0, $limit);
}

function westlife_get_feed_source_icon_url($item)
{
    $source = isset($item['source']) && is_array($item['source']) ? $item['source'] : [];
    $avatar = isset($source['avatar']) ? trim((string) $source['avatar']) : '';
    if ($avatar !== '') {
        return esc_url_raw($avatar);
    }

    $source_url = isset($source['url']) ? trim((string) $source['url']) : '';
    if ($source_url !== '' && function_exists('westlife_get_favicon_url')) {
        return esc_url_raw((string) westlife_get_favicon_url($source_url));
    }

    return '';
}

function westlife_render_home_recent_feeds($limit = 3)
{
    $items = westlife_get_home_feeds_snapshot($limit);

    if (empty($items)) {
        return '<li class="rf-empty"><span class="rf-label">订阅</span><span>暂无订阅内容</span></li>';
    }

    $html = '';
    foreach ($items as $item) {
        $title = isset($item['title']) ? wp_strip_all_tags((string) $item['title']) : '';
        $title = trim(html_entity_decode($title, ENT_QUOTES, get_bloginfo('charset')));
        if ($title === '') {
            $title = '未命名内容';
        }

        $link = isset($item['link']) ? (string) $item['link'] : '';
        $source = isset($item['source']) && is_array($item['source']) ? $item['source'] : [];
        $source_name = isset($source['name']) ? trim((string) $source['name']) : '订阅源';
        $icon_url = westlife_get_feed_source_icon_url($item);

        $html .= '<li class="rf-item">';
        if ($link !== '') {
            $html .= '<a class="rf-link" href="' . esc_url($link) . '" target="_blank" rel="noopener noreferrer">';
        } else {
            $html .= '<span class="rf-link is-static">';
        }

        if ($icon_url !== '') {
            $html .= '<img class="rf-source-icon" src="' . esc_url($icon_url) . '" alt="' . esc_attr($source_name) . '" loading="lazy" decoding="async" />';
        } else {
            $html .= '<span class="rf-source-icon rf-source-icon--fallback" aria-hidden="true">' . westlife_lucide_icon('rss') . '</span>';
        }

        $html .= '<span class="rf-texts">';
        $html .= '<span class="rf-title" title="' . esc_attr($source_name . ' · ' . $title) . '">' . esc_html($title) . '</span>';
        $html .= '</span>';

        if ($link !== '') {
            $html .= '</a>';
        } else {
            $html .= '</span>';
        }
        $html .= '</li>';
    }

    return $html;
}

/**
 * Feeds 页面资源加载（样式与脚本）
 * - 仅在模板 template-pages/page-feeds.php 时加载
 * - 目的：把页面专用资源从 inc/inc-assets.php 下沉到页面 inc 文件
 */
function westlife_enqueue_feeds_assets()
{
    if (!is_page_template('template-pages/page-feeds.php')) return;

    $uri = get_template_directory_uri();
    $version = wp_get_theme()->get('Version');
    $has_app_bundle = function_exists('westlife_has_app_bundle') && westlife_has_app_bundle();
    $script_handle = function_exists('westlife_get_frontend_script_handle') ? westlife_get_frontend_script_handle() : 'westlife-feeds';

    // 样式
    if (!$has_app_bundle) {
        wp_enqueue_style('westlife-feeds', $uri . '/assets/css/pages/page-feeds.css', ['westlife-page'], $version);
    }

    // 脚本
    if (!$has_app_bundle) {
        wp_enqueue_script('westlife-feeds', $uri . '/assets/js/pages/page-feeds.js', ['jquery', 'westlife-utils'], $version, true);
    }
    wp_localize_script($script_handle, 'westlifeFeeds', [
        'ajaxurl'     => admin_url('admin-ajax.php'),
        'nonce'       => wp_create_nonce('westlife_ajax_nonce'),
        'isAdmin'     => current_user_can('manage_options'),
        'refreshText' => __('刷新缓存', 'westlife'),
        'loadingText' => __('正在加载...', 'westlife'),
        'successText' => __('刷新成功！', 'westlife'),
        'errorText'   => __('刷新失败，请重试', 'westlife'),
    ]);
}
add_action('wp_enqueue_scripts', 'westlife_enqueue_feeds_assets', 100);

/**
 * 自动发现网站的 RSS 地址
 */
function westlife_discover_feed($url)
{
    // 常见的 RSS 路径
    $common_feeds = [
        '/feed/',
        '/rss/',
        '/atom.xml',
        '/feed.xml',
        '/rss.xml',
        '/index.xml'
    ];

    $parsed_url = parse_url($url);
    if (!$parsed_url || !isset($parsed_url['host'])) {
        return false;
    }

    $base_url = $parsed_url['scheme'] . '://' . $parsed_url['host'];

    // 尝试常见的 RSS 路径
    foreach ($common_feeds as $feed_path) {
        $feed_url = $base_url . $feed_path;

        // 快速检查 RSS 是否存在（HEAD 请求）
        $response = wp_remote_head($feed_url, [
            'timeout' => 5,
            'user-agent' => 'Mozilla/5.0 (compatible; WestlifeFeedBot/1.0)'
        ]);

        if (!is_wp_error($response)) {
            $code = wp_remote_retrieve_response_code($response);
            $content_type = wp_remote_retrieve_header($response, 'content-type');

            // 检查是否是有效的 RSS/Atom 响应
            if ($code == 200 && (
                strpos($content_type, 'xml') !== false ||
                strpos($content_type, 'rss') !== false ||
                strpos($content_type, 'atom') !== false
            )) {
                return $feed_url;
            }
        }
    }

    return false;
}

/**
 * 获取单个RSS源的缓存数据
 */
function westlife_get_single_feed_cache($bookmark, $feed_url, $cache_dir, $cache_lifetime, $error_cache_lifetime, $force_refresh = false)
{
    // 生成缓存文件名（基于RSS URL的MD5）
    $cache_filename = md5($feed_url) . '.json';
    $cache_file = $cache_dir . $cache_filename;

    // 检查缓存
    if (!$force_refresh && file_exists($cache_file)) {
        $cache_age = time() - filemtime($cache_file);
        $cache_data = json_decode(file_get_contents($cache_file), true);

        // 判断缓存是否有效
        $is_error_cache = isset($cache_data['error']);
        $effective_lifetime = $is_error_cache ? $error_cache_lifetime : $cache_lifetime;

        if ($cache_age < $effective_lifetime && is_array($cache_data)) {
            // 返回缓存数据，标记来源
            $cache_data['from_cache'] = true;
            $cache_data['cache_age'] = $cache_age;
            return $cache_data;
        }
    }

    // 抓取新数据
    $feed = fetch_feed($feed_url);
    $cache_data = [
        'from_cache' => false,
        'cached_at' => time(),
        'feed_url' => $feed_url,
        'source' => [
            'name' => $bookmark->link_name,
            'url' => $bookmark->link_url,
            'avatar' => $bookmark->link_image
        ]
    ];

    if (is_wp_error($feed)) {
        // 错误缓存
        $cache_data['error'] = $feed->get_error_message();
    } else {
        // 成功抓取
        $feed->init();
        $feed->handle_content_type();
        $max_items = $feed->get_item_quantity(3);
        $feed_items = $feed->get_items(0, $max_items);

        $items = [];
        foreach ($feed_items as $item) {
            $items[] = [
                'title' => $item->get_title(),
                'link' => $item->get_link(),
                'description' => $item->get_description(),
                'pubDate' => $item->get_date('U'),
                'source' => $cache_data['source']
            ];
        }

        $cache_data['items'] = $items;
        $cache_data['count'] = count($items);
    }

    // 写入缓存文件（带错误处理）
    $json_data = json_encode($cache_data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
    if (@file_put_contents($cache_file, $json_data) === false) {
        // 写入失败，添加错误日志但不中断程序
        westlife_feeds_debug_log("Westlife Feeds: Failed to write cache file: {$cache_file}");
    }

    return $cache_data;
}

/**
 * 检查缓存目录权限
 */
function westlife_check_feeds_cache_permission($directory)
{
    // 检查目录是否存在
    if (!is_dir($directory)) {
        return false;
    }

    // 检查目录是否可写
    if (!is_writable($directory)) {
        return false;
    }

    return true;
}

/**
 * 友链feeds主函数，分布式缓存机制 + 快速返回优化
 * - 每个RSS源使用独立的JSON缓存文件
 * - 支持增量更新，只更新过期的源
 * - 不同源可以设置不同的缓存时间
 * - 单个源失败不影响其他源
 * - 快速缓存检查，优先返回可用数据
 */
function westlife_get_feeds($force_refresh = false)
{
    $cache_dir = westlife_get_feeds_cache_base_dir();
    $individual_cache_dir = westlife_get_feeds_cache_path('sources/');
    $quick_cache_file = westlife_get_feeds_cache_path('quick_cache.json');

    // 创建缓存目录（带错误检查）
    if (!is_dir($cache_dir)) {
        if (!@mkdir($cache_dir, 0755, true) && !is_dir($cache_dir)) {
            westlife_feeds_debug_log("Westlife Feeds: Failed to create cache directory: {$cache_dir}");
        }
    }
    if (!is_dir($individual_cache_dir)) {
        if (!@mkdir($individual_cache_dir, 0755, true) && !is_dir($individual_cache_dir)) {
            westlife_feeds_debug_log("Westlife Feeds: Failed to create individual cache directory: {$individual_cache_dir}");
        }
    }

    // 权限检查（仅在强制刷新时进行，避免影响性能）
    if ($force_refresh && !westlife_check_feeds_cache_permission($individual_cache_dir)) {
        westlife_feeds_debug_log("Westlife Feeds: Cache directory is not writable: {$individual_cache_dir}");
    }

    // 缓存配置
    $cache_lifetime = 2 * 3600; // 2小时缓存
    $error_cache_lifetime = 30 * 60; // 错误缓存30分钟
    $quick_cache_lifetime = 10 * 60; // 快速缓存10分钟

    // 快速缓存检查 - 如果不是强制刷新且快速缓存存在，直接返回
    if (!$force_refresh && file_exists($quick_cache_file)) {
        $quick_cache_age = time() - filemtime($quick_cache_file);
        if ($quick_cache_age < $quick_cache_lifetime) {
            $quick_data = json_decode(file_get_contents($quick_cache_file), true);
            if (is_array($quick_data) && !empty($quick_data['items'])) {
                $quick_data['cache_info']['from_quick_cache'] = true;
                $quick_data['cache_info']['quick_cache_age'] = $quick_cache_age;
                return $quick_data;
            }
        }
    }

    // 检查是否为管理员强制刷新
    $is_admin_refresh = $force_refresh || (isset($_POST['force_refresh']) && $_POST['force_refresh'] == '1' && current_user_can('manage_options'));

    // 如果是强制刷新，清空所有缓存文件
    if ($is_admin_refresh) {
        $cache_files = glob($individual_cache_dir . '*.json');
        foreach ($cache_files as $file) {
            @unlink($file);
        }
        // 删除错误日志
        $error_file = westlife_get_feeds_cache_path('error.log');
        if (file_exists($error_file)) {
            @unlink($error_file);
        }
    }

    // 获取所有友情链接
    $bookmarks = get_bookmarks([
        'orderby' => 'name',
        'limit' => -1,
        'hide_invisible' => 0,
        'category' => '',
    ]);

    $all_items = [];
    $errors = [];
    $stats = [
        'total_bookmarks' => count($bookmarks),
        'bookmarks_with_rss' => 0,
        'success' => 0,
        'errors' => 0,
        'cache_hits' => 0,
        'cache_misses' => 0,
        'discovered_feeds' => 0,
    ];

    // 设置HTTP请求参数
    add_filter('http_request_timeout', function () {
        return 10;
    });
    add_filter('http_request_args', function ($args) {
        $args['user-agent'] = 'Mozilla/5.0 (compatible; WestlifeFeedBot/1.0)';
        $args['timeout'] = 10;
        $args['redirection'] = 3;
        return $args;
    });

    // 处理每个友情链接
    foreach ($bookmarks as $bookmark) {
        $feed_url = '';

        // 确定RSS地址
        if (!empty($bookmark->link_rss)) {
            $feed_url = $bookmark->link_rss;
            $stats['bookmarks_with_rss']++;
        } else {
            // 跳过自动发现以提高速度 - 建议用户手动配置RSS链接
            continue;
        }

        // 获取或更新该RSS源的缓存
        $source_data = westlife_get_single_feed_cache($bookmark, $feed_url, $individual_cache_dir, $cache_lifetime, $error_cache_lifetime, $is_admin_refresh);

        if ($source_data) {
            if ($source_data['from_cache']) {
                $stats['cache_hits']++;
            } else {
                $stats['cache_misses']++;
            }

            if (isset($source_data['items']) && is_array($source_data['items'])) {
                $all_items = array_merge($all_items, $source_data['items']);
                $stats['success']++;
            }

            if (isset($source_data['error'])) {
                $errors[] = [
                    'name' => $bookmark->link_name,
                    'url' => $bookmark->link_url,
                    'rss' => $feed_url,
                    'error' => $source_data['error']
                ];
                $stats['errors']++;
            }
        }
    }

    // 清理过滤器
    remove_all_filters('http_request_timeout');
    remove_all_filters('http_request_args');

    // 按更新时间（pubDate）降序排序
    usort($all_items, function ($a, $b) {
        return intval($b['pubDate']) - intval($a['pubDate']);
    });

    // 计算缓存信息
    $oldest_cache = time();
    $newest_cache = 0;
    $cache_files = glob($individual_cache_dir . '*.json');
    foreach ($cache_files as $file) {
        $mtime = filemtime($file);
        $oldest_cache = min($oldest_cache, $mtime);
        $newest_cache = max($newest_cache, $mtime);
    }

    // 生成最终数据
    $result_data = [
        'items' => $all_items,
        'stats' => array_merge($stats, [
            'total' => count($all_items),
        ]),
        'cache_info' => [
            'cached_at' => $newest_cache ?: time(),
            'expires_at' => $oldest_cache + $cache_lifetime,
            'remaining_minutes' => max(0, ceil(($oldest_cache + $cache_lifetime - time()) / 60)),
            'cache_type' => 'distributed',
        ]
    ];

    // 错误日志处理
    $errfile = westlife_get_feeds_cache_path('error.log');
    $all_errors = [];

    // 从各个源的缓存文件中收集错误信息
    foreach (glob($individual_cache_dir . '*.json') as $cache_file) {
        $cache_data = json_decode(file_get_contents($cache_file), true);
        if (isset($cache_data['error'])) {
            $all_errors[basename($cache_file, '.json')] = [
                'url' => $cache_data['feed_url'] ?? 'unknown',
                'source_name' => $cache_data['source']['name'] ?? 'unknown',
                'error' => $cache_data['error'],
                'cached_at' => $cache_data['cached_at'] ?? time(),
            ];
        }
    }

    // 写入错误日志（带错误处理）
    if (!empty($all_errors)) {
        $error_json = json_encode($all_errors, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if (@file_put_contents($errfile, $error_json) === false) {
            westlife_feeds_debug_log("Westlife Feeds: Failed to write error log: {$errfile}");
        }
    } elseif (file_exists($errfile)) {
        // 没有错误时清理错误日志
        @unlink($errfile);
    }

    // 7天自动清理 error.log
    if (file_exists($errfile) && (time() - filemtime($errfile) > 7 * 24 * 3600)) {
        @unlink($errfile);
    }

    // 保存快速缓存 - 只要有数据就保存，用于下次快速返回（带错误处理）
    if (!empty($result_data['items'])) {
        $quick_json = json_encode($result_data, JSON_UNESCAPED_UNICODE);
        if (@file_put_contents($quick_cache_file, $quick_json) === false) {
            westlife_feeds_debug_log("Westlife Feeds: Failed to write quick cache: {$quick_cache_file}");
        }
    }

    return $result_data;
}

/**
 * AJAX：获取友链动态（供前端调用）
 */
function westlife_ajax_get_feeds()
{
    $page = isset($_POST['page']) ? absint($_POST['page']) : 1;
    $count = isset($_POST['count']) ? absint($_POST['count']) : 12;
    $per_page = min($count, 36); // 限制最大36个

    try {
        $feeds_data = westlife_get_feeds();
        if (isset($feeds_data['error'])) {
            wp_send_json_error([
                'notification' => [
                    'text' => $feeds_data['error'],
                    'type' => 'error',
                    'duration' => 5000
                ]
            ]);
            return;
        }
        $items = $feeds_data['items'] ?? [];
        $total = count($items);
        $offset = ($page - 1) * $per_page;
        $paged_items = array_slice($items, $offset, $per_page);
        if (empty($paged_items) && $page == 1) {
            wp_send_json_success([
                'html' => '<div class="no-feeds" style="text-align: center; padding: 60px 20px; color: #6b7280;">' . westlife_lucide_icon('inbox', ['style' => 'font-size:3rem;color:#9ca3af;margin-bottom:1rem;display:block;']) . '<p>暂无动态数据。</p></div>',
                'has_more' => false,
                'total' => 0
            ]);
            return;
        }
        if (empty($paged_items)) {
            wp_send_json_success([
                'html' => '',
                'has_more' => false,
                'total' => $total
            ]);
            return;
        }
        // 生成 HTML
        ob_start();
        foreach ($paged_items as $item) {
            westlife_render_feed_item($item);
        }
        $html = ob_get_clean();
        wp_send_json_success([
            'html' => $html,
            'has_more' => ($offset + $per_page) < $total,
            'total' => $total,
            'loaded' => $offset + count($paged_items)
        ]);
    } catch (Exception $e) {
        wp_send_json_error([
            'notification' => [
                'text' => '获取动态数据失败: ' . $e->getMessage(),
                'type' => 'error',
                'duration' => 5000
            ]
        ]);
    }
}
add_action('wp_ajax_westlife_get_feeds', 'westlife_ajax_get_feeds');
add_action('wp_ajax_nopriv_westlife_get_feeds', 'westlife_ajax_get_feeds');

/**
 * AJAX：刷新友链动态（仅管理员可用）
 */
function westlife_ajax_refresh_feeds()
{
    // 权限检查：仅管理员可强制刷新
    if (!current_user_can('manage_options')) {
        wp_send_json_error([
            'notification' => [
                'text' => '权限不足，无法执行此操作',
                'type' => 'error',
                'duration' => 5000
            ]
        ]);
        return;
    }

    // 检查缓存目录权限
    $cache_dir = westlife_get_feeds_cache_path('sources/');
    if (!westlife_check_feeds_cache_permission($cache_dir)) {
        $error_message = '缓存目录不可写，请检查文件权限。目录：' . $cache_dir;
        wp_send_json_error([
            'notification' => [
                'text' => $error_message,
                'type' => 'error',
                'duration' => 8000
            ]
        ]);
        return;
    }

    // 增加执行时间限制，防止超时
    if (function_exists('set_time_limit')) {
        set_time_limit(120);
    }

    try {
        // 强制刷新缓存
        $data = westlife_get_feeds(true);

        if (isset($data['error'])) {
            wp_send_json_error([
                'notification' => [
                    'text' => $data['error'],
                    'type' => 'error',
                    'duration' => 5000
                ]
            ]);
            return;
        }

        $stats = $data['stats'] ?? [];
        $message = sprintf(
            '缓存已更新！发现 %d 个友链，其中 %d 个有RSS，成功抓取 %d 个源，共获得 %d 篇文章',
            $stats['total_bookmarks'] ?? 0,
            $stats['bookmarks_with_rss'] ?? 0,
            $stats['success'] ?? 0,
            $stats['total'] ?? 0
        );

        if (!empty($stats['discovered_feeds'])) {
            $message .= sprintf('，自动发现 %d 个RSS', $stats['discovered_feeds']);
        }

        if (!empty($stats['errors'])) {
            $message .= sprintf('，%d 个源出现错误', $stats['errors']);
        }

        wp_send_json_success([
            'stats' => $stats,
            'cache_info' => $data['cache_info'] ?? [],
            'notification' => [
                'text' => $message,
                'type' => 'success',
                'duration' => 4000
            ]
        ]);
    } catch (Exception $e) {
        wp_send_json_error([
            'notification' => [
                'text' => '刷新失败：' . $e->getMessage(),
                'type' => 'error',
                'duration' => 5000
            ]
        ]);
    }
}
add_action('wp_ajax_westlife_refresh_feeds', 'westlife_ajax_refresh_feeds');

// AJAX：获取feeds统计信息（供前端异步加载）
function westlife_ajax_get_feeds_stats()
{
    $feeds_data = westlife_get_feeds();
    $stats = $feeds_data['stats'] ?? ['total' => 0, 'errors' => 0, 'success' => 0];
    $cache_info = $feeds_data['cache_info'] ?? [];

    // 添加缓存剩余时间
    $cache_minutes = 120; // 默认2小时
    if (isset($cache_info['remaining_minutes'])) {
        $cache_minutes = $cache_info['remaining_minutes'];
    }

    wp_send_json_success([
        'stats' => array_merge($stats, [
            'cache_minutes' => $cache_minutes,
            'last_update' => $cache_info['cached_at'] ?? time()
        ]),
        'cache_info' => $cache_info
    ]);
}
add_action('wp_ajax_westlife_get_feeds_stats', 'westlife_ajax_get_feeds_stats');
add_action('wp_ajax_nopriv_westlife_get_feeds_stats', 'westlife_ajax_get_feeds_stats');

/**
 * AJAX：获取缓存状态信息（管理员专用）
 */
function westlife_ajax_get_cache_status()
{
    // 权限检查
    if (!current_user_can('manage_options')) {
        wp_send_json_error(['message' => '权限不足']);
        return;
    }

    $cache_dir = westlife_get_feeds_cache_path('sources/');
    $cache_info = [];

    if (is_dir($cache_dir)) {
        $cache_files = glob($cache_dir . '*.json');
        $total_files = count($cache_files);

        $oldest_time = time();
        $newest_time = 0;
        $expired_count = 0;
        $error_count = 0;
        $cache_lifetime = 2 * 3600; // 2小时

        foreach ($cache_files as $file) {
            $mtime = filemtime($file);
            $oldest_time = min($oldest_time, $mtime);
            $newest_time = max($newest_time, $mtime);

            // 检查是否过期
            if ((time() - $mtime) > $cache_lifetime) {
                $expired_count++;
            }

            // 检查是否是错误缓存
            $cache_data = json_decode(file_get_contents($file), true);
            if (isset($cache_data['error'])) {
                $error_count++;
            }
        }

        $cache_info = [
            'total_sources' => $total_files,
            'expired_sources' => $expired_count,
            'error_sources' => $error_count,
            'oldest_cache' => $oldest_time,
            'newest_cache' => $newest_time,
            'cache_lifetime' => $cache_lifetime,
            'remaining_minutes' => max(0, ceil(($oldest_time + $cache_lifetime - time()) / 60)),
            'next_auto_update' => wp_next_scheduled('westlife_feeds_cron_hook'),
        ];
    } else {
        $cache_info = [
            'error' => '缓存目录不存在',
            'next_auto_update' => wp_next_scheduled('westlife_feeds_cron_hook'),
        ];
    }

    wp_send_json_success($cache_info);
}
add_action('wp_ajax_westlife_get_cache_status', 'westlife_ajax_get_cache_status');

/**
 * 添加管理菜单到主题设置目录下
 * 已迁移到主题后台统一菜单管理
 */
// function westlife_feeds_admin_menu()
// {
//     add_submenu_page(
//         'westlife-settings',
//         'Feeds 缓存管理',
//         'Feeds 缓存',
//         'manage_options',
//         'westlife-feeds-cache',
//         'westlife_feeds_cache_admin_page'
//     );
// }
// add_action('admin_menu', 'westlife_feeds_admin_menu', 15);

/**
 * 缓存管理页面回调
 * 已迁移到 inc/admin/feeds-cache-admin.php 中的 westlife_feeds_cache_page() 函数
 */
// function westlife_feeds_cache_admin_page()
// {
//     include get_template_directory() . '/inc/admin/feeds-cache-admin.php';
// }

/**
 * 添加自定义的2小时间隔
 */
function westlife_add_cron_interval($schedules)
{
    $schedules['twohourly'] = [
        'interval' => 2 * 3600, // 2小时 = 7200秒
        'display' => __('Every Two Hours')
    ];
    return $schedules;
}
add_filter('cron_schedules', 'westlife_add_cron_interval');

/**
 * 定时任务：自动更新 feeds 缓存
 * 每2小时在后台自动刷新一次缓存
 */
function westlife_schedule_feeds_update()
{
    if (!wp_next_scheduled('westlife_feeds_cron_hook')) {
        wp_schedule_event(time(), 'twohourly', 'westlife_feeds_cron_hook');
    }
}
add_action('wp', 'westlife_schedule_feeds_update');

/**
 * 执行定时 feeds 更新 - 分布式缓存版本
 */
function westlife_cron_update_feeds()
{
    // 增加执行时间限制
    if (function_exists('set_time_limit')) {
        set_time_limit(300); // 5分钟
    }

    // 检查分布式缓存目录
    $cache_dir = westlife_get_feeds_cache_path('sources/');
    $cache_lifetime = 2 * 3600; // 2小时缓存

    // 检查是否有缓存文件需要更新
    $needs_update = false;
    if (is_dir($cache_dir)) {
        $cache_files = glob($cache_dir . '*.json');
        if (empty($cache_files)) {
            $needs_update = true;
        } else {
            // 检查最老的缓存文件
            $oldest_time = time();
            foreach ($cache_files as $file) {
                $oldest_time = min($oldest_time, filemtime($file));
            }
            // 如果最老的缓存超过2小时，触发更新
            if ((time() - $oldest_time) > $cache_lifetime) {
                $needs_update = true;
            }
        }
    } else {
        $needs_update = true;
    }

    // 需要更新时，强制刷新所有缓存
    if ($needs_update) {
        try {
            $result = westlife_get_feeds(true);

            // 记录更新日志（带错误处理）
            $log_file = westlife_get_feeds_cache_path('auto_update.log');
            $log_data = [
                'time' => current_time('mysql'),
                'timestamp' => time(),
                'status' => isset($result['error']) ? 'error' : 'success',
                'stats' => $result['stats'] ?? [],
                'error' => $result['error'] ?? null,
                'trigger' => 'cron_job'
            ];
            $log_json = json_encode($log_data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
            if (@file_put_contents($log_file, $log_json) === false) {
                westlife_feeds_debug_log("Westlife Feeds: Failed to write auto update log: {$log_file}");
            }
        } catch (Exception $e) {
            // 记录错误但不中断
            westlife_feeds_debug_log('Westlife Auto Feeds Update Error: ' . $e->getMessage());
        }
    }
}
add_action('westlife_feeds_cron_hook', 'westlife_cron_update_feeds');

// 渲染单个动态项（HTML结构可根据主题自定义）
function westlife_render_feed_item($item)
{
    $source = $item['source'] ?? [];
    $source_name = $source['name'] ?? '未知';
    $source_url = $source['url'] ?? '';
    $source_avatar = $source['avatar'] ?? '';

    // 使用通用favicon获取函数
    $favicon_url = (!$source_avatar && $source_url) ? westlife_get_favicon_url($source_url) : '';
?>
    <article class="feed-item">
        <div class="feed-item-container">
            <h3 class="feed-title">
                <a href="<?php echo esc_url($item['link']); ?>" target="_blank" rel="noopener">
                    <?php echo esc_html($item['title']); ?>
                </a>
            </h3>
            <?php if (!empty($item['description'])): ?>
                <div class="feed-excerpt">
                    <?php echo esc_html(wp_trim_words($item['description'], 80)); ?>
                </div>
            <?php endif; ?>
            <div class="feed-footer">
                <div class="feed-source">
                    <?php if ($source_avatar): ?>
                        <img class="source-avatar"
                            src="<?php echo esc_url($source_avatar); ?>"
                            alt="<?php echo esc_attr($source_name); ?>"
                            loading="lazy"
                            onerror="this.style.display='none';this.nextElementSibling && (this.nextElementSibling.style.display='flex');">
                        <span class="avatar-fallback u-hidden"><!-- migrated: inline display:none -> u-hidden -->
                            <?php echo esc_html(mb_substr($source_name, 0, 1)); ?>
                        </span>
                    <?php elseif ($favicon_url): ?>
                        <img class="source-avatar source-favicon"
                            src="<?php echo esc_url($favicon_url); ?>"
                            alt="<?php echo esc_attr($source_name); ?>"
                            loading="lazy"
                            onerror="this.style.display='none';this.nextElementSibling && (this.nextElementSibling.style.display='flex');">
                        <span class="avatar-fallback u-hidden"><!-- migrated: inline display:none -> u-hidden -->
                            <?php echo esc_html(mb_substr($source_name, 0, 1)); ?>
                        </span>
                    <?php else: ?>
                        <span class="avatar-fallback">
                            <?php echo esc_html(mb_substr($source_name, 0, 1)); ?>
                        </span>
                    <?php endif; ?>
                    <a class="source-name" href="<?php echo esc_url($source_url); ?>"
                        target="_blank" rel="noopener">
                        <?php echo esc_html($source_name); ?>
                    </a>
                </div>
                <time class="feed-time">
                    <?php
                    $pub_date = $item['pub_ts'] ?? ($item['pubDate'] ?? 0);
                    if ($pub_date && is_numeric($pub_date) && $pub_date > 0) {
                        echo westlife_human_time_diff($pub_date) . '前';
                    } else {
                        echo '最近更新';
                    }
                    ?>
                </time>
            </div>
        </div>
    </article>
<?php
}
