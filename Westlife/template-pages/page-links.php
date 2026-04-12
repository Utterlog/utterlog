<?php

/**
 * Template Name: 友情链接
 * Description: 友情链接页面模板
 */

if (!defined('ABSPATH')) exit;

get_header();
echo '<main id="primary" class="site-main"><div class="container">';

// 在模板内按需加载页面样式与脚本（避免全局加载）
$__uri = get_template_directory_uri();
$__ver = wp_get_theme()->get('Version');
if (!(function_exists('westlife_has_app_bundle') && westlife_has_app_bundle()) && !wp_style_is('westlife-links', 'enqueued')) {
    wp_enqueue_style('westlife-links', $__uri . '/assets/css/pages/page-links.css', ['westlife-page'], $__ver);
}
if (!(function_exists('westlife_has_app_bundle') && westlife_has_app_bundle()) && !wp_script_is('westlife-links', 'enqueued')) {
    wp_enqueue_script('westlife-links', $__uri . '/assets/js/pages/page-links.js', ['jquery', 'westlife-utils'], $__ver, true);
}

// 获取友链检测器实例
$link_checker = new WestlifeLinkChecker();
$cached_results = $link_checker->get_cache(); // 修改为正确的方法名

// 获取站点基本信息
$site_name = get_bloginfo('name');
$site_description = get_bloginfo('description');
$site_url = home_url();

// 获取作者头像 - 优先使用主题设置中的作者头像
$author_avatar = get_option('author_avatar', '');
if (empty($author_avatar)) {
    // 如果没有设置作者头像，则使用站点图标或默认头像
    $site_logo = get_site_icon_url(512) ?: (get_template_directory_uri() . '/assets/img/default-avatar.png');
} else {
    $site_logo = $author_avatar;
}

$site_rss = get_bloginfo('rss2_url');

// 获取友情链接 - 页面显示只显示可见的
$links = get_bookmarks(array(
    'orderby' => 'name',
    'order' => 'ASC',
    'hide_invisible' => 1
));

// 但检测状态会包含所有分类的友链
$all_links_for_status = get_bookmarks(array(
    'orderby' => 'name',
    'order' => 'ASC',
    'hide_invisible' => 0
));

// 获取所有友链URL用于随机访问（只包含可见的）
$all_urls = array_map(function ($link) {
    return $link->link_url;
}, $links);

// 按分类分组友链
$grouped_links = array();
foreach ($links as $link) {
    $categories = wp_get_object_terms($link->link_id, 'link_category');

    if (empty($categories) || is_wp_error($categories)) {
        $category_name = '未分类';
    } else {
        $category_name = $categories[0]->name;
    }

    if (!isset($grouped_links[$category_name])) {
        $grouped_links[$category_name] = array();
    }

    $grouped_links[$category_name][] = $link;
}

/**
 * 渲染友链卡片 - 简化版本
 */
