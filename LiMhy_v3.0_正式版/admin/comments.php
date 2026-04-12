<?php
/**
 * LiMhy - 访客评论与安全审计
 *
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    处理评论的审核、回复，并提供访客行为画像与设备追溯分析
 */
require_once __DIR__ . '/../index.php';
$p = prefix();
$currentNav = 'comments';
$pageTitle = '评论管理';

/**
 * 当前站长公开身份。
 * 必须优先取 users.screen_name，而不是 SITE_NAME。
 */
function admin_comment_identity(string $p): array
{
    $adminUser = db_row("SELECT `screen_name`, `mail` FROM `{$p}users` WHERE `role` = 'admin' ORDER BY `id` ASC LIMIT 1");
    $author = trim((string)($adminUser['screen_name'] ?? ''));
    $email = trim((string)($adminUser['mail'] ?? ''));

    if ($author === '') {
        $author = defined('SITE_AUTHOR') && SITE_AUTHOR !== '' ? SITE_AUTHOR : 'admin';
    }
    if ($email === '' && defined('ADMIN_EMAIL')) {
        $email = trim((string)ADMIN_EMAIL);
    }

    return [
        'author' => $author,
        'email' => $email,
        'url' => defined('SITE_URL') ? rtrim((string)SITE_URL, '/') : '',
    ];
}

function admin_comment_send_reply_notification(string $p, array $parentComment, array $replyComment, array $post): void
{
    if (!class_exists('Mailer')) {
        return;
    }

    $parentEmail = trim((string)($parentComment['email'] ?? ''));
    $replyEmail = trim((string)($replyComment['email'] ?? ''));
    $adminEmail = defined('ADMIN_EMAIL') ? trim((string)ADMIN_EMAIL) : '';
    if ($parentEmail === '' || $parentEmail === $replyEmail || ($adminEmail !== '' && $parentEmail === $adminEmail)) {
        return;
    }

    $siteName = defined('SITE_NAME') ? (string)SITE_NAME : 'LiMhy';
    $siteUrl = defined('SITE_URL') ? rtrim((string)SITE_URL, '/') : '';
    $postTitle = (string)($post['title'] ?? '文章');
    $postType = (string)($post['type'] ?? 'post');
    $postSlug = (string)($post['slug'] ?? '');
    $postUrl = $siteUrl !== '' && $postSlug !== ''
        ? $siteUrl . '/' . ($postType === 'page' ? 'page/' : 'post/') . $postSlug
        : $siteUrl;

    $renderMail = static function (array $vars) use ($siteName, $siteUrl, $postUrl): string {
        extract($vars, EXTR_SKIP);
        ob_start();
        $tplPath = ROOT . '/templates/mail_notification.php';
        if (is_file($tplPath)) {
            include $tplPath;
            return (string)ob_get_clean();
        }
        ob_end_clean();
        return '<h3>您在【' . htmlspecialchars($siteName, ENT_QUOTES, 'UTF-8') . '】的评论收到了新回复</h3>'
            . '<p><b>' . htmlspecialchars((string)($replyAuthor ?? ''), ENT_QUOTES, 'UTF-8') . '</b> 回复了您：</p>'
            . '<p>' . nl2br(htmlspecialchars((string)($replyContent ?? ''), ENT_QUOTES, 'UTF-8')) . '</p>'
            . '<p><a href="' . htmlspecialchars($postUrl, ENT_QUOTES, 'UTF-8') . '">点击查看详情</a></p>';
    };

    try {
        $mailer = new Mailer();
        $body = $renderMail([
            'isReply' => true,
            'replyAuthor' => (string)($replyComment['author'] ?? ''),
            'replyEmail' => $replyEmail,
            'replyContent' => (string)($replyComment['content'] ?? ''),
            'parentContent' => (string)($parentComment['content'] ?? ''),
            'postTitle' => $postTitle,
            'siteName' => $siteName,
            'siteUrl' => $siteUrl,
            'postUrl' => $postUrl,
        ]);
        $mailer->send($parentEmail, '您的评论收到了新回复 - ' . $siteName, $body);
    } catch (\Throwable $e) {
        @file_put_contents(ROOT . '/data/mail_error.log', date('Y-m-d H:i:s') . ' [ADMIN-REPLY] ' . $e->getMessage() . "\n", FILE_APPEND);
    }
}

$adminIdentity = admin_comment_identity($p);

