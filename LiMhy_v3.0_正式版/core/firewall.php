<?php
/**
 * LiMhy - 全栈防御引擎 (WAF & Security Hub)
 * 
 * @package LiMhy
 * @version v1.5 (Powered by Dual GeoIP Engine)
 * @author  Jason（QQ：895443171）
 * @desc    集成指纹拦截、防爆破、CC 防御、WAF 扫描及双擎物理空间阻断
 */

declare(strict_types=1);

class Firewall
{
    private static array $config = [];
    private static array $defaultConfig = [
        'enable'            => true,
        'enable_edge'       => true,
        'enable_waf'        => true,
        'enable_cc'         => true,
        'enable_shield'     => true,
        'enable_geoip'      => true,
        'enable_device_ban' => true,
        'enable_f12_probe'  => false,
        'enable_auto_decision' => false,
        'decision_challenge_score' => 14,
        'decision_restrict_score'  => 24,
        'decision_ban_score'       => 35,
        'decision_ban_minutes'     => 60,
        'challenge_pass_minutes'   => 15,
        'edge_threshold'    => 30,
        'cc_limit_5s'       => 30,
        'cc_limit_60s'      => 60,
        'shield_trigger_qps'=> 10,
        'whitelist_ip'      => ['127.0.0.1', '::1'],
        'friend_emails'     => [],
        'exempted_paths'    => ['/feed', '/sitemap.xml', '/api/captcha', '/admin', '/assets'],
        'geoip_countries'   => ['CN', 'HK', 'MO', 'TW'], 
        'geoip_mode'        => 'whitelist',
    ];

    const STORAGE_DIR = ROOT . '/data/firewall/';
    private const BAN_TIERS = [10, 30, 120, 1440, 10080];

    /**
     * ============================================================================
     * 1. 核心运行时拦截逻辑 (Frontend Gateway)
     * ============================================================================
     */
    
