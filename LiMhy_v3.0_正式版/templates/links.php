<?php
/**
 * LiMhy - 友情链接视图
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    提供卡片式的友链展示，并集成底部的无感自助抽屉申请通道
 * @require array $links 友情链接数据集
 */
?>
<div class="container">
    <nav class="breadcrumb">
        <a href="<?=url()?>">首页</a>
        &gt; <span>友情链接</span>
    </nav>

    <article class="post-detail">
        <header class="post-detail__header">
            <h1 class="post-detail__title">友情链接</h1>
            <div class="post-detail__meta">
                保持热爱，奔赴山海
            </div>
        </header>

        <div class="post-detail__content">
            <?php if (empty($links)): ?>
                <div class="empty-state" style="text-align:center;padding:40px;color:#999">暂无链接</div>
            <?php else: ?>
                <div class="links-grid">
                <?php foreach ($links as $link): ?>
                    <a href="<?=e($link['url'])?>" target="_blank" rel="noopener" class="link-card" 
                       data-url="<?=e($link['url'])?>">
                        
                        <div class="link-status">检测中...</div>

                        <?php if ($link['logo']): ?>
                            <img src="<?=e($link['logo'])?>" alt="" class="link-avatar" loading="lazy">
                        <?php else: ?>
                            <div class="link-avatar" style="display:flex;align-items:center;justify-content:center;font-weight:900;font-size:24px;color:#aaa">
                                <?=e(mb_substr($link['name'], 0, 1))?>
                            </div>
                        <?php endif; ?>

                        <div class="link-info">
                            <div class="link-name"><?=e($link['name'])?></div>
                            <?php if ($link['desc']): ?>
                                <div class="link-desc"><?=e($link['desc'])?></div>
                            <?php endif; ?>
                        </div>
                    </a>
                <?php endforeach; ?>
                </div>
            <?php endif; ?>
            
<?php
$friendSiteName = isset($friendSiteName) && trim((string)$friendSiteName) !== '' ? (string)$friendSiteName : (defined('SITE_NAME') ? SITE_NAME : '本站');
$friendSiteUrl = isset($friendSiteUrl) && trim((string)$friendSiteUrl) !== '' ? (string)$friendSiteUrl : (defined('SITE_URL') ? SITE_URL : '/');
$friendSiteDescText = trim(strip_tags((string)($friendSiteDesc ?? '')));
if ($friendSiteDescText === '') {
    $friendSiteDescText = '欢迎与你交换站点名片，保持友好互链。';
}

$friendApplyHtmlSafe = limhy_safe_custom_html((string)($friendApplyHtml ?? ''));
if ($friendApplyHtmlSafe === '') {
    $friendApplyHtmlSafe = '<p>申请前请确保贵站可正常访问、内容合规，并已添加本站友情链接。</p>';
}
$friendSiteAvatarFinal = trim((string)($friendSiteAvatar ?? ''));
$friendSiteRssFinal = trim((string)($friendSiteRss ?? ''));
$friendSiteInitial = mb_substr(trim($friendSiteName), 0, 1);
?>
            <div style="margin-top:60px; padding-top:40px; border-top:2px dashed #eee; text-align:center;">
                <h3 style="font-size:20px; font-weight:900; margin-bottom:10px;">想要交换链接？</h3>
                <p style="color:#666; font-size:14px; margin-bottom:20px;">只要您的网站包含有价值的内容且能稳定访问，即可在此提交申请。<br>审核通过后系统会自动展示并进行双向连通性监控。</p>
                <button id="js-open-apply-drawer" class="sketch-btn" style="font-size:16px; padding:12px 36px; border-radius:8px;">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px; margin-right:6px;"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
                    自助申请通道
                </button>
            </div>

            <div class="link-bottom-modules">
                <section class="link-bottom-card">
                    <div class="link-bottom-card__head">
                        <div>
                            <h3 class="link-bottom-card__title">本站信息</h3>
                            <div style="margin-top:4px;color:var(--text-sec);font-size:13px;">复制下方文本可直接用于贵站友链申请</div>
                        </div>
                    </div>
                    <div class="link-site-sheet">
                        <div class="link-site-sheet__row"><span class="link-site-sheet__label">站点名称：</span><span class="link-site-sheet__value" id="js-link-copy-name"><?= e($friendSiteName) ?></span><button type="button" class="link-site-sheet__copy" data-copy-target="js-link-copy-name">复制</button></div>
                        <div class="link-site-sheet__row"><span class="link-site-sheet__label">站点域名：</span><span class="link-site-sheet__value" id="js-link-copy-url"><?= e($friendSiteUrl) ?></span><button type="button" class="link-site-sheet__copy" data-copy-target="js-link-copy-url">复制</button></div>
                        <div class="link-site-sheet__row"><span class="link-site-sheet__label">站点描述：</span><span class="link-site-sheet__value" id="js-link-copy-desc"><?= e($friendSiteDescText) ?></span><button type="button" class="link-site-sheet__copy" data-copy-target="js-link-copy-desc">复制</button></div>
                        <div class="link-site-sheet__row"><span class="link-site-sheet__label">头像地址：</span><span class="link-site-sheet__value" id="js-link-copy-avatar"><?= e($friendSiteAvatarFinal !== '' ? $friendSiteAvatarFinal : '未配置') ?></span><button type="button" class="link-site-sheet__copy" data-copy-target="js-link-copy-avatar">复制</button></div>
                        <div class="link-site-sheet__row"><span class="link-site-sheet__label">RSS 地址：</span><span class="link-site-sheet__value" id="js-link-copy-rss"><?= e($friendSiteRssFinal !== '' ? $friendSiteRssFinal : '未配置') ?></span><button type="button" class="link-site-sheet__copy" data-copy-target="js-link-copy-rss">复制</button></div>
                    </div>
                </section>
                <section class="link-bottom-card">
                    <div class="link-bottom-card__head">
                        <div>
                            <h3 class="link-bottom-card__title">申请说明</h3>
                            <div style="margin-top:4px;color:var(--text-sec);font-size:13px;">提交后系统会邮件通知站长审核</div>
                        </div>
                    </div>
                    <div class="link-bottom-card__content"><?= $friendApplyHtmlSafe ?></div>
                </section>
            </div>
        </div>
    </article>
