<?php

/**
 * 主页模板文件
 *
 * @package Westlife
 */

get_header(); ?>

<main id="main" class="site-main">
    <div class="container">
        <?php $home_profile = function_exists('westlife_get_home_visitor_profile') ? westlife_get_home_visitor_profile() : []; ?>
        <div class="home-content-card has-intro">
            <!-- 个人介绍板块 -->
            <div class="intro-section">
                <?php
                // 计算 RSS 地址（用于右上角角标复制）
                $rss_url_corner = get_option('social_rss');
                if (empty($rss_url_corner) || !is_string($rss_url_corner)) {
                    $rss_url_corner = get_feed_link();
                }
                if (!empty($rss_url_corner)) : ?>
                    <div class="rss-corner" data-feed-url="<?php echo esc_attr($rss_url_corner); ?>" aria-hidden="false">
                        <button class="rss-corner-btn" type="button" aria-label="复制 RSS 订阅地址">
                            <span class="triangle" aria-hidden="true"></span>
                            <?php echo westlife_lucide_icon('rss', ['class' => 'rss-mark', 'aria-hidden' => 'true']); ?>
                            <?php echo westlife_lucide_icon('check', ['class' => 'copied-mark', 'aria-hidden' => 'true']); ?>
                        </button>
                        <div class="rss-popover" role="dialog" aria-modal="false" aria-label="订阅本站" hidden>
                            <div class="rss-popover-inner">
                                <div class="rss-pop-title">欢迎订阅</div>
                                <div class="rss-pop-url"><?php echo esc_html($rss_url_corner); ?></div>
                                <button class="rss-copy-btn" type="button" data-copy="<?php echo esc_attr($rss_url_corner); ?>">复制订阅地址</button>
                            </div>
                        </div>
                    </div>
                <?php endif; ?>

                <!-- 顶部三栏布局 -->
                <div class="intro-columns">
                    <!-- 左侧个人信息（已合并到下方模块，预留空位供后续自定义） -->
                    <div class="intro-left">
                        <div
                            class="profile-card merged-profile"
                            id="hf-visitor-card"
                            data-email="<?php echo esc_attr($home_profile['email'] ?? ''); ?>"
                            data-score="<?php echo esc_attr((string) ($home_profile['score'] ?? 0)); ?>"
                            data-level="<?php echo esc_attr($home_profile['level']['slug'] ?? 'newcomer'); ?>">
                            <div class="profile-top">
                                <div class="profile-avatar">
                                    <img
                                        src="<?php echo esc_url($home_profile['avatar_url'] ?? (get_template_directory_uri() . '/assets/images/avatar.jpg')); ?>"
                                        alt="<?php echo esc_attr(($home_profile['display_name'] ?? get_option('author_name', '博主')) . '的头像'); ?>"
                                        loading="lazy"
                                        decoding="async" />
                                </div>
                                <div class="profile-info">
                                    <div class="profile-name-row">
                                        <h2 class="profile-name"><?php echo esc_html($home_profile['display_name'] ?? get_option('author_name', '博主')); ?></h2>
                                    </div>
                                    <p class="profile-slogan" id="hf-profile-slogan"><?php echo esc_html($home_profile['slogan'] ?? get_option('author_slogan', '记录生活，分享技术')); ?></p>
                                    <div class="profile-greet" id="hf-greet" aria-live="polite"><?php echo esc_html($home_profile['greeting'] ?? '欢迎来到本站'); ?></div>
                                </div>
                            </div>
                            <div class="profile-stats">
                                <?php if (!empty($home_profile['is_admin'])) : ?>
                                    <?php $admin_metrics = is_array($home_profile['admin_metrics'] ?? null) ? $home_profile['admin_metrics'] : []; ?>
                                    <div class="profile-admin-panel" id="hf-admin-panel" aria-label="今日站点数据">
                                        <div class="pam-grid">
                                            <div class="pam-item">
                                                <span class="pam-label">今日浏览</span>
                                                <span class="pam-value" id="hf-admin-today-views"><?php echo esc_html((string) ($admin_metrics['today_views'] ?? 0)); ?></span>
                                            </div>
                                            <div class="pam-item">
                                                <span class="pam-label">今日评论</span>
                                                <span class="pam-value" id="hf-admin-today-comments"><?php echo esc_html((string) ($admin_metrics['today_comments'] ?? 0)); ?></span>
                                            </div>
                                            <div class="pam-item">
                                                <span class="pam-label">文章互动</span>
                                                <span class="pam-value" id="hf-admin-article-reactions"><?php echo esc_html((string) ($admin_metrics['article_reactions'] ?? 0)); ?></span>
                                            </div>
                                            <div class="pam-item">
                                                <span class="pam-label">说说赞</span>
                                                <span class="pam-value" id="hf-admin-memo-likes"><?php echo esc_html((string) ($admin_metrics['memo_likes'] ?? 0)); ?></span>
                                            </div>
                                            <div class="pam-item pam-item--full">
                                                <span class="pam-label">小鸟投喂</span>
                                                <span class="pam-value" id="hf-admin-bird-feeds"><?php echo esc_html((string) ($admin_metrics['bird_feeds'] ?? 0)); ?></span>
                                            </div>
                                        </div>
                                    </div>
                                <?php else : ?>
                                    <?php
                                    $active_score = (int) ($home_profile['score'] ?? 0);
                                    $active_class = $active_score < 100 ? 'ai-low' : ($active_score < 300 ? 'ai-mid' : 'ai-high');
                                    ?>
                                    <div class="active-index-wrapper <?php echo esc_attr($active_class); ?>" title="首页访问 +1，浏览文章 +1，评论文章 +3，说说点赞 +1，小鸟投喂 +1，文章点赞/鼓掌/撒花各 +2（按每日上限计分）">
                                        <span class="ai-label">活跃指数</span>
                                        <span class="ai-value" id="hf-active-index"><?php echo esc_html((string) $active_score); ?></span>
                                        <span
                                            class="profile-level-badge level-<?php echo esc_attr($home_profile['badge']['type'] ?? 'star'); ?>"
                                            id="hf-level-badge"
                                            title="<?php echo esc_attr($home_profile['level_hint'] ?? ($home_profile['level']['label'] ?? '见习访客')); ?>"
                                            aria-label="<?php echo esc_attr($home_profile['level_hint'] ?? ($home_profile['level']['label'] ?? '见习访客')); ?>">
                                            <?php echo wp_kses($home_profile['badge']['html'] ?? westlife_lucide_icon('star'), ['span' => ['data-lucide' => true, 'aria-hidden' => true, 'class' => true, 'title' => true, 'aria-label' => true]]); ?>
                                        </span>
                                    </div>
                                    <ul class="recent-feed" id="hf-recent-feed" aria-label="最新动态">
                                        <?php
                                        if (function_exists('westlife_render_home_recent_feeds')) {
                                            echo westlife_render_home_recent_feeds(3);
                                        } else {
                                            echo '<li class="rf-empty"><span class="rf-label">订阅</span><span>暂无订阅内容</span></li>';
                                        }
                                        ?>
                                    </ul>
                                <?php endif; ?>
                            </div>

                        </div>
                    </div>

                    <!-- 中间任务进度卡 -->
                    <div class="intro-center intro-center-slim">
                        <div class="tasks-center-card hf-card hf-block" id="hf-tasks-wrapper" aria-label="任务进度" data-endpoint="<?php echo esc_url(home_url('/wp-json/westlife/v1/tasks')); ?>" data-limit="3" data-max-item-height="60">
                            <div class="hf-block-head">
                                <span class="hf-mini-label">任务进度</span>
                            </div>
                            <ul class="hf-task-list" id="task-list-hf" aria-label="任务进度列表"></ul>
                            <div class="hf-task-empty" id="task-empty-hint" hidden>暂无任务，去安排一点目标吧。</div>
                        </div>
                    </div>

                    <!-- 右侧最新说说 -->
                    <div class="intro-right">
                        <!-- 统计数字 -->
                        <div class="stats-wrapper stats-mini">
                            <div class="total-stats">
                                <div class="total-stat-item">
                                    <span class="total-number"><?php echo westlife_get_run_days(); ?></span>
                                    <span class="total-label">DAYS</span>
                                </div>
                                <div class="total-stat-item">
                                    <span class="total-number"><?php echo wp_count_posts('post')->publish; ?></span>
                                    <span class="total-label">POSTS</span>
                                </div>
                                <div class="total-stat-item">
                                    <span class="total-number"><?php echo westlife_get_memos_count(); ?></span>
                                    <span class="total-label">NOTES</span>
                                </div>
                            </div>
                        </div>
                        <!-- 热力图 -->
                        <div class="center-heatmap right-heatmap" data-days="100">
                            <div class="stats-heatmap">
                                <div class="heatmap-head-bar">
                                    <span class="heatmap-range-label" id="heatmap-range-label">最近 100 天 · 文章</span>
                                    <div class="heatmap-legend" aria-hidden="true">
                                        <span class="legend-label">少</span>
                                        <span class="legend-scale">
                                            <span data-level="0"></span>
                                            <span data-level="1"></span>
                                            <span data-level="2"></span>
                                            <span data-level="3"></span>
                                            <span data-level="4"></span>
                                        </span>
                                        <span class="legend-label">多</span>
                                    </div>
                                    <div class="heatmap-switch" role="tablist" aria-label="内容类型切换">
                                        <button type="button" class="hm-switch-btn is-active" role="tab" aria-selected="true" aria-controls="activity-heatmap-posts" id="hm-tab-posts" data-source="posts">文章</button>
                                        <button type="button" class="hm-switch-btn" role="tab" aria-selected="false" aria-controls="activity-heatmap-memos" id="hm-tab-memos" data-source="memos">说说</button>
                                    </div>
                                </div>
                                <div class="heatmap-panels" data-range-label-target="heatmap-range-label">
                                    <div class="activity-grid heatmap-fade hm-panel is-active" id="activity-heatmap-posts" role="tabpanel" aria-labelledby="hm-tab-posts" aria-label="文章发布热力图" data-type="posts" data-load-url="<?php echo esc_url(admin_url('admin-ajax.php?action=wl_posts_heatmap_100d')); ?>">
                                        <div class="heatmap-loading" style="grid-column:1 / -1;min-height:8px;font-size:0;opacity:.0;"></div>
                                    </div>
                                    <div class="activity-grid heatmap-fade hm-panel" id="activity-heatmap-memos" role="tabpanel" aria-labelledby="hm-tab-memos" aria-label="说说热力图" data-type="memos" hidden data-load-url="<?php echo esc_url(admin_url('admin-ajax.php?action=wl_memos_heatmap_100d')); ?>">
                                        <div class="heatmap-loading" style="grid-column:1 / -1;min-height:8px;font-size:0;opacity:0;"></div>
                                    </div>
                                </div>

                            </div>
                        </div>
                        <?php $latest_memo = westlife_get_latest_memo(); ?>
                        <div class="saying-content">
                            <div class="saying-text" id="home-saying-text">
                                <span class="saying-text-inner">
                                    <?php
                                    if ($latest_memo && !empty($latest_memo['content'])) :
                                        // 如果有HTML内容，使用HTML版本，否则使用纯文本
                                        if (!empty($latest_memo['content_html'])) :
                                            // 过滤掉标签，只显示内容
                                            $content = $latest_memo['content_html'];
                                            $content = preg_replace('/<span class="memo-tag"[^>]*>.*?<\/span>\s*/', '', $content);
                                            echo $content;
                                        else :
                                            // 纯文本：移除 #关键词，再输出纯内容
                                            $pure_text = $latest_memo['content'];
                                            // 去除以 # 开头的标签词（保留前导空白）
                                            $pure_text = preg_replace('/(^|\s)#\S+/', '$1', $pure_text);
                                            echo esc_html(trim($pure_text));
                                        endif;
                                    else :
                                        $welcome_text = get_option('author_slogan', '记录生活，分享技术');
                                        echo esc_html($welcome_text);
                                    endif;
                                    ?>
                                </span>
                            </div>
                            <div class="saying-meta">
                                <div class="saying-meta-left">
                                    <?php if ($latest_memo && !empty($latest_memo['content']) && !empty($latest_memo['tags']) && is_array($latest_memo['tags'])) : ?>
                                        <div class="saying-tags" aria-hidden="true">
                                            <?php foreach ($latest_memo['tags'] as $tg) : ?>
                                                <span><?php echo esc_html($tg); ?></span>
                                            <?php endforeach; ?>
                                        </div>
                                    <?php endif; ?>
                                </div>
                                <div class="saying-meta-right">
                                    <?php if ($latest_memo && !empty($latest_memo['content']) && !empty($latest_memo['id'])) :
                                        // 获取点赞数
                                        $memo_id = $latest_memo['id'];
                                        $likes_option_key = 'memos_likes_' . $memo_id;
                                        $likes = get_option($likes_option_key, 0);
                                    ?>
                                        <button class="home-saying-like-btn" data-memo-id="<?php echo esc_attr($memo_id); ?>" title="点赞">
                                            <?php echo westlife_lucide_icon('heart'); ?>
                                            <span class="home-saying-like-count"><?php echo intval($likes); ?></span>
                                        </button>
                                    <?php endif; ?>
                                    <time class="saying-time-stamp" datetime="<?php echo esc_attr($latest_memo && !empty($latest_memo['content']) ? date(DATE_ATOM, strtotime($latest_memo['createTime'])) : date(DATE_ATOM)); ?>">
                                        <?php echo westlife_lucide_icon('clock-3', ['aria-hidden' => 'true']); ?>
                                        <span id="home-saying-time">
                                            <?php
                                            if ($latest_memo && !empty($latest_memo['content'])) :
                                                echo westlife_format_memo_time($latest_memo['createTime']);
                                            else :
                                                echo date_i18n('Y-m-d H:i');
                                            endif;
                                            ?>
                                        </span>
                                    </time>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 新：通栏弧形分割线（无电线杆） -->
            <?php
            // 年度进度：用于电线刻度 & 小鸟位置（基于站点时区 current_time）
            $__now_ts = westlife_current_timestamp();
            $__year_days = (int) wp_date('L', $__now_ts, westlife_wp_timezone()) ? 366 : 365;
            $__day_of_year = (int) wp_date('z', $__now_ts, westlife_wp_timezone()) + 1; // 1-based
            $__year_progress = ($__year_days > 1) ? (($__day_of_year - 1) / ($__year_days - 1) * 100) : 0; // 0-100
            // 月起始刻度（1..12）
            $__month_ticks = [];
            for ($__m = 1; $__m <= 12; $__m++) {
                $mt = (new DateTimeImmutable(
                    wp_date('Y', $__now_ts, westlife_wp_timezone()) . '-' . sprintf('%02d', $__m) . '-01 00:00:00',
                    westlife_wp_timezone()
                ))->getTimestamp();
                $mdoy = (int) wp_date('z', $mt, westlife_wp_timezone()) + 1;
                $pct = ($__year_days > 1) ? (($mdoy - 1) / ($__year_days - 1) * 100) : 0;
                $__month_ticks[] = [
                    'm' => $__m,
                    'doy' => $mdoy,
                    'pct' => $pct,
                ];
            }
            ?>
            <!-- 通栏弧形分割线 + 年度刻度 + 小鸟 -->
            <div class="wire-curve-divider expand-16" aria-hidden="true" role="presentation"
                data-year-days="<?php echo esc_attr($__year_days); ?>"
                data-day-of-year="<?php echo esc_attr($__day_of_year); ?>"
                data-progress="<?php echo esc_attr(round($__year_progress, 2)); ?>">
                <svg class="wire-curve" viewBox="0 0 100 8" preserveAspectRatio="none" focusable="false">
                    <path d="M0 4 Q50 7 100 4"></path>
                </svg>
                <div class="wire-scale" aria-hidden="true">
                    <?php foreach ($__month_ticks as $_t):
                        $major = in_array($_t['m'], [1, 4, 7, 10], true);
                        $cls = 'wire-scale-tick' . ($major ? ' major' : '');
                        $month = (int) $_t['m'];
                        $doy = (int) $_t['doy'];
                        $pct = round($_t['pct'], 4);
                    ?>
                        <span class="<?php echo esc_attr($cls); ?>" style="left:<?php echo esc_attr($pct); ?>%" data-month="<?php echo esc_attr($month); ?>" data-doy="<?php echo esc_attr($doy); ?>" aria-label="<?php echo esc_attr($month); ?>月 第<?php echo esc_attr($doy); ?>天"></span>
                    <?php endforeach; ?>
                    <span class="wire-today-marker" style="left:<?php echo esc_attr(round($__year_progress, 4)); ?>%" aria-label="今年第 <?php echo esc_attr($__day_of_year); ?> 天"></span>
                    <?php
                    // 追加：下一年 1 月 1 日节点（显示为 100% 边界点）
                    $next_year = (int) wp_date('Y', $__now_ts, westlife_wp_timezone()) + 1;
                    ?>
                    <span class="wire-scale-tick next-year" style="left:100%" data-next-year="<?php echo esc_attr($next_year); ?>" aria-label="<?php echo esc_attr($next_year); ?>-01-01"></span>
                </div>
                <svg class="hf-bird-wire on-curve" style="left:<?php echo esc_attr(round($__year_progress, 4)); ?>%" viewBox="0 0 1024 1024" role="img" aria-label="今天是今年第 <?php echo esc_attr($__day_of_year); ?> 天" width="56" height="56" xmlns="http://www.w3.org/2000/svg">
                    <path class="bird-body" d="M965.7344 354.304l-93.696-68.0448c-29.9008-90.5216-97.024-142.336-184.832-142.336a247.808 247.808 0 0 0-39.0144 3.2256c-77.2096 12.288-109.5168 56.1152-143.6672 102.5024-30.72 41.6768-62.464 84.6848-132.9152 112.64a162.4576 162.4576 0 0 1-60.0576 10.6496c-69.632 0-147.3536-36.9664-189.0304-89.9072a17.92 17.92 0 0 0-31.6928 8.192c-3.584 21.8624-8.2944 41.5232-8.2944 60.1088 0 194.7136 152.576 355.584 339.8144 377.6512v99.7376a17.92 17.92 0 0 0 35.84 0v-97.3312c9.216 0.0512 6.4512 0.256 9.6256 0.256 24.064 0 52.736-1.8944 71.168-5.4784v102.5536a17.92 17.92 0 0 0 35.84 0v-109.4656c151.4496-35.072 272.0768-141.4656 302.2336-275.1488l87.1424-60.7744a18.5344 18.5344 0 0 0 8.192-14.4384 17.3056 17.3056 0 0 0-6.656-14.592z"></path>
                    <path class="bird-eye" d="M679.7312 314.7776a52.224 52.224 0 0 0 0 104.448 52.224 52.224 0 0 0 0-104.448z" fill="#FFFFFF"></path>
                </svg>
            </div>
            <div class="category-nav">
                <?php
                westlife_category_nav();
                ?>
            </div>

            <!-- 文章列表区域 -->
            <div class="posts-grid">
                <?php if (have_posts()) : ?>
                    <?php while (have_posts()) : the_post();
                        $m = get_the_date('n');
                        echo '<div class="post-month-wrapper" data-month="' . esc_attr($m) . '">';
                        get_template_part('template-parts/content', 'card');
                        echo '</div>';
                    endwhile; ?>
                <?php else :
                    get_template_part('template-parts/content', 'none');
                endif; ?>
            </div>

            <!-- 文章分页导航 - 只在首页且有分页时显示 -->
            <?php
            global $wp_query;
            if ($wp_query->max_num_pages > 1) :
            ?>
                <div class="pagination-wrapper is-posts">
                    <nav class="pagination posts-pagination" aria-label="Posts Pagination">
                        <div class="nav-links">
                            <?php
                            echo paginate_links([
                                'type'      => 'plain',
                                'prev_text' => '&laquo;',
                                'next_text' => '&raquo;',
                            ]);
                            ?>
                        </div>
                    </nav>
                </div>
            <?php endif; ?>

            <!-- 特色面板功能区 -->
            <?php get_template_part('template-parts/content', 'panel'); ?>

        </div>
    </div>
