<?php
/**
 * LiMhy - 仪表盘与态势感知大屏
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    全站数据统计呈现及 WAF 拦截日志实时监控
 */
require_once __DIR__ . '/../index.php';

$p = prefix();
$currentNav = 'dashboard';
$pageTitle = '仪表盘';

// 1. AJAX 接口：特定 IP 安全态势获取
if (isset($_GET['ajax_ip_detail']) && is_ajax()) {
    header('Content-Type: application/json');
    $ip = trim($_GET['ip'] ?? '');
    if (!filter_var($ip, FILTER_VALIDATE_IP)) {
        echo json_encode(['ok' => false, 'msg' => '无效的 IP 地址']); exit;
    }

    $history = db_rows("SELECT c.author, c.email, c.content, c.created_at, p.title as post_title FROM `{$p}comments` c LEFT JOIN `{$p}posts` p ON c.post_id = p.id WHERE c.ip = ? ORDER BY c.created_at DESC LIMIT 10", [$ip]);
    
    $firewallData = ['score' => 0, 'risk_level' => 'safe', 'is_banned' => false, 'geo_country' => ''];
    if (class_exists('Firewall')) {
        $firewallData = Firewall::getIpAnalysis($ip);
    }
    
    if (empty($firewallData['geo_country']) && function_exists('get_ip_location')) {
        $firewallData['geo_country'] = get_ip_location($ip);
    }

    echo json_encode([
        'ok' => true, 
        'data' => [ 'ip' => $ip, 'history' => $history, 'firewall' => $firewallData ]
    ]); 
    exit;
}

// 2. AJAX 接口：触发 IP 封禁/解封
if (isset($_POST['ajax_ban_action']) && is_ajax()) {
    header('Content-Type: application/json');
    if (!is_admin()) { echo json_encode(['ok'=>false, 'msg'=>'无权操作']); exit; }
    
    $value  = $_POST['value'] ?? '';
    $action = $_POST['action'] ?? ''; 
    
    if (class_exists('Firewall') && filter_var($value, FILTER_VALIDATE_IP)) {
        if ($action === 'ban') { Firewall::manualBanIp($value); echo json_encode(['ok'=>true, 'msg'=>'IP 已永久封禁']); }
        else { Firewall::manualUnbanIp($value); echo json_encode(['ok'=>true, 'msg'=>'IP 已解封']); }
    } else {
        echo json_encode(['ok'=>false, 'msg'=>'操作失败']);
    }
    exit;
}

// 3. 【新增】AJAX 接口：一键物理粉碎 HTML 静态缓存沙盒
if (isset($_POST['ajax_clear_cache']) && is_ajax()) {
    header('Content-Type: application/json');
    if (!is_admin()) { echo json_encode(['ok'=>false, 'msg'=>'权限异常']); exit; }
    if (function_exists('clear_html_cache')) {
        clear_html_cache();
        echo json_encode(['ok'=>true, 'msg'=>'前端 HTML 缓存沙盒已成功销毁，将在下次访问时重新构建。']);
    } else {
        echo json_encode(['ok'=>false, 'msg'=>'底层缓存自愈引擎未挂载']);
    }
    exit;
}

// 4. 业务统计数据聚合
$stats = [
    'posts'    => (int)db_value("SELECT COUNT(*) FROM `{$p}posts` WHERE `type`='post'"),
    'comments' => (int)db_value("SELECT COUNT(*) FROM `{$p}comments` WHERE `status`='approved'"),
    'drafts'   => (int)db_value("SELECT COUNT(*) FROM `{$p}posts` WHERE `status`='draft'"),
    'views'    => (int)db_value("SELECT SUM(view_count) FROM `{$p}posts`")
];

// 5. 防火墙拦截日志解析
$fwDir = __DIR__ . '/../data/firewall/';
$logFile = $fwDir . 'attack.log';

$bannedCount = 0;
if (is_dir($fwDir)) { $bannedCount = count(glob($fwDir . 'ban_*.php')); }

$logTypeMap = [
    'GEOIP_BLOCK' => ['地区封禁', 'var(--color-text-3)'],
    'MANUAL_BAN'  => ['手动封禁', '#165dff'],
    'BRUTE_FORCE' => ['暴力破解', '#722ed1'],
    'CC_ATTACK'   => ['CC 攻击',  '#ff7d00'],
    'EDGE_THREAT' => ['高危威胁', '#f53f3f'],
    'WAF:sqli'    => ['SQL注入',  '#f53f3f'],
    'WAF:xss'     => ['XSS 攻击', '#f53f3f'],
    'WAF:path'    => ['路径穿越', '#f53f3f'],
    'IP_BANNED'   => ['阻断拦截', 'var(--color-text-3)']
];

