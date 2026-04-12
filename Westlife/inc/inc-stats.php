<?php

/**
 * 核心统计功能模块
 * 
 * 提供主题的核心统计功能，包括：
 * 1. 活动热力图生成与展示
 * 2. 访问量统计与管理
 * 3. 字数统计与里程碑
 * 4. 时间格式化处理
 * 
 * @package Westlife
 * @since 1.0.0
 */

// 安全检查：防止直接访问
if (!defined('ABSPATH')) {
    exit('Direct access forbidden.');
}
/* ==========================================================================
   统计数据处理类
   ========================================================================== */

/**
 * 统计数据处理类
 * 
 * 提供统一的缓存管理、数据库操作和统计功能
 */
class Westlife_Stats
{

    // 缓存相关常量
    const CACHE_GROUP = 'westlife_stats';
    const CACHE_EXPIRE = 1800; // 30分钟

    // 元数据键名常量
    const VIEWS_KEY = 'post_views';
    const WORDS_KEY = '_word_count';
    const READING_TIME_KEY = '_reading_time';

    // 功能模块键名
    const ACTIVITY_KEY = 'activity_heatmap';
    const COMMENTS_KEY = 'comments_stats';

    /**
     * 获取缓存数据
     * 
     * @param string $key 缓存键名
     * @param callable|null $callback 回调函数（缓存不存在时执行）
     * @param int $expiration 过期时间（秒）
     * @return mixed 缓存数据
     */
    public static function get_cache($key, $callback = null, $expiration = self::CACHE_EXPIRE)
    {
        // 尝试从缓存获取
        $cached = wp_cache_get($key, self::CACHE_GROUP);
        if (false !== $cached) {
            return $cached;
        }

        // 如果提供了回调函数，执行并缓存结果
        if (is_callable($callback)) {
            $data = call_user_func($callback);
            wp_cache_set($key, $data, self::CACHE_GROUP, $expiration);
            return $data;
        }

        return false;
    }

    /**
     * 清理指定类型的缓存
     * 
     * @param string $type 缓存类型
     * @param int $post_id 文章ID（可选）
     */
    public static function clean_cache($type = '', $post_id = 0)
    {
        $keys = array();

        switch ($type) {
            case 'views':
                $keys = array('total_views', 'total_posts_views', "post_views_{$post_id}");
                break;
            case 'words':
                $keys = array('total_words', "word_count_{$post_id}");
                break;
            case 'activity':
                $keys = array(
                    self::ACTIVITY_KEY,
                    'activity_heatmap_' . date('Y-m-d'),
                    'activity_heatmap_30days_' . date('Y-m-d'),
                    'activity_heatmap_30days_v2_' . date('Y-m-d'),
                    'activity_heatmap_30days_v3_' . date('Y-m-d'),
                    'activity_heatmap_30days_v4_' . date('Y-m-d'),
                    'activity_heatmap_100days_v1_' . date('Y-m-d')
                );
                break;
            case 'comments':
                $keys = array(self::COMMENTS_KEY);
                break;
            default:
                // 清理所有缓存
                wp_cache_flush();
                return;
        }

        foreach ($keys as $key) {
            wp_cache_delete($key, self::CACHE_GROUP);
        }
    }
    /**
     * 处理文章访问量
     * 
     * @param int $post_id 文章ID
     * @param string $type 操作类型（get/update）
     * @return int 访问量
     */
    public static function handle_post_views($post_id, $type = 'get')
    {
        if (!$post_id) {
            return 0;
        }

        $current_views = (int)get_post_meta($post_id, self::VIEWS_KEY, true);

        if ($type === 'update') {
            $new_views = $current_views + 1;
            update_post_meta($post_id, self::VIEWS_KEY, $new_views);

            // 清理相关缓存
            self::clean_cache('views', $post_id);

            return $new_views;
        }

        return $current_views;
    }
}

/* ==========================================================================
   通用统计数据缓存函数
   ========================================================================== */

/**
 * 通用统计数据缓存获取函数
 * 
 * @param string $key 缓存键名
 * @param callable|null $callback 回调函数
 * @param int $expiration 过期时间（秒）
 * @return mixed 缓存数据
 */
function westlife_get_stats_data($key = '', $callback = null, $expiration = 3600)
{
    return Westlife_Stats::get_cache($key, $callback, $expiration);
}

/* ==========================================================================
   归档页：聚合统计与热力图数据（统一提供，避免重复计算）
   ========================================================================== */

/**
 * 获取归档页所需的数据包（统计 + 当年热力图 + 年/月聚合），内置短期缓存
 * 返回结构：
 * [
 *   'stats'       => array,
 *   'heatmapData' => array(date => count, ...),
 *   'yearlyData'  => array(year => array(month => count)),
 *   'maxCount'    => int
 * ]
 */
