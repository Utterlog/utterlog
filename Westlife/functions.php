<?php

/**
 * Westlife 主题核心功能
 *
 * - 采用最基础的"多文件加载"模式（不合并/不打包/不压缩）
 * - 职责拆分：核心功能放入 inc/*，此文件仅做启动、钩子与少量通用功能
 * - 移除单文件/打包模式与后台相关设置
 *
 * @package Westlife
 * @version 2.1.0
 */

if (!defined('ABSPATH')) exit;

/* ============================================================
 * 0) 主题版本与常量
 * ============================================================ */

/**
 * 定义主题版本常量（用于资源版本号）
 */
if (!defined('WESTLIFE_VERSION')) {
    $theme = wp_get_theme();
    if ($theme->parent()) {
        $theme = wp_get_theme($theme->parent()->get_template());
    }
    define('WESTLIFE_VERSION', $theme->get('Version'));
}

/**
 * 为向后兼容保留 _S_VERSION
 */
if (!defined('_S_VERSION')) {
    define('_S_VERSION', WESTLIFE_VERSION);
}

if (!function_exists('westlife_wp_timezone')) {
    function westlife_wp_timezone()
    {
        return function_exists('wp_timezone') ? wp_timezone() : new DateTimeZone('UTC');
    }
}

if (!function_exists('westlife_current_timestamp')) {
    function westlife_current_timestamp()
    {
        return (int) current_datetime()->getTimestamp();
    }
}

if (!function_exists('westlife_parse_timestamp')) {
    function westlife_parse_timestamp($value)
    {
        if ($value instanceof DateTimeInterface) {
            return (int) $value->getTimestamp();
        }

        if (is_numeric($value)) {
            return (int) $value;
        }

        if (!is_string($value) || trim($value) === '') {
            return 0;
        }

        try {
            $dt = new DateTimeImmutable($value, westlife_wp_timezone());
            return (int) $dt->getTimestamp();
        } catch (Throwable $e) {
            $ts = strtotime($value);
            return $ts ? (int) $ts : 0;
        }
    }
}

if (!function_exists('westlife_format_wp_datetime')) {
    function westlife_format_wp_datetime($value, $format = 'Y-m-d H:i:s')
    {
        $ts = westlife_parse_timestamp($value);
        return $ts > 0 ? wp_date($format, $ts, westlife_wp_timezone()) : '';
    }
}

if (!function_exists('westlife_human_time_diff')) {
    function westlife_human_time_diff($from, $to = null)
    {
        $from_ts = westlife_parse_timestamp($from);
        $to_ts = $to === null ? westlife_current_timestamp() : westlife_parse_timestamp($to);

        if ($from_ts <= 0 || $to_ts <= 0) {
            return '';
        }

        return human_time_diff($from_ts, $to_ts);
    }
}

if (!function_exists('westlife_fa_to_lucide_name')) {
    function westlife_fa_to_lucide_name($value)
    {
        $value = is_array($value) ? implode(' ', $value) : (string) $value;
        $value = strtolower($value);

        $map = [
            'fa-search' => 'search',
            'fa-times' => 'x',
            'fa-xmark' => 'x',
            'fa-close' => 'x',
            'fa-user-circle' => 'circle-user-round',
            'fa-user-edit' => 'user-round-pen',
            'fa-user-friends' => 'users',
            'fa-users' => 'users',
            'fa-user' => 'user-round',
            'fa-id-badge' => 'id-card',
            'fa-left-to-bracket' => 'log-in',
            'fa-right-to-bracket' => 'log-in',
            'fa-sign-out' => 'log-out',
            'fa-gauge' => 'layout-dashboard',
            'fa-sliders-h' => 'sliders-horizontal',
            'fa-edit' => 'square-pen',
            'fa-pen-nib' => 'pen-tool',
            'fa-pen' => 'square-pen',
            'fa-comment-dots' => 'message-circle-more',
            'fa-comments-alt' => 'messages-square',
            'fa-comments' => 'messages-square',
            'fa-comment-slash' => 'message-square-off',
            'fa-comment' => 'message-square',
            'fa-reply' => 'reply',
            'fa-calendar-times' => 'calendar-x-2',
            'fa-calendar-alt' => 'calendar-days',
            'fa-clock' => 'clock-3',
            'fa-file-word' => 'file-text',
            'fa-folder' => 'folder',
            'fa-tags' => 'tags',
            'fa-tag' => 'tag',
            'fa-eye' => 'eye',
            'fa-fire-flame' => 'flame',
            'fa-exclamation-circle' => 'circle-alert',
            'fa-info-circle' => 'circle-alert',
            'fa-exclamation-triangle' => 'triangle-alert',
            'fa-triangle-exclamation' => 'triangle-alert',
            'fa-circle-info' => 'circle-alert',
            'fa-check-circle' => 'circle-check',
            'fa-circle-check' => 'circle-check',
            'fa-circle-xmark' => 'circle-x',
            'fa-check' => 'check',
            'fa-copy' => 'copy',
            'fa-trash' => 'trash-2',
            'fa-trash-alt' => 'trash-2',
            'fa-bookmark' => 'bookmark',
            'fa-heart' => 'heart',
            'fa-spinner' => 'loader-circle',
            'fa-circle-notch' => 'loader-circle',
            'fa-sync-alt' => 'refresh-cw',
            'fa-rotate-right' => 'refresh-cw',
            'fa-shuffle' => 'shuffle',
            'fa-plus' => 'plus',
            'fa-arrow-left' => 'arrow-left',
            'fa-arrow-right' => 'arrow-right',
            'fa-chevron-left' => 'chevron-left',
            'fa-chevron-right' => 'chevron-right',
            'fa-circle-up' => 'circle-arrow-up',
            'fa-layer-group' => 'layers-3',
            'fa-rss' => 'rss',
            'fa-square-rss' => 'rss',
            'fa-link-slash' => 'unlink',
            'fa-link' => 'link',
            'fa-external-link-alt' => 'external-link',
            'fa-database' => 'database',
            'fa-cloud' => 'cloud',
            'fa-globe-asia' => 'globe',
            'fa-globe' => 'globe',
            'fa-envelope' => 'mail',
            'fa-bolt' => 'zap',
            'fa-mountain' => 'mountain',
            'fa-gamepad' => 'gamepad-2',
            'fa-crosshairs' => 'crosshair',
            'fa-chess-knight' => 'swords',
            'fa-blog' => 'notebook-pen',
            'fa-badge-check' => 'badge-check',
            'fa-circle-star' => 'badge-plus',
            'fa-star' => 'star',
            'fa-moon' => 'moon',
            'fa-sun' => 'sun',
            'fa-crown' => 'crown',
            'fa-bars' => 'menu',
            'fa-table-columns' => 'columns-2',
            'fa-list' => 'list',
            'fa-train-tunnel' => 'tram-front',
            'fa-train' => 'train-front',
            'fa-compass' => 'compass',
            'fa-desktop' => 'monitor',
            'fa-home' => 'house',
            'fa-ghost' => 'ghost',
            'fa-inbox' => 'inbox',
            'fa-chart-line' => 'chart-column',
            'fa-archive' => 'archive',
            'fa-hashtag' => 'hash',
            'fa-wifi' => 'wifi',
            'fa-download' => 'download',
            'fa-code-branch' => 'git-branch',
            'fa-weight-hanging' => 'weight',
            'fa-file-alt' => 'file-text',
            'fa-wordpress' => 'blocks',
            'fa-php' => 'code-xml',
            'fa-twitter' => 'twitter',
            'fa-x-twitter' => 'twitter',
            'fa-github' => 'github',
            'fa-mastodon' => 'messages-square',
            'fa-weibo' => 'message-circle',
            'fa-telegram' => 'send',
            'fa-youtube' => 'youtube',
            'fa-instagram' => 'instagram',
            'fa-bilibili' => 'tv',
            'fa-bluesky' => 'cloud',
            'fa-weixin' => 'message-circle',
            'fa-replyd' => 'palette',
            'fa-dice' => 'dice-5',
        ];

        foreach ($map as $needle => $icon) {
            if (strpos($value, $needle) !== false) {
                return $icon;
            }
        }

        return 'circle';
    }
}

