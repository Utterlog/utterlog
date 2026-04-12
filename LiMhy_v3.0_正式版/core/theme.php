<?php
/**
 * LiMhy - 主题运行时内核 (MVP)
 */

declare(strict_types=1);

function theme_slug_is_valid(string $slug): bool
{
    return $slug !== '' && preg_match('/^[a-zA-Z0-9_-]+$/', $slug) === 1;
}

function theme_runtime_version(): string
{
    return '2.0.0';
}

function active_theme(): string
{
    $theme = defined('ACTIVE_THEME') ? (string) ACTIVE_THEME : 'default';
    $theme = trim($theme);

    if (!theme_slug_is_valid($theme)) {
        return 'default';
    }

    return $theme;
}

function theme_base_path(string $slug = ''): string
{
    $theme = $slug !== '' ? $slug : active_theme();

    if (!theme_slug_is_valid($theme)) {
        $theme = 'default';
    }

    return ROOT . '/themes/' . $theme;
}

function theme_exists(string $slug): bool
{
    return is_dir(theme_base_path($slug));
}

function theme_manifest_defaults(string $slug = ''): array
{
    return [
        'name' => 'Unknown Theme',
        'slug' => $slug !== '' ? $slug : active_theme(),
        'version' => '0.0.0',
        'author' => '',
        'description' => '',
        'requires' => '2.0.0',
        '__found_keys' => [],
    ];
}

function theme_manifest_found_keys(string $raw): array
{
    $keys = [];
    foreach (['name', 'slug', 'version', 'author', 'description', 'requires'] as $key) {
        $pattern = "/[\'\"]" . preg_quote($key, '/') . "[\'\"]\\s*=>\\s*([\'\"])(.*?)\\1/s";
        if (preg_match($pattern, $raw) === 1) {
            $keys[] = $key;
        }
    }
    return $keys;
}

