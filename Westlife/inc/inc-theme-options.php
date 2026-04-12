<?php

/**
 * 后台设置加载器（精简版）
 * @package Westlife
 */

if (!defined('ABSPATH')) exit;

$admin_base = get_template_directory() . '/inc/admin';
$westlife_admin_files = [
    'admin-settings.php',
    'page-theme-settings.php',
    'page-memos.php',
    'page-about.php',
    'page-feeds-cache.php',
    'page-mail.php',
];

foreach ($westlife_admin_files as $admin_file) {
    $admin_path = $admin_base . '/' . $admin_file;
    if (file_exists($admin_path)) {
        require_once $admin_path;
    }
}

function westlife_should_load_admin_assets($hook)
{
    if ($hook === 'toplevel_page_westlife-settings') return true;
    if (strpos((string) $hook, 'westlife-settings_page_') === 0) return true;
    if (strpos((string) $hook, 'westlife_page_') === 0) return true;

    $page = isset($_GET['page']) ? sanitize_key($_GET['page']) : '';
    if ($page === 'westlife-settings' || strpos($page, 'westlife-') === 0) return true;

    if (function_exists('get_current_screen')) {
        $screen = get_current_screen();
        if ($screen && strpos((string) $screen->id, 'westlife') !== false) return true;
    }

    return false;
}

function westlife_load_theme_settings_assets($hook)
{
    if (!westlife_should_load_admin_assets($hook)) return;

    wp_enqueue_media();

    $ver = defined('WESTLIFE_VERSION') ? WESTLIFE_VERSION : (wp_get_theme()->get('Version') ?: null);
    $theme_dir = get_template_directory();
    $theme_uri = get_template_directory_uri();

    $js_uri = file_exists($theme_dir . '/assets/js/admin-theme-settings.js')
        ? $theme_uri . '/assets/js/admin-theme-settings.js'
        : $theme_uri . '/inc/admin/assets/admin-theme-settings.js';

    $deps = ['jquery', 'wp-util'];
    if (file_exists($theme_dir . '/assets/js/utils.js')) {
        wp_register_script('westlife-utils', $theme_uri . '/assets/js/utils.js', ['jquery'], $ver, true);
        $deps[] = 'westlife-utils';
    }

    wp_enqueue_script('westlife-admin', $js_uri, $deps, $ver, true);
    wp_localize_script('westlife-admin', 'westlifeAdmin', [
        'ajaxurl' => admin_url('admin-ajax.php'),
        'nonce'   => wp_create_nonce('westlife_ajax_nonce'),
        'actions' => [],
        'i18n'    => [
            'loading' => __('加载中...', 'westlife'),
            'error'   => __('出错了', 'westlife'),
            'success' => __('连接成功！', 'westlife'),
            'cdnPrompt'  => __('请输入图片 CDN 域名或前缀', 'westlife'),
            'cdnInvalid' => __('无效的 CDN 地址，请以 http:// 或 https:// 开头', 'westlife'),
            'cdnSaved'   => __('已更新 CDN 地址', 'westlife'),
        ],
        'cdn' => [
            'enabled' => (bool) get_option('westlife_image_cdn_enabled', false),
            'base'    => rtrim((string) get_option('westlife_image_cdn_base', ''), '/'),
        ],
        'uploads' => [
            'baseurl' => rtrim((wp_upload_dir()['baseurl'] ?? ''), '/'),
            'siteurl' => rtrim(get_site_url(), '/'),
        ],
        'themeUri' => $theme_uri,
    ]);

    wp_enqueue_style('westlife-admin-settings', $theme_uri . '/inc/admin/assets/admin-theme-settings.css', [], $ver);
    wp_enqueue_style('westlife-admin-modal', $theme_uri . '/inc/admin/assets/admin-modal.css', [], $ver);
    wp_enqueue_script('westlife-admin-modal', $theme_uri . '/inc/admin/assets/admin-modal.js', ['jquery'], $ver, true);

    if (file_exists(get_template_directory() . '/inc/admin/assets/admin-feeds-progress.css')) {
        wp_enqueue_style('westlife-feeds-progress', $theme_uri . '/inc/admin/assets/admin-feeds-progress.css', [], $ver);
    }
}
add_action('admin_enqueue_scripts', 'westlife_load_theme_settings_assets');

function westlife_register_theme_settings_menu()
{
    add_menu_page(
        'WESTLIFE',
        '<strong>WESTLIFE</strong>',
        'manage_options',
        'westlife-settings',
        'westlife_theme_settings_page',
        'dashicons-palmtree',
        60
    );

    add_submenu_page('westlife-settings', __('基础设置', 'westlife'), __('基础设置', 'westlife'), 'manage_options', 'westlife-settings', 'westlife_theme_settings_page');
}
add_action('admin_menu', 'westlife_register_theme_settings_menu', 10);

function westlife_redirect_legacy_admin_pages()
{
    if (!is_admin() || !current_user_can('manage_options')) {
        return;
    }

    $page = isset($_GET['page']) ? sanitize_key($_GET['page']) : '';
    $legacy_map = [
        'westlife-feeds-cache' => ['tab' => 'feeds'],
        'westlife-mail' => ['tab' => 'mail'],
        'westlife-memos' => ['tab' => 'memos'],
        'westlife-about' => [
            'tab' => 'about',
            'subtab' => isset($_GET['subtab']) ? sanitize_key($_GET['subtab']) : 'about',
        ],
    ];

    if (!isset($legacy_map[$page])) {
        return;
    }

    wp_safe_redirect(add_query_arg(array_merge(['page' => 'westlife-settings'], $legacy_map[$page]), admin_url('admin.php')));
    exit;
}
add_action('admin_init', 'westlife_redirect_legacy_admin_pages');

