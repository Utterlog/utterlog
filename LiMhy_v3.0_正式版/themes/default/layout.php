<?php declare(strict_types=1);
/**
 * LiMhy - 全局前台主布局
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    承载全局 Header/Footer，处理 SEO Meta 及防 F12 雷达加载
 */

$flash = get_flash();
if (!isset($pageTitle) && isset($title)) { $pageTitle = $title; }
$displayTitle = $pageTitle ?? '首页';
if ($displayTitle === SITE_NAME) { $metaTitle = e(SITE_NAME); } else { $metaTitle = e($displayTitle) . ' - ' . e(SITE_NAME); }

$metaDesc = defined('SITE_DESC') ? SITE_DESC : '';
$metaKeywords = defined('SITE_KEYWORDS') ? SITE_KEYWORDS : '';
$defaultAvatar = "https://ui-avatars.com/api/?name=" . urlencode(SITE_NAME) . "&background=random&size=96";
$siteLogo = (defined('SITE_LOGO') && SITE_LOGO !== '') ? SITE_LOGO : $defaultAvatar;
$siteLogoDark = (defined('SITE_LOGO_DARK') && SITE_LOGO_DARK !== '') ? SITE_LOGO_DARK : $siteLogo;
$siteFavicon = (defined('SITE_FAVICON') && SITE_FAVICON !== '') ? SITE_FAVICON : $siteLogo;
$metaImage = normalize_public_image_url((string)$siteLogo) ?: url('assets/img/logo.png');
$ogType = 'website';
$currentUrl = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS']==='on' ? 'https' : 'http') . '://' . $_SERVER['HTTP_HOST'] . $_SERVER['REQUEST_URI'];

if (isset($post) && !empty($post['title'])) {
    $ogType = 'article';
    if (!empty($post['content'])) { $metaDesc = make_excerpt($post['content'], 120); } elseif (!empty($post['content_html'])) { $metaDesc = make_excerpt($post['content_html'], 120); }
    if (isset($tags) && !empty($tags)) { $tagNames = array_column($tags, 'name'); $articleKeywords = implode(',', $tagNames); $metaKeywords = $metaKeywords ? ($articleKeywords . ',' . $metaKeywords) : $articleKeywords; }
    if (!empty($post['content_html'])) { $img = get_post_cover_for_post($post); if ($img && !str_contains($img, 'ui-avatars')) { $metaImage = $img; } }
}

$logoStyleClass = (defined('SITE_LOGO_STYLE') && SITE_LOGO_STYLE == 1) ? 'is-wide' : '';
?>
<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title><?= $metaTitle ?></title>

