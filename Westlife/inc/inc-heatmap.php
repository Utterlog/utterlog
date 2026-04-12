<?php

/**
 * 独立热力图模块 (posts + memos) - 抽离自 inc-stats.php
 * 仅保留 100 天首页/多页面所需功能，减少主统计模块加载体积。
 *
 * 提供：
 *  - AJAX: wl_posts_heatmap_100d (100 天)
 *  - AJAX: wl_memos_heatmap_100d (100 天)
 *  - 函数: westlife_get_activity_heatmap_100days()
 *  - 函数: westlife_get_memos_heatmap_100days()
 *  - 函数: westlife_get_activity_heatmap()  (365天年度)
 *
 * 后续可扩展：365 天 / JSON 模式 / Cron 预热。
 *
 * 缓存策略说明:
 *  - 年度热力图: key = activity_heatmap_YYYY-MM-DD (每日失效), TTL = 1h (HOUR_IN_SECONDS)
 *    原因: 年度范围内增量写较低, 1小时刷新兼顾实时性与性能。
 *  - 100天文章热力图: key = activity_heatmap_100days_v3_YYYY-MM-DD, TTL = 1h
 *  - 100天 memos 热力图: key = memos_heatmap_100days_v5_YYYY-MM-DD, TTL = 1h
 *  若需更细粒度刷新，可将 TTL 改为 30 * MINUTE_IN_SECONDS 并增加 Cron 预热。
 */
if (!defined('ABSPATH')) exit;
if (defined('WESTLIFE_HEATMAP_LOADED')) return; // 防重复
define('WESTLIFE_HEATMAP_LOADED', true);

// 实现 westlife_fetch_memos_recent 函数，使用 westlife_memos() API
if (!function_exists('westlife_fetch_memos_recent')) {
    function westlife_fetch_memos_recent($days)
    {
        // 检查 westlife_memos 是否可用
        if (!function_exists('westlife_memos')) {
            return [];
        }

        $instance = westlife_memos();
        if (!$instance || !method_exists($instance, 'get_memos')) {
            return [];
        }


        $counts = [];
        $startDate = date('Y-m-d', strtotime('-' . ($days - 1) . ' days'));
        $pageToken = '';
        $maxPages = 10; // 最多加载10页
        $totalMemos = 0;

        for ($p = 0; $p < $maxPages; $p++) {
            try {
                $batch = $instance->get_memos(1, 20, $pageToken);

                if (!is_array($batch) || empty($batch['memos'])) {
                    break;
                }


                foreach ($batch['memos'] as $memo) {
                    $totalMemos++;

                    // 尝试多个可能的时间字段
                    $dateStr = null;
                    if (!empty($memo['createTime'])) {
                        $dateStr = $memo['createTime'];
                    } elseif (!empty($memo['created_time'])) {
                        $dateStr = $memo['created_time'];
                    } elseif (!empty($memo['createdTime'])) {
                        $dateStr = $memo['createdTime'];
                    } elseif (!empty($memo['date'])) {
                        $dateStr = $memo['date'];
                    }

                    if (!$dateStr) {
                        continue;
                    }

                    // 提取日期部分 YYYY-MM-DD
                    $date = substr($dateStr, 0, 10);

                    // 如果日期早于起始日期，停止遍历
                    if ($date < $startDate) {
                        $p = $maxPages;
                        break;
                    }

                    if (!isset($counts[$date])) {
                        $counts[$date] = 0;
                    }
                    $counts[$date]++;
                }

                $pageToken = $batch['next_page_token'] ?? '';
                if (empty($pageToken)) {
                    break;
                }
            } catch (Exception $e) {
                break;
            }
        }


        // 转换为数组格式
        $result = [];
        foreach ($counts as $date => $count) {
            $result[] = ['date' => $date, 'count' => $count];
        }

        return $result;
    }
}

/* =============================================================
 * 年度(365天) 热力图 (原位于 inc-stats.php) 
 * 提供函数: westlife_get_activity_heatmap()
 * 依赖: westlife_get_activity_data(), westlife_prepare_heatmap_data(), westlife_generate_heatmap_html()
 * ============================================================= */
