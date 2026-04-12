<?php

/**
 * 单篇文章模板
 *
 * @package Westlife
 */

get_header();

// 文章页面类型判断
$post_type = get_post_type();
$post_format = get_post_format();
?>
<!-- 主页面 -->
<main class="single-main">
    <div class="main-container container">
        <!-- 左侧内容区域 -->
        <div class="content-wrapper">
            <div class="main-content">
                <?php
                // 统计访问量
                while (have_posts()) :
                    the_post();
                ?>
                    <article id="post-<?php the_ID(); ?>" <?php post_class('article-content'); ?>>
                        <header class="entry-header">
                            <h1 class="entry-title"><?php the_title(); ?></h1>

                            <!-- 文章分类 -->
                            <?php if ($categories = get_the_category()) : ?>
                                <div class="entry-categories">
                                    <?php foreach ($categories as $category) : ?>
                                        <span class="category-name">
                                            <?php echo esc_html($category->name); ?>
                                        </span>
                                    <?php endforeach; ?>
                                </div>
                            <?php endif; ?>

                            <!-- 文章元信息 -->
                            <div class="entry-meta">
                                <?php do_action('westlife_before_post_meta'); ?>

                                <span class="post-date">
                                    <?php echo westlife_lucide_icon('calendar'); ?>
                                    <?php echo get_the_date(); ?>
                                </span>

                                <span class="single-post-views">
                                    <?php echo westlife_lucide_icon('flame'); ?>
                                    <span class="views-count">
                                        <?php
                                        $views = get_post_meta(get_the_ID(), 'post_views', true);
                                        echo number_format_i18n(absint($views));
                                        ?>
                                    </span>
                                </span>

                                <?php if (function_exists('westlife_handle_word_count')): ?>
                                    <?php
                                    $stats = westlife_handle_word_count(get_the_ID());
                                    if (!empty($stats)):
                                    ?>
                                        <span class="post-words">
                                            <?php echo westlife_lucide_icon('file-text'); ?>
                                            <?php echo westlife_format_words($stats['words']); ?>
                                        </span>
                                        <span class="post-reading-time">
                                            <?php echo westlife_lucide_icon('clock-3'); ?>
                                            预计 <?php echo $stats['reading_time']; ?> 分钟
                                        </span>
                                    <?php endif; ?>
                                <?php endif; ?>

                                <?php if (comments_open()) : ?>
                                    <span class="post-comments">
                                        <a href="#comments" class="scroll-to-comments">
                                            <?php echo westlife_lucide_icon('message-circle'); ?>
                                            <?php comments_number('0', '1', '%'); ?>
                                        </a>
                                    </span>
                                <?php endif; ?>

                                <?php if (current_user_can('edit_post', get_the_ID())) : ?>
                                    <span class="post-edit">
                                        <a href="<?php echo get_edit_post_link(); ?>" class="edit-link">
                                            <?php echo westlife_lucide_icon('pencil'); ?>
                                            <?php _e('编辑', 'westlife'); ?>
                                        </a>
                                    </span>
                                <?php endif; ?>

                                <?php do_action('westlife_after_post_meta'); ?>
                            </div>
                        </header>

                        <!-- 文章内容 -->
                        <div class="entry-content">
                            <?php
                            // 检查文章是否超过6个月未更新
                            $post_date = get_the_modified_date('U');
                            $current_date = current_time('timestamp');
                            $months_old = ($current_date - $post_date) / (30 * 24 * 60 * 60);

                            if ($months_old > 6) :
                                ?>
                                <div class="article-outdated">
                                    <?php echo westlife_lucide_icon('circle-alert'); ?>
                                    <div class="outdated-content">
                                        <strong>温馨提示：</strong>
                                        <p>本文最后更新于 <?php echo human_time_diff($post_date, $current_date); ?>前，文中所描述的信息可能已发生改变，请谨慎参考。</p>
                                    </div>
                                </div>
                            <?php
                            endif;

                            // 输出文章内容
                            $content = get_the_content();
                            $content = apply_filters('the_content', $content);
                            echo $content;

                            // 分页链接
                            wp_link_pages(array(
                                'before' => '<div class="page-links"><span class="page-links-title">' . __('分页:', 'westlife') . '</span>',
                                'after' => '</div>',
                                'link_before' => '<span>',
                                'link_after' => '</span>',
                            ));
                            ?>

                            <!-- 文章结束标识（静态版） -->
                            <div class="article-end" role="separator" aria-label="文章结束">
                                <div class="end-line"></div>
                                <div class="end-badge" aria-hidden="true">
                                    <span class="end-text">END</span>
                                </div>
                            </div>

                            <?php
                            // 分页链接
                            wp_link_pages(array(
                                'before' => '<div class="page-links"><span class="page-links-title">' . __('分页:', 'westlife') . '</span>',
                                'after' => '</div>',
                                'link_before' => '<span>',
                                'link_after' => '</span>',
                            ));
                            ?>
                        </div>

                        <!-- 文章底部 -->
                        <footer class="entry-footer">
                            <!-- 分类和标签区域 -->
                            <div class="entry-taxonomy">
                                <div class="taxonomy-left">
                                    <div class="post-share">
                                        <!-- 分享按钮区域 -->
                                        <?php get_template_part('template-parts/content', 'share'); ?>
                                    </div>
                                </div>

                                <div class="taxonomy-center">
                                    <?php
                                    $reaction_counts = function_exists('westlife_get_reaction_counts')
                                        ? westlife_get_reaction_counts(get_the_ID())
                                        : ['like' => 0, 'clap' => 0, 'party' => 0];
                                    ?>
                                    <!-- 轻量表情/点赞（持久化计数） -->
                                    <ul class="reactions" aria-label="表情反馈" data-post-id="<?php echo esc_attr(get_the_ID()); ?>">
                                        <li>
                                            <button class="react-btn" type="button" data-type="like" aria-label="点赞">
                                                <span class="react-emoji">👍</span>
                                                <span class="react-count"><?php echo number_format_i18n($reaction_counts['like']); ?></span>
                                            </button>
                                        </li>
                                        <li>
                                            <button class="react-btn" type="button" data-type="clap" aria-label="鼓掌">
                                                <span class="react-emoji">👏</span>
                                                <span class="react-count"><?php echo number_format_i18n($reaction_counts['clap']); ?></span>
                                            </button>
                                        </li>
                                        <li>
                                            <button class="react-btn" type="button" data-type="party" aria-label="撒花">
                                                <span class="react-emoji">🎉</span>
                                                <span class="react-count"><?php echo number_format_i18n($reaction_counts['party']); ?></span>
                                            </button>
                                        </li>
                                    </ul>
                                </div>

                                <div class="taxonomy-right">
                                    <?php if ($tags = get_the_tags()) : ?>
                                        <div class="single-tags" data-count="<?php echo count($tags); ?>">
                                            <?php foreach ($tags as $tag) : ?>
                                                <a href="<?php echo esc_url(get_tag_link($tag->term_id)); ?>" title="<?php echo esc_attr($tag->description); ?>">
                                                    <?php
                                                    echo '<span class="tag-hash">#</span>';
                                                    echo esc_html($tag->name);
                                                    echo '<span class="count">' . number_format_i18n($tag->count) . '</span>';
                                                    ?>
                                                </a>
                                            <?php endforeach; ?>
                                        </div>
                                    <?php endif; ?>
                                </div>

                            </div>

                            <?php get_template_part('template-parts/content', 'entry-meta'); ?>

                            <!-- 相关文章推荐 -->
                            <?php get_template_part('template-parts/content', 'related'); ?>

                            <!-- 评论区 -->
                            <?php
                            // 加载评论模板
                            if (comments_open() || get_comments_number()) {
                                comments_template();
                            }
                            ?>
                    </article>
                    </footer>
                <?php endwhile; ?>
            </div>
        </div>

        <!-- 右侧目录 -->
        <aside class="article-toc">
            <div class="toc-container">
                <h3 class="toc-title">
                    <span class="toc-title-text">文章目录</span>
                </h3>
                <ul id="toc" class="toc-list"></ul>
            </div>
        </aside>
    </div>
    </div>
</main>

<?php
get_footer();
?>
