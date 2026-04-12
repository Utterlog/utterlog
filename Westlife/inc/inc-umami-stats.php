<?php

/**
 * Westlife Umami Statistics Module
 * 独立的 Umami 统计数据获取模块
 * 
 * @package Westlife
 * @version 1.0.0
 */

if (!defined('ABSPATH')) exit;

class WestlifeUmami
{
    private $site_id;
    private $host_url;
    private $api_token;
    private $cache_duration = 300; // 5分钟缓存
    private $debug = false; // 调试模式（仅在 WP_DEBUG 开启时生效）

    private function get_cache_version()
    {
        return (int) get_option('westlife_umami_cache_version', 1);
    }

    private function bump_cache_version()
    {
        $next = $this->get_cache_version() + 1;
        update_option('westlife_umami_cache_version', $next, false);
        return $next;
    }

    private function build_cache_key($prefix, $suffix)
    {
        return $prefix . '_v' . $this->get_cache_version() . '_' . md5($suffix);
    }

    /**
     * 构造函数
     */
    public function __construct()
    {
        $this->debug = defined('WP_DEBUG') && WP_DEBUG;
        $this->load_config();
        $this->init_hooks();
    }

    /**
     * 调试日志（仅在调试模式下输出）
     */
    private function log($message)
    {
        if ($this->debug) {
            error_log('[Umami] ' . $message);
        }
    }

    /**
     * 获取 SSL 验证设置（智能检测）
     */
    private function get_sslverify()
    {
        // 1. 检查是否通过常量强制设置
        if (defined('WESTLIFE_UMAMI_SSL_VERIFY')) {
            return (bool) WESTLIFE_UMAMI_SSL_VERIFY;
        }

        // 2. 本地开发环境（localhost 或 .local 域名）禁用 SSL 验证
        $host = parse_url(home_url(), PHP_URL_HOST);
        $is_local = ($host === 'localhost' ||
            strpos($host, '127.0.0.1') !== false ||
            strpos($host, '.local') !== false ||
            strpos($host, '.test') !== false);

        if ($is_local) {
            return false;
        }

        // 3. 对于已知的 CDN 或可能有证书问题的域名，禁用 SSL 验证
        // Umami 的 API 调用通常不涉及敏感数据传输，只是读取统计
        $umami_host = parse_url($this->host_url, PHP_URL_HOST);
        $cdn_patterns = ['xifengcdn.com', 'cloudflare', 'cdn.', 'amazonaws.com'];

        foreach ($cdn_patterns as $pattern) {
            if (stripos($umami_host, $pattern) !== false) {
                $this->log('Detected CDN domain, disabling SSL verification for compatibility: ' . $umami_host);
                return false;
            }
        }

        // 4. 默认：生产环境启用 SSL 验证
        return true;
    }

    /**
     * 加载配置
     */
    private function load_config()
    {
        $this->site_id = trim((string) get_option('westlife_umami_site_id', ''));
        $this->host_url = trim((string) get_option('westlife_umami_host_url', ''));

        // API Token 认证配置
        $this->api_token = trim((string) get_option('westlife_umami_api_token', ''));

        // 确保 URL 格式正确 - 移除末尾斜杠，保持一致性
        if ($this->host_url) {
            $this->host_url = rtrim($this->host_url, '/');
        }
    }

    /**
     * 初始化 WordPress 钩子
     */
    private function init_hooks()
    {
        // 添加 AJAX 处理
        add_action('wp_ajax_westlife_get_umami_stats', [$this, 'ajax_get_stats']);
        add_action('wp_ajax_nopriv_westlife_get_umami_stats', [$this, 'ajax_get_stats']);

        // Top N Metrics 接口
        add_action('wp_ajax_westlife_get_umami_topn', [$this, 'ajax_get_topn']);
        add_action('wp_ajax_nopriv_westlife_get_umami_topn', [$this, 'ajax_get_topn']);

        // 注册 JS 脚本
        add_action('wp_enqueue_scripts', [$this, 'enqueue_scripts']);
    }

