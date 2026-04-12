<?php

/**
 * 访客地图与访客统计模块
 * @package Westlife
 */

if (!defined('ABSPATH')) exit;

function westlife_get_visitor_data_file()
{
    if (function_exists('westlife_ensure_cache_directories')) {
        westlife_ensure_cache_directories();
    }
    $uploads = wp_upload_dir();
    return trailingslashit($uploads['basedir']) . 'westlife-cache/visitor/visitor.json';
}

function westlife_get_legacy_visitor_data_files()
{
    return [
        trailingslashit(get_stylesheet_directory()) . 'data/visitor.json',
        trailingslashit(get_template_directory()) . 'data/visitor.json',
        trailingslashit(WP_CONTENT_DIR) . 'uploads/visitor.json',
    ];
}

function westlife_maybe_migrate_visitor_data_file()
{
    $target = westlife_get_visitor_data_file();
    if (file_exists($target)) {
        return $target;
    }

    foreach (westlife_get_legacy_visitor_data_files() as $legacy_file) {
        if (!is_string($legacy_file) || $legacy_file === '' || !file_exists($legacy_file)) {
            continue;
        }

        $dir = dirname($target);
        if (!file_exists($dir)) {
            wp_mkdir_p($dir);
        }

        $raw = @file_get_contents($legacy_file);
        if ($raw === false || $raw === '') {
            continue;
        }

        @file_put_contents($target, $raw);
        return $target;
    }

    return $target;
}

function westlife_get_visitor_data()
{
    if (array_key_exists('westlife_visitor_data_cache', $GLOBALS)) {
        return $GLOBALS['westlife_visitor_data_cache'];
    }

    $file = westlife_maybe_migrate_visitor_data_file();
    if (!file_exists($file)) {
        $GLOBALS['westlife_visitor_data_cache'] = [];
        return $GLOBALS['westlife_visitor_data_cache'];
    }

    $raw = @file_get_contents($file);
    if (!$raw) {
        $GLOBALS['westlife_visitor_data_cache'] = [];
        return $GLOBALS['westlife_visitor_data_cache'];
    }

    $data = json_decode($raw, true);
    $GLOBALS['westlife_visitor_data_cache'] = is_array($data) ? $data : [];
    return $GLOBALS['westlife_visitor_data_cache'];
}

function westlife_set_visitor_data($visitors)
{
    $GLOBALS['westlife_visitor_data_cache'] = is_array($visitors) ? array_values($visitors) : [];

    $file = westlife_maybe_migrate_visitor_data_file();
    $dir = dirname($file);
    if (!file_exists($dir)) {
        wp_mkdir_p($dir);
    }

    file_put_contents($file, wp_json_encode($GLOBALS['westlife_visitor_data_cache'], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE));
}

/**
 * 基于 IP 段的去重键（IPv4 使用 /24，IPv6 近似使用前 4 段 ~ /64）
 * 返回可用于 transient 的稳定字符串
 */
function westlife_ip_segment_key($ip)
{
    $ip = trim((string)$ip);
    if ($ip === '') return '';
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        // 1.2.3.X/24
        $parts = explode('.', $ip);
        if (count($parts) >= 3) {
            return $parts[0] . '.' . $parts[1] . '.' . $parts[2] . '.0/24';
        }
        return $ip;
    }
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        // 取前 4 组作为前缀近似 /64
        $parts = explode(':', strtolower($ip));
        $prefix = array_slice($parts, 0, 4);
        return implode(':', $prefix) . '::/64';
    }
    return $ip;
}

/**
 * 判断最近 TTL 时间窗内，visitor.json 是否已有该 IP 的记录
 * 用于在 JSON 被清空或缺失该 IP 记录时，绕过节流重新补写
 */
function westlife_has_recent_ip_record($ip, $ttl)
{
    $ip = trim((string)$ip);
    if ($ip === '') return false;
    $arr = westlife_get_visitor_data();
    if (!is_array($arr) || empty($arr)) return false;
    $now = time(); // 使用UTC时间戳，与前端JavaScript Date.now()保持一致
    // 从末尾向前找最近同 IP 记录
    for ($i = count($arr) - 1; $i >= 0; $i--) {
        $it = $arr[$i];
        if (!is_array($it)) continue;
        if (($it['ip'] ?? '') !== $ip) continue;
        $ts = (int)($it['timestamp'] ?? 0);
        if ($ts > 0 && ($now - $ts) < (int)$ttl) return true;
        // 找到同 IP 但超出窗口，直接返回 false
        return false;
    }
    return false;
}

/**
 * 输出 flag-icons 国旗 HTML
 */
function westlife_country_code_to_flag($code, $label = '')
{
    $code = westlife_normalize_country_code($code);
    if ($code === '') return '';

    $class = 'fi fi-' . strtolower($code);
    $attrs = ' class="' . esc_attr($class) . '"';

    if ($label !== '') {
        $attrs .= ' aria-label="' . esc_attr($label) . '" title="' . esc_attr($label) . '"';
    } else {
        $attrs .= ' aria-hidden="true"';
    }

    return '<span' . $attrs . '></span>';
}

/**
 * 归一化国家两位码（A-Z 上档），非法返回空串
 */
function westlife_normalize_country_code($code)
{
    $code = strtoupper(trim((string)$code));
    if (strlen($code) !== 2) return '';
    if (!preg_match('/^[A-Z]{2}$/', $code)) return '';
    return $code;
}

/**
 * 常见国家中文/英文名到两位码的粗略映射（不足可按需补充）
 */
function westlife_country_name_to_code($name)
{
    $name = trim((string)$name);
    if ($name === '') return '';
    $map = [
        // 中文
        '中国' => 'CN',
        '美国' => 'US',
        '英国' => 'GB',
        '法国' => 'FR',
        '德国' => 'DE',
        '日本' => 'JP',
        '韩国' => 'KR',
        '加拿大' => 'CA',
        '澳大利亚' => 'AU',
        '俄罗斯' => 'RU',
        '巴西' => 'BR',
        '墨西哥' => 'MX',
        '西班牙' => 'ES',
        '意大利' => 'IT',
        '荷兰' => 'NL',
        '新加坡' => 'SG',
        '中国香港' => 'HK',
        '中国台湾' => 'TW',
        '中国澳门' => 'MO',
        '印度' => 'IN',
        // 英文
        'China' => 'CN',
        'United States' => 'US',
        'USA' => 'US',
        'United Kingdom' => 'GB',
        'UK' => 'GB',
        'France' => 'FR',
        'Germany' => 'DE',
        'Japan' => 'JP',
        'Korea' => 'KR',
        'South Korea' => 'KR',
        'Republic of Korea' => 'KR',
        'Canada' => 'CA',
        'Australia' => 'AU',
        'Russian Federation' => 'RU',
        'Russia' => 'RU',
        'Brazil' => 'BR',
        'Mexico' => 'MX',
        'Spain' => 'ES',
        'Italy' => 'IT',
        'Netherlands' => 'NL',
        'Singapore' => 'SG',
        'Hong Kong' => 'HK',
        'Taiwan' => 'TW',
        'Macao' => 'MO',
        'India' => 'IN'
    ];
    return $map[$name] ?? '';
}

/**
 * 从访客记录中解析出两位国家码：优先 country_code，其次用 country 名称映射
 */
function westlife_resolve_country_code_from_entry($entry)
{
    $cc = westlife_normalize_country_code($entry['country_code'] ?? '');
    if ($cc) return $cc;
    $fromName = westlife_country_name_to_code($entry['country'] ?? '');
    return westlife_normalize_country_code($fromName);
}

/**
 * 简易 UA 爬虫检测：返回 true 表示爬虫/非真实访客
 */
function westlife_is_bot_user_agent($ua)
{
    $ua = strtolower(trim((string)$ua));
    if ($ua === '') return true; // 空 UA 视为非真实访客

    // 常见搜索引擎/采集/监控/脚本/Headless 特征关键字
    $patterns = [
        // 通用关键词
        'bot',
        'crawl',
        'spider',
        'slurp',
        'crawler',
        'fetch',
        'scrape',
        // 搜索引擎
        'googlebot',
        'mediapartners-google',
        'bingbot',
        'yandex',
        'baiduspider',
        'sogou',
        '360spider',
        'bytespider',
        'duckduckbot',
        'applebot',
        'petalbot',
        'yahoo! slurp',
        'google-inspectiontool',
        // SEO/采集
        'ahrefs',
        'semrush',
        'mj12bot',
        'dotbot',
        'seoscanners',
        'seokicks',
        // 社交抓取
        'facebookexternalhit',
        'facebot',
        'twitterbot',
        'linkedinbot',
        'pinterest',
        'telegrambot',
        // 监控测速
        'uptimerobot',
        'pingdom',
        'gtmetrix',
        'pagespeed',
        'datadog',
        'newrelic',
        'statuscake',
        // 编程客户端/脚本
        'curl',
        'wget',
        'python-requests',
        'aiohttp',
        'okhttp',
        'java/',
        'go-http-client',
        'httpclient',
        'libwww-perl',
        'php',
        'node',
        // 无头浏览器/自动化
        'headlesschrome',
        'puppeteer',
        'playwright',
        'phantomjs',
        'selenium'
    ];

    foreach ($patterns as $p) {
        if (strpos($ua, $p) !== false) return true;
    }
    return false;
}

/**
 * 页面资源加载
 */
