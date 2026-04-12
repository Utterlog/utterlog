<?php

/**
 * 评论模板
 * @package Westlife
 */

if (!defined('ABSPATH')) exit;
if (post_password_required()) return;

// 获取评论参数（固定每页20条，仅顶级评论）
$comments_per_page = 20;
$total_comments = get_comments_number();

// 获取顶级评论数量（不包括回复）
$parent_comments_count = get_comments([
    'post_id' => get_the_ID(),
    'status' => 'approve',
    'parent' => 0,
    'count' => true,
    'type' => 'comment'
]);

// 判断是否有更多评论（基于顶级评论数）
$has_more = $parent_comments_count > $comments_per_page;
?>

<div id="comments" class="comments-area">

    <!-- 评论头部：无论是否有评论都显示 -->
    <div class="comments-header">
        <div class="header-main">
            <h2 class="comments-title">
                <?php echo westlife_lucide_icon('fa-solid fa-comments'); ?>
                <span class="title-text"><?php printf('《%s》', get_the_title()); ?></span>
            </h2>
            <div class="comments-meta">
                <div class="meta-item">
                    <?php echo westlife_lucide_icon('fa-solid fa-users'); ?>
                    <span class="meta-count unique-commenters-count"><?php echo westlife_get_unique_commenters_count(); ?></span>
                    <span class="meta-text">位吃瓜群众</span>
                </div>
                <div class="meta-divider"></div>
                <div class="meta-item">
                    <?php echo westlife_lucide_icon('fa-solid fa-comments'); ?>
                    <span class="meta-count total-comments-count"><?php echo get_comments_number(); ?></span>
                    <span class="meta-text">条热评</span>
                </div>
            </div>
        </div>
    </div>

    <?php if (have_comments()): ?>

        <!-- 评论列表容器 -->
        <div class="comments-container">
            <ol class="comment-list" id="comment-list">
                <?php
                // 获取第一页评论（只获取顶级评论，按最旧在上 ASC）
                $first_page_comments = get_comments(array(
                    'post_id' => get_the_ID(),
                    'status'  => 'approve',
                    'number'  => $comments_per_page,
                    'offset'  => 0,
                    'parent'  => 0,  // 只获取顶级评论
                    'order'   => 'ASC',
                    'orderby' => 'comment_date_gmt',
                    'type'    => 'comment'
                ));

                // 使用自定义渲染函数显示评论树，并计算全局楼层号（最早=1）
                if (!empty($first_page_comments)) {
                    $order = 'ASC'; // 与上面的查询保持一致
                    $offset = 0; // 首屏偏移为 0
                    $total_parents = (int) $parent_comments_count;
                    $i = 0;
                    foreach ($first_page_comments as $comment) {
                        $GLOBALS['comment'] = $comment;
                        // 计算全局楼层索引：ASC 情况下，本页第 i 条的索引 = offset + i + 1
                        $floor_index = ($order === 'ASC')
                            ? ($offset + $i + 1)
                            : max(1, $total_parents - $offset - $i);
                        westlife_render_comment_tree($comment, array(
                            'style'       => 'ol',
                            'short_ping'  => true,
                            'avatar_size' => 40,
                            'max_depth'   => 5,
                            'type'        => 'comment',
                            'floor_index' => $floor_index,
                        ), 1, 5);
                        $i++;
                    }
                }
                ?>
            </ol>

            <!-- 修改加载更多按钮的显示逻辑 -->
            <?php if ($has_more): ?>
                <div class="load-more-comments-wrapper">
                    <button id="load-more-comments"
                        class="load-more-btn"
                        data-page="2"
                        data-post-id="<?php echo get_the_ID(); ?>"
                        title="点击加载更多评论"
                        aria-label="点击加载更多评论">
                        <span class="load-text">
                            <?php echo westlife_lucide_icon('fa-solid fa-comments'); ?>
                            加载更多评论
                        </span>
                        <span class="wl-loading-text u-hidden" aria-hidden="true">
                            <span class="wl-fancy-loader" aria-hidden="true">
                                <span class="wf-static">loading</span>
                                <span class="wf-words" aria-hidden="true">
                                    <span class="wf-word">评论</span>
                                    <span class="wf-word">comments</span>
                                    <span class="wf-word">评论</span>
                                    <span class="wf-word">comments</span>
                                    <span class="wf-word">评论</span>
                                </span>
                            </span>
                        </span>
                    </button>
                </div>
            <?php endif; ?>

            <!-- 加载状态提示 -->
            <div class="comments-loading u-hidden"><!-- migrated: inline display:none -> u-hidden -->
                <?php echo westlife_lucide_icon('fa-solid fa-circle-notch fa-spin', ['class' => 'is-spin']); ?>
                <span>正在加载评论...</span>
            </div>

            <!-- 无更多评论提示 -->
            <div class="no-more-comments u-hidden"><!-- migrated: inline display:none -> u-hidden -->
                <?php echo westlife_lucide_icon('fa-solid fa-circle-check'); ?>
                <span>所有评论已加载完毕</span>
            </div>
        </div>

    <?php else: ?>
        <!-- 暂无评论：诙谐文案 + 跳动沙发 -->
        <div class="no-comments fun">
            <div class="bench-wrapper" aria-hidden="true">
                <i class="wl-icon fa-solid fa-couch sofa-icon" aria-hidden="true"></i>
            </div>
            <p class="no-comments-text">还没有评论，抢个沙发吧～</p>
            <a href="#respond" class="go-comment-btn" aria-label="马上去评论">
                <i class="wl-icon fa-solid fa-comment-dots" aria-hidden="true"></i>
                <span class="text">马上评论</span>
                <span class="arrow" aria-hidden="true">➜</span>
            </a>
        </div>
    <?php endif; ?>

    <!-- 评论表单原始位置 -->
    <div id="respond-original" class="comment-respond-position">
        <?php
        if (comments_open() && function_exists('westlife_get_comment_form_args')) {
            comment_form(westlife_get_comment_form_args());
        }
        ?>
    </div>
</div>
