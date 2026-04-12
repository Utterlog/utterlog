<?php
declare(strict_types=1);
require_once __DIR__ . '/../index.php';
require_admin();
$currentNav = 'security_timeline';
$pageTitle = '原因时间线';
$filters = [
    'ip' => clean($_GET['ip'] ?? '', 100),
    'guid' => clean($_GET['guid'] ?? '', 120),
    'start_date' => clean($_GET['start_date'] ?? '', 20),
    'end_date' => clean($_GET['end_date'] ?? '', 20),
];
$page = max(1, (int)($_GET['page'] ?? 1));
$perPage = 20;
$allItems = function_exists('security_timeline_collect') ? security_timeline_collect($filters) : [];
$today = date('Y-m-d');
$sourceMap = [];
$highRisk = 0;
$todayCount = 0;
foreach ($allItems as $row) {
    if (strpos((string)($row['time'] ?? ''), $today) === 0) {
        $todayCount++;
    }
    $sourceMap[(string)($row['source'] ?? 'unknown')] = true;
    if ((int)($row['score_delta'] ?? 0) >= 8 || in_array((string)($row['event_code'] ?? ''), ['manual_ban','auto_decision_ban','cc_burst','geoip_denied'], true)) {
        $highRisk++;
    }
}
$summary = ['total'=>count($allItems),'today'=>$todayCount,'sources'=>count($sourceMap),'high_risk'=>$highRisk];
$total = count($allItems);
$totalPages = max(1, (int)ceil($total / $perPage));
if ($page > $totalPages) { $page = $totalPages; }
$items = array_slice($allItems, ($page - 1) * $perPage, $perPage);
ob_start(); ?>
<style>
.st-toolbar{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:20px}.st-kpi,.st-card{background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-l)}.st-kpi{padding:18px 20px}.st-kpi__label{font-size:12px;color:var(--color-text-3);margin-bottom:8px}.st-kpi__value{font-size:30px;font-weight:800;color:var(--color-text-1)}.st-card{padding:20px;margin-bottom:20px}.st-filter-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}.st-input{width:100%;height:42px;border:1px solid var(--color-border);border-radius:10px;background:#fff;padding:0 12px;color:var(--color-text-1)}.st-label{display:block;font-size:12px;color:var(--color-text-3);margin-bottom:8px}.st-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.st-list{display:flex;flex-direction:column;gap:16px}.st-item{background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-l);padding:18px 20px}.st-row{display:grid;grid-template-columns:140px 1fr auto;gap:16px;align-items:flex-start}.st-time{font-size:13px;color:var(--color-text-3)}.st-badge{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:700;background:rgba(59,130,246,.12);color:#1d4ed8}.st-badge--probe{background:rgba(245,158,11,.14);color:#b45309}.st-badge--high{background:rgba(239,68,68,.12);color:#b91c1c}.st-title{font-size:16px;font-weight:800;color:var(--color-text-1);margin-bottom:6px}.st-meta{font-size:13px;color:var(--color-text-2);display:flex;gap:10px;flex-wrap:wrap}.st-evidence{margin-top:12px;border:1px solid var(--color-border);border-radius:10px;background:var(--color-fill-2,#fafafa);padding:12px 14px;font-size:13px;color:var(--color-text-2)}.st-pill{display:inline-flex;align-items:center;height:22px;padding:0 8px;border-radius:999px;background:rgba(15,23,42,.06);font-size:12px;margin:0 6px 6px 0}.st-ops{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:10px}.st-ops .btn{white-space:nowrap}.st-pagination{display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap;margin-top:16px}.st-pagination__meta{font-size:12px;color:var(--color-text-3)}@media(max-width:1100px){.st-toolbar{grid-template-columns:repeat(2,1fr)}.st-filter-grid{grid-template-columns:repeat(2,1fr)}.st-row{grid-template-columns:1fr}}@media(max-width:760px){.st-toolbar,.st-filter-grid{grid-template-columns:1fr}.st-ops{justify-content:flex-start}}
</style>
<div class="st-card"><div class="card-title"><i class="ri-timeline-view"></i> 封禁原因时间线</div><div style="font-size:13px;color:var(--color-text-3);margin-top:6px;">把信誉事件、自动动作、人工处置与 F12 探针统一串成一条证据时间线。站长可以顺着时间看清楚为什么进入挑战态、限制态或封禁态。</div></div>
<div class="st-toolbar"><div class="st-kpi"><div class="st-kpi__label">总事件</div><div class="st-kpi__value"><?= (int)$summary['total'] ?></div></div><div class="st-kpi"><div class="st-kpi__label">今日新增</div><div class="st-kpi__value"><?= (int)$summary['today'] ?></div></div><div class="st-kpi"><div class="st-kpi__label">事件来源</div><div class="st-kpi__value"><?= (int)$summary['sources'] ?></div></div><div class="st-kpi"><div class="st-kpi__label">高危节点</div><div class="st-kpi__value"><?= (int)$summary['high_risk'] ?></div></div></div>
<div class="st-card"><form method="GET" action="<?= url('admin/security-timeline') ?>"><div class="st-filter-grid"><div><label class="st-label">IP</label><input class="st-input" type="text" name="ip" value="<?= e($filters['ip']) ?>" placeholder="例如 59.173.31.0"></div><div><label class="st-label">GUID</label><input class="st-input" type="text" name="guid" value="<?= e($filters['guid']) ?>" placeholder="例如 rj844geekgm"></div><div><label class="st-label">开始日期</label><input class="st-input" type="date" name="start_date" value="<?= e($filters['start_date']) ?>"></div><div><label class="st-label">结束日期</label><input class="st-input" type="date" name="end_date" value="<?= e($filters['end_date']) ?>"></div></div><div class="st-actions"><button type="submit" class="btn btn-primary">筛选时间线</button><a class="btn btn-ghost" href="<?= url('admin/security-timeline') ?>">重置筛选</a><a class="btn btn-ghost" href="<?= url('admin/security-decisions') ?>">返回决策中心</a></div></form></div>
<div class="st-list"><?php if (!$items): ?><div class="st-card" style="text-align:center;color:var(--color-text-3);">当前条件下暂无时间线事件。</div><?php else: foreach ($items as $item): $isProbe = ($item['source'] ?? '') === 'probe'; $isHigh = (int)($item['score_delta'] ?? 0) >= 8 || in_array((string)($item['event_code'] ?? ''), ['manual_ban','auto_decision_ban','cc_burst','geoip_denied'], true); ?><div class="st-item"><div class="st-row"><div class="st-time"><div><?= e((string)($item['time'] ?? '')) ?></div><div style="margin-top:8px;"><span class="st-badge <?= $isProbe ? 'st-badge--probe' : ($isHigh ? 'st-badge--high' : '') ?>"><?= $isProbe ? 'F12 探针' : '信誉事件' ?></span></div></div><div><div class="st-title"><?= e((string)($item['event_label'] ?? '')) ?></div><div class="st-meta"><?php if (!empty($item['ip'])): ?><span>IP <?= e((string)$item['ip']) ?></span><?php endif; ?><?php if (!empty($item['guid'])): ?><span>GUID <?= e((string)$item['guid']) ?></span><?php endif; ?><?php if (!empty($item['path'])): ?><span>路径 <?= e((string)$item['path']) ?></span><?php endif; ?><?php if ((int)($item['score_delta'] ?? 0) !== 0): ?><span>加分 <?= (int)$item['score_delta'] ?></span><?php endif; ?></div><?php if (!empty($item['reason'])): ?><div class="st-meta" style="margin-top:8px;">原因：<?= e((string)$item['reason']) ?></div><?php endif; ?><div class="st-evidence"><?php $e = (array)($item['evidence'] ?? []); ?><?php if (!empty($item['url'])): ?><div style="margin-bottom:8px;">页面：<?= e((string)$item['url']) ?></div><?php endif; ?><?php foreach ($e as $k => $v): if ($k === 'trail' && is_array($v)): ?><div style="margin-top:8px;">操作轨迹：<?php foreach ($v as $trail): ?><span class="st-pill"><?= e((string)$trail) ?></span><?php endforeach; ?></div><?php elseif (!is_array($v) && $v !== ''): ?><span class="st-pill"><?= e((string)$k) ?>: <?= e((string)$v) ?></span><?php endif; endforeach; ?></div></div><div class="st-ops"><?php if (!empty($item['ip'])): ?><a class="btn btn-ghost" href="<?= url('admin/traces?' . http_build_query(['ip' => (string)$item['ip']])) ?>">访问轨迹</a><?php endif; ?><?php if (!empty($item['ip']) || !empty($item['guid'])): ?><a class="btn btn-ghost" href="<?= url('admin/f12-probes?' . http_build_query(['ip' => (string)($item['ip'] ?? ''), 'guid' => (string)($item['guid'] ?? '')])) ?>">F12 轨迹</a><?php endif; ?></div></div></div><?php endforeach; endif; ?></div>

<?php if ($totalPages > 1): ?>
<div class="st-pagination">
    <a class="btn btn-ghost <?= $page <= 1 ? 'disabled' : '' ?>" href="<?= url('admin/security-timeline?' . http_build_query(array_filter(array_merge($filters, ['page' => max(1, $page - 1)]), static fn($v) => $v !== '' && $v !== null))) ?>">上一页</a>
    <?php
    $startPage = max(1, $page - 2);
    $endPage = min($totalPages, $page + 2);
    for ($i = $startPage; $i <= $endPage; $i++): ?>
        <a class="btn <?= $i === $page ? 'btn-primary' : 'btn-ghost' ?>" href="<?= url('admin/security-timeline?' . http_build_query(array_filter(array_merge($filters, ['page' => $i]), static fn($v) => $v !== '' && $v !== null))) ?>"><?= $i ?></a>
    <?php endfor; ?>
    <a class="btn btn-ghost <?= $page >= $totalPages ? 'disabled' : '' ?>" href="<?= url('admin/security-timeline?' . http_build_query(array_filter(array_merge($filters, ['page' => min($totalPages, $page + 1)]), static fn($v) => $v !== '' && $v !== null))) ?>">下一页</a>
</div>
<?php endif; ?>
<?php $content = ob_get_clean(); require __DIR__ . '/layout.php';