function westlife_enqueue_visitor_assets()
{
    // 修正模板路径:实际文件位于 template-pages 目录
    if (!is_page_template('template-pages/page-visitor.php')) return;

    $theme_version = wp_get_theme()->get('Version');
    $uri = get_template_directory_uri();
    $has_app_bundle = function_exists('westlife_has_app_bundle') && westlife_has_app_bundle();
    $script_handle = function_exists('westlife_get_frontend_script_handle') ? westlife_get_frontend_script_handle() : 'westlife-visitor-map';

    // 访客页面样式(与通用 page.css 解耦,统一在此页面 inc 加载)
    if (!$has_app_bundle) {
        wp_enqueue_style('westlife-page-visitor', "$uri/assets/css/pages/page-visitor.css", ['westlife-page'], $theme_version);
    }

    wp_enqueue_style('leaflet', 'https://static.bluecdn.com/npm/leaflet@1.9.4/dist/leaflet.min.css', [], '1.9.4');
    wp_enqueue_style('leaflet-fullscreen', 'https://static.bluecdn.com/npm/leaflet-fullscreen@1.0.2/dist/leaflet.fullscreen.css', ['leaflet'], '1.0.2');
    wp_enqueue_script('leaflet', 'https://static.bluecdn.com/npm/leaflet@1.9.4/dist/leaflet.min.js', ['jquery'], '1.9.4', true);
    wp_enqueue_script('leaflet-fullscreen', 'https://static.bluecdn.com/npm/leaflet-fullscreen@1.0.2/dist/Leaflet.fullscreen.min.js', ['leaflet'], '1.0.2', true);
    wp_enqueue_script('leaflet-heat', 'https://static.bluecdn.com/npm/leaflet.heat@0.2.0/dist/leaflet-heat.js', ['leaflet'], '0.2.0', true);
    if (!$has_app_bundle) {
        wp_enqueue_script('westlife-visitor-map', "{$uri}/assets/modules/visitors/visitor.js", ['jquery', 'leaflet', 'leaflet-fullscreen', 'leaflet-heat'], $theme_version, true);
    }

    wp_localize_script($script_handle, 'westlifeMapConfig', [
        'ajaxurl' => admin_url('admin-ajax.php'),
        'nonce' => wp_create_nonce('westlife_visitor_nonce'),
        'mapOptions' => [
            'center' => [35, 105],
            'zoom' => 4,
            'minZoom' => 2,
            'maxZoom' => 18,
            'tileLayer' => 'https://maps.bluecdn.com/light_all/{z}/{x}/{y}.png',
            'attribution' => '© OpenStreetMap contributors'
        ],
        'i18n' => [
            'noData' => '暂无访客数据',
            'loadError' => '加载访客数据失败',
            'fullscreen' => [
                'enter' => '全屏显示',
                'exit' => '退出全屏'
            ]
        ]
    ]);
}
add_action('wp_enqueue_scripts', 'westlife_enqueue_visitor_assets', 100);

/**
 * 访客追踪记录(非阻塞)
 */
function westlife_track_visitor()
{
    if (is_admin() || is_customize_preview()) return;
    if (defined('WP_LOCAL_DEV') && constant('WP_LOCAL_DEV')) return;

    $ip = westlife_get_client_ip();
    if (!$ip) return;

    // 跳过本地 IP 地址
    if (in_array($ip, ['127.0.0.1', '::1', 'localhost'])) return;

    // 跳过爬虫/非真实访客
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    if (westlife_is_bot_user_agent($ua)) return;

    $cache_key = 'visitor_' . $ip;
    $transient_key = 'ip_api_' . $ip; // 记录该 IP 的地理信息已获取的标记（一天）

    // 按单个 IP 节流：同一 IP 在时间窗口内只记录一次
    $ip_ttl = (int) get_option('visitor_segment_ttl', HOUR_IN_SECONDS); // 仍沿用该选项，默认 1 小时
    $ip_transient = 'visitor_ip_' . md5($ip);
    $throttled = (bool) get_transient($ip_transient);
    if ($throttled) {
        // 如果 JSON 被清空或缺失该 IP 的近期记录，则需要补写，忽略节流
        $need_refill = !westlife_has_recent_ip_record($ip, $ip_ttl);
        if (!$need_refill) return;
        // 否则让后续 should_update 走补写分支
    }

    $visitor_info = wp_cache_get($cache_key, 'visitors');
    // 触发条件：
    // 1) JSON 需要补写（即使已拉取过地理信息）
    // 2) 或“缓存没有且地理信息未拉取”（常规首次请求）
    $need_refill = isset($need_refill) ? (bool) $need_refill : !westlife_has_recent_ip_record($ip, $ip_ttl);
    $should_update = $need_refill || (false === $visitor_info && !get_transient($transient_key));

    if ($should_update) {
        $page = $_SERVER['REQUEST_URI'] ?? '';
        // 先占位设置 IP 节流，防止短时间连续请求
        set_transient($ip_transient, true, $ip_ttl);
        wp_remote_post(admin_url('admin-ajax.php?action=westlife_track_async'), [
            'timeout' => 0.01,
            'blocking' => false,
            'body' => [
                'ip' => $ip,
                'ua' => $ua,
                'page' => $page,
            ]
        ]);
    }
}
add_action('wp', 'westlife_track_visitor');

/**
 * 异步处理访客信息
 */
add_action('wp_ajax_nopriv_westlife_track_async', 'westlife_track_async');
add_action('wp_ajax_westlife_track_async', 'westlife_track_async');

function westlife_track_async()
{
    if (empty($_POST['ip'])) wp_die();
    $ip = sanitize_text_field($_POST['ip']);

    // 跳过本地 IP 地址
    if (in_array($ip, ['127.0.0.1', '::1', 'localhost'])) wp_die();

    // 来自前端的原始 UA 与页面路径（若缺失则回退）
    $ua = isset($_POST['ua']) ? sanitize_text_field($_POST['ua']) : ($_SERVER['HTTP_USER_AGENT'] ?? '');
    $page = isset($_POST['page']) ? sanitize_text_field($_POST['page']) : ($_SERVER['REQUEST_URI'] ?? '');

    // 再次过滤爬虫，确保只记录真实访客
    if (westlife_is_bot_user_agent($ua)) wp_die();

    $cache_key = 'visitor_' . $ip;
    $transient_key = 'ip_api_' . $ip;
    $ip_ttl = (int) get_option('visitor_segment_ttl', HOUR_IN_SECONDS);
    $ip_transient = 'visitor_ip_' . md5($ip);

    try {
        $data = westlife_fetch_geoip_by_ip($ip);
        if (empty($data) || !is_array($data)) {
            throw new Exception('Invalid response from GeoIP API');
        }

        $visitor_info = [
            'ip' => $ip,
            'country' => $data['country'] ?? ($data['country_name'] ?? ''),
            'country_code' => $data['country_code'] ?? ($data['countryCode'] ?? ''), // 添加国家代码
            'city' => $data['city'] ?? '',
            'lat' => isset($data['latitude']) ? floatval($data['latitude']) : (isset($data['lat']) ? floatval($data['lat']) : null),
            'lon' => isset($data['longitude']) ? floatval($data['longitude']) : (isset($data['lon']) ? floatval($data['lon']) : null),
            'timestamp' => time(), // 使用UTC时间戳
            'user_agent' => $ua,
            'page' => $page
        ];

        wp_cache_set($cache_key, $visitor_info, 'visitors', DAY_IN_SECONDS);
        set_transient($transient_key, true, DAY_IN_SECONDS);
        set_transient($ip_transient, true, $ip_ttl);
        westlife_save_visitor_data($visitor_info);
    } catch (Exception $e) {
        if (defined('WP_DEBUG') && WP_DEBUG) {
            error_log('Visitor tracking async error: ' . $e->getMessage());
        }
    }

    wp_die();
}

/**
 * 保存访客数据
 */
function westlife_save_visitor_data($visitor_info)
{
    if (empty($visitor_info)) return;

    $visitors = westlife_get_visitor_data();

    $visitor_info['lat'] = isset($visitor_info['lat']) ? floatval($visitor_info['lat']) : null;
    $visitor_info['lon'] = isset($visitor_info['lon']) ? floatval($visitor_info['lon']) : null;

    // 额外保险：若最近一条与当前同 IP 且在 TTL 窗口内，则不写入，避免刷新导致的重复
    $seg_ttl = (int) get_option('visitor_segment_ttl', HOUR_IN_SECONDS);
    $now_ts = time(); // 使用UTC时间戳
    $new_ip = (string)($visitor_info['ip'] ?? '');
    if (!empty($visitors)) {
        $last = end($visitors);
        $last_ip = (string)($last['ip'] ?? '');
        $last_ts = (int)($last['timestamp'] ?? 0);
        if ($new_ip && $last_ip && $new_ip === $last_ip && ($now_ts - $last_ts) < $seg_ttl) {
            return; // 同 IP 且在窗口内，跳过写入
        }
    }

    $visitors[] = $visitor_info;
    $visitors = array_slice($visitors, -10000);
    westlife_set_visitor_data($visitors);
}

/**
 * Ajax 获取访客地图数据
 */