    /**
     * 注册前端脚本
     */
    public function enqueue_scripts()
    {
        // 只在访客页面加载（需要时可调整为全站加载）
        if (
            is_page_template('template-pages/page-visitor.php') ||
            is_page_template('page-visitor.php')
        ) {
            $has_app_bundle = function_exists('westlife_has_app_bundle') && westlife_has_app_bundle();
            $script_handle = function_exists('westlife_get_frontend_script_handle') ? westlife_get_frontend_script_handle() : 'westlife-umami';

            // 文件已从 assets/js/modules/umami.js 迁移为 assets/modules/umami/umami.js
            $umami_rel_path = '/assets/modules/umami/umami.js';
            $umami_abs_path = get_template_directory() . $umami_rel_path;
            $umami_uri      = get_template_directory_uri() . $umami_rel_path;
            if (!file_exists($umami_abs_path)) {
                // 回退旧路径（避免迁移不完整时报错）
                $fallback_rel = '/assets/js/modules/umami.js';
                $fallback_abs = get_template_directory() . $fallback_rel;
                if (file_exists($fallback_abs)) {
                    $umami_uri = get_template_directory_uri() . $fallback_rel;
                }
            }
            if (!$has_app_bundle) {
                wp_enqueue_script(
                    'westlife-umami',
                    $umami_uri,
                    ['jquery'],
                    WESTLIFE_VERSION,
                    true
                );
            }

            // 传递配置到前端
            wp_localize_script($script_handle, 'westlifeUmami', [
                'ajaxUrl' => admin_url('admin-ajax.php'),
                'nonce' => wp_create_nonce('westlife_umami_nonce'),
                'isConfigured' => $this->is_configured(),
                'cacheTime' => $this->cache_duration * 1000, // 转换为毫秒
                'iconsBase' => trailingslashit(get_template_directory_uri()) . 'assets/images/useragenticons',
            ]);
        }
    }

    /**
     * 检查是否已配置
     */
    public function is_configured()
    {
        // 简化为 Token-only：site_id、host_url、api_token 均需存在
        return !empty($this->site_id) && !empty($this->host_url) && !empty($this->api_token);
    }

    /**
     * 获取统计数据
     */
    public function get_stats()
    {
        if (!$this->is_configured()) {
            return [
                'today_uv' => 0,
                'today_pv' => 0,
                'month_pv' => 0,
                'year_pv' => 0,
                'countries_total' => 0,
                'error' => 'Umami配置不完整'
            ];
        }

        // 尝试从缓存获取
        // 使用站点ID+Host作为缓存键（无需 shareId）
        $cache_key = $this->build_cache_key('westlife_umami_stats', $this->site_id . $this->host_url);
        $cached_data = get_transient($cache_key);

        if ($cached_data !== false) {
            return $cached_data;
        }

        // 获取新数据
        $stats = $this->fetch_fresh_stats();

        // 缓存数据
        if (!isset($stats['error']) || empty($stats['error'])) {
            set_transient($cache_key, $stats, $this->cache_duration);
        }

        return $stats;
    }

