<?php

declare(strict_types=1);

function captcha_store_dir(): string
{
    $dir = ROOT . '/data/captcha';
    if (!is_dir($dir)) {
        @mkdir($dir, 0755, true);
    }
    return $dir;
}

function captcha_allowed_form(string $form): bool
{
    return in_array($form, ['comment', 'feedback', 'link'], true);
}

function captcha_token(): string
{
    return 'cp_' . bin2hex(random_bytes(16));
}

function captcha_code(int $length = 4): string
{
    $chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $max = strlen($chars) - 1;
    $code = '';
    for ($i = 0; $i < $length; $i++) {
        $code .= $chars[random_int(0, $max)];
    }
    return $code;
}

function captcha_file_path(string $token): string
{
    $safe = preg_replace('/[^a-zA-Z0-9_\-]/', '', $token);
    return captcha_store_dir() . '/' . $safe . '.json';
}

function captcha_create_ticket(string $form, string $ip, int $ttl = 900): array
{
    if (!captcha_allowed_form($form)) {
        throw new RuntimeException('Unsupported captcha form.');
    }

    if (mt_rand(1, 20) === 1) {
        captcha_gc();
    }

    $token = captcha_token();
    $code = captcha_code(4);
    $now = time();

    $payload = [
        'form' => $form,
        'code' => strtolower($code),
        'hash' => password_hash(strtolower($code), PASSWORD_DEFAULT),
        'ip' => $ip,
        'created_at' => $now,
        'expires_at' => $now + $ttl,
        'used_at' => null,
    ];

    $json = json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    if ($json === false) {
        throw new RuntimeException('Captcha payload encode failed.');
    }

    $file = captcha_file_path($token);
    if (@file_put_contents($file, $json, LOCK_EX) === false) {
        throw new RuntimeException('Captcha ticket write failed.');
    }

    return [
        'token' => $token,
        'code' => $code,
        'ttl' => $ttl,
    ];
}

function captcha_read_ticket(string $token): ?array
{
    if ($token === '') {
        return null;
    }

    $file = captcha_file_path($token);
    if (!is_file($file)) {
        return null;
    }

    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') {
        return null;
    }

    $data = json_decode($raw, true);
    return is_array($data) ? $data : null;
}

function captcha_delete_ticket(string $token): void
{
    $file = captcha_file_path($token);
    if (is_file($file)) {
        @unlink($file);
    }
}

function captcha_verify_ticket(string $token, string $input, string $form, string $ip): array
{
    $ticket = captcha_read_ticket($token);
    if (!$ticket) {
        return ['ok' => false, 'reason' => 'missing'];
    }

    if (($ticket['form'] ?? '') !== $form) {
        captcha_delete_ticket($token);
        return ['ok' => false, 'reason' => 'form_mismatch'];
    }

    if (!empty($ticket['used_at'])) {
        captcha_delete_ticket($token);
        return ['ok' => false, 'reason' => 'used'];
    }

    if ((int)($ticket['expires_at'] ?? 0) < time()) {
        captcha_delete_ticket($token);
        return ['ok' => false, 'reason' => 'expired'];
    }

    if (($ticket['ip'] ?? '') !== $ip) {
        captcha_delete_ticket($token);
        return ['ok' => false, 'reason' => 'ip_mismatch'];
    }

    $normalized = strtolower(trim($input));
    if ($normalized === '') {
        return ['ok' => false, 'reason' => 'empty'];
    }

    $hash = (string)($ticket['hash'] ?? '');
    if ($hash === '' || !password_verify($normalized, $hash)) {
        return ['ok' => false, 'reason' => 'invalid'];
    }

    captcha_delete_ticket($token);
    return ['ok' => true, 'reason' => 'passed'];
}

function captcha_render_png(string $code): void
{
    if (!function_exists('imagecreate')) {
        header('Content-Type: text/plain; charset=utf-8');
        http_response_code(500);
        echo 'GD library is required.';
        exit;
    }

    $code = strtoupper(substr($code, 0, 4));
    $width = 112;
    $height = 42;
    $img = imagecreate($width, $height);

    $bg = imagecolorallocate($img, 255, 255, 255);
    $textCol = imagecolorallocate($img, 17, 17, 17);
    $noiseCol = imagecolorallocate($img, 210, 210, 210);
    $lineCol = imagecolorallocate($img, 185, 185, 185);

    for ($i = 0; $i < 120; $i++) {
        imagesetpixel($img, random_int(0, $width - 1), random_int(0, $height - 1), $noiseCol);
    }

    for ($i = 0; $i < 5; $i++) {
        imageline(
            $img,
            random_int(0, $width - 1),
            random_int(0, $height - 1),
            random_int(0, $width - 1),
            random_int(0, $height - 1),
            $lineCol
        );
    }

    $fontSize = 5;
    $fontW = imagefontwidth($fontSize);
    $fontH = imagefontheight($fontSize);
    $x = (int)(($width - ($fontW * 4)) / 2);
    $y = (int)(($height - $fontH) / 2);
    imagestring($img, $fontSize, $x, $y, $code, $textCol);

    while (ob_get_level()) {
        ob_end_clean();
    }

    header('Content-Type: image/png');
    header('Cache-Control: no-cache, no-store, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    imagepng($img);
    imagedestroy($img);
    exit;
}

function captcha_gc(int $maxTtl = 3600): void
{
    $dir = captcha_store_dir();
    $files = glob($dir . '/*.json');
    if (!is_array($files)) {
        return;
    }

    $now = time();
    foreach ($files as $file) {
        if (!is_file($file)) {
            continue;
        }

        $raw = @file_get_contents($file);
        $data = json_decode((string)$raw, true);
        if (!is_array($data)) {
            @unlink($file);
            continue;
        }

        $expiresAt = (int)($data['expires_at'] ?? 0);
        $createdAt = (int)($data['created_at'] ?? 0);
        if (($expiresAt > 0 && $expiresAt < $now) || ($createdAt > 0 && ($now - $createdAt) > $maxTtl)) {
            @unlink($file);
        }
    }
}
