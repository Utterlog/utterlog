<?php

/**
 * Template Name: 文章列表
 * @package Westlife
 */

// 安全检查：防止直接访问
if (!defined('ABSPATH')) exit;

get_header();
echo '<main id="primary" class="site-main"><div class="container">';

// 在模板内确保样式已加载
$__uri = get_template_directory_uri();
$__ver = wp_get_theme()->get('Version');
if (!(function_exists('westlife_has_app_bundle') && westlife_has_app_bundle()) && !wp_style_is('westlife-page-posts-list', 'enqueued')) {
    wp_enqueue_style('westlife-page-posts-list', $__uri . '/assets/css/pages/page-posts-list.css', ['westlife-page'], $__ver);
}
// 加载文章列表页面交互脚本
if (!(function_exists('westlife_has_app_bundle') && westlife_has_app_bundle()) && !wp_script_is('westlife-page-posts-list', 'enqueued')) {
    wp_enqueue_script('westlife-page-posts-list', $__uri . '/assets/js/pages/page-posts-list.js', ['jquery'], $__ver, true);
}

// 获取所有已发布文章，按日期倒序
$all_posts = get_posts(array(
    'post_type' => 'post',
    'post_status' => 'publish',
    'numberposts' => -1,
    'orderby' => 'date',
    'order' => 'DESC'
));

// 按年份分组文章
$posts_by_year = array();
foreach ($all_posts as $post) {
    $year = get_the_date('Y', $post->ID);
    if (!isset($posts_by_year[$year])) {
        $posts_by_year[$year] = array();
    }
    $posts_by_year[$year][] = $post;
}

// 统计数据
$total_posts = count($all_posts);
$total_years = count($posts_by_year);
$first_year = !empty($posts_by_year) ? min(array_keys($posts_by_year)) : wp_date('Y', westlife_current_timestamp(), westlife_wp_timezone());
$latest_year = !empty($posts_by_year) ? max(array_keys($posts_by_year)) : wp_date('Y', westlife_current_timestamp(), westlife_wp_timezone());
?>

<!-- 文章列表页面 -->
<div class="posts-list-page">

    <!-- Hero 标题区域 -->
    <section class="posts-list-hero hero-bg-animated">
        <div class="hero-container">
            <div class="hero-content">
                <h1 class="page-title"><i class="fas fa-list-ul"></i> 文章列表</h1>
                <div class="hero-description">
                    <p>
                        <?php
                        printf(
                            __('共收录 %d 篇文章，记录生活点滴，分享技术心得，留下岁月痕迹。', 'westlife'),
                            $total_posts
                        );
                        ?>
                    </p>
                </div>
            </div>
        </div>
    </section>

    <!-- 文章列表主体 -->
    <section class="posts-list-main">
        <?php if (!empty($posts_by_year)) : ?>
            <?php foreach ($posts_by_year as $year => $posts) : ?>
                <div class="pl-year-group" id="year-<?php echo $year; ?>">
                    <?php
                    // 统计该年份的总评论数
                    $year_total_comments = 0;
                    foreach ($posts as $post) {
                        $year_total_comments += get_comments_number($post->ID);
                    }
                    ?>
                    <div class="pl-year-header">
                        <h2 class="pl-year-title">
                            <i class="fas fa-calendar"></i>
                            <?php echo $year; ?>
                        </h2>
                        <div class="pl-year-stats">
                            <span class="pl-year-count">
                                <i class="fas fa-file-alt"></i>
                                <?php echo count($posts); ?>
                            </span>
                            <span class="pl-year-comments">
                                <i class="fas fa-comments"></i>
                                <?php echo number_format_i18n($year_total_comments); ?>
                            </span>
                        </div>
                    </div>

                    <div class="pl-timeline">
                        <?php
                        foreach ($posts as $post) :
                            setup_postdata($post);
                            $post_id = $post->ID;
                            $post_title = get_the_title($post_id);
                            $post_date = get_the_date('Y-m-d', $post_id);
                            $post_month_day = get_the_date('m-d', $post_id);
                            $post_weekday = date_i18n('D', strtotime($post_date));
                            $post_link = get_permalink($post_id);
                            $post_categories = get_the_category($post_id);
                            $post_views = get_post_meta($post_id, 'post_views', true);
                            $post_comments = get_comments_number($post_id);
                        ?>
                            <article class="pl-post-item">
                                <div class="pl-post-date">
                                    <span class="pl-date-icon">
                                        <i class="fas fa-circle"></i>
                                    </span>
                                    <time class="pl-date-text" datetime="<?php echo esc_attr($post_date); ?>">
                                        <?php echo $post_month_day; ?>
                                    </time>
                                </div>

                                <div class="pl-post-content">
                                    <div class="pl-post-title-line">
                                        <h3 class="pl-post-title">
                                            <a href="<?php echo esc_url($post_link); ?>">
                                                <i class="fas fa-file-alt pl-post-icon"></i>
                                                <?php echo esc_html($post_title); ?>
                                            </a>
                                        </h3>

                                        <div class="pl-post-meta">
                                            <span class="pl-meta-toggle">
                                                <span class="pl-post-comments pl-meta-default">
                                                    <i class="fas fa-comments"></i>
                                                    <span class="pl-meta-value"><?php echo $post_comments > 0 ? number_format_i18n($post_comments) : '0'; ?></span>
                                                </span>

                                                <span class="pl-post-views pl-meta-hover">
                                                    <i class="fas fa-eye"></i>
                                                    <span class="pl-meta-value"><?php echo $post_views ? number_format_i18n($post_views) : '0'; ?></span>
                                                </span>
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </article>
                        <?php
                        endforeach;
                        wp_reset_postdata();
                        ?>
                    </div>
                </div>
            <?php endforeach; ?>
        <?php else : ?>
            <div class="empty-notice">
                <i class="fas fa-inbox"></i>
                <p>暂无文章</p>
            </div>
        <?php endif; ?>
    </section>

</div>
<!-- 文章列表页面结束 -->

<?php
echo '</div></main>';
get_footer();
