<?php
/**
 * LiMhy - 运行黑匣子
 * 
 * @package LiMhy
 * @author  Jason（QQ：895443171）
 * @desc    全面接管系统异常与致命错误，保障生产环境静默安全运行
 */

declare(strict_types=1);

class AlmightyLogger
{
    private static string $logFile = ROOT . '/data/crash.log';

    public static function init(): void
    {
        ini_set('display_errors', '0');
        error_reporting(E_ALL);
        set_exception_handler([self::class, 'handleException']);
        set_error_handler([self::class, 'handleError']);
        register_shutdown_function([self::class, 'handleFatalError']);
    }

    public static function handleException(\Throwable $e): void
    {
        self::record($e->getMessage(), $e->getFile(), $e->getLine(), $e->getTraceAsString());
        self::showFriendlyError();
    }

    public static function handleError(int $errno, string $errstr, string $errfile, int $errline): bool
    {
        if (!(error_reporting() & $errno)) return false;
        self::record("Error [$errno]: $errstr", $errfile, $errline, '');
        return true;
    }

    public static function handleFatalError(): void
    {
        $error = error_get_last();
        if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR], true)) {
            self::record("Fatal Error: {$error['message']}", $error['file'], $error['line'], '');
            self::showFriendlyError();
        }
    }

    private static function record(string $msg, string $file, int $line, string $trace): void
    {
        $safeFile = str_replace(ROOT, '', $file);
        $logEntry = "[" . date('Y-m-d H:i:s') . "] [IP: " . ($_SERVER['REMOTE_ADDR']??'0.0.0.0') . "]\n"
                  . "Msg: {$msg}\nLoc: {$safeFile} L{$line}\n"
                  . ($trace ? "Trace:\n{$trace}\n" : "") . str_repeat("-", 40) . "\n";
        @file_put_contents(self::$logFile, $logEntry, FILE_APPEND | LOCK_EX);
    }

    private static function showFriendlyError(): void
    {
        while (ob_get_level()) ob_end_clean();
        http_response_code(500);
        echo '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>系统维护中</title><style>body{font-family:sans-serif;background:#f8fafc;display:flex;align-items:center;justify-content:center;height:100vh;margin:0}.box{background:#fff;padding:40px;border-radius:12px;box-shadow:0 10px 25px rgba(0,0,0,0.05);text-align:center}</style></head><body><div class="box"><h1>节点发生波动</h1><p>系统已自动记录黑匣子数据，请稍后刷新。</p></div></body></html>';
        exit;
    }
}
AlmightyLogger::init();


/* =========================================
   访问日志：文件存储、筛选与画像绑定
   ========================================= */

function access_log_dir(): string
{
    return ROOT . '/data/access_logs';
}

function access_log_ensure_dirs(): void
{
    $base = access_log_dir();
    $dirs = [
        $base,
        $base . '/raw',
        $base . '/index',
        $base . '/index/ip',
        $base . '/index/guid',
        $base . '/cache',
    ];
    foreach ($dirs as $dir) {
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
    }
}

function access_log_retention_days(): int
{
    $days = (int) limhy_site_setting('ACCESS_LOG_RETENTION_DAYS', 7);
    if ($days < 1) { $days = 1; }
    if ($days > 365) { $days = 365; }
    return $days;
}

function access_log_raw_file(?int $ts = null): string
{
    $ts = $ts ?? time();
    return access_log_dir() . '/raw/' . date('Y-m-d', $ts) . '.ndjson';
}

function access_log_should_log_request(string $path, string $method): bool
{
    $path = strtolower(trim($path));
    if ($path === '') {
        $path = '/';
    }

    $skipExt = ['css','js','jpg','jpeg','png','gif','svg','webp','ico','woff','woff2','ttf','eot','map','mp4','mp3','wav','zip','rar','7z','sql','xml'];
    $ext = pathinfo(parse_url($path, PHP_URL_PATH) ?: $path, PATHINFO_EXTENSION);
    if ($ext !== '' && in_array(strtolower($ext), $skipExt, true)) {
        return false;
    }

    $skipPaths = [
        '/favicon.ico',
        '/robots.txt',
    ];
    if (in_array($path, $skipPaths, true)) {
        return false;
    }

    $skipPrefixes = [
        '/assets/',
        '/uploads/',
        '/themes/',
        '/plugins/',
        '/api/trace',
        '/api/captcha/image',
    ];
    foreach ($skipPrefixes as $prefix) {
        if (strpos($path, $prefix) === 0) {
            return false;
        }
    }

    return in_array(strtoupper($method), ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD'], true);
}

function access_log_mask_ip(string $ip): string
{
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV4)) {
        $parts = explode('.', $ip);
        return $parts[0] . '.' . $parts[1] . '.*.*';
    }
    if (filter_var($ip, FILTER_VALIDATE_IP, FILTER_FLAG_IPV6)) {
        $parts = explode(':', $ip);
        $parts = array_pad($parts, 8, '');
        return implode(':', array_slice($parts, 0, 3)) . ':*:*:*:*:*';
    }
    return '0.0.*.*';
}

function access_log_parse_user_agent(string $ua): array
{
    $ua = trim($ua);
    $device = 'Desktop';
    if (preg_match('/ipad|tablet/i', $ua)) {
        $device = 'Tablet';
    } elseif (preg_match('/mobile|iphone|android|ipod|windows phone/i', $ua)) {
        $device = 'Mobile';
    }

    $browser = 'Unknown';
    $browserVersion = '';
    $browserRules = [
        'Edge' => 'Edg\/([\d\.]+)',
        'Chrome' => 'Chrome\/([\d\.]+)',
        'Firefox' => 'Firefox\/([\d\.]+)',
        'Safari' => 'Version\/([\d\.]+).*Safari',
        'Opera' => 'OPR\/([\d\.]+)',
        'WeChat' => 'MicroMessenger\/([\d\.]+)',
        'QQBrowser' => 'QQBrowser\/([\d\.]+)',
    ];
    foreach ($browserRules as $name => $pattern) {
        if (preg_match('/' . $pattern . '/i', $ua, $m)) {
            $browser = $name;
            $browserVersion = $m[1] ?? '';
            break;
        }
    }

    $os = 'Unknown';
    $osVersion = '';
    $osRules = [
        'Windows' => 'Windows NT ([\d\.]+)',
        'Android' => 'Android ([\d\.]+)',
        'iOS' => 'OS ([\d_]+) like Mac OS X',
        'macOS' => 'Mac OS X ([\d_\.]+)',
        'Linux' => 'Linux',
    ];
    foreach ($osRules as $name => $pattern) {
        if (preg_match('/' . $pattern . '/i', $ua, $m)) {
            $os = $name;
            $osVersion = str_replace('_', '.', $m[1] ?? '');
            break;
        }
    }

    return [
        'device_type' => $device,
        'browser' => $browser,
        'browser_version' => $browserVersion,
        'os' => $os,
        'os_version' => $osVersion,
        'user_agent' => $ua,
    ];
}

function access_log_referer_meta(string $host): array
{
    $referer = trim((string)($_SERVER['HTTP_REFERER'] ?? ''));
    if ($referer === '') {
        return ['referer' => '', 'referer_host' => '', 'request_from' => 'direct'];
    }
    $refHost = (string)(parse_url($referer, PHP_URL_HOST) ?? '');
    $type = 'external';
    if ($refHost !== '' && $host !== '' && strcasecmp($refHost, $host) === 0) {
        $type = 'internal';
    }
    return ['referer' => $referer, 'referer_host' => $refHost, 'request_from' => $type];
}

