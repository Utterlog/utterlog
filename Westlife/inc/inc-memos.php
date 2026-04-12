<?php

/**
 * @package Westlife
 * @since 1.0.0
 * @version 3.0.0
 */

if (!defined('ABSPATH')) exit;

/**
 * Memos 配置类（单例模式）
 */
class Westlife_Memos
{

    private static $instance = null;

    // 配置信息（从后台设置读取，如果没有则使用默认值）
    private $config = [];

    /**
     * 初始化配置（从后台读取）
     */
    private function init_config()
    {
        // 从后台设置读取配置
        $api_url = get_option('westlife_memos_api_url', '');
        $api_token = get_option('westlife_memos_api_token', '');
        $cache_time = get_option('westlife_memos_cache_time', 300);

        // 验证必填项
        if (empty($api_url) || empty($api_token)) {
        }

        $this->config = [
            'api_url' => trim($api_url),
            'api_token' => trim($api_token),
            'cache_time' => max(60, min(3600, intval($cache_time))),
            'per_page' => 9
        ];
    }

    /**
     * 基于配置生成哈希，用于隔离缓存（当域名或 token 变更时，自动使用新缓存）
     */
    private function config_hash()
    {
        return md5($this->config['api_url'] . '|' . $this->config['api_token']);
    }

    private function get_cache_version()
    {
        return (int) get_option('westlife_memos_cache_version', 1);
    }

    private function bump_cache_version()
    {
        $next = $this->get_cache_version() + 1;
        update_option('westlife_memos_cache_version', $next, false);
        return $next;
    }

    /**
     * 统一缓存封装
     */
    private function cache_key($name, array $parts = [])
    {
        $salt = $this->config_hash() . '_v' . $this->get_cache_version() . '_' . implode('_', array_map('strval', $parts));
        return $name . '_' . md5($salt);
    }
    private function get_cache($name, array $parts = [])
    {
        return get_transient($this->cache_key($name, $parts));
    }
    private function set_cache($name, $value, $ttl, array $parts = [])
    {
        return set_transient($this->cache_key($name, $parts), $value, $ttl);
    }
    private function delete_cache($name, array $parts = [])
    {
        return delete_transient($this->cache_key($name, $parts));
    }

    /**
     * 获取实例
     */
    public static function instance()
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    /**
     * 构造函数
     */
    private function __construct()
    {
        $this->init_config();      // 先初始化配置
        $this->validate_config();  // 再验证配置
        $this->init_hooks();       // 最后初始化钩子
    }

    /**
     * 验证配置
     */
    private function validate_config()
    {
        // 检查必需的配置
        if (empty($this->config['api_url'])) {
            return false;
        }

        if (empty($this->config['api_token'])) {
            return false;
        }

        // 检查 URL 格式
        if (!filter_var($this->config['api_url'], FILTER_VALIDATE_URL)) {
            return false;
        }

        // 令牌不再强制为 JWT（不同后端可能格式不同），只校验非空即可
        return true;
    }

    /**
     * 初始化钩子
     */
    private function init_hooks()
    {
        // AJAX 处理
        add_action('wp_ajax_memos_load', [$this, 'ajax_load']);
        add_action('wp_ajax_nopriv_memos_load', [$this, 'ajax_load']);

        add_action('wp_ajax_memos_stats', [$this, 'ajax_stats']);
        add_action('wp_ajax_nopriv_memos_stats', [$this, 'ajax_stats']);

        add_action('wp_ajax_memos_latest', [$this, 'ajax_latest']);
        add_action('wp_ajax_nopriv_memos_latest', [$this, 'ajax_latest']);

        // 资源加载
        add_action('wp_enqueue_scripts', [$this, 'enqueue_assets']);

        // 定时任务
        add_action('wp', [$this, 'schedule_cache_warmup']);
        add_action('memos_cache_warmup', [$this, 'cache_warmup_callback']);
    }

    /**
     * API 请求
     */
    private function api_request($endpoint, $params = [], $method = 'GET', $body = null)
    {
        // 检查配置是否有效
        if (empty($this->config['api_url']) || empty($this->config['api_token'])) {
            return ['error' => 'Memos 未配置，请在后台设置 API URL 和 Token'];
        }

        $url = rtrim($this->config['api_url'], '/') . '/api/v1/' . ltrim($endpoint, '/');

        // GET 请求将参数添加到 URL
        if ($method === 'GET' && !empty($params)) {
            $url .= '?' . http_build_query($params);
        }

        // 准备请求参数
        $args = [
            'method' => $method,
            'timeout' => 30,
            'redirection' => 5,
            'sslverify' => false, // 生产环境中可能需要设为 true
            'blocking' => true,
            'headers' => [
                'Authorization' => 'Bearer ' . $this->config['api_token'],
                'Content-Type' => 'application/json',
                'Accept' => 'application/json',
                'User-Agent' => 'WordPress/' . get_bloginfo('version') . '; ' . home_url()
            ]
        ];

        // POST/PUT/PATCH 请求添加 body
        if ($body !== null && in_array($method, ['POST', 'PUT', 'PATCH'])) {
            $args['body'] = is_array($body) ? json_encode($body) : $body;
        }

        // 尝试发送请求
        $response = wp_remote_request($url, $args);

        // 检查 WordPress HTTP 错误
        if (is_wp_error($response)) {
            $error_codes = $response->get_error_codes();
            $error_message = $response->get_error_message();

            // 根据错误类型返回更友好的消息
            if (in_array('http_request_failed', $error_codes)) {
                return ['error' => '网络连接失败: ' . $error_message];
            } else {
                return ['error' => '请求失败: ' . $error_message];
            }
        }

        // 获取响应信息
        $http_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);
        $headers = wp_remote_retrieve_headers($response);

