<?php

/**
 * Westlife Turnstile - 验证码系统
 * Cloudflare风格的人机验证
 * 
 * @package Westlife
 * @since 2.0.0
 */

if (!defined('ABSPATH')) {
    exit;
}

if (!function_exists('westlife_turnstile_log')) {
    function westlife_turnstile_log($message)
    {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('[Turnstile] ' . $message);
        }
    }
}

/**
 * 生成验证码Token
 */
function westlife_generate_captcha_token()
{
    // 安全验证
    check_ajax_referer('westlife_ajax_nonce', 'nonce');

    try {
        // 生成随机token
        $token = wp_generate_password(32, false);
        $timestamp = time();
        $expires = $timestamp + 300; // 5分钟有效期

        // 存储到session
        if (!session_id()) {
            session_start();
        }

        $_SESSION['wl_captcha_token'] = $token;
        $_SESSION['wl_captcha_expires'] = $expires;
        $_SESSION['wl_captcha_timestamp'] = $timestamp;

        westlife_turnstile_log("生成Token: {$token} (有效期至: " . date('Y-m-d H:i:s', $expires) . ')');

        wp_send_json_success([
            'token' => $token,
            'expires' => $expires,
            'message' => '验证token生成成功'
        ]);
    } catch (Exception $e) {
        westlife_turnstile_log('生成Token失败: ' . $e->getMessage());
        wp_send_json_error([
            'message' => '验证失败，请重试'
        ]);
    }
}
add_action('wp_ajax_westlife_generate_captcha_token', 'westlife_generate_captcha_token');
add_action('wp_ajax_nopriv_westlife_generate_captcha_token', 'westlife_generate_captcha_token');

/**
 * 验证评论前的Token验证
 */
function westlife_verify_comment_captcha($commentdata)
{
    // 已登录用户不需要验证
    if (is_user_logged_in()) {
        return $commentdata;
    }

    // 检查邮箱是否为信任用户（已批准评论数 >= 3）
    $email = $commentdata['comment_author_email'];
    if (!empty($email)) {
        $approved_count = get_comments([
            'author_email' => $email,
            'status' => 'approve',
            'count' => true
        ]);

        if ($approved_count >= 3) {
            westlife_turnstile_log("信任用户跳过验证: {$email} (已批准评论数: {$approved_count})");
            return $commentdata; // 信任用户，跳过验证
        }
    }

    // 获取提交的token
    $submitted_token = isset($_POST['wl_captcha_token']) ? sanitize_text_field($_POST['wl_captcha_token']) : '';

    if (empty($submitted_token)) {
        westlife_turnstile_log('验证失败: 未提交Token');
        wp_die('请先完成人机验证', '验证失败', ['response' => 403]);
    }

    // 开启session
    if (!session_id()) {
        session_start();
    }

    // 验证token
    $stored_token = isset($_SESSION['wl_captcha_token']) ? $_SESSION['wl_captcha_token'] : '';
    $expires = isset($_SESSION['wl_captcha_expires']) ? intval($_SESSION['wl_captcha_expires']) : 0;

    if (empty($stored_token)) {
        westlife_turnstile_log('验证失败: Session中无Token');
        wp_die('验证已过期，请刷新页面重试', '验证失败', ['response' => 403]);
    }

    // 检查是否过期
    if (time() > $expires) {
        westlife_turnstile_log('验证失败: Token已过期');
        unset($_SESSION['wl_captcha_token'], $_SESSION['wl_captcha_expires'], $_SESSION['wl_captcha_timestamp']);
        wp_die('验证已过期，请刷新页面重试', '验证失败', ['response' => 403]);
    }

    // 验证token是否匹配
    if ($submitted_token !== $stored_token) {
        westlife_turnstile_log('验证失败: Token不匹配');
        wp_die('验证失败，请重新验证', '验证失败', ['response' => 403]);
    }

    // 验证成功，清除token（一次性使用）
    westlife_turnstile_log("验证成功: {$submitted_token}");
    unset($_SESSION['wl_captcha_token'], $_SESSION['wl_captcha_expires'], $_SESSION['wl_captcha_timestamp']);

    return $commentdata;
}
add_filter('preprocess_comment', 'westlife_verify_comment_captcha', 10, 1);

// 注意：westlife_get_approved_comment_count() 函数已在 inc-ajax.php 中定义

/**
 * 确保session在WordPress初始化时启动
 */
function westlife_start_session()
{
    if (!session_id()) {
        session_start();
    }
}
add_action('init', 'westlife_start_session', 1);