if (!function_exists('westlife_get_activity_heatmap')) {
    function westlife_get_activity_heatmap()
    {
        $cache_key = 'activity_heatmap_' . date('Y-m-d'); // 与原缓存键保持一致 (每日刷新)
        return westlife_get_stats_data($cache_key, function () {
            $today = new DateTime();
            $start = (new DateTime())->modify('-365 days');

            $activities = westlife_get_activity_data(
                $start->format('Y-m-d'),
                $today->format('Y-m-d')
            );
            $data = westlife_prepare_heatmap_data($start, $today, $activities);
            return westlife_generate_heatmap_html($data);
        }, HOUR_IN_SECONDS); // 1小时缓存
    }
}

// 计算活动热力等级（年度图: 目前未在生成逻辑中直接调用，但保留供其它地方使用）
if (!function_exists('westlife_calculate_activity_level')) {
    function westlife_calculate_activity_level($count)
    {
        if ($count == 0) return 0;
        if ($count == 1) return 1;
        if ($count == 2) return 2;
        if ($count <= 4) return 3;
        return 4;
    }
}

// 准备年度热力图数据
if (!function_exists('westlife_prepare_heatmap_data')) {
    function westlife_prepare_heatmap_data($start, $today, $activities)
    {
        $data = array();
        $current = clone $start;
        while ($current <= $today) {
            $date = $current->format('Y-m-d');
            $data[$date] = array('posts' => 0, 'comments' => 0);
            $current->modify('+1 day');
        }
        foreach ($activities as $activity) {
            if (isset($data[$activity->date])) {
                $type_key = $activity->type . 's';
                $data[$activity->date][$type_key] = (int)$activity->count;
            }
        }
        return $data;
    }
}

// 生成年度热力图 HTML
if (!function_exists('westlife_generate_heatmap_html')) {
    function westlife_generate_heatmap_html($data)
    {
        $output = '<div class="activity-year-wrapper"><div class="activity-year-grid">';
        foreach ($data as $date => $counts) {
            $total = array_sum($counts);
            $level = min(4, intval($total / 2));
            $title = sprintf('%s: %d篇文章, %d条评论', $date, $counts['posts'], $counts['comments']);
            $output .= sprintf('<div class="activity-year-day level-%d" title="%s" data-date="%s" data-total="%d"></div>', (int)$level, esc_attr($title), esc_attr($date), (int)$total);
        }
        $output .= '</div></div>';
        return $output;
    }
}

// 活动数据查询 (文章 + 评论) - 保持原 SQL
if (!function_exists('westlife_get_activity_data')) {
    function westlife_get_activity_data($start_date, $end_date)
    {
        global $wpdb;
        return $wpdb->get_results($wpdb->prepare(
            "
            (SELECT DATE(post_date) as date, COUNT(*) as count, 'post' as type
             FROM {$wpdb->posts}
             WHERE post_type = 'post' AND post_status = 'publish'
             AND post_date BETWEEN %s AND %s
             GROUP BY DATE(post_date))
            UNION ALL
            (SELECT DATE(comment_date) as date, COUNT(*) as count, 'comment' as type
             FROM {$wpdb->comments}
             WHERE comment_approved = '1' AND comment_type = 'comment'
             AND comment_date BETWEEN %s AND %s
             GROUP BY DATE(comment_date))
            ORDER BY date ASC",
            $start_date,
            $end_date,
            $start_date,
            $end_date
        ));
    }
}

/* =============================================================
 * Helpers
 * ============================================================= */
if (!function_exists('westlife_hm_cache_get')) {
    function westlife_hm_cache_get($key)
    {
        return get_transient($key);
    }
}
if (!function_exists('westlife_hm_cache_set')) {
    function westlife_hm_cache_set($key, $value, $ttl)
    {
        set_transient($key, $value, $ttl);
    }
}

/* =============================================================
 * Posts 100 天热力图 (与原实现保持一致, 缓存 key 后缀 v3)
 * ============================================================= */
