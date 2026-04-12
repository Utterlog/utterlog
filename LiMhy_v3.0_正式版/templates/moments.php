<?php declare(strict_types=1); ?>
<div class="moments-container">

    <!-- Flash 通知预留区 -->
    <?php if ($msg = get_flash('error')): ?>
        <div style="background:#fee2e2;color:#991b1b;padding:10px;border-radius:6px;margin-bottom:20px;font-weight:bold;border:2px solid #000;">
            <?php echo is_array($msg) ? implode('<br>', $msg) : htmlspecialchars((string)$msg); ?>
        </div>
    <?php endif; ?>
    <?php if ($msg = get_flash('success')): ?>
        <div style="background:#dcfce7;color:#166534;padding:10px;border-radius:6px;margin-bottom:20px;font-weight:bold;border:2px solid #000;">
            <?php echo is_array($msg) ? implode('<br>', $msg) : htmlspecialchars((string)$msg); ?>
        </div>
    <?php endif; ?>

    <!-- 聚合推荐模块 -->
    <div class="m-title-row">
        <h2 class="m-main-title">聚合推荐</h2>
    </div>
    <div class="agg-card-wrapper">
        <img src="/assets/img/dt.png" class="agg-banner-img" alt="banner">
        <div class="agg-card">
            <div id="js-agg-list" class="agg-list">
                <span style="font-size:13px;font-weight:700;color:#999;">正在生成数据排版...</span>
            </div>
            <button id="js-agg-refresh" class="agg-refresh-btn" style="display:none;">换一批</button>
        </div>
    </div>

    <!-- 我的动态模块 -->
    <div class="m-title-row">
        <h2 class="m-main-title">我的动态</h2>
    </div>

    <?php if (is_admin()): ?>
    <form action="/index.php?r=api/moments-publish" method="POST" class="m-publish-box" id="js-moments-form">
        <input type="hidden" name="images" id="js-images-input" value="[]">
        <textarea name="content" class="m-pub-textarea" placeholder="今天有什么新鲜事..."></textarea>
        <div class="m-img-preview" id="js-img-preview"></div>
        <div class="m-pub-tools">
            <button type="button" class="sketch-btn" id="js-upload-trigger" style="padding: 6px 12px; font-size: 12px;">
                配图
            </button>
            <input type="file" id="js-moments-file" accept="image/*" multiple hidden>
            <button type="submit" class="sketch-btn" id="js-pub-btn">发送动态</button>
        </div>
    </form>
    <?php endif; ?>

    <div class="moments-list" id="js-moments-list">
        <?php if (empty($moments)): ?>
            <div style="text-align:center; padding: 40px; font-weight:800; color:#ccc;">这里还是一片荒芜...</div>
        <?php else: ?>
            <?php foreach ($moments as $m): ?>
            <div class="moment-item">
                <div class="moment-header">
                    <img src="<?php echo htmlspecialchars($adminAvatar ?? ''); ?>" class="moment-avatar">
                    <div class="moment-meta">
                        <span class="moment-author"><?php echo htmlspecialchars($adminName ?? ''); ?></span>
                        <span class="moment-time"><?php echo time_ago($m['created_at']); ?></span>
                    </div>
                </div>
                
                <?php if(!empty($m['content'])): ?>
                <div class="moment-content prose">
                    <?php echo nl2br(htmlspecialchars($m['content'])); ?>
                </div>
                <?php endif; ?>
                
                <?php 
                $images = json_decode($m['images'] ?: '[]', true); 
                if (!empty($images) && is_array($images)): 
                    $imgCount = count($images);
                ?>
                <div class="sketch-gallery" data-count="<?php echo $imgCount > 4 ? 0 : $imgCount; ?>">
                    <?php foreach ($images as $img): ?>
                        <img src="<?php echo htmlspecialchars($img); ?>" loading="lazy" alt="Moment Image">
                    <?php endforeach; ?>
                </div>
                <?php endif; ?>
            </div>
            <?php endforeach; ?>
        <?php endif; ?>
    </div>
    
    <?php if ($pager['total_pages'] > 1): ?>
    <div class="post-nav" style="margin-top: 20px;">
        <?php if ($pager['has_prev']): ?>
            <a href="?page=<?php echo $pager['page'] - 1; ?>" class="post-nav__link">
                <div class="post-nav__label">PREV</div><div class="post-nav__title">上一页</div>
            </a>
        <?php else: ?><div class="post-nav__placeholder"></div><?php endif; ?>
        
        <?php if ($pager['has_next']): ?>
            <a href="?page=<?php echo $pager['page'] + 1; ?>" class="post-nav__link post-nav__link--next">
                <div class="post-nav__label">NEXT</div><div class="post-nav__title">下一页</div>
            </a>
        <?php else: ?><div class="post-nav__placeholder"></div><?php endif; ?>
    </div>
    <?php endif; ?>
