<?php
/**
 * LiMhy 更新升级与反馈页 (搭载沉浸式管理员引擎)
 */
?>
<div class="container logs-page-container">
    
    <!-- 顶部 Banner -->
    <div class="logs-hero-banner">
        <img src="<?=url('assets/img/gxsj.png')?>" alt="LiMhy 更新升级">
    </div>

    <?php if (is_admin()): ?>
    <div class="admin-logs-panel">
        <h3>管理员控制台</h3>
        <div class="admin-logs-grid">
            <!-- 1. 发布日志区域 -->
            <div class="admin-logs-card">
                <h4>发布更新日志</h4>
                <form action="<?=url('api/log-manage')?>" method="POST">
                    <input type="hidden" name="action" value="add_log">
                    <input type="text" name="title" class="sketch-input" placeholder="版本号或更新标题 (例: V6.8.0 性能提升)" required style="margin-bottom:8px; padding: 6px 10px; font-size:13px;">
                    <textarea name="content" class="sketch-input sketch-textarea" placeholder="更新内容 (支持换行)" required style="margin-bottom:8px; min-height:75px; padding: 6px 10px; font-size:13px;"></textarea>
                    <button type="submit" class="sketch-btn" style="padding: 6px 12px; font-size: 13px; width:100%;">发布日志</button>
                </form>
            </div>
            <!-- 2. 审核反馈区域 -->
            <div class="admin-logs-card">
                <h4>待审反馈 (<?=count($pending_feedbacks)?>)</h4>
                <?php if (empty($pending_feedbacks)): ?>
                    <div style="text-align:center; margin-top:30px; font-size:12px; color:#999; font-weight:bold;">暂无待审反馈，去喝杯咖啡吧。</div>
                <?php else: ?>
                    <ul class="admin-fb-list">
                    <?php foreach($pending_feedbacks as $fb): ?>
                        <li>
                            <div class="fb-info" title="<?=e($fb['content'])?>">
                                <b><?=e($fb['author'])?></b>: <?=e($fb['content'])?>
                            </div>
                            <div class="fb-actions">
                                <form action="<?=url('api/log-manage')?>" method="POST" style="display:inline;">
                                    <input type="hidden" name="action" value="approve_fb"><input type="hidden" name="id" value="<?=$fb['id']?>">
                                    <button type="submit" class="btn-approve" title="批准并作为公告跑马灯">通</button>
                                </form>
                                <form action="<?=url('api/log-manage')?>" method="POST" style="display:inline;" onsubmit="return confirm('直接删除此反馈？');">
                                    <input type="hidden" name="action" value="del_fb"><input type="hidden" name="id" value="<?=$fb['id']?>">
                                    <button type="submit" class="btn-reject" title="忽略删除">删</button>
                                </form>
                            </div>
                        </li>
                    <?php endforeach; ?>
                    </ul>
                <?php endif; ?>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <!-- 消息公告栏与反馈按钮 -->
    <div class="logs-action-bar">
        <div class="logs-announcement">
            <img src="<?=url('assets/img/gg.svg')?>" class="gg-icon" alt="公告">
            <div class="ticker-wrap" id="js-ticker-wrap">
                <ul class="ticker-list" id="js-ticker-list">
                    <?php if (empty($feedbacks)): ?>
                        <li class="ticker-item"><span>暂无最新通报，系统平稳运行中...</span></li>
                    <?php else: ?>
                        <?php foreach ($feedbacks as $fb): ?>
                            <li class="ticker-item"><span>感谢 <b><?=e($fb['author'])?></b> 反馈：<?=e($fb['content'])?></span></li>
                        <?php endforeach; ?>
                    <?php endif; ?>
                </ul>
            </div>
        </div>
        <button class="logs-feedback-btn" id="js-open-feedback">我要反馈</button>
    </div>

    <!-- 更新时间线 -->
    <div class="logs-timeline">
        <?php if (empty($logs)): ?>
            <p style="text-align: center; color: #888; margin-top: 40px; font-weight:bold;">暂无更新记录</p>
        <?php endif; ?>

        <?php foreach ($logs as $log): 
            $isLiked = false;
            if (isset($likesData) && in_array($log['id'], $likesData)) { $isLiked = true; }
        ?>
        <div class="log-item">
            <div class="log-axis"></div>
            <div class="log-content-wrapper">
                <h3 class="log-date-title"><?=fmt_date($log['created_at'], 'Y.m.d')?> &nbsp; <?=e($log['title'])?></h3>
                <div class="log-box">
                    <?=nl2br(e($log['content']))?>
                </div>
                <div class="log-actions" style="display: flex; justify-content: space-between; align-items: center;">
                    <div class="log-like-btn js-log-like <?=$isLiked ? 'is-liked' : ''?>" data-id="<?=$log['id']?>">
                        <img src="<?=url('assets/img/dz.svg')?>" alt="赞">
                        <span class="like-count"><?=$log['likes']?></span>
                    </div>
                    
                    <?php if (is_admin()): ?>
                    <form action="<?=url('api/log-manage')?>" method="POST" onsubmit="return confirm('确定删除此更新记录吗？');">
                        <input type="hidden" name="action" value="del_log">
                        <input type="hidden" name="id" value="<?=$log['id']?>">
                        <button type="submit" style="background:none; border:none; color:#dc2626; cursor:pointer; font-weight:900; font-size:12px; text-decoration:underline;">删除记录</button>
                    </form>
                    <?php endif; ?>
                </div>
            </div>
        </div>
        <?php endforeach; ?>
    </div>
</div>

<!-- 我要反馈 Modal -->
<div class="sketch-modal" id="feedback-modal">
    <div class="sketch-modal-overlay js-close-feedback"></div>
    <div class="sketch-modal-content feedback-modal-content">
        <div class="feedback-modal-banner">
            <img src="<?=url('assets/img/fk.png')?>" alt="反馈交流">
            <button class="sketch-modal-close js-close-feedback">✕</button>
        </div>
        <form class="feedback-modal-body" id="feedback-form" action="<?=url('api/feedback')?>" method="POST">
            <input type="text" name="author" class="sketch-input" placeholder="您的昵称" required>
            <textarea name="content" class="sketch-input sketch-textarea" placeholder="请详细描述您发现的 Bug 或体验异常..." required></textarea>
            
            <div class="feedback-action-row">
                <div class="captcha-group">
                    <input type="hidden" name="captcha_token" id="js-fb-captcha-token" value="">
                    <img src="" id="js-fb-captcha" class="captcha-img" alt="captcha" title="点击刷新验证码">
                    <input type="text" name="captcha" class="sketch-input captcha-input" placeholder="验证码" required autocomplete="off" maxlength="4" inputmode="latin">
                </div>
                <button type="submit" class="sketch-btn">提交</button>
            </div>
        </form>
    </div>
</div>