    public static function run(): void {
        if (!is_dir(self::STORAGE_DIR)) { @mkdir(self::STORAGE_DIR, 0755, true); }
        self::loadConfig(); 
        if (!self::$config['enable']) return;

        $ip = client_ip(); 
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        if (self::handleShieldVerification($ip, $uri)) { return; }
        
        if (isset($_COOKIE['lm_auth']) || preg_match('/\.(css|js|png|jpg|svg|woff2?|ttf)$/i', $uri)) return;

        // 1. 设备指纹硬件级封禁
        if (self::$config['enable_device_ban']) {
            $guid = $_COOKIE['lm_guid'] ?? '';
            if (strlen($guid) > 10 && self::isGuidBanned($guid)) {
                header("HTTP/1.1 404 Not Found"); echo '404 Not Found'; exit;
            }
        }

        // 2. 白名单穿透
        foreach (self::$config['exempted_paths'] as $p) if (str_starts_with($uri, $p)) return;
        if (in_array($ip, self::$config['whitelist_ip'])) return;

        // 3. GeoIP 双擎物理层空间阻断
        if (self::$config['enable_geoip']) {
            self::checkGeoIP($ip);
        }

        // 4. IP 黑名单阻断
        if (self::cacheGet('ban_' . $ip) !== null) self::block($ip, 'BANNED', '您的 IP 暂时被禁止访问');

        // 5. 边缘威胁扫描 (WAF)
        if (self::$config['enable_edge']) {
            $score = (int)self::cacheGet('score_' . $ip);
            $payloadSignals = [];
            if (self::$config['enable_waf']) {
                $payloadSignals = self::scanPayloadSignals();
                foreach ($payloadSignals as $signal) {
                    $score += (int)($signal['score'] ?? 0);
                    if (function_exists('reputation_record_event')) {
                        reputation_record_event('ip', $ip, (string)($signal['code'] ?? 'waf_hit'), (int)($signal['score'] ?? 0), [
                            'path' => $uri,
                            'label' => (string)($signal['label'] ?? ''),
                        ]);
                    }
                }
            }
            if ($score >= self::$config['edge_threshold']) self::block($ip, 'THREAT', '检测到异常渗透行为');
            if ($score > 0) self::cacheSet('score_' . $ip, $score, 3600);
            if (!empty($payloadSignals)) {
                self::cacheSet('payload_events_' . $ip, ['exp' => time() + 86400, 'items' => $payloadSignals], 86400);
            }
        }

        if (self::$config['enable_auto_decision']) {
            self::evaluateDecisionAction($ip, $uri);
        }

        // 6. 高频 CC 防御
        if (self::$config['enable_cc']) self::checkCC($ip);
    }

    
        /**
     * ★ 终极防线：MMDB + 纯真库 + 云端 API 测绘三擎融合拦截器 (Zero-Crash & Zero-Bypass)
     */
    private static function checkGeoIP(string $ip): void {
        $rawCountries = self::$config['geoip_countries'] ?? [];
        if (empty($rawCountries)) return;
        
        $countries = is_string($rawCountries) 
            ? array_filter(array_map('trim', explode("\n", str_replace(',', "\n", $rawCountries)))) 
            : $rawCountries;
            
        if (empty($countries)) return;

        // 1. 优先白嫖 CDN 边缘节点的国家标头 (0 耗时)
        $code = $_SERVER['HTTP_CF_IPCOUNTRY'] ?? $_SERVER['HTTP_GEOIP_COUNTRY_CODE'] ?? '';
        $loc = '';

        // 2. 尝试使用专业的 GeoLite2-Country.mmdb 引擎 (需 C 扩展支持)
        if (empty($code)) {
            $dbFile = ROOT . '/data/firewall/lib/GeoLite2-Country.mmdb';
            if (file_exists($dbFile) && function_exists('maxminddb_open')) {
                try {
                    $reader = @maxminddb_open($dbFile);
                    if ($reader) {
                        $record = maxminddb_get($reader, $ip);
                        maxminddb_close($reader);
                        $code = $record['country']['iso_code'] ?? '';
                    }
                } catch (\Throwable $e) {}
            }
        }

        // 3. 平滑降级：尝试使用纯真库
        if (empty($code) && function_exists('get_ip_location')) {
            $loc = get_ip_location($ip); 
            $map = [
                '香港'=>'HK', '澳门'=>'MO', '台湾'=>'TW', '美国'=>'US', 
                '日本'=>'JP', '韩国'=>'KR', '新加坡'=>'SG', '英国'=>'GB', 
                '法国'=>'FR', '德国'=>'DE', '俄罗斯'=>'RU', '加拿大'=>'CA'
            ];
            $code = $map[$loc] ?? '';
            // 智能识别中国大陆省份打上 CN 标签
            if (empty($code)) {
                $cnProvinces = ['北京','天津','上海','重庆','河北','山西','辽宁','吉林','黑龙江','江苏','浙江','安徽','福建','江西','山东','河南','湖北','湖南','广东','海南','四川','贵州','云南','陕西','甘肃','青海','内蒙古','广西','西藏','宁夏','新疆','中国'];
                foreach ($cnProvinces as $prov) {
                    if (strpos($loc, $prov) !== false) { $code = 'CN'; break; }
                }
            }
        }

        // 4. 【核心修复】云端测绘兜底与高速缓存 (彻底解决本地库失效问题)
        if (empty($code)) {
            $cacheKey = 'geo_code_' . md5($ip);
            $code = self::cacheGet($cacheKey);
            if (empty($code)) {
                $ctx = stream_context_create(['http' => ['timeout' => 1.5]]);
                $res = @file_get_contents("http://ip-api.com/json/{$ip}?fields=countryCode", false, $ctx);
                if ($res) {
                    $json = json_decode($res, true);
                    if (!empty($json['countryCode'])) {
                        $code = strtoupper($json['countryCode']);
                        self::cacheSet($cacheKey, $code, 86400 * 15); // 缓存 15 天，极致 O(1) 性能
                    }
                }
            }
        }
        
        // 5. 局域网白名单直通
        if ($ip === '127.0.0.1' || $ip === '::1' || strpos($ip, '192.168.') === 0 || strpos($ip, '10.') === 0) {
            return; 
        }

        // 6. 严苛阻断判定 (修复了原先查不到就放行的漏洞)
        $mode = self::$config['geoip_mode'] ?? 'whitelist';
        $list = array_map('strtoupper', $countries);
        
        $isMatch = in_array(strtoupper($code), $list) || (!empty($loc) && in_array($loc, $countries));

        if ($mode === 'whitelist' && !$isMatch) {
            $showTag = $code ?: ($loc ?: 'Unknown');
            if (function_exists('reputation_record_event')) {
                reputation_record_event('ip', $ip, 'geoip_denied', 10, ['ip' => $ip, 'country' => $showTag, 'mode' => 'whitelist']);
            }
            self::block($ip, 'GEO_DENY', "系统开启了空间物理封锁，您的区域 [{$showTag}] 不在白名单内。");
        } elseif ($mode === 'blacklist' && $isMatch) {
            $showTag = $code ?: ($loc ?: 'Unknown');
            if (function_exists('reputation_record_event')) {
                reputation_record_event('ip', $ip, 'geoip_denied', 10, ['ip' => $ip, 'country' => $showTag, 'mode' => 'blacklist']);
            }
            self::block($ip, 'GEO_DENY', "系统开启了空间物理封锁，您的区域 [{$showTag}] 被限制访问。");
        }
    }

    
    
