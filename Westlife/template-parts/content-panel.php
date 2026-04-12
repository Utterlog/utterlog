<?php

/**
 * 功能面板模板（重构版）
 * @package Westlife
 */
if (!defined('ABSPATH')) exit;

global $wpdb;

$panel_cache = get_transient('westlife_content_panel_data_v2');
if (!is_array($panel_cache)) {
    $admin_ids = get_users(array('role' => 'administrator', 'fields' => 'ID'));
    $admin_ids = array_map('intval', (array) $admin_ids);

    $raw_comments = get_comments(array(
        'number'      => 30,
        'status'      => 'approve',
        'post_status' => 'publish',
        'orderby'     => 'comment_date_gmt',
        'order'       => 'DESC',
    ));
    $latest_comment_ids = array();
    if ($raw_comments) {
        foreach ($raw_comments as $c) {
            $user_id = (int) $c->user_id;
            if ($user_id > 0 && (in_array($user_id, $admin_ids, true) || user_can($user_id, 'manage_options'))) {
                continue;
            }
            $latest_comment_ids[] = (int) $c->comment_ID;
            if (count($latest_comment_ids) >= 10) {
                break;
            }
        }
    }

    $year_cards = array();
    $current_year = (int) date_i18n('Y');
    for ($i = 0; $i < 3; $i++) {
        $y = $current_year - $i;
        $start = "$y-01-01 00:00:00";
        $end   = ($y + 1) . "-01-01 00:00:00";
        $count = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(*) FROM {$wpdb->posts}
             WHERE post_type = 'post' AND post_status = 'publish'
             AND post_date >= %s AND post_date < %s",
            $start,
            $end
        ));
        $year_cards[] = array(
            'year'  => $y,
            'count' => $count,
            'url'   => get_year_link($y),
        );
    }

    $admin_ids_str = !empty($admin_ids) ? implode(',', $admin_ids) : '0';
    $top_commenters = $wpdb->get_results("
        SELECT COALESCE(c.user_id, 0) AS user_id,
               c.comment_author       AS author,
               c.comment_author_email AS email,
               c.comment_author_url   AS url,
               COUNT(*) AS comments_count
        FROM {$wpdb->comments} c
        INNER JOIN {$wpdb->posts} p ON p.ID = c.comment_post_ID
        WHERE c.comment_approved = '1'
          AND p.post_status = 'publish'
          AND p.post_type = 'post'
          AND c.comment_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
          AND (
              c.user_id = 0 OR
              (c.user_id > 0 AND c.user_id NOT IN ($admin_ids_str))
          )
        GROUP BY COALESCE(c.user_id, 0), c.comment_author, c.comment_author_email, c.comment_author_url
        ORDER BY comments_count DESC
        LIMIT 5
    ");

    $filtered_top_commenters = array();
    if ($top_commenters) {
        foreach ($top_commenters as $commenter) {
            $user_id = (int) $commenter->user_id;
            if ($user_id > 0 && (in_array($user_id, $admin_ids, true) || user_can($user_id, 'manage_options'))) {
                continue;
            }
            $filtered_top_commenters[] = $commenter;
        }
    }

    $panel_cache = array(
        'latest_comment_ids' => $latest_comment_ids,
        'year_cards'         => $year_cards,
        'all_posts_count'    => (int) $wpdb->get_var("SELECT COUNT(*) FROM {$wpdb->posts} WHERE post_type='post' AND post_status='publish'"),
        'popular_6m_ids'     => get_posts(array(
            'post_type'              => 'post',
            'post_status'            => 'publish',
            'posts_per_page'         => 5,
            'meta_key'               => 'post_views',
            'orderby'                => 'meta_value_num',
            'order'                  => 'DESC',
            'date_query'             => array(array('after' => '6 months ago', 'inclusive' => true)),
            'fields'                 => 'ids',
            'no_found_rows'          => true,
            'update_post_meta_cache' => false,
            'update_post_term_cache' => false,
        )),
        'most_commented_ids' => get_posts(array(
            'post_type'              => 'post',
            'post_status'            => 'publish',
            'posts_per_page'         => 5,
            'orderby'                => 'comment_count',
            'order'                  => 'DESC',
            'fields'                 => 'ids',
            'no_found_rows'          => true,
            'update_post_meta_cache' => false,
            'update_post_term_cache' => false,
        )),
        'most_viewed_all_ids' => get_posts(array(
            'post_type'              => 'post',
            'post_status'            => 'publish',
            'posts_per_page'         => 5,
            'meta_key'               => 'post_views',
            'orderby'                => 'meta_value_num',
            'order'                  => 'DESC',
            'fields'                 => 'ids',
            'no_found_rows'          => true,
            'update_post_meta_cache' => false,
            'update_post_term_cache' => false,
        )),
        'top_commenters' => $filtered_top_commenters,
    );

    set_transient('westlife_content_panel_data_v2', $panel_cache, 10 * MINUTE_IN_SECONDS);
}

