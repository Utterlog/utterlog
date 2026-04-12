<?php

/**
 * 相关文章列表（增强版策略）
 * 优先：同分类 + 关键词相似
 * 其次：同分类下热度（浏览量/评论）
 * 再次：关键词相似（不限分类）
 * 兜底：全站热度/评论/最新
 */

if (!get_post()) return;

$current_post_id = get_the_ID();
?>

<!-- 始终输出相关文章容器，即使为空 -->
<div class="related-posts is-frame">
    <div class="related-header">
        <h3 class="related-title">
            <?php echo westlife_lucide_icon('fa-star', ['style' => 'color:#ffd43b;']); ?>
            <?php _e('相关推荐', 'westlife'); ?>
        </h3>

        <div class="related-actions">
            <span class="related-random-text"><?php _e('换一批看看', 'westlife'); ?></span>
            <button class="related-random-btn" data-post-id="<?php echo absint($current_post_id); ?>">
                <svg class="icon-refresh" viewBox="0 0 1024 1024" width="18" height="18" aria-hidden="true" focusable="false">
                    <path fill="currentColor" d="M514 114.3c-219.9 0-398.9 178.9-398.9 398.8 0.1 220 179 398.9 398.9 398.9 219.9 0 398.8-178.9 398.8-398.8S733.9 114.3 514 114.3z m218.3 489v1.7c0 0.5-0.1 1-0.1 1.6 0 0.3 0 0.6-0.1 0.9 0 0.5-0.1 1-0.2 1.5 0 0.3-0.1 0.7-0.1 1-0.1 0.4-0.1 0.8-0.2 1.2-0.1 0.4-0.2 0.9-0.2 1.3-0.1 0.3-0.1 0.6-0.2 0.8-0.1 0.6-0.3 1.2-0.4 1.8 0 0.1-0.1 0.2-0.1 0.3-2.2 8.5-6.6 16.6-13.3 23.3L600.7 755.4c-20 20-52.7 20-72.6 0-20-20-20-52.7 0-72.6l28.9-28.9H347c-28.3 0-51.4-23.1-51.4-51.4 0-28.3 23.1-51.4 51.4-51.4h334c13.2 0 26.4 5 36.4 15s15 23.2 15 36.4c0 0.3-0.1 0.6-0.1 0.8z m0.1-179.5c0 28.3-23.1 51.4-51.4 51.4H347c-13.2 0-26.4-5-36.4-15s-15-23.2-15-36.4v-0.8-1.6c0-0.5 0.1-1.1 0.1-1.6 0-0.3 0-0.6 0.1-0.9 0-0.5 0.1-1 0.2-1.5 0-0.3 0.1-0.7 0.1-1 0.1-0.4 0.1-0.8 0.2-1.2 0.1-0.4 0.2-0.9 0.2-1.3 0.1-0.3 0.1-0.6 0.2-0.8 0.1-0.6 0.3-1.2 0.4-1.8 0-0.1 0.1-0.2 0.1-0.3 2.2-8.5 6.6-16.6 13.3-23.3l116.6-116.6c20-20 52.7-20 72.6 0 20 20 20 52.7 0 72.6L471 372.5h210c28.2 0 51.4 23.1 51.4 51.3z"></path>
                </svg>
                <?php echo westlife_lucide_icon('fa-circle-notch fa-spin', ['class' => 'u-hidden']); ?>
            </button>
        </div>
    </div>

    <!-- 始终输出空的 related-grid，内容由 JS 动态加载 -->
    <div class="related-grid">
        <!-- 内容将通过 AJAX 动态加载 -->
    </div>
</div>