    private static function checkCC(string $ip): void {
        $key = 'cc_' . $ip; $logs = self::cacheGet($key) ?: []; $now = time();
        $logs = array_filter($logs, fn($t) => $now - $t < 60); $logs[] = $now;
        
        $count5s = 0; foreach ($logs as $t) { if ($now - $t <= 5) $count5s++; }
        if ($count5s > self::$config['cc_limit_5s'] || count($logs) > self::$config['cc_limit_60s']) {
            self::cacheSet('ban_' . $ip, ['reason'=>'CC_ATTACK', 'end'=>time()+3600], 3600);
            if (function_exists('reputation_record_event')) {
                reputation_record_event('ip', $ip, 'cc_burst', 12, ['ip' => $ip, 'path' => ($_SERVER['REQUEST_URI'] ?? '/'), 'count_5s' => $count5s, 'count_60s' => count($logs)]);
            }
            self::block($ip, 'CC_DENY', '频率过高，触发防御熔断');
        }
        self::cacheSet($key, $logs, 60);
    }

    private static function scanPayloadSignals(): array {
        $data = urldecode(http_build_query(array_merge($_GET, $_POST, $_COOKIE)));
        $signals = [];
        $rules = [
            ['code' => 'waf_sqli', 'score' => 10, 'label' => 'SQL 注入', 'pattern' => '/(union\s+select|select.+from|insert\s+into|update\s+.+set|sleep\s*\(|benchmark\s*\(|or\s+1=1)/i'],
            ['code' => 'waf_rce', 'score' => 12, 'label' => '代码执行', 'pattern' => '/(eval\(|assert\(|system\(|shell_exec\(|passthru\(|base64_decode\(|<\?php)/i'],
            ['code' => 'waf_xss', 'score' => 10, 'label' => 'XSS', 'pattern' => '/(<script|onerror=|onload=|javascript:|svg\s+on)/i'],
            ['code' => 'waf_path_probe', 'score' => 8, 'label' => '目录探测', 'pattern' => '/(\.\.\/|\.env|phpmyadmin|wp-login|vendor\/|\.git)/i'],
        ];
        foreach ($rules as $rule) {
            if (preg_match($rule['pattern'], $data)) {
                $signals[] = $rule;
            }
        }
        return $signals;
    }

    private static function block($ip, $code, $msg): void {
        http_response_code(403); 
        $clientIp = $ip; $blockCode = $code; $blockMsg = $msg;
        if (file_exists(ROOT.'/templates/firewall_block.php')) {
            require ROOT.'/templates/firewall_block.php';
        } else {
            echo "<h1 style='font-family: sans-serif;'>403 Access Denied</h1><p style='font-family: sans-serif; color: #555;'>{$msg} [{$code}]</p>";
        }
        exit;
    }

    public static function renderDeviceProbe(): void {
        $cfg = self::getConfig();
        $f12ProbeEnabled = !empty($cfg['enable_f12_probe']) ? 'true' : 'false';
        echo "<script>(function(){ var k='lm_guid',v=localStorage.getItem(k)||Math.random().toString(36).slice(2); localStorage.setItem(k,v); document.cookie=k+'='+v+';path=/;max-age=315360000'; window.LIMHY_F12_PROBE_ENABLED=" . $f12ProbeEnabled . "; })();</script>";
    }

