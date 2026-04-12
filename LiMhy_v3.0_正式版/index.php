<?php
/**
 * LiMhy - 核心分发版
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    极致性能路由引擎，集成应用级拦截器与非阻塞缓存层
 */

declare(strict_types=1);

define('ROOT', __DIR__);

if (!function_exists('limhy_cache_normalize_request_uri')) {
    function limhy_cache_normalize_request_uri(string $requestUri): string
    {
        $path = (string) parse_url($requestUri, PHP_URL_PATH);
        $query = (string) parse_url($requestUri, PHP_URL_QUERY);
        $path = preg_replace('#/+#', '/', $path) ?: '/';
        if ($path === '/index.php' || $path === '/index.php/') {
            $path = '/';
        }

        parse_str($query, $params);
        foreach (array_keys($params) as $key) {
            if (preg_match('/^(utm_[a-z0-9_]+|spm|from|wechat|fbclid)$/i', (string) $key)) {
                unset($params[$key]);
            }
        }
        ksort($params);

        $queryString = http_build_query($params);
        return $queryString !== '' ? ($path . '?' . $queryString) : $path;
    }
}

if (!function_exists('limhy_early_active_theme')) {
    function limhy_early_active_theme(): string
    {
        $themeFile = ROOT . '/data/active_theme.txt';
        if (!is_file($themeFile)) {
            return 'default';
        }
        $theme = trim((string) @file_get_contents($themeFile));
        if ($theme === '') {
            return 'default';
        }
        return preg_replace('/[^a-zA-Z0-9_-]/', '', $theme) ?: 'default';
    }
}

if (!function_exists('limhy_route_is_public_cacheable')) {
    function limhy_route_is_public_cacheable(string $route): bool
    {
        if ($route === '' || $route === 'home') {
            return true;
        }

        $staticRoutes = ['archive', 'links', 'moments', 'music', 'album', 'town', 'logs', 'sponsor'];
        if (in_array($route, $staticRoutes, true)) {
            return true;
        }

        return preg_match('#^(post|page|category|tag|legal)/[^/]+$#', $route) === 1;
    }
}

if (!function_exists('limhy_try_serve_early_html_cache')) {
    function limhy_try_serve_early_html_cache(string $route, string $requestUri): void
    {
        if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'GET') {
            return;
        }
        if (!limhy_route_is_public_cacheable($route)) {
            return;
        }
        if (isset($_COOKIE['lm_auth']) || !empty($_COOKIE[session_name()])) {
            return;
        }
        if (!empty($_COOKIE['comment_email']) && !empty($_COOKIE['limhy_comment_pending'])) {
            return;
        }

        $cacheKey = md5(limhy_early_active_theme() . '|' . limhy_cache_normalize_request_uri($requestUri));
        $cacheFile = ROOT . '/data/html_cache/' . $cacheKey . '.html';
        if (!is_file($cacheFile) || (time() - filemtime($cacheFile) >= 600)) {
            return;
        }

        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $ipHash = md5('ban_' . $ip);
        if (is_file(ROOT . '/data/firewall/' . $ipHash . '.php')) {
            return;
        }

        header('X-Blitz-Cache: HIT-EARLY');
        header('Content-Type: text/html; charset=utf-8');
        readfile($cacheFile);
        exit;
    }
}


if (isset($_GET['limhy_safebox'])) {
    $safeKey = preg_replace('/[^a-zA-Z0-9_]/', '', $_GET['limhy_safebox']);
    if (!isset($_COOKIE['lm_auth'])) {
        header('Content-Type: text/html; charset=utf-8');
        die('<h3>安全拦截</h3><p>为了保障数据安全，下载备份前请先<a href="/admin/login">登录后台</a>。</p>');
    }
    
    $targetFile = ROOT . '/data/limhy_backup_' . $safeKey . '.sql';
    if ($safeKey !== '' && file_exists($targetFile)) {
        header('Content-Type: application/octet-stream');
        header('Content-Disposition: attachment; filename="limhy_snapshot_' . date('Ymd_His') . '.sql"');
        header('Content-Length: ' . filesize($targetFile));
        readfile($targetFile);
        exit;
    } else {
        header('Content-Type: text/html; charset=utf-8');
        die('<h3>链接已失效</h3><p>该备份文件可能已被自动清理或链接错误。</p>');
    }
}

$__guid = $_COOKIE['lm_guid'] ?? '';
if ($__guid !== '') {
    $__bl_file = ROOT . '/data/firewall/' . md5('device_blacklist') . '.php';
    if (file_exists($__bl_file)) {
        $__bl_data = @include $__bl_file;
        if ($__bl_data && isset($__bl_data['val']) && is_array($__bl_data['val']) && in_array($__guid, $__bl_data['val'], true)) {
            header("HTTP/1.1 404 Not Found");
            echo '<!DOCTYPE html><html><head><title>404 Not Found</title></head><body><center><h1>404 Not Found</h1></center><hr><center>nginx</center></body></html>';
            exit;
        }
    }
}

$requestUri = $_SERVER['REQUEST_URI'] ?? '/';
$isAdmin = isset($_COOKIE['lm_auth']);

if (!function_exists('str_starts_with')) { 
    function str_starts_with(string $h, string $n): bool { return $n !== '' && strncmp($h, $n, strlen($n)) === 0; } 
}

$__route = trim($_GET['r'] ?? '', '/');
if ($__route === '') {
    $path = parse_url($requestUri, PHP_URL_PATH);
    $scriptDir = dirname($_SERVER['SCRIPT_NAME']);
    if ($scriptDir !== '/' && $scriptDir !== '\\') { $path = str_replace(str_replace('\\', '/', $scriptDir), '', (string)$path); }
    $path = trim((string)$path, '/'); $path = preg_replace(['/^index\.php/', '/\.php$/'], '', $path);
    if ($path !== '') $__route = (string)$path;
}
if ($__route === '') $__route = 'home';
$isApi = str_starts_with($__route, 'api/');
if (!$isApi) {
    limhy_try_serve_early_html_cache($__route, $requestUri);
}

if (!file_exists($configFile = ROOT . '/config.php')) {
    if (file_exists(ROOT . '/install.php')) { header('Location: install.php'); exit; }
    die('Config Missing.');
}
require $configFile;
require ROOT . '/core/logger.php';

$defaults = [
    'SMTP_HOST' => '', 'SMTP_PORT' => 465, 'SMTP_USER' => '',
    'SMTP_PASS' => '', 'SMTP_SECURE' => 'ssl', 'ADMIN_EMAIL' => ''
];
foreach ($defaults as $key => $val) { if (!defined($key)) define($key, $val); }

require ROOT . '/core/db.php'; 
date_default_timezone_set('PRC');
try { db()->exec("SET time_zone = '+08:00'"); } catch (\Throwable $e) {}

require ROOT . '/core/security.php'; 
require ROOT . '/core/helpers.php'; 
limhy_ensure_post_rss_visibility_column();
require ROOT . '/core/theme.php'; 
require ROOT . '/core/plugin.php'; 
load_active_plugins();
do_action('plugins_loaded');
require ROOT . '/core/auth.php'; 
require ROOT . '/core/captcha.php'; 
require ROOT . '/core/firewall.php';

$__contentRendererVersion = '20260327c';
$__runtimeDir = ROOT . '/data/runtime';
$__rendererVersionFile = $__runtimeDir . '/content_renderer.version';
$__rendererVersionNow = is_file($__rendererVersionFile) ? trim((string) @file_get_contents($__rendererVersionFile)) : '';
if ($__rendererVersionNow !== $__contentRendererVersion) {
    if (!is_dir($__runtimeDir)) { @mkdir($__runtimeDir, 0777, true); }
    foreach (glob(ROOT . '/data/html_cache/*.html') ?: [] as $__staleCacheFile) { @unlink($__staleCacheFile); }
    @file_put_contents($__rendererVersionFile, $__contentRendererVersion, LOCK_EX);
}