function westlife_get_visitors_data_ajax()
{
    if (!check_ajax_referer('westlife_visitor_nonce', 'nonce', false)) {
        wp_send_json_error(['message' => '安全验证失败']);
    }

    $data = westlife_get_visitor_data();
    if (empty($data)) {
        wp_send_json_success(['current' => [], 'stats' => ['total' => 0, 'countries' => 0, 'total_visits' => 0]]);
    }
    if (!is_array($data)) wp_send_json_error(['message' => '数据格式错误']);

    // 根据 range 过滤：today / 7d / 30d / year（默认 year）
    $range = isset($_POST['range']) ? sanitize_text_field($_POST['range']) : 'year';
    // 使用UTC时间计算，保持与前端JavaScript一致
    switch ($range) {
        case 'today':
            // 计算UTC今日零点（注意：这里使用UTC时区，而非站点时区）
            $start_ts = strtotime('today 00:00:00 UTC');
            break;
        case '7d':
            $start_ts = strtotime('-7 days 00:00:00 UTC');
            break;
        case '30d':
            $start_ts = strtotime('-30 days 00:00:00 UTC');
            break;
        case 'year':
        default:
            $start_ts = strtotime(gmdate('Y') . '-01-01 00:00:00 UTC');
            break;
    }

    $filtered = array_filter($data, function ($v) use ($start_ts) {
        return ($v['timestamp'] ?? 0) >= $start_ts;
    });

    // 性能兜底：最多取最近 500 条
    $limited_data = array_slice(array_values($filtered), -500);

    $map_data = array_map(function ($v) {
        $cc = westlife_resolve_country_code_from_entry($v);
        $ts = intval($v['timestamp'] ?? time());
        if (function_exists('wp_date')) {
            $time_str = wp_date('Y-m-d H:i:s', $ts);
        } else {
            $time_str = date('Y-m-d H:i:s', $ts);
        }
        return [
            'lat' => isset($v['lat']) ? floatval($v['lat']) : null,
            'lon' => isset($v['lon']) ? floatval($v['lon']) : null,
            'city' => $v['city'] ?? '',
            'country' => $v['country'] ?? '',
            'cc' => $cc,
            'time' => $time_str,
            'ts' => $ts,
        ];
    }, array_filter($limited_data, fn($v) => isset($v['lat'], $v['lon']) && $v['lat'] !== null && $v['lon'] !== null));

    wp_send_json_success([
        'current' => array_values($map_data),
        // 保持原统计为全局口径（如需随 range 变化可再调整）
        'stats' => [
            'total' => count(array_unique(array_column($data, 'ip'))),
            'countries' => count(array_unique(array_filter(array_column($data, 'country')))),
            'total_visits' => count($data)
        ]
    ]);
}
add_action('wp_ajax_westlife_get_visitors_data', 'westlife_get_visitors_data_ajax');
add_action('wp_ajax_nopriv_westlife_get_visitors_data', 'westlife_get_visitors_data_ajax');

/**
 * 获取访客IP
 */
function westlife_get_client_ip()
{
    $keys = [
        'HTTP_CF_CONNECTING_IP',
        'HTTP_TRUE_CLIENT_IP',
        'HTTP_X_REAL_IP',
        'HTTP_CLIENT_IP',
        'HTTP_X_FORWARDED_FOR',
        'HTTP_X_FORWARDED',
        'HTTP_X_CLUSTER_CLIENT_IP',
        'HTTP_FORWARDED_FOR',
        'HTTP_FORWARDED',
        'REMOTE_ADDR',
    ];

    foreach ($keys as $key) {
        if (!empty($_SERVER[$key])) {
            $raw = wp_unslash((string) $_SERVER[$key]);
            $candidates = preg_split('/[\s,]+/', $raw);
            if (!is_array($candidates)) {
                $candidates = [$raw];
            }

            foreach ($candidates as $candidate) {
                $candidate = trim((string) $candidate, " \t\n\r\0\x0B\"'[]");
                if ($candidate === '') {
                    continue;
                }

                // Forwarded: for=1.2.3.4
                if (stripos($candidate, 'for=') === 0) {
                    $candidate = trim(substr($candidate, 4), " \t\n\r\0\x0B\"'[]");
                }

                if (filter_var($candidate, FILTER_VALIDATE_IP)) {
                    return $candidate;
                }
            }
        }
    }

    return westlife_get_public_ip_fallback();
}

/**
 * 回退获取公网 IP（用于反代/本地头缺失场景）
 */
function westlife_get_public_ip_fallback()
{
    $server_ip = isset($_SERVER['REMOTE_ADDR']) ? trim((string) wp_unslash($_SERVER['REMOTE_ADDR'])) : '';
    $prefer_ipv6 = (bool) filter_var($server_ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6);
    $prefer_ipv4 = (bool) filter_var($server_ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4);

    $endpoints = ['https://ip.bluecdn.com'];
    if ($prefer_ipv6) {
        $endpoints[] = 'https://ipv6.bluecdn.com';
        $endpoints[] = 'https://ipv4.bluecdn.com';
    } elseif ($prefer_ipv4) {
        $endpoints[] = 'https://ipv4.bluecdn.com';
        $endpoints[] = 'https://ipv6.bluecdn.com';
    } else {
        $endpoints[] = 'https://ipv4.bluecdn.com';
        $endpoints[] = 'https://ipv6.bluecdn.com';
    }

    foreach (array_unique($endpoints) as $endpoint) {
        $response = wp_remote_get($endpoint, [
            'timeout' => 3,
            'headers' => [
                'Accept' => 'text/plain',
            ],
        ]);

        if (is_wp_error($response)) {
            continue;
        }

        $ip = trim((string) wp_remote_retrieve_body($response));
        if (filter_var($ip, FILTER_VALIDATE_IP)) {
            return $ip;
        }
    }

    return '';
}

/**
 * 通过 BlueCDN GeoIP 接口查询 IP 地理信息
 */
function westlife_fetch_geoip_by_ip($ip)
{
    $ip = trim((string) $ip);
    if ($ip === '') {
        return null;
    }

    $endpoints = [
        'https://ip-api.bluecdn.com/geoip/' . rawurlencode($ip),
        add_query_arg([
            'ip' => $ip,
        ], 'https://ip-api.bluecdn.com/geoip'),
    ];

    foreach ($endpoints as $endpoint) {
        $response = wp_remote_get($endpoint, [
            'timeout' => 5,
            'headers' => [
                'Accept' => 'application/json',
            ],
        ]);

        if (is_wp_error($response)) {
            continue;
        }

        $data = json_decode(wp_remote_retrieve_body($response), true);
        if (is_array($data) && !empty($data)) {
            $country = (string) ($data['country'] ?? ($data['country_name'] ?? ''));
            $country_code = (string) ($data['country_code'] ?? ($data['countryCode'] ?? ''));
            $region = (string) ($data['region'] ?? ($data['regionName'] ?? ($data['province'] ?? '')));
            $city = (string) ($data['city'] ?? '');
            $latitude = isset($data['latitude']) ? floatval($data['latitude']) : (isset($data['lat']) ? floatval($data['lat']) : null);
            $longitude = isset($data['longitude']) ? floatval($data['longitude']) : (isset($data['lon']) ? floatval($data['lon']) : null);

            return [
                'country' => $country,
                'country_name' => $country,
                'country_code' => $country_code,
                'countryCode' => $country_code,
                'region' => $region,
                'regionName' => $region,
                'province' => $region,
                'city' => $city,
                'latitude' => $latitude,
                'longitude' => $longitude,
                'lat' => $latitude,
                'lon' => $longitude,
            ];
        }
    }

    throw new Exception('GeoIP lookup failed');
}

/**
 * 访客统计函数
 */
function westlife_get_today_visitors()
{
    return westlife_count_visitors_by_time(strtotime('today 00:00:00 UTC'));
}

function westlife_get_visitor_countries()
{
    return westlife_count_unique_visitor_field('country');
}

function westlife_get_today_countries()
{
    $data = westlife_get_visitor_data();
    if (!is_array($data)) return 0;

    $today_start = strtotime('today 00:00:00 UTC');
    $today_data = array_filter($data, fn($v) => ($v['timestamp'] ?? 0) >= $today_start);

    $countries = array_unique(array_column($today_data, 'country'));
    return count(array_filter($countries));
}

function westlife_get_monthly_visitors()
{
    $data = westlife_get_visitor_data();
    if (!is_array($data)) return 0;

    $month_start = strtotime(gmdate('Y-m-01') . ' 00:00:00 UTC');
    $month_data = array_filter($data, fn($v) => ($v['timestamp'] ?? 0) >= $month_start);

    $ips = array_unique(array_column($month_data, 'ip'));
    return count(array_filter($ips));
}

function westlife_get_total_visitors()
{
    return westlife_count_unique_visitor_field('ip');
}

function westlife_get_total_visits()
{
    return westlife_count_all_visitors();
}

function westlife_get_monthly_visits()
{
    return westlife_count_visitors_by_time(strtotime(gmdate('Y-m-01') . ' 00:00:00 UTC'));
}

function westlife_get_today_visits()
{
    return westlife_count_visitors_by_time(strtotime('today 00:00:00 UTC'));
}

function westlife_get_average_daily_visits()
{
    $visitors = westlife_get_visitor_data();
    if (!is_array($visitors) || empty($visitors)) return 0;

    $timestamps = array_column($visitors, 'timestamp');
    if (empty($timestamps)) return 0;

    $days = max(1, ceil((max($timestamps) - min($timestamps)) / DAY_IN_SECONDS));
    return round(count($visitors) / $days);
}