    private static function handleShieldVerification(string $ip, string $uri): bool
    {
        if (strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET')) !== 'POST') {
            return false;
        }
        $token = trim((string)($_POST['shield_token'] ?? ''));
        if ($token === '') {
            return false;
        }
        self::loadConfig();
        $level = trim((string)($_POST['shield_level'] ?? 'challenge'));
        $targetUri = trim((string)($_POST['shield_target'] ?? $uri));
        if ($targetUri === '') {
            $targetUri = '/';
        }
        $cacheKey = 'shield_token_' . md5($ip . '|' . $targetUri . '|' . $level);
        $stored = self::cacheGet($cacheKey);
        if (!is_array($stored) || (string)($stored['token'] ?? '') !== $token || (int)($stored['exp'] ?? 0) < time()) {
            self::block($ip, 'SHIELD_INVALID', '安全质询令牌已失效，请重新发起访问。');
        }
        $passMinutes = max(5, (int)(self::$config['challenge_pass_minutes'] ?? 15));
        self::cacheSet('shield_pass_' . md5($ip . '|' . $targetUri . '|' . $level), ['exp' => time() + $passMinutes * 60], $passMinutes * 60);
        self::cacheDelete($cacheKey);
        if (function_exists('reputation_record_event')) {
            reputation_record_event('ip', $ip, $level === 'restrict' ? 'restrict_passed' : 'challenge_passed', 0, [
                'ip' => $ip,
                'path' => (string)(parse_url($targetUri, PHP_URL_PATH) ?: $targetUri),
                'url' => $targetUri,
                'guid' => (string)($_COOKIE['lm_guid'] ?? ''),
                'reason_text' => trim((string)($_POST['shield_reason'] ?? '')),
            ]);
        }
        header('Location: ' . $targetUri, true, 303);
        exit;
    }

    private static function shouldApplyDecisionShield(string $uri): bool
    {
        $method = strtoupper((string)($_SERVER['REQUEST_METHOD'] ?? 'GET'));
        if (!in_array($method, ['GET', 'HEAD'], true)) {
            return false;
        }
        if (isset($_SERVER['HTTP_X_REQUESTED_WITH']) && strtolower((string)$_SERVER['HTTP_X_REQUESTED_WITH']) === 'xmlhttprequest') {
            return false;
        }
        if (str_starts_with($uri, '/admin') || str_starts_with($uri, '/api/')) {
            return false;
        }
        return true;
    }

    private static function renderDecisionShield(string $ip, string $uri, array $decision): void
    {
        self::loadConfig();
        $level = (string)($decision['level'] ?? 'challenge');
        $targetUri = $uri === '' ? '/' : $uri;
        $passKey = 'shield_pass_' . md5($ip . '|' . $targetUri . '|' . $level);
        $pass = self::cacheGet($passKey);
        if (is_array($pass) && (int)($pass['exp'] ?? 0) > time()) {
            return;
        }
        $token = substr(hash('sha256', $ip . '|' . $targetUri . '|' . microtime(true) . '|' . mt_rand()), 0, 32);
        $ttlMinutes = max(3, (int)($decision['ttl_minutes'] ?? ($level === 'restrict' ? 30 : 10)));
        self::cacheSet('shield_token_' . md5($ip . '|' . $targetUri . '|' . $level), [
            'token' => $token,
            'exp' => time() + 300,
            'ip' => $ip,
            'level' => $level,
            'target' => $targetUri,
        ], 300);
        if (function_exists('reputation_record_event')) {
            reputation_record_event('ip', $ip, $level === 'restrict' ? 'restrict_presented' : 'challenge_presented', 0, [
                'ip' => $ip,
                'path' => (string)(parse_url($targetUri, PHP_URL_PATH) ?: $targetUri),
                'url' => $targetUri,
                'guid' => (string)($_COOKIE['lm_guid'] ?? ''),
                'reason_text' => (string)($decision['reason_text'] ?? ''),
            ]);
        }
        $challengeLevel = $level;
        $challengeTitle = $level === 'restrict' ? '访问限制验证' : '访问挑战验证';
        $challengeLead = $level === 'restrict' ? '当前访问画像已进入限制态，需要先完成一次前台质询后继续浏览。' : '当前访问画像已进入挑战态，需要先完成一次前台质询后继续浏览。';
        $challengeReasons = (array)($decision['top_reasons'] ?? []);
        $challengeReasonText = (string)($decision['reason_text'] ?? '风险画像命中');
        $challengeTtlMinutes = $ttlMinutes;
        $clientIp = $ip;
        $requestId = substr(hash('sha1', $ip . '|' . $targetUri . '|' . $token), 0, 12);
        require ROOT . '/templates/firewall_shield.php';
        exit;
    }

