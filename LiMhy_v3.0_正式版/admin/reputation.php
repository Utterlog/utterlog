<?php
declare(strict_types=1);
require_once __DIR__ . '/../index.php';
require_admin();

$currentNav = 'reputation';
$pageTitle = '信誉中心';


if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $ipAction = clean($_POST['ip_action'] ?? '', 30);
    $ip = clean($_POST['ip'] ?? '', 100);
    if (filter_var($ip, FILTER_VALIDATE_IP)) {
        if ($ipAction === 'reset_score' && function_exists('reputation_reset_ip_score')) {
            reputation_reset_ip_score($ip);
            set_flash('success', '该 IP 的信誉分已清零。');
        } elseif ($ipAction === 'clear_history' && function_exists('reputation_clear_ip_history')) {
            reputation_clear_ip_history($ip);
            set_flash('success', '该 IP 的历史请求与画像记录已清理。');
        }
    }
    redirect('admin/reputation');
}

$filters = [
    'ip' => clean($_GET['ip'] ?? '', 100),
    'guid' => clean($_GET['guid'] ?? '', 120),
    'path' => clean($_GET['path'] ?? '', 200),
    'level' => clean($_GET['level'] ?? '', 20),
    'start_date' => clean($_GET['start_date'] ?? '', 20),
    'end_date' => clean($_GET['end_date'] ?? '', 20),
];