function access_log_comment_identity_by_ip(string $ip): ?array
{
    if (!function_exists('db_row') || !function_exists('prefix')) {
        return null;
    }
    try {
        $p = prefix();
        $row = db_row("SELECT `author`, `email`, `url`, `created_at` FROM `{$p}comments` WHERE `ip` = ? ORDER BY `id` DESC LIMIT 1", [$ip]);
        if (!$row) {
            return null;
        }
        $author = trim((string)($row['author'] ?? '访客')) ?: '访客';
        $email = trim((string)($row['email'] ?? ''));
        $avatar = function_exists('get_avatar_url') ? get_avatar_url($email, $author) : '';
        return [
            'author_name' => $author,
            'comment_email' => $email,
            'comment_url' => trim((string)($row['url'] ?? '')),
            'avatar' => $avatar,
            'source_tag' => $email !== '' ? 'comment_email' : 'ip_comment',
            'latest_comment_time' => trim((string)($row['created_at'] ?? '')),
        ];
    } catch (\Throwable $e) {
        return null;
    }
}

function access_log_index_file(string $type, string $key): string
{
    return access_log_dir() . '/index/' . $type . '/' . md5($key) . '.json';
}

function access_log_read_index_identity(string $type, string $key): ?array
{
    if ($key === '') {
        return null;
    }
    $file = access_log_index_file($type, $key);
    if (!is_file($file)) {
        return null;
    }
    $data = json_decode((string)@file_get_contents($file), true);
    if (!is_array($data)) {
        return null;
    }
    return $data['identity'] ?? null;
}

function access_log_write_index(string $type, string $key, array $record, array $identity): void
{
    if ($key === '') {
        return;
    }
    $file = access_log_index_file($type, $key);
    $existing = [];
    if (is_file($file)) {
        $existing = json_decode((string)@file_get_contents($file), true);
        if (!is_array($existing)) {
            $existing = [];
        }
    }
    $recent = $existing['recent'] ?? [];
    if (!is_array($recent)) {
        $recent = [];
    }
    array_unshift($recent, [
        'time' => $record['time'] ?? '',
        'ts' => $record['ts'] ?? time(),
        'path' => $record['path'] ?? '/',
        'method' => $record['method'] ?? 'GET',
        'request_from' => $record['request_from'] ?? 'direct',
        'referer_host' => $record['referer_host'] ?? '',
    ]);
    $recent = array_slice($recent, 0, 20);
    $payload = [
        'key' => $key,
        'type' => $type,
        'count' => (int)($existing['count'] ?? 0) + 1,
        'last_seen' => $record['time'] ?? '',
        'last_seen_ts' => $record['ts'] ?? time(),
        'identity' => $identity,
        'recent' => $recent,
    ];
    @file_put_contents($file, json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT), LOCK_EX);
}

function access_log_resolve_identity(string $ip, string $guid): array
{
    $identity = [
        'author_name' => '访客',
        'comment_email' => '',
        'comment_url' => '',
        'avatar' => '',
        'source_tag' => 'anonymous',
    ];

    if ($guid !== '') {
        $fromGuid = access_log_read_index_identity('guid', $guid);
        if (is_array($fromGuid) && !empty($fromGuid['avatar'])) {
            return array_merge($identity, $fromGuid, ['source_tag' => 'guid']);
        }
    }

    $fromComment = access_log_comment_identity_by_ip($ip);
    if (is_array($fromComment)) {
        return array_merge($identity, $fromComment);
    }

    $fromIp = access_log_read_index_identity('ip', $ip);
    if (is_array($fromIp) && !empty($fromIp['avatar'])) {
        return array_merge($identity, $fromIp, ['source_tag' => 'ip_cached']);
    }

    return $identity;
}

function access_log_cleanup(): void
{
    access_log_ensure_dirs();
    $base = access_log_dir();
    $retainBefore = time() - (access_log_retention_days() * 86400);
    foreach (glob($base . '/raw/*.ndjson') ?: [] as $file) {
        if (@filemtime($file) !== false && @filemtime($file) < $retainBefore) {
            @unlink($file);
        }
    }
    foreach (['ip', 'guid'] as $type) {
        foreach (glob($base . '/index/' . $type . '/*.json') ?: [] as $file) {
            $data = json_decode((string)@file_get_contents($file), true);
            $lastSeen = (int)($data['last_seen_ts'] ?? 0);
            if ($lastSeen > 0 && $lastSeen < $retainBefore) {
                @unlink($file);
            }
        }
    }
    foreach (glob($base . '/cache/*') ?: [] as $file) {
        if (!is_file($file)) {
            continue;
        }
        $mtime = @filemtime($file);
        if ($mtime !== false && $mtime < $retainBefore) {
            @unlink($file);
        }
    }
}

function access_log_record(array $routeMeta = []): void
{
    access_log_ensure_dirs();
    $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
    $path = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_PATH);
    $query = (string)parse_url((string)($_SERVER['REQUEST_URI'] ?? '/'), PHP_URL_QUERY);
    if (!access_log_should_log_request($path, $method)) {
        return;
    }

    if (mt_rand(1, 25) === 1) {
        access_log_cleanup();
    }

    $host = trim((string)($_SERVER['HTTP_HOST'] ?? ''));
    $scheme = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') ? 'https' : 'http';
    $ip = function_exists('client_ip') ? client_ip() : trim((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));
    $guid = trim((string)($_COOKIE['lm_guid'] ?? ''));
    $uaMeta = access_log_parse_user_agent((string)($_SERVER['HTTP_USER_AGENT'] ?? ''));
    $refererMeta = access_log_referer_meta($host);
    $identity = access_log_resolve_identity($ip, $guid);
    $ts = time();
    $time = date('Y-m-d H:i:s', $ts);
    $routeType = trim((string)($routeMeta['route_type'] ?? 'unknown')) ?: 'unknown';
    $fullUrl = $scheme . '://' . $host . $path . ($query !== '' ? '?' . $query : '');

    $record = [
        'id' => date('Ymd_His', $ts) . '_' . substr(md5($ip . '|' . $path . '|' . microtime(true)), 0, 12),
        'time' => $time,
        'ts' => $ts,
        'ip' => $ip,
        'ip_masked' => access_log_mask_ip($ip),
        'guid' => $guid,
        'method' => $method,
        'scheme' => $scheme,
        'host' => $host,
        'path' => $path,
        'query' => $query,
        'full_url' => $fullUrl,
        'route_type' => $routeType,
        'referer' => $refererMeta['referer'],
        'referer_host' => $refererMeta['referer_host'],
        'request_from' => $refererMeta['request_from'],
        'avatar' => $identity['avatar'] ?? '',
        'author_name' => $identity['author_name'] ?? '访客',
        'comment_email' => $identity['comment_email'] ?? '',
        'comment_url' => $identity['comment_url'] ?? '',
        'source_tag' => $identity['source_tag'] ?? 'anonymous',
        'screen' => trim((string)($_COOKIE['lm_screen'] ?? '')),
        'status_hint' => 'ok',
    ] + $uaMeta;

    $line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($line === false) {
        return;
    }
    @file_put_contents(access_log_raw_file($ts), $line . PHP_EOL, FILE_APPEND | LOCK_EX);
    access_log_write_index('ip', $ip, $record, $identity);
    if ($guid !== '') {
        access_log_write_index('guid', $guid, $record, $identity);
    }
}

function access_log_collect(array $filters = []): array
{
    access_log_ensure_dirs();
    access_log_cleanup();
    $files = glob(access_log_dir() . '/raw/*.ndjson') ?: [];
    rsort($files);
    $items = [];

    $keywordIp = trim((string)($filters['ip'] ?? ''));
    $keywordGuid = trim((string)($filters['guid'] ?? ''));
    $keywordPath = trim((string)($filters['path'] ?? ''));
    $method = strtoupper(trim((string)($filters['method'] ?? '')));
    $source = trim((string)($filters['source'] ?? ''));
    $start = trim((string)($filters['start_date'] ?? ''));
    $end = trim((string)($filters['end_date'] ?? ''));

    $startTs = $start !== '' ? strtotime($start . ' 00:00:00') : 0;
    $endTs = $end !== '' ? strtotime($end . ' 23:59:59') : PHP_INT_MAX;

    foreach ($files as $file) {
        $handle = @fopen($file, 'rb');
        if (!$handle) {
            continue;
        }
        while (($line = fgets($handle)) !== false) {
            $line = trim($line);
            if ($line === '') {
                continue;
            }
            $row = json_decode($line, true);
            if (!is_array($row)) {
                continue;
            }
            $ts = (int)($row['ts'] ?? 0);
            if ($ts < $startTs || $ts > $endTs) {
                continue;
            }
            if ($keywordIp !== '' && stripos((string)($row['ip'] ?? ''), $keywordIp) === false) {
                continue;
            }
            if ($keywordGuid !== '' && stripos((string)($row['guid'] ?? ''), $keywordGuid) === false) {
                continue;
            }
            if ($keywordPath !== '' && stripos((string)($row['path'] ?? ''), $keywordPath) === false && stripos((string)($row['full_url'] ?? ''), $keywordPath) === false) {
                continue;
            }
            if ($method !== '' && strtoupper((string)($row['method'] ?? '')) !== $method) {
                continue;
            }
            if ($source !== '' && (string)($row['request_from'] ?? '') !== $source) {
                continue;
            }
            $items[] = $row;
        }
        fclose($handle);
    }

    usort($items, function (array $a, array $b): int {
        return (int)($b['ts'] ?? 0) <=> (int)($a['ts'] ?? 0);
    });
    return $items;
}

