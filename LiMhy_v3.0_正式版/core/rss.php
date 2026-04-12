<?php
/**
 * LiMhy - RSS 2.0 & Sitemap 生成器
 * 
 * @package LiMhy
 * @author  Jason（QQ：895443171）
 * @desc    遵循标准 XML 协议，优化内容分发与搜索引擎抓取
 */

declare(strict_types=1);

/**
 * 拉取 RSS 列表数据
 */
function get_rss_posts(int $limit = 20, int $offset = 0): array
{
    $p = prefix();
    $limit = max(1, $limit);
    $offset = max(0, $offset);
    return db_rows("SELECT `id`, `title`, `slug`, `excerpt`, `content_html`, `published_at` FROM `{$p}posts` WHERE `type` = 'post' AND `status` = 'published' AND `rss_enabled` = 1 AND `published_at` <= NOW() ORDER BY `published_at` DESC LIMIT {$limit} OFFSET {$offset}");
}

/**
 * 统计 RSS 可订阅文章总数
 */
function get_rss_post_count(): int
{
    $p = prefix();
    return (int) db_value("SELECT COUNT(*) FROM `{$p}posts` WHERE `type` = 'post' AND `status` = 'published' AND `rss_enabled` = 1 AND `published_at` <= NOW()");
}

/**
 * 判断是否为移动设备请求
 */
function is_feed_mobile_request(): bool
{
    $ua = strtolower((string)($_SERVER['HTTP_USER_AGENT'] ?? ''));
    if ($ua === '') {
        return false;
    }

    $signals = ['iphone', 'android', 'mobile', 'ipad', 'ipod', 'harmony', 'miuibrowser', 'ucbrowser', 'qqbrowser', 'micromessenger'];
    foreach ($signals as $signal) {
        if (strpos($ua, $signal) !== false) {
            return true;
        }
    }

    return false;
}

/**
 * 生成全量 RSS 2.0 订阅流
 */