    private static function evaluateDecisionAction(string $ip, string $uri): void
    {
        if (!self::shouldApplyDecisionShield($uri)) {
            return;
        }
        $analysis = self::getIpAnalysis($ip);
        $decision = is_array($analysis['decision'] ?? null) ? $analysis['decision'] : [];
        $level = (string)($decision['level'] ?? 'safe');
        if ($level === 'ban' && !self::isIpCurrentlyBanned($ip)) {
            self::applyDecisionBan($ip, $decision);
            self::block($ip, 'AUTO_BAN', '当前访问画像已达到自动封禁阈值。');
        }
        if (!self::$config['enable_shield']) {
            return;
        }
        if (in_array($level, ['challenge', 'restrict'], true)) {
            self::renderDecisionShield($ip, $uri, $decision);
        }
    }

    /**
     * ============================================================================
     * 2. 后台配置与状态管理 API (Admin Hub API)
     * ============================================================================
     */

    public static function loadConfig(): void {
        self::$config = self::$defaultConfig;
        if (file_exists($f = self::STORAGE_DIR . 'custom_config.php')) {
            $c = @include $f; if (is_array($c)) self::$config = array_merge(self::$config, $c);
        }
    }

    public static function getConfig(): array {
        if (empty(self::$config)) self::loadConfig();
        return self::$config;
    }

    public static function updateConfig(array $newSettings): void {
        if (empty(self::$config)) self::loadConfig();
        $merged = array_merge(self::$config, $newSettings);
        $content = "<?php\n// LiMhy Firewall Auto-Generated Config\nreturn " . var_export($merged, true) . ";\n";
        if (!is_dir(self::STORAGE_DIR)) @mkdir(self::STORAGE_DIR, 0755, true);
        @file_put_contents(self::STORAGE_DIR . 'custom_config.php', $content, LOCK_EX);
        if (function_exists('opcache_invalidate')) @opcache_invalidate(self::STORAGE_DIR . 'custom_config.php', true);
    }

    /**
     * ============================================================================
     * 3. 控制台业务级安全 API (登录防爆破、黑名单管控、态势画像)
     * ============================================================================
     */

    // --- 登录防爆破 ---
    public static function trackLoginFailure(string $ip): int {
        $key = 'login_fail_' . $ip; $fails = (int)(self::cacheGet($key) ?? 0) + 1;
        self::cacheSet($key, $fails, 3600);
        if ($fails >= 5) {
            self::cacheSet('ban_' . $ip, ['reason' => 'BRUTE_FORCE', 'end' => time() + 86400], 86400);
        }
        return max(0, 5 - $fails);
    }
    
    public static function resetLoginFailure(string $ip): void { 
        self::cacheDelete('login_fail_' . $ip); 
    }

    // --- IP 黑名单管控 ---
    public static function manualBanIp(string $ip): void {
        self::cacheSet('ban_' . $ip, ['reason' => 'MANUAL_BAN', 'end' => time() + 315360000], 315360000); 
        if (function_exists('reputation_record_event')) {
            reputation_record_event('ip', $ip, 'manual_ban', 0, ['ip' => $ip, 'reason_text' => '人工封禁']);
        }
    }
    public static function manualUnbanIp(string $ip): void {
        self::cacheDelete('ban_' . $ip); self::cacheDelete('score_' . $ip);
        if (function_exists('reputation_record_event')) {
            reputation_record_event('ip', $ip, 'manual_unban', 0, ['ip' => $ip, 'reason_text' => '人工解封']);
        }
    }

