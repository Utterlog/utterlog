<?php
/**
 * LiMhy - 自动安装程序
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    全自动环境探针与数据库初始化工具
 */

declare(strict_types=1);

if (file_exists(__DIR__ . '/config.php')) {
    header("HTTP/1.1 403 Forbidden");
    die('<!DOCTYPE html><html><head><meta charset="utf-8"><title>已安装</title></head><body style="font-family:sans-serif;text-align:center;padding-top:100px;"><h1>拒绝访问</h1><p>系统已初始化完毕。如需重装，请手动删除根目录下的 <b>config.php</b>。</p></body></html>');
}

session_start();

/**
 * 协议探针：识别反向代理背后的真实 HTTPS
 */
$isHttps = false;
if ((isset($_SERVER['HTTPS']) && strtolower($_SERVER['HTTPS']) === 'on') || 
    (isset($_SERVER['SERVER_PORT']) && $_SERVER['SERVER_PORT'] == 443) ||
    (isset($_SERVER['HTTP_X_FORWARDED_PROTO']) && strtolower($_SERVER['HTTP_X_FORWARDED_PROTO']) === 'https')) {
    $isHttps = true;
}
$defaultProtocol = $isHttps ? 'https://' : 'http://';
$defaultSiteUrl = $defaultProtocol . ($_SERVER['HTTP_HOST'] ?? 'localhost');

$step = $_GET['step'] ?? 'check';
$error = '';
$success = '';

/**
 * 环境核心依赖自检
 */
$env = [
    'php' => ['name' => 'PHP >= 7.4', 'pass' => PHP_VERSION_ID >= 70400, 'msg' => '当前: ' . PHP_VERSION],
    'pdo' => ['name' => 'PDO_MYSQL 扩展', 'pass' => extension_loaded('pdo_mysql'), 'msg' => '必须'],
    'mb'  => ['name' => 'MBString 扩展', 'pass' => extension_loaded('mbstring'), 'msg' => '必须'],
    'dir' => ['name' => '根目录写入权限', 'pass' => is_writable(__DIR__), 'msg' => '用于配置文件生成']
];

$envAllPass = true;
foreach ($env as $item) { if (!$item['pass']) $envAllPass = false; }

$dataDir = __DIR__ . '/data';
if (!is_dir($dataDir)) { @mkdir($dataDir, 0755, true); }
$env['data'] = ['name' => 'Data 目录写入', 'pass' => is_writable($dataDir), 'msg' => '用于系统数据持久化'];
if (!$env['data']['pass']) $envAllPass = false;

/**
 * 处理安装逻辑
 */
