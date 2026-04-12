<?php
/**
 * LiMhy - 主题外观管理
 */
require_once __DIR__ . '/../index.php';

$currentNav = 'themes';
$pageTitle = '主题外观';

if (!function_exists('update_theme_config_file')) {
    function update_theme_config_file(array $updates): bool
    {
        $cfgFile = ROOT . '/config.php';
        if (!is_file($cfgFile) || !is_writable($cfgFile)) {
            return false;
        }

        $lines = @file($cfgFile, FILE_IGNORE_NEW_LINES);
        if ($lines === false) {
            return false;
        }

        $outLines = [];
        $keysFound = [];

        foreach ($lines as $line) {
            $line = rtrim($line);
            $cleanLine = preg_replace('/(\s*\x3F\x3E\s*)$/s', '', $line);
            if ($cleanLine === "\x3F\x3E") {
                continue;
            }
            $line = $cleanLine;

            $isUpdatedKey = false;
            foreach ($updates as $key => $val) {
                if (preg_match("/^[ \t]*define\s*\(\s*[\'\"]" . preg_quote($key, "/") . "[\'\"]/i", $line)) {
                    if (!isset($keysFound[$key])) {
                        $outLines[] = 'define(' . var_export($key, true) . ', ' . var_export($val, true) . ');';
                        $keysFound[$key] = true;
                    }
                    $isUpdatedKey = true;
                    break;
                }
            }

            if (!$isUpdatedKey) {
                $outLines[] = $line;
            }
        }

        foreach ($updates as $key => $val) {
            if (!isset($keysFound[$key])) {
                $outLines[] = 'define(' . var_export($key, true) . ', ' . var_export($val, true) . ');';
            }
        }

        $final = rtrim(implode(PHP_EOL, $outLines)) . PHP_EOL;
        return file_put_contents($cfgFile, $final, LOCK_EX) !== false;
    }
}

if (!function_exists('theme_admin_remove_dir')) {
    function theme_admin_remove_dir(string $dir): void
    {
        if (!is_dir($dir)) {
            return;
        }

        $items = scandir($dir);
        if (!is_array($items)) {
            return;
        }

        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }

            $path = $dir . '/' . $item;
            if (is_dir($path) && !is_link($path)) {
                theme_admin_remove_dir($path);
            } else {
                @unlink($path);
            }
        }

        @rmdir($dir);
    }
}

if (!function_exists('theme_admin_copy_dir')) {
    function theme_admin_copy_dir(string $src, string $dst): bool
    {
        if (!is_dir($src)) {
            return false;
        }

        if (!is_dir($dst) && !@mkdir($dst, 0755, true) && !is_dir($dst)) {
            return false;
        }

        $items = scandir($src);
        if (!is_array($items)) {
            return false;
        }

        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }

            $from = $src . '/' . $item;
            $to = $dst . '/' . $item;

            if (is_dir($from) && !is_link($from)) {
                if (!theme_admin_copy_dir($from, $to)) {
                    return false;
                }
                continue;
            }

            if (!@copy($from, $to)) {
                return false;
            }
        }

        return true;
    }
}

