<?php

/**
 * 图片处理功能模块
 * @package Westlife
 */

if (!defined('ABSPATH')) exit;

/*--------------------------------------------------------------
 * 1. 图片设置和初始化
--------------------------------------------------------------*/

/**
 * 注册两组 16:9 裁剪尺寸：首页/相关文章
 */
add_action('after_setup_theme', function () {
    // 主题设置优先（严格使用主题设置的宽高）；若未设置，再回退到 WP 媒体宽度按 16:9；最后使用本地兜底
    $sizes = (array) get_option('westlife_thumbnail_sizes', []);

    $opt_l_w = isset($sizes['large']['width'])  ? (int) $sizes['large']['width']  : 0;
    $opt_l_h = isset($sizes['large']['height']) ? (int) $sizes['large']['height'] : 0;
    $opt_m_w = isset($sizes['medium']['width'])  ? (int) $sizes['medium']['width']  : 0;
    $opt_m_h = isset($sizes['medium']['height']) ? (int) $sizes['medium']['height'] : 0;

    $wp_large_w  = (int) get_option('large_size_w');
    $wp_medium_w = (int) get_option('medium_size_w');

    // 本地兜底采用 16:9：1280×720 / 800×450
    $fb_l_w = 1280;
    $fb_l_h = 720;
    $fb_m_w = 800;
    $fb_m_h = 450;

    // 计算最终 large
    if ($opt_l_w > 0 && $opt_l_h > 0) {
        $large_w = $opt_l_w;
        $large_h = $opt_l_h;
    } elseif ($wp_large_w > 0) {
        $large_w = $wp_large_w;
        $large_h = (int) round($large_w * 9 / 16);
    } else {
        $large_w = $fb_l_w;
        $large_h = $fb_l_h;
    }

    // 计算最终 medium
    if ($opt_m_w > 0 && $opt_m_h > 0) {
        $medium_w = $opt_m_w;
        $medium_h = $opt_m_h;
    } elseif ($wp_medium_w > 0) {
        $medium_w = $wp_medium_w;
        $medium_h = (int) round($medium_w * 9 / 16);
    } else {
        $medium_w = $fb_m_w;
        $medium_h = $fb_m_h;
    }

    // 注册（硬裁剪）
    add_image_size('westlife_large',  $large_w,  $large_h,  true);
    add_image_size('westlife_medium', $medium_w, $medium_h, true);
});

/**
 * 默认（可移除）随机缩略图实现：若前两级来源均失败并启用过滤器时，提供 img.et 随机占位图。
 * 开发者可在子主题/插件中 remove_filter 后自行实现。
 */
add_filter('westlife_random_thumbnail_url', function ($url, $post_id, $size) {
    if ($url) return $url; // 已有上游实现
    $width = 1600;
    $height = 900;

    if ($size === 'westlife_medium') {
        $width = 1200;
        $height = 675;
    } elseif ($size === 'thumbnail') {
        $width = 800;
        $height = 450;
    }

    return sprintf(
        'https://img.et/%d/%d?format=webp&r=%d',
        $width,
        $height,
        intval($post_id)
    );
}, 5, 3);

/**
 * 加载图片处理相关的样式和脚本
 */