</div>

<style>
.link-drawer-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 10000; opacity: 0; visibility: hidden; transition: 0.3s; backdrop-filter: blur(2px); }
.link-drawer-overlay.is-active { opacity: 1; visibility: visible; }
.link-drawer { position: fixed; bottom: 0; left: 0; width: 100%; background: #fff; border-radius: 24px 24px 0 0; z-index: 10001; transform: translateY(100%); transition: transform 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); padding: 30px 24px; box-shadow: 0 -10px 40px rgba(0,0,0,0.1); max-height: 85vh; overflow-y: auto; }
.link-drawer.is-active { transform: translateY(0); }
@media(min-width: 600px) { .link-drawer { width: 440px; left: 50%; margin-left: -220px; } }
.drawer-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
.drawer-title { font-size: 20px; font-weight: 900; }
.drawer-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #666; transition: color 0.2s; }
.drawer-close:hover { color: #f00; }
.drawer-form-group { margin-bottom: 16px; }
.drawer-label { display: block; font-size: 13px; font-weight: 800; margin-bottom: 6px; color: #333; }
.drawer-input { width: 100%; padding: 12px; font-size: 14px; font-weight: 700; border: 2px solid #000; border-radius: 8px; outline: none; transition: box-shadow 0.2s; box-sizing: border-box; }
.drawer-input:focus { box-shadow: 3px 3px 0 rgba(0,0,0,0.15); }
.drawer-input::placeholder { color: #aaa; font-weight: 500; }

.drawer-submit-btn { 
    width: 100%; 
    margin: 10px 0 0 0 !important;
    font-size: 16px; 
    font-weight: 900; 
    padding: 14px; 
    border-radius: 8px; 
    background: #fff; 
    color: #000; 
    border: 2px solid #000; 
    cursor: pointer; 
    box-shadow: 3px 3px 0 #000; 
    transition: transform 0.1s, box-shadow 0.1s; 
    display: block; 
    box-sizing: border-box;
}
.drawer-submit-btn:active { transform: translate(2px, 2px); box-shadow: 1px 1px 0 #000; }
.drawer-submit-btn:hover { background: #000; color: #fff; }

.link-bottom-modules{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;margin:28px 0 0;}
.link-bottom-card{border:1.5px solid #111827;border-radius:18px;background:#fff;padding:20px;box-shadow:none;}
.link-bottom-card__head{display:flex;align-items:center;gap:14px;margin-bottom:14px;}
.link-bottom-card__avatar{width:60px;height:60px;border-radius:18px;overflow:hidden;border:1.5px solid #111827;background:#f8fafc;display:flex;align-items:center;justify-content:center;font-size:24px;font-weight:900;}
.link-bottom-card__avatar img{width:100%;height:100%;object-fit:cover;display:block;}
.link-bottom-card__title{font-size:20px;font-weight:900;color:#0f172a;margin:0;}
.link-bottom-card__meta{display:flex;flex-wrap:wrap;gap:10px;margin-top:10px;}
.link-bottom-card__meta a{display:inline-flex;align-items:center;gap:6px;padding:8px 12px;border:1px solid #111827;border-radius:999px;text-decoration:none;color:#111827;font-weight:800;background:#fff;}
.link-bottom-card__content{color:#475569;line-height:1.9;font-size:15px;}
.link-bottom-card__content p:first-child{margin-top:0;}
.link-bottom-card__content p:last-child{margin-bottom:0;}
[data-theme="dark"] .link-bottom-card{background:#0f172a;border-color:#475569;}
[data-theme="dark"] .link-bottom-card__title{color:#f8fafc;}
[data-theme="dark"] .link-bottom-card__content{color:#cbd5e1;}
[data-theme="dark"] .link-bottom-card__avatar{background:#111827;border-color:#475569;color:#f8fafc;}
[data-theme="dark"] .link-bottom-card__meta a{background:#111827;color:#f8fafc;border-color:#475569;}
@media (max-width: 820px){.link-bottom-modules{grid-template-columns:1fr;}}

.link-site-sheet{display:flex;flex-direction:column;gap:10px;}
.link-site-sheet__row{display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:start;padding:12px 0;border-bottom:1px dashed rgba(15,23,42,.14);}
.link-site-sheet__row:last-child{border-bottom:0;padding-bottom:0;}
.link-site-sheet__label{font-weight:900;color:var(--text-main);white-space:nowrap;}
.link-site-sheet__value{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;color:var(--text-sec);word-break:break-all;line-height:1.8;}
.link-site-sheet__copy{appearance:none;-webkit-appearance:none;border:1px solid #111;background:#fff;color:#111;padding:0 12px;height:34px;border-radius:999px;font-size:12px;font-weight:800;cursor:pointer;}
.link-site-sheet__copy:hover{transform:translateY(-1px);}
[data-theme="dark"] .link-site-sheet__row{border-bottom-color:rgba(148,163,184,.18);}
[data-theme="dark"] .link-site-sheet__label{color:#f8fafc;}
[data-theme="dark"] .link-site-sheet__value{color:#cbd5e1;}
[data-theme="dark"] .link-site-sheet__copy{background:#0f172a;border-color:#475569;color:#f8fafc;}
</style>

<div class="link-drawer-overlay" id="js-apply-overlay"></div>
<div class="link-drawer" id="js-apply-drawer">
    <div class="drawer-header">
        <div class="drawer-title">投递站点名片</div>
        <button class="drawer-close" id="js-close-apply-drawer">&times;</button>
    </div>
    
    <form id="js-apply-form" action="<?=url('api/apply-link')?>">
        <div class="drawer-form-group">
            <label class="drawer-label">网站名称 *</label>
            <input type="text" name="name" class="drawer-input" placeholder="例如: LiMhy" required>
        </div>
        <div class="drawer-form-group">
            <label class="drawer-label">网站链接 (URL) *</label>
            <input type="url" name="url" class="drawer-input" placeholder="需包含 https://" required>
        </div>
        <div class="drawer-form-group">
            <label class="drawer-label">Logo 或头像图片链接</label>
            <input type="url" name="avatar" class="drawer-input" placeholder="留空则自动生成首字母图标">
        </div>
        <div class="drawer-form-group">
            <label class="drawer-label">一句话简短描述</label>
            <input type="text" name="desc" class="drawer-input" placeholder="例如: 极致性能的纯原生博客">
        </div>
        
        <div class="drawer-form-group" style="margin-top: 24px;">
            <label class="drawer-label">安全校验 *</label>
            <div style="display: flex; gap: 10px; align-items: stretch;">
                <input type="hidden" name="captcha_token" id="js-drawer-captcha-token" value="">
                <input type="text" name="captcha" class="drawer-input" placeholder="输入右侧字符" required maxlength="4" inputmode="latin" style="flex:1;">
                <img src="" id="js-drawer-captcha" style="height: 46px; border: 2px solid #000; border-radius: 8px; cursor: pointer; object-fit: cover; min-width: 116px;" title="点击刷新">
            </div>
        </div>
        
        <!-- ★ 替换为隔离保护后的按钮 -->
        <button type="submit" class="drawer-submit-btn">提交审核</button>
    </form>
</div>

<script>
;(function() {
    var cards = document.querySelectorAll('.link-card');
    function checkStatus(card) {
        var url = card.getAttribute('data-url');
        var statusBadge = card.querySelector('.link-status');
        if (!url || !statusBadge) return;
        var formData = new FormData();
        formData.append('url', url);
        fetch('<?=url("api/check-link")?>', { method: 'POST', body: formData })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (data.ok && data.online) { statusBadge.textContent = '在线'; statusBadge.classList.add('is-online'); } 
            else { statusBadge.textContent = '掉线'; statusBadge.classList.add('is-offline'); }
        })
        .catch(function() { statusBadge.textContent = '掉线'; statusBadge.classList.add('is-offline'); });
    }
    setTimeout(function() { cards.forEach(function(card, index) { setTimeout(function() { checkStatus(card); }, index * 200); }); }, 500);

    var btnOpen = document.getElementById('js-open-apply-drawer');
    var btnClose = document.getElementById('js-close-apply-drawer');
    var overlay = document.getElementById('js-apply-overlay');
    var drawer = document.getElementById('js-apply-drawer');
    var form = document.getElementById('js-apply-form');
    var captchaImg = document.getElementById('js-drawer-captcha');
    var captchaToken = document.getElementById('js-drawer-captcha-token');

    function refreshCaptcha() {
        if (!captchaImg) return;
        fetch('<?=url("api/captcha/new")?>?form=link', { headers: { 'X-Requested-With': 'XMLHttpRequest' } })
        .then(function(res) { return res.json(); })
        .then(function(data) {
            if (!data.ok) {
                showToast(data.error || '验证码加载失败', true);
                return;
            }
            captchaImg.src = data.image;
            if (captchaToken) captchaToken.value = data.token || '';
            var input = form ? form.querySelector('input[name="captcha"]') : null;
            if (input) input.value = '';
        })
        .catch(function() {
            showToast('验证码加载失败', true);
        });
    }
    if (captchaImg) captchaImg.addEventListener('click', refreshCaptcha);

    function openDrawer() { overlay.classList.add('is-active'); drawer.classList.add('is-active'); document.body.style.overflow = 'hidden'; refreshCaptcha(); }
    function closeDrawer() { overlay.classList.remove('is-active'); drawer.classList.remove('is-active'); document.body.style.overflow = ''; }

    btnOpen.addEventListener('click', openDrawer);
    btnClose.addEventListener('click', closeDrawer);
    overlay.addEventListener('click', closeDrawer);

    function showToast(msg, isErr) {
        var toast = document.createElement('div');
        toast.className = 'sketch-toast is-visible ' + (isErr ? 'is-error' : 'is-success');
        toast.innerHTML = '<span>' + msg + '</span>';
        document.body.appendChild(toast);
        setTimeout(function() { toast.classList.remove('is-visible'); setTimeout(function() { toast.remove(); }, 300); }, 3000);
    }


    document.querySelectorAll('[data-copy-target]').forEach(function(btn){
        btn.addEventListener('click', function(){
            var target = document.getElementById(btn.getAttribute('data-copy-target') || '');
            if (!target || !navigator.clipboard) return;
            var text = (target.textContent || target.innerText || '').trim();
            navigator.clipboard.writeText(text);
            var old = btn.textContent; btn.textContent = '已复制';
            setTimeout(function(){ btn.textContent = old; }, 1200);
        });
    });

    form.addEventListener('submit', function(e) {
        e.preventDefault();
        var submitBtn = form.querySelector('button[type="submit"]');
        var originalText = submitBtn.textContent;
        submitBtn.disabled = true;
        submitBtn.textContent = '网络传输中...';

        fetch(form.action, {
            method: 'POST',
            body: new FormData(form),
            headers: { 'X-Requested-With': 'XMLHttpRequest' }
        })
        .then(function(res) {
            return res.text().then(function(raw) {
                var text = (raw || '').trim();
                var data = null;
                if (text) {
                    try { data = JSON.parse(text); } catch (e) {
                        var match = text.match(/\{[\s\S]*\}$/);
                        if (match) {
                            try { data = JSON.parse(match[0]); } catch (e2) {}
                        }
                    }
                }
                if (!data) {
                    throw new Error('invalid_json');
                }
                if (!res.ok) {
                    throw new Error(data.error || 'request_failed');
                }
                return data;
            });
        })
        .then(function(data) {
            if (data.ok) {
                showToast('申请成功，等待站长审核', false);
                form.reset();
                closeDrawer();
            } else {
                showToast(data.error || '发生未知错误', true);
                if (data.error && data.error.indexOf('验证码') !== -1) refreshCaptcha();
            }
        })
        .catch(function(err) {
            var msg = (err && err.message && err.message !== 'invalid_json' && err.message !== 'request_failed')
                ? err.message
                : '服务器连接断开，请重试';
            showToast(msg, true);
        })
        .finally(function() { submitBtn.disabled = false; submitBtn.textContent = originalText; });
    });

})();
</script>