// 1. AJAX 接口：获取访客画像详情
if (isset($_GET['ajax_detail']) && is_ajax()) {
    header('Content-Type: application/json');
    $id=(int)$_GET['id'];
    $cm = db_row("SELECT c.*, p.title AS post_title, p.slug AS post_slug, p.type AS post_type FROM `{$p}comments` c LEFT JOIN `{$p}posts` p ON c.post_id = p.id WHERE c.id = ?", [$id]);
    if (!$cm) { echo json_encode(['ok' => false, 'msg' => '评论不存在']); exit; }

    $history = [];
    if (!empty($cm['email'])) {
        $history = db_rows("SELECT c.content, c.created_at, p.title as post_title FROM `{$p}comments` c LEFT JOIN `{$p}posts` p ON c.post_id = p.id WHERE c.email = ? AND c.id != ? ORDER BY c.created_at DESC LIMIT 5", [$cm['email'], $id]);
    }

    $cm['avatar_url'] = get_avatar_url($cm['email'], $cm['author']);
    $cm['history'] = $history;

    $firewallData = ['score' => 0, 'risk_level' => 'safe', 'is_banned' => false, 'geo_country' => ''];
    $deviceGuid = null;
    $isDeviceBanned = false;
    $identityDeviceCount = 0;
    $isIdentityBanned = false;

    if (class_exists('Firewall')) {
        $firewallData = Firewall::getIpAnalysis($cm['ip']);
        $deviceGuid = Firewall::getCommentGuid($id);
        if ($deviceGuid && Firewall::isGuidBanned($deviceGuid)) $isDeviceBanned = true;

        $identityDeviceCount = Firewall::getIdentityDeviceCount($cm['email']);
        $isIdentityBanned = Firewall::isIdentityBanned($cm['email']);
    }

    if (empty($firewallData['geo_country']) && function_exists('get_ip_location')) {
        $firewallData['geo_country'] = get_ip_location($cm['ip']);
    }

    $cm['firewall'] = $firewallData;
    $cm['device_guid'] = $deviceGuid;
    $cm['is_device_banned'] = $isDeviceBanned;
    $cm['identity_count'] = $identityDeviceCount;
    $cm['is_identity_banned'] = $isIdentityBanned;

    $recentItems = [];
    foreach ($history as $item) {
        $recentItems[] = [
            'time' => (string)($item['created_at'] ?? ''),
            'label' => '文章《' . (string)($item['post_title'] ?? '已删除文章') . '》',
            'content' => (string)($item['content'] ?? ''),
        ];
    }

    $panelHtml = function_exists('security_profile_render_panel')
        ? security_profile_render_panel([
            'author' => (string)($cm['author'] ?? '访客'),
            'avatar_url' => (string)($cm['avatar_url'] ?? ''),
            'email' => (string)($cm['email'] ?? ''),
            'url' => (string)($cm['url'] ?? ''),
            'ip' => (string)($cm['ip'] ?? ''),
            'geo_country' => (string)($firewallData['geo_country'] ?? ''),
            'score' => (int)($firewallData['score'] ?? 0),
            'threshold' => (int)($firewallData['threshold'] ?? 30),
            'risk_level' => (string)($firewallData['risk_level'] ?? 'safe'),
            'components' => (array)($firewallData['components'] ?? []),
            'network' => (array)($firewallData['network'] ?? []),
            'decision' => (array)($firewallData['decision'] ?? []),
            'request_count' => (int)($firewallData['request_count'] ?? 0),
            'f12_hits' => (int)($firewallData['f12_hits'] ?? 0),
            'unique_paths' => (int)($firewallData['unique_paths'] ?? 0),
            'peak_minute' => (int)($firewallData['peak_minute'] ?? 0),
            'device_guid' => (string)($deviceGuid ?? ''),
            'is_device_banned' => (bool)$isDeviceBanned,
            'is_banned' => (bool)($firewallData['is_banned'] ?? false),
            'identity_count' => (int)$identityDeviceCount,
            'is_identity_banned' => (bool)$isIdentityBanned,
            'identity_value' => (string)($cm['email'] ?? ''),
            'recent_items' => $recentItems,
        ])
        : '';

    echo json_encode(['ok' => true, 'html' => $panelHtml]); exit;
}

// 2. AJAX 接口：执行安全封禁动作
if (isset($_POST['ajax_ban_action']) && is_ajax()) {
    header('Content-Type: application/json');
    if (!is_admin()) { echo json_encode(['ok'=>false, 'msg'=>'无权操作']); exit; }

    $target = $_POST['target'] ?? '';
    $value  = $_POST['value'] ?? '';
    $action = $_POST['action'] ?? '';

    if (class_exists('Firewall')) {
        if ($target === 'device') {
            if ($action === 'ban') { Firewall::banDevice($value); echo json_encode(['ok'=>true, 'msg'=>'设备已封禁']); }
            else { Firewall::unbanDevice($value); echo json_encode(['ok'=>true, 'msg'=>'设备已解封']); }
        }
        elseif ($target === 'ip') {
            if ($action === 'ban') { Firewall::manualBanIp($value); echo json_encode(['ok'=>true, 'msg'=>'IP 已封禁']); }
            else { Firewall::manualUnbanIp($value); echo json_encode(['ok'=>true, 'msg'=>'IP 已解封']); }
        }
        elseif ($target === 'identity') {
            if ($action === 'ban') {
                $count = Firewall::banIdentity($value);
                echo json_encode(['ok'=>true, 'msg'=>"已封杀此身份，关联的 {$count} 个设备全部拉黑"]);
            } else {
                $count = Firewall::unbanIdentity($value);
                echo json_encode(['ok'=>true, 'msg'=>"已解封此身份，恢复了 {$count} 个设备的访问权限"]);
            }
        }
    } else {
        echo json_encode(['ok'=>false, 'msg'=>'防御系统未激活']);
    }
    exit;
}

$statusFilter = in_array($_GET['status'] ?? '', ['pending', 'approved', 'spam'], true) ? (string)$_GET['status'] : '';
$currentPage = max(1, (int)($_GET['page'] ?? 1));
$openReplyId = max(0, (int)($_GET['open_reply'] ?? 0));
$openEditId = max(0, (int)($_GET['open_edit'] ?? 0));

$buildCommentAdminUrl = static function (array $extra = []) use ($statusFilter, $currentPage): string {
    $qs = [];
    if ($statusFilter !== '') {
        $qs['status'] = $statusFilter;
    }
    if ($currentPage > 1) {
        $qs['page'] = $currentPage;
    }
    foreach ($extra as $k => $v) {
        if ($v === null || $v === '') {
            continue;
        }
        $qs[$k] = $v;
    }
    return 'admin/comments' . ($qs ? '?' . http_build_query($qs) : '');
};

