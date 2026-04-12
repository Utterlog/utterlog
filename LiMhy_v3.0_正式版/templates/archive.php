<?php
/**
 * LiMhy - 归档页视图
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    按年份聚合展示所有已发布文章
 * @require array $archive 归档数据集
 */
?>
<div class="archive-page-v2">
    <h1 class="archive-main-title">归档</h1>

    <?php 
    $isFirst = true;
    foreach ($archive as $year => $yearPosts): 
        $yearCount = count($yearPosts);
    ?>
        <?php if (!$isFirst): ?>
            <div class="archive-year-separator"></div>
        <?php endif; ?>

        <div class="archive-year-group">
            <div class="archive-year-header">
                <span class="archive-year-num"><?=$year?></span>
                <span class="archive-year-count">共 <?=$yearCount?> 篇文章</span>
            </div>

            <ul class="archive-list">
            <?php foreach ($yearPosts as $post): ?>
                <li class="archive-item">
                    <time class="archive-item__date"><?=date('M j', strtotime($post['published_at']))?></time>
                    <a href="<?=url("post/{$post['slug']}")?>" class="archive-item__title"><?=e($post['title'])?></a>
                </li>
            <?php endforeach; ?>
            </ul>
        </div>

    <?php 
        $isFirst = false;
    endforeach; 
    ?>
</div>
