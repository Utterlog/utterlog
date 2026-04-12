<?php
/**
 * LiMhy - 全局辅助工具集 (完全版)
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    提供时间处理、字符串截取、分页计算、高并发削峰及各类业务状态探针
 */

declare(strict_types=1);

/* =========================================
   时间与文本处理
   ========================================= */

function time_ago(string $datetime): string
{
    $ts = strtotime($datetime);
    if (!$ts) return $datetime;
    $diff = time() - $ts;
    if ($diff < 60) return '刚刚';
    if ($diff < 3600) return floor($diff / 60) . ' 分钟前';
    if ($diff < 86400) return floor($diff / 3600) . ' 小时前';
    if ($diff < 2592000) return floor($diff / 86400) . ' 天前';
    return date('Y-m-d', $ts);
}

function fmt_date(string $datetime, string $format = 'Y-m-d'): string
{
    $ts = strtotime($datetime);
    return $ts ? date($format, $ts) : '';
}

function generate_slug(string $title): string
{
    $slug = strtolower(trim($title));
    $slug = preg_replace('/[^a-z0-9\-]/', '-', $slug);
    $slug = preg_replace('/-+/', '-', $slug);
    $slug = trim($slug, '-');
    if (!$slug) { $slug = 'post-' . date('YmdHis'); }
    return $slug;
}

function make_excerpt(string $text, int $length = 120): string
{
    $text = preg_replace('/!\[.*?\]\(.*?\)/', '', $text);
    $text = preg_replace('/\[([^\]]+)\]\(.*?\)/', '$1', $text);
    $text = strip_tags($text);
    $text = preg_replace('/[#*`>~\-=|_]/', '', $text);
    $text = preg_replace('/\s+/', ' ', $text);
    $text = trim($text);

    if (mb_strlen($text) > $length) { $text = mb_substr($text, 0, $length) . '…'; }
    if (!$text) { $text = '暂无摘要'; }
    return $text;
}

function reading_time(string $content): int
{
    $len = mb_strlen(strip_tags($content));
    return max(1, (int)ceil($len / 300));
}

/* =========================================
   系统分页算法 (找回的核心缺失功能)
   ========================================= */

function paginate(int $total, int $page, int $perPage): array
{
    $safePerPage = max(1, $perPage);
    $totalPages = max(1, (int)ceil($total / $safePerPage));
    $page = max(1, min($page, $totalPages));
    $offset = ($page - 1) * $safePerPage;
    return [
        'page' => $page,
        'per_page' => $safePerPage,
        'total' => $total,
        'total_pages' => $totalPages,
        'offset' => $offset,
        'has_prev' => $page > 1,
        'has_next' => $page < $totalPages,
    ];
}

function pagination_url(int $page, ?string $route = null, array $query = []): string
{
    global $__route;

    $route = $route ?? (($__route ?? '') === '' ? '' : (string)$__route);
    $currentQuery = $_GET;
    unset($currentQuery['route'], $currentQuery['page']);

    foreach ($query as $key => $value) {
        if ($value === null || $value === '') {
            unset($currentQuery[$key]);
            continue;
        }
        $currentQuery[$key] = $value;
    }

    if ($page > 1) {
        $currentQuery['page'] = $page;
    }

    $baseUrl = $route === '' ? rtrim(SITE_URL, '/') . '/' : url($route);
    $queryString = http_build_query($currentQuery);

    return $queryString === '' ? $baseUrl : $baseUrl . (str_contains($baseUrl, '?') ? '&' : '?') . $queryString;
}

/* =========================================
   URL 辅助与路由识别
   ========================================= */

function url(string $path = ''): string
{
    if ($path === '') return SITE_URL;
    if (strpos($path, 'http://') === 0 || strpos($path, 'https://') === 0) { return $path; }
    $baseUrl = rtrim(SITE_URL, '/');
    if (strpos($path, '?') !== false) {
        [$route, $query] = explode('?', $path, 2);
        return $baseUrl . '/' . ltrim($route, '/') . '?' . $query;
    }
    return $baseUrl . '/' . ltrim($path, '/');
}

function asset(string $path): string
{
    $file = ROOT . '/assets/' . ltrim($path, '/');
    $ver = file_exists($file) ? filemtime($file) : time();
    return rtrim(SITE_URL, '/') . '/assets/' . ltrim($path, '/') . '?v=' . $ver;
}

function is_route(string $pattern): bool
{
    global $__route; return str_starts_with($__route ?? '', $pattern);
}

function post_url(array $post): string { $prefix = ($post['type'] ?? 'post') === 'page' ? 'page' : 'post'; return url("{$prefix}/{$post['slug']}"); }
function category_url(array $cat): string { $slug = $cat['category_slug'] ?? $cat['slug'] ?? ''; return url("category/{$slug}"); }
function tag_url(array $tag): string { return url("tag/{$tag['slug']}"); }


if (!function_exists('limhy_column_exists')) {
    function limhy_column_exists(string $table, string $column): bool
    {
        $table = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
        $column = preg_replace('/[^a-zA-Z0-9_]/', '', $column);
        if ($table === '' || $column === '') {
            return false;
        }
        try {
            return db_row("SHOW COLUMNS FROM `{$table}` LIKE ?", [$column]) !== null;
        } catch (\Throwable $e) {
            return false;
        }
    }
}


if (!function_exists('limhy_table_has_fulltext_index')) {
    function limhy_table_has_fulltext_index(string $table, array $columns): bool
    {
        $table = preg_replace('/[^a-zA-Z0-9_]/', '', $table);
        $columns = array_values(array_filter(array_map(static function ($column) {
            return preg_replace('/[^a-zA-Z0-9_]/', '', (string)$column);
        }, $columns)));
        if ($table === '' || $columns === []) {
            return false;
        }

        try {
            $rows = db_rows("SHOW INDEX FROM `{$table}` WHERE Index_type = 'FULLTEXT'");
            if (!$rows) {
                return false;
            }

            $map = [];
            foreach ($rows as $row) {
                $key = (string)($row['Key_name'] ?? '');
                $seq = (int)($row['Seq_in_index'] ?? 0);
                $col = (string)($row['Column_name'] ?? '');
                if ($key === '' || $seq <= 0 || $col === '') {
                    continue;
                }
                $map[$key][$seq] = $col;
            }

            foreach ($map as $indexColumns) {
                ksort($indexColumns);
                $normalized = array_values($indexColumns);
                if ($normalized === $columns) {
                    return true;
                }
            }
        } catch (\Throwable $e) {
            return false;
        }

        return false;
    }
}