function generate_rss(): string
{
    $posts = get_rss_posts();

    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "
";
    $xml .= '<?xml-stylesheet type="text/xsl" href="' . url('assets/feed.xsl') . '"?>' . "
";
    $xml .= '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom" xmlns:content="http://purl.org/rss/1.0/modules/content/">' . "
";
    $xml .= "<channel>
";
    $xml .= '  <title><![CDATA[' . SITE_NAME . "]]></title>
";
    $xml .= '  <link>' . SITE_URL . "</link>
";
    $xml .= '  <description><![CDATA[' . (defined('SITE_DESC') ? SITE_DESC : '') . "]]></description>
";
    $xml .= '  <language>zh-CN</language>' . "
";
    $xml .= '  <generator>LiMhy</generator>' . "
";
    $xml .= '  <atom:link href="' . url('feed') . '" rel="self" type="application/rss+xml"/>' . "
";

    $lastDate = !empty($posts) ? $posts[0]['published_at'] : date('Y-m-d H:i:s');
    $xml .= '  <lastBuildDate>' . date(DATE_RSS, strtotime($lastDate)) . "</lastBuildDate>
";

    foreach ($posts as $post) {
        $link = url("post/{$post['slug']}");
        $date = date(DATE_RSS, strtotime($post['published_at']));
        $rawDesc = $post['excerpt'] ?: mb_substr(strip_tags($post['content_html']), 0, 200);
        $rawDesc = trim(str_replace(["
", "
"], ' ', $rawDesc));
        if ($rawDesc !== '' && !preg_match('/[.…。！？!?]$/u', $rawDesc)) {
            $rawDesc .= '...';
        }
        $fullContent = $post['content_html'] . '<hr><p>阅读原文：<a href="'.$link.'">'.$post['title'].'</a></p>';

        $xml .= "  <item>
";
        $xml .= "    <title><![CDATA[" . $post['title'] . "]]></title>
";
        $xml .= "    <link>{$link}</link>
";
        $xml .= "    <guid isPermaLink=\"true\">{$link}</guid>\n";
        $xml .= "    <pubDate>{$date}</pubDate>
";
        $xml .= "    <description><![CDATA[" . $rawDesc . "]]></description>
";
        $xml .= "    <content:encoded><![CDATA[" . $fullContent . "]]></content:encoded>
";
        $xml .= "  </item>
";
    }
    $xml .= "</channel>
</rss>";
    return $xml;
}

/**
 * 浏览器访问时输出精美预览页，订阅器仍可拿 raw XML。
 */
function render_feed_preview(): string
{
    $isMobile = is_feed_mobile_request();
    $perPage = 10;
    $page = isset($_GET['page']) ? max(1, (int)$_GET['page']) : 1;
    $total = get_rss_post_count();
    $totalPages = max(1, (int)ceil($total / $perPage));
    $page = min($page, $totalPages);
    $offset = ($page - 1) * $perPage;
    $posts = get_rss_posts($perPage, $offset);
    $siteName = htmlspecialchars((string)SITE_NAME, ENT_QUOTES, 'UTF-8');
    $siteUrl = htmlspecialchars((string)SITE_URL, ENT_QUOTES, 'UTF-8');
    $siteDesc = htmlspecialchars((string)(defined('SITE_DESC') ? SITE_DESC : ''), ENT_QUOTES, 'UTF-8');
    $feedUrl = htmlspecialchars(url('feed?raw=1'), ENT_QUOTES, 'UTF-8');
    $updated = !empty($posts) ? htmlspecialchars(fmt_date((string)$posts[0]['published_at'], 'Y-m-d H:i'), ENT_QUOTES, 'UTF-8') : htmlspecialchars(date('Y-m-d H:i'), ENT_QUOTES, 'UTF-8');

    $cards = '';
    foreach ($posts as $post) {
        $title = htmlspecialchars((string)$post['title'], ENT_QUOTES, 'UTF-8');
        $link = htmlspecialchars(url('post/' . $post['slug']), ENT_QUOTES, 'UTF-8');
        $date = htmlspecialchars(fmt_date((string)$post['published_at'], 'Y-m-d H:i'), ENT_QUOTES, 'UTF-8');
        $excerptSource = trim((string)($post['excerpt'] ?: strip_tags((string)$post['content_html'])));
        if ($excerptSource === '') {
            $excerptSource = '暂无摘要';
        }
        $excerpt = $isMobile ? mb_substr($excerptSource, 0, 52) : $excerptSource;
        $excerpt = htmlspecialchars($excerpt, ENT_QUOTES, 'UTF-8');
        $cards .= <<<HTML
        <article class="feed-card">
          <div class="feed-card__meta">{$date}</div>
          <h2 class="feed-card__title"><a href="{$link}">{$title}</a></h2>
          <p class="feed-card__excerpt">{$excerpt}</p>
          <div class="feed-card__actions"><a href="{$link}">阅读全文</a></div>
        </article>
        HTML;
    }

    if ($cards === '') {
        $cards = '<div class="feed-empty">当前暂无可订阅文章。</div>';
    }

    $prevUrl = htmlspecialchars(url('feed?page=' . max(1, $page - 1)), ENT_QUOTES, 'UTF-8');
    $nextUrl = htmlspecialchars(url('feed?page=' . min($totalPages, $page + 1)), ENT_QUOTES, 'UTF-8');
    $pagination = '';
    if ($totalPages > 1) {
        $prevClass = $page <= 1 ? ' pager__btn is-disabled' : ' pager__btn';
        $nextClass = $page >= $totalPages ? ' pager__btn is-disabled' : ' pager__btn';
        $prevAttr = $page <= 1 ? ' aria-disabled="true" tabindex="-1"' : '';
        $nextAttr = $page >= $totalPages ? ' aria-disabled="true" tabindex="-1"' : '';
        $pagination = '<nav class="pager" aria-label="RSS翻页">'
            . '<a class="' . $prevClass . '" href="' . $prevUrl . '"' . $prevAttr . '>上一页</a>'
            . '<span class="pager__meta">第 ' . $page . ' / ' . $totalPages . ' 页</span>'
            . '<a class="' . $nextClass . '" href="' . $nextUrl . '"' . $nextAttr . '>下一页</a>'
            . '</nav>';
    }

    return <<<HTML
<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>{$siteName} · RSS 订阅</title>
<meta name="color-scheme" content="light dark">
<style>
:root{--bg:#d3e8d7;--card:#f6fbf5;--text:#181b24;--muted:#5f6775;--line:#000000;--accent:#2563eb}
@media (prefers-color-scheme: dark){:root{--bg:#d3e8d7;--card:#edf5eb;--text:#181b24;--muted:#5f6775;--line:#000000;--accent:#1d4ed8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif}
a{color:inherit;text-decoration:none}.wrap{max-width:980px;margin:0 auto;padding:40px 20px 64px}.hero{padding:28px;border:1px solid var(--line);border-radius:24px;background:var(--card)}.hero__eyebrow{font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted)}.hero h1{margin:10px 0 8px;font-size:clamp(28px,4vw,42px);line-height:1.15}.hero p{margin:0;color:var(--muted)}.hero__meta{display:flex;gap:12px;flex-wrap:wrap;margin-top:18px}.chip{display:inline-flex;align-items:center;gap:8px;padding:8px 12px;border:1px solid var(--line);border-radius:999px;background:var(--card);font-size:13px;color:var(--muted)}.hero__actions{display:flex;gap:12px;flex-wrap:wrap;margin-top:20px}.btn{display:inline-flex;align-items:center;justify-content:center;padding:11px 16px;border-radius:12px;border:1px solid var(--line);background:var(--card);font-weight:700}.btn--primary{background:var(--text);color:var(--card);border-color:var(--text)}.list{margin-top:26px;display:grid;gap:16px}.feed-card{padding:22px;border-radius:20px;border:1px solid var(--line);background:var(--card);box-shadow:none}.feed-card__meta{font-size:13px;color:var(--muted)}.feed-card__title{margin:8px 0 10px;font-size:24px;line-height:1.35}.feed-card__title a:hover{color:var(--accent)}.feed-card__excerpt{margin:0;color:var(--muted);font-size:16px;line-height:32px;height:96px;overflow:hidden;word-break:break-word;overflow-wrap:anywhere}.feed-card__actions{margin-top:14px;font-weight:700;color:var(--accent);display:flex;justify-content:flex-end}.feed-card__actions a{display:inline-flex;align-items:center}.feed-empty{padding:28px;border-radius:20px;border:1px dashed var(--line);background:var(--card);color:var(--muted);text-align:center}.pager{margin-top:18px;display:flex;align-items:center;justify-content:flex-end;gap:12px;flex-wrap:wrap}.pager__btn{display:inline-flex;align-items:center;justify-content:center;padding:10px 16px;border:1px solid var(--line);border-radius:999px;background:var(--card);min-width:92px}.pager__btn.is-disabled{pointer-events:none;opacity:.42}.pager__meta{font-size:14px;color:var(--muted)}@media (max-width:640px){.wrap{padding:28px 16px 52px}.hero,.feed-card{border-radius:18px}.feed-card__title{font-size:18px}.feed-card__excerpt{font-size:15px;line-height:28px;height:auto;max-height:none}.pager{justify-content:space-between}.pager__meta{width:100%;text-align:center;order:-1}}
</style>
</head>
<body>
  <main class="wrap">
    <section class="hero">
      <div class="hero__eyebrow">LiMhy RSS Feed</div>
      <h1>{$siteName}</h1>
      <p>{$siteDesc}</p>
      <div class="hero__meta">
        <span class="chip">最近更新 {$updated}</span>
        <span class="chip">标准 RSS 2.0</span>
        <span class="chip">浏览器预览页</span>
      </div>
      <div class="hero__actions">
        <a class="btn btn--primary" href="{$feedUrl}">打开原始 RSS</a>
        <a class="btn" href="{$siteUrl}">返回站点首页</a>
      </div>
    </section>
    <section class="list">{$cards}</section>
    {$pagination}
  </main>
</body>
</html>
HTML;
}

/**
 * 生成符合 Google 标准的站点地图
 */
function generate_sitemap(): string
{
    $p = prefix();
    $posts = db_rows("SELECT `slug`, `type`, `updated_at`, `published_at` FROM `{$p}posts` WHERE `status` = 'published' AND `published_at` <= NOW() ORDER BY `published_at` DESC");

    $xml = '<?xml version="1.0" encoding="UTF-8"?>' . "
";
    $xml .= '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' . "
";
    $xml .= "  <url><loc>" . SITE_URL . "/</loc><priority>1.0</priority><changefreq>daily</changefreq></url>
";

    foreach ($posts as $post) {
        $prefix = $post['type'] === 'page' ? 'page' : 'post';
        $loc = url("{$prefix}/{$post['slug']}");
        $modSource = (string)($post['updated_at'] ?? $post['published_at'] ?? '');
        $modTs = $modSource !== '' ? strtotime($modSource) : false;
        $mod = $modTs ? date('Y-m-d', $modTs) : date('Y-m-d');
        $priority = $post['type'] === 'page' ? '0.6' : '0.8';
        $xml .= "  <url><loc>{$loc}</loc><lastmod>{$mod}</lastmod><priority>{$priority}</priority></url>
";
    }
    $xml .= "</urlset>";
    return $xml;
}