$latest_comments = !empty($panel_cache['latest_comment_ids']) ? get_comments(array(
    'comment__in' => array_map('absint', $panel_cache['latest_comment_ids']),
    'orderby'     => 'comment__in',
    'status'      => 'approve',
)) : array();
$year_cards = $panel_cache['year_cards'] ?? array();
$all_posts_count = (int) ($panel_cache['all_posts_count'] ?? 0);
$all_posts_url = get_post_type_archive_link('post');
$popular_6m = !empty($panel_cache['popular_6m_ids']) ? get_posts(array(
    'post_type'      => 'post',
    'post_status'    => 'publish',
    'post__in'       => array_map('absint', $panel_cache['popular_6m_ids']),
    'orderby'        => 'post__in',
    'posts_per_page' => 5,
)) : array();
$most_commented = !empty($panel_cache['most_commented_ids']) ? get_posts(array(
    'post_type'      => 'post',
    'post_status'    => 'publish',
    'post__in'       => array_map('absint', $panel_cache['most_commented_ids']),
    'orderby'        => 'post__in',
    'posts_per_page' => 5,
)) : array();
$most_viewed_all = !empty($panel_cache['most_viewed_all_ids']) ? get_posts(array(
    'post_type'      => 'post',
    'post_status'    => 'publish',
    'post__in'       => array_map('absint', $panel_cache['most_viewed_all_ids']),
    'orderby'        => 'post__in',
    'posts_per_page' => 5,
)) : array();
$top_commenters = is_array($panel_cache['top_commenters'] ?? null) ? $panel_cache['top_commenters'] : array();
?>