$interceptLogs = [];
if (file_exists($logFile)) {
    $lines = array_slice(file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES), -20);
    $lines = array_reverse($lines);
    foreach ($lines as $line) {
        if (preg_match('/^\[(.*?)\] (.*?) \| (.*?) \| (.*)$/', $line, $m)) {
            $rawType = trim($m[3]);
            $rawMsg = trim($m[4]);
            $zhType  = $logTypeMap[$rawType][0] ?? $rawType;
            $color   = $logTypeMap[$rawType][1] ?? 'var(--color-text-3)';
            $zhMsg = str_replace(['Country:', 'Admin Action', 'Admin login failed 5 times.'], ['来源:', '管理员操作', '输错密码 5 次封禁'], $rawMsg);

            $interceptLogs[] = [
                'time'  => date('H:i:s', strtotime($m[1])),
                'ip'    => $m[2],
                'type'  => $zhType,
                'msg'   => $zhMsg,
                'color' => $color
            ];
            if (count($interceptLogs) >= 6) break;
        }
    }
}

// 6. 内容动态数据
$recentPosts = db_rows("SELECT id, title, status FROM `{$p}posts` WHERE type='post' ORDER BY published_at DESC LIMIT 5");
$recentComments = db_rows("SELECT c.id, c.author, c.email, c.content, c.status, p.title as post_title, p.slug as post_slug, p.type as post_type FROM `{$p}comments` c LEFT JOIN `{$p}posts` p ON p.id=c.post_id ORDER BY c.created_at DESC LIMIT 5");

ob_start();
?>