        // 检查 HTTP 状态码
        if ($http_code < 200 || $http_code >= 300) {
            $error_msg = 'HTTP ' . $http_code;
            if ($http_code == 401) {
                $error_msg .= ': 认证失败，请检查 API Token';
            } elseif ($http_code == 403) {
                $error_msg .= ': 访问被拒绝';
            } elseif ($http_code == 404) {
                $error_msg .= ': API 端点不存在';
            } elseif ($http_code >= 500) {
                $error_msg .= ': 服务器内部错误';
            } else {
                $error_msg .= ': ' . wp_remote_retrieve_response_message($response);
            }


            return ['error' => $error_msg];
        }

        // 检查响应内容
        if (empty($body)) {
            return ['error' => '服务器返回空响应'];
        }

        // 解析 JSON
        $data = json_decode($body, true);

        if (json_last_error() !== JSON_ERROR_NONE) {
            $json_error = json_last_error_msg();
            return ['error' => 'JSON 解析失败: ' . $json_error];
        }

        // 检查 API 级别的错误
        if (isset($data['error']) || isset($data['message'])) {
            $api_error = $data['error'] ?? $data['message'] ?? 'Unknown API error';
            return ['error' => 'API 错误: ' . $api_error];
        }

        return $data;
    }

    /**
     * 获取 Memos 列表（优化版本：直接API分页）
     */
    public function get_memos($page = 1, $limit = null, $page_token = '')
    {
        $limit = $limit ?: $this->config['per_page'];

        // 新策略：直接从API获取指定页数据，不预加载全部
        $api_limit = min($limit, 20); // 限制单次请求数量

        // 使用分页API直接获取数据
        $data = $this->get_memos_page($page_token, $api_limit);

        if (isset($data['error'])) {
            return [
                'memos' => [],
                'total' => 0,
                'page' => $page,
                'has_more' => false,
                'total_count' => 0,
                'error' => $data['error']
            ];
        }

        $memos = $data['memos'] ?? [];
        $next_page_token = $data['nextPageToken'] ?? '';

        // 处理memos数据
        $processed_memos = $this->format_memos($memos);

        $result = [
            'memos' => $processed_memos,
            'total' => count($processed_memos),
            'page' => $page,
            'has_more' => !empty($next_page_token),
            'next_page_token' => $next_page_token,
            'total_count' => -1, // 不再预计算总数，提升性能
        ];

        // 首页短缓存，其余页跟随配置，兼顾新鲜度与 API 压力
        $cache_time = ($page === 1 && empty($page_token)) ? 120 : $this->config['cache_time'];
        $this->set_cache('memos_list', $result, $cache_time, [$page, $limit, $page_token]);

        return $result;
    }

    /**
     * 获取 Memos 列表（兼容旧版本）
     */
    public function get_memos_legacy($page = 1, $limit = null)
    {
        $limit = $limit ?: $this->config['per_page'];

        // 缓存键
        $cached = $this->get_cache('memos_list_legacy', [$page, $limit]);

        if ($cached !== false) {
            return $cached;
        }

        // 获取所有 memos 数据（只在必要时使用）
        $all_memos = $this->get_all_memos();
        $total_count = count($all_memos);

        if (empty($all_memos)) {
            $result = [
                'memos' => [],
                'total' => 0,
                'page' => $page,
                'has_more' => false,
                'total_count' => 0,
                'error' => 'No memos available'
            ];
        } else {
            // 计算分页
            $offset = ($page - 1) * $limit;
            $page_memos = array_slice($all_memos, $offset, $limit);

            $result = [
                'memos' => $this->format_memos($page_memos),
                'total' => count($page_memos),
                'page' => $page,
                'has_more' => ($offset + $limit) < $total_count,
                'total_count' => $total_count
            ];
        }        // 缓存结果 - 第一页使用更短的缓存时间以提高实时性
        $cache_time = ($page === 1) ? 60 : $this->config['cache_time']; // 第一页1分钟，其他页5分钟
        $this->set_cache('memos_list_legacy', $result, $cache_time, [$page, $limit]);

        return $result;
    }

    /**
     * 获取指定页的 Memos（按需分页加载，提升性能）
     */
    private function get_memos_page($page_token = '', $limit = 20)
    {
        $cached = $this->get_cache('memos_page', [$page_token, $limit]);

        if ($cached !== false) {
            return $cached;
        }

        $params = ['limit' => $limit];
        if (!empty($page_token)) {
            $params['pageToken'] = $page_token;
        }

        $data = $this->api_request('memos', $params);

        if (isset($data['error'])) {
            return $data; // 返回错误信息
        }

        // 分页数据缓存跟随全局配置
        $this->set_cache('memos_page', $data, $this->config['cache_time'], [$page_token, $limit]);

        return $data;
    }

    /**
     * 获取预热缓存的 Memos（后台任务使用）
     */
    private function get_all_memos()
    {
        $cached = $this->get_cache('all_memos_list');

        if ($cached !== false) {
            return $cached;
        }

        // 只在后台任务或管理员强制刷新时才执行完整加载
        if (!wp_doing_cron() && !current_user_can('manage_options')) {
            // 普通用户访问时，返回空数组，强制使用分页加载
            return [];
        }

        $all_memos = [];
        $page_token = '';
        $max_pages = 20; // 降低最大页数，避免超时
        $page_count = 0;

        do {
            $params = ['limit' => 30]; // 降低每页数量
            if (!empty($page_token)) {
                $params['pageToken'] = $page_token;
            }

            $data = $this->api_request('memos', $params);

            if (isset($data['error'])) {
                break;
            }

            if (empty($data['memos'])) {
                break;
            }

            $all_memos = array_merge($all_memos, $data['memos']);
            $page_token = isset($data['nextPageToken']) ? $data['nextPageToken'] : '';
            $page_count++;
        } while (!empty($page_token) && $page_count < $max_pages);

        // 预热和后台统计使用更长缓存
        $this->set_cache('all_memos_list', $all_memos, 15 * MINUTE_IN_SECONDS);

        return $all_memos;
    }

    /**
     * 获取最新一条
     */
    public function get_latest()
    {
        $cached = $this->get_cache('memos_latest');

        if ($cached !== false) {
            return $cached;
        }

        $data = $this->api_request('memos', ['limit' => 1]);

        if (isset($data['error']) || empty($data['memos'])) {
            return null;
        }

        $memo = $this->format_memo($data['memos'][0]);
        $this->set_cache('memos_latest', $memo, 5 * MINUTE_IN_SECONDS);

        return $memo;
    }

    /**
     * 获取统计信息
     */
    public function get_stats()
    {
        $cached = $this->get_cache('memos_stats');

        if ($cached !== false) {
            if (is_array($cached)) {
                $cached['fromCache'] = true;
            }
            return $cached;
        }

        // 获取所有 memos 计算统计 - 使用分页遍历
        $all_memos = [];
        $page_token = '';
        $max_pages = 50; // 防止无限循环
        $page_count = 0;

        do {
            $params = ['limit' => 50];
            if (!empty($page_token)) {
                $params['pageToken'] = $page_token;
            }

            $data = $this->api_request('memos', $params);

            if (isset($data['error']) || empty($data['memos'])) {
                break;
            }

            $all_memos = array_merge($all_memos, $data['memos']);
            $page_token = isset($data['nextPageToken']) ? $data['nextPageToken'] : '';
            $page_count++;
        } while (!empty($page_token) && $page_count < $max_pages);

        if (empty($all_memos)) {
            return [
                'total' => 0,
                'totalMemos' => 0, // 添加兼容字段
                'days' => 0,
                'totalDays' => 0,  // 添加兼容字段
                'last30' => 0,
                'thisMonth' => 0
            ];
        }

        // 计算天数：从第一条memo到今天的总天数
        $total_days = 0;
        $count_last30 = 0;
        $count_this_month = 0;
        if (!empty($all_memos)) {
            // 找到最早的memo日期（只取日期部分）
            $earliest_date = null;
            $now_ts = time();
            $last30_ts = strtotime('-30 days', $now_ts);
            $current_month = date('Y-m');
            foreach ($all_memos as $memo) {
                if (isset($memo['createTime'])) {
                    $memo_date = date('Y-m-d', strtotime($memo['createTime']));
                    if ($earliest_date === null || $memo_date < $earliest_date) {
                        $earliest_date = $memo_date;
                    }

                    $ts = strtotime($memo['createTime']);
                    if ($ts !== false) {
                        if ($ts >= $last30_ts) {
                            $count_last30++;
                        }
                        if (date('Y-m', $ts) === $current_month) {
                            $count_this_month++;
                        }
                    }
                }
            }

            // 计算从最早日期到今天的天数
            if ($earliest_date) {
                $today_date = date('Y-m-d');
                $earliest_timestamp = strtotime($earliest_date);
                $today_timestamp = strtotime($today_date);
                $total_days = floor(($today_timestamp - $earliest_timestamp) / (24 * 60 * 60)) + 1; // +1 包含开始那一天
            }
        }

        $stats = [
            'total' => count($all_memos),
            'totalMemos' => count($all_memos), // 兼容字段
            'days' => $total_days,
            'totalDays' => $total_days,  // 兼容字段
            'last30' => $count_last30,
            'thisMonth' => $count_this_month,
            'fromCache' => false
        ];

        // 统计代价较高，改为 15 分钟缓存，主要依赖主动清缓存和预热
        $this->set_cache('memos_stats', $stats, 15 * MINUTE_IN_SECONDS);

        return $stats;
    }

    /**
     * 获取总数量
     */
    public function get_count()
    {
        $stats = $this->get_stats();
        return $stats['total'];
    }

    /**
     * 格式化单条 Memo
     */
    private function format_memo($memo)
    {
        return [
            'id' => $memo['name'] ?? $memo['id'] ?? '',
            'name' => $memo['name'] ?? '', // 保留原始 name 字段（可能包含路径前缀）
            'uid' => $memo['uid'] ?? '',   // 保留 uid 字段（纯 ID）
            'content' => $memo['content'] ?? '',
            'html' => $this->parse_content($memo['content'] ?? ''),
            'content_html' => $this->parse_content($memo['content'] ?? ''), // 兼容首页
            'excerpt' => $this->get_excerpt($memo['content'] ?? ''),
            'time' => $memo['createTime'] ?? '',
            'createTime' => $memo['createTime'] ?? '',  // 保留原始字段
            'time_ago' => $this->time_ago($memo['createTime'] ?? ''),
            'time_full' => $this->format_time($memo['createTime'] ?? ''),
            'tags' => $memo['tags'] ?? $this->parse_tags($memo['content'] ?? ''),
            'images' => $this->extract_images($memo['attachments'] ?? []),
            'has_images' => !empty($memo['attachments']),
            'pinned' => $memo['pinned'] ?? false,
            'visibility' => $memo['visibility'] ?? 'PUBLIC'
        ];
    }

    /**
     * 格式化多条 Memos
     */
    private function format_memos($memos)
    {
        return array_map([$this, 'format_memo'], $memos);
    }

    /**
     * 解析内容（Markdown 转 HTML）
     */
    private function parse_content($content)
    {
        // 简单的 Markdown 解析
        $html = $content;

        // 链接
        $html = preg_replace('/\[([^\]]+)\]\(([^\)]+)\)/', '<a href="$2" target="_blank">$1</a>', $html);

        // 粗体
        $html = preg_replace('/\*\*([^\*]+)\*\*/', '<strong>$1</strong>', $html);

        // 斜体
        $html = preg_replace('/\*([^\*]+)\*/', '<em>$1</em>', $html);

        // 代码
        $html = preg_replace('/`([^`]+)`/', '<code>$1</code>', $html);

        // 换行
        $html = nl2br($html);

        // 标签高亮
        $html = preg_replace('/#(\S+)/', '<span class="memo-tag">#$1</span>', $html);

        return $html;
    }

    /**
     * 获取摘要
     */
    private function get_excerpt($content, $length = 100)
    {
        $content = strip_tags($content);
        if (mb_strlen($content) > $length) {
            $content = mb_substr($content, 0, $length) . '...';
        }
        return $content;
    }

    /**
     * 解析标签
     */
    private function parse_tags($content)
    {
        preg_match_all('/#(\S+)/', $content, $matches);
        return array_unique($matches[1] ?? []);
    }

    /**
     * 提取图片
     */
    private function extract_images($attachments = [])
    {
        $images = [];
        if (!is_array($attachments)) {
            return $images;
        }
        foreach ($attachments as $attachment) {
            if (isset($attachment['type']) && strpos($attachment['type'], 'image') !== false) {
                $url = $attachment['externalLink'] ?? '';

                // 如果没有 externalLink，构建完整 URL
                if (empty($url) && isset($attachment['name'])) {
                    $filename = $attachment['filename'] ?? 'image';
                    // URL编码文件名
                    $encoded_filename = rawurlencode($filename);

                    // 构建基础URL
                    $base_url = rtrim($this->config['api_url'], '/') . '/file/' . $attachment['name'] . '/' . $encoded_filename;

                    $url = $base_url;
                    $thumbnail_url = $base_url . '?thumbnail=true';
                } else {
                    $thumbnail_url = $url;
                }

                $images[] = [
                    'url' => $url,
                    'thumbnail' => $thumbnail_url,
                    'filename' => $attachment['filename'] ?? ''
                ];
            }
        }
        return $images;
    }

    /**
     * 相对时间
     */
    public function time_ago($datetime)
    {
        $timestamp = westlife_parse_timestamp($datetime);
        if (!$timestamp) return '';

        $diff = westlife_current_timestamp() - $timestamp;

        if ($diff < 60) return '刚刚';
        if ($diff < 3600) return floor($diff / 60) . ' 分钟前';
        if ($diff < 86400) return floor($diff / 3600) . ' 小时前';
        if ($diff < 604800) return floor($diff / 86400) . ' 天前';
        if ($diff < 2592000) return floor($diff / 604800) . ' 周前';
        if ($diff < 31536000) return floor($diff / 2592000) . ' 个月前';
        return floor($diff / 31536000) . ' 年前';
    }

    /**
     * 格式化时间
     */
    public function format_time($datetime)
    {
        $timestamp = westlife_parse_timestamp($datetime);
        if (!$timestamp) return '';

        return wp_date('Y年n月j日 H:i', $timestamp, westlife_wp_timezone());
    }

    /**
     * AJAX: 加载 Memos - 简化调试版
     */
    public function ajax_load()
    {
        try {
            // 获取参数
            $page = isset($_POST['page']) ? absint($_POST['page']) : 1;
            $limit = isset($_POST['limit']) ? absint($_POST['limit']) : $this->config['per_page'];
            $page_token = isset($_POST['page_token']) ? sanitize_text_field($_POST['page_token']) : '';
            $force = isset($_POST['force']) && $_POST['force'] == '1';

            // 处理 offset 参数（兼容旧版本）
            if (isset($_POST['offset']) && !isset($_POST['page'])) {
                $offset = absint($_POST['offset']);
                $page = floor($offset / $limit) + 1;
            }

            $page = max(1, $page);
            $limit = max(1, min($limit, 20)); // 降低限制提升性能

            // 如果强制刷新，清除相关缓存
            if ($force) {
                $this->delete_cache('memos_page', [$page_token, $limit]);
                $this->delete_cache('memos_list', [$page, $limit, $page_token]);
            }

            // 获取数据 - 使用优化的分页方法
            $result = $this->get_memos($page, $limit, $page_token);

            if (isset($result['error'])) {
                wp_send_json_error($result['error']);
                return;
            }

            wp_send_json_success($result);
        } catch (Exception $e) {
            wp_send_json_error('加载失败: ' . $e->getMessage());
        }
    }
    /**
     * AJAX: 获取统计
     */
    public function ajax_stats()
    {
        // 检查是否要清除缓存（兼容两种参数）
        if ((isset($_POST['clear_cache']) && $_POST['clear_cache']) || (isset($_POST['force_refresh']) && $_POST['force_refresh'])) {
            $this->delete_cache('memos_stats');
        }

        $stats = $this->get_stats();
        wp_send_json_success($stats);
    }

    /**
     * AJAX: 获取最新
     */
    public function ajax_latest()
    {
        $memo = $this->get_latest();

        if ($memo) {
            wp_send_json_success($memo);
        } else {
            wp_send_json_error('暂无数据');
        }
    }



    /**
     * 加载资源文件
     */
    public function enqueue_assets()
    {
        if (!is_page_template('template-pages/page-memos.php')) {
            return;
        }

        $version = wp_get_theme()->get('Version');
        $uri = get_template_directory_uri();
        $has_app_bundle = function_exists('westlife_has_app_bundle') && westlife_has_app_bundle();
        $script_handle = function_exists('westlife_get_frontend_script_handle') ? westlife_get_frontend_script_handle() : 'westlife-memos';

        // CSS - 加载 memos 模块样式（依赖主题主样式）
        if (!$has_app_bundle) {
            wp_enqueue_style('westlife-memos', $uri . '/assets/modules/memos/memos.css', ['westlife-main'], $version);
            wp_enqueue_style('westlife-memos-interactions', $uri . '/assets/modules/memos/memos-interactions.css', ['westlife-memos'], $version);
        }

        // JS - 依赖 westlife-utils 以使用主题统一通知系统
        if (!$has_app_bundle) {
            wp_enqueue_script('westlife-memos', $uri . '/assets/modules/memos/memos.js', ['jquery', 'westlife-utils'], $version, true);
            wp_enqueue_script('westlife-memos-interactions', $uri . '/assets/modules/memos/memos-interactions.js', ['westlife-memos'], $version, true);
        }

        // 传递配置
        wp_localize_script($script_handle, 'MemosAPI', [
            'ajax_url' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('memos_nonce'),
            'per_page' => $this->config['per_page'],
            'autoRefresh' => true,
            'refreshInterval' => 600000, // 10分钟刷新一次
            'debug_mode' => WP_DEBUG, // 添加调试模式标识
            'api_url_preview' => substr($this->config['api_url'], 0, 30) . '...', // 显示部分 API URL
            'memos_base_url' => $this->config['api_url'], // 添加 Memos 基础 URL，用于生成查看链接
            'isAdmin' => current_user_can('manage_options'), // 添加管理员标识
            'strings' => [
                'loading' => '加载中...',
                'load_more' => '加载更多',
                'no_more' => '没有更多了',
                'error' => '加载失败',
                'retry' => '重试'
            ]
        ]);

        // 传递评论系统配置
        $comment_system = get_option('westlife_memos_comment_system', 'none');
        $comment_config = [];

        if ($comment_system === 'twikoo') {
            $comment_config['twikoo_envid'] = get_option('westlife_memos_twikoo_envid', '');

            // 加载 Twikoo 脚本
            if (!empty($comment_config['twikoo_envid'])) {
                wp_enqueue_script('twikoo', 'https://static.bluecdn.com/npm/twikoo@1.6.39/dist/twikoo.all.min.js', [], '1.6.39', true);
            }
        } elseif ($comment_system === 'waline') {
            $comment_config['waline_serverurl'] = get_option('westlife_memos_waline_serverurl', '');

            // 加载 Waline 脚本和样式
            if (!empty($comment_config['waline_serverurl'])) {
                wp_enqueue_style('waline', 'https://unpkg.com/@waline/client@v3/dist/waline.css', [], '3.0.0');
                wp_enqueue_script('waline', 'https://unpkg.com/@waline/client@v3/dist/waline.js', [], '3.0.0', true);
            }
        }

        // 正确的方式：将数据包装在数组中
        wp_add_inline_script($script_handle, 'window.westlifeMemosCommentSystem = ' . json_encode($comment_system) . ';', 'before');
        wp_add_inline_script($script_handle, 'window.westlifeMemosCommentConfig = ' . json_encode($comment_config) . ';', 'before');
    }

    /**
     * 安排缓存预热定时任务
     */
    public function schedule_cache_warmup()
    {
        if (!wp_next_scheduled('memos_cache_warmup')) {
            wp_schedule_event(time(), 'hourly', 'memos_cache_warmup');
        }
    }

    /**
     * 缓存预热回调函数
     */
    public function cache_warmup_callback()
    {
        // 增加执行时间限制
        if (function_exists('set_time_limit')) {
            set_time_limit(300);
        }

        try {
            // 预热首页数据缓存
            $this->get_memos_page('', 20);

            // 预热统计数据
            $this->get_stats();

            // 预热最新数据
            $this->get_latest();

            // 记录预热日志
            if (defined('WP_DEBUG') && WP_DEBUG) {
                $log_file = get_template_directory() . '/data/memos_warmup.log';
                $log_data = [
                    'time' => current_time('mysql'),
                    'timestamp' => time(),
                    'status' => 'success',
                    'message' => 'Cache warmup completed'
                ];
                @file_put_contents($log_file, json_encode($log_data, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
            }
        } catch (Exception $e) {
            // 记录错误但不中断
            if (defined('WP_DEBUG') && WP_DEBUG) {
                error_log('Memos Cache Warmup Error: ' . $e->getMessage());
            }
        }
    }

    /**
     * 创建新 Memo
     */
    public function create_memo($data)
    {
        if (empty($data['content'])) {
            return ['error' => '内容不能为空'];
        }

        // 准备 POST 请求的数据
        $memo_data = [
            'content' => $data['content'],
            'visibility' => $data['visibility'] ?? 'PUBLIC'
        ];

        // 调用 Memos API 创建
        $result = $this->api_request('memos', [], 'POST', $memo_data);

        if (isset($result['error'])) {
            return $result;
        }

        return $result;
    }

    /**
     * 删除 Memo
     */
    public function delete_memo($memo_name)
    {
        if (empty($memo_name)) {
            return ['error' => 'Memo ID 不能为空'];
        }

        // 确保 memo_name 格式正确（memos/xxx）
        if (!str_starts_with($memo_name, 'memos/')) {
            $memo_name = 'memos/' . $memo_name;
        }

        // 调用 Memos API 删除（使用 DELETE 方法）
        $result = $this->api_request($memo_name, [], 'DELETE');

        if (isset($result['error'])) {
            return $result;
        }

        return ['success' => true];
    }

    /**
     * 清除所有 Memos 缓存
     */
    public function clear_all_cache()
    {
        $this->bump_cache_version();
    }
}

// 初始化
Westlife_Memos::instance();

/**
 * 全局函数：获取实例
 */
function westlife_memos()
{
    return Westlife_Memos::instance();
}

/**
 * 获取 Memos 总数量（用于首页统计）
 */
function westlife_get_memos_count()
{
    $memos = westlife_memos();
    return $memos->get_count();
}

/**
 * 获取最新一条 Memo（用于首页展示）
 */
function westlife_get_latest_memo()
{
    $memos = westlife_memos();
    $latest = $memos->get_latest();

    if (!$latest) {
        return [
            'content' => '暂无说说',
            'html' => '暂无说说',
            'time_ago' => '',
            'createTime' => '',
            'excerpt' => '暂无说说'
        ];
    }

    return $latest;
}

/**
 * 格式化 Memo 时间（用于前端显示）
 * 
 * @param string $datetime 时间字符串
 * @return string 格式化后的时间
 */
function westlife_format_memo_time($datetime)
{
    if (empty($datetime)) {
        return '';
    }

    $memos = westlife_memos();
    return $memos->time_ago($datetime);
}

/**
 * AJAX: 测试 Memos 连接
 */
function westlife_ajax_test_memos_connection()
{
    // 验证 nonce
    if (!wp_verify_nonce($_POST['nonce'] ?? '', 'westlife_ajax_nonce')) {
        wp_send_json_error(['message' => '安全验证失败']);
    }

    $api_url = sanitize_url($_POST['api_url'] ?? '');
    $api_token = sanitize_text_field($_POST['api_token'] ?? '');

    if (empty($api_url)) {
        wp_send_json_error(['message' => '请填写 API 地址']);
    }

    // 测试获取 memos 列表
    $test_url = rtrim($api_url, '/') . '/api/v1/memos?limit=1';

    $args = [
        'timeout' => 10,
        'headers' => []
    ];

    if (!empty($api_token)) {
        $args['headers']['Authorization'] = 'Bearer ' . $api_token;
    }

    $start_time = microtime(true);
    $response = wp_remote_get($test_url, $args);
    $end_time = microtime(true);
    $response_time = round(($end_time - $start_time) * 1000); // 转换为毫秒

    if (is_wp_error($response)) {
        wp_send_json_error([
            'message' => '连接失败: ' . $response->get_error_message(),
            'count' => 0,
            'details' => [
                'url' => $test_url,
                'time' => $response_time
            ]
        ]);
    }

    $status_code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);

    if ($status_code === 200) {
        $data = json_decode($body, true);
        if (isset($data['memos']) || is_array($data)) {
            $count = isset($data['memos']) ? count($data['memos']) : count($data);
            wp_send_json_success([
                'message' => '连接成功！',
                'count' => $count,
                'details' => [
                    'url' => $test_url,
                    'time' => $response_time,
                    'status' => $status_code
                ]
            ]);
        } else {
            wp_send_json_error([
                'message' => 'API 返回格式异常',
                'count' => 0,
                'details' => [
                    'url' => $test_url,
                    'time' => $response_time,
                    'status' => $status_code,
                    'response' => substr($body, 0, 200)
                ]
            ]);
        }
    } elseif ($status_code === 401) {
        wp_send_json_error([
            'message' => 'API Token 无效或未授权',
            'count' => 0,
            'details' => [
                'url' => $test_url,
                'time' => $response_time,
                'status' => 401
            ]
        ]);
    } else {
        wp_send_json_error([
            'message' => "连接失败，状态码: {$status_code}",
            'count' => 0,
            'details' => [
                'url' => $test_url,
                'time' => $response_time,
                'status' => $status_code,
                'response' => substr($body, 0, 200)
            ]
        ]);
    }
}
add_action('wp_ajax_test_memos_connection', 'westlife_ajax_test_memos_connection');

