<?php
/**
 * LiMhy - 融合媒体资源网关 (支持本地/云端OSS/自定义图床API驱动)
 */
require_once __DIR__ . '/../index.php';
require_once __DIR__ . '/../core/upload.php';

$p = prefix();
$currentNav = 'uploads';
$pageTitle = '附件管理';

// 1. 探针：检测云存储环境是否已激活
$ossEnabled = limhy_storage_oss_enabled();

$uploadDir  = ROOT . '/uploads/';
$uploadUrl  = SITE_URL . '/uploads/';
$maxSize    = 10 * 1024 * 1024; // 10MB
$allowedExt = limhy_upload_allowed_extensions(false);

if (!is_dir($uploadDir)) { @mkdir($uploadDir, 0755, true); }

// 2. IO 与路由处理层
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $act = $_POST['_action'] ?? '';

    if ($act === 'save_oss_record') {
        $result = limhy_save_remote_upload_record(
            $p,
            (string)($_POST['file_url'] ?? ''),
            (string)($_POST['orig_name'] ?? ''),
            (int)($_POST['file_size'] ?? 0),
            (string)($_POST['mime_type'] ?? ''),
            ['images_only' => false, 'max_size' => $maxSize]
        );
        set_flash($result['ok'] ? 'success' : 'error', $result['ok'] ? '云端直传流已入库' : ($result['error'] ?? '获取云端地址失败'));
        redirect('admin/uploads');
    }

    if ($act === 'upload' && !empty($_FILES['file']) && !$ossEnabled) {
        $result = limhy_store_local_upload($_FILES['file'], $p, ['images_only' => false, 'max_size' => $maxSize, 'allowed_ext' => $allowedExt]);
        set_flash($result['ok'] ? 'success' : 'error', $result['ok'] ? '本地流写入成功' : ($result['error'] ?? '系统底盘错误，IO 被拒绝'));
        redirect('admin/uploads');
    }

    if ($act === 'delete') {
        $id = (int)($_POST['id'] ?? 0);
        if ($id > 0) {
            $upload = db_row("SELECT * FROM `{$p}uploads` WHERE `id` = ?", [$id]);
            if ($upload) {
                $path = $upload['path'];
                if (!str_starts_with($path, 'http://') && !str_starts_with($path, 'https://')) {
                    $filePath = $uploadDir . $path;
                    if (file_exists($filePath)) { @unlink($filePath); }
                }
                db_execute("DELETE FROM `{$p}uploads` WHERE `id` = ?", [$id]);
                set_flash('success', '目标物已被抹除');
            }
        }
        redirect('admin/uploads');
    }
}

// 3. 视图数据拉取
$page    = max(1, (int)($_GET['page'] ?? 1));
$perPage = 24;
$source = clean($_GET['source'] ?? 'all', 20);
if (!in_array($source, ['all', 'local', 'object'], true)) { $source = 'all'; }
$sourceWhere = '';
if ($source === 'local') {
    $sourceWhere = " WHERE `path` NOT LIKE 'http://%' AND `path` NOT LIKE 'https://%'";
} elseif ($source === 'object') {
    $sourceWhere = " WHERE `path` LIKE 'http://%' OR `path` LIKE 'https://%'";
}
$total = (int)db_value("SELECT COUNT(*) FROM `{$p}uploads`" . $sourceWhere);
$totalPages = max(1, (int)ceil($total / $perPage));
$page = min($page, $totalPages);
$offset = ($page - 1) * $perPage;
$uploads = db_rows("SELECT * FROM `{$p}uploads`" . $sourceWhere . " ORDER BY `created_at` DESC LIMIT {$perPage} OFFSET {$offset}");
$imgExts = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'];

ob_start();
?>