    /**
     * 获取新的统计数据
     */
    private function fetch_fresh_stats()
    {
        $today = date('Y-m-d');
        $month_start = date('Y-m-01');
        $year_start = date('Y-01-01');
        $now_ms = time() * 1000;

        $stats = [
            'today_uv' => 0,
            'today_pv' => 0,
            'month_pv' => 0,
            'year_pv' => 0,
            'countries_total' => 0,
            'month_uv' => 0,
            'year_uv'  => 0,
            'total_pv' => 0,
            'today_hourly' => ['pv' => array_fill(0, 24, 0), 'sessions' => array_fill(0, 24, 0)],
            'error' => null,
            'updated_at' => current_time('mysql')
        ];

        try {
            $has_any_data = false;

            // 获取今日数据
            $today_data = $this->fetch_period_data('', $today . ' 00:00:00', $today . ' 23:59:59');
            if ($today_data) {
                $stats['today_pv'] = (int) ($today_data['pageviews'] ?? 0);
                $stats['today_uv'] = (int) ($today_data['visitors'] ?? $today_data['sessions'] ?? 0);
                $has_any_data = true;
            }

            // 获取本月数据
            $month_data = $this->fetch_period_data('', $month_start . ' 00:00:00', date('Y-m-d H:i:s'));
            if ($month_data) {
                $stats['month_pv'] = (int) ($month_data['pageviews'] ?? 0);
                $stats['month_uv'] = (int) ($month_data['visitors'] ?? $month_data['sessions'] ?? 0);
                $has_any_data = true;
            }

            // 获取年度数据
            $year_data = $this->fetch_period_data('', $year_start . ' 00:00:00', date('Y-m-d H:i:s'));
            if ($year_data) {
                $stats['year_pv'] = (int) ($year_data['pageviews'] ?? 0);
                $stats['year_uv'] = (int) ($year_data['visitors'] ?? $year_data['sessions'] ?? 0);
                $has_any_data = true;
            }

            // 今日小时序列（0-23）
            $today_start_ts = strtotime($today . ' 00:00:00');
            $today_end_ts = strtotime($today . ' 23:59:59');
            $series = $this->fetch_time_series($today_start_ts * 1000, $today_end_ts * 1000, 'hour');
            if (is_array($series)) {
                $pv_arr = array_fill(0, 24, 0);
                $ss_arr = array_fill(0, 24, 0);
                if (!empty($series['pageviews'])) {
                    foreach ($series['pageviews'] as $row) {
                        $ts = strtotime($row['x']);
                        if ($ts !== false) {
                            $h = (int) date('G', $ts);
                            if ($h >= 0 && $h <= 23) $pv_arr[$h] = (int) ($row['y'] ?? 0);
                        }
                    }
                }
                if (!empty($series['sessions'])) {
                    foreach ($series['sessions'] as $row) {
                        $ts = strtotime($row['x']);
                        if ($ts !== false) {
                            $h = (int) date('G', $ts);
                            if ($h >= 0 && $h <= 23) $ss_arr[$h] = (int) ($row['y'] ?? 0);
                        }
                    }
                }
                $stats['today_hourly'] = ['pv' => $pv_arr, 'sessions' => $ss_arr];
            }

            // 累计国家数（全站范围）
            $stats['countries_total'] = (int) ($this->get_countries_total() ?? 0);

            // 全部访问（自建站起至今）
            $since_date = get_option('site_established', '2020-01-01');
            $since_ts = strtotime($since_date . ' 00:00:00');
            if ($since_ts === false) {
                $since_ts = strtotime('2020-01-01 00:00:00');
            }
            $total_data = $this->fetch_period_data('', date('Y-m-d H:i:s', $since_ts), date('Y-m-d H:i:s'));
            if ($total_data) {
                $stats['total_pv'] = (int) ($total_data['pageviews'] ?? 0);
            }

            // 如果所有 API 调用都失败了，设置错误信息
            if (!$has_any_data) {
                $stats['error'] = 'Umami API 调用失败：请检查 API Token、Site ID 与 Host URL 设置是否正确。';
                $this->log('Westlife Umami: All API calls failed (token route) for site ID: ' . $this->site_id);
            }
        } catch (Exception $e) {
            $stats['error'] = 'API调用失败: ' . $e->getMessage();
            $this->log('Westlife Umami Error: ' . $e->getMessage());
        }

        return $stats;
    }

    /**
     * 获取时间序列数据（pageviews/sessions）
     * @param int $start_at_ms 毫秒
     * @param int $end_at_ms 毫秒
     * @param string $unit 小时/天等（hour/day）
     * @return array|null
     */
    private function fetch_time_series($start_at_ms, $end_at_ms, $unit = 'hour')
    {
        $token = $this->get_auth_token();
        if (!$token) return null;

        $website_id = $this->site_id;
        $params = [
            'startAt' => (int)$start_at_ms,
            'endAt'   => (int)$end_at_ms,
            'unit'    => $unit,
            'timezone' => 'Asia/Shanghai',
        ];
        $url = rtrim($this->host_url, '/') . '/api/websites/' . $website_id . '/pageviews?' . http_build_query($params);

        $response = wp_remote_get($url, [
            'timeout' => 15,
            'headers' => [
                'Accept'        => 'application/json',
                'Authorization' => 'Bearer ' . $token,
                'User-Agent'    => 'Westlife-Theme-Umami/1.0',
            ],
            'sslverify' => $this->get_sslverify(),
        ]);

        if (is_wp_error($response)) return null;
        $code = wp_remote_retrieve_response_code($response);
        if ($code !== 200) return null;
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        if (!is_array($data)) return null;

        // 直接返回原始的 pageviews/sessions 数组，调用处组装为24个小时
        return [
            'pageviews' => isset($data['pageviews']) && is_array($data['pageviews']) ? $data['pageviews'] : [],
            'sessions'  => isset($data['sessions']) && is_array($data['sessions']) ? $data['sessions'] : [],
        ];
    }

    /**
     * 获取 API Token（通过登录认证）
     * 基于 Umami v2.19.0 官方 API 标准实现
     */
    private function get_auth_token()
    {
        // 使用 API Token 认证
        if (!empty($this->api_token)) {
            $this->log('Umami: Using API token');
            return $this->api_token;
        }

        $this->log('Umami: No API token configured');
        return null;
    }