if (!function_exists('westlife_get_activity_heatmap_100days')) {
    function westlife_get_activity_heatmap_100days()
    {
        global $wpdb;
        $cache_key = 'activity_heatmap_100days_v3_' . date('Y-m-d');
        $cached = westlife_hm_cache_get($cache_key);
        if ($cached) return $cached;

        $total_days = 100; // 4 x 25
        $dates = [];
        for ($i = $total_days - 1; $i >= 0; $i--) {
            $dates[] = date('Y-m-d', strtotime("-{$i} days"));
        }
        $start_dt = date('Y-m-d 00:00:00', strtotime('-' . ($total_days - 1) . ' days'));
        $end_dt   = date('Y-m-d 00:00:00', strtotime('+1 day'));

        if (!$wpdb) {
            $output = '';
            foreach ($dates as $date) {
                $output .= sprintf('<div class="arc-heatmap-cell arc-heat-level-0" title="%s: 无更新" data-date="%s" data-count="0"></div>', esc_attr($date), esc_attr($date));
            }
            return $output;
        }

        $sql = $wpdb->prepare(
            "SELECT DATE(post_date) AS d, COUNT(ID) AS c FROM {$wpdb->posts} WHERE post_type=%s AND post_status=%s AND post_date >= %s AND post_date < %s GROUP BY DATE(post_date)",
            'post',
            'publish',
            $start_dt,
            $end_dt
        );
        $rows = $wpdb->get_results($sql, ARRAY_A);
        $count_map = [];
        if ($rows) {
            foreach ($rows as $r) {
                $d = (string)($r['d'] ?? '');
                $c = (int)($r['c'] ?? 0);
                if ($d !== '') $count_map[$d] = $c;
            }
        }

        // 标题聚合（一次查询）
        $titles_sql = $wpdb->prepare(
            "SELECT ID, post_title, DATE(post_date) AS d FROM {$wpdb->posts} WHERE post_type=%s AND post_status=%s AND post_date >= %s AND post_date < %s",
            'post',
            'publish',
            $start_dt,
            $end_dt
        );
        $title_rows = $wpdb->get_results($titles_sql, ARRAY_A);
        $titles_map = [];
        if ($title_rows) {
            foreach ($title_rows as $tr) {
                $d = (string)($tr['d'] ?? '');
                if ($d === '') continue;
                $t = mb_substr(wp_strip_all_tags($tr['post_title'] ?? ''), 0, 40);
                if ($t === '') continue;
                if (!isset($titles_map[$d])) $titles_map[$d] = [];
                $titles_map[$d][] = esc_attr($t);
            }
        }

        $max = 0;
        foreach ($count_map as $v) {
            if ($v > $max) $max = $v;
        }
        $output = '';
        foreach ($dates as $date) {
            $c = $count_map[$date] ?? 0;
            $level = 0;
            if ($c > 0) {
                if ($c >= 5) $level = 4;
                else if ($c >= 3) $level = 3;
                else if ($c >= 2) $level = 2;
                else $level = 1;
            }
            $titleAttr = $date . ': ' . ($c ? $c . '篇' : '无更新');
            $titles = '';
            if (!empty($titles_map[$date])) {
                $titles = implode('||', $titles_map[$date]);
            }
            $output .= sprintf(
                '<div class="arc-heatmap-cell arc-heat-level-%d" data-date="%s" data-count="%d" %s title="%s"></div>',
                (int)$level,
                esc_attr($date),
                (int)$c,
                $titles ? 'data-titles="' . esc_attr($titles) . '"' : '',
                esc_attr($titleAttr)
            );
        }
        westlife_hm_cache_set($cache_key, $output, 6 * HOUR_IN_SECONDS); // 6小时缓存
        return $output;
    }
}

/* =============================================================
 * Posts 365 天热力图 (一年版本)
 * ============================================================= */