if (isset($_GET['ajax_detail']) && is_ajax()) {
    header('Content-Type: application/json; charset=utf-8');
    $ip = clean($_GET['ip'] ?? '', 100);
    if ($ip === '') {
        echo json_encode(['ok' => false, 'msg' => 'IP 不存在'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $profile = function_exists('reputation_profile_for_ip') ? reputation_profile_for_ip($ip) : [];
    if (!$profile) {
        echo json_encode(['ok' => false, 'msg' => '画像不存在'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $analysis = class_exists('Firewall') ? Firewall::getIpAnalysis($ip) : [];
    $sampleGuid = trim((string)($profile['sample_guid'] ?? ''));
    $isDeviceBanned = $sampleGuid !== '' && class_exists('Firewall') ? Firewall::isGuidBanned($sampleGuid) : false;
    $identityValue = '';
    $identityCount = 0;
    $isIdentityBanned = false;
    $displayName = 'IP 画像实体';
    $avatar = '';
    $email = '';
    $siteUrl = '';

    $accessRows = function_exists('access_log_collect') ? array_slice(access_log_collect(['ip' => $ip]), 0, 8) : [];
    foreach ($accessRows as $row) {
        if ($displayName === 'IP 画像实体' && !empty($row['author_name'])) {
            $displayName = (string)$row['author_name'];
        }
        if ($avatar === '' && !empty($row['avatar'])) {
            $avatar = (string)$row['avatar'];
        }
        if ($email === '' && !empty($row['comment_email'])) {
            $email = (string)$row['comment_email'];
            $identityValue = $email;
        }
        if ($siteUrl === '' && !empty($row['comment_url'])) {
            $siteUrl = (string)$row['comment_url'];
        }
    }
    if ($email !== '' && class_exists('Firewall')) {
        $identityCount = Firewall::getIdentityDeviceCount($email);
        $isIdentityBanned = Firewall::isIdentityBanned($email);
    }
    $probeRows = function_exists('f12_probe_collect') ? array_slice(f12_probe_collect(['ip' => $ip]), 0, 6) : [];
    $recentItems = [];
    foreach ($accessRows as $row) {
        $recentItems[] = [
            'time' => (string)($row['time'] ?? ''),
            'label' => strtoupper((string)($row['method'] ?? 'GET')) . ' ' . (string)($row['path'] ?? '/'),
            'content' => '来源：' . (string)($row['request_from'] ?? '站内') . ' · 浏览器：' . (string)($row['browser'] ?? '未知') . ' · 系统：' . (string)($row['os'] ?? '未知'),
        ];
    }
    foreach ($probeRows as $row) {
        $recentItems[] = [
            'time' => (string)($row['time'] ?? ''),
            'label' => 'F12 探针',
            'content' => '原因：' . (string)($row['reason'] ?? '未知') . ' · 页面：' . (string)($row['path'] ?? ($row['url'] ?? '/')),
        ];
    }
    usort($recentItems, static fn($a, $b) => strcmp((string)($b['time'] ?? ''), (string)($a['time'] ?? '')));
    $panelHtml = function_exists('security_profile_render_panel') ? security_profile_render_panel([
        'author' => $displayName,
        'avatar_url' => $avatar,
        'email' => $email,
        'url' => $siteUrl,
        'ip' => $ip,
        'geo_country' => (string)($analysis['geo_country'] ?? ($profile['network']['country'] ?? '未知位置')),
        'score' => (int)($analysis['score'] ?? ($profile['total_score'] ?? 0)),
        'threshold' => (int)($analysis['threshold'] ?? 30),
        'risk_level' => (string)($analysis['risk_level'] ?? ($profile['risk_level'] ?? 'safe')),
        'components' => (array)($analysis['components'] ?? ($profile['components'] ?? [])),
        'network' => (array)($analysis['network'] ?? ($profile['network'] ?? [])),
        'decision' => (array)($analysis['decision'] ?? []),
        'request_count' => (int)($analysis['request_count'] ?? ($profile['request_count'] ?? 0)),
        'f12_hits' => (int)($analysis['f12_hits'] ?? ($profile['f12_hits'] ?? 0)),
        'unique_paths' => (int)($analysis['unique_paths'] ?? ($profile['unique_paths'] ?? 0)),
        'peak_minute' => (int)($analysis['peak_minute'] ?? ($profile['peak_minute'] ?? 0)),
        'device_guid' => $sampleGuid,
        'is_device_banned' => (bool)$isDeviceBanned,
        'is_banned' => (bool)($analysis['is_banned'] ?? false),
        'identity_count' => (int)$identityCount,
        'is_identity_banned' => (bool)$isIdentityBanned,
        'identity_value' => $identityValue,
        'recent_items' => array_slice($recentItems, 0, 6),
    ]) : '';
    echo json_encode(['ok' => true, 'html' => $panelHtml], JSON_UNESCAPED_UNICODE);
    exit;
}

$page = max(1, (int)($_GET['page'] ?? 1));
$perPage = 20;
$allProfiles = function_exists('reputation_collect_profiles') ? reputation_collect_profiles($filters) : [];
$levels = ['safe' => 0, 'observe' => 0, 'challenge' => 0, 'restrict' => 0, 'ban' => 0];
$scoreSum = 0;
foreach ($allProfiles as $profile) {
    $lvl = (string)($profile['risk_level'] ?? 'safe');
    $levels[$lvl] = ($levels[$lvl] ?? 0) + 1;
    $scoreSum += (int)($profile['total_score'] ?? 0);
}
$overview = [
    'total_entities' => count($allProfiles),
    'average_score' => $allProfiles ? (int)round($scoreSum / count($allProfiles)) : 0,
    'safe' => $levels['safe'],
    'observe' => $levels['observe'],
    'challenge' => $levels['challenge'],
    'restrict' => $levels['restrict'],
    'ban' => $levels['ban'],
];
$total = count($allProfiles);
$totalPages = max(1, (int)ceil($total / $perPage));
if ($page > $totalPages) { $page = $totalPages; }
$profiles = array_slice($allProfiles, ($page - 1) * $perPage, $perPage);
$detailIp = clean($_GET['detail_ip'] ?? '', 100);
$detail = null;
if ($detailIp !== '' && function_exists('reputation_profile_for_ip')) {
    $detail = reputation_profile_for_ip($detailIp);
}

function rep_build_query(array $extra = [], array $filters = []): string {
    $base = array_filter(array_merge($filters, $extra), static function ($v) { return $v !== '' && $v !== null; });
    return http_build_query($base);
}
function rep_level_label(string $level): string {
    $map = ['safe' => '安全', 'observe' => '观察', 'challenge' => '挑战', 'restrict' => '限制', 'ban' => '封禁'];
    return $map[$level] ?? $level;
}

ob_start();
?>

<style>
.security-profile{display:flex;flex-direction:column;gap:16px}.security-profile__header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.security-profile__identity{display:flex;gap:14px;align-items:center}.security-profile__avatar{width:56px;height:56px;border-radius:50%;border:1px solid var(--color-border);object-fit:cover}.security-profile__who h3{margin:0;font-size:28px;color:var(--color-text-1)}.security-profile__who p{margin:4px 0 0;font-size:13px;color:var(--color-text-3)}.security-profile__who a{color:var(--color-primary)}.security-profile__tags{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.security-profile__level,.security-profile__chip{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;font-size:12px;font-weight:700}.security-profile__level--safe{background:rgba(34,197,94,.12);color:#15803d}.security-profile__level--observe{background:rgba(59,130,246,.12);color:#1d4ed8}.security-profile__level--challenge{background:rgba(245,158,11,.14);color:#b45309}.security-profile__level--restrict,.security-profile__level--ban{background:rgba(239,68,68,.12);color:#b91c1c}.security-profile__chip{background:#f5f7fb;color:var(--color-text-2);border:1px solid var(--color-border)}.security-profile__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.security-profile__card{background:#fff;border:1px solid var(--color-border);border-radius:16px;padding:16px}.security-profile__card.is-danger{border-color:rgba(239,68,68,.24);background:rgba(239,68,68,.04)}.security-profile__card.is-warning{border-color:rgba(245,158,11,.28);background:rgba(245,158,11,.06)}.security-profile__card.is-observe{border-color:rgba(59,130,246,.28);background:rgba(59,130,246,.05)}.security-profile__card.is-safe{border-color:rgba(34,197,94,.22);background:rgba(34,197,94,.04)}.security-profile__card--wide{grid-column:1 / -1}.security-profile__card-title{font-size:12px;color:var(--color-text-3);margin-bottom:10px;display:flex;gap:6px;align-items:center}.security-profile__card-main{font-size:28px;font-weight:800;color:var(--color-text-1)}.security-profile__card-main code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:14px}.security-profile__card-main--with-action{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;font-size:22px;flex-wrap:wrap}.security-profile__value-stack{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1 1 220px}.security-profile__value-text{display:block;min-width:0;overflow-wrap:anywhere;word-break:break-word;line-height:1.35}.security-profile__action-wrap{display:flex;justify-content:flex-end;flex:0 0 auto}.security-profile__card-main--accent{color:var(--color-primary);font-size:24px}.security-profile__action{padding:0 10px;height:32px;font-size:12px;white-space:nowrap}.security-profile__metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.security-profile__metric{border:1px solid var(--color-border);border-radius:12px;padding:12px 14px;background:var(--color-fill-2,#fafafa)}.security-profile__metric-label{font-size:12px;color:var(--color-text-3)}.security-profile__metric-value{margin-top:6px;font-size:20px;font-weight:800;color:var(--color-text-1)}.security-profile__meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;color:var(--color-text-2);font-size:13px}.security-profile__history-title{font-size:16px;font-weight:700;color:var(--color-text-1);display:flex;gap:8px;align-items:center}.security-profile__timeline{display:flex;flex-direction:column;gap:10px}.security-profile__timeline-item{border-left:3px solid var(--color-primary);background:#f7f9fc;border-radius:12px;padding:10px 12px}.security-profile__timeline-time{font-size:12px;color:var(--color-text-3)}.security-profile__timeline-label{margin-top:4px;font-size:12px;color:var(--color-text-2)}.security-profile__timeline-content{margin-top:6px;font-size:13px;color:var(--color-text-1);line-height:1.6}.security-profile__empty{text-align:center;padding:16px;color:var(--color-text-3);border:1px dashed var(--color-border);border-radius:12px}.rep-modal-overlay{position:fixed;inset:0;background:rgba(15,23,42,.28);display:none;align-items:center;justify-content:center;padding:24px;z-index:9999}.rep-modal-overlay.is-active{display:flex}.rep-modal-box{width:min(1080px,100%);max-height:calc(100vh - 48px);overflow:auto;background:#fff;border-radius:20px;border:1px solid var(--color-border);box-shadow:0 24px 80px rgba(15,23,42,.18)}.rep-modal-header{display:flex;justify-content:space-between;align-items:center;padding:18px 22px;border-bottom:1px solid var(--color-border);font-size:18px;font-weight:800;color:var(--color-text-1)}.rep-modal-close{font-size:22px;cursor:pointer;color:var(--color-text-3)}.rep-modal-body{padding:22px}@media(max-width:900px){.security-profile__grid,.security-profile__metrics,.security-profile__meta{grid-template-columns:1fr}.security-profile__header{flex-direction:column}.security-profile__card-main--with-action{flex-direction:column;align-items:flex-start}.security-profile__who h3{font-size:22px}}@media(max-width:640px){.security-profile__identity{align-items:flex-start}.security-profile__avatar{width:48px;height:48px}.security-profile__card-main{font-size:22px}.security-profile__card-main code{font-size:12px}.security-profile__value-stack{flex-basis:100%}.security-profile__action-wrap{width:100%;justify-content:flex-start}.security-profile__action{max-width:100%}} </style>
<style>
.rep-toolbar{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:16px;margin-bottom:20px}.rep-kpi{background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-l);padding:18px 20px}.rep-kpi__label{font-size:12px;color:var(--color-text-3);margin-bottom:8px}.rep-kpi__value{font-size:30px;font-weight:800;color:var(--color-text-1)}.rep-card{background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-l);padding:20px;margin-bottom:20px}.rep-filter-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}.rep-input,.rep-select{width:100%;height:42px;border:1px solid var(--color-border);border-radius:10px;background:#fff;padding:0 12px;color:var(--color-text-1)}.rep-label{display:block;font-size:12px;color:var(--color-text-3);margin-bottom:8px}.rep-actions{display:flex;gap:10px;flex-wrap:wrap;margin-top:16px}.rep-list{background:#fff;border:1px solid var(--color-border);border-radius:var(--radius-l);overflow:hidden}.rep-item{display:grid;grid-template-columns:170px 1fr auto;gap:16px;padding:18px 20px;border-bottom:1px solid var(--color-border)}.rep-item:last-child{border-bottom:none}.rep-score{display:flex;flex-direction:column;gap:8px}.rep-score__value{font-size:34px;font-weight:900;color:var(--color-text-1)}.rep-badge{display:inline-flex;align-items:center;height:24px;padding:0 10px;border-radius:999px;font-size:12px;font-weight:700}.rep-badge--safe{background:rgba(34,197,94,.12);color:#15803d}.rep-badge--observe{background:rgba(59,130,246,.12);color:#1d4ed8}.rep-badge--challenge{background:rgba(245,158,11,.14);color:#b45309}.rep-badge--restrict,.rep-badge--ban{background:rgba(239,68,68,.12);color:#b91c1c}.rep-components{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-top:10px}.rep-mini{border:1px solid var(--color-border);border-radius:10px;padding:10px 12px;background:var(--color-fill-2, #fafafa)}.rep-mini__label{font-size:12px;color:var(--color-text-3)}.rep-mini__value{margin-top:4px;font-weight:800;color:var(--color-text-1)}.rep-meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px;font-size:13px;color:var(--color-text-2)}.rep-empty{padding:48px 20px;text-align:center;color:var(--color-text-3)}.rep-ops{display:flex;flex-wrap:wrap;justify-content:flex-end;align-items:center;gap:10px}.rep-ops form{margin:0}.rep-ops .btn{white-space:nowrap}.rep-pagination{display:flex;justify-content:flex-end;align-items:center;gap:8px;flex-wrap:wrap;margin-top:16px}@media(max-width:1200px){.rep-toolbar{grid-template-columns:repeat(3,1fr)}.rep-components{grid-template-columns:repeat(2,1fr)}.rep-filter-grid{grid-template-columns:repeat(2,1fr)}.rep-item{grid-template-columns:1fr}}@media(max-width:760px){.rep-toolbar,.rep-components,.rep-filter-grid{grid-template-columns:1fr}.rep-ops{justify-content:flex-start}}
</style>
<div class="rep-card">
    <div class="card-title"><i class="ri-shield-star-line"></i> 信誉中心</div>
    <div style="font-size:13px;color:var(--color-text-3);margin-top:6px;">把 SQL 注入、代码执行、XSS、目录探测之外，再叠加 IP 历史、行为路径、请求频率、UA 异常、设备与 ASN 信誉，形成更接近产品型的综合风险画像。</div>
</div>
<div class="rep-toolbar">
    <div class="rep-kpi"><div class="rep-kpi__label">画像实体</div><div class="rep-kpi__value"><?= (int)$overview['total_entities'] ?></div></div>
    <div class="rep-kpi"><div class="rep-kpi__label">平均信誉分</div><div class="rep-kpi__value"><?= (int)$overview['average_score'] ?></div></div>
    <div class="rep-kpi"><div class="rep-kpi__label">观察态</div><div class="rep-kpi__value"><?= (int)$overview['observe'] ?></div></div>
    <div class="rep-kpi"><div class="rep-kpi__label">挑战态</div><div class="rep-kpi__value"><?= (int)$overview['challenge'] ?></div></div>
    <div class="rep-kpi"><div class="rep-kpi__label">限制态</div><div class="rep-kpi__value"><?= (int)$overview['restrict'] ?></div></div>
    <div class="rep-kpi"><div class="rep-kpi__label">封禁态</div><div class="rep-kpi__value"><?= (int)$overview['ban'] ?></div></div>
</div>
<div class="rep-card">
    <form method="GET" action="<?= url('admin/reputation') ?>">
        <div class="rep-filter-grid">
            <div><label class="rep-label">IP</label><input class="rep-input" type="text" name="ip" value="<?= e($filters['ip']) ?>" placeholder="例如 59.173.31.0"></div>
            <div><label class="rep-label">GUID</label><input class="rep-input" type="text" name="guid" value="<?= e($filters['guid']) ?>" placeholder="例如 rj844geekgm"></div>
            <div><label class="rep-label">路径</label><input class="rep-input" type="text" name="path" value="<?= e($filters['path']) ?>" placeholder="例如 /post/14"></div>
            <div><label class="rep-label">风险等级</label><select class="rep-select" name="level"><option value="">全部</option><?php foreach (['safe','observe','challenge','restrict','ban'] as $lvl): ?><option value="<?= $lvl ?>" <?= $filters['level'] === $lvl ? 'selected' : '' ?>><?= e(rep_level_label($lvl)) ?></option><?php endforeach; ?></select></div>
            <div><label class="rep-label">开始日期</label><input class="rep-input" type="date" name="start_date" value="<?= e($filters['start_date']) ?>"></div>
            <div><label class="rep-label">结束日期</label><input class="rep-input" type="date" name="end_date" value="<?= e($filters['end_date']) ?>"></div>
        </div>
        <div class="rep-actions">
            <button type="submit" class="btn btn-primary">筛选信誉</button>
            <a class="btn btn-ghost" href="<?= url('admin/reputation') ?>">重置筛选</a>
        </div>
    </form>
</div>
<div class="rep-list">
    <?php if (!$profiles): ?>
        <div class="rep-empty">当前时间窗口内暂无信誉画像。</div>
    <?php else: ?>
        <?php foreach ($profiles as $profile): ?>
            <?php $level = (string)($profile['risk_level'] ?? 'safe'); $components = (array)($profile['components'] ?? []); $decision = function_exists('reputation_profile_decision') ? reputation_profile_decision($profile, class_exists('Firewall') ? Firewall::getConfig() : []) : []; ?>
            <div class="rep-item">
                <div class="rep-score">
                    <div class="rep-score__value"><?= (int)($profile['total_score'] ?? 0) ?></div>
                    <span class="rep-badge rep-badge--<?= e($level) ?>"><?= e(rep_level_label($level)) ?></span>
                    <div style="font-size:12px;color:var(--color-text-3);">最近出现：<?= e($profile['last_seen'] ?? '-') ?></div>
                    <?php if (!empty($decision['label'])): ?><div style="font-size:12px;color:var(--color-text-3);">建议动作：<?= e($decision['label']) ?></div><?php endif; ?>
                </div>
                <div>
                    <div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:8px;">
                        <strong><?= e($profile['ip'] ?? '-') ?></strong>
                        <?php if (!empty($profile['sample_guid'])): ?><span class="rep-badge rep-badge--observe">GUID <?= e($profile['sample_guid']) ?></span><?php endif; ?>
                        <?php if (!empty($profile['network']['asn'])): ?><span class="rep-badge rep-badge--observe"><?= e($profile['network']['asn']) ?></span><?php endif; ?>
                    </div>
                    <div class="rep-meta">
                        <span>请求数：<?= (int)($profile['request_count'] ?? 0) ?></span>
                        <span>F12 命中：<?= (int)($profile['f12_hits'] ?? 0) ?></span>
                        <span>独立路径：<?= (int)($profile['unique_paths'] ?? 0) ?></span>
                        <span>分钟峰值：<?= (int)($profile['peak_minute'] ?? 0) ?></span>
                    </div>
                    <div class="rep-components">
                        <div class="rep-mini"><div class="rep-mini__label">载荷信誉</div><div class="rep-mini__value"><?= (int)($components['payload'] ?? 0) ?></div></div>
                        <div class="rep-mini"><div class="rep-mini__label">IP 历史</div><div class="rep-mini__value"><?= (int)($components['ip_history'] ?? 0) ?></div></div>
                        <div class="rep-mini"><div class="rep-mini__label">行为路径</div><div class="rep-mini__value"><?= (int)($components['behavior'] ?? 0) ?></div></div>
                        <div class="rep-mini"><div class="rep-mini__label">请求频率</div><div class="rep-mini__value"><?= (int)($components['frequency'] ?? 0) ?></div></div>
                        <div class="rep-mini"><div class="rep-mini__label">UA 异常</div><div class="rep-mini__value"><?= (int)($components['ua'] ?? 0) ?></div></div>
                        <div class="rep-mini"><div class="rep-mini__label">设备信誉</div><div class="rep-mini__value"><?= (int)($components['device'] ?? 0) ?></div></div>
                        <div class="rep-mini"><div class="rep-mini__label">ASN 信誉</div><div class="rep-mini__value"><?= (int)($components['asn'] ?? 0) ?></div></div>
                        <div class="rep-mini"><div class="rep-mini__label">网络画像</div><div class="rep-mini__value"><?= e(($profile['network']['country'] ?? '') !== '' ? (string)$profile['network']['country'] : '未知') ?></div></div>
                    </div>
                </div>
                <div class="rep-ops">
                    <button type="button" class="btn btn-ghost js-rep-detail" data-ip="<?= e((string)$profile['ip']) ?>">查看详情</button>
                    <form method="POST" action="<?= url('admin/reputation') ?>" onsubmit="return confirm('确定将该 IP 的信誉分清零吗？');">
                        <?= csrf_field() ?>
                        <input type="hidden" name="ip" value="<?= e((string)$profile['ip']) ?>">
                        <input type="hidden" name="ip_action" value="reset_score">
                        <button type="submit" class="btn btn-ghost">信誉清零</button>
                    </form>
                    <form method="POST" action="<?= url('admin/reputation') ?>" onsubmit="return confirm('确定清除该 IP 的历史请求、探针与画像记录吗？此操作不可撤销。');">
                        <?= csrf_field() ?>
                        <input type="hidden" name="ip" value="<?= e((string)$profile['ip']) ?>">
                        <input type="hidden" name="ip_action" value="clear_history">
                        <button type="submit" class="btn btn-ghost">清除IP历史</button>
                    </form>
                    <a class="btn btn-ghost" href="<?= url('admin/traces?' . rep_build_query(['ip' => $profile['ip'], 'detail_ip' => $profile['ip']], [])) ?>">访问轨迹</a>
                    <a class="btn btn-ghost" href="<?= url('admin/f12-probes?' . rep_build_query(['ip' => $profile['ip']], [])) ?>">F12 轨迹</a>
                </div>
            </div>
        <?php endforeach; ?>
    <?php endif; ?>
</div>

<?php if ($totalPages > 1): ?>
<div class="rep-pagination">
    <a class="btn btn-ghost <?= $page <= 1 ? 'disabled' : '' ?>" href="<?= url('admin/reputation?' . rep_build_query(['page' => max(1, $page - 1)], $filters)) ?>">上一页</a>
    <?php
    $startPage = max(1, $page - 2);
    $endPage = min($totalPages, $page + 2);
    for ($i = $startPage; $i <= $endPage; $i++): ?>
        <a class="btn <?= $i === $page ? 'btn-primary' : 'btn-ghost' ?>" href="<?= url('admin/reputation?' . rep_build_query(['page' => $i], $filters)) ?>"><?= $i ?></a>
    <?php endfor; ?>
    <a class="btn btn-ghost <?= $page >= $totalPages ? 'disabled' : '' ?>" href="<?= url('admin/reputation?' . rep_build_query(['page' => min($totalPages, $page + 1)], $filters)) ?>">下一页</a>
</div>
<?php endif; ?>

<div id="repDetailModal" class="rep-modal-overlay"><div class="rep-modal-box"><div class="rep-modal-header">统一安全画像面板<i class="ri-close-line rep-modal-close" id="repDetailClose"></i></div><div class="rep-modal-body" id="repDetailBody"></div></div></div>
<script>
document.addEventListener('DOMContentLoaded', function(){
  const modal=document.getElementById('repDetailModal');
  const body=document.getElementById('repDetailBody');
  const closeBtn=document.getElementById('repDetailClose');
  const close=()=>modal.classList.remove('is-active');
  closeBtn.addEventListener('click', close);
  modal.addEventListener('click', function(e){ if(e.target===modal) close(); });
  body.addEventListener('click', function(e){
    const btn = e.target.closest('.js-security-ban-action');
    if(!btn) return;
    e.preventDefault();
    let value = btn.getAttribute('data-value') || '';
    try { value = JSON.parse(value); } catch(_) {}
    window.toggleBan(btn.getAttribute('data-target') || '', value, btn.getAttribute('data-action') || 'ban');
  });
  window.toggleBan = window.toggleBan || function(target, value, action) {
    let msg = target === 'identity' ? (action === 'ban' ? '【警告】确定全网封杀此人？\n系统将自动追溯并拉黑其名下所有的历史设备。' : '确定解除对该身份的封杀？\n系统将自动恢复其名下所有设备的访问权限。') : (action === 'ban' ? '确定封禁？' : '确定解封？');
    if(!confirm(msg)) return;
    const formData = new FormData();
    formData.append('ajax_ban_action', '1');
    formData.append('target', target);
    formData.append('value', value);
    formData.append('action', action);
    formData.append('_csrf', '<?=csrf_token()?>');
    fetch('<?=url('admin/comments')?>', { method:'POST', body: formData, headers: {'X-Requested-With':'XMLHttpRequest','Accept':'application/json'} })
      .then(async r => { const t = await r.text(); try { return JSON.parse(t); } catch(e) { throw new Error(t || '请求失败'); } })
      .then(res => { alert(res.msg || (res.ok ? '操作完成' : '操作失败')); if(res.ok) { close(); location.reload(); } })
      .catch(err => alert('请求失败：' + String((err && err.message) || err || '未知错误')));
  };
  window.openReputationDetail = function(ip){
    ip = ip || '';
    if(!ip) return;
    body.innerHTML='<div style="text-align:center;padding:40px;color:var(--color-text-3);"><i class="ri-radar-line" style="font-size:24px;animation:spin 1s linear infinite;display:inline-block;"></i><div style="margin-top:10px;">画像面板载入中...</div></div><style>@keyframes spin{100%{transform:rotate(360deg);}}</style>';
    modal.classList.add('is-active');
    fetch('<?=url('admin/reputation?ajax_detail=1&ip=')?>'+encodeURIComponent(ip), { headers: {'X-Requested-With':'XMLHttpRequest','Accept':'application/json'} })
      .then(async r=>{ const t = await r.text(); try { return JSON.parse(t); } catch(e) { throw new Error(t || '读取失败'); } })
      .then(res=>{ if(!res.ok) throw new Error(res.msg || '读取失败'); body.innerHTML=res.html || '<div style="padding:20px;text-align:center;color:var(--color-text-3);">暂无画像数据</div>'; })
      .catch(err=>{ body.innerHTML='<div style="padding:20px;text-align:center;color:var(--color-danger);">'+String((err && err.message) || '读取失败')+'</div>'; });
  };
  document.addEventListener('click', function(e){
    const btn = e.target.closest('.js-rep-detail');
    if (!btn) return;
    e.preventDefault();
    window.openReputationDetail(btn.getAttribute('data-ip') || '');
  });
  const autoIp = <?= json_encode($detailIp, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) ?>;
  if (autoIp) {
    const autoBtn = document.querySelector('.js-rep-detail[data-ip="'+autoIp.replace(/"/g,'\"')+'"]');
    if (autoBtn) { setTimeout(()=>autoBtn.click(), 240); }
  }
});
</script>
<?php
$content = ob_get_clean();
require __DIR__ . '/layout.php';
