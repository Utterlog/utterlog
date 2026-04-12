<?php
/**
 * LiMhy - 404 错误视图
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    处理未命中路由的降级呈现
 */
declare(strict_types=1);
?>
<div class="error-page-v2">
    <!-- 将视觉元素与返回首页的交互合并 -->
    <a href="<?=url()?>" class="error-page-v2__link" title="点击返回首页">
        <img src="/assets/img/404.png" alt="404 Not Found" class="error-page-v2__img">
        <p class="error-page-v2__text">当前页面不存在</p>
    </a>
</div>