function render_link_card($link, $cached_results)
{
    $url = esc_url($link->link_url);
    $name = esc_html($link->link_name);
    $desc = esc_html($link->link_description ?: '这个人很懒，什么都没有留下');

    // 获取头像
    $avatar_url = '';
    if (!empty($link->link_image)) {
        $avatar_url = esc_url($link->link_image);
    } else {
        $avatar_url = function_exists('westlife_get_favicon_url') ? westlife_get_favicon_url($url) : '';
    }

    // 检查是否有RSS
    $rss_url = $link->link_rss;
    $has_rss = !empty($rss_url);

    // 获取评分
    $rating_raw = get_option('link_rating_' . $link->link_id, 0);
    if (empty($rating_raw)) {
        $rating_raw = intval($link->link_rating ?? 0);
    }
    $rating_raw = max(0, min(10, intval($rating_raw)));
    $star_count = ceil($rating_raw / 2);
    $star_count = max(0, min(5, $star_count));

    // 检查链接状态 - 只用于显示不可访问状态
    $is_unavailable = false;
    if (!empty($cached_results['results'][$url])) {
        $link_status = $cached_results['results'][$url];
        $is_unavailable = !$link_status['status'];
    }

    $card_classes = array('link-card');
    if ($has_rss) $card_classes[] = 'has-rss';
    if ($is_unavailable) $card_classes[] = 'is-unavailable';

?>
    <article class="<?php echo implode(' ', $card_classes); ?>" data-url="<?php echo esc_attr($url); ?>">
        <!-- 简单RSS图标 - 无悬浮提示 -->
        <?php if ($has_rss): ?>
            <div class="link-rss-icon">
                <i class="fa-solid fa-rss"></i>
            </div>
        <?php endif; ?>

        <div class="link-card-header">
            <?php if ($avatar_url): ?>
                <img
                    src="<?php echo esc_url($avatar_url); ?>"
                    alt="<?php echo esc_attr($name); ?>"
                    class="link-avatar"
                    onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
                <div class="avatar-fallback u-hidden"><!-- migrated: inline display:none -> u-hidden -->
                    <?php echo strtoupper(mb_substr($name, 0, 1)); ?>
                </div>
            <?php else: ?>
                <div class="avatar-fallback">
                    <?php echo strtoupper(mb_substr($name, 0, 1)); ?>
                </div>
            <?php endif; ?>

            <div class="link-info">
                <div class="link-name">
                    <a href="<?php echo $url; ?>" target="_blank" rel="noopener">
                        <?php echo $name; ?>
                    </a>

                    <?php if ($star_count > 0): ?>
                        <div class="link-rating" title="站点评分: <?php echo $rating_raw; ?>/10分 (<?php echo $star_count; ?>星)">
                            <?php for ($i = 1; $i <= 5; $i++): ?>
                                <i class="fa-solid fa-star star<?php echo $i > $star_count ? ' empty' : ''; ?>"></i>
                            <?php endfor; ?>
                        </div>
                    <?php endif; ?>
                </div>
                <div class="link-desc"><?php echo $desc; ?></div>
            </div>
        </div>
    </article>
<?php
}
?>