if (!function_exists('limhy_ensure_post_rss_visibility_column')) {
    function limhy_ensure_post_rss_visibility_column(): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;

        $table = prefix() . 'posts';
        if (limhy_column_exists($table, 'rss_enabled')) {
            return;
        }

        try {
            db()->exec("ALTER TABLE `{$table}` ADD COLUMN `rss_enabled` TINYINT(1) NOT NULL DEFAULT 1 AFTER `comment_enabled`");
        } catch (\Throwable $e) {
            // 静默失败：避免前台页面因历史库结构差异直接中断。
        }
    }
}

if (!function_exists('limhy_ensure_post_custom_cover_column')) {
    function limhy_ensure_post_custom_cover_column(): void
    {
        static $done = false;
        if ($done) {
            return;
        }
        $done = true;

        $table = prefix() . 'posts';
        if (limhy_column_exists($table, 'custom_cover_url')) {
            return;
        }

        try {
            db()->exec("ALTER TABLE `{$table}` ADD COLUMN `custom_cover_url` varchar(500) DEFAULT '' AFTER `slug`");
        } catch (\Throwable $e) {
            // 静默失败：历史站点可先继续读取，直到管理员触发升级写入。
        }
    }
}

/* =========================================
   Request 辅助
   ========================================= */

if (!function_exists('is_ajax')) { 
    function is_ajax(): bool { 
        return isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower($_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest'; 
    } 
}

if (!function_exists('limhy_is_valid_ip')) {
    function limhy_is_valid_ip(string $ip): bool {
        return filter_var($ip, FILTER_VALIDATE_IP) !== false;
    }
}

if (!function_exists('limhy_is_public_ip')) {
    function limhy_is_public_ip(string $ip): bool {
        return filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_NO_PRIV_RANGE | FILTER_FLAG_NO_RES_RANGE) !== false;
    }
}

if (!function_exists('limhy_first_forwarded_ip')) {
    function limhy_first_forwarded_ip(string $headerValue): ?string {
        $parts = explode(',', $headerValue);
        $fallback = null;
        foreach ($parts as $part) {
            $ip = trim($part);
            if ($ip === '' || strcasecmp($ip, 'unknown') === 0) {
                continue;
            }
            if (!limhy_is_valid_ip($ip)) {
                continue;
            }
            if (limhy_is_public_ip($ip)) {
                return $ip;
            }
            if ($fallback === null) {
                $fallback = $ip;
            }
        }
        return $fallback;
    }
}

if (!function_exists('real_client_ip_from_headers')) {
    function real_client_ip_from_headers(): ?string {
        $headers = [
            'HTTP_CF_CONNECTING_IP',
            'HTTP_TRUE_CLIENT_IP',
            'HTTP_EO_CLIENT_IP',
            'HTTP_X_FORWARDED_FOR',
            'HTTP_X_REAL_IP',
            'HTTP_X_CLIENT_IP',
        ];

        foreach ($headers as $key) {
            $raw = $_SERVER[$key] ?? '';
            if (!is_string($raw) || trim($raw) === '') {
                continue;
            }
            $candidate = ($key === 'HTTP_X_FORWARDED_FOR') ? limhy_first_forwarded_ip($raw) : trim($raw);
            if ($candidate !== null && limhy_is_valid_ip($candidate)) {
                return $candidate;
            }
        }

        return null;
    }
}

if (!function_exists('client_ip')) {
    function client_ip(): string {
        $remote = trim((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));
        if (!limhy_is_valid_ip($remote)) {
            $remote = '0.0.0.0';
        }

        if (!(defined('TRUST_PROXY_IP') && (int)TRUST_PROXY_IP === 1)) {
            return $remote;
        }

        $real = real_client_ip_from_headers();
        return $real !== null ? $real : $remote;
    }
}


/* =========================================
   UI 展现辅助
   ========================================= */

function get_avatar_url(?string $email, string $name): string
{
    $email = strtolower(trim((string)$email));
    if (!$email) { return "https://ui-avatars.com/api/?name=" . urlencode($name) . "&background=random&color=fff&size=100"; }
    $hash = md5($email);
    $cacheFile = ROOT . '/uploads/avatars/' . $hash . '.jpg';
    if (file_exists($cacheFile)) { return url('uploads/avatars/' . $hash . '.jpg'); }
    $apiUrl = 'api/avatar?hash=' . $hash . '&name=' . urlencode($name);
    if (preg_match('/^(\d+)@qq\.com$/i', $email, $matches)) { $apiUrl .= '&qq=' . $matches[1]; }
    return url($apiUrl);
}

function normalize_public_image_url(string $src): string
{
    $src = trim(html_entity_decode($src, ENT_QUOTES, 'UTF-8'));
    if ($src === '' || str_starts_with($src, 'data:') || str_starts_with($src, 'blob:')) {
        return '';
    }

    if (preg_match('/^https?:\/\//i', $src)) {
        return $src;
    }

    if (str_starts_with($src, '//')) {
        $siteScheme = parse_url(SITE_URL, PHP_URL_SCHEME) ?: ((isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] === 'on') ? 'https' : 'http');
        return $siteScheme . ':' . $src;
    }

    return url(ltrim($src, '/'));
}

