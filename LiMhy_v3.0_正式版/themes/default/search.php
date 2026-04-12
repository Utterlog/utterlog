<?php
/** 搜索结果页：复用标签页列表风格 */
$covConf = defined('POST_COVER_ENABLED') ? POST_COVER_ENABLED : 1;
if ($covConf === true) $covConf = 1;
if ($covConf === false) $covConf = 0;
?>
<div class="container list-page">
    <div class="page-header" style="margin-bottom: 24px;">
        <h1 class="page-title" style="font-size: 2.2rem; font-weight: 900; margin: 0 0 8px 0; letter-spacing: 1px;">搜索结果</h1>
        <p class="page-desc" style="color: #666; font-weight: 600; font-family: monospace;">
            <?php if ($q): ?>
                关键词 “<?=e($q)?>” — 找到 <?=count($posts)?> 篇文章
            <?php else: ?>
                请输入至少 2 个字符
            <?php endif; ?>
        </p>
    </div>

    <?php if (empty($posts) && $q): ?>
        <div class="empty-state" style="padding: 40px 0; font-weight: 800;"><p>未找到相关文章</p></div>
    <?php elseif (!empty($posts)): ?>
        <section class="post-list">
            <?php foreach ($posts as $post):
                $contentHtml = (string)($post['content_html'] ?? '');
                $contentRaw = (string)($post['content'] ?? '');
                $cover = get_post_cover_for_post($post);
                if (!$cover) $cover = 'https://ui-avatars.com/api/?name=' . urlencode((string)$post['title']) . '&background=eee&color=999&size=400';
                $hasRealImage = post_has_visual_cover($post);
                $showCover = ($covConf == 1) || ($covConf == 2 && $hasRealImage);
            ?>
            <article class="post-card">
                <?php if ($showCover): ?>
                <div class="post-cover-art">
                    <div class="post-cover-img-box">
                        <img src="<?=e($cover)?>" alt="cover" loading="lazy">
                    </div>
                </div>
                <?php endif; ?>

                <div class="post-content">
                    <h2 class="post-title">
                        <a href="<?=post_url($post)?>"><?=e((string)$post['title'])?></a>
                        <?php if (!empty($post['password'])): ?><span class="post-card__lock">🔒</span><?php endif; ?>
                    </h2>
                    <div class="post-excerpt">
                        <?=e((string)($post['excerpt'] ?: make_excerpt($contentRaw !== '' ? $contentRaw : strip_tags($contentHtml))))?>
                    </div>
                    <div class="post-meta">
                        <?=fmt_date((string)$post['published_at'])?>
                        <?php if (!empty($post['category_name'])): ?>
                            · <?=e((string)$post['category_name'])?>
                        <?php endif; ?>
                        <?php if ((int)($post['comment_count'] ?? 0) > 0): ?>
                            · <?=(int)$post['comment_count']?> 条评论
                        <?php endif; ?>
                    </div>
                </div>
            </article>
            <?php endforeach; ?>
        </section>
    <?php endif; ?>
</div>