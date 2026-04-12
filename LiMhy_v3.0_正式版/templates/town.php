<div class="container">
    <div class="breadcrumb">
        <a href="<?= url() ?>">首页</a> &raquo; <span>博客小镇</span>
    </div>
    
    <div class="post-detail__header">
        <h1 class="post-detail__title">博客小镇 (Cyber Town)</h1>
        <div class="post-detail__meta">正在将当前在线访客投影到数字沙盘中...</div>
    </div>

    <!-- 小镇沙盘容器 -->
    <div class="town-container">
        <div class="town-scroll-area">
            <div class="town-map" id="js-town-map">
            </div>
        </div>
    </div>
    
</div>

<script>
    window.townEnv = <?= json_encode($env ?? []) ?>;
</script>