function extract_first_image_url(string $contentHtml): string
{
    if (trim($contentHtml) === '') {
        return '';
    }

    $patterns = [
        '~<img\b[^>]*\b(?:data-src|data-original|data-lazy-src|src)\s*=\s*["\']([^"\']+)["\'][^>]*>~i',
        '~<source\b[^>]*\bsrcset\s*=\s*["\']([^"\']+)["\'][^>]*>~i',
    ];

    foreach ($patterns as $pattern) {
        if (preg_match_all($pattern, $contentHtml, $matches)) {
            foreach (($matches[1] ?? []) as $candidate) {
                $candidate = trim((string)$candidate);
                if ($candidate === '') {
                    continue;
                }
                if (str_contains($candidate, ',')) {
                    $candidate = trim(explode(',', $candidate)[0]);
                    $candidate = trim((string) preg_split('/\s+/', $candidate)[0]);
                }
                $normalized = normalize_public_image_url($candidate);
                if ($normalized !== '') {
                    return $normalized;
                }
            }
        }
    }

    return '';
}

function get_post_cover(string $contentHtml): string
{
    $cover = extract_first_image_url($contentHtml);
    if ($cover !== '') {
        return $cover;
    }

    return url('assets/img/logo.png');
}

function get_post_cover_for_post(array $post): string
{
    $custom = normalize_public_image_url((string)($post['custom_cover_url'] ?? ''));
    if ($custom !== '') {
        return $custom;
    }

    return get_post_cover((string)($post['content_html'] ?? ''));
}

function post_has_visual_cover(array $post): bool
{
    $custom = normalize_public_image_url((string)($post['custom_cover_url'] ?? ''));
    if ($custom !== '') {
        return true;
    }

    return preg_match('/<img\s+[^>]*src=["\']([^"\']+)["\'][^>]*>/i', (string)($post['content_html'] ?? '')) === 1;
}

function img_lazyload(string $contentHtml): string
{
    return preg_replace_callback('/<img\b[^>]*>/i', static function (array $matches): string {
        $img = $matches[0];
        if (!preg_match('/\bloading\s*=\s*["\']/i', $img)) {
            $img = preg_replace('/<img\b/i', '<img loading="lazy"', $img, 1);
        }
        if (!preg_match('/\bdecoding\s*=\s*["\']/i', $img)) {
            $img = preg_replace('/<img\b/i', '<img decoding="async"', $img, 1);
        }
        return $img;
    }, $contentHtml) ?? $contentHtml;
}

function gen_comment_color(string $name): string { $h = hexdec(substr(md5($name), 0, 4)) % 360; return "hsl({$h}, 45%, 55%)"; }

/* =========================================
   网络与异步控制
   ========================================= */

function check_url_with_retry(string $url, int $retry = 1): bool
{
    $attempt = 0;
    do {
        $ch = curl_init(); curl_setopt($ch, CURLOPT_URL, $url); curl_setopt($ch, CURLOPT_NOBODY, true); curl_setopt($ch, CURLOPT_RETURNTRANSFER, true); curl_setopt($ch, CURLOPT_TIMEOUT, 3); curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 2); curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 0); curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, 0); curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (compatible; LiMhyBlog/1.0)');
                $res = curl_exec($ch); 
        $code = curl_getinfo($ch, CURLINFO_HTTP_CODE); 
        if (PHP_VERSION_ID < 80000) { curl_close($ch); }
        if ($code >= 200 && $code < 400) { return true; } $attempt++;
    } while ($attempt <= $retry);
    return false;
}

/* =========================================
   后台业务计数器 (找回的依赖)
   ========================================= */

function update_comment_count(int $postId): void
{
    $p = prefix(); $count = (int)db_val("SELECT COUNT(*) FROM `{$p}comments` WHERE `post_id` = ? AND `status` = 'approved'", [$postId]);
    db_exec("UPDATE `{$p}posts` SET `comment_count` = ? WHERE `id` = ?", [$count, $postId]);
}

function update_category_counts(): void
{
    $p = prefix(); db_exec("UPDATE `{$p}categories` c SET c.`post_count` = (SELECT COUNT(*) FROM `{$p}posts` p WHERE p.`category_id` = c.`id` AND p.`type` = 'post' AND p.`status` = 'published')");
}

function update_tag_counts(): void
{
    $p = prefix(); db_exec("UPDATE `{$p}tags` t SET t.`post_count` = (SELECT COUNT(*) FROM `{$p}post_tags` pt JOIN `{$p}posts` p ON p.`id` = pt.`post_id` WHERE pt.`tag_id` = t.`id` AND p.`type` = 'post' AND p.`status` = 'published')");
}

/* =========================================
   小镇环境与数据透视 (找回的依赖)
   ========================================= */

function get_town_env_data(): array {
    $p = prefix(); $hour = (int)date('G');
    $latestPost = db_row("SELECT title FROM `{$p}posts` WHERE type='post' AND status='published' ORDER BY published_at DESC LIMIT 1");
    $latestComment = db_row("SELECT author FROM `{$p}comments` WHERE status='approved' ORDER BY created_at DESC LIMIT 1");
    return [ 'hour' => $hour, 'latest_post' => $latestPost['title'] ?? '', 'latest_comment_author' => $latestComment['author'] ?? '', 'is_weekend' => (date('N') >= 6), 'site_name' => defined('SITE_NAME') ? SITE_NAME : 'LiMhy' ];
}

/* =========================================
   缓存与高并发削峰器
   ========================================= */


function limhy_runtime_cache_dir(): string
{
    return ROOT . '/data/runtime_cache';
}

function limhy_runtime_cache_path(string $key): string
{
    return limhy_runtime_cache_dir() . '/' . md5($key) . '.php';
}

function limhy_runtime_cache_get(string $key)
{
    $file = limhy_runtime_cache_path($key);
    if (!is_file($file)) {
        return null;
    }
    $payload = @include $file;
    if (!is_array($payload) || !isset($payload['expires_at'])) {
        return null;
    }
    if ((int)$payload['expires_at'] < time()) {
        @unlink($file);
        return null;
    }
    return $payload['data'] ?? null;
}

function limhy_runtime_cache_set(string $key, $data, int $ttl = 300): bool
{
    $dir = limhy_runtime_cache_dir();
    if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
        return false;
    }
    $file = limhy_runtime_cache_path($key);
    $temp = $file . '.tmp';
    $payload = [
        'expires_at' => time() + max(1, $ttl),
        'data' => $data,
    ];
    $content = '<?php return ' . var_export($payload, true) . ';';
    if (@file_put_contents($temp, $content, LOCK_EX) === false) {
        return false;
    }
    return @rename($temp, $file);
}