    /**
     * 获取指定时间段的统计数据
     * 基于 Umami 官方 API 文档实现
     */
    private function fetch_period_data($api_base, $start_time, $end_time)
    {
        // 转换为毫秒时间戳（Umami API 要求）
        $start_at = strtotime($start_time) * 1000;
        $end_at = strtotime($end_time) * 1000;

        $params = [
            'startAt' => $start_at,
            'endAt'   => $end_at,
        ];

        $headers = [
            'Accept'     => 'application/json',
            'User-Agent' => 'Westlife-Theme-Umami/1.0',
        ];

        // Token-only 路径：必须存在 API Token
        $token = $this->get_auth_token();
        if (!$token) {
            $this->log('Umami: API token is not configured');
            return null;
        }
        // 使用标准的 /api/websites/{id}/stats
        $website_id = $this->site_id;
        $url = $this->host_url . '/api/websites/' . $website_id . '/stats?' . http_build_query($params);
        $headers['Authorization'] = 'Bearer ' . $token;

        $this->log('Umami Stats API Request: ' . $url);

        $response = wp_remote_get($url, [
            'timeout'   => 15,
            'headers'   => $headers,
            'sslverify' => $this->get_sslverify(), // 允许自签名环境
        ]);

        if (is_wp_error($response)) {
            $this->log('Umami Stats API WP Error: ' . $response->get_error_message());
            return null;
        }

        $http_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);

        $this->log('Umami Stats API Response Code: ' . $http_code);
        $this->log('Umami Stats API Response Body: ' . $body);

        if ($http_code !== 200) {
            $this->log("Umami Stats API HTTP Error {$http_code}: {$body}");
            return null;
        }

        $data = json_decode($body, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->log('Umami Stats API JSON Error: ' . json_last_error_msg());
            return null;
        }

        // 处理官方 API 返回的数据结构
        // 官方 /api/websites/{id}/stats 返回格式：
        // {"pageviews": {"value": 3018, "prev": 3508}, "visitors": {"value": 847, "prev": 910}}
        $formatted_data = [];

        if (is_array($data)) {
            // 标准格式：每个指标有 value 和 prev 字段
            if (isset($data['pageviews']['value'])) {
                $formatted_data['pageviews'] = (int) $data['pageviews']['value'];
            } elseif (isset($data['pageviews']) && is_numeric($data['pageviews'])) {
                $formatted_data['pageviews'] = (int) $data['pageviews'];
            }

            if (isset($data['visitors']['value'])) {
                $formatted_data['visitors'] = (int) $data['visitors']['value'];
            } elseif (isset($data['visitors']) && is_numeric($data['visitors'])) {
                $formatted_data['visitors'] = (int) $data['visitors'];
            }

            if (isset($data['visits']['value'])) {
                $formatted_data['sessions'] = (int) $data['visits']['value'];
            } elseif (isset($data['visits']) && is_numeric($data['visits'])) {
                $formatted_data['sessions'] = (int) $data['visits'];
            }

            // 记录成功获取的数据
            if (!empty($formatted_data)) {
                $this->log('Umami Stats API - Successfully parsed: ' . json_encode($formatted_data));
            } else {
                $this->log('Umami Stats API - Unknown data format: ' . json_encode($data));
                return $data; // 返回原始数据供调试
            }
        }