</div>

<script>
document.addEventListener('DOMContentLoaded', function() {
    
    try {
        var feedsPool = <?php echo json_encode($agg_feeds ?? [], JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_HEX_AMP) ?: '[]'; ?>;
        var aggList = document.getElementById('js-agg-list');
        var aggRefresh = document.getElementById('js-agg-refresh');
        var currentIndex = 0;
        var PAGE_SIZE = 8; 

        if (aggList) {
            if (feedsPool && Array.isArray(feedsPool) && feedsPool.length > 0) {
                
                function renderAggSlice() {
                    if (feedsPool.length === 0) return;
                    var slice = [];
                    var loopLimit = Math.min(PAGE_SIZE, feedsPool.length);
                    
                    for (var i = 0; i < loopLimit; i++) {
                        if (feedsPool[currentIndex]) {
                            slice.push(feedsPool[currentIndex]);
                        }
                        currentIndex++;
                        if (currentIndex >= feedsPool.length) currentIndex = 0; 
                    }
                    
                    var html = '';
                    slice.forEach(function(item) {
                        if (!item) return;
                        var title = item.title ? item.title.replace(/</g, "&lt;").replace(/>/g, "&gt;") : '无标题';
                        var link = item.link || '#';
                        var newTag = item.is_new ? '<span class="agg-new-tag">新</span>' : '';
                        
                        html += '<a href="' + link + '" target="_blank" rel="nofollow" class="agg-item">' +
                                    '<span class="agg-item-prefix">#</span>' +
                                    '<span class="agg-item-title">' + title + '</span>' +
                                    newTag +
                                '</a>';
                    });
                    
                    aggList.style.opacity = '0';
                    setTimeout(function() {
                        aggList.innerHTML = html;
                        aggList.style.transition = 'opacity 0.2s';
                        aggList.style.opacity = '1';
                    }, 150);
                }

                renderAggSlice();
                
                if (feedsPool.length > PAGE_SIZE && aggRefresh) {
                    aggRefresh.style.display = 'block';
                    aggRefresh.addEventListener('click', renderAggSlice);
                }
                
            } else {
                aggList.innerHTML = '<span style="color:#e74c3c;font-weight:700;">远端基站通讯异常，暂无推荐内容</span>';
            }
        }
    } catch (e) {
        console.error("Aggregation module crash trace:", e);
        var fallbackEl = document.getElementById('js-agg-list');
        if (fallbackEl) {
            fallbackEl.innerHTML = '<span style="color:#e74c3c;font-weight:700;">组件引擎渲染受阻，已安全隔离</span>';
        }
    }
    
    // --- 以下为图片上传引擎 ---
    const OSS_TOKEN_URL = "/index.php?r=api/oss-token";
    const REMOTE_SAVE_URL = "/index.php?r=api/upload-save-remote";
    const REMOTE_SAVE_TOKEN = <?= json_encode(csrf_token()) ?>;
    const uploadTrigger = document.getElementById('js-upload-trigger');
    const fileInput = document.getElementById('js-moments-file');
    const previewBox = document.getElementById('js-img-preview');
    const imagesInput = document.getElementById('js-images-input');
    const pubBtn = document.getElementById('js-pub-btn');
    let uploadedImages = [];

    if (uploadTrigger && fileInput && pubBtn) {
        uploadTrigger.addEventListener('click', () => fileInput.click());
        
        const checkWebP = () => document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0;
        
        const compressImage = (file) => {
            return new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = (e) => {
                    const img = new Image();
                    img.onload = () => {
                        const canvas = document.createElement('canvas');
                        let w = img.width, h = img.height, max = 1600; 
                        if (w > max || h > max) { if (w > h) { h *= max/w; w=max; } else { w *= max/h; h=max; } }
                        canvas.width = w; canvas.height = h;
                        const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                        canvas.toBlob(resolve, checkWebP() ? 'image/webp' : 'image/jpeg', 0.85); 
                    }
                    img.src = e.target.result;
                };
                reader.readAsDataURL(file);
            });
        };

        fileInput.addEventListener('change', async function() {
            const files = this.files;
            if (!files.length) return;
            
            pubBtn.disabled = true;
            pubBtn.textContent = '压缩上传中...';
            
            for (let i = 0; i < files.length; i++) {
                try {
                    const blob = await compressImage(files[i]);
                    const ext = checkWebP() ? 'webp' : 'jpg';
                    const mime = ext === 'webp' ? 'image/webp' : 'image/jpeg';
                    
                    const fdToken = new FormData();
                    fdToken.append('ext', ext);
                    
                    const tokenReq = await fetch(OSS_TOKEN_URL, { method: 'POST', body: fdToken });
                    if (!tokenReq.ok) throw new Error('API 访问失效(Token)');
                    
                    const tRes = await tokenReq.json();
                    if (!tRes.ok) throw new Error('凭证获取失败');
                    
                    let finalUrl = '';

                    if (tRes.type === 'custom_api') {
                        const fdCustom = new FormData();
                        fdCustom.append('file', blob, files[i].name);
                        if (tRes.data.secret) fdCustom.append('secret', tRes.data.secret);
                        
                        const customReq = await fetch(tRes.data.upload_url, { method: 'POST', body: fdCustom });
                        if (!customReq.ok) throw new Error('私人图床接口无响应或跨域被拦截');
                        
                        const customRes = await customReq.json();
                        if (customRes.status !== 'success') throw new Error(customRes.message || '图床返回错误状态');
                        
                        finalUrl = customRes.url;
                        
                    } else if (tRes.type === 's4' || tRes.type === 's3' || tRes.type === 'upyun') {
                        const uploadUrl = tRes.data.upload_url || tRes.upload_url;
                        const s4Req = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': mime } });
                        if (!s4Req.ok) throw new Error('S3兼容引擎拒绝写入');
                        finalUrl = tRes.data.url || tRes.url;
                        
                    } else {
                        const fdOSS = new FormData();
                        fdOSS.append('key', tRes.data.key);
                        fdOSS.append('OSSAccessKeyId', tRes.data.accessid);
                        fdOSS.append('policy', tRes.data.policy);
                        fdOSS.append('Signature', tRes.data.signature);
                        fdOSS.append('success_action_status', '200');
                        fdOSS.append('file', blob, `file.${ext}`);
                        
                        const ossReq = await fetch(tRes.data.host, { method: 'POST', body: fdOSS });
                        if (!ossReq.ok) throw new Error('阿里云 OSS 拒绝写入');
                        finalUrl = tRes.data.url || tRes.url;
                    }

                    if (!finalUrl || finalUrl === 'undefined') throw new Error("网关外链解析异常");

                    const fdSave = new FormData();
                    fdSave.append('_token', REMOTE_SAVE_TOKEN);
                    fdSave.append('file_url', finalUrl);
                    fdSave.append('orig_name', files[i].name || ('moment.' + ext));
                    fdSave.append('file_size', String(blob.size || files[i].size || 0));
                    fdSave.append('mime_type', mime);
                    const saveReq = await fetch(REMOTE_SAVE_URL, { method: 'POST', body: fdSave, credentials: 'same-origin' });
                    if (!saveReq.ok) throw new Error('远端登记接口无响应');
                    const saveRes = await saveReq.json();
                    if (!saveRes.ok) throw new Error(saveRes.error || '远端图片登记失败');
                    
                    uploadedImages.push(finalUrl);
                    const imgEl = document.createElement('img');
                    imgEl.src = finalUrl;
                    imgEl.className = 'm-img-thumb';
                    if (previewBox) previewBox.appendChild(imgEl);
                    
                } catch (e) {
                    console.error("上传错误: ", e);
                    alert('图片上传失败: ' + e.message);
                }
            }
            
            if (imagesInput) imagesInput.value = JSON.stringify(uploadedImages);
            pubBtn.disabled = false;
            pubBtn.textContent = '发送动态';
            fileInput.value = '';
        });
    }
});
</script>