function limhy_runtime_cache_clear(): void
{
    $dir = limhy_runtime_cache_dir();
    if (!is_dir($dir)) {
        return;
    }
    foreach (glob($dir . '/*.php') ?: [] as $file) {
        @unlink($file);
    }
}

function limhy_cached_query(string $key, callable $producer, int $ttl = 300): array
{
    $cached = limhy_runtime_cache_get($key);
    if (is_array($cached)) {
        return $cached;
    }
    $data = $producer();
    if (!is_array($data)) {
        $data = [];
    }
    limhy_runtime_cache_set($key, $data, $ttl);
    return $data;
}


function clear_html_cache(): void {
    limhy_runtime_cache_clear();
    $dir = ROOT . '/data/html_cache/';
    if (!is_dir($dir)) return;
    $trashDir = ROOT . '/data/html_cache_trash_' . time() . '_' . mt_rand(100, 999);
    if (@rename($dir, $trashDir)) {
        @mkdir($dir, 0755, true);
        register_shutdown_function(function() use ($trashDir) {
            if (!is_dir($trashDir)) return;
            try {
                $files = new RecursiveIteratorIterator(
                    new RecursiveDirectoryIterator($trashDir, RecursiveDirectoryIterator::SKIP_DOTS),
                    RecursiveIteratorIterator::CHILD_FIRST
                );
                foreach ($files as $fileinfo) {
                    $todo = ($fileinfo->isDir() ? 'rmdir' : 'unlink');
                    @$todo($fileinfo->getRealPath());
                }
                @rmdir($trashDir);
            } catch (\Throwable $e) {}
        });
    }
}

function record_post_view(int $postId): void
{
    $file = ROOT . '/data/view_queue.log'; $dir = dirname($file); if (!is_dir($dir)) mkdir($dir, 0755, true);
    file_put_contents($file, $postId . PHP_EOL, FILE_APPEND | LOCK_EX);
    if (rand(1, 3) === 1 || (file_exists($file) && filesize($file) > 1024)) { register_shutdown_function('flush_view_queue'); }
}

function flush_view_queue(): void
{
    $file = ROOT . '/data/view_queue.log'; if (!file_exists($file)) return;
    $fp = fopen($file, 'r+'); if (!$fp) return;
    if (flock($fp, LOCK_EX | LOCK_NB)) {
        $content = stream_get_contents($fp);
        if (trim($content) === '') { flock($fp, LOCK_UN); fclose($fp); return; }
        ftruncate($fp, 0); rewind($fp); flock($fp, LOCK_UN); fclose($fp);
        $ids = array_filter(explode(PHP_EOL, $content), 'is_numeric'); if (empty($ids)) return;
        $counts = array_count_values($ids); if (empty($counts)) return;
        
        $p = prefix(); $cases = []; $params = []; $idList = implode(',', array_keys($counts));
        foreach ($counts as $id => $count) {
            $cases[] = "WHEN id = ? THEN view_count + ?";
            $params[] = (int)$id; $params[] = (int)$count;
        }
        $sql = "UPDATE `{$p}posts` SET view_count = CASE " . implode(' ', $cases) . " ELSE view_count END WHERE id IN ($idList)";
        db_exec($sql, $params);
    } else { fclose($fp); }
}

/* =========================================
   实时在线与 IP 库解析
   ========================================= */

function get_online_count(): int
{
    $file = ROOT . '/data/online_stats.json'; $dir = dirname($file); if (!is_dir($dir)) mkdir($dir, 0755, true);
    $ip = client_ip(); $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    if (preg_match('/bot|crawl|spider|slurp|search|feed/i', $ua)) { if (file_exists($file)) { $data = json_decode(file_get_contents($file), true) ?? []; return count($data); } return 1; }
    $device = preg_match('/Mobile|Android|iPhone|iPad/i', $ua) ? 'Mobile' : 'Desktop';
    $id = md5($ip . $device); $now = time(); $window = 120;
    $emote = clean($_GET['set_emote'] ?? '', 20);
    $fp = fopen($file, 'c+'); if (!$fp) return 1;

    if (flock($fp, LOCK_EX)) {
        $json = stream_get_contents($fp); $data = $json ? json_decode($json, true) : []; if (!is_array($data)) $data = [];
        $currentEmote = $emote ?: ($data[$id]['emote'] ?? '');
        $data[$id] = [ 'time' => $now, 'ip' => $ip, 'dev' => $device, 'emote' => $currentEmote ];
        foreach ($data as $key => $info) { if (!is_array($info)) { unset($data[$key]); continue; } if ($now - $info['time'] > $window) unset($data[$key]); }
        $count = count($data); ftruncate($fp, 0); rewind($fp); fwrite($fp, json_encode($data)); fflush($fp); flock($fp, LOCK_UN); 
    } else { $count = 1; }
    fclose($fp); return max(1, $count);
}