function theme_manifest_from_file(string $metaFile, string $fallbackSlug = ''): array
{
    $defaults = theme_manifest_defaults($fallbackSlug);
    if (!is_file($metaFile) || !is_readable($metaFile)) {
        return $defaults;
    }

    $raw = file_get_contents($metaFile);
    if (!is_string($raw) || trim($raw) === '') {
        return $defaults;
    }

    $meta = $defaults;
    $meta['__found_keys'] = theme_manifest_found_keys($raw);
    foreach (['name', 'slug', 'version', 'author', 'description', 'requires'] as $key) {
        $pattern = "/[\'\"]" . preg_quote($key, '/') . "[\'\"]\\s*=>\\s*([\'\"])(.*?)\\1/s";
        if (preg_match($pattern, $raw, $matches) === 1) {
            $meta[$key] = trim(str_replace(["
", "
", "
"], ' ', stripcslashes($matches[2])));
        }
    }

    if (!theme_slug_is_valid((string) $meta['slug'])) {
        $meta['slug'] = $defaults['slug'];
    }

    return $meta;
}

function theme_meta(string $slug = ''): array
{
    $base = theme_base_path($slug);
    $metaFile = $base . '/theme.php';
    return theme_manifest_from_file($metaFile, $slug !== '' ? $slug : active_theme());
}

function available_themes(): array
{
    $themesDir = ROOT . '/themes';
    if (!is_dir($themesDir)) {
        return [];
    }

    $items = scandir($themesDir);
    if (!is_array($items)) {
        return [];
    }

    $themes = [];
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') {
            continue;
        }
        if (!theme_slug_is_valid($item) || !is_dir($themesDir . '/' . $item)) {
            continue;
        }
        $themes[$item] = theme_meta($item);
    }

    ksort($themes);
    return $themes;
}

function theme_candidate_paths(?string $theme = null): array
{
    $theme = $theme !== null && $theme !== '' ? $theme : active_theme();
    $paths = [];

    if (theme_slug_is_valid($theme)) {
        $paths[] = theme_base_path($theme);
    }

    if ($theme !== 'default') {
        $paths[] = theme_base_path('default');
    }

    return array_values(array_unique($paths));
}

function theme_template_file(string $template, ?string $theme = null): string
{
    $template = trim($template);
    if ($template === '' || str_contains($template, '..') || str_contains($template, '\\')) {
        return '';
    }

    $relative = $template . '.php';

    foreach (theme_candidate_paths($theme) as $base) {
        $candidate = $base . '/' . $relative;
        if (is_file($candidate)) {
            return $candidate;
        }
    }

    $legacy = ROOT . '/templates/' . $relative;
    return is_file($legacy) ? $legacy : '';
}

function theme_layout_file(?string $theme = null): string
{
    foreach (theme_candidate_paths($theme) as $base) {
        $candidate = $base . '/layout.php';
        if (is_file($candidate)) {
            return $candidate;
        }
    }

    $legacy = ROOT . '/templates/layout.php';
    return is_file($legacy) ? $legacy : '';
}

function theme_partial(string $template, array $vars = []): void
{
    $file = theme_template_file($template);
    if ($file === '') {
        return;
    }

    if ($vars !== []) {
        extract($vars, EXTR_SKIP);
    }

    require $file;
}

function theme_asset(string $path, ?string $theme = null): string
{
    $theme = $theme !== null && $theme !== '' ? $theme : active_theme();
    $clean = ltrim($path, '/');

    if (str_starts_with($clean, 'http://') || str_starts_with($clean, 'https://')) {
        return $clean;
    }

    foreach (theme_candidate_paths($theme) as $base) {
        $slug = basename($base);
        $file = $base . '/assets/' . $clean;
        if (is_file($file)) {
            return rtrim(SITE_URL, '/') . '/themes/' . rawurlencode($slug) . '/assets/' . str_replace('%2F', '/', rawurlencode($clean)) . '?v=' . filemtime($file);
        }
    }

    return asset($clean);
}

function theme_preview_url(string $slug = ''): string
{
    $theme = $slug !== '' ? $slug : active_theme();
    $candidates = ['preview.jpg', 'preview.png', 'preview.webp', 'screenshot.jpg', 'screenshot.png', 'screenshot.webp'];

    foreach (theme_candidate_paths($theme) as $base) {
        $baseName = basename($base);
        foreach ($candidates as $fileName) {
            $file = $base . '/' . $fileName;
            if (is_file($file)) {
                return rtrim(SITE_URL, '/') . '/themes/' . rawurlencode($baseName) . '/' . rawurlencode($fileName) . '?v=' . filemtime($file);
            }
        }
    }

    return '';
}

function theme_required_templates(): array
{
    return ['theme.php', 'layout.php', 'home.php'];
}

function theme_directory_health(string $absolutePath): array
{
    $missing = [];
    foreach (theme_required_templates() as $file) {
        if (!is_file(rtrim($absolutePath, '/') . '/' . $file)) {
            $missing[] = $file;
        }
    }

    return [
        'ok' => $missing === [],
        'missing' => $missing,
    ];
}

function theme_diagnostics(string $slug): array
{
    $slug = trim($slug);
    $base = theme_base_path($slug);
    $metaFile = $base . '/theme.php';
    $meta = theme_manifest_from_file($metaFile, $slug);
    $found = is_array($meta['__found_keys'] ?? null) ? $meta['__found_keys'] : [];
    $required = theme_directory_health($base);
    $runtimeVersion = theme_runtime_version();
    $checks = [];

    $checks[] = [
        'key' => 'theme.php',
        'label' => 'theme.php',
        'level' => is_file($metaFile) ? 'ok' : 'error',
        'message' => is_file($metaFile) ? '清单文件就绪' : '清单文件缺失',
        'required' => true,
    ];
    $checks[] = [
        'key' => 'layout.php',
        'label' => 'layout.php',
        'level' => is_file($base . '/layout.php') ? 'ok' : 'error',
        'message' => is_file($base . '/layout.php') ? '布局模板就绪' : '布局模板缺失',
        'required' => true,
    ];
    $checks[] = [
        'key' => 'home.php',
        'label' => 'home.php',
        'level' => is_file($base . '/home.php') ? 'ok' : 'error',
        'message' => is_file($base . '/home.php') ? '首页模板就绪' : '首页模板缺失',
        'required' => true,
    ];

    $checks[] = [
        'key' => 'preview',
        'label' => '预览图',
        'level' => theme_preview_url($slug) !== '' ? 'ok' : 'warning',
        'message' => theme_preview_url($slug) !== '' ? '预览图已提供' : '建议提供 preview/screenshot 预览图',
        'required' => false,
    ];
    $checks[] = [
        'key' => 'assets',
        'label' => 'assets',
        'level' => is_dir($base . '/assets') ? 'ok' : 'warning',
        'message' => is_dir($base . '/assets') ? '资源目录已提供' : '未检测到 assets 目录，将回落到系统资源',
        'required' => false,
    ];

    foreach ([
        'author' => '作者',
        'description' => '描述',
        'version' => '版本',
        'requires' => '兼容版本',
    ] as $key => $label) {
        $hasValue = in_array($key, $found, true) && trim((string) ($meta[$key] ?? '')) !== '';
        $checks[] = [
            'key' => $key,
            'label' => $label,
            'level' => $hasValue ? 'ok' : 'warning',
            'message' => $hasValue ? ($label . '信息已填写') : ('建议补充' . $label . '信息'),
            'required' => false,
        ];
    }

    $requires = trim((string) ($meta['requires'] ?? ''));
    $isRequiresValid = $requires !== '' && preg_match('/^\d+(?:\.\d+){0,2}$/', $requires) === 1;
    if (!$isRequiresValid) {
        $checks[] = [
            'key' => 'requires_format',
            'label' => 'requires 格式',
            'level' => 'warning',
            'message' => 'requires 建议使用 2.0.0 这样的版本格式',
            'required' => false,
        ];
    } elseif (version_compare($requires, $runtimeVersion, '>')) {
        $checks[] = [
            'key' => 'requires_runtime',
            'label' => '兼容版本',
            'level' => 'error',
            'message' => '该主题要求内核 >= ' . $requires . '，当前仅检测到 ' . $runtimeVersion,
            'required' => true,
        ];
    } else {
        $checks[] = [
            'key' => 'requires_runtime',
            'label' => '兼容版本',
            'level' => 'ok',
            'message' => '兼容当前内核 ' . $runtimeVersion,
            'required' => true,
        ];
    }

    $status = 'ok';
    foreach ($checks as $check) {
        if ($check['level'] === 'error') {
            $status = 'error';
            break;
        }
        if ($check['level'] === 'warning') {
            $status = 'warning';
        }
    }

    $messages = [
        'error' => [],
        'warning' => [],
    ];
    foreach ($checks as $check) {
        if ($check['level'] === 'error') {
            $messages['error'][] = $check['message'];
        } elseif ($check['level'] === 'warning') {
            $messages['warning'][] = $check['message'];
        }
    }

    return [
        'status' => $status,
        'can_activate' => $status !== 'error' && $required['ok'],
        'checks' => $checks,
        'messages' => $messages,
        'meta' => $meta,
        'runtime_version' => $runtimeVersion,
        'required_ok' => $required['ok'],
    ];
}
