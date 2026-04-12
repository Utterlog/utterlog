<?php

/**
 * Template Name: 归档页面
 * @package Westlife
 */

// 安全检查：防止直接访问
if (!defined('ABSPATH')) exit;

get_header();
echo '<main id="primary" class="site-main"><div class="container">';

// 在模板内确保样式已加载（避免全局条件失效）
$__uri = get_template_directory_uri();
$__ver = wp_get_theme()->get('Version');
if (!(function_exists('westlife_has_app_bundle') && westlife_has_app_bundle()) && !wp_style_is('westlife-page-archive', 'enqueued')) {
    wp_enqueue_style('westlife-page-archive', $__uri . '/assets/css/pages/page-archive.css', ['westlife-page'], $__ver);
}
// 加载归档页面交互脚本
if (!(function_exists('westlife_has_app_bundle') && westlife_has_app_bundle()) && !wp_script_is('westlife-page-archive', 'enqueued')) {
    wp_enqueue_script('westlife-page-archive', $__uri . '/assets/js/pages/page-archive.js', ['jquery'], $__ver, true);
}

// 按需注入归档页面数据（替代全局 westlife_get_script_settings 注入）
if (!function_exists('westlife_get_archive_stats_bundle')) {
    $stats_file = get_template_directory() . '/inc/inc-stats.php';
    if (file_exists($stats_file)) {
        require_once $stats_file;
    }
}
if (function_exists('westlife_get_archive_stats_bundle')) {
    $bundle = westlife_get_archive_stats_bundle();
    $archive_settings = [
        'stats'       => $bundle['stats'],
        'heatmapData' => $bundle['heatmapData'],
        'yearlyData'  => $bundle['yearlyData'],
        'maxCount'    => $bundle['maxCount'],
        'nonce'       => wp_create_nonce('westlife_ajax_nonce'),
        'ajaxUrl'     => admin_url('admin-ajax.php'),
    ];
    $inline = 'window.westlifeSettings = window.westlifeSettings || {}; window.westlifeSettings.archive = ' . wp_json_encode($archive_settings, JSON_UNESCAPED_UNICODE) . ';';
    // 依赖 utils 的 westlifeSettings 对象已在前面 localize；此处仅补充 archive
    wp_add_inline_script('westlife-page-archive', $inline, 'before');
}

// 获取统计数据
$stats = array(
    'posts' => (int)wp_count_posts()->publish,
    'words' => (int)westlife_get_total_words(false),
    'views' => (int)westlife_get_total_views(),
    'comments' => (int)wp_count_comments()->approved,
);

// 归档页面不再需要单独查询热力图数据
// 热力图由 inc-heatmap.php 统一提供

// 计算博客运行时间
$first_post_time = strtotime(westlife_get_first_post_date());
$blog_years = round((time() - $first_post_time) / (365 * 24 * 60 * 60), 1);
$blog_days = floor((time() - $first_post_time) / (24 * 60 * 60));
$blog_months = floor((time() - $first_post_time) / (30 * 24 * 60 * 60));
$posts_per_month = $blog_months > 0 ? round($stats['posts'] / $blog_months, 1) : $stats['posts'];

// 获取里程碑描述
$milestone_desc = westlife_get_word_milestone_desc($stats['words']);
?>