if (!function_exists('westlife_lucide_icon')) {
    function westlife_lucide_icon($icon, $attrs = [])
    {
        $icon = (string) $icon;
        $classes = trim((string) ($attrs['class'] ?? ''));
        $name = strtolower($icon);
        $normalize_fa_classes = static function ($value) {
            $value = preg_replace('/\s+/', ' ', trim((string) $value));
            if ($value === '') {
                return '';
            }

            $replacements = [
                'fas'  => 'fa-solid',
                'far'  => 'fa-regular',
                'fab'  => 'fa-brands',
                'fal'  => 'fa-light',
                'fat'  => 'fa-thin',
                'fad'  => 'fa-duotone',
                'fass' => 'fa-sharp fa-solid',
                'fasr' => 'fa-sharp fa-regular',
                'fasl' => 'fa-sharp fa-light',
                'fast' => 'fa-sharp fa-thin',
                'fasd' => 'fa-sharp-duotone',
            ];

            $parts = preg_split('/\s+/', $value);
            $normalized = [];
            foreach ($parts as $part) {
                $part = strtolower(trim($part));
                if ($part === '') {
                    continue;
                }
                if (isset($replacements[$part])) {
                    foreach (preg_split('/\s+/', $replacements[$part]) as $replacement) {
                        $normalized[] = $replacement;
                    }
                    continue;
                }
                $normalized[] = $part;
            }

            return trim(implode(' ', array_unique($normalized)));
        };
        $fa_map = [
            'search' => 'fa-sharp fa-solid fa-magnifying-glass',
            'bell' => 'fa-sharp fa-solid fa-bell',
            'calendar' => 'fa-sharp fa-solid fa-calendar-days',
            'x' => 'fa-sharp fa-solid fa-xmark',
            'circle-user-round' => 'fa-sharp fa-solid fa-circle-user',
            'user-round-pen' => 'fa-sharp fa-solid fa-user-pen',
            'user-pen' => 'fa-sharp fa-solid fa-user-pen',
            'users' => 'fa-sharp fa-solid fa-users',
            'user-round' => 'fa-sharp fa-solid fa-user',
            'user' => 'fa-sharp fa-solid fa-user',
            'id-card' => 'fa-sharp fa-solid fa-id-card',
            'log-in' => 'fa-sharp fa-solid fa-right-to-bracket',
            'log-out' => 'fa-sharp fa-solid fa-right-from-bracket',
            'layout-dashboard' => 'fa-sharp fa-solid fa-gauge',
            'layout-grid' => 'fa-sharp fa-solid fa-table-cells-large',
            'sliders-horizontal' => 'fa-sharp fa-solid fa-sliders',
            'square-pen' => 'fa-sharp fa-solid fa-pen-to-square',
            'pen-tool' => 'fa-sharp fa-solid fa-pen-nib',
            'pencil' => 'fa-sharp fa-solid fa-pen',
            'message-circle-more' => 'fa-sharp fa-solid fa-comment-dots',
            'messages-square' => 'fa-sharp fa-solid fa-comments',
            'message-square-off' => 'fa-sharp fa-solid fa-comment-slash',
            'message-square' => 'fa-sharp fa-solid fa-comment',
            'message-circle' => 'fa-sharp fa-solid fa-comment',
            'reply' => 'fa-sharp fa-solid fa-reply',
            'calendar-x-2' => 'fa-sharp fa-solid fa-calendar-xmark',
            'calendar-days' => 'fa-sharp fa-solid fa-calendar-days',
            'clock-3' => 'fa-regular fa-clock',
            'file-text' => 'fa-sharp fa-solid fa-file-lines',
            'folder' => 'fa-sharp fa-solid fa-folder',
            'tags' => 'fa-sharp fa-solid fa-tags',
            'tag' => 'fa-sharp fa-solid fa-tag',
            'eye' => 'fa-regular fa-eye',
            'eye-off' => 'fa-regular fa-eye-slash',
            'flame' => 'fa-sharp fa-solid fa-fire',
            'circle-alert' => 'fa-sharp fa-solid fa-circle-info',
            'triangle-alert' => 'fa-sharp fa-solid fa-triangle-exclamation',
            'circle-check' => 'fa-sharp fa-solid fa-circle-check',
            'circle-x' => 'fa-sharp fa-solid fa-circle-xmark',
            'check' => 'fa-sharp fa-solid fa-check',
            'copy' => 'fa-regular fa-copy',
            'trash-2' => 'fa-sharp fa-solid fa-trash-can',
            'bookmark' => 'fa-sharp fa-solid fa-bookmark',
            'heart' => 'fa-sharp fa-solid fa-heart',
            'loader-circle' => 'fa-sharp fa-solid fa-circle-notch',
            'refresh-cw' => 'fa-sharp fa-solid fa-rotate-right',
            'shuffle' => 'fa-sharp fa-solid fa-shuffle',
            'plus' => 'fa-sharp fa-solid fa-plus',
            'arrow-left' => 'fa-sharp fa-solid fa-arrow-left',
            'arrow-right' => 'fa-sharp fa-solid fa-arrow-right',
            'arrow-up' => 'fa-sharp fa-solid fa-arrow-up',
            'chevron-left' => 'fa-sharp fa-solid fa-chevron-left',
            'chevron-right' => 'fa-sharp fa-solid fa-chevron-right',
            'circle-arrow-up' => 'fa-sharp fa-solid fa-circle-up',
            'layers-3' => 'fa-sharp fa-solid fa-layer-group',
            'rss' => 'fa-sharp fa-solid fa-square-rss',
            'unlink' => 'fa-sharp fa-solid fa-link-slash',
            'link' => 'fa-sharp fa-solid fa-link',
            'external-link' => 'fa-sharp fa-solid fa-up-right-from-square',
            'database' => 'fa-sharp fa-solid fa-database',
            'cloud' => 'fa-sharp fa-solid fa-cloud',
            'globe' => 'fa-sharp fa-solid fa-globe',
            'mail' => 'fa-sharp fa-solid fa-envelope',
            'send' => 'fa-sharp fa-solid fa-paper-plane',
            'zap' => 'fa-sharp fa-solid fa-bolt',
            'mountain' => 'fa-sharp fa-solid fa-mountain',
            'gamepad-2' => 'fa-sharp fa-solid fa-gamepad',
            'crosshair' => 'fa-sharp fa-solid fa-crosshairs',
            'swords' => 'fa-sharp fa-solid fa-chess-knight',
            'notebook-pen' => 'fa-sharp fa-solid fa-blog',
            'badge-check' => 'fa-sharp fa-solid fa-badge-check',
            'badge-plus' => 'fa-sharp fa-solid fa-circle-star',
            'star' => 'fa-sharp fa-solid fa-star',
            'moon' => 'fa-sharp fa-solid fa-moon',
            'sun' => 'fa-sharp fa-solid fa-sun',
            'crown' => 'fa-sharp fa-solid fa-crown',
            'menu' => 'fa-sharp fa-solid fa-bars',
            'columns-2' => 'fa-sharp fa-solid fa-table-columns',
            'list' => 'fa-sharp fa-solid fa-list',
            'tram-front' => 'fa-sharp fa-solid fa-train',
            'train-front' => 'fa-sharp fa-solid fa-train',
            'compass' => 'fa-sharp fa-solid fa-compass',
            'monitor' => 'fa-sharp fa-solid fa-desktop',
            'house' => 'fa-sharp fa-solid fa-house',
            'ghost' => 'fa-sharp fa-solid fa-ghost',
            'inbox' => 'fa-sharp fa-solid fa-inbox',
            'chart-column' => 'fa-sharp fa-solid fa-chart-line',
            'archive' => 'fa-sharp fa-solid fa-archive',
            'hash' => 'fa-sharp fa-solid fa-hashtag',
            'wifi' => 'fa-sharp fa-solid fa-wifi',
            'download' => 'fa-sharp fa-solid fa-download',
            'git-branch' => 'fa-sharp fa-solid fa-code-branch',
            'weight' => 'fa-sharp fa-solid fa-weight-hanging',
            'blocks' => 'fa-brands fa-wordpress',
            'code-xml' => 'fa-brands fa-php',
            'twitter' => 'fa-brands fa-twitter',
            'github' => 'fa-brands fa-github',
            'youtube' => 'fa-brands fa-youtube',
            'instagram' => 'fa-brands fa-instagram',
            'tv' => 'fa-brands fa-bilibili',
            'dice-5' => 'fa-sharp fa-solid fa-dice',
            'palette' => 'fa-sharp fa-solid fa-palette',
            'brush-cleaning' => 'fa-sharp fa-solid fa-paint-brush',
            'smartphone' => 'fa-sharp fa-solid fa-mobile-screen',
            'book-open' => 'fa-sharp fa-solid fa-book',
            'history' => 'fa-sharp fa-solid fa-clock-rotate-left',
            'headset' => 'fa-sharp fa-solid fa-headset',
            'circle-help' => 'fa-sharp fa-solid fa-circle-question',
            'sofa' => 'fa-sharp fa-solid fa-couch',
        ];
        $is_spinning = strpos($name, 'fa-spin') !== false || strpos($classes, 'is-spin') !== false;
        $normalized_icon = $normalize_fa_classes($icon);
        $has_full_fa_style = preg_match('/\b(?:fa-solid|fa-regular|fa-brands|fa-light|fa-thin|fa-duotone|fa-sharp|fa-sharp-solid|fa-sharp-regular|fa-sharp-light|fa-sharp-thin|fa-sharp-duotone|fas|far|fab|fal|fat|fad|fass|fasr|fasl|fast|fasd)\b/i', $icon);
        if ($has_full_fa_style) {
            $base_classes = $normalized_icon;
        } else {
            if (strpos($name, 'fa-') !== false) {
                $name = westlife_fa_to_lucide_name($name);
            }
            $base_classes = $fa_map[$name] ?? 'fa-sharp fa-solid fa-circle';
        }
        $classes = trim('wl-icon ' . $base_classes . ' ' . $classes . ($is_spinning ? ' fa-spin is-spin' : ''));

        $extra_class = trim((string) ($attrs['class'] ?? ''));
        if ($extra_class !== '') {
            $attrs['class'] = trim($classes . ' ' . $extra_class);
        } else {
            $attrs['class'] = $classes;
        }

        $attrs = array_merge([
            'aria-hidden' => 'true',
        ], $attrs);

        $parts = [];
        foreach ($attrs as $key => $value) {
            if ($value === null || $value === false || $value === '') {
                continue;
            }
            $parts[] = sprintf('%s="%s"', esc_attr($key), esc_attr((string) $value));
        }

        return '<i ' . implode(' ', $parts) . '></i>';
    }
}