function westlife_get_archive_stats_bundle($year = null)
{
    if (!$year) {
        $year = intval(date('Y'));
    }

    $cache_key = 'wl_archive_stats_' . $year;
    $cached = get_transient($cache_key);
    if (is_array($cached)) {
        return $cached;
    }

    global $wpdb;

    // 基础统计
    $stats = array(
        'total_posts'      => intval(wp_count_posts('post')->publish),
        'total_categories' => intval(wp_count_terms('category', array('hide_empty' => false))),
        'total_tags'       => intval(wp_count_terms('post_tag', array('hide_empty' => false))),
        'total_comments'   => intval(wp_count_comments()->approved),
        'writing_days'     => 0,
        'first_post_date'  => null,
    );

    $first_post = $wpdb->get_var("SELECT post_date FROM {$wpdb->posts} WHERE post_status='publish' AND post_type='post' ORDER BY post_date ASC LIMIT 1");
    if ($first_post) {
        $stats['first_post_date'] = $first_post;
        try {
            $first = new DateTime($first_post);
            $now   = new DateTime();
            $stats['writing_days'] = $now->diff($first)->days;
        } catch (Exception $e) {
            $stats['writing_days'] = 0;
        }
    }

    // 当年每日发文计数
    $rows = $wpdb->get_results($wpdb->prepare(
        "SELECT DATE(post_date) as d, COUNT(*) as c FROM {$wpdb->posts} WHERE post_status='publish' AND post_type='post' AND YEAR(post_date)=%d GROUP BY DATE(post_date) ORDER BY d",
        $year
    ));
    $heatmap = array();
    $maxCount = 1;
    foreach ((array)$rows as $r) {
        $cnt = intval($r->c);
        $heatmap[$r->d] = $cnt;
        if ($cnt > $maxCount) $maxCount = $cnt;
    }

    // 年/月聚合
    $rows2 = $wpdb->get_results(
        "SELECT YEAR(post_date) as y, MONTH(post_date) as m, COUNT(*) as c FROM {$wpdb->posts} WHERE post_status='publish' AND post_type='post' GROUP BY YEAR(post_date), MONTH(post_date) ORDER BY y DESC, m DESC"
    );
    $yearly = array();
    foreach ((array)$rows2 as $r) {
        $y = intval($r->y);
        $m = intval($r->m);
        $c = intval($r->c);
        if (!isset($yearly[$y])) $yearly[$y] = array();
        $yearly[$y][$m] = $c;
    }

    $bundle = array(
        'stats'       => $stats,
        'heatmapData' => $heatmap,
        'yearlyData'  => $yearly,
        'maxCount'    => $maxCount,
    );

    set_transient($cache_key, $bundle, 30 * MINUTE_IN_SECONDS);
    return $bundle;
}

// 内容变化时，清理本年和上一年的缓存，避免滞后
add_action('save_post_post', function () {
    $y  = date('Y');
    $y1 = date('Y', strtotime('-1 year'));
    delete_transient('wl_archive_stats_' . $y);
    delete_transient('wl_archive_stats_' . $y1);
});

/* ==========================================================================
   访问量统计功能
   ========================================================================== */

/**
 * 获取所有内容的总访问量（包括文章和页面）
 * 
 * @param bool $formatted 是否格式化数字
 * @return mixed 总访问量
 */
