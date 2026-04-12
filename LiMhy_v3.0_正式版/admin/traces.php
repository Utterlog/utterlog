<?php
/**
 * LiMhy - 访问日志
 *
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    记录访客每一次页面与业务接口请求，支持按 IP / 指纹 / 路径 / 来源筛选、导出与轨迹查看
 */
require_once __DIR__ . '/../index.php';

$p = prefix();
$currentNav = 'traces';
$pageTitle = '访问日志';

if (!is_admin()) {
    redirect('admin/login');
}

if (isset($_POST['ajax_ban_action']) && is_ajax()) {
    header('Content-Type: application/json; charset=utf-8');
    if (!verify_csrf()) {
        echo json_encode(['ok' => false, 'msg' => '安全校验失败']);
        exit;
    }

    $target = trim((string)($_POST['target'] ?? ''));
    $value = trim((string)($_POST['value'] ?? ''));
    $action = trim((string)($_POST['ban_action'] ?? 'ban'));

    if (!class_exists('Firewall')) {
        echo json_encode(['ok' => false, 'msg' => '防御核心未挂载']);
        exit;
    }

    if ($target === 'ip') {
        if (!filter_var($value, FILTER_VALIDATE_IP)) {
            echo json_encode(['ok' => false, 'msg' => 'IP 参数非法']);
            exit;
        }
        if ($action === 'unban') {
            Firewall::manualUnbanIp($value);
            echo json_encode(['ok' => true, 'msg' => '该 IP 已解除全局封禁']);
        } else {
            Firewall::manualBanIp($value);
            echo json_encode(['ok' => true, 'msg' => '该 IP 已加入全局黑名单']);
        }
        exit;
    }

    if ($target === 'device') {
        $guid = preg_replace('/[^a-zA-Z0-9\-]/', '', $value);
        if ($guid === '' || strlen($guid) < 6) {
            echo json_encode(['ok' => false, 'msg' => '设备指纹参数非法']);
            exit;
        }
        if ($action === 'unban') {
            Firewall::unbanDevice($guid);
            echo json_encode(['ok' => true, 'msg' => '该设备已解除全局封禁']);
        } else {
            Firewall::banDevice($guid);
            echo json_encode(['ok' => true, 'msg' => '该设备已加入全局黑名单']);
        }
        exit;
    }

    echo json_encode(['ok' => false, 'msg' => '未知操作目标']);
    exit;
}

if (isset($_GET['export']) && $_GET['export'] === 'csv') {
    verify_csrf() || exit('Invalid CSRF token');
    access_log_export_csv([
        'ip' => clean($_GET['ip'] ?? '', 100),
        'guid' => clean($_GET['guid'] ?? '', 120),
        'path' => clean($_GET['path'] ?? '', 200),
        'method' => clean($_GET['method'] ?? '', 10),
        'source' => clean($_GET['source'] ?? '', 20),
        'start_date' => clean($_GET['start_date'] ?? '', 20),
        'end_date' => clean($_GET['end_date'] ?? '', 20),
    ]);
}


if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $act = $_POST['_action'] ?? '';
    if ($act === 'save_retention') {
        $days = max(1, min(365, (int)($_POST['retention_days'] ?? 7)));
        limhy_write_site_settings(['ACCESS_LOG_RETENTION_DAYS' => $days]);
        access_log_cleanup();
        set_flash('success', '访问日志保留期限已更新为 ' . $days . ' 天。');
        redirect('admin/traces');
    }
}

$retentionDays = access_log_retention_days();

