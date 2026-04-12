<?php
declare(strict_types=1);
require_once __DIR__ . '/../index.php';
require_admin();

$currentNav = 'backups';
$pageTitle = '备份文件管理';
$dataDir = ROOT . '/data';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $action = (string)($_POST['_action'] ?? '');
    $file = basename((string)($_POST['file'] ?? ''));
    $target = $dataDir . '/' . $file;

    if ($file === '' || strpos($file, '..') !== false || !is_file($target)) {
        set_flash('error', '目标备份文件不存在');
        redirect('admin/backups');
    }

    if ($action === 'download') {
        header('Content-Type: application/octet-stream');
        header('Content-Length: ' . (string)filesize($target));
        header('Content-Disposition: attachment; filename="' . rawurlencode($file) . '"');
        readfile($target);
        exit;
    }

    if ($action === 'delete') {
        @unlink($target);
        set_flash('success', '备份文件已删除');
        redirect('admin/backups');
    }
}

$files = [];
foreach (glob($dataDir . '/*') ?: [] as $file) {
    if (!is_file($file)) {
        continue;
    }
    $base = basename($file);
    if (!preg_match('/^(limhy_backup_.*\.sql|freshrss_cache\.json|last_backup\.time)$/', $base)) {
        continue;
    }
    $files[] = [
        'name' => $base,
        'size' => (int)filesize($file),
        'mtime' => date('Y-m-d H:i:s', (int)filemtime($file)),
        'type' => str_ends_with($base, '.sql') ? 'SQL 备份' : '运行缓存',
    ];
}
usort($files, static fn(array $a, array $b): int => strcmp($b['mtime'], $a['mtime']));

ob_start();
?>
<div class="card" style="padding:20px;">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px;">
        <div>
            <div class="card-title" style="margin-bottom:6px;">/data 备份与缓存文件</div>
            <div style="font-size:12px;color:var(--color-text-3);">只开放系统生成的 SQL 备份与聚合缓存，不暴露其它敏感文件。</div>
        </div>
        <a href="<?=url('admin/settings')?>" class="btn btn-ghost"><i class="ri-arrow-left-line"></i> 返回站点设置</a>
    </div>
    <div class="table-wrap">
        <table class="table">
            <thead>
                <tr>
                    <th>文件名</th>
                    <th>类型</th>
                    <th>大小</th>
                    <th>更新时间</th>
                    <th style="text-align:right;">操作</th>
                </tr>
            </thead>
            <tbody>
            <?php foreach ($files as $row): ?>
                <tr>
                    <td><?=e($row['name'])?></td>
                    <td><span class="badge" style="background:var(--color-fill);color:var(--color-text-2);"><?=e($row['type'])?></span></td>
                    <td><?=number_format($row['size'] / 1024, 2)?> KB</td>
                    <td><?=e($row['mtime'])?></td>
                    <td>
                        <div style="display:flex;gap:8px;justify-content:flex-end;">
                            <form method="POST" action="<?=url('admin/backups')?>">
                                <?=csrf_field()?>
                                <input type="hidden" name="_action" value="download">
                                <input type="hidden" name="file" value="<?=e($row['name'])?>">
                                <button type="submit" class="btn btn-ghost"><i class="ri-download-line"></i> 下载</button>
                            </form>
                            <form method="POST" action="<?=url('admin/backups')?>" onsubmit="return confirm('确认删除该备份文件？')">
                                <?=csrf_field()?>
                                <input type="hidden" name="_action" value="delete">
                                <input type="hidden" name="file" value="<?=e($row['name'])?>">
                                <button type="submit" class="btn btn-ghost is-danger"><i class="ri-delete-bin-line"></i> 删除</button>
                            </form>
                        </div>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php if ($files === []): ?>
        <div class="admin-empty">当前 /data 下还没有系统级备份文件</div>
    <?php endif; ?>
</div>
<?php
$content = ob_get_clean();
require __DIR__ . '/layout.php';
