<?php

/**
 * 友情链接检测系统 - 简化版
 * 单次检测几十个站点，无需复杂的并发和批处理
 */

if (!defined('ABSPATH')) exit;

class WestlifeLinkChecker
{

    private $cache_key = 'westlife_link_status_cache';
    private $cache_duration = 3 * HOUR_IN_SECONDS; // 3小时缓存

    public function __construct()
    {
        // 注册AJAX处理
        add_action('wp_ajax_westlife_check_link_head', array($this, 'ajax_get_cache'));
        add_action('wp_ajax_nopriv_westlife_check_link_head', array($this, 'ajax_get_cache'));

        add_action('wp_ajax_westlife_check_links_realtime', array($this, 'ajax_realtime_check'));
        add_action('wp_ajax_nopriv_westlife_check_links_realtime', array($this, 'ajax_realtime_check'));

        // 定时任务
        add_action('westlife_check_links_cron', array($this, 'cron_check_all'));
        add_action('wp_loaded', array($this, 'schedule_cron'));

        // 管理后台
        add_action('admin_menu', array($this, 'add_admin_menu'));
    }

    /**
     * 注册定时任务
     */
    public function schedule_cron()
    {
        if (!wp_next_scheduled('westlife_check_links_cron')) {
            wp_schedule_event(time(), 'twicedaily', 'westlife_check_links_cron');
        }
    }

    /**
     * 定时任务检测
     */
    public function cron_check_all()
    {

        $this->check_all_links();
    }

    /**
     * 检测所有友链 - 使用 WordPress HTTP API 分批检测
     */
    public function check_all_links($batch_size = 15)
    {
        $links = get_bookmarks(array(
            'hide_invisible' => 0,
            'orderby' => 'name'
        ));
        if (empty($links)) {
            return array();
        }
        $results = array();
        $link_info = array();
        $urls = array();
        foreach ($links as $link) {
            if (empty($link->link_url)) continue;
            $url = $link->link_url;
            // 获取分类信息
            $categories = wp_get_object_terms($link->link_id, 'link_category');
            $category_names = array();
            if (!empty($categories) && !is_wp_error($categories)) {
                foreach ($categories as $cat) {
                    $category_names[] = $cat->name;
                }
            }
            // 保存友链信息
            $link_info[$url] = array(
                'id' => $link->link_id,
                'name' => $link->link_name,
                'description' => $link->link_description,
                'categories' => $category_names,
                'visible' => $link->link_visible === 'Y'
            );
            $urls[] = $url;
        }
        // 简化批处理，直接检测所有URL
        foreach ($urls as $url) {
            $results[$url] = $this->check_single_url_wp($url);
            $results[$url]['link_info'] = $link_info[$url];

            // 轻微延迟，避免过于频繁的请求
            usleep(100000); // 0.1秒
        }
        $this->save_cache($results);

        return $results;
    }

    /**
     * 简化的URL检测 - 更宽松的判断机制
     */
    private function check_single_url_wp($url)
    {
        // 标准化URL
        if (!preg_match('/^https?:\/\//', $url)) {
            $url = 'http://' . $url;
        }

        $args = array(
            'timeout' => 15, // 增加超时时间
            'redirection' => 5, // 增加重定向次数
            'sslverify' => false,
            'user-agent' => 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        );

        $start_time = microtime(true);
        $http_code = 0;
        $error = '';
        $is_available = false;

        // 首先尝试 GET 请求（更兼容）
        $response = wp_remote_get($url, $args);
        $response_time = microtime(true) - $start_time;

        if (is_wp_error($response)) {
            $error = $response->get_error_message();

            // 如果 GET 失败，尝试 HEAD 请求
            if (strpos($error, 'cURL error 28') === false) { // 不是超时错误
                $response = wp_remote_head($url, $args);
                if (!is_wp_error($response)) {
                    $http_code = wp_remote_retrieve_response_code($response);
                    $error = '';
                }
            }
        } else {
            $http_code = wp_remote_retrieve_response_code($response);
        }

        // 更宽松的判断标准
        if ($http_code > 0) {
            // 200-399 都认为是可访问的
            $is_available = ($http_code >= 200 && $http_code < 400);

            // 特殊情况：某些状态码也认为是可访问
            if (!$is_available && in_array($http_code, [403, 429])) {
                $is_available = true; // 403禁止访问和429请求过多，但网站是存在的
            }
        } else {
            // 如果没有HTTP状态码但也没有错误，可能是网络问题
            if (empty($error)) {
                $error = '无法获取响应';
            }
        }

        return array(
            'status' => $is_available,
            'http_code' => $http_code,
            'error' => $error,
            'response_time' => round($response_time * 1000),
            'effective_url' => $url,
            'checked_at' => current_time('mysql'),
            'details' => $this->get_simple_status($http_code, $error)
        );
    }