$filters = [
    'ip' => clean($_GET['ip'] ?? '', 100),
    'guid' => clean($_GET['guid'] ?? '', 120),
    'path' => clean($_GET['path'] ?? '', 200),
    'method' => clean($_GET['method'] ?? '', 10),
    'source' => clean($_GET['source'] ?? '', 20),
    'start_date' => clean($_GET['start_date'] ?? '', 20),
    'end_date' => clean($_GET['end_date'] ?? '', 20),
    'probe_reason' => clean($_GET['probe_reason'] ?? '', 100),
];
$page = max(1, (int)($_GET['page'] ?? 1));
$perPage = 20;
$summary = access_log_summary($filters);
$pagination = access_log_paginate($filters, $page, $perPage);
$items = $pagination['items'];
$total = $pagination['total'];
$totalPages = $pagination['total_pages'];

$detailIp = clean($_GET['detail_ip'] ?? '', 100);
$detailGuid = clean($_GET['detail_guid'] ?? '', 120);
$trackFilters = $filters;
if ($detailIp !== '') { $trackFilters['ip'] = $detailIp; }
if ($detailGuid !== '') { $trackFilters['guid'] = $detailGuid; }
$trackItems = ($detailIp !== '' || $detailGuid !== '') ? array_slice(access_log_collect($trackFilters), 0, 50) : [];

function build_query(array $extra = [], array $filters = []): string {
    $base = array_filter(array_merge($filters, $extra), static function ($v) { return $v !== '' && $v !== null; });
    return http_build_query($base);
}