if (!function_exists('westlife_get_activity_heatmap_365days')) {
    function westlife_get_activity_heatmap_365days()
    {
        global $wpdb;
        $cache_key = 'activity_heatmap_365days_v3_' . date('Y-m-d');
        $cached = westlife_hm_cache_get($cache_key);
        if ($cached) return $cached;

        $total_days = 365;
        $dates = [];
        for ($i = $total_days - 1; $i >= 0; $i--) {
            $dates[] = date('Y-m-d', strtotime("-{$i} days"));
        }
        $start_dt = date('Y-m-d 00:00:00', strtotime('-' . ($total_days - 1) . ' days'));
        $end_dt   = date('Y-m-d 00:00:00', strtotime('+1 day'));

        if (!$wpdb) {
            $output = '';
            foreach ($dates as $date) {
                $output .= sprintf('<div class="arc-heatmap-cell arc-heat-level-0" title="%s: 无更新" data-date="%s" data-count="0"></div>', esc_attr($date), esc_attr($date));
            }
            return $output;
        }

        $sql = $wpdb->prepare(
            "SELECT DATE(post_date) AS d, COUNT(ID) AS c FROM {$wpdb->posts} WHERE post_type=%s AND post_status=%s AND post_date >= %s AND post_date < %s GROUP BY DATE(post_date)",
            'post',
            'publish',
            $start_dt,
            $end_dt
        );
        $rows = $wpdb->get_results($sql, ARRAY_A);
        $count_map = [];
        if ($rows) {
            foreach ($rows as $r) {
                $d = (string)($r['d'] ?? '');
                $c = (int)($r['c'] ?? 0);
                if ($d !== '') $count_map[$d] = $c;
            }
        }

        // 标题聚合
        $titles_sql = $wpdb->prepare(
            "SELECT ID, post_title, DATE(post_date) AS d FROM {$wpdb->posts} WHERE post_type=%s AND post_status=%s AND post_date >= %s AND post_date < %s",
            'post',
            'publish',
            $start_dt,
            $end_dt
        );
        $title_rows = $wpdb->get_results($titles_sql, ARRAY_A);
        $titles_map = [];
        if ($title_rows) {
            foreach ($title_rows as $tr) {
                $d = (string)($tr['d'] ?? '');
                if ($d === '') continue;
                $t = mb_substr(wp_strip_all_tags($tr['post_title'] ?? ''), 0, 40);
                if ($t === '') continue;
                if (!isset($titles_map[$d])) $titles_map[$d] = [];
                $titles_map[$d][] = esc_attr($t);
            }
        }

        $max = 0;
        foreach ($count_map as $v) {
            if ($v > $max) $max = $v;
        }
        // 按照 GitHub 风格重新组织：按列填充（每列7天，从周日到周六）
        // 1. 找到365天范围内第一天是星期几
        $first_day_of_week = (int)date('w', strtotime($dates[0])); // 0=周日, 6=周六

        // 2. 如果第一天不是周日，需要在前面补空格子
        $output = '';
        for ($i = 0; $i < $first_day_of_week; $i++) {
            $output .= '<div class="arc-heatmap-cell arc-heat-level-empty" style="opacity:0;"></div>';
        }

        // 3. 输出所有365天的数据
        foreach ($dates as $date) {
            $c = $count_map[$date] ?? 0;
            $level = 0;
            if ($c > 0) {
                if ($c >= 5) $level = 4;
                else if ($c >= 3) $level = 3;
                else if ($c >= 2) $level = 2;
                else $level = 1;
            }
            $titleAttr = $date . ': ' . ($c ? $c . '篇' : '无更新');
            $titles = '';
            if (!empty($titles_map[$date])) {
                $titles = implode('||', $titles_map[$date]);
            }
            $output .= sprintf(
                '<div class="arc-heatmap-cell arc-heat-level-%d" data-date="%s" data-count="%d" %s title="%s"></div>',
                (int)$level,
                esc_attr($date),
                (int)$c,
                $titles ? 'data-titles="' . esc_attr($titles) . '"' : '',
                esc_attr($titleAttr)
            );
        }

        westlife_hm_cache_set($cache_key, $output, 6 * HOUR_IN_SECONDS);
        return $output;
    }
}

/* =============================================================
 * Memos 100 天热力图 (抽取简化) v5 缓存后缀保持
 * ============================================================= */