function westlife_count_visitors_by_time($start_time)
{
    $visitors = westlife_get_visitor_data();
    if (!is_array($visitors)) return 0;
    return count(array_filter($visitors, fn($v) => ($v['timestamp'] ?? 0) >= $start_time));
}

function westlife_count_unique_visitor_field($field)
{
    $visitors = westlife_get_visitor_data();
    if (!is_array($visitors)) return 0;
    $values = array_filter(array_column($visitors, $field));
    return count(array_unique($values));
}

function westlife_count_all_visitors()
{
    $visitors = westlife_get_visitor_data();
    if (!is_array($visitors)) return 0;
    return count($visitors);
}

/**
 * 获取最近访客(最近10条)
 */
function westlife_get_recent_visitors()
{
    $visitors = westlife_get_visitor_data();
    if (!is_array($visitors) || empty($visitors)) return '<p class="visitor-empty">暂无访客记录</p>';

    // 按时间戳降序排序后，取最“新”的 10 条，避免受文件写入顺序或手工编辑影响
    usort($visitors, function ($a, $b) {
        $ta = isset($a['timestamp']) ? intval($a['timestamp']) : 0;
        $tb = isset($b['timestamp']) ? intval($b['timestamp']) : 0;
        if ($ta === $tb) return 0;
        return ($tb <=> $ta); // 降序：新的在前
    });
    $visitors = array_slice($visitors, 0, 10);
    $output = '';

    // 当前访客识别：按 IP 匹配，且需在可视窗口内（默认5分钟）
    $my_ip = westlife_get_client_ip();
    $current_window = (int) get_option('visitor_current_window', 300);
    $now_site = westlife_current_timestamp();

    foreach ($visitors as $idx => $visitor) {
        $city = esc_html($visitor['city'] ?? '未知城市');
        $cc_raw = westlife_resolve_country_code_from_entry($visitor);
        $cc = esc_html($cc_raw);
        $ts_val = isset($visitor['timestamp']) ? intval($visitor['timestamp']) : 0;
        // 绝对时间（用于 title 提示），无时间则显示 -
        if ($ts_val > 0) {
            if (function_exists('wp_date')) {
                $time_abs = wp_date('Y-m-d H:i:s', $ts_val, westlife_wp_timezone());
            } else {
                $time_abs = gmdate('Y-m-d H:i:s', $ts_val);
            }
        } else {
            $time_abs = '-';
        }
        // 相对时间（中文），无时间则显示 -
        if ($ts_val > 0) {
            $diff = max(0, intval($now_site - $ts_val));
            if ($diff < 60) {
                $time_rel = ($diff <= 3 ? '刚刚' : ($diff . '秒前'));
            } elseif ($diff < 3600) {
                $time_rel = intval($diff / 60) . '分钟前';
            } elseif ($diff < 86400) {
                $time_rel = intval($diff / 3600) . '小时前';
            } elseif ($diff < 2592000) { // 30 天
                $time_rel = intval($diff / 86400) . '天前';
            } elseif ($diff < 31104000) { // 12 个月
                $time_rel = intval($diff / 2592000) . '个月前';
            } else {
                $time_rel = intval($diff / 31104000) . '年前';
            }
        } else {
            $time_rel = '-';
        }
        $lat_attr = isset($visitor['lat']) && $visitor['lat'] !== null ? esc_attr((string)$visitor['lat']) : '';
        $lon_attr = isset($visitor['lon']) && $visitor['lon'] !== null ? esc_attr((string)$visitor['lon']) : '';
        $ts_attr = $ts_val;

        // 单行展示：城市名, 空格 + 国家两位码 + 右侧绝对时间（英文格式）
        $flag_html = $cc_raw !== '' ? westlife_country_code_to_flag($cc_raw, $cc_raw) : '';
        $left = trim(sprintf('%s%s%s', $city, $flag_html !== '' ? ' ' : '', $flag_html . ($cc !== '' ? ' ' . $cc : '')));
        // 当前访客判定：仅当 IP 匹配且在 current_window 内才高亮
        $is_current = ($my_ip && isset($visitor['ip']) && $visitor['ip'] === $my_ip && $ts_val > 0 && ($now_site - $ts_val) <= $current_window);
        $classes = 'visitor-item' . ($is_current ? ' is-current' : '');
        $output .= sprintf(
            '<div class="%s" data-lat="%s" data-lon="%s" data-ts="%d"><div class="visitor-one-line"><span class="vol-loc">%s</span><span class="vol-time" title="%s">%s</span></div></div>',
            $classes,
            $lat_attr,
            $lon_attr,
            $ts_attr,
            $left,
            esc_attr($time_abs),
            esc_html($time_rel)
        );
    }

    return $output;
}

/* ============================================================
 * 访客智能识别与互动系统
 * - 评论统计 / 个性化问候 / AI 问候 / 前端配置输出
 * - 已内联：原独立文件已移除，保持单文件聚合
 * ============================================================ */
if (!function_exists('westlife_get_visitor_comment_stats')) {
    function westlife_get_visitor_comment_stats($email)
    {
        if (empty($email) || !is_email($email)) {
            return [
                'total_comments' => 0,
                'approved_comments' => 0,
                'last_comment_date' => '',
                'first_comment_date' => '',
                'commented_posts' => [],
            ];
        }
        global $wpdb;
        $total = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->comments} WHERE comment_author_email = %s AND comment_type = ''", $email));
        $approved = $wpdb->get_var($wpdb->prepare("SELECT COUNT(*) FROM {$wpdb->comments} WHERE comment_author_email = %s AND comment_approved = '1' AND comment_type = ''", $email));
        $last_comment = $wpdb->get_row($wpdb->prepare("SELECT comment_date, comment_post_ID FROM {$wpdb->comments} WHERE comment_author_email = %s AND comment_approved = '1' AND comment_type = '' ORDER BY comment_date DESC LIMIT 1", $email));
        $first_comment = $wpdb->get_row($wpdb->prepare("SELECT comment_date FROM {$wpdb->comments} WHERE comment_author_email = %s AND comment_approved = '1' AND comment_type = '' ORDER BY comment_date ASC LIMIT 1", $email));
        $commented_posts = $wpdb->get_col($wpdb->prepare("SELECT DISTINCT comment_post_ID FROM {$wpdb->comments} WHERE comment_author_email = %s AND comment_approved = '1' AND comment_type = '' ORDER BY comment_date DESC LIMIT 10", $email));
        return [
            'total_comments' => intval($total),
            'approved_comments' => intval($approved),
            'last_comment_date' => $last_comment ? $last_comment->comment_date : '',
            'last_comment_post_id' => $last_comment ? $last_comment->comment_post_ID : 0,
            'first_comment_date' => $first_comment ? $first_comment->comment_date : '',
            'commented_posts' => $commented_posts,
        ];
    }
}

if (!function_exists('westlife_normalize_visitor_email')) {
    function westlife_normalize_visitor_email($email)
    {
        $email = strtolower(trim((string) $email));
        return is_email($email) ? $email : '';
    }
}

if (!function_exists('westlife_get_visitor_profile_defaults')) {
    function westlife_get_visitor_profile_defaults($email = '')
    {
        return [
            'email' => westlife_normalize_visitor_email($email),
            'name' => '',
            'url' => '',
            'views' => 0,
            'comments' => 0,
            'likes' => 0,
            'article_reads' => 0,
            'memo_likes' => 0,
            'bird_feeds' => 0,
            'reaction_like' => 0,
            'reaction_clap' => 0,
            'reaction_party' => 0,
            'score' => 0,
            'level_slug' => 'newcomer',
            'level_label' => '见习访客',
            'last_seen' => '',
            'created_at' => '',
        ];
    }
}

if (!function_exists('westlife_get_visitor_profile_option_key')) {
    function westlife_get_visitor_profile_option_key($email)
    {
        $email = westlife_normalize_visitor_email($email);
        if ($email === '') {
            return '';
        }
        return 'westlife_visitor_profile_' . md5($email);
    }
}

if (!function_exists('westlife_get_visitor_profile_record')) {
    function westlife_get_visitor_profile_record($email)
    {
        $email = westlife_normalize_visitor_email($email);
        if ($email === '') {
            return westlife_get_visitor_profile_defaults('');
        }

        $key = westlife_get_visitor_profile_option_key($email);
        $stored = $key !== '' ? get_option($key, []) : [];
        if (!is_array($stored)) {
            $stored = [];
        }

        return array_merge(westlife_get_visitor_profile_defaults($email), $stored);
    }
}

