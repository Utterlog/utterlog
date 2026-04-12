<?php

/**
 * Template Name: 访客地图
 * Description: 访客地图与访客统计展示页面，自动显示独立访客、国家数量与总访问量等数据。
 * @package Westlife
 */

get_header();
?>

<div class="visitor-page">

    <!-- Hero 标题区域 -->
    <section class="vm-hero hero-bg-animated">
        <div class="vm-hero-container">
            <div class="vm-hero-inner">
                <div class="vm-hero-content">
                    <h1 class="vm-page-title">
                        <i class="fas fa-globe-americas"></i> 访客地图
                    </h1>
                    <div class="vm-hero-description">
                        <p>实时可视化全球访客分布，基于 IP 地理位置技术，展示访客的地理分布热力图。支持小时级趋势与关键指标对比，快速洞察访问高峰时段与地域分布变化。采用隐私友好的统计方式，自动过滤爬虫与异常流量。</p>
                    </div>

                    <?php
                    // 预取 Umami 统计（供徽章与右侧面板共用）
                    $umami = function_exists('westlife_umami') ? westlife_umami() : null;
                    $use_umami = $umami && $umami->is_configured();
                    $umami_stats = $use_umami ? $umami->get_stats() : null;
                    $umami_ok = ($use_umami && $umami_stats && empty($umami_stats['error']));
                    ?>
                    <div class="vm-hero-metrics">
                        <div class="vm-hero-badges">
                            <!-- 今日访客（本地 JSON） -->
                            <div class="vm-badge">
                                <i class="fas fa-user-clock"></i>
                                <span class="vm-badge-label">今日访客</span>
                                <strong class="vm-badge-value"><?php echo esc_html(westlife_get_today_visitors()); ?></strong>
                            </div>
                            <!-- 今日国家（本地 JSON） -->
                            <div class="vm-badge">
                                <i class="fas fa-globe-asia"></i>
                                <span class="vm-badge-label">今日国家</span>
                                <strong class="vm-badge-value"><?php echo esc_html(westlife_get_today_countries()); ?></strong>
                            </div>
                            <!-- 本月访客（Umami） -->
                            <div class="vm-badge">
                                <i class="fas fa-users"></i>
                                <span class="vm-badge-label">本月访客</span>
                                <strong class="vm-badge-value"><?php echo $umami_ok ? intval($umami_stats['month_uv'] ?? 0) : '-'; ?></strong>
                            </div>
                            <!-- 年度访客（Umami） -->
                            <div class="vm-badge">
                                <i class="fas fa-user-friends"></i>
                                <span class="vm-badge-label">年度访客</span>
                                <strong class="vm-badge-value"><?php echo $umami_ok ? intval($umami_stats['year_uv'] ?? 0) : '-'; ?></strong>
                            </div>
                            <!-- 累计国家（Umami 全站） -->
                            <div class="vm-badge">
                                <i class="fas fa-flag"></i>
                                <span class="vm-badge-label">累计国家</span>
                                <strong class="vm-badge-value"><?php echo $umami_ok ? intval($umami_stats['countries_total'] ?? 0) : '-'; ?></strong>
                            </div>
                        </div>

                        <!-- 今日小时访客图（徽章下方） -->
                        <div class="vm-hero-chart is-collapsed" id="vm-hero-hourly" aria-label="今日小时访客图"></div>
                    </div>
                </div>

                <!-- 右侧：Umami 统计卡片 -->
                <aside class="vm-stats-card">
                    <div class="vm-stats-header">
                        <i class="fas fa-chart-line"></i>
                        <h3>站点访问</h3>
                    </div>
                    <div class="vm-stats-list">
                        <div class="vm-stat-item">
                            <div class="vm-stat-icon"><i class="fas fa-eye"></i></div>
                            <div class="vm-stat-content">
                                <span class="vm-stat-label">今日访问</span>
                                <span class="vm-stat-value">
                                    <?php echo ($use_umami && $umami_stats && empty($umami_stats['error'])) ? intval($umami_stats['today_pv'] ?? 0) : '-'; ?>
                                </span>
                            </div>
                        </div>
                        <div class="vm-stat-item">
                            <div class="vm-stat-icon"><i class="fas fa-calendar-alt"></i></div>
                            <div class="vm-stat-content">
                                <span class="vm-stat-label">本月访问</span>
                                <span class="vm-stat-value">
                                    <?php echo ($use_umami && $umami_stats && empty($umami_stats['error'])) ? intval($umami_stats['month_pv'] ?? 0) : '-'; ?>
                                </span>
                            </div>
                        </div>
                        <div class="vm-stat-item">
                            <div class="vm-stat-icon"><i class="fas fa-chart-bar"></i></div>
                            <div class="vm-stat-content">
                                <span class="vm-stat-label">年度访问</span>
                                <span class="vm-stat-value">
                                    <?php echo ($use_umami && $umami_stats && empty($umami_stats['error'])) ? intval($umami_stats['year_pv'] ?? 0) : '-'; ?>
                                </span>
                            </div>
                        </div>
                        <div class="vm-stat-item">
                            <div class="vm-stat-icon"><i class="fas fa-infinity"></i></div>
                            <div class="vm-stat-content">
                                <span class="vm-stat-label">全部访问</span>
                                <span class="vm-stat-value">
                                    <?php echo ($use_umami && $umami_stats && empty($umami_stats['error'])) ? intval($umami_stats['total_pv'] ?? 0) : '-'; ?>
                                </span>
                            </div>
                        </div>
                    </div>
                    <div class="vm-stats-source" style="margin-top:8px;color:#6b7280;font-size:12px;">
                        <i class="fas fa-info-circle"></i>
                        <?php
                        if ($use_umami && $umami_stats && empty($umami_stats['error'])) {
                            echo '数据源：Umami（5分钟缓存）';
                        } elseif ($use_umami && $umami_stats && !empty($umami_stats['error'])) {
                            echo '数据源：Umami（获取失败）';
                        } else {
                            echo '数据源：未配置 Umami';
                        }
                        ?>
                        <?php if ($use_umami && $umami_stats && !empty($umami_stats['error'])): ?>
                            <div style="color:#dc3545;margin-top:4px;"><?php echo esc_html($umami_stats['error']); ?></div>
                        <?php endif; ?>
                    </div>
                </aside>
            </div>
        </div>
    </section>

    <!-- 访客地图（内含标记与最近访客覆层） -->
    <div class="vm-map-wrapper">
        <div class="vm-map-source">
            <i class="fas fa-map-marker-alt"></i>
            地图点数据源：访客 GeoIP 缓存
        </div>
        <div id="visitor-map-background" class="visitor-map-background"></div>
        <!-- 地图标记层（JS 计算放置） -->
        <div class="visitor-map-markers" aria-hidden="true"></div>
        <!-- 地图底部：最近访客覆层（显示 10 个） -->
        <div class="vm-map-overlay" aria-label="最近定位点">
            <div class="vm-recent-inline">
                <div class="visitor-recent-list visitor-recent-inline">
                    <?php echo westlife_get_recent_visitors(); ?>
                </div>
            </div>
        </div>
    </div>

    <!-- Top N 列表（仅国家） -->
    <section class="vm-topn" aria-label="Top N 国家区" data-type="country">
        <div class="vm-topn-header">
            <div class="vm-topn-title"><i class="fas fa-flag"></i> 国家分布</div>
            <div class="vm-topn-range">
                <select class="vm-topn-range-select" aria-label="时间范围">
                    <option value="30d" selected>近30天</option>
                    <option value="7d">近7天</option>
                    <option value="90d">近90天</option>
                    <option value="year">今年</option>
                    <option value="all">全部</option>
                </select>
            </div>
        </div>
        <div class="vm-topn-body">
            <ol class="vm-topn-list vm-country-grid"></ol>
        </div>
    </section>

    <!-- Top N 列表（浏览器） -->
    <section class="vm-topn vm-topn-browser" aria-label="Top N 浏览器区" data-type="browser">
        <div class="vm-topn-header">
            <div class="vm-topn-title"><i class="fas fa-globe"></i> 浏览器</div>
            <div class="vm-topn-range">
                <select class="vm-topn-range-select" aria-label="时间范围">
                    <option value="30d" selected>近30天</option>
                    <option value="7d">近7天</option>
                    <option value="90d">近90天</option>
                    <option value="year">今年</option>
                    <option value="all">全部</option>
                </select>
            </div>
        </div>
        <div class="vm-topn-body">
            <!-- 复用相同的网格样式 -->
            <ol class="vm-topn-list vm-country-grid"></ol>
        </div>
    </section>

    <!-- Top N 列表（操作系统） -->
    <section class="vm-topn vm-topn-os" aria-label="Top N 操作系统区" data-type="os">
        <div class="vm-topn-header">
            <div class="vm-topn-title"><i class="fas fa-desktop"></i> 操作系统</div>
            <div class="vm-topn-range">
                <select class="vm-topn-range-select" aria-label="时间范围">
                    <option value="30d" selected>近30天</option>
                    <option value="7d">近7天</option>
                    <option value="90d">近90天</option>
                    <option value="year">今年</option>
                    <option value="all">全部</option>
                </select>
            </div>
        </div>
        <div class="vm-topn-body">
            <!-- 复用相同的网格样式 -->
            <ol class="vm-topn-list vm-country-grid"></ol>
        </div>
    </section>

    <!-- 低调说明 -->
    <div class="visitor-disclaimer">
        数据仅用于趋势观察与站点维护，已做去标识化处理并尽量过滤机器人流量；不会用于广告或画像。
    </div>



</div>

<?php
get_footer();
?>