// 3. 常规表单动作
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $act = (string)($_POST['_action'] ?? '');
    $id = (int)($_POST['id'] ?? 0);

    if ($act === 'batch_delete') {
        $ids = array_values(array_filter(array_map('intval', (array)($_POST['ids'] ?? []))));
        if (!$ids) {
            set_flash('error', '请至少勾选一条评论');
            redirect($buildCommentAdminUrl());
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $postIds = db_rows("SELECT DISTINCT `post_id` FROM `{$p}comments` WHERE `id` IN ({$placeholders})", $ids);
        db_execute("DELETE FROM `{$p}comments` WHERE `id` IN ({$placeholders})", $ids);
        foreach ($postIds as $postRow) {
            if (!empty($postRow['post_id'])) {
                update_comment_count((int)$postRow['post_id']);
            }
        }
        if (function_exists('clear_html_cache')) clear_html_cache();
        set_flash('success', '已批量删除 ' . count($ids) . ' 条评论');
        redirect($buildCommentAdminUrl());
    }

    if ($id > 0) {
        if ($act === 'approve') {
            db_execute("UPDATE `{$p}comments` SET `status`='approved' WHERE `id`=?", [$id]);
            $pid = db_value("SELECT `post_id` FROM `{$p}comments` WHERE `id`=?", [$id]);
            if ($pid) update_comment_count((int)$pid);
            if (function_exists('clear_html_cache')) clear_html_cache();
            set_flash('success','已通过');
        }
        elseif ($act === 'spam') {
            db_execute("UPDATE `{$p}comments` SET `status`='spam' WHERE `id`=?", [$id]);
            $pid = db_value("SELECT `post_id` FROM `{$p}comments` WHERE `id`=?", [$id]);
            if ($pid) update_comment_count((int)$pid);
            if (function_exists('clear_html_cache')) clear_html_cache();
            set_flash('success','已标记垃圾');
        }
        elseif ($act === 'delete') {
            $pid = db_value("SELECT `post_id` FROM `{$p}comments` WHERE `id`=?", [$id]);
            db_execute("DELETE FROM `{$p}comments` WHERE `id`=?", [$id]);
            if ($pid) update_comment_count((int)$pid);
            if (function_exists('clear_html_cache')) clear_html_cache();
            set_flash('success','已删除');
        }
        elseif ($act === 'toggle_featured') {
            db_execute("UPDATE `{$p}comments` SET `is_featured` = 1 - `is_featured` WHERE `id`=?", [$id]);
            set_flash('success', '精选状态已更新');
        }
        elseif ($act === 'edit') {
            $editedContent = trim((string)($_POST['edit_content'] ?? ''));
            if ($editedContent === '') {
                set_flash('error', '评论内容不能为空');
                redirect($buildCommentAdminUrl(['open_edit' => $id]));
            }
            if (mb_strlen($editedContent) < 2) {
                set_flash('error', '评论内容至少 2 个字符');
                redirect($buildCommentAdminUrl(['open_edit' => $id]));
            }
            if (mb_strlen($editedContent) > 5000) {
                set_flash('error', '评论内容不能超过 5000 个字符');
                redirect($buildCommentAdminUrl(['open_edit' => $id]));
            }
            db_execute("UPDATE `{$p}comments` SET `content` = ? WHERE `id` = ?", [$editedContent, $id]);
            if (function_exists('clear_html_cache')) clear_html_cache();
            set_flash('success', '评论内容已更新');
            redirect($buildCommentAdminUrl(['highlight' => $id]));
        }
        elseif ($act === 'reply') {
            $replyContent = trim((string)($_POST['reply_content'] ?? ''));
            $approveParent = (int)($_POST['approve_parent'] ?? 0) === 1;
            if ($replyContent === '') {
                set_flash('error', '回复内容不能为空');
                redirect($buildCommentAdminUrl(['open_reply' => $id]));
            }
            if (mb_strlen($replyContent) < 2) {
                set_flash('error', '回复内容至少 2 个字符');
                redirect($buildCommentAdminUrl(['open_reply' => $id]));
            }
            if (mb_strlen($replyContent) > 2000) {
                set_flash('error', '回复内容不能超过 2000 个字符');
                redirect($buildCommentAdminUrl(['open_reply' => $id]));
            }

            $parentComment = db_row("SELECT * FROM `{$p}comments` WHERE `id` = ? LIMIT 1", [$id]);
            if (!$parentComment) {
                set_flash('error', '原评论不存在');
                redirect($buildCommentAdminUrl());
            }
            $post = db_row("SELECT `id`, `title`, `slug`, `type` FROM `{$p}posts` WHERE `id` = ? LIMIT 1", [(int)$parentComment['post_id']]);
            if (!$post) {
                set_flash('error', '所属文章不存在');
                redirect($buildCommentAdminUrl());
            }

            if ($approveParent && (string)$parentComment['status'] !== 'approved') {
                db_execute("UPDATE `{$p}comments` SET `status`='approved' WHERE `id` = ?", [$id]);
            }

            $replyId = db_insert(
                "INSERT INTO `{$p}comments` (`post_id`, `parent_id`, `author`, `email`, `url`, `content`, `ip`, `status`, `is_admin`, `created_at`) VALUES (?, ?, ?, ?, ?, ?, ?, 'approved', 1, NOW())",
                [
                    (int)$parentComment['post_id'],
                    $id,
                    $adminIdentity['author'],
                    $adminIdentity['email'],
                    $adminIdentity['url'],
                    $replyContent,
                    client_ip(),
                ]
            );
            update_comment_count((int)$parentComment['post_id']);
            if (function_exists('clear_html_cache')) clear_html_cache();
            admin_comment_send_reply_notification($p, $parentComment, [
                'author' => $adminIdentity['author'],
                'email' => $adminIdentity['email'],
                'content' => $replyContent,
            ], $post);
            set_flash('success', '回复已发送');
            redirect($buildCommentAdminUrl(['highlight' => $replyId]));
        }
    }
    redirect($buildCommentAdminUrl());
}