/* ------------------------------------------------------------
 * 公共工具函数：页面加载器模式统一获取
 * - 避免在多个位置重复计算 (spinner | bar)
 * - 只有首页且功能启用时才可能是 spinner，其他情况都是 bar
 * ------------------------------------------------------------ */
if (!function_exists('westlife_get_page_loader_mode')) {
    function westlife_get_page_loader_mode()
    {
        $enabled = (bool) get_option('westlife_enable_page_loader', false);

        // 修改逻辑：不在后端决定模式，返回空字符串让 JS 动态判断
        // JS 会根据 localStorage 判断首次访问并决定显示罗盘还是进度条
        if (!$enabled) {
            return 'bar'; // 功能关闭时明确返回 bar
        }

        // 功能开启时返回空字符串，让 JS 根据 localStorage 动态判断
        return '';
    }
}

/* ============================================================
 * 1) 加载核心模块（inc/*）
 * ============================================================ */

$westlife_includes = [
    'inc/inc-ajax.php',          // AJAX 接口
    'inc/inc-assets.php',        // 资源加载(多文件模式)
    'inc/inc-turnstile.php',     // Turnstile 验证码系统
    'inc/inc-heatmap.php',       // 热力图独立模块 (posts/memos 100 天)
    'inc/inc-prism.php',         // Prism 高亮(独立模块)
    'inc/inc-feeds.php',         // 友链动态
    'inc/inc-stats.php',         // 数据统计
    'inc/inc-comment.php',       // 评论功能
    'inc/inc-smtp.php',          // SMTP 邮件配置
    'inc/inc-theme-options.php', // 主题设置
    'inc/inc-image.php',         // 图片处理
    'inc/inc-nav.php',           // 分类导航
    'inc/inc-visitor.php',       // 访客相关
    'inc/inc-seo.php',           // SEO
    'inc/inc-shortcode.php',     // 短代码
    'inc/inc-memos.php',         // Memos 说说
    'inc/inc-link-checker.php',  // 友链检测
    'inc/inc-umami-stats.php',   // Umami 统计
    'inc/inc-home-tasks.php',    // 首页任务进度后台+REST
    'inc/inc-category-thumbnail.php', // 分类封面图
];