if (!function_exists('westlife_save_visitor_profile_record')) {
    function westlife_save_visitor_profile_record($email, $record)
    {
        $email = westlife_normalize_visitor_email($email);
        if ($email === '' || !is_array($record)) {
            return false;
        }

        $key = westlife_get_visitor_profile_option_key($email);
        if ($key === '') {
            return false;
        }

        $payload = array_merge(
            westlife_get_visitor_profile_record($email),
            $record,
            ['email' => $email]
        );

        if ($payload['created_at'] === '') {
            $payload['created_at'] = wp_date('Y-m-d H:i:s', westlife_current_timestamp(), westlife_wp_timezone());
        }
        $payload['last_seen'] = wp_date('Y-m-d H:i:s', westlife_current_timestamp(), westlife_wp_timezone());
        $payload['views'] = max(0, (int) ($payload['views'] ?? 0));
        $payload['comments'] = max(0, (int) ($payload['comments'] ?? 0));
        $payload['likes'] = max(0, (int) ($payload['likes'] ?? 0));
        $payload['article_reads'] = max(0, (int) ($payload['article_reads'] ?? 0));
        $payload['memo_likes'] = max(0, (int) ($payload['memo_likes'] ?? 0));
        $payload['bird_feeds'] = max(0, (int) ($payload['bird_feeds'] ?? 0));
        $payload['reaction_like'] = max(0, (int) ($payload['reaction_like'] ?? 0));
        $payload['reaction_clap'] = max(0, (int) ($payload['reaction_clap'] ?? 0));
        $payload['reaction_party'] = max(0, (int) ($payload['reaction_party'] ?? 0));
        $payload['score'] = max(0, (int) ($payload['score'] ?? 0));
        $payload['level_slug'] = sanitize_key($payload['level_slug'] ?? 'newcomer');
        $payload['level_label'] = sanitize_text_field($payload['level_label'] ?? '见习访客');

        if (get_option($key, null) === null) {
            return add_option($key, $payload, '', 'no');
        }

        return update_option($key, $payload, false);
    }
}

if (!function_exists('westlife_get_visitor_profile_daily_caps')) {
    function westlife_get_default_visitor_profile_daily_caps()
    {
        return [
            'home_view' => 1,
            'article_read' => 30,
            'comment' => 10,
            'memo_like' => 10,
            'bird_feed' => 10,
            'reaction_like' => 20,
            'reaction_clap' => 20,
            'reaction_party' => 20,
        ];
    }
}

if (!function_exists('westlife_get_default_visitor_score_rules')) {
    function westlife_get_default_visitor_score_rules()
    {
        return [
            'home_view' => 1,
            'article_read' => 1,
            'comment' => 3,
            'memo_like' => 1,
            'bird_feed' => 1,
            'reaction_like' => 2,
            'reaction_clap' => 2,
            'reaction_party' => 2,
        ];
    }
}

if (!function_exists('westlife_get_default_visitor_level_rules')) {
    function westlife_get_default_visitor_level_rules()
    {
        return [
            ['max' => 19, 'slug' => 'star-1', 'label' => '见习访客'],
            ['max' => 49, 'slug' => 'star-2', 'label' => '常驻来客'],
            ['max' => 89, 'slug' => 'star-3', 'label' => '留言旅人'],
            ['max' => 149, 'slug' => 'moon-1', 'label' => '互动达人'],
            ['max' => 229, 'slug' => 'moon-2', 'label' => '核心同路'],
            ['max' => 329, 'slug' => 'moon-3', 'label' => '荣誉来宾'],
            ['max' => 469, 'slug' => 'sun-1', 'label' => '星光来客'],
            ['max' => 639, 'slug' => 'sun-2', 'label' => '曜光同行'],
            ['max' => 859, 'slug' => 'sun-3', 'label' => '烈阳贵客'],
            ['max' => PHP_INT_MAX, 'slug' => 'crown', 'label' => '王冠站友'],
        ];
    }
}

if (!function_exists('westlife_get_visitor_score_rules')) {
    function westlife_get_visitor_score_rules()
    {
        $defaults = westlife_get_default_visitor_score_rules();
        $saved = get_option('westlife_visitor_score_rules', []);
        if (!is_array($saved)) {
            $saved = [];
        }

        $rules = [];
        foreach ($defaults as $key => $value) {
            $rules[$key] = isset($saved[$key]) ? max(0, (int) $saved[$key]) : (int) $value;
        }

        return apply_filters('westlife_visitor_score_rules', $rules);
    }
}

if (!function_exists('westlife_get_visitor_level_rules')) {
    function westlife_get_visitor_level_rules()
    {
        $defaults = westlife_get_default_visitor_level_rules();
        $saved = get_option('westlife_visitor_level_rules', []);
        if (!is_array($saved)) {
            $saved = [];
        }

        $rules = [];
        $previous_max = -1;

        foreach ($defaults as $index => $default) {
            $saved_item = isset($saved[$index]) && is_array($saved[$index]) ? $saved[$index] : [];
            $label = sanitize_text_field($saved_item['label'] ?? $default['label']);
            if ($label === '') {
                $label = $default['label'];
            }

            $max = $default['max'];
            if ($index < count($defaults) - 1) {
                $submitted_max = isset($saved_item['max']) ? (int) $saved_item['max'] : (int) $default['max'];
                $max = max($previous_max + 1, $submitted_max);
            }

            $rules[] = [
                'max' => $max,
                'slug' => $default['slug'],
                'label' => $label,
            ];

            $previous_max = $max;
        }

        return apply_filters('westlife_visitor_level_rules', $rules);
    }
}

if (!function_exists('westlife_get_visitor_profile_daily_caps')) {
    function westlife_get_visitor_profile_daily_caps()
    {
        $defaults = westlife_get_default_visitor_profile_daily_caps();
        $saved = get_option('westlife_visitor_daily_caps', []);
        if (!is_array($saved)) {
            $saved = [];
        }

        $caps = [];
        foreach ($defaults as $key => $value) {
            $caps[$key] = isset($saved[$key]) ? max(0, (int) $saved[$key]) : (int) $value;
        }

        return apply_filters('westlife_visitor_profile_daily_caps', $caps);
    }
}

if (!function_exists('westlife_apply_profile_event_daily_cap')) {
    function westlife_apply_profile_event_daily_cap($email, $event, $delta)
    {
        $delta = (int) $delta;
        if ($delta === 0) {
            return 0;
        }
        if ($delta < 0) {
            return $delta;
        }

        $caps = westlife_get_visitor_profile_daily_caps();
        $cap = isset($caps[$event]) ? max(0, (int) $caps[$event]) : 0;
        if ($cap === 0) {
            return $delta;
        }

        $email = westlife_normalize_visitor_email($email);
        if ($email === '') {
            return 0;
        }

        $key = 'wl_profile_cap_' . md5($email . '|' . $event . '|' . gmdate('Ymd'));
        $current = (int) get_transient($key);
        if ($current >= $cap) {
            return 0;
        }

        $allowed = min($delta, $cap - $current);
        set_transient($key, $current + $allowed, DAY_IN_SECONDS);
        return $allowed;
    }
}

if (!function_exists('westlife_refresh_visitor_profile_snapshot')) {
    function westlife_refresh_visitor_profile_snapshot($email, $identity = null)
    {
        $email = westlife_normalize_visitor_email($email);
        if ($email === '') {
            return westlife_get_default_home_profile();
        }

        $record = westlife_get_visitor_profile_record($email);
        $stats = westlife_get_visitor_comment_stats($email);
        $score = westlife_calculate_visitor_score($record, $stats);
        $level = westlife_get_visitor_level($score);

        westlife_save_visitor_profile_record($email, [
            'score' => $score,
            'level_slug' => $level['slug'],
            'level_label' => $level['label'],
        ]);

        if (!is_array($identity)) {
            $identity = [
                'email' => $email,
                'name' => $record['name'] ?? '',
                'url' => $record['url'] ?? '',
                'avatar_url' => '',
                'is_admin' => false,
            ];
        }

        return westlife_build_home_profile($identity);
    }
}

if (!function_exists('westlife_get_request_profile_identity')) {
    function westlife_get_request_profile_identity($fallback = [])
    {
        $identity = westlife_get_home_profile_identity();
        if (is_array($identity) && !empty($identity['email'])) {
            return $identity;
        }

        $email = westlife_normalize_visitor_email($fallback['email'] ?? '');
        if ($email !== '') {
            return [
                'email' => $email,
                'name' => sanitize_text_field($fallback['name'] ?? ''),
                'url' => esc_url_raw($fallback['url'] ?? ''),
                'avatar_url' => '',
                'is_admin' => false,
            ];
        }

        return null;
    }
}

if (!function_exists('westlife_track_visitor_profile_event')) {
    function westlife_track_visitor_profile_event($event, $args = [])
    {
        $identity = westlife_get_request_profile_identity($args);
        if (!is_array($identity) || empty($identity['email'])) {
            return westlife_get_default_home_profile();
        }

        $email = westlife_normalize_visitor_email($identity['email']);
        $record = westlife_get_visitor_profile_record($email);
        $delta = isset($args['delta']) ? (int) $args['delta'] : 1;

        if (!empty($identity['name'])) {
            $record['name'] = sanitize_text_field($identity['name']);
        }
        if (!empty($identity['url'])) {
            $record['url'] = esc_url_raw($identity['url']);
        }

        $delta = westlife_apply_profile_event_daily_cap($email, (string) $event, $delta);
        if ($delta === 0) {
            return westlife_refresh_visitor_profile_snapshot($email, $identity);
        }

        westlife_increment_daily_engagement_metric((string) $event, $delta);

        switch ((string) $event) {
            case 'home_view':
                $record['views'] = max(0, (int) ($record['views'] ?? 0) + max(0, $delta));
                break;
            case 'article_read':
                $record['article_reads'] = max(0, (int) ($record['article_reads'] ?? 0) + max(0, $delta));
                break;
            case 'comment':
                $record['comments'] = max(0, (int) ($record['comments'] ?? 0) + max(0, $delta));
                break;
            case 'memo_like':
                $record['memo_likes'] = max(0, (int) ($record['memo_likes'] ?? 0) + max(0, $delta));
                $record['likes'] = max(0, (int) ($record['likes'] ?? 0) + max(0, $delta));
                break;
            case 'bird_feed':
                $record['bird_feeds'] = max(0, (int) ($record['bird_feeds'] ?? 0) + max(0, $delta));
                break;
            case 'reaction_like':
            case 'reaction_clap':
            case 'reaction_party':
                $field = $event;
                $record[$field] = max(0, (int) ($record[$field] ?? 0) + $delta);
                $record['likes'] = max(0, (int) ($record['likes'] ?? 0) + $delta);
                break;
        }

        westlife_save_visitor_profile_record($email, $record);
        return westlife_refresh_visitor_profile_snapshot($email, $identity);
    }
}

