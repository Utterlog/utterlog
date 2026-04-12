<?php
/**
 * LiMhy - 全局参数配置引擎
 */
require_once __DIR__ . '/../index.php';
$p = prefix(); $currentNav = 'settings'; $pageTitle = '全局配置中心';

$adminUser = db_row("SELECT * FROM `{$p}users` WHERE `role` = 'admin' LIMIT 1");
if (!$adminUser) die('权限异常：缺少管理员配置');

/**
 * 终极自我疗愈引擎：基于流式行切片，绝对免疫正则崩溃与常量重复
 */
function update_config_file(array $updates): bool {
    $cfgFile = ROOT . '/config.php';
    if (!is_writable($cfgFile)) return false;
    
    // 物理切片读取，彻底放弃全量正则的贪婪匹配漏洞
    $lines = @file($cfgFile, FILE_IGNORE_NEW_LINES);
    if ($lines === false) return false;
    
    $outLines = [];
    $keysFound = [];
    
    foreach ($lines as $line) {
        $line = rtrim($line);
        // 剥除行尾可能的 PHP 闭合标签
        $cleanLine = preg_replace('/(\s*\x3F\x3E\s*)$/s', '', $line);
        if ($cleanLine === "\x3F\x3E") continue;
        $line = $cleanLine;
        
        $isUpdatedKey = false;
        foreach ($updates as $key => $val) {
            // 只要行内包含目标常量定义，直接物理捕获
            if (preg_match("/^[ \t]*define\s*\(\s*['\"]" . preg_quote($key, '/') . "['\"]/i", $line)) {
                // 如果是第一次捕获该键，写入新值
                if (!isset($keysFound[$key])) {
                    $valExport = var_export($val, true);
                    $outLines[] = "define('" . $key . "', " . $valExport . ");";
                    $keysFound[$key] = true;
                }
                // 标记为已处理，丢弃原行
                $isUpdatedKey = true;
                break;
            }
        }
        
        if (!$isUpdatedKey) {
            $outLines[] = $line;
        }
    }
    
    // 补齐系统升级后新增的常量
    foreach ($updates as $key => $val) {
        if (!isset($keysFound[$key])) {
            $valExport = var_export($val, true);
            $outLines[] = "define('" . $key . "', " . $valExport . ");";
        }
    }
    
    // 使用纯净换行符重新凝结文件
    $content = implode("\n", $outLines) . "\n";
    $res = file_put_contents($cfgFile, $content, LOCK_EX) !== false;
    
    if ($res && function_exists('opcache_invalidate')) { @opcache_invalidate($cfgFile, true); }
    return $res;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $act = $_POST['_action'] ?? '';

    if ($act === 'data_backup') {
        $tables = db_rows("SHOW TABLES");
        $sql = "-- LiMhy Backup\n-- Date: " . date('Y-m-d H:i:s') . "\n-- Magic: LiMhy_Safe_Snapshot\n\n";
        $sp = "-- LIMHY-SPLIT --";
        foreach ($tables as $t) {
            $tableName = array_values($t)[0];
            $createTable = db_row("SHOW CREATE TABLE `$tableName`");
            $sql .= "DROP TABLE IF EXISTS `$tableName`;\n{$sp}\n";
            $sql .= $createTable['Create Table'] . ";\n{$sp}\n\n";
            $rows = db_rows("SELECT * FROM `$tableName`");
            foreach ($rows as $row) {
                $vals = [];
                foreach ($row as $v) { $vals[] = ($v === null) ? 'NULL' : db()->quote((string)$v); }
                $sql .= "INSERT INTO `$tableName` VALUES (" . implode(', ', $vals) . ");\n{$sp}\n";
            }
        }
        $filename = 'limhy_backup_' . date('Ymd_His') . '.sql';
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="' . $filename . '"');
        header('Content-Length: ' . strlen($sql));
        echo $sql;
        exit;
    }
    
    if ($act === 'data_restore') {
        if (!empty($_FILES['backup_file']['tmp_name'])) {
            $sqlContent = file_get_contents($_FILES['backup_file']['tmp_name']);
            if (strpos($sqlContent, 'LiMhy_Safe_Snapshot') === false) {
                set_flash('error', '文件格式不对，或者不是本系统导出的备份文件');
                redirect('admin/settings');
            }
            $queries = explode("-- LIMHY-SPLIT --", $sqlContent);
            try {
                db()->beginTransaction();
                db()->exec("SET FOREIGN_KEY_CHECKS=0;");
                foreach ($queries as $q) { $q = trim($q); if ($q) db()->exec($q); }
                db()->exec("SET FOREIGN_KEY_CHECKS=1;");
                db()->commit();
                set_flash('success', '太棒了，数据恢复成功！');
            } catch (\Throwable $e) {
                db()->rollBack(); set_flash('error', '恢复失败，系统已撤销更改：' . $e->getMessage());
            }
        } else { set_flash('error', '没有选择任何备份文件'); }
        redirect('admin/settings');
    }

    if ($act === 'data_config') {
        $updates = [
            'AUTO_BACKUP_ENABLE' => (int)($_POST['auto_backup_enable'] ?? 0),
            'AUTO_BACKUP_DAYS'   => max(1, (int)($_POST['auto_backup_days'] ?? 7)),
            'AUTO_BACKUP_EMAIL'  => (int)($_POST['auto_backup_email'] ?? 0)
        ];
        if (update_config_file($updates)) { set_flash('success','自动备份设置已保存'); } else { set_flash('error', '配置文件受写保护'); }
        redirect('admin/settings');
    }

    if ($act === 'general') {
        $name = clean($_POST['site_name']??'', 100); 
        $url = rtrim(clean($_POST['site_url']??'', 500), '/');
        if(!$name || !$url) { set_flash('error','名称和URL为必填项'); redirect('admin/settings'); }
        $updates = [
            'SITE_NAME' => $name, 'SITE_DESC' => clean($_POST['site_desc']??'', 500), 'SITE_KEYWORDS' => clean($_POST['site_keywords']??'', 200), 
            'SITE_URL' => $url, 'SITE_LOGO' => clean($_POST['site_logo']??'', 500), 'SITE_LOGO_DARK' => clean($_POST['site_logo_dark']??'', 500), 'SITE_FAVICON' => clean($_POST['site_favicon']??'', 500),
            'SITE_BEIAN_GB' => clean($_POST['site_beian_gb']??'', 100), 'SITE_BEIAN_ICP' => clean($_POST['site_beian_icp']??'', 100)
        ];
        $customHeadCodeInput = limhy_normalize_multiline_input((string)($_POST['custom_head_code'] ?? ''), 20000);
        $ok1 = update_config_file($updates);
        $ok2 = limhy_write_site_settings(['CUSTOM_HEAD_CODE' => $customHeadCodeInput]);
        if ($ok1 && $ok2) { set_flash('success','基础与备案信息更新成功'); } else { set_flash('error', '配置写入失败，请检查 config.php 与 data 目录写权限'); }
        redirect('admin/settings');
    }

    if ($act === 'appearance') {
        $updates = [ 
            'POST_COVER_ENABLED' => (int)($_POST['post_cover_enabled'] ?? 1),
            'SITE_LOGO_STYLE' => (int)($_POST['site_logo_style'] ?? 0)
        ];
        $currentFont = defined('SITE_FONT') ? SITE_FONT : '';
        if (isset($_POST['reset_font']) && $_POST['reset_font'] === '1') {
            $updates['SITE_FONT'] = '';
            if ($currentFont && file_exists(ROOT . '/' . $currentFont)) { @unlink(ROOT . '/' . $currentFont); }
        } 
        elseif (!empty($_FILES['site_font']['name']) && $_FILES['site_font']['error'] === UPLOAD_ERR_OK) {
            $f = $_FILES['site_font'];
            $ext = strtolower(pathinfo($f['name'], PATHINFO_EXTENSION));
            if (in_array($ext, ['ttf', 'woff', 'woff2', 'otf'])) {
                $fontDir = ROOT . '/uploads/font/';
                if (!is_dir($fontDir)) { @mkdir($fontDir, 0755, true); }
                $fontPath = 'uploads/font/custom_font_' . time() . '.' . $ext;
                if (move_uploaded_file($f['tmp_name'], ROOT . '/' . $fontPath)) {
                    $updates['SITE_FONT'] = $fontPath;
                    if ($currentFont && file_exists(ROOT . '/' . $currentFont)) { @unlink(ROOT . '/' . $currentFont); }
                }
            } else { set_flash('error', '格式不支持'); redirect('admin/settings'); }
        }
        if (update_config_file($updates)) { set_flash('success','个性化设置更新成功'); }
        redirect('admin/settings');
    }

    if ($act === 'profile') {
        $screenName = clean($_POST['screen_name'] ?? '', 50); $mail = clean($_POST['mail'] ?? '', 100);
        if ($screenName === '' || $mail === '') { set_flash('error', '数据输入不完整'); redirect('admin/settings'); }
        db_execute("UPDATE `{$p}users` SET `screen_name` = ?, `mail` = ? WHERE `id` = ?", [$screenName, $mail, $adminUser['id']]);
        set_flash('success', '资料已更新'); redirect('admin/settings');
    }

    if ($act === 'smtp') {
        $newPass = $_POST['smtp_pass'] ?? ''; 
        if ($newPass === '') $newPass = defined('SMTP_PASS') ? SMTP_PASS : '';
        $updates = [
            'SMTP_HOST' => clean($_POST['smtp_host']??''), 'SMTP_PORT' => (int)($_POST['smtp_port']??465),
            'SMTP_USER' => clean($_POST['smtp_user']??''), 'SMTP_PASS' => clean($newPass),
            'ADMIN_EMAIL' => clean($_POST['admin_email']??'')
        ];
        if (update_config_file($updates)) set_flash('success', '邮件推送服务配置已载入'); 
        redirect('admin/settings');
    }

    if ($act === 'oss') {
        $newSk = $_POST['oss_sk'] ?? ''; 
        if ($newSk === '') $newSk = defined('OSS_SK') ? OSS_SK : '';
        $updates = [
            'OSS_TYPE' => in_array($_POST['oss_type']??'', ['aliyun', 's4', 'upyun', 's3', 'custom_api', 'litepic']) ? $_POST['oss_type'] : 'aliyun',
            'OSS_AK' => clean($_POST['oss_ak']??''), 
            'OSS_SK' => clean($newSk),
            'OSS_HOST' => rtrim(clean($_POST['oss_host']??''), '/'), 
            'OSS_DOMAIN' => rtrim(clean($_POST['oss_domain']??''), '/'),
            'OSS_AUTH' => in_array($_POST['oss_auth'] ?? '', ['bearer', 'x_api_key'], true) ? ($_POST['oss_auth'] ?? 'bearer') : 'bearer'
        ];
        if (update_config_file($updates)) set_flash('success', '云存储策略已同步'); 
        redirect('admin/settings');
    }

    if ($act === 'moments') {
        $provider = in_array($_POST['aggregator_provider'] ?? 'moments', ['moments', 'freshrss'], true) ? ($_POST['aggregator_provider'] ?? 'moments') : 'moments';
        $updates = [
            'AGGREGATOR_PROVIDER' => $provider,
            'MOMENTS_UID' => clean($_POST['moments_uid']??''),
            'MOMENTS_TOKEN' => clean($_POST['moments_token']??''),
            'FRESHRSS_API_URL' => rtrim(clean($_POST['freshrss_api_url'] ?? '', 500), '/'),
            'FRESHRSS_USER' => clean($_POST['freshrss_user'] ?? '', 120),
            'FRESHRSS_PASSWORD' => clean($_POST['freshrss_password'] ?? '', 255)
        ];
        if (update_config_file($updates)) set_flash('success', '第三方聚合接口配置已保存'); 
        redirect('admin/settings');
    }

    if ($act === 'sponsor') {
        $sponsorCostInput = limhy_normalize_multiline_input((string)($_POST['sponsor_cost'] ?? ''), 3000);
        $updates = [
            'SPONSOR_QR' => clean($_POST['sponsor_qr'] ?? '', 1000)
        ];
        $listJson = trim((string)($_POST['sponsor_list'] ?? '[]'));
        $listData = json_decode($listJson, true);
        if (!is_array($listData)) {
            set_flash('error', '赞赏者名单 JSON 格式不正确，请先校验后再保存');
            redirect('admin/settings');
        }
        $ok1 = update_config_file($updates);
        $ok2 = limhy_write_site_settings(['SPONSOR_COST' => $sponsorCostInput]);
        $ok3 = false;
        if (!is_dir(ROOT . '/data')) @mkdir(ROOT . '/data', 0755, true);
        $jsonOut = json_encode($listData, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($jsonOut !== false) {
            $ok3 = file_put_contents(ROOT . '/data/sponsors.json', $jsonOut . "
", LOCK_EX) !== false;
        }
        if ($ok1 && $ok2 && $ok3) {
            set_flash('success', '赞赏页面数据已同步更新，现在说明语支持换行、引号与普通文案，不再直接写入 config.php');
        } else {
            set_flash('error', '赞赏设置保存失败，请检查 config.php 与 data 目录写权限');
        }
        redirect('admin/settings');
    }

    if ($act === 'friend_links') {
        $updates = [
            'LINK_PAGE_SITE_NAME' => clean($_POST['link_page_site_name'] ?? '', 120),
            'LINK_PAGE_SITE_URL' => rtrim(clean($_POST['link_page_site_url'] ?? '', 500), '/'),
            'LINK_PAGE_SITE_AVATAR' => clean($_POST['link_page_site_avatar'] ?? '', 1000),
            'LINK_PAGE_SITE_RSS' => clean($_POST['link_page_site_rss'] ?? '', 1000),
        ];
        $htmlUpdates = [
            'LINK_PAGE_SITE_DESC' => limhy_normalize_multiline_input((string)($_POST['link_page_site_desc'] ?? ''), 5000),
            'LINK_PAGE_APPLY_HTML' => limhy_normalize_multiline_input((string)($_POST['link_page_apply_html'] ?? ''), 12000),
        ];
        if (limhy_write_site_settings($updates + $htmlUpdates)) {
            set_flash('success', '友链配置已同步更新');
        } else {
            set_flash('error', '友链配置保存失败，请检查 data 目录写权限');
        }
        redirect('admin/settings');
    }

    if ($act === 'comments_config') {
        $updates = [
            'COMMENTS_NEED_REVIEW'         => isset($_POST['comments_need_review']) ? true : false,
            'COMMENT_AUTO_APPROVE_TRUSTED' => isset($_POST['comment_auto_approve_trusted']) ? true : false,
            'COMMENT_RATE_LIMIT'           => max(0, (int)($_POST['comment_rate_limit'] ?? 2)),
            'COMMENT_AUTO_UPDATE_URL'      => isset($_POST['comment_auto_update_url']) ? true : false,
            'TRUST_PROXY_IP'              => isset($_POST['trust_proxy_ip']) ? true : false,
            'COMMENT_PAGE_ENABLED'        => isset($_POST['comment_page_enabled']) ? true : false,
            'COMMENT_PAGE_SIZE'           => max(1, min(100, (int)($_POST['comment_page_size'] ?? 10))),
            'COMMENT_PAGE_FIRST_NEWEST'   => isset($_POST['comment_page_first_newest']) ? true : false,
        ];
        update_config_file($updates);

        $spamWords = $_POST['spam_words'] ?? '';
        if (!is_dir(ROOT . '/data')) @mkdir(ROOT . '/data', 0755, true);
        file_put_contents(ROOT . '/data/spam_words.txt', $spamWords);

        set_flash('success', '评论防线策略已重载生效');
        redirect('admin/settings');
    }
}

$avatarUrl = get_avatar_url($adminUser['mail'], $adminUser['screen_name']);
$coverStrategy = defined('POST_COVER_ENABLED') ? POST_COVER_ENABLED : 1;
if ($coverStrategy === true) $coverStrategy = 1;
if ($coverStrategy === false) $coverStrategy = 0;
$logoStyle = defined('SITE_LOGO_STYLE') ? SITE_LOGO_STYLE : 0;
$skPlaceholder = (defined('OSS_SK') && OSS_SK !== '') ? '[已安全存储] 留空表示不修改' : '留空表示不修改';
$smtpPlaceholder = (defined('SMTP_PASS') && SMTP_PASS !== '') ? '[已安全存储] 留空表示不修改' : '留空表示不修改';

$spamData = '';
if (file_exists(ROOT . '/data/spam_words.txt')) {
    $spamData = file_get_contents(ROOT . '/data/spam_words.txt');
}

$customHeadCode = limhy_site_setting('CUSTOM_HEAD_CODE', defined('CUSTOM_HEAD_CODE') ? CUSTOM_HEAD_CODE : '');
$sponsorCostText = limhy_site_setting('SPONSOR_COST', defined('SPONSOR_COST') ? SPONSOR_COST : '');
$friendSiteName = (string) limhy_site_setting('LINK_PAGE_SITE_NAME', defined('SITE_NAME') ? SITE_NAME : '');
$friendSiteUrl = (string) limhy_site_setting('LINK_PAGE_SITE_URL', defined('SITE_URL') ? SITE_URL : '');
$friendSiteDesc = (string) limhy_site_setting('LINK_PAGE_SITE_DESC', defined('SITE_DESC') ? SITE_DESC : '');
$friendSiteAvatar = (string) limhy_site_setting('LINK_PAGE_SITE_AVATAR', defined('SITE_LOGO') ? SITE_LOGO : '');
$friendSiteRss = (string) limhy_site_setting('LINK_PAGE_SITE_RSS', rtrim((defined('SITE_URL') ? SITE_URL : ''), '/') . '/feed?raw=1');
$friendApplyHtml = (string) limhy_site_setting('LINK_PAGE_APPLY_HTML', '<p>申请前请确保贵站可正常访问、内容合规、已添加本站友情链接。</p>');

ob_start();
?>

<style>
.settings-tabs-container { background: var(--color-bg-white); border: 1px solid var(--color-border); border-radius: var(--radius-m); overflow: hidden; box-shadow: none !important; }
.tabs-nav { display: flex; background: var(--color-fill, #f8fafc); border-bottom: 1px solid var(--color-border); overflow-x: auto; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
.tabs-nav::-webkit-scrollbar { display: none; }
.tabs-tab { padding: 14px 20px; font-size: 14px; font-weight: 500; color: var(--color-text-2); cursor: pointer; white-space: nowrap; border-bottom: 2px solid transparent; transition: all 0.2s; display: flex; align-items: center; gap: 6px; }
.tabs-tab:hover { color: var(--color-text-1); background: rgba(0,0,0,0.02); }
.tabs-tab.is-active { color: var(--color-primary); font-weight: 600; border-bottom-color: var(--color-primary); background: var(--color-bg-white, #fff); }
.tabs-content { padding: 30px; min-height: 400px; }
.tabs-pane { display: none; animation: fadeInTab 0.3s cubic-bezier(0.18, 0.89, 0.32, 1.28); max-width: 680px; }
.tabs-pane.is-active { display: block; }
@keyframes fadeInTab { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
.pane-title { font-size: 18px; font-weight: 600; margin-bottom: 24px; color: var(--text-main); border-bottom: 1px dashed var(--color-border); padding-bottom: 12px; }
.honey-pot { display: none !important; }
.input-saved::placeholder { color: #10b981 !important; font-weight: bold; }
</style>

<div class="settings-tabs-container">
    
    <div class="tabs-nav" id="js-tabs-nav">
        <div class="tabs-tab" data-target="tab-general"><i class="ri-global-line"></i> 基础信息</div>
        <div class="tabs-tab" data-target="tab-appearance"><i class="ri-palette-line"></i> 个性化扩展</div>
        <div class="tabs-tab" data-target="tab-comments"><i class="ri-message-3-line"></i> 互动评论设置</div>
        <div class="tabs-tab" data-target="tab-friend-links"><i class="ri-links-line"></i> 友链配置</div>
        <div class="tabs-tab" data-target="tab-data"><i class="ri-database-2-line"></i> 备份与恢复</div>
        <div class="tabs-tab" data-target="tab-sponsor"><i class="ri-heart-3-line"></i> 赞赏与支持</div>
        <div class="tabs-tab" data-target="tab-profile"><i class="ri-user-settings-line"></i> 站长身份</div>
        <div class="tabs-tab" data-target="tab-smtp"><i class="ri-mail-send-line"></i> 推送服务</div>
        <div class="tabs-tab" data-target="tab-oss"><i class="ri-cloud-line"></i> 对象存储</div>
        <div class="tabs-tab" data-target="tab-api"><i class="ri-rss-line"></i> 外部接口</div>
        <div class="tabs-tab" data-target="tab-env"><i class="ri-dashboard-2-line"></i> 运行环境</div>
    </div>

    <div class="tabs-content">
        
        <div class="tabs-pane" id="tab-general">
            <div class="pane-title">站点基础信息设置</div>
            <form method="POST" action="<?=url('admin/settings')?>" autocomplete="off">
                <input type="text" class="honey-pot" name="fake_user"><input type="password" class="honey-pot" name="fake_pass">
                <?=csrf_field()?> <input type="hidden" name="_action" value="general">
                <div class="c-form__group"><label class="admin-stat__label">站点名称</label><input type="text" name="site_name" class="form-input" required value="<?=e(defined('SITE_NAME')?SITE_NAME:'')?>"></div>
                <div class="c-form__group"><label class="admin-stat__label">站点描述</label><textarea name="site_desc" class="form-textarea" rows="2"><?=e(defined('SITE_DESC')?SITE_DESC:'')?></textarea></div>
                <div class="c-form__group"><label class="admin-stat__label">站点关键词</label><input type="text" name="site_keywords" class="form-input" placeholder="例如: 博客,技术,生活" value="<?=e(defined('SITE_KEYWORDS')?SITE_KEYWORDS:'')?>"></div>
                <div class="c-form__group"><label class="admin-stat__label">站点网址</label><input type="url" name="site_url" class="form-input" required value="<?=e(defined('SITE_URL')?SITE_URL:'')?>"></div>
                <div class="c-form__group"><label class="admin-stat__label">网站 Logo</label><input type="url" name="site_logo" class="form-input" placeholder="浅色模式下使用的默认 Logo；如果不填，系统会自动生成文字头像" value="<?=e(defined('SITE_LOGO')?SITE_LOGO:'')?>"></div>
                <div class="c-form__group"><label class="admin-stat__label">深色模式 Logo <span style="font-weight:normal;color:var(--color-text-3);">(留空则沿用默认 Logo)</span></label><input type="url" name="site_logo_dark" class="form-input" placeholder="建议填写适配深色背景的 Logo 图片地址；留空则自动回退默认 Logo" value="<?=e(defined('SITE_LOGO_DARK')?SITE_LOGO_DARK:'')?>"></div>
                <div class="c-form__group"><label class="admin-stat__label">Favicon 地址</label><input type="url" name="site_favicon" class="form-input" placeholder="如果不填，默认使用上面的 Logo" value="<?=e(defined('SITE_FAVICON')?SITE_FAVICON:'')?>"></div>
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px dashed var(--color-border);"></div>
                <div class="c-form__group"><label class="admin-stat__label">公安联网备案号</label><input type="text" name="site_beian_gb" class="form-input" placeholder="留空则不显示" value="<?=e(defined('SITE_BEIAN_GB')?SITE_BEIAN_GB:'')?>"></div>
                <div class="c-form__group"><label class="admin-stat__label">ICP备案号</label><input type="text" name="site_beian_icp" class="form-input" placeholder="留空则不显示" value="<?=e(defined('SITE_BEIAN_ICP')?SITE_BEIAN_ICP:'')?>"></div>
                
                <div style="margin-top: 20px; padding-top: 20px; border-top: 1px dashed var(--color-border);"></div>
                <div class="c-form__group">
                    <label class="admin-stat__label">自定义头部代码 <span style="font-weight:normal;color:var(--color-text-3);">(用于插入访问统计 / 第三方监控组件等)</span></label>
                    <textarea name="custom_head_code" class="form-textarea" rows="4" placeholder="<!-- 将自动注入到全局 head 标签结束前 -->&#10;<script>...</script>" style="font-family:monospace; font-size:13px;"><?=htmlspecialchars($customHeadCode)?></textarea>
                    <div style="font-size:12px; color: var(--color-text-3); margin-top: 6px; line-height: 1.7;">为避免误写入造成配置异常，这里会优先写入独立数据文件；系统会自动剥离 <code>&lt;?php</code>、<code>&lt;?</code>、<code>?&gt;</code> 片段和不可见控制字符。</div>
                </div>
                
                <button type="submit" class="btn btn-primary" style="margin-top:10px; padding: 0 24px;"><i class="ri-save-3-line" style="margin-right: 4px;"></i> 保存基础信息</button>
            </form>
        </div>

        <div class="tabs-pane" id="tab-appearance">
            <div class="pane-title">外观与个性化设置</div>
            <form method="POST" action="<?=url('admin/settings')?>" enctype="multipart/form-data" autocomplete="off">
                <input type="text" class="honey-pot" name="fake_user"><input type="password" class="honey-pot" name="fake_pass">
                <?=csrf_field()?> <input type="hidden" name="_action" value="appearance">
                
                <div class="c-form__group" style="margin-bottom: 24px;">
                    <label class="admin-stat__label" style="margin-bottom: 10px; color: var(--color-text-1, #111827); font-weight: 600;"><i class="ri-layout-top-line"></i> 顶部 Logo 显示模式</label>
                    <div style="display:flex; flex-direction:column; gap: 12px; background: var(--color-fill, #f8fafc); padding: 16px; border-radius: 6px; border: 1px solid var(--color-border);">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 14px;">
                            <input type="radio" name="site_logo_style" value="0" <?= ($logoStyle == 0) ? 'checked' : '' ?>>
                            <span style="font-weight: 600;">默认经典模式 <span style="font-weight:400; color:var(--color-text-3);">(圆形小图标 + 站点名称文字)</span></span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 14px;">
                            <input type="radio" name="site_logo_style" value="1" <?= ($logoStyle == 1) ? 'checked' : '' ?>>
                            <span style="font-weight: 600; color:var(--color-primary);">宽体纯图模式 <span style="font-weight:400; color:var(--color-text-3);">(适用于长横形图片，不裁切，无文字)</span></span>
                        </label>
                    </div>
                </div>

                <div class="c-form__group" style="margin-bottom: 24px;">
                    <label class="admin-stat__label" style="margin-bottom: 10px; color: var(--color-text-1, #111827); font-weight: 600;"><i class="ri-image-edit-line"></i> 文章列表封面显示方式</label>
                    <div style="display:flex; flex-direction:column; gap: 12px; background: var(--color-fill, #f8fafc); padding: 16px; border-radius: 6px; border: 1px solid var(--color-border);">
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 14px;">
                            <input type="radio" name="post_cover_enabled" value="2" <?= ($coverStrategy == 2) ? 'checked' : '' ?>>
                            <span style="font-weight: 600; color:var(--color-primary);">智能显示 <span style="font-weight:400; color:var(--color-text-3);">(文章里有图片就显示缩略图，没有图片就显示纯文字)</span></span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 14px;">
                            <input type="radio" name="post_cover_enabled" value="1" <?= ($coverStrategy == 1) ? 'checked' : '' ?>>
                            <span style="font-weight: 500;">全部显示 <span style="font-weight:400; color:var(--color-text-3);">(就算文章没图片，也会用网站Logo作为默认底图兜底)</span></span>
                        </label>
                        <label style="display:flex; align-items:center; gap:8px; cursor:pointer; font-size: 14px;">
                            <input type="radio" name="post_cover_enabled" value="0" <?= ($coverStrategy == 0) ? 'checked' : '' ?>>
                            <span style="font-weight: 500; color:var(--color-danger);">全不显示 <span style="font-weight:400; color:var(--color-text-3);">(彻底关闭缩略图，极简纯文字模式)</span></span>
                        </label>
                    </div>
                </div>
                <div class="c-form__group" style="margin-top: 24px; padding-top: 24px; border-top: 1px dashed var(--color-border);">
                    <label class="admin-stat__label" style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 10px;">
                        <span style="font-size: 14px; font-weight: 600; color: var(--color-text-1, #111827);"><i class="ri-text"></i> 自定义全站字体文件</span>
                        <?php if (defined('SITE_FONT') && SITE_FONT !== ''): ?>
                            <span class="badge badge-published" style="font-weight:normal;">当前正在使用自定义字体</span>
                        <?php endif; ?>
                    </label>
                    <input type="file" name="site_font" class="form-input" accept=".ttf,.woff,.woff2,.otf" style="padding-top: 4px; cursor: pointer; height: auto; padding-bottom: 4px;">
                    <div style="font-size: 12px; color: var(--color-text-3); margin-top: 8px; line-height: 1.5;">支持 TTF, WOFF, WOFF2, OTF 格式文件。</div>
                    <?php if (defined('SITE_FONT') && SITE_FONT !== ''): ?>
                    <label style="display:inline-flex; align-items:center; gap:6px; font-size:13px; margin-top:12px; cursor:pointer; color:var(--color-danger); font-weight: 500;">
                        <input type="checkbox" name="reset_font" value="1"> 彻底删除自定义字体，恢复系统默认字体
                    </label>
                    <?php endif; ?>
                </div>
                <button type="submit" class="btn btn-primary" style="margin-top:20px; padding: 0 24px;"><i class="ri-save-3-line" style="margin-right: 4px;"></i> 保存个性化设置</button>
            </form>
        </div>

        <div class="tabs-pane" id="tab-comments">
            <div class="pane-title">互动评论与防线策略</div>
            <form method="POST" action="<?=url('admin/settings')?>" autocomplete="off">
                <?=csrf_field()?> <input type="hidden" name="_action" value="comments_config">
                
                <div class="c-form__group" style="margin-bottom: 24px;">
                    <label class="admin-stat__label" style="margin-bottom: 10px; color: var(--color-text-1, #111827); font-weight: 600;"><i class="ri-shield-check-line"></i> 基础审核逻辑</label>
                    <div style="background: var(--color-fill, #f8fafc); padding: 16px; border-radius: 6px; border: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 12px;">
                        <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size: 14px;">
                            <input type="checkbox" name="comments_need_review" value="1" <?= (defined('COMMENTS_NEED_REVIEW') && COMMENTS_NEED_REVIEW) ? 'checked' : '' ?>>
                            <span style="font-weight: 600; color:var(--color-danger);">全员严管模式 <span style="font-weight:400; color:var(--color-text-3);">(所有访客评论均需人工审核后显示)</span></span>
                        </label>
                        
                        <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size: 14px;">
                            <input type="checkbox" name="comment_auto_approve_trusted" value="1" <?= (defined('COMMENT_AUTO_APPROVE_TRUSTED') && COMMENT_AUTO_APPROVE_TRUSTED) ? 'checked' : '' ?>>
                            <span style="font-weight: 600; color:var(--color-success);">智能信任放行 <span style="font-weight:400; color:var(--color-text-3);">(若该邮箱有过被通过的评论，后续发言自动放行，无视上方严管策略)</span></span>
                        </label>
                    </div>
                </div>

                                <div class="c-form__group" style="margin-bottom: 24px;">
                    <label class="admin-stat__label" style="margin-bottom: 10px; color: var(--color-text-1, #111827); font-weight: 600;"><i class="ri-chat-3-line"></i> 评论分页策略</label>
                    <div style="background: var(--color-fill, #f8fafc); padding: 16px; border-radius: 6px; border: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 16px;">
                        <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size: 14px;">
                            <input type="checkbox" name="comment_page_enabled" value="1" <?= (defined('COMMENT_PAGE_ENABLED') ? COMMENT_PAGE_ENABLED : true) ? 'checked' : '' ?>>
                            <span style="font-weight: 600; color:var(--color-primary);">启用前台评论分页 <span style="font-weight:400; color:var(--color-text-3);">(按顶级评论楼层分页，子回复跟随所属楼层一起展示，不会被截断)</span></span>
                        </label>

                        <div style="display:flex; gap: 16px; align-items: center;">
                            <span style="font-size: 14px; font-weight: 500;">每页显示评论数:</span>
                            <input type="number" name="comment_page_size" class="form-input" style="width: 100px; text-align: center;" min="1" max="100" value="<?=e(defined('COMMENT_PAGE_SIZE')?COMMENT_PAGE_SIZE:'10')?>">
                            <span style="font-size: 14px; color: var(--color-text-3);">条顶级评论</span>
                        </div>

                        <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size: 14px;">
                            <input type="checkbox" name="comment_page_first_newest" value="1" <?= (defined('COMMENT_PAGE_FIRST_NEWEST') ? COMMENT_PAGE_FIRST_NEWEST : true) ? 'checked' : '' ?>>
                            <span style="font-weight: 600; color:var(--color-success);">第一页默认显示最新评论 <span style="font-weight:400; color:var(--color-text-3);">(更符合内容站最新评论优先暴露的诉求)</span></span>
                        </label>
                    </div>
                </div>

<div class="c-form__group" style="margin-bottom: 24px;">
                    <label class="admin-stat__label" style="margin-bottom: 10px; color: var(--color-text-1, #111827); font-weight: 600;"><i class="ri-timer-line"></i> 频控与数据同步</label>
                    <div style="background: var(--color-fill, #f8fafc); padding: 16px; border-radius: 6px; border: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 16px;">
                        <div style="display:flex; gap: 16px; align-items: center;">
                            <span style="font-size: 14px; font-weight: 500;">同一 IP 发言冷却时间:</span>
                            <input type="number" name="comment_rate_limit" class="form-input" style="width: 100px; text-align: center;" min="0" max="1440" value="<?=e(defined('COMMENT_RATE_LIMIT')?COMMENT_RATE_LIMIT:'2')?>">
                            <span style="font-size: 14px; color: var(--color-text-3);">分钟 <span style="font-size:12px; color: var(--color-text-3);">(填 0 表示不限制)</span></span>
                        </div>

                        <div style="border-top: 1px dashed var(--color-border);"></div>

                        <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size: 14px;">
                            <input type="checkbox" name="comment_auto_update_url" value="1" <?= (defined('COMMENT_AUTO_UPDATE_URL') && COMMENT_AUTO_UPDATE_URL) ? 'checked' : '' ?>>
                            <span style="font-weight: 600; color:var(--color-primary);">开启历史 URL 动态覆盖机制 <span style="font-weight:400; color:var(--color-text-3);">(当常客填入新网址时，自动同步修改他以往所有的留言网址)</span></span>
                        </label>
                    </div>
                </div>

                <div class="c-form__group" style="margin-bottom: 24px;">
                    <label class="admin-stat__label" style="margin-bottom: 10px; color: var(--color-text-1, #111827); font-weight: 600;"><i class="ri-radar-line"></i> 在线人数与真实 IP 识别</label>
                    <div style="background: var(--color-fill, #f8fafc); padding: 16px; border-radius: 6px; border: 1px solid var(--color-border); display: flex; flex-direction: column; gap: 12px;">
                        <label style="display:inline-flex; align-items:flex-start; gap:8px; cursor:pointer; font-size: 14px; line-height:1.7;">
                            <input type="checkbox" name="trust_proxy_ip" value="1" <?= (defined('TRUST_PROXY_IP') && TRUST_PROXY_IP) ? 'checked' : '' ?>>
                            <span style="font-weight: 600; color:var(--color-primary);">信任 CDN / 反向代理真实 IP <span style="font-weight:400; color:var(--color-text-3);">(启用后，系统会优先从 CF-Connecting-IP、X-Forwarded-For、X-Real-IP 等头部识别访客真实 IP，用于在线人数、评论记录、日志与安全审计。未接入 CDN / 代理时请保持关闭。)</span></span>
                        </label>
                    </div>
                </div>

                <div class="c-form__group" style="margin-bottom: 24px;">
                    <label class="admin-stat__label" style="margin-bottom: 10px; color: var(--color-text-1, #111827); font-weight: 600; display:flex; justify-content:space-between;">
                        <span><i class="ri-spam-line"></i> 反垃圾敏感词 </span>
                        <span style="position:relative; overflow:hidden;">
                            <button type="button" class="btn btn-ghost" style="height: 24px; padding: 0 8px; font-size: 12px; color: var(--color-primary); border-color: var(--color-primary);">导入 TXT 文件</button>
                            <input type="file" accept=".txt" id="js-spam-file-input" style="position:absolute; top:0; left:0; width:100%; height:100%; opacity:0; cursor:pointer;">
                        </span>
                    </label>
                    <textarea name="spam_words" id="js-spam-textarea" class="form-textarea" rows="6" placeholder="每行一个屏蔽词。包含这些词的评论将被系统静默阻断，直接打入垃圾箱。"><?=e($spamData)?></textarea>
                    <div style="font-size: 12px; color: var(--color-text-3); margin-top: 6px; line-height: 1.6;">
                        支持中英文，匹配无视大小写。命中者不发邮件、不进审核流，直接阻断为 Spam 状态。
                    </div>
                </div>

                <button type="submit" class="btn btn-primary" style="margin-top:10px; padding: 0 24px;"><i class="ri-shield-star-line" style="margin-right: 4px;"></i> 部署防线策略</button>
            </form>
        </div>


        <div class="tabs-pane" id="tab-friend-links">
            <div class="pane-title">友情链接展示与申请配置</div>
            <form method="POST" action="<?=url('admin/settings')?>" autocomplete="off">
                <input type="text" class="honey-pot" name="fake_user"><input type="password" class="honey-pot" name="fake_pass">
                <?=csrf_field()?> <input type="hidden" name="_action" value="friend_links">
                <div class="c-form__group"><label class="admin-stat__label">站点名称</label><input type="text" name="link_page_site_name" class="form-input" value="<?=e($friendSiteName)?>" placeholder="例如：LiMhy"></div>
                <div class="c-form__group"><label class="admin-stat__label">站点域名</label><input type="url" name="link_page_site_url" class="form-input" value="<?=e($friendSiteUrl)?>" placeholder="https://example.com"></div>
                <div class="c-form__group"><label class="admin-stat__label">头像地址</label><input type="url" name="link_page_site_avatar" class="form-input" value="<?=e($friendSiteAvatar)?>" placeholder="https://.../avatar.png"></div>
                <div class="c-form__group"><label class="admin-stat__label">RSS 地址</label><input type="url" name="link_page_site_rss" class="form-input" value="<?=e($friendSiteRss)?>" placeholder="https://example.com/feed?raw=1"></div>
                <div class="c-form__group"><label class="admin-stat__label">站点描述 <span style="font-weight:normal;color:var(--color-text-3);">(纯文本，前台提供复制)</span></label><textarea name="link_page_site_desc" class="form-textarea" rows="4" placeholder="<p>一句话介绍你的站点特色</p>"><?=htmlspecialchars($friendSiteDesc)?></textarea></div>
                <div class="c-form__group"><label class="admin-stat__label">申请说明 <span style="font-weight:normal;color:var(--color-text-3);">(支持 HTML)</span></label><textarea name="link_page_apply_html" class="form-textarea" rows="8" placeholder="<ul><li>先添加本站友链</li><li>确保网站可访问</li></ul>"><?=htmlspecialchars($friendApplyHtml)?></textarea><div style="font-size:12px; color: var(--color-text-3); margin-top: 6px; line-height: 1.7;">这里会安全写入 <code>data/site_settings.json</code>，支持常用 HTML 展示标签，前台“友情链接”页底部会自动渲染本站信息与申请说明模块。</div></div>
                <button type="submit" class="btn btn-primary" style="margin-top:12px;"><i class="ri-links-line" style="margin-right:4px;"></i> 保存友链配置</button>
            </form>
        </div>

        <div class="tabs-pane" id="tab-data">
            <div class="pane-title">数据备份与恢复</div>
            <form method="POST" action="<?=url('admin/settings')?>" autocomplete="off">
                <input type="text" class="honey-pot" name="fake_user"><input type="password" class="honey-pot" name="fake_pass">
                <?=csrf_field()?> <input type="hidden" name="_action" value="data_config">
                <div class="c-form__group" style="margin-bottom: 24px;">
                    <label class="admin-stat__label" style="margin-bottom: 10px; color: var(--color-text-1, #111827); font-weight: 600;"><i class="ri-history-line"></i> 自动备份设置</label>
                    <div style="background: var(--color-fill, #f8fafc); padding: 16px; border-radius: 6px; border: 1px solid var(--color-border);">
                        <div style="margin-bottom: 12px;">
                            <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size: 14px;">
                                <input type="checkbox" name="auto_backup_enable" value="1" <?= (defined('AUTO_BACKUP_ENABLE') && AUTO_BACKUP_ENABLE) ? 'checked' : '' ?>>
                                <span style="font-weight: 600; color:var(--color-primary);">开启系统自动备份</span>
                            </label>
                        </div>
                        <div style="display:flex; gap: 16px; align-items: center; margin-bottom: 12px;">
                            <span style="font-size: 13px; color: var(--color-text-2);">每隔几天备份一次:</span>
                            <input type="number" name="auto_backup_days" class="form-input" style="width: 80px;" min="1" max="30" value="<?=e(defined('AUTO_BACKUP_DAYS')?AUTO_BACKUP_DAYS:'7')?>">
                        </div>
                        <div>
                            <label style="display:inline-flex; align-items:center; gap:8px; cursor:pointer; font-size: 14px;">
                                <input type="checkbox" name="auto_backup_email" value="1" <?= (defined('AUTO_BACKUP_EMAIL') && AUTO_BACKUP_EMAIL) ? 'checked' : '' ?>>
                                <span style="font-weight: 500;">备份完成后，自动发送到邮箱</span>
                            </label>
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary" style="margin-top:12px;"><i class="ri-save-line" style="margin-right:4px;"></i> 保存设置</button>
                </div>
            </form>
            <div style="border-top: 1px dashed var(--color-border); margin: 30px 0;"></div>
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px;">
                <div class="c-form__group" style="background: #fdfdfd; padding: 16px; border-radius: 8px; border: 1px solid var(--color-border);">
                    <label class="admin-stat__label" style="color: var(--color-text-1, #111827); font-weight: 800; font-size: 14px;"><i class="ri-download-cloud-2-line"></i> 手动导出备份</label>
                    <div style="font-size: 12px; color: var(--color-text-3); margin-bottom: 16px;">立即打包并下载当前网站的所有数据。</div><div style="font-size:12px;color:var(--color-text-3);margin-bottom:12px;">已生成的备份文件可在 <a href="<?=url('admin/backups')?>" style="color:var(--color-primary);font-weight:600;">备份文件管理</a> 中统一查看、下载和清理。</div>
                    <form method="POST" action="<?=url('admin/settings')?>">
                        <?=csrf_field()?> <input type="hidden" name="_action" value="data_backup">
                        <button type="submit" class="btn btn-ghost" style="color: var(--color-primary); border-color: var(--color-primary);"><i class="ri-database-2-line"></i> 点击下载</button>
                    </form>
                </div>
                <div class="c-form__group" style="background: var(--color-danger-bg); padding: 16px; border-radius: 8px; border: 1px solid rgba(245,63,63,0.3);">
                    <label class="admin-stat__label" style="color: var(--color-danger); font-weight: 800; font-size: 14px;"><i class="ri-upload-cloud-2-line"></i> 恢复数据</label>
                    <div style="font-size: 12px; color: var(--color-danger); opacity: 0.8; margin-bottom: 16px;">上传备份文件恢复。警告：当前数据将被覆盖！</div>
                    <form method="POST" action="<?=url('admin/settings')?>" enctype="multipart/form-data" onsubmit="return confirm('确认覆盖所有数据？');">
                        <?=csrf_field()?> <input type="hidden" name="_action" value="data_restore">
                        <input type="file" name="backup_file" accept=".sql" required style="font-size: 12px; margin-bottom: 10px; width: 100%;">
                        <button type="submit" class="btn is-danger btn-ghost" style="background: var(--color-bg-white, #fff);"><i class="ri-alert-line"></i> 开始恢复</button>
                    </form>
                </div>
            </div>
        </div>

        <div class="tabs-pane" id="tab-sponsor">
            <div class="pane-title">赞赏与支持设置</div>
            <form method="POST" action="<?=url('admin/settings')?>" autocomplete="off">
                <input type="text" class="honey-pot" name="fake_user"><input type="password" class="honey-pot" name="fake_pass">
                <?=csrf_field()?> <input type="hidden" name="_action" value="sponsor">
                <div class="c-form__group">
                    <label class="admin-stat__label">赞赏收款二维码 (图片 URL)</label>
                    <input type="url" name="sponsor_qr" class="form-input" placeholder="例如: https://.../qr.jpg" value="<?=e(defined('SPONSOR_QR')?SPONSOR_QR:'')?>">
                </div>
                <div class="c-form__group">
                    <label class="admin-stat__label">赞赏说明语 (支持换行)</label>
                    <textarea name="sponsor_cost" class="form-textarea" rows="4" placeholder="例如：感谢你的支持，
这会成为我持续更新的动力。"><?=e($sponsorCostText)?></textarea>
                    <div style="font-size:12px; color: var(--color-text-3); margin-top: 6px; line-height: 1.7;">这里现在会安全写入 <code>data/site_settings.json</code>，支持普通文案、换行、中文引号、单双引号与大部分表情，不再直接把这段说明写进 <code>config.php</code>。</div>
                </div>
                <div class="c-form__group">
                    <label class="admin-stat__label">赞赏者名单 (微型 JSON 数据库驱动)</label>
                    <?php
                        $sponsorData = '[]';
                        if (file_exists(ROOT . '/data/sponsors.json')) {
                            $sponsorData = file_get_contents(ROOT . '/data/sponsors.json');
                        }
                    ?>
                    <textarea name="sponsor_list" class="form-textarea" rows="6" placeholder='[{"name":"张三","amount":"50","date":"2026-03-01","note":"加油"}]' style="font-family: monospace; font-size: 13px;"><?=e($sponsorData)?></textarea>
                    
                    <div style="font-size: 12px; color: var(--color-text-3); margin-top: 6px; line-height: 1.6;">
                        请使用标准 JSON 数组格式录入。示例：<code>[{"name":"Almighty","amount":"10.00","date":"2026-03-09","note":"一杯美式"}]</code>
                    </div>
                </div>
                <button type="submit" class="btn btn-primary" style="margin-top:12px;"><i class="ri-heart-3-line" style="margin-right: 4px;"></i> 保存赞赏数据</button>
            </form>
        </div>

        <div class="tabs-pane" id="tab-profile">
            <div class="pane-title">最高权限控制凭证</div>
            <form method="POST" action="<?=url('admin/settings')?>" autocomplete="off">
                <input type="text" class="honey-pot" name="fake_username_to_trick_browser">
                <input type="password" class="honey-pot" name="fake_password_to_trick_browser">
                <?=csrf_field()?> <input type="hidden" name="_action" value="profile">
                
                <div style="display:flex; align-items:center; gap:16px; margin-bottom:24px; padding-bottom:24px; border-bottom:1px solid var(--color-fill)">
                    <img src="<?=e($avatarUrl)?>" style="width:72px; height:72px; border-radius:50%; border:2px solid var(--color-border); box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                    <div style="font-size:13px; color:var(--color-text-3); line-height: 1.6;">头像基于全球 Gravatar 服务多节点分发</div>
                </div>
                <div class="c-form__group"><label class="admin-stat__label">登录账号 (不可修改)</label><input type="text" class="form-input" value="<?=e($adminUser['username'])?>" disabled style="background:var(--color-fill); cursor:not-allowed"></div>
                <div class="c-form__group"><label class="admin-stat__label">公开展示昵称</label><input type="text" name="screen_name" class="form-input" required value="<?=e($adminUser['screen_name'])?>" autocomplete="new-password"></div>
                <div class="c-form__group"><label class="admin-stat__label">联系电子邮箱</label><input type="email" name="mail" class="form-input" required value="<?=e($adminUser['mail'])?>" autocomplete="new-password"></div>
                <button type="submit" class="btn btn-primary" style="margin-top:12px;"><i class="ri-user-settings-line" style="margin-right: 4px;"></i> 保存修改</button>
            </form>
        </div>

        <div class="tabs-pane" id="tab-smtp">
            <div class="pane-title">邮件推送服务配置</div>
            <form method="POST" action="<?=url('admin/settings')?>" autocomplete="off">
                <input type="text" class="honey-pot" name="fake_user"><input type="password" class="honey-pot" name="fake_pass">
                <?=csrf_field()?> <input type="hidden" name="_action" value="smtp">
                <div class="c-form__group"><label class="admin-stat__label">发件服务器 (SMTP)</label><input type="text" name="smtp_host" class="form-input" placeholder="例如: smtp.qq.com" value="<?=e(defined('SMTP_HOST')?SMTP_HOST:'')?>"></div>
                <div class="c-form__group"><label class="admin-stat__label">服务器端口</label><input type="number" name="smtp_port" class="form-input" placeholder="例如: 465" value="<?=e(defined('SMTP_PORT')?SMTP_PORT:'465')?>"></div>
                <div class="c-form__group"><label class="admin-stat__label">发件账号</label><input type="text" name="smtp_user" class="form-input" value="<?=e(defined('SMTP_USER')?SMTP_USER:'')?>" autocomplete="new-password"></div>
                <div class="c-form__group">
                    <label class="admin-stat__label">授权码</label>
                    <input type="password" name="smtp_pass" class="form-input <?= (defined('SMTP_PASS') && SMTP_PASS !== '') ? 'input-saved' : '' ?>" placeholder="<?= $smtpPlaceholder ?>" value="" autocomplete="new-password">
                </div>
                <div class="c-form__group"><label class="admin-stat__label">站长接收邮箱</label><input type="email" name="admin_email" class="form-input" value="<?=e(defined('ADMIN_EMAIL')?ADMIN_EMAIL:'')?>" autocomplete="new-password"></div>
                <button type="submit" class="btn btn-primary" style="margin-top:12px;"><i class="ri-refresh-line" style="margin-right: 4px;"></i> 保存配置</button>
            </form>
        </div>

        <div class="tabs-pane" id="tab-oss">
            <div class="pane-title">云端存储配置 (支持多存储引擎)</div>
            <form method="POST" action="<?=url('admin/settings')?>" autocomplete="off">
                <input type="text" class="honey-pot" name="fake_user"><input type="password" class="honey-pot" name="fake_pass">
                <?=csrf_field()?> <input type="hidden" name="_action" value="oss">
                
                <div class="c-form__group">
                    <label class="admin-stat__label">存储引擎类型</label>
                    <select name="oss_type" class="form-input" style="cursor:pointer; font-weight:bold;">
                        <option value="aliyun" <?=(!defined('OSS_TYPE') || OSS_TYPE==='aliyun')?'selected':''?>>阿里云 OSS</option>
                        <option value="upyun" <?=(defined('OSS_TYPE') && OSS_TYPE==='upyun')?'selected':''?>>又拍云 (兼容 S3 协议)</option>
                        <option value="s4" <?=(defined('OSS_TYPE') && (OSS_TYPE==='s4' || OSS_TYPE==='s3'))?'selected':''?>>其它云 S4/S3 标准协议</option>
                        <!-- ★ 新增选项：自定义 API 图床 -->
                        <option value="custom_api" <?=(defined('OSS_TYPE') && OSS_TYPE==='custom_api')?'selected':''?>>自定义图床 API (支持私人图床POST)</option>
                        <option value="litepic" <?=(defined('OSS_TYPE') && OSS_TYPE==='litepic')?'selected':''?>>菲克图床 LitePic（服务端中转）</option>
                    </select>
                </div>

                <div class="c-form__group"><label class="admin-stat__label">访问凭证 (AccessKey / 操作员名)</label><input type="text" name="oss_ak" class="form-input" value="<?=e(defined('OSS_AK')?OSS_AK:'')?>" autocomplete="new-password"><div style="font-size:12px; color:var(--color-text-3); margin-top:6px; line-height:1.6;">LitePic 模式下此项无需填写，可留空。</div></div>
                <div class="c-form__group">
                    <label class="admin-stat__label">私有密钥 (SecretKey / 图床Token)</label>
                    <input type="password" name="oss_sk" class="form-input <?= (defined('OSS_SK') && OSS_SK !== '') ? 'input-saved' : '' ?>" placeholder="<?= $skPlaceholder ?>" value="" autocomplete="new-password">
                </div>
                <div class="c-form__group">
                    <label class="admin-stat__label">LitePic 鉴权方式</label>
                    <select name="oss_auth" class="form-input" style="cursor:pointer; font-weight:bold;">
                        <option value="bearer" <?=(defined('OSS_AUTH') ? OSS_AUTH : 'bearer')==='bearer'?'selected':''?>>Authorization: Bearer Token</option>
                        <option value="x_api_key" <?=(defined('OSS_AUTH') && OSS_AUTH==='x_api_key')?'selected':''?>>X-API-Key Header</option>
                    </select>
                    <div style="font-size:12px; color:var(--color-text-3); margin-top:6px; line-height:1.6;">仅 LitePic 模式使用，默认推荐 Bearer。</div>
                </div>

                <div class="c-form__group">
                    <label class="admin-stat__label">存储桶端点 (Endpoint / 图床接口URL)</label>
                    <input type="url" name="oss_host" class="form-input" value="<?=e(defined('OSS_HOST')?OSS_HOST:'')?>">
                    <div style="font-size:12px; color:var(--color-text-3); margin-top:6px; line-height:1.6;">
                        阿里云示例: <code>https://xxx.aliyuncs.com</code> <br>
                        S4示例: <code>https://你的空间名.s3.bitiful.net</code> <br>
                        图床示例: <code>https://omg.46vip.top/?action=upload</code> <br>
                        LitePic 示例: <code>https://img.ficor.net</code> 或 <code>https://img.ficor.net/docs</code>
                    </div>
                </div>
                <div class="c-form__group"><label class="admin-stat__label">图片访问域名 (自定义图床 / LitePic 模式下无需填写此项)</label><input type="url" name="oss_domain" class="form-input" value="<?=e(defined('OSS_DOMAIN')?OSS_DOMAIN:'')?>"></div>
                <button type="submit" class="btn btn-primary" style="margin-top:12px;"><i class="ri-cloud-line" style="margin-right: 4px;"></i> 保存云存储设置</button>
            </form>
        </div>

        <div class="tabs-pane" id="tab-api">
            <div class="pane-title">第三方接口</div>
            <form method="POST" action="<?=url('admin/settings')?>" autocomplete="off">
                <input type="text" class="honey-pot" name="fake_user"><input type="password" class="honey-pot" name="fake_pass">
                <?=csrf_field()?> <input type="hidden" name="_action" value="moments">
                <div class="c-form__group">
                    <label class="admin-stat__label">站点聚合源</label>
                    <select name="aggregator_provider" class="form-input">
                        <option value="moments" <?=((defined('AGGREGATOR_PROVIDER') ? AGGREGATOR_PROVIDER : 'moments') === 'moments')?'selected':''?>>官方聚合接口</option>
                        <option value="freshrss" <?=((defined('AGGREGATOR_PROVIDER') ? AGGREGATOR_PROVIDER : 'moments') === 'freshrss')?'selected':''?>>FreshRSS（GReader API）</option>
                    </select>
                    <div style="font-size:12px;color:var(--color-text-3);margin-top:6px;line-height:1.7;">前台动态页的聚合流支持双源切换：保留原有 UID/Token 接口，同时可对接你给的 FreshRSS 老配置。</div>
                </div>
                <div style="padding:16px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-fill);margin-bottom:16px;">
                    <div style="font-size:14px;font-weight:700;margin-bottom:12px;">官方聚合接口</div>
                    <div class="c-form__group"><label class="admin-stat__label">UID</label><input type="text" name="moments_uid" class="form-input" value="<?=e(defined('MOMENTS_UID')?MOMENTS_UID:'')?>" autocomplete="new-password"></div>
                    <div class="c-form__group"><label class="admin-stat__label">Token</label><input type="password" name="moments_token" class="form-input" value="<?=e(defined('MOMENTS_TOKEN')?MOMENTS_TOKEN:'')?>" autocomplete="new-password"></div>
                </div>
                <div style="padding:16px;border:1px solid var(--color-border);border-radius:8px;background:var(--color-fill);margin-bottom:16px;">
                    <div style="font-size:14px;font-weight:700;margin-bottom:12px;">FreshRSS 兼容配置</div>
                    <div class="c-form__group"><label class="admin-stat__label">API 基址</label><input type="url" name="freshrss_api_url" class="form-input" placeholder="例如：https://rss.zhoutian.com/api/greader.php" value="<?=e(defined('FRESHRSS_API_URL')?FRESHRSS_API_URL:'')?>"></div>
                    <div class="c-form__group"><label class="admin-stat__label">用户名</label><input type="text" name="freshrss_user" class="form-input" value="<?=e(defined('FRESHRSS_USER')?FRESHRSS_USER:'')?>" autocomplete="new-password"></div>
                    <div class="c-form__group"><label class="admin-stat__label">密码</label><input type="password" name="freshrss_password" class="form-input" value="<?=e(defined('FRESHRSS_PASSWORD')?FRESHRSS_PASSWORD:'')?>" autocomplete="new-password"></div>
                    <div style="font-size:12px;color:var(--color-text-3);line-height:1.7;">按你提供的 <code>freshrss.php</code> 方式落地：<code>ClientLogin</code> 登录，<code>reading-list</code> 拉流，<code>subscription/list</code> 映射来源图标。</div>
                </div>
                <button type="submit" class="btn btn-primary" style="margin-top:12px;"><i class="ri-plug-line" style="margin-right: 4px;"></i> 保存凭证</button>
            </form>
        </div>

        <div class="tabs-pane" id="tab-env">
            <div class="pane-title" style="margin-bottom: 20px;">系统运行状态</div>
            <div style="background: var(--color-fill, #f8fafc); border: 1px dashed var(--color-border); border-radius: var(--radius-m); padding: 24px;">
                <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap:24px; font-size:14px;">
                    <div><span style="color:var(--color-text-3); display:block; margin-bottom:4px;">PHP 版本</span><strong style="color:var(--color-text-1); font-size: 16px;"><?=PHP_VERSION?></strong></div>
                    <div><span style="color:var(--color-text-3); display:block; margin-bottom:4px;">安全状态</span><span style="color:var(--color-success); font-weight: 600;"><i class="ri-lock-line"></i> 防护开启</span></div>
                    <div><span style="color:var(--color-text-3); display:block; margin-bottom:4px;">上传权限</span><?=is_writable(ROOT.'/uploads/')?'<span style="color:var(--color-success); font-weight: 600;"><i class="ri-checkbox-circle-fill"></i> 可写</span>':'<span style="color:var(--color-danger); font-weight: 600;"><i class="ri-close-circle-fill"></i> 拒绝</span>'?></div>
                    <div><span style="color:var(--color-text-3); display:block; margin-bottom:4px;">配置权限</span><?=is_writable(ROOT.'/config.php')?'<span style="color:var(--color-success); font-weight: 600;"><i class="ri-checkbox-circle-fill"></i> 可写</span>':'<span style="color:var(--color-danger); font-weight: 600;"><i class="ri-close-circle-fill"></i> 拒绝</span>'?></div>
                </div>
            </div>
            <div style="margin-top: 20px; font-size: 12px; color: var(--color-text-3);">健康指数：<strong>100%</strong>。</div>
        </div>
        
    </div>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const tabs = document.querySelectorAll('.tabs-tab');
    const panes = document.querySelectorAll('.tabs-pane');
    
    const activeTabId = sessionStorage.getItem('limhy_settings_tab') || 'tab-general';
    
    function activateTab(targetId) {
        tabs.forEach(t => t.classList.toggle('is-active', t.dataset.target === targetId));
        panes.forEach(p => p.classList.toggle('is-active', p.id === targetId));
        sessionStorage.setItem('limhy_settings_tab', targetId);
    }
    
    activateTab(activeTabId);
    
    tabs.forEach(tab => {
        tab.addEventListener('click', () => activateTab(tab.dataset.target));
    });

    // 监听 txt 文件导入
    const spamFileInput = document.getElementById('js-spam-file-input');
    const spamTextarea = document.getElementById('js-spam-textarea');
    if (spamFileInput && spamTextarea) {
        spamFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = function(ev) {
                const newWords = ev.target.result.trim();
                if (newWords) {
                    let oldWords = spamTextarea.value.trim();
                    spamTextarea.value = oldWords ? oldWords + '\n' + newWords : newWords;
                }
                spamFileInput.value = ''; // 重置 file
            };
            reader.readAsText(file);
        });
    }
});
</script>

<?php $content = ob_get_clean(); require __DIR__ . '/layout.php'; ?>
