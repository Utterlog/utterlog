<?php

/**
 * Westlife 评论功能模块&邮件模块
 * 
 * 提供评论分页、邮件通知、表情支持、评论编辑、垃圾评论检测等功能
 * 
 * @package Westlife
 */

// 安全退出：防止直接访问
if (!defined('ABSPATH')) {
    exit;
}

function westlife_comment_debug_log($message)
{
    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log($message);
    }
}

/**
 * 获取邮件样式 - #002FA7 蓝白配色
 * 
 * @return string CSS样式
 */
function westlife_get_email_styles()
{
    return '';
}

/**
 * 获取评论者操作系统和浏览器信息
 * 
 * @param string $agent 用户代理字符串
 * @return array 系统浏览器信息
 */
function westlife_get_comment_agent_info($agent)
{
    $os      = '未知';
    $os_icon = get_template_directory_uri() . '/assets/images/useragenticons/system.svg';
    $os_version = '';
    $browser = '未知';
    $browser_icon = get_template_directory_uri() . '/assets/images/useragenticons/browser.svg';
    $browser_version = '';

    // 操作系统检测
    if (stripos($agent, 'windows nt') !== false) {
        $os = 'Windows';
        $os_icon = get_template_directory_uri() . '/assets/images/useragenticons/windows.svg';
        if (stripos($agent, 'windows nt 10.0') !== false) {
            $os_version = '10';
        } elseif (stripos($agent, 'windows nt 6.3') !== false) {
            $os_version = '8.1';
        } elseif (stripos($agent, 'windows nt 6.2') !== false) {
            $os_version = '8';
        } elseif (stripos($agent, 'windows nt 6.1') !== false) {
            $os_version = '7';
        } else {
            preg_match('/windows nt ([\d\.]+)/i', $agent, $matches);
            if (isset($matches[1])) {
                $os_version = $matches[1];
            }
        }
    } elseif (stripos($agent, 'mac os x') !== false || stripos($agent, 'macintosh') !== false || stripos($agent, 'macos') !== false) {
        // 检测 iOS 设备（优先级更高）
        if (stripos($agent, 'iphone') !== false || stripos($agent, 'ipad') !== false || stripos($agent, 'ipod') !== false) {
            $os = 'iOS';
            $os_icon = get_template_directory_uri() . '/assets/images/useragenticons/ios.svg';
            if (preg_match('/iphone os ([\d_]+)/i', $agent, $matches)) {
                $os_version = str_replace('_', '.', $matches[1]);
            } elseif (preg_match('/os ([\d_]+)/i', $agent, $matches)) {
                $os_version = str_replace('_', '.', $matches[1]);
            }
        } else {
            // macOS 检测 - 系统与浏览器分离检测机制
            $os = 'macOS';
            $os_icon = get_template_directory_uri() . '/assets/images/useragenticons/macos.svg';

            // macOS系统版本检测
            $os_version = '';
            $reported_version = '';

            // 1. 先提取User Agent中报告的macOS版本
            if (preg_match('/mac os x ([\d_\.]+)/i', $agent, $matches)) {
                $reported_version = str_replace('_', '.', $matches[1]);
            } elseif (preg_match('/macos[\s\/]?([\d\.]+)/i', $agent, $matches)) {
                $reported_version = $matches[1];
            } elseif (preg_match('/darwin\/([\d\.]+)/i', $agent, $matches)) {
                $reported_version = $matches[1] . ' (Darwin)';
            }

            // 2. 如果报告的是10.15（现代macOS的隐私保护版本），需要通过浏览器版本推断真实系统版本
            if ($reported_version === '10.15' || $reported_version === '10.15.7') {
                // 现代浏览器版本对应的真实macOS版本推断
                if (stripos($agent, 'firefox') !== false && preg_match('/firefox\/([\d]+)/i', $agent, $firefox_matches)) {
                    $firefox_major = intval($firefox_matches[1]);
                    if ($firefox_major >= 140) {
                        $os_version = '26'; // macOS 26
                    } elseif ($firefox_major >= 120) {
                        $os_version = '15'; // macOS Sequoia
                    } elseif ($firefox_major >= 110) {
                        $os_version = '14'; // macOS Sonoma  
                    } else {
                        $os_version = $reported_version; // 显示原始版本
                    }
                } elseif (stripos($agent, 'safari') !== false && preg_match('/version\/([\d]+)/i', $agent, $safari_matches)) {
                    $safari_major = intval($safari_matches[1]);
                    if ($safari_major >= 26) {
                        $os_version = '26'; // macOS 26
                    } elseif ($safari_major >= 18) {
                        $os_version = '15'; // macOS Sequoia
                    } elseif ($safari_major >= 17) {
                        $os_version = '14'; // macOS Sonoma
                    } else {
                        $os_version = $reported_version; // 显示原始版本
                    }
                } elseif (stripos($agent, 'chrome') !== false && preg_match('/chrome\/([\d]+)/i', $agent, $chrome_matches)) {
                    $chrome_major = intval($chrome_matches[1]);
                    if ($chrome_major >= 140) {
                        $os_version = '26'; // macOS 26
                    } elseif ($chrome_major >= 130) {
                        $os_version = '15'; // macOS Sequoia
                    } elseif ($chrome_major >= 120) {
                        $os_version = '14'; // macOS Sonoma
                    } else {
                        $os_version = $reported_version; // 显示原始版本
                    }
                } else {
                    // 无法推断的情况，显示原始版本
                    $os_version = $reported_version;
                }
            } else {
                // 不是隐私保护版本，直接使用报告的版本
                $os_version = $reported_version;
            }

            // 兜底处理
            if (empty($os_version)) {
                $os_version = 'Unknown';
            }
        }
    } elseif (stripos($agent, 'android') !== false) {
        $os = 'Android';
        $os_icon = get_template_directory_uri() . '/assets/images/useragenticons/android.svg';
        preg_match('/android ([\d\.]+)/i', $agent, $matches);
        if (isset($matches[1])) {
            $os_version = $matches[1];
        }
    } elseif (stripos($agent, 'ubuntu') !== false) {
        $os = 'Ubuntu';
        $os_icon = get_template_directory_uri() . '/assets/images/useragenticons/ubuntu.svg';
    } elseif (stripos($agent, 'linux') !== false) {
        $os = 'Linux';
        $os_icon = get_template_directory_uri() . '/assets/images/useragenticons/linux.svg';
    }

    // 浏览器检测 - 各自独立检测机制

    // Firefox 检测（优先，因为最容易识别）
    if (stripos($agent, 'firefox') !== false) {
        $browser = 'Firefox';
        $browser_icon = get_template_directory_uri() . '/assets/images/useragenticons/firefox.svg';
        if (preg_match('/firefox\/([\d\.]+)/i', $agent, $matches)) {
            $browser_version = $matches[1];
        }
    }
    // Edge 检测
    elseif (stripos($agent, 'edg/') !== false || stripos($agent, 'edge') !== false) {
        $browser = 'Edge';
        $browser_icon = get_template_directory_uri() . '/assets/images/useragenticons/edge.svg';
        if (preg_match('/edg\/([\d\.]+)/i', $agent, $matches)) {
            $browser_version = $matches[1];
        } elseif (preg_match('/edge\/([\d\.]+)/i', $agent, $matches)) {
            $browser_version = $matches[1];
        }
    }
    // Chrome 检测（排除Edge，因为Edge也包含chrome字符串）
    elseif (stripos($agent, 'chrome') !== false) {
        $browser = 'Chrome';
        $browser_icon = get_template_directory_uri() . '/assets/images/useragenticons/chrome.svg';
        if (preg_match('/chrome\/([\d\.]+)/i', $agent, $matches)) {
            $browser_version = $matches[1];
        }
    }
    // Safari 检测（最后检测，因为很多浏览器都包含Safari字符串）
    elseif (stripos($agent, 'safari') !== false) {
        $browser = 'Safari';
        $browser_icon = get_template_directory_uri() . '/assets/images/useragenticons/safari.svg';
        if (preg_match('/version\/([\d\.]+)/i', $agent, $matches)) {
            $browser_version = $matches[1];
        }
    }
    // Opera 检测
    elseif (stripos($agent, 'opera') !== false || stripos($agent, 'opr/') !== false) {
        $browser = 'Opera';
        $browser_icon = get_template_directory_uri() . '/assets/images/useragenticons/opera.svg';
        if (preg_match('/opr\/([\d\.]+)/i', $agent, $matches)) {
            $browser_version = $matches[1];
        } elseif (preg_match('/opera\/([\d\.]+)/i', $agent, $matches)) {
            $browser_version = $matches[1];
        }
    }

    return [
        'os'      => $os,
        'os_icon' => $os_icon,
        'os_version' => $os_version,
        'browser' => $browser,
        'browser_icon' => $browser_icon,
        'browser_version' => $browser_version,
        'user_agent' => $agent, // 添加原始User Agent用于调试
    ];
}

