<?php
/**
 * LiMhy - 后台全局布局容器
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    承载后台的侧边栏导航、顶栏配置与内容路由插槽
 */
require_admin();
$flash = get_flash();
$currentNav = $currentNav ?? '';
$p = prefix();

$userRow = db_row("SELECT * FROM `{$p}users` WHERE `role` = 'admin' LIMIT 1");
$currentUser = defined('ADMIN_USER') ? ADMIN_USER : 'Admin';
$userMail = $userRow['mail'] ?? 'admin@example.com';
$userScreenName = $userRow['screen_name'] ?? $currentUser;
$avatarUrl = get_avatar_url($userMail, $userScreenName);
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover">
<title><?= e($pageTitle ?? 'Admin') ?> - <?=e(SITE_NAME)?></title>
<link href="https://cdn.bootcdn.net/ajax/libs/remixicon/3.5.0/remixicon.min.css" rel="stylesheet">
<script>
(function() {
    var theme = localStorage.getItem('limhy_admin_theme');
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-admin-theme', 'dark');
    }
})();
</script>
<link rel="stylesheet" href="<?= asset('admin.css') ?>">
<style>@keyframes spin { 100% { transform: rotate(360deg); } }</style>
<?= plugin_capture_action('admin_head') ?>
</head>
<body>