if ($_SERVER['REQUEST_METHOD'] === 'POST' && $step === 'install' && $envAllPass) {
    $dbHost = trim($_POST['db_host'] ?? 'localhost');
    $dbName = trim($_POST['db_name'] ?? '');
    $dbUser = trim($_POST['db_user'] ?? '');
    $dbPass = trim($_POST['db_pass'] ?? '');
    $dbPrefix = trim($_POST['db_prefix'] ?? 'lm_');
    
    $siteName = trim($_POST['site_name'] ?? 'LiMhy');
    $siteUrl = rtrim(trim($_POST['site_url'] ?? $defaultSiteUrl), '/');
    $adminUser = trim($_POST['admin_user'] ?? 'admin');
    $adminPass = $_POST['admin_pass'] ?? '';
    $adminEmail = trim($_POST['admin_email'] ?? '');

    if (!$dbName || !$dbUser || !$adminPass || !$adminEmail) {
        $error = '请填写所有必填项！';
    } else {
        try {
            $pdo = new PDO("mysql:host={$dbHost};dbname={$dbName};charset=utf8mb4", $dbUser, $dbPass, [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
            ]);

            install_database($pdo, $dbPrefix, $adminUser, $adminPass, $adminEmail, $siteName);

            $adminPassHash = password_hash($adminPass, PASSWORD_DEFAULT);
            $randomString = bin2hex(random_bytes(16));
            $adminSecret = hash('sha256', $randomString . time());

            $configContent = "<?php\n// LiMhy 核心配置文件 — 生成于 " . date('Y-m-d H:i:s') . "\n\n";
            $configContent .= "define('DB_HOST', '" . addslashes($dbHost) . "');\n";
            $configContent .= "define('DB_NAME', '" . addslashes($dbName) . "');\n";
            $configContent .= "define('DB_USER', '" . addslashes($dbUser) . "');\n";
            $configContent .= "define('DB_PASS', '" . addslashes($dbPass) . "');\n";
            $configContent .= "define('DB_PREFIX', '" . addslashes($dbPrefix) . "');\n\n";
            $configContent .= "define('SITE_NAME', '" . addslashes($siteName) . "');\n";
            $configContent .= "define('SITE_URL', '" . addslashes($siteUrl) . "');\n";
            $configContent .= "define('SITE_DESC', '基于原生 PHP 驱动的极简、极速、零依赖博客系统。');\n\n";
            $configContent .= "define('ADMIN_USER', '" . addslashes($adminUser) . "');\n";
            $configContent .= "define('ADMIN_PASS_HASH', '" . addslashes($adminPassHash) . "');\n";
            $configContent .= "define('ADMIN_SECRET', '" . $adminSecret . "');\n\n";
            $configContent .= "define('POSTS_PER_PAGE', 10);\n";
            $configContent .= "define('HOME_POSTS_PER_PAGE', 4);\n";
            $configContent .= "define('COMMENTS_NEED_REVIEW', true);\n";
            $configContent .= "define('ACTIVE_THEME', 'default');\n";
            $configContent .= "define('ADMIN_EMAIL', '" . addslashes($adminEmail) . "');\n";

            if (file_put_contents(__DIR__ . '/config.php', $configContent)) {
                $step = 'done';
            } else {
                $error = '无法写入 config.php，请检查文件权限。';
            }
        } catch (PDOException $e) { $error = '数据库连接失败: ' . $e->getMessage(); }
    }
}

/**
 * 物理表结构定义与初始化
 */