if (!function_exists('westlife_get_memos_heatmap_100days')) {
    function westlife_get_memos_heatmap_100days()
    {
        // 简化：仅三步 -> 外部函数 -> API -> 全 0；缓存版本升级 v7
        $cache_key = 'memos_heatmap_100days_v7_' . date('Y-m-d');
        $cached = westlife_hm_cache_get($cache_key);
        if ($cached) {
            return $cached;
        }


        $days  = 100;
        $dates = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $dates[] = date('Y-m-d', strtotime('-' . $i . ' days'));
        }

        $rows = [];
        $origin = 'none';
        $pages  = 0;

        // 1. 外部函数覆盖
        if (function_exists('westlife_fetch_memos_recent')) {
            try {
                if (function_exists('westlife_fetch_memos_recent')) { // 再判一次避免静态分析告警
                    $tmp = westlife_fetch_memos_recent($days);
                    if (is_array($tmp)) {
                        $rows = $tmp;
                        $origin = 'external-func';
                    } else {
                    }
                }
            } catch (Throwable $e) {
                $rows = [];
            }
        } elseif (function_exists('westlife_memos')) { // 2. API 分页
            $instance = westlife_memos();
            if ($instance && method_exists($instance, 'get_memos')) {
                $origin = 'api';
                $datetime_field = apply_filters('westlife_memos_datetime_field', 'createTime');
                $counts = [];
                $startBoundary = $dates[0];
                $pageToken = '';
                $maxPages = (int)apply_filters('westlife_memos_max_pages', 8); // 默认减到 8 更快

                for ($p = 0; $p < $maxPages; $p++) {
                    $batch = $instance->get_memos(1, 20, $pageToken);

                    if (!is_array($batch)) {
                        break;
                    }

                    if (isset($batch['error'])) {
                        break;
                    }

                    if (empty($batch['memos'])) {
                        break;
                    }

                    $pages = $p + 1;
                    $memos_count = count($batch['memos']);

                    foreach ($batch['memos'] as $memo) {
                        if (empty($memo[$datetime_field])) {
                            continue;
                        }
                        $d = substr($memo[$datetime_field], 0, 10);
                        if ($d < $startBoundary) {
                            $p = $maxPages;
                            break;
                        }
                        if (!isset($counts[$d])) $counts[$d] = 0;
                        $counts[$d]++;
                    }

                    $pageToken = $batch['next_page_token'] ?? '';

                    if (empty($pageToken) || count($counts) >= $days) {
                        break;
                    }
                }


                foreach ($counts as $d => $c) {
                    $rows[] = ['date' => $d, 'count' => (int)$c];
                }
                if ($rows) {
                    usort($rows, function ($a, $b) {
                        return strcmp($a['date'], $b['date']);
                    });
                }
            } else {
            }
        } else {
        }

        // 3. 如果仍无数据 -> rows 为空，直接输出全空格子

        $map = [];
        foreach ($rows as $r) {
            if (!isset($r['date'])) continue;
            $map[$r['date']] = (int)($r['count'] ?? 0);
        }


        $out = '';
        $has_data_count = 0;
        foreach ($dates as $d) {
            $c = $map[$d] ?? 0;
            if ($c > 0) $has_data_count++;

            $level = 0;
            if ($c > 0) {
                if ($c >= 5) $level = 4;
                else if ($c >= 3) $level = 3;
                else if ($c >= 2) $level = 2;
                else $level = 1;
            }
            $title = $d . ': ' . ($c ? $c . '条' : '无说说');
            // 使用归档页面的类名：arc-heatmap-cell arc-heat-level-*
            $out .= sprintf('<div class="arc-heatmap-cell arc-heat-level-%d" data-date="%s" data-count="%d" title="%s"></div>', (int)$level, esc_attr($d), (int)$c, esc_attr($title));
        }


        westlife_hm_cache_set($cache_key, $out, 6 * HOUR_IN_SECONDS); // 6小时缓存

        if (!empty($_GET['wl_hm_debug']) && current_user_can('manage_options')) {
            header('X-WL-Memos-Origin: ' . $origin);
            if ($pages) header('X-WL-Memos-Pages: ' . $pages);
            header('X-WL-Memos-Rows: ' . substr(json_encode($rows), 0, 160));
        }

        return $out;
    }
}

/* =============================================================
 * Memos 365 天热力图 (一年版本)
 * ============================================================= */
