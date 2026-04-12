<?php

/**
 * SMTP 邮件配置
 * 配置 WordPress 使用 SMTP 发送邮件
 */

if (!defined('ABSPATH')) exit;

/**
 * 配置 PHPMailer 使用 SMTP
 */
function westlife_configure_smtp($phpmailer)
{
    // 检查是否启用 SMTP
    if (!get_option('smtp_enable')) {
        return;
    }

    $phpmailer->isSMTP();
    $phpmailer->Host       = get_option('smtp_host');
    $phpmailer->Port       = get_option('smtp_port', 465);
    $phpmailer->SMTPAuth   = true;
    $phpmailer->Username   = get_option('smtp_username');
    $phpmailer->Password   = get_option('smtp_password');

    // 设置加密方式
    $secure = get_option('smtp_secure', 'ssl');
    if ($secure === 'ssl') {
        $phpmailer->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_SMTPS;
    } elseif ($secure === 'tls') {
        $phpmailer->SMTPSecure = PHPMailer\PHPMailer\PHPMailer::ENCRYPTION_STARTTLS;
    } else {
        $phpmailer->SMTPSecure = '';
    }

    // 设置发件人
    $from_email = get_option('smtp_from_email');
    $from_name = get_option('smtp_from_name', get_bloginfo('name'));

    if ($from_email) {
        $phpmailer->setFrom($from_email, $from_name);
    }

    // 调试设置（可选，生产环境应关闭）
    // $phpmailer->SMTPDebug = 2; // 0 = off, 1 = client messages, 2 = client and server messages
    // $phpmailer->Debugoutput = 'error_log';

    // SMTP 选项
    $phpmailer->SMTPOptions = array(
        'ssl' => array(
            'verify_peer' => false,
            'verify_peer_name' => false,
            'allow_self_signed' => true
        )
    );
}
add_action('phpmailer_init', 'westlife_configure_smtp');

/**
 * 自定义邮件发件人地址
 */
function westlife_wp_mail_from($email)
{
    $smtp_from_email = get_option('smtp_from_email');
    if ($smtp_from_email) {
        return $smtp_from_email;
    }
    return $email;
}
add_filter('wp_mail_from', 'westlife_wp_mail_from');

/**
 * 自定义邮件发件人名称
 */
function westlife_wp_mail_from_name($name)
{
    $smtp_from_name = get_option('smtp_from_name');
    if ($smtp_from_name) {
        return $smtp_from_name;
    }
    return $name;
}
add_filter('wp_mail_from_name', 'westlife_wp_mail_from_name');

/**
 * 记录邮件发送错误
 */
function westlife_log_smtp_errors($wp_error)
{
    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('[SMTP Error] ' . $wp_error->get_error_message());
    }
}
add_action('wp_mail_failed', 'westlife_log_smtp_errors');