function install_database(PDO $pdo, string $p, string $adminUser, string $adminPass, string $adminEmail, string $siteName): void {
    $sqls = [
        "CREATE TABLE IF NOT EXISTS `{$p}users` (`id` int(11) NOT NULL AUTO_INCREMENT, `username` varchar(50) NOT NULL, `password` varchar(255) NOT NULL, `screen_name` varchar(100) NOT NULL, `mail` varchar(100) NOT NULL, `role` varchar(20) DEFAULT 'admin', PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}categories` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `slug` varchar(191) NOT NULL, `description` varchar(500) DEFAULT NULL, `sort_order` int(11) DEFAULT 0, `post_count` int(11) DEFAULT 0, PRIMARY KEY (`id`), UNIQUE KEY `slug` (`slug`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}posts` (`id` int(11) NOT NULL AUTO_INCREMENT, `category_id` int(11) DEFAULT NULL, `title` varchar(255) NOT NULL, `slug` varchar(191) NOT NULL, `custom_cover_url` varchar(500) DEFAULT '', `content` longtext DEFAULT NULL, `content_html` longtext NOT NULL, `excerpt` text DEFAULT NULL, `password` varchar(255) DEFAULT '', `type` varchar(20) DEFAULT 'post', `status` varchar(20) DEFAULT 'published', `comment_enabled` tinyint(1) DEFAULT 1, `rss_enabled` tinyint(1) DEFAULT 1, `is_pinned` tinyint(1) DEFAULT 0, `view_count` int(11) DEFAULT 0, `comment_count` int(11) DEFAULT 0, `published_at` datetime NOT NULL, `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP, `updated_at` datetime DEFAULT NULL, PRIMARY KEY (`id`), UNIQUE KEY `slug` (`slug`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}tags` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(50) NOT NULL, `slug` varchar(191) NOT NULL, `post_count` int(11) DEFAULT 0, PRIMARY KEY (`id`), UNIQUE KEY `slug` (`slug`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}post_tags` (`post_id` int(11) NOT NULL, `tag_id` int(11) NOT NULL, PRIMARY KEY (`post_id`,`tag_id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}comments` (`id` int(11) NOT NULL AUTO_INCREMENT, `post_id` int(11) NOT NULL, `parent_id` int(11) DEFAULT 0, `author` varchar(50) NOT NULL, `email` varchar(100) DEFAULT NULL, `url` varchar(200) DEFAULT NULL, `content` text NOT NULL, `ip` varchar(50) NOT NULL, `status` varchar(20) DEFAULT 'approved', `is_admin` tinyint(1) DEFAULT 0, `is_featured` tinyint(1) DEFAULT 0, `created_at` datetime DEFAULT CURRENT_TIMESTAMP, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}links` (`id` int(11) NOT NULL AUTO_INCREMENT, `name` varchar(100) NOT NULL, `url` varchar(255) NOT NULL, `desc` varchar(255) DEFAULT NULL, `logo` varchar(255) DEFAULT NULL, `status` tinyint(1) DEFAULT 1, `visible` tinyint(1) DEFAULT 1, `sort_order` int(11) DEFAULT 0, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}uploads` (`id` int(11) NOT NULL AUTO_INCREMENT, `filename` varchar(255) NOT NULL, `original_name` varchar(255) NOT NULL, `path` TEXT NOT NULL, `mime_type` varchar(100) DEFAULT NULL, `size` int(11) DEFAULT 0, `created_at` datetime NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}moments` (`id` int(11) NOT NULL AUTO_INCREMENT, `content` text NOT NULL, `images` text DEFAULT NULL, `created_at` datetime NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}logs` (`id` int(11) NOT NULL AUTO_INCREMENT, `title` varchar(255) NOT NULL, `content` text NOT NULL, `likes` int(11) DEFAULT 0, `created_at` datetime NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}feedbacks` (`id` int(11) NOT NULL AUTO_INCREMENT, `author` varchar(100) NOT NULL, `content` text NOT NULL, `status` varchar(20) DEFAULT 'pending', `created_at` datetime NOT NULL, PRIMARY KEY (`id`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}log_likes` (`log_id` int(11) NOT NULL, `ip` varchar(50) NOT NULL, PRIMARY KEY (`log_id`,`ip`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}user_likes` (`email` varchar(100) NOT NULL, `likes` int(11) DEFAULT 0, PRIMARY KEY (`email`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;",
        "CREATE TABLE IF NOT EXISTS `{$p}user_like_logs` (`ip` varchar(50) NOT NULL, `log_date` date NOT NULL, `daily_count` int(11) DEFAULT 0, PRIMARY KEY (`ip`, `log_date`)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;"
    ];

    foreach ($sqls as $sql) { $pdo->exec($sql); }
    $catCount = $pdo->query("SELECT COUNT(*) FROM `{$p}categories`")->fetchColumn();
    if ($catCount == 0) {
        $pdo->exec("INSERT INTO `{$p}categories` (`name`, `slug`, `post_count`) VALUES ('默认分类', 'default', 1)");
        $pdo->exec("INSERT INTO `{$p}posts` (`category_id`, `title`, `slug`, `content`, `content_html`, `excerpt`, `published_at`, `created_at`) VALUES (1, 'Hello LiMhy', 'hello-world', '欢迎使用 LiMhy。', '<p>欢迎使用 LiMhy。这是一个极致性能的极简博客系统。</p>', '欢迎使用 LiMhy...', NOW(), NOW())");
    }
    $userCount = $pdo->query("SELECT COUNT(*) FROM `{$p}users`")->fetchColumn();
    if ($userCount == 0) {
        $adminPassHash = password_hash($adminPass, PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT INTO `{$p}users` (`username`, `password`, `screen_name`, `mail`, `role`) VALUES (?, ?, ?, ?, 'admin')");
        $stmt->execute([$adminUser, $adminPassHash, $adminUser, $adminEmail]);
    }
}
?>
<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>LiMhy 安装向导</title><style>:root{--bg:#fdfdfd;--main:#10b981;--border:2px solid #000;--shadow:4px 4px 0 #000}*{box-sizing:border-box;margin:0;padding:0}body{font-family:system-ui,-apple-system,sans-serif;background:var(--bg);padding:40px 16px;display:flex;justify-content:center}.install-box{width:100%;max-width:680px;background:#fff;border:var(--border);border-radius:12px;box-shadow:var(--shadow);overflow:hidden}.install-header{background:#000;color:#fff;padding:20px;text-align:center}.install-body{padding:30px}.alert{padding:12px 16px;border:2px solid #000;border-radius:8px;font-weight:700;margin-bottom:24px;font-size:14px}.alert-error{background:#fef2f2;border-color:#dc2626;color:#b91c1c}.env-list{list-style:none;margin-bottom:30px;border:var(--border);border-radius:8px;overflow:hidden}.env-item{display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px dashed #ccc;font-size:14px;font-weight:700}.status-ok{color:#059669;background:#d1fae5;padding:2px 8px;border-radius:4px;border:1px solid #059669}.status-err{color:#dc2626;background:#fee2e2;padding:2px 8px;border-radius:4px;border:1px solid #dc2626}.form-section{margin-bottom:30px}.form-section-title{font-size:18px;font-weight:900;border-bottom:2px dashed #000;padding-bottom:8px;margin-bottom:20px}.form-row{display:grid;grid-template-columns:1fr;gap:15px;margin-bottom:15px}@media (min-width:600px){.form-row{grid-template-columns:1fr 1fr}}.input-group{display:flex;flex-direction:column;gap:6px}.input-group label{font-size:13px;font-weight:800}.sketch-input{padding:10px 12px;border:var(--border);border-radius:6px;font-size:15px;font-weight:700;outline:none}.sketch-btn{display:block;width:100%;padding:14px;background:#000;color:#fff;border:var(--border);border-radius:8px;font-size:16px;font-weight:900;cursor:pointer;text-align:center;box-shadow:var(--shadow);text-decoration:none}</style></head><body><div class="install-box"><div class="install-header"><h1>LiMhy 安装向导</h1><p>LiMhy · v3.0 官方稳定版</p></div><div class="install-body"><?php if($error): ?><div class="alert alert-error">❌ <?=$error?></div><?php endif; ?><?php if($step==='check'||$error): ?><div class="form-section-title">环境自检</div><ul class="env-list"><?php foreach($env as $item): ?><li class="env-item"><span><?=$item['name']?> (<?=$item['msg']?>)</span><?php if($item['pass']): ?><span class="status-ok">OK</span><?php else: ?><span class="status-err">FAIL</span><?php endif; ?></li><?php endforeach; ?></ul><?php if(!$envAllPass): ?><div class="alert alert-error">环境未达标，请修正后重试。</div><button class="sketch-btn" disabled>系统锁定</button><?php else: ?><form method="POST" action="?step=install"><div class="form-section"><div class="form-section-title">数据库</div><div class="form-row"><div class="input-group"><label>数据库地址</label><input type="text" name="db_host" class="sketch-input" value="localhost" required></div><div class="input-group"><label>数据库名称</label><input type="text" name="db_name" class="sketch-input" required></div></div><div class="form-row"><div class="input-group"><label>用户名</label><input type="text" name="db_user" class="sketch-input" required></div><div class="input-group"><label>密码</label><input type="password" name="db_pass" class="sketch-input" required></div></div><div class="input-group"><label>表前缀</label><input type="text" name="db_prefix" class="sketch-input" value="lm_"></div></div><div class="form-section"><div class="form-section-title">站点与管理员</div><div class="form-row"><div class="input-group"><label>站点名称</label><input type="text" name="site_name" class="sketch-input" value="LiMhy" required></div><div class="input-group"><label>URL</label><input type="url" name="site_url" class="sketch-input" value="<?=$defaultSiteUrl?>" required></div></div><div class="form-row"><div class="input-group"><label>账号</label><input type="text" name="admin_user" class="sketch-input" value="admin" required></div><div class="input-group"><label>密码</label><input type="text" name="admin_pass" class="sketch-input" required></div></div><div class="input-group"><label>邮箱</label><input type="email" name="admin_email" class="sketch-input" required></div></div><button type="submit" class="sketch-btn">立即部署</button></form><?php endif; ?><?php elseif($step==='done'): ?><div style="text-align:center;padding:20px 0"><h2 style="font-size:28px;margin-bottom:10px">安装成功！</h2><p style="margin-bottom:30px">系统底层骨架已搭建完毕。</p><div class="alert alert-error" style="text-align:left">请<b>立即删除 install.php</b> 以保障安全！</div><a href="index.php" class="sketch-btn" style="background:#10b981">前往首页</a><a href="index.php?r=admin/login" class="sketch-btn" style="margin-top:15px;background:#fff;color:#000">进入后台</a></div><?php endif; ?></div></div></body></html>
