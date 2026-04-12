<?php
/**
 * LiMhy - 评论交互组件
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    处理评论的提交、嵌套解析与本地代理头像呈现。采用主楼层倒序、子楼层正序结构。
 * @require array $post 绑定的文章数据
 */

$flash = get_flash();

// 1. 系统评论功能开关判定
$isCommentOpen = isset($post['comment_enabled']) && (int)$post['comment_enabled'] === 1;

// 2. 依赖数据初始化与容错
if ((!isset($comments) || empty($comments)) && isset($post['id'])) {
    $tblComments = (function_exists('prefix') ? prefix() : 'lm_') . 'comments';
    if (function_exists('db_rows')) {
        $commentPayload = function_exists('limhy_comment_pagination_payload') ? limhy_comment_pagination_payload((int)$post['id'], function_exists('limhy_comment_page_param') ? limhy_comment_page_param() : 1) : ['items' => db_rows("SELECT * FROM `{$tblComments}` WHERE `post_id` = ? AND `status` = 'approved' ORDER BY `created_at` ASC", [$post['id']]), 'pager' => null];
        $comments = $commentPayload['items'];
        if (!isset($commentPager)) { $commentPager = $commentPayload['pager'] ?? null; }
    }
}
if (!isset($comments)) $comments = [];

// 3. 评论树形结构解析与构建
$threadedComments = [];
$map = [];
foreach ($comments as $c) { $c = limhy_normalize_comment_row($c); $c['children'] = []; $map[$c['id']] = $c; }
foreach ($comments as $c) {
    if ($c['parent_id'] == 0) { $threadedComments[$c['id']] = &$map[$c['id']]; }
}
foreach ($comments as $c) {
    if ($c['parent_id'] > 0) {
        $rootId = $c['parent_id'];
        $replyTo = $map[$c['parent_id']]['author'] ?? '';
        $safety = 0;
        while (isset($map[$rootId]) && $map[$rootId]['parent_id'] > 0 && $safety++ < 100) { $rootId = $map[$rootId]['parent_id']; }
        if (isset($threadedComments[$rootId])) {
            $c['reply_to_author'] = $replyTo;
            $threadedComments[$rootId]['children'][] = $c;
        }
    }
}

?>

<section class="comments-section" id="comments" style="margin-top: 10px;">
    
    <?php if ($isCommentOpen): ?>

        <h3 class="comments-title" style="margin-bottom: 12px;">发表评论</h3>

        <?php if ($flash): ?>
            <div class="c-alert c-alert--<?=e($flash['type'])?>"><?=e($flash['msg'])?></div>
        <?php endif; ?>

        <form method="POST" action="<?=url('api/comment')?>" class="comment-form" id="comment-form" style="border:none !important; margin-bottom: 10px !important; padding-bottom: 0 !important;">
            <?=csrf_field()?>
            <input type="hidden" name="post_id" value="<?=$post['id']?>">
            <input type="hidden" name="parent_id" id="js-parent-id" value="0">
            <input type="text" name="website_url" style="display:none" autocomplete="off">
            <input type="hidden" name="_lt" value="<?=time()?>">

            <div id="js-reply-hint" class="reply-hint" style="display:none">
                <span>回复 @<span id="js-reply-to"></span></span>
                <span class="reply-hint-cancel" id="js-cancel-reply">✕ 取消</span>
            </div>

            <?php if (is_admin()): 
                $displayName = limhy_comment_admin_display_name();
                $displayMail = limhy_comment_admin_display_email();
                $avatarUrl = get_avatar_url($displayMail, $displayName);
            ?>
                <div class="comment-admin-ready">
                    <img src="<?=e($avatarUrl)?>" class="comment-admin-ready__avatar">
                    <div class="comment-admin-ready__meta">
                        <div class="comment-admin-ready__name">
                            <?=e($displayName)?>
                            <span class="comment-admin-ready__badge">博主</span>
                        </div>
                        <div class="comment-admin-ready__hint">管理员已就绪</div>
                    </div>
                    <input type="hidden" name="author" value="<?=e($displayName)?>">
                    <input type="hidden" name="email" value="<?=e($displayMail)?>">
                    <input type="hidden" name="url" value="<?=defined('SITE_URL') ? SITE_URL : ''?>">
                </div>
            <?php else: ?>
                <div class="comment-form-grid">
                    <div class="comment-input-group">
                        <input type="text" name="author" class="sketch-input" placeholder="昵称 *" required value="<?=e($_COOKIE['comment_author'] ?? '')?>">
                    </div>
                    <div class="comment-input-group">
                        <input type="email" name="email" class="sketch-input" placeholder="邮箱 *" required value="<?=e($_COOKIE['comment_email'] ?? '')?>">
                    </div>
                </div>
                <div class="comment-input-group" style="margin-bottom:12px">
                    <input type="url" name="url" class="sketch-input" placeholder="网址 (http://...)" value="<?=e($_COOKIE['comment_url'] ?? '')?>">
                </div>
            <?php endif; ?>

            
