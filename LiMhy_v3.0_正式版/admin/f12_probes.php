<?php
declare(strict_types=1);
require_once __DIR__ . '/../index.php';
require_admin();

$currentNav = 'f12_probes';
$pageTitle = 'F12 探针';

$filters = [
    'ip' => clean($_GET['ip'] ?? '', 100),
    'guid' => clean($_GET['guid'] ?? '', 120),
    'path' => clean($_GET['path'] ?? '', 200),
    'probe_reason' => clean($_GET['probe_reason'] ?? '', 100),
    'start_date' => clean($_GET['start_date'] ?? '', 20),
    'end_date' => clean($_GET['end_date'] ?? '', 20),
];
$page = max(1, (int)($_GET['page'] ?? 1));
$perPage = 20;
$allItems = function_exists('f12_probe_collect') ? f12_probe_collect($filters) : [];
$today = date('Y-m-d');
$uniqueIps = [];
$uniqueGuids = [];
$todayHits = 0;
foreach ($allItems as $row) {
    if (strpos((string)($row['time'] ?? ''), $today) === 0) {
        $todayHits++;
    }
    if (!empty($row['ip'])) {
        $uniqueIps[(string)$row['ip']] = true;
    }
    if (!empty($row['guid'])) {
        $uniqueGuids[(string)$row['guid']] = true;
    }
}
$summary = [
    'today_hits' => $todayHits,
    'total_hits' => count($allItems),
    'unique_ips' => count($uniqueIps),
    'unique_guids' => count($uniqueGuids),
];
$total = count($allItems);
$totalPages = max(1, (int)ceil($total / $perPage));
if ($page > $totalPages) { $page = $totalPages; }
$items = array_slice($allItems, ($page - 1) * $perPage, $perPage);
$fwCfg = class_exists('Firewall') ? Firewall::getConfig() : [];
$probeEnabled = !empty($fwCfg['enable_f12_probe']);

function f12_probe_build_query(array $extra = [], array $filters = []): string {
    $base = array_filter(array_merge($filters, $extra), static function ($v) { return $v !== '' && $v !== null; });
    return http_build_query($base);
}

