<?php

/**
 * Template Name: 主题说明
 * 
 * @package Westlife
 */

// 本页样式仅在该模板内加载，避免全局条件
$__uri = get_template_directory_uri();
$__ver = wp_get_theme()->get('Version');

if (!(function_exists('westlife_has_app_bundle') && westlife_has_app_bundle()) && !wp_style_is('westlife-page-theme-info', 'enqueued')) {
    wp_enqueue_style('westlife-page-theme-info', $__uri . '/assets/css/pages/page-theme-info.css', ['westlife-page'], $__ver);
}

get_header(); ?>

<main id="main" class="site-main">
    <div class="container">
        <!-- Hero 区：与其它页面风格统一 -->
        <section class="theme-info-hero">
            <div class="hero-container">
                <div class="hero-inner">
                    <!-- 左侧：标题与简介 -->
                    <div class="hero-content">
                        <h1 class="page-title">
                            <?php echo westlife_lucide_icon('palette'); ?>
                            Westlife 主题说明
                        </h1>
                        <p class="hero-subtitle">
                            优雅、轻量、可扩展的 WordPress 主题，专注写作体验与性能优化。
                        </p>
                        <div class="hero-meta">
                            <span class="badge version">版本：<?php echo esc_html(defined('_S_VERSION') ? _S_VERSION : $GLOBALS['wp_version']); ?></span>
                            <span class="badge author">作者：<a href="https://xifeng.net" target="_blank" rel="noopener">西风</a></span>
                        </div>
                    </div>

                    <!-- 右侧：统计卡片（预置占位） -->
                    <div class="hero-stats">
                        <div class="stat-card">
                            <div class="stat-value" id="themeDownloads" data-initial="0">0</div>
                            <div class="stat-label">累计下载</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="themeUpdates" data-initial="0">0</div>
                            <div class="stat-label">版本更新</div>
                        </div>
                        <div class="stat-card">
                            <div class="stat-value" id="githubStars" data-initial="0">0</div>
                            <div class="stat-label">GitHub Stars</div>
                        </div>
                    </div>
                </div>
            </div>
        </section>

        <div class="theme-info">

            <!-- 主题功能卡片 -->
            <div class="theme-features">
                <div class="feature-card">
                    <?php echo westlife_lucide_icon('brush-cleaning'); ?>
                    <h3>优雅设计</h3>
                    <p>简约现代的设计风格，优雅的动画效果</p>
                </div>
                <div class="feature-card">
                    <?php echo westlife_lucide_icon('zap'); ?>
                    <h3>快速响应</h3>
                    <p>优化的代码结构，快速的加载速度</p>
                </div>
                <div class="feature-card">
                    <?php echo westlife_lucide_icon('smartphone'); ?>
                    <h3>响应式布局</h3>
                    <p>完美适配各种设备屏幕尺寸</p>
                </div>
                <div class="feature-card">
                    <?php echo westlife_lucide_icon('moon'); ?>
                    <h3>深色模式</h3>
                    <p>支持浅色/深色模式自由切换</p>
                </div>
            </div>

            <!-- 主题文档 -->
            <div class="theme-docs">
                <h2><?php echo westlife_lucide_icon('book-open'); ?> 使用文档</h2>
                <div class="docs-content">
                    <?php the_content(); ?>
                </div>
            </div>

            <!-- 主题更新日志 -->
            <div class="theme-changelog">
                <h2><?php echo westlife_lucide_icon('history'); ?> 更新日志</h2>
                <div class="changelog-list">
                    <div class="changelog-item">
                        <span class="version">v1.0.0</span>
                        <span class="date">2024-05-03</span>
                        <ul>
                            <li>初始版本发布</li>
                            <li>基础功能实现</li>
                            <li>响应式布局支持</li>
                        </ul>
                    </div>
                    <!-- 可以继续添加更多更新记录 -->
                </div>
            </div>

            <!-- 技术支持 -->
            <div class="theme-support">
                <h2><?php echo westlife_lucide_icon('headset'); ?> 技术支持</h2>
                <div class="support-links">
                    <a href="#" class="support-link">
                        <?php echo westlife_lucide_icon('github'); ?>
                        GitHub
                    </a>
                    <a href="#" class="support-link">
                        <?php echo westlife_lucide_icon('book-open'); ?>
                        文档
                    </a>
                    <a href="#" class="support-link">
                        <?php echo westlife_lucide_icon('circle-help'); ?>
                        帮助
                    </a>
                </div>
            </div>
        </div>
    </div>
</main>

<?php get_footer(); ?>