        return $formatted_data;
    }

    /**
     * 获取累计国家数量（唯一国家数）
     * 使用 Umami metrics 接口，维度为 country
     */
    private function fetch_countries_total_internal($start_at_ms, $end_at_ms)
    {
        $token = $this->get_auth_token();
        if (!$token) return null;

        $website_id = $this->site_id;
        $params = [
            'type'   => 'country',
            'startAt' => (int)$start_at_ms,
            'endAt'  => (int)$end_at_ms,
            'limit'  => 5000, // 足够大，避免只取 Top 10
        ];
        $url = $this->host_url . '/api/websites/' . $website_id . '/metrics?' . http_build_query($params);

        $response = wp_remote_get($url, [
            'timeout' => 15,
            'headers' => [
                'Accept'        => 'application/json',
                'Authorization' => 'Bearer ' . $token,
                'User-Agent'    => 'Westlife-Theme-Umami/1.0',
            ],
            'sslverify' => $this->get_sslverify(),
        ]);

        if (is_wp_error($response)) return null;
        $code = wp_remote_retrieve_response_code($response);
        if ($code !== 200) return null;
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        if (!is_array($data)) return null;

        // 数据格式：[{ x: "CN", y: 123 }, ...]
        $codes = [];
        foreach ($data as $row) {
            $code = isset($row['x']) ? strtoupper(trim((string)$row['x'])) : '';
            if ($code === '' || $code === 'ZZ' || $code === 'XX' || $code === 'UNKNOWN') continue; // 过滤未知
            $codes[$code] = true;
        }
        return count($codes);
    }

    /**
     * 对外方法：获取累计国家数量（带缓存）
     * $since_date: 起始日期（Y-m-d），默认使用 site_established 配置或 2020-01-01
     */
    public function get_countries_total($since_date = null)
    {
        if (!$this->is_configured()) return 0;

        if (!$since_date) {
            $since_date = get_option('site_established', '2020-01-01');
        }
        $start_ts = strtotime($since_date . ' 00:00:00');
        if (!$start_ts) $start_ts = strtotime('2020-01-01 00:00:00');
        $end_ts = time();

        $cache_key = $this->build_cache_key('westlife_umami_countries_total', $this->site_id . $this->host_url . '|' . $since_date);
        $cached = get_transient($cache_key);
        if ($cached !== false) return (int)$cached;

        $total = $this->fetch_countries_total_internal($start_ts * 1000, $end_ts * 1000);
        if (!is_int($total)) $total = (int)$total;
        if ($total < 0) $total = 0;

        // 缓存 12 小时
        set_transient($cache_key, $total, 12 * HOUR_IN_SECONDS);
        return $total;
    }

    /**
     * 备用方法：使用 pageviews 端点获取数据
     * 当 stats 端点不可用时使用
     */
    private function fetch_pageviews_data($website_id, $token, $start_at, $end_at)
    {
        $pageviews_url = rtrim($this->host_url, '/') . '/api/websites/' . $website_id . '/pageviews';

        $params = [
            'startAt' => $start_at,
            'endAt' => $end_at,
            'unit' => 'day',
            'timezone' => 'Asia/Shanghai' // 根据官方文档，pageviews 端点需要 timezone 参数
        ];

        $url = $pageviews_url . '?' . http_build_query($params);

        $this->log("Umami Pageviews API Request: " . $url);

        $response = wp_remote_get($url, [
            'timeout' => 15,
            'headers' => [
                'Accept' => 'application/json',
                'Authorization' => 'Bearer ' . $token,
                'User-Agent' => 'Westlife-Theme-Umami/1.0'
            ],
        ]);

        if (is_wp_error($response)) {
            $this->log('Umami Pageviews API WP Error: ' . $response->get_error_message());
            return null;
        }

        $http_code = wp_remote_retrieve_response_code($response);
        $body = wp_remote_retrieve_body($response);

        $this->log("Umami Pageviews API Response Code: " . $http_code);
        $this->log("Umami Pageviews API Response Body: " . $body);

        if ($http_code !== 200) {
            $this->log("Umami Pageviews API HTTP Error {$http_code}: {$body}");
            return null;
        }

        $data = json_decode($body, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            $this->log('Umami Pageviews API JSON Error: ' . json_last_error_msg());
            return null;
        }

        // 转换 pageviews API 返回格式
        // 官方 pageviews API 返回：{"pageviews": [{"x": "2020-04-20 01:00:00", "y": 3}], "sessions": [{"x": "2020-04-20 01:00:00", "y": 2}]}
        $formatted_data = [];

        // 汇总 pageviews 数据
        if (isset($data['pageviews']) && is_array($data['pageviews'])) {
            $total_pageviews = array_sum(array_column($data['pageviews'], 'y'));
            $formatted_data['pageviews'] = $total_pageviews;
        }

        // 汇总 sessions 数据
        if (isset($data['sessions']) && is_array($data['sessions'])) {
            $total_sessions = array_sum(array_column($data['sessions'], 'y'));
            $formatted_data['visitors'] = $total_sessions; // 将 sessions 作为 visitors 使用
            $formatted_data['sessions'] = $total_sessions;
        }

        return $formatted_data ?: $data;
    }

    /**
     * 计算时间范围（返回毫秒）
     */
    private function compute_range_ms($range)
    {
        $now = time();
        $endAt = $now * 1000;
        switch ($range) {
            case '7d':
                $start = strtotime('-7 days 00:00:00');
                break;
            case '30d':
                $start = strtotime('-30 days 00:00:00');
                break;
            case '90d':
                $start = strtotime('-90 days 00:00:00');
                break;
            case 'year':
                $start = strtotime(date('Y-01-01 00:00:00'));
                break;
            case 'all':
                $since = get_option('site_established', '2020-01-01');
                $start = strtotime($since . ' 00:00:00');
                break;
            default:
                $start = strtotime('-30 days 00:00:00');
        }
        if ($start === false) $start = strtotime('-30 days 00:00:00');
        return [$start * 1000, $endAt];
    }

    /**
     * 获取 Umami metrics TopN
     */
    private function fetch_metrics_topn($type, $startAtMs, $endAtMs, $limit = 10)
    {
        $token = $this->get_auth_token();
        if (!$token) return ['items' => [], 'total' => 0];

        // 支持的类型：country / browser / os / url / referrer
        $allowed = ['country', 'browser', 'os', 'url', 'referrer'];
        $type = in_array($type, $allowed, true) ? $type : 'country';
        $website_id = $this->site_id;
        $params = [
            'type'   => $type,
            'startAt' => (int)$startAtMs,
            'endAt'  => (int)$endAtMs,
            'limit'  => max(1, min(100, (int)$limit)),
        ];
        $url = $this->host_url . '/api/websites/' . $website_id . '/metrics?' . http_build_query($params);

        $response = wp_remote_get($url, [
            'timeout' => 15,
            'headers' => [
                'Accept'        => 'application/json',
                'Authorization' => 'Bearer ' . $token,
                'User-Agent'    => 'Westlife-Theme-Umami/1.0',
            ],
            'sslverify' => $this->get_sslverify(),
        ]);

        if (is_wp_error($response)) return ['items' => [], 'total' => 0];
        $code = wp_remote_retrieve_response_code($response);
        if ($code !== 200) return ['items' => [], 'total' => 0];
        $body = wp_remote_retrieve_body($response);
        $data = json_decode($body, true);
        if (!is_array($data)) return ['items' => [], 'total' => 0];

        $items = [];
        $total = 0;
        foreach ($data as $row) {
            $label = isset($row['x']) ? trim((string)$row['x']) : '';
            $value = (int)($row['y'] ?? 0);
            if ($type === 'country') {
                $code = strtoupper($label);
                if ($code === '' || $code === 'ZZ' || $code === 'XX' || $code === 'UNKNOWN') continue;
                $label = $code;
            }
            // 允许 label 为空但保留（如 direct/none），前端可处理为“(direct/none)”
            $items[] = ['label' => $label, 'value' => $value];
            $total += $value;
        }

        // 附加比例（用于前端显示百分比）
        if ($total > 0) {
            foreach ($items as &$it) {
                $it['percent'] = round(($it['value'] / $total) * 100, 2);
            }
            unset($it);
        }

        return ['items' => $items, 'total' => $total];
    }

    /**
     * AJAX: 获取 TopN 列表
     */
    public function ajax_get_topn()
    {
        if (!wp_verify_nonce($_REQUEST['nonce'] ?? '', 'westlife_umami_nonce')) {
            wp_die('Security check failed', 'Forbidden', ['response' => 403]);
        }

        if (!$this->is_configured()) {
            wp_send_json_error(['message' => 'Umami 未配置']);
        }

        $type = isset($_REQUEST['type']) ? sanitize_text_field($_REQUEST['type']) : 'country';
        $range = isset($_REQUEST['range']) ? sanitize_text_field($_REQUEST['range']) : '30d';
        $limit = isset($_REQUEST['limit']) ? intval($_REQUEST['limit']) : 10;
        $limit = max(1, min(20, $limit));

        list($startAt, $endAt) = $this->compute_range_ms($range);
        $result = $this->fetch_metrics_topn($type, $startAt, $endAt, $limit);

        wp_send_json_success([
            'type' => $type,
            'range' => $range,
            'total' => $result['total'],
            'items' => $result['items'],
        ]);
    }
    /**
     * AJAX 处理器 - 获取统计数据
     */
    public function ajax_get_stats()
    {
        // 验证 nonce
        if (!wp_verify_nonce($_REQUEST['nonce'] ?? '', 'westlife_umami_nonce')) {
            wp_die('Security check failed', 'Forbidden', ['response' => 403]);
        }

        $stats = $this->get_stats();

        wp_send_json_success($stats);
    }

    /**
     * 清除缓存
     */
    public function clear_cache()
    {
        $this->bump_cache_version();
    }

    /**
     * 获取配置信息（用于调试）
     */
    public function get_config()
    {
        return [
            'site_id' => $this->site_id,
            'host_url' => $this->host_url,
            'is_configured' => $this->is_configured(),
            'cache_duration' => $this->cache_duration
        ];
    }

    /**
     * 单例模式
     */
    private static $instance = null;

    public static function getInstance()
    {
        if (self::$instance === null) {
            self::$instance = new self();
        }
        return self::$instance;
    }
}