if (!function_exists('westlife_increment_daily_engagement_metric')) {
    function westlife_increment_daily_engagement_metric($event, $delta = 1)
    {
        $event = sanitize_key((string) $event);
        $delta = max(0, (int) $delta);
        if ($event === '' || $delta < 1) {
            return;
        }

        $date_key = wp_date('Ymd', westlife_current_timestamp(), westlife_wp_timezone());
        $option_key = 'westlife_daily_engagement_metrics_' . $date_key;
        $metrics = get_option($option_key, []);
        if (!is_array($metrics)) {
            $metrics = [];
        }

        $metrics[$event] = max(0, (int) ($metrics[$event] ?? 0) + $delta);
        update_option($option_key, $metrics, false);
    }
}

if (!function_exists('westlife_get_today_engagement_metrics')) {
    function westlife_get_today_engagement_metrics()
    {
        $date_key = wp_date('Ymd', westlife_current_timestamp(), westlife_wp_timezone());
        $metrics = get_option('westlife_daily_engagement_metrics_' . $date_key, []);
        return is_array($metrics) ? $metrics : [];
    }
}

if (!function_exists('westlife_get_today_comment_count')) {
    function westlife_get_today_comment_count()
    {
        global $wpdb;

        $start_local = new DateTimeImmutable('today', westlife_wp_timezone());
        $start_utc = $start_local->setTimezone(new DateTimeZone('UTC'));

        return (int) $wpdb->get_var(
            $wpdb->prepare(
                "SELECT COUNT(*) FROM {$wpdb->comments} WHERE comment_type = '' AND comment_approved = '1' AND comment_date_gmt >= %s",
                $start_utc->format('Y-m-d H:i:s')
            )
        );
    }
}

if (!function_exists('westlife_get_admin_home_metrics')) {
    function westlife_get_admin_home_metrics()
    {
        $daily = westlife_get_today_engagement_metrics();
        $article_reactions = (int) ($daily['reaction_like'] ?? 0)
            + (int) ($daily['reaction_clap'] ?? 0)
            + (int) ($daily['reaction_party'] ?? 0);

        return [
            'today_views' => function_exists('westlife_get_today_visits') ? (int) westlife_get_today_visits() : 0,
            'today_comments' => westlife_get_today_comment_count(),
            'article_reactions' => $article_reactions,
            'memo_likes' => (int) ($daily['memo_like'] ?? 0),
            'bird_feeds' => (int) ($daily['bird_feed'] ?? 0),
        ];
    }
}

if (!function_exists('westlife_get_time_period_greeting')) {
    function westlife_get_time_period_greeting()
    {
        $hour = (int) wp_date('G', westlife_current_timestamp(), westlife_wp_timezone());

        if ($hour < 6) {
            return '夜深了';
        }
        if ($hour < 9) {
            return '早上好';
        }
        if ($hour < 12) {
            return '上午好';
        }
        if ($hour < 14) {
            return '中午好';
        }
        if ($hour < 18) {
            return '下午好';
        }
        if ($hour < 22) {
            return '晚上好';
        }

        return '夜深了';
    }
}

if (!function_exists('westlife_build_admin_home_greeting')) {
    function westlife_build_admin_home_greeting($name = '')
    {
        $time_greeting = westlife_get_time_period_greeting();
        $name = trim((string) $name);

        if ($name === '') {
            return $time_greeting . '，回来看看今天的数据。';
        }

        return $time_greeting . '，' . $name . '。';
    }
}

if (!function_exists('westlife_build_known_visitor_home_greeting')) {
    function westlife_build_known_visitor_home_greeting($name, $stats = [])
    {
        $time_greeting = westlife_get_time_period_greeting();
        $name = trim((string) $name);
        if ($name === '' || is_email($name)) {
            $name = '朋友';
        }

        $approved_comments = (int) ($stats['approved_comments'] ?? 0);
        if ($approved_comments > 0) {
            return $time_greeting . '，' . $name . '，又见面了。';
        }

        return $time_greeting . '，' . $name . '，欢迎回来。';
    }
}

if (!function_exists('westlife_build_new_visitor_home_greeting')) {
    function westlife_build_new_visitor_home_greeting($name = '')
    {
        $time_greeting = westlife_get_time_period_greeting();
        $name = trim((string) $name);
        if ($name === '' || is_email($name)) {
            $name = '朋友';
        }

        return $time_greeting . '，' . $name . '，欢迎来到本站。';
    }
}

if (!function_exists('westlife_track_visitor_profile_view')) {
    function westlife_track_visitor_profile_view($email, $args = [])
    {
        $email = westlife_normalize_visitor_email($email);
        if ($email === '') {
            return westlife_get_visitor_profile_record('');
        }

        $record = westlife_get_visitor_profile_record($email);

        if (!empty($args['name'])) {
            $record['name'] = sanitize_text_field($args['name']);
        }
        if (!empty($args['url'])) {
            $record['url'] = esc_url_raw($args['url']);
        }
        if (!empty($args['increment_view'])) {
            $record['views'] = (int) ($record['views'] ?? 0) + 1;
        }
        if (!empty($args['likes_delta'])) {
            $record['likes'] = max(0, (int) ($record['likes'] ?? 0) + (int) $args['likes_delta']);
        }

        westlife_save_visitor_profile_record($email, $record);
        return westlife_get_visitor_profile_record($email);
    }
}

if (!function_exists('westlife_get_visitor_level')) {
    function westlife_get_visitor_level($score)
    {
        $score = max(0, (int) $score);
        $levels = westlife_get_visitor_level_rules();

        foreach ($levels as $index => $level) {
            if ($score <= $level['max']) {
                $level['index'] = $index + 1;
                return $level;
            }
        }

        $last = end($levels);
        $last['index'] = count($levels);
        return $last;
    }
}

if (!function_exists('westlife_get_visitor_level_thresholds')) {
    function westlife_get_visitor_level_thresholds()
    {
        $levels = westlife_get_visitor_level_rules();
        return array_map(static function ($level) {
            return ['max' => (int) ($level['max'] ?? PHP_INT_MAX)];
        }, $levels);
    }
}

if (!function_exists('westlife_build_level_hint')) {
    function westlife_build_level_hint($level, $score, $next_threshold = null)
    {
        $label = sanitize_text_field($level['label'] ?? '见习访客');
        $score = max(0, (int) $score);
        $index = max(1, (int) ($level['index'] ?? 1));

        if ($next_threshold === null || $next_threshold === PHP_INT_MAX) {
            return sprintf('当前等级：%s · 当前积分 %d · 已达到最高等级', $label, $score);
        }

        $remain = max(0, ((int) $next_threshold) - $score);
        return sprintf('当前等级：%s · 当前积分 %d · 还差 %d 分升级到下一级', $label, $score, $remain);
    }
}

if (!function_exists('westlife_get_level_badge_data')) {
    function westlife_get_level_badge_data($level)
    {
        $index = max(1, (int) ($level['index'] ?? 1));
        $label = sanitize_text_field($level['label'] ?? '见习访客');
        $slug = sanitize_key($level['slug'] ?? 'star-1');

        if ($index <= 3) {
            $type = 'star';
            $count = $index;
            $icon = 'fa-sharp fa-solid fa-star';
        } elseif ($index <= 6) {
            $type = 'moon';
            $count = $index - 3;
            $icon = 'fa-sharp fa-solid fa-moon';
        } elseif ($index <= 9) {
            $type = 'sun';
            $count = $index - 6;
            $icon = 'fa-sharp fa-solid fa-sun';
        } else {
            $type = 'crown';
            $count = 1;
            $icon = 'fa-sharp fa-solid fa-crown';
        }

        $html = '';
        for ($i = 0; $i < $count; $i++) {
            $html .= '<i class="' . esc_attr($icon) . '" aria-hidden="true"></i>';
        }

        return [
            'type' => $type,
            'count' => $count,
            'html' => $html,
            'label' => $label,
            'slug' => $slug,
        ];
    }
}

if (!function_exists('westlife_calculate_visitor_score')) {
    function westlife_calculate_visitor_score($record, $stats)
    {
        $rules = westlife_get_visitor_score_rules();
        $views = (int) ($record['views'] ?? 0);
        $comments = (int) ($record['comments'] ?? 0);
        $article_reads = (int) ($record['article_reads'] ?? 0);
        $memo_likes = (int) ($record['memo_likes'] ?? 0);
        $bird_feeds = (int) ($record['bird_feeds'] ?? 0);
        $reaction_like = (int) ($record['reaction_like'] ?? 0);
        $reaction_clap = (int) ($record['reaction_clap'] ?? 0);
        $reaction_party = (int) ($record['reaction_party'] ?? 0);

        return ($views * (int) ($rules['home_view'] ?? 0))
            + ($article_reads * (int) ($rules['article_read'] ?? 0))
            + ($comments * (int) ($rules['comment'] ?? 0))
            + ($memo_likes * (int) ($rules['memo_like'] ?? 0))
            + ($bird_feeds * (int) ($rules['bird_feed'] ?? 0))
            + ($reaction_like * (int) ($rules['reaction_like'] ?? 0))
            + ($reaction_clap * (int) ($rules['reaction_clap'] ?? 0))
            + ($reaction_party * (int) ($rules['reaction_party'] ?? 0));
    }
}

