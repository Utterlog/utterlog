<?php

/**
 * 归档页面模板
 * 
 * 用于显示按年、月归档的文章列表
 *
 * @package Westlife
 */

get_header(); ?>

<main id="main" class="site-main">
    <div class="container">
        <!-- 归档头部 -->
        <header class="archive-header">
            <h1 class="archive-title">
                <?php echo westlife_lucide_icon('calendar'); ?>
                <?php
                if (is_year()) {
                    printf(esc_html__('%s年的文章', 'westlife'), get_the_date('Y'));
                } elseif (is_month()) {
                    printf(esc_html__('%s的文章', 'westlife'), get_the_date('Y年n月'));
                }
                ?>
            </h1>
            <div class="archive-count">
                <?php
                global $wp_query;
                printf(
                    esc_html__('共 %d 篇文章', 'westlife'),
                    $wp_query->found_posts
                );
                ?>
            </div>
        </header>

        <?php if (have_posts()) : ?>
            <!-- 文章列表 -->
            <div class="posts-grid">
                <?php
                while (have_posts()) :
                    the_post();
                    get_template_part('template-parts/content', 'card');
                endwhile;
                ?>
            </div>

            <!-- 分页导航 -->
            <div class="pagination-wrapper">
                <?php
                the_posts_pagination(array(
                    'prev_text' => westlife_lucide_icon('chevron-left'),
                    'next_text' => westlife_lucide_icon('chevron-right'),
                    'mid_size'  => 2,
                    'screen_reader_text' => ' '
                ));
                ?>
            </div>

        <?php else : ?>
            <!-- 无内容提示 -->
            <div class="no-posts">
                <div class="no-posts-icon">
                    <?php echo westlife_lucide_icon('calendar-x-2'); ?>
                </div>
                <h2><?php esc_html_e('暂无文章', 'westlife'); ?></h2>
                <p><?php esc_html_e('这个时间段还没有发布文章。', 'westlife'); ?></p>
            </div>
        <?php endif; ?>
    </div>
</main>

<?php get_footer(); ?>
