<?php get_header(); ?>

<main class="site-main">
    <div class="container">
        <div class="error-404 not-found">
            <div class="error-content">
                <!-- 404图标 -->
                <div class="error-icon">
                    <i class="fas fa-ghost"></i>
                </div>

                <!-- 错误信息 -->
                <h1 class="error-title">
                    <?php esc_html_e('404', 'westlife'); ?>
                </h1>
                <div class="error-subtitle">
                    <?php esc_html_e('页面未找到', 'westlife'); ?>
                </div>
                <p class="error-text">
                    <?php esc_html_e('抱歉，您访问的页面不存在或已被删除。', 'westlife'); ?>
                </p>

                <!-- 搜索框 -->
                <div class="error-search">
                    <form role="search" method="get" class="search-form" action="<?php echo esc_url(home_url('/')); ?>">
                        <div class="search-input-wrap">
                            <input type="search"
                                class="search-field"
                                placeholder="<?php echo esc_attr_x('搜索...', 'placeholder', 'westlife'); ?>"
                                value="<?php echo get_search_query(); ?>"
                                name="s"
                                required>
                        </div>
                    </form>
                </div>

                <!-- 帮助链接 -->
                <div class="error-help">
                    <a href="<?php echo esc_url(home_url('/')); ?>" class="home-link">
                        <i class="fas fa-home"></i>
                        <?php esc_html_e('返回首页', 'westlife'); ?>
                    </a>
                    <a href="javascript:history.back();" class="back-link">
                        <i class="fas fa-arrow-left"></i>
                        <?php esc_html_e('返回上页', 'westlife'); ?>
                    </a>
                </div>
            </div>
        </div>
    </div>
</main>

<?php get_footer(); ?>