/**
 * 加载邮件模板
 */
require_once get_template_directory() . '/inc/inc-comment-email.php';

/**
 * 评论回复通知邮件 - 通知父评论作者
 */
function westlife_notify_comment_reply($comment_id, $comment = null)
{
    if (!$comment) {
        $comment = get_comment($comment_id);
    }

    westlife_comment_debug_log('[邮件通知] 回复通知触发, 评论ID: ' . $comment_id);

    // 检查评论状态和父评论
    if (!$comment || $comment->comment_approved != '1' || !$comment->comment_parent) {
        westlife_comment_debug_log('[邮件通知] 跳过 - 未审核或非回复评论');
        return;
    }
    $parent = get_comment($comment->comment_parent);
    if (!$parent || !$parent->comment_author_email) {
        westlife_comment_debug_log('[邮件通知] 跳过 - 父评论无效或无邮箱');
        return;
    }
    if ($parent->comment_author_email === $comment->comment_author_email) {
        westlife_comment_debug_log('[邮件通知] 跳过 - 自己回复自己');
        return;
    }

    westlife_comment_debug_log('[邮件通知] 准备发送回复通知给: ' . $parent->comment_author_email);

    // 使用新的邮件模板
    $post_title = get_the_title($comment->comment_post_ID);
    $comment_link = get_comment_link($comment_id);

    $result = westlife_send_reply_notification_email($parent, $comment, $post_title, $comment_link);

    if ($result) {
        westlife_comment_debug_log('[调试] 评论回复邮件发送成功: ' . $parent->comment_author_email);
    } else {
        westlife_comment_debug_log('[调试] 评论回复邮件发送失败: ' . $parent->comment_author_email);
    }
    return $result;
}

/**
 * 新评论通知管理员
 */
function westlife_notify_admin_new_comment($comment_id, $comment = null)
{
    if (!$comment) {
        $comment = get_comment($comment_id);
    }

    westlife_comment_debug_log('[邮件通知] 新评论通知管理员触发, 评论ID: ' . $comment_id);

    // 如果评论者是管理员，不发送通知
    if ($comment->user_id && user_can($comment->user_id, 'manage_options')) {
        westlife_comment_debug_log('[邮件通知] 跳过 - 管理员自己的评论');
        return;
    }

    // 检查评论者邮箱是否是管理员邮箱
    $admin_email = get_option('admin_email');
    if ($comment->comment_author_email === $admin_email) {
        westlife_comment_debug_log('[邮件通知] 跳过 - 管理员邮箱评论');
        return;
    }

    westlife_comment_debug_log('[邮件通知] 准备发送新评论通知给管理员: ' . $admin_email);

    // 使用新的邮件模板
    $post_title = get_the_title($comment->comment_post_ID);
    $edit_link = admin_url('comment.php?action=editcomment&c=' . $comment_id);
    $view_link = get_comment_link($comment_id);

    westlife_send_admin_notification_email($comment, $post_title, $edit_link, $view_link);
}

/**
 * 评论审核通知 - 当评论从待审核变为通过时通知评论者
 */
function westlife_notify_comment_status($new_status, $old_status, $comment)
{
    westlife_comment_debug_log('[邮件通知] 评论状态变更: ' . $old_status . ' -> ' . $new_status);

    // 只在从其他状态变为 approved 时发送通知
    if ($new_status !== 'approved' || $old_status === 'approved') {
        westlife_comment_debug_log('[邮件通知] 跳过 - 非审核通过或已通过');
        return;
    }

    if (!$comment->comment_author_email) {
        westlife_comment_debug_log('[邮件通知] 跳过 - 无评论者邮箱');
        return;
    }

    westlife_comment_debug_log('[邮件通知] 准备发送审核通过通知给: ' . $comment->comment_author_email);

    // 使用新的邮件模板
    $post_title = get_the_title($comment->comment_post_ID);
    $comment_link = get_comment_link($comment->comment_ID);

    westlife_send_approved_notification_email($comment, $post_title, $comment_link);
}

