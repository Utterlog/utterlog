<?xml version="1.0" encoding="UTF-8"?>
<xsl:stylesheet version="1.0"
  xmlns:xsl="http://www.w3.org/1999/XSL/Transform"
  xmlns:content="http://purl.org/rss/1.0/modules/content/">
  <xsl:output method="html" encoding="UTF-8" indent="yes"/>
  <xsl:template match="/">
    <html lang="zh-CN">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title><xsl:value-of select="rss/channel/title" /> - RSS</title>
        <style><![CDATA[
          :root {
            color-scheme: light dark;
            --bg: #f3f4f6;
            --card: #ffffff;
            --text: #0f172a;
            --muted: #64748b;
            --border: #111111;
            --accent: #2563eb;
            --shadow: 4px 4px 0 rgba(15, 23, 42, 0.12);
          }
          @media (prefers-color-scheme: dark) {
            :root {
              --bg: #0f1115;
              --card: #171a21;
              --text: #f8fafc;
              --muted: #94a3b8;
              --border: #525866;
              --accent: #93c5fd;
              --shadow: 6px 6px 0 rgba(0,0,0,0.28);
            }
          }
          * { box-sizing: border-box; }
          body {
            margin: 0;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
            background: radial-gradient(circle at top, rgba(37,99,235,0.08), transparent 28%), var(--bg);
            color: var(--text);
            line-height: 1.7;
          }
          a { color: var(--accent); text-decoration: none; }
          a:hover { text-decoration: underline; }
          .wrap { width: min(1100px, calc(100% - 32px)); margin: 0 auto; padding: 28px 0 56px; }
          .hero {
            background: var(--card);
            border: 2px solid var(--border);
            border-radius: 18px;
            padding: 28px;
            box-shadow: var(--shadow);
            margin-bottom: 22px;
          }
          .hero__eyebrow { font-size: 12px; font-weight: 800; letter-spacing: .14em; color: var(--muted); text-transform: uppercase; }
          .hero h1 { margin: 10px 0 8px; font-size: clamp(30px, 5vw, 42px); line-height: 1.15; }
          .hero__desc { margin: 0 0 18px; color: var(--muted); max-width: 760px; }
          .hero__meta { display: flex; flex-wrap: wrap; gap: 12px; color: var(--muted); font-size: 14px; }
          .hero__meta span {
            display: inline-flex; align-items: center; gap: 8px;
            padding: 8px 12px; border: 1px solid color-mix(in srgb, var(--border) 20%, transparent);
            border-radius: 999px; background: color-mix(in srgb, var(--card) 88%, var(--bg));
          }
          .list { display: grid; gap: 18px; }
          .item {
            background: var(--card);
            border: 2px solid var(--border);
            border-radius: 18px;
            padding: 22px;
            box-shadow: var(--shadow);
          }
          .item__head { display:flex; flex-wrap:wrap; align-items:flex-start; justify-content:space-between; gap:14px; margin-bottom: 14px; }
          .item__title { margin: 0; font-size: clamp(22px, 3vw, 28px); line-height: 1.25; }
          .item__date { color: var(--muted); font-size: 14px; font-weight: 700; white-space: nowrap; }
          .item__desc { margin: 0 0 14px; color: var(--muted); }
          .item__content {
            border-top: 1px dashed color-mix(in srgb, var(--border) 35%, transparent);
            padding-top: 16px; overflow-wrap: anywhere;
          }
          .item__content img { max-width: 100%; height: auto; border-radius: 10px; border: 1px solid color-mix(in srgb, var(--border) 45%, transparent); }
          .item__content table { display: block; width: 100%; overflow-x: auto; border-collapse: collapse; }
          .item__content td, .item__content th { border: 1px solid color-mix(in srgb, var(--border) 28%, transparent); padding: 8px 10px; }
          .item__foot { margin-top: 18px; display:flex; justify-content:flex-end; }
          .item__link {
            display: inline-flex; align-items:center; gap:8px; font-weight: 800;
            padding: 10px 14px; border-radius: 12px; border: 2px solid var(--border);
            background: color-mix(in srgb, var(--card) 86%, var(--bg));
          }
          .empty {
            background: var(--card); border: 2px dashed var(--border); border-radius: 18px;
            padding: 32px; text-align: center; color: var(--muted);
          }
        ]]></style>
      </head>
      <body>
        <div class="wrap">
          <section class="hero">
            <div class="hero__eyebrow">LiMhy RSS Feed</div>
            <h1><xsl:value-of select="rss/channel/title" /></h1>
            <p class="hero__desc"><xsl:value-of select="rss/channel/description" /></p>
            <div class="hero__meta">
              <span>站点：<a href="{rss/channel/link}"><xsl:value-of select="rss/channel/link" /></a></span>
              <span>语言：<xsl:value-of select="rss/channel/language" /></span>
              <span>最近更新：<xsl:value-of select="rss/channel/lastBuildDate" /></span>
            </div>
          </section>
          <xsl:choose>
            <xsl:when test="count(rss/channel/item) &gt; 0">
              <section class="list">
                <xsl:for-each select="rss/channel/item">
                  <article class="item">
                    <div class="item__head">
                      <h2 class="item__title"><a href="{link}"><xsl:value-of select="title" /></a></h2>
                      <div class="item__date"><xsl:value-of select="pubDate" /></div>
                    </div>
                    <p class="item__desc"><xsl:value-of select="description" disable-output-escaping="yes" /></p>
                    <div class="item__content">
                      <xsl:value-of select="content:encoded" disable-output-escaping="yes" />
                    </div>
                    <div class="item__foot">
                      <a class="item__link" href="{link}">阅读全文 →</a>
                    </div>
                  </article>
                </xsl:for-each>
              </section>
            </xsl:when>
            <xsl:otherwise>
              <div class="empty">当前 RSS 暂无可输出内容。</div>
            </xsl:otherwise>
          </xsl:choose>
        </div>
      </body>
    </html>
  </xsl:template>
</xsl:stylesheet>
