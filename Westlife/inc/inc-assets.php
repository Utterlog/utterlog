<?php

/**
 * 主题资源注册与加载（多文件加载）
 * - 仅负责样式与脚本的 enqueue，不再定义通用优化函数
 * - 其他优化/钩子统一在 functions.php 中
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('westlife_should_use_dist_assets')) {
    function westlife_should_use_dist_assets()
    {
        $dist_dir = get_template_directory() . '/assets/dist/';
        $has_app_bundle = file_exists($dist_dir . 'app.css') && file_exists($dist_dir . 'app.js');
        $enabled = $has_app_bundle ? true : (!defined('WP_DEBUG') || !WP_DEBUG);
        return (bool) apply_filters('westlife_use_dist_assets', $enabled);
    }
}

if (!function_exists('westlife_has_dist_asset')) {
    function westlife_has_dist_asset($relative_path)
    {
        $path = get_template_directory() . '/assets/dist/' . ltrim($relative_path, '/');
        return file_exists($path);
    }
}

if (!function_exists('westlife_get_dist_asset_uri')) {
    function westlife_get_dist_asset_uri($relative_path)
    {
        return get_template_directory_uri() . '/assets/dist/' . ltrim($relative_path, '/');
    }
}

if (!function_exists('westlife_get_dist_asset_version')) {
    function westlife_get_dist_asset_version($relative_path)
    {
        $path = get_template_directory() . '/assets/dist/' . ltrim($relative_path, '/');
        if (file_exists($path)) {
            return (string) filemtime($path);
        }

        return defined('WESTLIFE_VERSION') ? WESTLIFE_VERSION : wp_get_theme()->get('Version');
    }
}

if (!function_exists('westlife_has_app_bundle')) {
    function westlife_has_app_bundle()
    {
        if (!westlife_should_use_dist_assets()) {
            return false;
        }

        return westlife_has_dist_asset('app.css') && westlife_has_dist_asset('app.js');
    }
}

if (!function_exists('westlife_get_frontend_script_handle')) {
    function westlife_get_frontend_script_handle()
    {
        if (westlife_has_app_bundle()) {
            return 'westlife-app';
        }

        if (westlife_should_use_dist_assets() && westlife_has_dist_asset('core.js')) {
            return 'westlife-core';
        }

        return 'westlife-main';
    }
}

if (!function_exists('westlife_get_frontend_style_handle')) {
    function westlife_get_frontend_style_handle()
    {
        if (westlife_has_app_bundle()) {
            return 'westlife-app';
        }

        if (westlife_should_use_dist_assets() && westlife_has_dist_asset('core.css')) {
            return 'westlife-core';
        }

        return 'westlife-main';
    }
}

if (!function_exists('westlife_hex_to_rgb_components')) {
    function westlife_hex_to_rgb_components($hex)
    {
        $hex = sanitize_hex_color((string) $hex);
        if (!$hex) {
            return [51, 104, 217];
        }

        $hex = ltrim($hex, '#');
        if (strlen($hex) === 3) {
            $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
        }

        return [
            hexdec(substr($hex, 0, 2)),
            hexdec(substr($hex, 2, 2)),
            hexdec(substr($hex, 4, 2)),
        ];
    }
}

if (!function_exists('westlife_adjust_hex_color')) {
    function westlife_adjust_hex_color($hex, $percent)
    {
        [$r, $g, $b] = westlife_hex_to_rgb_components($hex);
        $ratio = max(-1, min(1, (float) $percent));

        $mix = static function ($channel, $target, $ratio_value) {
            return (int) round($channel + (($target - $channel) * abs($ratio_value)));
        };

        if ($ratio >= 0) {
            $r = $mix($r, 255, $ratio);
            $g = $mix($g, 255, $ratio);
            $b = $mix($b, 255, $ratio);
        } else {
            $r = $mix($r, 0, $ratio);
            $g = $mix($g, 0, $ratio);
            $b = $mix($b, 0, $ratio);
        }

        return sprintf('#%02x%02x%02x', max(0, min(255, $r)), max(0, min(255, $g)), max(0, min(255, $b)));
    }
}

if (!function_exists('westlife_get_theme_design_tokens_css')) {
    function westlife_get_theme_design_tokens_css()
    {
        $primary = sanitize_hex_color((string) get_option('westlife_primary_color', ''));
        if (!$primary) {
            $primary = '#3368d9';
        }

        $shape = function_exists('westlife_sanitize_ui_shape')
            ? westlife_sanitize_ui_shape(get_option('westlife_ui_shape', 'sharp'))
            : 'sharp';

        [$r, $g, $b] = westlife_hex_to_rgb_components($primary);
        $hover = westlife_adjust_hex_color($primary, 0.12);
        $active = westlife_adjust_hex_color($primary, -0.16);
        $soft50 = westlife_adjust_hex_color($primary, 0.92);
        $soft100 = westlife_adjust_hex_color($primary, 0.82);
        $soft200 = westlife_adjust_hex_color($primary, 0.68);
        $soft300 = westlife_adjust_hex_color($primary, 0.52);
        $soft400 = westlife_adjust_hex_color($primary, 0.3);
        $radius = $shape === 'rounded' ? '14px' : '0px';
        $radiusSm = $shape === 'rounded' ? '8px' : '0px';
        $radiusLg = $shape === 'rounded' ? '18px' : '0px';
        $radiusFull = $shape === 'rounded' ? '999px' : '0px';

        return sprintf(
            "body{--color-primary:%1\$s;--color-primary-rgb:%2\$d, %3\$d, %4\$d;--color-primary-hover:%5\$s;--color-primary-active:%6\$s;--color-primary-dark:%6\$s;--color-primary-50:%7\$s;--color-primary-100:%8\$s;--color-primary-200:%9\$s;--color-primary-300:%10\$s;--color-primary-400:%11\$s;--color-primary-500:%5\$s;--color-primary-600:%1\$s;--color-primary-700:%1\$s;--color-primary-800:%6\$s;--color-primary-900:%12\$s;--primary-color:%1\$s;--primary-color-rgb:%2\$d, %3\$d, %4\$d;--primary-color-hover:%5\$s;--primary-dark:%6\$s;--card-radius:%13\$s;--bubble-radius:%13\$s;--border-radius:%13\$s;--radius-sm:%14\$s;--radius-md:%13\$s;--radius-lg:%15\$s;--radius-full:%16\$s;--links-radius-sm:%14\$s;--links-radius-md:%13\$s;--links-radius-lg:%15\$s;--links-radius-full:%16\$s;--task-radius:%13\$s;--site-menu-radius:%13\$s;--opt-radius:%13\$s;--related-header-radius:%13\$s;--link-modal-radius:%13\$s;}body.westlife-shape-sharp{--theme-radius:%17\$s;}body.westlife-shape-rounded{--theme-radius:%13\$s;}",
            esc_html($primary),
            $r,
            $g,
            $b,
            esc_html($hover),
            esc_html($active),
            esc_html($soft50),
            esc_html($soft100),
            esc_html($soft200),
            esc_html($soft300),
            esc_html($soft400),
            esc_html(westlife_adjust_hex_color($primary, -0.32)),
            esc_html($radius),
            esc_html($radiusSm),
            esc_html($radiusLg),
            esc_html($radiusFull),
            '0px'
        );
    }
}

/* 公共配置：前端可用的设置对象 */
if (!function_exists('westlife_get_script_settings')) {
    function westlife_get_script_settings()
    {
        $enabled = (bool) get_option('westlife_enable_page_loader', false);
        // 统一通过工具函数获取模式（避免重复逻辑）
        $mode    = function_exists('westlife_get_page_loader_mode') ? westlife_get_page_loader_mode() : ($enabled ? 'spinner' : 'bar');

        $settings = [
            'ajaxurl'           => admin_url('admin-ajax.php'),
            'nonce'             => wp_create_nonce('westlife_ajax_nonce'),
            'siteTimezone'      => wp_timezone_string() ?: 'UTC',
            'siteUtcOffset'     => (float) get_option('gmt_offset', 0),
            'pageLoaderEnabled' => $enabled,
            'enablePjax'        => (bool) apply_filters('westlife_enable_pjax', true),
            'pjaxContainerSelector' => (string) apply_filters('westlife_pjax_container_selector', 'main.site-main'),
            // pageLoaderMode 与 <html data-page-loader> 保持同步：
            // - JS 会根据 enabled + localStorage 自动判断显示罗盘还是进度条
            'pageLoaderMode'    => $mode,
        ];

        return $settings;
    }
}