</main>

<?php
// 在 get_footer() 之前添加 <!-- 站点统计 -->
if (is_home() || is_front_page()) {
    get_template_part('template-parts/content', 'foot-stats');
}

add_action('wp_footer', function () {});

// 注入：年度每月文章与说说数量（用于小鸟月份 tooltip）
add_action('wp_footer', function () {
    if (!is_home() && !is_front_page()) return;
    $year = (int) wp_date('Y', westlife_current_timestamp(), westlife_wp_timezone());
    global $wpdb;
    $post_counts = [];
    for ($m = 1; $m <= 12; $m++) {
        $start = sprintf('%04d-%02d-01 00:00:00', $year, $m);
        // 下月1日减1秒作为结束
        $nextMonthTs = (new DateTimeImmutable(sprintf('%04d-%02d-01 00:00:00', $m === 12 ? $year + 1 : $year, $m === 12 ? 1 : $m + 1), westlife_wp_timezone()))->getTimestamp();
        $end = wp_date('Y-m-d H:i:s', $nextMonthTs - 1, westlife_wp_timezone());
        $cnt = (int) $wpdb->get_var($wpdb->prepare(
            "SELECT COUNT(ID) FROM {$wpdb->posts} WHERE post_type='post' AND post_status='publish' AND post_date >= %s AND post_date <= %s",
            $start,
            $end
        ));
        $post_counts[$m] = $cnt;
    }
    // 说说（memos）按月数量：尝试使用 westlife_memos 实例的 get_memos 分页向前抓取（受限于接口，抓取当年数据直到跨年或无更多）
    $memo_counts = array_fill(1, 12, 0);
    if (function_exists('westlife_memos')) {
        $memos_instance = westlife_memos();
        $page_token = '';
        $max_pages = 20; // 安全上限
        $pages = 0;
        while ($pages < $max_pages) {
            if (!method_exists($memos_instance, 'get_memos')) break;
            $batch = $memos_instance->get_memos(1, 20, $page_token);
            if (!is_array($batch) || empty($batch['memos'])) break;
            foreach ($batch['memos'] as $memo) {
                if (empty($memo['createTime'])) continue;
                $ts = westlife_parse_timestamp($memo['createTime']);
                if (!$ts) continue;
                $y = (int) wp_date('Y', $ts, westlife_wp_timezone());
                if ($y < $year) { // 已经早于今年，可终止
                    $pages = $max_pages; // break 外层
                    break;
                }
                if ($y > $year) continue; // 未来年（不应出现）
                $mm = (int) wp_date('n', $ts, westlife_wp_timezone());
                if ($mm >= 1 && $mm <= 12) {
                    $memo_counts[$mm]++;
                }
            }
            $page_token = isset($batch['next_page_token']) ? $batch['next_page_token'] : '';
            if (empty($page_token)) break;
            $pages++;
        }
    }
    $payload = ['year' => $year, 'posts' => $post_counts, 'memos' => $memo_counts];
    echo '<script id="wl-month-stats" type="text/javascript">window.__WL_MONTH_STATS=' . wp_json_encode($payload) . ';window.dispatchEvent(new Event("wlMonthStatsReady"));</script>';
});

get_footer(); ?>