function get_ip_location(string $ip): string
{
    if ($ip === '127.0.0.1' || $ip === '::1') return '本地局域网';
    $cacheDir = ROOT . '/data/ip_cache/'; if (!is_dir($cacheDir)) mkdir($cacheDir, 0755, true);
    $cacheFile = $cacheDir . 'v2_' . md5($ip) . '.txt'; 
    if (file_exists($cacheFile) && filemtime($cacheFile) > time() - 2592000) { return file_get_contents($cacheFile); }
    $loc = '未知地域';
    try {
        if (strpos($ip, ':') !== false) {
            $v6File = ROOT . '/core/ipdata/ipdbv6.func.php';
            if (file_exists($v6File)) {
                require_once $v6File; $db6 = new ipdbv6(ROOT . '/core/ipdata/ipv6wry.db'); $result = $db6->query($ip);
                if (isset($result['addr'][0]) && !str_contains((string)($result['disp'] ?? ''), '错误')) { $loc = str_replace(["无线基站网络","公众宽带","3GNET网络","CMNET网络","CTNET网络","\t", "\""], "", $result["addr"][0]); }
            }
        } else {
            $v4File = ROOT . '/core/ipdata/IpLocation.php';
            if (file_exists($v4File)) {
                require_once $v4File; $ipaddr = \itbdw\Ip\IpLocation::getLocation($ip);
                if (isset($ipaddr['area']) && $ipaddr['code'] != -400) { $loc = $ipaddr['area']; }
            }
        }
    } catch (\Throwable $e) {}
    $loc = preg_replace('/[a-zA-Z0-9_\-\.]+/i', '', $loc); $loc = preg_replace('/广电网|电信|联通|移动|铁通|长城宽带|阿里云|腾讯云|数据中心|机房|网络/u', '', $loc); $loc = preg_replace('/(.*?省)(.*?市)/u', '$1 $2', $loc); 
    if (preg_match('/^(美国|日本|韩国|新加坡|英国|法国|德国|俄罗斯|澳洲|澳大利亚|荷兰|加拿大|巴西|印度|泰国|越南|菲律宾|马来西亚|印尼|南非)/u', $loc, $matches)) { $loc = $matches[1]; } elseif (preg_match('/香港|Hong Kong/i', $loc)) { $loc = '香港'; } elseif (preg_match('/台湾|Taiwan/i', $loc)) { $loc = '台湾'; } elseif (preg_match('/澳门|Macao/i', $loc)) { $loc = '澳门'; }
    $loc = trim($loc); if (empty($loc)) $loc = '未知地域';
    if ($loc !== '未知地域') { file_put_contents($cacheFile, $loc); }
    return $loc;
}

function mask_ip(string $ip): string { if (strpos($ip, ':') !== false) { $parts = explode(':', $ip); if (count($parts) > 3) return $parts[0] . ':' . $parts[1] . ':*:*'; return '*.*'; } $parts = explode('.', $ip); if (count($parts) === 4) return $parts[0] . '.' . $parts[1] . '.*.*'; return '*.*.*.*'; }



/* =========================================
   站点设置持久化（用于多行文本与自由输入配置）
   ========================================= */

if (!function_exists('limhy_site_settings_path')) {
    function limhy_site_settings_path(): string
    {
        return ROOT . '/data/site_settings.json';
    }
}

