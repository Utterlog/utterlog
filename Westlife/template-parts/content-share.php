<?php

/**
 * 文章分享模板（图标一排，悬浮仅图标变色+放大）
 * @package Westlife
 */
if (!defined('ABSPATH')) exit;

$permalink = get_permalink();
$title     = get_the_title();

$u  = urlencode($permalink);
$t  = urlencode($title);
$tt = rawurlencode($title . ' ' . $permalink);

/* 各平台分享链接 */
$xUrl        = "https://x.com/intent/tweet?url={$u}&text={$t}";
$weiboUrl    = "https://service.weibo.com/share/share.php?url={$u}&title={$t}";
$telegramUrl = "https://t.me/share/url?url={$u}&text={$t}";
$mastodonUrl = "https://share.joinmastodon.org/intent?text={$tt}";
$blueskyUrl  = "https://bsky.app/intent/compose?text={$tt}";
?>
<div class="post-share" aria-label="分享">
  <ul class="share-icons">
    <li>
      <a class="share-icon share-icon--x" data-platform="x" href="<?php echo esc_url($xUrl); ?>" target="_blank" rel="noopener" aria-label="分享到 X">
        <?php echo westlife_lucide_icon('fa-brands fa-x-twitter'); ?>
      </a>
    </li>
    <li>
      <a class="share-icon share-icon--mastodon" data-platform="mastodon" href="<?php echo esc_url($mastodonUrl); ?>" target="_blank" rel="noopener" aria-label="分享到 Mastodon">
        <?php echo westlife_lucide_icon('fa-brands fa-mastodon'); ?>
      </a>
    </li>
    <li>
      <a class="share-icon share-icon--weibo" data-platform="weibo" href="<?php echo esc_url($weiboUrl); ?>" target="_blank" rel="noopener" aria-label="分享到微博">
        <?php echo westlife_lucide_icon('fa-brands fa-weibo'); ?>
      </a>
    </li>
    <li>
      <a class="share-icon share-icon--telegram" data-platform="telegram" href="<?php echo esc_url($telegramUrl); ?>" target="_blank" rel="noopener" aria-label="分享到 Telegram">
        <?php echo westlife_lucide_icon('fa-brands fa-telegram'); ?>
      </a>
    </li>
    <li>
      <a class="share-icon share-icon--bluesky" data-platform="bluesky" href="<?php echo esc_url($blueskyUrl); ?>" target="_blank" rel="noopener" aria-label="分享到 Bluesky">
        <?php echo westlife_lucide_icon('fa-brands fa-bluesky'); ?>
      </a>
    </li>
    <!-- 微信扫码分享（与其它图标结构统一：图标 + 同级浮层） -->
    <li class="share-wechat">
      <a class="share-icon share-icon--wechat"
        data-platform="wechat"
        data-copy-url="<?php echo esc_url($permalink); ?>"
        href="<?php echo esc_url($permalink); ?>"
        aria-label="微信分享（点击复制链接，悬浮二维码）"
        role="button"
        data-wechat-hover>
        <?php echo westlife_lucide_icon('fa-brands fa-weixin'); ?>
      </a>
      <div class="wechat-qr" data-url="<?php echo esc_url(get_permalink()); ?>" data-lazy-qr>
        <div class="qrcode-content"></div>
        <div class="qrcode-tip"><span>微信扫码分享</span></div>
      </div>
    </li>
  </ul>
</div>
