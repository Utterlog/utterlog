<?php
/**
 * 加密文章密码输入页
 */
declare(strict_types=1);
$flash = get_flash();
?>
<div class="password-page-v2">
    <!-- 顶部标题区 -->
    <div class="pwd-header">
        <h1 class="pwd-title"><?=e($post['title'])?></h1>
        <span class="pwd-badge">密文</span>
    </div>
    
    <!-- 核心交互区 -->
    <div class="pwd-body">
        <div class="pwd-banner">
            <img src="/assets/img/mm.png" alt="加密文章插画">
        </div>

        <p class="pwd-desc">博主设置了本篇文章密码访问</p>
        
        <?php if ($flash): ?>
            <div class="pwd-alert pwd-alert--<?=e($flash['type'])?>"><?=e($flash['msg'])?></div>
        <?php endif; ?>

        <form method="POST" action="<?=url('api/post-password')?>" class="pwd-form">
            <?=csrf_field()?>
            <input type="hidden" name="post_id" value="<?=$post['id']?>">
            
            <!-- 无缝拼接的细线条输入组 -->
            <div class="pwd-input-group">
                <input type="password" name="password" placeholder="输入密码" class="pwd-input" required autofocus>
                <button type="submit" class="pwd-submit">查看</button>
            </div>
        </form>
    </div>
</div>