if (!$isAdmin && !$isApi && !limhy_has_pending_comment_context() && empty($_COOKIE[session_name()]) && ($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'GET') {
    $__cache_file = ROOT . '/data/html_cache/' . md5(active_theme() . '|' . limhy_cache_normalize_request_uri($requestUri)) . '.html';
    if (file_exists($__cache_file) && (time() - filemtime($__cache_file) < 600)) {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
        $ipHash = md5('ban_' . $ip);
        if (!file_exists(ROOT . '/data/firewall/' . $ipHash . '.php')) {
            header('X-Blitz-Cache: HIT');
            header('Content-Type: text/html; charset=utf-8');
            readfile($__cache_file);
            exit;
        }
    }
}

$bypassFirewall = ['api/online-users', 'api/home-posts', 'api/category-posts', 'api/tag-posts', 'api/oss-token', 'api/sibling-post', 'api/user-profile', 'api/component/profile-card', 'api/component/online-modal', 'api/component/f12-warning', 'api/component/town-billboard', 'api/component/minesweeper', 'api/music', 'api/apply-link'];
if (!in_array($__route, $bypassFirewall)) {
    Firewall::run();
}

if (session_status() !== PHP_SESSION_ACTIVE) session_start();

$needsSessionWrite = false;
$writeRoutes = ['api/comment', 'api/post-password', 'api/component/minesweeper', 'api/apply-link', 'admin/login', 'admin/logout' ];
if (in_array($__route, $writeRoutes) || str_starts_with($__route, 'admin')) {
    $needsSessionWrite = true;
}
if (!$needsSessionWrite && session_status() === PHP_SESSION_ACTIVE) {
    session_write_close(); 
}

if ($__route === 'api/online-users') {
    while (ob_get_level()) ob_end_clean();
    api_online_users(); exit;
}

require ROOT . '/core/markdown.php'; 
require ROOT . '/core/rss.php';
if (file_exists(ROOT . '/core/mailer.php')) require ROOT . '/core/mailer.php';
if (function_exists('mail_queue_flush_once') && !is_ajax() && !str_starts_with($__route, 'api/')) {
    register_shutdown_function(static function () {
        try { mail_queue_flush_once(1); } catch (\Throwable $ignore) {}
    });
}

if (mt_rand(1, 30) === 1) {
    register_shutdown_function(function() {
        try {
            $p = prefix();
            db_exec("UPDATE `{$p}posts` SET `status` = 'published' WHERE `status` = 'scheduled' AND `published_at` <= NOW()");
        } catch (\Throwable $e) {}
    });
}

if (defined('AUTO_BACKUP_ENABLE') && AUTO_BACKUP_ENABLE) {
    if (mt_rand(1, 50) === 1) {
        register_shutdown_function(function() {
            try {
                $lockFile = ROOT . '/data/last_backup.time';
                $days = max(1, defined('AUTO_BACKUP_DAYS') ? AUTO_BACKUP_DAYS : 7);
                $interval = $days * 86400;
                $lastTime = file_exists($lockFile) ? (int)file_get_contents($lockFile) : 0;
                
                if (time() - $lastTime > $interval) {
                    file_put_contents($lockFile, time()); 
                    
                    $tables = db_rows("SHOW TABLES");
                    $sql = "-- LiMhy Backup\n-- Date: " . date('Y-m-d H:i:s') . "\n-- Magic: LiMhy_Safe_Snapshot\n\n";
                    $sp = "-- LIMHY-SPLIT --";
                    foreach ($tables as $t) {
                        $tableName = array_values($t)[0];
                        $createTable = db_row("SHOW CREATE TABLE `$tableName`");
                        $sql .= "DROP TABLE IF EXISTS `$tableName`;\n{$sp}\n";
                        $sql .= $createTable['Create Table'] . ";\n{$sp}\n\n";
                        $rows = db_rows("SELECT * FROM `$tableName`");
                        foreach ($rows as $row) {
                            $vals = [];
                            foreach ($row as $v) { $vals[] = ($v === null) ? 'NULL' : db()->quote((string)$v); }
                            $sql .= "INSERT INTO `$tableName` VALUES (" . implode(', ', $vals) . ");\n{$sp}\n";
                        }
                    }
                    
                    if (defined('AUTO_BACKUP_EMAIL') && AUTO_BACKUP_EMAIL && class_exists('Mailer') && defined('ADMIN_EMAIL') && ADMIN_EMAIL !== '') {
                        $mailer = new Mailer();
                        $siteName = defined('SITE_NAME') ? SITE_NAME : 'LiMhy';
                        $siteUrl = defined('SITE_URL') ? rtrim(SITE_URL, '/') : 'http://' . ($_SERVER['HTTP_HOST']??'');
                        
                        $safeKey = substr(md5(uniqid('', true)), 0, 16);
                        $backupPath = ROOT . '/data/limhy_backup_' . $safeKey . '.sql';
                        file_put_contents($backupPath, $sql);
                        
                        $downloadLink = $siteUrl . '/index.php?limhy_safebox=' . $safeKey;
                        $mailBody = "<h3>尊敬的站长：</h3><p>系统已根据您设定的周期（".$days."天）在后台静默生成了备份数据文件。</p>";
                        $mailBody .= "<p>为了避免大文件被邮件网关拦截，数据已安全存入您服务器的保险箱中。</p>";
                        $mailBody .= "<p style='padding:15px; background:#f4f4f5; border-left:4px solid #10b981;'><a href='{$downloadLink}' style='font-weight:bold; color:#10b981; text-decoration:none;'>点击此处，立即下载 SQL 备份文件</a></p>";
                        $mailBody .= "<p style='font-size:12px; color:#888;'>注意：此链接需要您当前浏览器处于<b>系统后台已登录状态</b>方可成功下载，防止被窃取。</p>";
                        
                        $mailer->send(ADMIN_EMAIL, "【" . $siteName . "】自动备份 - SQL数据已生成", $mailBody);
                    }
                }
            } catch (\Throwable $e) {}
        });
    }
}

$routes = [
    'home' => 'front_home', 'archive' => 'front_archive', 'links' => 'front_links',
    'search' => 'front_search', 'feed' => 'front_feed', 'sitemap.xml' => 'front_sitemap',
    'sponsor' => 'front_sponsor',
    'town' => 'front_town', 'logs' => 'front_logs', 'moments' => 'front_moments',
    'music' => 'front_music', 'api/music' => 'api_music_proxy',
    'album' => 'front_album', 
    'api/comment' => 'api_comment', 'api/post-password' => 'api_post_password', 
    'api/captcha/new' => 'api_captcha_new', 'api/captcha/image' => 'api_captcha_image', 'api/check-link' => 'api_check_link', 
    'api/apply-link' => 'api_apply_link',
    'api/avatar' => 'api_avatar', 'api/ping' => 'api_ping', 
    'api/trace' => 'api_trace', 'api/sibling-post' => 'api_sibling_post',
    'api/feedback' => 'api_feedback', 'api/log-like' => 'api_log_like',
    'api/log-manage' => 'api_log_manage', 'api/user-profile' => 'api_user_profile',
    'api/user-like' => 'api_user_like',
    'api/home-posts' => 'api_home_posts',
    'api/category-posts' => 'api_category_posts',
    'api/tag-posts' => 'api_tag_posts',
    'api/oss-token' => 'api_oss_token', 'api/object-upload' => 'api_object_upload', 'api/upload-save-remote' => 'api_upload_save_remote', 'api/moments-publish' => 'api_moments_publish',
    'api/component/profile-card' => 'api_comp_profile_card',
    'api/component/online-modal' => 'api_comp_online_modal',
    'api/component/f12-warning'  => 'api_comp_f12_warning',
    'api/component/town-billboard' => 'api_comp_town_billboard',
    'api/component/minesweeper'  => 'api_comp_minesweeper',
    'admin/login' => 'admin_login_page',
    'admin/logout' => function() { admin_logout(); redirect('admin/login'); },
    'admin/firewall-settings' => function() { require ROOT . '/admin/firewall_settings.php'; }
];


access_log_record([
    'route_type' => $__route,
]);

if (isset($routes[$__route])) {
    $handler = $routes[$__route];
    is_callable($handler) ? $handler() : $handler();
} elseif (preg_match('#^post/([^/]+)$#', $__route, $m)) { front_post($m[1]);
} elseif (preg_match('#^page/([^/]+)$#', $__route, $m)) { front_page($m[1]);
} elseif (preg_match('#^category/([^/]+)$#', $__route, $m)) { front_category($m[1]);
} elseif (preg_match('#^tag/([^/]+)$#', $__route, $m)) { front_tag($m[1]);
} elseif (preg_match('#^legal/([^/]+)$#', $__route, $m)) { front_legal($m[1]);
} elseif (str_starts_with($__route, 'admin')) { route_admin();
} else { front_404(); }

function limhy_home_batch_size(): int {
    return 8;
}

function limhy_home_initial_post_limit(bool $hasPinnedBanner): int {
    $base = limhy_home_batch_size();
    if ($hasPinnedBanner) {
        return max(1, $base - 1);
    }
    return $base;
}

function limhy_build_home_post_view(array $post): array {
    $cover = get_post_cover_for_post($post);
    if (!$cover) {
        $cover = asset('img/logo.png');
    }

    $excerptSource = (string)($post['excerpt'] ?? '');
    if ($excerptSource === '') {
        $excerptSource = make_excerpt((string)($post['content'] ?? ''));
    }

    $coverEnabled = defined('POST_COVER_ENABLED') ? POST_COVER_ENABLED : 1;
    if ($coverEnabled === true) {
        $coverEnabled = 1;
    } elseif ($coverEnabled === false) {
        $coverEnabled = 0;
    }

    $hasRealImage = post_has_visual_cover($post);
    $showCover = ($coverEnabled == 1) || ($coverEnabled == 2 && $hasRealImage);

    return [
        'id' => (int)($post['id'] ?? 0),
        'title_html' => e((string)($post['title'] ?? '')),
        'url' => post_url($post),
        'excerpt_html' => e($excerptSource),
        'date_html' => fmt_date((string)($post['published_at'] ?? '')),
        'category_name_html' => $post['category_name'] ? e((string)$post['category_name']) : '',
        'category_id' => (int)($post['category_id'] ?? 0),
        'cover' => $cover,
        'show_cover' => $showCover,
    ];
}

function limhy_render_home_cards(array $posts): string {
    if (!$posts) {
        return '';
    }

    ob_start();
    foreach ($posts as $post) {
        $view = limhy_build_home_post_view($post);
        ?>
        <article class="post-card js-post-portal" data-id="<?= $view['id'] ?>" data-cat="<?= $view['category_id'] ?>">
            <?php if ($view['show_cover']): ?>
            <div class="post-cover-art">
                <div class="post-cover-img-box">
                    <img src="<?= e($view['cover']) ?>" alt="cover" loading="lazy" decoding="async" width="320" height="180">
                </div>
            </div>
            <?php endif; ?>
            <div class="post-content">
                <h2 class="post-title"><a href="<?= e($view['url']) ?>"><?= $view['title_html'] ?></a></h2>
                <div class="post-excerpt"><?= $view['excerpt_html'] ?></div>
                <div class="post-meta">
                    <span class="meta-date"><?= $view['date_html'] ?></span>
                    <?php if ($view['category_name_html'] !== ''): ?>
                        · <span class="meta-cat"><?= $view['category_name_html'] ?></span>
                    <?php endif; ?>
                </div>
            </div>
        </article>
        <?php
    }
    return (string)ob_get_clean();
}

function limhy_fetch_home_feed(int $offset, int $limit): array {
    $p = prefix();
    $offset = max(0, $offset);
    $limit = max(1, min(24, $limit));
    return db_rows("SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM `{$p}posts` p LEFT JOIN `{$p}categories` c ON p.category_id = c.id WHERE p.type = 'post' AND p.status IN ('published','private') AND p.published_at <= NOW() AND p.is_pinned = 0 ORDER BY p.published_at DESC LIMIT {$limit} OFFSET {$offset}");
}

function front_home(): void {
    global $p;
    $p = prefix();
    if (function_exists('limhy_ensure_post_custom_cover_column')) { limhy_ensure_post_custom_cover_column(); }

    $pinned = db_rows("SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM `{$p}posts` p LEFT JOIN `{$p}categories` c ON p.category_id = c.id WHERE p.type = 'post' AND p.status IN ('published','private') AND p.published_at <= NOW() AND p.is_pinned = 1 ORDER BY p.published_at DESC");
    $hasPinnedBanner = !empty($pinned);

    $initialLimit = limhy_home_initial_post_limit($hasPinnedBanner);
    $posts = limhy_fetch_home_feed(0, $initialLimit);
    $total = (int)db_val("SELECT COUNT(*) FROM `{$p}posts` WHERE `type`='post' AND `status` IN ('published','private') AND `published_at`<=NOW() AND `is_pinned` = 0");

    $feed = [
        'initial_limit' => $initialLimit,
        'batch_size' => limhy_home_batch_size(),
        'next_offset' => count($posts),
        'has_more' => $total > count($posts),
        'total' => $total,
        'endpoint' => url('api/home-posts'),
    ];

    render('home', ['title' => SITE_NAME, 'pinned' => $pinned, 'posts' => $posts, 'feed' => $feed]);
}

function front_post(string $slug): void {
    $slug = clean($slug, 200); $p = prefix();
    if (function_exists('limhy_ensure_post_custom_cover_column')) { limhy_ensure_post_custom_cover_column(); }
    $post = db_row("SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM `{$p}posts` p LEFT JOIN `{$p}categories` c ON p.category_id=c.id WHERE p.slug=? AND p.type='post' AND p.status IN ('published','private') AND p.published_at<=NOW() LIMIT 1", [$slug]);
    if (!$post) { front_404(); return; }
    if ($post['password'] !== '') {
        if (function_exists('clear_html_cache')) { clear_html_cache(); }
        if (!($_SESSION['post_unlock_'.$post['id']] ?? false) && !is_admin()) { render('post_password', ['post' => $post, 'title' => $post['title']]); return; }
    }
    if ($post['status'] === 'private' && !is_admin()) { front_404(); return; }
    $post['view_count']++;
    $tags = db_rows("SELECT t.* FROM `{$p}tags` t JOIN `{$p}post_tags` pt ON t.id=pt.tag_id WHERE pt.post_id=?", [$post['id']]);
    $commentPayload = $post['comment_enabled'] ? limhy_comment_pagination_payload((int)$post['id'], limhy_comment_page_param()) : ['items' => [], 'pager' => paginate(0, 1, limhy_comment_per_page())];
    $comments = $commentPayload['items'];
    $prevPost = db_row("SELECT `title`, `slug` FROM `{$p}posts` WHERE `type`='post' AND `status`='published' AND `published_at`<? AND `published_at`<=NOW() ORDER BY `published_at` DESC LIMIT 1", [$post['published_at']]);
    $nextPost = db_row("SELECT `title`, `slug` FROM `{$p}posts` WHERE `type`='post' AND `status`='published' AND `published_at`>? AND `published_at`<=NOW() ORDER BY `published_at` ASC LIMIT 1", [$post['published_at']]);
    render('post', ['title' => $post['title'], 'post' => $post, 'tags' => $tags, 'comments' => $comments, 'commentPager' => $commentPayload['pager'], 'prevPost' => $prevPost, 'nextPost' => $nextPost]);
}

function front_page(string $slug): void {
    $slug=clean($slug,200); $p=prefix();
    if (function_exists('limhy_ensure_post_custom_cover_column')) { limhy_ensure_post_custom_cover_column(); }
    $post=db_row("SELECT * FROM `{$p}posts` WHERE `slug`=? AND `type`='page' AND `status`='published' LIMIT 1",[$slug]);
    if(!$post){front_404();return;}
    $commentPayload=$post['comment_enabled'] ? limhy_comment_pagination_payload((int)$post['id'], limhy_comment_page_param()) : ['items'=>[], 'pager'=>paginate(0,1,limhy_comment_per_page())];
    $comments=$commentPayload['items'];
    render('page',['title'=>$post['title'],'post'=>$post,'comments'=>$comments,'commentPager'=>$commentPayload['pager']]);
}

function front_archive(): void {
    $p=prefix(); $posts=db_rows("SELECT `id`,`title`,`slug`,`published_at`,`comment_count` FROM `{$p}posts` WHERE `type`='post' AND `status`='published' AND `published_at`<=NOW() ORDER BY `published_at` DESC");
    $archive=[]; foreach($posts as $post){$year=date('Y',strtotime($post['published_at'])); $archive[$year][]=$post;}
    render('archive',['title'=>'归档','archive'=>$archive,'totalPosts'=>count($posts)]);
}

// ★ 核心重构：防抄袭，全量逻辑收束至后端控制器
function front_album(): void {
    $p = prefix();
    $posts = db_rows("SELECT `title`, `slug`, `type`, `content_html`, `published_at` FROM `{$p}posts` WHERE `status`='published' AND `published_at`<=NOW() ORDER BY `published_at` DESC");
    $photos = [];
    $flatPhotos = [];
    $globalIndex = 0;
    
    foreach ($posts as $post) {
        if (preg_match_all('/<img\s+[^>]*src=["\']([^"\']+)["\'][^>]*>/i', $post['content_html'], $matches)) {
            $ts = strtotime($post['published_at']);
            $y = (int)date('Y', $ts);
            $m = (int)date('n', $ts);
            $d = (int)date('j', $ts);
            
            $postUrl = ($post['type'] === 'page') ? url("page/{$post['slug']}") : post_url($post);

            foreach ($matches[1] as $src) {
                if (str_contains($src, 'ui-avatars') || str_contains($src, 'cravatar') || str_contains($src, 'emoticon')) continue;
                
                if (!isset($photos[$y])) $photos[$y] = [];
                if (!isset($photos[$y][$m])) $photos[$y][$m] = [];
                if (!isset($photos[$y][$m][$d])) $photos[$y][$m][$d] = [];
                
                $picNode = [
                    'src'   => $src,
                    'title' => e($post['title']),
                    'url'   => $postUrl,
                    'time'  => date('Y年n月j日 H:i', $ts),
                    'global_idx' => $globalIndex++
                ];
                
                $photos[$y][$m][$d][] = $picNode;
                $flatPhotos[] = $picNode;
            }
        }
    }
    // 纯净数据注入，彻底隔离核心逻辑
    render('album', ['title' => '相册集', 'photos' => $photos, 'flatPhotos' => $flatPhotos]);
}


function limhy_fetch_category_feed(int $categoryId, int $offset, int $limit): array {
    $p = prefix();
    $offset = max(0, $offset);
    $limit = max(1, min(24, $limit));
    return db_rows("SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM `{$p}posts` p LEFT JOIN `{$p}categories` c ON p.category_id = c.id WHERE p.type='post' AND p.status='published' AND p.category_id=? AND p.published_at<=NOW() ORDER BY p.published_at DESC LIMIT {$limit} OFFSET {$offset}", [$categoryId]);
}

function limhy_fetch_tag_feed(int $tagId, int $offset, int $limit): array {
    $p = prefix();
    $offset = max(0, $offset);
    $limit = max(1, min(24, $limit));
    return db_rows("SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM `{$p}posts` p JOIN `{$p}post_tags` pt ON p.id=pt.post_id LEFT JOIN `{$p}categories` c ON p.category_id=c.id WHERE p.type='post' AND p.status='published' AND pt.tag_id=? AND p.published_at<=NOW() ORDER BY p.published_at DESC LIMIT {$limit} OFFSET {$offset}", [$tagId]);
}

function limhy_list_batch_size(): int {
    return max(1, (int)(defined('POSTS_PER_PAGE') ? POSTS_PER_PAGE : 10));
}

function front_category(string $slug): void {
    $slug=clean($slug,50); $p=prefix();
    $cat=db_row("SELECT * FROM `{$p}categories` WHERE `slug`=? LIMIT 1",[$slug]); if(!$cat){front_404();return;}
    $perPage = limhy_list_batch_size();
    $total=(int)db_val("SELECT COUNT(*) FROM `{$p}posts` WHERE `type`='post' AND `status`='published' AND `category_id`=? AND `published_at`<=NOW()",[$cat['id']]);
    $posts=limhy_fetch_category_feed((int)$cat['id'], 0, $perPage);
    $feed = [
        'batch_size' => $perPage,
        'next_offset' => count($posts),
        'has_more' => $total > count($posts),
        'total' => $total,
        'endpoint' => url('api/category-posts'),
        'query_key' => 'category',
        'query_value' => (string)$cat['slug'],
    ];
    $pager=paginate($total,1,$perPage);
    render('category',['title'=>$cat['name'],'category'=>$cat,'posts'=>$posts,'pager'=>$pager,'feed'=>$feed]);
}

function front_tag(string $slug): void {
    $slug=clean($slug,50); $p=prefix();
    $tag=db_row("SELECT * FROM `{$p}tags` WHERE `slug`=? LIMIT 1",[$slug]); if(!$tag){front_404();return;}
    $perPage = limhy_list_batch_size();
    $total=(int)db_val("SELECT COUNT(*) FROM `{$p}posts` p JOIN `{$p}post_tags` pt ON p.id=pt.post_id WHERE p.type='post' AND p.status='published' AND pt.tag_id=? AND p.published_at<=NOW()",[$tag['id']]);
    $posts=limhy_fetch_tag_feed((int)$tag['id'], 0, $perPage);
    $feed = [
        'batch_size' => $perPage,
        'next_offset' => count($posts),
        'has_more' => $total > count($posts),
        'total' => $total,
        'endpoint' => url('api/tag-posts'),
        'query_key' => 'tag',
        'query_value' => (string)$tag['slug'],
    ];
    $pager=paginate($total,1,$perPage);
    render('tag',['title'=>'#'.$tag['name'],'tag'=>$tag,'posts'=>$posts,'pager'=>$pager,'feed'=>$feed]);
}

function front_search(): void {
    $q = clean($_GET['q'] ?? '', 100);
    $p = prefix();
    $posts = [];

    if (mb_strlen($q) >= 2) {
        $ip = client_ip();
        $rateFile = ROOT . '/data/firewall/search_rate_' . md5($ip) . '.php';
        $now = time();
        $rateData = @include $rateFile;
        if (is_array($rateData) && $now - (($rateData['time'] ?? 0)) < 10) {
            if ((int)($rateData['count'] ?? 0) >= 3) {
                render('search', ['title' => '搜索太频繁', 'q' => '请求过快，请休息10秒再试', 'posts' => []]);
                return;
            }
            $rateData['count'] = (int)($rateData['count'] ?? 0) + 1;
        } else {
            $rateData = ['time' => $now, 'count' => 1];
        }
        @file_put_contents($rateFile, '<?php return ' . var_export($rateData, true) . ';');

        $like = '%' . $q . '%';
        $likeSql = "SELECT p.*, c.name AS category_name, c.slug AS category_slug,
            ((CASE WHEN p.title LIKE ? THEN 4 ELSE 0 END) +
             (CASE WHEN p.excerpt LIKE ? THEN 2 ELSE 0 END) +
             (CASE WHEN p.content LIKE ? THEN 1 ELSE 0 END) +
             (CASE WHEN c.name LIKE ? THEN 1 ELSE 0 END)) AS relevance
            FROM `{$p}posts` p
            LEFT JOIN `{$p}categories` c ON p.category_id = c.id
            WHERE p.type = 'post' AND p.status = 'published' AND p.published_at <= NOW()
              AND (p.title LIKE ? OR p.excerpt LIKE ? OR p.content LIKE ? OR c.name LIKE ?)
            ORDER BY relevance DESC, p.published_at DESC
            LIMIT 30";
        $likeParams = [$like, $like, $like, $like, $like, $like, $like, $like];

        try {
            if (limhy_table_has_fulltext_index($p . 'posts', ['title', 'content'])) {
                $posts = db_rows(
                    "SELECT p.*, c.name AS category_name, c.slug AS category_slug,
                        MATCH(p.title, p.content) AGAINST(? IN BOOLEAN MODE) AS relevance
                     FROM `{$p}posts` p
                     LEFT JOIN `{$p}categories` c ON p.category_id = c.id
                     WHERE p.type = 'post' AND p.status = 'published' AND p.published_at <= NOW()
                       AND MATCH(p.title, p.content) AGAINST(? IN BOOLEAN MODE)
                     ORDER BY relevance DESC, p.published_at DESC
                     LIMIT 30",
                    [$q, $q]
                );
            } else {
                $posts = db_rows($likeSql, $likeParams);
            }
        } catch (\Throwable $e) {
            try {
                $posts = db_rows($likeSql, $likeParams);
            } catch (\Throwable $fallbackError) {
                log_exception($fallbackError);
                $posts = [];
            }
            log_exception($e);
        }
    }

    render('search', ['title' => '搜索：' . $q, 'q' => $q, 'posts' => $posts]);
}

function front_links(): void { 
    $p=prefix(); 
    $links=db_rows("SELECT * FROM `{$p}links` WHERE `visible`=1 ORDER BY `sort_order` ASC,`id` ASC"); 
    render('links',[
        'title'=>'友情链接',
        'links'=>$links,
        'friendSiteName'=>(string) limhy_site_setting('LINK_PAGE_SITE_NAME', defined('SITE_NAME') ? SITE_NAME : ''),
        'friendSiteUrl'=>(string) limhy_site_setting('LINK_PAGE_SITE_URL', defined('SITE_URL') ? SITE_URL : ''),
        'friendSiteDesc'=>(string) limhy_site_setting('LINK_PAGE_SITE_DESC', defined('SITE_DESC') ? SITE_DESC : ''),
        'friendSiteAvatar'=>(string) limhy_site_setting('LINK_PAGE_SITE_AVATAR', defined('SITE_LOGO') ? SITE_LOGO : ''),
        'friendSiteRss'=>(string) limhy_site_setting('LINK_PAGE_SITE_RSS', rtrim((defined('SITE_URL') ? SITE_URL : ''), '/') . '/feed?raw=1'),
        'friendApplyHtml'=>(string) limhy_site_setting('LINK_PAGE_APPLY_HTML', '<p>申请前请确保贵站可正常访问、内容合规、已添加本站友情链接。</p>')
    ]); 
}

function front_sponsor(): void {
    $qrUrl = defined('SPONSOR_QR') ? SPONSOR_QR : '';
    $costText = limhy_site_setting('SPONSOR_COST', defined('SPONSOR_COST') ? SPONSOR_COST : '暂无数据');
    
    $jsonFile = ROOT . '/data/sponsors.json';
    $sponsors = file_exists($jsonFile) ? json_decode(file_get_contents($jsonFile), true) : [];
    if (!is_array($sponsors)) $sponsors = [];

    render('sponsor', [
        'title' => '赞赏与支持',
        'qrUrl' => $qrUrl,
        'costText' => $costText,
        'sponsors' => $sponsors
    ]);
}

function front_feed(): void {
    $accept = strtolower((string)($_SERVER['HTTP_ACCEPT'] ?? ''));
    $raw = isset($_GET['raw']) && $_GET['raw'] === '1';
    $prefersHtml = $accept === '' || str_contains($accept, 'text/html');
    if (!$raw && $prefersHtml) {
        header('Content-Type: text/html; charset=utf-8');
        echo render_feed_preview();
        exit;
    }
    header('Content-Type: application/rss+xml; charset=utf-8');
    echo generate_rss();
    exit;
}
function front_sitemap(): void { header('Content-Type: application/xml; charset=utf-8'); echo generate_sitemap(); exit; }
function front_404(): void { http_response_code(404); render('404',['title'=>'页面不存在']); }
function front_legal(string $page): void { $map = ['user'=>['tpl'=>'legal_user','title'=>'用户协议'],'privacy'=>['tpl'=>'legal_privacy','title'=>'隐私政策'],'copyright'=>['tpl'=>'legal_copyright','title'=>'原创声明']]; if(isset($map[$page])) render($map[$page]['tpl'],['title'=>$map[$page]['title']]); else front_404(); }
function front_town(): void { $env = get_town_env_data(); render('town', ['title' => '博客小镇', 'env' => $env]); }

function front_logs(): void {
    $p = prefix();
    try { db_val("SELECT 1 FROM `{$p}logs` LIMIT 1"); } catch (\Throwable $e) {
        db_exec("CREATE TABLE IF NOT EXISTS `{$p}logs` ( `id` int(11) NOT NULL AUTO_INCREMENT, `title` varchar(255) NOT NULL, `content` text NOT NULL, `likes` int(11) DEFAULT 0, `created_at` datetime NOT NULL, PRIMARY KEY (`id`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        db_exec("CREATE TABLE IF NOT EXISTS `{$p}feedbacks` ( `id` int(11) NOT NULL AUTO_INCREMENT, `author` varchar(100) NOT NULL, `content` text NOT NULL, `status` varchar(20) DEFAULT 'pending', `created_at` datetime NOT NULL, PRIMARY KEY (`id`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
        db_exec("CREATE TABLE IF NOT EXISTS `{$p}log_likes` ( `log_id` int(11) NOT NULL, `ip` varchar(50) NOT NULL, PRIMARY KEY (`log_id`,`ip`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    }
    $logs = db_rows("SELECT * FROM `{$p}logs` ORDER BY `created_at` DESC");
    $feedbacks = db_rows("SELECT * FROM `{$p}feedbacks` WHERE `status` = 'approved' ORDER BY `created_at` DESC LIMIT 10");
    $pending_feedbacks = is_admin() ? db_rows("SELECT * FROM `{$p}feedbacks` WHERE `status` = 'pending' ORDER BY `created_at` ASC") : [];
    $ip = client_ip(); $likes = db_rows("SELECT `log_id` FROM `{$p}log_likes` WHERE `ip` = ?", [$ip]);
    render('logs', ['title' => '更新升级与反馈', 'logs' => $logs, 'feedbacks' => $feedbacks, 'pending_feedbacks' => $pending_feedbacks, 'likesData' => array_column($likes, 'log_id')]);
}


function limhy_fetch_freshrss_feeds(): array {
    $user = defined('FRESHRSS_USER') ? trim((string)FRESHRSS_USER) : '';
    $password = defined('FRESHRSS_PASSWORD') ? trim((string)FRESHRSS_PASSWORD) : '';
    $apiBase = defined('FRESHRSS_API_URL') ? rtrim((string)FRESHRSS_API_URL, '/') : '';
    if ($user === '' || $password === '' || $apiBase === '' || !function_exists('curl_init')) {
        return [];
    }
    $cacheFile = ROOT . '/data/freshrss_cache.json';
    if (is_file($cacheFile) && (time() - filemtime($cacheFile) < 900)) {
        $cached = json_decode((string)@file_get_contents($cacheFile), true);
        if (is_array($cached)) {
            return $cached;
        }
    }
    $loginUrl = $apiBase . '/accounts/ClientLogin?Email=' . rawurlencode($user) . '&Passwd=' . rawurlencode($password);
    $ch = curl_init($loginUrl);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_SSL_VERIFYPEER => false, CURLOPT_USERAGENT => 'LiMhy/FreshRSS']);
    $loginResponse = (string)curl_exec($ch);
    curl_close($ch);
    if ($loginResponse === '' || strpos($loginResponse, 'Auth=') === false) {
        return [];
    }
    $authToken = trim(substr($loginResponse, strpos($loginResponse, 'Auth=') + 5));
    if ($authToken === '') {
        return [];
    }
    $headers = ['Authorization: GoogleLogin auth=' . $authToken];
    $ch = curl_init($apiBase . '/reader/api/0/stream/contents/reading-list?&n=80');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_SSL_VERIFYPEER => false, CURLOPT_USERAGENT => 'LiMhy/FreshRSS', CURLOPT_HTTPHEADER => $headers]);
    $articlesResponse = (string)curl_exec($ch);
    curl_close($ch);
    $ch = curl_init($apiBase . '/reader/api/0/subscription/list?output=json');
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 4, CURLOPT_SSL_VERIFYPEER => false, CURLOPT_USERAGENT => 'LiMhy/FreshRSS', CURLOPT_HTTPHEADER => $headers]);
    $subscriptionsResponse = (string)curl_exec($ch);
    curl_close($ch);
    $articles = json_decode($articlesResponse, true);
    $subscriptions = json_decode($subscriptionsResponse, true);
    if (!is_array($articles) || !isset($articles['items']) || !is_array($articles['items'])) {
        return [];
    }
    $subscriptionMap = [];
    if (is_array($subscriptions) && isset($subscriptions['subscriptions']) && is_array($subscriptions['subscriptions'])) {
        foreach ($subscriptions['subscriptions'] as $subscription) {
            $streamId = (string)($subscription['id'] ?? '');
            if ($streamId !== '') {
                $subscriptionMap[$streamId] = $subscription;
            }
        }
    }
    usort($articles['items'], static function(array $a, array $b): int {
        return (int)($b['published'] ?? 0) <=> (int)($a['published'] ?? 0);
    });
    $feeds = [];
    foreach ($articles['items'] as $article) {
        $summaryHtml = (string)($article['summary']['content'] ?? '');
        $desc = trim(strip_tags(html_entity_decode($summaryHtml, ENT_QUOTES, 'UTF-8')));
        if (mb_strlen($desc) > 100) {
            $desc = mb_substr($desc, 0, 100) . '...';
        }
        $streamId = (string)($article['origin']['streamId'] ?? '');
        $subscription = $subscriptionMap[$streamId] ?? [];
        $iconUrl = (string)($subscription['iconUrl'] ?? '');
        if ($iconUrl !== '' && strpos($iconUrl, 'http') !== 0) {
            $iconUrl = rtrim($apiBase, '/') . '/' . ltrim($iconUrl, '/');
        }
        $published = (int)($article['published'] ?? time());
        $feeds[] = ['title' => (string)($article['title'] ?? '未命名订阅项'), 'link' => (string)($article['alternate'][0]['href'] ?? '#'), 'is_new' => date('Ymd', $published) === date('Ymd'), 'source_title' => (string)($article['origin']['title'] ?? 'FreshRSS'), 'description' => $desc, 'time' => date('Y-m-d H:i', $published), 'icon' => $iconUrl];
        if (count($feeds) >= 20) {
            break;
        }
    }
    if ($feeds !== []) {
        @file_put_contents($cacheFile, json_encode($feeds, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT), LOCK_EX);
    }
    return $feeds;
}

