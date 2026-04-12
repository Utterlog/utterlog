<?php
/**
 * LiMhy - 安全登录网关
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    处理管理员身份验证，集成防爆破延时与 CSRF 校验
 */
declare(strict_types=1);
require_once __DIR__ . '/../index.php';

if (isset($_SESSION['admin_user'])) {
    redirect('admin/dashboard');
}

$errorMsg = '';
$p = prefix();

// 1. 业务网关：POST 拦截与处理
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_POST['csrf_token']) || $_POST['csrf_token'] !== ($_SESSION['csrf_token'] ?? '')) {
        die('安全会话失效，请刷新页面重试。');
    }

    $user = clean($_POST['user'] ?? '', 50);
    $pass = $_POST['password'] ?? '';

    usleep(500000); // 增加时间常量，抵御自动化爆破

    if ($user !== '' && $pass !== '') {
        // 强制使用参数化查询获取 Hash 防御 SQL 注入
        $dbUser = db_row("SELECT `id`, `username`, `password`, `role` FROM `{$p}users` WHERE `username` = ? LIMIT 1", [$user]);

        if ($dbUser && password_verify($pass, $dbUser['password'])) {
            session_regenerate_id(true);
            $_SESSION['admin_user'] = $dbUser['username'];
            $_SESSION['admin_id'] = $dbUser['id'];
            $_SESSION['admin_role'] = $dbUser['role'];
            $_SESSION['user_agent_hash'] = md5($_SERVER['HTTP_USER_AGENT'] . (defined('AUTH_SALT') ? AUTH_SALT : ''));
            
            redirect('admin/dashboard');
        } else {
            $errorMsg = '身份凭证无效';
        }
    } else {
        $errorMsg = '请输入完整的身份凭证';
    }
}

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>控制台验证 - <?= e(defined('SITE_NAME') ? SITE_NAME : 'Admin') ?></title>
    <link rel="stylesheet" href="<?= asset('admin.css') ?>">
    <link href="https://cdn.bootcdn.net/ajax/libs/remixicon/3.5.0/remixicon.min.css" rel="stylesheet">
    <style>
        body {
            background-color: var(--color-bg-body); 
            display: flex; align-items: center; justify-content: center; min-height: 100vh; margin: 0; padding: 20px; box-sizing: border-box;
        }
        .login-wrapper { width: 100%; max-width: 400px; }
        .login-card {
            background: var(--color-bg-white); border: 1px solid var(--color-border); border-radius: var(--radius-m);
            padding: 40px 32px; box-shadow: 0 4px 20px rgba(0, 0, 0, 0.03);
        }
        .login-header { text-align: center; margin-bottom: 32px; }
        .login-logo {
            width: 48px; height: 48px; background: var(--color-primary); color: #fff; border-radius: 50%;
            display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 16px;
        }
        .login-title { font-size: 24px; font-weight: 600; color: var(--color-text-1); margin: 0 0 8px 0; letter-spacing: -0.5px; }
        .login-subtitle { font-size: 14px; color: var(--color-text-3); margin: 0; }
        .login-btn-full { width: 100%; height: 40px; font-size: 15px; margin-top: 12px; }
        .login-alert {
            background: var(--color-danger-bg); border: 1px solid rgba(245, 63, 63, 0.3); color: var(--color-danger);
            padding: 10px 16px; border-radius: var(--radius-m); font-size: 13px; margin-bottom: 20px; display: flex; align-items: center; gap: 8px; animation: shake 0.4s ease-in-out;
        }
        @keyframes shake { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-4px); } 75% { transform: translateX(4px); } }
        .login-footer { text-align: center; margin-top: 24px; font-size: 12px; color: var(--color-text-3); }
    </style>
</head>
<body>
<div class="login-wrapper">
    <div class="login-card">
        <div class="login-header">
            <div class="login-logo"><i class="ri-shield-keyhole-line"></i></div>
            <h1 class="login-title">验证身份</h1>
            <p class="login-subtitle">LiMhy 控制中心</p>
        </div>

        <?php if ($errorMsg): ?>
            <div class="login-alert"><i class="ri-error-warning-fill"></i><span><?= e($errorMsg) ?></span></div>
        <?php endif; ?>

        <form method="POST" action="">
            <input type="hidden" name="csrf_token" value="<?= e($_SESSION['csrf_token']) ?>">
            <div class="c-form__group">
                <label class="admin-stat__label">账号 (Username)</label>
                <div style="position: relative;">
                    <i class="ri-user-3-line" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--color-text-3); font-size:16px;"></i>
                    <input type="text" name="user" class="form-input" style="padding-left: 36px;" required autocomplete="username" autofocus>
                </div>
            </div>
            <div class="c-form__group">
                <label class="admin-stat__label">密码 (Password)</label>
                <div style="position: relative;">
                    <i class="ri-lock-password-line" style="position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--color-text-3); font-size:16px;"></i>
                    <input type="password" name="password" class="form-input" style="padding-left: 36px;" required autocomplete="current-password">
                </div>
            </div>
            <button type="submit" class="btn btn-primary login-btn-full">进入系统 <i class="ri-arrow-right-line"></i></button>
        </form>
    </div>
    <div class="login-footer">&copy; <?= date('Y') ?> LiMhy System. All rights reserved.</div>
</div>
</body>
</html>
