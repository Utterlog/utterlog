<?php
/**
 * LiMhy - 插件扩展管理
 */
require_once __DIR__ . '/../index.php';
require_admin();

$currentNav = 'plugins';
$pageTitle = '插件扩展';
$pluginConfigSlug = trim((string)($_GET['plugin_config'] ?? ''));

if (!function_exists('plugin_admin_remove_dir')) {
    function plugin_admin_remove_dir(string $path): void
    {
        if ($path === '' || !file_exists($path)) {
            return;
        }
        if (is_link($path) || is_file($path)) {
            @unlink($path);
            return;
        }
        $items = scandir($path);
        if (!is_array($items)) {
            return;
        }
        foreach ($items as $item) {
            if ($item === '.' || $item === '..') {
                continue;
            }
            plugin_admin_remove_dir($path . '/' . $item);
        }
        @rmdir($path);
    }
}

if (!function_exists('plugin_admin_copy_dir')) {
    function plugin_admin_copy_dir(string $src, string $dst): bool
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
                if (!plugin_admin_copy_dir($from, $to)) {
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


if (!function_exists('plugin_settings_input_type')) {
    function plugin_settings_input_type(array $field): string
    {
        return strtolower(trim((string)($field['type'] ?? 'text')));
    }
}

if (!function_exists('plugin_settings_is_meta_node')) {
    function plugin_settings_is_meta_node(array $field): bool
    {
        $type = plugin_settings_input_type($field);
        return in_array($type, ['section', 'group'], true);
    }
}

if (!function_exists('plugin_settings_section_key')) {
    function plugin_settings_section_key(array $field): string
    {
        $raw = trim((string)($field['section'] ?? ''));
        if ($raw === '') {
            return '__default';
        }
        return 'section:' . strtolower(preg_replace('/[^a-z0-9_\-]+/i', '-', $raw));
    }
}

if (!function_exists('plugin_settings_group_key')) {
    function plugin_settings_group_key(array $field): string
    {
        $raw = trim((string)($field['group'] ?? ''));
        if ($raw === '') {
            return '__default';
        }
        return 'group:' . strtolower(preg_replace('/[^a-z0-9_\-]+/i', '-', $raw));
    }
}

if (!function_exists('plugin_settings_build_layout')) {
    function plugin_settings_build_layout(array $schema): array
    {
        $layout = [];
        $currentSectionKey = '__default';
        $currentGroupKey = '__default';
        $sectionOrder = [];
        $groupOrder = [];

        $ensureSection = static function (array &$layout, string $sectionKey, string $title = '', string $desc = '') use (&$sectionOrder): void {
            if (!isset($layout[$sectionKey])) {
                $layout[$sectionKey] = [
                    'title' => $title,
                    'description' => $desc,
                    'groups' => [],
                ];
                $sectionOrder[] = $sectionKey;
            } else {
                if ($title !== '') {
                    $layout[$sectionKey]['title'] = $title;
                }
                if ($desc !== '') {
                    $layout[$sectionKey]['description'] = $desc;
                }
            }
        };

        $ensureGroup = static function (array &$layout, string $sectionKey, string $groupKey, string $title = '', string $desc = '') use (&$groupOrder, $ensureSection): void {
            $ensureSection($layout, $sectionKey);
            if (!isset($layout[$sectionKey]['groups'][$groupKey])) {
                $layout[$sectionKey]['groups'][$groupKey] = [
                    'title' => $title,
                    'description' => $desc,
                    'fields' => [],
                ];
                $groupOrder[$sectionKey] = $groupOrder[$sectionKey] ?? [];
                $groupOrder[$sectionKey][] = $groupKey;
            } else {
                if ($title !== '') {
                    $layout[$sectionKey]['groups'][$groupKey]['title'] = $title;
                }
                if ($desc !== '') {
                    $layout[$sectionKey]['groups'][$groupKey]['description'] = $desc;
                }
            }
        };

        foreach ($schema as $field) {
            if (!is_array($field)) {
                continue;
            }
            $type = plugin_settings_input_type($field);
            $title = trim((string)($field['title'] ?? ($field['label'] ?? '')));
            $desc = trim((string)($field['description'] ?? ($field['help'] ?? '')));

            if ($type === 'section') {
                $currentSectionKey = trim((string)($field['key'] ?? ''));
                if ($currentSectionKey === '') {
                    $currentSectionKey = plugin_settings_section_key(['section' => $title !== '' ? $title : ('section-' . count($layout))]);
                }
                $ensureSection($layout, $currentSectionKey, $title, $desc);
                $currentGroupKey = '__default';
                continue;
            }

            if ($type === 'group') {
                $currentGroupKey = trim((string)($field['key'] ?? ''));
                if ($currentGroupKey === '') {
                    $currentGroupKey = plugin_settings_group_key(['group' => $title !== '' ? $title : ('group-' . count($layout[$currentSectionKey]['groups'] ?? []))]);
                }
                $ensureGroup($layout, $currentSectionKey, $currentGroupKey, $title, $desc);
                continue;
            }

            $sectionKey = trim((string)($field['section'] ?? ''));
            if ($sectionKey === '') {
                $sectionKey = $currentSectionKey;
            } else {
                $sectionKey = plugin_settings_section_key($field);
            }
            $groupKey = trim((string)($field['group'] ?? ''));
            if ($groupKey === '') {
                $groupKey = $currentGroupKey;
            } else {
                $groupKey = plugin_settings_group_key($field);
            }
            $ensureGroup($layout, $sectionKey, $groupKey);
            $layout[$sectionKey]['groups'][$groupKey]['fields'][] = $field;
        }

        $ordered = [];
        foreach ($sectionOrder as $sectionKey) {
            if (!isset($layout[$sectionKey])) {
                continue;
            }
            $section = $layout[$sectionKey];
            $groups = [];
            foreach (($groupOrder[$sectionKey] ?? array_keys($section['groups'])) as $groupKey) {
                if (isset($section['groups'][$groupKey])) {
                    $groups[] = $section['groups'][$groupKey];
                }
            }
            $section['groups'] = $groups;
            $ordered[] = $section;
        }
        return $ordered;
    }
}

if (!function_exists('plugin_admin_safe_zip_extract')) {
    function plugin_admin_safe_zip_extract(string $zipFile, string $targetDir): array
    {
        if (!class_exists('ZipArchive')) {
            return ['ok' => false, 'msg' => '当前 PHP 环境未启用 ZipArchive，无法解压插件包。'];
        }

        $zip = new ZipArchive();
        if ($zip->open($zipFile) !== true) {
            return ['ok' => false, 'msg' => '插件压缩包无法打开，可能已损坏。'];
        }

        if ($zip->numFiles > 1200) {
            $zip->close();
            return ['ok' => false, 'msg' => '压缩包文件数量异常，已拒绝导入。'];
        }

        $totalUncompressed = 0;
        for ($i = 0; $i < $zip->numFiles; $i++) {
            $stat = $zip->statIndex($i);
            if (is_array($stat)) {
                $totalUncompressed += (int) ($stat['size'] ?? 0);
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
            $name = (string) $zip->getNameIndex($i);
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

if (!function_exists('plugin_admin_detect_root')) {
    function plugin_admin_detect_root(string $extractDir): array
    {
        $candidates = [];
        if (is_file($extractDir . '/plugin.php')) {
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
            if (is_file($path . '/plugin.php')) {
                $candidates[] = $path;
            }
        }

        $candidates = array_values(array_unique($candidates));
        if ($candidates === []) {
            return ['ok' => false, 'msg' => '压缩包中未找到 plugin.php，无法识别插件根目录。'];
        }
        if (count($candidates) > 1) {
            return ['ok' => false, 'msg' => '压缩包中检测到多套插件目录，请一包只放一个插件。'];
        }

        $root = $candidates[0];
        $meta = plugin_manifest_from_file($root . '/plugin.php');
        $slug = trim((string) ($meta['slug'] ?? ''));
        if ($slug === '') {
            $slug = basename($root);
        }
        if (!plugin_slug_is_valid($slug)) {
            return ['ok' => false, 'msg' => '插件 slug 非法，只允许字母、数字、中划线和下划线。'];
        }
        if (!is_file($root . '/bootstrap.php')) {
            return ['ok' => false, 'msg' => '插件包缺少 bootstrap.php，当前无法导入。'];
        }

        return [
            'ok' => true,
            'root' => $root,
            'slug' => $slug,
            'meta' => $meta,
        ];
    }
}

if (!function_exists('plugin_admin_install_zip')) {
    function plugin_admin_install_zip(array $file, bool $allowOverwrite = false): array
    {
        $error = (int) ($file['error'] ?? UPLOAD_ERR_NO_FILE);
        if ($error !== UPLOAD_ERR_OK) {
            return ['ok' => false, 'msg' => '请选择合法的插件 ZIP 文件后再安装。'];
        }

        $tmpName = (string) ($file['tmp_name'] ?? '');
        $originalName = (string) ($file['name'] ?? 'plugin.zip');
        $size = (int) ($file['size'] ?? 0);
        $ext = strtolower(pathinfo($originalName, PATHINFO_EXTENSION));

        if ($ext !== 'zip') {
            return ['ok' => false, 'msg' => '仅支持导入 ZIP 格式的插件安装包。'];
        }
        if ($size <= 0) {
            return ['ok' => false, 'msg' => '上传的插件包为空，已拒绝导入。'];
        }
        if ($size > 30 * 1024 * 1024) {
            return ['ok' => false, 'msg' => '插件压缩包超过 30MB，已拒绝导入。'];
        }
        if ($tmpName === '' || !is_uploaded_file($tmpName)) {
            return ['ok' => false, 'msg' => '未检测到有效的上传临时文件。'];
        }

        $workDir = ROOT . '/data/cache/plugin_zip_' . bin2hex(random_bytes(6));
        $extractDir = $workDir . '/extract';

        try {
            $extract = plugin_admin_safe_zip_extract($tmpName, $extractDir);
            if (!$extract['ok']) {
                return $extract;
            }

            $detect = plugin_admin_detect_root($extractDir);
            if (!$detect['ok']) {
                return $detect;
            }

            $slug = (string) $detect['slug'];
            $root = (string) $detect['root'];
            $meta = is_array($detect['meta'] ?? null) ? $detect['meta'] : plugin_manifest_defaults($slug);
            $pluginName = trim((string) ($meta['name'] ?? $slug));
            if ($pluginName === '') {
                $pluginName = $slug;
            }

            $targetDir = plugin_base_path($slug);
            $exists = is_dir($targetDir);
            $active = active_plugins();

            if ($exists) {
                if (in_array($slug, $active, true)) {
                    return ['ok' => false, 'msg' => '当前启用插件禁止在线覆盖，请先停用后再导入。'];
                }
                if (!$allowOverwrite) {
                    return ['ok' => false, 'msg' => '检测到同名插件已存在。勾选“允许覆盖同名未启用插件”后再试。'];
                }
                plugin_admin_remove_dir($targetDir);
                clearstatcache(true, $targetDir);
                if (is_dir($targetDir)) {
                    return ['ok' => false, 'msg' => '旧插件目录清理失败，请检查目录权限。'];
                }
            }

            if (!plugin_admin_copy_dir($root, $targetDir)) {
                plugin_admin_remove_dir($targetDir);
                return ['ok' => false, 'msg' => '插件文件写入失败，请检查 plugins 目录权限。'];
            }

            $diag = plugin_diagnostics($slug);
            if (!$diag['can_activate']) {
                return ['ok' => true, 'msg' => '插件 ZIP 已导入：' . $pluginName . '。但体检未通过，暂不可启用，请先查看插件详情。'];
            }

            return ['ok' => true, 'msg' => '插件 ZIP 导入成功：' . $pluginName . '。现在可以在列表中启用它。'];
        } finally {
            if (isset($workDir) && is_dir($workDir)) {
                plugin_admin_remove_dir($workDir);
            }
        }
    }
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    require_csrf();
    $action = trim((string) ($_POST['_action'] ?? ''));

    if ($action === 'install_zip') {
        $allowOverwrite = isset($_POST['allow_overwrite']) && (string) $_POST['allow_overwrite'] === '1';
        $result = plugin_admin_install_zip($_FILES['plugin_zip'] ?? [], $allowOverwrite);
        set_flash($result['ok'] ? 'success' : 'error', $result['msg']);
        redirect('admin/plugins');
    }

    $slug = trim((string) ($_POST['plugin'] ?? ''));
    if (!plugin_slug_is_valid($slug) || !plugin_exists($slug)) {
        set_flash('error', '目标插件不存在，或插件标识非法。');
        redirect('admin/plugins');
    }

    $current = active_plugins();
    $meta = plugin_meta($slug);
    $name = (string) ($meta['name'] ?? $slug);

    if ($action === 'activate') {
        $diag = plugin_diagnostics($slug);
        if (!$diag['can_activate']) {
            set_flash('error', '插件体检未通过，暂不允许启用。');
            redirect('admin/plugins');
        }
        if (!in_array($slug, $current, true)) {
            $current[] = $slug;
        }
        if (!persist_active_plugins_config($current)) {
            set_flash('error', 'config.php 不可写，插件启用失败。');
            redirect('admin/plugins');
        }
        $installFile = plugin_base_path($slug) . '/install.php';
        if (is_file($installFile)) {
            try {
                (static function (string $file): void { require $file; })($installFile);
            } catch (Throwable $e) {
                plugin_runtime_log('Install hook failed for ' . $slug . ': ' . $e->getMessage());
            }
        }
        if (function_exists('clear_html_cache')) {
            clear_html_cache();
        }
        set_flash('success', '插件已启用：' . $name . '。');
        redirect('admin/plugins');
    }

    if ($action === 'deactivate') {
        $current = array_values(array_filter($current, static fn ($item) => $item !== $slug));
        if (!persist_active_plugins_config($current)) {
            set_flash('error', 'config.php 不可写，插件停用失败。');
            redirect('admin/plugins');
        }
        if (function_exists('clear_html_cache')) {
            clear_html_cache();
        }
        set_flash('success', '插件已停用：' . $name . '。');
        redirect('admin/plugins');
    }


if ($action === 'save_config') {
    $schema = plugin_settings_schema($slug);
    $incoming = is_array($_POST['plugin_cfg'] ?? null) ? $_POST['plugin_cfg'] : [];
    $currentSettings = function_exists('plugin_config_get') ? plugin_config_get($slug, []) : limhy_read_plugin_settings($slug);
    $normalized = [];
    $errors = [];

    $isFieldActive = static function (array $field, array $incoming, array $currentSettings): bool {
        $depends = is_array($field['depends'] ?? null) ? $field['depends'] : [];
        $dependsKey = trim((string)($depends['key'] ?? ''));
        if ($dependsKey === '') {
            return true;
        }
        $expected = isset($depends['value']) ? (string)$depends['value'] : '';
        $candidate = array_key_exists($dependsKey, $incoming) ? $incoming[$dependsKey] : ($currentSettings[$dependsKey] ?? '');
        if (is_array($candidate)) {
            $candidate = '';
        }
        if ($candidate === null || $candidate === false) {
            $candidate = '';
        }
        if ($candidate === '' && !array_key_exists($dependsKey, $incoming) && (int)($currentSettings[$dependsKey] ?? 0) === 1) {
            $candidate = '1';
        }
        if ($candidate === '' && array_key_exists($dependsKey, $incoming)) {
            $candidate = '0';
        }
        return (string)$candidate === $expected;
    };

    foreach ($schema as $field) {
        if (!is_array($field)) continue;
        $key = trim((string)($field['key'] ?? ''));
        if ($key === '' || plugin_settings_is_meta_node($field)) continue;
        $type = plugin_settings_input_type($field);
        $label = trim((string)($field['label'] ?? $key));
        $default = $field['default'] ?? '';
        $required = !empty($field['required']);
        $pattern = trim((string)($field['pattern'] ?? ''));
        $min = $field['min'] ?? null;
        $max = $field['max'] ?? null;
        $active = $isFieldActive($field, $incoming, $currentSettings);
        $raw = $incoming[$key] ?? null;

        if ($type === 'checkbox') {
            $normalized[$key] = $raw ? 1 : 0;
            if ($required && $active && (int)$normalized[$key] !== 1) {
                $errors[] = $label . ' 必须启用。';
            }
            continue;
        }

        if ($type === 'radio' || $type === 'select') {
            $options = $field['options'] ?? [];
            $allowed = [];
            foreach ((array)$options as $optKey => $optVal) {
                $allowed[] = is_array($optVal) ? (string)($optVal['value'] ?? $optKey) : (string)$optKey;
            }
            $candidate = trim((string)($raw ?? ''));
            if ($candidate === '' && $default !== '') {
                $candidate = (string)$default;
            }
            if ($candidate !== '' && !in_array($candidate, $allowed, true)) {
                $errors[] = $label . ' 选项无效。';
                $candidate = (string)$default;
            }
            if ($required && $active && $candidate === '') {
                $errors[] = $label . ' 不能为空。';
            }
            $normalized[$key] = $candidate;
            continue;
        }

        if ($type === 'number') {
            $candidate = trim((string)($raw ?? ''));
            if ($candidate === '' && $default !== '') {
                $candidate = (string)$default;
            }
            if ($required && $active && $candidate === '') {
                $errors[] = $label . ' 不能为空。';
            }
            if ($candidate !== '' && !is_numeric($candidate)) {
                $errors[] = $label . ' 必须为数字。';
            } elseif ($candidate !== '') {
                $num = (float)$candidate;
                if ($min !== null && $num < (float)$min) {
                    $errors[] = $label . ' 不能小于 ' . $min . '。';
                }
                if ($max !== null && $num > (float)$max) {
                    $errors[] = $label . ' 不能大于 ' . $max . '。';
                }
            }
            $normalized[$key] = $candidate;
            continue;
        }

        if ($type === 'textarea') {
            $candidate = limhy_normalize_multiline_input((string)$raw, 10000);
        } else {
            $candidate = trim((string)($raw ?? $default));
        }
        if ($required && $active && $candidate === '') {
            $errors[] = $label . ' 不能为空。';
        }
        if ($candidate !== '' && $pattern !== '' && @preg_match($pattern, '') !== false && !preg_match($pattern, $candidate)) {
            $errors[] = $label . ' 格式不正确。';
        }
        $length = function_exists('mb_strlen') ? mb_strlen($candidate) : strlen($candidate);
        if ($candidate !== '' && $min !== null && is_numeric($min) && $length < (int)$min) {
            $errors[] = $label . ' 长度不能少于 ' . $min . '。';
        }
        if ($candidate !== '' && $max !== null && is_numeric($max) && $length > (int)$max) {
            $errors[] = $label . ' 长度不能超过 ' . $max . '。';
        }
        $normalized[$key] = $candidate;
    }

    if ($errors) {
        set_flash('error', '插件配置校验失败：' . implode('；', array_slice(array_values(array_unique($errors)), 0, 3)));
        redirect('admin/plugins?plugin_config=' . rawurlencode($slug));
    }
    if (!limhy_write_plugin_settings($slug, $normalized)) {
        set_flash('error', '插件配置写入失败，请检查 data/plugin_settings 目录权限。');
        redirect('admin/plugins?plugin_config=' . rawurlencode($slug));
    }
    if (function_exists('clear_html_cache')) clear_html_cache();
    set_flash('success', '插件配置已保存：' . $name . '。');
    redirect('admin/plugins?plugin_config=' . rawurlencode($slug));
}


    if ($action === 'delete') {
        if (in_array($slug, $current, true)) {
            set_flash('error', '启用中的插件不允许直接删除，请先停用。');
            redirect('admin/plugins');
        }
        $root = realpath(ROOT . '/plugins');
        $target = realpath(plugin_base_path($slug));
        if ($root === false || $target === false) {
            set_flash('error', '插件目录不存在。');
            redirect('admin/plugins');
        }
        $root = rtrim(str_replace('\\', '/', $root), '/');
        $target = str_replace('\\', '/', $target);
        if (!str_starts_with($target, $root . '/')) {
            set_flash('error', '插件目录越界，删除请求已拒绝。');
            redirect('admin/plugins');
        }
        if (is_link($target)) {
            set_flash('error', '符号链接插件目录不允许删除。');
            redirect('admin/plugins');
        }
        $uninstallFile = plugin_base_path($slug) . '/uninstall.php';
        if (is_file($uninstallFile)) {
            try {
                (static function (string $file): void { require $file; })($uninstallFile);
            } catch (Throwable $e) {
                plugin_runtime_log('Uninstall hook failed for ' . $slug . ': ' . $e->getMessage());
            }
        }
        plugin_admin_remove_dir($target);
        clearstatcache(true, $target);
        if (is_dir($target)) {
            set_flash('error', '插件目录删除失败，请检查权限。');
            redirect('admin/plugins');
        }
        set_flash('success', '插件已删除：' . $name . '。');
        redirect('admin/plugins');
    }
}

$plugins = available_plugins();
$active = active_plugins();
$pluginCount = count($plugins);
$activeCount = count($active);

ob_start();
?>
<div class="theme-page-toolbar plugin-page-toolbar">
    <div class="theme-page-intro">
        <div class="card-title">插件扩展中心</div>
        <p>插件生态现在已经支持本地目录扫描、启用停用、受控 Hook 运行时与 ZIP 安装导入。这里更适合展示“能力、状态、风险”三层信息，而不是只堆按钮。</p>
    </div>
    <div class="theme-page-actions">
        <span class="theme-chip"><i class="ri-apps-2-line"></i> 已安装 <?= (int) $pluginCount ?></span>
        <span class="theme-chip"><i class="ri-toggle-line"></i> 已启用 <?= (int) $activeCount ?></span>
        <span class="theme-chip"><i class="ri-cpu-line"></i> 插件内核 <?= e(plugin_runtime_version()) ?></span>
    </div>
</div>

<div class="card theme-installer-card plugin-installer-card">
    <div class="theme-installer-card__header">
        <div>
            <h3 class="theme-installer-card__title">安装插件 ZIP 包</h3>
            <p class="theme-installer-card__desc">插件包根目录必须包含 <code>plugin.php</code> 与 <code>bootstrap.php</code>。建议一包只放一个插件；安装器会检查根目录、阻止非法路径，并禁止在线覆盖启用中的插件。</p>
        </div>
        <div class="theme-card__meta">
            <span class="theme-chip"><i class="ri-folder-zip-line"></i> 仅支持 ZIP</span>
            <span class="theme-chip"><i class="ri-hard-drive-3-line"></i> 最大 30MB</span>
        </div>
    </div>

    <form method="POST" action="<?= url('admin/plugins') ?>" enctype="multipart/form-data" class="theme-installer-form" id="plugin-installer-form">
        <?= csrf_field() ?>
        <input type="hidden" name="_action" value="install_zip">

        <div class="theme-installer-form__grid">
            <label class="theme-upload-box" for="plugin-zip-file" id="plugin-upload-box">
                <input id="plugin-zip-file" type="file" name="plugin_zip" accept=".zip,application/zip" required>
                <i class="ri-upload-cloud-2-line"></i>
                <strong id="plugin-upload-title">选择插件压缩包</strong>
                <span>支持直接上传插件 ZIP；安装时会自动识别插件根目录、校验必要文件，并阻止非法路径解包。</span>
                <div class="theme-upload-status" id="plugin-upload-status" aria-live="polite">
                    <span class="theme-upload-status__empty">未选择任何 ZIP 文件</span>
                    <span class="theme-upload-status__selected" hidden>
                        <strong id="plugin-upload-name">-</strong>
                        <em id="plugin-upload-size">-</em>
                    </span>
                </div>
            </label>

            <div class="theme-installer-form__side">
                <label class="checkbox-item">
                    <input type="checkbox" name="allow_overwrite" value="1">
                    <span>允许覆盖同名未启用插件</span>
                </label>
                <div class="theme-installer-notes">
                    <p><strong>覆盖策略：</strong>当前启用插件禁止在线覆盖，避免运行时文件被热替换。</p>
                    <p><strong>安装建议：</strong>插件先导入，再通过下方插件卡体检结果判断是否适合启用。</p>
                </div>
                <button type="submit" class="btn btn-primary" id="plugin-install-submit" disabled>请选择 ZIP</button>
            </div>
        </div>
    </form>
</div>

<div class="plugin-grid">
<?php if ($plugins === []): ?>
    <div class="card theme-empty-state"><i class="ri-plug-2-line"></i><p>暂未发现任何插件目录。你现在可以直接通过上方 ZIP 安装器导入新插件，也可以手动将合法插件放入 <code>plugins/</code> 目录。</p></div>
<?php else: ?>
<?php foreach ($plugins as $slug => $meta):
    $diag = plugin_diagnostics($slug);
    $isActive = in_array($slug, $active, true);
    $preview = plugin_preview_url($slug);
    $summary = $diag['summary'];
    $summaryText = $diag['status'] === 'error'
        ? ($summary['error'] . ' 项异常，建议先修复后再启用')
        : ($summary['ok'] . '/' . $summary['total'] . ' 检查通过' . ($summary['warning'] > 0 ? '，' . $summary['warning'] . ' 项提醒' : ''));
    $detailsExpanded = $diag['status'] === 'error';
    $statusLabel = $diag['status'] === 'ok' ? '健康' : ($diag['status'] === 'warning' ? '警告' : '异常');
?>
<article class="card theme-card plugin-card <?= $isActive ? 'is-active' : '' ?> <?= $diag['status'] === 'error' ? 'has-error' : '' ?>">
    <div class="plugin-card__hero">
        <div class="plugin-card__hero-inner">
            <div class="plugin-card__visual">
                <?php if ($preview !== ''): ?>
                    <img src="<?= e($preview) ?>" alt="<?= e($meta['name']) ?>">
                <?php else: ?>
                    <div class="plugin-card__visual-fallback"><i class="ri-plug-2-line"></i></div>
                <?php endif; ?>
            </div>
            <div class="plugin-card__hero-copy">
                <div class="plugin-card__status-row">
                    <span class="theme-health-badge theme-health-badge--<?= e($diag['status']) ?>"><?= e($statusLabel) ?></span>
                    <?php if ($isActive): ?><span class="plugin-card__live-note">当前启用</span><?php endif; ?>
                </div>
                <h3 class="plugin-card__hero-title"><?= e($meta['name']) ?></h3>
                <p class="plugin-card__hero-desc"><?= e($meta['description'] !== '' ? $meta['description'] : '插件描述未填写，建议补充用途、边界与副作用说明。') ?></p>
                <div class="plugin-card__hero-meta">
                    <span><i class="ri-price-tag-3-line"></i> <?= e($slug) ?></span>
                    <span><i class="ri-user-3-line"></i> <?= e($meta['author']) ?></span>
                    <span><i class="ri-git-branch-line"></i> v<?= e($meta['version']) ?></span>
                    <span><i class="ri-shield-check-line"></i> 兼容内核 <?= e((string) $meta['requires']) ?></span>
                </div>
            </div>
        </div>
    </div>

    <div class="theme-card__body plugin-card__body">
        <div class="plugin-card__summary-row">
            <div class="plugin-card__summary-main">
                <span class="theme-chip"><?= $diag['can_activate'] ? '可启用' : '体检未通过' ?></span>
                <span class="theme-chip">插件内核 <?= e($diag['runtime_version']) ?></span>
                <span class="plugin-card__summary-text"><?= e($summaryText) ?></span>
            </div>
            <details class="theme-card__checks-wrap plugin-card__checks-wrap<?= $detailsExpanded ? ' is-expanded' : '' ?>"<?= $detailsExpanded ? ' open' : '' ?>>
                <summary class="plugin-card__checks-summary">
                    <span class="plugin-card__toggle-text">展开详情</span>
                    <span class="plugin-card__toggle-text plugin-card__toggle-text--close">收起详情</span>
                    <i class="ri-arrow-down-s-line"></i>
                </summary>
                <div class="theme-card__checks plugin-card__checks">
                    <?php foreach ($diag['checks'] as $check): ?>
                        <div class="theme-check theme-check--<?= e($check['level']) ?>"><i class="<?= $check['level'] === 'ok' ? 'ri-checkbox-circle-line' : ($check['level'] === 'warning' ? 'ri-error-warning-line' : 'ri-close-circle-line') ?>"></i><span><strong><?= e($check['label']) ?>：</strong><?= e($check['message']) ?></span></div>
                    <?php endforeach; ?>
                </div>
            </details>
        </div>

        <div class="plugin-card__bottom">
            <div class="theme-card__footer-note">目录：<code>plugins/<?= e($slug) ?></code></div>
            <div class="theme-card__action-buttons plugin-card__action-buttons">
                <?php if ($isActive): ?>
                    <form method="POST" action="<?= url('admin/plugins') ?>" class="js-plugin-form" data-loading-text="停用中...">
                        <?= csrf_field() ?>
                        <input type="hidden" name="_action" value="deactivate">
                        <input type="hidden" name="plugin" value="<?= e($slug) ?>">
                        <button type="submit" class="btn btn-ghost js-plugin-submit">停用插件</button>
                    </form>
                <?php elseif ($diag['can_activate']): ?>
                    <form method="POST" action="<?= url('admin/plugins') ?>" class="js-plugin-form" data-loading-text="启用中...">
                        <?= csrf_field() ?>
                        <input type="hidden" name="_action" value="activate">
                        <input type="hidden" name="plugin" value="<?= e($slug) ?>">
                        <button type="submit" class="btn btn-primary js-plugin-submit">启用插件</button>
                    </form>
                <?php else: ?>
                    <button type="button" class="btn btn-ghost" disabled>体检未通过</button>
                <?php endif; ?>

                <?php if (plugin_settings_schema($slug) !== []): ?>
                    <a href="<?= url('admin/plugin-config?plugin=' . rawurlencode($slug)) ?>" class="btn btn-ghost">插件配置</a>
                <?php endif; ?>

                <?php if (!$isActive): ?>
                    <form method="POST" action="<?= url('admin/plugins') ?>" class="js-plugin-form" data-loading-text="删除中..." onsubmit="return confirm('确认删除插件 <?= e($meta['name']) ?> 吗？\n将移除 plugins/<?= e($slug) ?> 目录，且不可恢复。');">
                        <?= csrf_field() ?>
                        <input type="hidden" name="_action" value="delete">
                        <input type="hidden" name="plugin" value="<?= e($slug) ?>">
                        <button type="submit" class="btn btn-danger js-plugin-submit">删除插件</button>
                    </form>
                <?php endif; ?>
            </div>
        </div>
    </div>
</article>
<?php endforeach; ?>
<?php endif; ?>
</div>


<?php
$configPlugin = ($pluginConfigSlug !== '' && plugin_exists($pluginConfigSlug)) ? plugin_meta($pluginConfigSlug) : null;
$configSchema = $configPlugin ? plugin_settings_schema($pluginConfigSlug) : [];
$configValues = $configPlugin ? (function_exists('plugin_config_get') ? plugin_config_get($pluginConfigSlug, []) : limhy_read_plugin_settings($pluginConfigSlug)) : [];
$configLayout = $configPlugin ? plugin_settings_build_layout($configSchema) : [];
if ($configPlugin && $configSchema):
?>
<div class="card" style="margin-top:20px;">
    <div class="card-title" style="margin-bottom:14px;">插件配置：<?=e((string)$configPlugin['name'])?></div>
    <form method="POST" action="<?=url('admin/plugins?plugin_config=' . rawurlencode($pluginConfigSlug))?>">
        <?=csrf_field()?>
        <input type="hidden" name="_action" value="save_config">
        <input type="hidden" name="plugin" value="<?=e($pluginConfigSlug)?>">
        
<?php foreach ($configLayout as $sectionIndex => $section):
    $sectionTitle = trim((string)($section['title'] ?? ''));
    $sectionDesc = trim((string)($section['description'] ?? ''));
    $groups = is_array($section['groups'] ?? null) ? $section['groups'] : [];
?>
    <section class="plugin-config-section" style="margin-bottom:18px;<?= $sectionIndex > 0 ? 'padding-top:18px;border-top:1px solid var(--color-border, #eef2f7);' : '' ?>">
        <?php if ($sectionTitle !== '' || $sectionDesc !== ''): ?>
            <div class="plugin-config-section__head" style="margin-bottom:12px;">
                <?php if ($sectionTitle !== ''): ?><h3 style="margin:0 0 6px;font-size:16px;font-weight:800;color:var(--color-text-1,#111827);"><?= e($sectionTitle) ?></h3><?php endif; ?>
                <?php if ($sectionDesc !== ''): ?><p style="margin:0;color:var(--color-text-3,#6b7280);font-size:13px;line-height:1.7;"><?= e($sectionDesc) ?></p><?php endif; ?>
            </div>
        <?php endif; ?>
        <?php foreach ($groups as $group):
            $groupTitle = trim((string)($group['title'] ?? ''));
            $groupDesc = trim((string)($group['description'] ?? ''));
            $fields = is_array($group['fields'] ?? null) ? $group['fields'] : [];
            if ($fields === []) continue;
        ?>
            <div class="plugin-config-group" style="margin-bottom:16px;padding:14px;border:1px solid var(--color-border, #eef2f7);border-radius:14px;background:rgba(248,250,252,.72);">
                <?php if ($groupTitle !== '' || $groupDesc !== ''): ?>
                    <div class="plugin-config-group__head" style="margin-bottom:12px;">
                        <?php if ($groupTitle !== ''): ?><div style="font-size:14px;font-weight:800;color:var(--color-text-1,#111827);margin-bottom:4px;"><?= e($groupTitle) ?></div><?php endif; ?>
                        <?php if ($groupDesc !== ''): ?><div style="font-size:12px;color:var(--color-text-3,#6b7280);line-height:1.7;"><?= e($groupDesc) ?></div><?php endif; ?>
                    </div>
                <?php endif; ?>
                <div class="plugin-config-group__grid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:14px 16px;">
                <?php foreach ($fields as $field):
                    if (!is_array($field)) continue;
                    $key = (string)($field['key'] ?? ''); if ($key === '') continue;
                    $label = (string)($field['label'] ?? $key);
                    $type = plugin_settings_input_type($field);
                    $default = $field['default'] ?? '';
                    $value = array_key_exists($key, $configValues) ? $configValues[$key] : $default;
                    $depends = is_array($field['depends'] ?? null) ? $field['depends'] : [];
                    $dependsKey = trim((string)($depends['key'] ?? ''));
                    $dependsValue = isset($depends['value']) ? (string)$depends['value'] : '';
                    $dependsAttr = $dependsKey !== '' ? ' data-depends-key="' . e($dependsKey) . '" data-depends-value="' . e($dependsValue) . '"' : '';
                    $requiredAttr = !empty($field['required']) ? ' required' : '';
                    $patternAttr = trim((string)($field['pattern'] ?? '')) !== '' ? ' pattern="' . e((string)$field['pattern']) . '"' : '';
                    $minAttr = isset($field['min']) ? ' min="' . e((string)$field['min']) . '"' : '';
                    $maxAttr = isset($field['max']) ? ' max="' . e((string)$field['max']) . '"' : '';
                    $hint = trim((string)($field['help'] ?? ''));
                    $description = trim((string)($field['description'] ?? ''));
                    $placeholder = (string)($field['placeholder'] ?? '');
                    $ruleParts = [];
                    if (!empty($field['required'])) $ruleParts[] = '必填';
                    if (isset($field['min'])) $ruleParts[] = ($type === 'number' ? '最小值 ' : '最少 ') . $field['min'];
                    if (isset($field['max'])) $ruleParts[] = ($type === 'number' ? '最大值 ' : '最多 ') . $field['max'];
                    if (trim((string)($field['pattern'] ?? '')) !== '') $ruleParts[] = '格式校验';
                    $placeholderAttr = $placeholder !== '' ? ' placeholder="' . e($placeholder) . '"' : '';
                ?>
                    <div class="c-form__group plugin-config-field" style="margin-bottom:0;"<?= $dependsAttr ?>>
                        <label class="admin-stat__label" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;"><?= e($label) ?><?php if (!empty($field['required'])): ?><span style="font-size:11px;color:#ef4444;font-weight:700;">必填</span><?php endif; ?></label>
                        <?php if ($description !== '' || $hint !== '' || $ruleParts): ?>
                            <div style="font-size:12px;color:var(--color-text-3);margin:6px 0 8px;line-height:1.7;"><?= e($description !== '' ? $description : $hint) ?><?= (($description !== '' ? $description : $hint) !== '' && $ruleParts) ? ' · ' : '' ?><?= e(implode(' · ', $ruleParts)) ?></div>
                        <?php endif; ?>
                        <?php if ($type === 'textarea'): ?>
                            <textarea name="plugin_cfg[<?= e($key) ?>]" class="form-textarea" rows="4"<?= $requiredAttr ?><?= $patternAttr ?><?= $placeholderAttr ?>><?= e((string)$value) ?></textarea>
                        <?php elseif ($type === 'checkbox'): ?>
                            <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;"><input type="checkbox" name="plugin_cfg[<?= e($key) ?>]" value="1" <?= ((int)$value===1)?'checked':'' ?><?= $requiredAttr ?>> <span><?= e($placeholder !== '' ? $placeholder : '启用') ?></span></label>
                        <?php elseif ($type === 'select'): $options = (array)($field['options'] ?? []); ?>
                            <select name="plugin_cfg[<?= e($key) ?>]" class="form-select"<?= $requiredAttr ?>>
                                <option value="" <?= ((string)$value === '') ? 'selected' : '' ?> <?= !empty($field['required']) ? 'disabled' : '' ?>><?= e($placeholder !== '' ? $placeholder : '请选择') ?></option>
                                <?php foreach ($options as $optKey => $optLabel): $optValue = is_array($optLabel) ? (string)($optLabel['value'] ?? $optKey) : (string)$optKey; $optText = is_array($optLabel) ? (string)($optLabel['label'] ?? $optValue) : (string)$optLabel; ?>
                                    <option value="<?= e($optValue) ?>" <?= ((string)$value === $optValue)?'selected':'' ?>><?= e($optText) ?></option>
                                <?php endforeach; ?>
                            </select>
                        <?php elseif ($type === 'radio'): $options = (array)($field['options'] ?? []); ?>
                            <div style="display:flex;gap:14px;flex-wrap:wrap;min-height:42px;align-items:center;">
                                <?php foreach ($options as $optKey => $optLabel): $optValue = is_array($optLabel) ? (string)($optLabel['value'] ?? $optKey) : (string)$optKey; $optText = is_array($optLabel) ? (string)($optLabel['label'] ?? $optValue) : (string)$optLabel; ?>
                                    <label style="display:inline-flex;align-items:center;gap:8px;cursor:pointer;"><input type="radio" name="plugin_cfg[<?= e($key) ?>]" value="<?= e($optValue) ?>" <?= ((string)$value === $optValue)?'checked':'' ?><?= $requiredAttr ?>> <span><?= e($optText) ?></span></label>
                                <?php endforeach; ?>
                            </div>
                        <?php elseif ($type === 'number'): ?>
                            <input type="number" name="plugin_cfg[<?= e($key) ?>]" class="form-input" value="<?= e((string)$value) ?>"<?= $requiredAttr ?><?= $minAttr ?><?= $maxAttr ?><?= $placeholderAttr ?> step="any">
                        <?php else: ?>
                            <input type="text" name="plugin_cfg[<?= e($key) ?>]" class="form-input" value="<?= e((string)$value) ?>"<?= $requiredAttr ?><?= $patternAttr ?><?= $minAttr ?><?= $maxAttr ?><?= $placeholderAttr ?>>
                        <?php endif; ?>
                    </div>
                <?php endforeach; ?>
                </div>
            </div>
        <?php endforeach; ?>
    </section>
<?php endforeach; ?>
        <div style="display:flex;gap:10px;justify-content:flex-end;">
            <a href="<?=url('admin/plugins')?>" class="btn btn-ghost">关闭</a>
            <button type="submit" class="btn btn-primary"><i class="ri-save-3-line"></i> 保存插件配置</button>
        </div>
    </form>
</div>
<?php endif; ?>

<script>
document.addEventListener('DOMContentLoaded', function () {
    const forms = document.querySelectorAll('.js-plugin-form');
    forms.forEach(function (form) {
        form.addEventListener('submit', function () {
            const allButtons = document.querySelectorAll('.js-plugin-submit');
            allButtons.forEach(function (button) { button.disabled = true; });
            const submit = form.querySelector('.js-plugin-submit');
            if (submit) {
                submit.dataset.originalText = submit.textContent;
                submit.textContent = form.getAttribute('data-loading-text') || '处理中...';
            }
        });
    });

    const uploadInput = document.getElementById('plugin-zip-file');
    const uploadBox = document.getElementById('plugin-upload-box');
    const uploadStatus = document.getElementById('plugin-upload-status');
    const emptyState = uploadStatus ? uploadStatus.querySelector('.theme-upload-status__empty') : null;
    const selectedState = uploadStatus ? uploadStatus.querySelector('.theme-upload-status__selected') : null;
    const nameNode = document.getElementById('plugin-upload-name');
    const sizeNode = document.getElementById('plugin-upload-size');
    const installSubmit = document.getElementById('plugin-install-submit');
    const installerForm = document.getElementById('plugin-installer-form');

    function formatSize(bytes) {
        if (!Number.isFinite(bytes) || bytes <= 0) return '大小未知';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(bytes >= 100 * 1024 ? 0 : 1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
    }

    function syncUploadState() {
        const file = uploadInput && uploadInput.files && uploadInput.files[0] ? uploadInput.files[0] : null;
        const hasFile = !!file;
        if (uploadBox) uploadBox.classList.toggle('is-selected', hasFile);
        if (emptyState) emptyState.hidden = hasFile;
        if (selectedState) selectedState.hidden = !hasFile;
        if (nameNode) nameNode.textContent = hasFile ? file.name : '-';
        if (sizeNode) sizeNode.textContent = hasFile ? ('文件大小：' + formatSize(file.size)) : '-';
        if (installSubmit) {
            installSubmit.disabled = !hasFile;
            installSubmit.textContent = hasFile ? '安装插件' : '请选择 ZIP';
        }
    }

    if (uploadInput) {
        uploadInput.addEventListener('change', syncUploadState);
        syncUploadState();
    }

    if (installerForm) {
        installerForm.addEventListener('submit', function () {
            if (installSubmit) {
                installSubmit.disabled = true;
                installSubmit.textContent = '安装中...';
            }
            installerForm.classList.add('is-submitting');
        });
    }

    var pluginConfigFields = document.querySelectorAll('.plugin-config-field[data-depends-key]');
    function readPluginCfgValue(key) {
        var checkedRadio = document.querySelector('[name="plugin_cfg[' + key + ']"]:checked');
        if (checkedRadio) return checkedRadio.value;
        var input = document.querySelector('[name="plugin_cfg[' + key + ']"]');
        if (!input) return '';
        if (input.type === 'checkbox') return input.checked ? '1' : '0';
        return input.value || '';
    }
    function syncPluginDepends() {
        pluginConfigFields.forEach(function (field) {
            var key = field.getAttribute('data-depends-key') || '';
            var expected = field.getAttribute('data-depends-value') || '';
            if (!key) return;
            var visible = readPluginCfgValue(key) === expected;
            field.style.display = visible ? '' : 'none';
            field.querySelectorAll('input, select, textarea').forEach(function (node) {
                if (!visible) {
                    node.required = false;
                    if (node.type === 'checkbox' || node.type === 'radio') {
                        node.checked = false;
                    }
                } else if (node.dataset.pluginRequired === '1') {
                    node.required = true;
                }
            });
        });
    }
    var pluginCfgNodes = document.querySelectorAll('[name^="plugin_cfg["]');
    var pluginConfigMonitor = {
        getValue: readPluginCfgValue,
        syncDepends: syncPluginDepends,
        snapshot: function () {
            var data = {};
            pluginCfgNodes.forEach(function (node) {
                var match = (node.name || '').match(/^plugin_cfg\[(.+)\]$/);
                if (!match) return;
                data[match[1]] = readPluginCfgValue(match[1]);
            });
            return data;
        },
        dispatch: function (type, detail) {
            document.dispatchEvent(new CustomEvent(type, { detail: detail || {} }));
        },
        watch: function (callback) {
            if (typeof callback !== 'function') return function () {};
            var handler = function (e) { callback(e.detail || {}); };
            document.addEventListener('limhy:plugin-config-change', handler);
            document.addEventListener('limhy:plugin-config-depends-sync', handler);
            return function () {
                document.removeEventListener('limhy:plugin-config-change', handler);
                document.removeEventListener('limhy:plugin-config-depends-sync', handler);
            };
        }
    };
    window.LimhyPluginConfig = pluginConfigMonitor;
    pluginCfgNodes.forEach(function (node) {
        if (node.required) node.dataset.pluginRequired = '1';
        var emit = function (eventName) {
            var match = (node.name || '').match(/^plugin_cfg\[(.+)\]$/);
            var key = match ? match[1] : '';
            syncPluginDepends();
            pluginConfigMonitor.dispatch(eventName, {
                key: key,
                value: key ? readPluginCfgValue(key) : '',
                snapshot: pluginConfigMonitor.snapshot(),
                trigger: node
            });
        };
        node.addEventListener('change', function () { emit('limhy:plugin-config-change'); });
        node.addEventListener('input', function () { emit('limhy:plugin-config-change'); });
    });
    if (pluginConfigFields.length || pluginCfgNodes.length) {
        syncPluginDepends();
        pluginConfigMonitor.dispatch('limhy:plugin-config-depends-sync', {
            snapshot: pluginConfigMonitor.snapshot(),
            fields: Array.prototype.slice.call(pluginConfigFields).map(function (field) {
                return {
                    key: field.getAttribute('data-depends-key') || '',
                    expected: field.getAttribute('data-depends-value') || '',
                    visible: field.style.display !== 'none'
                };
            })
        });
    }
    if (window.MutationObserver) {
        var observer = new MutationObserver(function () {
            syncPluginDepends();
            pluginConfigMonitor.dispatch('limhy:plugin-config-depends-sync', {
                snapshot: pluginConfigMonitor.snapshot(),
                reason: 'mutation'
            });
        });
        var configRoot = document.querySelector('.plugin-config-section') || document.body;
        observer.observe(configRoot, { attributes: true, subtree: true, childList: true, attributeFilter: ['style', 'hidden', 'disabled', 'checked', 'value'] });
    }
});
</script>
<?php
$content = ob_get_clean();
require ROOT . '/admin/layout.php';