function limhy_fetch_agg_feeds(): array {
    $provider = defined('AGGREGATOR_PROVIDER') ? trim((string)AGGREGATOR_PROVIDER) : 'moments';
    if ($provider === 'freshrss') {
        return limhy_fetch_freshrss_feeds();
    }
    $uid = defined('MOMENTS_UID') ? MOMENTS_UID : '';
    $token = defined('MOMENTS_TOKEN') ? MOMENTS_TOKEN : '';
    if ($uid === '' || $token === '' || !function_exists('curl_init')) {
        return [];
    }
    $agg_feeds = [];
    $apiUrl = "https://lilog.cn/is/index.php?action=get_user_feeds&uid={$uid}&token={$token}&limit=40";
    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $apiUrl);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_TIMEOUT, 2);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);
    curl_setopt($ch, CURLOPT_USERAGENT, 'LiMyhBlog/ServerSide (Bot)');
    $res = @curl_exec($ch);
    curl_close($ch);
    if ($res) {
        $data = json_decode((string)$res, true);
        if ($data && isset($data['status']) && $data['status'] === 'success') {
            $rawFeeds = $data['data'] ?? [];
            $sourceCount = [];
            $today = date('Ymd');
            foreach ($rawFeeds as $item) {
                $source = $item['source_title'] ?? 'Unknown';
                if (!isset($sourceCount[$source])) $sourceCount[$source] = 0;
                if ($sourceCount[$source] < 2) {
                    $agg_feeds[] = ['title' => $item['title'], 'link' => $item['link'], 'is_new' => (date('Ymd', (int)$item['timestamp']) === $today), 'source_title' => $source];
                    $sourceCount[$source]++;
                }
            }
        }
    }
    return $agg_feeds;
}

function front_moments(): void {
    $p = prefix();
    try { db_val("SELECT 1 FROM `{$p}moments` LIMIT 1"); } catch (\Throwable $e) {
        db_exec("CREATE TABLE IF NOT EXISTS `{$p}moments` ( `id` int(11) NOT NULL AUTO_INCREMENT, `content` text NOT NULL, `images` text DEFAULT NULL, `created_at` datetime NOT NULL, PRIMARY KEY (`id`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;");
    }
    
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = 15;
    $total = (int)db_val("SELECT COUNT(*) FROM `{$p}moments`");
    $pager = paginate($total, $page, $perPage);
    $moments = db_rows("SELECT * FROM `{$p}moments` ORDER BY `created_at` DESC LIMIT {$pager['per_page']} OFFSET {$pager['offset']}");
    
    $adminUser = db_row("SELECT `screen_name`, `mail` FROM `{$p}users` WHERE `role` = 'admin' LIMIT 1");
    $adminName = $adminUser['screen_name'] ?? (defined('SITE_AUTHOR') ? SITE_AUTHOR : '博主');
    $adminEmail = $adminUser['mail'] ?? (defined('ADMIN_EMAIL') ? ADMIN_EMAIL : 'mrjyc520@qq.com');
    if (!function_exists('get_avatar_url')) require_once ROOT . '/core/helpers.php';
    $adminAvatar = get_avatar_url($adminEmail, $adminName);
    
    $agg_feeds = limhy_fetch_agg_feeds();

    render('moments', [ 'title' => '我的动态', 'moments' => $moments, 'pager' => $pager, 'agg_feeds' => $agg_feeds, 'adminName' => $adminName, 'adminAvatar' => $adminAvatar ]);
}

function front_music(): void {
    $quotes = [ "生活也要像动听的旋律有趣~", "音乐是治愈灵魂的处方药~", "耳机一戴，谁都不爱，尽情享受吧~", "把烦恼调成静音，把快乐放大~" ];
    $quote = $quotes[array_rand($quotes)];
    render('music', [ 'title' => '音乐台', 'quote' => $quote ]);
}

