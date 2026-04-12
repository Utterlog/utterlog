<?php
/**
 * LiMhy - 内容数据流控制器
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    提供文章、页面的撰写、发布与批量删改机制，内置原生 Markdown 引擎
 */
declare(strict_types=1);
require_once __DIR__ . '/../index.php';
require_once __DIR__ . '/../core/upload.php';

$p = prefix();
$currentNav = (($_GET['status'] ?? '') === 'draft' && ($_GET['type'] ?? 'post') === 'post') ? 'drafts' : 'posts';
if (function_exists('limhy_ensure_post_custom_cover_column')) { limhy_ensure_post_custom_cover_column(); }
$action = $_GET['action'] ?? 'list';
$postType = $_GET['type'] ?? 'post';
$postTypeLabel = $postType === 'page' ? '页面' : '文章';




if (isset($_GET['ajax']) && $_GET['ajax'] === 'preview') {
    require_admin();
    verify_csrf();
    $raw = (string)($_POST['content'] ?? '');
    $title = clean((string)($_POST['title'] ?? '预览文章'), 200);
    $html = markdown_to_html(mb_substr($raw, 0, 200000));
    $html = img_lazyload($html);
    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="' . e(theme_asset('style.css')) . '"><style>body{background:var(--bg-color);color:var(--text-main);padding:20px}.preview-shell{max-width:860px;margin:0 auto}.preview-head{margin-bottom:18px;padding-bottom:12px;border-bottom:1px dashed var(--border-color)}.preview-head h1{font-size:30px;margin:0 0 10px}.preview-note{font-size:12px;color:var(--text-sec)}
    .editor-toolbar-wrap{position:relative;}
    .editor-color-pop{position:fixed;z-index:1200;background:var(--color-bg-white);border:1px solid var(--color-border);border-radius:14px;padding:12px;box-shadow:0 12px 28px rgba(15,23,42,.16);min-width:220px;}
    .editor-color-pop__title{font-size:12px;font-weight:800;color:var(--color-text-3);margin-bottom:10px;}
    .editor-color-pop__grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;}
    .editor-color-swatch{appearance:none;-webkit-appearance:none;width:28px;height:28px;border-radius:999px;border:2px solid #fff;box-shadow:0 0 0 1px rgba(15,23,42,.12);background:var(--swatch);cursor:pointer;padding:0;}
    .editor-color-swatch:hover{transform:translateY(-1px) scale(1.04);} .editor-color-pop[hidden]{display:none !important;}
    .editor-cover-input-group{position:relative;display:flex;align-items:center;}
    .editor-cover-input{flex:1;padding-right:96px;}
    .editor-cover-upload-btn{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 12px;border-radius:10px;}
    .editor-cover-hint{margin-top:8px;font-size:12px;color:var(--color-text-3);line-height:1.7;}
</style></head><body><div class="preview-shell"><div class="preview-head"><h1>' . e($title !== '' ? $title : '未命名文章') . '</h1><div class="preview-note">这是后台实时预览，样式尽量贴近前台主题渲染。</div></div><article class="post-detail"><div class="post-detail__content prose">' . $html . '</div></article></div></body></html>';
    exit;
}

if (isset($_GET['ajax']) && $_GET['ajax'] === 'media_library') {
    require_admin();
    $page = max(1, (int)($_GET['page'] ?? 1));
    $perPage = 24;
    $offset = ($page - 1) * $perPage;
    $rows = db_rows("SELECT * FROM `{$p}uploads` ORDER BY `created_at` DESC LIMIT {$perPage} OFFSET {$offset}");
    $items = [];
    foreach ($rows as $row) {
        if (!limhy_is_image_upload($row)) {
            continue;
        }
        $items[] = [
            'id' => (int)$row['id'],
            'name' => (string)$row['original_name'],
            'url' => limhy_upload_public_url((string)$row['path']),
            'mime' => (string)($row['mime_type'] ?? ''),
            'size' => (int)($row['size'] ?? 0),
            'created_at' => (string)($row['created_at'] ?? ''),
        ];
    }
    json_response(['ok' => true, 'items' => $items]);
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (($_POST['_action'] ?? '') === 'editor_image_upload') {
        require_admin();
        require_csrf();
        json_response(limhy_store_local_upload($_FILES['file'] ?? [], $p, ['images_only' => true]));
    }

    if (($_POST['_action'] ?? '') === 'editor_image_save_remote') {
        require_admin();
        require_csrf();
        json_response(limhy_save_remote_upload_record(
            $p,
            (string)($_POST['file_url'] ?? ''),
            (string)($_POST['orig_name'] ?? ''),
            (int)($_POST['file_size'] ?? 0),
            (string)($_POST['mime_type'] ?? ''),
            ['images_only' => true]
        ));
    }

    verify_csrf();
    $act = $_POST['_action'] ?? '';

    if ($act === 'save') {
        $id=(int)($_POST['id']??0); 
        $existingPost = $id > 0 ? db_row("SELECT `id`,`password`,`published_at`,`created_at`,`updated_at`,`custom_cover_url` FROM `{$p}posts` WHERE `id`=? LIMIT 1", [$id]) : null;

        $title=clean($_POST['title']??'',200); 
        $slug=preg_replace('/[^a-zA-Z0-9\-]/', '', trim($_POST['slug']??'')); 
        $content=$_POST['content']??''; 
        $excerpt=clean($_POST['excerpt']??'',500); 
        $customCoverUrl=clean($_POST['custom_cover_url']??'',500); 
        $type=in_array($_POST['type']??'',['post','page'])?$_POST['type']:'post'; 
        $status=in_array($_POST['status']??'',['published','draft','private'])?$_POST['status']:'draft'; 
        $categoryId=(int)($_POST['category_id']??0); 
        $tagInput=trim($_POST['tags']??''); 
        $passwordInput=clean($_POST['password']??'',100); 
        if ($passwordInput === '••••••••' && !empty($existingPost['password'])) { $passwordInput = (string)$existingPost['password']; }
        $password=function_exists('limhy_prepare_post_password_for_save') ? limhy_prepare_post_password_for_save($passwordInput, (string)($existingPost['password'] ?? '')) : $passwordInput; 
        $isPinned=isset($_POST['is_pinned'])?1:0; 
        $commentEnabled=isset($_POST['comment_enabled'])?1:0; 
        $rssEnabled=$type==='post' && isset($_POST['rss_enabled'])?1:0; 
$publishedAt=trim($_POST['published_at']??'');

        if($title===''){ set_flash('error','标题不能为空'); redirect("admin/posts?action=".($id?"edit&id={$id}":"new")."&type={$type}"); }
        
        if($slug===''){
if ($id > 0) {
                $slug = (string)$id;
            } else {
                try {
                    $dbName = defined('DB_NAME') ? DB_NAME : '';
                    $nextId = db_value("SELECT AUTO_INCREMENT FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?", [$dbName, "{$p}posts"]);
                    $slug = (string)($nextId ?: time());
                } catch (\Throwable $e) {
                    $slug = (string)time();
                }
            }
        }
        
        $check=db_value("SELECT COUNT(*) FROM `{$p}posts` WHERE `slug`=? AND `id`!=?",[$slug,$id]);if($check>0)$slug.='-'.mt_rand(100,999);
        
        $contentSafe=$content; if(strlen($contentSafe)>200000)$contentSafe=mb_substr($contentSafe,0,100000); $contentHtml=markdown_to_html($contentSafe);
        if(!$publishedAt||!strtotime($publishedAt))$publishedAt=date('Y-m-d H:i:s');
        
        if($id>0){
            db_execute("UPDATE `{$p}posts` SET `title`=?,`slug`=?,`custom_cover_url`=?,`content`=?,`content_html`=?,`excerpt`=?,`type`=?,`status`=?,`category_id`=?,`password`=?,`is_pinned`=?,`comment_enabled`=?,`rss_enabled`=?,`published_at`=?,`updated_at`=NOW() WHERE `id`=?",[$title,$slug,$customCoverUrl,$contentSafe,$contentHtml,$excerpt,$type,$status,$categoryId?:null,$password,$isPinned,$commentEnabled,$rssEnabled,$publishedAt,$id]);
        } else {
            db_execute("INSERT INTO `{$p}posts` (`title`,`slug`,`custom_cover_url`,`content`,`content_html`,`excerpt`,`type`,`status`,`category_id`,`password`,`is_pinned`,`comment_enabled`,`rss_enabled`,`published_at`) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",[$title,$slug,$customCoverUrl,$contentSafe,$contentHtml,$excerpt,$type,$status,$categoryId?:null,$password,$isPinned,$commentEnabled,$rssEnabled,$publishedAt]);
            $id=(int)db_value("SELECT LAST_INSERT_ID()");
        }

        if($type==='post'){
            db_execute("DELETE FROM `{$p}post_tags` WHERE `post_id`=?",[$id]);
            if($tagInput){
                $names=array_unique(array_filter(explode(',',str_replace(['，',' '],',',$tagInput))));
                foreach($names as $tn){
                    $tid=db_value("SELECT `id` FROM `{$p}tags` WHERE `name`=?",[$tn]);
                    if(!$tid){
                        $tslug=trim(preg_replace('/[^a-z0-9\-]/','',strtolower($tn)),'-')?:'tag-'.mt_rand(100,999);
                        $tid=db_insert("INSERT INTO `{$p}tags` (`name`,`slug`) VALUES (?,?)",[$tn,$tslug]);
                    }
db_execute("INSERT IGNORE INTO `{$p}post_tags` (`post_id`,`tag_id`) VALUES (?,?)",[$id,$tid]);
                }
            }
            update_tag_counts();
        }
        update_category_counts();
        if (function_exists('clear_html_cache')) {
            clear_html_cache();
        }
        
        set_flash('success',"发布已同步");
        redirect("admin/posts?action=edit&id={$id}&type={$type}");
    }

    if ($act === 'delete') {
        $id = (int)$_POST['id'];
        if ($id > 0) { 
            db_execute("DELETE FROM `{$p}post_tags` WHERE `post_id`=?", [$id]); 
            db_execute("DELETE FROM `{$p}comments` WHERE `post_id`=?", [$id]); 
            db_execute("DELETE FROM `{$p}posts` WHERE `id`=?", [$id]); 
            update_tag_counts(); update_category_counts(); 
        }
        set_flash('success', "内容已丢弃"); 
        redirect("admin/posts?type={$postType}");
}

    if ($act === 'batch_delete') {
        $ids = $_POST['ids'] ?? [];
        if (!is_array($ids)) { $ids = [$ids]; }
        $validIds = array_filter(array_map('intval', $ids), fn($id) => $id > 0);
        
        if (!empty($validIds)) {
            $idStr = implode(',', $validIds);
            db_execute("DELETE FROM `{$p}post_tags` WHERE `post_id` IN ($idStr)"); 
db_execute("DELETE FROM `{$p}comments` WHERE `post_id` IN ($idStr)"); 
            db_execute("DELETE FROM `{$p}posts` WHERE `id` IN ($idStr)"); 
            update_tag_counts(); update_category_counts();
set_flash('success', "已清理 " . count($validIds) . " 个项目"); 
        } else {
            set_flash('error', "未选择目标");
        }
        $refType = in_array($_POST['type']??'',['post','page']) ? $_POST['type'] : 'post';
        redirect("admin/posts?type={$refType}");
    }
}