    /**
     * AJAX安全校验
     */
    private function check_ajax_nonce()
    {
        if (!wp_verify_nonce($_POST['nonce'] ?? '', 'westlife_ajax_nonce')) {
            wp_die(json_encode(array(
                'success' => false,
                'data' => array('message' => '安全验证失败')
            )), 200, array('Content-Type' => 'application/json'));
        }
    }


    /**
     * 获取简单状态描述
     */
    private function get_simple_status($http_code, $error)
    {
        if (!empty($error)) {
            // 简化错误信息
            if (strpos($error, 'cURL error 28') !== false) {
                return '请求超时';
            } elseif (strpos($error, 'cURL error 7') !== false) {
                return '连接失败';
            } elseif (strpos($error, 'cURL error 6') !== false) {
                return '域名解析失败';
            } else {
                return '连接异常';
            }
        }

        if ($http_code >= 200 && $http_code < 300) {
            return '正常访问';
        } elseif ($http_code >= 300 && $http_code < 400) {
            return '正常(重定向)';
        } elseif ($http_code == 403) {
            return '正常(禁止访问)';
        } elseif ($http_code == 429) {
            return '正常(请求限制)';
        } elseif ($http_code >= 400 && $http_code < 500) {
            return "客户端错误({$http_code})";
        } elseif ($http_code >= 500) {
            return "服务器错误({$http_code})";
        } else {
            return '无响应';
        }
    }

    /**
     * 保存缓存
     */
    private function save_cache($results)
    {
        $available_count = count(array_filter($results, function ($r) {
            return $r['status'];
        }));
        // 计算分类统计
        $category_stats = array();
        foreach ($results as $result) {
            if (!isset($result['link_info']['categories'])) continue;
            foreach ($result['link_info']['categories'] as $category) {
                if (!isset($category_stats[$category])) {
                    $category_stats[$category] = array('total' => 0, 'available' => 0);
                }
                $category_stats[$category]['total']++;
                if ($result['status']) {
                    $category_stats[$category]['available']++;
                }
            }
        }
        $cache_data = array(
            'results' => $results,
            'last_check' => current_time('mysql'),
            'total_links' => count($results),
            'available_links' => $available_count,
            'category_stats' => $category_stats
        );
        set_transient($this->cache_key, $cache_data, $this->cache_duration);
        update_option($this->cache_key . '_backup', $cache_data);
    }

    /**
     * 获取缓存
     */
    public function get_cache()
    {
        $cache = get_transient($this->cache_key);

        if (false === $cache) {
            $cache = get_option($this->cache_key . '_backup', array(
                'results' => array(),
                'last_check' => null,
                'total_links' => 0,
                'available_links' => 0,
                'category_stats' => array()
            ));
        }

        return $cache;
    }

    /**
     * AJAX获取缓存结果
     */
    public function ajax_get_cache()
    {
        if (!wp_verify_nonce($_POST['nonce'] ?? '', 'westlife_ajax_nonce')) {
            wp_die(json_encode(array(
                'success' => false,
                'data' => array('message' => '安全验证失败')
            )), 200, array('Content-Type' => 'application/json'));
        }

        $cache_data = $this->get_cache();

        wp_die(json_encode(array(
            'success' => true,
            'data' => $cache_data
        )), 200, array('Content-Type' => 'application/json'));
    }

    /**
    /**
     * AJAX实时检测
     */
    public function ajax_realtime_check()
    {
        $this->check_ajax_nonce();
        try {
            $results = $this->check_all_links();
            $cache_data = $this->get_cache();
            wp_die(json_encode(array(
                'success' => true,
                'data' => array(
                    'results' => $results,
                    'checked_count' => count($results),
                    'category_stats' => $cache_data['category_stats']
                )
            )), 200, array('Content-Type' => 'application/json'));
        } catch (Exception $e) {
            wp_die(json_encode(array(
                'success' => false,
                'data' => array('message' => '检测失败: ' . $e->getMessage())
            )), 200, array('Content-Type' => 'application/json'));
        }
    }
    // 管理后台直接调用 check_all_links 即可，无需单独方法
    public function add_admin_menu()
    {
        add_submenu_page(
            'link-manager.php',
            '友链检测',
            '友链检测',
            'manage_links',
            'link-checker',
            array($this, 'admin_page')
        );
    }