if (!function_exists('westlife_resolve_display_name_by_email')) {
    function westlife_resolve_display_name_by_email($email, $fallback = '朋友')
    {
        $email = westlife_normalize_visitor_email($email);
        if ($email === '') {
            return $fallback;
        }

        $record = westlife_get_visitor_profile_record($email);
        if (!empty($record['name'])) {
            return $record['name'];
        }

        global $wpdb;
        $real_name = $wpdb->get_var($wpdb->prepare(
            "SELECT comment_author FROM {$wpdb->comments} WHERE comment_author_email = %s AND comment_author != comment_author_email AND comment_author NOT LIKE %s AND comment_author NOT LIKE %s AND comment_author NOT LIKE %s AND comment_approved = '1' ORDER BY comment_date DESC LIMIT 1",
            $email,
            '%http://%',
            '%https://%',
            '%www.%'
        ));

        return $real_name ?: $fallback;
    }
}

if (!function_exists('westlife_get_default_home_profile')) {
    function westlife_get_default_home_profile()
    {
        $author_email = trim((string) get_option('author_email'));
        if ($author_email === '') {
            $author_email = trim((string) get_option('admin_email'));
        }
        if ($author_email === '') {
            $author_email = (string) get_bloginfo('admin_email');
        }

        $author_avatar = trim((string) get_option('author_avatar'));
        if ($author_avatar === '' && $author_email !== '') {
            $author_avatar = get_avatar_url($author_email, ['size' => 160, 'default' => 'mp']);
        }
        if ($author_avatar === '') {
            $author_avatar = get_template_directory_uri() . '/assets/images/avatar.jpg';
        }

        $author_name = trim((string) get_option('author_name', '博主'));
        if ($author_name === '') {
            $author_name = get_bloginfo('name');
        }

        return [
            'email' => westlife_normalize_visitor_email($author_email),
            'display_name' => $author_name,
            'avatar_url' => $author_avatar,
            'slogan' => trim((string) get_option('author_slogan', '记录生活，分享技术')),
            'greeting' => '欢迎来到本站',
            'views' => 0,
            'likes' => 0,
            'approved_comments' => 0,
            'commented_posts_count' => 0,
            'score' => 0,
            'level' => westlife_get_visitor_level(0),
            'is_admin' => false,
            'is_known_visitor' => false,
            'sync_eligible' => false,
        ];
    }
}

if (!function_exists('westlife_build_home_profile')) {
    function westlife_build_home_profile($identity = null)
    {
        $default = westlife_get_default_home_profile();

        if (!is_array($identity)) {
            return $default;
        }

        $email = westlife_normalize_visitor_email($identity['email'] ?? '');
        if ($email === '') {
            return $default;
        }

        $record = westlife_get_visitor_profile_record($email);
        $stats = westlife_get_visitor_comment_stats($email);
        $commented_posts_count = !empty($stats['commented_posts']) && is_array($stats['commented_posts']) ? count($stats['commented_posts']) : 0;
        $views = (int) ($record['views'] ?? 0);
        $comments = (int) ($record['comments'] ?? 0);
        $likes = (int) ($record['likes'] ?? 0);
        $article_reads = (int) ($record['article_reads'] ?? 0);
        $memo_likes = (int) ($record['memo_likes'] ?? 0);
        $bird_feeds = (int) ($record['bird_feeds'] ?? 0);
        $approved_comments = (int) ($stats['approved_comments'] ?? 0);
        $score = westlife_calculate_visitor_score($record, $stats);
        $level = westlife_get_visitor_level($score);
        $badge = westlife_get_level_badge_data($level);
        $level_defs = westlife_get_visitor_level_thresholds();
        $current_index = max(1, (int) ($level['index'] ?? 1)) - 1;
        $next_threshold = isset($level_defs[$current_index + 1]) ? (int) $level_defs[$current_index + 1]['max'] : null;
        $previous_threshold = $current_index > 0 ? (int) $level_defs[$current_index - 1]['max'] + 1 : 0;
        $current_max = (int) $level_defs[$current_index]['max'];
        $range_total = max(1, $current_max - $previous_threshold + 1);
        $range_progress = min(100, max(0, (($score - $previous_threshold) / $range_total) * 100));
        $level_hint = westlife_build_level_hint($level, $score, $next_threshold);

        $is_admin = !empty($identity['is_admin']);
        $display_name = trim((string) ($identity['name'] ?? ''));
        if ($display_name === '') {
            $display_name = westlife_resolve_display_name_by_email($email, $default['display_name']);
        }

        $avatar_url = trim((string) ($identity['avatar_url'] ?? ''));
        if ($avatar_url === '') {
            $avatar_url = get_avatar_url($email, ['size' => 160, 'default' => 'mp']);
        }
        if ($avatar_url === '') {
            $avatar_url = $default['avatar_url'];
        }

        $is_known_visitor = $approved_comments > 0
            || $views > 0
            || $comments > 0
            || $article_reads > 0
            || $memo_likes > 0
            || $bird_feeds > 0
            || $likes > 0;

        $slogan = $is_admin
            ? '站点维护中'
            : ($is_known_visitor ? '回访访客 · ' . $level['label'] : '新朋友你好');

        if ($is_admin) {
            $greeting = westlife_build_admin_home_greeting($display_name);
        } elseif ($is_known_visitor) {
            $greeting = westlife_build_known_visitor_home_greeting($display_name, $stats);
        } else {
            $greeting = westlife_build_new_visitor_home_greeting($display_name);
        }

        return [
            'email' => $email,
            'display_name' => $display_name,
            'avatar_url' => $avatar_url,
            'slogan' => $slogan,
            'greeting' => $greeting,
            'views' => $views,
            'comments' => $comments,
            'likes' => $likes,
            'article_reads' => $article_reads,
            'memo_likes' => $memo_likes,
            'bird_feeds' => $bird_feeds,
            'reaction_like' => (int) ($record['reaction_like'] ?? 0),
            'reaction_clap' => (int) ($record['reaction_clap'] ?? 0),
            'reaction_party' => (int) ($record['reaction_party'] ?? 0),
            'approved_comments' => $approved_comments,
            'commented_posts_count' => $commented_posts_count,
            'score' => $score,
            'level' => $level,
            'badge' => $badge,
            'next_level_score' => $next_threshold,
            'level_hint' => $level_hint,
            'progress_percent' => round($range_progress, 1),
            'is_admin' => $is_admin,
            'is_known_visitor' => $is_known_visitor,
            'sync_eligible' => true,
            'admin_metrics' => $is_admin ? westlife_get_admin_home_metrics() : [],
        ];
    }
}

if (!function_exists('westlife_get_home_profile_identity')) {
    function westlife_get_comment_cookie_identity()
    {
        $cookiehash = defined('COOKIEHASH') ? COOKIEHASH : md5(get_option('siteurl'));
        $author_key = 'comment_author_' . $cookiehash;
        $email_key = 'comment_author_email_' . $cookiehash;
        $url_key = 'comment_author_url_' . $cookiehash;

        $visitor_data = [
            'name' => isset($_COOKIE[$author_key]) ? sanitize_text_field(wp_unslash((string) $_COOKIE[$author_key])) : '',
            'email' => isset($_COOKIE[$email_key]) ? sanitize_email(wp_unslash((string) $_COOKIE[$email_key])) : '',
            'url' => isset($_COOKIE[$url_key]) ? esc_url_raw(wp_unslash((string) $_COOKIE[$url_key])) : '',
        ];

        if (!empty($visitor_data['email']) && is_email($visitor_data['email'])) {
            return $visitor_data;
        }

        return null;
    }
}

if (!function_exists('westlife_get_home_profile_identity')) {
    function westlife_get_home_profile_identity()
    {
        if (is_user_logged_in()) {
            $user = wp_get_current_user();
            if ($user && !empty($user->user_email)) {
                return [
                    'email' => $user->user_email,
                    'name' => $user->display_name ?: $user->user_login,
                    'url' => $user->user_url,
                    'avatar_url' => get_avatar_url($user->ID, ['size' => 160, 'default' => 'mp']),
                    'is_admin' => user_can($user, 'manage_options'),
                ];
            }
        }

        $visitor_data = westlife_get_comment_cookie_identity();
        if (is_array($visitor_data)) {
            return [
                'email' => $visitor_data['email'],
                'name' => $visitor_data['name'],
                'url' => $visitor_data['url'],
                'avatar_url' => '',
                'is_admin' => false,
            ];
        }

        return null;
    }
}

if (!function_exists('westlife_get_home_visitor_profile')) {
    function westlife_get_home_visitor_profile()
    {
        return westlife_build_home_profile(westlife_get_home_profile_identity());
    }
}

