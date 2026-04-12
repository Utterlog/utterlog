<?php
/**
 * LiMhy - 主动防御配置面板
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    管理 WAF 开关、限频阈值及底层物理防火墙的热重载参数
 */
declare(strict_types=1);
require_once __DIR__ . '/../index.php';
require_admin();

$currentNav = 'fw_settings';
$pageTitle = '主动防御系统配置';

// 1. 配置参数注入与保存
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    
    $newConfig = [
        'enable'            => isset($_POST['enable']),
        'enable_edge'       => isset($_POST['enable_edge']),
        'enable_waf'        => isset($_POST['enable_waf']),
        'enable_cc'         => isset($_POST['enable_cc']),
        'enable_shield'     => isset($_POST['enable_shield']),
        'enable_geoip'      => isset($_POST['enable_geoip']),
        'enable_device_ban' => isset($_POST['enable_device_ban']),
        'enable_f12_probe'  => isset($_POST['enable_f12_probe']),
        'enable_auto_decision' => isset($_POST['enable_auto_decision']),
        
        'edge_threshold'    => max(5, (int)$_POST['edge_threshold']),
        'cc_limit_5s'       => max(5, (int)$_POST['cc_limit_5s']),
        'cc_limit_60s'      => max(10, (int)$_POST['cc_limit_60s']),
        'shield_trigger_qps'=> max(2, (int)$_POST['shield_trigger_qps']),
        'decision_challenge_score' => max(6, (int)($_POST['decision_challenge_score'] ?? 14)),
        'decision_restrict_score' => max(10, (int)($_POST['decision_restrict_score'] ?? 24)),
        'decision_ban_score' => max(15, (int)($_POST['decision_ban_score'] ?? 35)),
        'decision_ban_minutes' => max(10, (int)($_POST['decision_ban_minutes'] ?? 60)),
        'challenge_pass_minutes' => max(5, (int)($_POST['challenge_pass_minutes'] ?? 15)),
        
        'geoip_mode'        => ($_POST['geoip_mode'] ?? 'whitelist') === 'blacklist' ? 'blacklist' : 'whitelist',
    ];

    $cleanArray = function($input) {
        $arr = preg_split('/[\r\n,]+/', $input);
        return array_values(array_filter(array_map('trim', $arr)));
    };

    $newConfig['whitelist_ip'] = $cleanArray($_POST['whitelist_ip'] ?? '');
    $newConfig['friend_emails'] = $cleanArray($_POST['friend_emails'] ?? '');
    $newConfig['geoip_countries'] = $cleanArray($_POST['geoip_countries'] ?? '');

    Firewall::updateConfig($newConfig);
    if (function_exists('clear_html_cache')) {
        clear_html_cache();
    }
    set_flash('success', '防御矩阵参数已重载，前台页面缓存已同步清空。');
    redirect('admin/firewall-settings');
}

// 2. 状态渲染
$cfg = Firewall::getConfig();
ob_start();
?>
<style>
.c-switch { position: relative; display: inline-block; width: 44px; height: 22px; flex-shrink: 0; }
.c-switch input { opacity: 0; width: 0; height: 0; }
.c-slider { position: absolute; cursor: pointer; top: 0; left: 0; right: 0; bottom: 0; background-color: var(--color-fill); transition: .2s; border-radius: 22px; border: 1px solid var(--color-border); }
.c-slider:before { position: absolute; content: ""; height: 16px; width: 16px; left: 2px; bottom: 2px; background-color: white; transition: .2s; border-radius: 50%; box-shadow: 0 2px 4px rgba(0,0,0,0.1);}
input:checked + .c-slider { background-color: var(--color-primary); border-color: var(--color-primary); }
input:checked + .c-slider:before { transform: translateX(22px); }

.fw-section { margin-bottom: 24px; }
.fw-row { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px dashed var(--color-fill); }
.fw-row:last-child { border-bottom: none; }
.fw-info strong { display: block; font-size: 14px; color: var(--color-text-1); margin-bottom: 4px; }
.fw-info p { margin: 0; font-size: 12px; color: var(--color-text-3); }
</style>

