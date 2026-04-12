<?php
/**
 * LiMhy Upload Helpers
 */
declare(strict_types=1);

function limhy_storage_oss_enabled(): bool
{
    if (!defined('OSS_TYPE')) {
        return false;
    }

    $type = trim((string)OSS_TYPE);
    if ($type === '') {
        return false;
    }

    $host = defined('OSS_HOST') ? trim((string)OSS_HOST) : '';
    $ak = defined('OSS_AK') ? trim((string)OSS_AK) : '';
    $sk = defined('OSS_SK') ? trim((string)OSS_SK) : '';

    if ($type === 'custom_api' || $type === 'litepic') {
        return $host !== '' && ($type !== 'litepic' || $sk !== '');
    }

    if (!in_array($type, ['aliyun', 's4', 's3', 'upyun'], true)) {
        return false;
    }

    return $host !== '' && $ak !== '' && $sk !== '';
}



function limhy_storage_type(): string
{
    return defined('OSS_TYPE') ? trim((string)OSS_TYPE) : '';
}

function limhy_litepic_enabled(): bool
{
    return limhy_storage_type() === 'litepic' && limhy_storage_oss_enabled();
}

function limhy_litepic_auth_mode(): string
{
    $mode = defined('OSS_AUTH') ? strtolower(trim((string)OSS_AUTH)) : 'bearer';
    return in_array($mode, ['bearer', 'x_api_key'], true) ? $mode : 'bearer';
}

function limhy_litepic_base_url(): string
{
    $host = defined('OSS_HOST') ? trim((string)OSS_HOST) : '';
    if ($host === '') {
        return '';
    }

    $host = rtrim($host, '/');
    if (preg_match('~/docs$~i', $host)) {
        $host = preg_replace('~/docs$~i', '', $host) ?: $host;
        $host = rtrim($host, '/');
    }

    return $host;
}

function limhy_litepic_parse_response(array $payload): array
{
    if (($payload['status'] ?? '') !== 'success' && !($payload['ok'] ?? false)) {
        $message = (string)($payload['message'] ?? $payload['error'] ?? 'LitePic 返回失败状态');
        return ['ok' => false, 'error' => $message];
    }

    $results = $payload['results'] ?? [];
    $row = is_array($results) && isset($results[0]) && is_array($results[0]) ? $results[0] : $payload;
    $url = trim((string)($row['url'] ?? ''));
    $thumbnailUrl = trim((string)($row['thumbnail_url'] ?? ''));
    $mime = trim((string)($row['mime_type'] ?? $payload['mime_type'] ?? ''));
    if ($url === '') {
        return ['ok' => false, 'error' => 'LitePic 响应缺少图片地址'];
    }

    return [
        'ok' => true,
        'url' => $url,
        'thumbnail_url' => $thumbnailUrl,
        'mime_type' => $mime,
    ];
}

