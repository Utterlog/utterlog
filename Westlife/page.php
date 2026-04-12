<?php

/**
 * 页面模板
 * @package Westlife
 */

get_header(); ?>

<main id="main" class="site-main">
    <div class="container">
        <?php while (have_posts()) : the_post(); ?>
            <article id="post-<?php the_ID(); ?>" <?php post_class('article-content'); ?>>
                <!-- 文章头部 -->
                <header class="article-header">
                    <h1 class="article-title"><?php the_title(); ?></h1>

                    <div class="article-meta">
                        <!-- 编辑链接 -->
                        <?php if (current_user_can('edit_post', get_the_ID())): ?>
                            <span class="meta-item edit-link">
                                <?php edit_post_link(westlife_lucide_icon('pencil') . ' 编辑'); ?>
                            </span>
                        <?php endif; ?>
                    </div>
                </header>

                <!-- 文章内容 -->
                <div class="article-content">
                    <?php
                    the_content();

                    wp_link_pages(array(
                        'before' => '<div class="page-links"><span class="page-links-title">' . __('分页:', 'westlife') . '</span>',
                        'after'  => '</div>',
                        'link_before' => '<span class="page-number">',
                        'link_after'  => '</span>',
                    ));
                    ?>
                </div>

                <!-- 文章底部 -->
                <footer class="article-footer">
                    <?php
                    // 自定义字段展示区域
                    $custom_fields = get_post_custom();
                    if (!empty($custom_fields)): ?>
                        <div class="custom-fields">
                            <?php foreach ($custom_fields as $key => $value):
                                if (strpos($key, '_') !== 0): // 跳过以下划线开头的系统字段 
                            ?>
                                    <div class="custom-field">
                                        <span class="field-name"><?php echo esc_html($key); ?>:</span>
                                        <span class="field-value"><?php echo esc_html($value[0]); ?></span>
                                    </div>
                            <?php endif;
                            endforeach; ?>
                        </div>
                    <?php endif; ?>
                </footer>
            </article>

            <?php
            // 评论区域
            if (comments_open() || get_comments_number()) :
                comments_template();
            endif;
            ?>
        <?php endwhile; ?>
    </div>
</main>

<?php get_footer(); ?>