<div class="arco-layout">
    <div class="arco-overlay" id="js-overlay"></div>

    <aside class="arco-sider" id="js-sider">
        <div class="arco-sider-logo">
            <div class="logo-icon"><i class="ri-code-s-slash-line"></i></div>
            <span class="logo-text">LiMhy 后台管理</span>
        </div>
        
        <nav class="arco-menu">
            <div class="menu-group-title">仪表盘</div>
            <a href="<?= url('admin/dashboard') ?>" class="menu-item <?= $currentNav==='dashboard'?'active':'' ?>">
                <i class="menu-icon ri-dashboard-3-line"></i>
                <span class="menu-label">工作台</span>
            </a>
            
            <div class="menu-group-title">内容管理</div>
            <a href="<?= url('admin/posts') ?>" class="menu-item <?= $currentNav==='posts'?'active':'' ?>">
                <i class="menu-icon ri-article-line"></i>
                <span class="menu-label">文章列表</span>
            </a>
            <a href="<?= url('admin/drafts') ?>" class="menu-item <?= $currentNav==='drafts'?'active':'' ?>">
                <i class="menu-icon ri-draft-line"></i>
                <span class="menu-label">草稿箱</span>
            </a>
            
            <a href="<?= url('admin/moments') ?>" class="menu-item <?= $currentNav==='moments'?'active':'' ?>">
                <i class="menu-icon ri-camera-lens-line"></i>
                <span class="menu-label">动态管理</span>
            </a>

            <a href="<?= url('admin/posts?type=page') ?>" class="menu-item <?= $currentNav==='pages'?'active':'' ?>">
                <i class="menu-icon ri-pages-line"></i>
                <span class="menu-label">独立页面</span>
            </a>
            <a href="<?= url('admin/comments') ?>" class="menu-item <?= $currentNav==='comments'?'active':'' ?>">
                <i class="menu-icon ri-message-3-line"></i>
                <span class="menu-label">评论管理</span>
            </a>

            <div class="menu-group-title">数据与归档</div>
            <a href="<?= url('admin/categories') ?>" class="menu-item <?= $currentNav==='categories'?'active':'' ?>">
                <i class="menu-icon ri-folder-2-line"></i>
                <span class="menu-label">分类目录</span>
            </a>
            <a href="<?= url('admin/tags') ?>" class="menu-item <?= $currentNav==='tags'?'active':'' ?>">
                <i class="menu-icon ri-price-tag-3-line"></i>
                <span class="menu-label">标签云</span>
            </a>
            <a href="<?= url('admin/uploads') ?>" class="menu-item <?= $currentNav==='uploads'?'active':'' ?>">
                <i class="menu-icon ri-image-line"></i>
                <span class="menu-label">附件库</span>
            </a>
            <a href="<?= url('admin/backups') ?>" class="menu-item <?= $currentNav==='backups'?'active':'' ?>">
                <i class="menu-icon ri-hard-drive-3-line"></i>
                <span class="menu-label">备份文件</span>
            </a>

            <div class="menu-group-title">系统设置</div>
            <a href="<?= url('admin/links') ?>" class="menu-item <?= $currentNav==='links'?'active':'' ?>">
                <i class="menu-icon ri-link"></i>
                <span class="menu-label">友情链接</span>
            </a>
            <a href="<?= url('admin/themes') ?>" class="menu-item <?= $currentNav==='themes'?'active':'' ?>">
                <i class="menu-icon ri-palette-line"></i>
                <span class="menu-label">主题外观</span>
            </a>
            <a href="<?= url('admin/plugins') ?>" class="menu-item <?= $currentNav==='plugins'?'active':'' ?>">
                <i class="menu-icon ri-plug-2-line"></i>
                <span class="menu-label">插件扩展</span>
            </a>
            <a href="<?= url('admin/settings') ?>" class="menu-item <?= $currentNav==='settings'?'active':'' ?>">
                <i class="menu-icon ri-settings-3-line"></i>
                <span class="menu-label">站点设置</span>
            </a>
            <a href="<?= url('admin/system-statement') ?>" class="menu-item <?= $currentNav==='system_statement'?'active':'' ?>">
                <i class="menu-icon ri-file-text-line"></i>
                <span class="menu-label">系统声明</span>
            </a>
            
            <div class="menu-group-title">安全与审计</div>
            <a href="<?= url('admin/firewall-settings') ?>" class="menu-item <?= $currentNav==='fw_settings'?'active':'' ?>">
                <i class="menu-icon ri-macbook-line"></i>
                <span class="menu-label">防御配置</span>
            </a>
            <a href="<?= url('admin/traces') ?>" class="menu-item <?= $currentNav==='traces'?'active':'' ?>">
                <i class="menu-icon ri-bug-line"></i>
                <span class="menu-label">访问日志</span>
            </a>
            <a href="<?= url('admin/f12-probes') ?>" class="menu-item <?= $currentNav==='f12_probes'?'active':'' ?>">
                <i class="menu-icon ri-radar-line"></i>
                <span class="menu-label">F12 探针</span>
            </a>
            <a href="<?= url('admin/reputation') ?>" class="menu-item <?= $currentNav==='reputation'?'active':'' ?>">
                <i class="menu-icon ri-shield-user-line"></i>
                <span class="menu-label">信誉中心</span>
            </a>
            <a href="<?= url('admin/security-decisions') ?>" class="menu-item <?= $currentNav==='security_decisions'?'active':'' ?>">
                <i class="menu-icon ri-shield-line"></i>
                <span class="menu-label">决策中心</span>
            </a>
            <a href="<?= url('admin/security-timeline') ?>" class="menu-item <?= $currentNav==='security_timeline'?'active':'' ?>">
                <i class="menu-icon ri-history-line"></i>
                <span class="menu-label">原因时间线</span>
            </a>
            <a href="<?= url('admin/bans') ?>" class="menu-item <?= $currentNav==='bans'?'active':'' ?>">
                <i class="menu-icon ri-shield-cross-line"></i>
                <span class="menu-label">封禁黑名单</span>
            </a>
        </nav>
        
        <div class="arco-sider-footer">
            <a href="<?= url('admin/logout') ?>" class="menu-item logout">
                <i class="menu-icon ri-logout-box-r-line"></i>
                <span class="menu-label">退出登录</span>
            </a>
        </div>
    </aside>

    <section class="arco-body">
        <header class="arco-header">
            <div class="header-left">
                <button class="icon-btn trigger-btn" id="js-trigger">
                    <i class="ri-menu-2-line"></i>
                </button>
                <nav class="arco-breadcrumb">
                    <span class="breadcrumb-item">首页</span>
                    <span class="breadcrumb-separator">/</span>
                    <span class="breadcrumb-item active"><?= e($pageTitle) ?></span>
                </nav>
            </div>
            
            <div class="header-right">
                <!-- 【新增】清理静态缓存的专用按钮 -->
                <button class="icon-btn" id="js-clear-cache-btn" title="物理粉碎前台页面静态缓存">
                    <i class="ri-brush-line"></i>
                </button>

                <button class="icon-btn" id="js-admin-theme-toggle" title="切换后台黑暗模式">
                    <i class="ri-moon-clear-line"></i>
                </button>

                <a href="<?= url() ?>" target="_blank" class="icon-btn" title="访问站点">
                    <i class="ri-global-line"></i>
                </a>
                
                <div class="user-profile" title="<?=e($userScreenName)?>">
                    <img src="<?= $avatarUrl ?>" alt="Avatar">
                    <span class="username"><?= e($userScreenName) ?></span>
                </div>
            </div>
        </header>

        <main class="arco-content">
            <?php if ($flash): ?>
                <div class="arco-alert arco-alert-<?= $flash['type'] === 'error' ? 'error' : 'success' ?>">
                    <i class="<?= $flash['type'] === 'error' ? 'ri-close-circle-fill' : 'ri-checkbox-circle-fill' ?>"></i>
                    <span><?= e($flash['msg']) ?></span>
                </div>
            <?php endif; ?>

            <?php if(!isset($noPageHeader)): ?>
            <div class="page-header">
                <h1 class="page-title"><?= e($pageTitle) ?></h1>
            </div>
            <?php endif; ?>

            <?= plugin_capture_action('admin_content_before') ?>
            <?= $content ?>
        </main>
        
        <footer class="arco-footer">
            Admin System &copy; <?= date('Y') ?> Created by LiMhy
        </footer>
    </section>
</div>

<?= plugin_capture_action('admin_footer') ?>
<script src="<?= asset('admin.js') ?>"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {
    const clearBtn = document.getElementById('js-clear-cache-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', function() {
            if (!confirm('确认为全站前台页面进行物理级缓存重置吗？\n清除后前端在下次被访问时将自动重新生成静态碎片。')) return;
            const origIcon = this.innerHTML;
            this.innerHTML = '<i class="ri-loader-4-line" style="animation:spin 1s linear infinite"></i>';
            this.style.pointerEvents = 'none';
            
            const fd = new FormData();
            fd.append('ajax_clear_cache', '1');
            
            fetch('<?=url("admin/dashboard")?>', {
                method: 'POST', 
                body: fd, 
                headers: {'X-Requested-With': 'XMLHttpRequest'}
            })
            .then(r => r.json())
            .then(res => {
                alert(res.msg);
            })
            .catch(e => {
                alert('网络防线异常，缓存清除请求被阻断。');
            })
            .finally(() => {
                this.innerHTML = origIcon;
                this.style.pointerEvents = 'auto';
            });
        });
    }
});
</script>
</body>
</html>