    // --- 设备指纹管控 (Device Guard) ---
    public static function logCommentGuid(int $cid, string $guid): void {
        if (strlen($guid) < 10) return;
        $map = self::cacheGet('comment_guid_map') ?: []; 
        $map[$cid] = $guid;
        self::cacheSet('comment_guid_map', array_slice($map, -2000, null, true), 86400 * 180);
    }
    public static function getCommentGuid(int $commentId): ?string { 
        return (self::cacheGet('comment_guid_map') ?? [])[$commentId] ?? null; 
    }
    public static function isGuidBanned(string $guid): bool { 
        return in_array($guid, self::cacheGet('device_blacklist') ?? []); 
    }
    public static function banDevice(string $guid): void { 
        $list = self::cacheGet('device_blacklist') ?? []; 
        if (!in_array($guid, $list)) { $list[] = $guid; self::cacheSet('device_blacklist', $list, 86400 * 365); } 
    }
    public static function unbanDevice(string $guid): void { 
        $list = self::cacheGet('device_blacklist') ?? []; 
        $list = array_diff($list, [$guid]); 
        self::cacheSet('device_blacklist', array_values($list), 86400 * 365); 
    }

    // --- 身份连带管控 (Identity Matrix) ---
    public static function associateIdentity(string $email, string $guid): void {
        if (empty($email) || strlen($guid) < 10) return;
        $hash = md5(strtolower(trim($email))); $key = 'identity_' . $hash;
        $devices = self::cacheGet($key) ?? [];
        if (!in_array($guid, $devices)) { $devices[] = $guid; self::cacheSet($key, $devices, 315360000); }
        if (self::isIdentityBanned($email)) self::banDevice($guid);
    }
    public static function banIdentity(string $email): int {
        $hash = md5(strtolower(trim($email))); self::cacheSet('id_ban_' . $hash, 1, 315360000);
        $devices = self::cacheGet('identity_' . $hash) ?? []; $count = 0;
        foreach ($devices as $guid) { if (!self::isGuidBanned($guid)) { self::banDevice($guid); $count++; } }
        return $count;
    }
    public static function unbanIdentity(string $email): int {
        $hash = md5(strtolower(trim($email))); self::cacheDelete('id_ban_' . $hash);
        $devices = self::cacheGet('identity_' . $hash) ?? []; $count = 0;
        foreach ($devices as $guid) { if (self::isGuidBanned($guid)) { self::unbanDevice($guid); $count++; } }
        return $count;
    }
    public static function isIdentityBanned(string $email): bool { return (bool)self::cacheGet('id_ban_' . md5(strtolower(trim($email)))); }
    public static function getIdentityDeviceCount(string $email): int { return count(self::cacheGet('identity_' . md5(strtolower(trim($email)))) ?? []); }

    // --- 后台态势画像输出 ---

    public static function getBasePayloadScore(string $ip): int
    {
        return (int)(self::cacheGet('score_' . $ip) ?? 0);
    }

    public static function getRecentPayloadEvidence(string $ip): array
    {
        $payload = self::cacheGet('payload_events_' . $ip);
        if (is_array($payload) && isset($payload['items']) && is_array($payload['items'])) {
            return $payload['items'];
        }
        return is_array($payload) ? $payload : [];
    }

    public static function isIpCurrentlyBanned(string $ip): bool
    {
        return self::cacheGet('ban_' . $ip) !== null;
    }

    public static function applyDecisionBan(string $ip, array $decision = []): void
    {
        self::loadConfig();
        $minutes = max(10, (int)(self::$config['decision_ban_minutes'] ?? 60));
        $reason = trim((string)($decision['reason_text'] ?? 'AUTO_DECISION'));
        self::cacheSet('ban_' . $ip, ['reason' => $reason, 'end' => time() + $minutes * 60], $minutes * 60);
        if (function_exists('reputation_record_event')) {
            reputation_record_event('ip', $ip, 'auto_decision_ban', 0, ['ip' => $ip, 'reason_text' => $reason, 'ttl_minutes' => $minutes]);
        }
    }