/**
 * AJAX: 清除 Memos 缓存
 */
function westlife_ajax_clear_memos_cache()
{
    // 验证 nonce
    if (!wp_verify_nonce($_POST['nonce'] ?? '', 'westlife_ajax_nonce')) {
        wp_send_json_error(['message' => '安全验证失败']);
    }

    $memos = westlife_memos();
    if (!$memos) {
        wp_send_json_error(['message' => 'Memos 实例未初始化']);
    }

    // 统一版本化失效，避免遗漏动态缓存键
    $memos->clear_all_cache();

    wp_send_json_success([
        'message' => '缓存已清除！所有 Memos 数据将在下次访问时重新获取。'
    ]);
}
add_action('wp_ajax_clear_memos_cache', 'westlife_ajax_clear_memos_cache');

/**
 * AJAX: 强制刷新 Memos 热力图
 */
function westlife_ajax_refresh_memos_heatmap()
{
    // 验证 nonce
    if (!wp_verify_nonce($_POST['nonce'] ?? '', 'westlife_ajax_nonce')) {
        wp_send_json_error(['message' => '安全验证失败']);
    }

    $memos = westlife_memos();
    if (!$memos) {
        wp_send_json_error(['message' => 'Memos 实例未初始化']);
    }

    // 版本化清缓存，确保热力图依赖的列表/统计缓存一起失效
    $memos->clear_all_cache();

    // 尝试立即获取新数据
    try {
        $result = $memos->get_memos_legacy(1, 365); // 获取最近一年的数据用于热力图

        if (isset($result['error'])) {
            wp_send_json_error([
                'message' => '热力图数据获取失败: ' . $result['error']
            ]);
        }

        // 计算统计信息
        $total_days = 365;
        $days_with_data = 0;
        $date_counts = [];

        if (!empty($result['memos'])) {
            foreach ($result['memos'] as $memo) {
                $date = date('Y-m-d', strtotime($memo['createTime'] ?? ''));
                if (!isset($date_counts[$date])) {
                    $date_counts[$date] = 0;
                    $days_with_data++;
                }
                $date_counts[$date]++;
            }
        }

        wp_send_json_success([
            'message' => '热力图刷新成功！',
            'total_days' => $total_days,
            'days_with_data' => $days_with_data,
            'source' => 'Memos API (最新数据)',
            'date_counts' => $date_counts
        ]);
    } catch (Exception $e) {
        wp_send_json_error([
            'message' => '热力图刷新失败: ' . $e->getMessage()
        ]);
    }
}
add_action('wp_ajax_refresh_memos_heatmap', 'westlife_ajax_refresh_memos_heatmap');