if (!function_exists('westlife_ajax_sync_home_profile')) {
    function westlife_ajax_sync_home_profile()
    {
        if (!wp_verify_nonce($_POST['nonce'] ?? '', 'westlife_ajax_nonce')) {
            wp_send_json_error(['message' => '安全验证失败']);
        }

        $identity = null;
        if (is_user_logged_in()) {
            $identity = westlife_get_home_profile_identity();
        } else {
            $email = westlife_normalize_visitor_email($_POST['email'] ?? '');
            if ($email !== '') {
                $identity = [
                    'email' => $email,
                    'name' => sanitize_text_field($_POST['name'] ?? ''),
                    'url' => esc_url_raw($_POST['url'] ?? ''),
                    'avatar_url' => '',
                    'is_admin' => false,
                ];
            }
        }

        if (!is_array($identity) || empty($identity['email'])) {
            wp_send_json_success([
                'profile' => westlife_get_default_home_profile(),
            ]);
        }

        $increment_view = !empty($_POST['increment_view']);
        westlife_track_visitor_profile_view($identity['email'], [
            'name' => $identity['name'] ?? '',
            'url' => $identity['url'] ?? '',
            'increment_view' => false,
        ]);

        if ($increment_view) {
            westlife_track_visitor_profile_event('home_view', [
                'email' => $identity['email'],
                'name' => $identity['name'] ?? '',
                'url' => $identity['url'] ?? '',
                'delta' => 1,
            ]);
        }

        wp_send_json_success([
            'profile' => westlife_build_home_profile($identity),
        ]);
    }
    add_action('wp_ajax_westlife_visitor_sync_home_profile', 'westlife_ajax_sync_home_profile');
    add_action('wp_ajax_nopriv_westlife_visitor_sync_home_profile', 'westlife_ajax_sync_home_profile');
}

if (!function_exists('westlife_sync_profile_from_comment')) {
    function westlife_sync_profile_from_comment($comment_id)
    {
        $comment = get_comment($comment_id);
        if (!$comment || empty($comment->comment_author_email) || !is_email($comment->comment_author_email)) {
            return;
        }

        westlife_track_visitor_profile_view($comment->comment_author_email, [
            'name' => $comment->comment_author,
            'url' => $comment->comment_author_url,
            'increment_view' => false,
        ]);
        westlife_track_visitor_profile_event('comment', [
            'email' => $comment->comment_author_email,
            'name' => $comment->comment_author,
            'url' => $comment->comment_author_url,
            'delta' => 1,
        ]);
        westlife_refresh_visitor_profile_snapshot($comment->comment_author_email, [
            'email' => $comment->comment_author_email,
            'name' => $comment->comment_author,
            'url' => $comment->comment_author_url,
            'avatar_url' => '',
            'is_admin' => false,
        ]);
    }
    add_action('comment_post', 'westlife_sync_profile_from_comment', 20, 1);
}

if (!function_exists('westlife_generate_visitor_greeting')) {
    function westlife_generate_visitor_greeting($visitor_data)
    {
        $name = !empty($visitor_data['name']) ? $visitor_data['name'] : '朋友';
        $email = $visitor_data['email'] ?? '';
        $is_invalid = is_email($name) || strpos($name, 'http://') !== false || strpos($name, 'https://') !== false || strpos($name, 'www.') !== false;
        if ($is_invalid && !empty($email)) {
            global $wpdb;
            $real_name = $wpdb->get_var($wpdb->prepare(
                "SELECT comment_author FROM {$wpdb->comments} WHERE comment_author_email = %s AND comment_author != comment_author_email AND comment_author NOT LIKE %s AND comment_author NOT LIKE %s AND comment_author NOT LIKE %s AND comment_approved = '1' ORDER BY comment_date DESC LIMIT 1",
                $email,
                '%http://%',
                '%https://%',
                '%www.%'
            ));
            $name = $real_name ?: '朋友';
        }

        $stats = westlife_get_visitor_comment_stats($email);
        $greetings = [];
        if ($stats['approved_comments'] == 0) {
            $greetings = ["很高兴第一次见到你!", "欢迎来到我的小站!", "期待你的第一条评论!"];
        } elseif ($stats['approved_comments'] < 5) {
            $greetings = ["欢迎回来,已经留下 {$stats['approved_comments']} 条评论啦!", "又见面了,感谢你的 {$stats['approved_comments']} 条留言!"];
        } elseif ($stats['approved_comments'] < 20) {
            $greetings = ["老朋友回来了!你已经留下 {$stats['approved_comments']} 条精彩评论!", "资深访客驾到!感谢你的 {$stats['approved_comments']} 次互动!"];
        } else {
            $greetings = ["铁粉来了!感谢你的 {$stats['approved_comments']} 条宝贵评论!", "最忠实的读者!{$stats['approved_comments']} 条评论见证我们的友谊!"];
        }
        if (!empty($stats['last_comment_date'])) {
            $last_time = westlife_parse_timestamp($stats['last_comment_date']);
            $days_ago = $last_time > 0 ? floor((westlife_current_timestamp() - $last_time) / 86400) : 0;
            if ($days_ago < 1) $time_text = '今天';
            elseif ($days_ago < 7) $time_text = $days_ago . '天前';
            elseif ($days_ago < 30) $time_text = floor($days_ago / 7) . '周前';
            elseif ($days_ago < 365) $time_text = floor($days_ago / 30) . '个月前';
            else $time_text = floor($days_ago / 365) . '年前';
            $greetings[] = "上次见你是{$time_text},想念你了!";
        }
        $greeting = $greetings[array_rand($greetings)];
        $hour = (int) wp_date('G', westlife_current_timestamp(), westlife_wp_timezone());
        if ($hour < 6) $time_greeting = '深夜好';
        elseif ($hour < 9) $time_greeting = '早上好';
        elseif ($hour < 12) $time_greeting = '上午好';
        elseif ($hour < 14) $time_greeting = '中午好';
        elseif ($hour < 18) $time_greeting = '下午好';
        elseif ($hour < 22) $time_greeting = '晚上好';
        else $time_greeting = '夜深了';
        return $time_greeting . ',' . $name . '! ' . $greeting;
    }
}

if (!function_exists('westlife_ajax_get_visitor_info')) {
    function westlife_ajax_get_visitor_info()
    {
        if (!wp_verify_nonce($_POST['nonce'] ?? '', 'westlife_ajax_nonce')) {
            wp_send_json_error(['message' => '安全验证失败']);
        }
        $email = isset($_POST['email']) ? sanitize_email($_POST['email']) : '';
        if (empty($email) || !is_email($email)) wp_send_json_error(['message' => '无效的邮箱']);
        $stats = westlife_get_visitor_comment_stats($email);
        $name = isset($_POST['name']) ? sanitize_text_field($_POST['name']) : '';
        $greeting = westlife_generate_visitor_greeting(['email' => $email, 'name' => $name]);
        $avatar_url = get_avatar_url($email, ['size' => 128]);
        wp_send_json_success(['greeting' => $greeting, 'avatar_url' => $avatar_url, 'stats' => $stats]);
    }
    // 仅保留规范命名（旧 get_visitor_info 已删除）
    add_action('wp_ajax_westlife_visitor_get_info', 'westlife_ajax_get_visitor_info');
    add_action('wp_ajax_nopriv_westlife_visitor_get_info', 'westlife_ajax_get_visitor_info');
}

if (!function_exists('westlife_ajax_track_post_read')) {
    function westlife_ajax_track_post_read()
    {
        if (!wp_verify_nonce($_POST['nonce'] ?? '', 'westlife_ajax_nonce')) {
            wp_send_json_error(['message' => '安全验证失败']);
        }
        $post_id = isset($_POST['post_id']) ? intval($_POST['post_id']) : 0;
        if ($post_id <= 0) wp_send_json_error(['message' => '无效的文章ID']);
        westlife_track_visitor_profile_event('article_read', [
            'email' => sanitize_email($_POST['email'] ?? ''),
            'name' => sanitize_text_field($_POST['name'] ?? ''),
            'url' => esc_url_raw($_POST['url'] ?? ''),
            'delta' => 1,
        ]);
        wp_send_json_success(['post_id' => $post_id, 'timestamp' => time()]);
    }
    add_action('wp_ajax_westlife_visitor_track_read', 'westlife_ajax_track_post_read');
    add_action('wp_ajax_nopriv_westlife_visitor_track_read', 'westlife_ajax_track_post_read');
    // 旧 track_post_read action 已移除
}

if (!function_exists('westlife_output_visitor_config')) {
    function westlife_output_visitor_config($return_array = false)
    {
        $cookiehash = defined('COOKIEHASH') ? COOKIEHASH : md5(get_option('siteurl'));
        $basic_config = ['cookieHash' => $cookiehash];
        $is_home_like = (is_home() || is_front_page());
        $visitor_data = ['name' => '', 'email' => '', 'url' => ''];
        if ($is_home_like) {
            $cookie_identity = westlife_get_comment_cookie_identity();
            if (is_array($cookie_identity)) {
                $visitor_data = $cookie_identity;
            }
        }
        $config = $is_home_like ? [
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('westlife_ajax_nonce'),
            'defaultName' => get_option('author_name', '博主'),
            'defaultAvatar' => get_option('author_avatar', get_template_directory_uri() . '/assets/images/avatar.jpg'),
            'visitorData' => $visitor_data,
            'homeProfile' => westlife_get_home_visitor_profile(),
            'cookieHash' => $cookiehash,
        ] : $basic_config;
        if ($return_array) return $config;
        // 旧调用兼容：直接输出（不再挂 wp_head，新代码不使用）
        echo '<script>window.westlifeVisitorConfig=' . json_encode($config) . ';</script>';
    }
}