    public static function getIpAnalysis(string $ip): array {
        self::loadConfig();
        $score = (int)(self::cacheGet('score_' . $ip) ?? 0);
        $banData = self::cacheGet('ban_' . $ip);
        $isBanned = $banData !== null;
        $cachedCountry = self::cacheGet('geo_' . $ip) ?? '';
        $components = [
            'payload' => $score,
            'ip_history' => 0,
            'behavior' => 0,
            'frequency' => 0,
            'ua' => 0,
            'device' => 0,
            'asn' => 0,
        ];
        $reputation = [];
        if (function_exists('reputation_profile_for_ip')) {
            $reputation = reputation_profile_for_ip($ip);
            if (!empty($reputation['components']) && is_array($reputation['components'])) {
                $components = array_merge($components, $reputation['components']);
            }
            if (!empty($reputation['total_score'])) {
                $score = (int)$reputation['total_score'];
            }
            if ($cachedCountry === '' && !empty($reputation['network']['country'])) {
                $cachedCountry = (string)$reputation['network']['country'];
            }
        }

        $decision = [];
        if (function_exists('reputation_profile_decision')) {
            $decision = reputation_profile_decision([
                'ip' => $ip,
                'total_score' => $score,
                'risk_level' => $reputation['risk_level'] ?? reputation_risk_level($score),
                'components' => $components,
                'events' => $reputation['events'] ?? [],
                'network' => $reputation['network'] ?? [],
                'request_count' => (int)($reputation['request_count'] ?? 0),
                'f12_hits' => (int)($reputation['f12_hits'] ?? 0),
                'peak_minute' => (int)($reputation['peak_minute'] ?? 0),
                'unique_paths' => (int)($reputation['unique_paths'] ?? 0),
                'sample_guid' => $reputation['sample_guid'] ?? '',
            ], self::$config);
        }

        $riskLevel = $decision['level'] ?? ($reputation['risk_level'] ?? 'safe');

        $geoDisplay = trim((string)$cachedCountry);
        $needsResolvedLocation = (
            $geoDisplay === ''
            || preg_match('/^[A-Z]{2,3}$/', $geoDisplay)
            || in_array($geoDisplay, ['LOCAL', 'UNKNOWN'], true)
        );
        if ($needsResolvedLocation && function_exists('get_ip_location')) {
            $resolvedLocation = trim((string)get_ip_location($ip));
            if ($resolvedLocation !== '' && $resolvedLocation !== '未知地域') {
                $geoDisplay = $resolvedLocation;
            }
        }

        return [
            'score' => $score, 'threshold' => self::$config['edge_threshold'] ?? 30,
            'is_banned' => $isBanned, 'ban_reason' => $banData['reason'] ?? '', 
            'ban_end' => $banData['end'] ?? 0, 'geo_country' => $geoDisplay, 
            'risk_level' => $riskLevel,
            'components' => $components,
            'network' => $reputation['network'] ?? [],
            'events' => $reputation['events'] ?? [],
            'request_count' => (int)($reputation['request_count'] ?? 0),
            'f12_hits' => (int)($reputation['f12_hits'] ?? 0),
            'unique_paths' => (int)($reputation['unique_paths'] ?? 0),
            'peak_minute' => (int)($reputation['peak_minute'] ?? 0),
            'decision' => $decision,
        ];
    }

    public static function resetIpReputation(string $ip): void
    {
        $ip = trim($ip);
        if ($ip === '' || !filter_var($ip, FILTER_VALIDATE_IP)) {
            return;
        }
        self::cacheDelete('score_' . $ip);
        self::cacheDelete('payload_events_' . $ip);
        self::cacheDelete('login_fail_' . $ip);
    }

    public static function clearIpRuntimeHistory(string $ip): void
    {
        $ip = trim($ip);
        if ($ip === '' || !filter_var($ip, FILTER_VALIDATE_IP)) {
            return;
        }
        self::resetIpReputation($ip);
        self::cacheDelete('ban_' . $ip);
        self::cacheDelete('geo_' . $ip);
        $asnFile = self::STORAGE_DIR . 'asn_' . md5($ip) . '.php';
        if (is_file($asnFile)) {
            @unlink($asnFile);
        }
    }

    /**
     * ============================================================================
     * 4. 内部缓存引擎驱动
     * ============================================================================
     */
    
    private static function cacheSet($k, $v, $t) { 
        $f = self::STORAGE_DIR . md5((string)$k) . '.php'; 
        file_put_contents($f, '<?php return ' . var_export(['exp' => time() + $t, 'val' => $v], true) . ';', LOCK_EX); 
    }
    
    private static function cacheGet($k) { 
        $f = self::STORAGE_DIR . md5((string)$k) . '.php'; 
        if (!is_file($f)) return null;
        $d = @include $f; 
        if (!$d || $d['exp'] < time()) { @unlink($f); return null; } 
        return $d['val']; 
    }
    
    private static function cacheDelete($k) { 
        @unlink(self::STORAGE_DIR . md5((string)$k) . '.php'); 
    }
}