/**
 * AJAX: 创建新 Memo（仅管理员）
 */
function westlife_ajax_create_memo()
{
    // 验证 nonce（使用与前端一致的 nonce 名称）
    if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'memos_nonce')) {
        wp_send_json_error(['message' => '安全验证失败']);
    }

    // 验证管理员权限
    if (!current_user_can('manage_options')) {
        wp_send_json_error(['message' => '权限不足，仅管理员可发布']);
    }

    $content = sanitize_textarea_field($_POST['content'] ?? '');
    $visibility = sanitize_text_field($_POST['visibility'] ?? 'PUBLIC');

    if (empty($content)) {
        wp_send_json_error(['message' => '内容不能为空']);
    }

    // 准备请求数据
    $memo_data = [
        'content' => $content,
        'visibility' => $visibility
    ];

    // 调用 Memos API 创建
    $memos = Westlife_Memos::instance();
    $result = $memos->create_memo($memo_data);

    if (isset($result['error'])) {
        wp_send_json_error(['message' => $result['error']]);
    }

    // 清除相关缓存
    $memos->clear_all_cache();

    wp_send_json_success([
        'message' => '发布成功！',
        'memo' => $result
    ]);
}
add_action('wp_ajax_memos_create', 'westlife_ajax_create_memo');

/**
 * AJAX: 删除 Memo（仅管理员）
 */
