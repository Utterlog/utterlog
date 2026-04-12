<?php
declare(strict_types=1);
require_once __DIR__ . '/../index.php';
require_admin();

$currentNav = 'security_decisions';
$pageTitle = '决策中心';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $entityType = clean($_POST['entity_type'] ?? '', 20);
    $entityKey = clean($_POST['entity_key'] ?? '', 120);
    $apply = clean($_POST['apply_action'] ?? '', 20);
    if ($entityType === 'ip' && filter_var($entityKey, FILTER_VALIDATE_IP)) {
        if ($apply === 'reset_score' && function_exists('reputation_reset_ip_score')) {
            reputation_reset_ip_score($entityKey);
            set_flash('success', '该 IP 的信誉分已清零。');
        } elseif ($apply === 'clear_history' && function_exists('reputation_clear_ip_history')) {
            reputation_clear_ip_history($entityKey);
            set_flash('success', '该 IP 的历史请求与画像记录已清理。');
        } elseif ($apply === 'ban') {
            $analysis = Firewall::getIpAnalysis($entityKey);
            $decision = is_array($analysis['decision'] ?? null) ? $analysis['decision'] : [];
            Firewall::applyDecisionBan($entityKey, $decision);
            set_flash('success', '已按系统建议对目标 IP 执行临时封禁。');
        } elseif ($apply === 'unban') {
            Firewall::manualUnbanIp($entityKey);
            set_flash('success', '已解除该 IP 的封禁状态。');
        }
    }
    redirect('admin/security-decisions');
}

$filters = [
    'ip' => clean($_GET['ip'] ?? '', 100),
    'guid' => clean($_GET['guid'] ?? '', 120),
    'path' => clean($_GET['path'] ?? '', 200),
    'start_date' => clean($_GET['start_date'] ?? '', 20),
    'end_date' => clean($_GET['end_date'] ?? '', 20),
    'decision_level' => clean($_GET['decision_level'] ?? '', 20),
];
$items = function_exists('reputation_decision_collect') ? array_slice(reputation_decision_collect($filters), 0, 50) : [];
$overview = function_exists('reputation_decision_overview') ? reputation_decision_overview($filters) : ['total'=>0,'safe'=>0,'observe'=>0,'challenge'=>0,'restrict'=>0,'ban'=>0];
$cfg = Firewall::getConfig();

