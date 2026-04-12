<?php
// 计算当前循环索引（WP_Query 内部 current_post 从 0 开始）
$__wl_loop_index = isset($GLOBALS['wp_query']) ? (int) $GLOBALS['wp_query']->current_post : 0;
?>
<article id="post-<?php the_ID(); ?>" <?php post_class('post-card'); ?> data-index="<?php echo esc_attr($__wl_loop_index); ?>">
    <?php
    $post_id = get_the_ID();
    $permalink = get_permalink();
    $title = get_the_title();
    $categories = get_the_category();
    $first_category = !empty($categories) ? $categories[0] : null;
    $tags = has_tag() ? get_the_tags() : array();

    // 是否为当前循环中的首个卡片（用于设置 LCP 优先级）
    $is_first_card = isset($GLOBALS['wp_query']) && 0 === (int) $GLOBALS['wp_query']->current_post;
    ?>

    <div class="post-thumbnail-wrapper" data-post-id="<?php echo esc_attr($post_id); ?>">
        <div class="post-thumbnail">
            <a href="<?php echo esc_url($permalink); ?>" aria-label="<?php echo esc_attr($title); ?>">
                <?php echo westlife_render_post_thumbnail($post_id, 'list', $is_first_card ? 0 : $GLOBALS['wp_query']->current_post); ?>
            </a>
        </div>
        <?php if ($first_category): ?>
            <div class="post-category">
                <a href="<?php echo esc_url(get_category_link($first_category->term_id)); ?>">
                    <?php echo esc_html($first_category->name); ?>
                </a>
            </div>
        <?php endif; ?>

        <!-- 标题遮罩层 -->
        <div class="post-thumbnail-overlay">
            <h2 class="post-title">
                <a href="<?php echo esc_url($permalink); ?>">
                    <?php echo esc_html($title); ?>
                </a>
            </h2>
        </div>
    </div>

    <!-- 文章摘要/右侧内容（单列横卡片时承载 标题+摘要 两行） -->
    <div class="post-content">
        <!-- 顶部一行：左标题 + 右侧分类（单列显示） -->
        <div class="post-topline">
            <h2 class="post-title-inline">
                <a href="<?php echo esc_url($permalink); ?>">
                    <?php echo esc_html($title); ?>
                </a>
            </h2>
            <?php if ($first_category): ?>
                <div class="post-category-inline">
                    <a href="<?php echo esc_url(get_category_link($first_category->term_id)); ?>">
                        <?php echo esc_html($first_category->name); ?>
                    </a>
                </div>
            <?php endif; ?>
        </div>
        <div class="post-excerpt">
            <?php
            $excerpt = wp_trim_words(
                get_the_excerpt(),
                apply_filters('westlife_excerpt_length', 150), // 调整摘要长度
                apply_filters('westlife_excerpt_more', '...')
            );
            echo wp_kses_post($excerpt);
            ?>
        </div>
    </div>

    <!-- 底部信息 -->
    <div class="post-footer">
        <!-- 左侧元信息 -->
        <div class="post-meta">
            <span class="post-date">
                <time datetime="<?php echo get_the_date('c'); ?>">
                    <?php
                    // 使用 westlife_format_time 函数显示相对时间
                    echo westlife_format_time(get_post_timestamp(), true);
                    ?>
                </time>
            </span>
            <span class="post-views">
                <?php echo westlife_lucide_icon('eye'); ?>
                <span><?php
                        $views = get_post_meta($post_id, 'post_views', true);
                        echo number_format_i18n(absint($views));
                        ?></span>
            </span>
            <?php if (comments_open()): ?>
                <span class="post-comments">
                    <?php echo westlife_lucide_icon('message-circle'); ?>
                    <span><?php comments_number('0', '1', '%'); ?></span>
                </span>
            <?php endif; ?>
        </div>

        <!-- 右侧标签 -->
        <?php if (!empty($tags)): ?>
            <div class="post-tags">
                <?php foreach ($tags as $tag): ?>
                    <a href="<?php echo esc_url(get_tag_link($tag->term_id)); ?>"
                        class="tag-link"
                        rel="tag">
                        <?php echo esc_html($tag->name); ?>
                    </a>
                <?php endforeach; ?>
            </div>
        <?php endif; ?>
    </div>
</article>
