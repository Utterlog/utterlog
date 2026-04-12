<?php
declare(strict_types=1);
?><!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?= htmlspecialchars($pageTitle ?? ($siteTitle ?? 'LiMhy'), ENT_QUOTES, 'UTF-8') ?></title>
    <meta name="description" content="<?= htmlspecialchars($metaDescription ?? ($siteDescription ?? ''), ENT_QUOTES, 'UTF-8') ?>">
    <link rel="stylesheet" href="<?= htmlspecialchars(theme_asset('style.css'), ENT_QUOTES, 'UTF-8') ?>">
</head>
<body class="limhy-starter-body">
<header class="starter-header">
    <div class="starter-wrap">
        <div class="starter-brand">
            <span class="starter-logo">Li</span>
            <div>
                <strong><?= htmlspecialchars($siteTitle ?? 'LiMhy 演示站', ENT_QUOTES, 'UTF-8') ?></strong>
                <p>Official Starter Theme</p>
            </div>
        </div>
    </div>
</header>

<main class="starter-main">
    <div class="starter-wrap">
        <?= $content ?? '' ?>
    </div>
</main>

<footer class="starter-footer">
    <div class="starter-wrap">
        <p>Powered by LiMhy Theme Starter</p>
    </div>
</footer>

<script src="<?= htmlspecialchars(theme_asset('app.js'), ENT_QUOTES, 'UTF-8') ?>" defer></script>
</body>
</html>