// 4. 数据拉取
$highlightId = max(0, (int)($_GET['highlight'] ?? 0));
$openDetailId = max(0, (int)($_GET['open_detail'] ?? 0));
$page = $currentPage;
$perPage = 20;
$offset = ($page-1)*$perPage;
$where = '';
$params = [];
if ($statusFilter) {
    $where = "WHERE c.`status`=?";
    $params[] = $statusFilter;
}

if ($highlightId > 0 && !isset($_GET['page'])) {
    $highlightRow = db_row("SELECT `id`, `is_featured`, `created_at`, `status` FROM `{$p}comments` WHERE `id` = ? LIMIT 1", [$highlightId]);
    if ($highlightRow && (!$statusFilter || $highlightRow['status'] === $statusFilter)) {
        $rankSql = "SELECT COUNT(*) FROM `{$p}comments` WHERE (`is_featured` > ?) OR (`is_featured` = ? AND `created_at` > ?) OR (`is_featured` = ? AND `created_at` = ? AND `id` >= ?)";
        $rankParams = [$highlightRow['is_featured'], $highlightRow['is_featured'], $highlightRow['created_at'], $highlightRow['is_featured'], $highlightRow['created_at'], $highlightId];
        if ($statusFilter) {
            $rankSql = "SELECT COUNT(*) FROM `{$p}comments` WHERE `status` = ? AND ((`is_featured` > ?) OR (`is_featured` = ? AND `created_at` > ?) OR (`is_featured` = ? AND `created_at` = ? AND `id` >= ?))";
            $rankParams = [$statusFilter, $highlightRow['is_featured'], $highlightRow['is_featured'], $highlightRow['created_at'], $highlightRow['is_featured'], $highlightRow['created_at'], $highlightId];
        }
        $rank = (int)db_value($rankSql, $rankParams);
        $page = max(1, (int)ceil($rank / $perPage));
        $offset = ($page - 1) * $perPage;
    }
}