function limhy_upload_to_litepic(array $file): array
{
    if (!limhy_litepic_enabled()) {
        return ['ok' => false, 'error' => 'LitePic 尚未配置完成'];
    }

    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'error' => limhy_upload_error_message((int)($file['error'] ?? UPLOAD_ERR_NO_FILE))];
    }

    $origName = clean((string)($file['name'] ?? ''), 200);
    $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
    if ($ext === '' || !in_array($ext, limhy_upload_allowed_extensions(true), true)) {
        return ['ok' => false, 'error' => 'LitePic 仅允许图片上传'];
    }

    $tmpName = (string)($file['tmp_name'] ?? '');
    if ($tmpName === '' || !is_uploaded_file($tmpName)) {
        return ['ok' => false, 'error' => '上传临时文件不存在'];
    }

    $mime = limhy_detect_mime_type($tmpName, $origName, (string)($file['type'] ?? 'application/octet-stream'));
    if (!str_starts_with($mime, 'image/')) {
        return ['ok' => false, 'error' => '文件内容未通过图片校验'];
    }

    if (!function_exists('curl_init')) {
        return ['ok' => false, 'error' => '服务器未启用 cURL，无法对接 LitePic'];
    }

    $baseUrl = limhy_litepic_base_url();
    $token = defined('OSS_SK') ? trim((string)OSS_SK) : '';
    $authMode = limhy_litepic_auth_mode();
    $endpoint = $baseUrl . '/api/upload.php';
    $size = (int)($file['size'] ?? 0);

    $curlFile = new CURLFile($tmpName, $mime, $origName ?: ('upload.' . $ext));
    $postFields = ['file' => $curlFile];
    $headers = ['Accept: application/json'];
    if ($authMode === 'x_api_key') {
        $headers[] = 'X-API-Key: ' . $token;
    } else {
        $headers[] = 'Authorization: Bearer ' . $token;
    }

    $ch = curl_init($endpoint);
    curl_setopt_array($ch, [
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => $postFields,
        CURLOPT_HTTPHEADER => $headers,
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CONNECTTIMEOUT => 10,
        CURLOPT_TIMEOUT => 60,
        CURLOPT_SSL_VERIFYPEER => true,
        CURLOPT_SSL_VERIFYHOST => 2,
    ]);

    $raw = curl_exec($ch);
    $errno = curl_errno($ch);
    $error = curl_error($ch);
    $statusCode = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);

    if ($errno !== 0) {
        return ['ok' => false, 'error' => 'LitePic 请求失败：' . $error];
    }
    if (!is_string($raw) || trim($raw) === '') {
        return ['ok' => false, 'error' => 'LitePic 返回空响应'];
    }

    $payload = json_decode($raw, true);
    if (!is_array($payload)) {
        return ['ok' => false, 'error' => 'LitePic 返回了非 JSON 内容'];
    }
    if ($statusCode >= 400) {
        $message = (string)($payload['message'] ?? $payload['error'] ?? ('LitePic HTTP ' . $statusCode));
        return ['ok' => false, 'error' => $message];
    }

    $parsed = limhy_litepic_parse_response($payload);
    if (!$parsed['ok']) {
        return $parsed;
    }

    return [
        'ok' => true,
        'url' => $parsed['url'],
        'thumbnail_url' => $parsed['thumbnail_url'],
        'mime' => $parsed['mime_type'] !== '' ? $parsed['mime_type'] : $mime,
        'size' => $size,
        'name' => $origName !== '' ? $origName : basename((string)parse_url($parsed['url'], PHP_URL_PATH)),
    ];
}

function limhy_store_litepic_upload(string $tablePrefix, array $file, array $options = []): array
{
    $uploaded = limhy_upload_to_litepic($file);
    if (!$uploaded['ok']) {
        return $uploaded;
    }

    return limhy_save_remote_upload_record(
        $tablePrefix,
        (string)$uploaded['url'],
        (string)$uploaded['name'],
        (int)$uploaded['size'],
        (string)$uploaded['mime'],
        $options
    );
}

function limhy_upload_allowed_extensions(bool $imagesOnly = false): array
{
    $imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];
    if ($imagesOnly) {
        return $imageExts;
    }

    return array_merge($imageExts, ['pdf', 'zip', 'rar', 'mp3', 'mp4', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'txt']);
}

function limhy_is_image_upload(array $upload): bool
{
    $ext = strtolower(pathinfo((string)($upload['filename'] ?? ''), PATHINFO_EXTENSION));
    return in_array($ext, limhy_upload_allowed_extensions(true), true);
}

function limhy_upload_public_url(string $path): string
{
    if (str_starts_with($path, 'http://') || str_starts_with($path, 'https://')) {
        return $path;
    }

    return rtrim(SITE_URL, '/') . '/uploads/' . ltrim($path, '/');
}

function limhy_upload_error_message(int $code): string
{
    return match ($code) {
        UPLOAD_ERR_INI_SIZE, UPLOAD_ERR_FORM_SIZE => '文件体积超出限制',
        UPLOAD_ERR_PARTIAL => '文件上传未完成，请重试',
        UPLOAD_ERR_NO_FILE => '未检测到文件流',
        UPLOAD_ERR_NO_TMP_DIR => '服务器临时目录缺失',
        UPLOAD_ERR_CANT_WRITE => '服务器写入失败',
        UPLOAD_ERR_EXTENSION => '上传被扩展拦截',
        default => '上传通道异常',
    };
}

