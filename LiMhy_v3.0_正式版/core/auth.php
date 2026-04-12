<?php
/**
 * 管理员认证 — 基于 HMAC 签名 Cookie，不依赖 session
 */

declare(strict_types=1);

/**
 * 验证管理员密码
 */
function admin_verify(string $username, string $password): bool
{
    return $username === ADMIN_USER && password_verify($password, ADMIN_PASS_HASH);
}

/**
 * 设置登录 Cookie
 */
function admin_login(): void
{
    $expiry = time() + 86400 * 30; // 30 天
    $payload = ADMIN_USER . '|' . $expiry;
    $sig = hash_hmac('sha256', $payload, ADMIN_SECRET);
    $cookie = base64_encode($payload . '|' . $sig);

    setcookie('lm_auth', $cookie, [
        'expires'  => $expiry,
        'path'     => '/',
        'httponly'  => true,
        'samesite' => 'Lax',
        'secure'   => isset($_SERVER['HTTPS']),
    ]);
}

/**
 * 验证当前请求是否已登录管理员
 */
function is_admin(): bool
{
    $cookie = $_COOKIE['lm_auth'] ?? '';
    if (!$cookie) return false;

    $decoded = base64_decode($cookie, true);
    if (!$decoded) return false;

    $parts = explode('|', $decoded);
    if (count($parts) !== 3) return false;

    [$user, $expiry, $sig] = $parts;
    $expiry = (int)$expiry;

    // 过期检查
    if ($expiry < time()) return false;

    // 签名校验
    $expected = hash_hmac('sha256', $user . '|' . $expiry, ADMIN_SECRET);
    if (!hash_equals($expected, $sig)) return false;

    // 用户名校验
    return $user === ADMIN_USER;
}

/**
 * 要求管理员登录，否则跳转
 */
function require_admin(): void
{
    if (!is_admin()) {
        redirect('admin/login');
    }
}

/**
 * 退出登录
 */
function admin_logout(): void
{
    setcookie('lm_auth', '', [
        'expires'  => time() - 3600,
        'path'     => '/',
        'httponly'  => true,
        'samesite' => 'Lax',
    ]);
}