ob_start();
?>
<style>
.dc-toolbar{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px;margin-bottom:20px}.dc-kpi,.dc-card{background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-l)}.dc-kpi{padding:18px 20px}.dc-kpi__label{font-size:12px;color:var(--color-text-3);margin-bottom:8px}.dc-kpi__value{font-size:30px;font-weight:800;color:var(--color-text-1)}.dc-card{padding:20px;margin-bottom:20px}.dc-filter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.dc-input,.dc-select{width:100%;height:42px;border:1px solid var(--color-border);border-radius:10px;background:#fff;padding:0 12px;color:var(--color-text-1)}.dc-label{display:block;font-size:12px;color:var(--color-text-3);margin-bottom:8px}.dc-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.dc-list{display:flex;flex-direction:column;gap:16px}.dc-item{background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-l);padding:18px 20px}.dc-head{display:grid;grid-template-columns:100px 1fr auto;gap:16px;align-items:flex-start}.dc-score{font-size:42px;font-weight:900;color:var(--color-text-1);line-height:1}.dc-chip{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:700}.dc-chip--safe{background:rgba(34,197,94,.12);color:#15803d}.dc-chip--observe{background:rgba(59,130,246,.12);color:#1d4ed8}.dc-chip--challenge{background:rgba(245,158,11,.14);color:#b45309}.dc-chip--restrict,.dc-chip--ban{background:rgba(239,68,68,.12);color:#b91c1c}.dc-meta{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px}.dc-reasons{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:12px}.dc-reason{border:1px solid var(--color-border);border-radius:10px;padding:12px;background:var(--color-fill-2,#fafafa)}.dc-reason__score{font-size:22px;font-weight:800;color:var(--color-text-1)}.dc-sub{font-size:12px;color:var(--color-text-3)}.dc-ops{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:10px}.dc-ops form{margin:0}.dc-ops .btn{white-space:nowrap}.dc-brief{font-size:13px;color:var(--color-text-2)}.dc-pagination{display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap;margin-top:16px}.dc-pagination__meta{font-size:12px;color:var(--color-text-3)}.dc-evidence{margin-top:14px;padding:12px 14px;border-radius:10px;background:var(--color-fill-2,#fafafa);font-size:13px;color:var(--color-text-2)}@media(max-width:1200px){.dc-toolbar{grid-template-columns:repeat(3,1fr)}.dc-filter-grid,.dc-reasons{grid-template-columns:repeat(2,1fr)}.dc-head{grid-template-columns:1fr}}@media(max-width:760px){.dc-toolbar,.dc-filter-grid,.dc-reasons{grid-template-columns:1fr}.dc-ops{justify-content:flex-start}}
</style>
<div class="dc-card">
    <div class="card-title"><i class="ri-shield-keyhole-line"></i> 决策中心</div>
    <div style="font-size:13px;color:var(--color-text-3);margin-top:6px;">把信誉中心的分数真正翻译成动作建议：观察、挑战、限制、封禁。并把主要触发原因明确展示给站长，避免只看到结果看不到依据。</div>
    <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:14px;">
        <span class="dc-chip <?= !empty($cfg['enable_auto_decision']) ? 'dc-chip--restrict' : 'dc-chip--safe' ?>"><?= !empty($cfg['enable_auto_decision']) ? '自动动作分级已启用' : '自动动作分级未启用' ?></span>
        <span class="dc-sub">阈值：挑战 <?= (int)($cfg['decision_challenge_score'] ?? 14) ?> / 限制 <?= (int)($cfg['decision_restrict_score'] ?? 24) ?> / 封禁 <?= (int)($cfg['decision_ban_score'] ?? 35) ?></span>
    </div>
</div>
<div class="dc-toolbar">
    <div class="dc-kpi"><div class="dc-kpi__label">总实体</div><div class="dc-kpi__value"><?= (int)$overview['total'] ?></div></div>
    <div class="dc-kpi"><div class="dc-kpi__label">观察态</div><div class="dc-kpi__value"><?= (int)$overview['observe'] ?></div></div>
    <div class="dc-kpi"><div class="dc-kpi__label">挑战态</div><div class="dc-kpi__value"><?= (int)$overview['challenge'] ?></div></div>
    <div class="dc-kpi"><div class="dc-kpi__label">限制态</div><div class="dc-kpi__value"><?= (int)$overview['restrict'] ?></div></div>
    <div class="dc-kpi"><div class="dc-kpi__label">封禁态</div><div class="dc-kpi__value"><?= (int)$overview['ban'] ?></div></div>
    <div class="dc-kpi"><div class="dc-kpi__label">安全态</div><div class="dc-kpi__value"><?= (int)$overview['safe'] ?></div></div>
</div>
<div class="dc-card">
    <form method="GET" action="<?= url('admin/security-decisions') ?>">
        <div class="dc-filter-grid">
            <div><label class="dc-label">IP</label><input class="dc-input" type="text" name="ip" value="<?= e($filters['ip']) ?>" placeholder="例如 35.212.237.174"></div>
            <div><label class="dc-label">GUID</label><input class="dc-input" type="text" name="guid" value="<?= e($filters['guid']) ?>" placeholder="例如 qs6v6s2h0u"></div>
            <div><label class="dc-label">路径</label><input class="dc-input" type="text" name="path" value="<?= e($filters['path']) ?>" placeholder="例如 /post/14"></div>
            <div><label class="dc-label">动作等级</label><select class="dc-select" name="decision_level"><option value="">全部</option><?php foreach (['safe','observe','challenge','restrict','ban'] as $lvl): ?><option value="<?= $lvl ?>" <?= $filters['decision_level'] === $lvl ? 'selected' : '' ?>><?= e(reputation_level_label($lvl)) ?></option><?php endforeach; ?></select></div>
            <div><label class="dc-label">开始日期</label><input class="dc-input" type="date" name="start_date" value="<?= e($filters['start_date']) ?>"></div>
            <div><label class="dc-label">结束日期</label><input class="dc-input" type="date" name="end_date" value="<?= e($filters['end_date']) ?>"></div>
        </div>
        <div class="dc-actions">
            <button type="submit" class="btn btn-primary">筛选决策</button>
            <a class="btn btn-ghost" href="<?= url('admin/security-decisions') ?>">重置筛选</a>
            <a class="btn btn-ghost" href="<?= url('admin/firewall-settings') ?>">前往防御配置</a>
        </div>
    </form>
</div>
<div class="dc-list">
<?php if (!$items): ?>
    <div class="dc-card" style="text-align:center;color:var(--color-text-3);">当前条件下暂无决策实体。</div>
<?php else: foreach ($items as $item): $decision = (array)($item['decision'] ?? []); $level = (string)($decision['level'] ?? 'safe'); $analysis = Firewall::getIpAnalysis((string)$item['ip']); $isBanned = !empty($analysis['is_banned']); ?>
    <div class="dc-item">
        <div class="dc-head">
            <div>
                <div class="dc-score"><?= (int)($item['total_score'] ?? 0) ?></div>
                <div style="margin-top:10px;"><span class="dc-chip dc-chip--<?= e($level) ?>"><?= e($decision['label'] ?? reputation_level_label($level)) ?></span></div>
            </div>
            <div>
                <div class="dc-meta">
                    <strong><?= e($item['ip'] ?? '-') ?></strong>
                    <?php if (!empty($item['sample_guid'])): ?><span class="dc-chip dc-chip--observe">GUID <?= e($item['sample_guid']) ?></span><?php endif; ?>
                    <?php if (!empty($item['network']['asn'])): ?><span class="dc-chip dc-chip--observe"><?= e($item['network']['asn']) ?></span><?php endif; ?>
                </div>
                <div class="dc-brief">建议动作：<?= e($decision['label'] ?? '安全') ?><?php if (!empty($decision['ttl_minutes'])): ?> · 建议持续 <?= (int)$decision['ttl_minutes'] ?> 分钟<?php endif; ?></div>
                <div class="dc-brief" style="margin-top:6px;">封禁原因：<?= e($decision['reason_text'] ?? '未触发显著原因') ?></div>
                <div class="dc-reasons">
                    <?php foreach ((array)($decision['top_reasons'] ?? []) as $reason): ?>
                        <div class="dc-reason">
                            <div class="dc-sub"><?= e($reason['label'] ?? '') ?></div>
                            <div class="dc-reason__score">+<?= (int)($reason['score'] ?? 0) ?></div>
                        </div>
                    <?php endforeach; ?>
                </div>
                <div class="dc-evidence">
                    请求数 <?= (int)($item['request_count'] ?? 0) ?>，独立路径 <?= (int)($item['unique_paths'] ?? 0) ?>，分钟峰值 <?= (int)($item['peak_minute'] ?? 0) ?>，F12 命中 <?= (int)($item['f12_hits'] ?? 0) ?>，网络画像 <?= e((string)($item['network']['country'] ?? '未知')) ?>。
                </div>
            </div>
            <div class="dc-ops">
                <form method="POST" action="<?= url('admin/security-decisions') ?>" onsubmit="return confirm('确定将该 IP 的信誉分清零吗？');">
                    <?= csrf_field() ?>
                    <input type="hidden" name="entity_type" value="ip">
                    <input type="hidden" name="entity_key" value="<?= e((string)$item['ip']) ?>">
                    <input type="hidden" name="apply_action" value="reset_score">
                    <button type="submit" class="btn btn-ghost">信誉清零</button>
                </form>
                <form method="POST" action="<?= url('admin/security-decisions') ?>" onsubmit="return confirm('确定清除该 IP 的历史请求、探针与画像记录吗？此操作不可撤销。');">
                    <?= csrf_field() ?>
                    <input type="hidden" name="entity_type" value="ip">
                    <input type="hidden" name="entity_key" value="<?= e((string)$item['ip']) ?>">
                    <input type="hidden" name="apply_action" value="clear_history">
                    <button type="submit" class="btn btn-ghost">清除IP历史</button>
                </form>
                <a class="btn btn-ghost" href="<?= url('admin/security-timeline?' . http_build_query(['ip' => (string)$item['ip'], 'guid' => (string)($item['sample_guid'] ?? '')])) ?>">原因时间线</a>
                <a class="btn btn-ghost" href="<?= url('admin/traces?' . http_build_query(['ip' => (string)$item['ip']])) ?>">访问轨迹</a>
                <a class="btn btn-ghost" href="<?= url('admin/f12-probes?' . http_build_query(['ip' => (string)$item['ip']])) ?>">F12 轨迹</a>
                <?php if ($isBanned): ?>
                    <form method="POST" action="<?= url('admin/security-decisions') ?>">
                        <?= csrf_field() ?>
                        <input type="hidden" name="entity_type" value="ip">
                        <input type="hidden" name="entity_key" value="<?= e((string)$item['ip']) ?>">
                        <input type="hidden" name="apply_action" value="unban">
                        <button type="submit" class="btn btn-ghost">解除封禁</button>
                    </form>
                <?php elseif ($level === 'ban'): ?>
                    <form method="POST" action="<?= url('admin/security-decisions') ?>" onsubmit="return confirm('确定按系统建议对该 IP 执行临时封禁？');">
                        <?= csrf_field() ?>
                        <input type="hidden" name="entity_type" value="ip">
                        <input type="hidden" name="entity_key" value="<?= e((string)$item['ip']) ?>">
                        <input type="hidden" name="apply_action" value="ban">
                        <button type="submit" class="btn is-danger">执行封禁</button>
                    </form>
                <?php endif; ?>
            </div>
        </div>
    </div>
<?php endforeach; endif; ?>
</div>

<?php if ($totalPages > 1): ?>
<div class="dc-pagination">
    <a class="btn btn-ghost <?= $page <= 1 ? 'disabled' : '' ?>" href="<?= url('admin/security-decisions?' . http_build_query(array_filter(array_merge($filters, ['page' => max(1, $page - 1)]), static fn($v) => $v !== '' && $v !== null))) ?>">上一页</a>
    <?php
    $startPage = max(1, $page - 2);
    $endPage = min($totalPages, $page + 2);
    for ($i = $startPage; $i <= $endPage; $i++): ?>
        <a class="btn <?= $i === $page ? 'btn-primary' : 'btn-ghost' ?>" href="<?= url('admin/security-decisions?' . http_build_query(array_filter(array_merge($filters, ['page' => $i]), static fn($v) => $v !== '' && $v !== null))) ?>"><?= $i ?></a>
    <?php endfor; ?>
    <a class="btn btn-ghost <?= $page >= $totalPages ? 'disabled' : '' ?>" href="<?= url('admin/security-decisions?' . http_build_query(array_filter(array_merge($filters, ['page' => min($totalPages, $page + 1)]), static fn($v) => $v !== '' && $v !== null))) ?>">下一页</a>
</div>
<?php endif; ?>

<?php
$content = ob_get_clean();
require __DIR__ . '/layout.php';