function limhy_detect_mime_type(string $absolutePath, string $fallbackName = '', string $fallbackClientType = ''): string
{
    $mime = '';

    if ($absolutePath !== '' && is_file($absolutePath)) {
        if (function_exists('finfo_open')) {
            $finfo = @finfo_open(FILEINFO_MIME_TYPE);
            if ($finfo !== false) {
                $detected = @finfo_file($finfo, $absolutePath);
                if (is_string($detected) && $detected !== '') {
                    $mime = $detected;
                }
                @finfo_close($finfo);
            }
        }

        if ($mime === '' && function_exists('mime_content_type')) {
            $detected = @mime_content_type($absolutePath);
            if (is_string($detected) && $detected !== '') {
                $mime = $detected;
            }
        }
    }

    if ($mime !== '') {
        return $mime;
    }

    $ext = strtolower(pathinfo($fallbackName !== '' ? $fallbackName : $absolutePath, PATHINFO_EXTENSION));
    $map = [
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'gif' => 'image/gif',
        'webp' => 'image/webp',
        'svg' => 'image/svg+xml',
        'bmp' => 'image/bmp',
        'pdf' => 'application/pdf',
        'zip' => 'application/zip',
        'rar' => 'application/vnd.rar',
        'mp3' => 'audio/mpeg',
        'mp4' => 'video/mp4',
        'doc' => 'application/msword',
        'docx' => 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'xls' => 'application/vnd.ms-excel',
        'xlsx' => 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'ppt' => 'application/vnd.ms-powerpoint',
        'pptx' => 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'txt' => 'text/plain',
    ];

    if ($ext !== '' && isset($map[$ext])) {
        return $map[$ext];
    }

    return $fallbackClientType !== '' ? $fallbackClientType : 'application/octet-stream';
}


function limhy_generate_image_filename(string $ext, ?int $ts = null): string
{
    $ts = $ts ?? time();
    $ext = strtolower(trim($ext));
    $ext = preg_replace('/[^a-z0-9]+/', '', $ext) ?: 'webp';
    return 'Lm_' . date('Y_md_His', $ts) . '_' . substr(md5((string)uniqid('', true)), 0, 6) . '.' . $ext;
}

function limhy_make_upload_target(string $ext): array
{
    $uploadDir = ROOT . '/uploads/';
    if (!is_dir($uploadDir) && !@mkdir($uploadDir, 0755, true) && !is_dir($uploadDir)) {
        throw new RuntimeException('存储目录初始化失败');
    }

    $subDir = date('Y/m');
    $targetDir = $uploadDir . $subDir . '/';
    if (!is_dir($targetDir) && !@mkdir($targetDir, 0755, true) && !is_dir($targetDir)) {
        throw new RuntimeException('存储目录创建失败');
    }

    $safeName = limhy_generate_image_filename($ext);
    return [
        'filename' => $safeName,
        'absolute_path' => $targetDir . $safeName,
        'relative_path' => $subDir . '/' . $safeName,
    ];
}

function limhy_try_expand_uploads_path_column(string $tablePrefix): void
{
    static $checked = [];
    if (isset($checked[$tablePrefix])) {
        return;
    }
    $checked[$tablePrefix] = true;

    try {
        $table = $tablePrefix . 'uploads';
        $row = db_row("SHOW COLUMNS FROM `{$table}` LIKE 'path'");
        if (!$row) {
            return;
        }
        $type = strtolower((string)($row['Type'] ?? ''));
        if (str_contains($type, 'text')) {
            return;
        }
        db_execute("ALTER TABLE `{$table}` MODIFY `path` TEXT NOT NULL");
    } catch (Throwable $e) {
        error_log('[LiMhy] uploads.path 自愈失败: ' . $e->getMessage());
    }
}

