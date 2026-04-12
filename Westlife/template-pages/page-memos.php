<?php

/**
 * Template Name: 说说页面
 *
 * @package Westlife
 * @version 1.0.0
 */

if (!defined('ABSPATH')) exit;

get_header();
echo '<main id="primary" class="site-main"><div class="container">';
?>

<div class="memos-page">
    <!-- Hero 区域 -->
    <div class="memos-hero hero-bg-animated">
        <!-- 装饰背景 -->
        <div class="memos-bubbles">
            <?php for ($i = 1; $i <= 20; $i++): ?>
                <div class="bubble-item" style="--i: <?php echo $i; ?>"></div>
            <?php endfor; ?>
        </div>

        <div class="hero-container">
            <div class="hero-inner">
                <div class="hero-content">
                    <h1 class="page-title">
                        <i class="fas fa-comment-dots"></i>
                        <?php echo get_the_title(); ?>
                    </h1>
                    <div class="hero-text">
                        <p>
                            <?php
                            $description = get_post_meta(get_the_ID(), '_memos_page_description', true);
                            echo $description ? esc_html($description) : '记录生活的点点滴滴，分享日常的思考与感悟。每一条说说都是时光的片段，承载着当时的心情和想法。';
                            ?>
                        </p>
                    </div>

                    <?php
                    // 复用归档页的热力图样式
                    $__uri = get_template_directory_uri();
                    $__ver = wp_get_theme()->get('Version');
                    if (!(function_exists('westlife_has_app_bundle') && westlife_has_app_bundle()) && !wp_style_is('westlife-page-archive', 'enqueued')) {
                        wp_enqueue_style('westlife-page-archive', $__uri . '/assets/css/pages/page-archive.css', ['westlife-page'], $__ver);
                    }
                    ?>

                    <!-- 说说热力图（使用统一的 inc-heatmap.php） -->
                    <div class="arc-hero-heatmap">
                        <div class="arc-heatmap-container">
                            <!-- 月份标签 -->
                            <div class="arc-heatmap-months">
                                <?php
                                // 生成过去12个月的标签，与热力图的53周对齐
                                $today = new DateTime();
                                $start_date = clone $today;
                                $start_date->modify('-364 days'); // 365天前

                                // 找到起始日期所在周的周日
                                $start_day_of_week = (int)$start_date->format('w');
                                $grid_start = clone $start_date;
                                if ($start_day_of_week !== 0) {
                                    $grid_start->modify('-' . $start_day_of_week . ' days');
                                }

                                // 生成12个月的标签
                                $current_date = clone $grid_start;
                                $months_shown = [];

                                // 遍历53周，记录每个月第一次出现的位置
                                for ($week = 0; $week < 53; $week++) {
                                    $month_key = $current_date->format('Y-m');
                                    if (!isset($months_shown[$month_key])) {
                                        $months_shown[$month_key] = $week;
                                    }
                                    $current_date->modify('+7 days');
                                }

                                // 输出月份标签（最多12个）
                                $month_labels = array_slice($months_shown, 0, 12, true);
                                foreach ($month_labels as $month_key => $week_position) {
                                    $month_date = DateTime::createFromFormat('Y-m', $month_key);
                                    $month_name = $month_date->format('n') . '月';
                                    echo '<span class="arc-month-label" style="grid-column-start: ' . ($week_position + 1) . ';">' . $month_name . '</span>';
                                }
                                ?>
                            </div>

                            <div class="arc-heatmap-wrapper">
                                <!-- 星期标签（显示全部7天） -->
                                <div class="arc-heatmap-weekdays">
                                    <span class="arc-weekday-label">日</span><!-- 周日（第1行） -->
                                    <span class="arc-weekday-label">一</span><!-- 周一（第2行） -->
                                    <span class="arc-weekday-label">二</span><!-- 周二（第3行） -->
                                    <span class="arc-weekday-label">三</span><!-- 周三（第4行） -->
                                    <span class="arc-weekday-label">四</span><!-- 周四（第5行） -->
                                    <span class="arc-weekday-label">五</span><!-- 周五（第6行） -->
                                    <span class="arc-weekday-label">六</span><!-- 周六（第7行） -->
                                </div>

                                <!-- 热力图网格 - 调用统一函数（365天） -->
                                <div class="arc-heatmap-grid">
                                    <?php
                                    // 使用 inc-heatmap.php 中的365天版本函数
                                    if (function_exists('westlife_get_memos_heatmap_365days')) {
                                        echo westlife_get_memos_heatmap_365days();
                                    } else {
                                        echo '<!-- Memos热力图函数未加载 -->';
                                    }
                                    ?>
                                </div>
                            </div>

                            <!-- 图例 -->
                            <div class="arc-heatmap-legend">
                                <span class="arc-legend-text">少</span>
                                <span class="arc-legend-item">
                                    <span class="arc-legend-cell arc-heat-level-0"></span>
                                </span>
                                <span class="arc-legend-item">
                                    <span class="arc-legend-cell arc-heat-level-1"></span>
                                </span>
                                <span class="arc-legend-item">
                                    <span class="arc-legend-cell arc-heat-level-2"></span>
                                </span>
                                <span class="arc-legend-item">
                                    <span class="arc-legend-cell arc-heat-level-3"></span>
                                </span>
                                <span class="arc-legend-item">
                                    <span class="arc-legend-cell arc-heat-level-4"></span>
                                </span>
                                <span class="arc-legend-text">多</span>
                            </div>
                        </div>
                    </div>
                </div>

                <!-- 统计信息卡片 -->
                <div class="memos-info-card">
                    <div class="card-header">
                        <i class="fas fa-chart-bar"></i>
                        <h3>说说统计</h3>
                    </div>

                    <div class="stats-summary">
                        <!-- 本月说说数 -->
                        <div class="summary-item">
                            <div class="summary-icon">
                                <i class="fas fa-calendar-check"></i>
                            </div>
                            <div class="summary-content">
                                <span class="summary-label">本月说说</span>
                                <span class="summary-value" id="memos-this-month">-</span>
                            </div>
                        </div>

                        <!-- 总说说数 -->
                        <div class="summary-item">
                            <div class="summary-icon">
                                <i class="fas fa-comment"></i>
                            </div>
                            <div class="summary-content">
                                <span class="summary-label">全部说说</span>
                                <span class="summary-value" id="total-memos">-</span>
                            </div>
                        </div>

                        <!-- 总记录天数 -->
                        <div class="summary-item">
                            <div class="summary-icon">
                                <i class="fas fa-calendar-alt"></i>
                            </div>
                            <div class="summary-content">
                                <span class="summary-label">更新天数</span>
                                <span class="summary-value" id="total-days">-</span>
                            </div>
                        </div>
                    </div>

                    <hr class="card-divider">

                    <div class="last-update-info">
                        <span>
                            <span class="status-indicator loading" id="status-indicator">
                                <i class="fas fa-spinner fa-spin"></i>
                            </span>
                            <span id="status-text">检测中</span>
                        </span>
                        <button class="btn-refresh-inline" id="refresh-status" title="刷新状态">
                            <i class="fas fa-sync-alt"></i>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>

    <!-- 说说列表区域 -->
    <div class="memos-section">
        <div class="memos-container">

            <?php if (is_user_logged_in() && current_user_can('manage_options')): ?>
                <!-- 发布框（仅管理员可见）-->
                <div class="memos-publish-box" id="memos-publish-box">
                    <div class="publish-header">
                        <i class="fas fa-pen-fancy"></i>
                        <h3>发布新说说</h3>
                    </div>
                    <div class="publish-body">
                        <textarea
                            id="memo-publish-textarea"
                            class="memo-textarea"
                            placeholder="分享此刻的想法..."
                            rows="4"
                            maxlength="1000"></textarea>
                        <div class="publish-footer">
                            <div class="publish-meta">
                                <span class="char-count">
                                    <span id="memo-char-count">0</span> / 1000
                                </span>
                                <select id="memo-visibility" class="visibility-select">
                                    <option value="PUBLIC">公开</option>
                                    <option value="PRIVATE">私密</option>
                                </select>
                            </div>
                            <div class="publish-actions">
                                <button type="button" id="memo-publish-btn" class="publish-btn">
                                    <i class="fas fa-paper-plane"></i>
                                    <span>发布</span>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            <?php endif; ?>

            <!-- 工具栏 -->
            <div class="memos-toolbar">
                <!-- 筛选标签 -->
                <div class="memos-filters">
                    <button class="filter-btn active" data-filter="all">
                        <i class="fas fa-list"></i>
                        全部
                    </button>
                    <button class="filter-btn" data-filter="pinned">
                        <i class="fas fa-thumbtack"></i>
                        置顶
                    </button>
                    <button class="filter-btn" data-filter="today">
                        <i class="fas fa-calendar-day"></i>
                        今天
                    </button>
                    <button class="filter-btn" data-filter="week">
                        <i class="fas fa-calendar-week"></i>
                        本周
                    </button>
                </div>

                <!-- 搜索框 -->
                <div class="memos-search">
                    <input type="text" class="search-input" id="memos-search"
                        placeholder="搜索说说内容或标签..." />
                    <button class="search-btn" id="search-btn">
                        <i class="fas fa-search"></i>
                    </button>
                </div>

                <!-- 操作按钮 -->
                <div class="memos-actions">
                    <button class="action-btn" id="refresh-btn" title="刷新">
                        <i class="fas fa-sync-alt"></i>
                    </button>
                </div>
            </div>

            <!-- 关键词板块 -->
            <div class="memos-keywords-section" id="memos-keywords-section">
                <div class="keywords-header">
                    <div class="keywords-title">
                        <i class="fas fa-tags"></i>
                        <h4>热门标签</h4>
                        <span class="keywords-count" id="keywords-total">0</span>
                    </div>
                    <button class="keywords-toggle" id="keywords-toggle" title="展开/收起">
                        <i class="fas fa-chevron-up"></i>
                    </button>
                </div>
                <div class="keywords-container" id="keywords-container">
                    <div class="keywords-loading">
                        <i class="fas fa-spinner fa-spin"></i>
                        <span>加载标签中...</span>
                    </div>
                    <div class="keywords-list" id="keywords-list">
                        <!-- 动态生成的标签 -->
                    </div>
                    <div class="keywords-empty" style="display: none;">
                        <i class="fas fa-tag"></i>
                        <span>暂无标签</span>
                    </div>
                </div>
            </div>

            <!-- 骨架屏（优化LCP） -->
            <div class="skeleton-memos" id="skeleton-memos">
                <div class="skeleton-memo-card">
                    <div class="skeleton-header">
                        <div class="skeleton-avatar"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-line skeleton-name"></div>
                            <div class="skeleton-line skeleton-date"></div>
                        </div>
                    </div>
                    <div class="skeleton-content">
                        <div class="skeleton-line skeleton-text-1"></div>
                        <div class="skeleton-line skeleton-text-2"></div>
                        <div class="skeleton-line skeleton-text-3"></div>
                    </div>
                </div>
                <div class="skeleton-memo-card">
                    <div class="skeleton-header">
                        <div class="skeleton-avatar"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-line skeleton-name"></div>
                            <div class="skeleton-line skeleton-date"></div>
                        </div>
                    </div>
                    <div class="skeleton-content">
                        <div class="skeleton-line skeleton-text-1"></div>
                        <div class="skeleton-line skeleton-text-2"></div>
                    </div>
                </div>
                <div class="skeleton-memo-card">
                    <div class="skeleton-header">
                        <div class="skeleton-avatar"></div>
                        <div class="skeleton-info">
                            <div class="skeleton-line skeleton-name"></div>
                            <div class="skeleton-line skeleton-date"></div>
                        </div>
                    </div>
                    <div class="skeleton-content">
                        <div class="skeleton-line skeleton-text-1"></div>
                        <div class="skeleton-line skeleton-text-2"></div>
                        <div class="skeleton-line skeleton-text-3"></div>
                        <div class="skeleton-line skeleton-text-4"></div>
                    </div>
                </div>
            </div>

            <!-- 加载状态：采用主题蓝色矩形跳动，板块内水平垂直居中 -->
            <div class="memos-center-loader u-hidden" id="loading-state"><!-- migrated: inline display:none -> u-hidden -->
                <div class="loader-rect" aria-label="加载中">
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                    <div></div>
                </div>
                <p class="loader-text">正在加载说说...</p>
            </div>

            <!-- 错误状态：简洁居中样式，与加载状态一致的布局 -->
            <div class="memos-center-error u-hidden" id="error-state"><!-- migrated: inline display:none -> u-hidden -->
                <div class="error-icon" aria-hidden="true">
                    <i class="fas fa-exclamation-triangle"></i>
                </div>
                <div class="error-title">加载失败</div>
                <p id="error-message" class="error-desc">无法连接到 Memos 服务</p>
                <button class="btn primary" id="retry-btn" type="button" aria-label="重试加载">
                    <i class="fas fa-redo"></i>
                    重试
                </button>
            </div>

            <!-- 空状态 -->
            <div class="empty-state u-hidden" id="empty-state"><!-- migrated: inline display:none -> u-hidden -->
                <div class="empty-icon">
                    <i class="fas fa-comment-slash"></i>
                </div>
                <h3>暂无说说</h3>
                <p>还没有发布任何说说内容</p>
            </div>

            <!-- 说说网格 -->
            <div class="memos-grid" id="memos-grid">
                <!-- 动态生成的说说卡片 -->
            </div>

            <!-- 加载更多 -->
            <div class="load-more-memos-wrapper u-hidden" id="load-more-container">
                <button id="load-more-memos">
                    加载更多说说
                </button>
            </div>
        </div>
    </div>
</div>

<!-- 侧边栏 -->
<?php if (is_active_sidebar('memos-sidebar')): ?>
    <div class="memos-sidebar">
        <?php dynamic_sidebar('memos-sidebar'); ?>
    </div>
<?php endif; ?>

<?php
echo '</div></main>';
get_footer();
?>