if (!function_exists('theme_admin_safe_zip_extract')) {
    function theme_admin_safe_zip_extract(string $zipFile, string $targetDir): array
    {
        if (!class_exists('ZipArchive')) {
            return ['ok' => false, 'msg' => '当前 PHP 环境未启用 ZipArchive，无法解压主题包。'];
        }

        $zip = new ZipArchive();
        if ($zip->open($zipFile) !== true) {
            return ['ok' => false, 'msg' => '主题压缩包无法打开，可能已损坏。'];
        }

        if ($zip->numFiles > 1200) {
            $zip->close();
            return ['ok' => false, 'msg' => '压缩包文件数量异常，已拒绝导入。'];
        }

        $totalUncompressed = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            if (is_array($stat)) {
                $totalUncompressed += (int)($stat['size'] ?? 0);
            }
        }
        if ($totalUncompressed > 150 * 1024 * 1024) {
            $zip->close();
            return ['ok' => false, 'msg' => '压缩包展开后体积过大，已拒绝导入。'];
        }

        if (!is_dir($targetDir) && !@mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
            $zip->close();
            return ['ok' => false, 'msg' => '无法创建临时解压目录。'];
        }

        for ($i = 0; $i < $zip->numFiles; $i++) {
            $name = (string)$zip->getNameIndex($i);
            $clean = str_replace('\\', '/', $name);
            $clean = preg_replace('#/+#', '/', $clean);
            $clean = ltrim($clean, '/');

            if ($clean === '' || str_starts_with($clean, '__MACOSX/') || str_ends_with($clean, '/.DS_Store') || str_ends_with($clean, '.DS_Store')) {
                continue;
            }

            if (preg_match('#(^|/)\.\.(?:/|$)#', $clean) === 1 || preg_match('#^[A-Za-z]:#', $clean) === 1) {
                $zip->close();
                return ['ok' => false, 'msg' => '压缩包路径非法，已拒绝导入。'];
            }

            $target = $targetDir . '/' . $clean;
            if (str_ends_with($clean, '/')) {
                if (!is_dir($target) && !@mkdir($target, 0755, true) && !is_dir($target)) {
                    $zip->close();
                    return ['ok' => false, 'msg' => '创建解压目录失败：' . $clean];
                }
                continue;
            }

            $parent = dirname($target);
            if (!is_dir($parent) && !@mkdir($parent, 0755, true) && !is_dir($parent)) {
                $zip->close();
                return ['ok' => false, 'msg' => '创建解压目录失败：' . basename($parent)];
            }

            $stream = $zip->getStream($name);
            if (!is_resource($stream)) {
                $zip->close();
                return ['ok' => false, 'msg' => '读取压缩包条目失败：' . $clean];
            }

            $out = fopen($target, 'wb');
            if (!is_resource($out)) {
                fclose($stream);
                $zip->close();
                return ['ok' => false, 'msg' => '写入解压文件失败：' . $clean];
            }

            stream_copy_to_stream($stream, $out);
            fclose($stream);
            fclose($out);
        }

        $zip->close();
        return ['ok' => true];
    }
}

if (!function_exists('theme_admin_detect_root')) {
    function theme_admin_detect_root(string $extractDir): array
    {
        $candidates = [];
        if (is_file($extractDir . '/theme.php')) {
            $candidates[] = $extractDir;
        }

        $iterator = new RecursiveIteratorIterator(
            new RecursiveDirectoryIterator($extractDir, FilesystemIterator::SKIP_DOTS),
            RecursiveIteratorIterator::SELF_FIRST
        );

        foreach ($iterator as $item) {
            if (!$item->isDir()) {
                continue;
            }

            $path = $item->getPathname();
            $relative = str_replace('\\', '/', substr($path, strlen($extractDir) + 1));
            if ($relative === false) {
                $relative = '';
            }
            if ($relative !== '' && substr_count(trim($relative, '/'), '/') > 1) {
                continue;
            }

            if (is_file($path . '/theme.php')) {
                $candidates[] = $path;
            }
        }

        $candidates = array_values(array_unique(array_filter($candidates, 'is_dir')));
        if ($candidates === []) {
            return ['ok' => false, 'msg' => '压缩包内未识别到合法主题根目录，缺少 theme.php。'];
        }
        if (count($candidates) > 1) {
            return ['ok' => false, 'msg' => '一个主题安装包只能包含一套主题，请不要把多套主题打进同一个 ZIP。'];
        }

        $root = $candidates[0];
        $health = theme_directory_health($root);
        if (!$health['ok']) {
            return ['ok' => false, 'msg' => '主题缺少必要文件：' . implode('、', $health['missing'])];
        }

        $meta = theme_manifest_from_file($root . '/theme.php', basename($root));
        $slug = (string)($meta['slug'] ?? basename($root));
        if (!theme_slug_is_valid($slug)) {
            $slug = basename($root);
        }
        if (!theme_slug_is_valid($slug)) {
            return ['ok' => false, 'msg' => '主题 slug 非法，只允许字母、数字、中划线和下划线。'];
        }

        return [
            'ok' => true,
            'root' => $root,
            'slug' => $slug,
            'meta' => $meta,
            'health' => $health,
        ];
    }
}