// 首页任务进度配置迁移至独立管理页（inc-home-tasks.php）

if (!function_exists('westlife_get_home_tasks')) {
    function westlife_get_home_tasks()
    {
        $raw = get_option('westlife_home_tasks_raw', '');
        if (!$raw) return [];
        $items = [];
        $trimmed = trim($raw);
        if ($trimmed === '') return [];
        // Try JSON first
        if (preg_match('/^\s*\[/', $trimmed)) {
            $json = json_decode($trimmed, true);
            if (is_array($json)) {
                foreach ($json as $row) {
                    if (!is_array($row)) continue;
                    $title = isset($row['title']) ? wp_strip_all_tags($row['title']) : '';
                    $pct = isset($row['percent']) ? intval($row['percent']) : 0;
                    if ($title === '') continue;
                    if ($pct < 0) $pct = 0;
                    if ($pct > 100) $pct = 100;
                    $items[] = ['title' => $title, 'percent' => $pct];
                }
                return $items;
            }
        }
        // Line format fallback
        $lines = preg_split('/\r?\n/', $trimmed);
        foreach ($lines as $ln) {
            $ln = trim($ln);
            if ($ln === '') continue;
            if (strpos($ln, '|') !== false) {
                list($title, $pct) = array_map('trim', explode('|', $ln, 2));
            } else {
                $title = $ln;
                $pct = '0';
            }
            $title = wp_strip_all_tags($title);
            if ($title === '') continue;
            $pct = intval(preg_replace('/[^0-9]/', '', $pct));
            if ($pct < 0) $pct = 0;
            if ($pct > 100) $pct = 100;
            $items[] = ['title' => $title, 'percent' => $pct];
        }
        return $items;
    }
}

/* ============================================================
 * SEO 基础设置字段注册（首页描述 / 关键词 / Twitter / 开关）
 * ============================================================ */
add_action('admin_init', function () {
    // 分组与区块依赖：假设主题已有 theme_options / theme_options_section
    // 若后台结构不同，可适配成独立页面。

    // 启用开关（允许用户关闭主题内置 SEO，交由插件处理）
    add_settings_field(
        'westlife_enable_builtin_seo',
        '启用内置 SEO Meta',
        function () {
            $val = (bool) get_option('westlife_enable_builtin_seo', true);
            echo '<label><input type="checkbox" name="westlife_enable_builtin_seo" value="1" ' . checked(true, $val, false) . ' /> 输出 meta/OG/Twitter 标签（关闭后可用 SEO 插件接管）</label>';
        },
        'theme_options',
        'theme_options_section'
    );
    register_setting('theme_options_group', 'westlife_enable_builtin_seo');

    // 首页描述
    add_settings_field(
        'home_description',
        '首页 Description',
        function () {
            $v = esc_textarea(get_option('home_description', ''));
            echo '<textarea name="home_description" rows="3" style="width:100%;max-width:600px;" placeholder="用于 <meta name=description>，建议 80~160 字">' . $v . '</textarea>';
        },
        'theme_options',
        'theme_options_section'
    );
    register_setting('theme_options_group', 'home_description');

    // 首页关键词（逗号分隔）
    add_settings_field(
        'home_keywords',
        '首页 Keywords',
        function () {
            $v = esc_attr(get_option('home_keywords', ''));
            echo '<input type="text" name="home_keywords" value="' . $v . '" class="regular-text" placeholder="示例：博客,技术,生活" />';
            echo '<p class="description">可选。现代搜索引擎已弱化 keywords，但可用于内部统计或特定站点。</p>';
        },
        'theme_options',
        'theme_options_section'
    );
    register_setting('theme_options_group', 'home_keywords');

    // Twitter Card Type
    add_settings_field(
        'twitter_card_type',
        'Twitter Card 类型',
        function () {
            $v = get_option('twitter_card_type', 'summary_large_image');
            $opts = ['summary' => 'summary', 'summary_large_image' => 'summary_large_image'];
            echo '<select name="twitter_card_type">';
            foreach ($opts as $k => $label) {
                echo '<option value="' . $k . '" ' . selected($v, $k, false) . '>' . $label . '</option>';
            }
            echo '</select>';
        },
        'theme_options',
        'theme_options_section'
    );
    register_setting('theme_options_group', 'twitter_card_type');

    // Twitter 站点 / 作者
    add_settings_field(
        'twitter_site',
        'Twitter Site 账号',
        function () {
            $v = esc_attr(get_option('twitter_site', ''));
            echo '<input type="text" name="twitter_site" value="' . $v . '" class="regular-text" placeholder="站点账号（不含@）" />';
        },
        'theme_options',
        'theme_options_section'
    );
    register_setting('theme_options_group', 'twitter_site');

    add_settings_field(
        'twitter_creator',
        'Twitter 作者账号',
        function () {
            $v = esc_attr(get_option('twitter_creator', ''));
            echo '<input type="text" name="twitter_creator" value="' . $v . '" class="regular-text" placeholder="作者账号（不含@）" />';
        },
        'theme_options',
        'theme_options_section'
    );
    register_setting('theme_options_group', 'twitter_creator');
});