<script>
(function() {
    var root = document.documentElement;
    var theme = localStorage.getItem('limhy_theme');
    var useDark = theme === 'dark' || (!theme && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.classList.add('theme-preload');
    if (useDark) {
        root.setAttribute('data-theme', 'dark');
    }
    window.addEventListener('DOMContentLoaded', function() {
        requestAnimationFrame(function() {
            root.classList.remove('theme-preload');
        });
    }, { once: true });
})();
</script>

<link rel="icon" href="<?= e($siteFavicon) ?>">
<link rel="dns-prefetch" href="https://i.46vip.top">
<link rel="preconnect" href="https://i.46vip.top" crossorigin>
<link rel="dns-prefetch" href="https://ui-avatars.com">
<link rel="preconnect" href="https://ui-avatars.com" crossorigin>

<meta name="description" content="<?= e($metaDesc) ?>">
<meta name="keywords" content="<?= e($metaKeywords) ?>">
<meta itemprop="image" content="<?= e($metaImage) ?>" />
<meta property="og:type" content="<?= e($ogType) ?>">
<meta property="og:title" content="<?= $metaTitle ?>">
<meta property="og:description" content="<?= e($metaDesc) ?>">
<meta property="og:image" content="<?= e($metaImage) ?>">
<meta property="og:image:secure_url" content="<?= e($metaImage) ?>">
<meta name="twitter:image" content="<?= e($metaImage) ?>">
<meta property="og:url" content="<?= e($currentUrl) ?>">
<meta name="twitter:card" content="summary_large_image">

<link rel="stylesheet" href="<?= theme_asset('style.css') ?>">

<?php if (defined('SITE_FONT') && SITE_FONT !== ''): ?>
<style>
    @font-face { font-family: 'LiMhyCustom'; src: url('<?= url(SITE_FONT) ?>'); font-display: swap; }
    :root { --font-base: 'LiMhyCustom', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important; }
</style>
<?php endif; ?>

<link rel="alternate" type="application/rss+xml" title="<?=e(SITE_NAME)?> RSS Feed" href="<?= url('feed') ?>">
<?php $customHeadCode = limhy_site_setting('CUSTOM_HEAD_CODE', defined('CUSTOM_HEAD_CODE') ? CUSTOM_HEAD_CODE : ''); ?>
<?php if (trim((string)$customHeadCode) !== ''): ?>
<?= trim((string)$customHeadCode) ?>
<?php endif; ?>
</head><body class="limhy-body"><div style="display:none; overflow:hidden; width:0; height:0;"><img src="<?= e($metaImage) ?>" alt="SEO Cover"></div><header class="site-header">
    <div class="container site-header__top">
        <a href="<?= url() ?>" class="site-logo <?= $logoStyleClass ?> site-logo--header">
            <img src="<?= e($siteLogo) ?>" alt="Logo" class="site-logo__img site-logo__img--light">
            <img src="<?= e($siteLogoDark) ?>" alt="Logo" class="site-logo__img site-logo__img--dark">
            <?php if(defined('SITE_LOGO_STYLE') && SITE_LOGO_STYLE == 1): else: ?>
            <span><?= e(SITE_NAME) ?></span>
            <?php endif; ?>
        </a>
        <div class="site-header__actions">
            <button type="button" class="site-action-btn site-action-btn--search" id="js-search-toggle" aria-label="展开搜索">
                <img src="<?= asset('img/ss.svg') ?>" alt="搜索">
            </button>
            <form action="<?= url('search') ?>" method="GET" class="site-search" id="js-site-search" role="search">
                <label class="sr-only" for="site-search-input">搜索文章</label>
                <input id="site-search-input" type="search" name="q" class="site-search__input" value="<?= e((string)($_GET['q'] ?? '')) ?>" placeholder="搜索文章关键词" minlength="2" enterkeyhint="search" autocomplete="off">
                <button type="submit" class="site-search__submit" aria-label="提交搜索"><img src="<?= asset('img/ss.svg') ?>" alt=""></button>
            </form>
            <a href="<?= url(is_admin() ? 'admin/login' : 'admin/login') ?>" class="site-action-btn" aria-label="后台登录入口"><img src="<?= asset('img/dl.svg') ?>" alt=""></a>
        </div>
    </div>
    <div class="site-nav-row">
        <div class="container site-nav-row__inner">
            <nav class="site-nav" id="js-nav">
                <a href="<?= url() ?>" class="nav-link">首页</a>
                <a href="<?= url('moments') ?>" class="nav-link">动态</a>
                <a href="<?= url('links') ?>" class="nav-link">友链</a>
                <a href="<?= url('album') ?>" class="nav-link">相册</a>
                <a href="<?= url('archive') ?>" class="nav-link">归档</a>
                <a href="<?= url('music') ?>" class="nav-link">音乐</a>
                <a href="<?= url('page/about') ?>" class="nav-link">关于</a>
            </nav>
        </div>
    </div>
</header>

<main class="site-main">
    <?= $content ?>
</main>

<footer class="site-footer">
    <div class="container footer-inner">
        <?php if((defined('SITE_BEIAN_GB') && SITE_BEIAN_GB !== '') || (defined('SITE_BEIAN_ICP') && SITE_BEIAN_ICP !== '')): ?>
        <div class="footer-beian">
            <?php if(defined('SITE_BEIAN_GB') && SITE_BEIAN_GB !== ''): ?>
            <a href="https://www.beian.gov.cn/portal/registerSystemInfo?recordcode=<?=preg_replace('/\D/','',SITE_BEIAN_GB)?>" target="_blank" rel="nofollow" class="beian-link">
                <img src="<?= asset('img/gb.png') ?>" alt="公网安备" class="beian-icon" onerror="this.style.display='none'" loading="lazy" decoding="async"> <?= e(SITE_BEIAN_GB) ?>
            </a>
            <?php endif; ?>
            
            <?php if(defined('SITE_BEIAN_ICP') && SITE_BEIAN_ICP !== ''): ?>
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="nofollow" class="beian-link">
                <img src="<?= asset('img/icp.png') ?>" alt="ICP备案" class="beian-icon" onerror="this.style.display='none'" loading="lazy" decoding="async"> <?= e(SITE_BEIAN_ICP) ?>
            </a>
            <?php endif; ?>
        </div>
        <?php endif; ?>

        <div class="footer-primary">
            <div class="footer-info-group">
                <span class="footer-defense" title="安全防御系统已激活">LiMhy Defense <span class="footer-ver">v3.0</span></span>
                <span class="footer-online-badge" title="当前在线访客实时统计"><span class="online-dot"></span> <?= get_online_count() ?> 人在线</span>
                <a href="<?= url('town') ?>" class="footer-town-badge" title="前往博客小镇"><img src="<?= asset('img/bkxz.svg') ?>" alt="博客小镇" loading="lazy" decoding="async"></a>
                <a href="<?= url('logs') ?>" class="footer-town-badge" title="更新日志与反馈" style="font-weight: 800; color: inherit;">日志与反馈</a>
                <a href="<?= url('sponsor') ?>" class="footer-town-badge" title="赞赏与支持" style="font-weight: 800; color: inherit;">赞赏</a>
            </div>
            <a href="<?=url('feed')?>" target="_blank" class="footer-rss-icon" aria-label="RSS 订阅">
                <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M6.18 15.64a2.18 2.18 0 0 1 2.18 2.18C8.36 19 7.38 20 6.18 20C5 20 4 19 4 17.82a2.18 2.18 0 0 1 2.18-2.18M4 4.44A15.56 15.56 0 0 1 19.56 20h-2.83A12.73 12.73 0 0 0 4 7.27V4.44m0 5.66a9.9 9.9 0 0 1 9.9 9.9h-2.83A7.07 7.07 0 0 0 4 12.93V10.1z"/></svg>
            </a>
        </div>
        <div class="footer-secondary">
            <div class="footer-copyright">
                &copy; <?= date('Y') ?> Original Theme by <span class="signature-wrap" title="Jason"><img src="<?= asset('img/Jason.png') ?>" alt="Jason" class="signature-img" loading="lazy" decoding="async"></span> All Rights Reserved.
                <a href="javascript:void(0);" class="footer-no-f12" title="访问审计已激活"><img src="<?= asset('img/j12.png') ?>" alt="No F12 Protocol" loading="lazy" decoding="async"></a>
            </div>
            <nav class="footer-links">
                <a href="<?=url('legal/user')?>" class="footer-legal-link">用户协议</a>
                <a href="<?=url('legal/privacy')?>" class="footer-legal-link">隐私政策</a>
                <a href="<?=url('legal/copyright')?>" class="footer-legal-link">原创声明</a>
            </nav>
        </div>
    </div>
</footer>

<div class="sketch-fab-group">
    <button class="sketch-fab-btn" id="js-theme-toggle" aria-label="切换黑夜模式">
        <svg id="icon-moon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" style="display:block;"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>
        <svg id="icon-sun" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" style="display:none;"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>
    </button>
    <button class="sketch-fab-btn" id="js-back-top" aria-label="返回顶部">
        <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="19" x2="12" y2="5"></line><polyline points="5 12 12 5 19 12"></polyline></svg>
    </button>
</div>

<script src="<?= theme_asset('app.js') ?>"></script>
<script>
document.addEventListener('DOMContentLoaded', function() {
    const btnTheme = document.getElementById('js-theme-toggle');
    const btnTop = document.getElementById('js-back-top');
    const htmlEl = document.documentElement;

    btnTheme.addEventListener('click', function() {
        htmlEl.classList.add('theme-switching');
        if (htmlEl.getAttribute('data-theme') === 'dark') {
            htmlEl.removeAttribute('data-theme');
            localStorage.setItem('limhy_theme', 'light');
        } else {
            htmlEl.setAttribute('data-theme', 'dark');
            localStorage.setItem('limhy_theme', 'dark');
        }
        window.setTimeout(function() {
            htmlEl.classList.remove('theme-switching');
        }, 320);
    });

    window.addEventListener('scroll', function() {
        if (window.scrollY > 300) { btnTop.classList.add('is-visible'); } 
        else { btnTop.classList.remove('is-visible'); }
    });

    btnTop.addEventListener('click', function() {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    const f12Btn = document.querySelector('.footer-no-f12');
    if (f12Btn) {
        const newBtn = f12Btn.cloneNode(true);
        f12Btn.parentNode.replaceChild(newBtn, f12Btn);
        newBtn.addEventListener('click', function(e) {
            e.preventDefault();
            let modal = document.getElementById('js-f12-modal-box');
            if (!modal) {
                modal = document.createElement('div');
                modal.id = 'js-f12-modal-box'; modal.className = 'f12-warning-modal'; document.body.appendChild(modal);
                fetch('<?=url("api/component/f12-warning")?>', { headers: {'X-Requested-With': 'XMLHttpRequest'} })
                .then(r => r.text()).then(html => {
                    modal.innerHTML = html; setTimeout(() => modal.classList.add('is-active'), 10);
                    modal.querySelector('.f12-warning-close').addEventListener('click', () => modal.classList.remove('is-active'));
                });
            } else { modal.classList.add('is-active'); }
        });
    }
});
</script>
</body>
</html>