// 统一加载图片相关前端资源：恢复使用 lazysizes 提升占位与延迟加载；并可选加载本地图片预览脚本
function westlife_enqueue_image_assets()
{
    $enable_image_viewer = (bool) get_option('westlife_enable_fancybox', true);
    $script_handle = function_exists('westlife_get_frontend_script_handle') ? westlife_get_frontend_script_handle() : 'westlife-view-images';

    // lazysizes（异步）
    wp_enqueue_script(
        'lazysizes',
        'https://static.bluecdn.com/npm/lazysizes@5.3.2/lazysizes.min.js',
        [],
        '5.3.2',
        true
    );
    if (function_exists('wp_script_add_data')) {
        wp_script_add_data('lazysizes', 'async', true);
    }

    if (wp_script_is($script_handle, 'registered') || wp_script_is($script_handle, 'enqueued')) {
        wp_add_inline_script(
            $script_handle,
            'window.westlifeImage = ' . wp_json_encode([
                'enableViewer' => $enable_image_viewer,
            ]) . ';',
            'before'
        );
    }

    if ($enable_image_viewer && function_exists('westlife_has_app_bundle') && !westlife_has_app_bundle()) {
        wp_enqueue_script(
            'westlife-view-image-lib',
            get_template_directory_uri() . '/assets/js/view-image.min.js',
            array(),
            '2.0.2',
            true
        );
        wp_enqueue_script(
            'westlife-view-images',
            get_template_directory_uri() . '/assets/js/view-images.js',
            array('westlife-view-image-lib'),
            defined('WESTLIFE_VERSION') ? WESTLIFE_VERSION : wp_get_theme()->get('Version'),
            true
        );
    }
}
add_action('wp_enqueue_scripts', 'westlife_enqueue_image_assets');

/*--------------------------------------------------------------
 * 2. 图片处理功能
--------------------------------------------------------------*/

/**
 * （已废弃）处理文章内容图片：曾添加懒加载与第三方预览包裹。
 */
// 移除正文图片重写：直接使用 WP 原图，启用原生 lazy 属性（WP 5.5+ 默认会加）。
// 若后续需要替换查看器，可单独实现一个更简单的过滤器。

/**
 * （已废弃）处理缩略图：曾包裹容器并接入第三方懒加载。
 */
// 移除缩略图二次处理（模板直接输出原生 <img>）。

/**
 * 获取缩略图URL
 */
function westlife_get_thumbnail_url($post_id = null, $size = 'westlife_large')
{
    if (!$post_id) {
        $post_id = get_the_ID();
    }

    // 可通过 define('WESTLIFE_THUMB_DEBUG', true); 或 WP_DEBUG 开启日志
    $debug = (defined('WESTLIFE_THUMB_DEBUG') && constant('WESTLIFE_THUMB_DEBUG')) || (defined('WP_DEBUG') && constant('WP_DEBUG'));
    $log_steps = [];
    $log = function ($step, $val = null) use (&$log_steps, $post_id) {
        $log_steps[] = '[' . $post_id . '] ' . $step . ($val !== null ? ' => ' . $val : '');
    };

    // 允许强制跳过正文首图，直接使用随机：开发/调试场景
    $force_random = apply_filters('westlife_force_random_thumbnail', false, $post_id, $size);
    if ($force_random) {
        $log('force_random = true');
    }

    // 1. 特色图（Featured Image）
    if (!$force_random && has_post_thumbnail($post_id)) {
        $thumb = get_the_post_thumbnail_url($post_id, $size);
        if (!empty($thumb)) {
            $log('featured', $thumb);
            if ($debug) error_log('westlife_thumb: ' . implode(' | ', $log_steps));
            return $thumb;
        } else {
            $log('featured_exists_but_size_missing', $size);
        }
    }

    // 2. 正文第一张图片（匹配 src，略过明显占位符 / 空 / data:image）
    if (!$force_random) {
        $content = get_post_field('post_content', $post_id);
        if ($content && preg_match('/<img[^>]+src=["\']([^"\']+)["\'][^>]*>/i', $content, $m)) {
            $candidate = trim($m[1]);
            if ($candidate && stripos($candidate, 'data:image') !== 0 && stripos($candidate, 'about:blank') !== 0) {
                $log('content_first', $candidate);
                if ($debug) error_log('westlife_thumb: ' . implode(' | ', $log_steps));
                return esc_url_raw($candidate);
            } else {
                $log('content_first_skipped_placeholder');
            }
        } else {
            $log('content_first_not_found');
        }
    }

    // 3. 外部随机缩略图（预留接口）
    $random = apply_filters('westlife_random_thumbnail_url', null, $post_id, $size);
    if (!empty($random)) {
        $log('random_filter', $random);
        if ($debug) error_log('westlife_thumb: ' . implode(' | ', $log_steps));
        return esc_url_raw($random);
    }
    $log('random_filter_empty');

    // 4. 默认主题内置图
    $default = get_theme_file_uri('assets/images/default-thumbnail.jpg');
    $log('default', $default);
    if ($debug) error_log('westlife_thumb: ' . implode(' | ', $log_steps));
    return $default;
}