foreach ($westlife_includes as $file) {
    $path = get_template_directory() . '/' . $file;
    if (file_exists($path)) {
        require_once $path;
    }
}

/* ============================================================
 * 2) 主题基础设置
 * ============================================================ */

/**
 * 注册主题支持
 */
function westlife_setup()
{
    add_theme_support('title-tag');
    add_theme_support('post-thumbnails');
    add_theme_support('html5', ['search-form', 'comment-form', 'comment-list', 'gallery', 'caption', 'style', 'script']);

    // 内容最大宽度
    global $content_width;
    if (!isset($content_width)) {
        $content_width = 1200;
    }
}
add_action('after_setup_theme', 'westlife_setup');

add_filter('body_class', function ($classes) {
    $shape = get_option('westlife_ui_shape', 'sharp');
    $shape = function_exists('westlife_sanitize_ui_shape') ? westlife_sanitize_ui_shape($shape) : 'sharp';
    $classes[] = 'westlife-shape-' . $shape;
    return $classes;
});

/**
 * 页面模板解析到 /template-pages/ 目录
 */
add_filter('page_template', function ($template) {
    $slug = basename(get_page_template_slug());
    if ($slug) {
        $path = get_template_directory() . '/template-pages/' . $slug;
        return file_exists($path) ? $path : $template;
    }
    return $template;
});

/* ============================================================
 * 3) 内容与输出
 * ============================================================ */

/**
 * 摘要长度与更多
 */
add_filter('excerpt_length', function ($length) {
    return 100;
}, 999);
add_filter('excerpt_more',   function ($more) {
    return '...';
});

/**
 * 文章底部分类/标签/评论/编辑链接
 */
function westlife_entry_footer()
{
    if ('post' === get_post_type()) {
        $cats = get_the_category_list(', ');
        if ($cats) {
            printf('<span class="cat-links">%s %s</span>', westlife_lucide_icon('fa-folder'), $cats);
        }
        $tags = get_the_tag_list('', ', ');
        if ($tags) {
            printf('<span class="tags-links">%s %s</span>', westlife_lucide_icon('fa-tags'), $tags);
        }
    }

    if (!is_single() && comments_open()) {
        echo '<span class="comments-link">' . westlife_lucide_icon('fa-comment') . ' ';
        comments_popup_link(esc_html__('发表评论', 'westlife'));
        echo '</span>';
    }

    edit_post_link(
        esc_html__('编辑', 'westlife'),
        '<span class="edit-link">' . westlife_lucide_icon('fa-edit') . ' ',
        '</span>'
    );
}

/**
 * 获取随机文章链接（无则返回首页）
 */
function wp_random_post_link()
{
    $posts = get_posts(['posts_per_page' => 1, 'orderby' => 'rand', 'post_type' => 'post', 'post_status' => 'publish']);
    return !empty($posts) ? get_permalink($posts[0]->ID) : home_url();
}

/* ============================================================
 * 4) 性能与优化（轻量）
 * ============================================================ */

/**
 * 资源提示：DNS 预解析 / 预连接
 */
function westlife_add_resource_hints($urls, $rel)
{
    if ($rel === 'dns-prefetch' || $rel === 'preconnect') {
        $hints = [
            'https://static.xifengcdn.com',
            'https://static.bluecdn.com',
            'https://img.xifengcdn.com',
            'https://api.xifengcdn.com',
            'https://fonts.bluecdn.com',
            'https://gstatic.bluecdn.com',
            'https://gravatar.bluecdn.com',
        ];
        $urls = array_merge($urls, $hints);
    }
    return $urls;
}
add_filter('wp_resource_hints', 'westlife_add_resource_hints', 10, 2);

/**
 * 非调试模式移除 jQuery Migrate
 */
function westlife_remove_jquery_migrate()
{
    // 改为无条件移除（即使 WP_DEBUG 为 true 也不输出 migrate 日志）
    add_filter('wp_default_scripts', function ($scripts) {
        if (!empty($scripts->registered['jquery'])) {
            $scripts->registered['jquery']->deps = array_diff($scripts->registered['jquery']->deps, ['jquery-migrate']);
        }
    });
}
add_action('init', 'westlife_remove_jquery_migrate');