<div id="site-panel" class="site-panel" aria-hidden="true">
    <div class="site-panel-backdrop" data-close-panel></div>

    <div class="site-panel-dialog" role="dialog" aria-modal="true" aria-labelledby="site-panel-title">
        <div class="panel-header">
            <h3 id="site-panel-title"><?php echo westlife_lucide_icon('layers-3'); ?> <?php esc_html_e('功能面板', 'westlife'); ?></h3>
            <button class="panel-close" data-close-panel aria-label="<?php esc_attr_e('关闭面板', 'westlife'); ?>">
                <?php echo westlife_lucide_icon('x'); ?>
            </button>
        </div>

        <div class="panel-content">
            <!-- 背景特效层：移植自首页评论飘动模块 -->
            <div class="floating-bg-effects" aria-hidden="true">
                <div class="bg-particle"></div>
                <div class="bg-particle"></div>
                <div class="bg-particle"></div>
                <div class="bg-particle"></div>
                <div class="bg-particle"></div>
            </div>
            <!-- 左侧 -->
            <div class="panel-left">

                <!-- 最新评论（排除管理员） -->
                <div class="panel-section">
                    <h4><?php echo westlife_lucide_icon('messages-square'); ?> <?php esc_html_e('最新评论', 'westlife'); ?></h4>
                    <div class="panel-comments">
                        <?php if (!empty($latest_comments)) : ?>
                            <?php foreach ($latest_comments as $comment) :
                                $comment_link = get_comment_link($comment);
                                $post_title   = get_the_title($comment->comment_post_ID);
                            ?>
                                <div class="panel-comment-item">
                                    <a href="<?php echo esc_url($comment_link); ?>">
                                        <div class="panel-comment-avatar">
                                            <?php echo get_avatar($comment, 44); ?>
                                        </div>

                                        <div class="panel-comment-body">
                                            <div class="panel-comment-head">
                                                <span class="panel-comment-author"><?php echo esc_html($comment->comment_author); ?></span>
                                                <span class="panel-comment-time">
                                                    <?php echo westlife_lucide_icon('clock-3'); ?>
                                                    <?php echo esc_html(get_comment_date('Y-m-d H:i', $comment)); ?>
                                                </span>
                                            </div>

                                            <p class="panel-comment-excerpt">
                                                <?php echo esc_html(wp_trim_words(wp_strip_all_tags($comment->comment_content), 26)); ?>
                                            </p>

                                            <div class="panel-comment-foot">
                                                <span class="panel-comment-post"><?php echo westlife_lucide_icon('message-circle'); ?> <?php echo esc_html($post_title); ?></span>
                                            </div>

                                        </div>
                                    </a>
                                </div>
                            <?php endforeach; ?>
                        <?php else : ?>
                            <div class="panel-empty"><?php esc_html_e('暂无评论', 'westlife'); ?></div>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- 评论榜：最近1个月评论最多的 5 位 -->
                <div class="panel-section">
                    <h4><?php echo westlife_lucide_icon('users'); ?> <?php esc_html_e('评论榜（近30天）', 'westlife'); ?></h4>

                    <?php if (!empty($top_commenters)) : ?>
                        <div class="panel-top-commenters">
                            <?php foreach ($top_commenters as $row) :
                                $uid    = (int) $row->user_id;
                                $name   = $row->author !== '' ? $row->author : ($uid ? get_the_author_meta('display_name', $uid) : __('访客', 'westlife'));
                                $url    = $uid ? get_author_posts_url($uid) : (filter_var($row->url, FILTER_VALIDATE_URL) ? $row->url : '#');
                                $email  = $row->email ?: null;
                                $count  = (int) $row->comments_count;
                                // 头像（登录用户优先用 user_id，否则用邮箱）
                                $avatar = $uid ? get_avatar($uid, 64, '', esc_attr($name)) : get_avatar($email, 64, '', esc_attr($name));
                            ?>
                                <div class="commenter-card">
                                    <a class="commenter-avatar" href="<?php echo esc_url($url); ?>" title="<?php echo esc_attr($name); ?>">
                                        <?php echo $avatar; ?>
                                        <span class="commenter-badge"><?php echo number_format_i18n($count); ?></span>
                                    </a>
                                    <a class="commenter-name" href="<?php echo esc_url($url); ?>" title="<?php echo esc_attr($name); ?>">
                                        <?php echo esc_html($name); ?>
                                    </a>
                                </div>
                            <?php endforeach; ?>
                        </div>
                    <?php else : ?>
                        <div class="panel-empty"><?php esc_html_e('最近30天暂无评论', 'westlife'); ?></div>
                    <?php endif; ?>
                </div>

            </div>

            <!-- 右侧 -->
            <div class="panel-right">

                <!-- 年份统计（三年） + 全部文章 -->
                <div class="panel-section">
                    <h4><?php echo westlife_lucide_icon('archive'); ?> <?php esc_html_e('年份统计', 'westlife'); ?></h4>
                    <div class="panel-archives">
                        <?php foreach ($year_cards as $card) : ?>
                            <div class="panel-archive-item">
                                <a href="<?php echo esc_url($card['url']); ?>">
                                    <?php echo esc_html($card['year']); ?>
                                    <span class="panel-archive-count"><?php echo number_format_i18n($card['count']); ?></span>
                                </a>
                            </div>
                        <?php endforeach; ?>
                        <div class="panel-archive-item">
                            <a href="<?php echo esc_url($all_posts_url); ?>">
                                <?php esc_html_e('全部文章', 'westlife'); ?>
                                <span class="panel-archive-count"><?php echo number_format_i18n($all_posts_count); ?></span>
                            </a>
                        </div>
                    </div>
                </div>

                <!-- 热门文章（近6个月按浏览量） -->
                <div class="panel-section">
                    <h4><?php echo westlife_lucide_icon('flame'); ?> <?php esc_html_e('热门文章（近6个月）', 'westlife'); ?></h4>
                    <div class="panel-posts">
                        <?php if ($popular_6m) : foreach ($popular_6m as $p) : ?>
                                <?php
                                $dateY  = get_the_date('Y', $p);
                                $dateMd = get_the_date('md', $p);
                                $views  = (int) get_post_meta($p->ID, 'post_views', true); // 修改：统一使用 post_views
                                ?>
                                <div class="panel-post-item">
                                    <a class="panel-post-row" href="<?php echo esc_url(get_permalink($p)); ?>">
                                        <div class="post-datebox" aria-hidden="true">
                                            <span class="date-top"><?php echo esc_html($dateY); ?></span>
                                            <span class="date-bottom"><?php echo esc_html($dateMd); ?></span>
                                        </div>
                                        <h5 class="panel-post-title"><?php echo esc_html(get_the_title($p)); ?></h5>
                                        <div class="panel-post-count" title="<?php echo esc_attr(number_format_i18n($views)); ?>">
                                            <?php echo westlife_lucide_icon('eye', ['aria-hidden' => 'true']); ?>
                                            <span class="count"><?php echo number_format_i18n($views); ?></span>
                                        </div>
                                    </a>
                                </div>
                            <?php endforeach;
                        else : ?>
                            <div class="panel-empty"><?php esc_html_e('暂无热门文章', 'westlife'); ?></div>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- 热评文章（评论数最多） -->
                <div class="panel-section">
                    <h4><?php echo westlife_lucide_icon('messages-square'); ?> <?php esc_html_e('热评文章', 'westlife'); ?></h4>
                    <div class="panel-posts">
                        <?php if ($most_commented) : foreach ($most_commented as $p) : ?>
                                <?php
                                $dateY   = get_the_date('Y', $p);
                                $dateMd  = get_the_date('md', $p);
                                $comments = (int) get_comments_number($p);
                                ?>
                                <div class="panel-post-item">
                                    <a class="panel-post-row" href="<?php echo esc_url(get_permalink($p)); ?>">
                                        <div class="post-datebox" aria-hidden="true">
                                            <span class="date-top"><?php echo esc_html($dateY); ?></span>
                                            <span class="date-bottom"><?php echo esc_html($dateMd); ?></span>
                                        </div>
                                        <h5 class="panel-post-title"><?php echo esc_html(get_the_title($p)); ?></h5>
                                        <div class="panel-post-count" title="<?php echo esc_attr(number_format_i18n($comments)); ?>">
                                            <?php echo westlife_lucide_icon('messages-square', ['aria-hidden' => 'true']); ?>
                                            <span class="count"><?php echo number_format_i18n($comments); ?></span>
                                        </div>
                                    </a>
                                </div>
                            <?php endforeach;
                        else : ?>
                            <div class="panel-empty"><?php esc_html_e('暂无热评文章', 'westlife'); ?></div>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- 全站浏览最多 -->
                <div class="panel-section">
                    <h4><?php echo westlife_lucide_icon('chart-column'); ?> <?php esc_html_e('全站浏览最多', 'westlife'); ?></h4>
                    <div class="panel-posts">
                        <?php if ($most_viewed_all) : foreach ($most_viewed_all as $p) : ?>
                                <?php
                                $dateY  = get_the_date('Y', $p);
                                $dateMd = get_the_date('md', $p);
                                $views  = (int) get_post_meta($p->ID, 'post_views', true); // 修改：统一使用 post_views
                                ?>
                                <div class="panel-post-item">
                                    <a class="panel-post-row" href="<?php echo esc_url(get_permalink($p)); ?>">
                                        <div class="post-datebox" aria-hidden="true">
                                            <span class="date-top"><?php echo esc_html($dateY); ?></span>
                                            <span class="date-bottom"><?php echo esc_html($dateMd); ?></span>
                                        </div>
                                        <h5 class="panel-post-title"><?php echo esc_html(get_the_title($p)); ?></h5>
                                        <div class="panel-post-count" title="<?php echo esc_attr(number_format_i18n($views)); ?>">
                                            <?php echo westlife_lucide_icon('eye', ['aria-hidden' => 'true']); ?>
                                            <span class="count"><?php echo number_format_i18n($views); ?></span>
                                        </div>
                                    </a>
                                </div>
                            <?php endforeach;
                        else : ?>
                            <div class="panel-empty"><?php esc_html_e('暂无数据', 'westlife'); ?></div>
                        <?php endif; ?>
                    </div>
                </div>

                <!-- 所有关键词 -->
                <div class="panel-section">
                    <h4><?php echo westlife_lucide_icon('tags'); ?> <?php esc_html_e('关键词', 'westlife'); ?></h4>
                    <div class="panel-tags">
                        <?php
                        $terms = get_terms(array(
                            'taxonomy'   => 'post_tag',
                            'orderby'    => 'count',
                            'order'      => 'DESC',
                            'number'     => 100,
                            'hide_empty' => true,
                        ));
                        if (!is_wp_error($terms) && $terms) :
                            foreach ($terms as $term) :
                                $link  = get_term_link($term);
                                $count = (int) $term->count;
                        ?>
                                <a href="<?php echo esc_url($link); ?>"
                                    data-count="<?php echo esc_attr($count); ?>"
                                    aria-label="<?php echo esc_attr(sprintf('%s（%d）', $term->name, $count)); ?>">
                                    <?php echo esc_html($term->name); ?>
                                </a>
                            <?php
                            endforeach;
                        else :
                            ?>
                            <div class="panel-empty"><?php esc_html_e('暂无关键词', 'westlife'); ?></div>
                        <?php endif; ?>
                    </div>
                </div>

            </div>
        </div>
    </div>
</div>