ob_start();

if ($action === 'new' || $action === 'edit') {
    $post = null; $postTags = '';
    if ($action === 'edit') {
        $id = (int)$_GET['id'];
        $post = db_row("SELECT * FROM `{$p}posts` WHERE `id`=?", [$id]);
        if (!$post) redirect('admin/posts');
        $postType = $post['type'];
        if ($postType === 'post') {
            $tags = db_rows("SELECT t.name FROM `{$p}tags` t JOIN `{$p}post_tags` pt ON t.id=pt.tag_id WHERE pt.post_id=?", [$id]);
$postTags = implode(',', array_column($tags, 'name'));
        }
    }
    $cats = db_rows("SELECT * FROM `{$p}categories` ORDER BY sort_order");
    $pageTitle = ($action==='new'?'新建':'编辑') . $postTypeLabel;
    $noPageHeader = true; 
?>
    <style>
    .editor-toolbar-wrap { 
        padding: 6px 12px; 
        border-bottom: 1px solid var(--color-border); 
        background: var(--color-fill); 
        display: flex; 
        justify-content: flex-start;
        align-items: center; 
        gap: 16px;
        overflow-x: auto;
        scrollbar-width: none;
        -webkit-overflow-scrolling: touch;
    }
    .editor-toolbar-wrap::-webkit-scrollbar { display: none; }
    .editor-toolbar { display: flex; gap: 2px; flex-shrink: 0; }
    .toolbar-btn { border: none; background: transparent; color: var(--color-text-2); width: 32px; height: 32px; border-radius: var(--radius-s); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s; font-size: 16px; flex-shrink: 0; }
    .toolbar-btn:hover { background: rgba(22, 93, 255, 0.1); color: var(--color-primary); }
    .toolbar-divider { width: 1px; background: var(--color-border); margin: 6px 6px; flex-shrink: 0; }
    
    .editor-toolbar-wrap{position:relative;}
    .editor-color-pop{position:fixed;z-index:1200;background:var(--color-bg-white);border:1px solid var(--color-border);border-radius:14px;padding:12px;box-shadow:0 12px 28px rgba(15,23,42,.16);min-width:220px;}
    .editor-color-pop__title{font-size:12px;font-weight:800;color:var(--color-text-3);margin-bottom:10px;}
    .editor-color-pop__grid{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;}
    .editor-color-swatch{appearance:none;-webkit-appearance:none;width:28px;height:28px;border-radius:999px;border:2px solid #fff;box-shadow:0 0 0 1px rgba(15,23,42,.12);background:var(--swatch);cursor:pointer;padding:0;}
    .editor-color-swatch:hover{transform:translateY(-1px) scale(1.04);} .editor-color-pop[hidden]{display:none !important;}
    .editor-cover-input-group{position:relative;display:flex;align-items:center;}
    .editor-cover-input{flex:1;padding-right:96px;}
    .editor-cover-upload-btn{position:absolute;right:6px;top:50%;transform:translateY(-50%);display:inline-flex;align-items:center;justify-content:center;height:34px;padding:0 12px;border-radius:10px;}
    .editor-cover-hint{margin-top:8px;font-size:12px;color:var(--color-text-3);line-height:1.7;}
</style>

    <form method="POST" action="<?=url('admin/posts')?>">
        <?=csrf_field()?>
        <input type="hidden" name="_action" value="save">
        <input type="hidden" name="id" value="<?=$post['id']??0?>">
        <input type="hidden" name="type" value="<?=e($postType)?>">

        <div class="editor-layout">
<div class="editor-main">
                <div class="card" style="padding: 10px 24px !important; margin-bottom: 0;">
                    <input type="text" name="title" class="editor-title-input" placeholder="在此输入标题..." value="<?=e($post['title']??'')?>" required autofocus>
                </div>
                
                <div class="card" style="flex: 1; padding: 0 !important; margin-bottom: 0; display:flex; flex-direction:column; min-width: 0;">
                    <div class="editor-toolbar-wrap">
                        <div style="color:var(--color-text-3); font-size:12px; display:flex; align-items:center; gap:6px; flex-shrink: 0;">
                            <i class="ri-markdown-line" style="font-size:16px;"></i> Markdown
                        </div>
                        <div class="editor-toolbar">
                            <button type="button" class="toolbar-btn js-md-btn" data-act="bold" title="粗体"><i class="ri-bold"></i></button>
                            <button type="button" class="toolbar-btn js-md-btn" data-act="italic" title="斜体"><i class="ri-italic"></i></button>
                            <button type="button" class="toolbar-btn js-md-btn" data-act="color" title="字体颜色"><i class="ri-palette-line"></i></button>
                            <div class="toolbar-divider"></div>
                            <button type="button" class="toolbar-btn js-md-btn" data-act="h2" title="标题 H2"><i class="ri-h-2"></i></button>
                            <button type="button" class="toolbar-btn js-md-btn" data-act="quote" title="引用"><i class="ri-double-quotes-l"></i></button>
                            <button type="button" class="toolbar-btn js-md-btn" data-act="ul" title="无序列表"><i class="ri-list-unordered"></i></button>
                            <button type="button" class="toolbar-btn js-md-btn" data-act="collapse" title="插入折叠面板"><i class="ri-arrow-up-down-line"></i></button>
                            <div class="toolbar-divider"></div>
                            <button type="button" class="toolbar-btn js-md-btn" data-act="link" title="插入链接"><i class="ri-link"></i></button>
                            <button type="button" class="toolbar-btn js-open-media" title="插入图片"><i class="ri-image-line"></i></button>
                            <button type="button" class="toolbar-btn js-md-btn" data-act="download" title="插入下载名片"><i class="ri-download-line"></i></button>
                            <button type="button" class="toolbar-btn js-md-btn" data-act="code" title="代码块"><i class="ri-code-box-line"></i></button>
                            <button type="button" class="toolbar-btn js-md-btn" data-act="video" title="插入视频"><i class="ri-video-line"></i></button>
                        </div>
                        <div class="editor-color-pop" id="js-editor-color-pop" hidden>
                            <div class="editor-color-pop__title">选择字体颜色</div>
                            <div class="editor-color-pop__grid">
                                <button type="button" class="editor-color-swatch" data-color="#ff4d4f" style="--swatch:#ff4d4f" title="胭脂红"></button>
                                <button type="button" class="editor-color-swatch" data-color="#f97316" style="--swatch:#f97316" title="活力橙"></button>
                                <button type="button" class="editor-color-swatch" data-color="#f59e0b" style="--swatch:#f59e0b" title="琥珀黄"></button>
                                <button type="button" class="editor-color-swatch" data-color="#22c55e" style="--swatch:#22c55e" title="青草绿"></button>
                                <button type="button" class="editor-color-swatch" data-color="#06b6d4" style="--swatch:#06b6d4" title="湖水青"></button>
                                <button type="button" class="editor-color-swatch" data-color="#3b82f6" style="--swatch:#3b82f6" title="天空蓝"></button>
                                <button type="button" class="editor-color-swatch" data-color="#8b5cf6" style="--swatch:#8b5cf6" title="葡萄紫"></button>
                                <button type="button" class="editor-color-swatch" data-color="#ec4899" style="--swatch:#ec4899" title="玫瑰粉"></button>
                                <button type="button" class="editor-color-swatch" data-color="#111827" style="--swatch:#111827" title="墨黑"></button>
                            </div>
                        </div>
                        <div class="editor-toolbar-note">支持直接上传或从附件库选图插入</div>
                        <button type="button" class="btn btn-ghost" id="js-preview-refresh" style="margin-left:auto;flex-shrink:0;"><i class="ri-eye-line"></i> 刷新预览</button>
                    </div>
                    <div style="display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:0;min-height:680px;">
                        <textarea name="content" id="mdEditor" class="editor-textarea" placeholder="开始写作..." style="border-right:1px solid var(--color-border);min-height:680px;"><?=e($post['content']??'')?></textarea>
                        <div style="min-width:0;background:var(--color-bg-white);">
                            <div style="padding:10px 14px;border-bottom:1px solid var(--color-border);font-size:12px;color:var(--color-text-3);display:flex;align-items:center;justify-content:space-between;"><span>前台样式预览</span><span id="js-preview-status">等待渲染</span></div>
                            <iframe id="js-post-preview" title="文章预览" style="width:100%;height:636px;border:0;display:block;background:#fff;"></iframe>
                        </div>
                    </div>
                </div>
            </div>

            <div class="editor-sidebar">
                <div class="card">
                    <div class="card-title" style="margin-bottom:12px;">发布</div>
                    <div style="display:flex; justify-content:space-between; gap:10px;">
                        <button type="submit" class="btn btn-primary" style="flex:1;"><i class="ri-save-3-line"></i> 保存</button>
                        <a href="<?=url("admin/posts?type={$postType}")?>" class="btn btn-ghost">返回</a>
                    </div>
                    <?php if($post): ?>
                    <div style="margin-top:12px; text-align:right;">
                         <button type="submit" formaction="<?=url('admin/posts')?>" name="_action" value="delete" class="btn btn-ghost is-danger" onclick="return confirm('确定删除？')">
                            <i class="ri-delete-bin-line"></i> 删除
                        </button>
                    </div>
                    <?php endif; ?>
                </div>

                <div class="card">
                    <div class="card-title" style="margin-bottom:16px;">设置</div>
                    <div style="margin-bottom:16px">
                        <label class="admin-stat__label">自定义封面图 URL</label>
                        <div class="editor-cover-input-group">
                            <input type="url" name="custom_cover_url" id="js-custom-cover-url" class="form-input editor-cover-input" value="<?=e($post['custom_cover_url']??'')?>" placeholder="留空则自动回退为正文首图">
                            <button type="button" class="btn btn-ghost editor-cover-upload-btn" id="js-custom-cover-upload" aria-label="上传封面图"><i class="ri-upload-cloud-2-line"></i> 上传</button>
                            <input type="file" id="js-custom-cover-file" accept="image/*" style="display:none;">
                        </div>
                        <div class="editor-cover-hint" id="js-custom-cover-hint">如果这里有值，文章列表封面优先使用它；为空时自动回退到正文首图。</div>
                    </div>
                    <div style="margin-bottom:16px">
                        <label class="admin-stat__label">别名 (Slug)</label>
                        <input type="text" name="slug" class="form-input" value="<?=e($post['slug']??'')?>" placeholder="留空自动分配唯一数字">
                    </div>
                    <?php if($postType==='post'): ?>
                    <div style="margin-bottom:16px">
                        <label class="admin-stat__label">分类</label>
                        <select name="category_id" class="form-select">
                            <option value="0">未分类</option>
                            <?php foreach($cats as $c): ?>
                                <option value="<?=$c['id']?>" <?=($post['category_id']??0)==$c['id']?'selected':''?>><?=e($c['name'])?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>
                    <div style="margin-bottom:16px">
                        <label class="admin-stat__label">标签 (逗号分隔)</label>
<input type="text" name="tags" class="form-input" value="<?=e($postTags)?>" placeholder="Tag1, Tag2">
                    </div>
                    <?php endif; ?>
                    <div style="margin-bottom:16px">
                        <label class="admin-stat__label">状态</label>
                        <select name="status" class="form-select">
                            <option value="published" <?=($post['status']??'')==='published'?'selected':''?>>发布</option>
                            <option value="draft" <?=($post['status']??'')==='draft'?'selected':''?>>草稿</option>
                            <option value="private" <?=($post['status']??'')==='private'?'selected':''?>>私密</option>
                        </select>
                    </div>
                    <div style="margin-bottom:16px">
                        <label class="admin-stat__label">发布时间</label>
                        <input type="datetime-local" name="published_at" class="form-input" 
                            value="<?=e($post?date('Y-m-d\TH:i',strtotime($post['published_at'])):date('Y-m-d\TH:i'))?>">
                    </div>
                </div>

                <div class="card">
                    <div class="card-title" style="margin-bottom:16px;">高级</div>
                    <div style="margin-bottom:16px">
                        <label class="admin-stat__label">摘要</label>
                        <textarea name="excerpt" class="form-textarea" rows="3" placeholder="留空自动截取"><?=e($post['excerpt']??'')?></textarea>
                    </div>
                    <div style="margin-bottom:16px">
                        <label class="admin-stat__label">访问密码</label>
                        <?php $passwordEcho = !empty($post['password']) ? '••••••••' : ''; ?>
                        <input type="text" name="password" class="form-input" value="<?=e($passwordEcho)?>" placeholder="留空不加密">
                        <?php if (!empty($post['password'])): ?><div style="margin-top:6px;font-size:12px;color:var(--color-text-3);">已设置访问密码，默认回显为掩码；保持不变则会沿用原密码。</div><?php endif; ?>
                    </div>
                    <div style="display:flex; flex-direction:column; gap:8px; padding-top:8px; border-top:1px solid var(--color-border);">
                        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
                            <input type="checkbox" name="comment_enabled" value="1" <?=($post['comment_enabled']??1)?'checked':''?>> 允许评论
                        </label>
                        <?php if($postType==='post'): ?>
                        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
                            <input type="checkbox" name="rss_enabled" value="1" <?=($post['rss_enabled']??1)?'checked':''?>> 允许本文出现在Rss聚合
                        </label>
                        <label style="display:flex;align-items:center;gap:8px;font-size:13px;cursor:pointer;">
                            <input type="checkbox" name="is_pinned" value="1" <?=($post['is_pinned']??0)?'checked':''?>> 置顶文章
                        </label>
                        <?php endif; ?>
                    </div>
                </div>
            </div>
        </div>
    </form>



    <div class="editor-media-modal" id="js-editor-media-modal" aria-hidden="true">
        <div class="editor-media-panel">
            <div class="editor-media-panel__header">
                <div>
                    <div class="editor-media-panel__title">插入图片</div>
                    <div style="font-size:12px; color:var(--color-text-3); margin-top:4px;">可直接上传，也可从附件库挑选后插入 Markdown 编辑器</div>
                </div>
                <button type="button" class="btn btn-ghost" id="js-editor-media-close">关闭</button>
            </div>
            <div class="editor-media-panel__body">
                <div class="editor-media-uploader">
                    <input type="file" id="js-editor-media-input" accept="image/*" style="display:none;">
                    <button type="button" class="btn btn-primary" id="js-editor-media-upload">上传图片</button>
                    <button type="button" class="btn btn-ghost" id="js-editor-media-refresh">刷新附件库</button>
                    <div class="editor-media-uploader__status" id="js-editor-media-status"><?= limhy_storage_oss_enabled() ? '当前上传目标：对象存储，请选择一张图片插入正文' : '当前上传目标：本地存储，请选择一张图片插入正文' ?></div>
                </div>
                <div class="editor-media-grid" id="js-editor-media-grid"></div>
            </div>
        </div>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded', () => {
        const editor = document.getElementById('mdEditor');
        const btns = document.querySelectorAll('.js-md-btn');
        const colorButton = document.querySelector('[data-act="color"]');
        const colorPop = document.getElementById('js-editor-color-pop');
        const showColorPop = () => {
            if (!colorButton || !colorPop) return;
            colorPop.hidden = false;
            colorPop.setAttribute('aria-hidden', 'false');
            placeColorPop();
        };
        const hideColorPop = () => {
            if (!colorPop) return;
            colorPop.hidden = true;
            colorPop.setAttribute('aria-hidden', 'true');
        };
        const placeColorPop = () => {
            if (!colorButton || !colorPop || colorPop.hidden) return;
            const rect = colorButton.getBoundingClientRect();
            colorPop.style.visibility = 'hidden';
            colorPop.style.display = 'block';
            const popRect = colorPop.getBoundingClientRect();
            let left = rect.left;
            let top = rect.bottom + 10;
            const maxLeft = window.innerWidth - popRect.width - 12;
            if (left > maxLeft) left = Math.max(12, maxLeft);
            if (top + popRect.height > window.innerHeight - 12) {
                top = Math.max(12, rect.top - popRect.height - 10);
            }
            colorPop.style.left = left + 'px';
            colorPop.style.top = top + 'px';
            colorPop.style.visibility = '';
            colorPop.style.display = '';
        };
        const csrfToken = <?= json_encode(csrf_token()) ?>;
        const mediaModal = document.getElementById('js-editor-media-modal');
        const previewFrame = document.getElementById('js-post-preview');
        const previewStatus = document.getElementById('js-preview-status');
        const previewRefreshBtn = document.getElementById('js-preview-refresh');
        const titleInput = document.querySelector('input[name="title"]');
        const ossEnabled = <?= limhy_storage_oss_enabled() ? 'true' : 'false' ?>;
        const ossTokenUrl = <?= json_encode(url('api/oss-token')) ?>;
        const mediaGrid = document.getElementById('js-editor-media-grid');
        const mediaStatus = document.getElementById('js-editor-media-status');
        const mediaInput = document.getElementById('js-editor-media-input');
        const customCoverInput = document.getElementById('js-custom-cover-url');
        const customCoverHint = document.getElementById('js-custom-cover-hint');
        const customCoverFileInput = document.getElementById('js-custom-cover-file');
        const customCoverUploadBtn = document.getElementById('js-custom-cover-upload');
        const openMediaBtn = document.querySelector('.js-open-media');
        const closeMediaBtn = document.getElementById('js-editor-media-close');
        const refreshMediaBtn = document.getElementById('js-editor-media-refresh');
        const uploadMediaBtn = document.getElementById('js-editor-media-upload');
        if (!editor) return;

        const setMediaStatus = (message) => { if (mediaStatus) mediaStatus.textContent = message; };
        let previewTimer = null;
        let previewAbortController = null;
        let isComposing = false;
        const refreshPreview = async () => {
            if (!previewFrame) return;
            try {
                if (previewAbortController) { previewAbortController.abort(); }
                previewAbortController = new AbortController();
                if (previewStatus) previewStatus.textContent = '渲染中...';
                const fd = new FormData();
                fd.append('content', editor.value);
                fd.append('title', titleInput ? titleInput.value : '未命名文章');
                fd.append('_token', csrfToken);
                const resp = await fetch(<?= json_encode(url('admin/posts?ajax=preview')) ?>, { method: 'POST', body: fd, headers: { 'X-Requested-With': 'XMLHttpRequest' }, signal: previewAbortController.signal });
                previewFrame.srcdoc = await resp.text();
                if (previewStatus) previewStatus.textContent = '已同步';
            } catch (e) {
                if (e && e.name === 'AbortError') return;
                if (previewStatus) previewStatus.textContent = '预览失败';
            }
        };
        const queuePreview = () => {
            if (isComposing) return;
            clearTimeout(previewTimer);
            previewTimer = setTimeout(refreshPreview, 450);
        };
        const defaultMediaStatus = () => setMediaStatus(ossEnabled ? '当前上传目标：对象存储，请选择一张图片插入正文' : '当前上传目标：本地存储，请选择一张图片插入正文');
        const insertAtCursor = (snippet) => {
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const text = editor.value;
            editor.value = text.substring(0, start) + snippet + text.substring(end);
            editor.focus();
            const nextPos = start + snippet.length;
            editor.setSelectionRange(nextPos, nextPos);
        };
        const insertImageMarkdown = (url, altText) => {
            const safeAlt = (altText || '图片').replace(/[\r\n\[\]]+/g, ' ').trim() || '图片';
            insertAtCursor(`![${safeAlt}](${url})`);
        };
        const closeMedia = () => {
            if (!mediaModal) return;
            mediaModal.classList.remove('is-active');
            mediaModal.setAttribute('aria-hidden', 'true');
        };
        const openMedia = () => {
            if (!mediaModal) return;
            mediaModal.classList.add('is-active');
            mediaModal.setAttribute('aria-hidden', 'false');
            loadMediaLibrary();
            defaultMediaStatus();
        };
        const createMediaCard = (item) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'editor-media-card';
            button.innerHTML = `
                <div class="editor-media-card__thumb"><img src="${item.url}" alt="${item.name}"></div>
                <div class="editor-media-card__meta">
                    <div class="editor-media-card__name" title="${item.name}">${item.name}</div>
                    <div class="editor-media-card__hint">点击插入正文</div>
                </div>`;
            button.addEventListener('click', () => {
                insertImageMarkdown(item.url, item.name);
                setMediaStatus(`已插入：${item.name}`);
                closeMedia();
            });
            return button;
        };
        const loadMediaLibrary = async () => {
            if (!mediaGrid) return;
            setMediaStatus('正在加载附件库图片...');
            mediaGrid.innerHTML = '';
            try {
                const resp = await fetch(<?= json_encode(url('admin/posts?ajax=media_library')) ?>, {
                    headers: { 'X-Requested-With': 'XMLHttpRequest' }
                });
                const data = await parseJsonSafe(resp, '附件库接口返回空响应', '附件库接口返回了非 JSON 内容');
                if (!data.ok) throw new Error(data.error || '附件库读取失败');
                if (!Array.isArray(data.items) || data.items.length === 0) {
                    mediaGrid.innerHTML = '<div class="admin-empty" style="grid-column:1 / -1; margin:0;">附件库里还没有图片</div>';
                    defaultMediaStatus();
                    return;
                }
                const frag = document.createDocumentFragment();
                data.items.forEach(item => frag.appendChild(createMediaCard(item)));
                mediaGrid.appendChild(frag);
                setMediaStatus(`已载入 ${data.items.length} 张图片，点击即可插入`);
            } catch (error) {
                mediaGrid.innerHTML = '<div class="admin-empty" style="grid-column:1 / -1; margin:0;">附件库读取失败，请刷新后重试</div>';
                setMediaStatus(error.message || '附件库读取失败');
            }
        };
        const parseJsonSafe = async (resp, emptyMessage, invalidMessage) => {
            const raw = await resp.text();
            if (!raw || !raw.trim()) {
                throw new Error(emptyMessage);
            }
            try {
                return JSON.parse(raw);
            } catch (e) {
                throw new Error(`${invalidMessage}：${raw.slice(0, 180)}`);
            }
        };
        const resolveCustomUploadUrl = (payload) => {
            if (!payload || typeof payload !== 'object') return '';
            if (typeof payload.url === 'string' && payload.url) return payload.url;
            if (payload.data && typeof payload.data.url === 'string' && payload.data.url) return payload.data.url;
            if (payload.result && typeof payload.result.url === 'string' && payload.result.url) return payload.result.url;
            if (payload.file && typeof payload.file.url === 'string' && payload.file.url) return payload.file.url;
            return '';
        };

        const saveRemoteRecord = async (finalUrl, fileName, fileSize, mimeType) => {
            const formData = new FormData();
            formData.append('_action', 'editor_image_save_remote');
            formData.append('_csrf', csrfToken);
            formData.append('file_url', finalUrl);
            formData.append('orig_name', fileName);
            formData.append('file_size', String(fileSize));
            formData.append('mime_type', mimeType || 'application/octet-stream');
            const resp = await fetch(<?= json_encode(url('admin/posts')) ?>, {
                method: 'POST',
                body: formData,
                headers: { 'X-Requested-With': 'XMLHttpRequest' }
            });
            const raw = await resp.text();
            let data;
            try {
                data = raw ? JSON.parse(raw) : null;
            } catch (e) {
                throw new Error(raw ? ('服务端返回异常：' + raw.slice(0, 160)) : '服务端返回空响应，请检查对象存储上传回调与附件入库日志');
            }
            if (!resp.ok) {
                throw new Error((data && data.error) ? data.error : '服务端返回异常');
            }
            return data;
        };
        const uploadMedia = async (file, options = {}) => {
            const mode = options.mode || 'editor';
            if (!file) return;
            if (mode === 'cover' && customCoverHint) {
                customCoverHint.textContent = ossEnabled ? '正在上传封面图到对象存储...' : '正在上传封面图到本地存储...';
            } else {
                setMediaStatus(ossEnabled ? '正在上传到对象存储，请稍候...' : '图片上传中，请稍候...');
            }
            try {
                let data;
                if (!ossEnabled) {
                    const formData = new FormData();
                    formData.append('_action', 'editor_image_upload');
                    formData.append('_csrf', csrfToken);
                    formData.append('file', file);
                    const resp = await fetch(<?= json_encode(url('admin/posts')) ?>, {
                        method: 'POST',
                        body: formData,
                        headers: { 'X-Requested-With': 'XMLHttpRequest' }
                    });
                    const raw = await resp.text();
                    try {
                        data = raw ? JSON.parse(raw) : null;
                    } catch (e) {
                        throw new Error(raw ? ('服务端返回异常：' + raw.slice(0, 160)) : '服务端返回空响应，请检查上传处理日志');
                    }
                    if (!resp.ok) {
                        throw new Error((data && data.error) ? data.error : '服务端返回异常');
                    }
                } else {
                    let blob = file;
                    let ext = (file.name.split('.').pop() || '').toLowerCase();
                    let mime = file.type || 'application/octet-stream';
                    if (file.type.startsWith('image/')) {
                        const canWebP = document.createElement('canvas').toDataURL('image/webp').indexOf('data:image/webp') === 0;
                        ext = canWebP ? 'webp' : (ext || 'jpg');
                        blob = await new Promise((resolve) => {
                            const reader = new FileReader();
                            reader.onload = (e) => {
                                const img = new Image();
                                img.onload = () => {
                                    const canvas = document.createElement('canvas');
                                    let w = img.width, h = img.height;
                                    const max = 1600;
                                    if (w > max || h > max) {
                                        if (w > h) { h *= max / w; w = max; } else { w *= max / h; h = max; }
                                    }
                                    canvas.width = w; canvas.height = h;
                                    const ctx = canvas.getContext('2d');
                                    ctx.drawImage(img, 0, 0, w, h);
                                    canvas.toBlob(resolve, canWebP ? 'image/webp' : (mime === 'image/png' ? 'image/png' : 'image/jpeg'), 0.85);
                                };
                                img.src = e.target.result;
                            };
                            reader.readAsDataURL(file);
                        });
                        mime = blob.type || mime;
                    }
                    const tokenForm = new FormData();
                    tokenForm.append('ext', ext || 'jpg');
                    const tokenResp = await fetch(ossTokenUrl, { method: 'POST', body: tokenForm, headers: { 'X-Requested-With': 'XMLHttpRequest' } });
                    if (!tokenResp.ok) throw new Error('对象存储签名获取失败');
                    const tokenData = await parseJsonSafe(tokenResp, '对象存储签名接口返回空响应', '对象存储签名接口返回了非 JSON 内容');
                    if (!tokenData.ok) throw new Error(tokenData.error || '对象存储签名异常');
                    let finalUrl = '';
                    if (tokenData.type === 'litepic') {
                        const fdLitePic = new FormData();
                        fdLitePic.append('_csrf', csrfToken);
                        fdLitePic.append('file', blob, file.name);
                        const litepicResp = await fetch((tokenData.data && tokenData.data.proxy_url) || '', {
                            method: 'POST',
                            body: fdLitePic,
                            headers: { 'X-Requested-With': 'XMLHttpRequest' }
                        });
                        const litepicData = await parseJsonSafe(litepicResp, 'LitePic 代理接口返回空响应', 'LitePic 代理接口返回了非 JSON 内容');
                        if (!litepicResp.ok || !litepicData.ok || !litepicData.item || !litepicData.item.url) {
                            throw new Error((litepicData && (litepicData.error || litepicData.message)) ? (litepicData.error || litepicData.message) : 'LitePic 上传失败');
                        }
                        data = litepicData;
                    } else if (tokenData.type === 'custom_api') {
                        const fdCustom = new FormData();
                        fdCustom.append('file', blob, file.name);
                        if (tokenData.data && tokenData.data.secret) fdCustom.append('secret', tokenData.data.secret);
                        const customResp = await fetch(tokenData.data.upload_url, { method: 'POST', body: fdCustom });
                        if (!customResp.ok) throw new Error('对象存储上传失败');
                        const customData = await parseJsonSafe(customResp, '自定义图床接口返回空响应', '自定义图床接口返回了非 JSON 内容');
                        const customUrl = resolveCustomUploadUrl(customData);
                        const customOk = customData.status === 'success' || customData.ok === true || customUrl !== '';
                        if (!customOk) throw new Error(customData.message || customData.error || '对象存储上传失败');
                        finalUrl = customUrl;
                    } else if (tokenData.type === 's4' || tokenData.type === 's3' || tokenData.type === 'upyun') {
                        const uploadUrl = (tokenData.data && tokenData.data.upload_url) || tokenData.upload_url || '';
                        const s3Resp = await fetch(uploadUrl, { method: 'PUT', body: blob, headers: { 'Content-Type': mime } });
                        if (!s3Resp.ok) throw new Error('对象存储上传失败');
                        finalUrl = (tokenData.data && tokenData.data.url) || tokenData.url || '';
                    } else {
                        const fdOss = new FormData();
                        fdOss.append('key', tokenData.data.key);
                        fdOss.append('OSSAccessKeyId', tokenData.data.accessid);
                        fdOss.append('policy', tokenData.data.policy);
                        fdOss.append('Signature', tokenData.data.signature);
                        fdOss.append('success_action_status', '200');
                        fdOss.append('file', blob, `file.${ext || 'jpg'}`);
                        const ossResp = await fetch(tokenData.data.host, { method: 'POST', body: fdOss });
                        if (!ossResp.ok) throw new Error('对象存储上传失败');
                        finalUrl = (tokenData.data && tokenData.data.url) || tokenData.url || '';
                    }
                    if (!finalUrl || finalUrl === 'undefined') throw new Error('对象存储返回地址异常');
                    data = await saveRemoteRecord(finalUrl, file.name, blob.size || file.size, mime);
                }
                if (!data.ok || !data.item || !data.item.url) throw new Error(data.error || '上传失败');
                if (mode === 'cover') {
                    if (customCoverInput) customCoverInput.value = data.item.url;
                    if (customCoverHint) customCoverHint.textContent = `封面图已上传并回填：${data.item.name || file.name}`;
                } else {
                    insertImageMarkdown(data.item.url, data.item.name || file.name);
                    setMediaStatus(`上传成功，已插入：${data.item.name || file.name}`);
                    closeMedia();
                }
                await loadMediaLibrary();
            } catch (error) {
                if (mode === 'cover' && customCoverHint) {
                    customCoverHint.textContent = error.message || '封面图上传失败';
                } else {
                    setMediaStatus(error.message || '上传失败');
                }
                alert(error.message || '上传失败');
            } finally {
                if (mediaInput) mediaInput.value = '';
            }
        };


        const insertColorBlock = (color) => {
            const start = editor.selectionStart;
            const end = editor.selectionEnd;
            const text = editor.value;
            const selected = text.substring(start, end) || '彩色文本';
            const block = `[color=${color}]${selected}[/color]`;
            editor.value = text.substring(0, start) + block + text.substring(end);
            editor.focus();
            editor.setSelectionRange(start, start + block.length);
            hideColorPop();
        };
        if (colorPop) {
            colorPop.addEventListener('click', function(ev){
                const swatch = ev.target.closest('[data-color]');
                if (!swatch) return;
                ev.preventDefault();
                ev.stopPropagation();
                insertColorBlock(swatch.getAttribute('data-color') || '#ff4d4f');
            });
        }
        window.addEventListener('resize', placeColorPop);
        window.addEventListener('scroll', placeColorPop, true);
        document.addEventListener('click', function(ev){
            if (!colorPop || colorPop.hidden) return;
            if ((colorButton && colorButton.contains(ev.target)) || colorPop.contains(ev.target)) return;
            hideColorPop();
        });

        btns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                const act = btn.getAttribute('data-act');
                const start = editor.selectionStart;
                const end = editor.selectionEnd;
                const text = editor.value;
                const selected = text.substring(start, end);
                let pre = '', post = '', def = '';
                switch (act) {
                    case 'bold':
                        pre = '**';
                        post = '**';
                        def = '粗体文本';
                        break;
                    case 'italic':
                        pre = '*';
                        post = '*';
                        def = '斜体文本';
                        break;
                    case 'h2':
                        pre = "\n## ";
                        def = '标题';
                        break;
                    case 'quote':
                        pre = "\n> ";
                        def = '引用文本';
                        break;
                    case 'ul':
                        pre = "\n- ";
                        def = '列表项';
                        break;
                    case 'link':
                        pre = '[';
                        post = '](https://)';
                        def = '链接文本';
                        break;
                    case 'code':
                        pre = "\n```php\n";
                        post = "\n```\n";
                        def = '代码块';
                        break;
                    case 'color':
                        if (colorPop) {
                            if (colorPop.hidden) showColorPop(); else hideColorPop();
                        }
                        return;
                    case 'collapse': {
                        const defaultTitle = '点击展开标题';
                        const defaultBody = selected || '这里填写折叠内容，支持 Markdown / 短代码 / 代码块';
                        const block = `
[collapse title="${defaultTitle}"]
${defaultBody}
[/collapse]
`;
                        editor.value = text.substring(0, start) + block + text.substring(end);
                        editor.focus();
                        const titleStart = start + block.indexOf(defaultTitle);
                        const titleEnd = titleStart + defaultTitle.length;
                        editor.setSelectionRange(titleStart, titleEnd);
                        return;
                    }
                    case 'download': {
                        const dlTitle = (window.prompt('下载卡片标题', selected || '资源下载') || '').trim() || '资源下载';
                        const dlDesc = (window.prompt('下载卡片描述', '填写资源简介或版本说明') || '').trim() || '填写资源简介或版本说明';
                        const dlUrl = (window.prompt('下载地址', 'https://') || '').trim() || 'https://';
                        const dlCode = (window.prompt('提取码 / 备注（可留空）', '') || '').trim();
                        const codeAttr = dlCode !== '' ? ` code="${dlCode.replace(/"/g, '&quot;')}"` : '';
                        const block = `\n[download title="${dlTitle.replace(/"/g, '&quot;')}" desc="${dlDesc.replace(/"/g, '&quot;')}" url="${dlUrl.replace(/"/g, '&quot;')}"${codeAttr}]\n`;
                        editor.value = text.substring(0, start) + block + text.substring(end);
                        editor.focus();
                        editor.setSelectionRange(start, start + block.length);
                        return;
                    }
                    case 'video': {
                        let rawUrl = window.prompt('请输入视频地址：支持 mp4 直链、B站 BV/av 链接', selected || '');
                        if (!rawUrl) return;
                        rawUrl = rawUrl.trim();
                        if (!rawUrl) return;
                        if (/^BV[0-9A-Za-z]+$/i.test(rawUrl)) {
                            rawUrl = 'https://www.bilibili.com/video/' + rawUrl;
                        } else if (/^av\d+$/i.test(rawUrl)) {
                            rawUrl = 'https://www.bilibili.com/video/' + rawUrl;
                        }
                        let ratioSuffix = '';
                        if (/(?:www\.)?bilibili\.com\/video\/|^BV[0-9A-Za-z]+$|^av\d+$/i.test(rawUrl)) {
                            const ratioInput = window.prompt('请输入视频比例：横屏填 16:9，竖屏填 9:16。直接回车默认 16:9', '16:9');
                            if (ratioInput && /9\s*:\s*16/.test(ratioInput)) {
                                ratioSuffix = '|9:16';
                            }
                        }
                        const block = "\n[video]" + rawUrl + ratioSuffix + "[/video]\n";
                        editor.value = text.substring(0, start) + block + text.substring(end);
                        editor.focus();
                        editor.setSelectionRange(start + block.length, start + block.length);
                        return;
                    }
                    default:
                        return;
                }
                const insertText = selected || def;
                editor.value = text.substring(0, start) + pre + insertText + post + text.substring(end);
                editor.focus();
                if (selected) {
                    editor.setSelectionRange(start, start + pre.length + insertText.length + post.length);
                } else {
                    editor.setSelectionRange(start + pre.length, start + pre.length + insertText.length);
                }
            });
        });

        if (previewRefreshBtn) previewRefreshBtn.addEventListener('click', refreshPreview);
        if (titleInput) titleInput.addEventListener('input', queuePreview);
        editor.addEventListener('compositionstart', () => { isComposing = true; });
        editor.addEventListener('compositionend', () => { isComposing = false; queuePreview(); });
        editor.addEventListener('input', queuePreview);
        setTimeout(refreshPreview, 80);

        editor.addEventListener('keydown', function(e) {
            if (e.key === 'Tab') {
                e.preventDefault();
                const start = this.selectionStart;
                const end = this.selectionEnd;
                this.value = this.value.substring(0, start) + '    ' + this.value.substring(end);
                this.selectionStart = this.selectionEnd = start + 4;
            }
        });

        if (openMediaBtn) openMediaBtn.addEventListener('click', openMedia);
        if (closeMediaBtn) closeMediaBtn.addEventListener('click', closeMedia);
        if (refreshMediaBtn) refreshMediaBtn.addEventListener('click', loadMediaLibrary);
        if (uploadMediaBtn && mediaInput) {
            uploadMediaBtn.addEventListener('click', () => mediaInput.click());
            mediaInput.addEventListener('change', () => uploadMedia(mediaInput.files[0] || null));
        }
        if (customCoverUploadBtn && customCoverFileInput) {
            customCoverUploadBtn.addEventListener('click', () => customCoverFileInput.click());
            customCoverFileInput.addEventListener('change', () => uploadMedia(customCoverFileInput.files[0] || null, { mode: 'cover' }));
        }
        if (mediaModal) {
            mediaModal.addEventListener('click', (e) => {
                if (e.target === mediaModal) closeMedia();
            });
        }
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && mediaModal && mediaModal.classList.contains('is-active')) {
                closeMedia();
            }
        });
    });
    </script>
