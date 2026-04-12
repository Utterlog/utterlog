<?php
/**
 * LiMhy - 访问封禁管理面板
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    提供硬件设备指纹与 IP 地址的黑名单解封与可视化管理
 */
declare(strict_types=1);
require_admin();

// 1. 表单动作：解封策略处理
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $action = $_POST['action'] ?? '';
    
    if ($action === 'unban_device') {
        $guid = preg_replace('/[^a-zA-Z0-9\-]/', '', $_POST['guid'] ?? '');
        if ($guid) Firewall::unbanDevice($guid);
        set_flash('success', '设备已被释放，若再犯将重新封杀');
    } elseif ($action === 'unban_ip') {
        $ip = filter_var($_POST['ip'] ?? '', FILTER_VALIDATE_IP);
        if ($ip) Firewall::manualUnbanIp($ip);
        set_flash('success', 'IP 已被释放，防线重新进入潜伏态');
    }
    redirect('admin/bans');
}

// 2. 数据萃取：读取设备指纹黑名单
$deviceListFile = ROOT . '/data/firewall/' . md5('device_blacklist') . '.php';
$bannedDevices = file_exists($deviceListFile) ? (@include $deviceListFile)['val'] ?? [] : [];
if (!is_array($bannedDevices)) $bannedDevices = [];

// 3. 数据萃取：日志逆向解析获取封禁 IP 矩阵
$bannedIps = [];
$ipRegex = '/\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b|\b(?:[a-fA-F0-9]{1,4}:){7}[a-fA-F0-9]{1,4}\b/';

function extractBannedIpsFromFile(string $file, string $ipRegex, array &$bannedIps) {
    if (file_exists($file)) {
        $content = @file_get_contents($file);
        if ($content && preg_match_all($ipRegex, $content, $matches)) {
            foreach (array_unique($matches[0]) as $ip) {
                if (!isset($bannedIps[$ip])) {
                    $analysis = Firewall::getIpAnalysis($ip);
                    if ($analysis['is_banned']) {
                        $bannedIps[$ip] = $analysis;
                    }
                }
            }
        }
    }
}
extractBannedIpsFromFile(ROOT . '/data/firewall/attack.log', $ipRegex, $bannedIps);
extractBannedIpsFromFile(ROOT . '/data/firewall/trace.log', $ipRegex, $bannedIps);

$pageTitle = '封禁黑名单';
$currentNav = 'bans';

ob_start();
?>
<div class="stats-grid" style="margin-bottom: 24px;">
    <div class="admin-stat" style="border-left: 4px solid var(--color-danger);">
        <div class="admin-stat__value"><?= count($bannedDevices) ?></div>
        <div class="admin-stat__label">已锁死物理设备</div>
    </div>
    <div class="admin-stat" style="border-left: 4px solid var(--color-warning);">
        <div class="admin-stat__value"><?= count($bannedIps) ?></div>
        <div class="admin-stat__label">已绞杀恶意 IP</div>
    </div>
</div>

<div class="admin-card">
    <div class="admin-card__header">
        <h3 class="admin-card__title"><i class="ri-macbook-line" style="margin-right:8px;color:var(--color-primary);"></i> 硬件设备封禁阵列 (Device Guard)</h3>
    </div>
    <div class="admin-table-wrap">
        <?php if (empty($bannedDevices)): ?>
            <div class="admin-empty">当前没有被封禁的设备</div>
        <?php else: ?>
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>硬件特征指纹 (GUID)</th>
                        <th>状态</th>
                        <th style="text-align: right;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($bannedDevices as $guid): ?>
                    <tr>
                        <td style="font-family: monospace; color: var(--color-text-2);"><?= e($guid) ?></td>
                        <td><span class="badge badge-spam">永久剥夺访问权</span></td>
                        <td style="text-align: right;">
                            <form method="POST" style="display:inline-block;" onsubmit="return confirm('释放后该设备可重新访问博客。确定释放吗？');">
                                <?= csrf_field() ?>
                                <input type="hidden" name="action" value="unban_device">
                                <input type="hidden" name="guid" value="<?= e($guid) ?>">
                                <button type="submit" class="btn btn-ghost is-danger">解除封禁</button>
                            </form>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
</div>

<div class="admin-card" style="margin-top: 24px;">
    <div class="admin-card__header">
        <h3 class="admin-card__title"><i class="ri-router-line" style="margin-right:8px;color:var(--color-danger);"></i> IP 封禁阵列 (WAF / CC)</h3>
    </div>
    <div class="admin-table-wrap">
        <?php if (empty($bannedIps)): ?>
            <div class="admin-empty">当前没有被封禁的 IP</div>
        <?php else: ?>
            <table class="admin-table">
                <thead>
                    <tr>
                        <th>IP 地址</th>
                        <th>归属地</th>
                        <th>封禁原因</th>
                        <th>解封时间</th>
                        <th style="text-align: right;">操作</th>
                    </tr>
                </thead>
                <tbody>
                    <?php foreach ($bannedIps as $ip => $data): ?>
                    <tr>
                        <td style="font-family: monospace; font-weight: 500;"><?= e($ip) ?></td>
                        <td><?= e($data['geo_country'] ?: '未知') ?></td>
                        <td>
                            <span class="badge badge-pending"><?= e($data['ban_reason'] ?: '系统防卫机制') ?></span>
                        </td>
                        <td>
                            <?php if ($data['ban_end'] > time() + 31536000): ?>
                                <span style="color:var(--color-danger);">永久封禁</span>
                            <?php else: ?>
                                <?= date('Y-m-d H:i:s', $data['ban_end']) ?>
                            <?php endif; ?>
                        </td>
                        <td style="text-align: right;">
                            <form method="POST" style="display:inline-block;" onsubmit="return confirm('释放后该 IP 的惩罚分数将清零。确定释放吗？');">
                                <?= csrf_field() ?>
                                <input type="hidden" name="action" value="unban_ip">
                                <input type="hidden" name="ip" value="<?= e($ip) ?>">
                                <button type="submit" class="btn btn-ghost is-danger">解除封禁</button>
                            </form>
                        </td>
                    </tr>
                    <?php endforeach; ?>
                </tbody>
            </table>
        <?php endif; ?>
    </div>
</div>

<?php
$content = ob_get_clean();
require __DIR__ . '/layout.php'; 
?>
