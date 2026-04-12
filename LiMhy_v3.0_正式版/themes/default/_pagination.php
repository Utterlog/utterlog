<?php
/**
 * LiMhy - 分页组件
 */
?>
<?php if (isset($pager) && !empty($pager['total_pages']) && $pager['total_pages'] > 1): ?>
<?php
$currentPage = (int)($pager['page'] ?? 1);
$totalPages = (int)($pager['total_pages'] ?? 1);
$window = 2;
$startPage = max(1, $currentPage - $window);
$endPage = min($totalPages, $currentPage + $window);
?>
<nav class="pagination" aria-label="分页导航">
    <?php if (!empty($pager['has_prev'])): ?>
        <a href="<?=e(pagination_url($currentPage - 1))?>" class="pagination__link pagination__link--prev">← 上一页</a>
    <?php endif; ?>

    <div class="pagination__pages">
        <?php if ($startPage > 1): ?>
            <a href="<?=e(pagination_url(1))?>" class="pagination__link">1</a>
            <?php if ($startPage > 2): ?>
                <span class="pagination__ellipsis">…</span>
            <?php endif; ?>
        <?php endif; ?>

        <?php for ($i = $startPage; $i <= $endPage; $i++): ?>
            <?php if ($i === $currentPage): ?>
                <span class="pagination__link pagination__link--current"><?=$i?></span>
            <?php else: ?>
                <a href="<?=e(pagination_url($i))?>" class="pagination__link"><?=$i?></a>
            <?php endif; ?>
        <?php endfor; ?>

        <?php if ($endPage < $totalPages): ?>
            <?php if ($endPage < $totalPages - 1): ?>
                <span class="pagination__ellipsis">…</span>
            <?php endif; ?>
            <a href="<?=e(pagination_url($totalPages))?>" class="pagination__link"><?=$totalPages?></a>
        <?php endif; ?>
    </div>

    <?php if (!empty($pager['has_next'])): ?>
        <a href="<?=e(pagination_url($currentPage + 1))?>" class="pagination__link pagination__link--next">下一页 →</a>
    <?php endif; ?>
</nav>
<?php endif; ?>