if (!function_exists('theme_admin_install_zip')) {
    function theme_admin_install_zip(array $file, bool $allowOverwrite = false): array
    {
        if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
            return ['ok' => false, 'msg' => '主题压缩包上传失败，请重新选择 ZIP 文件。'];
        }

        $originalName = (string)($file['name'] ?? '');
        $tmpName = (string)($file['tmp_name'] ?? '');
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));
        if ($ext !== 'zip') {
            return ['ok' => false, 'msg' => '当前只支持 ZIP 主题安装包。'];
        }

        $size = (int)($file['size'] ?? 0);
        if ($size <= 0 || $size > 30 * 1024 * 1024) {
            return ['ok' => false, 'msg' => '主题压缩包大小不合法，当前限制 30MB。'];
        }

        $tmpRoot = ROOT . '/data/tmp/theme-install-' . date('YmdHis') . '-' . bin2hex(random_bytes(4));
        $extractDir = $tmpRoot . '/extract';
        if (!is_dir(dirname($tmpRoot)) && !@mkdir(dirname($tmpRoot), 0755, true) && !is_dir(dirname($tmpRoot))) {
            return ['ok' => false, 'msg' => '无法创建主题安装临时目录。'];
        }
        if (!@mkdir($extractDir, 0755, true) && !is_dir($extractDir)) {
            return ['ok' => false, 'msg' => '无法创建主题解压目录。'];
        }

        try {
            $extract = theme_admin_safe_zip_extract($tmpName, $extractDir);
            if (!$extract['ok']) {
                return $extract;
            }

            $detected = theme_admin_detect_root($extractDir);
            if (!$detected['ok']) {
                return $detected;
            }

            $slug = (string)$detected['slug'];
            $themeName = (string)($detected['meta']['name'] ?? $slug);
            $dest = ROOT . '/themes/' . $slug;

            if (!is_dir(ROOT . '/themes') && !@mkdir(ROOT . '/themes', 0755, true) && !is_dir(ROOT . '/themes')) {
                return ['ok' => false, 'msg' => 'themes 目录不可写，无法安装新主题。'];
            }

            if (is_dir($dest)) {
                if ($slug === active_theme()) {
                    return ['ok' => false, 'msg' => '当前启用主题不允许被在线覆盖，请先切换到其它主题后再更新。'];
                }
                if (!$allowOverwrite) {
                    return ['ok' => false, 'msg' => '发现同名主题目录，请勾选“允许覆盖同名未启用主题”后重试。'];
                }
                theme_admin_remove_dir($dest);
            }

            if (!theme_admin_copy_dir($detected['root'], $dest)) {
                theme_admin_remove_dir($dest);
                return ['ok' => false, 'msg' => '主题文件复制失败，安装已中止。'];
            }

            return [
                'ok' => true,
                'msg' => '主题安装成功：' . $themeName,
                'slug' => $slug,
                'name' => $themeName,
            ];
        } finally {
            theme_admin_remove_dir($tmpRoot);
        }
    }
}

if (!function_exists('theme_admin_is_protected_theme')) {
    function theme_admin_is_protected_theme(string $slug): bool
    {
        return $slug === 'default';
    }
}