function westlife_ajax_delete_memo()
{
    // 验证 nonce（使用与前端一致的 nonce 名称）
    if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'memos_nonce')) {
        wp_send_json_error(['message' => '安全验证失败']);
    }

    // 验证管理员权限
    if (!current_user_can('manage_options')) {
        wp_send_json_error(['message' => '权限不足，仅管理员可删除']);
    }

    $memo_name = sanitize_text_field($_POST['memo_name'] ?? '');

    if (empty($memo_name)) {
        wp_send_json_error(['message' => 'Memo ID 不能为空']);
    }

    // 调用 Memos API 删除
    $memos = Westlife_Memos::instance();
    $result = $memos->delete_memo($memo_name);

    if (isset($result['error'])) {
        wp_send_json_error(['message' => $result['error']]);
    }

    // 清除相关缓存
    $memos->clear_all_cache();

    wp_send_json_success([
        'message' => '删除成功！'
    ]);
}
add_action('wp_ajax_memos_delete', 'westlife_ajax_delete_memo');

/**
 * AJAX: Memos 点赞
 */
function westlife_ajax_memos_like()
{
    // 验证 nonce
    if (!isset($_POST['nonce']) || !wp_verify_nonce($_POST['nonce'], 'memos_nonce')) {
        wp_send_json_error([
            'message' => '安全验证失败'
        ]);
        return;
    }

    $memo_id = isset($_POST['memo_id']) ? sanitize_text_field($_POST['memo_id']) : '';

    if (empty($memo_id)) {
        wp_send_json_error([
            'message' => '参数错误'
        ]);
        return;
    }

    // 获取当前点赞数
    $option_key = 'memos_likes_' . $memo_id;
    $likes = get_option($option_key, 0);

    // 检查用户是否已点赞（使用 Cookie）
    $cookie_name = 'memos_liked_' . $memo_id;
    if (isset($_COOKIE[$cookie_name])) {
        wp_send_json_error([
            'message' => '您已经点赞过了'
        ]);
        return;
    }

    // 增加点赞数
    $likes = intval($likes) + 1;
    update_option($option_key, $likes);

    if (function_exists('westlife_track_visitor_profile_event')) {
        westlife_track_visitor_profile_event('memo_like', [
            'email' => sanitize_email($_POST['email'] ?? ''),
            'name' => sanitize_text_field($_POST['name'] ?? ''),
            'url' => esc_url_raw($_POST['url'] ?? ''),
            'delta' => 1,
        ]);
    }

    // 设置 Cookie（30天过期）
    setcookie($cookie_name, '1', time() + (30 * 24 * 60 * 60), COOKIEPATH, COOKIE_DOMAIN);

    wp_send_json_success([
        'likes' => $likes,
        'message' => '点赞成功！'
    ]);
}
add_action('wp_ajax_memos_like', 'westlife_ajax_memos_like');
add_action('wp_ajax_nopriv_memos_like', 'westlife_ajax_memos_like');

