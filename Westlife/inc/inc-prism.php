<?php
if (!defined('ABSPATH')) {
    exit;
}

/**
 * Prism 资源加载（精简版）
 * - 仅单篇/页面加载
 * - 合并样式：仅 prism.css
 * - JS：data-manual 标记核心，再加载自定义 boot
 */
add_action('wp_enqueue_scripts', 'westlife_enqueue_prism', 12);

function westlife_enqueue_prism()
{
    if (!is_single() && !is_page()) {
        return;
    }

    if (function_exists('westlife_has_app_bundle') && westlife_has_app_bundle()) {
        return;
    }

    $dir = get_template_directory();
    $uri = get_template_directory_uri();
    $ver = wp_get_theme()->get('Version');

    $css  = $dir . '/assets/modules/prism/prism.css';
    $core = $dir . '/assets/modules/prism/prism.js';
    $boot = $dir . '/assets/modules/prism/prism-boot.js';

    if (file_exists($css)) {
        wp_enqueue_style(
            'prism-css',
            $uri . '/assets/modules/prism/prism.css',
            [],
            @filemtime($css) ?: $ver
        );
    }

    if (file_exists($core)) {
        wp_enqueue_script(
            'prism-core',
            $uri . '/assets/modules/prism/prism.js',
            [],
            @filemtime($core) ?: $ver,
            true
        );
    }

    if (file_exists($boot)) {
        wp_enqueue_script(
            'prism-boot',
            $uri . '/assets/modules/prism/prism-boot.js',
            ['prism-core'],
            @filemtime($boot) ?: $ver,
            true
        );
    }
}

/**
 * 给 Prism 核心脚本添加 data-manual（替代单独的 prism-init.js）
 */
add_filter('script_loader_tag', function ($tag, $handle) {
    if ($handle === 'prism-core' && strpos($tag, 'data-manual') === false) {
        return str_replace('<script ', '<script data-manual ', $tag);
    }
    return $tag;
}, 10, 2);