function api_home_posts(): void {
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $limit = max(1, min(24, (int)($_GET['limit'] ?? limhy_home_batch_size())));
    $posts = limhy_fetch_home_feed($offset, $limit);
    $total = (int)db_val("SELECT COUNT(*) FROM `" . prefix() . "posts` WHERE `type`='post' AND `status` IN ('published','private') AND `published_at`<=NOW() AND `is_pinned` = 0");
    $nextOffset = $offset + count($posts);

    echo json_encode([
        'ok' => true,
        'html' => limhy_render_home_cards($posts),
        'has_more' => $nextOffset < $total,
        'next_offset' => $nextOffset,
        'count' => count($posts),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}


function api_category_posts(): void {
    if (!is_ajax()) {
        redirect('');
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

    $slug = clean((string)($_GET['category'] ?? ''), 50);
    if ($slug === '') {
        echo json_encode(['ok' => false, 'error' => '分类参数缺失'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
    $p = prefix();
    $category = db_row("SELECT * FROM `{$p}categories` WHERE `slug`=? LIMIT 1", [$slug]);
    if (!$category) {
        echo json_encode(['ok' => false, 'error' => '分类不存在'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $limit = max(1, min(24, (int)($_GET['limit'] ?? limhy_list_batch_size())));
    $posts = limhy_fetch_category_feed((int)$category['id'], $offset, $limit);
    $total = (int)db_val("SELECT COUNT(*) FROM `{$p}posts` WHERE `type`='post' AND `status`='published' AND `category_id`=? AND `published_at`<=NOW()", [(int)$category['id']]);
    $nextOffset = $offset + count($posts);

    echo json_encode([
        'ok' => true,
        'html' => limhy_render_home_cards($posts),
        'has_more' => $nextOffset < $total,
        'next_offset' => $nextOffset,
        'count' => count($posts),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function api_tag_posts(): void {
    if (!is_ajax()) {
        redirect('');
    }
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');

    $slug = clean((string)($_GET['tag'] ?? ''), 50);
    if ($slug === '') {
        echo json_encode(['ok' => false, 'error' => '标签参数缺失'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }
    $p = prefix();
    $tag = db_row("SELECT * FROM `{$p}tags` WHERE `slug`=? LIMIT 1", [$slug]);
    if (!$tag) {
        echo json_encode(['ok' => false, 'error' => '标签不存在'], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    $offset = max(0, (int)($_GET['offset'] ?? 0));
    $limit = max(1, min(24, (int)($_GET['limit'] ?? limhy_list_batch_size())));
    $posts = limhy_fetch_tag_feed((int)$tag['id'], $offset, $limit);
    $total = (int)db_val("SELECT COUNT(*) FROM `{$p}posts` p JOIN `{$p}post_tags` pt ON p.id=pt.post_id WHERE p.type='post' AND p.status='published' AND pt.tag_id=? AND p.published_at<=NOW()", [(int)$tag['id']]);
    $nextOffset = $offset + count($posts);

    echo json_encode([
        'ok' => true,
        'html' => limhy_render_home_cards($posts),
        'has_more' => $nextOffset < $total,
        'next_offset' => $nextOffset,
        'count' => count($posts),
    ], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function api_music_proxy(): void {
    if (!is_ajax()) exit;
    header('Content-Type: application/json; charset=utf-8');
    
    $action = $_POST['action'] ?? '';
    $apiUrlBase = 'https://music-api.gdstudio.xyz/api.php';
    $defaultCover = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0NSIgZmlsbD0iIzIyMiIvPjxjaXJjbGUgY3g9IjUwIiBjeT0iNTAiIHI9IjE1IiBmaWxsPSIjZWVlIi8+PGNpcmNsZSBjeD0iNTAiIGN5PSI1MCIIGN5PSI1MCIgcj0iNSIgZmlsbD0iIzExMSIvPjwvc3ZnPg==';

    if ($action === 'search') {
        $keyword = clean($_POST['keyword'] ?? '', 100);
        if (!$keyword) { echo json_encode(['ok'=>false, 'html'=>'<div class="music-loading">请输入歌名</div>']); exit; }
        
        $ip = client_ip();
        $rateFile = ROOT . '/data/firewall/music_rate_' . md5($ip) . '.php';
        $now = time();
        $rateData = @include $rateFile;
        if (is_array($rateData) && $now - $rateData['time'] < 60) {
            if ($rateData['count'] >= 10) { echo json_encode(['ok'=>true, 'html'=>'<div class="music-loading" style="color:#ef4444;">搜得太快啦，请休息 1 分钟</div>']); exit; }
            $rateData['count']++;
        } else { $rateData = ['time' => $now, 'count' => 1]; }
        @file_put_contents($rateFile, '<?php return ' . var_export($rateData, true) . ';');
        
        $targetUrl = $apiUrlBase . '?types=search&source=netease&count=15&name=' . urlencode($keyword);
        $res = @file_get_contents($targetUrl);
        $data = json_decode((string)$res, true);
        
        if (empty($data) || !is_array($data)) { echo json_encode(['ok'=>true, 'html'=>'<div class="music-loading">未找到相关歌曲</div>']); exit; }

        $neteaseIds = [];
        foreach ($data as $song) { if (($song['source'] ?? 'netease') === 'netease' && !empty($song['id'])) { $neteaseIds[] = $song['id']; } }
        $covers = [];
        if (!empty($neteaseIds)) {
            $idsJson = urlencode('[' . implode(',', $neteaseIds) . ']');
            $wyUrl = "https://music.163.com/api/song/detail/?id={$neteaseIds[0]}&ids={$idsJson}";
            $ctx = stream_context_create(['http' => ['header' => "User-Agent: Mozilla/5.0\r\nTimeout: 2\r\n"]]);
            $wyRes = @file_get_contents($wyUrl, false, $ctx);
            if ($wyRes) {
                $wyData = json_decode($wyRes, true);
                if (!empty($wyData['songs'])) {
                    foreach ($wyData['songs'] as $wsong) { if (!empty($wsong['album']['picUrl'])) { $covers[$wsong['id']] = str_replace('http://', 'https://', $wsong['album']['picUrl']) . '?param=150y150'; } }
                }
            }
        }

        $html = '';
        foreach ($data as $song) {
            $id = e((string)$song['id']); $name = e($song['name']);
            $artist = is_array($song['artist']) ? e(implode(' / ', $song['artist'])) : e($song['artist']);
            $picId = e((string)($song['pic_id'] ?? '')); $source = e((string)($song['source'] ?? 'netease'));
            $realCover = $covers[$song['id']] ?? $defaultCover;

            $html .= '<div class="music-item js-music-play" data-id="'.$id.'" data-src="'.$source.'" data-name="'.$name.'" data-artist="'.$artist.'" data-cover="'.$realCover.'" data-pic="'.$picId.'"><img src="'.$realCover.'" class="music-item-cover" onerror="this.src=\''.$defaultCover.'\'" loading="lazy" decoding="async"><div class="music-item-info"><div class="music-item-name">'.$name.'</div><div class="music-item-artist">'.$artist.'</div></div><img src="/assets/img/bf.svg" class="music-item-play-btn" loading="lazy" decoding="async"></div>';
        }
        echo json_encode(['ok'=>true, 'html'=>$html]); exit;
    } 
    elseif ($action === 'get_url') {
        $id = preg_replace('/[^a-zA-Z0-9_\-\.]/', '', $_POST['id'] ?? '');
        $source = preg_replace('/[^a-zA-Z0-9_]/', '', $_POST['source'] ?? 'netease');
        $picId = preg_replace('/[^a-zA-Z0-9_\-\.]/', '', $_POST['pic_id'] ?? '');
        if (!$id) exit;

        $targetUrl = $apiUrlBase . "?types=url&source={$source}&id={$id}&br=320";
        $res = @file_get_contents($targetUrl);
        $data = json_decode((string)$res, true);
        
        $hdCover = $_POST['cover'] ?? '';
        
        if ($source === 'netease' && strpos($hdCover, 'svg+xml') !== false) {
            $ctx = stream_context_create(['http' => ['header' => "User-Agent: Mozilla/5.0\r\nTimeout: 2\r\n"]]);
            $wyRes = @file_get_contents("https://music.163.com/api/song/detail/?id={$id}&ids=[{$id}]", false, $ctx);
            if ($wyRes) {
                $wyData = json_decode($wyRes, true);
                if (!empty($wyData['songs'][0]['album']['picUrl'])) { $hdCover = str_replace('http://', 'https://', $wyData['songs'][0]['album']['picUrl']) . '?param=500y500'; }
            }
        } elseif ($picId && strpos($hdCover, 'svg+xml') !== false) {
            $picRes = @file_get_contents($apiUrlBase . "?types=pic&source={$source}&size=500&id={$picId}");
            $picData = json_decode((string)$picRes, true);
            if (!empty($picData['url'])) $hdCover = $picData['url'];
        }

        if (isset($data['url'])) { echo json_encode(['ok'=>true, 'url'=>$data['url'], 'cover'=>$hdCover]); } else { echo json_encode(['ok'=>false, 'error'=>'无法获取播放链接']); }
        exit;
    }
}


function link_apply_registry_file(): string {
    $dir = ROOT . '/data/firewall';
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    return $dir . '/link_apply_registry.json';
}
function link_apply_registry_read(): array {
    $file = link_apply_registry_file();
    if (!is_file($file)) return [];
    $raw = @file_get_contents($file);
    $data = json_decode((string)$raw, true);
    return is_array($data) ? $data : [];
}
function link_apply_registry_write(array $data): void {
    @file_put_contents(link_apply_registry_file(), json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT));
}
function link_apply_normalize_domain(string $url): string {
    $host = strtolower((string)(parse_url($url, PHP_URL_HOST) ?: ''));
    return preg_replace('/^www\./i', '', trim($host));
}
function link_apply_client_guid(): string {
    return clean($_COOKIE['lm_guid'] ?? '', 120);
}

function link_apply_server_log(string $message, array $context = []): void {
    $dir = ROOT . '/data/runtime';
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    $line = '[' . date('Y-m-d H:i:s') . '] ' . $message;
    if ($context) {
        $json = json_encode($context, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        if ($json !== false) { $line .= ' ' . $json; }
    }
    @file_put_contents($dir . '/link_apply_errors.log', $line . PHP_EOL, FILE_APPEND);
}

function link_apply_emit_json(array $payload): void {
    while (ob_get_level() > 0) { @ob_end_clean(); }
    header_remove('Content-Length');
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (session_status() === PHP_SESSION_ACTIVE) { @session_write_close(); }
    if (function_exists('fastcgi_finish_request')) { @fastcgi_finish_request(); }
    elseif (function_exists('litespeed_finish_request')) { @litespeed_finish_request(); }
    else { @flush(); }
}

function link_apply_ensure_table_columns(string $p): void {
    static $done = false;
    if ($done) return;
    $done = true;
    try {
        $cols = db_rows("SHOW COLUMNS FROM `{$p}links`");
        $have = [];
        foreach ($cols as $col) {
            $name = (string)($col['Field'] ?? '');
            if ($name !== '') $have[$name] = true;
        }
        if (!isset($have['desc'])) {
            @db_exec("ALTER TABLE `{$p}links` ADD COLUMN `desc` varchar(255) DEFAULT '' AFTER `url`");
        }
        if (!isset($have['logo'])) {
            @db_exec("ALTER TABLE `{$p}links` ADD COLUMN `logo` varchar(500) DEFAULT '' AFTER `desc`");
        }
        if (!isset($have['status'])) {
            @db_exec("ALTER TABLE `{$p}links` ADD COLUMN `status` tinyint(1) DEFAULT 0 AFTER `logo`");
        }
        if (!isset($have['visible'])) {
            @db_exec("ALTER TABLE `{$p}links` ADD COLUMN `visible` tinyint(1) DEFAULT 0 AFTER `status`");
        }
        if (!isset($have['sort_order'])) {
            @db_exec("ALTER TABLE `{$p}links` ADD COLUMN `sort_order` int(11) DEFAULT 0 AFTER `visible`");
        }
    } catch (\Throwable $e) {
        link_apply_server_log('ensure_links_schema_failed', ['message' => $e->getMessage()]);
    }
}

function api_apply_link(): void {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        link_apply_emit_json(['ok' => false, 'error' => '请求方式错误']);
        exit;
    }
    if (!is_ajax()) {
        link_apply_emit_json(['ok' => false, 'error' => '请求来源异常']);
        exit;
    }

    $name = clean($_POST['name'] ?? '', 100);
    $url = clean($_POST['url'] ?? '', 500);
    $desc = clean($_POST['desc'] ?? '', 255);
    $logo = clean($_POST['avatar'] ?? '', 500);
    $captchaToken = clean($_POST['captcha_token'] ?? '', 80);
    $userCode = clean($_POST['captcha'] ?? '', 20);

    if ($name === '' || $url === '') {
        link_apply_emit_json(['ok' => false, 'error' => '网站名称与链接必须填写']);
        exit;
    }
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        link_apply_emit_json(['ok' => false, 'error' => '网站链接格式不合法 (需含 http/https)']);
        exit;
    }

    try {
        $verify = captcha_verify_ticket($captchaToken, $userCode, 'link', client_ip());
    } catch (\Throwable $e) {
        link_apply_server_log('captcha_verify_exception', ['message' => $e->getMessage()]);
        link_apply_emit_json(['ok' => false, 'error' => '安全验证码校验异常，请刷新后重试']);
        exit;
    }
    if (!$verify['ok']) {
        $error = '安全验证码核对失败';
        if (($verify['reason'] ?? '') === 'expired') $error = '验证码已过期，请刷新后重试';
        elseif (in_array(($verify['reason'] ?? ''), ['missing','used','form_mismatch'], true)) $error = '验证码已失效，请重新获取';
        elseif (($verify['reason'] ?? '') === 'ip_mismatch') $error = '网络环境变化，请刷新验证码后重试';
        link_apply_emit_json(['ok' => false, 'error' => $error]);
        exit;
    }

    $domain = link_apply_normalize_domain($url);
    if ($domain === '') {
        link_apply_emit_json(['ok' => false, 'error' => '无法识别网站域名，请检查链接']);
        exit;
    }
    $ip = client_ip();
    $guid = link_apply_client_guid();
    $ua = substr((string)($_SERVER['HTTP_USER_AGENT'] ?? ''), 0, 500);

    try {
        if (class_exists('Firewall')) {
            if ($ip !== '' && method_exists('Firewall', 'isBanned') && Firewall::isBanned($ip)) {
                link_apply_emit_json(['ok' => false, 'error' => '当前 IP 已被限制提交']);
                exit;
            }
            if ($guid !== '' && method_exists('Firewall', 'isGuidBanned') && Firewall::isGuidBanned($guid)) {
                link_apply_emit_json(['ok' => false, 'error' => '当前设备已被限制提交']);
                exit;
            }
        }
    } catch (\Throwable $e) {
        link_apply_server_log('firewall_check_failed', ['message' => $e->getMessage(), 'ip' => $ip, 'guid' => $guid]);
    }

    $p = prefix();
    link_apply_ensure_table_columns($p);

    try {
        $rows = db_rows("SELECT `id`,`url` FROM `{$p}links`");
    } catch (\Throwable $e) {
        link_apply_server_log('links_select_failed', ['message' => $e->getMessage()]);
        link_apply_emit_json(['ok' => false, 'error' => '友情链接数据表读取失败']);
        exit;
    }
    foreach ($rows as $row) {
        $rowDomain = link_apply_normalize_domain((string)($row['url'] ?? ''));
        if ($rowDomain !== '' && $rowDomain === $domain) {
            link_apply_emit_json(['ok' => false, 'error' => '该域名已提交过友链申请，请勿重复提交']);
            exit;
        }
    }

    try {
        $registry = link_apply_registry_read();
        if (isset($registry[$domain])) {
            link_apply_emit_json(['ok' => false, 'error' => '该域名已提交过友链申请，请勿重复提交']);
            exit;
        }
    } catch (\Throwable $e) {
        $registry = [];
        link_apply_server_log('registry_read_failed', ['message' => $e->getMessage(), 'domain' => $domain]);
    }

    try {
        db_exec("INSERT INTO `{$p}links` (`name`, `url`, `desc`, `logo`, `visible`, `sort_order`, `status`) VALUES (?, ?, ?, ?, 0, 0, 0)", [$name, $url, $desc, $logo]);
    } catch (\Throwable $e) {
        link_apply_server_log('links_insert_failed', ['message' => $e->getMessage(), 'domain' => $domain, 'url' => $url]);
        link_apply_emit_json(['ok' => false, 'error' => '友链申请写入失败，请稍后重试']);
        exit;
    }

    link_apply_emit_json(['ok' => true]);

    try {
        $registry[$domain] = [
            'domain' => $domain,
            'name' => $name,
            'url' => $url,
            'desc' => $desc,
            'logo' => $logo,
            'ip' => $ip,
            'guid' => $guid,
            'ua' => $ua,
            'created_at' => date('Y-m-d H:i:s'),
            'status' => 'pending',
        ];
        link_apply_registry_write($registry);
    } catch (\Throwable $e) {
        link_apply_server_log('registry_write_failed', ['message' => $e->getMessage(), 'domain' => $domain, 'ip' => $ip]);
    }

    if (function_exists('reputation_record_event')) {
        try {
            reputation_record_event('ip', $ip, 'friend_link_apply', 1, ['ip'=>$ip,'guid'=>$guid,'domain'=>$domain,'name'=>$name,'url'=>$url]);
            if ($guid !== '') {
                reputation_record_event('guid', $guid, 'friend_link_apply', 1, ['ip'=>$ip,'guid'=>$guid,'domain'=>$domain,'name'=>$name,'url'=>$url]);
            }
        } catch (\Throwable $repError) {
            link_apply_server_log('reputation_event_failed', ['message' => $repError->getMessage(), 'domain' => $domain, 'ip' => $ip]);
        }
    }

    exit;
}



function api_log_manage(): void { 
    if (!is_admin()) redirect(''); 
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') redirect('logs'); 
    $action = $_POST['action'] ?? ''; $p = prefix(); 
    if ($action === 'add_log') { 
        $title = clean($_POST['title'] ?? '', 255); $content = clean($_POST['content'] ?? '', 5000); 
        if ($title && $content) { db_exec("INSERT INTO `{$p}logs` (`title`, `content`, `created_at`) VALUES (?, ?, NOW())", [$title, $content]); } 
    } elseif ($action === 'del_log') { 
        $id = (int)($_POST['id'] ?? 0); db_exec("DELETE FROM `{$p}logs` WHERE `id`=?", [$id]); db_exec("DELETE FROM `{$p}log_likes` WHERE `log_id`=?", [$id]); 
    } elseif ($action === 'approve_fb') { 
        $id = (int)($_POST['id'] ?? 0); db_exec("UPDATE `{$p}feedbacks` SET `status`='approved' WHERE `id`=?", [$id]); 
    } elseif ($action === 'del_fb') { 
        $id = (int)($_POST['id'] ?? 0); db_exec("DELETE FROM `{$p}feedbacks` WHERE `id`=?", [$id]); 
    } 
    redirect('logs'); 
}

function api_feedback(): void { 
    if (!is_ajax() || $_SERVER['REQUEST_METHOD'] !== 'POST') exit; 
    header('Content-Type: application/json'); 
    $author = clean($_POST['author'] ?? '', 50); $content = clean($_POST['content'] ?? '', 500); 
    $captchaToken = clean($_POST['captcha_token'] ?? '', 80);
    $userCode = clean($_POST['captcha'] ?? '', 20);
    if (!$author || !$content) json_response(['ok' => false, 'error' => '请填写完整信息']); 
    $verify = captcha_verify_ticket($captchaToken, $userCode, 'feedback', client_ip());
    if (!$verify['ok']) {
        $msg = '验证码错误';
        if ($verify['reason'] === 'expired') {
            $msg = '验证码已过期，请刷新后重试';
        } elseif ($verify['reason'] === 'missing' || $verify['reason'] === 'used' || $verify['reason'] === 'form_mismatch') {
            $msg = '验证码已失效，请重新获取';
        } elseif ($verify['reason'] === 'ip_mismatch') {
            $msg = '网络环境变化，请刷新验证码后重试';
        }
        json_response(['ok' => false, 'error' => $msg]);
    }
    $p = prefix(); 
    db_exec("INSERT INTO `{$p}feedbacks` (`author`, `content`, `status`, `created_at`) VALUES (?, ?, 'pending', NOW())", [$author, $content]); 
    json_response(['ok' => true]); 
}

function api_log_like(): void { 
    if (!is_ajax() || $_SERVER['REQUEST_METHOD'] !== 'POST') exit; 
    header('Content-Type: application/json'); 
    $logId = (int)($_POST['log_id'] ?? 0); $ip = client_ip(); 
    if (!$logId) json_response(['ok' => false]); 
    $p = prefix(); 
    try { 
        db_exec("INSERT INTO `{$p}log_likes` (`log_id`, `ip`) VALUES (?, ?)", [$logId, $ip]); 
        db_exec("UPDATE `{$p}logs` SET `likes` = `likes` + 1 WHERE `id` = ?", [$logId]); 
        json_response(['ok' => true]); 
    } catch (\Throwable $e) { json_response(['ok' => false, 'error' => '你已经赞过啦']); } 
}

function api_user_like(): void { 
    if (!is_ajax() || $_SERVER['REQUEST_METHOD'] !== 'POST') exit; 
    header('Content-Type: application/json'); 
    $email = clean($_POST['email'] ?? '', 100); $ip = client_ip(); 
    if (!$email) json_response(['ok' => false]); 
    $p = prefix(); $today = date('Y-m-d'); 
    try { db_val("SELECT 1 FROM `{$p}user_likes` LIMIT 1"); } catch (\Throwable $e) { 
        db_exec("CREATE TABLE IF NOT EXISTS `{$p}user_likes` ( `email` varchar(100) NOT NULL, `likes` int(11) DEFAULT 0, PRIMARY KEY (`email`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"); 
        db_exec("CREATE TABLE IF NOT EXISTS `{$p}user_like_logs` ( `ip` varchar(50) NOT NULL, `log_date` date NOT NULL, `daily_count` int(11) DEFAULT 0, PRIMARY KEY (`ip`, `log_date`) ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"); 
    } 
    $log = db_row("SELECT `daily_count` FROM `{$p}user_like_logs` WHERE `ip` = ? AND `log_date` = ?", [$ip, $today]); 
    if ($log && $log['daily_count'] >= 10) json_response(['ok' => false, 'error' => '今日完成点赞，明日再来']); 
    if ($log) { db_exec("UPDATE `{$p}user_like_logs` SET `daily_count` = `daily_count` + 1 WHERE `ip` = ? AND `log_date` = ?", [$ip, $today]); } 
    else { db_exec("INSERT INTO `{$p}user_like_logs` (`ip`, `log_date`, `daily_count`) VALUES (?, ?, 1)", [$ip, $today]); } 
    db_exec("INSERT INTO `{$p}user_likes` (`email`, `likes`) VALUES (?, 1) ON DUPLICATE KEY UPDATE `likes` = `likes` + 1", [$email]); 
    json_response(['ok' => true]); 
}

function api_captcha_new(): void {
    if (!is_ajax()) {
        redirect('');
    }

    header('Content-Type: application/json; charset=utf-8');

    $form = clean($_GET['form'] ?? 'comment', 20);
    $ip = client_ip();

    if (!captcha_allowed_form($form)) {
        json_response(['ok' => false, 'error' => '非法验证码场景']);
    }

    try {
        $ticket = captcha_create_ticket($form, $ip, 900);
        json_response([
            'ok' => true,
            'token' => $ticket['token'],
            'image' => url('api/captcha/image') . '?token=' . rawurlencode($ticket['token']) . '&_t=' . time(),
            'expires_in' => $ticket['ttl'],
        ]);
    } catch (\Throwable $e) {
        json_response(['ok' => false, 'error' => '验证码初始化失败']);
    }
}

function api_captcha_image(): void {
    $token = preg_replace('/[^a-zA-Z0-9_\-]/', '', (string)($_GET['token'] ?? ''));
    $ticket = captcha_read_ticket($token);

    if (!$ticket || empty($ticket['code'])) {
        http_response_code(404);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Captcha Not Found';
        exit;
    }

    if ((int)($ticket['expires_at'] ?? 0) < time()) {
        captcha_delete_ticket($token);
        http_response_code(410);
        header('Content-Type: text/plain; charset=utf-8');
        echo 'Captcha Expired';
        exit;
    }

    captcha_render_png((string)$ticket['code']);
}

function api_ping(): void { 
    $postId = (int)($_GET['post_id'] ?? 0); 
    if ($postId > 0) record_post_view($postId); 
    header('Content-Type: image/gif'); 
    echo base64_decode('R0lGODlhAQABAJAAAP8AAAAAACH5BAUQAAAALAAAAAABAAEAAAICBAEAOw=='); exit; 
}

function api_trace(): void { 
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        exit;
    }
    $cfg = class_exists('Firewall') ? Firewall::getConfig() : [];
    if (empty($cfg['enable_f12_probe'])) {
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['ok' => false, 'msg' => 'probe_disabled'], JSON_UNESCAPED_UNICODE);
        exit;
    }
    $input = file_get_contents('php://input');
    $data = json_decode($input, true);
    if (!is_array($data)) {
        http_response_code(400);
        exit;
    }
    $reason = trim((string)($data['reason'] ?? ($data['diff'] ?? '')));
    if ($reason === '') {
        http_response_code(422);
        exit;
    }
    $payload = [
        'guid' => $data['guid'] ?? '',
        'url' => $data['url'] ?? '',
        'path' => $data['path'] ?? '',
        'screen' => $data['screen'] ?? '',
        'reason' => $reason,
        'trail' => is_array($data['trail'] ?? null) ? $data['trail'] : [],
        'title' => $data['title'] ?? '',
    ];
    f12_probe_record($payload);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['ok' => true], JSON_UNESCAPED_UNICODE);
    exit; 
}

function api_online_users(): void { 
    if (!is_ajax()) redirect(''); 
    header('Content-Type: application/json'); get_online_count(); 
    $file = ROOT . '/data/online_stats.json'; 
    if (!file_exists($file)) { echo json_encode(['ok' => true, 'data' => []]); exit; } 
    $data = json_decode(file_get_contents($file), true) ?? []; 
    $now = time(); $ip = client_ip(); $ua = $_SERVER['HTTP_USER_AGENT'] ?? ''; 
    $device = preg_match('/Mobile|Android|iPhone|iPad/i', $ua) ? 'Mobile' : 'Desktop'; 
    $currentId = md5($ip . $device); $selfRecord = null; $others = []; 
    foreach ($data as $id => $info) { 
        if (!is_array($info) || $now - $info['time'] > 120) continue; 
        $item = [ 'ip' => mask_ip($info['ip']), 'loc' => get_ip_location($info['ip']), 'dev' => $info['dev'] ?? 'Unknown', 'emote' => $info['emote'] ?? '', 'time' => time_ago(date('Y-m-d H:i:s', $info['time'])), '_ts' => $info['time'] ]; 
        if ($id === $currentId) { $selfRecord = $item; } else { $others[] = $item; } 
    } 
    usort($others, function($a, $b) { return $b['_ts'] <=> $a['_ts']; }); 
    $result = []; if ($selfRecord) { $result[] = $selfRecord; } 
    foreach ($others as $item) { $result[] = $item; } 
    foreach ($result as &$r) { unset($r['_ts']); } 
    echo json_encode(['ok' => true, 'data' => $result]); exit;
}

function api_comment(): void { 
    if (is_ajax()) { header('Content-Type: application/json'); } else { if ($_SERVER['REQUEST_METHOD'] !== 'POST') redirect(''); } 
    $isAdmin = is_admin(); 
    if ($isAdmin && !verify_csrf()) { $msg = '安全校验失败'; if (is_ajax()) { echo json_encode(['ok'=>false,'error'=>$msg]); exit; } set_flash('error',$msg); back(); } 
    
    $postId = (int)($_POST['post_id'] ?? 0); $parentId = (int)($_POST['parent_id'] ?? 0); 
    $author = clean($_POST['author'] ?? '', 50); $email = clean($_POST['email'] ?? '', 100); 
    $url = clean($_POST['url'] ?? '', 200); $content = clean($_POST['content'] ?? '', 2000); 
    $clientGuid = $_COOKIE['lm_guid'] ?? ''; $ip = client_ip(); 
    if ($isAdmin) {
        $author = limhy_comment_admin_display_name();
        $email = limhy_comment_admin_display_email();
        $url = defined('SITE_URL') ? rtrim((string)SITE_URL, '/') : $url;
    }
    
    if (!$isAdmin) { 
        $captchaToken = clean($_POST['captcha_token'] ?? '', 80);
        $userCode = clean($_POST['captcha'] ?? '', 20);
        $captchaResult = captcha_verify_ticket($captchaToken, $userCode, 'comment', $ip);
        if (!$captchaResult['ok']) {
            $error = '验证码错误';
            if ($captchaResult['reason'] === 'expired') {
                $error = '验证码已过期，请刷新后重试';
            } elseif (in_array($captchaResult['reason'], ['missing', 'used'], true)) {
                $error = '验证码已失效，请重新获取';
            } elseif ($captchaResult['reason'] === 'ip_mismatch') {
                $error = '网络环境变化，请刷新验证码后重试';
            }
            if (is_ajax()) { echo json_encode(['ok'=>false,'error'=>$error]); exit; }
            set_flash('error',$error);
            back();
        }
    } 
    if (($_POST['website_url'] ?? '') !== '') { if (is_ajax()) { echo json_encode(['ok'=>true,'msg'=>'评论已提交']); exit; } back(); } 
    $error = ''; 
    if (!$postId) $error = '参数错误'; elseif (!$author) $error = '请填写昵称'; elseif (!$content) $error = '请填写评论内容'; elseif (!$isAdmin && $email === '') $error = '请填写邮箱'; elseif ($email && !filter_var($email, FILTER_VALIDATE_EMAIL)) $error = '邮箱格式不正确'; 
    if ($error) { if (is_ajax()) { echo json_encode(['ok'=>false,'error'=>$error]); exit; } set_flash('error',$error); back(); } 
    
    $p = prefix(); 
    $post = db_row("SELECT `id`, `slug`, `title`, `comment_enabled`, `type` FROM `{$p}posts` WHERE `id` = ? LIMIT 1", [$postId]); 
    if (!$post || !$post['comment_enabled']) { $msg = '该文章不允许评论'; if (is_ajax()) { echo json_encode(['ok'=>false,'error'=>$msg]); exit; } set_flash('error',$msg); back(); } 
   
    if (!$isAdmin) { 
        $rateLimitSeconds = (defined('COMMENT_RATE_LIMIT') ? max(0, (int)COMMENT_RATE_LIMIT) : 2) * 60;
        if ($rateLimitSeconds > 0) {
        $lastCommentTime = db_val("SELECT `created_at` FROM `{$p}comments` WHERE `ip` = ? ORDER BY `id` DESC LIMIT 1", [$ip]); 
        if ($lastCommentTime) { 
            $diff = time() - strtotime($lastCommentTime); 
            if ($diff < $rateLimitSeconds) { 
                $waitMins = ceil(($rateLimitSeconds - $diff) / 60);
                $msg = "防刷限制：请休息 {$waitMins} 分钟后再试。"; 
                if (is_ajax()) { echo json_encode(['ok'=>false, 'error'=>$msg]); exit; } 
                set_flash('error', $msg); back(); 
            } 
        } 
        }
    } 

    $isSpam = false;
    $spamFile = ROOT . '/data/spam_words.txt';
    if (!$isAdmin && file_exists($spamFile)) {
        $spamWords = array_filter(array_map('trim', explode("\n", file_get_contents($spamFile))));
        foreach ($spamWords as $word) {
            if ($word !== '' && (mb_stripos($content, $word) !== false || mb_stripos($author, $word) !== false)) {
                $isSpam = true; break;
            }
        }
    }
    
    $status = 'pending';
    if ($isAdmin) {
        $status = 'approved';
    } elseif ($isSpam) {
        $status = 'spam';
    } else {
        if (defined('COMMENTS_NEED_REVIEW') && COMMENTS_NEED_REVIEW) {
            if (defined('COMMENT_AUTO_APPROVE_TRUSTED') && COMMENT_AUTO_APPROVE_TRUSTED && !empty($email)) {
                $hasApproved = db_val("SELECT 1 FROM `{$p}comments` WHERE `email` = ? AND `status` = 'approved' LIMIT 1", [$email]);
                if ($hasApproved) {
                    $status = 'approved';
                }
            }
        } else {
            $status = 'approved';
        }
    }
    
    if ($parentId > 0) {
        $parentExists = db_val("SELECT 1 FROM `{$p}comments` WHERE `id` = ? AND `post_id` = ? LIMIT 1", [$parentId, $postId]);
        if (!$parentExists) {
            $msg = '父评论不存在或已被移除';
            if (is_ajax()) { echo json_encode(['ok'=>false,'error'=>$msg]); exit; }
            set_flash('error', $msg);
            back();
        }
    }

    db_exec("INSERT INTO `{$p}comments` (post_id, parent_id, author, email, url, content, ip, status, is_admin) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", [$postId, $parentId, $author, $email, $url, $content, $ip, $status, (int)$isAdmin]); 
    $newCommentId = (int)db_value("SELECT LAST_INSERT_ID()"); 
    if (!empty($clientGuid) && class_exists('Firewall')) { Firewall::logCommentGuid($newCommentId, $clientGuid); Firewall::associateIdentity($email, $clientGuid); } 
    
    if (defined('COMMENT_AUTO_UPDATE_URL') && COMMENT_AUTO_UPDATE_URL && !empty($email) && !empty($url)) {
        db_exec("UPDATE `{$p}comments` SET `url` = ? WHERE `email` = ? AND `id` != ?", [$url, $email, $newCommentId]);
    }

    if ($status === 'pending' && !$isAdmin) { limhy_register_pending_comment_visibility($newCommentId, $postId, $email); }

    if ($status === 'approved') { update_comment_count($postId); if (function_exists('clear_html_cache')) clear_html_cache(); } 
    if (!$isAdmin) { $expire = time() + 86400 * 30; setcookie('comment_author', $author, $expire, '/'); setcookie('comment_email', $email, $expire, '/'); setcookie('comment_url', $url, $expire, '/'); } 
    
    if ($status !== 'spam' && class_exists('Mailer')) { 
        register_shutdown_function(function() use ($p, $post, $newCommentId, $parentId, $author, $email, $content, $isAdmin) { 
            try { 
                $mailer = new Mailer(); $adminEmail = defined('ADMIN_EMAIL') ? ADMIN_EMAIL : ''; $siteName = defined('SITE_NAME') ? SITE_NAME : 'LiMhy'; $siteUrl = defined('SITE_URL') ? rtrim(SITE_URL, '/') : ''; $postTitle = $post['title']; 
                $postPrefix = ($post['type'] === 'page') ? 'page' : 'post';
                $postUrl = $siteUrl . "/" . $postPrefix . "/" . $post['slug'] . "#comment-" . $newCommentId;
                $tplPath = ROOT . '/templates/mail_notification.php'; 
                $renderMail = function(array $vars) use ($tplPath) { extract($vars); ob_start(); require $tplPath; return ob_get_clean(); };
                if (!$isAdmin && !empty($adminEmail)) { 
                    $adminSubj = "【{$siteName}】您的文章《{$postTitle}》有了新评论"; 
                    $adminBody = file_exists($tplPath) ? $renderMail(['isReply' => false, 'commentAuthor' => $author, 'commentEmail' => $email, 'commentContent' => $content, 'postTitle' => $postTitle, 'siteName' => $siteName, 'siteUrl' => $siteUrl, 'postUrl' => $postUrl]) : "<h3>{$author} 评论了您：</h3><p>{$content}</p><p><a href='{$postUrl}'>点击查看详情</a></p>"; 
                    $mailer->send($adminEmail, $adminSubj, $adminBody); 
                } 
                if ($parentId > 0) { 
                    $parentComment = db_row("SELECT `author`, `email`, `content` FROM `{$p}comments` WHERE `id` = ? LIMIT 1", [$parentId]); 
                    if ($parentComment && !empty($parentComment['email']) && $parentComment['email'] !== $email && $parentComment['email'] !== $adminEmail) { 
                        $mailBody = file_exists($tplPath) ? $renderMail(['isReply' => true, 'replyAuthor' => $author, 'replyEmail' => $email, 'replyContent' => $content, 'parentContent' => $parentComment['content'], 'postTitle' => $postTitle, 'siteName' => $siteName, 'siteUrl' => $siteUrl, 'postUrl' => $postUrl]) : "<h3>您在【{$siteName}】的评论收到了新回复</h3><p><b>{$author}</b> 回复了您：</p><p>{$content}</p><p><a href='{$postUrl}'>点击查看详情</a></p>"; 
                        $mailer->send($parentComment['email'], "您的评论收到了新回复 - " . $siteName, $mailBody); 
                    } 
                } 
            } catch (\Throwable $e) { @file_put_contents(ROOT . '/data/mail_error.log', date('Y-m-d H:i:s') . ' [FATAL] ' . $e->getMessage() . "\n", FILE_APPEND); } 
        }); 
    } 
    $msg = ($status === 'approved') ? '评论发布成功！' : '评论已提交，请等待站长处理。'; 
    if (is_ajax()) { echo json_encode(['ok' => true, 'msg' => $msg]); exit; } else { set_flash('success', $msg); redirect("post/{$post['slug']}#comments"); } 
}


function api_check_link(): void { 
    header('Content-Type: application/json'); if ($_SERVER['REQUEST_METHOD'] !== 'POST') { echo json_encode(['ok' => false, 'error' => 'Method Not Allowed']); exit; }
    $url = $_POST['url'] ?? ''; if (!filter_var($url, FILTER_VALIDATE_URL)) { echo json_encode(['ok' => false, 'status' => 'invalid']); exit; }
    $isOnline = check_url_with_retry($url, 1); echo json_encode([ 'ok' => true, 'online' => $isOnline, 'status_text' => $isOnline ? '在线' : '掉线' ]); exit;
}

function api_post_password(): void { 
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') redirect(''); 
    require_csrf(); $postId = (int)($_POST['post_id'] ?? 0); $pass = (string)($_POST['password'] ?? ''); $p = prefix(); 
    $post = db_row("SELECT `id`, `slug`, `password` FROM `{$p}posts` WHERE `id` = ? LIMIT 1", [$postId]); 
    if (!$post) { set_flash('error', '文章不存在或已下线'); redirect(''); }
    if (function_exists('limhy_post_password_matches') && limhy_post_password_matches($pass, (string)$post['password'])) { 
        $_SESSION['post_unlock_' . $post['id']] = true; 
        if (function_exists('clear_html_cache')) { clear_html_cache(); }
        session_write_close();
        redirect("post/{$post['slug']}"); 
    }
    set_flash('error', '密码错误');
    redirect("post/{$post['slug']}"); 
}

function api_avatar(): void { 
    $hash = preg_replace('/[^a-f0-9]/', '', $_GET['hash'] ?? ''); $name = $_GET['name'] ?? 'U'; $qq = preg_replace('/[^0-9]/', '', $_GET['qq'] ?? ''); 
    $avatarDir = ROOT . '/uploads/avatars/'; if (!is_dir($avatarDir)) @mkdir($avatarDir, 0755, true); 
    $cacheFile = $avatarDir . $hash . '.jpg'; 
    if (file_exists($cacheFile)) { header('Content-Type: image/jpeg'); header('Cache-Control: public, max-age=2592000'); readfile($cacheFile); exit; } 
    $sources = []; if ($qq) { $sources[] = "https://q1.qlogo.cn/g?b=qq&nk={$qq}&s=100"; } 
    $sources[] = "https://weavatar.com/avatar/{$hash}?s=100&d=404"; $sources[] = "https://gravatar.loli.net/avatar/{$hash}?s=100&d=404"; 
    $imageContent = null; 
    foreach ($sources as $url) { 
        $ctx = stream_context_create(['http' => ['timeout' => 1.5]]); $data = @file_get_contents($url, false, $ctx); 
        if ($data && strlen($data) > 1000) { $imageContent = $data; break; } 
    } 
    if ($imageContent) { file_put_contents($cacheFile, $imageContent); header('Content-Type: image/jpeg'); echo $imageContent; } 
    else { header('Location: https://ui-avatars.com/api/?name=' . urlencode($name)); } 
    exit; 
}

function api_sibling_post(): void { 
    if (!is_ajax()) redirect(''); header('Content-Type: application/json'); 
    $currentId = (int)($_GET['id'] ?? 0); $catId = (int)($_GET['cat_id'] ?? 0); 
    $direction = ($_GET['dir'] ?? 'next') === 'next' ? '>' : '<'; $order = ($_GET['dir'] ?? 'next') === 'next' ? 'ASC' : 'DESC'; 
    $p = prefix(); 
    if (!$currentId || !$catId) { echo json_encode(['ok' => false]); exit; }
    $post = db_row("SELECT p.id, p.title, p.slug, p.excerpt, p.content_html, p.published_at, c.name as category_name FROM `{$p}posts` p LEFT JOIN `{$p}categories` c ON p.category_id = c.id WHERE p.category_id = ? AND p.id $direction ? AND p.type = 'post' AND p.status = 'published' ORDER BY p.id $order LIMIT 1", [$catId, $currentId]); 
    if (!$post) { $loopOrder = ($_GET['dir'] ?? 'next') === 'next' ? 'ASC' : 'DESC'; $post = db_row("SELECT p.id, p.title, p.slug, p.excerpt, p.content_html, p.published_at, c.name as category_name FROM `{$p}posts` p LEFT JOIN `{$p}categories` c ON p.category_id = c.id WHERE p.category_id = ? AND p.type = 'post' AND p.status = 'published' ORDER BY p.id $loopOrder LIMIT 1", [$catId]); } 
    if ($post) { 
        $cover = get_post_cover_for_post($post);
        $excerpt = e($post['excerpt'] ?: make_excerpt(strip_tags($post['content_html']), 80));
        $url = post_url($post); $title = e($post['title']); $date = fmt_date($post['published_at']);
        $catName = $post['category_name'] ? ' &middot; <span class="meta-cat">'.e($post['category_name']).'</span>' : '';
        
        $hasRealImage = post_has_visual_cover($post);
        $covConf = defined('POST_COVER_ENABLED') ? POST_COVER_ENABLED : 1;
        if ($covConf === true) $covConf = 1;
        if ($covConf === false) $covConf = 0;
        
        $showCover = ($covConf == 1) || ($covConf == 2 && $hasRealImage);
        $coverHtml = $showCover ? '<div class="post-cover-art"><div class="post-cover-img-box"><img src="'.$cover.'" alt="cover" loading="lazy" decoding="async"></div></div>' : '';
        
        $html = $coverHtml . '<div class="post-content"><h2 class="post-title"><a href="'.$url.'">'.$title.'</a></h2><div class="post-excerpt">'.$excerpt.'</div><div class="post-meta"><span class="meta-date">'.$date.'</span>'.$catName.'</div></div>';
        echo json_encode(['ok' => true, 'id' => $post['id'], 'cover' => $cover, 'html' => $html]); exit;
    } 
    echo json_encode(['ok' => false]); exit;
}

function api_user_profile(): void { 
    if (!is_ajax()) redirect(''); header('Content-Type: application/json'); 
    $email = clean($_GET['email'] ?? '', 100); if (!$email) { echo json_encode(['ok' => false]); exit; }
    $p = prefix(); 
    $stats = db_row("SELECT COUNT(*) as total, MIN(HOUR(created_at)) as min_h, MAX(HOUR(created_at)) as max_h FROM `{$p}comments` WHERE email = ? AND status = 'approved'", [$email]); 
    $recent = db_rows("SELECT content FROM `{$p}comments` WHERE email = ? AND status = 'approved' ORDER BY id DESC LIMIT 2", [$email]); 
    $userLikes = 0; try { $userLikes = (int)db_val("SELECT `likes` FROM `{$p}user_likes` WHERE `email` = ?", [$email]); } catch (\Throwable $e) {} 
    $tags = []; $total = (int)($stats['total'] ?? 0); $min_h = $stats['min_h'] !== null ? (int)$stats['min_h'] : -1; $max_h = $stats['max_h'] !== null ? (int)$stats['max_h'] : -1; 
    if ($total >= 10) $tags[] = '常驻镇民'; elseif ($total >= 5) $tags[] = '老熟人'; elseif ($total == 1) $tags[] = '新面孔'; 
    if ($min_h >= 0 && $min_h <= 5) $tags[] = '深夜不眠之客'; elseif ($max_h >= 22) $tags[] = '夜猫子'; if ($min_h >= 6 && $min_h <= 9) $tags[] = '晨间行者'; 
    if (empty($tags)) $tags[] = '守护者'; if (count($tags) < 2 && $total > 0) $tags[] = '热心访客'; 
    $formattedRecent = []; foreach ($recent as $r) { $text = strip_tags($r['content']); if (mb_strlen($text) > 40) $text = mb_substr($text, 0, 40) . '...'; $formattedRecent[] = ['content' => $text]; } 
    $idNum = sprintf("%04d", (abs(crc32($email)) % 9999)); echo json_encode(['ok' => true, 'data' => ['id_card' => 'LiMhy' . $idNum, 'tags' => array_slice($tags, 0, 3), 'recent' => $formattedRecent, 'likes' => $userLikes]]); exit;
}

function api_oss_token(): void {
    if (!is_admin()) { echo json_encode(['ok' => false]); exit; }
    while (ob_get_level()) ob_end_clean(); header('Content-Type: application/json; charset=utf-8');
    
    $type = defined('OSS_TYPE') ? OSS_TYPE : 'aliyun';
    $ak = defined('OSS_AK') ? OSS_AK : ''; 
    $sk = defined('OSS_SK') ? OSS_SK : ''; 
    $host = defined('OSS_HOST') ? rtrim(OSS_HOST, '/') : ''; 
    $customDomain = defined('OSS_DOMAIN') ? rtrim(OSS_DOMAIN, '/') : '';
    
    $ext = in_array($_POST['ext'] ?? '', ['webp','jpg','jpeg','png']) ? $_POST['ext'] : 'webp';
    $filename = function_exists('limhy_generate_image_filename') ? limhy_generate_image_filename($ext) : ('Lm_' . date('Y_md_His') . '_' . substr(md5(uniqid('', true)), 0, 6) . '.' . $ext);
    $key = 'moments/' . date('Y/m/d/') . $filename; 
    
    $finalUrl = $customDomain ? ($customDomain . '/' . $key) : ($host . '/' . $key);

    if ($type === 'custom_api') {
        echo json_encode([ 'ok' => true, 'type' => 'custom_api', 'data' => [ 'upload_url' => $host, 'secret' => $sk ] ]); exit;
    }

    if ($type === 'litepic') {
        echo json_encode([ 'ok' => true, 'type' => 'litepic', 'data' => [ 'proxy_url' => url('api/object-upload') ] ]); exit;
    }

    if ($type === 's4' || $type === 's3' || $type === 'upyun') {
        $amzDate = gmdate('Ymd\THis\Z'); $dateStamp = gmdate('Ymd'); $region = 'auto';
        $parsedUrl = parse_url($host); $parsedHost = $parsedUrl['host'] ?? ''; $basePath = isset($parsedUrl['path']) ? rtrim($parsedUrl['path'], '/') : '';
        $credentialScope = $dateStamp . '/' . $region . '/s3/aws4_request';
        $queryArr = [ 'X-Amz-Algorithm' => 'AWS4-HMAC-SHA256', 'X-Amz-Credential' => $ak . '/' . $credentialScope, 'X-Amz-Date' => $amzDate, 'X-Amz-Expires' => 600, 'X-Amz-SignedHeaders' => 'host' ];
        ksort($queryArr);
        $canonicalQueryString = ''; foreach ($queryArr as $k => $v) { $canonicalQueryString .= rawurlencode((string)$k) . '=' . rawurlencode((string)$v) . '&'; }
        $canonicalQueryString = rtrim($canonicalQueryString, '&');
        $fullPath = $basePath . '/' . ltrim($key, '/'); $encodedUri = str_replace('%2F', '/', rawurlencode($fullPath));
        $canonicalHeaders = "host:" . $parsedHost . "\n";
        $canonicalRequest = "PUT\n" . $encodedUri . "\n" . $canonicalQueryString . "\n" . $canonicalHeaders . "\nhost\nUNSIGNED-PAYLOAD";
        $stringToSign = "AWS4-HMAC-SHA256\n" . $amzDate . "\n" . $credentialScope . "\n" . hash('sha256', $canonicalRequest);
        $kDate = hash_hmac('sha256', $dateStamp, 'AWS4' . $sk, true); $kRegion = hash_hmac('sha256', $region, $kDate, true); $kService = hash_hmac('sha256', 's3', $kRegion, true); $kSigning = hash_hmac('sha256', 'aws4_request', $kService, true); $signature = hash_hmac('sha256', $stringToSign, $kSigning);
        $uploadUrl = $host . '/' . ltrim($key, '/') . '?' . $canonicalQueryString . '&X-Amz-Signature=' . $signature;
        echo json_encode([ 'ok' => true, 'type' => 's3', 'data' => [ 'upload_url' => $uploadUrl, 'url' => $finalUrl, 'key' => $key ] ]); exit;
    } else {
        $expire = time() + 600;
        $policyArr = [ 'expiration' => gmdate('Y-m-d\TH:i:s\Z', $expire), 'conditions' => [ ['content-length-range', 0, 10485760], ['eq', '$key', $key], ['eq', '$success_action_status', '200'] ] ];
        $policy = base64_encode(json_encode($policyArr)); $sign = base64_encode(hash_hmac('sha1', $policy, $sk, true));
        echo json_encode([ 'ok' => true, 'type' => 'aliyun', 'data' => [ 'accessid' => $ak, 'host' => $host, 'policy' => $policy, 'signature' => $sign, 'key' => $key, 'url' => $finalUrl ] ]); exit;
    }
}




function api_object_upload(): void {
    if (!is_admin() || $_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response(['ok' => false, 'error' => '未授权访问']);
    }
    verify_csrf();
    require_once ROOT . '/core/upload.php';
    if (!limhy_litepic_enabled()) {
        json_response(['ok' => false, 'error' => '当前对象存储并非 LitePic 模式']);
    }
    $p = prefix();
    $result = limhy_store_litepic_upload($p, $_FILES['file'] ?? [], ['images_only' => true]);
    json_response($result);
}

function api_upload_save_remote(): void {
    if (!is_admin() || $_SERVER['REQUEST_METHOD'] !== 'POST') {
        json_response(['ok' => false, 'error' => '未授权访问']);
    }
    verify_csrf();
    $p = prefix();
    $url = trim((string)($_POST['file_url'] ?? ''));
    $origName = clean((string)($_POST['orig_name'] ?? ''), 200);
    $size = (int)($_POST['file_size'] ?? 0);
    $mime = clean((string)($_POST['mime_type'] ?? ''), 100);
    if ($url === '' || !preg_match('~^https?://~i', $url) || $url === 'undefined') {
        json_response(['ok' => false, 'error' => '远端地址无效']);
    }
    $filename = basename((string)parse_url($url, PHP_URL_PATH));
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    $allowed = ['jpg','jpeg','png','gif','webp','svg','bmp'];
    if ($filename === '' || !in_array($ext, $allowed, true)) {
        json_response(['ok' => false, 'error' => '仅允许登记图片资源']);
    }
    if ($size <= 0 || $size > 10 * 1024 * 1024) {
        json_response(['ok' => false, 'error' => '图片体积超出限制']);
    }
    if ($mime === '') {
        $mime = 'image/' . ($ext === 'jpg' ? 'jpeg' : $ext);
    }
    if (!str_starts_with($mime, 'image/')) {
        json_response(['ok' => false, 'error' => '图片类型校验失败']);
    }
    $exists = (int)db_value("SELECT COUNT(*) FROM `{$p}uploads` WHERE `path`=?", [$url]);
    if ($exists > 0) {
        json_response(['ok' => true, 'message' => '附件记录已存在']);
    }
    db_execute(
        "INSERT INTO `{$p}uploads` (`filename`, `original_name`, `path`, `mime_type`, `size`, `created_at`) VALUES (?, ?, ?, ?, ?, NOW())",
        [$filename, $origName ?: $filename, $url, $mime, $size]
    );
    json_response(['ok' => true, 'message' => '远端图片已登记']);
}

function api_moments_publish(): void {
    if (!is_admin() || $_SERVER['REQUEST_METHOD'] !== 'POST') exit;
    $content = $_POST['content'] ?? ''; if (function_exists('clean')) { $content = clean($content, 2000); } else { $content = htmlspecialchars(trim($content)); }
    $images = $_POST['images'] ?? '[]'; if (is_array($images)) { $images = json_encode($images, JSON_UNESCAPED_UNICODE); }
    if (empty($content) && ($images === '' || $images === '[]' || $images === 'null')) { set_flash('error', '写点内容或者配张图吧！'); if (function_exists('back')) back(); else { header('Location: ' . $_SERVER['HTTP_REFERER']); exit; } }
    $p = prefix();
    try { db_exec("INSERT INTO `{$p}moments` (`content`, `images`, `created_at`) VALUES (?, ?, NOW())", [$content, $images]); if (function_exists('clear_html_cache')) clear_html_cache(); set_flash('success', '动态已成功发射！'); } catch (\Throwable $e) { set_flash('error', '数据库写入异常: ' . $e->getMessage()); }
    if (function_exists('back')) back(); else { header('Location: ' . $_SERVER['HTTP_REFERER']); exit; }
}

function api_comp_profile_card(): void {
    if (!is_ajax()) exit;
    header('Content-Type: text/html; charset=utf-8'); $email = clean($_GET['email'] ?? '', 100); $name = clean($_GET['name'] ?? '神秘旅人', 50); $ip = clean($_GET['ip'] ?? '未知', 50); $url = clean($_GET['url'] ?? '', 200); $avatarSrc = clean($_GET['avatarSrc'] ?? '', 255); $defaultUrlText = $url ? '<a href="' . $url . '" target="_blank" rel="nofollow">' . $url . '</a>' : '该用户没有留下他的个人网址'; $idCard = 'LiMhy0000'; $tagsHtml = '<span class="profile-tag">神秘旅人</span>'; $recentHtml = '<div class="profile-recent-item">暂无更多互动</div>'; $likes = '0';
    if ($email) {
        $p = prefix(); $stats = db_row("SELECT COUNT(*) as total, MIN(HOUR(created_at)) as min_h, MAX(HOUR(created_at)) as max_h FROM `{$p}comments` WHERE email = ? AND status = 'approved'", [$email]); $recent = db_rows("SELECT content FROM `{$p}comments` WHERE email = ? AND status = 'approved' ORDER BY id DESC LIMIT 2", [$email]); $userLikes = 0; try { $userLikes = (int)db_val("SELECT `likes` FROM `{$p}user_likes` WHERE `email` = ?", [$email]); } catch (\Throwable $e) {} $tags = []; $total = (int)($stats['total'] ?? 0); $min_h = $stats['min_h'] !== null ? (int)$stats['min_h'] : -1; $max_h = $stats['max_h'] !== null ? (int)$stats['max_h'] : -1;
        if ($total >= 10) $tags[] = '常驻镇民'; elseif ($total >= 5) $tags[] = '老熟人'; elseif ($total == 1) $tags[] = '新面孔';
        if ($min_h >= 0 && $min_h <= 5) $tags[] = '深夜不眠之客'; elseif ($max_h >= 22) $tags[] = '夜猫子'; if ($min_h >= 6 && $min_h <= 9) $tags[] = '晨间行者';
        if (empty($tags)) $tags[] = '守护者'; if (count($tags) < 2 && $total > 0) $tags[] = '热心访客';
        $tagsHtml = implode('', array_map(function($t) { return '<span class="profile-tag">' . $t . '</span>'; }, array_slice($tags, 0, 3)));
        if (!empty($recent)) { $recentHtml = ''; foreach ($recent as $r) { $text = strip_tags($r['content']); if (mb_strlen($text) > 40) $text = mb_substr($text, 0, 40) . '...'; $recentHtml .= '<div class="profile-recent-item">' . e($text) . '</div>'; } }
        $idCard = 'LiMhy' . sprintf("%04d", (abs(crc32($email)) % 9999)); $likes = $userLikes > 9999 ? '9999+' : (string)$userLikes;
    }
    echo '<div class="profile-card-overlay"></div><div class="profile-card-content"><div class="profile-card-banner"><img src="/assets/img/hd.png" alt="banner" loading="lazy" decoding="async"></div><div class="profile-id-badge" id="js-p-id">身份牌: ' . $idCard . '</div><div class="profile-avatar-row"><div class="profile-avatar-wrap"><div class="profile-avatar-bg"></div><div class="profile-avatar-img"><img src="' . $avatarSrc . '" style="width:100%;height:100%;object-fit:cover;" loading="lazy" decoding="async"></div></div><div class="profile-like-box" id="js-profile-like-box" data-email="' . $email . '"><span id="js-p-likes">' . $likes . '</span><img src="/assets/img/dz.svg" alt="like" class="profile-like-icon" loading="lazy" decoding="async"></div></div><div class="profile-name-row"><span class="profile-name">' . $name . '</span><span class="profile-ip">IP: ' . $ip . '</span></div><div class="profile-url">个人网址: ' . $defaultUrlText . '</div><div class="profile-tags" id="js-p-tags">' . $tagsHtml . '</div><div class="profile-recent-label">最近互动</div><div class="profile-recent-list" id="js-p-recent">' . $recentHtml . '</div></div>'; 
    exit;
}

function api_comp_online_modal(): void {
    if (!is_ajax()) exit;
    header('Content-Type: text/html; charset=utf-8'); get_online_count();
    $file = ROOT . '/data/online_stats.json'; $data = file_exists($file) ? json_decode(file_get_contents($file), true) ?? [] : [];
    $now = time(); $ip = client_ip(); $ua = $_SERVER['HTTP_USER_AGENT'] ?? ''; $device = preg_match('/Mobile|Android|iPhone|iPad/i', $ua) ? 'Mobile' : 'Desktop'; $currentId = md5($ip . $device); $selfRecord = null; $others = [];
    foreach ($data as $id => $info) { if (!is_array($info) || $now - $info['time'] > 120) continue; $item = [ 'ip' => mask_ip($info['ip']), 'loc' => get_ip_location($info['ip']), 'dev' => $info['dev'] ?? 'Unknown', 'time' => time_ago(date('Y-m-d H:i:s', $info['time'])), '_ts' => $info['time'] ]; if ($id === $currentId) { $selfRecord = $item; } else { $others[] = $item; } } 
    usort($others, function($a, $b) { return $b['_ts'] <=> $a['_ts']; }); $result = []; if ($selfRecord) { $result[] = $selfRecord; } foreach ($others as $item) { $result[] = $item; } 
    $html = '<div class="sketch-modal-overlay"></div><div class="sketch-modal-content"><div class="sketch-modal-header"><h3>实时在线访客</h3><button class="sketch-modal-close">✕</button></div><div class="sketch-modal-body" id="js-online-list">';
    if (empty($result)) { $html .= '<div style="text-align:center; padding: 20px; color:#888;">当前仅有你一人</div>'; } else {
        $html .= '<ul class="online-user-list">';
        foreach ($result as $u) {
            $devIcon = $u['dev'] === 'Mobile' ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>' : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect><line x1="8" y1="21" x2="16" y2="21"></line><line x1="12" y1="17" x2="12" y2="21"></line></svg>';
            $html .= '<li class="online-user-item"><div class="online-user-icon">'.$devIcon.'</div><div class="online-user-info"><div class="online-user-loc">'.$u['loc'].'</div><div class="online-user-meta">'.$u['ip'].' · '.$u['time'].'活跃</div></div></li>';
        }
        $html .= '</ul>';
    }
    $html .= '</div></div>'; echo $html; exit;
}

function api_comp_f12_warning(): void {
    if (!is_ajax()) exit;
    header('Content-Type: text/html; charset=utf-8');
    echo '<div class="f12-warning-content"><button class="f12-warning-close">✕</button><div class="f12-warning-title">态势感知已激活</div><div class="f12-warning-desc">基于对技术交流的开放态度，本站已解除 F12 物理封锁。<br><br>但请注意，系统底层已部署<strong>【单向玻璃】探针网络</strong>。您的任何调试动作均会被记录并实时投射至后台监控大屏。</div><div class="f12-warning-bottom"><div class="f12-warning-sign"><div class="f12-warning-brand">LiMhy\'Blog</div><img src="/assets/img/Jason.png" alt="Jason" class="f12-warning-signature" loading="lazy" decoding="async"></div><img src="/assets/img/j12sm.png" alt="banner" class="f12-warning-banner" loading="lazy" decoding="async"></div></div>'; 
    exit;
}

function api_comp_town_billboard(): void {
    if (!is_ajax()) exit;
    header('Content-Type: text/html; charset=utf-8');
    $env = get_town_env_data(); $titleStr = $env['latest_post'] ? '<p>新文推荐：' . e($env['latest_post']) . '</p>' : ''; $cmtStr = $env['latest_comment_author'] ? '<p>热心镇民：<b>' . e($env['latest_comment_author']) . '</b> 刚留了言</p>' : '';
    echo '<div class="town-scroll-paper"><h3>小镇公告</h3>' . $titleStr . $cmtStr . '<p style="color:#888; font-size:13px; margin-top:30px;">💡 提示：点击黄色气泡的自己可以修改心情哦</p><button class="sketch-btn js-close-modal">朕知道了</button></div>';
    exit;
}

function init_minesweeper_session(): void {
    $_SESSION['ms'] = [ 'rows' => 10, 'cols' => 10, 'mines' => 12, 'board' => [], 'first_click' => true, 'status' => 'playing', 'flags' => 0, 'revealed' => 0, 'start_time' => 0, 'end_time' => 0 ];
    for($r=0; $r<10; $r++) { for($c=0; $c<10; $c++) { $_SESSION['ms']['board'][$r][$c] = [ 'mine' => false, 'rev' => false, 'flag' => false, 'n' => 0 ]; } }
}

function ms_place_mines(int $fr, int $fc): void {
    $ms = &$_SESSION['ms']; $m = 0;
    while($m < $ms['mines']) {
        $r = rand(0, $ms['rows']-1); $c = rand(0, $ms['cols']-1);
        if (!$ms['board'][$r][$c]['mine'] && ($r !== $fr || $c !== $fc)) { $ms['board'][$r][$c]['mine'] = true; $m++; }
    }
    for($r=0; $r<$ms['rows']; $r++) { for($c=0; $c<$ms['cols']; $c++) { if($ms['board'][$r][$c]['mine']) continue; $n = 0; for($i=-1; $i<=1; $i++) { for($j=-1; $j<=1; $j++) { if(isset($ms['board'][$r+$i][$c+$j]) && $ms['board'][$r+$i][$c+$j]['mine']) $n++; } } $ms['board'][$r][$c]['n'] = $n; } }
}

function ms_reveal(int $r, int $c): void {
    $ms = &$_SESSION['ms']; if (!isset($ms['board'][$r][$c])) return; $cell = &$ms['board'][$r][$c]; if ($cell['rev'] || $cell['flag']) return; $cell['rev'] = true; $ms['revealed']++;
    if ($cell['mine']) { $ms['status'] = 'lost'; $ms['end_time'] = time(); } elseif ($cell['n'] == 0) { for($i=-1; $i<=1; $i++) { for($j=-1; $j<=1; $j++) { ms_reveal($r+$i, $c+$j); } } }
}

function api_comp_minesweeper(): void {
    if (!is_ajax()) exit;
    header('Content-Type: text/html; charset=utf-8');
    $act = $_GET['act'] ?? 'init'; if ($act === 'init' || !isset($_SESSION['ms'])) { init_minesweeper_session(); }
    $ms = &$_SESSION['ms'];
    if ($ms['status'] === 'playing') {
        if ($act === 'reveal' || $act === 'flag') {
            $r = (int)($_GET['row'] ?? -1); $c = (int)($_GET['col'] ?? -1);
            if (isset($ms['board'][$r][$c])) {
                if ($act === 'flag' && !$ms['board'][$r][$c]['rev']) { $ms['board'][$r][$c]['flag'] = !$ms['board'][$r][$c]['flag']; $ms['flags'] += $ms['board'][$r][$c]['flag'] ? 1 : -1; } elseif ($act === 'reveal') { if ($ms['first_click']) { ms_place_mines($r, $c); $ms['first_click'] = false; $ms['start_time'] = time(); } ms_reveal($r, $c); if ($ms['status'] === 'playing' && $ms['revealed'] === $ms['rows'] * $ms['cols'] - $ms['mines']) { $ms['status'] = 'won'; $ms['end_time'] = time(); } }
            }
        }
    }
    $face = $ms['status'] === 'won' ? '😎' : ($ms['status'] === 'lost' ? '😵' : '😊'); $time = $ms['start_time'] ? (($ms['end_time'] ?: time()) - $ms['start_time']) : 0; $timeStr = sprintf('%03d', min(999, $time)); $mineLeft = sprintf('%03d', max(0, $ms['mines'] - $ms['flags']));
    $html = '<div class="ms-header"><div class="ms-counter">'.$mineLeft.'</div><button class="ms-btn-face" id="js-ms-face">'.$face.'</button><div class="ms-counter" id="js-ms-timer" data-start="'.$ms['start_time'].'" data-end="'.$ms['end_time'].'">'.$timeStr.'</div></div><div class="ms-grid" style="grid-template-columns: repeat('.$ms['cols'].', 1fr)">';
    for($r=0; $r<$ms['rows']; $r++) { for($c=0; $c<$ms['cols']; $c++) { $cell = $ms['board'][$r][$c]; $cls = 'ms-cell'; $content = ''; $attrs = 'data-r="'.$r.'" data-c="'.$c.'"'; if ($cell['rev']) { $cls .= ' is-revealed'; if ($cell['mine']) { $content = '💣'; $attrs .= ' style="background-color:#ef4444"'; } elseif ($cell['n'] > 0) { $content = $cell['n']; $attrs .= ' data-num="'.$cell['n'].'"'; } } else { if ($cell['flag']) { $content = ($ms['status'] === 'lost' && !$cell['mine']) ? '❌' : '🚩'; } elseif ($ms['status'] === 'lost' && $cell['mine']) { $cls .= ' is-revealed'; $content = '💣'; } } $html .= "<div class=\"{$cls}\" {$attrs}>{$content}</div>"; } }
    $html .= '</div>'; echo $html; exit;
}

function route_admin(): void { 
    global $__route; if ($__route === 'admin/login') { admin_login_page(); return; } 
    require_admin(); 
    switch ($__route) { 
        case 'admin': case 'admin/': case 'admin/dashboard': require ROOT . '/admin/dashboard.php'; break; 
        case 'admin/posts': case 'admin/post/new': require ROOT . '/admin/posts.php'; break; 
        case 'admin/drafts': require ROOT . '/admin/drafts.php'; break; 
        case 'admin/plugin-config': require ROOT . '/admin/plugin_config.php'; break; 
        case 'admin/moments': require ROOT . '/admin/moments.php'; break; 
        case 'admin/comments': require ROOT . '/admin/comments.php'; break; 
        case 'admin/categories': require ROOT . '/admin/categories.php'; break; 
        case 'admin/tags': require ROOT . '/admin/tags.php'; break; 
        case 'admin/links': require ROOT . '/admin/links.php'; break; 
        case 'admin/uploads': require ROOT . '/admin/uploads.php'; break; 
        case 'admin/backups': require ROOT . '/admin/backups.php'; break; 
        case 'admin/themes': require ROOT . '/admin/themes.php'; break; 
        case 'admin/plugins': require ROOT . '/admin/plugins.php'; break; 
        case 'admin/settings': require ROOT . '/admin/settings.php'; break; 
        case 'admin/system-statement': require ROOT . '/admin/system_statement.php'; break; 
        case 'admin/firewall-settings': require ROOT . '/admin/firewall_settings.php'; break; 
        case 'admin/profile': require ROOT . '/admin/profile.php'; break; 
        case 'admin/traces': require ROOT . '/admin/traces.php'; break; 
        case 'admin/f12-probes': require ROOT . '/admin/f12_probes.php'; break; 
        case 'admin/reputation': require ROOT . '/admin/reputation.php'; break; 
        case 'admin/security-decisions': require ROOT . '/admin/security_decisions.php'; break; 
        case 'admin/security-timeline': require ROOT . '/admin/security_timeline.php'; break; 
        case 'admin/bans': require ROOT . '/admin/bans.php'; break; 
        default: if (str_starts_with($__route, 'admin/post/edit/')) { require ROOT . '/admin/posts.php'; } else { front_404(); } break; 
    } 
}

function admin_login_page(): void { 
    if (is_admin()) redirect('admin/dashboard'); 
    $error = ''; $ip = client_ip(); 
    if ($_SERVER['REQUEST_METHOD'] === 'POST') { 
        $u = clean($_POST['username'] ?? '', 30); $p = $_POST['password'] ?? ''; 
        if (admin_verify($u, $p)) { if (class_exists('Firewall')) Firewall::resetLoginFailure($ip); admin_login(); redirect('admin/dashboard'); } else { if (class_exists('Firewall')) { $left = Firewall::trackLoginFailure($ip); $error = $left <= 0 ? '封禁中' : "错 {$left} 次将封禁"; } else { $error = '账号或密码错误'; } } 
    } 
    $siteName = defined('SITE_NAME') ? SITE_NAME : 'LiMhy'; $adminCss = asset('admin.css');
    echo <<<HTML
<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover"><title>系统登录 - {$siteName}</title><link href="https://cdn.bootcdn.net/ajax/libs/remixicon/3.5.0/remixicon.min.css" rel="stylesheet"><link rel="stylesheet" href="{$adminCss}"></head><body class="admin-login-wrapper"><div class="admin-login-card"><div class="admin-login-header"><div class="admin-login-logo"><i class="ri-shield-user-line"></i></div><h1 class="admin-login-title">控制台登录</h1><p class="admin-login-subtitle">身份验证与态势感知中心</p></div>
HTML;
    if ($error) echo '<div class="admin-login-error"><i class="ri-error-warning-fill" style="font-size:16px;"></i><span>' . $error . '</span></div>';
    echo <<<HTML
<form method="POST" autocomplete="off" class="admin-login-form"><div class="c-form__group"><label class="c-form__label">管理员账号</label><div class="form-input-with-icon"><i class="ri-user-3-line"></i><input type="text" name="username" class="form-input" placeholder="输入 Username" required autofocus></div></div><div class="c-form__group"><label class="c-form__label">安全密码</label><div class="form-input-with-icon"><i class="ri-lock-password-line"></i><input type="password" name="password" class="form-input" placeholder="输入 Password" required></div></div><button type="submit" class="btn btn-primary admin-login-btn">安全登入</button></form></div></body></html>
HTML;
    exit; 
}

function limhy_post_html_needs_refresh(array $post): bool
{
    $raw = (string)($post['content'] ?? '');
    $compiled = (string)($post['content_html'] ?? '');
    if ($raw === '') {
        return $compiled === '';
    }
    if ($compiled === '') {
        return true;
    }
    $hasRawHtml = preg_match('/<\s*(div|section|article|aside|header|footer|main|figure|figcaption|svg|path|polyline|line|rect|circle|ellipse|polygon|table|thead|tbody|tr|td|th|video|audio)\b/i', $raw) === 1;
    if (!$hasRawHtml) {
        return false;
    }
    return preg_match('/&lt;\/?\s*(div|section|article|aside|header|footer|main|figure|figcaption|svg|path|polyline|line|rect|circle|ellipse|polygon|table|thead|tbody|tr|td|th|video|audio)\b/i', $compiled) === 1;
}

function limhy_resolve_post_content_html(array $post): string
{
    $compiled = (string)($post['content_html'] ?? '');
    if (!limhy_post_html_needs_refresh($post)) {
        return $compiled;
    }
    return img_lazyload(markdown_to_html((string)($post['content'] ?? '')));
}

function render(string $template, array $data = []): never { 
    if (isset($data['post']) && is_array($data['post'])) {
        if (isset($data['post']['content'])) {
            $data['post']['content_html'] = limhy_resolve_post_content_html($data['post']);
        }
        $data['post']['content_html'] = apply_filters('post_content_html', (string) ($data['post']['content_html'] ?? ''), [
            'template' => $template,
            'data' => $data,
            'post' => $data['post'],
        ]);
    }
    extract($data); $p = prefix(); 
    $navCategories = limhy_cached_query('nav_categories_v1', static function () use ($p) {
        return db_rows("SELECT `name`, `slug` FROM `{$p}categories` ORDER BY `sort_order` ASC LIMIT 10");
    }, 300);
    $navPages = limhy_cached_query('nav_pages_v1', static function () use ($p) {
        return db_rows("SELECT `title`, `slug` FROM `{$p}posts` WHERE `type` = 'page' AND `status` = 'published' LIMIT 5");
    }, 300);
    $themeTemplateFile = theme_template_file($template);
    $themeLayoutFile = theme_layout_file();
    ob_start();
    if ($themeTemplateFile !== '' && is_file($themeTemplateFile)) {
        require $themeTemplateFile;
    } else {
        echo 'Tpl Missing';
    }
    $content = ob_get_clean();
    $content = apply_filters('front_content', $content, ['template' => $template, 'data' => $data]);
    ob_start();
    if ($themeLayoutFile !== '' && is_file($themeLayoutFile)) {
        require $themeLayoutFile;
    } else {
        echo $content;
    }
    $fullPage = ob_get_clean();
    $frontHead = plugin_capture_action('front_head');
    $frontFooter = plugin_capture_action('front_footer');
    if ($frontHead !== '') { $fullPage = preg_replace('/<\/head>/i', $frontHead . '</head>', $fullPage, 1); }
    if ($frontFooter !== '') { $fullPage = preg_replace('/<\/body>/i', $frontFooter . '</body>', $fullPage, 1); }
    ob_start(); Firewall::renderDeviceProbe(); $jsCode = ob_get_clean(); if (isset($post['id']) && ($post['type'] ?? '') === 'post') { $jsCode .= '<img src="' . url('api/ping?post_id=' . $post['id']) . '" style="display:none;" width="1" height="1" alt="">'; }
    $shareImg = url('assets/img/logo.png'); if (isset($post) && is_array($post)) { $realCover = get_post_cover_for_post($post); if ($realCover) { $shareImg = $realCover; } }
    $ogMeta = "\n<meta property='og:image' content='{$shareImg}'>\n<meta property='og:image:secure_url' content='{$shareImg}'>\n<meta name='twitter:image' content='{$shareImg}'>"; $coverBait = "\n<div style='display:none;'><img src='{$shareImg}' alt='cover' width='400' height='400'></div>";
    $finalHtml = preg_replace('/<head[^>]*>/i', "$0" . $ogMeta, $fullPage, 1); $finalHtml = preg_replace('/<body[^>]*>/i', "$0" . $coverBait, $finalHtml, 1);
    $finalHtml = preg_replace_callback('/(<p>\s*(?:<img[^>]+>\s*)+\s*<\/p>\s*){2,}/i', function($m) { preg_match_all('/<img[^>]+>/i', $m[0], $imgs); $count = count($imgs[0]); $inner = implode('', $imgs[0]); return '<div class="sketch-gallery" data-count="'.$count.'">' . $inner . '</div>'; }, $finalHtml);
    $finalHtml = preg_replace_callback('/<p>\s*((?:<img[^>]+>\s*){2,})\s*<\/p>/i', function($m) { preg_match_all('/<img[^>]+>/i', $m[1], $imgs); $count = count($imgs[0]); $inner = implode('', $imgs[0]); return '<div class="sketch-gallery" data-count="'.$count.'">' . $inner . '</div>'; }, $finalHtml);
    $finalHtml = str_replace('</body>', $jsCode . '</body>', $finalHtml); 
    header('X-Accel-Buffering: no'); echo $finalHtml; 
    $requestUri = $_SERVER['REQUEST_URI'] ?? '/'; $isAdmin = isset($_COOKIE['lm_auth']); $hasSessionCookie = !empty($_COOKIE[session_name()]); $isPasswordProtectedView = isset($post['password']) && trim((string)$post['password']) !== ''; $isBypass = ($isAdmin || $hasSessionCookie || $isPasswordProtectedView || limhy_has_pending_comment_context() || ($_SERVER['REQUEST_METHOD']??'GET') !== 'GET' || strpos($requestUri, 'admin') !== false || strpos($requestUri, 'api/') !== false);
    if (!$isBypass) {
        if (function_exists('fastcgi_finish_request')) { fastcgi_finish_request(); } elseif (function_exists('litespeed_finish_request')) { litespeed_finish_request(); } else { @ob_flush(); @flush(); }
        $cacheFile = ROOT . '/data/html_cache/' . md5(active_theme() . '|' . limhy_cache_normalize_request_uri($requestUri)) . '.html';
        $cleanHtml = preg_replace('/(<input[^>]*?name=["\'](?:author|email|url)["\'][^>]*?)value=["\'][^"\']*["\']([^>]*?>)/i', '$1value=""$2', $finalHtml);
        if ($_SERVER['REQUEST_METHOD'] === 'POST') { if (function_exists('clear_html_cache')) clear_html_cache(); }
        if (!is_dir(dirname($cacheFile))) @mkdir(dirname($cacheFile), 0755, true);
        $fp = @fopen($cacheFile, 'c'); if ($fp) { if (@flock($fp, LOCK_EX | LOCK_NB)) { @ftruncate($fp, 0); @fwrite($fp, $cleanHtml); @flock($fp, LOCK_UN); } @fclose($fp); }
    }
    exit; 
}