/**
 * 统一渲染文章缩略图 <img>
 *
 * @param int    $post_id  文章ID
 * @param string $context  使用场景：list|related|single（可扩展）
 * @param int    $index    当前列表索引（0 表示首个，用于 LCP 优先）
 * @param array  $args     额外自定义属性（会覆盖默认）
 * @return string HTML <img>，若无法获取 URL 返回空字符串
 */
function westlife_render_post_thumbnail($post_id = null, $context = 'list', $index = 0, $args = [])
{
    if (!$post_id) {
        $post_id = get_the_ID();
    }
    $post_id = (int) $post_id;
    if (!$post_id) return '';

    // 场景到尺寸映射（可根据需要扩展）
    $size_map = [
        'list'    => 'westlife_large',
        'related' => 'westlife_medium',
        'single'  => 'westlife_large',
    ];
    $size = isset($size_map[$context]) ? $size_map[$context] : 'westlife_large';

    // 是否属于优先加载（首屏）图片：允许通过过滤器自定义数量，默认前8张列表图不使用延迟占位
    $eager_count = (int) apply_filters('westlife_eager_thumbnail_count', 8, $context);
    if ($eager_count < 0) {
        $eager_count = 0;
    }
    $is_first = ($index === 0 && $context === 'list');
    $is_eager  = ($context === 'list' && $index < $eager_count);

    $thumb_id = get_post_thumbnail_id($post_id);
    $alt = '';
    $src = '';
    $is_attachment = false;

    if ($thumb_id) {
        $is_attachment = true;
        $alt = get_post_meta($thumb_id, '_wp_attachment_image_alt', true);
        if ($alt === '') {
            $alt = get_the_title($post_id);
        }
        $src = wp_get_attachment_image_url($thumb_id, $size);
    }

    if (!$src) {
        // 回退 URL
        $src = westlife_get_thumbnail_url($post_id, $size);
        $alt = $alt !== '' ? $alt : get_the_title($post_id);
    }

    if (!$src) return '';

    // 获取宽高 (仅当有 attachment 且该尺寸元数据存在)
    $width = $height = '';
    if ($is_attachment) {
        $meta = wp_get_attachment_metadata($thumb_id);
        if (is_array($meta)) {
            // 优先尺寸数组
            if (!empty($meta['sizes'][$size]['width']) && !empty($meta['sizes'][$size]['height'])) {
                $width  = (int) $meta['sizes'][$size]['width'];
                $height = (int) $meta['sizes'][$size]['height'];
            } elseif (!empty($meta['width']) && !empty($meta['height'])) { // 原图回退
                $width  = (int) $meta['width'];
                $height = (int) $meta['height'];
            }
        }
    }

    // srcset / sizes（仅当为媒体库 attachment）
    $srcset = $is_attachment ? wp_get_attachment_image_srcset($thumb_id, $size) : '';
    $sizes_attr = '';
    if ($srcset) {
        // 简单策略，可根据布局再细化
        if ($context === 'list') {
            $sizes_attr = '(max-width: 680px) 100vw, 680px';
        } elseif ($context === 'related') {
            $sizes_attr = '(max-width: 480px) 50vw, 320px';
        } else {
            $sizes_attr = '(max-width: 1000px) 100vw, 1000px';
        }
    }

    // 基本属性：首屏优先加载直接真实 src，非优先使用原生 lazy
    if ($is_eager) {
        $attr = [
            'class'         => 'post-thumbnail-img thumb-fade is-eager',
            'src'           => $src,
            'alt'           => $alt,
            'loading'       => 'eager',
            'decoding'      => 'async',
            'fetchpriority' => 'high',
            'width'         => $width ?: null,
            'height'        => $height ?: null,
            'srcset'        => $srcset ?: null,
            'sizes'         => $sizes_attr ?: null,
        ];
    } else {
        // 使用原生懒加载 + 淡入效果
        $attr = [
            'class'    => 'post-thumbnail-img thumb-fade',
            'src'      => $src,
            'alt'      => $alt,
            'loading'  => 'lazy',
            'decoding' => 'async',
            'width'    => $width ?: null,
            'height'   => $height ?: null,
            'srcset'   => $srcset ?: null,
            'sizes'    => $sizes_attr ?: null,
        ];
    }

    // related 场景同样使用淡入效果
    if ($context === 'related') {
        $attr['class'] .= ' thumb-fade';
    }

    // 合并外部传入覆盖
    foreach ($args as $k => $v) {
        $attr[$k] = $v;
    }

    // 过滤器允许二次调整
    $attr = apply_filters('westlife_thumbnail_attrs', $attr, $post_id, $context, $index);

    // 构建属性字符串
    $parts = [];
    foreach ($attr as $k => $v) {
        if ($v === null || $v === '') continue;
        $parts[] = sprintf('%s="%s"', esc_attr($k), esc_attr($v));
    }

    $img_html = '<img ' . implode(' ', $parts) . ' />';

    // 简化逻辑：list/related 不需要额外包装，直接返回 <img>
    // 缩略图的 16:9 比例由 CSS 的 .post-thumbnail 容器控制
    return $img_html;
}