if (!function_exists('limhy_read_site_settings')) {
    function limhy_read_site_settings(): array
    {
        $file = limhy_site_settings_path();
        if (!is_file($file)) {
            return [];
        }
        $raw = @file_get_contents($file);
        if ($raw === false || trim($raw) === '') {
            return [];
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}

if (!function_exists('limhy_write_site_settings')) {
    function limhy_write_site_settings(array $updates): bool
    {
        $dir = ROOT . '/data';
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            return false;
        }
        $current = limhy_read_site_settings();
        foreach ($updates as $key => $value) {
            $current[$key] = $value;
        }
        $json = json_encode($current, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($json === false) {
            return false;
        }
        return @file_put_contents(limhy_site_settings_path(), $json . "
", LOCK_EX) !== false;
    }
}

if (!function_exists('limhy_site_setting')) {
    function limhy_site_setting(string $key, $default = '')
    {
        $data = limhy_read_site_settings();
        return array_key_exists($key, $data) ? $data[$key] : $default;
    }
}

if (!function_exists('limhy_plugin_settings_dir')) {
    function limhy_plugin_settings_dir(): string
    {
        return ROOT . '/data/plugin_settings';
    }
}

if (!function_exists('limhy_plugin_settings_path')) {
    function limhy_plugin_settings_path(string $slug): string
    {
        $slug = preg_replace('/[^a-zA-Z0-9_-]/', '', $slug) ?? '';
        return limhy_plugin_settings_dir() . '/' . $slug . '.json';
    }
}

if (!function_exists('limhy_read_plugin_settings')) {
    function limhy_read_plugin_settings(string $slug): array
    {
        if (function_exists('plugin_config_get')) {
            return plugin_config_get($slug, []);
        }
        $file = limhy_plugin_settings_path($slug);
        if (!is_file($file)) {
            return [];
        }
        $raw = @file_get_contents($file);
        if ($raw === false || trim($raw) === '') {
            return [];
        }
        $data = json_decode($raw, true);
        return is_array($data) ? $data : [];
    }
}

if (!function_exists('limhy_write_plugin_settings')) {
    function limhy_write_plugin_settings(string $slug, array $updates): bool
    {
        if (function_exists('plugin_config_get') && function_exists('plugin_config_set')) {
            $current = plugin_config_get($slug, []);
            foreach ($updates as $key => $value) {
                $current[(string)$key] = $value;
            }
            return plugin_config_set($slug, $current);
        }
        $dir = limhy_plugin_settings_dir();
        if (!is_dir($dir) && !@mkdir($dir, 0755, true) && !is_dir($dir)) {
            return false;
        }
        $current = limhy_read_plugin_settings($slug);
        foreach ($updates as $key => $value) {
            $current[(string)$key] = $value;
        }
        $json = json_encode($current, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        if ($json === false) {
            return false;
        }
        return @file_put_contents(limhy_plugin_settings_path($slug), $json . "
", LOCK_EX) !== false;
    }
}

if (!function_exists('limhy_plugin_setting')) {
    function limhy_plugin_setting(string $slug, string $key, $default = '')
    {
        $data = limhy_read_plugin_settings($slug);
        return array_key_exists($key, $data) ? $data[$key] : $default;
    }
}

if (!function_exists('limhy_normalize_multiline_input')) {
    function limhy_normalize_multiline_input(string $value, int $maxLen = 5000): string
    {
        $value = str_replace(["
", "
"], "
", $value);
        $value = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/u', '', $value) ?? $value;
        $value = str_replace(["<?php", "<?", "?>"], '', $value);
        $value = trim($value);
        return mb_substr($value, 0, $maxLen);
    }
}



/* =========================================
   评论表情与站长评论展示
   ========================================= */


if (!function_exists('limhy_safe_custom_html')) {
    function limhy_safe_custom_html(string $html): string
    {
        $html = limhy_normalize_multiline_input($html, 30000);
        if ($html === '') {
            return '';
        }
        if (function_exists('md_sanitize_raw_html_fragment')) {
            return (string) md_sanitize_raw_html_fragment($html);
        }
        return strip_tags($html, '<p><br><strong><em><b><i><u><del><blockquote><ul><ol><li><a><img><div><span><section><article><h1><h2><h3><h4><h5><h6><small><code>');
    }
}

if (!function_exists('limhy_unicode_codepoint_to_utf8')) {
    function limhy_unicode_codepoint_to_utf8(string $hex): string
    {
        $hex = preg_replace('/[^0-9a-fA-F]/', '', $hex);
        if ($hex === '') {
            return '';
        }
        return html_entity_decode('&#x' . $hex . ';', ENT_QUOTES | ENT_HTML5, 'UTF-8');
    }
}

if (!function_exists('limhy_decode_emoji_label')) {
    function limhy_decode_emoji_label(string $token): string
    {
        $label = trim(rawurldecode($token));
        $label = html_entity_decode($label, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $label = preg_replace('/^\[(.*)\]$/u', '$1', $label) ?? $label;
        $label = preg_replace_callback('/#U([0-9a-fA-F]{4})(?=[A-Za-z])/u', function ($m) {
            return limhy_unicode_codepoint_to_utf8($m[1]);
        }, $label) ?? $label;
        $label = preg_replace_callback('/#U([0-9a-fA-F]{4,6})(?=#U|$|[^0-9A-Za-z])/u', function ($m) {
            return limhy_unicode_codepoint_to_utf8($m[1]);
        }, $label) ?? $label;
        $label = preg_replace_callback('/&#x([0-9a-fA-F]{2,6});?/u', function ($m) {
            return limhy_unicode_codepoint_to_utf8($m[1]);
        }, $label) ?? $label;
        $label = preg_replace_callback('/&#([0-9]{2,7});?/u', function ($m) {
            $num = (int) $m[1];
            if ($num <= 0) {
                return '';
            }
            return html_entity_decode('&#' . $num . ';', ENT_QUOTES | ENT_HTML5, 'UTF-8');
        }, $label) ?? $label;
        $label = html_entity_decode($label, ENT_QUOTES | ENT_HTML5, 'UTF-8');
        $label = str_replace(['_', '-'], ' ', $label);
        $label = preg_replace('/\s+/u', ' ', $label) ?? $label;
        return trim($label);
    }
}

if (!function_exists('limhy_comment_emoji_dir')) {
    function limhy_comment_emoji_dir(): string
    {
        return ROOT . '/assets/emoji';
    }
}

if (!function_exists('limhy_comment_emoji_public_base')) {
    function limhy_comment_emoji_public_base(): string
    {
        return rtrim(url('assets/emoji'), '/');
    }
}


if (!function_exists('limhy_comment_emojis')) {
    function limhy_comment_emojis(): array
    {
        static $cache = null;
        if ($cache !== null) {
            return $cache;
        }
        $cache = [];
        $dir = limhy_comment_emoji_dir();
        if (!is_dir($dir)) {
            return $cache;
        }
        $entries = scandir($dir);
        if (!is_array($entries)) {
            return $cache;
        }
        $allow = ['png', 'gif', 'jpg', 'jpeg', 'webp', 'avif'];
        foreach ($entries as $entry) {
            if ($entry === '.' || $entry === '..') {
                continue;
            }
            $file = $dir . '/' . $entry;
            if (!is_file($file)) {
                continue;
            }
            $ext = strtolower((string) pathinfo($entry, PATHINFO_EXTENSION));
            if (!in_array($ext, $allow, true)) {
                continue;
            }
            $key = (string) pathinfo($entry, PATHINFO_FILENAME);
            if ($key === '') {
                continue;
            }
            $label = limhy_decode_emoji_label($key);
            if ($label === '') {
                $label = $key;
            }
            $url = limhy_comment_emoji_public_base() . '/' . rawurlencode($entry);
            $cache[] = [
                'key' => $key,
                'label' => $label,
                'token' => '[em:' . $label . ']',
                'url' => $url,
            ];
        }
        usort($cache, function (array $a, array $b): int {
            return strnatcasecmp((string) ($a['label'] ?? ''), (string) ($b['label'] ?? ''));
        });
        return $cache;
    }
}

if (!function_exists('limhy_find_comment_emoji')) {
    function limhy_find_comment_emoji(string $code): ?array
    {
        $code = trim(limhy_decode_emoji_label($code));
        if ($code === '') {
            return null;
        }
        foreach (limhy_comment_emojis() as $emoji) {
            $label = trim((string) ($emoji['label'] ?? ''));
            $key = trim((string) ($emoji['key'] ?? ''));
            if ($code === $label || $code === $key || $code === limhy_decode_emoji_label($key)) {
                return $emoji;
            }
        }
        return null;
    }
}

if (!function_exists('limhy_comment_admin_display_name')) {
    function limhy_comment_admin_display_name(): string
    {
        $tblUsers = (function_exists('prefix') ? prefix() : 'lm_') . 'users';
        $adminData = function_exists('db_row') ? db_row("SELECT * FROM `{$tblUsers}` WHERE `role`='admin' LIMIT 1") : null;
        $screen = trim((string)($adminData['screen_name'] ?? ''));
        if ($screen !== '') return $screen;
        if (defined('ADMIN_USER') && trim((string)ADMIN_USER) !== '') return trim((string)ADMIN_USER);
        return 'Admin';
    }
}

if (!function_exists('limhy_comment_admin_display_email')) {
    function limhy_comment_admin_display_email(): string
    {
        $tblUsers = (function_exists('prefix') ? prefix() : 'lm_') . 'users';
        $adminData = function_exists('db_row') ? db_row("SELECT * FROM `{$tblUsers}` WHERE `role`='admin' LIMIT 1") : null;
        $mail = trim((string)($adminData['mail'] ?? ''));
        if ($mail !== '') return $mail;
        return defined('ADMIN_MAIL') ? trim((string)ADMIN_MAIL) : '';
    }
}

if (!function_exists('limhy_normalize_comment_row')) {
    function limhy_normalize_comment_row(array $comment): array
    {
        if (!empty($comment['is_admin'])) {
            $comment['author'] = limhy_comment_admin_display_name();
            $adminEmail = limhy_comment_admin_display_email();
            if ($adminEmail !== '') {
                $comment['email'] = $adminEmail;
            }
            if (empty($comment['url']) && defined('SITE_URL')) {
                $comment['url'] = SITE_URL;
            }
        }
        return $comment;
    }
}


if (!function_exists('limhy_render_comment_content')) {
    function limhy_render_comment_content(string $content): string
    {
        if ($content === '') {
            return '';
        }
        $escaped = e($content);
        $escaped = preg_replace_callback('/\[em:([^\]\n]{1,120})\]/u', function ($m) {
            $code = trim((string) $m[1]);
            $emoji = limhy_find_comment_emoji($code);
            if (!$emoji) {
                return e($m[0]);
            }
            return '<img class="comment-emoji" src="' . e((string) $emoji['url']) . '" alt="' . e((string) $emoji['label']) . '" title="' . e((string) $emoji['label']) . '" loading="lazy">';
        }, $escaped) ?? $escaped;
        $escaped = preg_replace_callback('/\[([^\]\n]{1,120})\]/u', function ($m) {
            $code = trim((string) $m[1]);
            $emoji = limhy_find_comment_emoji($code);
            if (!$emoji) {
                return e($m[0]);
            }
            return '<img class="comment-emoji" src="' . e((string) $emoji['url']) . '" alt="' . e((string) $emoji['label']) . '" title="' . e((string) $emoji['label']) . '" loading="lazy">';
        }, $escaped) ?? $escaped;
        return nl2br($escaped);
    }
}


if (!function_exists('limhy_pending_comment_cookie_name')) {
    function limhy_pending_comment_cookie_name(): string
    {
        return 'lm_pending_comments';
    }
}

if (!function_exists('limhy_pending_comment_secret')) {
    function limhy_pending_comment_secret(): string
    {
        $parts = [
            defined('ADMIN_SECRET') ? (string) ADMIN_SECRET : '',
            defined('SITE_URL') ? (string) SITE_URL : '',
            __FILE__,
        ];
        return hash('sha256', implode('|', $parts));
    }
}

if (!function_exists('limhy_pending_comment_signature')) {
    function limhy_pending_comment_signature(int $commentId, int $postId, string $email): string
    {
        $identity = strtolower(trim($email));
        return hash_hmac('sha256', $commentId . '|' . $postId . '|' . $identity, limhy_pending_comment_secret());
    }
}

if (!function_exists('limhy_register_pending_comment_visibility')) {
    function limhy_register_pending_comment_visibility(int $commentId, int $postId, string $email): void
    {
        $email = strtolower(trim($email));
        if ($commentId <= 0 || $postId <= 0 || $email === '') {
            return;
        }
        $cookieName = limhy_pending_comment_cookie_name();
        $current = json_decode($_COOKIE[$cookieName] ?? '[]', true);
        if (!is_array($current)) {
            $current = [];
        }
        $current[(string) $commentId] = [
            'p' => $postId,
            's' => limhy_pending_comment_signature($commentId, $postId, $email),
            't' => time(),
        ];
        uasort($current, static function (array $a, array $b): int {
            return (int) ($b['t'] ?? 0) <=> (int) ($a['t'] ?? 0);
        });
        $current = array_slice($current, 0, 20, true);
        $payload = json_encode($current, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($payload === false) {
            return;
        }
        setcookie($cookieName, $payload, [
            'expires' => time() + 86400 * 30,
            'path' => '/',
            'secure' => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
        $_COOKIE[$cookieName] = $payload;
    }
}

if (!function_exists('limhy_visible_pending_comment_ids')) {
    function limhy_visible_pending_comment_ids(int $postId): array
    {
        if ($postId <= 0) {
            return [];
        }
        $cookieName = limhy_pending_comment_cookie_name();
        $payload = json_decode($_COOKIE[$cookieName] ?? '[]', true);
        if (!is_array($payload) || empty($payload)) {
            return [];
        }
        $email = strtolower(trim((string) ($_COOKIE['comment_email'] ?? '')));
        if ($email === '') {
            return [];
        }
        $ids = [];
        foreach ($payload as $rawId => $item) {
            $commentId = (int) $rawId;
            if ($commentId <= 0 || !is_array($item)) {
                continue;
            }
            $cookiePostId = (int) ($item['p'] ?? 0);
            $cookieSig = (string) ($item['s'] ?? '');
            if ($cookiePostId !== $postId || $cookieSig === '') {
                continue;
            }
            $expected = limhy_pending_comment_signature($commentId, $postId, $email);
            if (!hash_equals($expected, $cookieSig)) {
                continue;
            }
            $ids[] = $commentId;
        }
        return array_values(array_unique($ids));
    }
}

if (!function_exists('limhy_has_pending_comment_context')) {
    function limhy_has_pending_comment_context(): bool
    {
        $cookieName = limhy_pending_comment_cookie_name();
        return !empty($_COOKIE[$cookieName]) && !empty($_COOKIE['comment_email']);
    }
}

if (!function_exists('limhy_comment_pagination_enabled')) {
    function limhy_comment_pagination_enabled(): bool
    {
        return defined('COMMENT_PAGE_ENABLED') ? (bool) COMMENT_PAGE_ENABLED : true;
    }
}

if (!function_exists('limhy_comment_per_page')) {
    function limhy_comment_per_page(): int
    {
        $perPage = defined('COMMENT_PAGE_SIZE') ? (int) COMMENT_PAGE_SIZE : 10;
        return max(1, min(100, $perPage));
    }
}

if (!function_exists('limhy_comment_first_page_latest')) {
    function limhy_comment_first_page_latest(): bool
    {
        return defined('COMMENT_PAGE_FIRST_NEWEST') ? (bool) COMMENT_PAGE_FIRST_NEWEST : true;
    }
}

if (!function_exists('limhy_comment_page_param')) {
    function limhy_comment_page_param(): int
    {
        return max(1, (int)($_GET['cpage'] ?? 1));
    }
}

if (!function_exists('limhy_comment_visible_clause')) {
    function limhy_comment_visible_clause(int $postId, array &$params): string
    {
        $visiblePendingIds = limhy_visible_pending_comment_ids($postId);
        if (empty($visiblePendingIds)) {
            $params[] = $postId;
            return " WHERE `post_id` = ? AND `status` = 'approved' ";
        }

        $params[] = $postId;
        foreach ($visiblePendingIds as $pendingId) {
            $params[] = (int)$pendingId;
        }
        $placeholders = implode(',', array_fill(0, count($visiblePendingIds), '?'));

        return " WHERE `post_id` = ? AND (`status` = 'approved' OR (`status` = 'pending' AND `id` IN ({$placeholders}))) ";
    }
}

if (!function_exists('limhy_comment_total_count')) {
    function limhy_comment_total_count(int $postId): int
    {
        if ($postId <= 0 || !function_exists('db_value')) {
            return 0;
        }

        $table = (function_exists('prefix') ? prefix() : 'lm_') . 'comments';
        $params = [];
        $visibleWhere = limhy_comment_visible_clause($postId, $params);

        return (int) db_value("SELECT COUNT(*) FROM `{$table}` " . $visibleWhere, $params);
    }
}

if (!function_exists('limhy_comment_pagination_payload')) {
    function limhy_comment_pagination_payload(int $postId, int $page = 1): array
    {
        if ($postId <= 0 || !function_exists('db_rows')) {
            $pager = paginate(0, 1, limhy_comment_per_page());
            $pager['total_comments'] = 0;
            return ['items' => [], 'pager' => $pager];
        }

        $table = (function_exists('prefix') ? prefix() : 'lm_') . 'comments';
        $perPage = limhy_comment_per_page();
        $page = max(1, $page);

        $baseParams = [];
        $visibleWhere = limhy_comment_visible_clause($postId, $baseParams);
        $totalComments = limhy_comment_total_count($postId);
        $rootTotal = (int) db_value("SELECT COUNT(*) FROM `{$table}` " . $visibleWhere . " AND `parent_id` = 0", $baseParams);

        if (!limhy_comment_pagination_enabled()) {
            $perPage = max(1, $rootTotal === 0 ? 1 : $rootTotal);
            $page = 1;
        }

        $pager = paginate($rootTotal, $page, $perPage);
        $pager['total_comments'] = $totalComments;

        $rootOrder = limhy_comment_first_page_latest() ? 'DESC' : 'ASC';
        $rootParams = $baseParams;
        $rootSql = "SELECT * FROM `{$table}` " . $visibleWhere . " AND `parent_id` = 0 ORDER BY `is_featured` DESC, `created_at` {$rootOrder}, `id` {$rootOrder} LIMIT {$pager['per_page']} OFFSET {$pager['offset']}";
        $roots = db_rows($rootSql, $rootParams);
        if (!$roots) {
            return ['items' => [], 'pager' => $pager];
        }

        $rootIds = array_map(static fn(array $row): int => (int) $row['id'], $roots);
        $allRows = $roots;
        $queue = $rootIds;
        $seenIds = array_fill_keys($rootIds, true);

        while (!empty($queue)) {
            $childParams = $baseParams;
            $childPlaceholders = implode(',', array_fill(0, count($queue), '?'));
            foreach ($queue as $parentQueueId) {
                $childParams[] = (int)$parentQueueId;
            }

            $children = db_rows(
                "SELECT * FROM `{$table}` " . $visibleWhere . " AND `parent_id` IN ({$childPlaceholders}) ORDER BY `created_at` ASC, `id` ASC",
                $childParams
            );

            if (!$children) {
                break;
            }

            $queue = [];
            foreach ($children as $child) {
                $childId = (int)($child['id'] ?? 0);
                if ($childId <= 0 || isset($seenIds[$childId])) {
                    continue;
                }
                $seenIds[$childId] = true;
                $allRows[] = $child;
                $queue[] = $childId;
            }
        }

        return ['items' => $allRows, 'pager' => $pager];
    }
}

if (!function_exists('limhy_fetch_post_comments')) {
    function limhy_fetch_post_comments(int $postId): array
    {
        return limhy_comment_pagination_payload($postId, limhy_comment_page_param())['items'];
    }
}

if (!function_exists('limhy_public_author_name')) {
    function limhy_public_author_name(): string
    {
        $tblUsers = (function_exists('prefix') ? prefix() : 'lm_') . 'users';
        $adminData = function_exists('db_row') ? db_row("SELECT `screen_name`,`username` FROM `{$tblUsers}` WHERE `role`='admin' ORDER BY `id` ASC LIMIT 1") : null;
        $screen = trim((string)($adminData['screen_name'] ?? ''));
        if ($screen !== '') return $screen;
        $username = trim((string)($adminData['username'] ?? ''));
        if ($username !== '') return $username;
        if (defined('SITE_AUTHOR') && trim((string)SITE_AUTHOR) !== '') return trim((string)SITE_AUTHOR);
        if (defined('SITE_NAME') && trim((string)SITE_NAME) !== '') return trim((string)SITE_NAME);
        return 'Admin';
    }
}

if (!function_exists('limhy_post_password_matches')) {
    function limhy_post_password_matches(string $input, string $stored): bool
    {
        $input = trim($input);
        $stored = trim($stored);
        if ($input === '' || $stored === '') return false;
        if (preg_match('/^\$2y\$|^\$argon2/i', $stored)) return password_verify($input, $stored);
        return hash_equals($stored, $input);
    }
}

if (!function_exists('limhy_prepare_post_password_for_save')) {
    function limhy_prepare_post_password_for_save(string $incoming, string $existing = ''): string
    {
        $incoming = trim($incoming);
        $existing = trim($existing);
        if ($incoming === '') return '';
        if (preg_match('/^\$2y\$|^\$argon2/i', $incoming)) return $incoming;
        if ($existing !== '' && limhy_post_password_matches($incoming, $existing)) return $existing;
        return password_hash($incoming, PASSWORD_DEFAULT);
    }
}