/**
 * AJAX: 获取单个 Memo 点赞数
 */
function westlife_ajax_get_memo_likes()
{
    $memo_id = isset($_POST['memo_id']) ? sanitize_text_field($_POST['memo_id']) : '';

    if (empty($memo_id)) {
        wp_send_json_error([
            'message' => '参数错误'
        ]);
        return;
    }

    $option_key = 'memos_likes_' . $memo_id;
    $likes = get_option($option_key, 0);

    wp_send_json_success([
        'likes' => intval($likes)
    ]);
}
add_action('wp_ajax_get_memo_likes', 'westlife_ajax_get_memo_likes');
add_action('wp_ajax_nopriv_get_memo_likes', 'westlife_ajax_get_memo_likes');

/**
 * AJAX: 批量获取 Memos 点赞数
 */
function westlife_ajax_get_batch_memo_likes()
{
    $memo_ids = isset($_POST['memo_ids']) ? sanitize_text_field($_POST['memo_ids']) : '';

    if (empty($memo_ids)) {
        wp_send_json_error([
            'message' => '参数错误'
        ]);
        return;
    }

    $ids = explode(',', $memo_ids);
    $likes_data = [];

    foreach ($ids as $id) {
        $id = trim($id);
        if (!empty($id)) {
            $option_key = 'memos_likes_' . $id;
            $likes = get_option($option_key, 0);
            $likes_data[$id] = intval($likes);
        }
    }

    wp_send_json_success([
        'likes' => $likes_data
    ]);
}
add_action('wp_ajax_get_batch_memo_likes', 'westlife_ajax_get_batch_memo_likes');
add_action('wp_ajax_nopriv_get_batch_memo_likes', 'westlife_ajax_get_batch_memo_likes');