/**
 * 加载评论相关资源
 */
function westlife_enqueue_comment_assets()
{
    if (!is_singular() || !comments_open()) {
        return;
    }

    $use_dist = function_exists('westlife_should_use_dist_assets') ? westlife_should_use_dist_assets() : false;
    $has_app_bundle = function_exists('westlife_has_app_bundle') && westlife_has_app_bundle();
    $has_comment_css = $use_dist && function_exists('westlife_has_dist_asset') && westlife_has_dist_asset('comment.css');
    $has_comment_js = $use_dist && function_exists('westlife_has_dist_asset') && westlife_has_dist_asset('comment.js');
    $script_handle = function_exists('westlife_get_frontend_script_handle') ? westlife_get_frontend_script_handle() : 'westlife-comment';

    // 评论基础样式和脚本
    if ($has_app_bundle) {
        // app.css 已包含评论与 turnstile 样式
    } elseif ($has_comment_css) {
        wp_enqueue_style('westlife-comment', westlife_get_dist_asset_uri('comment.css'), [], westlife_get_dist_asset_version('comment.css'));
    } else {
        wp_enqueue_style('westlife-comment', get_template_directory_uri() . '/assets/css/comment.css', [], '2.0.0');
    }

    // Turnstile验证码模块（独立）
    if (!$has_app_bundle && !$has_comment_css) {
        wp_enqueue_style('westlife-turnstile', get_template_directory_uri() . '/assets/modules/turnstile/turnstile.css', [], '2.0.0');
    }
    if (!$has_app_bundle && !$has_comment_js) {
        wp_enqueue_script('westlife-turnstile', get_template_directory_uri() . '/assets/modules/turnstile/turnstile.js', [], '2.0.0', true);
    }

    // 评论脚本（依赖Turnstile）
    if ($has_app_bundle) {
        // app.js 已包含评论与 turnstile 脚本
    } elseif ($has_comment_js) {
        $deps = ['jquery'];
        if ($use_dist && function_exists('westlife_has_dist_asset') && westlife_has_dist_asset('core.js')) {
            $deps[] = 'westlife-core';
        }
        wp_enqueue_script('westlife-comment', westlife_get_dist_asset_uri('comment.js'), $deps, westlife_get_dist_asset_version('comment.js'), true);
    } else {
        wp_enqueue_script('westlife-comment', get_template_directory_uri() . '/assets/js/comment.js', ['jquery', 'westlife-turnstile'], '2.0.0', true);
    }

    wp_localize_script($script_handle, 'westlifeComment', [
        'ajaxUrl' => admin_url('admin-ajax.php'),
        'nonce'   => wp_create_nonce('westlife_comment_nonce'),
        // 为通用 AJAX（如头像获取）提供独立的校验 nonce
        'ajaxNonce' => wp_create_nonce('westlife_ajax_nonce'),
        'config'  => [
            'postId'           => get_the_ID(),
            'enableLoadMore'   => true,
            'loadThreshold'    => 100,
            'maxLength'        => 1000
        ],
        'i18n'    => [
            'loading'   => __('加载中...', 'westlife'),
            'success'   => __('评论提交成功！', 'westlife'),
            'waiting'   => __('评论已提交，等待审核！', 'westlife'),
            'error'     => __('评论提交失败', 'westlife'),
            'loadError' => __('加载评论失败', 'westlife')
        ]
    ]);
}

/**
 * 垃圾评论检测 - 精简版
 * WordPress 自己有 Akismet 等插件，这里只做最基本的检查
 */
function westlife_check_comment_spam($commentdata)
{
    // 基本的频率限制（防止恶意刷评论）
    if (!is_user_logged_in()) {
        $last_comment = get_comments(array(
            'author_email' => $commentdata['comment_author_email'],
            'number'       => 1,
            'status'       => 'all'
        ));

        if (!empty($last_comment)) {
            $time_diff = time() - strtotime($last_comment[0]->comment_date_gmt);
            if ($time_diff < 10) {  // 10秒内不能重复评论
                throw new Exception('评论太频繁，请稍后再试');
            }
        }
    }

    return false;  // 其他检测交给 WordPress 和 Akismet
}

/**
 * 评论 GeoIP 缓存 meta keys
 */
function westlife_get_comment_geoip_meta_keys()
{
    return [
        'city'         => '_westlife_comment_geo_city',
        'region'       => '_westlife_comment_geo_region',
        'country'      => '_westlife_comment_geo_country',
        'country_code' => '_westlife_comment_geo_country_code',
        'source_ip'    => '_westlife_comment_geo_source_ip',
        'version'      => '_westlife_comment_geo_version',
        'updated_at'   => '_westlife_comment_geo_updated_at',
    ];
}

function westlife_get_comment_geoip_cache_version()
{
    return '2';
}

/**
 * 读取评论 GeoIP 缓存
 */
function westlife_read_comment_geoip_cache($comment_id)
{
    $comment_id = (int) $comment_id;
    if ($comment_id <= 0) {
        return [];
    }

    $keys = westlife_get_comment_geoip_meta_keys();
    $data = [
        'city' => trim((string) get_comment_meta($comment_id, $keys['city'], true)),
        'region' => trim((string) get_comment_meta($comment_id, $keys['region'], true)),
        'country' => trim((string) get_comment_meta($comment_id, $keys['country'], true)),
        'country_code' => trim((string) get_comment_meta($comment_id, $keys['country_code'], true)),
        'source_ip' => trim((string) get_comment_meta($comment_id, $keys['source_ip'], true)),
        'version' => trim((string) get_comment_meta($comment_id, $keys['version'], true)),
    ];

    if (!empty($data['city']) || !empty($data['region']) || !empty($data['country']) || !empty($data['country_code'])) {
        return $data;
    }

    return [];
}

/**
 * 写入评论 GeoIP 缓存
 */
