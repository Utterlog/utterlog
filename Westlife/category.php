<?php

/**
 * 分类页面模板
 */
get_header();
?>

<!-- 使用与首页相同的结构 -->
<main id="main" class="site-main">
    <div class="container">
        <!-- 分类导航 -->
        <div class="category-nav">
            <?php
            westlife_category_nav(array(
                'theme_location' => 'category',
                'container' => false,
                'menu_class' => 'category-list',
                'fallback_cb' => 'westlife_category_fallback',
                'items_wrap' => '<div class="%2$s" id="category-nav">%3$s</div>',
                'walker' => new WestLife_Category_Walker()
            ));
            ?>
        </div>

        <!-- 文章列表区域 -->
        <div class="posts-grid">
            <?php
            if (have_posts()) :
                while (have_posts()) :
                    the_post();
                    get_template_part('template-parts/content', 'card');
                endwhile;
            else :
                get_template_part('template-parts/content', 'none');
            endif;
            ?>
        </div>

        <!-- 分页导航 - 只在有分页时显示 -->
        <?php 
        global $wp_query;
        if ($wp_query->max_num_pages > 1) :
        ?>
            <div class="pagination-wrapper is-posts">
                <?php
                the_posts_pagination(array(
                    'prev_text' => westlife_lucide_icon('chevron-left'),
                    'next_text' => westlife_lucide_icon('chevron-right'),
                    'mid_size' => 2,
                    'screen_reader_text' => ' ',
                    'class' => 'pagination'
                ));
                ?>
            </div>
        <?php endif; ?>
    </div>
</main>

<?php get_footer(); ?>
