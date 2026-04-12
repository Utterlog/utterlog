<?php
/**
 * LiMhy - 插件运行时内核 (MVP)
 */

declare(strict_types=1);

$GLOBALS['__limhy_actions'] = $GLOBALS['__limhy_actions'] ?? [];
$GLOBALS['__limhy_filters'] = $GLOBALS['__limhy_filters'] ?? [];

function plugin_slug_is_valid(string $slug): bool
{
    return $slug !== '' && preg_match('/^[a-zA-Z0-9_-]+$/', $slug) === 1;
}

function plugin_runtime_version(): string
{
    return '2.0.0';
}

function active_plugins(): array
{
    $raw = defined('ACTIVE_PLUGINS') ? ACTIVE_PLUGINS : [];
    if (is_string($raw)) {
        $decoded = json_decode($raw, true);
        if (is_array($decoded)) {
            $raw = $decoded;
        } else {
            $raw = array_filter(array_map('trim', explode(',', $raw)));
        }
    }
    if (!is_array($raw)) {
        return [];
    }
    $valid = [];
    foreach ($raw as $slug) {
        $slug = trim((string) $slug);
        if ($slug === '' || !plugin_slug_is_valid($slug) || !plugin_exists($slug)) {
            continue;
        }
        $valid[$slug] = $slug;
    }

    $slugs = array_values($valid);
    $isFactoryDemoOnly = count($slugs) === 1
        && $slugs[0] === 'hello-hook'
        && !is_file(ROOT . '/data/plugin_configs/hello-hook.json')
        && !is_file(ROOT . '/data/plugin_settings/hello-hook.json');

    return $isFactoryDemoOnly ? [] : $slugs;
}

function plugin_base_path(string $slug = ''): string
{
    $slug = trim($slug);
    return ROOT . '/plugins/' . $slug;
}

function plugin_exists(string $slug): bool
{
    return plugin_slug_is_valid($slug) && is_dir(plugin_base_path($slug));
}

function plugin_manifest_defaults(string $slug = ''): array
{
    return [
        'name' => 'Unknown Plugin',
        'slug' => $slug,
        'version' => '0.0.0',
        'author' => 'Unknown',
        'description' => '',
        'requires' => '2.0.0',
        'settings' => [],
        '__found_keys' => [],
    ];
}

function plugin_manifest_from_file(string $metaFile, string $fallbackSlug = ''): array
{
    $defaults = plugin_manifest_defaults($fallbackSlug);
    if (!is_file($metaFile) || !is_readable($metaFile)) {
        return $defaults;
    }

    try {
        $data = (static function (string $file) {
            return require $file;
        })($metaFile);
    } catch (\Throwable $e) {
        plugin_runtime_log('Manifest parse failed for ' . $metaFile . ': ' . $e->getMessage());
        return $defaults;
    }

    if (!is_array($data)) {
        return $defaults;
    }

    $meta = $defaults;
    $meta['__found_keys'] = array_keys($data);
    foreach (['name', 'slug', 'version', 'author', 'description', 'requires'] as $key) {
        if (array_key_exists($key, $data)) {
            $meta[$key] = trim((string) $data[$key]);
        }
    }

    if (array_key_exists('settings', $data) && is_array($data['settings'])) {
        $meta['settings'] = $data['settings'];
    }

    if (!plugin_slug_is_valid((string) $meta['slug'])) {
        $meta['slug'] = $fallbackSlug;
    }

    return $meta;
}

function plugin_settings_schema(string $slug): array
{
    $meta = plugin_meta($slug);
    $schema = $meta['settings'] ?? [];
    return is_array($schema) ? $schema : [];
}

function plugin_settings_value(string $slug, string $key, $default = '')
{
    return limhy_plugin_setting($slug, $key, $default);
}

function plugin_meta(string $slug = ''): array
{
    return plugin_manifest_from_file(plugin_base_path($slug) . '/plugin.php', $slug);
}

function available_plugins(): array
{
    $dir = ROOT . '/plugins';
    if (!is_dir($dir)) {
        return [];
    }
    $items = scandir($dir);
    if (!is_array($items)) {
        return [];
    }
    $plugins = [];
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        if (!plugin_slug_is_valid($item) || !is_dir($dir . '/' . $item)) {
            continue;
        }
        $plugins[$item] = plugin_meta($item);
    }
    ksort($plugins);
    return $plugins;
}

function plugin_preview_url(string $slug): string
{
    $base = plugin_base_path($slug);
    foreach (['preview.png','preview.jpg','preview.webp','icon.png','icon.jpg','icon.webp'] as $name) {
        $file = $base . '/' . $name;
        if (is_file($file)) {
            return rtrim(SITE_URL, '/') . '/plugins/' . rawurlencode($slug) . '/' . rawurlencode($name) . '?v=' . filemtime($file);
        }
    }
    return '';
}