function access_log_paginate(array $filters, int $page = 1, int $perPage = 20): array
{
    $all = access_log_collect($filters);
    $total = count($all);
    $page = max(1, $page);
    $perPage = max(10, min(100, $perPage));
    $totalPages = max(1, (int)ceil($total / $perPage));
    if ($page > $totalPages) {
        $page = $totalPages;
    }
    $offset = ($page - 1) * $perPage;
    return [
        'items' => array_slice($all, $offset, $perPage),
        'total' => $total,
        'page' => $page,
        'per_page' => $perPage,
        'total_pages' => $totalPages,
    ];
}

function access_log_summary(array $filters = []): array
{
    $items = access_log_collect($filters);
    $today = date('Y-m-d');
    $todayCount = 0;
    $ips = [];
    $todayIps = [];
    $guids = [];
    $external = 0;
    foreach ($items as $row) {
        $time = (string)($row['time'] ?? '');
        $ip = (string)($row['ip'] ?? '');
        if (strpos($time, $today) === 0) {
            $todayCount++;
            if ($ip !== '') {
                $todayIps[$ip] = true;
            }
        }
        if ($ip !== '') {
            $ips[$ip] = true;
        }
        $guid = (string)($row['guid'] ?? '');
        if ($guid !== '') {
            $guids[$guid] = true;
        }
        if (($row['request_from'] ?? '') === 'external') {
            $external++;
        }
    }
    return [
        'today_requests' => $todayCount,
        'today_unique_ips' => count($todayIps),
        'unique_ips' => count($ips),
        'unique_guids' => count($guids),
        'external_requests' => $external,
    ];
}

function access_log_export_csv(array $filters = []): void
{
    $items = access_log_collect($filters);
    header('Content-Type: text/csv; charset=utf-8');
    header('Content-Disposition: attachment; filename="limhy_access_logs_' . date('Ymd_His') . '.csv"');
    $out = fopen('php://output', 'w');
    fputcsv($out, ['时间', 'IP', 'GUID', '方法', '路径', '完整URL', '来源类型', '来源域', '设备', '浏览器', '系统', '关联身份', '评论邮箱']);
    foreach ($items as $row) {
        fputcsv($out, [
            $row['time'] ?? '',
            $row['ip'] ?? '',
            $row['guid'] ?? '',
            $row['method'] ?? '',
            $row['path'] ?? '',
            $row['full_url'] ?? '',
            $row['request_from'] ?? '',
            $row['referer_host'] ?? '',
            $row['device_type'] ?? '',
            trim(($row['browser'] ?? '') . ' ' . ($row['browser_version'] ?? '')),
            trim(($row['os'] ?? '') . ' ' . ($row['os_version'] ?? '')),
            $row['author_name'] ?? '',
            $row['comment_email'] ?? '',
        ]);
    }
    fclose($out);
    exit;
}


function f12_probe_log_file(): string
{
    $dir = ROOT . '/data/firewall';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir . '/trace.log';
}

