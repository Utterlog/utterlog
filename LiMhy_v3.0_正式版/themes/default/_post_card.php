<?php
/**
 * LiMhy - 文章卡片组件
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    用于列表页的单篇文章摘要渲染
 * @require array $post 单篇文章数据
 */
?>
<article class="post-card">
    <h2 class="post-card__title">
        <a href="<?=post_url($post)?>"><?=e($post['title'])?></a>
        <?php if ($post['password'] !== ''): ?><span class="post-card__lock">🔒</span><?php endif; ?>
    </h2>
    <p class="post-card__excerpt"><?=e($post['excerpt'] ?: make_excerpt($post['content']))?></p>
    <div class="post-card__meta">
        <time><?=fmt_date($post['published_at'])?></time>
        <?php if (!empty($post['category_name'])): ?>
            · <a href="<?=category_url($post)?>"><?=e($post['category_name'])?></a>
        <?php endif; ?>
        <?php if ($post['comment_count'] > 0): ?>
            · <?=$post['comment_count']?> 条评论
        <?php endif; ?>
    </div>
</article>