// 若第三方插件仍然手动加载 jquery-migrate，则在前端静默其日志（兜底）
add_action('wp_head', function () {
    echo "<script>(function(){try{if(window.jQuery){window.jQuery.migrateMute=true;}var c=window.console;if(c&&c.log){var origLog=c.log;c.log=function(){if(arguments&&arguments[0]&&String(arguments[0]).indexOf('JQMIGRATE:')===0){return;}return origLog.apply(c,arguments);};}}catch(e){}})();</script>";
}, 1);

/**
 * 清理默认头部输出
 */
function westlife_cleanup_wp_head()
{
    // emoji
    remove_action('wp_head', 'print_emoji_detection_script', 7);
    remove_action('admin_print_scripts', 'print_emoji_detection_script');
    remove_action('wp_print_styles', 'print_emoji_styles');
    remove_action('admin_print_styles', 'print_emoji_styles');
    // 版本/链接
    remove_action('wp_head', 'wp_generator');
    remove_action('wp_head', 'wlwmanifest_link');
    remove_action('wp_head', 'rsd_link');
    remove_action('wp_head', 'wp_shortlink_wp_head');
    // 可选禁用 XML-RPC
    if (!get_option('westlife_enable_xmlrpc')) {
        add_filter('xmlrpc_enabled', '__return_false');
    }
    // 可选移除 REST 链接
    if (!get_option('westlife_enable_rest_api_link')) {
        remove_action('wp_head', 'rest_output_link_wp_head');
        remove_action('wp_head', 'wp_oembed_add_discovery_links');
    }
}
add_action('init', 'westlife_cleanup_wp_head');

/**
 * <html> 标记添加页面加载器模式（bar/spinner）
 */
function westlife_add_page_loader_attr($output)
{
    $mode = westlife_get_page_loader_mode();
    if (strpos($output, 'data-page-loader=') !== false) {
        $output = preg_replace('/\sdata-page-loader="[^"]*"/', ' data-page-loader="' . esc_attr($mode) . '"', $output);
    } else {
        $output = trim($output) . ' data-page-loader="' . esc_attr($mode) . '"';
    }

    // 可选：强制开启动画（忽略 prefers-reduced-motion）。
    // 用途：站点演示/自测；若要开启，在 wp-config.php 中加入：define('WESTLIFE_FORCE_MOTION', true);
    if (defined('WESTLIFE_FORCE_MOTION') && constant('WESTLIFE_FORCE_MOTION')) {
        if (strpos($output, 'data-force-motion=') === false) {
            $output .= ' data-force-motion="true"';
        }
    }
    return $output;
}
add_filter('language_attributes', 'westlife_add_page_loader_attr', 10, 1);

/**
 * 头像域名与懒加载优化
 */
function westlife_optimize_avatar($avatar)
{
    if (!defined('WESTLIFE_GRAVATAR_CDN')) {
        define('WESTLIFE_GRAVATAR_CDN', 'gravatar.bluecdn.com');
    }
    if (!defined('WESTLIFE_GRAVATAR_HOSTS')) {
        define('WESTLIFE_GRAVATAR_HOSTS', serialize(['www.gravatar.com', 'secure.gravatar.com', '0.gravatar.com', '1.gravatar.com', '2.gravatar.com']));
    }
    $hosts = unserialize(WESTLIFE_GRAVATAR_HOSTS);
    $avatar = str_replace($hosts, WESTLIFE_GRAVATAR_CDN, $avatar);
    if (strpos($avatar, 'loading=') === false) {
        // Avatar 体积小且位于首屏概率高；部分环境下原生 lazy 可能导致头像长期不触发加载。
        // 统一改为 eager，避免出现“Windows 不显示但 Mac 正常”的差异。
        $avatar = str_replace('<img ', '<img loading="eager" decoding="async" ', $avatar);
    }
    // 注入淡入动画类（避免重复添加）
    if (strpos($avatar, 'avatar-fade') === false) {
        // 若已有 class 属性，插入；否则新增
        if (preg_match('/<img[^>]*class=["\"]([^"\"]*)["\"]/i', $avatar)) {
            $avatar = preg_replace('/class=["\"]([^"\"]*)["\"]/', 'class="$1 avatar-fade"', $avatar, 1);
        } else {
            $avatar = str_replace('<img ', '<img class="avatar-fade" ', $avatar);
        }
    }
    return $avatar;
}
add_filter('get_avatar', 'westlife_optimize_avatar');

function westlife_get_avatar_cache_dir()
{
    $upload = wp_get_upload_dir();
    if (empty($upload['basedir']) || empty($upload['baseurl'])) {
        return null;
    }

    $dir = trailingslashit($upload['basedir']) . 'westlife-cache/avatars/';
    $url = trailingslashit($upload['baseurl']) . 'westlife-cache/avatars/';

    if (!wp_mkdir_p($dir)) {
        return null;
    }

    return [
        'dir' => $dir,
        'url' => $url,
    ];
}

function westlife_get_avatar_proxy_url($remote_url)
{
    if (!is_string($remote_url) || $remote_url === '') {
        return $remote_url;
    }

    return add_query_arg([
        'action' => 'westlife_avatar_proxy',
        'src'    => rawurlencode(base64_encode($remote_url)),
    ], admin_url('admin-ajax.php'));
}

function westlife_optimize_avatar_url($url)
{
    if (defined('WESTLIFE_GRAVATAR_HOSTS') && defined('WESTLIFE_GRAVATAR_CDN')) {
        $url = str_replace(unserialize(WESTLIFE_GRAVATAR_HOSTS), WESTLIFE_GRAVATAR_CDN, $url);
    }

    if (
        !is_admin()
        && !(defined('DOING_AJAX') && DOING_AJAX && !empty($_REQUEST['action']) && $_REQUEST['action'] === 'westlife_avatar_proxy')
        && is_string($url)
        && preg_match('~^https?://~i', $url)
    ) {
        return westlife_get_avatar_proxy_url($url);
    }

    return $url;
}
add_filter('get_avatar_url', 'westlife_optimize_avatar_url');

