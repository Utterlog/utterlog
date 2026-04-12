<?php

/**
 * Template Name: 友链动态
 * Description: 通过 API 展示友链动态
 * 
 * 功能说明：
 * 1. 通过 API 获取友链 RSS 动态数据
 * 2. 展示动态列表、统计信息和缓存倒计时
 * 3. 支持管理员刷新缓存功能
 * 4. 响应式布局，支持多列切换
 * 
 * @package Westlife
 * @since 1.0.0
 */

// 安全检查：防止直接访问
if (!defined('ABSPATH')) exit;

// 加载头部
get_header();
echo '<main id="primary" class="site-main"><div class="container">';

// 获取当前页面信息
$page_id = get_queried_object_id();

// 获取横幅图片，如果没有设置特色图片则使用默认图片
$banner = get_the_post_thumbnail_url($page_id, 'full') ?:
    get_template_directory_uri() . '/static/images/feeds/hero.jpg';
?>

<!-- 主内容区开始 (移除重复 <main id="primary">) -->
<!-- 
        feeds-page: 页面主容器
        data-per-page: 每页显示数，供 JS 分页计算
    -->
<div class="feeds-page" data-per-page="12">

    <!-- ============================================
             Hero 区域：页面头部展示区
             包含：标题、介绍文字、统计卡片
             ============================================ -->
    <section class="feeds-hero hero-bg-animated">
        <!-- 装饰性背景动画容器（极光效果） -->
        <div class="aurora-container" aria-hidden="true"></div>

        <div class="hero-container">
            <div class="hero-inner">
                <!-- 左侧：页面介绍内容 -->
                <div class="hero-content">
                    <!-- 页面标题，使用 WordPress 页面标题 -->
                    <h1 class="page-title"><?php echo westlife_lucide_icon('rss'); ?> <?php the_title(); ?></h1>

                    <!-- 介绍文字区域 -->
                    <div class="hero-text">
                        <!-- 主要介绍：RSS 聚合说明 -->
                        <p class="intro-main">
                            🌱 这里汇聚了我所有友链的 RSS 更新。<br>
                            独立博客是一种坚持，也是一种记录，写下的不是流量与热点，而是每个人真实的生活与思考。
                        </p>

                        <!-- 次要介绍：独立博客的意义 -->
                        <p class="intro-sub">
                            在这个快节奏的网络世界里，独立博客就像一片片安静的花园，作者们在这里耕耘文字，留下足迹。<br>
                            我每天都会来看看谁更新了，读一读他们的故事和分享，就像翻阅朋友的日记，感受彼此的喜怒哀乐。
                        </p>

                        <!-- 详细说明1：独立博客的特点 -->
                        <p class="intro-detail">
                            这里没有算法推送，没有喧嚣的广告，只有独立博主们真诚的表达。<br>
                            或许更新频率不高，或许风格各异，但这份坚持和热爱本身，就让人觉得珍贵。
                        </p>

                        <!-- 详细说明2：邀请访客探索 -->
                        <p class="intro-detail">
                            欢迎你一同走进这些博客的世界，去发现新的朋友，新的想法，<br>
                            也许还能在不经意间，遇见与你心灵共振的文字。
                        </p>
                    </div>
                </div>

                <!-- 右侧：统计信息卡片 - 异步加载 -->
                <aside class="feeds-info-card">
                    <div class="card-header">
                        <?php echo westlife_lucide_icon('chart-column'); ?>
                        <h3>订阅统计</h3>
                    </div>
                    <div class="card-content" id="statsCardContent">
                        <div class="stats-loading">
                            <!-- Phase B: emit only prefixed structural class -->
                            <div class="wl-loading-spinner">
                                <div class="spinner-ring"></div>
                            </div>
                            <p>正在加载统计数据...</p>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    </section>

    <!-- ============================================
             动态列表区域：展示友链RSS内容
             ============================================ -->
    <section class="feeds-section">
        <div class="feeds-container">
            <!-- 操作栏：布局切换按钮将通过 JS 动态插入此处 -->
            <div class="feeds-actions" id="feedsActions"></div>

            <!-- 动态列表容器 - 异步加载 -->
            <section class="feeds-timeline layout-3" id="feedsTimeline" aria-live="polite">
                <!-- 动态项占位符 - 初始状态下显示 -->
                <div class="feed-item-placeholder" id="feedItemPlaceholder">
                    <!-- 占位符动画 -->
                    <div class="placeholder-wave">
                        <div class="placeholder-line"></div>
                        <div class="placeholder-line"></div>
                        <div class="placeholder-line"></div>
                    </div>
                </div>
            </section>

            <!-- 加载更多指示器 - 初始隐藏 -->
            <div class="feeds-loader u-hidden" id="feedsLoader" aria-hidden="true"><!-- migrated: inline display:none -> u-hidden -->
                <div class="loader-rect" aria-label="正在加载">
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
            </div>
        </div>
    </section>
</div>
<!-- 结束主内容区（已移除内层重复 main） -->

<?php
/**
 * 页脚脚本注入
 * 为管理员用户添加额外的 JavaScript 配置
 */
add_action('wp_footer', function () {
    // 检查当前用户是否为管理员
    if (current_user_can('manage_options')) {
?>
        <script>
            // 向全局配置对象添加管理员标识
            // 用于前端 JS 判断是否显示管理功能
            if (window.westlifeSettings) {
                window.westlifeSettings.isAdmin = true;
            }
        </script>
        <script>
            document.addEventListener('DOMContentLoaded', function() {
                var el = document.getElementById('lastUpdateText');
                if (el && el.dataset.timestamp) {
                    var ts = parseInt(el.dataset.timestamp, 10) * 1000;
                    if (!isNaN(ts)) {
                        var d = new Date(ts);
                        // 格式化为本地时间字符串
                        var y = d.getFullYear();
                        var m = ('0' + (d.getMonth() + 1)).slice(-2);
                        var day = ('0' + d.getDate()).slice(-2);
                        var h = ('0' + d.getHours()).slice(-2);
                        var min = ('0' + d.getMinutes()).slice(-2);
                        var s = ('0' + d.getSeconds()).slice(-2);
                        el.textContent = '最后更新：' + y + '-' + m + '-' + day + ' ' + h + ':' + min + ':' + s;
                    }
                }
            });
        </script>

<?php
    }
}, 999); // 优先级999，确保在其他脚本之后执行
?>

<?php
// 加载页脚
echo '</div></main>';
get_footer();
?>