// 初始化 Umami 模块
function westlife_umami()
{
    return WestlifeUmami::getInstance();
}

// 启动模块
westlife_umami();

/* ==========================================================================
   前端统计脚本注入
   ========================================================================== */

// 全站前台页脚注入 Umami 统计脚本和配置
add_action('wp_footer', function () {
    if (is_admin()) return;

    $umami_site_id = trim((string) get_option('westlife_umami_site_id', ''));
    $umami_host_url = trim((string) get_option('westlife_umami_host_url', ''));

    if ($umami_site_id === '' || $umami_host_url === '') return;

    // 确保 URL 末尾没有斜杠（与你的示例保持一致）
    $umami_host_url = rtrim($umami_host_url, '/');

    // 1. 注入全局配置变量（供数据获取脚本使用）
    $config = [
        'umamiSiteId' => $umami_site_id,
        'umamiHostUrl' => $umami_host_url
    ];

    $script = sprintf(
        'window.westlifeAbout=Object.assign({},window.westlifeAbout,%s);',
        wp_json_encode($config)
    );
    echo "\n<!-- Westlife: Umami 配置 -->\n<script>{$script}</script>\n";

    // 2. 加载 Umami 统计脚本（使用defer属性）
    $script_url = $umami_host_url . '/script.js';
    echo "\n<!-- Umami 统计脚本 -->\n";
    printf(
        '<script defer src="%s" data-website-id="%s"></script>',
        esc_url($script_url),
        esc_attr($umami_site_id)
    );
    echo "\n";

    // 3. 添加配置验证和事件追踪功能
?>
    <script>
        // Umami 配置和事件追踪（无任何调试输出）
        (function() {
            // 等待 Umami 脚本加载完成
            var checkUmami = function() {
                if (typeof window.umami !== 'undefined') {
                    // 设置自定义追踪函数
                    window.trackUmamiEvent = function(eventName, eventData) {
                        if (window.umami && typeof window.umami.track === 'function') {
                            window.umami.track(eventName, eventData);
                        }
                    };
                    // 初始化自定义事件监听
                    initUmamiEvents();
                } else {
                    // 如果 Umami 还未加载，稍后再试
                    setTimeout(checkUmami, 500);
                }
            };

            // 自定义事件监听
            var initUmamiEvents = function() {
                // 追踪外部链接点击
                document.addEventListener('click', function(e) {
                    var link = e.target.closest('a');
                    if (link && link.href && link.href.startsWith('http') && !link.href.includes(window.location.hostname)) {
                        if (window.trackUmamiEvent) {
                            window.trackUmamiEvent('external-link', {
                                url: link.href,
                                text: (link.textContent || '').trim().substring(0, 50)
                            });
                        }
                    }
                });

                // 追踪搜索
                var searchForms = document.querySelectorAll('.search-form, form[role="search"]');
                searchForms.forEach(function(form) {
                    form.addEventListener('submit', function(e) {
                        var input = form.querySelector('input[type="search"], input[type="text"]');
                        if (input && input.value && window.trackUmamiEvent) {
                            window.trackUmamiEvent('search', {
                                query: input.value
                            });
                        }
                    });
                });

                // 追踪评论提交
                var commentForm = document.getElementById('commentform');
                if (commentForm) {
                    commentForm.addEventListener('submit', function() {
                        if (window.trackUmamiEvent) {
                            window.trackUmamiEvent('comment-submit');
                        }
                    });
                }
            };

            // DOM 加载完成后开始检查
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', checkUmami);
            } else {
                checkUmami();
            }
        })();
    </script>
<?php
}, 20);