ob_start();
?>
<style>
.access-toolbar { display:grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap:16px; margin-bottom:20px; }
.access-stat-card { background:#fff; border:1px solid var(--color-border); border-radius:var(--radius-l); padding:18px 20px; box-shadow: 0 6px 20px rgba(15,23,42,.04); }
.access-stat-card__label { font-size:12px; color:var(--color-text-3); margin-bottom:8px; }
.access-stat-card__value { font-size:28px; font-weight:700; color:var(--color-text-1); line-height:1; }
.access-filter-card { background:#fff; border:1px solid var(--color-border); border-radius:var(--radius-l); padding:20px; margin-bottom:20px; }
.access-filter-grid { display:grid; grid-template-columns: repeat(4, minmax(0,1fr)); gap:14px; }
.access-input, .access-select { width:100%; height:42px; border:1px solid var(--color-border); border-radius:10px; background:#fff; padding:0 12px; color:var(--color-text-1); }
.access-label { font-size:12px; color:var(--color-text-3); display:block; margin-bottom:8px; }
.access-filter-actions { display:flex; gap:10px; align-items:center; margin-top:16px; flex-wrap:wrap; }
.access-list-card { background:#fff; border:1px solid var(--color-border); border-radius:var(--radius-l); overflow:hidden; }
.access-list-header { padding:18px 20px; display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid var(--color-border); }
.access-record { padding:18px 20px; border-bottom:1px solid var(--color-border); display:grid; grid-template-columns: 64px 1fr auto; gap:16px; align-items:flex-start; }
.access-record:last-child { border-bottom:none; }
.access-avatar { width:56px; height:56px; border-radius:50%; overflow:hidden; background:var(--color-fill); border:1px solid var(--color-border); display:flex; align-items:center; justify-content:center; }
.access-avatar img { width:100%; height:100%; object-fit:cover; }
.access-avatar--fallback { font-weight:700; color:var(--color-primary); font-size:18px; }
.access-main { min-width:0; }
.access-line-1 { display:flex; flex-wrap:wrap; align-items:center; gap:10px; margin-bottom:8px; }
.access-ip { font-family:Menlo,Consolas,monospace; font-weight:600; color:var(--color-text-1); }
.access-method { display:inline-flex; align-items:center; justify-content:center; min-width:52px; height:24px; border-radius:999px; padding:0 10px; font-size:12px; font-weight:700; }
.access-method--get { background:rgba(22,93,255,.10); color:#165DFF; }
.access-method--post { background:rgba(0,180,42,.10); color:#00B42A; }
.access-method--other { background:rgba(255,125,0,.10); color:#FF7D00; }
.access-badge { display:inline-flex; align-items:center; gap:6px; height:24px; border-radius:999px; padding:0 10px; background:var(--color-fill); color:var(--color-text-2); font-size:12px; }
.access-path { font-size:15px; color:var(--color-text-1); font-weight:600; line-height:1.5; word-break:break-all; }
.access-meta { margin-top:8px; display:grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap:8px 16px; font-size:12px; color:var(--color-text-2); }
.access-meta span { display:block; word-break:break-all; }
.access-side { text-align:right; display:flex; flex-direction:column; gap:10px; align-items:flex-end; min-width:170px; }
.access-time { font-size:12px; color:var(--color-text-3); }
.access-track-links { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:8px; }
.access-empty { padding:40px 20px; color:var(--color-text-3); text-align:center; }
.access-pagination { display:flex; gap:8px; align-items:center; justify-content:flex-end; padding:16px 20px; border-top:1px solid var(--color-border); flex-wrap:wrap; }
.access-track-card { background:#fff; border:1px solid var(--color-border); border-radius:var(--radius-l); padding:20px; margin-bottom:20px; }
.access-track-list { margin-top:14px; display:flex; flex-direction:column; gap:10px; }
.access-track-item { border:1px solid var(--color-border); border-radius:12px; padding:12px 14px; background:var(--color-fill-2, #fafafa); }
.access-track-item__top { display:flex; justify-content:space-between; gap:12px; font-size:13px; margin-bottom:6px; }
.access-track-item__path { font-family:Menlo,Consolas,monospace; color:var(--color-text-1); word-break:break-all; }
.access-control-row { display:flex; gap:10px; flex-wrap:wrap; align-items:center; margin-bottom:20px; }
.access-ban-pill { display:inline-flex; align-items:center; gap:6px; height:24px; border-radius:999px; padding:0 10px; font-size:12px; font-weight:600; }
.access-ban-pill--safe { background:rgba(0,180,42,.10); color:#00B42A; }
.access-ban-pill--danger { background:rgba(245,63,63,.10); color:#F53F3F; }
.access-side .btn, .access-track-actions .btn { min-width:88px; }
.access-record.is-banned { background:linear-gradient(180deg, rgba(245,63,63,.03), rgba(245,63,63,.00)); }
.access-track-actions { display:flex; gap:8px; flex-wrap:wrap; margin-top:12px; }
[data-admin-theme="dark"] .access-stat-card,
[data-admin-theme="dark"] .access-filter-card,
[data-admin-theme="dark"] .access-list-card,
[data-admin-theme="dark"] .access-track-card,
[data-admin-theme="dark"] .access-track-item,
[data-admin-theme="dark"] .access-input,
[data-admin-theme="dark"] .access-select { background: var(--color-bg-white); border-color: var(--color-border); color: var(--color-text-1); }
[data-admin-theme="dark"] .access-stat-card__label,
[data-admin-theme="dark"] .access-label,
[data-admin-theme="dark"] .access-empty,
[data-admin-theme="dark"] .access-time,
[data-admin-theme="dark"] .access-track-item__top span,
[data-admin-theme="dark"] .access-track-item > div[style*='color:var(--color-text-3)'],
[data-admin-theme="dark"] .access-list-header > div[style*='color:var(--color-text-3)'],
[data-admin-theme="dark"] .access-control-row > span { color: var(--color-text-3) !important; }
[data-admin-theme="dark"] .access-stat-card__value,
[data-admin-theme="dark"] .access-path,
[data-admin-theme="dark"] .access-ip,
[data-admin-theme="dark"] .access-track-item__path { color: var(--color-text-1); }
[data-admin-theme="dark"] .access-badge { background: rgba(255,255,255,0.08); color: var(--color-text-2); }
[data-admin-theme="dark"] .access-filter-card,
[data-admin-theme="dark"] .access-track-card,
[data-admin-theme="dark"] .access-list-card { box-shadow: 0 8px 24px rgba(0,0,0,.18); }
[data-admin-theme="dark"] .access-record { border-bottom-color: var(--color-border); }
[data-admin-theme="dark"] .access-record.is-banned { background: linear-gradient(180deg, rgba(245,63,63,.08), rgba(245,63,63,0)); }
[data-admin-theme="dark"] .access-track-item { background: rgba(255,255,255,0.03); }
[data-admin-theme="dark"] .access-input::placeholder { color: var(--color-text-3); }
[data-admin-theme="dark"] .access-pagination { border-top-color: var(--color-border); }
@media (max-width: 1200px) { .access-toolbar { grid-template-columns: repeat(3, minmax(0,1fr)); } }
@media (max-width: 1024px) { .access-toolbar, .access-filter-grid { grid-template-columns: repeat(2, minmax(0,1fr)); } .access-record { grid-template-columns:56px 1fr; } .access-side { grid-column: 1 / -1; align-items:flex-start; text-align:left; min-width:0; } .access-track-links { justify-content:flex-start; } }
@media (max-width: 768px) { .access-toolbar, .access-filter-grid, .access-meta { grid-template-columns: 1fr; } .access-record { grid-template-columns:1fr; } .access-avatar { width:48px; height:48px; } .access-line-1 { margin-top:8px; } .access-list-header { flex-direction:column; align-items:flex-start; gap:10px; } .access-control-row { flex-direction:column; align-items:flex-start; } .access-side .btn, .access-track-actions .btn { width:100%; } }
</style>

<div class="access-toolbar">
    <div class="access-stat-card"><div class="access-stat-card__label">今日请求数</div><div class="access-stat-card__value"><?= (int)$summary['today_requests'] ?></div></div>
    <div class="access-stat-card"><div class="access-stat-card__label">今日独立 IP</div><div class="access-stat-card__value"><?= (int)$summary['today_unique_ips'] ?></div></div>
    <div class="access-stat-card"><div class="access-stat-card__label">独立 IP</div><div class="access-stat-card__value"><?= (int)$summary['unique_ips'] ?></div></div>
    <div class="access-stat-card"><div class="access-stat-card__label">独立指纹</div><div class="access-stat-card__value"><?= (int)$summary['unique_guids'] ?></div></div>
    <div class="access-stat-card"><div class="access-stat-card__label">外部来源请求</div><div class="access-stat-card__value"><?= (int)$summary['external_requests'] ?></div></div>
</div>

<div class="access-control-row">
    <a class="btn btn-ghost" href="<?= url('admin/bans') ?>"><i class="ri-forbid-2-line"></i> 打开封禁黑名单</a>
    <span style="font-size:12px;color:var(--color-text-3);">在访问日志中可直接对异常访客执行全局封禁，黑名单会即时影响前台访问。</span>
</div>

<div class="access-filter-card" style="margin-bottom:20px;">
    <form method="POST" action="<?= url('admin/traces') ?>" style="display:flex; gap:12px; flex-wrap:wrap; align-items:end;">
        <?= csrf_field() ?>
        <input type="hidden" name="_action" value="save_retention">
        <div style="min-width:220px;">
            <label class="access-label">访问日志保留期限（天）</label>
            <input class="access-input" type="number" name="retention_days" min="1" max="365" value="<?= (int)$retentionDays ?>">
        </div>
        <button type="submit" class="btn btn-primary">保存保留期限</button>
    </form>
</div>

<div class="access-filter-card">
    <form method="GET" action="<?= url('admin/traces') ?>">
        <div class="access-filter-grid">
            <div><label class="access-label">IP</label><input class="access-input" type="text" name="ip" value="<?= e($filters['ip']) ?>" placeholder="例如 1.2.3.4"></div>
            <div><label class="access-label">设备指纹 GUID</label><input class="access-input" type="text" name="guid" value="<?= e($filters['guid']) ?>" placeholder="例如 lm_xxxxx"></div>
            <div><label class="access-label">路径 / URL</label><input class="access-input" type="text" name="path" value="<?= e($filters['path']) ?>" placeholder="例如 /post/hello-world"></div>
            <div><label class="access-label">请求方式</label><select class="access-select" name="method"><option value="">全部</option><?php foreach (['GET','POST','PUT','PATCH','DELETE','HEAD'] as $opt): ?><option value="<?= $opt ?>" <?= $filters['method'] === $opt ? 'selected' : '' ?>><?= $opt ?></option><?php endforeach; ?></select></div>
            <div><label class="access-label">来源类型</label><select class="access-select" name="source"><option value="">全部</option><?php foreach (['direct' => '直接访问', 'internal' => '站内跳转', 'external' => '外部来源'] as $val => $label): ?><option value="<?= $val ?>" <?= $filters['source'] === $val ? 'selected' : '' ?>><?= $label ?></option><?php endforeach; ?></select></div>
            <div><label class="access-label">开始日期</label><input class="access-input" type="date" name="start_date" value="<?= e($filters['start_date']) ?>"></div>
            <div><label class="access-label">结束日期</label><input class="access-input" type="date" name="end_date" value="<?= e($filters['end_date']) ?>"></div>
            <div><label class="access-label">保留策略</label><input class="access-input" type="text" value="自动保留最近 <?= (int)$retentionDays ?> 天" readonly></div>
        </div>
        <div class="access-filter-actions">
            <button type="submit" class="btn btn-primary">筛选日志</button>
            <a class="btn btn-ghost" href="<?= url('admin/traces') ?>">重置筛选</a>
            <a class="btn btn-ghost" href="<?= url('admin/traces?' . build_query(['export' => 'csv', '_csrf' => csrf_token()], $filters)) ?>">导出当前筛选</a>
        </div>
    </form>
</div>

<?php if ($detailIp !== '' || $detailGuid !== ''): ?>
<div class="access-track-card">
    <div class="card-title"><i class="ri-route-line"></i> 访问轨迹追踪 <?= $detailIp !== '' ? '· IP：' . e($detailIp) : '· GUID：' . e($detailGuid) ?></div>
    <div style="font-size:13px; color:var(--color-text-3); margin-top:6px;">展示最近 50 条关联访问记录。你可以通过同 IP / 同设备指纹，快速还原访客的访问路线。</div>
    <div class="access-track-list">
        <?php foreach ($trackItems as $track): ?>
            <?php
                $trackIp = (string)($track['ip'] ?? '');
                $trackGuid = (string)($track['guid'] ?? '');
                $trackIpBanned = $trackIp !== '' ? (bool)(Firewall::getIpAnalysis($trackIp)['is_banned'] ?? false) : false;
                $trackGuidBanned = $trackGuid !== '' ? Firewall::isGuidBanned($trackGuid) : false;
            ?>
            <div class="access-track-item">
                <div class="access-track-item__top">
                    <strong><?= e($track['time'] ?? '') ?></strong>
                    <span><?= e(($track['method'] ?? 'GET') . ' · ' . ($track['request_from'] ?? 'direct')) ?></span>
                </div>
                <div class="access-track-item__path"><?= e($track['path'] ?? '/') ?></div>
                <div style="font-size:12px; color:var(--color-text-3); margin-top:6px;">来源：<?= e(($track['referer_host'] ?? '') !== '' ? $track['referer_host'] : '直接访问') ?></div>
                <div class="access-track-actions">
                    <?php if ($trackIp !== ''): ?>
                        <button type="button" class="btn <?= $trackIpBanned ? 'btn-ghost' : 'is-danger' ?>" onclick="toggleAccessBan('ip', '<?= e($trackIp) ?>', '<?= $trackIpBanned ? 'unban' : 'ban' ?>')">
                            <?= $trackIpBanned ? '解封 IP' : '封禁 IP' ?>
                        </button>
                    <?php endif; ?>
                    <?php if ($trackGuid !== ''): ?>
                        <button type="button" class="btn <?= $trackGuidBanned ? 'btn-ghost' : 'is-danger' ?>" onclick="toggleAccessBan('device', '<?= e($trackGuid) ?>', '<?= $trackGuidBanned ? 'unban' : 'ban' ?>')">
                            <?= $trackGuidBanned ? '解封设备' : '封禁设备' ?>
                        </button>
                    <?php endif; ?>
                </div>
            </div>
        <?php endforeach; ?>
    </div>
</div>
<?php endif; ?>

<div class="access-list-card">
    <div class="access-list-header">
        <div class="card-title"><i class="ri-footprint-line"></i> 访问记录列表（共 <?= (int)$total ?> 条）</div>
        <div style="font-size:12px; color:var(--color-text-3);">默认排除静态资源请求，仅记录页面访问与明确业务 API。</div>
    </div>
    <?php if (empty($items)): ?>
        <div class="access-empty">当前筛选条件下暂无访问日志。</div>
    <?php else: ?>
        <?php foreach ($items as $item):
            $avatar = trim((string)($item['avatar'] ?? ''));
            $methodClass = 'access-method--other';
            if (($item['method'] ?? '') === 'GET') $methodClass = 'access-method--get';
            if (($item['method'] ?? '') === 'POST') $methodClass = 'access-method--post';
            $rowIp = (string)($item['ip'] ?? '');
            $rowGuid = (string)($item['guid'] ?? '');
            $isIpBanned = $rowIp !== '' ? (bool)(Firewall::getIpAnalysis($rowIp)['is_banned'] ?? false) : false;
            $isGuidBanned = $rowGuid !== '' ? Firewall::isGuidBanned($rowGuid) : false;
        ?>
        <div class="access-record <?= ($isIpBanned || $isGuidBanned) ? 'is-banned' : '' ?>">
            <div class="access-avatar">
                <?php if ($avatar !== ''): ?>
                    <img src="<?= e($avatar) ?>" alt="avatar" loading="lazy">
                <?php else: ?>
                    <div class="access-avatar--fallback"><?= e(mb_substr((string)($item['author_name'] ?? '访客'), 0, 1)) ?></div>
                <?php endif; ?>
            </div>
            <div class="access-main">
                <div class="access-line-1">
                    <span class="access-ip"><?= e($item['ip'] ?? '') ?></span>
                    <span class="access-method <?= $methodClass ?>"><?= e($item['method'] ?? 'GET') ?></span>
                    <span class="access-badge">来源：<?= e(($item['request_from'] ?? '') === 'external' ? '外部' : (($item['request_from'] ?? '') === 'internal' ? '站内' : '直达')) ?></span>
                    <span class="access-badge">绑定：<?= e($item['source_tag'] ?? 'anonymous') ?></span>
                    <?php if ($isIpBanned): ?><span class="access-ban-pill access-ban-pill--danger">IP 已封禁</span><?php else: ?><span class="access-ban-pill access-ban-pill--safe">IP 正常</span><?php endif; ?>
                    <?php if ($rowGuid !== ''): ?>
                        <?php if ($isGuidBanned): ?><span class="access-ban-pill access-ban-pill--danger">设备已封禁</span><?php else: ?><span class="access-ban-pill access-ban-pill--safe">设备正常</span><?php endif; ?>
                    <?php endif; ?>
                </div>
                <div class="access-path"><?= e($item['path'] ?? '/') ?></div>
                <div class="access-meta">
                    <span>完整地址：<?= e($item['full_url'] ?? '') ?></span>
                    <span>来源页：<?= e(($item['referer'] ?? '') !== '' ? $item['referer'] : '直接访问') ?></span>
                    <span>设备：<?= e(trim(($item['device_type'] ?? '') . ' · ' . ($item['os'] ?? '') . ' ' . ($item['os_version'] ?? ''))) ?></span>
                    <span>浏览器：<?= e(trim(($item['browser'] ?? '') . ' ' . ($item['browser_version'] ?? ''))) ?></span>
                    <span>设备指纹：<?= e(($item['guid'] ?? '') !== '' ? $item['guid'] : '未获取') ?></span>
                    <span>关联邮箱：<?= e(($item['comment_email'] ?? '') !== '' ? $item['comment_email'] : '未绑定') ?></span>
                </div>
            </div>
            <div class="access-side">
                <div class="access-time"><?= e($item['time'] ?? '') ?></div>
                <div class="access-track-links">
                    <a class="btn btn-ghost" href="<?= url('admin/traces?' . build_query(['detail_ip' => $item['ip'] ?? ''], $filters)) ?>">同 IP 轨迹</a>
                    <?php if (($item['guid'] ?? '') !== ''): ?>
                    <a class="btn btn-ghost" href="<?= url('admin/traces?' . build_query(['detail_guid' => $item['guid']], $filters)) ?>">同设备轨迹</a>
                    <?php endif; ?>
                    <button type="button" class="btn <?= $isIpBanned ? 'btn-ghost' : 'is-danger' ?>" onclick="toggleAccessBan('ip', '<?= e($rowIp) ?>', '<?= $isIpBanned ? 'unban' : 'ban' ?>')">
                        <?= $isIpBanned ? '解封 IP' : '封禁 IP' ?>
                    </button>
                    <?php if ($rowGuid !== ''): ?>
                    <button type="button" class="btn <?= $isGuidBanned ? 'btn-ghost' : 'is-danger' ?>" onclick="toggleAccessBan('device', '<?= e($rowGuid) ?>', '<?= $isGuidBanned ? 'unban' : 'ban' ?>')">
                        <?= $isGuidBanned ? '解封设备' : '封禁设备' ?>
                    </button>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <?php endforeach; ?>
        <?php if ($totalPages > 1): ?>
        <div class="access-pagination">
            <a class="btn btn-ghost <?= $page <= 1 ? 'disabled' : '' ?>" href="<?= url('admin/traces?' . build_query(['page' => max(1, $page - 1)], $filters)) ?>">上一页</a>
            <?php
            $startPage = max(1, $page - 2);
            $endPage = min($totalPages, $page + 2);
            for ($i = $startPage; $i <= $endPage; $i++): ?>
                <a class="btn <?= $i === $page ? 'btn-primary' : 'btn-ghost' ?>" href="<?= url('admin/traces?' . build_query(['page' => $i], $filters)) ?>"><?= $i ?></a>
            <?php endfor; ?>
            <a class="btn btn-ghost <?= $page >= $totalPages ? 'disabled' : '' ?>" href="<?= url('admin/traces?' . build_query(['page' => min($totalPages, $page + 1)], $filters)) ?>">下一页</a>
        </div>
        <?php endif; ?>
    <?php endif; ?>
</div>

<script>
function toggleAccessBan(target, value, action) {
    const label = target === 'ip' ? 'IP' : '设备';
    const verb = action === 'ban' ? '封禁' : '解封';
    const msg = action === 'ban'
        ? `确定将该${label}加入全局黑名单？\n${label}：${value}`
        : `确定解除该${label}的全局封禁？\n${label}：${value}`;
    if (!confirm(msg)) return;
    const formData = new FormData();
    formData.append('ajax_ban_action', '1');
    formData.append('_csrf', '<?= csrf_token() ?>');
    formData.append('target', target);
    formData.append('value', value);
    formData.append('ban_action', action);
    fetch('<?= url('admin/traces') ?>', {
        method: 'POST',
        body: formData,
        headers: { 'X-Requested-With': 'XMLHttpRequest' }
    }).then(r => r.json())
      .then(res => {
        if (res.ok) {
            alert(res.msg || '操作成功');
            window.location.reload();
            return;
        }
        alert(res.msg || '操作失败');
      })
      .catch(() => alert('网络异常，稍后重试。'));
}
</script>

<?php
$content = ob_get_clean();
require ROOT . '/admin/layout.php';
