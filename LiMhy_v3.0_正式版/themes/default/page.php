<?php
/**
 * 独立页面模板 (已统一 UI + Native Lazyload)
 * 变量：$post, $comments
 */
?>

<div class="container">
    <!-- 统一的面包屑导航 -->
    <nav class="breadcrumb">
        <a href="<?=url()?>">首页</a>
        &gt; <span><?=e($post['title'])?></span>
    </nav>

    <article class="post-detail">
        <header class="post-detail__header">
            <h1 class="post-detail__title"><?=e($post['title'])?></h1>
        </header>

        <div class="post-detail__content prose">
            <?=img_lazyload($post['content_html'])?>
        </div>

        <footer class="post-detail__footer"></footer>

        <?php require __DIR__ . '/comments.php'; ?>
     
    </article>
</div>