    /**
     * 管理后台页面
     */
    public function admin_page()
    {
        if (isset($_POST['manual_check'])) {
            if (current_user_can('manage_options')) {
                $this->check_all_links();
                echo '<div class="notice notice-success"><p>检测完成！</p></div>';
            }
        }

        if (isset($_POST['clear_cache'])) {
            delete_transient($this->cache_key);
            delete_option($this->cache_key . '_backup');
            echo '<div class="notice notice-success"><p>缓存已清除！</p></div>';
        }

        $cache_data = $this->get_cache();
        $next_check = wp_next_scheduled('westlife_check_links_cron');

?>
        <div class="wrap">
            <h1>友链检测管理</h1>

            <div class="card">
                <h2>检测状态</h2>
                <table class="form-table">
                    <tr>
                        <th>上次检测</th>
                        <td><?php echo $cache_data['last_check'] ?: '暂未检测'; ?></td>
                    </tr>
                    <tr>
                        <th>下次自动检测</th>
                        <td><?php echo $next_check ? date('Y-m-d H:i:s', $next_check) : '未安排'; ?></td>
                    </tr>
                    <tr>
                        <th>友链状态</th>
                        <td>
                            <span style="color: #10b981;"><?php echo $cache_data['available_links']; ?></span>
                            / <?php echo $cache_data['total_links']; ?>
                            <?php if ($cache_data['total_links'] > 0): ?>
                                (<?php echo round($cache_data['available_links'] / $cache_data['total_links'] * 100, 1); ?>%)
                            <?php endif; ?>
                        </td>
                    </tr>
                </table>
            </div>

            <div class="card">
                <h2>操作</h2>
                <form method="post" style="display: inline;">
                    <input type="submit" name="manual_check" class="button-primary" value="立即检测">
                </form>

                <form method="post" style="display: inline; margin-left: 10px;">
                    <input type="submit" name="clear_cache" class="button-secondary" value="清除缓存">
                </form>

                <div style="margin-top: 15px;">
                    <h3>测试单个URL</h3>
                    <form method="post" style="display: flex; align-items: center; gap: 10px;">
                        <input type="url" name="test_url" placeholder="输入要测试的URL" style="width: 300px;" value="<?php echo esc_attr($_POST['test_url'] ?? ''); ?>">
                        <input type="submit" name="test_single" class="button-secondary" value="测试">
                    </form>

                    <?php if (isset($_POST['test_single']) && !empty($_POST['test_url'])): ?>
                        <?php
                        $test_result = $this->check_single_url_wp($_POST['test_url']);
                        ?>
                        <div style="margin-top: 10px; padding: 10px; background: #f1f5f9; border-left: 4px solid <?php echo $test_result['status'] ? '#10b981' : '#ef4444'; ?>;">
                            <strong>测试结果:</strong><br>
                            状态: <span style="color: <?php echo $test_result['status'] ? '#10b981' : '#ef4444'; ?>;"><?php echo $test_result['status'] ? '✓ 可访问' : '✗ 不可访问'; ?></span><br>
                            HTTP状态码: <?php echo $test_result['http_code'] ?: '无'; ?><br>
                            响应时间: <?php echo $test_result['response_time']; ?>ms<br>
                            详情: <?php echo esc_html($test_result['details']); ?><br>
                            <?php if ($test_result['error']): ?>
                                错误: <?php echo esc_html($test_result['error']); ?><br>
                            <?php endif; ?>
                        </div>
                    <?php endif; ?>
                </div>
            </div>

            <?php if (!empty($cache_data['results'])): ?>
                <div class="card">
                    <h2>检测结果</h2>
                    <table class="wp-list-table widefat fixed striped">
                        <thead>
                            <tr>
                                <th>网站</th>
                                <th>状态</th>
                                <th>HTTP状态码</th>
                                <th>响应时间</th>
                                <th>检测时间</th>
                            </tr>
                        </thead>
                        <tbody>
                            <?php foreach ($cache_data['results'] as $url => $result): ?>
                                <tr style="<?php echo !$result['status'] ? 'background-color: #fef2f2;' : ''; ?>">
                                    <td>
                                        <a href="<?php echo esc_url($url); ?>" target="_blank">
                                            <?php echo esc_html(parse_url($url, PHP_URL_HOST)); ?>
                                        </a>
                                    </td>
                                    <td>
                                        <span style="color: <?php echo $result['status'] ? '#10b981' : '#ef4444'; ?>;">
                                            <?php echo $result['status'] ? '✓ 正常' : '✗ 异常'; ?>
                                        </span>
                                    </td>
                                    <td><?php echo $result['http_code'] ?: '-'; ?></td>
                                    <td><?php echo $result['response_time']; ?>ms</td>
                                    <td><?php echo $result['checked_at']; ?></td>
                                </tr>
                            <?php endforeach; ?>
                        </tbody>
                    </table>
                </div>
            <?php endif; ?>
        </div>
<?php
    }
}

// 初始化
new WestlifeLinkChecker();