<div class="card">
    <div style="margin-bottom: 12px; font-size: 13px; font-weight: 800; display:flex; align-items:center; gap:6px;">
        当前驱动引擎： 
        <?php if($ossEnabled): ?>
            <span style="color:#10b981; background:#ecfdf5; padding:2px 8px; border-radius:4px; border:1px solid #10b981;"><i class="ri-cloud-line"></i> 云端 API 直传网关</span>
        <?php else: ?>
            <span style="color:#6b7280; background:#f3f4f6; padding:2px 8px; border-radius:4px; border:1px solid #9ca3af;"><i class="ri-hard-drive-2-line"></i> 本地磁盘存储</span>
        <?php endif; ?>
    </div>

    <!-- 原生上传表单 -->
    <form method="POST" action="<?=url('admin/uploads')?>" enctype="multipart/form-data" id="js-upload-form">
        <?=csrf_field()?>
        <input type="hidden" name="_action" value="upload">
        
        <label class="dropzone" id="js-dropzone">
            <input type="file" name="file" style="display:none" id="js-file-input" accept="<?=implode(',', array_map(fn($e) => ".{$e}", $allowedExt))?>">
            <div style="font-size:36px; margin-bottom:12px; color:var(--color-primary);">
                <i class="ri-upload-cloud-2-line"></i>
            </div>
            <div style="font-size:16px; font-weight:500; color:var(--color-text-1); margin-bottom:4px;" id="js-upload-text">
                点击或拖拽触发上传通道
            </div>
            <div style="font-size:12px; color:var(--color-text-3);">
                <?php if($ossEnabled): ?>直达云端 · 图片支持自动 WebP 压缩 <?php else: ?>限制在 <?=round($maxSize/1024/1024)?>MB 封顶<?php endif; ?>
            </div>
        </label>
    </form>
    
    <!-- 隐藏表单：用于提交云端直传后的信息回溯 -->
    <form method="POST" action="<?=url('admin/uploads')?>" id="js-oss-save-form" style="display:none;">
        <?=csrf_field()?>
        <input type="hidden" name="_action" value="save_oss_record">
        <input type="hidden" name="file_url" id="js-oss-url">
        <input type="hidden" name="orig_name" id="js-oss-name">
        <input type="hidden" name="file_size" id="js-oss-size">
        <input type="hidden" name="mime_type" id="js-oss-mime">
    </form>
</div>

<div style="display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:16px; flex-wrap:wrap;">
    <div style="font-size:14px; font-weight:500; color:var(--color-text-1);">
        数据池清单 <span style="color:var(--color-text-3); font-weight:normal;">(当前: <?=$total?> 件)</span>
    </div>
    <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <?php
            $sourceTabs = [
                'all' => '全部资源',
                'local' => '仅本地',
                'object' => '仅对象存储',
            ];
            foreach ($sourceTabs as $key => $label):
                $tabUrl = url('admin/uploads?source=' . rawurlencode($key));
                $active = $source === $key;
        ?>
        <a href="<?=$tabUrl?>" class="btn <?=$active ? 'btn-primary' : 'btn-ghost'?>" style="height:32px; padding:0 12px;">
            <?=$label?>
        </a>
        <?php endforeach; ?>
    </div>
</div>

<?php if (empty($uploads)): ?>
    <div class="admin-empty">
        <i class="ri-inbox-line" style="font-size:48px; margin-bottom:10px;"></i>
        <div>池内静默无物</div>
    </div>