function f12_probe_record(array $payload): void
{
    $ip = function_exists('client_ip') ? client_ip() : trim((string)($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0'));
    $guid = preg_replace('/[^a-zA-Z0-9\-]/', '', (string)($payload['guid'] ?? ''));
    $url = trim((string)($payload['url'] ?? ''));
    $path = trim((string)($payload['path'] ?? ''));
    if ($path === '' && $url !== '') {
        $path = (string)(parse_url($url, PHP_URL_PATH) ?: '');
    }
    $reason = trim((string)($payload['reason'] ?? ''));
    $screen = substr(trim((string)($payload['screen'] ?? '')), 0, 40);
    $title = mb_substr(trim((string)($payload['title'] ?? '')), 0, 120);
    $trail = [];
    foreach ((array)($payload['trail'] ?? []) as $item) {
        $item = preg_replace('/[ -]/u', '', (string)$item);
        $item = trim(mb_substr($item, 0, 120));
        if ($item !== '') {
            $trail[] = $item;
        }
    }
    $trail = array_slice($trail, -10);
    if ($reason === '') {
        return;
    }

    $identity = access_log_resolve_identity($ip, $guid);
    $uaMeta = access_log_parse_user_agent((string)($_SERVER['HTTP_USER_AGENT'] ?? ''));
    $now = time();
    $record = [
        'id' => date('Ymd_His', $now) . '_' . substr(md5($ip . '|' . $guid . '|' . $reason . '|' . microtime(true)), 0, 12),
        'time' => date('Y-m-d H:i:s', $now),
        'ts' => $now,
        'ip' => $ip,
        'guid' => $guid,
        'url' => $url,
        'path' => $path,
        'screen' => $screen,
        'reason' => $reason,
        'title' => $title,
        'trail' => $trail,
        'author_name' => $identity['author_name'] ?? '访客',
        'comment_email' => $identity['comment_email'] ?? '',
        'avatar' => $identity['avatar'] ?? '',
        'source_tag' => $identity['source_tag'] ?? 'anonymous',
    ] + $uaMeta;

    $file = f12_probe_log_file();
    $recent = [];
    if (is_file($file)) {
        $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        $recent = array_slice($lines, -80);
    }
    foreach (array_reverse($recent) as $line) {
        $row = json_decode((string)$line, true);
        if (!is_array($row)) {
            continue;
        }
        if (($now - (int)($row['ts'] ?? 0)) > 600) {
            break;
        }
        if (($row['ip'] ?? '') === $ip
            && ($row['guid'] ?? '') === $guid
            && ($row['reason'] ?? '') === $reason
            && (($row['path'] ?? '') === $path || ($row['url'] ?? '') === $url)) {
            return;
        }
    }

    $line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($line !== false) {
        @file_put_contents($file, $line . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function f12_probe_collect(array $filters = []): array
{
    $file = f12_probe_log_file();
    if (!is_file($file)) {
        return [];
    }
    $items = [];
    $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    $startTs = !empty($filters['start_date']) ? strtotime((string)$filters['start_date'] . ' 00:00:00') : null;
    $endTs = !empty($filters['end_date']) ? strtotime((string)$filters['end_date'] . ' 23:59:59') : null;
    foreach (array_reverse($lines) as $line) {
        $row = json_decode((string)$line, true);
        if (!is_array($row)) {
            continue;
        }
        $ip = (string)($row['ip'] ?? '');
        $guid = (string)($row['guid'] ?? '');
        $path = (string)($row['path'] ?? '');
        $reason = (string)($row['reason'] ?? '');
        $ts = (int)($row['ts'] ?? strtotime((string)($row['time'] ?? 'now')));
        if (!empty($filters['ip']) && stripos($ip, (string)$filters['ip']) === false) {
            continue;
        }
        if (!empty($filters['guid']) && stripos($guid, (string)$filters['guid']) === false) {
            continue;
        }
        if (!empty($filters['path']) && stripos($path . ' ' . (string)($row['url'] ?? ''), (string)$filters['path']) === false) {
            continue;
        }
        if (!empty($filters['probe_reason']) && stripos($reason, (string)$filters['probe_reason']) === false) {
            continue;
        }
        if ($startTs && $ts < $startTs) {
            continue;
        }
        if ($endTs && $ts > $endTs) {
            continue;
        }
        $row['ts'] = $ts;
        $items[] = $row;
    }
    return $items;
}

function f12_probe_summary(array $filters = []): array
{
    $items = f12_probe_collect($filters);
    $today = date('Y-m-d');
    $todayHits = 0;
    $ips = [];
    $guids = [];
    foreach ($items as $row) {
        if (strpos((string)($row['time'] ?? ''), $today) === 0) {
            $todayHits++;
        }
        if (!empty($row['ip'])) {
            $ips[(string)$row['ip']] = true;
        }
        if (!empty($row['guid'])) {
            $guids[(string)$row['guid']] = true;
        }
    }
    return [
        'today_hits' => $todayHits,
        'total_hits' => count($items),
        'unique_ips' => count($ips),
        'unique_guids' => count($guids),
    ];
}



function reputation_reset_marker_file(string $ip): string
{
    $dir = ROOT . '/data/firewall/reset_markers';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir . '/' . md5($ip) . '.php';
}

function reputation_get_reset_ts(string $ip): int
{
    $file = reputation_reset_marker_file($ip);
    if (!is_file($file)) {
        return 0;
    }
    $data = @include $file;
    if (!is_array($data)) {
        return 0;
    }
    return max(0, (int)($data['ts'] ?? 0));
}

function reputation_set_reset_ts(string $ip, int $ts): void
{
    $ts = max(0, $ts);
    $file = reputation_reset_marker_file($ip);
    @file_put_contents($file, '<?php return ' . var_export(['ip' => $ip, 'ts' => $ts], true) . ';', LOCK_EX);
}

function reputation_event_log_file(): string
{
    $dir = ROOT . '/data/firewall';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir . '/reputation_events.log';
}

function reputation_record_event(string $entityType, string $entityKey, string $eventCode, int $scoreDelta, array $evidence = []): void
{
    $entityType = trim($entityType);
    $entityKey = trim($entityKey);
    $eventCode = trim($eventCode);
    if ($entityType === '' || $entityKey === '' || $eventCode === '') {
        return;
    }

    $record = [
        'id' => date('Ymd_His') . '_' . substr(md5($entityType . '|' . $entityKey . '|' . $eventCode . '|' . microtime(true)), 0, 12),
        'time' => date('Y-m-d H:i:s'),
        'ts' => time(),
        'entity_type' => $entityType,
        'entity_key' => $entityKey,
        'event_code' => $eventCode,
        'score_delta' => $scoreDelta,
        'evidence' => $evidence,
    ];
    $line = json_encode($record, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($line !== false) {
        @file_put_contents(reputation_event_log_file(), $line . PHP_EOL, FILE_APPEND | LOCK_EX);
    }
}

function reputation_collect_events(array $filters = []): array
{
    $file = reputation_event_log_file();
    if (!is_file($file)) {
        return [];
    }
    $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    $items = [];
    $entityType = trim((string)($filters['entity_type'] ?? ''));
    $entityKey = trim((string)($filters['entity_key'] ?? ''));
    $eventCode = trim((string)($filters['event_code'] ?? ''));
    $startTs = !empty($filters['start_date']) ? strtotime((string)$filters['start_date'] . ' 00:00:00') : null;
    $endTs = !empty($filters['end_date']) ? strtotime((string)$filters['end_date'] . ' 23:59:59') : null;
    foreach (array_reverse($lines) as $line) {
        $row = json_decode((string)$line, true);
        if (!is_array($row)) {
            continue;
        }
        $ts = (int)($row['ts'] ?? 0);
        if ($startTs && $ts < $startTs) {
            continue;
        }
        if ($endTs && $ts > $endTs) {
            continue;
        }
        if ($entityType !== '' && (string)($row['entity_type'] ?? '') !== $entityType) {
            continue;
        }
        if ($entityKey !== '' && stripos((string)($row['entity_key'] ?? ''), $entityKey) === false) {
            continue;
        }
        if ($eventCode !== '' && stripos((string)($row['event_code'] ?? ''), $eventCode) === false) {
            continue;
        }
        $items[] = $row;
    }
    return $items;
}


function reputation_rewrite_events_without_ip(string $ip): void
{
    $file = reputation_event_log_file();
    if (!is_file($file)) {
        return;
    }
    $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    $kept = [];
    foreach ($lines as $line) {
        $row = json_decode((string)$line, true);
        $hit = false;
        if (is_array($row)) {
            if ((string)($row['entity_type'] ?? '') === 'ip' && (string)($row['entity_key'] ?? '') === $ip) {
                $hit = true;
            }
            $evidence = is_array($row['evidence'] ?? null) ? $row['evidence'] : [];
            if ((string)($evidence['ip'] ?? '') === $ip) {
                $hit = true;
            }
        }
        if (!$hit) {
            $kept[] = rtrim((string)$line, "
");
        }
    }
    @file_put_contents($file, $kept ? implode(PHP_EOL, $kept) . PHP_EOL : '', LOCK_EX);
}

function reputation_network_meta(string $ip): array
{
    $safe = trim($ip);
    if ($safe === '' || !filter_var($safe, FILTER_VALIDATE_IP)) {
        return ['asn' => '', 'org' => '', 'country' => '', 'hosting' => false, 'proxy' => false, 'mobile' => false, 'network_risk_score' => 0];
    }

    if ($safe === '127.0.0.1' || $safe === '::1' || strpos($safe, '192.168.') === 0 || strpos($safe, '10.') === 0) {
        return ['asn' => 'LOCAL', 'org' => 'Local Network', 'country' => 'LOCAL', 'hosting' => false, 'proxy' => false, 'mobile' => false, 'network_risk_score' => 0];
    }

    $dir = ROOT . '/data/firewall';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    $file = $dir . '/asn_' . md5($safe) . '.php';
    if (is_file($file)) {
        $cached = @include $file;
        if (is_array($cached) && (int)($cached['exp'] ?? 0) > time()) {
            return (array)($cached['val'] ?? []);
        }
    }

    $meta = ['asn' => '', 'org' => '', 'country' => '', 'hosting' => false, 'proxy' => false, 'mobile' => false, 'network_risk_score' => 0];
    $ctx = stream_context_create(['http' => ['timeout' => 1.2]]);
    $fields = 'status,countryCode,as,org,hosting,proxy,mobile';
    $res = @file_get_contents('http://ip-api.com/json/' . rawurlencode($safe) . '?fields=' . $fields, false, $ctx);
    if ($res) {
        $json = json_decode($res, true);
        if (is_array($json) && ($json['status'] ?? '') === 'success') {
            $org = trim((string)($json['org'] ?? ''));
            $as = trim((string)($json['as'] ?? ''));
            $hosting = !empty($json['hosting']);
            $proxy = !empty($json['proxy']);
            $mobile = !empty($json['mobile']);
            $score = 0;
            if ($hosting) { $score += 6; }
            if ($proxy) { $score += 6; }
            if ($mobile) { $score += 2; }
            $orgProbe = strtolower($org . ' ' . $as);
            foreach (['cloud', 'vps', 'digitalocean', 'linode', 'aws', 'amazon', 'azure', 'tencent', 'alibaba', 'oracle'] as $keyword) {
                if ($keyword !== '' && strpos($orgProbe, $keyword) !== false) {
                    $score = max($score, 6);
                    break;
                }
            }
            $meta = [
                'asn' => $as,
                'org' => $org,
                'country' => strtoupper((string)($json['countryCode'] ?? '')),
                'hosting' => $hosting,
                'proxy' => $proxy,
                'mobile' => $mobile,
                'network_risk_score' => min(12, $score),
            ];
        }
    }

    @file_put_contents($file, '<?php return ' . var_export(['exp' => time() + 86400 * 7, 'val' => $meta], true) . ';', LOCK_EX);
    return $meta;
}

function reputation_sensitive_path_score(string $path): array
{
    $path = strtolower(trim($path));
    if ($path === '') {
        return ['score' => 0, 'hit' => false, 'label' => ''];
    }
    $map = [
        'wp-login' => 5,
        'phpmyadmin' => 8,
        '.env' => 8,
        'vendor/' => 4,
        'eval-stdin.php' => 8,
        '.git' => 6,
        'install.php' => 2,
        'admin' => 1,
        'xmlrpc.php' => 5,
        'shell' => 6,
        'composer' => 4,
    ];
    foreach ($map as $needle => $score) {
        if (strpos($path, $needle) !== false) {
            return ['score' => $score, 'hit' => true, 'label' => $needle];
        }
    }
    return ['score' => 0, 'hit' => false, 'label' => ''];
}

function reputation_ua_score(string $ua): array
{
    $ua = trim($ua);
    if ($ua === '') {
        return ['score' => 6, 'reason' => 'ua_missing'];
    }
    $probe = strtolower($ua);
    foreach (['curl', 'wget', 'python', 'scrapy', 'headless', 'go-http-client', 'okhttp', 'java/', 'libwww', 'postmanruntime', 'node-fetch'] as $keyword) {
        if (strpos($probe, $keyword) !== false) {
            return ['score' => 6, 'reason' => 'ua_script_like'];
        }
    }
    if (strlen($ua) < 20) {
        return ['score' => 3, 'reason' => 'ua_too_short'];
    }
    return ['score' => 0, 'reason' => ''];
}

function reputation_risk_level(int $score): string
{
    if ($score >= 35) {
        return 'ban';
    }
    if ($score >= 24) {
        return 'restrict';
    }
    if ($score >= 14) {
        return 'challenge';
    }
    if ($score >= 6) {
        return 'observe';
    }
    return 'safe';
}


function reputation_rewrite_ndjson_without_ip(string $pattern, string $ip): void
{
    $files = glob($pattern) ?: [];
    foreach ($files as $file) {
        if (!is_file($file)) {
            continue;
        }
        $lines = @file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        $kept = [];
        foreach ($lines as $line) {
            $row = json_decode((string)$line, true);
            if (!is_array($row) || (string)($row['ip'] ?? '') !== $ip) {
                $kept[] = rtrim((string)$line, "
");
            }
        }
        $payload = $kept ? implode(PHP_EOL, $kept) . PHP_EOL : '';
        @file_put_contents($file, $payload, LOCK_EX);
    }
}

function reputation_reset_ip_score(string $ip): bool
{
    $ip = trim($ip);
    if ($ip === '' || !filter_var($ip, FILTER_VALIDATE_IP)) {
        return false;
    }
    if (class_exists('Firewall') && method_exists('Firewall', 'resetIpReputation')) {
        Firewall::resetIpReputation($ip);
    }
    reputation_set_reset_ts($ip, time());
    reputation_rewrite_events_without_ip($ip);
    if (function_exists('reputation_record_event')) {
        reputation_record_event('ip', $ip, 'manual_score_reset', 0, ['ip' => $ip, 'reason_text' => '人工信誉分清零']);
    }
    return true;
}

function reputation_clear_ip_history(string $ip): bool
{
    $ip = trim($ip);
    if ($ip === '' || !filter_var($ip, FILTER_VALIDATE_IP)) {
        return false;
    }
    reputation_rewrite_ndjson_without_ip(access_log_dir() . '/raw/*.ndjson', $ip);
    reputation_set_reset_ts($ip, 0);
    $traceFile = f12_probe_log_file();
    if (is_file($traceFile)) {
        $lines = @file($traceFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
        $kept = [];
        foreach ($lines as $line) {
            $row = json_decode((string)$line, true);
            if (!is_array($row) || (string)($row['ip'] ?? '') !== $ip) {
                $kept[] = rtrim((string)$line, "
");
            }
        }
        @file_put_contents($traceFile, $kept ? implode(PHP_EOL, $kept) . PHP_EOL : '', LOCK_EX);
    }
    reputation_rewrite_events_without_ip($ip);
    if (class_exists('Firewall') && method_exists('Firewall', 'clearIpRuntimeHistory')) {
        Firewall::clearIpRuntimeHistory($ip);
    }
    if (function_exists('reputation_record_event')) {
        reputation_record_event('ip', $ip, 'manual_history_clear', 0, ['ip' => $ip, 'reason_text' => '人工清除 IP 历史记录']);
    }
    return true;
}

function reputation_profile_for_ip(string $ip, array $accessRows = [], array $probeRows = []): array
{
    $ip = trim($ip);
    if ($ip === '') {
        return [
            'ip' => '', 'last_seen' => '', 'last_seen_ts' => 0,
            'request_count' => 0, 'unique_paths' => 0, 'unique_guids' => 0,
            'identity_count' => 0, 'peak_minute' => 0, 'f12_hits' => 0,
            'sample_guid' => '', 'sample_ua' => '', 'components' => [
                'payload' => 0, 'ip_history' => 0, 'behavior' => 0,
                'frequency' => 0, 'ua' => 0, 'device' => 0, 'asn' => 0,
            ],
            'events' => [], 'network' => reputation_network_meta(''),
            'total_score' => 0, 'risk_level' => 'safe',
        ];
    }

    if (!$accessRows) {
        $accessRows = access_log_collect(['ip' => $ip]);
    }
    if (!$probeRows) {
        $probeRows = f12_probe_collect(['ip' => $ip]);
    }

    $resetTs = reputation_get_reset_ts($ip);
    $accessRows = array_values(array_filter($accessRows, static function(array $row) use ($ip, $resetTs): bool {
        if ((string)($row['ip'] ?? '') !== $ip) {
            return false;
        }
        $ts = (int)($row['ts'] ?? 0);
        return $resetTs <= 0 || $ts <= 0 || $ts >= $resetTs;
    }));
    $probeRows = array_values(array_filter($probeRows, static function(array $row) use ($ip, $resetTs): bool {
        if ((string)($row['ip'] ?? '') !== $ip) {
            return false;
        }
        $ts = (int)($row['ts'] ?? 0);
        return $resetTs <= 0 || $ts <= 0 || $ts >= $resetTs;
    }));

    $requestCount = count($accessRows);
    $uniquePaths = [];
    $uniqueGuids = [];
    $identities = [];
    $uaReasons = [];
    $sensitiveHits = [];
    $minuteBuckets = [];
    $lastSeenTs = 0;
    $lastSeen = '';
    $sampleGuid = '';
    $sampleUa = '';
    foreach ($accessRows as $row) {
        $path = (string)($row['path'] ?? '/');
        $uniquePaths[$path] = true;
        $guid = (string)($row['guid'] ?? '');
        if ($guid !== '') {
            $uniqueGuids[$guid] = true;
            if ($sampleGuid === '') { $sampleGuid = $guid; }
        }
        $email = strtolower(trim((string)($row['comment_email'] ?? '')));
        if ($email !== '') {
            $identities[$email] = true;
        }
        $ua = (string)($row['user_agent'] ?? '');
        if ($sampleUa === '' && $ua !== '') { $sampleUa = $ua; }
        $uaMeta = reputation_ua_score($ua);
        if ($uaMeta['score'] > 0) {
            $uaReasons[$uaMeta['reason']] = true;
        }
        $pathMeta = reputation_sensitive_path_score($path);
        if (!empty($pathMeta['hit'])) {
            $sensitiveHits[$pathMeta['label']] = true;
        }
        $ts = (int)($row['ts'] ?? 0);
        if ($ts > 0) {
            $bucket = date('Y-m-d H:i', $ts);
            $minuteBuckets[$bucket] = ($minuteBuckets[$bucket] ?? 0) + 1;
            if ($ts > $lastSeenTs) {
                $lastSeenTs = $ts;
                $lastSeen = (string)($row['time'] ?? '');
            }
        }
    }

    $peakMinute = $minuteBuckets ? max($minuteBuckets) : 0;
    $payloadScore = 0;
    $payloadEvidence = [];
    if (class_exists('Firewall')) {
        $baseScore = (int)(Firewall::getBasePayloadScore($ip));
        $payloadScore = max($payloadScore, min(40, $baseScore));
        $payloadEvidence = Firewall::getRecentPayloadEvidence($ip);
    }

    $ipHistoryScore = 0;
    $ipHistoryReasons = [];
    if (count($identities) >= 2) {
        $ipHistoryScore += 4;
        $ipHistoryReasons[] = 'same_ip_multi_identities';
    }
    if (class_exists('Firewall') && Firewall::isIpCurrentlyBanned($ip)) {
        $ipHistoryScore += 10;
        $ipHistoryReasons[] = 'currently_banned';
    }

    $behaviorScore = min(20, count($sensitiveHits) * 4 + (count($sensitiveHits) >= 3 ? 6 : 0));
    $frequencyScore = 0;
    if ($peakMinute >= 40) { $frequencyScore = 12; }
    elseif ($peakMinute >= 20) { $frequencyScore = 8; }
    elseif ($peakMinute >= 10) { $frequencyScore = 4; }
    elseif ($peakMinute >= 5) { $frequencyScore = 2; }

    $uaScore = 0;
    if ($uaReasons) {
        $uaScore = min(8, count($uaReasons) * 4);
    }

    $deviceScore = 0;
    if (count($uniqueGuids) >= 2) { $deviceScore += 4; }
    $deviceScore += min(8, count($probeRows) * 2);
    if ($sampleGuid !== '' && class_exists('Firewall') && Firewall::isGuidBanned($sampleGuid)) {
        $deviceScore += 8;
    }

    $networkMeta = reputation_network_meta($ip);
    $asnScore = (int)($networkMeta['network_risk_score'] ?? 0);

    $total = $payloadScore + $ipHistoryScore + $behaviorScore + $frequencyScore + $uaScore + $deviceScore + $asnScore;
    $events = [
        ['code' => 'payload', 'score' => $payloadScore, 'evidence' => $payloadEvidence],
        ['code' => 'ip_history', 'score' => $ipHistoryScore, 'evidence' => $ipHistoryReasons],
        ['code' => 'behavior_path', 'score' => $behaviorScore, 'evidence' => array_keys($sensitiveHits)],
        ['code' => 'request_frequency', 'score' => $frequencyScore, 'evidence' => ['peak_minute' => $peakMinute]],
        ['code' => 'ua_anomaly', 'score' => $uaScore, 'evidence' => array_keys($uaReasons)],
        ['code' => 'device_probe', 'score' => $deviceScore, 'evidence' => ['unique_guids' => count($uniqueGuids), 'f12_hits' => count($probeRows)]],
        ['code' => 'asn_reputation', 'score' => $asnScore, 'evidence' => $networkMeta],
    ];

    return [
        'ip' => $ip,
        'last_seen' => $lastSeen,
        'last_seen_ts' => $lastSeenTs,
        'request_count' => $requestCount,
        'unique_paths' => count($uniquePaths),
        'unique_guids' => count($uniqueGuids),
        'identity_count' => count($identities),
        'peak_minute' => $peakMinute,
        'f12_hits' => count($probeRows),
        'sample_guid' => $sampleGuid,
        'sample_ua' => $sampleUa,
        'components' => [
            'payload' => $payloadScore,
            'ip_history' => $ipHistoryScore,
            'behavior' => $behaviorScore,
            'frequency' => $frequencyScore,
            'ua' => $uaScore,
            'device' => $deviceScore,
            'asn' => $asnScore,
        ],
        'events' => $events,
        'network' => $networkMeta,
        'total_score' => $total,
        'risk_level' => reputation_risk_level($total),
    ];
}

function reputation_collect_profiles(array $filters = []): array
{
    $allFilters = $filters;
    if (empty($allFilters['start_date']) && empty($allFilters['end_date'])) {
        $allFilters['start_date'] = date('Y-m-d', time() - 86400 * 7);
        $allFilters['end_date'] = date('Y-m-d');
    }
    $accessRows = access_log_collect($allFilters);
    $probeRows = f12_probe_collect($allFilters);
    $ips = [];
    foreach ($accessRows as $row) {
        $ip = trim((string)($row['ip'] ?? ''));
        if ($ip !== '') {
            $ips[$ip] = true;
        }
    }
    foreach ($probeRows as $row) {
        $ip = trim((string)($row['ip'] ?? ''));
        if ($ip !== '') {
            $ips[$ip] = true;
        }
    }
    $profiles = [];
    foreach (array_keys($ips) as $ip) {
        $profile = reputation_profile_for_ip($ip, $accessRows, $probeRows);
        if (!empty($filters['guid']) && stripos((string)$profile['sample_guid'], (string)$filters['guid']) === false) {
            continue;
        }
        if (!empty($filters['level']) && (string)$profile['risk_level'] !== (string)$filters['level']) {
            continue;
        }
        $profiles[] = $profile;
    }
    usort($profiles, static function(array $a, array $b): int {
        return $b['total_score'] <=> $a['total_score'] ?: ($b['last_seen_ts'] <=> $a['last_seen_ts']);
    });
    return $profiles;
}

function reputation_reason_catalog(): array
{
    return [
        'payload' => '载荷信誉异常',
        'ip_history' => 'IP 历史异常',
        'behavior_path' => '行为路径异常',
        'request_frequency' => '请求频率异常',
        'ua_anomaly' => 'UA 异常',
        'device_probe' => '设备 / F12 探针异常',
        'asn_reputation' => 'ASN / 网络信誉异常',
        'waf_sqli' => '命中 SQL 注入特征',
        'waf_rce' => '命中代码执行特征',
        'waf_xss' => '命中 XSS 特征',
        'waf_path_probe' => '命中目录探测特征',
    ];
}

function reputation_level_label(string $level): string
{
    $map = ['safe' => '安全', 'observe' => '观察', 'challenge' => '挑战', 'restrict' => '限制', 'ban' => '封禁'];
    return $map[$level] ?? $level;
}

function reputation_reason_text(string $code): string
{
    $map = reputation_reason_catalog();
    return $map[$code] ?? $code;
}

function reputation_profile_decision(array $profile, array $config = []): array
{
    $total = (int)($profile['total_score'] ?? 0);
    $challenge = max(1, (int)($config['decision_challenge_score'] ?? 14));
    $restrict = max($challenge + 1, (int)($config['decision_restrict_score'] ?? 24));
    $ban = max($restrict + 1, (int)($config['decision_ban_score'] ?? 35));
    $minutes = max(10, (int)($config['decision_ban_minutes'] ?? 60));

    $level = 'safe';
    $ttlMinutes = 0;
    if ($total >= $ban) {
        $level = 'ban';
        $ttlMinutes = $minutes;
    } elseif ($total >= $restrict) {
        $level = 'restrict';
        $ttlMinutes = 30;
    } elseif ($total >= $challenge) {
        $level = 'challenge';
        $ttlMinutes = 10;
    } elseif ($total >= 6) {
        $level = 'observe';
        $ttlMinutes = 5;
    }

    $components = (array)($profile['components'] ?? []);
    arsort($components);
    $topReasons = [];
    foreach ($components as $code => $score) {
        if ((int)$score <= 0) {
            continue;
        }
        $reasonCode = match($code) {
            'payload' => 'payload',
            'ip_history' => 'ip_history',
            'behavior' => 'behavior_path',
            'frequency' => 'request_frequency',
            'ua' => 'ua_anomaly',
            'device' => 'device_probe',
            'asn' => 'asn_reputation',
            default => $code,
        };
        $topReasons[] = [
            'code' => $reasonCode,
            'label' => reputation_reason_text($reasonCode),
            'score' => (int)$score,
        ];
        if (count($topReasons) >= 3) {
            break;
        }
    }

    $reasonText = $topReasons ? implode(' + ', array_map(static fn($r): string => (string)$r['label'], $topReasons)) : '风险画像命中';

    return [
        'level' => $level,
        'label' => reputation_level_label($level),
        'ttl_minutes' => $ttlMinutes,
        'top_reasons' => $topReasons,
        'reason_text' => $reasonText,
        'auto_mode_enabled' => !empty($config['enable_auto_decision']),
        'should_auto_ban' => !empty($config['enable_auto_decision']) && $level === 'ban',
        'thresholds' => [
            'challenge' => $challenge,
            'restrict' => $restrict,
            'ban' => $ban,
        ],
    ];
}

function reputation_decision_collect(array $filters = []): array
{
    $profiles = reputation_collect_profiles($filters);
    $config = class_exists('Firewall') ? Firewall::getConfig() : [];
    $items = [];
    foreach ($profiles as $profile) {
        $decision = reputation_profile_decision($profile, $config);
        $profile['decision'] = $decision;
        if (!empty($filters['decision_level']) && $decision['level'] !== (string)$filters['decision_level']) {
            continue;
        }
        $items[] = $profile;
    }
    return $items;
}

function reputation_decision_overview(array $filters = []): array
{
    $items = reputation_decision_collect($filters);
    $stat = ['safe' => 0, 'observe' => 0, 'challenge' => 0, 'restrict' => 0, 'ban' => 0];
    foreach ($items as $item) {
        $level = (string)($item['decision']['level'] ?? 'safe');
        $stat[$level] = ($stat[$level] ?? 0) + 1;
    }
    return [
        'total' => count($items),
        'safe' => $stat['safe'],
        'observe' => $stat['observe'],
        'challenge' => $stat['challenge'],
        'restrict' => $stat['restrict'],
        'ban' => $stat['ban'],
    ];
}

function reputation_overview(array $filters = []): array
{
    $profiles = reputation_collect_profiles($filters);
    $levels = ['safe' => 0, 'observe' => 0, 'challenge' => 0, 'restrict' => 0, 'ban' => 0];
    $scoreSum = 0;
    foreach ($profiles as $profile) {
        $levels[$profile['risk_level']] = ($levels[$profile['risk_level']] ?? 0) + 1;
        $scoreSum += (int)$profile['total_score'];
    }
    return [
        'total_entities' => count($profiles),
        'average_score' => $profiles ? (int)round($scoreSum / count($profiles)) : 0,
        'safe' => $levels['safe'],
        'observe' => $levels['observe'],
        'challenge' => $levels['challenge'],
        'restrict' => $levels['restrict'],
        'ban' => $levels['ban'],
    ];
}



function security_profile_level_class(string $level): string
{
    return match ($level) {
        'ban', 'restrict' => 'is-danger',
        'challenge' => 'is-warning',
        'observe' => 'is-observe',
        default => 'is-safe',
    };
}

function security_profile_build_recent_items(array $context = []): array
{
    $items = [];
    foreach ((array)($context['recent_items'] ?? []) as $item) {
        if (!is_array($item)) {
            continue;
        }
        $items[] = [
            'time' => (string)($item['time'] ?? ''),
            'label' => (string)($item['label'] ?? ''),
            'content' => (string)($item['content'] ?? ''),
        ];
    }
    return array_slice($items, 0, 6);
}

function security_profile_render_panel(array $context = []): string
{
    $author = trim((string)($context['author'] ?? '匿名访客'));
    $avatar = trim((string)($context['avatar_url'] ?? ''));
    $email = trim((string)($context['email'] ?? ''));
    $urlValue = trim((string)($context['url'] ?? ''));
    $ip = trim((string)($context['ip'] ?? '未知'));
    $guid = trim((string)($context['device_guid'] ?? ''));
    $geo = trim((string)($context['geo_country'] ?? '未知位置'));
    $score = (int)($context['score'] ?? 0);
    $threshold = (int)($context['threshold'] ?? 30);
    $riskLevel = (string)($context['risk_level'] ?? 'safe');
    $riskClass = security_profile_level_class($riskLevel);
    $riskLabel = function_exists('reputation_level_label') ? reputation_level_label($riskLevel) : $riskLevel;
    $identityValue = trim((string)($context['identity_value'] ?? $email));
    $identityCount = (int)($context['identity_count'] ?? 0);
    $isIdentityBanned = !empty($context['is_identity_banned']);
    $isIpBanned = !empty($context['is_banned']);
    $isDeviceBanned = !empty($context['is_device_banned']);
    $components = is_array($context['components'] ?? null) ? $context['components'] : [];
    $network = is_array($context['network'] ?? null) ? $context['network'] : [];
    $decision = is_array($context['decision'] ?? null) ? $context['decision'] : [];
    $requestCount = (int)($context['request_count'] ?? 0);
    $f12Hits = (int)($context['f12_hits'] ?? 0);
    $uniquePaths = (int)($context['unique_paths'] ?? 0);
    $peakMinute = (int)($context['peak_minute'] ?? 0);
    $recentItems = security_profile_build_recent_items($context);

    $miniMap = [
        '载荷信誉' => (int)($components['payload'] ?? 0),
        'IP 历史' => (int)($components['ip_history'] ?? 0),
        '行为路径' => (int)($components['behavior'] ?? 0),
        '请求频率' => (int)($components['frequency'] ?? 0),
        'UA 异常' => (int)($components['ua'] ?? 0),
        '设备信誉' => (int)($components['device'] ?? 0),
        'ASN 信誉' => (int)($components['asn'] ?? 0),
        '网络画像' => trim((string)($geo !== '' ? $geo : ($network['country'] ?? '未知'))),
    ];

    $btnIp = $ip !== '未知'
        ? ($isIpBanned
            ? sprintf('<button type="button" class="btn btn-primary security-profile__action js-security-ban-action" data-target="ip" data-action="unban" data-value=%s>解封IP</button>', htmlspecialchars(json_encode($ip, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ENT_QUOTES, 'UTF-8'))
            : sprintf('<button type="button" class="btn is-danger security-profile__action js-security-ban-action" data-target="ip" data-action="ban" data-value=%s>封禁IP</button>', htmlspecialchars(json_encode($ip, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ENT_QUOTES, 'UTF-8')))
        : '';
    $btnDevice = $guid !== ''
        ? ($isDeviceBanned
            ? sprintf('<button type="button" class="btn btn-primary security-profile__action js-security-ban-action" data-target="device" data-action="unban" data-value=%s>解封设备</button>', htmlspecialchars(json_encode($guid, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ENT_QUOTES, 'UTF-8'))
            : sprintf('<button type="button" class="btn is-danger security-profile__action js-security-ban-action" data-target="device" data-action="ban" data-value=%s>封禁设备</button>', htmlspecialchars(json_encode($guid, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ENT_QUOTES, 'UTF-8')))
        : '';
    $btnIdentity = $identityValue !== ''
        ? ($isIdentityBanned
            ? sprintf('<button type="button" class="btn btn-primary security-profile__action js-security-ban-action" data-target="identity" data-action="unban" data-value=%s>解除封杀</button>', htmlspecialchars(json_encode($identityValue, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ENT_QUOTES, 'UTF-8'))
            : sprintf('<button type="button" class="btn is-danger security-profile__action js-security-ban-action" data-target="identity" data-action="ban" data-value=%s>封杀此人</button>', htmlspecialchars(json_encode($identityValue, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), ENT_QUOTES, 'UTF-8')))
        : '';


    ob_start();
    ?>
    <div class="security-profile security-profile--<?= e($riskLevel) ?>">
        <div class="security-profile__header">
            <div class="security-profile__identity">
                <?php if ($avatar !== ''): ?><img class="security-profile__avatar" src="<?= e($avatar) ?>" alt="avatar"><?php endif; ?>
                <div class="security-profile__who">
                    <h3><?= e($author) ?></h3>
                    <p><i class="ri-mail-line"></i> <?= e($email !== '' ? $email : '未绑定邮箱') ?></p>
                    <?php if ($urlValue !== ''): ?><p><i class="ri-link"></i> <a href="<?= e($urlValue) ?>" target="_blank"><?= e($urlValue) ?></a></p><?php endif; ?>
                </div>
            </div>
            <div class="security-profile__tags">
                <span class="security-profile__level security-profile__level--<?= e($riskLevel) ?>"><?= e($riskLabel) ?></span>
                <?php if (!empty($decision['label'])): ?><span class="security-profile__chip">建议动作：<?= e((string)$decision['label']) ?></span><?php endif; ?>
            </div>
        </div>

        <div class="security-profile__grid">
            <div class="security-profile__card">
                <div class="security-profile__card-title"><i class="ri-global-line"></i> IP 地址</div>
                <div class="security-profile__card-main security-profile__card-main--with-action"><div class="security-profile__value-stack"><span class="security-profile__value-text"><?= e($ip) ?></span></div><div class="security-profile__action-wrap"><?= $btnIp ?></div></div>
            </div>
            <div class="security-profile__card">
                <div class="security-profile__card-title"><i class="ri-map-pin-line"></i> 物理位置</div>
                <div class="security-profile__card-main security-profile__card-main--accent"><?= e($geo) ?></div>
            </div>
            <div class="security-profile__card <?= e($riskClass) ?>">
                <div class="security-profile__card-title"><i class="ri-shield-user-line"></i> 信誉评分（阈值:<?= (int)$threshold ?>）</div>
                <div class="security-profile__card-main"><?= (int)$score ?> 分</div>
            </div>
            <div class="security-profile__card <?= $isIdentityBanned ? 'is-danger' : '' ?>">
                <div class="security-profile__card-title"><i class="ri-group-line"></i> 关联设备</div>
                <div class="security-profile__card-main security-profile__card-main--with-action"><span>共 <?= (int)$identityCount ?> 台<?= $isIdentityBanned ? '（已全网拉黑）' : '' ?></span><?= $btnIdentity ?></div>
            </div>
            <div class="security-profile__card security-profile__card--wide <?= $isDeviceBanned ? 'is-danger' : '' ?>">
                <div class="security-profile__card-title"><i class="ri-fingerprint-line"></i> 当前设备指纹（Device ID）</div>
                <div class="security-profile__card-main security-profile__card-main--with-action"><code><?= $guid !== '' ? e($guid) : '未捕获' ?></code><?= $btnDevice ?></div>
            </div>
        </div>

        <div class="security-profile__metrics">
            <?php foreach ($miniMap as $label => $value): ?>
                <div class="security-profile__metric">
                    <div class="security-profile__metric-label"><?= e((string)$label) ?></div>
                    <div class="security-profile__metric-value"><?= is_int($value) ? (int)$value : e((string)$value) ?></div>
                </div>
            <?php endforeach; ?>
        </div>

        <div class="security-profile__meta">
            <span>请求数：<?= $requestCount ?></span>
            <span>F12 命中：<?= $f12Hits ?></span>
            <span>独立路径：<?= $uniquePaths ?></span>
            <span>分钟峰值：<?= $peakMinute ?></span>
            <?php if (!empty($network['asn'])): ?><span>ASN：<?= e((string)$network['asn']) ?></span><?php endif; ?>
            <?php if (!empty($network['org'])): ?><span>网络：<?= e((string)$network['org']) ?></span><?php endif; ?>
        </div>

        <div class="security-profile__history-title"><i class="ri-history-line"></i> 近期互动轨迹（<?= count($recentItems) ?>）</div>
        <?php if ($recentItems): ?>
            <div class="security-profile__timeline">
                <?php foreach ($recentItems as $item): ?>
                    <div class="security-profile__timeline-item">
                        <div class="security-profile__timeline-time"><?= e((string)$item['time']) ?></div>
                        <?php if ((string)$item['label'] !== ''): ?><div class="security-profile__timeline-label"><?= e((string)$item['label']) ?></div><?php endif; ?>
                        <div class="security-profile__timeline-content"><?= e((string)$item['content']) ?></div>
                    </div>
                <?php endforeach; ?>
            </div>
        <?php else: ?>
            <div class="security-profile__empty">暂无近期互动轨迹</div>
        <?php endif; ?>
    </div>
    <?php
    return (string)ob_get_clean();
}

function reputation_event_label(string $code): string
{
    $map = reputation_reason_catalog() + [
        'manual_ban' => '人工封禁',
        'manual_unban' => '人工解封',
        'auto_decision_ban' => '自动决策封禁',
        'cc_burst' => '请求频率熔断',
        'geoip_denied' => 'GeoIP 空间封锁',
        'challenge_presented' => '前台挑战展示',
        'challenge_passed' => '前台挑战通过',
        'restrict_presented' => '前台限制展示',
        'restrict_passed' => '前台限制通过',
    ];
    return $map[$code] ?? $code;
}

function security_timeline_collect(array $filters = []): array
{
    $items = [];
    $ip = trim((string)($filters['ip'] ?? ''));
    $guid = trim((string)($filters['guid'] ?? ''));
    $startDate = trim((string)($filters['start_date'] ?? ''));
    $endDate = trim((string)($filters['end_date'] ?? ''));

    foreach (reputation_collect_events([
        'entity_type' => 'ip',
        'entity_key' => $ip,
        'start_date' => $startDate,
        'end_date' => $endDate,
    ]) as $row) {
        $evidence = (array)($row['evidence'] ?? []);
        if ($guid !== '' && stripos(json_encode($evidence, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES), $guid) === false) {
            continue;
        }
        $items[] = [
            'ts' => (int)($row['ts'] ?? 0),
            'time' => (string)($row['time'] ?? ''),
            'source' => 'reputation',
            'event_code' => (string)($row['event_code'] ?? ''),
            'event_label' => reputation_event_label((string)($row['event_code'] ?? '')),
            'score_delta' => (int)($row['score_delta'] ?? 0),
            'ip' => (string)($evidence['ip'] ?? $row['entity_key'] ?? ''),
            'guid' => (string)($evidence['guid'] ?? ''),
            'path' => (string)($evidence['path'] ?? ''),
            'url' => (string)($evidence['url'] ?? ''),
            'title' => '',
            'reason' => (string)($evidence['reason_text'] ?? ($evidence['label'] ?? '')),
            'evidence' => $evidence,
        ];
    }

    foreach (f12_probe_collect([
        'ip' => $ip,
        'guid' => $guid,
        'start_date' => $startDate,
        'end_date' => $endDate,
    ]) as $row) {
        $items[] = [
            'ts' => (int)($row['ts'] ?? 0),
            'time' => (string)($row['time'] ?? ''),
            'source' => 'probe',
            'event_code' => 'f12_probe',
            'event_label' => 'F12 探针命中',
            'score_delta' => 0,
            'ip' => (string)($row['ip'] ?? ''),
            'guid' => (string)($row['guid'] ?? ''),
            'path' => (string)($row['path'] ?? ''),
            'url' => (string)($row['url'] ?? ''),
            'title' => (string)($row['title'] ?? ''),
            'reason' => (string)($row['reason'] ?? ''),
            'evidence' => [
                'screen' => (string)($row['screen'] ?? ''),
                'trail' => (array)($row['trail'] ?? []),
                'browser' => trim((string)($row['browser'] ?? '') . ' ' . (string)($row['browser_version'] ?? '')),
                'os' => trim((string)($row['os'] ?? '') . ' ' . (string)($row['os_version'] ?? '')),
                'device_type' => (string)($row['device_type'] ?? ''),
            ],
        ];
    }

    usort($items, static function (array $a, array $b): int {
        return ($b['ts'] ?? 0) <=> ($a['ts'] ?? 0);
    });
    return $items;
}

function security_timeline_summary(array $filters = []): array
{
    $items = security_timeline_collect($filters);
    $today = date('Y-m-d');
    $todayCount = 0;
    $sources = [];
    $highRisk = 0;
    foreach ($items as $item) {
        if (strpos((string)($item['time'] ?? ''), $today) === 0) {
            $todayCount++;
        }
        $sources[(string)($item['source'] ?? 'unknown')] = true;
        if ((int)($item['score_delta'] ?? 0) >= 8 || in_array((string)($item['event_code'] ?? ''), ['manual_ban', 'auto_decision_ban', 'cc_burst', 'geoip_denied'], true)) {
            $highRisk++;
        }
    }
    return [
        'total' => count($items),
        'today' => $todayCount,
        'sources' => count($sources),
        'high_risk' => $highRisk,
    ];
}
