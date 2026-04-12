<?php
/**
 * 搜索结果页面
 *
 * @package Westlife
 */

get_header(); ?>

<main class="site-main">
    <div class="container">
        <!-- 搜索页面头部 -->
        <header class="searchres-header">
            <div class="searchres-info">
                <h1 class="searchres-title">
                    <?php echo westlife_lucide_icon('search'); ?>
                    <span class="searchres-label">搜索关键词：</span>
                    <span class="searchres-query"><?php echo esc_html(get_search_query()); ?></span>
                </h1>
                <div class="searchres-stats">
                    <span class="searchres-count">
                        找到 <strong><?php echo number_format($wp_query->found_posts); ?></strong> 个结果
                    </span>
                    <?php if ($wp_query->found_posts > 0): ?>
                    <span class="searchres-time">
                        <?php echo westlife_lucide_icon('clock-3'); ?>
                        <?php global $timestart;
                        $timeend = microtime(true);
                        $timetotal = number_format($timeend - $timestart, 2);
                        printf('用时 %s 秒', $timetotal);
                        ?>
                    </span>
                    <?php endif; ?>
                </div>
            </div>
            
            <!-- 优化的搜索框 -->
            <form role="search" method="get" class="searchres-form" action="<?php echo esc_url(home_url('/')); ?>">
                <div class="searchres-input-wrap">
                    <?php echo westlife_lucide_icon('search', ['class' => 'searchres-icon']); ?>
                    <input type="search" 
                        class="searchres-field" 
                        placeholder="<?php echo esc_attr_x('试试其他关键词...', 'placeholder', 'westlife'); ?>" 
                        value="<?php echo get_search_query(); ?>" 
                        name="s" 
                        required>
                </div>
            </form>
        </header>

        <?php if (have_posts()) : ?>
            <div class="search-results">
                <?php while (have_posts()) : the_post(); ?>
                    <!-- 搜索结果项目 -->
                    <article id="post-<?php the_ID(); ?>" <?php post_class('search-result-item'); ?>>
                        <div class="search-item-content">
                            <h2 class="entry-title">
                                <a href="<?php the_permalink(); ?>">
                                    <?php
                                    $title = get_the_title();
                                    $search_query = get_search_query();
                                    if ($search_query) {
                                        $title = wp_kses_post(preg_replace('/(' . preg_quote($search_query, '/') . ')/i', '<mark>$1</mark>', $title));
                                    }
                                    echo $title;
                                    ?>
                                </a>
                            </h2>

                            <div class="entry-meta">
                                <span class="post-date">
                                    <?php echo westlife_lucide_icon('calendar'); ?>
                                    <?php echo get_the_date('Y-m-d'); ?>
                                </span>
                                <span class="post-category">
                                    <?php the_category(', '); ?>
                                </span>
                            </div>

                            <div class="entry-summary">
                                <?php
                                $excerpt = wp_trim_words(get_the_excerpt(), 100, '...');
                                if ($search_query) {
                                    $excerpt = wp_kses_post(preg_replace('/(' . preg_quote($search_query, '/') . ')/i', '<mark>$1</mark>', $excerpt));
                                }
                                echo $excerpt;
                                ?>
                            </div>
                        </div>
                    </article>
                <?php endwhile; ?>
            </div>

            <?php get_template_part('template-parts/pagination'); ?>

        <?php else : ?>
            <div class="no-results">
                <h2>未找到相关内容</h2>
                <p>没有找到与"<?php echo esc_html(get_search_query()); ?>"相关的内容，请尝试其他关键词。</p>
            </div>
        <?php endif; ?>
    </div>
</main>

<?php get_footer(); ?>