function westlife_avatar_proxy()
{
    $encoded = isset($_GET['src']) ? sanitize_text_field(wp_unslash($_GET['src'])) : '';
    $remote_url = $encoded !== '' ? base64_decode(rawurldecode($encoded), true) : '';
    if (!$remote_url || !filter_var($remote_url, FILTER_VALIDATE_URL)) {
        status_header(404);
        exit;
    }

    $cache = westlife_get_avatar_cache_dir();
    $cache_file = null;
    if ($cache) {
        $path = parse_url($remote_url, PHP_URL_PATH);
        $ext = strtolower(pathinfo((string) $path, PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg', 'jpeg', 'png', 'gif', 'webp', 'avif'], true)) {
            $ext = 'jpg';
        }
        $cache_file = $cache['dir'] . md5($remote_url) . '.' . $ext;
    }

    $cache_ttl = 30 * DAY_IN_SECONDS;
    $has_fresh_cache = $cache_file && file_exists($cache_file) && (time() - filemtime($cache_file) < $cache_ttl);

    if ($has_fresh_cache) {
        westlife_stream_avatar_cache_file($cache_file);
    }

    $response = wp_remote_get($remote_url, [
        'timeout'     => 6,
        'redirection' => 3,
        'sslverify'   => false,
        'user-agent'  => 'Westlife Avatar Cache/' . WESTLIFE_VERSION,
    ]);

    if (!is_wp_error($response)) {
        $code = (int) wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $type = (string) wp_remote_retrieve_header($response, 'content-type');
        if ($code >= 200 && $code < 300 && $body !== '') {
            if ($cache_file) {
                @file_put_contents($cache_file, $body);
            }
            westlife_stream_avatar_binary($body, $type);
        }
    }

    if ($cache_file && file_exists($cache_file)) {
        westlife_stream_avatar_cache_file($cache_file);
    }

    wp_redirect($remote_url, 302);
    exit;
}
add_action('wp_ajax_westlife_avatar_proxy', 'westlife_avatar_proxy');
add_action('wp_ajax_nopriv_westlife_avatar_proxy', 'westlife_avatar_proxy');

function westlife_stream_avatar_cache_file($file)
{
    $mime = function_exists('mime_content_type') ? mime_content_type($file) : 'image/jpeg';
    if (!$mime) {
        $mime = 'image/jpeg';
    }
    header('Content-Type: ' . $mime);
    header('Cache-Control: public, max-age=' . (30 * DAY_IN_SECONDS));
    header('Content-Length: ' . filesize($file));
    readfile($file);
    exit;
}

function westlife_stream_avatar_binary($body, $content_type = '')
{
    $mime = is_string($content_type) && $content_type !== '' ? $content_type : 'image/jpeg';
    header('Content-Type: ' . $mime);
    header('Cache-Control: public, max-age=' . (30 * DAY_IN_SECONDS));
    echo $body;
    exit;
}

/* ============================================================
 * 5) 评论与媒体
 * ============================================================ */

/**
 * 评论表单：保持核心输出，主题在 comments.php / inc-comment.php 中按需覆盖结构
 */
function westlife_comment_form_defaults($defaults)
{
    $defaults['comment_notes_before'] = '';
    $defaults['comment_notes_after'] = '';
    return $defaults;
}
add_filter('comment_form_defaults', 'westlife_comment_form_defaults');

/**
 * 统一缩略图 <img>：移除 crossorigin、补充 lazy/decoding
 */
function westlife_filter_post_thumbnail_html($html)
{
    if (empty($html)) return $html;
    $html = str_replace(' crossorigin="anonymous"', '', $html);
    if (strpos($html, 'loading=') === false) {
        $html = preg_replace('/<img(?![^>]*\bloading=)/i', '<img loading="lazy" decoding="async"', $html, 1);
    }
    return $html;
}
add_filter('post_thumbnail_html', 'westlife_filter_post_thumbnail_html', 10, 1);

/* ============================================================
 * 首页/列表缩略图 eager 数量扩展
 * 将默认前 4 张扩大为 6，利于首屏视觉稳定（Plan C 实施）
 * ============================================================ */
add_filter('westlife_eager_thumbnail_count', function ($count, $context) {
    if ($context === 'list') {
        return 6; // 提升到前 6 条列表图片 eager (loading=eager / fetchpriority 调整在渲染函数内处理首张高优先级)
    }
    return $count;
}, 10, 2);

/* ============================================================
 * 正文图片懒加载 + Loader + 失败占位
 * 使用 lazysizes：将 <img src=> 转换为 data-src，并添加 class="lazyload"
 * 结构：<span class="wl-img-outer"><span class="wl-img-loader" aria-hidden="true"></span><img ...></span>
 * 事件：lazyloaded -> 父容器加 .is-loaded 隐藏 loader；error -> 替换为占位图并加 .is-error
 * 首张图片可选 eager（可通过过滤器定制）
 */
function westlife_enhance_content_images($content)
{
    if (!is_singular('post')) return $content; // 只在文章页
    if (stripos($content, '<img') === false) return $content;
    if (!function_exists('westlife_get_image_placeholder_url')) {
        function westlife_get_image_placeholder_url()
        {
            // 简单兜底：透明 1x1 GIF；可后续替换为主题内置图像
            return 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
        }
    }
    $placeholder = esc_url(westlife_get_image_placeholder_url());
    $index = 0;
    $content = preg_replace_callback('/<img\b[^>]*>/i', function ($m) use (&$index, $placeholder) {
        $img = $m[0];

        // 已经是 lazyload 或含 data-src 的跳过（但仍可能需要包装）
        $has_lazy = preg_match('/class=["\"][^"\"]*lazyload/i', $img);
        $has_data_src = preg_match('/data-src=/i', $img);

        // 提取 src
        if (!preg_match('/src=["\"]([^"\"]+)["\"]/i', $img, $sm)) {
            return $img; // 没有 src 不处理
        }
        $src_real = $sm[1];

        // 若不是图片协议或是 data:image 直接跳过
        if (stripos($src_real, 'data:image') === 0) {
            return $img; // 已是内嵌
        }

        $is_first = ($index === 0);
        $index++;

        // 构建新 img：
        // 1) 把真实 src 移到 data-src
        // 2) src 替换为占位符（可用 1x1 gif 或主题 placeholder）
        // 3) 添加 lazyload 类
        // 4) 首图可 eager（loading="eager" fetchpriority="high"）

        // 移除原 srcset / sizes 以重新建立 data- 形式
        $srcset_attr = '';
        if (preg_match('/srcset=["\"]([^"\"]+)["\"]/i', $img, $ssm)) {
            $srcset_attr = $ssm[1];
            $img = preg_replace('/\s+srcset=["\"][^"\"]/i', '', $img);
        }
        $sizes_attr = '';
        if (preg_match('/sizes=["\"]([^"\"]+)["\"]/i', $img, $szm)) {
            $sizes_attr = $szm[1];
            $img = preg_replace('/\s+sizes=["\"][^"\"]/i', '', $img);
        }

        // 替换真实 src 为占位（修正正则，确保匹配整个属性）
        $img = preg_replace('/\ssrc=["\"][^"\"]+["\"]/i', ' src="' . $placeholder . '"', $img, 1);
        if (!$has_data_src) {
            $img = preg_replace('/<img/i', '<img data-src="' . esc_attr($src_real) . '"', $img, 1);
        }
        if ($srcset_attr) {
            $img = preg_replace('/<img/i', '<img data-srcset="' . esc_attr($srcset_attr) . '"', $img, 1);
        }
        if ($sizes_attr) {
            $img = preg_replace('/<img/i', '<img data-sizes="' . esc_attr($sizes_attr) . '"', $img, 1);
        }

        // class 注入 lazyload / wl-content-img
        if (preg_match('/class=["\"]/i', $img)) {
            $img = preg_replace('/class=["\"]([^"\"]*)["\"]/', 'class="$1 lazyload wl-content-img"', $img, 1);
        } else {
            $img = preg_replace('/<img/i', '<img class="lazyload wl-content-img"', $img, 1);
        }

        // loading / decoding / fetchpriority（首张可 eager）
        if ($is_first) {
            if (!preg_match('/loading=/i', $img)) {
                $img = preg_replace('/<img/i', '<img loading="eager" decoding="sync" fetchpriority="high"', $img, 1);
            }
        } else {
            if (!preg_match('/loading=/i', $img)) {
                $img = preg_replace('/<img/i', '<img loading="lazy" decoding="async"', $img, 1);
            }
        }

        // 检查用户是否启用了图片预览
        $enable_fancybox = get_option('westlife_enable_fancybox', true);

        // 如果未启用图片预览，则不添加预览包装
        if (!$enable_fancybox) {
            $wrapped = '<span class="wl-img-outer" data-wl-img>' .
                '<span class="wl-img-loader" aria-hidden="true"></span>' .
                $img .
                '</span>';
            return $wrapped;
        }

        // 图片预览：判断是否已带预览标记，避免重复包装
        $has_fancybox_attr = (stripos($img, 'data-fancybox=') !== false || stripos($img, 'view-image') !== false);
        if (preg_match('/class=["\'][^"\']*fancybox/i', $img) || preg_match('/class=["\'][^"\']*view-image/i', $img)) {
            $has_fancybox_attr = true;
        }

        // 包装 <span> + loader
        $inner = $img;
        if (!$has_fancybox_attr) {
            $href = $src_real;
            if (!empty($srcset_attr)) {
                $parts = array_map('trim', explode(',', $srcset_attr));
                if (!empty($parts)) {
                    $last = trim(end($parts));
                    if (preg_match('/^(https?:[^\s]+)\s+\d+w$/', $last, $lm)) {
                        $href = $lm[1];
                    }
                }
            }
            $inner = '<a href="' . esc_url($href) . '">' . $img . '</a>';
        }

        $wrapped = '<span class="wl-img-outer" data-wl-img view-image>' .
            '<span class="wl-img-loader" aria-hidden="true"></span>' .
            $inner .
            '</span>';
        return $wrapped;
    }, $content);

    return $content;
}
add_filter('the_content', 'westlife_enhance_content_images', 15);

/* ============================================================
 * 6) 正文外链处理（favicon + 包装）
 * ============================================================ */

/**
 * 处理文章内容中的链接：外链添加 favicon、统一包装 span
 */
function westlife_process_post_links($content)
{
    if (empty($content)) return $content;
    if (!class_exists('DOMDocument')) return $content;

    $dom = new DOMDocument();
    libxml_use_internal_errors(true);

    $wrapped = '<!DOCTYPE html><html><head><meta charset="UTF-8"></head><body>' . $content . '</body></html>';
    if (!$dom->loadHTML($wrapped, LIBXML_HTML_NOIMPLIED | LIBXML_HTML_NODEFDTD)) {
        libxml_clear_errors();
        return $content;
    }

    $links = $dom->getElementsByTagName('a');
    if (!$links || $links->length === 0) {
        return $content;
    }

    foreach ($links as $link) {
        if (!($link instanceof DOMElement)) continue;

        $href = $link->getAttribute('href');
        if (westlife_is_special_link($href, $link)) continue;

        if (westlife_is_external_link($href)) {
            westlife_add_link_favicon($link, $href);
        }
        westlife_wrap_link_text($dom, $link);
    }

    libxml_clear_errors();
    return westlife_get_clean_html($dom);
}

/** 判断是否为特殊资源链接，跳过处理 */
function westlife_is_special_link($href, $link)
{
    if (!$href || !$link) return true;
    return preg_match('/(\.jpg|\.jpeg|\.png|\.gif|\.webp|\.mp4|\.webm)$/i', $href)
        || strpos($link->getAttribute('class'), 'download-btn') !== false
        || strpos($link->getAttribute('class'), 'github-btn') !== false;
}

/** 判断是否为外部链接 */
function westlife_is_external_link($href)
{
    if (empty($href) || (stripos($href, 'http') !== 0 && stripos($href, '//') !== 0)) return false;
    $site = parse_url(home_url(), PHP_URL_HOST);
    $host = parse_url($href, PHP_URL_HOST);
    if (!$host || !$site) return false;
    return strcasecmp($host, $site) !== 0;
}

/** 为外链添加 favicon 信息 */
function westlife_add_link_favicon($link, $href)
{
    if (!$link || !$href) return;
    $domain = parse_url($href, PHP_URL_HOST);
    if (!$domain) return;

    $classes = trim($link->getAttribute('class') . ' external-link');
    $link->setAttribute('class', $classes);
    $link->setAttribute('target', '_blank');
    $link->setAttribute('rel', 'noopener noreferrer');

    $favicon = westlife_get_favicon_url($domain);
    $link->setAttribute('data-favicon-pancdn', $favicon);

    $current = apply_filters('westlife_default_favicon_source', $favicon);
    $link->setAttribute('style', "--favicon-url: url('" . esc_attr($current) . "')");
}

/** 生成 favicon URL */
function westlife_get_favicon_url($url)
{
    if (empty($url)) return null;
    $domain = parse_url($url, PHP_URL_HOST);
    if (!$domain) $domain = $url;
    $domain = strtolower(trim((string) $domain));
    $domain = preg_replace('#^https?://#i', '', $domain);
    $domain = trim($domain, "/ \t\n\r\0\x0B");
    return $domain ? ('https://ico.yite.net/' . rawurlencode($domain)) : null;
}

/** 用 span 包装链接文本 */
function westlife_wrap_link_text($dom, $link)
{
    if (!$dom || !$link) return;
    $span = $dom->createElement('span');
    while ($link->firstChild) {
        $span->appendChild($link->firstChild);
    }
    $link->appendChild($span);
}

/** 输出清理后的 HTML */
function westlife_get_clean_html($dom)
{
    if (!$dom || !$dom->documentElement) return '';
    $html = $dom->saveHTML($dom->documentElement);
    if (!$html) return '';
    return preg_replace(
        [
            '/^<!DOCTYPE.*?>\s*/',
            '/<html><head><meta charset="UTF-8"><\/head><body>/',
            '/<\/body><\/html>$/'
        ],
        '',
        $html
    );
}
add_filter('the_content', 'westlife_process_post_links', 20);

/* ============================================================
 * 7) 文章表情/点赞（Post Meta）
 * ============================================================ */

function westlife_reaction_types()
{
    return ['like', 'clap', 'party'];
}

function westlife_get_reaction_counts($post_id)
{
    $counts = get_post_meta($post_id, 'westlife_reactions', true);
    if (!is_array($counts)) $counts = [];
    $defaults = array_fill_keys(westlife_reaction_types(), 0);
    $counts = array_intersect_key($counts + $defaults, $defaults);
    foreach ($counts as $k => $v) {
        $counts[$k] = max(0, (int)$v);
    }
    return $counts;
}

function westlife_update_reaction_count($post_id, $type, $op = 'add')
{
    $allowed = westlife_reaction_types();
    if (!in_array($type, $allowed, true)) {
        return westlife_get_reaction_counts($post_id);
    }
    $counts = westlife_get_reaction_counts($post_id);
    $counts[$type] = ($op === 'remove') ? max(0, (int)$counts[$type] - 1) : (int)$counts[$type] + 1;
    update_post_meta($post_id, 'westlife_reactions', $counts);
    return $counts;
}

/* ============================================================
 * 8) 管理员在线状态（轻量）
 * ============================================================ */

function westlife_mark_admin_online()
{
    if (is_user_logged_in() && current_user_can('manage_options')) {
        set_transient('westlife_admin_last_seen', westlife_current_timestamp(), 15 * MINUTE_IN_SECONDS);
    }
}
add_action('init', 'westlife_mark_admin_online', 1);

function westlife_is_admin_online($ttl = 300)
{
    $ts = (int) get_transient('westlife_admin_last_seen');
    return $ts && (westlife_current_timestamp() - $ts) < $ttl;
}

/**
 * 在友链页面模板注入 isAdmin（示例：模板依赖）
 */
// 友链页面 isAdmin 注入：迁移至 inc/inc-assets.php 通过 inline script（保持统一方式）

/* ============================================================
 * 9) 统计缓存清理与图片 CDN
 * ============================================================ */

/**
 * 内容变更后清理统计瞬态
 */
function westlife_clean_stats_cache($post_id)
{
    foreach (westlife_stats_cache_keys() as $key) {
        wp_cache_delete($key, 'westlife_stats');
    }
}
add_action('save_post', 'westlife_clean_stats_cache');
add_action('wp_insert_comment', 'westlife_clean_stats_cache');

/* 统计缓存键集合（集中维护） */
if (!function_exists('westlife_stats_cache_keys')) {
    function westlife_stats_cache_keys()
    {
        return [
            'total_words_raw',
            'total_views',
            'activity_heatmap_' . date('Y-m-d')
        ];
    }
}

/**
 * 动态替换上传目录为图片 CDN（可在后台选项启用）
 */
add_filter('upload_dir', function ($uploads) {
    $enable = get_option('westlife_enable_image_cdn', false);
    if (!$enable) return $uploads;

    $cdn = rtrim((string) get_option('westlife_image_cdn_url', ''), '/');
    if (empty($cdn)) return $uploads;
    if (!filter_var($cdn, FILTER_VALIDATE_URL) || strpos($cdn, 'https://') !== 0) return $uploads;

    $uploads['baseurl'] = $cdn;
    return $uploads;
});

if (!function_exists('westlife_ensure_cache_directories')) {
    function westlife_ensure_cache_directories()
    {
        $uploads = wp_upload_dir();
        $base_dir = trailingslashit($uploads['basedir']) . 'westlife-cache/';
        $dirs = [
            $base_dir,
            $base_dir . 'feeds/',
            $base_dir . 'feeds/sources/',
            $base_dir . 'visitor/',
        ];

        foreach ($dirs as $dir) {
            if (!is_dir($dir)) {
                wp_mkdir_p($dir);
            }
            if (is_dir($dir) && function_exists('chmod')) {
                @chmod($dir, 0755);
            }
        }

        $visitor_file = $base_dir . 'visitor/visitor.json';
        if (!file_exists($visitor_file)) {
            @file_put_contents($visitor_file, "[]\n");
        }
        if (file_exists($visitor_file) && function_exists('chmod')) {
            @chmod($visitor_file, 0644);
        }
    }
}

add_action('after_setup_theme', 'westlife_ensure_cache_directories', 20);
add_action('after_switch_theme', 'westlife_ensure_cache_directories');

/* ============================================================
 * 10) 主题切换清理
 * ============================================================ */

add_action('switch_theme', function () {
    // 定时任务
    wp_clear_scheduled_hook('westlife_check_links_cron');

    // 选项
    $options = [
        'westlife_link_checker_cache',
        'westlife_link_checker_last_check',
        'westlife_link_checker_settings',
        'westlife_link_checker_results'
    ];
    foreach ($options as $opt) delete_option($opt);

    // 瞬态
    $trans = [
        'westlife_link_checker_status',
        'westlife_admin_last_seen'
    ];
    foreach ($trans as $t) delete_transient($t);
});