<?php else: ?>
    <div class="upload-grid">
        <?php foreach ($uploads as $up): 
            $ext = strtolower(pathinfo($up['filename'], PATHINFO_EXTENSION));
            $isImg = in_array($ext, $imgExts);
            $fileUrl = (str_starts_with($up['path'], 'http://') || str_starts_with($up['path'], 'https://')) ? $up['path'] : ($uploadUrl . $up['path']);
            $sizeStr = $up['size'] < 1024 * 1024 ? round($up['size'] / 1024, 1) . ' KB' : round($up['size'] / 1024 / 1024, 2) . ' MB';
            $isRemote = str_starts_with($up['path'], 'http://') || str_starts_with($up['path'], 'https://');
            $driverLabel = $isRemote ? '对象存储' : '本地存储';
            $driverStyle = $isRemote
                ? 'color:#0f766e; background:#ecfeff; border:1px solid #99f6e4;'
                : 'color:#6b7280; background:#f3f4f6; border:1px solid #d1d5db;';
            $driverIcon = $isRemote ? 'ri-cloud-line' : 'ri-hard-drive-2-line';
        ?>
        <div class="upload-item">
            <div class="upload-thumb">
                <?php if ($isImg && !str_contains($up['path'], 'undefined')): ?>
                    <img src="<?=e($fileUrl)?>" alt="<?=e($up['original_name'])?>" loading="lazy" style="width:100%; height:100%; object-fit:cover;">
                <?php else: ?>
                    <div style="display:flex; flex-direction:column; align-items:center; gap:4px;">
                        <i class="ri-file-text-line" style="font-size:32px; color:var(--color-text-3);"></i>
                        <span style="font-size:12px; font-weight:600; color:var(--color-text-3); text-transform:uppercase;"><?=e($ext ?: '未知')?></span>
                    </div>
                <?php endif; ?>
            </div>
            
            <div class="upload-info">
                <div class="upload-name" title="<?=e($up['original_name'])?>"><?=e($up['original_name'])?></div>
                <div class="upload-meta">
                    <span><?=strtoupper($ext ?: '未知')?></span>
                    <span><?=$sizeStr?></span>
                </div>
                <div style="margin-top:8px;">
                    <span style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; padding:4px 8px; border-radius:999px; <?=$driverStyle?>">
                        <i class="<?=$driverIcon?>"></i> <?=$driverLabel?>
                    </span>
                </div>
            </div>

            <div class="upload-actions">
                <button class="btn btn-primary icon-btn js-copy" data-url="<?=e($fileUrl)?>" title="提取指针" style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center;">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>
                </button>
                <form method="POST" action="<?=url('admin/uploads')?>" onsubmit="return confirm('确认抹除？')">
                    <?=csrf_field()?>
                    <input type="hidden" name="_action" value="delete">
                    <input type="hidden" name="id" value="<?=$up['id']?>">
                    <button type="submit" class="btn" title="抹除" style="width:28px; height:28px; padding:0; display:flex; align-items:center; justify-content:center; background:#ff4444 !important; color:#ffffff !important; border:none; border-radius:4px; cursor:pointer;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                    </button>
                </form>
            </div>
        </div>
        <?php endforeach; ?>
    </div>

    <?php if ($totalPages > 1): ?>
    <?php
        $paginationBase = 'admin/uploads?source=' . rawurlencode($source) . '&page=';
        $windowStart = max(1, $page - 2);
        $windowEnd = min($totalPages, $page + 2);
    ?>
    <div style="display:flex; flex-direction:column; align-items:center; gap:10px; margin-top:24px;">
        <div style="font-size:12px; color:var(--color-text-3);">第 <?=$page?> 页，共 <?=$totalPages?> 页</div>
        <div style="display:flex; justify-content:center; gap:8px; flex-wrap:wrap;">
            <a href="<?=url($paginationBase . max(1, $page - 1))?>" class="btn btn-ghost <?=($page<=1)?'disabled':''?>"><i class="ri-arrow-left-s-line"></i> 上一页</a>
            <?php if ($windowStart > 1): ?>
                <a href="<?=url($paginationBase . '1')?>" class="btn btn-ghost">1</a>
                <?php if ($windowStart > 2): ?><span class="btn btn-ghost disabled">...</span><?php endif; ?>
            <?php endif; ?>
            <?php for ($i = $windowStart; $i <= $windowEnd; $i++): ?>
                <a href="<?=url($paginationBase . $i)?>" class="btn <?=$i === $page ? 'btn-primary' : 'btn-ghost'?>"><?=$i?></a>
            <?php endfor; ?>
            <?php if ($windowEnd < $totalPages): ?>
                <?php if ($windowEnd < $totalPages - 1): ?><span class="btn btn-ghost disabled">...</span><?php endif; ?>
                <a href="<?=url($paginationBase . $totalPages)?>" class="btn btn-ghost"><?=$totalPages?></a>
            <?php endif; ?>
            <a href="<?=url($paginationBase . min($totalPages, $page + 1))?>" class="btn btn-ghost <?=($page>=$totalPages)?'disabled':''?>">下一页 <i class="ri-arrow-right-s-line"></i></a>
        </div>
    </div>
    <?php endif; ?>