/* 资源加载（多文件，按需） */
if (!function_exists('westlife_enqueue_assets')) {
    function westlife_enqueue_assets()
    {
        $uri     = get_template_directory_uri();
        $version = defined('WESTLIFE_VERSION') ? WESTLIFE_VERSION : wp_get_theme()->get('Version');
        $use_dist = westlife_should_use_dist_assets();
        $has_app_bundle = westlife_has_app_bundle();
        $has_core_css = $use_dist && westlife_has_dist_asset('core.css');
        $has_core_js = $use_dist && westlife_has_dist_asset('core.js');
        $app_style_handle = 'westlife-app';
        $app_script_handle = 'westlife-app';
        $core_style_handle = 'westlife-core';
        $core_script_handle = 'westlife-core';
        $base_style_dep = $has_app_bundle ? [$app_style_handle] : ($has_core_css ? [$core_style_handle] : ['westlife-main']);

        // 全站样式
        if ($has_app_bundle) {
            wp_enqueue_style($app_style_handle, westlife_get_dist_asset_uri('app.css'), [], westlife_get_dist_asset_version('app.css'));
            wp_enqueue_style('font-awesome', 'https://icons.bluecdn.com/fontawesome-pro/css/all.min.css', [], null);
            wp_enqueue_style('flag-icons', 'https://flagcdn.io/css/flag-icons.min.css', [], null);
        } elseif ($has_core_css) {
            wp_enqueue_style($core_style_handle, westlife_get_dist_asset_uri('core.css'), [], westlife_get_dist_asset_version('core.css'));
            wp_enqueue_style('font-awesome', 'https://icons.bluecdn.com/fontawesome-pro/css/all.min.css', [], null);
            wp_enqueue_style('flag-icons', 'https://flagcdn.io/css/flag-icons.min.css', [], null);
        } else {
            wp_enqueue_style('westlife-main',            $uri . '/assets/css/main.css',                    [], $version);
            wp_enqueue_style('westlife-utilities',       $uri . '/assets/css/utilities.css',               ['westlife-main'], $version);
            wp_enqueue_style('westlife-header',          $uri . '/assets/css/header.css',                  ['westlife-main'], $version);
            wp_enqueue_style('westlife-panel',           $uri . '/assets/css/modules/panel.css',           ['westlife-header'], $version);
            wp_enqueue_style('westlife-nav',             $uri . '/assets/css/modules/nav.css',             ['westlife-header'], $version);
            wp_enqueue_style('westlife-loading',         $uri . '/assets/css/modules/loading.css',         ['westlife-main'], $version);
            wp_enqueue_style('westlife-footer',          $uri . '/assets/css/footer.css',                  ['westlife-main'], $version);
            wp_enqueue_style('westlife-style',           get_stylesheet_uri(),                             ['westlife-main'], $version);
            wp_enqueue_style('font-awesome',             'https://icons.bluecdn.com/fontawesome-pro/css/all.min.css', [], null);
            wp_enqueue_style('flag-icons',               'https://flagcdn.io/css/flag-icons.min.css', [], null);
            wp_enqueue_style('westlife-motion-override', $uri . '/assets/css/modules/motion-override.css',  ['westlife-style'], $version);
        }

        // 页面样式（按需）
        if (!$has_app_bundle && is_single()) {
            if ($use_dist && westlife_has_dist_asset('single.css')) {
                wp_enqueue_style('westlife-single', westlife_get_dist_asset_uri('single.css'), $has_core_css ? [$core_style_handle] : [], westlife_get_dist_asset_version('single.css'));
            } else {
                $single_css_deps = $has_core_css ? [$core_style_handle] : ['westlife-style'];
                wp_enqueue_style('westlife-single', $uri . '/assets/css/single.css', $single_css_deps, $version);
                wp_enqueue_style('westlife-entry',  $uri . '/assets/css/modules/entry.css', $single_css_deps, $version);
                wp_enqueue_style('westlife-media',  $uri . '/assets/css/modules/media.css', $single_css_deps, $version);
            }
            // 评论相关样式与脚本由 inc/inc-comment.php 统一加载，避免重复
        } elseif (!$has_app_bundle && is_page()) {
            $page_css_deps = $has_core_css ? [$core_style_handle] : ['westlife-style'];
            wp_enqueue_style('westlife-page', $uri . '/assets/css/page.css', $page_css_deps, $version);
        }

        // 全站脚本
        wp_enqueue_script('jquery');
        if ($has_app_bundle) {
            wp_enqueue_script($app_script_handle, westlife_get_dist_asset_uri('app.js'), ['jquery'], westlife_get_dist_asset_version('app.js'), true);
            wp_localize_script($app_script_handle, 'westlifeSettings', westlife_get_script_settings());
        } elseif ($has_core_js) {
            wp_enqueue_script($core_script_handle, westlife_get_dist_asset_uri('core.js'), ['jquery'], westlife_get_dist_asset_version('core.js'), true);
            wp_localize_script($core_script_handle, 'westlifeSettings', westlife_get_script_settings());
        } else {
            wp_enqueue_script('westlife-utils',    $uri . '/assets/js/utils.js',   ['jquery'], $version, true);
            wp_localize_script('westlife-utils', 'westlifeSettings', westlife_get_script_settings());
        }

        $settings_handle = $has_app_bundle ? $app_script_handle : ($has_core_js ? $core_script_handle : 'westlife-utils');
        $main_handle = $has_app_bundle ? $app_script_handle : ($has_core_js ? $core_script_handle : 'westlife-main');

        wp_add_inline_script(
            $settings_handle,
            'window.westlife_ajax = ' . wp_json_encode([
                'ajax_url' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('westlife_ajax_nonce'),
            ], JSON_UNESCAPED_UNICODE) . ';',
            'before'
        );

        // 访客智能配置：通过 inline 注入（替代原 wp_head echo），仅在首页/主页输出完整配置
        if (function_exists('westlife_output_visitor_config')) {
            $cfg = westlife_output_visitor_config(true);
            $inline_vi = 'window.westlifeVisitorConfig = ' . wp_json_encode($cfg, JSON_UNESCAPED_UNICODE) . ';';
            wp_add_inline_script($settings_handle, $inline_vi, 'before');
        }
        if (!$has_app_bundle && !$has_core_js) {
            wp_enqueue_script('westlife-main',     $uri . '/assets/js/main.js',    ['jquery', 'westlife-utils'], $version, true);
            wp_enqueue_script('westlife-hero-animations', $uri . '/assets/js/hero-animations.js', [], $version, true);
        }
        // 小鸟：独立模块 (CSS + JS)
        if (!$has_app_bundle) {
            wp_enqueue_style('westlife-bird',      $uri . '/assets/modules/bird/bird.css', $base_style_dep, $version);
            wp_enqueue_script('westlife-bird',     $uri . '/assets/modules/bird/bird.js',  $has_core_js ? [$core_script_handle] : ['westlife-main'], $version, true);
        }
        // 图片加载效果 (精简版)
        if (!$has_app_bundle && !$has_core_css) {
            wp_enqueue_style('westlife-image-loading', $uri . '/assets/css/modules/image-loading.css', ['westlife-main'], $version);
        } elseif (!$has_app_bundle && (!$use_dist || !westlife_has_dist_asset('core.css'))) {
            wp_enqueue_style('westlife-image-loading', $uri . '/assets/css/modules/image-loading.css', $base_style_dep, $version);
        }
        if (!$has_app_bundle && !$has_core_js) {
            wp_enqueue_script('westlife-image-effects', $uri . '/assets/js/image.js', ['jquery', 'westlife-main'], $version, true);
        }

        // 注入主题信息到前端，供控制台输出版权信息等
        $theme = wp_get_theme();
        $theme_name = $theme->get('Name') ?: 'Westlife';
        $theme_version = $theme->get('Version') ?: $version;
        $theme_uri = $theme->get('ThemeURI');
        if (!$theme_uri) {
            // 主题主页
            $theme_uri = 'https://xifeng.net';
        }
        wp_localize_script($main_handle, 'WestlifeThemeInfo', [
            'name'    => $theme_name,
            'version' => $theme_version,
            'url'     => $theme_uri,
            'copyright' => '自豪地使用' . $theme_name . '主题',
        ]);

        // 页面加载器（按需）
        if (!$has_app_bundle && !$has_core_js) {
            wp_enqueue_script('westlife-loading',  $uri . '/assets/js/loading.js', ['jquery', 'westlife-utils'], $version, true);
        }

        // 智能欢迎（在 nav 前，依赖 loading 和 utils）
        $intro_inline_cfg = <<<JS
window.westlifeIntroConfig = window.westlifeIntroConfig || {};
(function(c){
  c.defaultName  = (typeof c.defaultName  !== 'undefined') ? c.defaultName  : "西风";
  c.gravatarBase = (typeof c.gravatarBase !== 'undefined') ? c.gravatarBase : "gravatar.bluecdn.com";
})(window.westlifeIntroConfig);
JS;

        // 导航交互（整合原 ajax-nav.js 功能到 nav.js，移除独立 ajax 模块）
        if (!$has_app_bundle && !$has_core_js) {
            wp_enqueue_script('westlife-nav',      $uri . '/assets/js/nav.js',     ['jquery', 'westlife-utils', 'westlife-loading'], $version, true);
        }

        // 友链页面 isAdmin 注入：检测当前是否友链模板（避免 footer 直出）
        if (is_page_template('template-pages/page-links.php')) {
            $is_admin_inline = 'window.westlifeSettings = window.westlifeSettings || {}; window.westlifeSettings.isAdmin = ' . (current_user_can('manage_options') ? 'true' : 'false') . ';';
            wp_add_inline_script($settings_handle, $is_admin_inline, 'before');
        }

        // 首页访客智能识别系统
        if (is_home() || is_front_page()) {
            // （已移除）首页 featured-banner / home-features / gallery 相关资源不再加载
            // 首页“评论飘动”脚本已移除
            // 新增：首页专属交互（原 inline 脚本迁出）
            if (!$has_app_bundle && $use_dist && westlife_has_dist_asset('home.js')) {
                $home_js_deps = $has_core_js ? [$core_script_handle] : ['jquery', 'westlife-utils'];
                wp_enqueue_script('westlife-home', westlife_get_dist_asset_uri('home.js'), $home_js_deps, westlife_get_dist_asset_version('home.js'), true);
            } elseif (!$has_app_bundle) {
                wp_enqueue_script('westlife-home', $uri . '/assets/js/home.js', ['jquery', 'westlife-utils'], $version, true);
            }
            if (!$has_app_bundle && $use_dist && westlife_has_dist_asset('home.css')) {
                $home_css_deps = $has_core_css ? [$core_style_handle] : [];
                wp_enqueue_style('westlife-home', westlife_get_dist_asset_uri('home.css'), $home_css_deps, westlife_get_dist_asset_version('home.css'));
            } elseif (!$has_app_bundle) {
                wp_enqueue_style('westlife-tasks', $uri . '/assets/css/tasks.css', $base_style_dep, $version);
                wp_enqueue_script('westlife-tasks', $uri . '/assets/js/tasks.js', ['jquery', 'westlife-utils'], $version, true);
            }
            /* 三栏高度已改为纯 CSS 固定，移除动态高度脚本 westlife-intro-bounds （2025-10 重构） */
        }

        // 热力图资源（首页/归档/说说页面）
        if (!$has_app_bundle && (is_home() || is_front_page() || is_page_template('page-archive.php') || is_page_template('page-memos.php')) && !($use_dist && westlife_has_dist_asset('home.css'))) {
            wp_enqueue_style('westlife-heatmap', $uri . '/assets/css/components/heatmap.css', $base_style_dep, $version);
            if (!($use_dist && westlife_has_dist_asset('home.js'))) {
                wp_enqueue_script('westlife-heatmap', $uri . '/assets/js/heatmap.js', ['jquery', 'westlife-utils'], $version, true);
            }
        }

        // 单篇专用脚本
        if (is_single() && !$has_app_bundle) {
            wp_enqueue_script('westlife-qrcode', $uri . '/assets/modules/qrcode/qrcode.min.js', ['jquery'], $version, true);
            if ($use_dist && westlife_has_dist_asset('single.js')) {
                $single_js_deps = $has_core_js ? [$core_script_handle, 'westlife-qrcode'] : ['jquery', 'westlife-utils', 'westlife-qrcode'];
                wp_enqueue_script('westlife-single', westlife_get_dist_asset_uri('single.js'), $single_js_deps, westlife_get_dist_asset_version('single.js'), true);
            } else {
                wp_enqueue_script('westlife-single', $uri . '/assets/js/single.js', ['jquery', 'westlife-utils', 'westlife-qrcode'], $version, true);
            }
            // 评论脚本由 inc/inc-comment.php 统一加载
        }
    }
    add_action('wp_enqueue_scripts', 'westlife_enqueue_assets', 10);
}

if (!function_exists('westlife_enqueue_style_overrides')) {
    function westlife_enqueue_style_overrides()
    {
        if (is_admin()) {
            return;
        }

        if (westlife_has_app_bundle() || (westlife_should_use_dist_assets() && westlife_has_dist_asset('core.css'))) {
            return;
        }

        $uri     = get_template_directory_uri();
        $version = defined('WESTLIFE_VERSION') ? WESTLIFE_VERSION : wp_get_theme()->get('Version');

        wp_enqueue_style(
            'westlife-style-overrides',
            $uri . '/assets/css/modules/style-overrides.css',
            [],
            $version
        );
    }
    add_action('wp_enqueue_scripts', 'westlife_enqueue_style_overrides', 99);
}

if (!function_exists('westlife_enqueue_theme_design_tokens')) {
    function westlife_enqueue_theme_design_tokens()
    {
        if (is_admin()) {
            return;
        }

        $style_handle = westlife_get_frontend_style_handle();
        if (!wp_style_is($style_handle, 'enqueued')) {
            return;
        }

        wp_add_inline_style($style_handle, westlife_get_theme_design_tokens_css());
    }
    add_action('wp_enqueue_scripts', 'westlife_enqueue_theme_design_tokens', 120);
}