<?php
} else {
    $statusFilter = in_array($_GET['status'] ?? '', ['published', 'draft', 'private'], true) ? (string)($_GET['status'] ?? '') : '';
    $keyword = clean((string)($_GET['keyword'] ?? ''), 100);
    $categoryFilter = max(0, (int)($_GET['category_id'] ?? 0));
    $tagFilter = max(0, (int)($_GET['tag_id'] ?? 0));
    $pageTitle = $statusFilter === 'draft' && $postType === 'post' ? '文章草稿箱' : ($postTypeLabel . '列表');
    $page = max(1, (int)($_GET['page']??1)); $perPage = 15; $offset = ($page-1)*$perPage;
    $whereParts = [$postType==='page'?"p.type='page'":"p.type='post'"];
    $joins = " LEFT JOIN `{$p}categories` c ON p.category_id=c.id ";
    $params = [];
    if ($statusFilter !== '') { $whereParts[] = "p.status=?"; $params[] = $statusFilter; }
    if ($keyword !== '') {
        $kw = '%' . $keyword . '%';
        $whereParts[] = "(p.title LIKE ? OR p.content LIKE ? OR p.excerpt LIKE ?)";
        array_push($params, $kw, $kw, $kw);
    }
    if ($categoryFilter > 0) { $whereParts[] = "p.category_id=?"; $params[] = $categoryFilter; }
    if ($tagFilter > 0) { $joins .= " INNER JOIN `{$p}post_tags` ptf ON ptf.post_id=p.id "; $whereParts[] = "ptf.tag_id=?"; $params[] = $tagFilter; }
    $whereSql = implode(' AND ', $whereParts);
    $total = (int)db_value("SELECT COUNT(DISTINCT p.id) FROM `{$p}posts` p {$joins} WHERE {$whereSql}", $params);
    $posts = db_rows("SELECT DISTINCT p.*, c.name as cat_name FROM `{$p}posts` p {$joins} WHERE {$whereSql} ORDER BY p.is_pinned DESC, p.published_at DESC, p.created_at DESC, p.id DESC LIMIT {$perPage} OFFSET {$offset}", $params);
    $categoriesForFilter = db_rows("SELECT `id`,`name` FROM `{$p}categories` ORDER BY `sort_order` ASC, `id` ASC");
    $tagsForFilter = db_rows("SELECT `id`,`name` FROM `{$p}tags` ORDER BY `post_count` DESC, `name` ASC LIMIT 200");
    $totalPages = ceil($total/$perPage);
    $statusMap = [ 'published' => '已发布', 'draft' => '草稿', 'private' => '私密' ];
?>
    <div class="post-list-toolbar">
        <div class="post-list-toolbar__group post-list-toolbar__group--switch">
            <a href="<?=url('admin/posts?type=post')?>" class="btn <?=$postType==='post'?'btn-primary':'btn-ghost'?>">文章</a>
            <a href="<?=url('admin/posts?type=page')?>" class="btn <?=$postType==='page'?'btn-primary':'btn-ghost'?>">页面</a>
        </div>

        <div class="post-list-toolbar__group post-list-toolbar__group--actions">
            <?php if($postType==='post'): ?>
            <a href="<?= url('admin/posts?type=post&status=draft') ?>" class="btn <?= $statusFilter==='draft' ? 'btn-primary' : 'btn-ghost' ?>">草稿箱</a>
            <a href="<?= url('admin/posts?type=post') ?>" class="btn <?= $statusFilter==='' ? 'btn-primary' : 'btn-ghost' ?>">全部文章</a>
            <?php endif; ?>
            <button type="submit" form="batchForm" id="batchDeleteBtn" class="btn btn-ghost is-danger post-list-toolbar__batch" style="display:none;" onclick="return confirm('警告：确定要永久抹除选中的内容吗？')">
                <i class="ri-delete-bin-line"></i> 批量删除 (<span id="batchCount">0</span>)
            </button>
            <a href="<?= url('admin/posts?action=new&type='.$postType) ?>" class="btn btn-primary post-list-toolbar__create">
                <i class="ri-add-line"></i> 新建
            </a>
        </div>
    </div>

    <form method="GET" action="<?=url('admin/posts')?>" class="card" style="padding:16px; margin-bottom:16px; display:grid; grid-template-columns:2fr 1fr 1fr auto; gap:12px; align-items:end;">
        <input type="hidden" name="type" value="<?=e($postType)?>">
        <?php if($statusFilter !== ''): ?><input type="hidden" name="status" value="<?=e($statusFilter)?>"><?php endif; ?>
        <div><label class="admin-stat__label">关键词</label><input class="form-input" type="text" name="keyword" value="<?=e($keyword)?>" placeholder="检索标题 / 摘要 / 正文"></div>
        <div><label class="admin-stat__label">分类</label><select class="form-input" name="category_id"><option value="0">全部分类</option><?php foreach($categoriesForFilter as $fc): ?><option value="<?=$fc['id']?>" <?=$categoryFilter===(int)$fc['id']?'selected':''?>><?=e($fc['name'])?></option><?php endforeach; ?></select></div>
        <div><label class="admin-stat__label">标签</label><select class="form-input" name="tag_id"><option value="0">全部标签</option><?php foreach($tagsForFilter as $ft): ?><option value="<?=$ft['id']?>" <?=$tagFilter===(int)$ft['id']?'selected':''?>><?=e($ft['name'])?></option><?php endforeach; ?></select></div>
        <div style="display:flex; gap:8px;"><button class="btn btn-primary" type="submit"><i class="ri-search-line"></i> 检索</button><a class="btn btn-ghost" href="<?=url('admin/posts?type=' . $postType . ($statusFilter!=='' ? '&status=' . $statusFilter : ''))?>">重置</a></div>
    </form>

    <form id="batchForm" method="POST" action="<?=url('admin/posts')?>">
        <?=csrf_field()?>
        <input type="hidden" name="_action" value="batch_delete">
        <input type="hidden" name="type" value="<?=e($postType)?>">

        <div class="card" style="padding:0; overflow:hidden;">
            <div class="table-wrap">
                <table class="table">
                    <thead>
                        <tr>
                            <th style="width:40px; text-align:center; padding:12px 0 12px 16px;">
                                <input type="checkbox" id="selectAll" style="cursor:pointer; width:16px; height:16px; accent-color:var(--color-primary);">
                            </th>
                            <th width="40%">标题</th>
                            <?php if($postType==='post'): ?><th>分类</th><?php endif; ?>
                            <th>状态</th>
                            <th>数据</th>
                            <th>日期</th>
                            <th style="text-align:right">操作</th>
                        </tr>
                    </thead>
                    <tbody>
                    <?php foreach($posts as $row): ?>
                        <tr>
                            <td data-label="选择" style="text-align:center; padding:12px 0 12px 16px;">
                                <input type="checkbox" name="ids[]" value="<?=$row['id']?>" class="row-checkbox" style="cursor:pointer; width:16px; height:16px; accent-color:var(--color-primary);">
                            </td>
                            <td data-label="标题">
                                <a href="<?=url("admin/posts?action=edit&id={$row['id']}")?>" style="font-weight:600; color:var(--color-text-1);">
                                    <?=e($row['title']?:'无标题')?>
                                </a>
                                <?php if($row['is_pinned']): ?><i class="ri-pushpin-fill" style="color:var(--color-danger); vertical-align:middle; margin-left:4px;" title="置顶"></i><?php endif; ?>
                                <?php if(!empty($row['password'])): ?><i class="ri-lock-line" style="color:var(--color-text-3); font-size:12px;"></i><?php endif; ?>
                            </td>
                            <?php if($postType==='post'): ?>
                                <td data-label="分类"><span class="badge" style="background:var(--color-fill); color:var(--color-text-2);"><?=e($row['cat_name']??'未分类')?></span></td>
                            <?php endif; ?>
                            <td data-label="状态"><span class="badge badge-<?=e($row['status'])?>"><?=$statusMap[$row['status']] ?? $row['status']?></span></td>
                            <td data-label="数据" style="font-size:12px; color:var(--color-text-3);">
                                <span style="margin-right:8px;"><i class="ri-message-3-line"></i> <?=$row['comment_count']?></span>
                                <span><i class="ri-eye-line"></i> <?=$row['view_count']?></span>
                            </td>
                            <td data-label="日期" style="font-size:12px; color:var(--color-text-3);"><?=date('Y-m-d', strtotime($row['published_at']))?></td>
                            <td data-label="操作">
                                <div style="display:flex; gap:8px; justify-content:flex-end;">
                                    <a href="<?=url("admin/posts?action=edit&id={$row['id']}")?>" class="btn btn-ghost icon-btn" title="编辑"><i class="ri-edit-line"></i></a>
                                    <a href="<?=url(($postType==='page'?'page/':'post/').$row['slug'])?>" target="_blank" class="btn btn-ghost icon-btn" title="预览"><i class="ri-eye-line"></i></a>
                                </div>
                            </td>
                        </tr>
                    <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
            <?php if(empty($posts)): ?><div class="admin-empty">暂无内容</div><?php endif; ?>
        </div>
    </form>
    
    <?php if($totalPages>1): ?>
    <div style="display:flex; justify-content:center; gap:8px; margin-top:20px;">
        <a href="<?=url("admin/posts?type={$postType}&page=".max(1,$page-1))?>" class="btn btn-ghost"><i class="ri-arrow-left-s-line"></i></a>
        <span class="btn" style="background:#fff; border-color:var(--color-border); cursor:default;"><?=$page?> / <?=$totalPages?></span>
        <a href="<?=url("admin/posts?type={$postType}&page=".min($totalPages,$page+1))?>" class="btn btn-ghost"><i class="ri-arrow-right-s-line"></i></a>
    </div>
    <?php endif; ?>



    <div class="editor-media-modal" id="js-editor-media-modal" aria-hidden="true">
        <div class="editor-media-panel">
            <div class="editor-media-panel__header">
                <div>
                    <div class="editor-media-panel__title">插入图片</div>
                    <div style="font-size:12px; color:var(--color-text-3); margin-top:4px;">可直接上传，也可从附件库挑选后插入 Markdown 编辑器</div>
                </div>
                <button type="button" class="btn btn-ghost" id="js-editor-media-close">关闭</button>
            </div>
            <div class="editor-media-panel__body">
                <div class="editor-media-uploader">
                    <input type="file" id="js-editor-media-input" accept="image/*" style="display:none;">
                    <button type="button" class="btn btn-primary" id="js-editor-media-upload">上传图片</button>
                    <button type="button" class="btn btn-ghost" id="js-editor-media-refresh">刷新附件库</button>
                    <div class="editor-media-uploader__status" id="js-editor-media-status"><?= limhy_storage_oss_enabled() ? '当前上传目标：对象存储，请选择一张图片插入正文' : '当前上传目标：本地存储，请选择一张图片插入正文' ?></div>
                </div>
                <div class="editor-media-grid" id="js-editor-media-grid"></div>
            </div>
        </div>
    </div>

    <script>
    document.addEventListener('DOMContentLoaded', () => {
        const selectAll = document.getElementById('selectAll');
        const checkboxes = document.querySelectorAll('.row-checkbox');
        const batchDeleteBtn = document.getElementById('batchDeleteBtn');
        const batchCount = document.getElementById('batchCount');

        if (!selectAll || !batchDeleteBtn) return;

        const syncState = () => {
            const checkedBoxes = document.querySelectorAll('.row-checkbox:checked');
            const totalChecked = checkedBoxes.length;
            if (totalChecked > 0) { batchDeleteBtn.style.display = 'inline-flex'; batchCount.textContent = totalChecked; } 
            else { batchDeleteBtn.style.display = 'none'; }
            selectAll.checked = (totalChecked === checkboxes.length && checkboxes.length > 0);
        };
        selectAll.addEventListener('change', (e) => { checkboxes.forEach(cb => cb.checked = e.target.checked); syncState(); });
        checkboxes.forEach(cb => cb.addEventListener('change', syncState));
    });
    </script>
<?php } 
$content = ob_get_clean(); require __DIR__ . '/layout.php';