if (!function_exists('theme_admin_delete_theme')) {
    function theme_admin_delete_theme(string $slug): array
    {
        if (!theme_slug_is_valid($slug)) {
            return ['ok' => false, 'msg' => '主题标识非法，删除请求已拒绝。'];
        }

        if (!theme_exists($slug)) {
            return ['ok' => false, 'msg' => '目标主题不存在，可能已被删除。'];
        }

        if ($slug === active_theme()) {
            return ['ok' => false, 'msg' => '当前启用主题不允许删除，请先切换到其它主题。'];
        }

        if (theme_admin_is_protected_theme($slug)) {
            return ['ok' => false, 'msg' => '官方默认主题受保护，暂不允许删除。'];
        }

        $themesRoot = realpath(ROOT . '/themes');
        $target = realpath(ROOT . '/themes/' . $slug);
        if ($themesRoot === false || $target === false || !is_dir($target)) {
            return ['ok' => false, 'msg' => '目标主题目录不存在。'];
        }

        $themesRoot = rtrim(str_replace('\\', '/', $themesRoot), '/');
        $target = str_replace('\\', '/', $target);
        if (!str_starts_with($target, $themesRoot . '/')) {
            return ['ok' => false, 'msg' => '主题目录越界，删除请求已拒绝。'];
        }

        if (is_link($target)) {
            return ['ok' => false, 'msg' => '符号链接主题目录不允许直接删除。'];
        }

        theme_admin_remove_dir($target);
        clearstatcache(true, $target);
        if (is_dir($target)) {
            return ['ok' => false, 'msg' => '主题目录删除失败，请检查文件权限。'];
        }

        return ['ok' => true, 'msg' => '主题已删除：' . (theme_meta($slug)['name'] ?? $slug) . '。'];
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();

    $action = $_POST['_action'] ?? '';
    if ($action === 'activate') {
        $theme = trim((string)($_POST['theme'] ?? ''));

        if (!theme_slug_is_valid($theme) || !theme_exists($theme)) {
            set_flash('error', '目标主题不存在，或主题标识非法。');
            redirect('admin/themes');
        }

        $diagnostics = theme_diagnostics($theme);
        if (!$diagnostics['can_activate']) {
            $errorMsg = $diagnostics['messages']['error'][0] ?? '目标主题体检未通过，暂不允许启用。';
            set_flash('error', '目标主题体检未通过：' . $errorMsg);
            redirect('admin/themes');
        }

        if (!update_theme_config_file(['ACTIVE_THEME' => $theme])) {
            set_flash('error', '配置文件不可写，主题启用失败。请检查 config.php 权限。');
            redirect('admin/themes');
        }

        if (function_exists('clear_html_cache')) {
            clear_html_cache();
        }

        $warningNote = '';
        if (!empty($diagnostics['messages']['warning'])) {
            $warningNote = '（提醒：' . implode('；', array_slice($diagnostics['messages']['warning'], 0, 2)) . '）';
        }

        set_flash('success', '主题已切换为「' . (theme_meta($theme)['name'] ?? $theme) . '」' . $warningNote . '。');
        redirect('admin/themes');
    }

    if ($action === 'delete') {
        $theme = trim((string)($_POST['theme'] ?? ''));
        $result = theme_admin_delete_theme($theme);
        set_flash($result['ok'] ? 'success' : 'error', $result['msg']);
        redirect('admin/themes');
    }

    if ($action === 'install_zip') {
        $allowOverwrite = isset($_POST['allow_overwrite']) && (string)$_POST['allow_overwrite'] === '1';
        $result = theme_admin_install_zip($_FILES['theme_zip'] ?? [], $allowOverwrite);
        set_flash($result['ok'] ? 'success' : 'error', $result['msg']);
        redirect('admin/themes');
    }
}

$activeTheme = active_theme();
$themes = available_themes();
$themeCount = count($themes);

ob_start();
?>
<div class="theme-page-toolbar">
    <div class="theme-page-intro">
        <div class="card-title">前台主题管理</div>
        <p>这里管理的是前台展示主题，不会影响后台控制台。现在已经支持本地主题扫描、启用切换、预览图识别、必要模板校验、ZIP 安装包导入，以及非当前主题的安全删除。</p>
    </div>
    <div class="theme-page-actions">
        <span class="theme-chip"><i class="ri-stack-line"></i> 已识别 <?= (int)$themeCount ?> 套主题</span>
        <span class="theme-chip"><i class="ri-delete-bin-6-line"></i> 支持安全删除非当前主题</span>
        <a href="<?= url() ?>" target="_blank" class="btn btn-ghost">访问前台</a>
    </div>
</div>

<div class="card theme-installer-card">
    <div class="theme-installer-card__header">
        <div>
            <h3 class="theme-installer-card__title">安装主题 ZIP 包</h3>
            <p class="theme-installer-card__desc">主题包根目录必须包含 <code>theme.php</code>、<code>layout.php</code>、<code>home.php</code>。建议一包只放一套主题，避免把多个主题压在同一个 ZIP 中。</p>
        </div>
        <div class="theme-card__meta">
            <span class="theme-chip"><i class="ri-folder-zip-line"></i> 仅支持 ZIP</span>
            <span class="theme-chip"><i class="ri-hard-drive-3-line"></i> 最大 30MB</span>
        </div>
    </div>

    <form method="POST" action="<?= url('admin/themes') ?>" enctype="multipart/form-data" class="theme-installer-form" id="theme-installer-form">
        <?= csrf_field() ?>
        <input type="hidden" name="_action" value="install_zip">

        <div class="theme-installer-form__grid">
            <label class="theme-upload-box" for="theme-zip-file" id="theme-upload-box">
                <input id="theme-zip-file" type="file" name="theme_zip" accept=".zip,application/zip" required>
                <i class="ri-upload-cloud-2-line"></i>
                <strong id="theme-upload-title">选择主题压缩包</strong>
                <span>支持直接上传主题 ZIP；安装时会自动识别根目录、校验必要模板，并阻止非法路径解包。</span>
                <div class="theme-upload-status" id="theme-upload-status" aria-live="polite">
                    <span class="theme-upload-status__empty">未选择任何 ZIP 文件</span>
                    <span class="theme-upload-status__selected" hidden>
                        <strong id="theme-upload-name">-</strong>
                        <em id="theme-upload-size">-</em>
                    </span>
                </div>
            </label>

            <div class="theme-installer-form__side">
                <label class="checkbox-item">
                    <input type="checkbox" name="allow_overwrite" value="1">
                    <span>允许覆盖同名未启用主题</span>
                </label>
                <div class="theme-installer-notes">
                    <p><strong>覆盖策略：</strong>当前启用主题禁止在线覆盖，避免前台运行时文件被热替换。</p>
                    <p><strong>安全策略：</strong>解压时会阻止目录穿越、拒绝异常大包，并只接受一套主题目录。</p>
                </div>
                <button type="submit" class="btn btn-primary" id="theme-install-submit" disabled>请选择 ZIP</button>
            </div>
        </div>
    </form>
</div>

<?php if ($themeCount > 0): ?>
<div class="theme-grid">
    <?php foreach ($themes as $slug => $meta):
        $isActive = $slug === $activeTheme;
        $previewUrl = theme_preview_url($slug);
        $diagnostics = theme_diagnostics($slug);
        $themeName = (string)($meta['name'] ?? $slug);
        $themeAuthor = trim((string)($meta['author'] ?? ''));
        $themeVersion = trim((string)($meta['version'] ?? '0.0.0'));
        $themeRequires = trim((string)($meta['requires'] ?? '2.0.0'));
        $themeDescription = trim((string)($meta['description'] ?? ''));
        if ($themeAuthor === '') {
            $themeAuthor = '未知作者';
        }
        if ($themeDescription === '') {
            $themeDescription = '当前主题未填写描述信息。建议后续为每套主题补充主题说明、设计定位与兼容版本。';
        }
        $isProtected = theme_admin_is_protected_theme($slug);
        $canDelete = !$isActive && !$isProtected;
        $canActivate = (bool)$diagnostics['can_activate'];
        $diagStatus = (string)$diagnostics['status'];
        $statusMap = [
            'ok' => ['label' => '健康', 'class' => 'theme-health-badge--ok', 'icon' => 'ri-checkbox-circle-line'],
            'warning' => ['label' => '警告', 'class' => 'theme-health-badge--warning', 'icon' => 'ri-error-warning-line'],
            'error' => ['label' => '异常', 'class' => 'theme-health-badge--error', 'icon' => 'ri-close-circle-line'],
        ];
        $statusInfo = $statusMap[$diagStatus] ?? $statusMap['warning'];
        $checkCounts = ['ok' => 0, 'warning' => 0, 'error' => 0];
        foreach ($diagnostics['checks'] as $checkItem) {
            $level = (string)($checkItem['level'] ?? 'warning');
            if (!isset($checkCounts[$level])) {
                $checkCounts[$level] = 0;
            }
            $checkCounts[$level]++;
        }
        $totalChecks = count($diagnostics['checks']);
        $summaryText = $checkCounts['ok'] . '/' . $totalChecks . ' 检查通过';
        if ($diagStatus === 'warning') {
            $summaryText = $checkCounts['ok'] . '/' . $totalChecks . ' 通过，' . $checkCounts['warning'] . ' 项提醒';
        } elseif ($diagStatus === 'error') {
            $summaryText = $checkCounts['error'] . ' 项异常，建议先修复后再启用';
        }
        $detailsExpanded = $diagStatus === 'error';
    ?>
    <div class="card theme-card<?= $isActive ? ' is-active' : '' ?><?= !$canActivate ? ' has-error' : '' ?>">
        <div class="theme-card__preview">
            <?php if ($previewUrl !== ''): ?>
                <img src="<?= e($previewUrl) ?>" alt="<?= e($themeName) ?> 预览图">
            <?php else: ?>
                <div class="theme-card__preview-fallback">
                    <strong><?= e($themeName) ?></strong>
                    <span>未提供 preview/screenshot 预览图</span>
                </div>
            <?php endif; ?>
        </div>

        <div class="theme-card__body">
            <div class="theme-card__title-row">
                <h3 class="theme-card__title"><?= e($themeName) ?></h3>
                <?php if ($isActive): ?>
                    <span class="badge badge-published">当前启用</span>
                <?php else: ?>
                    <span class="badge badge-draft">待命中</span>
                <?php endif; ?>
            </div>

            <div class="theme-card__meta">
                <span class="theme-chip"><i class="ri-price-tag-3-line"></i> <?= e($slug) ?></span>
                <span class="theme-chip"><i class="ri-user-3-line"></i> <?= e($themeAuthor) ?></span>
                <span class="theme-chip"><i class="ri-git-branch-line"></i> v<?= e($themeVersion) ?></span>
                <span class="theme-chip"><i class="ri-shield-check-line"></i> 需内核 <?= e($themeRequires) ?></span>
            </div>

            <p class="theme-card__desc"><?= e($themeDescription) ?></p>

            <div class="theme-card__health-row">
                <span class="theme-health-badge <?= e($statusInfo['class']) ?>"><i class="<?= e($statusInfo['icon']) ?>"></i><?= e($statusInfo['label']) ?></span>
                <span class="theme-card__health-note"><?= $canActivate ? '可启用' : '阻止启用' ?></span>
                <span class="theme-card__health-note">当前内核 <?= e($diagnostics['runtime_version']) ?></span>
            </div>

            <details class="theme-card__checks-wrap<?= $detailsExpanded ? ' is-expanded' : '' ?>"<?= $detailsExpanded ? ' open' : '' ?>>
                <summary class="theme-card__checks-summary">
                    <span class="theme-card__checks-summary-text"><?= e($summaryText) ?></span>
                    <span class="theme-card__checks-toggle">
                        <span class="theme-card__checks-toggle-text" data-open-label="收起详情" data-close-label="展开详情"><?= $detailsExpanded ? '收起详情' : '展开详情' ?></span>
                        <i class="ri-arrow-down-s-line"></i>
                    </span>
                </summary>

                <div class="theme-card__checks">
                    <?php foreach ($diagnostics['checks'] as $check): ?>
                        <span class="theme-check theme-check--<?= e($check['level']) ?>">
                            <i class="<?= $check['level'] === 'ok' ? 'ri-checkbox-circle-line' : ($check['level'] === 'warning' ? 'ri-error-warning-line' : 'ri-close-circle-line') ?>"></i>
                            <span><?= e($check['label']) ?>：<?= e($check['message']) ?></span>
                        </span>
                    <?php endforeach; ?>
                </div>
            </details>

            <div class="theme-card__actions">
                <div class="theme-card__footer-note">目录：<code>themes/<?= e($slug) ?></code><?php if ($isProtected): ?><span class="theme-card__protected-note">官方保护主题</span><?php endif; ?></div>
                <div class="theme-card__action-buttons">
                    <?php if ($isActive): ?>
                        <button type="button" class="btn btn-primary" disabled>正在使用</button>
                    <?php elseif ($canActivate): ?>
                        <form method="POST" action="<?= url('admin/themes') ?>" class="theme-activate-form" data-theme-name="<?= e($themeName) ?>" onsubmit="return confirm('确认启用主题「<?= e($themeName) ?>」吗？');">
                            <?= csrf_field() ?>
                            <input type="hidden" name="_action" value="activate">
                            <input type="hidden" name="theme" value="<?= e($slug) ?>">
                            <button type="submit" class="btn btn-primary js-theme-activate-btn" data-default-label="启用主题">启用主题</button>
                        </form>
                    <?php else: ?>
                        <button type="button" class="btn btn-danger is-ghost" disabled>体检未通过</button>
                    <?php endif; ?>

                    <?php if ($canDelete): ?>
                        <form method="POST" action="<?= url('admin/themes') ?>" class="theme-delete-form" data-theme-name="<?= e($themeName) ?>" onsubmit="return confirm('确认删除主题「<?= e($themeName) ?>」吗？此操作会移除 themes/<?= e($slug) ?> 目录，且不可恢复。');">
                            <?= csrf_field() ?>
                            <input type="hidden" name="_action" value="delete">
                            <input type="hidden" name="theme" value="<?= e($slug) ?>">
                            <button type="submit" class="btn btn-danger js-theme-delete-btn" data-default-label="删除主题">删除主题</button>
                        </form>
                    <?php elseif (!$isActive): ?>
                        <button type="button" class="btn btn-danger is-ghost" disabled><?= $isProtected ? '受保护' : '不可删除' ?></button>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>
    <?php endforeach; ?>
</div>
<?php else: ?>
    <div class="card theme-empty-state">
        <i class="ri-palette-line"></i>
        <p>当前没有扫描到任何主题目录。你现在可以直接通过上面的 ZIP 安装器导入新主题，或者手动把合法主题放入 <code>themes/</code> 目录。</p>
    </div>
<?php endif; ?>
<script>
(function () {
    const fileInput = document.getElementById('theme-zip-file');
    const uploadBox = document.getElementById('theme-upload-box');
    const uploadStatus = document.getElementById('theme-upload-status');
    const emptyState = uploadStatus ? uploadStatus.querySelector('.theme-upload-status__empty') : null;
    const selectedState = uploadStatus ? uploadStatus.querySelector('.theme-upload-status__selected') : null;
    const nameNode = document.getElementById('theme-upload-name');
    const sizeNode = document.getElementById('theme-upload-size');
    const installForm = document.getElementById('theme-installer-form');
    const installSubmit = document.getElementById('theme-install-submit');
    const activateForms = Array.prototype.slice.call(document.querySelectorAll('.theme-activate-form'));
    const activateButtons = Array.prototype.slice.call(document.querySelectorAll('.js-theme-activate-btn'));
    const deleteForms = Array.prototype.slice.call(document.querySelectorAll('.theme-delete-form'));
    const deleteButtons = Array.prototype.slice.call(document.querySelectorAll('.js-theme-delete-btn'));
    const actionButtons = activateButtons.concat(deleteButtons);

    function formatSize(bytes) {
        const size = Number(bytes) || 0;
        if (size < 1024) {
            return size + ' B';
        }
        if (size < 1024 * 1024) {
            return (size / 1024).toFixed(size < 10 * 1024 ? 1 : 0) + ' KB';
        }
        return (size / (1024 * 1024)).toFixed(size < 10 * 1024 * 1024 ? 1 : 0) + ' MB';
    }

    function syncFileState() {
        if (!fileInput || !installSubmit || !uploadBox || !emptyState || !selectedState || !nameNode || !sizeNode) {
            return;
        }

        const file = fileInput.files && fileInput.files[0] ? fileInput.files[0] : null;
        if (!file) {
            uploadBox.classList.remove('is-selected');
            emptyState.hidden = false;
            selectedState.hidden = true;
            nameNode.textContent = '-';
            sizeNode.textContent = '-';
            installSubmit.disabled = true;
            installSubmit.textContent = '请选择 ZIP';
            return;
        }

        uploadBox.classList.add('is-selected');
        emptyState.hidden = true;
        selectedState.hidden = false;
        nameNode.textContent = file.name;
        sizeNode.textContent = '文件大小：' + formatSize(file.size);
        installSubmit.disabled = false;
        installSubmit.textContent = '安装主题';
    }

    if (fileInput) {
        fileInput.addEventListener('change', syncFileState);
        syncFileState();
    }

    if (installForm && installSubmit) {
        installForm.addEventListener('submit', function (event) {
            if (!fileInput || !fileInput.files || !fileInput.files[0]) {
                event.preventDefault();
                syncFileState();
                return;
            }
            if (installForm.dataset.submitting === '1') {
                event.preventDefault();
                return;
            }
            installForm.dataset.submitting = '1';
            installForm.classList.add('is-submitting');
            installSubmit.disabled = true;
            installSubmit.textContent = '安装中...';
            actionButtons.forEach(function (button) {
                button.disabled = true;
            });
        });
    }

    activateForms.forEach(function (form) {
        form.addEventListener('submit', function (event) {
            if (form.dataset.submitting === '1') {
                event.preventDefault();
                return;
            }
            form.dataset.submitting = '1';
            form.classList.add('is-submitting');

            actionButtons.forEach(function (button) {
                button.disabled = true;
                button.classList.add('is-loading');
                if (form.contains(button)) {
                    button.textContent = '启用中...';
                }
            });

            if (installSubmit) {
                installSubmit.disabled = true;
            }
        });
    });

    deleteForms.forEach(function (form) {
        form.addEventListener('submit', function (event) {
            if (form.dataset.submitting === '1') {
                event.preventDefault();
                return;
            }
            form.dataset.submitting = '1';
            form.classList.add('is-submitting');

            actionButtons.forEach(function (button) {
                button.disabled = true;
                button.classList.add('is-loading');
                if (form.contains(button)) {
                    button.textContent = '删除中...';
                }
            });

            if (installSubmit) {
                installSubmit.disabled = true;
            }
        });
    });
    Array.prototype.slice.call(document.querySelectorAll('.theme-card__checks-wrap')).forEach(function (details) {
        const text = details.querySelector('.theme-card__checks-toggle-text');
        function syncDetailsState() {
            const expanded = details.hasAttribute('open');
            details.classList.toggle('is-expanded', expanded);
            if (text) {
                text.textContent = expanded ? (text.dataset.openLabel || '收起详情') : (text.dataset.closeLabel || '展开详情');
            }
        }
        details.addEventListener('toggle', syncDetailsState);
        syncDetailsState();
    });
})();
</script>
<?php
$content = ob_get_clean();
require __DIR__ . '/layout.php';