<form method="POST" action="<?=url('admin/firewall-settings')?>">
    <?=csrf_field()?>
    
    <div class="split-layout">
        <div class="left-col">
            <div class="card fw-section">
                <div class="card-title" style="margin-bottom:16px;">总控开关</div>
                
                <div class="fw-row">
                    <div class="fw-info"><strong>开启全局防火墙</strong><p>关闭后所有防御探针休眠</p></div>
                    <label class="c-switch"><input type="checkbox" name="enable" <?=$cfg['enable']?'checked':''?>><span class="c-slider"></span></label>
                </div>
                <div class="fw-row">
                    <div class="fw-info"><strong>边缘威胁分析 (Edge WAF)</strong><p>基于行为画像与 Payload 扫描</p></div>
                    <label class="c-switch"><input type="checkbox" name="enable_edge" <?=$cfg['enable_edge']?'checked':''?>><span class="c-slider"></span></label>
                </div>
                <div class="fw-row">
                    <div class="fw-info"><strong>硬核 CC 防御</strong><p>秒级高频请求熔断</p></div>
                    <label class="c-switch"><input type="checkbox" name="enable_cc" <?=$cfg['enable_cc']?'checked':''?>><span class="c-slider"></span></label>
                </div>
                <div class="fw-row">
                    <div class="fw-info"><strong>人机验证盾 (Shield)</strong><p>QPS异常时强制浏览器计算 Token</p></div>
                    <label class="c-switch"><input type="checkbox" name="enable_shield" <?=$cfg['enable_shield']?'checked':''?>><span class="c-slider"></span></label>
                </div>
                <div class="fw-row">
                    <div class="fw-info"><strong>设备指纹封禁 (Identity Matrix)</strong><p>穿透 IP 封禁设备的物理指纹</p></div>
                    <label class="c-switch"><input type="checkbox" name="enable_device_ban" <?=$cfg['enable_device_ban']?'checked':''?>><span class="c-slider"></span></label>
                </div>
                <div class="fw-row">
                    <div class="fw-info"><strong>GeoIP 地域封锁</strong><p>按国家/地区阻断访问</p></div>
                    <label class="c-switch"><input type="checkbox" name="enable_geoip" <?=$cfg['enable_geoip']?'checked':''?>><span class="c-slider"></span></label>
                </div>
                <div class="fw-row">
                    <div class="fw-info"><strong>启用 F12 探针检测</strong><p>记录前台访客触发开发者工具相关行为，不直接封禁。保存后会自动清空前台缓存。</p></div>
                    <label class="c-switch"><input type="checkbox" name="enable_f12_probe" <?=!empty($cfg['enable_f12_probe'])?'checked':''?>><span class="c-slider"></span></label>
                </div>
                <div class="fw-row">
                    <div class="fw-info"><strong>启用自动动作分级</strong><p>把信誉画像自动翻译成观察 / 挑战 / 限制 / 封禁建议。开启后仅当达到封禁态时才会自动执行临时封禁，其余等级默认只做后台提示。</p></div>
                    <label class="c-switch"><input type="checkbox" name="enable_auto_decision" <?=!empty($cfg['enable_auto_decision'])?'checked':''?>><span class="c-slider"></span></label>
                </div>
            </div>
            
            <div class="card">
                <button type="submit" class="btn btn-primary" style="width: 100%;"><i class="ri-save-3-line"></i> 保存安全策略</button>
            </div>
        </div>

        <div class="right-col">
            <div class="card fw-section">
                <div class="card-title" style="margin-bottom:16px;">阈值微调 (Thresholds)</div>
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                    <div class="c-form__group">
                        <label class="c-form__label">边缘危险分值上限 (默认30)</label>
                        <input type="number" name="edge_threshold" class="form-input" value="<?=$cfg['edge_threshold']?>">
                    </div>
                    <div class="c-form__group">
                        <label class="c-form__label">盾牌触发 QPS (默认10)</label>
                        <input type="number" name="shield_trigger_qps" class="form-input" value="<?=$cfg['shield_trigger_qps']?>">
                    </div>
                    <div class="c-form__group">
                        <label class="c-form__label">CC防御 5秒内极值 (默认30)</label>
                        <input type="number" name="cc_limit_5s" class="form-input" value="<?=$cfg['cc_limit_5s']?>">
                    </div>
                    <div class="c-form__group">
                        <label class="c-form__label">CC防御 60秒内极值 (默认60)</label>
                        <input type="number" name="cc_limit_60s" class="form-input" value="<?=$cfg['cc_limit_60s']?>">
                    </div>
                    <div class="c-form__group">
                        <label class="c-form__label">挑战态阈值 (默认14)</label>
                        <input type="number" name="decision_challenge_score" class="form-input" value="<?= (int)($cfg['decision_challenge_score'] ?? 14) ?>">
                    </div>
                    <div class="c-form__group">
                        <label class="c-form__label">限制态阈值 (默认24)</label>
                        <input type="number" name="decision_restrict_score" class="form-input" value="<?= (int)($cfg['decision_restrict_score'] ?? 24) ?>">
                    </div>
                    <div class="c-form__group">
                        <label class="c-form__label">封禁态阈值 (默认35)</label>
                        <input type="number" name="decision_ban_score" class="form-input" value="<?= (int)($cfg['decision_ban_score'] ?? 35) ?>">
                    </div>
                    <div class="c-form__group">
                        <label class="c-form__label">自动封禁时长 / 分钟 (默认60)</label>
                        <input type="number" name="decision_ban_minutes" class="form-input" value="<?= (int)($cfg['decision_ban_minutes'] ?? 60) ?>">
                    </div>
                    <div class="c-form__group">
                        <label class="c-form__label">挑战通过豁免时长 / 分钟 (默认15)</label>
                        <input type="number" name="challenge_pass_minutes" class="form-input" value="<?= (int)($cfg['challenge_pass_minutes'] ?? 15) ?>">
                    </div>
                </div>
            </div>

            <div class="card fw-section">
                <div class="card-title" style="margin-bottom:16px;">策略与白名单 (每行一个)</div>
                
                <div class="c-form__group">
                    <label class="c-form__label">绝对放行 IP 白名单</label>
                    <textarea name="whitelist_ip" class="form-textarea" rows="3" placeholder="127.0.0.1"><?=implode("\n", $cfg['whitelist_ip'])?></textarea>
                </div>
                
                <div class="c-form__group">
                    <label class="c-form__label">验证放行邮箱通道 (用于绕过封锁)</label>
                    <textarea name="friend_emails" class="form-textarea" rows="2"><?=implode("\n", $cfg['friend_emails'])?></textarea>
                </div>
                
                <div style="display:flex; gap:16px; margin-top:16px;">
                    <div class="c-form__group" style="width:120px;">
                        <label class="c-form__label">GeoIP 模式</label>
                        <select name="geoip_mode" class="form-select">
                            <option value="whitelist" <?=$cfg['geoip_mode']==='whitelist'?'selected':''?>>白名单模式</option>
                            <option value="blacklist" <?=$cfg['geoip_mode']==='blacklist'?'selected':''?>>黑名单模式</option>
                        </select>
                    </div>
                    <div class="c-form__group" style="flex:1;">
                        <label class="c-form__label">GeoIP 国家/地区代码 (例如: CN, HK, TW)</label>
                        <input type="text" name="geoip_countries" class="form-input" value="<?=implode(", ", $cfg['geoip_countries'])?>">
                    </div>
                </div>
            </div>
        </div>
    </div>
</form>

<?php 
$content = ob_get_clean();
require __DIR__ . '/layout.php';