<div class="comment-input-group comment-input-group--textarea" style="margin-bottom:12px">
    <div class="comment-textarea-wrap">
        <textarea name="content" class="sketch-input sketch-textarea js-comment-textarea" id="js-comment-textarea" required placeholder="欢迎评论你的想法..."></textarea>
        <button type="button" class="comment-emoji-trigger" id="js-comment-emoji-trigger" aria-label="插入表情" title="插入表情">
            <img src="<?=e(url('assets/img/comment-emoji.svg'))?>" alt="表情图标">
        </button>
    </div>
    <?php $commentEmojis = limhy_comment_emojis(); ?>
    <div class="comment-emoji-panel" id="js-comment-emoji-panel" hidden>
        <div class="comment-emoji-panel__head">
            <strong>选择表情</strong>
            <button type="button" class="comment-emoji-panel__close" id="js-comment-emoji-close" aria-label="关闭表情面板">×</button>
        </div>
        <?php if (!empty($commentEmojis)): ?>
        <div class="comment-emoji-grid">
            <?php foreach ($commentEmojis as $emoji): ?>
                <?php
                    $emojiToken = (string)($emoji['token'] ?? '');
                    $emojiKey = (string)($emoji['key'] ?? ($emoji['code'] ?? ''));
                    $emojiUrl = (string)($emoji['url'] ?? ($emoji['src'] ?? ''));
                    $emojiLabel = (string)($emoji['label'] ?? ($emoji['name'] ?? $emojiKey));
                    if ($emojiToken === '' && $emojiKey !== '') {
                        $emojiToken = '[em:' . $emojiKey . ']';
                    }
                    if ($emojiUrl === '') {
                        continue;
                    }
                ?>
                <button type="button" class="comment-emoji-item js-comment-emoji-item" data-token="<?=e($emojiToken)?>" data-key="<?=e($emojiKey)?>" data-url="<?=e($emojiUrl)?>" title="<?=e($emojiLabel)?>" aria-label="<?=e($emojiLabel)?>">
                    <img src="<?=e($emojiUrl)?>" alt="<?=e($emojiLabel)?>" loading="lazy">
                    <span><?=e($emojiLabel)?></span>
                </button>
            <?php endforeach; ?>
        </div>
        <?php else: ?>
        <div class="comment-emoji-empty">未读取到表情，请检查 assets/emoji 目录。</div>
        <?php endif; ?>
    </div>
</div>