/* ==========================================================================
    测试连接功能（后台设置页按钮使用）
    ========================================================================== */

/**
 * 测试 Umami 连接
 */
function westlife_test_umami_connection()
{
    // 验证 nonce
    if (!wp_verify_nonce($_POST['nonce'] ?? '', 'westlife_ajax_nonce')) {
        wp_send_json_error(['message' => __('安全验证失败', 'westlife')]);
    }

    $host_url = sanitize_url($_POST['host_url'] ?? '');
    $site_id = sanitize_text_field($_POST['site_id'] ?? '');
    $api_token = sanitize_text_field($_POST['api_token'] ?? '');

    if (empty($host_url) || empty($site_id)) {
        wp_send_json_error(['message' => __('参数不完整', 'westlife')]);
    }

    // 格式化 URL
    $host_url = rtrim($host_url, '/');

    // 构建当前时间范围（测试获取今日数据）
    $now = time() * 1000; // 转换为毫秒
    $today = strtotime('today') * 1000;

    // 构建 API URL（Token-only，必须携带 Authorization）
    $api_url = sprintf(
        '%s/api/websites/%s/stats?startAt=%d&endAt=%d',
        $host_url,
        $site_id,
        $today,
        $now
    );

    // 记录调试信息（如果开启调试模式）
    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('Umami Test URL: ' . $api_url);
    }

    // 使用 wp_remote_get 来测试连接（关闭SSL验证）
    $args = [
        'timeout' => 15,
        'sslverify' => false, // 关闭SSL验证，允许自签名证书
        'headers' => [
            'Accept' => 'application/json',
            'User-Agent' => 'WordPress/' . get_bloginfo('version') . '; ' . get_bloginfo('url')
        ]
    ];

    if ($api_token) {
        $args['headers']['Authorization'] = 'Bearer ' . $api_token;
    }

    $response = wp_remote_get($api_url, $args);

    if (is_wp_error($response)) {
        $error_message = $response->get_error_message();
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('Umami Test Error: ' . $error_message);
        }

        // 根据错误类型提供更友好的提示
        if (strpos($error_message, 'cURL error 28') !== false || strpos($error_message, 'Operation timed out') !== false) {
            $error_message = __('连接超时，请检查主机URL是否正确', 'westlife');
        } elseif (strpos($error_message, 'cURL error 7') !== false || strpos($error_message, 'Failed to connect') !== false) {
            $error_message = __('无法连接到服务器，请检查URL是否正确', 'westlife');
        } elseif (strpos($error_message, 'cURL error 6') !== false || strpos($error_message, 'Could not resolve host') !== false) {
            $error_message = __('无法解析主机名，请检查URL格式', 'westlife');
        } elseif (strpos($error_message, 'cURL error 35') !== false || strpos($error_message, 'SSL') !== false) {
            // 即使关闭了 SSL 验证，某些环境可能仍有问题
            $error_message = __('SSL连接问题，但这通常不影响数据收集', 'westlife');
        } else {
            $error_message = sprintf(__('网络错误：%s', 'westlife'), $error_message);
        }

        wp_send_json_error(['message' => $error_message]);
    }

    $status_code = wp_remote_retrieve_response_code($response);
    $body = wp_remote_retrieve_body($response);

    if (defined('WP_DEBUG') && WP_DEBUG) {
        error_log('Umami Test Response Code: ' . $status_code);
        error_log('Umami Test Response Body: ' . substr($body, 0, 500));
    }

    if ($status_code === 404) {
        wp_send_json_error(['message' => __('站点ID不存在或API路径错误', 'westlife')]);
    } elseif ($status_code === 403 || $status_code === 401) {
        wp_send_json_error(['message' => __('权限验证失败，请检查 API Token 是否正确，或该 Token 是否有访问该网站的权限', 'westlife')]);
    } elseif ($status_code === 400) {
        // 400 错误通常是参数问题
        $error_data = json_decode($body, true);
        if (isset($error_data['message'])) {
            wp_send_json_error(['message' => sprintf(__('请求参数错误：%s', 'westlife'), $error_data['message'])]);
        } else {
            wp_send_json_error(['message' => __('请求参数错误，请检查站点ID格式', 'westlife')]);
        }
    } elseif ($status_code >= 200 && $status_code < 300) {
        // 尝试解析响应
        $data = json_decode($body, true);
        if (is_array($data)) {
            // 如果有数据，显示一些统计信息
            $message = __('连接成功', 'westlife');
            if (isset($data['pageviews'])) {
                $message .= sprintf(' - 今日浏览: %d', $data['pageviews']);
            }
            if (isset($data['visitors'])) {
                $message .= sprintf(', 访客: %d', $data['visitors']);
            }
            wp_send_json_success(['message' => $message, 'data' => $data]);
        } else {
            // 即使无法解析JSON，只要状态码正确也算成功
            wp_send_json_success(['message' => __('连接成功，Umami 服务正常', 'westlife')]);
        }
    } elseif ($status_code === 0) {
        // 状态码为0通常表示SSL证书问题
        wp_send_json_error(['message' => __('SSL证书验证失败，但这不会影响统计功能的正常使用', 'westlife')]);
    } else {
        wp_send_json_error(['message' => sprintf(__('服务器返回错误状态码：%d', 'westlife'), $status_code)]);
    }
}

// 将 AJAX action 绑定到命名处理函数（后台设置页）
add_action('wp_ajax_westlife_test_umami_connection', 'westlife_test_umami_connection');