function limhy_store_local_upload(array $file, string $tablePrefix, array $options = []): array
{
    $maxSize = (int)($options['max_size'] ?? (10 * 1024 * 1024));
    $imagesOnly = !empty($options['images_only']);
    $allowedExt = $options['allowed_ext'] ?? limhy_upload_allowed_extensions($imagesOnly);

    if (($file['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
        return ['ok' => false, 'error' => limhy_upload_error_message((int)($file['error'] ?? UPLOAD_ERR_NO_FILE))];
    }

    $size = (int)($file['size'] ?? 0);
    if ($size <= 0 || $size > $maxSize) {
        return ['ok' => false, 'error' => $imagesOnly ? '图片体积超出 10MB 限制' : '体积超标'];
    }

    $origName = clean((string)($file['name'] ?? ''), 200);
    $ext = strtolower(pathinfo($origName, PATHINFO_EXTENSION));
    if ($ext === '' || !in_array($ext, $allowedExt, true)) {
        return ['ok' => false, 'error' => $imagesOnly ? '仅允许上传图片文件' : '拒绝该 MIME 类型'];
    }

    try {
        $target = limhy_make_upload_target($ext);
    } catch (RuntimeException $e) {
        return ['ok' => false, 'error' => $e->getMessage()];
    }

    if (!move_uploaded_file((string)($file['tmp_name'] ?? ''), $target['absolute_path'])) {
        return ['ok' => false, 'error' => $imagesOnly ? '图片落盘失败' : '系统底盘错误，IO 被拒绝'];
    }

    $mime = limhy_detect_mime_type($target['absolute_path'], $origName, (string)($file['type'] ?? 'application/octet-stream'));
    if ($imagesOnly && !str_starts_with($mime, 'image/')) {
        @unlink($target['absolute_path']);
        return ['ok' => false, 'error' => '文件内容未通过图片校验'];
    }

    try {
        limhy_try_expand_uploads_path_column($tablePrefix);
        $storedOriginalName = str_starts_with($mime, 'image/') ? $target['filename'] : ($origName ?: $target['filename']);
        db_execute(
            "INSERT INTO `{$tablePrefix}uploads` (`filename`, `original_name`, `path`, `mime_type`, `size`, `created_at`) VALUES (?, ?, ?, ?, ?, NOW())",
            [$target['filename'], $storedOriginalName, $target['relative_path'], $mime, $size]
        );
        $id = (int)db_value('SELECT LAST_INSERT_ID()');
    } catch (Throwable $e) {
        @unlink($target['absolute_path']);
        error_log('[LiMhy] 本地附件入库失败: ' . $e->getMessage());
        return ['ok' => false, 'error' => '图片入库失败，请检查 uploads 表结构或数据库权限'];
    }

    return [
        'ok' => true,
        'item' => [
            'id' => $id,
            'name' => (str_starts_with($mime, 'image/') ? $target['filename'] : ($origName ?: $target['filename'])),
            'url' => limhy_upload_public_url($target['relative_path']),
            'path' => $target['relative_path'],
            'mime' => $mime,
            'size' => $size,
            'driver' => 'local',
        ],
    ];
}

function limhy_save_remote_upload_record(string $tablePrefix, string $url, string $name, int $size, string $mime, array $options = []): array
{
    $imagesOnly = !empty($options['images_only']);
    $maxSize = (int)($options['max_size'] ?? (10 * 1024 * 1024));
    $url = trim(clean($url, 1000));
    $name = clean($name, 200);
    $mime = clean($mime, 100);

    if ($url === '' || $url === 'undefined') {
        return ['ok' => false, 'error' => '获取云端地址失败'];
    }

    if (!preg_match('#^https?://#i', $url)) {
        return ['ok' => false, 'error' => '云端地址格式非法'];
    }

    if ($size <= 0 || $size > $maxSize) {
        return ['ok' => false, 'error' => $imagesOnly ? '图片体积超出 10MB 限制' : '体积超标'];
    }

    $pathPart = (string)parse_url($url, PHP_URL_PATH);
    $filename = basename($pathPart);
    $ext = strtolower(pathinfo($filename, PATHINFO_EXTENSION));
    if ($ext === '' || !in_array($ext, limhy_upload_allowed_extensions($imagesOnly), true)) {
        return ['ok' => false, 'error' => $imagesOnly ? '仅允许上传图片文件' : '文件类型不允许'];
    }

    if ($imagesOnly && $mime !== '' && !str_starts_with($mime, 'image/')) {
        return ['ok' => false, 'error' => '文件内容未通过图片校验'];
    }

    try {
        limhy_try_expand_uploads_path_column($tablePrefix);
        db_execute(
            "INSERT INTO `{$tablePrefix}uploads` (`filename`, `original_name`, `path`, `mime_type`, `size`, `created_at`) VALUES (?, ?, ?, ?, ?, NOW())",
[($filename ?: limhy_generate_image_filename($ext)), $name ?: ($filename ?: limhy_generate_image_filename($ext)), $url, $mime, $size]
        );
        $id = (int)db_value('SELECT LAST_INSERT_ID()');
    } catch (Throwable $e) {
        error_log('[LiMhy] 云端附件入库失败: ' . $e->getMessage());
        return ['ok' => false, 'error' => '对象存储图片入库失败，请检查 uploads.path 字段长度或数据库权限'];
    }

    return [
        'ok' => true,
        'item' => [
            'id' => $id,
            'name' => (str_starts_with($mime, 'image/') ? ($storedFilename ?? ($filename ?: 'remote.' . $ext)) : ($name ?: ($filename ?: 'remote.' . $ext))),
            'url' => $url,
            'path' => $url,
            'mime' => $mime,
            'size' => $size,
            'driver' => 'object',
        ],
    ];
}
