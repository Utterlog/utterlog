<?php
/**
 * LiMhy - 后台入口与状态概览
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    控制台核心加载点及系统全局内容统计
 */
require_once __DIR__ . '/../index.php';

$p = prefix();
$currentNav = 'dashboard';
$pageTitle = '仪表盘';

// 1. 内容数据库聚合
$stats = [];
$stats['posts']      = (int)db_value("SELECT COUNT(*) FROM `{$p}posts` WHERE `type`='post'");
$stats['published']  = (int)db_value("SELECT COUNT(*) FROM `{$p}posts` WHERE `type`='post' AND `status`='published'");
$stats['drafts']     = (int)db_value("SELECT COUNT(*) FROM `{$p}posts` WHERE `type`='post' AND `status`='draft'");
$stats['pages']      = (int)db_value("SELECT COUNT(*) FROM `{$p}posts` WHERE `type`='page'");
$stats['comments']   = (int)db_value("SELECT COUNT(*) FROM `{$p}comments` WHERE `status`='approved'");
$stats['pending']    = (int)db_value("SELECT COUNT(*) FROM `{$p}comments` WHERE `status`='pending'");
$stats['links']      = (int)db_value("SELECT COUNT(*) FROM `{$p}links`");

$recentPosts = db_rows("SELECT `id`, `title`, `status` FROM `{$p}posts` WHERE `type` = 'post' ORDER BY `created_at` DESC LIMIT 5");

$recentComments = db_rows("
    SELECT c.`id`, c.`author`, c.`mail`, c.`content`, c.`status`, c.`created_at`,
           p.`title` AS post_title, p.`slug` AS post_slug
    FROM `{$p}comments` c
    LEFT JOIN `{$p}posts` p ON p.`id` = c.`post_id`
    ORDER BY c.`created_at` DESC
    LIMIT 5
");

// 2. 状态映射字典
$statusMap = [
    'published' => '已发布', 'draft' => '草稿', 'private' => '私密',
    'approved' => '通过', 'pending' => '待审', 'spam' => '垃圾'
];

ob_start();
?>

<div class="stats-grid">
    <div class="stat-card">
        <div class="stat-icon-box" style="background:#E8F3FF; color:#165DFF;"><i class="ri-article-line"></i></div>
        <div class="stat-info"><h4 class="admin-stat__label">文章总数</h4><h3 class="admin-stat__value"><?=$stats['posts']?></h3></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon-box" style="background:#E8FFEA; color:#00B42A;"><i class="ri-check-double-line"></i></div>
        <div class="stat-info"><h4 class="admin-stat__label">已发布</h4><h3 class="admin-stat__value"><?=$stats['published']?></h3></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon-box" style="background:#FFF7E8; color:#FF7D00;"><i class="ri-message-3-line"></i></div>
        <div class="stat-info"><h4 class="admin-stat__label">评论总数</h4><h3 class="admin-stat__value"><?=$stats['comments']?></h3></div>
    </div>
    <div class="stat-card">
        <div class="stat-icon-box" style="background:#F2F3F5; color:#86909C;"><i class="ri-draft-line"></i></div>
        <div class="stat-info"><h4 class="admin-stat__label">草稿箱</h4><h3 class="admin-stat__value"><?=$stats['drafts']?></h3></div>
    </div>
</div>

<div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(350px, 1fr)); gap:16px;">
    <div class="card">
        <div class="card-header">
            <div class="card-title">最近文章</div>
            <a href="<?=url('admin/posts')?>" style="font-size:12px;color:var(--color-text-3)">全部 <i class="ri-arrow-right-s-line"></i></a>
        </div>
        <table class="table">
            <tbody>
            <?php foreach($recentPosts as $p): ?>
                <tr>
                    <td style="padding:12px 0; border-bottom:1px solid var(--color-border);">
                        <a href="<?=url("admin/posts?action=edit&id={$p['id']}")?>" style="font-weight:500; color:var(--color-text-1);">
                            <?=e($p['title'])?>
                        </a>
                    </td>
                    <td style="padding:12px 0; border-bottom:1px solid var(--color-border); text-align:right;">
                        <span class="badge badge-<?=e($p['status'])?>">
                            <?=$statusMap[$p['status']] ?? $p['status']?>
                        </span>
                    </td>
                </tr>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <div class="card">
        <div class="card-header">
            <div class="card-title">最近评论</div>
            <a href="<?=url('admin/comments')?>" style="font-size:12px;color:var(--color-text-3)">全部 <i class="ri-arrow-right-s-line"></i></a>
        </div>
        <div style="display:flex; flex-direction:column; gap:16px;">
            <?php foreach($recentComments as $c): 
                $hash = md5(strtolower(trim($c['mail'])));
                $avatar = "https://cravatar.cn/avatar/{$hash}?s=64&d=mm";
            ?>
            <div style="display:flex; gap:12px; align-items:flex-start;">
                <img src="<?=e($avatar)?>" style="width:36px; height:36px; border-radius:50%; flex-shrink:0; border:1px solid var(--color-border);">
                <div style="flex:1; min-width:0;">
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <div style="font-size:14px; font-weight:500; color:var(--color-text-1)"><?=e($c['author'])?></div>
                        <span class="badge badge-<?=e($c['status'])?>" style="transform:scale(0.85); transform-origin:right center;">
                            <?=$statusMap[$c['status']] ?? $c['status']?>
                        </span>
                    </div>
                    <div style="font-size:12px; color:var(--color-text-3); margin-top:4px; line-height:1.4; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        <?=e($c['content'])?>
                    </div>
                </div>
            </div>
            <?php endforeach; ?>
        </div>
    </div>
</div>

<div class="card" style="margin-top:16px;">
    <div class="card-header"><div class="card-title">系统信息</div></div>
    <div style="font-size:13px; color:var(--color-text-2); display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); gap:20px;">
        <div>PHP 版本: <span style="color:var(--color-text-1); font-weight:600"><?=PHP_VERSION?></span></div>
        <div>服务器: <span style="color:var(--color-text-1); font-weight:600"><?=$_SERVER['SERVER_SOFTWARE']??'-'?></span></div>
        <div>数据库: <span style="color:var(--color-text-1); font-weight:600"><?=db_value("SELECT VERSION()")?></span></div>
        <div>待审评论: <span style="color:var(--color-warning); font-weight:600"><?=$stats['pending']?></span></div>
    </div>
</div>

<?php
$content = ob_get_clean();
require __DIR__ . '/layout.php';