function plugin_asset(string $slug, string $path): string
{
    $slug = trim($slug);
    $path = ltrim($path, '/');
    $file = plugin_base_path($slug) . '/assets/' . $path;
    if (is_file($file)) {
        return rtrim(SITE_URL, '/') . '/plugins/' . rawurlencode($slug) . '/assets/' . str_replace('%2F', '/', rawurlencode($path)) . '?v=' . filemtime($file);
    }
    return asset($path);
}

function plugin_config_dir(): string
{
    $dir = ROOT . '/data/plugin_configs';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

function plugin_config_path(string $slug): string
{
    return plugin_config_dir() . '/' . trim($slug) . '.json';
}

function plugin_config_schema_path(string $slug): string
{
    return plugin_base_path($slug) . '/config.schema.php';
}

function plugin_has_config_schema(string $slug): bool
{
    return is_file(plugin_config_schema_path($slug));
}

function plugin_config_schema(string $slug): array
{
    $file = plugin_config_schema_path($slug);
    if (!is_file($file)) {
        return [];
    }
    try {
        $data = (static function (string $file) {
            return require $file;
        })($file);
        return is_array($data) ? $data : [];
    } catch (\Throwable $e) {
        plugin_runtime_log('Config schema parse failed for ' . $slug . ': ' . $e->getMessage());
        return [];
    }
}

function plugin_config_get(string $slug, array $defaults = []): array
{
    $path = plugin_config_path($slug);
    if (!is_file($path)) {
        return $defaults;
    }
    $raw = file_get_contents($path);
    if (!is_string($raw) || trim($raw) === '') {
        return $defaults;
    }
    $decoded = json_decode($raw, true);
    if (!is_array($decoded)) {
        return $defaults;
    }
    return array_replace($defaults, $decoded);
}

function plugin_config_set(string $slug, array $config): bool
{
    if (!plugin_slug_is_valid($slug)) {
        return false;
    }
    $path = plugin_config_path($slug);
    $json = json_encode($config, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if (!is_string($json)) {
        return false;
    }
    return file_put_contents($path, $json . "
", LOCK_EX) !== false;
}

function plugin_config_value(string $slug, string $key, $default = null)
{
    $config = plugin_config_get($slug);
    return array_key_exists($key, $config) ? $config[$key] : $default;
}

function plugin_diagnostics(string $slug): array
{
    $base = plugin_base_path($slug);
    $meta = plugin_meta($slug);
    $found = is_array($meta['__found_keys'] ?? null) ? $meta['__found_keys'] : [];
    $checks = [];
    foreach ([
        'plugin.php' => ['label' => 'plugin.php', 'required' => true, 'message_ok' => 'plugin.php 已就绪', 'message_bad' => 'plugin.php 缺失'],
        'bootstrap.php' => ['label' => 'bootstrap.php', 'required' => true, 'message_ok' => 'bootstrap.php 已就绪', 'message_bad' => 'bootstrap.php 缺失'],
    ] as $file => $config) {
        $exists = is_file($base . '/' . $file);
        $checks[] = [
            'key' => $file,
            'label' => $config['label'],
            'level' => $exists ? 'ok' : 'error',
            'message' => $exists ? $config['message_ok'] : $config['message_bad'],
            'required' => $config['required'],
        ];
    }

    $checks[] = [
        'key' => 'assets',
        'label' => 'assets',
        'level' => is_dir($base . '/assets') ? 'ok' : 'warning',
        'message' => is_dir($base . '/assets') ? 'assets 目录已提供' : 'assets 目录未提供',
        'required' => false,
    ];
    $checks[] = [
        'key' => 'preview',
        'label' => '预览图',
        'level' => plugin_preview_url($slug) !== '' ? 'ok' : 'warning',
        'message' => plugin_preview_url($slug) !== '' ? '预览图已提供' : '建议提供 preview/icon 预览图',
        'required' => false,
    ];

    foreach (['author' => '作者', 'description' => '描述', 'version' => '版本', 'requires' => '兼容版本'] as $key => $label) {
        $hasValue = in_array($key, $found, true) && trim((string) ($meta[$key] ?? '')) !== '';
        $checks[] = [
            'key' => $key,
            'label' => $label,
            'level' => $hasValue ? 'ok' : 'warning',
            'message' => $hasValue ? ($label . '信息已填写') : ($label . '信息未填写'),
            'required' => false,
        ];
    }

    $requires = trim((string) ($meta['requires'] ?? ''));
    if ($requires !== '' && preg_match('/^\d+(?:\.\d+){0,2}$/', $requires) === 1) {
        if (version_compare($requires, plugin_runtime_version(), '>')) {
            $checks[] = [
                'key' => 'compatibility',
                'label' => 'compatibility',
                'level' => 'error',
                'message' => '该插件要求内核 >= ' . $requires . '，当前仅检测到 ' . plugin_runtime_version(),
                'required' => true,
            ];
        } else {
            $checks[] = [
                'key' => 'compatibility',
                'label' => 'compatibility',
                'level' => 'ok',
                'message' => '兼容当前内核 ' . plugin_runtime_version(),
                'required' => true,
            ];
        }
    }

    $status = 'ok';
    $ok = 0;
    $warn = 0;
    $err = 0;
    foreach ($checks as $check) {
        if ($check['level'] === 'error') {
            $status = 'error';
            $err++;
            continue;
        }
        if ($check['level'] === 'warning') {
            if ($status !== 'error') {
                $status = 'warning';
            }
            $warn++;
            continue;
        }
        $ok++;
    }

    return [
        'status' => $status,
        'can_activate' => $status !== 'error',
        'checks' => $checks,
        'summary' => ['ok' => $ok, 'warning' => $warn, 'error' => $err, 'total' => count($checks)],
        'meta' => $meta,
        'runtime_version' => plugin_runtime_version(),
    ];
}

function persist_active_plugins_config(array $slugs): bool
{
    $cfgFile = ROOT . '/config.php';
    if (!is_file($cfgFile) || !is_writable($cfgFile)) {
        return false;
    }
    $content = file_get_contents($cfgFile);
    if (!is_string($content) || $content === '') {
        return false;
    }
    $valid = [];
    foreach ($slugs as $slug) {
        $slug = trim((string) $slug);
        if (plugin_slug_is_valid($slug)) {
            $valid[$slug] = $slug;
        }
    }
    $export = var_export(array_values($valid), true);
    $replacement = "define('ACTIVE_PLUGINS', " . $export . ");";
    if (preg_match("/define\('ACTIVE_PLUGINS'\s*,\s*.*?\);/s", $content) === 1) {
        $content = preg_replace("/define\('ACTIVE_PLUGINS'\s*,\s*.*?\);/s", $replacement, $content, 1);
    } else {
        $content .= "
" . $replacement . "
";
    }
    return file_put_contents($cfgFile, $content, LOCK_EX) !== false;
}

function plugin_runtime_log(string $message): void
{
    @file_put_contents(ROOT . '/data/plugin_runtime.log', '[' . date('Y-m-d H:i:s') . '] ' . $message . "
", FILE_APPEND | LOCK_EX);
}

function load_active_plugins(): void
{
    static $loaded = false;
    if ($loaded) {
        return;
    }
    $loaded = true;
    foreach (active_plugins() as $slug) {
        if (!plugin_exists($slug)) {
            continue;
        }
        $diag = plugin_diagnostics($slug);
        if (!$diag['can_activate']) {
            plugin_runtime_log('Skipped plugin ' . $slug . ' because diagnostics failed.');
            continue;
        }
        $bootstrap = plugin_base_path($slug) . '/bootstrap.php';
        if (!is_file($bootstrap)) {
            continue;
        }
        try {
            (static function (string $file): void {
                require $file;
            })($bootstrap);
        } catch (\Throwable $e) {
            plugin_runtime_log('Bootstrap failed for ' . $slug . ': ' . $e->getMessage());
        }
    }
}

function add_action(string $hook, callable $callback, int $priority = 10): void
{
    $GLOBALS['__limhy_actions'][$hook][$priority][] = $callback;
}

function do_action(string $hook, ...$args): void
{
    if (empty($GLOBALS['__limhy_actions'][$hook])) {
        return;
    }
    ksort($GLOBALS['__limhy_actions'][$hook]);
    foreach ($GLOBALS['__limhy_actions'][$hook] as $callbacks) {
        foreach ($callbacks as $callback) {
            $callback(...$args);
        }
    }
}

function add_filter(string $hook, callable $callback, int $priority = 10): void
{
    $GLOBALS['__limhy_filters'][$hook][$priority][] = $callback;
}

function apply_filters(string $hook, $value, ...$args)
{
    if (empty($GLOBALS['__limhy_filters'][$hook])) {
        return $value;
    }
    ksort($GLOBALS['__limhy_filters'][$hook]);
    foreach ($GLOBALS['__limhy_filters'][$hook] as $callbacks) {
        foreach ($callbacks as $callback) {
            $value = $callback($value, ...$args);
        }
    }
    return $value;
}

function plugin_capture_action(string $hook, ...$args): string
{
    ob_start();
    do_action($hook, ...$args);
    return (string) ob_get_clean();
}
