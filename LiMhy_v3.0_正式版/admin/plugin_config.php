<?php
declare(strict_types=1);
require_once __DIR__ . '/../index.php';
require_admin();
$slug = trim((string)($_GET['plugin'] ?? ''));
if ($slug === '') {
    set_flash('error', '缺少插件标识');
    redirect('admin/plugins');
}
redirect('admin/plugins?plugin_config=' . rawurlencode($slug));