ob_start();
?>
<style>
.probe-toolbar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:20px}.probe-stat{background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-l);padding:18px 20px}.probe-stat__label{font-size:12px;color:var(--color-text-3);margin-bottom:8px}.probe-stat__value{font-size:30px;font-weight:800;color:var(--color-text-1)}
.probe-card{background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-l);padding:20px;margin-bottom:20px}.probe-filter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.probe-input{width:100%;height:42px;border:1px solid var(--color-border);border-radius:10px;background:#fff;padding:0 12px;color:var(--color-text-1)}.probe-label{display:block;font-size:12px;color:var(--color-text-3);margin-bottom:8px}.probe-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.probe-list{background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-l);overflow:hidden}.probe-item{display:grid;grid-template-columns:64px 1fr auto;gap:16px;padding:18px 20px;border-bottom:1px solid var(--color-border)}.probe-item:last-child{border-bottom:none}.probe-avatar{width:56px;height:56px;border-radius:50%;background:var(--color-fill);border:1px solid var(--color-border);display:flex;align-items:center;justify-content:center;overflow:hidden;font-weight:800}.probe-avatar img{width:100%;height:100%;object-fit:cover}.probe-top{display:flex;gap:10px;flex-wrap:wrap;align-items:center}.probe-chip{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;background:var(--color-fill);font-size:12px;color:var(--color-text-2)}.probe-url,.probe-trail{margin-top:8px;font-size:13px;color:var(--color-text-2);word-break:break-all}.probe-side{display:flex;flex-wrap:wrap;gap:10px;justify-content:flex-end;align-items:center}.probe-side > div:last-child{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.probe-side .btn{white-space:nowrap}.probe-status{display:inline-flex;align-items:center;padding:6px 12px;border-radius:999px;font-size:12px;font-weight:700}.probe-empty{padding:48px 20px;text-align:center;color:var(--color-text-3)}.probe-pagination{display:flex;gap:8px;align-items:center;justify-content:flex-end;padding:16px 20px;border-top:1px solid var(--color-border);flex-wrap:wrap}.probe-pagination__meta{font-size:12px;color:var(--color-text-3)}@media(max-width:1100px){.probe-toolbar,.probe-filter-grid{grid-template-columns:1fr 1fr}.probe-item{grid-template-columns:56px 1fr}}@media(max-width:760px){.probe-toolbar,.probe-filter-grid{grid-template-columns:1fr}.probe-item{grid-template-columns:1fr}.probe-side{justify-content:flex-start}.probe-side > div:last-child{justify-content:flex-start}}
</style>
<div class="probe-card">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
        <div>
            <div class="card-title"><i class="ri-radar-line"></i> F12 探针</div>
            <div style="font-size:13px;color:var(--color-text-3);margin-top:6px;">独立记录前台访客打开开发者工具、触发快捷键、窥探页面结构等调试相关行为。此能力默认只做取证，不直接封禁。</div>
        </div>
        <span class="probe-status" style="<?= $probeEnabled ? 'background:rgba(34,197,94,.12);color:#15803d;' : 'background:rgba(148,163,184,.14);color:#475569;' ?>"><?= $probeEnabled ? '当前已启用' : '当前未启用' ?></span>
    </div>
</div>
<div class="probe-toolbar">
    <div class="probe-stat"><div class="probe-stat__label">今日命中</div><div class="probe-stat__value"><?= (int)$summary['today_hits'] ?></div></div>
    <div class="probe-stat"><div class="probe-stat__label">累计命中</div><div class="probe-stat__value"><?= (int)$summary['total_hits'] ?></div></div>
    <div class="probe-stat"><div class="probe-stat__label">独立 IP</div><div class="probe-stat__value"><?= (int)$summary['unique_ips'] ?></div></div>
    <div class="probe-stat"><div class="probe-stat__label">独立设备</div><div class="probe-stat__value"><?= (int)$summary['unique_guids'] ?></div></div>
</div>
<div class="probe-card">
    <form method="GET" action="<?= url('admin/f12-probes') ?>">
        <div class="probe-filter-grid">
            <div><label class="probe-label">IP</label><input class="probe-input" type="text" name="ip" value="<?= e($filters['ip']) ?>" placeholder="例如 1.2.3.4"></div>
            <div><label class="probe-label">GUID</label><input class="probe-input" type="text" name="guid" value="<?= e($filters['guid']) ?>" placeholder="例如 lm_xxxxx"></div>
            <div><label class="probe-label">页面路径 / URL</label><input class="probe-input" type="text" name="path" value="<?= e($filters['path']) ?>" placeholder="例如 /post/14"></div>
            <div><label class="probe-label">探针原因</label><input class="probe-input" type="text" name="probe_reason" value="<?= e($filters['probe_reason']) ?>" placeholder="例如 keyboard_f12"></div>
            <div><label class="probe-label">开始日期</label><input class="probe-input" type="date" name="start_date" value="<?= e($filters['start_date']) ?>"></div>
            <div><label class="probe-label">结束日期</label><input class="probe-input" type="date" name="end_date" value="<?= e($filters['end_date']) ?>"></div>
        </div>
        <div class="probe-actions">
            <button type="submit" class="btn btn-primary">筛选探针</button>
            <a class="btn btn-ghost" href="<?= url('admin/f12-probes') ?>">重置筛选</a>
            <a class="btn btn-ghost" href="<?= url('admin/firewall-settings') ?>">前往防御配置</a>
        </div>
    </form>
</div>
<?php if (!$probeEnabled): ?>
<div class="probe-card"><div style="font-size:13px;color:var(--color-text-3);">F12 探针当前未启用。请先前往 <a href="<?= url('admin/firewall-settings') ?>">主动防御系统配置</a> 打开“启用 F12 探针检测”。</div></div>
<?php endif; ?>
<div class="probe-list">
    <?php if (!$items): ?>
        <div class="probe-empty">当前筛选条件下暂无 F12 探针记录。</div>
    <?php else: ?>
        <?php foreach ($items as $probe): ?>
            <div class="probe-item">
                <div class="probe-avatar"><?php if (!empty($probe['avatar'])): ?><img src="<?= e($probe['avatar']) ?>" alt="avatar"><?php else: ?>F12<?php endif; ?></div>
                <div>
                    <div class="probe-top">
                        <strong><?= e($probe['ip'] ?? '-') ?></strong>
                        <span class="probe-chip"><?= e($probe['reason'] ?? '未知原因') ?></span>
                        <?php if (!empty($probe['guid'])): ?><span class="probe-chip">GUID: <?= e($probe['guid']) ?></span><?php endif; ?>
                        <?php if (!empty($probe['author_name'])): ?><span class="probe-chip"><?= e($probe['author_name']) ?></span><?php endif; ?>
                    </div>
                    <div class="probe-url">页面：<?= e($probe['url'] ?? ($probe['path'] ?? '')) ?></div>
                    <div class="probe-url">设备：<?= e(trim(($probe['browser'] ?? '') . ' ' . ($probe['browser_version'] ?? '') . ' · ' . ($probe['os'] ?? '') . ' ' . ($probe['os_version'] ?? ''))) ?><?php if (!empty($probe['screen'])): ?> · 屏幕 <?= e($probe['screen']) ?><?php endif; ?></div>
                    <?php if (!empty($probe['trail']) && is_array($probe['trail'])): ?>
                        <div class="probe-trail">操作轨迹：<?= e(implode('  →  ', $probe['trail'])) ?></div>
                    <?php endif; ?>
                </div>
                <div class="probe-side">
                    <div style="font-size:12px;color:var(--color-text-3);"><?= e($probe['time'] ?? '') ?></div>
                    <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end;">
                        <a class="btn btn-ghost" href="<?= url('admin/traces?' . f12_probe_build_query(['detail_ip' => $probe['ip'] ?? ''], ['ip' => $probe['ip'] ?? ''])) ?>">同 IP 轨迹</a>
                        <?php if (!empty($probe['guid'])): ?><a class="btn btn-ghost" href="<?= url('admin/traces?' . f12_probe_build_query(['detail_guid' => $probe['guid']], ['guid' => $probe['guid']])) ?>">同设备轨迹</a><?php endif; ?>
                    </div>
                </div>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>
</div>

<?php if ($totalPages > 1): ?>
<div class="probe-pagination">
    <a class="btn btn-ghost <?= $page <= 1 ? 'disabled' : '' ?>" href="<?= url('admin/f12-probes?' . f12_probe_build_query(['page' => max(1, $page - 1)], $filters)) ?>">上一页</a>
    <?php
    $startPage = max(1, $page - 2);
    $endPage = min($totalPages, $page + 2);
    for ($i = $startPage; $i <= $endPage; $i++): ?>
        <a class="btn <?= $i === $page ? 'btn-primary' : 'btn-ghost' ?>" href="<?= url('admin/f12-probes?' . f12_probe_build_query(['page' => $i], $filters)) ?>"><?= $i ?></a>
    <?php endfor; ?>
    <a class="btn btn-ghost <?= $page >= $totalPages ? 'disabled' : '' ?>" href="<?= url('admin/f12-probes?' . f12_probe_build_query(['page' => min($totalPages, $page + 1)], $filters)) ?>">下一页</a>
</div>
<?php endif; ?>
<?php
$content = ob_get_clean();
require __DIR__ . '/layout.php';
