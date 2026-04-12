<?php
/**
 * 文章/页面详情模板 (Path Fixed + Native Lazyload)
 * 变更：强制引用原生图片懒加载处理器
 */
?>

<div class="container">
    
    <!-- 1. 面包屑导航 -->
    <nav class="breadcrumb">
        <a href="<?=url()?>">首页</a>
        <?php if (!empty($post['category_name'])): ?>
            &gt; <a href="<?=category_url($post)?>"><?=e($post['category_name'])?></a>
        <?php endif; ?>
        &gt; <span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:200px;display:inline-block;vertical-align:bottom"><?=e($post['title'])?></span>
    </nav>

    <article class="post-detail">
        
        <!-- 2. 文章头部 -->
        <header class="post-detail__header">
            <h1 class="post-detail__title"><?=e($post['title'])?></h1>
            <div class="post-detail__meta">
                <time><?=fmt_date($post['published_at'], 'Y年m月d日')?></time>
                &nbsp;·&nbsp; 阅读 <?=(int)$post['view_count']?>
                <?php if ($post['comment_count'] > 0): ?>
                    &nbsp;·&nbsp; 评论 <?=(int)$post['comment_count']?>
                <?php endif; ?>
                <?php if ($post['status'] === 'private'): ?>
                    &nbsp;·&nbsp; 私密
                <?php endif; ?>
            </div>
        </header>

        <!-- 3. 正文内容 -->
        <div class="post-detail__content prose">
            <?=img_lazyload($post['content_html'])?>
        </div>

        <!-- 3.5 版权声明 -->
        <div class="post-copyright-card">
            <div class="copyright-item">
                <span class="copyright-label">文章作者：</span>
                <span class="copyright-value"><?=e(function_exists('limhy_public_author_name') ? limhy_public_author_name() : SITE_NAME)?></span>
            </div>
            <div class="copyright-item">
                <span class="copyright-label">本文链接：</span>
                <span class="copyright-value">
                    <a href="<?=url("post/{$post['slug']}")?>"><?=url("post/{$post['slug']}")?></a>
                </span>
            </div>
            <div class="copyright-item" style="margin-top: 4px;">
                <span class="copyright-value">本博客所有文章除特别声明外，均采用 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" target="_blank" rel="nofollow">CC BY-NC-SA 4.0</a> 许可协议。转载请注明出处！</span>
            </div>
        </div>

        <!-- 4. 底部区 -->
        <footer class="post-detail__footer">
            <?php if (!empty($tags)): ?>
            <div class="tag-list">
                <?php foreach ($tags as $t): ?>
                    <a href="<?=url("tag/{$t['slug']}")?>" class="tag-item"># <?=e($t['name'])?></a>
                <?php endforeach; ?>
            </div>
            <?php endif; ?>

            <?php if ($prevPost || $nextPost): ?>
            <nav class="post-nav">
                <?php if ($prevPost): ?>
                    <a href="<?=url("post/{$prevPost['slug']}")?>" class="post-nav__link">
                        <span class="post-nav__label">← PREVIOUS</span>
                        <span class="post-nav__title"><?=e($prevPost['title'])?></span>
                    </a>
                <?php else: ?>
                    <div class="post-nav__placeholder"></div>
                <?php endif; ?>

                <?php if ($nextPost): ?>
                    <a href="<?=url("post/{$nextPost['slug']}")?>" class="post-nav__link post-nav__link--next">
                        <span class="post-nav__label">NEXT →</span>
                        <span class="post-nav__title"><?=e($nextPost['title'])?></span>
                    </a>
                <?php else: ?>
                    <div class="post-nav__placeholder"></div>
                <?php endif; ?>
            </nav>
            <?php endif; ?>
        </footer>

        <?php require __DIR__ . '/comments.php'; ?>

    </article>
</div>