<?php endif; ?>

<script>
;(function(){
    'use strict';
    
    const checkIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    const copyIcon = '<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>';

    function fallbackCopy(text, btn) {
        var ta = document.createElement('textarea');
        ta.value = text;
        ta.style.position = 'fixed';
        ta.style.top = '0';
        ta.style.left = '0';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        try {
            document.execCommand('copy');
            showTooltip(btn);
        } catch (err) {
            alert('终端拒绝复制，请手动长按链接');
        }
        document.body.removeChild(ta);
    }

    document.querySelectorAll('.js-copy').forEach(function(btn) {
        btn.addEventListener('click', function(e) {
            e.preventDefault();
            var url = this.getAttribute('data-url');
            if (navigator.clipboard && window.isSecureContext) { 
                navigator.clipboard.writeText(url).then(function() { showTooltip(btn); }).catch(function() { fallbackCopy(url, btn); }); 
            } else { 
                fallbackCopy(url, btn); 
            }
        });
    });

    function showTooltip(btn) { btn.innerHTML = checkIcon; setTimeout(function() { btn.innerHTML = copyIcon; }, 1500); }

    const dropzone = document.getElementById('js-dropzone');
    const fileInput = document.getElementById('js-file-input');
    const form = document.getElementById('js-upload-form');
    const uploadText = document.getElementById('js-upload-text');
    const ossEnabled = <?= $ossEnabled ? 'true' : 'false' ?>;
    const OSS_TOKEN_URL = "<?=url('api/oss-token')?>";

    async function parseJsonSafe(resp, emptyMessage, invalidMessage) {
        const raw = await resp.text();
        if (!raw || !raw.trim()) {
            throw new Error(emptyMessage);
        }
        try {
            return JSON.parse(raw);
        } catch (e) {
            throw new Error(`${invalidMessage}：${raw.slice(0, 180)}`);
        }
    }

    function resolveCustomUploadUrl(payload) {
        if (!payload || typeof payload !== 'object') return '';
        if (typeof payload.url === 'string' && payload.url) return payload.url;
        if (payload.data && typeof payload.data.url === 'string' && payload.data.url) return payload.data.url;
        if (payload.result && typeof payload.result.url === 'string' && payload.result.url) return payload.result.url;
        if (payload.file && typeof payload.file.url === 'string' && payload.file.url) return payload.file.url;
        return '';
    }

    if (dropzone && fileInput && form) {
        ['dragenter', 'dragover'].forEach(function(eventName) { dropzone.addEventListener(eventName, function(e) { e.preventDefault(); e.stopPropagation(); dropzone.classList.add('is-dragover'); }, false); });
        ['dragleave', 'drop'].forEach(function(eventName) { dropzone.addEventListener(eventName, function(e) { e.preventDefault(); e.stopPropagation(); dropzone.classList.remove('is-dragover'); }, false); });
        
        dropzone.addEventListener('drop', function(e) { var files = e.dataTransfer.files; if (files.length > 0) { handleUpload(files); } });
        fileInput.addEventListener('change', function() { if (fileInput.files.length > 0) { handleUpload(fileInput.files); } });
    }

    async function handleUpload(files) {
        if (!files || !files.length) return;
        if (!ossEnabled) { fileInput.files = files; form.submit(); return; }

        uploadText.textContent = '流式跨域推流中...';
        dropzone.style.pointerEvents = 'none';
        dropzone.style.opacity = '0.6';

        try {
            const file = files[0];
            let blob = file;
            let ext = file.name.split('.').pop().toLowerCase();
            let mime = file.type || 'application/octet-stream';
            
            if (file.type.startsWith('image/')) {
                const checkWebP = () => document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0;
                ext = checkWebP() ? 'webp' : 'jpg';
                blob = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onload = (e) => {
                        const img = new Image();
                        img.onload = () => {
                            const canvas = document.createElement('canvas');
                            let w = img.width, h = img.height, max = 1600; 
                            if (w > max || h > max) { if (w > h) { h *= max/w; w=max; } else { w *= max/h; h=max; } }
                            canvas.width = w; canvas.height = h;
                            const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
                            canvas.toBlob(resolve, ext === 'webp' ? 'image/webp' : 'image/jpeg', 0.85); 
                        }
                        img.src = e.target.result;
                    };
                    reader.readAsDataURL(file);
                });
            }

            const fdToken = new FormData(); fdToken.append('ext', ext);
            const tokenReq = await fetch(OSS_TOKEN_URL, { method: 'POST', body: fdToken });
            if (!tokenReq.ok) throw new Error('网关拒绝签发 Token');
            const tRes = await parseJsonSafe(tokenReq, '对象存储签名接口返回空响应', '对象存储签名接口返回了非 JSON 内容');
            if (!tRes.ok) throw new Error('云端凭证异常');

            let finalUrl = '';

            // ★ 升级：全模式上传网关适配器
            if (tRes.type === 'litepic') {
                const fdLitePic = new FormData();
                fdLitePic.append('_csrf', <?= json_encode(csrf_token()) ?>);
                fdLitePic.append('file', blob, file.name);
                const litepicReq = await fetch((tRes.data && tRes.data.proxy_url) || '', {
                    method: 'POST',
                    body: fdLitePic,
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                });
                const litepicRes = await parseJsonSafe(litepicReq, 'LitePic 代理接口返回空响应', 'LitePic 代理接口返回了非 JSON 内容');
                if (!litepicReq.ok || !litepicRes.ok || !litepicRes.item || !litepicRes.item.url) throw new Error((litepicRes && (litepicRes.error || litepicRes.message)) ? (litepicRes.error || litepicRes.message) : 'LitePic 上传失败');
                window.location.reload();
                return;

            } else if (tRes.type === 'custom_api') {
                // 1. 对接独立图床系统
                const fdCustom = new FormData();
                fdCustom.append('file', blob, file.name);
                if (tRes.data.secret) fdCustom.append('secret', tRes.data.secret);
                
                const customReq = await fetch(tRes.data.upload_url, { method: 'POST', body: fdCustom });
                if (!customReq.ok) throw new Error('私人图床接口无响应或跨域被拦截');
                
                const customRes = await parseJsonSafe(customReq, '自定义图床接口返回空响应', '自定义图床接口返回了非 JSON 内容');
                const customUrl = resolveCustomUploadUrl(customRes);
                const customOk = customRes.status === 'success' || customRes.ok === true || customUrl !== '';
                if (!customOk) throw new Error(customRes.message || customRes.error || '图床返回错误状态');
                
                finalUrl = customUrl;
                
            } else if (tRes.type === 's4' || tRes.type === 's3' || tRes.type === 'upyun') {
                // 2. 原来的 S3 兼容上传
                const uploadUrl = tRes.data.upload_url || tRes.upload_url;
                const s4Req = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': mime } });
                if (!s4Req.ok) throw new Error('S3兼容引擎拒绝写入');
                finalUrl = tRes.data.url || tRes.url;
                
            } else {
                // 3. 原来的阿里云 OSS 上传
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

            document.getElementById('js-oss-url').value = finalUrl;
            document.getElementById('js-oss-name').value = file.name;
            document.getElementById('js-oss-size').value = blob.size;
            document.getElementById('js-oss-mime').value = mime;
            document.getElementById('js-oss-save-form').submit();

        } catch (e) {
            console.error(e); 
            alert('传输中断: ' + e.message); 
            window.location.reload();
        }
    }
})();
</script>

<?php
$content = ob_get_clean();
require __DIR__ . '/layout.php';
?>