<style>
.modal-overlay { position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.4); backdrop-filter: blur(4px); z-index: 9999; display: flex; align-items: center; justify-content: center; opacity: 0; visibility: hidden; transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.modal-overlay.is-active { opacity: 1; visibility: visible; }
.modal-box { background: #fff; width: 100%; max-width: 520px; border-radius: 12px; box-shadow: 0 10px 40px -10px rgba(0,0,0,0.15); transform: translateY(20px) scale(0.95); transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1); overflow: hidden; display: flex; flex-direction: column; }
.modal-overlay.is-active .modal-box { transform: translateY(0) scale(1); }
.modal-header { padding: 16px 20px; border-bottom: 1px solid var(--color-border); display: flex; justify-content: space-between; align-items: center; font-weight: 600; font-size: 16px; color: var(--color-text-1); }
.modal-close { cursor: pointer; font-size: 20px; color: var(--color-text-3); transition: color 0.2s; }
.modal-close:hover { color: var(--color-danger); }
.modal-body { padding: 20px; max-height: 75vh; overflow-y: auto; }

.detail-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 24px; }
.detail-card { background: var(--color-fill); padding: 12px; border-radius: 8px; border: 1px solid transparent; }
.detail-card-title { font-size: 12px; color: var(--color-text-3); margin-bottom: 4px; display:flex; align-items:center; gap:4px; }
.detail-card-value { font-size: 14px; font-weight: 600; color: var(--color-text-1); word-break: break-all; }
.is-safe { border-color: #e8ffea; background: #f6ffed; } .is-safe .detail-card-value { color: #00b42a; }
.is-warning { border-color: #fff7e8; background: #fffbe6; } .is-warning .detail-card-value { color: #ff7d00; }
.is-danger { border-color: #ffece8; background: #fff7f5; } .is-danger .detail-card-value { color: #f53f3f; }

.detail-history-title { font-size: 14px; font-weight: 600; margin-bottom: 12px; color: var(--color-text-1); border-top: 1px solid var(--color-border); padding-top: 20px; }
.history-item { margin-bottom: 12px; font-size: 13px; }
.history-time { color: var(--color-text-3); font-size: 11px; margin-bottom: 2px; }
.history-content { color: var(--color-text-2); background: #f9f9f9; padding: 8px; border-radius: 6px; border-left: 3px solid var(--color-primary); }

.clickable-ip { color:var(--color-primary); cursor:pointer; text-decoration:none; transition: opacity 0.2s; font-weight:600; }
.clickable-ip:hover { opacity:0.8; text-decoration:underline; }
</style>

<div class="stats-grid stats-grid--dashboard">
    <div class="stat-card">
        <div class="stat-icon-box" style="background:#E8F3FF; color:#165DFF;">
            <i class="ri-article-line" style="font-size:24px;"></i>
        </div>
        <div class="stat-info"><h4 class="admin-stat__label">文章总数</h4><h3 class="admin-stat__value"><?=$stats['posts']?></h3></div>
    </div>
    
    <div class="stat-card">
        <div class="stat-icon-box" style="background:#E8FFEA; color:#00B42A;">
            <i class="ri-eye-line" style="font-size:24px;"></i>
        </div>
        <div class="stat-info"><h4 class="admin-stat__label">总浏览量</h4><h3 class="admin-stat__value"><?=$stats['views']?></h3></div>
    </div>

    <div class="stat-card">
        <div class="stat-icon-box" style="background:#FFF7E8; color:#FF7D00;">
            <i class="ri-message-3-line" style="font-size:24px;"></i>
        </div>
        <div class="stat-info"><h4 class="admin-stat__label">评论互动</h4><h3 class="admin-stat__value"><?=$stats['comments']?></h3></div>
    </div>
    
    <div class="stat-card">
        <div class="stat-icon-box" style="background:#FFECE8; color:#F53F3F;">
            <i class="ri-shield-keyhole-line" style="font-size:24px;"></i>
        </div>
        <div class="stat-info">
            <h4 class="admin-stat__label">正在封禁</h4>
            <h3 class="admin-stat__value">
                <?=$bannedCount?>
                <span class="admin-stat__meta">个目标</span>
            </h3>
        </div>
    </div>
</div>

<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap:16px;">
    
    <div class="card" style="display:flex; flex-direction:column;">
        <div class="card-header" style="border-bottom:none; padding-bottom:0;">
            <div class="card-title"><i class="ri-radar-line" style="vertical-align:middle; margin-right:6px; color:var(--color-primary)"></i>实时防御动态</div>
        </div>
        <div style="flex:1; padding:16px 20px;">
            <?php if(empty($interceptLogs)): ?>
                <div style="height:100%; display:flex; align-items:center; justify-content:center; color:var(--color-text-3); flex-direction:column; min-height:150px;">
                    <i class="ri-shield-check-line" style="font-size:32px; margin-bottom:8px; color:#00B42A;"></i>
                    <span>暂无攻击记录，系统运行安全</span>
                </div>
            <?php else: ?>
                <div style="display:flex; flex-direction:column; gap:12px;">
                    <?php foreach($interceptLogs as $log): ?>
                    <div style="display:flex; align-items:center; gap:12px; font-size:13px;">
                        <div style="color:var(--color-text-3); font-family:monospace; font-size:12px; flex-shrink:0;">
                            <?=$log['time']?>
                        </div>
                        <div style="flex-shrink:0; width:70px; text-align:center;">
                            <span style="font-size:11px; padding:2px 6px; border-radius:4px; font-weight:500; background:<?=$log['color']?>15; color:<?=$log['color']?>; border:1px solid <?=$log['color']?>30;">
                                <?=$log['type']?>
                            </span>
                        </div>
                        <div style="flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--color-text-1);">
                            <span class="clickable-ip js-view-ip-detail" data-ip="<?=e($log['ip'])?>"><?=e($log['ip'])?></span> 
                            <span style="color:var(--color-text-3)">: <?=e($log['msg'])?></span>
                        </div>
                    </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>
    </div>

    <div class="card">
        <div class="card-header"><div class="card-title">最近更新</div></div>
        <table class="table">
            <tbody>
            <?php foreach($recentPosts as $p): ?>
                <tr>
                    <td style="padding:12px 0; border-bottom:1px solid var(--color-border);"><div style="font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:200px;"><?=e($p['title'])?></div></td>
                    <td style="padding:12px 0; border-bottom:1px solid var(--color-border); text-align:right;"><span class="badge badge-<?=e($p['status'])?>"><?=$p['status']=='published'?'已发布':($p['status']=='draft'?'草稿':'私密')?></span></td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <div class="card">
        <div class="card-header"><div class="card-title">最近互动</div></div>
        <div style="display:flex; flex-direction:column; gap:10px;">
            <?php if (!$recentComments): ?>
                <div style="padding:18px 14px; border:1px dashed var(--color-border); border-radius:10px; font-size:13px; color:var(--color-text-3);">暂无互动记录</div>
            <?php endif; ?>
            <?php foreach($recentComments as $c):
                $avatar = get_avatar_url($c['email'], $c['author']);
                $commentLink = url('admin/comments?highlight=' . (int)$c['id'] . '&open_detail=' . (int)$c['id']);
                $postTitle = trim((string)($c['post_title'] ?? '')) !== '' ? $c['post_title'] : '所属文章已删除';
                $postUrl = '';
                if (!empty($c['post_slug'])) {
                    $postUrl = url(($c['post_type'] === 'page' ? 'page/' : 'post/') . $c['post_slug']);
                }
                $commentStatusMap = ['approved' => '已通过', 'pending' => '待审核', 'spam' => '垃圾'];
                $commentStatusStyleMap = [
                    'approved' => 'background:rgba(34, 197, 94, 0.12); color:#15803d; border:1px solid rgba(34, 197, 94, 0.18);',
                    'pending' => 'background:rgba(245, 158, 11, 0.12); color:#b45309; border:1px solid rgba(245, 158, 11, 0.18);',
                    'spam' => 'background:rgba(239, 68, 68, 0.10); color:#b91c1c; border:1px solid rgba(239, 68, 68, 0.16);',
                ];
                $commentStatusText = $commentStatusMap[$c['status']] ?? (string)$c['status'];
                $commentStatusStyle = $commentStatusStyleMap[$c['status']] ?? 'background:rgba(148, 163, 184, 0.12); color:#475569; border:1px solid rgba(148, 163, 184, 0.18);';
            ?>
            <div style="display:flex; gap:12px; align-items:flex-start; padding:10px; border-radius:10px; transition:background .2s ease;" onmouseover="this.style.background='var(--color-fill)'" onmouseout="this.style.background='transparent'">
                <img src="<?=e($avatar)?>" style="width:36px; height:36px; border-radius:50%; border:1px solid var(--color-border); object-fit:cover; flex-shrink:0;" alt="<?=e($c['author'])?>">
                <div style="overflow:hidden; min-width:0; flex:1;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                        <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
                            <a href="<?=e($commentLink)?>" style="font-size:14px; font-weight:500; color:var(--color-text-1); text-decoration:none; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><?=e($c['author'])?></a>
                            <span style="<?=$commentStatusStyle?> display:inline-flex; align-items:center; justify-content:center; height:22px; padding:0 8px; border-radius:999px; font-size:11px; line-height:1; white-space:nowrap; flex-shrink:0;"><?=e($commentStatusText)?></span>
                        </div>
                        <a href="<?=e($commentLink)?>" style="font-size:11px; color:var(--color-primary); flex-shrink:0; text-decoration:none;">直达评论</a>
                    </div>
                    <div style="font-size:12px; color:var(--color-text-3); margin-top:4px; line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;"><?=e(mb_substr($c['content'],0,40))?><?=mb_strlen($c['content'])>40?'...':''?></div>
                    <div style="display:flex; align-items:center; gap:8px; margin-top:8px; min-width:0;">
                        <span style="font-size:11px; color:var(--color-text-3); flex-shrink:0;">所属内容</span>
                        <?php if($postUrl): ?>
                            <a href="<?=e($postUrl)?>" target="_blank" rel="noopener noreferrer" style="font-size:11px; color:var(--color-primary); text-decoration:none; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><?=e($postTitle)?></a>
                        <?php else: ?>
                            <span style="font-size:11px; color:var(--color-text-3); min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;"><?=e($postTitle)?></span>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</div>

<div id="ipDetailModal" class="modal-overlay">
    <div class="modal-box">
        <div class="modal-header">
            威胁情报与活动分析
            <i class="ri-close-line modal-close" id="closeIpModalBtn"></i>
        </div>
        <div class="modal-body" id="ipDetailBody"></div>
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const modal = document.getElementById('ipDetailModal');
    const closeBtn = document.getElementById('closeIpModalBtn');
    const modalBody = document.getElementById('ipDetailBody');
    const closeModal = () => { modal.classList.remove('is-active'); };
    
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });
    const escapeHtml = (u) => (u||'').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");

    window.toggleIpBan = function(ip, action) {
        if(!confirm(action === 'ban' ? '确定封禁此 IP 地址？\n该 IP 下的所有访问将被拦截。' : '确定解封此 IP？')) return;
        
        const formData = new FormData();
        formData.append('ajax_ban_action', '1');
        formData.append('value', ip);
        formData.append('action', action);

        fetch('<?=url("admin/dashboard")?>', { method:'POST', body: formData, headers: {'X-Requested-With':'XMLHttpRequest'} })
        .then(r => r.json())
        .then(res => { 
            alert(res.msg); 
            if(res.ok) window.location.reload(); 
        })
        .catch(() => alert('操作失败'));
    };

    document.querySelectorAll('.js-view-ip-detail').forEach(btn => {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            const ip = this.getAttribute('data-ip');
            
            modalBody.innerHTML = `<div style="text-align:center; padding:40px; color:var(--color-text-3);"><i class="ri-radar-line" style="font-size:24px; animation:spin 1s linear infinite; display:inline-block; color:var(--color-primary)"></i><div style="margin-top:10px;">正在扫描目标信息...</div></div><style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>`;
            modal.classList.add('is-active');

            fetch('<?=url("admin/dashboard?ajax_ip_detail=1&ip=")?>' + encodeURIComponent(ip), { headers: {'X-Requested-With':'XMLHttpRequest'} })
            .then(res => res.json())
            .then(res => {
                if(!res.ok) throw new Error(res.msg);
                const data = res.data; 
                const fw = data.firewall;
                let riskClass = 'is-safe'; 
                if(fw.risk_level === 'warning') riskClass = 'is-warning'; 
                if(fw.risk_level === 'danger') riskClass = 'is-danger';
                
                let html = `
                    <div class="detail-grid">
                        <div class="detail-card">
                            <div class="detail-card-title"><i class="ri-global-line"></i> 目标 IP 地址</div>
                            <div class="detail-card-value" style="display:flex; justify-content:space-between; align-items:center;">
                                <span>${escapeHtml(data.ip)}</span>
                                ${fw.is_banned ? 
                                    `<button onclick="toggleIpBan('${escapeHtml(data.ip)}', 'unban')" class="btn btn-primary" style="padding:0 6px; height:20px; font-size:11px;">解封IP</button>` : 
                                    `<button onclick="toggleIpBan('${escapeHtml(data.ip)}', 'ban')" class="btn is-danger" style="padding:0 6px; height:20px; font-size:11px;">封禁IP</button>`
                                }
                            </div>
                        </div>
                        <div class="detail-card">
                            <div class="detail-card-title"><i class="ri-map-pin-line"></i> 物理位置溯源</div>
                            <div class="detail-card-value"><span style="color:var(--color-primary)">${escapeHtml(fw.geo_country || '未知位置')}</span></div>
                        </div>
                        <div class="detail-card ${riskClass}" style="grid-column: span 2;">
                            <div class="detail-card-title"><i class="ri-shield-user-line"></i> 威胁评估得分 (判定阈值:${fw.threshold})</div>
                            <div class="detail-card-value" style="display:flex; justify-content:space-between; align-items:center;">
                                <span>${fw.score} 分 <span style="font-size:12px;font-weight:normal;opacity:0.8;margin-left:4px;">(分数越高，威胁越大)</span></span>
                                ${fw.is_banned ? `<span style="color:var(--color-danger);font-size:12px;display:flex;align-items:center;gap:4px;"><i class="ri-prohibited-line"></i> 该目标已被系统封锁</span>` : ''}
                            </div>
                        </div>
                    </div>`;

                html += `<div class="detail-history-title"><i class="ri-message-3-line"></i> 站内活动轨迹 (${data.history.length})</div>`;
                if(data.history.length > 0) { 
                    data.history.forEach(item => { 
                        html += `
                        <div class="history-item">
                            <div class="history-time" style="display:flex; justify-content:space-between;">
                                <span><i class="ri-user-3-line"></i> ${escapeHtml(item.author)} (${escapeHtml(item.email)})</span>
                                <span>${escapeHtml(item.created_at)}</span>
                            </div>
                            <div class="history-content">发表在《${escapeHtml(item.post_title)}》: ${escapeHtml(item.content)}</div>
                        </div>`; 
                    }); 
                } else { 
                    html += `<div style="font-size:12px; color:var(--color-text-3); text-align:center; padding:10px; background:var(--color-fill); border-radius:6px;">该 IP 未曾在本站留下过评论</div>`; 
                }
                
                modalBody.innerHTML = html;
            })
            .catch(err => modalBody.innerHTML = `<div style="color:var(--color-danger); padding:20px; text-align:center;">读取失败: ${escapeHtml(err.message)}</div>`);
        });
    });
});
</script>

<?php
$content = ob_get_clean();
require __DIR__ . '/layout.php';