$baseUrl = 'admin/comments?' . ($statusFilter ? "status={$statusFilter}&" : '');
$total = (int)db_value("SELECT COUNT(*) FROM `{$p}comments` c {$where}", $params);
$totalPages = (int)ceil($total/$perPage);
$comments = db_rows("SELECT c.*, p.title AS post_title, p.slug AS post_slug, p.type AS post_type FROM `{$p}comments` c LEFT JOIN `{$p}posts` p ON p.id = c.post_id {$where} ORDER BY c.is_featured DESC, c.created_at DESC LIMIT {$perPage} OFFSET {$offset}", $params);
$cntAll = (int)db_value("SELECT COUNT(*) FROM `{$p}comments`");
$cntPending = (int)db_value("SELECT COUNT(*) FROM `{$p}comments` WHERE status='pending'");
$cntApproved = (int)db_value("SELECT COUNT(*) FROM `{$p}comments` WHERE status='approved'");
$cntSpam = (int)db_value("SELECT COUNT(*) FROM `{$p}comments` WHERE status='spam'");
$statusMap = ['approved' => '已通过', 'pending'  => '待审核', 'spam' => '垃圾'];

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
.detail-user { display: flex; align-items: center; gap: 16px; margin-bottom: 24px; }
.detail-user img { width: 56px; height: 56px; border-radius: 50%; border: 1px solid var(--color-border); }
.detail-user h3 { margin: 0 0 4px 0; font-size: 18px; color: var(--color-text-1); }
.detail-user p { margin: 0; font-size: 13px; color: var(--color-text-3); }
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
.reply-row td { background: #fafcff; }
.reply-box { border: 1px solid var(--color-border); border-radius: 10px; background: #fff; padding: 18px; }
[data-admin-theme="dark"] .reply-row td { background: #1f2937; }
[data-admin-theme="dark"] .reply-box { background: #111827; border-color: #334155; }
[data-admin-theme="dark"] .reply-quote { background: #0f172a; border-color: #334155; color: #cbd5e1; }
[data-admin-theme="dark"] .reply-quote strong,
[data-admin-theme="dark"] .reply-meta,
[data-admin-theme="dark"] .reply-meta-item,
[data-admin-theme="dark"] .reply-box textarea { color: var(--color-text-1); }
[data-admin-theme="dark"] .reply-toggle,
[data-admin-theme="dark"] .admin-comment-action--edit { background: var(--color-bg-white); color: var(--color-text-1); border-color: var(--color-border); }
[data-admin-theme="dark"] .reply-toggle:hover,
[data-admin-theme="dark"] .admin-comment-action--edit:hover { background: rgba(255,255,255,0.06); color: var(--color-text-1); }
[data-admin-theme="dark"] .modal-box { background: var(--color-bg-white); border: 1px solid var(--color-border); box-shadow: 0 24px 80px rgba(2,6,23,.45); }
[data-admin-theme="dark"] .modal-header { border-color: var(--color-border); }
[data-admin-theme="dark"] .detail-card { background: rgba(255,255,255,0.04); border-color: var(--color-border); }
[data-admin-theme="dark"] .history-content { background: rgba(255,255,255,0.04); border-color: rgba(96,165,250,.38); color: var(--color-text-1); }
[data-admin-theme="dark"] .edit-row td { background: #1f2937; }
[data-admin-theme="dark"] .edit-box { background: #111827; border-color: #334155; }
[data-admin-theme="dark"] .edit-note,
[data-admin-theme="dark"] .edit-box textarea { color: var(--color-text-1); }
.reply-meta { display:grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap:10px 16px; margin-bottom: 14px; color: var(--color-text-2); font-size: 13px; }
.admin-comment-post-cell { max-width: 240px; }
.admin-comment-post-link { display:block; max-width:100%; font-size:12px; color:var(--color-primary); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; word-break:normal; writing-mode:horizontal-tb; }
.reply-meta-item { display:flex; align-items:center; gap:8px; }
.reply-quote { background: var(--color-fill); border: 1px solid var(--color-border); border-radius: 8px; padding: 12px; margin-bottom: 14px; color: var(--color-text-2); font-size: 13px; }
.reply-quote strong { color: var(--color-text-1); }
.reply-actions { display:flex; gap:10px; align-items:center; flex-wrap:wrap; margin-top: 12px; }
.reply-toggle { min-width: 72px; }
.reply-toggle.is-open { background: var(--color-primary-light); color: var(--color-primary); border-color: rgba(22,93,255,.18); }
.edit-row td { background: #fffaf4; }
.edit-box { border: 1px solid var(--color-border); border-radius: 10px; background: #fff; padding: 18px; }
.edit-note { font-size: 13px; color: var(--color-text-2); margin-bottom: 12px; }
@media (max-width: 768px) {
    .reply-row td { padding: 12px; }
    .reply-box { padding: 14px; }
}
</style>

<div style="display:flex; gap:10px; margin-bottom:20px; overflow-x:auto;">
    <a href="<?=url('admin/comments')?>" class="btn <?=$statusFilter===''?'btn-primary':'btn-ghost'?>">全部 (<?=$cntAll?>)</a>
    <a href="<?=url('admin/comments?status=pending')?>" class="btn <?=$statusFilter==='pending'?'btn-primary':'btn-ghost'?>">待审 (<?=$cntPending?>)</a>
    <a href="<?=url('admin/comments?status=approved')?>" class="btn <?=$statusFilter==='approved'?'btn-primary':'btn-ghost'?>">通过 (<?=$cntApproved?>)</a>
    <a href="<?=url('admin/comments?status=spam')?>" class="btn <?=$statusFilter==='spam'?'btn-primary':'btn-ghost'?>">垃圾 (<?=$cntSpam?>)</a>
</div>

<form method="POST" action="<?=url($buildCommentAdminUrl())?>" id="commentBatchForm" onsubmit="return confirm('确定批量删除所选评论吗？此操作不可恢复。');">
    <?=csrf_field()?>
    <input type="hidden" name="_action" value="batch_delete">
</form>
<div style="display:flex; justify-content:space-between; align-items:center; margin:16px 0 12px; gap:12px;">
    <label style="display:inline-flex;align-items:center;gap:8px;font-size:13px;color:var(--color-text-2);cursor:pointer;"><input type="checkbox" data-check-all-comments> 全选当前页</label>
    <button type="submit" form="commentBatchForm" class="btn btn-ghost is-danger"><i class="ri-delete-bin-line"></i> 批量删除</button>
</div>
<div class="card" style="padding:0; overflow:hidden;">
    <div class="table-wrap">
        <table class="table">
            <thead><tr><th width="48"><input type="checkbox" data-check-all-comments></th><th width="25%">作者</th><th width="35%">内容</th><th>文章</th><th>状态</th><th>操作</th></tr></thead>
            <tbody>
            <?php foreach ($comments as $cm):
                $avatar = get_avatar_url($cm['email'] ?? '', $cm['author']);
                $rowStyle = $cm['is_featured'] ? 'background:var(--color-warning-bg);' : '';
                $replyOpen = $openReplyId === (int)$cm['id'];
                $editOpen = $openEditId === (int)$cm['id'];
                $commentAdminUrl = $buildCommentAdminUrl(['open_reply' => $cm['id']]);
                $editCommentUrl = $buildCommentAdminUrl(['open_edit' => $cm['id']]);
                $closeReplyUrl = $buildCommentAdminUrl();
            ?>
                <tr id="comment-row-<?=$cm['id']?>" data-comment-row="<?=$cm['id']?>" style="<?=$rowStyle?>">
                    <td data-label="选择"><input type="checkbox" class="row-check-comment" form="commentBatchForm" name="ids[]" value="<?=$cm['id']?>"></td>
                    <td data-label="作者">
                        <div style="display:flex; align-items:center; gap:10px;">
                            <img src="<?=e($avatar)?>" style="width:32px; height:32px; border-radius:50%; border:1px solid var(--color-border); object-fit:cover;">
                            <div>
                                <div style="font-weight:600; font-size:14px; display:flex; align-items:center; gap:4px;"><?=e($cm['author'])?><?php if($cm['is_featured']): ?><i class="ri-star-fill" style="color:#FF7D00; font-size:14px;" title="精选评论"></i><?php endif; ?></div>
                                <div style="font-size:11px; color:var(--color-text-3);"><?=e($cm['ip']??'')?></div>
                            </div>
                        </div>
                    </td>
                    <td data-label="内容">
                        <div style="font-size:13px; line-height:1.5; color:var(--color-text-1);"><?=e(mb_substr((string)$cm['content'], 0, 80))?><?=mb_strlen((string)$cm['content'])>80?'...':''?></div>
                        <div style="font-size:11px; color:var(--color-text-3); margin-top:4px;"><?=time_ago($cm['created_at'])?></div>
                    </td>
                    <td data-label="文章" class="admin-comment-post-cell"><a href="<?=url(($cm['post_type']==='page'?'page/':'post/').$cm['post_slug'])?>" target="_blank" class="admin-comment-post-link" title="<?=e((string)($cm['post_title'] ?? '已删除'))?>"><?=e((string)($cm['post_title'] ?? '已删除'))?></a></td>
                    <td data-label="状态"><span class="badge badge-<?=e($cm['status'])?>"><?=$statusMap[$cm['status']] ?? $cm['status']?></span></td>
                    <td data-label="操作" class="admin-comment-actions-cell">
                        <div class="admin-comment-actions" role="group" aria-label="评论操作">
                            <button class="btn btn-ghost icon-btn admin-comment-action admin-comment-action--detail js-view-detail" data-id="<?=$cm['id']?>" id="comment-detail-btn-<?=$cm['id']?>" title="详情" aria-label="查看评论详情"><i class="ri-profile-line"></i></button>
                            <a href="<?=url($replyOpen ? $closeReplyUrl : $commentAdminUrl)?>" class="btn btn-ghost reply-toggle admin-comment-action admin-comment-action--reply <?=$replyOpen ? 'is-open' : ''?>" title="回复评论" aria-label="回复评论"><i class="ri-reply-line"></i><span class="admin-icon-text-btn__label">回复</span></a>
                            <a href="<?=url($editOpen ? $closeReplyUrl : $editCommentUrl)?>" class="btn btn-ghost reply-toggle admin-comment-action admin-comment-action--edit <?=$editOpen ? 'is-open' : ''?>" title="编辑评论" aria-label="编辑评论"><i class="ri-edit-line"></i><span class="admin-icon-text-btn__label">编辑</span></a>
                            <?php if ($cm['status']==='approved'): ?>
                            <form method="POST" action="<?=url($buildCommentAdminUrl())?>" class="admin-comment-action-form"><?=csrf_field()?> <input type="hidden" name="_action" value="toggle_featured"> <input type="hidden" name="id" value="<?=$cm['id']?>"><?php if($cm['is_featured']): ?><button class="btn btn-ghost icon-btn admin-comment-action admin-comment-action--featured" style="color:#FF7D00" title="取消精选" aria-label="取消精选"><i class="ri-star-fill"></i></button><?php else: ?><button class="btn btn-ghost icon-btn admin-comment-action admin-comment-action--featured" style="color:var(--color-text-3)" title="设为精选" aria-label="设为精选"><i class="ri-star-line"></i></button><?php endif; ?></form>
                            <?php else: ?>
                            <form method="POST" action="<?=url($buildCommentAdminUrl())?>" class="admin-comment-action-form"><?=csrf_field()?> <input type="hidden" name="_action" value="approve"> <input type="hidden" name="id" value="<?=$cm['id']?>"><button class="btn btn-ghost icon-btn admin-comment-action admin-comment-action--approve" style="color:var(--color-success)" title="通过" aria-label="通过评论"><i class="ri-check-line"></i></button></form>
                            <?php endif; ?>
                            <?php if ($cm['status']!=='spam'): ?>
                            <form method="POST" action="<?=url($buildCommentAdminUrl())?>" class="admin-comment-action-form"><?=csrf_field()?> <input type="hidden" name="_action" value="spam"> <input type="hidden" name="id" value="<?=$cm['id']?>"><button class="btn btn-ghost icon-btn admin-comment-action admin-comment-action--spam" style="color:var(--color-warning)" title="标记垃圾" aria-label="标记垃圾评论"><i class="ri-spam-line"></i></button></form>
                            <?php endif; ?>
                            <form method="POST" action="<?=url($buildCommentAdminUrl())?>" class="admin-comment-action-form" onsubmit="return confirm('确定删除？')"><?=csrf_field()?> <input type="hidden" name="_action" value="delete"> <input type="hidden" name="id" value="<?=$cm['id']?>"><button class="btn btn-ghost icon-btn admin-comment-action admin-comment-action--delete is-danger" title="删除" aria-label="删除评论"><i class="ri-delete-bin-line"></i></button></form>
                        </div>
                    </td>
                </tr>
                <?php if ($editOpen): ?>
                <tr class="edit-row">
                    <td colspan="6">
                        <div class="edit-box">
                            <div style="font-size:16px; font-weight:600; color:var(--color-text-1); margin-bottom:14px;">编辑评论内容</div>
                            <div class="edit-note">该操作将直接修改用户提交的评论内容，建议仅用于修正违规、错别字或误发内容。</div>
                            <form method="POST" action="<?=url($buildCommentAdminUrl(['open_edit' => $cm['id']]))?>">
                                <?=csrf_field()?>
                                <input type="hidden" name="_action" value="edit">
                                <input type="hidden" name="id" value="<?=$cm['id']?>">
                                <textarea name="edit_content" class="form-textarea" rows="6" required><?=e((string)$cm['content'])?></textarea>
                                <div class="reply-actions">
                                    <button type="submit" class="btn btn-primary"><i class="ri-save-line"></i> 保存修改</button>
                                    <a href="<?=url($closeReplyUrl)?>" class="btn btn-ghost">取消</a>
                                </div>
                            </form>
                        </div>
                    </td>
                </tr>
                <?php endif; ?>
                <?php if ($replyOpen): ?>
                <tr class="reply-row">
                    <td colspan="6">
                        <div class="reply-box">
                            <div style="font-size:16px; font-weight:600; color:var(--color-text-1); margin-bottom:14px;">后台直接回复评论</div>
                            <div class="reply-meta">
                                <div class="reply-meta-item"><i class="ri-user-3-line"></i><span>回复对象：<?=e($cm['author'])?></span></div>
                                <div class="reply-meta-item"><i class="ri-quill-pen-line"></i><span>站长身份：<?=e($adminIdentity['author'])?></span></div>
                                <div class="reply-meta-item"><i class="ri-article-line"></i><span>所属文章：<?=e((string)($cm['post_title'] ?? '已删除文章'))?></span></div>
                                <div class="reply-meta-item"><i class="ri-time-line"></i><span>留言时间：<?=e((string)$cm['created_at'])?></span></div>
                            </div>
                            <div class="reply-quote"><strong>原评论：</strong> <?=e((string)$cm['content'])?></div>
                            <form method="POST" action="<?=url($buildCommentAdminUrl(['open_reply' => $cm['id']]))?>">
                                <?=csrf_field()?>
                                <input type="hidden" name="_action" value="reply">
                                <input type="hidden" name="id" value="<?=$cm['id']?>">
                                <textarea name="reply_content" class="form-textarea" rows="5" placeholder="直接以站长身份回复这条评论..." required autofocus></textarea>
                                <div class="reply-actions">
                                    <?php if ($cm['status'] !== 'approved'): ?>
                                    <label style="display:inline-flex; align-items:center; gap:8px; color:var(--color-text-2);">
                                        <input type="checkbox" name="approve_parent" value="1"> 回复时同时通过原评论
                                    </label>
                                    <?php endif; ?>
                                    <button type="submit" class="btn btn-primary"><i class="ri-send-plane-line"></i> 发送回复</button>
                                    <a href="<?=url($closeReplyUrl)?>" class="btn btn-ghost">取消</a>
                                </div>
                            </form>
                        </div>
                    </td>
                </tr>
                <?php endif; ?>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php if(empty($comments)): ?><div class="admin-empty">暂无评论</div><?php endif; ?>
</div>
</form>
<script>document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('[data-check-all-comments]').forEach(function(all){all.addEventListener('change',function(){document.querySelectorAll('.row-check-comment').forEach(function(el){el.checked=all.checked;});document.querySelectorAll('[data-check-all-comments]').forEach(function(peer){peer.checked=all.checked;});});});document.querySelectorAll('.row-check-comment').forEach(function(box){box.addEventListener('change',function(){var items=document.querySelectorAll('.row-check-comment');var checked=document.querySelectorAll('.row-check-comment:checked');var allChecked=items.length>0&&items.length===checked.length;document.querySelectorAll('[data-check-all-comments]').forEach(function(peer){peer.checked=allChecked;});});});});</script>


<style>
.security-profile{display:flex;flex-direction:column;gap:16px}.security-profile__header{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.security-profile__identity{display:flex;gap:14px;align-items:center}.security-profile__avatar{width:56px;height:56px;border-radius:50%;border:1px solid var(--color-border);object-fit:cover}.security-profile__who h3{margin:0;font-size:28px;color:var(--color-text-1)}.security-profile__who p{margin:4px 0 0;font-size:13px;color:var(--color-text-3)}.security-profile__who a{color:var(--color-primary)}.security-profile__tags{display:flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}.security-profile__level,.security-profile__chip{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;font-size:12px;font-weight:700}.security-profile__level--safe{background:rgba(34,197,94,.12);color:#15803d}.security-profile__level--observe{background:rgba(59,130,246,.12);color:#1d4ed8}.security-profile__level--challenge{background:rgba(245,158,11,.14);color:#b45309}.security-profile__level--restrict,.security-profile__level--ban{background:rgba(239,68,68,.12);color:#b91c1c}.security-profile__chip{background:#f5f7fb;color:var(--color-text-2);border:1px solid var(--color-border)}.security-profile__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.security-profile__card{background:#fff;border:1px solid var(--color-border);border-radius:16px;padding:16px}.security-profile__card.is-danger{border-color:rgba(239,68,68,.24);background:rgba(239,68,68,.04)}.security-profile__card.is-warning{border-color:rgba(245,158,11,.28);background:rgba(245,158,11,.06)}.security-profile__card.is-observe{border-color:rgba(59,130,246,.28);background:rgba(59,130,246,.05)}.security-profile__card.is-safe{border-color:rgba(34,197,94,.22);background:rgba(34,197,94,.04)}.security-profile__card--wide{grid-column:1 / -1}.security-profile__card-title{font-size:12px;color:var(--color-text-3);margin-bottom:10px;display:flex;gap:6px;align-items:center}.security-profile__card-main{font-size:28px;font-weight:800;color:var(--color-text-1)}.security-profile__card-main code{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:14px}.security-profile__card-main--with-action{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;font-size:22px;flex-wrap:wrap}.security-profile__value-stack{display:flex;flex-direction:column;gap:6px;min-width:0;flex:1 1 220px}.security-profile__value-text{display:block;min-width:0;overflow-wrap:anywhere;word-break:break-word;line-height:1.35}.security-profile__action-wrap{display:flex;justify-content:flex-end;flex:0 0 auto}.security-profile__card-main--accent{color:var(--color-primary);font-size:24px}.security-profile__action{padding:0 10px;height:32px;font-size:12px;white-space:nowrap}.security-profile__metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}.security-profile__metric{border:1px solid var(--color-border);border-radius:12px;padding:12px 14px;background:var(--color-fill-2,#fafafa)}.security-profile__metric-label{font-size:12px;color:var(--color-text-3)}.security-profile__metric-value{margin-top:6px;font-size:20px;font-weight:800;color:var(--color-text-1)}.security-profile__meta{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;color:var(--color-text-2);font-size:13px}.security-profile__history-title{font-size:16px;font-weight:700;color:var(--color-text-1);display:flex;gap:8px;align-items:center}.security-profile__timeline{display:flex;flex-direction:column;gap:10px}.security-profile__timeline-item{border-left:3px solid var(--color-primary);background:#f7f9fc;border-radius:12px;padding:10px 12px}.security-profile__timeline-time{font-size:12px;color:var(--color-text-3)}.security-profile__timeline-label{margin-top:4px;font-size:12px;color:var(--color-text-2)}.security-profile__timeline-content{margin-top:6px;font-size:13px;color:var(--color-text-1);line-height:1.6}.security-profile__empty{text-align:center;padding:16px;color:var(--color-text-3);border:1px dashed var(--color-border);border-radius:12px}@media(max-width:900px){.security-profile__grid,.security-profile__metrics,.security-profile__meta{grid-template-columns:1fr}.security-profile__header{flex-direction:column}.security-profile__card-main--with-action{flex-direction:column;align-items:flex-start}.security-profile__who h3{font-size:22px}}@media(max-width:640px){.security-profile__identity{align-items:flex-start}.security-profile__avatar{width:48px;height:48px}.security-profile__card-main{font-size:22px}.security-profile__card-main code{font-size:12px}.security-profile__value-stack{flex-basis:100%}.security-profile__action-wrap{width:100%;justify-content:flex-start}.security-profile__action{max-width:100%}} </style>

<?php if($totalPages>1): ?>
<div style="display:flex; justify-content:center; gap:8px; margin-top:20px;">
    <a href="<?=url($baseUrl . 'page=' . max(1,$page-1))?>" class="btn btn-ghost"><i class="ri-arrow-left-s-line"></i></a>
    <span class="btn" style="background:#fff; border-color:var(--color-border); cursor:default;"><?=$page?> / <?=$totalPages?></span>
    <a href="<?=url($baseUrl . 'page=' . min($totalPages,$page+1))?>" class="btn btn-ghost"><i class="ri-arrow-right-s-line"></i></a>
</div>
<?php endif; ?>

<div id="detailModal" class="modal-overlay"><div class="modal-box"><div class="modal-header">用户画像与安全态势<i class="ri-close-line modal-close" id="closeModalBtn"></i></div><div class="modal-body" id="detailModalBody"></div></div></div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    const highlightId = <?= $highlightId ?>;
    const openDetailId = <?= $openDetailId ?>;
    const autoOpenDetail = () => {
        if (openDetailId <= 0) return;
        const trigger = document.getElementById('comment-detail-btn-' + String(openDetailId));
        if (trigger) {
            setTimeout(() => trigger.click(), 260);
        }
    };
    if (highlightId > 0) {
        const row = document.querySelector('[data-comment-row="' + String(highlightId) + '"]');
        if (row) {
            row.style.transition = 'box-shadow .25s ease, background-color .25s ease';
            row.style.backgroundColor = 'rgba(22, 93, 255, 0.08)';
            row.style.boxShadow = 'inset 3px 0 0 var(--color-primary)';
            setTimeout(() => {
                row.scrollIntoView({ behavior: 'smooth', block: 'center' });
                autoOpenDetail();
            }, 120);
        } else {
            autoOpenDetail();
        }
    } else {
        autoOpenDetail();
    }
    const modal = document.getElementById('detailModal');
    const closeBtn = document.getElementById('closeModalBtn');
    const modalBody = document.getElementById('detailModalBody');
    const closeModal = () => { modal.classList.remove('is-active'); };
    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', (e) => { if(e.target === modal) closeModal(); });
    const escapeHtml = (u) => (u||'').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
    modalBody.addEventListener('click', function(e) {
        const btn = e.target.closest('.js-security-ban-action');
        if (!btn) return;
        e.preventDefault();
        let value = btn.getAttribute('data-value') || '';
        try { value = JSON.parse(value); } catch(_) {}
        window.toggleBan(btn.getAttribute('data-target') || '', value, btn.getAttribute('data-action') || 'ban');
    });

    window.toggleBan = function(target, value, action) {
        let msg = '';
        if(target === 'identity') {
            msg = action==='ban' ? '【警告】确定全网封杀此人？\n系统将自动追溯并拉黑其名下所有的历史设备。' : '确定解除对该身份的封杀？\n系统将自动恢复其名下所有设备的访问权限。';
        } else {
            msg = action==='ban' ? '确定封禁？' : '确定解封？';
        }

        if(!confirm(msg)) return;

        const formData = new FormData();
        formData.append('ajax_ban_action', '1');
        formData.append('target', target);
        formData.append('value', value);
        formData.append('action', action);
        formData.append('_csrf', '<?=csrf_token()?>');

        fetch('<?=url('admin/comments')?>', { method:'POST', body: formData, headers: {'X-Requested-With':'XMLHttpRequest', 'Accept':'application/json'} })
            .then(async r => { const t = await r.text(); try { return JSON.parse(t); } catch(e) { throw new Error(t || '请求失败'); } })
            .then(res => { alert(res.msg || (res.ok ? '操作完成' : '操作失败')); if(res.ok) closeModal(); })
            .catch(err => alert('请求失败：' + String((err && err.message) || err || '未知错误')));
    };

    window.openCommentSecurityProfile = function(commentId) {
        if (!commentId) return;
        modalBody.innerHTML = `<div style="text-align:center; padding:40px; color:var(--color-text-3);"><i class="ri-radar-line" style="font-size:24px; animation:spin 1s linear infinite; display:inline-block;"></i><div style="margin-top:10px;">身份矩阵扫描中...</div></div><style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>`;
        modal.classList.add('is-active');
        fetch('<?=url('admin/comments?ajax_detail=1&id=')?>' + encodeURIComponent(String(commentId)), { headers: {'X-Requested-With':'XMLHttpRequest','Accept':'application/json'} })
            .then(async res => { const txt = await res.text(); try { return JSON.parse(txt); } catch(e) { throw new Error(txt || '读取失败'); } })
            .then(res => {
                if(!res.ok) throw new Error(res.msg || '读取失败');
                modalBody.innerHTML = res.html || '<div style="color:var(--color-text-3);padding:20px;text-align:center;">暂无画像数据</div>';
            })
            .catch(err => { modalBody.innerHTML = `<div style="color:var(--color-danger); padding:20px; text-align:center;">读取失败: ${escapeHtml((err && err.message) || '未知错误')}</div>`; });
    };

    document.addEventListener('click', function(e) {
        const detailBtn = e.target.closest('.js-view-detail');
        if (detailBtn) {
            e.preventDefault();
            window.openCommentSecurityProfile(detailBtn.getAttribute('data-id') || '');
        }
    });
});
</script>
<?php $content = ob_get_clean(); require __DIR__ . '/layout.php'; ?>