<div class="links-page">
    <!-- Hero 区域 -->
    <section class="links-hero hero-bg-animated">
        <div class="hero-grid">
            <!-- 标题：Row1 Col5-6 居中（跨两列） -->
            <div class="hero-cell hero-title" aria-label="页面标题">
                <h1 class="page-title"><i class="fas fa-link"></i> 友情链接</h1>
            </div>

            <!-- 站点信息卡：示例放在 Row1-3 Col1-4 （可根据需要调整） -->
            <div class="hero-cell hero-site-card">
                <div class="site-card">
                    <div class="site-card-header">
                        <img src="<?php echo esc_url($site_logo); ?>" alt="<?php echo esc_attr($site_name); ?>" class="site-avatar">
                        <div class="site-meta">
                            <div class="site-name"><?php echo esc_html($site_name); ?></div>
                            <div class="site-slogan"><?php echo esc_html($site_description); ?></div>
                        </div>
                    </div>
                    <div class="site-info-codeblock">
                        <div class="ic-row"><span class="k">名称</span><span class="v"><span class="code-inline"><?php echo esc_html($site_name); ?></span></span><button class="copy-btn" data-copy="<?php echo esc_attr($site_name); ?>" title="复制站点名称"><i class="fa-regular fa-copy"></i></button></div>
                        <div class="ic-row"><span class="k">描述</span><span class="v"><span class="code-inline"><?php echo esc_html($site_description); ?></span></span><button class="copy-btn" data-copy="<?php echo esc_attr($site_description); ?>" title="复制站点描述"><i class="fa-regular fa-copy"></i></button></div>
                        <div class="ic-row"><span class="k">网址</span><span class="v"><span class="code-inline"><?php echo esc_html($site_url); ?></span></span><button class="copy-btn" data-copy="<?php echo esc_attr($site_url); ?>" title="复制站点链接"><i class="fa-regular fa-copy"></i></button></div>
                        <div class="ic-row"><span class="k">头像</span><span class="v"><span class="code-inline"><?php echo esc_html($site_logo); ?></span></span><button class="copy-btn" data-copy="<?php echo esc_attr($site_logo); ?>" title="复制头像链接"><i class="fa-regular fa-copy"></i></button></div>
                        <div class="ic-row"><span class="k">RSS</span><span class="v"><span class="code-inline"><?php echo esc_html($site_rss); ?></span></span><button class="copy-btn" data-copy="<?php echo esc_attr($site_rss); ?>" title="复制RSS链接"><i class="fa-regular fa-copy"></i></button></div>
                    </div>
                </div>
            </div>

            <!-- 三个按钮：直接作为独立圆形元素（去除矩形/容器背景） -->
            <div class="hero-cell hero-actions-grid" aria-label="操作按钮">
                <button id="recheckAllLinks" class="capsule-btn capsule-btn--recheck" title="实时检测所有友链状态">
                    <i class="fa-solid fa-rotate-right"></i>
                    <div class="loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
                </button>
                <button id="randomVisitBtn" class="capsule-btn capsule-btn--random" title="随机访问友链">
                    <i class="fa-solid fa-shuffle"></i>
                    <div class="loading-dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
                </button>
                <button id="applyLinkBtn" class="capsule-btn capsule-btn--apply" title="申请友情链接">
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>
            <!-- Hero 内介绍文本：占位 7/8/9/10/13/14/15/16 (即 行2-3 列1-4) -->
            <div class="hero-cell hero-intro" aria-label="友链说明">
                <div class="hero-intro-inner">
                    <p class="lead">🌱 在这里，你会遇见一群依然坚持写独立博客的朋友。他们用文字记录生活、分享旅行、交流技术、表达思考。链接的不只是网页，更是时间、心意与陪伴。</p>
                    <ul class="points">
                        <li><strong>原创内容</strong> 独立域名 / HTTPS / 稳定更新 / 主题相关</li>
                        <li><strong>互相访问</strong> 我会常去看看，也会主动加优秀站点</li>
                        <li><strong>真诚互动</strong> 留言、往来、彼此见证持续创作</li>
                    </ul>
                    <p class="closing">如果你也愿意一起坚持，欢迎申请友链；也许不久后，你已经在列表中了。✨</p>
                </div>
            </div>
        </div>
    </section>

    <!-- 友链列表区域 -->
    <section class="links-section">
        <div class="links-container">
            <!-- 状态显示区域 -->
            <div class="links-status-area">
                <div id="linkStatus" class="link-status">
                    <i class="fa-solid fa-info-circle"></i> 正在加载友链状态...
                </div>
            </div>

            <!-- 友链卡片网格 -->
            <div class="links-cards">
                <?php if (!empty($grouped_links)): ?>
                    <?php foreach ($grouped_links as $category => $category_links): ?>
                        <div class="group-title">
                            <i class="fa-solid fa-folder"></i>
                            <?php echo esc_html($category); ?>
                            <span class="count">(<?php echo count($category_links); ?>)</span>
                        </div>

                        <?php foreach ($category_links as $link): ?>
                            <?php
                            // 渲染友链卡片 - 简化版本
                            render_link_card($link, $cached_results);
                            ?>
                        <?php endforeach; ?>
                    <?php endforeach; ?>
                <?php else: ?>
                    <div class="no-links">
                        <i class="fa-solid fa-link-slash"></i>
                        <p>暂无友情链接</p>
                        <p>成为第一个朋友吧！</p>
                    </div>
                <?php endif; ?>
            </div>

        </div>
    </section>
    <!-- 申请友链弹窗 (移入 .links-page 内以适配作用域样式) -->
    <div id="linkModal" class="modal" aria-hidden="true">
        <div class="modal-backdrop"></div>
        <div class="modal-content">
            <div class="modal-header">
                <h3>申请友情链接 <span class="modal-esc-hint" title="按 ESC 关闭">ESC</span></h3>
                <button class="modal-close" aria-label="关闭弹窗">
                    <i class="fa-solid fa-times"></i>
                </button>
            </div>

            <div class="modal-body">
                <form id="linkForm">
                    <div class="form-group">
                        <label class="form-label" for="siteName">
                            站点名称 <span class="required">*</span>
                        </label>
                        <input
                            type="text"
                            id="siteName"
                            name="name"
                            class="form-input"
                            required
                            placeholder="请输入您的站点名称">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="siteUrl">
                            站点链接 <span class="required">*</span>
                        </label>
                        <input
                            type="url"
                            id="siteUrl"
                            name="url"
                            class="form-input"
                            required
                            placeholder="https://example.com">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="siteAvatar">
                            站点头像
                        </label>
                        <input
                            type="url"
                            id="siteAvatar"
                            name="avatar"
                            class="form-input"
                            placeholder="头像图片链接（可选）">
                        <div class="form-helper">建议尺寸：200x200px，支持 jpg、png、webp 格式</div>
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="siteRss">
                            RSS 订阅
                        </label>
                        <input
                            type="url"
                            id="siteRss"
                            name="rss"
                            class="form-input"
                            placeholder="RSS/Feed 链接（可选）">
                    </div>

                    <div class="form-group">
                        <label class="form-label" for="siteDesc">
                            站点描述 <span class="required">*</span>
                        </label>
                        <textarea
                            id="siteDesc"
                            name="desc"
                            class="form-textarea"
                            required
                            placeholder="简单介绍一下您的站点"
                            maxlength="100"></textarea>
                        <div class="char-counter" data-for="siteDesc">0 / 100</div>
                        <div class="form-helper">简短介绍您的站点内容，不超过100字</div>
                    </div>

                    <div class="form-group">
                        <div class="form-checkbox">
                            <input
                                type="checkbox"
                                id="linkAdded"
                                name="link_added"
                                value="on"
                                required>
                            <label for="linkAdded">
                                我已经在我的网站添加了贵站友链 <span class="required">*</span>
                                <div class="form-helper" style="margin-top: 4px;">
                                    请确保已将本站（<?php echo esc_html(get_bloginfo('name')); ?>）添加到您的友链页面后再提交申请
                                </div>
                            </label>
                        </div>
                    </div>
                </form>
            </div>

            <div class="modal-footer">
                <button type="button" class="modal-cancel">取消</button>
                <button type="submit" form="linkForm" class="modal-submit" disabled>提交申请</button>
            </div>
        </div>
    </div>

    <!-- 将数据通过data属性传递给JavaScript -->
    <div id="westlife-settings"
        data-ajax-url="<?php echo esc_url(admin_url('admin-ajax.php')); ?>"
        data-nonce="<?php echo esc_attr(wp_create_nonce('westlife_ajax_nonce')); ?>"
        data-all-urls="<?php echo esc_attr(json_encode($all_urls, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP)); ?>"
        data-cached-results="<?php echo esc_attr(!empty($cached_results['results']) ? json_encode($cached_results, JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) : ''); ?>"
        class="u-hidden"><!-- migrated: inline display:none -> u-hidden -->
    </div>

    <!-- 内容底部检测说明（移动到内容末尾而不是页面外部） -->
    <div class="link-checker-notice is-minimal">
        <div class="notice-content">
            本功能仅通过 HEAD 请求检测友链网站的可访问性，用于维护友链质量，不会对您的网站造成任何访问压力或安全风险。
        </div>
        <div id="lastCheckTime" class="link-last-check u-hidden"></div>
    </div>

</div>

<?php echo '</div></main>';
get_footer();