function westlife_update_comment_geoip_cache($comment_id, $ip = '')
{
    $comment_id = (int) $comment_id;
    if ($comment_id <= 0 || !function_exists('westlife_fetch_geoip_by_ip')) {
        return [];
    }

    if ($ip === '') {
        $comment = get_comment($comment_id);
        if (!$comment) {
            return [];
        }
        $ip = trim((string) $comment->comment_author_IP);
    }

    if ($ip === '') {
        return [];
    }

    try {
        $geo = westlife_fetch_geoip_by_ip($ip);
    } catch (Throwable $e) {
        return [];
    }

    if (!is_array($geo)) {
        return [];
    }

    $city = sanitize_text_field((string) ($geo['city'] ?? ''));
    $region = sanitize_text_field((string) ($geo['region'] ?? ($geo['regionName'] ?? '')));
    $country = sanitize_text_field((string) ($geo['country'] ?? ($geo['country_name'] ?? '')));
    $country_code = sanitize_text_field((string) ($geo['country_code'] ?? ($geo['countryCode'] ?? '')));

    if (function_exists('westlife_normalize_country_code')) {
        $country_code = westlife_normalize_country_code($country_code);
    }

    if ($country_code === '' && $country !== '' && function_exists('westlife_country_name_to_code') && function_exists('westlife_normalize_country_code')) {
        $country_code = westlife_normalize_country_code(westlife_country_name_to_code($country));
    }

    if ($city === '' && $region === '' && $country === '' && $country_code === '') {
        return [];
    }

    $keys = westlife_get_comment_geoip_meta_keys();
    update_comment_meta($comment_id, $keys['city'], $city);
    update_comment_meta($comment_id, $keys['region'], $region);
    update_comment_meta($comment_id, $keys['country'], $country);
    update_comment_meta($comment_id, $keys['country_code'], $country_code);
    update_comment_meta($comment_id, $keys['source_ip'], $ip);
    update_comment_meta($comment_id, $keys['version'], westlife_get_comment_geoip_cache_version());
    update_comment_meta($comment_id, $keys['updated_at'], time());

    return [
        'city' => $city,
        'region' => $region,
        'country' => $country,
        'country_code' => $country_code,
        'source_ip' => $ip,
        'version' => westlife_get_comment_geoip_cache_version(),
    ];
}

/**
 * 获取评论 GeoIP 信息（优先缓存，缺失时懒加载）
 */
function westlife_get_comment_geoip_info($comment)
{
    $comment = get_comment($comment);
    if (!$comment instanceof WP_Comment) {
        return [];
    }

    $comment_ip = trim((string) $comment->comment_author_IP);
    $cached = westlife_read_comment_geoip_cache($comment->comment_ID);
    if (
        !empty($cached) &&
        $comment_ip !== '' &&
        !empty($cached['source_ip']) &&
        $cached['source_ip'] === $comment_ip &&
        !empty($cached['version']) &&
        $cached['version'] === westlife_get_comment_geoip_cache_version()
    ) {
        return $cached;
    }

    return westlife_update_comment_geoip_cache($comment->comment_ID, $comment_ip);
}

/**
 * 新评论写入 GeoIP 缓存
 */
function westlife_prime_comment_geoip_cache($comment_id)
{
    westlife_update_comment_geoip_cache((int) $comment_id);
}
add_action('comment_post', 'westlife_prime_comment_geoip_cache', 20, 1);
add_action('edit_comment', 'westlife_prime_comment_geoip_cache', 20, 1);

/**
 * 友链缓存与匹配工具
 * - 从 WP Links（link_category 中的可见链接）加载，并缓存到主题 data/friends-cache.json
 * - 通过主机名匹配（忽略 www/子域差异，可按需拓展）
 */
function westlife_get_friends_cache_path()
{
    $theme_dir = get_stylesheet_directory();
    $data_dir  = trailingslashit($theme_dir) . 'data';
    if (!file_exists($data_dir)) {
        wp_mkdir_p($data_dir);
    }
    return trailingslashit($data_dir) . 'friends-cache.json';
}

function westlife_normalize_host($url)
{
    $host = parse_url($url, PHP_URL_HOST);
    if (!$host) return '';
    $host = strtolower($host);
    // 去掉常见前缀 www.
    if (strpos($host, 'www.') === 0) $host = substr($host, 4);
    return $host;
}