function westlife_get_total_views($formatted = false)
{
    return westlife_get_stats_data('total_views', function () use ($formatted) {
        global $wpdb;

        // 获取所有已发布文章和页面的访问量总和
        $views = $wpdb->get_var($wpdb->prepare("
            SELECT COALESCE(SUM(CAST(pm.meta_value AS UNSIGNED)), 0)
            FROM {$wpdb->postmeta} pm
            JOIN {$wpdb->posts} p ON pm.post_id = p.ID
            WHERE pm.meta_key = %s 
            AND p.post_type IN ('post', 'page')
            AND p.post_status = 'publish'
            AND pm.meta_value REGEXP '^[0-9]+$'
        ", Westlife_Stats::VIEWS_KEY));

        // 确保返回值为非负整数
        $total_views = max(0, absint($views));

        // 根据参数决定是否格式化
        return $formatted ? number_format_i18n($total_views) : $total_views;
    }, 1800); // 30分钟缓存
}

/**
 * 获取所有文章的总访问量（仅文章）
 * 
 * @param bool $formatted 是否返回格式化的数字
 * @return mixed 浏览总数或格式化后的字符串
 */
function westlife_get_all_posts_views($formatted = false)
{
    return westlife_get_stats_data('total_posts_views', function () use ($formatted) {
        global $wpdb;

        // 获取所有已发布文章的访问量总和
        $total_views = $wpdb->get_var($wpdb->prepare("
            SELECT COALESCE(SUM(CAST(pm.meta_value AS UNSIGNED)), 0)
            FROM {$wpdb->postmeta} pm
            JOIN {$wpdb->posts} p ON pm.post_id = p.ID
            WHERE pm.meta_key = %s 
            AND p.post_type = 'post'
            AND p.post_status = 'publish'
            AND pm.meta_value REGEXP '^[0-9]+$'
        ", Westlife_Stats::VIEWS_KEY));

        // 确保返回值为非负整数
        $total_views = max(0, absint($total_views));

        // 根据参数决定是否格式化
        return $formatted ? number_format_i18n($total_views) : $total_views;
    }, 1800); // 30分钟缓存
}

/**
 * 获取或更新文章访问量
 * 
 * @param int $post_id 文章ID
 * @param string $type 操作类型
 * @return int 访问量
 */
function westlife_post_views($post_id, $type = 'get')
{
    return Westlife_Stats::handle_post_views($post_id, $type);
}

/**
 * 获取默认的旧浏览量 meta key 列表
 *
 * @return array
 */
function westlife_get_default_view_meta_keys()
{
    return [
        'views',
        'view',
        'view_count',
        'views_count',
        'post_view',
        'post_views_count',
        'page_views',
        'postviews',
        '_views',
    ];
}

/**
 * 解析浏览量 meta key 输入
 *
 * @param string|array $raw
 * @return array
 */
function westlife_parse_view_meta_keys($raw)
{
    if (is_array($raw)) {
        $raw = implode("\n", $raw);
    }

    $raw = (string) $raw;
    $parts = preg_split('/[\r\n,]+/', $raw);
    $keys = [];

    foreach ((array) $parts as $part) {
        $key = sanitize_key(trim($part));
        if ($key === '' || $key === Westlife_Stats::VIEWS_KEY) {
            continue;
        }
        $keys[] = $key;
    }

    return array_values(array_unique($keys));
}

/**
 * 扫描数据库里疑似旧浏览量 meta key
 *
 * @return array
 */
function westlife_get_detected_view_meta_keys()
{
    global $wpdb;

    $sql = "
        SELECT DISTINCT pm.meta_key
        FROM {$wpdb->postmeta} pm
        WHERE pm.meta_key <> %s
          AND (
            pm.meta_key = 'views'
            OR pm.meta_key LIKE '%view%'
          )
        ORDER BY pm.meta_key ASC
        LIMIT 50
    ";

    $rows = $wpdb->get_col($wpdb->prepare($sql, Westlife_Stats::VIEWS_KEY));
    $keys = [];

    foreach ((array) $rows as $row) {
        $key = sanitize_key((string) $row);
        if ($key !== '' && $key !== Westlife_Stats::VIEWS_KEY) {
            $keys[] = $key;
        }
    }

    return array_values(array_unique($keys));
}

/**
 * 执行浏览量 meta key 迁移：将旧键数值合并到 post_views
 */
function westlife_handle_views_meta_migration()
{
    if (!current_user_can('manage_options')) {
        wp_die(__('权限不足。', 'westlife'));
    }

    check_admin_referer('westlife_migrate_post_views', 'westlife_migrate_post_views_nonce');

    $source_keys = westlife_parse_view_meta_keys($_POST['source_keys'] ?? '');

    if (empty($source_keys)) {
        wp_safe_redirect(add_query_arg([
            'page' => 'westlife-settings',
            'tab' => 'basic',
            'views_migration' => 'empty',
        ], admin_url('admin.php')));
        exit;
    }

    global $wpdb;

    $placeholders = implode(',', array_fill(0, count($source_keys), '%s'));
    $params = array_merge($source_keys, ['post', 'page']);

    $sql = "
        SELECT pm.post_id, pm.meta_key, pm.meta_value
        FROM {$wpdb->postmeta} pm
        INNER JOIN {$wpdb->posts} p ON p.ID = pm.post_id
        WHERE pm.meta_key IN ($placeholders)
          AND p.post_type IN (%s, %s)
    ";

    $rows = $wpdb->get_results($wpdb->prepare($sql, ...$params), ARRAY_A);

    $totals_by_post = [];
    $rows_migrated = 0;
    $keys_hit = [];

    foreach ((array) $rows as $row) {
        $value = isset($row['meta_value']) ? trim((string) $row['meta_value']) : '';
        if ($value === '' || !preg_match('/^\d+$/', $value)) {
            continue;
        }

        $post_id = (int) $row['post_id'];
        $amount = (int) $value;

        if ($post_id <= 0 || $amount <= 0) {
            continue;
        }

        if (!isset($totals_by_post[$post_id])) {
            $totals_by_post[$post_id] = 0;
        }

        $totals_by_post[$post_id] += $amount;
        $rows_migrated++;
        $keys_hit[sanitize_key((string) $row['meta_key'])] = true;
    }

    $posts_updated = 0;
    $views_added = 0;

    foreach ($totals_by_post as $post_id => $amount) {
        $current = (int) get_post_meta($post_id, Westlife_Stats::VIEWS_KEY, true);
        update_post_meta($post_id, Westlife_Stats::VIEWS_KEY, $current + $amount);
        $posts_updated++;
        $views_added += $amount;
        Westlife_Stats::clean_cache('views', $post_id);
    }

    wp_safe_redirect(add_query_arg([
        'page' => 'westlife-settings',
        'tab' => 'basic',
        'views_migration' => 'success',
        'migrated_posts' => $posts_updated,
        'migrated_rows' => $rows_migrated,
        'migrated_views' => $views_added,
        'migrated_keys' => rawurlencode(implode(', ', array_keys($keys_hit))),
    ], admin_url('admin.php')));
    exit;
}
add_action('admin_post_westlife_migrate_post_views', 'westlife_handle_views_meta_migration');

/**
 * 格式化访问量显示
 * 
 * @param int $views 访问量
 * @return string 格式化后的字符串
 */
function westlife_format_views($views)
{
    $views = max(0, absint($views));

    if ($views >= 10000) {
        return round($views / 10000, 1) . 'w+';
    }
    if ($views >= 1000) {
        return round($views / 1000, 1) . 'k+';
    }

    return number_format_i18n($views);
}

/* ==========================================================================
   字数统计功能
   ========================================================================== */

/**
 * 获取和更新文章字数统计
 * 
 * @param int $post_id 文章ID
 * @param bool $update 是否更新元数据
 * @return array 包含字数和阅读时间的数组
 */
function westlife_handle_word_count($post_id = 0, $update = false)
{
    if (!$post_id) {
        $post_id = get_the_ID();
    }

    if (!$post_id) {
        return array('words' => 0, 'reading_time' => 0);
    }

    $stored_words = (int) get_post_meta($post_id, Westlife_Stats::WORDS_KEY, true);
    $stored_reading_time = (int) get_post_meta($post_id, Westlife_Stats::READING_TIME_KEY, true);

    if (!$update && $stored_words > 0 && $stored_reading_time > 0) {
        return array(
            'words' => $stored_words,
            'reading_time' => $stored_reading_time,
        );
    }

    // 尝试获取缓存
    $cache_key = "word_count_{$post_id}";
    if (!$update) {
        $cached = Westlife_Stats::get_cache($cache_key);
        if (false !== $cached) {
            return $cached;
        }
    }

    // 基本检查
    if ($update) {
        if (defined('DOING_AUTOSAVE') && DOING_AUTOSAVE) return array('words' => 0, 'reading_time' => 0);
        if (wp_is_post_revision($post_id)) return array('words' => 0, 'reading_time' => 0);
    }

    $post = get_post($post_id);
    if (!$post || $post->post_type !== 'post') {
        return array('words' => 0, 'reading_time' => 0);
    }

    // 计算字数
    $content = $post->post_content;

    // 移除HTML标签和短代码
    $content = wp_strip_all_tags($content);
    $content = strip_shortcodes($content);

    // 移除代码块（markdown格式）
    $content = preg_replace('/```.*?```/s', '', $content);
    $content = preg_replace('/`.*?`/', '', $content);

    // 移除多余空白
    $content = preg_replace('/\s+/', ' ', trim($content));

    // 分别统计中文字符和英文单词
    preg_match_all('/[\x{4e00}-\x{9fa5}]/u', $content, $chinese_matches);
    preg_match_all('/[a-zA-Z]+/', $content, $english_matches);

    $chinese_count = count($chinese_matches[0]);
    $english_word_count = count($english_matches[0]);

    // 计算总字数（英文单词按平均长度计算）
    $total_words = $chinese_count + $english_word_count;

    $stats = array(
        'words' => max(0, $total_words),
        'reading_time' => max(1, ceil($total_words / 300)) // 每分钟300字
    );

    update_post_meta($post_id, Westlife_Stats::WORDS_KEY, $stats['words']);
    update_post_meta($post_id, Westlife_Stats::READING_TIME_KEY, $stats['reading_time']);

    if ($update) {
        Westlife_Stats::clean_cache('words', $post_id);
    } else {
        wp_cache_set($cache_key, $stats, Westlife_Stats::CACHE_GROUP, Westlife_Stats::CACHE_EXPIRE);
    }

    return $stats;
}

/**
 * 获取所有文章的总字数
 * 
 * @param bool $formatted 是否返回格式化的字数
 * @return mixed 总字数或格式化字符串
 */
function westlife_get_total_words($formatted = false)
{
    return westlife_get_stats_data('total_words', function () use ($formatted) {
        global $wpdb;

        // 获取所有已发布的文章
        $posts = get_posts(array(
            'post_type' => 'post',
            'post_status' => 'publish',
            'posts_per_page' => -1,
            'fields' => 'ids'
        ));

        if (empty($posts)) {
            return $formatted ? '0字' : 0;
        }

        $total_words = 0;
        foreach ($posts as $post_id) {
            $stats = westlife_handle_word_count($post_id);
            $total_words += $stats['words'];
        }

        // 根据参数决定返回格式
        return $formatted ? westlife_format_words($total_words) : $total_words;
    }, 1800); // 30分钟缓存
}

/**
 * 格式化字数显示
 * 
 * @param int $words 字数
 * @return string 格式化后的字符串
 */
function westlife_format_words($words)
{
    $words = max(0, intval($words));

    if ($words >= 10000) {
        return round($words / 10000, 1) . '万字';
    }

    if ($words >= 1000) {
        return round($words / 1000, 1) . '千字';
    }

    return $words . '字';
}

/**
 * 获取字数里程碑数据
 * 
 * @return array 里程碑数据
 */
function westlife_get_word_milestones()
{
    return array(
        10000 => array('name' => '鲁迅的', 'book' => '《阿Q正传》'),
        20000 => array('name' => '列夫·托尔斯泰的', 'book' => '《伊凡·伊里奇之死》'),
        30000 => array('name' => '简·奥斯汀的', 'book' => '《傲慢与偏见》'),
        40000 => array('name' => '乔治·奥威尔的', 'book' => '《动物农场》'),
        50000 => array('name' => '加西亚·马尔克斯的', 'book' => '《百年孤独》'),
        60000 => array('name' => '米兰·昆德拉的', 'book' => '《生命中不能承受之轻》'),
        70000 => array('name' => '村上春树的', 'book' => '《挪威的森林》'),
        80000 => array('name' => '东野圭吾的', 'book' => '《解忧杂货店》'),
        90000 => array('name' => '钱钟书的', 'book' => '《围城》'),
        100000 => array('name' => '金庸的', 'book' => '《射雕英雄传》'),
        120000 => array('name' => '托尔金的', 'book' => '《魔戒》三部曲之一'),
        150000 => array('name' => '古龙的', 'book' => '《多情剑客无情剑》'),
        200000 => array('name' => '曹雪芹的', 'book' => '《红楼梦》')
    );
}

/**
 * 获取字数里程碑描述
 * 
 * @param int $words 当前字数
 * @return string 里程碑描述
 */
function westlife_get_word_milestone_desc($words)
{
    $milestones = westlife_get_word_milestones();
    $last_milestone = null;

    // 查找最接近但不超过当前字数的里程碑
    foreach ($milestones as $threshold => $milestone) {
        if ($words >= $threshold) {
            $last_milestone = $milestone;
            continue;
        }
        break;
    }

    if ($last_milestone) {
        return sprintf(
            __('写完一本 %s %s了！', 'westlife'),
            $last_milestone['name'],
            $last_milestone['book']
        );
    }

    return '';
}

/**
 * 格式化字数显示（带里程碑）
 * 
 * @param int $words 字数
 * @return string 格式化描述
 */
function westlife_format_words_with_milestone($words)
{
    $formatted_words = number_format_i18n($words);
    $milestone_desc = westlife_get_word_milestone_desc($words);

    if ($milestone_desc) {
        return sprintf(
            __('共 %s 字，%s', 'westlife'),
            $formatted_words,
            $milestone_desc
        );
    }

    return sprintf(__('共 %s 字', 'westlife'), $formatted_words);
}

/* ==========================================================================
   时间处理功能
   ========================================================================== */

/**
 * 格式化时间显示
 * 
 * @param mixed $time 时间戳或日期字符串
 * @param bool $show_icon 是否显示图标
 * @return string 格式化后的时间字符串
 */
function westlife_format_time($time, $show_icon = false)
{
    $timestamp = westlife_parse_timestamp($time);
    if ($timestamp <= 0) {
        return '无效时间';
    }

    $tz = westlife_wp_timezone();
    $time_dt = (new DateTimeImmutable('@' . $timestamp))->setTimezone($tz);
    $now_dt = current_datetime();
    $diff = $now_dt->diff($time_dt);
    $diff_hours = ($diff->days * 24) + $diff->h;
    $full_date = wp_date('Y-m-d H:i', $timestamp, $tz);

    // 图标HTML
    $clock_icon = $show_icon ? '<i class="far fa-clock"></i> ' : '';
    $calendar_icon = $show_icon ? '<i class="fas fa-calendar-alt"></i> ' : '';

    // 是否是当年
    $is_current_year = $time_dt->format('Y') === $now_dt->format('Y');

    // 时间差小于24小时
    if ($diff_hours < 24) {
        if ($diff->h == 0 && $diff->i < 1) {
            return sprintf('<span title="%s">%s刚刚</span>', $full_date, $clock_icon);
        } elseif ($diff->h == 0) {
            return sprintf('<span title="%s">%s%d分钟前</span>', $full_date, $clock_icon, $diff->i);
        } else {
            return sprintf('<span title="%s">%s%d小时前</span>', $full_date, $clock_icon, $diff_hours);
        }
    }
    // 30天内且是当年
    elseif ($diff->days < 30 && $is_current_year) {
        return sprintf('<span title="%s">%s%d天前</span>', $full_date, $clock_icon, $diff->days);
    }
    // 显示具体日期
    else {
        $date_format = $is_current_year ? 'm-d' : 'Y-m-d';
        return sprintf('<span title="%s">%s%s</span>', $full_date, $calendar_icon, wp_date($date_format, $timestamp, $tz));
    }
}

/**
 * 获取网站运行天数
 * 
 * @return int 运行天数
 */
function westlife_get_run_days()
{
    // 从主题设置获取站点建立时间
    $established = get_option('site_established');

    // 如果没有设置建站时间，则使用第一篇文章的时间
    if (empty($established)) {
        $first_post_date = westlife_get_first_post_date();
        $start_timestamp = strtotime($first_post_date);
    } else {
        $start_timestamp = strtotime($established);
    }

    // 如果仍然无法获取有效时间，使用当前时间
    if (!$start_timestamp) {
        $start_timestamp = current_time('timestamp');
    }

    // 计算时间差
    $diff = current_time('timestamp') - $start_timestamp;

    // 转换为天数并确保不为负数
    return max(0, floor($diff / DAY_IN_SECONDS));
}

/**
 * 获取第一篇文章日期
 * 
 * @return string 第一篇文章的发布日期
 */
function westlife_get_first_post_date()
{
    global $wpdb;

    $first_date = $wpdb->get_var("
        SELECT post_date
        FROM $wpdb->posts
        WHERE post_type = 'post' 
        AND post_status = 'publish'
        ORDER BY post_date ASC
        LIMIT 1
    ");

    return $first_date ?: current_time('mysql');
}

/* ==========================================================================
   评论统计功能
   ========================================================================== */

/**
 * 获取评论者数量
 * 
 * @param int $post_id 文章ID
 * @return int 唯一评论者数量
 */
function westlife_get_unique_commenters_count($post_id = 0)
{
    if (!$post_id) {
        $post_id = get_the_ID();
    }

    if (!$post_id) {
        return 0;
    }

    global $wpdb;

    return (int)$wpdb->get_var($wpdb->prepare("
        SELECT COUNT(DISTINCT comment_author_email) 
        FROM {$wpdb->comments} 
        WHERE comment_post_ID = %d 
        AND comment_approved = '1' 
        AND comment_author_email != ''
        AND comment_type = 'comment'
    ", $post_id));
}

/**
 * 获取总评论数
 * 
 * @return int 总评论数
 */
function westlife_get_total_comments()
{
    global $wpdb;

    return (int)$wpdb->get_var("
        SELECT COUNT(*)
        FROM $wpdb->comments
        WHERE comment_approved = '1'
        AND comment_type = 'comment'
    ");
}

/* ==========================================================================
   修复 AJAX 访问统计函数
   ========================================================================== */

/**
 * 修复后的 AJAX 访问统计更新函数
 * 
 * 处理前端发送的访问量更新请求
 */
function westlife_update_visit_count()
{
    // 基础安全检查
    if (!wp_verify_nonce($_POST['nonce'] ?? '', 'westlife_ajax_nonce')) {
        wp_send_json_error(array('message' => __('安全验证失败', 'westlife')));
        return;
    }

    // 获取文章ID
    $post_id = isset($_POST['post_id']) ? absint($_POST['post_id']) : get_the_ID();

    if (!$post_id) {
        wp_send_json_error(array('message' => __('无效的文章ID', 'westlife')));
        return;
    }

    // 验证文章是否存在且已发布
    $post = get_post($post_id);
    if (!$post || $post->post_status !== 'publish') {
        wp_send_json_error(array('message' => __('文章不存在或未发布', 'westlife')));
        return;
    }

    // 更新文章访问量
    $new_views = Westlife_Stats::handle_post_views($post_id, 'update');

    // 返回成功响应
    wp_send_json_success(array(
        'post_id' => $post_id,
        'views' => $new_views,
        'formatted_views' => westlife_format_views($new_views),
        'message' => __('访问量已更新', 'westlife')
    ));
}

function westlife_ajax_update_visit_count()
{
    return westlife_update_visit_count();
}

/* ==========================================================================
   缓存清理钩子
   ========================================================================== */

/**
 * 清理字数缓存
 * 
 * @param int $post_id 文章ID
 */
function westlife_clean_words_cache($post_id)
{
    if (wp_is_post_revision($post_id)) return;

    $post_type = get_post_type($post_id);
    if ($post_type === 'post') {
        Westlife_Stats::clean_cache('words', $post_id);
        westlife_handle_word_count($post_id, true);
    }
}

/**
 * 清理访问量缓存
 * 
 * @param int $post_id 文章ID
 */
function westlife_clean_views_cache($post_id)
{
    if (wp_is_post_revision($post_id)) return;

    $post_type = get_post_type($post_id);
    if (in_array($post_type, array('post', 'page'))) {
        Westlife_Stats::clean_cache('views', $post_id);
    }
}

/**
 * 清理活动热力图缓存
 * 
 * @param int $post_id 文章ID
 */
function westlife_clean_activity_cache($post_id)
{
    if (wp_is_post_revision($post_id)) return;

    $post_type = get_post_type($post_id);
    if ($post_type === 'post') {
        Westlife_Stats::clean_cache('activity');
    }
}

/* ==========================================================================
   初始化钩子
   ========================================================================== */

// 文章保存时清理缓存
add_action('save_post', 'westlife_clean_words_cache');
add_action('save_post', 'westlife_clean_activity_cache');
add_action('delete_post', 'westlife_clean_words_cache');
add_action('delete_post', 'westlife_clean_activity_cache');

// 访问量相关缓存清理
add_action('publish_post', 'westlife_clean_views_cache');
add_action('publish_page', 'westlife_clean_views_cache');
add_action('edit_post', 'westlife_clean_views_cache');
add_action('delete_post', 'westlife_clean_views_cache');
add_action('save_post_post', function ($post_id) {
    delete_transient('wl_related_candidates_v2_' . absint($post_id));
});

// 评论相关缓存清理
add_action('comment_post', function ($comment_id) {
    $comment = get_comment($comment_id);
    if ($comment && $comment->comment_approved == '1') {
        Westlife_Stats::clean_cache('activity');
    }
});
add_action('comment_post', function () {
    delete_transient('westlife_content_panel_data_v2');
});
add_action('edit_post', function () {
    delete_transient('westlife_content_panel_data_v2');
});
add_action('delete_post', function () {
    delete_transient('westlife_content_panel_data_v2');
});

/* ==========================================================================
   页脚访客来源信息
   ========================================================================== */

/**
 * 获取最近访客来源信息（用于页脚显示）
 * 
 * @return array|null 包含 city, country, country_code 的数组，失败返回 null
 */
function westlife_get_latest_visitor_info()
{
    // 1) 优先新的 uploads 路径，其次兼容旧主题目录与旧 uploads 根路径
    $paths = [];
    if (function_exists('westlife_get_visitor_data_file')) {
        $paths[] = westlife_get_visitor_data_file();
    }
    if (function_exists('westlife_get_legacy_visitor_data_files')) {
        $paths = array_merge($paths, westlife_get_legacy_visitor_data_files());
    } else {
        $paths = array_merge($paths, [
            trailingslashit(get_stylesheet_directory()) . 'data/visitor.json',
            trailingslashit(get_template_directory()) . 'data/visitor.json',
            trailingslashit(WP_CONTENT_DIR) . 'uploads/visitor.json',
        ]);
    }
    /** 允许通过过滤器扩展路径 */
    if (function_exists('apply_filters')) {
        $paths = apply_filters('westlife_latest_visitor_json_paths', $paths);
    }

    $file = null;
    foreach ($paths as $p) {
        if (is_string($p) && $p !== '' && file_exists($p)) {
            $file = $p;
            break;
        }
    }
    if (!$file) {
        return null;
    }

    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') {
        return null;
    }

    $json = json_decode($raw, true);
    if (empty($json)) {
        return null;
    }

    // 2) 兼容数据结构：
    // - 直接数组: [{...}, {...}]
    // - 包裹字段: { "visitors": [...] }
    $list = [];
    if (is_array($json)) {
        if (isset($json['visitors']) && is_array($json['visitors'])) {
            $list = $json['visitors'];
        } else {
            // 可能已经是索引数组
            $list = array_values($json);
        }
    }
    if (empty($list)) {
        return null;
    }

    // 3) 选择“最新”记录：以 timestamp/updated_at/time 或可解析的 date 为准，取最大值
    $latest = null;
    $latestTs = -1;
    foreach ($list as $row) {
        if (!is_array($row)) continue;
        $ts = null;
        if (isset($row['timestamp']) && is_numeric($row['timestamp'])) {
            $ts = (int) $row['timestamp'];
        } elseif (isset($row['time']) && is_numeric($row['time'])) {
            $ts = (int) $row['time'];
        } elseif (isset($row['updated_at'])) {
            $ts = is_numeric($row['updated_at']) ? (int) $row['updated_at'] : strtotime((string)$row['updated_at']);
        } elseif (isset($row['date'])) {
            $ts = strtotime((string)$row['date']);
        }
        if ($ts === null || $ts === false) {
            // 兜底：没有时间字段则跳过
            continue;
        }
        if ($ts > $latestTs) {
            $latestTs = $ts;
            $latest = $row;
        }
    }

    // 如果遍历没取到，兜底用最后一条（兼容旧文件按时间顺序排列）
    if (!$latest) {
        $latest = end($list);
        if (empty($latest) || !is_array($latest)) {
            return null;
        }
    }

    $country_name = $latest['country'] ?? '未知';
    $country_code = $latest['country_code'] ?? '';

    // 如果没有 country_code，尝试从国家名称获取
    if (empty($country_code) && !empty($country_name) && function_exists('westlife_get_country_code_from_name')) {
        $country_code = westlife_get_country_code_from_name($country_name);
    }

    return [
        'city' => $latest['city'] ?? '未知',
        'country' => $country_name,
        'country_code' => $country_code,
        'timestamp' => ($latest['timestamp'] ?? ($latest['time'] ?? ($latest['updated_at'] ?? ($latestTs > 0 ? $latestTs : time())))),
    ];
}

/**
 * 从国家全名获取国家代码
 * 
 * @param string $country_name 国家全名 (如 'United States', 'China')
 * @return string 两位国家代码或空字符串
 */
function westlife_get_country_code_from_name($country_name)
{
    // 常见国家名称到代码的映射
    $country_map = [
        'United States' => 'US',
        'China' => 'CN',
        'Japan' => 'JP',
        'United Kingdom' => 'GB',
        'Germany' => 'DE',
        'France' => 'FR',
        'Canada' => 'CA',
        'Australia' => 'AU',
        'India' => 'IN',
        'Brazil' => 'BR',
        'Russia' => 'RU',
        'South Korea' => 'KR',
        'Italy' => 'IT',
        'Spain' => 'ES',
        'Mexico' => 'MX',
        'Indonesia' => 'ID',
        'Netherlands' => 'NL',
        'Saudi Arabia' => 'SA',
        'Turkey' => 'TR',
        'Switzerland' => 'CH',
        'Poland' => 'PL',
        'Belgium' => 'BE',
        'Sweden' => 'SE',
        'Iran' => 'IR',
        'Austria' => 'AT',
        'Norway' => 'NO',
        'United Arab Emirates' => 'AE',
        'Israel' => 'IL',
        'Ireland' => 'IE',
        'Denmark' => 'DK',
        'Singapore' => 'SG',
        'Malaysia' => 'MY',
        'South Africa' => 'ZA',
        'Hong Kong' => 'HK',
        'Philippines' => 'PH',
        'Egypt' => 'EG',
        'Finland' => 'FI',
        'Chile' => 'CL',
        'Pakistan' => 'PK',
        'Portugal' => 'PT',
        'Greece' => 'GR',
        'Czech Republic' => 'CZ',
        'Romania' => 'RO',
        'Vietnam' => 'VN',
        'New Zealand' => 'NZ',
        'Peru' => 'PE',
        'Hungary' => 'HU',
        'Ukraine' => 'UA',
        'Bangladesh' => 'BD',
        'Qatar' => 'QA',
        'Kuwait' => 'KW',
        'Morocco' => 'MA',
        'Slovakia' => 'SK',
        'Kenya' => 'KE',
        'Ethiopia' => 'ET',
        'Argentina' => 'AR',
        'Colombia' => 'CO',
        'Algeria' => 'DZ',
        'Uzbekistan' => 'UZ',
        'Thailand' => 'TH',
    ];

    return $country_map[$country_name] ?? '';
}

/**
 * 格式化数字为简洁形式（如 2.2万）
 * 
 * @param int $number 要格式化的数字
 * @return string 格式化后的字符串
 */
function westlife_format_number_short($number)
{
    $number = absint($number);

    if ($number >= 100000000) {
        // 大于等于1亿，显示为 X.X亿
        return round($number / 100000000, 1) . '亿';
    } elseif ($number >= 10000) {
        // 大于等于1万，显示为 X.X万
        return round($number / 10000, 1) . '万';
    } else {
        // 小于1万，直接显示数字
        return number_format_i18n($number);
    }
}