<div class="comment-form-actions-bar">
                <?php if (!is_admin()): ?>
                <div class="captcha-area">
                    <div class="captcha-group">
                        <img src="" alt="验证码" class="captcha-img" id="js-captcha-img" title="点击刷新">
                        <input type="hidden" name="captcha_token" id="js-captcha-token" value="">
                        <input type="text" name="captcha" class="sketch-input captcha-input" placeholder="验证码" required autocomplete="off" inputmode="latin" maxlength="4">
                    </div>
                    <div class="disclaimer-icon">
                        <span class="disclaimer-symbol">i</span>
                        <div class="disclaimer-popup">
                            文明发言，理性交流。<br>您的通信标识将被记录。
                        </div>
                    </div>
                </div>
                <?php else: ?>
                    <div></div>
                <?php endif; ?>
                <button type="submit" class="sketch-btn">发送</button>
            </div>
        </form>

    <?php else: ?>
        
        <div class="comment-closed-notice">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="opacity:0.6"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path><line x1="8" y1="11" x2="16" y2="11"></line></svg>
            <span>本篇文章评论功能已关闭</span>
        </div>

    <?php endif; ?>

    <?php if (!empty($threadedComments)): ?>
    <div class="comment-list">
      
        <?php $commentTotal = (int)($commentPager['total_comments'] ?? (function_exists('limhy_comment_total_count') ? limhy_comment_total_count((int)($post['id'] ?? 0)) : count($comments))); ?>
        <h3 class="comments-title" style="margin-top: 10px; margin-bottom: 12px; font-size: 16px; border: none; padding-bottom: 0;">
            已有 <?=$commentTotal?> 条评论
        </h3>

        <?php foreach ($threadedComments as $parent): ?>
            <div class="comment-item <?=!empty($parent['is_featured']) ? 'is-featured' : ''?>" id="comment-<?=$parent['id']?>">
                <div class="comment-body">
                    <div class="comment-avatar">
                        <img src="<?=e(get_avatar_url($parent['email'], $parent['author']))?>" alt="avatar" class="js-avatar-interactive" style="cursor:pointer" loading="lazy" decoding="async" data-email="<?=e($parent['email'])?>" data-author="<?=e($parent['author'])?>" data-ip="<?=e(get_ip_location($parent['ip']))?>" data-url="<?=e($parent['url'])?>">
                    </div>
                    <div class="comment-content-area">
                        <div class="comment-meta">
                            <div class="comment-info">
                                <div class="comment-author">
                                    <?php if($parent['url']): ?><a href="<?=e($parent['url'])?>" target="_blank" rel="nofollow"><?=e($parent['author'])?></a><?php else: ?><?=e($parent['author'])?><?php endif; ?>
                                    
                                    <?php if($parent['is_admin']): ?>
                                        <span class="admin-badge admin-badge--author" style="margin-left:4px">博主</span>
                                    <?php endif; ?>

                                    <?php if(!empty($parent['is_featured'])): ?>
                                        <span class="featured-badge" title="博主精选评论">
                                            <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="margin-right:2px;margin-bottom:1px"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-5.82 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>精选
                                        </span>
                                    <?php endif; ?>
                                </div>
                                <div class="comment-time"><?=time_ago($parent['created_at'])?></div>
                            </div>
                            
                            <?php if ($isCommentOpen): ?>
                                <button class="comment-reply-link js-reply-btn" data-id="<?=$parent['id']?>" data-author="<?=e($parent['author'])?>">回复</button>
                            <?php endif; ?>
                        </div>
                        <div class="comment-text"><?=limhy_render_comment_content($parent['content'])?><?php if($parent['status']==='pending'):?> <span class="comment-pending-badge">待审核</span><?php endif; ?></div>
                    </div>
                </div>
                <?php if (!empty($parent['children'])): ?>
                <div class="comment-children">
                    <?php foreach ($parent['children'] as $child): ?>
                        <div class="comment-item" id="comment-<?=$child['id']?>">
                            <div class="comment-body">
                                <div class="comment-avatar">
                                    <img src="<?=e(get_avatar_url($child['email'], $child['author']))?>" alt="avatar" class="js-avatar-interactive" style="cursor:pointer" loading="lazy" decoding="async" data-email="<?=e($child['email'])?>" data-author="<?=e($child['author'])?>" data-ip="<?=e(get_ip_location($child['ip']))?>" data-url="<?=e($child['url'])?>">
                                </div>
                                <div class="comment-content-area">
                                    <div class="comment-meta">
                                        <div class="comment-info">
                                            <div class="comment-author">
                                                <?php if($child['url']): ?><a href="<?=e($child['url'])?>" target="_blank" rel="nofollow"><?=e($child['author'])?></a><?php else: ?><?=e($child['author'])?><?php endif; ?>
                                                
                                                <?php if($child['is_admin']): ?>
                                                    <span class="admin-badge admin-badge--author" style="margin-left:4px">博主</span>
                                                <?php endif; ?>

                                                <?php if(!empty($child['is_featured'])): ?>
                                                    <span class="featured-badge" title="博主精选评论">
                                                        <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" style="margin-right:2px;margin-bottom:1px"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-5.82 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>精选
                                                    </span>
                                                <?php endif; ?>
                                            </div>
                                            <div class="comment-time"><?=time_ago($child['created_at'])?></div>
                                        </div>
                                        <?php if ($isCommentOpen): ?>
                                            <button class="comment-reply-link js-reply-btn" data-id="<?=$child['id']?>" data-author="<?=e($child['author'])?>">回复</button>
                                        <?php endif; ?>
                                    </div>
                                    <div class="comment-text"><?php if(isset($child['reply_to_author'])&&$child['reply_to_author']!==$parent['author']):?><span style="color:#999">@<?=e($child['reply_to_author'])?> </span><?php endif; ?><?=limhy_render_comment_content($child['content'])?><?php if($child['status']==='pending'):?> <span class="comment-pending-badge">待审核</span><?php endif; ?></div>
                                </div>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
            </div>
            <hr style="border:0; border-top:1px solid #f5f5f5; margin:13px 0;">
        <?php endforeach; ?>
    </div>
    <?php endif; ?>
        <?php
    $commentPager = $commentPager ?? null;
    if (is_array($commentPager) && !empty($commentPager['total_pages']) && (int)$commentPager['total_pages'] > 1):
        $route = (($post['type'] ?? 'post') === 'page' ? 'page/' : 'post/') . ($post['slug'] ?? '');
    ?>
        <nav class="pagination" aria-label="评论分页" style="margin-top:18px;">
            <?php if (!empty($commentPager['has_prev'])): ?>
                <a class="pagination__item" href="<?=e(pagination_url((int)$commentPager['page'] - 1, $route, ['cpage' => (int)$commentPager['page'] - 1]))?>#comments">上一页</a>
            <?php endif; ?>

            <?php for ($cp = 1; $cp <= (int)$commentPager['total_pages']; $cp++): ?>
                <a class="pagination__item <?=$cp === (int)$commentPager['page'] ? 'is-active' : ''?>" href="<?=e(pagination_url($cp, $route, ['cpage' => $cp]))?>#comments"><?=$cp?></a>
            <?php endfor; ?>

            <?php if (!empty($commentPager['has_next'])): ?>
                <a class="pagination__item" href="<?=e(pagination_url((int)$commentPager['page'] + 1, $route, ['cpage' => (int)$commentPager['page'] + 1]))?>#comments">下一页</a>
            <?php endif; ?>
        </nav>
    <?php endif; ?>
</section>