function westlife_refresh_friends_cache()
{
    // 获取 WordPress 链接（友情链接）列表
    if (!function_exists('get_bookmarks')) return [];
    $bookmarks = get_bookmarks([
        'category_name' => '', // 不限定分类，取可见的友链
        'orderby'       => 'name',
        'order'         => 'ASC',
        'hide_invisible' => 1,
    ]);
    $items = [];
    foreach ($bookmarks as $bm) {
        if (empty($bm->link_url)) continue;
        $items[] = [
            'name' => $bm->link_name,
            'url'  => $bm->link_url,
            'host' => westlife_normalize_host($bm->link_url),
        ];
    }
    $payload = [
        'generated_at' => time(),
        'items' => $items,
    ];
    $path = westlife_get_friends_cache_path();
    // 写入缓存文件
    if ($path) {
        // 尽量避免并发问题
        @file_put_contents($path, wp_json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }
    return $items;
}

function westlife_load_friends_cache($max_age_seconds = 3600)
{
    $path = westlife_get_friends_cache_path();
    if ($path && file_exists($path)) {
        $json = @file_get_contents($path);
        if ($json) {
            $data = json_decode($json, true);
            if (is_array($data) && isset($data['generated_at'], $data['items'])) {
                if (time() - intval($data['generated_at']) <= $max_age_seconds) {
                    return $data['items'];
                }
            }
        }
    }
    // 缓存不存在或过期，刷新
    return westlife_refresh_friends_cache();
}

function westlife_is_friend_url($author_url)
{
    $host = westlife_normalize_host($author_url);
    if (!$host) return false;
    $friends = westlife_load_friends_cache(3600); // 1 小时缓存
    foreach ($friends as $f) {
        if (empty($f['host'])) continue;
        if ($host === $f['host']) return true;
        // 宽松匹配：子域也认（如 blog.example.com 命中 example.com）
        if (substr($host, -strlen($f['host'])) === $f['host']) {
            return true;
        }
    }
    return false;
}

/**
 * 评论列表回调
 * 
 * @param WP_Comment $comment 评论对象
 * @param array $args 参数
 * @param int $depth 深度
 */
function westlife_comment_callback($comment, $args, $depth)
{
    if (!isset($GLOBALS['comment'])) {
        return;
    }

    $GLOBALS['comment'] = $comment;
    $is_reply          = ($comment->comment_parent != '0');
    $agent_info        = westlife_get_comment_agent_info($comment->comment_agent);
    $geo_info          = westlife_get_comment_geoip_info($comment);
    $geo_country       = trim((string) ($geo_info['country'] ?? ''));
    $geo_country_code  = strtoupper(trim((string) ($geo_info['country_code'] ?? '')));
    $geo_city          = trim((string) ($geo_info['city'] ?? ''));
    $geo_region        = trim((string) ($geo_info['region'] ?? ($geo_info['regionName'] ?? '')));
    $geo_full_parts    = array_filter([$geo_country, $geo_region, $geo_city]);
    $geo_full_label    = implode(' · ', $geo_full_parts);
    $is_cn_geo         = ($geo_country_code === 'CN' || $geo_country === '中国');

    if ($is_cn_geo) {
        $geo_label = $geo_city !== '' ? $geo_city : ($geo_region !== '' ? $geo_region : ($geo_country !== '' ? $geo_country : $geo_country_code));
    } else {
        $geo_label = $geo_country !== '' ? $geo_country : $geo_country_code;
    }

    if ($geo_full_label === '') {
        $geo_full_label = $geo_label;
    }

    $geo_flag_html = '';
    if (!empty($geo_info['country_code']) && function_exists('westlife_country_code_to_flag')) {
        $geo_flag_html = westlife_country_code_to_flag($geo_info['country_code'], $geo_full_label !== '' ? $geo_full_label : $geo_info['country_code']);
    }
?>

    <li <?php comment_class(['comment-item', $is_reply ? 'is-reply' : '']); ?> id="comment-<?php comment_ID(); ?>">
        <div class="comment-wrap">
            <div class="comment-main <?php echo $is_reply ? 'is-child' : ''; ?>">
                <div class="comment-avatar">
                    <?php
                    if ($args['avatar_size'] !== 0) {
                        echo get_avatar($comment, $args['avatar_size'], '', '', [
                            'class'   => 'avatar-img',
                        ]);
                    }
                    ?>
                </div>

                <div class="comment-bubble">
                    <div class="bubble-arrow"></div>
                    <div class="comment-header">
                        <div class="comment-meta">
                            <?php if (!$is_reply): ?>
                                <?php
                                $floor_index = isset($args['floor_index']) ? intval($args['floor_index']) : 0;
                                $floor_label = '';
                                if ($floor_index > 0) {
                                    if ($floor_index === 1) $floor_label = '沙发';
                                    elseif ($floor_index === 2) $floor_label = '板凳';
                                    elseif ($floor_index === 3) $floor_label = '地板';
                                    else $floor_label = '#' . $floor_index;
                                }
                                if ($floor_index > 0): ?>
                                    <span class="comment-floor<?php echo $floor_index <= 3 ? ' is-floor-' . $floor_index : ''; ?>" data-floor data-index="<?php echo esc_attr($floor_index); ?>"><?php echo esc_html($floor_label); ?></span>
                                <?php endif; ?>
                            <?php endif; ?>
                            <cite class="comment-author">
                                <?php echo get_comment_author_link();
                                // 管理员（登录用户）徽章：改为蓝色 badge-check，无悬浮信息
                                if ($comment->user_id) {
                                    echo '<i class="fa-solid fa-badge-check author-badge" aria-hidden="true"></i>';
                                } else {
                                    // 友链博主徽章：根据评论者网址命中友情链接列表则加星标
                                    if (function_exists('westlife_is_friend_url')) {
                                        $author_url = isset($comment->comment_author_url) ? trim($comment->comment_author_url) : '';
                                        if ($author_url && westlife_is_friend_url($author_url)) {
                                            echo '<i class="fa-solid fa-circle-star friend-badge" title="friends of author" aria-label="friends of author"></i>';
                                        }
                                    }
                                }
                                ?>
                            </cite>
                            <span class="comment-meta-right">
                                <span class="comment-info">
                                    <span class="comment-time" datetime="<?php echo get_comment_date('c'); ?>" title="<?php echo esc_attr(get_comment_date('Y-m-d H:i:s')); ?>">
                                        <img src="<?php echo get_template_directory_uri() . '/assets/images/icons/clock.svg'; ?>" alt="时间" class="comment-time-icon">
                                        <?php
                                        $time_diff = westlife_human_time_diff(get_comment_time('U', true, $comment));  // 统一使用站点当前时间基准
                                        echo sprintf('%s前', str_replace(' ', '', $time_diff));
                                        ?>
                                    </span>
                                    <span class="comment-os-info"
                                        title="<?php echo esc_attr($agent_info['os'] . (!empty($agent_info['os_version']) ? ' ' . $agent_info['os_version'] : '')); ?>"
                                        data-os="<?php echo esc_attr($agent_info['os']); ?>"
                                        data-version="<?php echo esc_attr($agent_info['os_version']); ?>"
                                        data-full="<?php echo esc_attr($agent_info['os'] . (!empty($agent_info['os_version']) ? ' ' . $agent_info['os_version'] : '')); ?>">
                                        <img src="<?php echo esc_url($agent_info['os_icon']); ?>" alt="<?php echo esc_attr($agent_info['os']); ?>">
                                        <?php
                                        // 只显示系统名称，详细信息通过悬浮显示
                                        echo esc_html($agent_info['os']);
                                        ?>
                                    </span>
                                    <span class="comment-browser-info"
                                        title="<?php echo esc_attr($agent_info['browser'] . (!empty($agent_info['browser_version']) ? ' ' . $agent_info['browser_version'] : '')); ?>"
                                        data-browser="<?php echo esc_attr($agent_info['browser']); ?>"
                                        data-version="<?php echo esc_attr($agent_info['browser_version']); ?>"
                                        data-full="<?php echo esc_attr($agent_info['browser'] . (!empty($agent_info['browser_version']) ? ' ' . $agent_info['browser_version'] : '')); ?>">
                                        <img src="<?php echo esc_url($agent_info['browser_icon']); ?>" alt="<?php echo esc_attr($agent_info['browser']); ?>">
                                        <?php
                                        // 只显示浏览器名称，详细信息通过悬浮显示
                                        echo esc_html($agent_info['browser']);
                                        ?>
                                    </span>
                                    <?php if ($geo_flag_html !== '' || $geo_label !== '') : ?>
                                        <span class="comment-geo-info" title="<?php echo esc_attr($geo_full_label !== '' ? $geo_full_label : ($geo_info['country_code'] ?? '')); ?>">
                                            <?php if ($geo_flag_html !== '') : ?>
                                                <span class="comment-geo-flag"><?php echo $geo_flag_html; ?></span>
                                            <?php endif; ?>
                                            <?php if ($geo_label !== '') : ?>
                                                <span class="comment-geo-label"><?php echo esc_html($geo_label); ?></span>
                                            <?php elseif (!empty($geo_info['country_code'])) : ?>
                                                <span class="comment-geo-label"><?php echo esc_html($geo_info['country_code']); ?></span>
                                            <?php endif; ?>
                                        </span>
                                    <?php endif; ?>
                                    <?php if (current_user_can('manage_options') && !empty($agent_info['user_agent'])) : ?>
                                        <span class="comment-debug-info u-hidden" title="User Agent调试信息"><!-- migrated: inline display:none -> u-hidden -->
                                            <small style="color:#666;font-size:10px;"><?php echo esc_html(substr($agent_info['user_agent'], 0, 100)) . '...'; ?></small>
                                        </span>
                                    <?php endif; ?>
                                </span>
                            </span>
                        </div>
                        <?php if (comments_open()) : ?>
                            <div class="comment-reply move-bottom">
                                <a href="#respond"
                                    class="comment-reply-link"
                                    data-commentid="<?php comment_ID(); ?>"
                                    data-postid="<?php echo get_the_ID(); ?>"
                                    data-belowelement="comment-<?php comment_ID(); ?>"
                                    data-respondelement="respond"
                                    data-replyto="<?php comment_author(); ?>"
                                    aria-label="回复给<?php comment_author(); ?>">
                                    <i class="fas fa-reply"></i>
                                    <span>回复</span>
                                </a>
                            </div>
                        <?php endif; ?>
                    </div>

                    <div class="comment-content">
                        <span>
                            <?php
                            $comment_content = get_comment_text();

                            // 如果是回复，拼接带链接的@父评论
                            if ($comment->comment_parent) {
                                $parent_comment = get_comment($comment->comment_parent);
                                if ($parent_comment) {
                                    $parent_author = $parent_comment->comment_author;
                                    $parent_link = get_comment_link($parent_comment);
                                    // 输出带链接的@父评论
                                    echo '<a class="reply-to" href="' . esc_url($parent_link) . '">@' . esc_html($parent_author) . '</a> '; // 修改：删除了：
                                    // 去除内容中的@父评论前缀
                                    $patterns = [
                                        '/^@' . preg_quote($parent_author, '/') . '[:：]\s*/',
                                        '/^回复\s*@' . preg_quote($parent_author, '/') . '[:：]\s*/',
                                        '/^回复给\s*' . preg_quote($parent_author, '/') . '[:：]\s*/'
                                    ];
                                    foreach ($patterns as $pattern) {
                                        $comment_content = preg_replace($pattern, '', $comment_content);
                                    }
                                }
                            }
                            // 输出评论内容
                            echo wp_kses_post($comment_content);
                            ?>
                        </span>
                    </div>
                </div>
            </div>
        </div>
    </li>

<?php
}

/**
 * 设置评论者 Cookie
 * 
 * @param WP_Comment $comment 评论对象
 * @param array $commentdata 评论数据
 */
function westlife_set_comment_cookies($comment, $commentdata)
{
    $commenter = wp_get_current_commenter();
    $secure    = is_ssl();

    setcookie('comment_author_' . COOKIEHASH, $commenter['comment_author'], time() + YEAR_IN_SECONDS, COOKIEPATH, COOKIE_DOMAIN, $secure);
    setcookie('comment_author_email_' . COOKIEHASH, $commenter['comment_author_email'], time() + YEAR_IN_SECONDS, COOKIEPATH, COOKIE_DOMAIN, $secure);
    setcookie('comment_author_url_' . COOKIEHASH, esc_url($commenter['comment_author_url']), time() + YEAR_IN_SECONDS, COOKIEPATH, COOKIE_DOMAIN, $secure);
}

/**
 * 构建评论表单顶部信息栏
 */
function westlife_get_comment_form_intro_markup()
{
    $welcome_right = '<span class="welcome-text">欢迎交流观点，保持礼貌与理性。</span>';

    ob_start();
?>
    <div class="compose-welcome compose-welcome--top comment-editor-status" aria-live="polite">
        <div class="welcome-left">
            <i class="fas fa-pen-nib" aria-hidden="true"></i>
            <span class="welcome-title">发表评论</span>
        </div>
        <div class="welcome-right">
            <?php echo $welcome_right; ?>
            <span class="reply-context-bar u-hidden"><i class="fas fa-reply" aria-hidden="true"></i><span class="reply-context-text"></span></span>
        </div>
    </div>
    <div class="reply-form-head only-profile header-main restore-card reply-form-head--inside">
        <?php if (is_user_logged_in()): ?>
            <?php $user = wp_get_current_user(); ?>
            <div class="logged-user-profile-bar">
                <div class="logged-user-content">
                    <div class="logged-user-avatar-wrap">
                        <?php echo get_avatar($user->ID, 42, '', '', ['class' => 'logged-user-avatar', 'loading' => 'lazy']); ?>
                    </div>
                    <span class="logged-user-text">
                        <span class="logged-user-name"><?php echo esc_html($user->display_name); ?></span>
                        <span class="logged-user-status">已登录，可直接发表评论</span>
                    </span>
                </div>
                <div class="logged-user-actions">
                    <a href="<?php echo esc_url(wp_logout_url(get_permalink())); ?>" class="logout-btn icon-btn" title="退出登录" aria-label="退出登录">
                        <i class="fas fa-sign-out-alt" aria-hidden="true"></i>
                        <span class="sr-only">退出</span>
                    </a>
                </div>
            </div>
        <?php else: ?>
            <div class="comment-profile-slot" aria-label="访客资料"></div>
        <?php endif; ?>
        <a rel="nofollow" href="#respond" class="cancel-reply-inline u-hidden" aria-label="取消回复">
            <i class="fas fa-times" aria-hidden="true"></i>
            <span class="sr-only">取消回复</span>
        </a>
    </div>
    <?php if (!is_user_logged_in()): ?>
        <div class="comment-form-info comment-form-info--migrated u-hidden"></div>
    <?php endif; ?>
<?php
    return ob_get_clean();
}

/**
 * 构建评论表单游客字段
 */
function westlife_get_guest_fields_markup()
{
    if (is_user_logged_in()) {
        return '';
    }

    $commenter = wp_get_current_commenter();
    $req = get_option('require_name_email');
    $aria_req = $req ? " aria-required='true' required" : '';

    return sprintf(
        '<div class="guest-fields-top inline-guest-fields inline-guest-fields--inside minimal no-row boxed" aria-label="游客信息输入区" contenteditable="false"><div class="igf-field comment-form-author"><i class="fas fa-user igf-icon" aria-hidden="true"></i><input type="text" name="author" id="author" value="%s" placeholder="请输入昵称" autocomplete="name"%s /></div><div class="igf-field comment-form-email"><i class="fas fa-envelope igf-icon" aria-hidden="true"></i><input type="email" name="email" id="email" value="%s" placeholder="请输入邮箱" autocomplete="email"%s /></div><div class="igf-field comment-form-url"><i class="fas fa-globe igf-icon" aria-hidden="true"></i><input type="url" name="url" id="url" value="%s" placeholder="请输入网址" inputmode="url" autocomplete="url" /></div></div>',
        esc_attr($commenter['comment_author']),
        $aria_req,
        esc_attr($commenter['comment_author_email']),
        $aria_req,
        esc_url($commenter['comment_author_url'])
    );
}

function westlife_get_comment_form_fields()
{
    return [];
}

/**
 * 构建评论表单内容区
 */
function westlife_get_comment_form_comment_field()
{
    $guest_fields = westlife_get_guest_fields_markup();
    $intro_markup = westlife_get_comment_form_intro_markup();

    return $intro_markup . '<div class="comment-form-comment"><div class="textarea-wrapper has-bg-illustration">' . $guest_fields . '<div class="comment-editor-wrapper"><div id="comment-editor" class="comment-editor editor-modern" contenteditable="true" data-placeholder=""><div class="editor-typing-zone" data-role="typing-zone"></div></div></div><textarea id="comment" class="comment-textarea-hidden" name="comment" rows="4" placeholder="" aria-hidden="true" required="required"></textarea><input type="hidden" id="wp-comment-cookies-consent" name="wp-comment-cookies-consent" value="yes">' . wp_nonce_field('westlife_comment_nonce', 'comment_nonce', true, false) . '</div></div>';
}

/**
 * 生成基于 WordPress 标准 comment_form() 的参数
 */
function westlife_get_comment_form_args()
{
    return [
        'class_form'            => 'comment-form',
        'comment_notes_before'  => '',
        'comment_notes_after'   => '',
        'logged_in_as'          => '',
        'title_reply'           => '',
        'title_reply_to'        => '',
        'title_reply_before'    => '<h3 id="reply-title" class="comment-reply-title u-hidden">',
        'title_reply_after'     => '</h3>',
        'cancel_reply_link'     => '',
        'fields'                => westlife_get_comment_form_fields(),
        'comment_field'         => westlife_get_comment_form_comment_field(),
        'submit_button'         => '<div class="comment-actions"><button name="%1$s" type="submit" id="%2$s" class="%3$s submit-comment" aria-label="提交评论"><span class="submit-text">%4$s</span><span class="submit-icon"><i class="fas fa-circle-notch"></i></span></button></div>',
        'submit_field'          => '%1$s%2$s',
        'class_submit'          => 'submit',
        'label_submit'          => '发表评论',
    ];
}

/**
 * AJAX评论提交处理
 */
function westlife_ajax_comment_submit()
{
    try {
        // 基本安全验证
        if (!check_ajax_referer('westlife_comment_nonce', 'comment_nonce', false)) {
            throw new Exception('安全验证失败');
        }

        $request = wp_unslash($_POST);
        $comment_content = $request['comment'] ?? '';

        if (empty($comment_content)) {
            throw new Exception('请填写评论内容');
        }

        $request['comment'] = $comment_content;

        $comment_data = array(
            'comment_post_ID'       => intval($request['comment_post_ID'] ?? 0),
            'comment_parent'        => intval($request['comment_parent'] ?? 0),
            'comment_content'       => $comment_content,
            'comment_author'        => '',
            'comment_author_email'  => '',
            'comment_author_url'    => '',
        );

        if (is_user_logged_in()) {
            $user = wp_get_current_user();
            $comment_data['comment_author'] = $user->display_name;
            $comment_data['comment_author_email'] = $user->user_email;
            $comment_data['comment_author_url'] = $user->user_url;
        } else {
            if (empty($request['author']) || empty($request['email'])) {
                throw new Exception('请填写昵称和邮箱');
            }
            $comment_data['comment_author'] = $request['author'];
            $comment_data['comment_author_email'] = $request['email'];
            $comment_data['comment_author_url'] = $request['url'] ?? '';
        }

        // 频率检查
        westlife_check_comment_spam($comment_data);

        // 走 WordPress 标准评论提交流程，确保审核/反垃圾/钩子一致
        $comment = wp_handle_comment_submission($request);
        if (is_wp_error($comment)) {
            throw new Exception($comment->get_error_message());
        }

        $comment = get_comment($comment->comment_ID);
        if (!$comment) {
            throw new Exception('获取评论数据失败');
        }

        $GLOBALS['comment'] = $comment;
        $is_approved = ('1' === (string) $comment->comment_approved);

        // 计算全局楼层索引（仅顶级评论使用；回复为 0；ASC：最新顶级评论为最大索引 = 总数）
        $floor_index = 0;
        if ($is_approved && intval($comment->comment_parent) === 0) {
            $floor_index = get_comments([
                'post_id' => $comment->comment_post_ID,
                'status' => 'approve',
                'parent' => 0,
                'count' => true,
                'type' => 'comment'
            ]);
            $floor_index = intval($floor_index); // 最新顶级评论在 DESC 视图下为最大索引
        }

        $comment_html = '';
        if ($is_approved) {
            ob_start();
            westlife_comment_callback($comment, array(
                'avatar_size' => 40,
                'max_depth' => 2,
                'style'     => 'ol',
                'short_ping' => true,
                'type'      => 'comment',
                'reply_text' => '<i class="fas fa-reply"></i><span>回复</span>',
                'floor_index' => $floor_index,
            ), 1);
            $comment_html = ob_get_clean();

            if (empty(trim($comment_html))) {
                westlife_comment_debug_log('Comment HTML generation failed for comment ID: ' . $comment->comment_ID);
                throw new Exception('生成评论HTML失败');
            }
        }

        wp_send_json_success(array(
            'comment_id' => $comment->comment_ID,
            'comment_html' => $comment_html,
            'approved' => $is_approved ? 1 : 0,
            'total_count' => get_comments_number($comment->comment_post_ID),
            'unique_count' => function_exists('westlife_get_unique_commenters_count')
                ? westlife_get_unique_commenters_count($comment->comment_post_ID)
                : 0,
            'message' => $is_approved ? '评论提交成功！' : '评论已提交，等待审核！'
        ));
    } catch (Exception $e) {
        westlife_comment_debug_log('Comment submission error: ' . $e->getMessage());
        wp_send_json_error(array(
            'notification' => array(
                'text' => $e->getMessage(),
                'type' => 'error',
                'duration' => 5000
            )
        ));
    }
}

/**
 * AJAX 加载更多评论
 */
function westlife_load_more_comments()
{
    try {
        if (!check_ajax_referer('westlife_comment_nonce', 'nonce', false)) {
            throw new Exception('安全验证失败');
        }

        $post_id = absint($_POST['post_id'] ?? 0);
        $page = absint($_POST['page'] ?? 1);

        if (!$post_id) {
            throw new Exception('缺少文章ID');
        }

        // 固定每页20条（仅顶级评论）
        $comments_per_page = 20;
        $offset = ($page - 1) * $comments_per_page;

        // 获取顶级评论（ASC：最旧在上）
        $comments = get_comments([
            'post_id' => $post_id,
            'status' => 'approve',
            'order' => 'ASC',
            'orderby' => 'comment_date_gmt',
            'number' => $comments_per_page,
            'offset' => $offset,
            'parent' => 0,  // 只获取顶级评论
            'type' => 'comment'
        ]);

        if (empty($comments)) {
            wp_send_json_success([
                'comments' => '',
                'has_more' => false,
                'loaded' => 0,
                'message' => '没有更多评论了'
            ]);
            return;
        }

        // 准备全局 $post 环境，确保 comments_open() 等依赖当前文章上下文的函数在回调内可用
        global $post;
        $prev_post = $post;
        $post = get_post($post_id);
        if ($post) {
            setup_postdata($post);
        }

        ob_start();

        // 计算总顶级评论数，用于全局楼层编号（最早=1，最新=总数）
        $total_parent_comments = get_comments([
            'post_id' => $post_id,
            'status' => 'approve',
            'parent' => 0,
            'count' => true,
            'type' => 'comment'
        ]);

        // 渲染评论树并标注全局楼层索引（按 ASC：本页第 i 条索引 = offset + i + 1）
        $i = 0;
        foreach ($comments as $comment_obj) {
            $GLOBALS['comment'] = $comment_obj;
            $floor_index = $offset + $i + 1;
            westlife_render_comment_tree($comment_obj, [
                'avatar_size' => 40,
                'max_depth' => 5,
                'style' => 'ol',
                'short_ping' => true,
                'type' => 'comment',
                'floor_index' => $floor_index,
            ], 1, 5);
            $i++;
        }

        $comments_html = ob_get_clean();

        // 恢复全局 $post
        if ($post) {
            wp_reset_postdata();
        } else {
            // 若未设置成功，至少恢复之前的引用
            $post = $prev_post;
        }

        // 计算是否还有更多（基于顶级评论）
        $has_more = ($offset + $comments_per_page) < intval($total_parent_comments);

        wp_send_json_success([
            'comments' => $comments_html,
            'has_more' => $has_more,
            'loaded' => count($comments),
            'total' => intval($total_parent_comments),
            'page' => $page,
            'per_page' => $comments_per_page,
            'message' => sprintf('成功加载 %d 条评论', count($comments))
        ]);
    } catch (Exception $e) {
        wp_send_json_error([
            'message' => $e->getMessage()
        ]);
    }
}

/**
 * 禁用 WordPress 默认评论分页
 */
function westlife_disable_comment_pagination()
{
    update_option('page_comments', 0);
}

/**
 * 渲染评论树
 */
function westlife_render_comment_tree($comment, $args, $depth = 1, $max_depth = 5)
{
    // 设置全局变量 - 关键修复！
    $GLOBALS['comment'] = $comment;

    westlife_comment_callback($comment, $args, $depth);

    if ($depth < $max_depth) {
        $children = get_comments([
            'parent' => $comment->comment_ID,
            'status' => 'approve',
            'order' => 'ASC',
            'orderby' => 'comment_date_gmt'
        ]);
        if (!empty($children)) {
            echo '<ol class="comment-children">';
            foreach ($children as $child_comment) {
                // 递归调用
                westlife_render_comment_tree($child_comment, $args, $depth + 1, $max_depth);
            }
            echo '</ol>';
        }
    }
}

// ============================================================================
// 钩子注册 - 只注册一次，避免冲突
// ============================================================================

// 评论通知邮件 - 使用正确的钩子
// 1. 回复通知：评论插入后立即检查是否需要通知父评论作者
add_action('wp_insert_comment', 'westlife_notify_comment_reply', 99, 2);

// 2. 新评论通知管理员：评论插入后通知
add_action('wp_insert_comment', 'westlife_notify_admin_new_comment', 10, 2);

// 3. 审核通过通知：当评论状态变更为通过时通知
add_action('transition_comment_status', 'westlife_notify_comment_status', 10, 3);

/**
 * 允许评论中使用img标签和相关HTML格式
 */
function westlife_allow_comment_html_tags($allowed)
{
    // 允许img标签及其属性
    $allowed['img'] = array(
        'src' => true,
        'alt' => true,
        'class' => true,
        'width' => true,
        'height' => true,
        'data-code' => true,
        'loading' => true,
    );

    // 允许strong, em, del, code等格式标签
    $allowed['strong'] = array();
    $allowed['b'] = array();
    $allowed['em'] = array();
    $allowed['i'] = array();
    $allowed['del'] = array();
    $allowed['code'] = array();
    $allowed['a'] = array(
        'href' => true,
        'target' => true,
        'rel' => true,
    );
    $allowed['blockquote'] = array();

    return $allowed;
}

// 评论功能
add_action('wp_insert_comment', 'westlife_set_comment_cookies', 10, 2);
add_action('wp_enqueue_scripts', 'westlife_enqueue_comment_assets');
add_filter('pre_comment_content', 'wp_kses_post'); // 允许评论中使用HTML
add_filter('comment_text_rss', 'wp_kses_post');
add_action('init', 'westlife_disable_comment_pagination');

// AJAX 动作
add_action('wp_ajax_westlife_ajax_comment_submit', 'westlife_ajax_comment_submit');
add_action('wp_ajax_nopriv_westlife_ajax_comment_submit', 'westlife_ajax_comment_submit');
add_action('wp_ajax_westlife_load_more_comments', 'westlife_load_more_comments');
add_action('wp_ajax_nopriv_westlife_load_more_comments', 'westlife_load_more_comments');