<!-- 归档页面 - 简洁重构版 -->
<div class="arc-page">

    <!-- Hero 标题区域 -->
    <section class="arc-hero hero-bg-animated">
        <div class="arc-hero-container">
            <div class="arc-hero-inner">
                <!-- 左侧：标题和介绍 -->
                <div class="arc-hero-content">
                    <h1 class="arc-page-title"><i class="fas fa-archive"></i> 博客归档</h1>
                    <div class="arc-hero-description">
                        <p>
                            <?php
                            printf(
                                __('时光飞逝，这个小站已经默默陪伴我 %d 天了，共计发表 %s 篇文章，平均每月发表 %s 篇文章。', 'westlife'),
                                $blog_days,
                                number_format_i18n($stats['posts']),
                                $posts_per_month
                            );
                            ?>
                        </p>
                        <p>
                            <?php
                            printf(
                                __('累计写了 %s，%s', 'westlife'),
                                westlife_format_words($stats['words']),
                                $milestone_desc
                            );
                            ?>
                        </p>
                    </div>

                    <!-- 热力图 - 使用统一的 inc-heatmap.php -->
                    <div class="arc-hero-heatmap">
                        <div class="arc-heatmap-container">
                            <!-- 月份标签 -->
                            <div class="arc-heatmap-months">
                                <?php
                                // 生成过去12个月的标签，与热力图的53周对齐
                                // 每个月份标签占据约 4-5 周的宽度
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
                                $last_month = '';

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
                                    if (function_exists('westlife_get_activity_heatmap_365days')) {
                                        echo westlife_get_activity_heatmap_365days();
                                    } else {
                                        echo '<!-- 热力图函数未加载 -->';
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

                <!-- 右侧：统计卡片 -->
                <aside class="arc-stats-card">
                    <div class="arc-stats-header">
                        <?php echo westlife_lucide_icon('chart-column'); ?>
                        <h3>数据统计</h3>
                    </div>
                    <div class="arc-stats-list">
                        <div class="arc-stat-item">
                            <div class="arc-stat-icon">
                                <?php echo westlife_lucide_icon('file-text'); ?>
                            </div>
                            <div class="arc-stat-content">
                                <span class="arc-stat-label">文章</span>
                                <span class="arc-stat-value"><?php echo number_format_i18n($stats['posts']); ?></span>
                            </div>
                        </div>
                        <div class="arc-stat-item">
                            <div class="arc-stat-icon">
                                <i class="fas fa-font"></i>
                            </div>
                            <div class="arc-stat-content">
                                <span class="arc-stat-label">字数</span>
                                <span class="arc-stat-value"><?php echo number_format_i18n($stats['words']); ?></span>
                            </div>
                        </div>
                        <div class="arc-stat-item">
                            <div class="arc-stat-icon">
                                <i class="fas fa-eye"></i>
                            </div>
                            <div class="arc-stat-content">
                                <span class="arc-stat-label">浏览</span>
                                <span class="arc-stat-value"><?php echo number_format_i18n($stats['views']); ?></span>
                            </div>
                        </div>
                        <div class="arc-stat-item">
                            <div class="arc-stat-icon">
                                <i class="fas fa-comments"></i>
                            </div>
                            <div class="arc-stat-content">
                                <span class="arc-stat-label">评论</span>
                                <span class="arc-stat-value"><?php echo number_format_i18n($stats['comments']); ?></span>
                            </div>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    </section>

    <!-- 分类列表 -->
    <section class="arc-categories">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <h2 class="arc-section-title" style="margin: 0; border: none; padding: 0;">文章分类</h2>
            <?php
            // 查找文章列表页面
            $posts_list_page = get_pages(array(
                'meta_key' => '_wp_page_template',
                'meta_value' => 'template-pages/page-posts-list.php'
            ));
            if (!empty($posts_list_page)) :
                $posts_list_url = get_permalink($posts_list_page[0]->ID);
            ?>
                <a href="<?php echo esc_url($posts_list_url); ?>" style="font-size: 0.9rem; color: #6b7280; text-decoration: none; transition: color 0.3s;">
                    查看所有文章 <i class="fas fa-arrow-right" style="font-size: 0.8rem; margin-left: 4px;"></i>
                </a>
            <?php endif; ?>
        </div>
        <div class="arc-section-divider"></div>
        <div class="arc-categories-grid">
            <?php
            $categories = get_categories(array(
                'orderby' => 'count',
                'order' => 'DESC',
                'hide_empty' => 1
            ));

            if ($categories) :
                foreach ($categories as $category) :
                    // 获取分类链接
                    $cat_link = get_category_link($category->term_id);

                    // 获取分类描述
                    $cat_desc = $category->description ? $category->description : '暂无描述';

                    // 优先使用分类自定义封面图
                    $bg_image = westlife_get_category_thumbnail($category->term_id);

                    // 如果没有自定义封面图,尝试获取分类第一篇文章的特色图片
                    if (!$bg_image) {
                        $cat_posts = get_posts(array(
                            'category' => $category->term_id,
                            'numberposts' => 1,
                            'post_status' => 'publish'
                        ));

                        if (!empty($cat_posts) && has_post_thumbnail($cat_posts[0]->ID)) {
                            $bg_image = get_the_post_thumbnail_url($cat_posts[0]->ID, 'medium');
                        }
                    }

                    // 获取自定义图标,默认为 fa-folder
                    $cat_icon = westlife_get_category_icon($category->term_id);

                    // 为每个分类生成一个独特的渐变色(基于分类ID)
                    $colors = array(
                        array('#667eea', '#764ba2'), // 紫色
                        array('#f093fb', '#f5576c'), // 粉红
                        array('#4facfe', '#00f2fe'), // 蓝色
                        array('#43e97b', '#38f9d7'), // 绿色
                        array('#fa709a', '#fee140'), // 橙粉
                        array('#30cfd0', '#330867'), // 青紫
                        array('#a8edea', '#fed6e3'), // 薄荷粉
                        array('#ff9a56', '#ff6a88'), // 橙红
                    );
                    $color_index = $category->term_id % count($colors);
                    $gradient = $colors[$color_index];
            ?>
                    <a href="<?php echo esc_url($cat_link); ?>" class="arc-category-card"
                        style="--gradient-start: <?php echo $gradient[0]; ?>; --gradient-end: <?php echo $gradient[1]; ?>;"
                        data-has-image="<?php echo $bg_image ? 'true' : 'false'; ?>">

                        <?php if ($bg_image) : ?>
                            <div class="arc-category-bg" style="background-image: url('<?php echo esc_url($bg_image); ?>');"></div>
                        <?php else : ?>
                            <div class="arc-category-bg arc-category-gradient"></div>
                        <?php endif; ?>

                        <div class="arc-category-overlay"></div>

                        <div class="arc-category-content">
                            <div class="arc-category-icon">
                                <?php echo westlife_render_category_icon($category->term_id, array('aria-hidden' => 'true')); ?>
                            </div>
                            <h3 class="arc-category-name"><?php echo esc_html($category->name); ?></h3>
                            <div class="arc-category-count-badge"><?php echo $category->count; ?> 篇</div>
                        </div>

                        <div class="arc-category-hover-info">
                            <div class="arc-category-stats">
                                <span class="arc-stat-item">
                                    <?php echo westlife_lucide_icon('file-text', array('aria-hidden' => 'true')); ?>
                                    <?php echo $category->count; ?> 篇文章
                                </span>
                            </div>
                            <p class="arc-category-description"><?php echo esc_html($cat_desc); ?></p>
                        </div>
                    </a>
                <?php
                endforeach;
            else:
                ?>
                <p class="arc-empty-notice">暂无分类</p>
            <?php endif; ?>
        </div>
    </section>

    <!-- 年度归档 -->
    <section class="arc-years">
        <h2 class="arc-section-title">按年份归档</h2>
        <div class="arc-section-divider"></div>
        <?php
        $years = $wpdb->get_results($wpdb->prepare("
            SELECT DISTINCT YEAR(post_date) as year,
                   COUNT(*) as post_count
            FROM {$wpdb->posts}
            WHERE post_type = %s AND post_status = %s
            GROUP BY year
            ORDER BY year DESC
        ", 'post', 'publish'));

        if ($years) :
            foreach ($years as $year_data) :
                $year = $year_data->year;
                $post_count = $year_data->post_count;
        ?>
                <div class="arc-year-section">
                    <div class="arc-year-header">
                        <h3 class="arc-year-title"><?php echo $year; ?></h3>
                        <span class="arc-year-count"><?php echo $post_count; ?> 篇</span>
                    </div>

                    <div class="arc-months-grid">
                        <?php
                        for ($m = 1; $m <= 12; $m++) :
                            $month_posts = $wpdb->get_var($wpdb->prepare("
                                SELECT COUNT(*)
                                FROM {$wpdb->posts}
                                WHERE post_type = %s
                                AND post_status = %s
                                AND YEAR(post_date) = %d
                                AND MONTH(post_date) = %d
                            ", 'post', 'publish', $year, $m));

                            $month_link = get_month_link($year, $m);
                            $month_name = date_i18n('n月', mktime(0, 0, 0, $m, 1, $year));
                        ?>
                            <a href="<?php echo esc_url($month_link); ?>"
                                class="arc-month-item<?php echo $month_posts > 0 ? ' arc-has-posts' : ''; ?>"
                                title="<?php echo $year; ?>年<?php echo $month_name; ?>: <?php echo $month_posts; ?>篇文章">
                                <span class="arc-month-name"><?php echo $month_name; ?></span>
                                <?php if ($month_posts > 0) : ?>
                                    <span class="arc-month-count"><?php echo $month_posts; ?></span>
                                <?php endif; ?>
                            </a>
                        <?php endfor; ?>
                    </div>
                </div>
            <?php
            endforeach;
        else:
            ?>
            <p class="arc-empty-notice">暂无文章</p>
        <?php endif; ?>
    </section>

    <!-- 标签列表 -->
    <section class="arc-tags">
        <h2 class="arc-section-title">文章标签</h2>
        <div class="arc-section-divider"></div>
        <div class="arc-tags-list">
            <?php
            $tags = get_tags(array(
                'orderby' => 'count',
                'order' => 'DESC',
                'number' => 100,
                'hide_empty' => 1
            ));

            if ($tags) :
                foreach ($tags as $tag) :
            ?>
                    <a href="<?php echo get_tag_link($tag->term_id); ?>" title="<?php echo esc_attr($tag->description); ?>">
                        <span class="arc-tag-hash">#</span><?php echo esc_html($tag->name); ?><span class="arc-count"><?php echo number_format_i18n($tag->count); ?></span>
                    </a>
                <?php
                endforeach;
            else:
                ?>
                <p class="arc-empty-notice">暂无标签</p>
            <?php endif; ?>
        </div>
    </section>

</div>
<!-- 归档页面结束 -->

<?php
echo '</div></main>';
get_footer();