/*--------------------------------------------------------------
 * 3. 辅助函数
--------------------------------------------------------------*/

// 允许 WebP 上传
add_filter('upload_mimes', function ($mimes) {
    $mimes['webp'] = 'image/webp';
    return $mimes;
});

// 设置 JPEG/WebP 压缩质量（遵循后台设置）
add_filter('jpeg_quality', function ($quality) {
    $q = (int) get_option('westlife_jpeg_quality', 85);
    return max(10, min(100, $q));
});
add_filter('wp_editor_set_quality', function ($quality) {
    $q = (int) get_option('westlife_jpeg_quality', 85);
    return max(10, min(100, $q));
});

// 上传后将 JPEG/PNG 自动转换为 WebP（含特色图片/缩略图），可在后台开关，并可选择保留原图
add_filter('wp_handle_upload', function ($upload) {
    $file = $upload['file'] ?? '';
    $type = $upload['type'] ?? '';
    if (!$file || !$type) return $upload;

    // 后台未启用则跳过
    if (!get_option('westlife_enable_webp', false)) return $upload;

    // 仅处理 JPG/PNG
    if (!in_array($type, ['image/jpeg', 'image/png'], true)) return $upload;

    // 检查 GD WebP 支持
    if (!function_exists('imagewebp')) return $upload;
    if (function_exists('gd_info')) {
        $gi = gd_info();
        if (empty($gi['WebP Support'])) return $upload;
    }

    // 读取源图
    $src = ($type === 'image/png') ? @imagecreatefrompng($file) : @imagecreatefromjpeg($file);
    if (!$src) return $upload;

    // 目标路径/URL（替换为 .webp）
    $destPath = preg_replace('/\.(jpe?g|png)$/i', '.webp', $file);
    $webpQ = (int) get_option('westlife_webp_quality', 80);
    $webpQ = max(10, min(100, $webpQ));
    $saved = imagewebp($src, $destPath, $webpQ); // 质量 0-100，后台可配
    imagedestroy($src);

    if (!$saved || !file_exists($destPath)) return $upload;

    // 是否保留原图
    $keepOriginal = (bool) get_option('westlife_keep_original', true);
    if (!$keepOriginal) {
        @unlink($file);
    }

    // 更新返回值（媒体库以 WebP 为主）
    $upload['file'] = $destPath;
    $upload['url']  = preg_replace('/\.(jpe?g|png)$/i', '.webp', $upload['url']);
    $upload['type'] = 'image/webp';

    return $upload;
}, 20);