if (!function_exists('westlife_get_memos_heatmap_365days')) {
    function westlife_get_memos_heatmap_365days()
    {
        $cache_key = 'memos_heatmap_365days_v3_' . date('Y-m-d');
        $cached = westlife_hm_cache_get($cache_key);
        if ($cached) {
            return $cached;
        }

        $days  = 365;
        $dates = [];
        for ($i = $days - 1; $i >= 0; $i--) {
            $dates[] = date('Y-m-d', strtotime('-' . $i . ' days'));
        }

        $rows = [];
        $origin = 'none';

        // 1. 外部函数覆盖
        if (function_exists('westlife_fetch_memos_recent')) {
            try {
                $tmp = westlife_fetch_memos_recent($days);
                if (is_array($tmp)) {
                    $rows = $tmp;
                    $origin = 'external-func';
                }
            } catch (Throwable $e) {
                $rows = [];
            }
        } elseif (function_exists('westlife_memos')) {
            // 2. API 分页
            $instance = westlife_memos();
            if ($instance && method_exists($instance, 'get_memos')) {
                $origin = 'api';
                $datetime_field = apply_filters('westlife_memos_datetime_field', 'createTime');
                $counts = [];
                $startBoundary = $dates[0];
                $pageToken = '';
                $maxPages = (int)apply_filters('westlife_memos_max_pages_365', 30); // 365天需要更多页

                for ($p = 0; $p < $maxPages; $p++) {
                    $batch = $instance->get_memos(1, 20, $pageToken);

                    if (!is_array($batch) || isset($batch['error']) || empty($batch['memos'])) {
                        break;
                    }

                    foreach ($batch['memos'] as $memo) {
                        if (empty($memo[$datetime_field])) {
                            continue;
                        }
                        $d = substr($memo[$datetime_field], 0, 10);
                        if ($d < $startBoundary) {
                            $p = $maxPages;
                            break;
                        }
                        if (!isset($counts[$d])) $counts[$d] = 0;
                        $counts[$d]++;
                    }

                    $pageToken = $batch['next_page_token'] ?? '';
                    if (empty($pageToken)) {
                        break;
                    }
                }

                foreach ($counts as $d => $c) {
                    $rows[] = ['date' => $d, 'count' => (int)$c];
                }
                if ($rows) {
                    usort($rows, function ($a, $b) {
                        return strcmp($a['date'], $b['date']);
                    });
                }
            }
        }

        $map = [];
        foreach ($rows as $r) {
            if (!isset($r['date'])) continue;
            $map[$r['date']] = (int)($r['count'] ?? 0);
        }

        // 按照 GitHub 风格重新组织：按列填充（每列7天，从周日到周六）
        // 1. 找到365天范围内第一天是星期几
        $first_day_of_week = (int)date('w', strtotime($dates[0])); // 0=周日, 6=周六

        // 2. 如果第一天不是周日，需要在前面补空格子
        $out = '';
        for ($i = 0; $i < $first_day_of_week; $i++) {
            $out .= '<div class="arc-heatmap-cell arc-heat-level-empty" style="opacity:0;"></div>';
        }

        // 3. 输出所有365天的数据
        foreach ($dates as $d) {
            $c = $map[$d] ?? 0;
            $level = 0;
            if ($c > 0) {
                if ($c >= 5) $level = 4;
                else if ($c >= 3) $level = 3;
                else if ($c >= 2) $level = 2;
                else $level = 1;
            }
            $title = $d . ': ' . ($c ? $c . '条' : '无说说');
            $out .= sprintf('<div class="arc-heatmap-cell arc-heat-level-%d" data-date="%s" data-count="%d" title="%s"></div>', (int)$level, esc_attr($d), (int)$c, esc_attr($title));
        }

        westlife_hm_cache_set($cache_key, $out, 6 * HOUR_IN_SECONDS);
        return $out;
    }
}

/* =============================================================
 * AJAX Endpoints
 * ============================================================= */
if (!function_exists('westlife_ajax_posts_heatmap_100d')) {
    add_action('wp_ajax_wl_posts_heatmap_100d', 'westlife_ajax_posts_heatmap_100d');
    add_action('wp_ajax_nopriv_wl_posts_heatmap_100d', 'westlife_ajax_posts_heatmap_100d');
    function westlife_ajax_posts_heatmap_100d()
    {
        if (!function_exists('westlife_get_activity_heatmap_100days')) {
            wp_send_json_error(['message' => 'heatmap disabled']);
        }
        try {
            $html = westlife_get_activity_heatmap_100days();
            wp_send_json_success(['html' => $html]);
        } catch (Exception $e) {
            wp_send_json_error(['message' => $e->getMessage()]);
        }
    }
}

if (!function_exists('westlife_ajax_memos_heatmap_100d')) {
    add_action('wp_ajax_wl_memos_heatmap_100d', 'westlife_ajax_memos_heatmap_100d');
    add_action('wp_ajax_nopriv_wl_memos_heatmap_100d', 'westlife_ajax_memos_heatmap_100d');
    function westlife_ajax_memos_heatmap_100d()
    {
        if (!function_exists('westlife_get_memos_heatmap_100days')) {
            wp_send_json_error(['message' => 'memos heatmap disabled']);
        }
        try {
            $html = westlife_get_memos_heatmap_100days();
            wp_send_json_success(['html' => $html]);
        } catch (Exception $e) {
            wp_send_json_error(['message' => $e->getMessage()]);
        }
    }
}

/* =============================================================
 * 向后兼容：如果其它代码仍旧引用旧 inc-stats 中函数，这里已提供实现
 * ============================================================= */
