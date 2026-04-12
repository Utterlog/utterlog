<?php
declare(strict_types=1);

add_action('front_head', function (): void {
    echo '<style>.hello-hook-post-tip{margin-top:18px;padding:12px 14px;border:1px dashed rgba(22,93,255,.28);border-radius:12px;background:rgba(22,93,255,.04);color:#165DFF;font-size:13px;line-height:1.7}.plugin-hello-footer{position:fixed;right:20px;bottom:20px;z-index:98;padding:10px 14px;border-radius:999px;background:#165DFF;color:#fff;font-size:12px;box-shadow:0 10px 24px rgba(22,93,255,.2)}</style>';
});

add_action('front_footer', function (): void {
    if ((int)plugin_settings_value('hello-hook', 'enable_front_badge', 1) !== 1) {
        return;
    }
    $text = htmlspecialchars((string)plugin_settings_value('hello-hook', 'footer_text', 'Hello Hook 已生效'), ENT_QUOTES, 'UTF-8');
    echo '<div class="plugin-hello-footer">' . $text . '</div>';
});

add_action('admin_footer', function (): void {
    $route = trim((string) ($_GET['r'] ?? ''), '/');
    if ($route !== 'admin/plugins') {
        return;
    }
    echo '<div class="plugin-hello-footer">Hello Hook 正在为插件页提供示例注入</div>';
});

add_filter('post_content_html', function (string $content, array $context): string {
    if (($context['template'] ?? '') !== 'post') {
        return $content;
    }
    return $content . '<div class="hello-hook-post-tip">Hello Hook：这是一条由插件通过 filter 注入的文章正文尾部提示。</div>';
}, 10);
