<?php
/**
 * LiMhy - 安全防御工具包
 * 
 * @package LiMhy
 * @author  Jason（QQ：895443171）
 * @desc    集成 XSS 防护、CSRF 令牌、输入净化与响应流控制
 */

declare(strict_types=1);

/**
 * XSS 防护：HTML 转义
 */
function e(string $s): string
{
    return htmlspecialchars($s, ENT_QUOTES | ENT_HTML5, 'UTF-8');
}

/**
 * CSRF 防御：生成令牌
 */
function csrf_token(): string
{
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    if (empty($_SESSION['_csrf'])) {
        $_SESSION['_csrf'] = bin2hex(random_bytes(32));
    }
    return $_SESSION['_csrf'];
}

function csrf_field(): string
{
    return '<input type="hidden" name="_csrf" value="' . csrf_token() . '">';
}

/**
 * CSRF 校验逻辑
 */
function verify_csrf(): bool
{
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $token = $_POST['_csrf'] ?? '';
    return $token && hash_equals($_SESSION['_csrf'] ?? '', $token);
}

function require_csrf(): void
{
    if (!verify_csrf()) {
        if (is_ajax()) json_response(['ok' => false, 'error' => '安全校验失败'], 403);
        set_flash('error', '安全校验失败');
        back();
    }
}

/**
 * 输入流净化：移除不可见控制字符并执行长度截断
 */
function clean(string $s, int $maxLen = 200): string
{
    $s = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $s);
    return mb_substr(trim($s), 0, $maxLen);
}

/**
 * AJAX 请求判定
 */
function is_ajax(): bool
{
    return !empty($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest';
}

/**
 * 原生 JSON 响应封装
 */
function json_response(array $data, int $code = 200): never
{
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE);
    exit;
}

/**
 * 闪存消息 (Flash Message) 管理
 */
function set_flash(string $type, string $msg): void
{
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $_SESSION['_flash'] = ['type' => $type, 'msg' => $msg];
}

function get_flash(): ?array
{
    if (session_status() !== PHP_SESSION_ACTIVE) session_start();
    $f = $_SESSION['_flash'] ?? null;
    unset($_SESSION['_flash']);
    return $f;
}

/**
 * 路由跳转工具
 */
function redirect(string $path): never
{
    header('Location: ' . SITE_URL . '/' . ltrim($path, '/'));
    exit;
}

function back(): never
{
    $ref = $_SERVER['HTTP_REFERER'] ?? SITE_URL;
    header('Location: ' . $ref);
    exit;
}

/**
 * 可信代理 IP 工具
 */
function limhy_is_valid_ip(string $ip): bool
{
    return filter_var($ip, FILTER_VALIDATE_IP) !== false;
}

function limhy_is_public_ip(string $ip): bool
{
    return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
}

function limhy_first_forwarded_ip(string $headerValue): ?string
{
    $parts = explode(',', $headerValue);
    $fallback = null;
    foreach ($parts as $part) {
        $ip = trim($part);
        if ($ip === '' || strcasecmp($ip, 'unknown') === 0) {
            continue;
        }
        if (!limhy_is_valid_ip($ip)) {
            continue;
        }
        if (limhy_is_public_ip($ip)) {
            return $ip;
        }
        if ($fallback === null) {
            $fallback = $ip;
        }
    }
    return $fallback;
}

function real_client_ip_from_headers(): ?string
{
    $headers = [
        'HTTP_CF_CONNECTING_IP',
        'HTTP_TRUE_CLIENT_IP',
        'HTTP_EO_CLIENT_IP',
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_REAL_IP',
        'HTTP_X_CLIENT_IP',
    ];

    foreach ($headers as $key) {
        $raw = $_SERVER[$key] ?? '';
        if (!is_string($raw) || trim($raw) === '') {
            continue;
        }

        $candidate = ($key === 'HTTP_X_FORWARDED_FOR') ? limhy_first_forwarded_ip($raw) : trim($raw);
        if ($candidate !== null && limhy_is_valid_ip($candidate)) {
            return $candidate;
        }
    }

    return null;
}

/**
 * 客户端 IP 获取 (支持可信 CDN / 反向代理)
 */
function client_ip(): string
{
    $remote = trim((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));
    if (!limhy_is_valid_ip($remote)) {
        $remote = '0.0.0.0';
    }

    if (!(defined('TRUST_PROXY_IP') && (int)TRUST_PROXY_IP === 1)) {
        return $remote;
    }

    $real = real_client_ip_from_headers();
    return $real !== null ? $real : $remote;
}


/**
 * 生成验证码并存储到 session
 */
function generate_captcha(): string {
    $captcha_code = rand(1000, 9999);  // Generate a 4-digit random code
    $_SESSION['captcha'] = $captcha_code;  // Store the captcha code in the session
    return $captcha_code;
}

/**
 * 验证验证码是否匹配
 */
function verify_captcha(string $user_input): bool {
    if (session_status() !== PHP_SESSION_ACTIVE) {
        session_start();
    }
    return isset($_SESSION['captcha']) && $_SESSION['captcha'] == $user_input;
}
