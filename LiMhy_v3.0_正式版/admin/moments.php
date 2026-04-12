<?php
declare(strict_types=1);
require_once __DIR__ . '/../index.php';

$p = prefix();
$currentNav = 'moments';
$pageTitle = '动态管理';
$openEditId = max(0, (int)($_GET['open_edit'] ?? 0));

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $act = (string)($_POST['_action'] ?? '');

    if ($act === 'delete') {
        $id = (int)($_POST['id'] ?? 0);
        if ($id > 0) {
            db_execute("DELETE FROM `{$p}moments` WHERE `id`=?", [$id]);
            if (function_exists('clear_html_cache')) {
                clear_html_cache();
            }
        }
        set_flash('success', '目标动态已被彻底抹除');
        redirect('admin/moments');
    }

    if ($act === 'batch_delete') {
        $ids = array_values(array_filter(array_map('intval', (array)($_POST['ids'] ?? []))));
        if (!$ids) {
            set_flash('error', '请至少勾选一条动态');
            redirect('admin/moments');
        }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        db_execute("DELETE FROM `{$p}moments` WHERE `id` IN ({$placeholders})", $ids);
        if (function_exists('clear_html_cache')) { clear_html_cache(); }
        set_flash('success', '已批量删除 ' . count($ids) . ' 条动态');
        redirect('admin/moments');
    }

    if ($act === 'edit') {
        $id = (int)($_POST['id'] ?? 0);
        $content = trim((string)($_POST['content'] ?? ''));
        $imagesRaw = trim((string)($_POST['images_json'] ?? '[]'));
        $images = json_decode($imagesRaw, true);
        if ($content === '') {
            set_flash('error', '动态内容不能为空');
            redirect('admin/moments?open_edit=' . $id);
        }
        if (!is_array($images)) {
            $images = [];
        }
        $cleanImages = [];
        foreach ($images as $img) {
            $img = trim((string)$img);
            if ($img !== '' && mb_strlen($img) <= 1000) {
                $cleanImages[] = $img;
            }
        }
        db_execute("UPDATE `{$p}moments` SET `content`=?, `images`=? WHERE `id`=?", [
            $content,
            json_encode(array_values($cleanImages), JSON_UNESCAPED_UNICODE),
            $id,
        ]);
        if (function_exists('clear_html_cache')) {
            clear_html_cache();
        }
        set_flash('success', '动态已更新');
        redirect('admin/moments');
    }
}

$page = max(1, (int)($_GET['page'] ?? 1));
$perPage = 15;
$offset = ($page - 1) * $perPage;
$total = (int)db_value("SELECT COUNT(*) FROM `{$p}moments`");
$totalPages = max(1, (int)ceil($total / $perPage));
$moments = db_rows("SELECT * FROM `{$p}moments` ORDER BY `created_at` DESC LIMIT {$perPage} OFFSET {$offset}");

ob_start();
?>
<style>
.moment-edit-grid { display:grid; gap:12px; }
.moment-thumb-list { display:flex; gap:8px; flex-wrap:wrap; margin-top:8px; }
.moment-thumb-list img { width:60px; height:60px; object-fit:cover; border-radius:8px; border:1px solid var(--color-border); }
.edit-row td { background:#fafcff; }
.edit-box { padding:16px; border:1px solid var(--color-border); border-radius:10px; background:#fff; }
[data-admin-theme="dark"] .edit-row td { background:#1f2937; }
[data-admin-theme="dark"] .edit-box { background:#111827; border-color:#334155; }
</style>
<form method="POST" action="<?=url('admin/moments')?>" onsubmit="return confirm('确定批量删除所选动态吗？此操作不可恢复。');">
    <?=csrf_field()?>
    <input type="hidden" name="_action" value="batch_delete">
    <div style="display:flex; justify-content:flex-end; gap:10px; margin-bottom:14px;">
        <button type="submit" class="btn btn-ghost is-danger"><i class="ri-delete-bin-line"></i> 批量删除</button>
    </div>
<div class="card" style="padding:0; overflow:hidden;">
    <div class="table-wrap">
        <table class="table">
            <thead>
                <tr>
                    <th width="52"><input type="checkbox" data-check-all></th><th width="44%">内容摘要</th>
                    <th>影像附着</th>
                    <th>发射时间</th>
                    <th style="text-align:right">操作</th>
                </tr>
            </thead>
            <tbody>
            <?php foreach($moments as $row):
                $images = json_decode($row['images'] ?: '[]', true);
                if (!is_array($images)) $images = [];
                $imgCount = count($images);
                $isEdit = $openEditId === (int)$row['id'];
            ?>
                <tr>
                    <td data-label="选择"><input type="checkbox" name="ids[]" value="<?=$row['id']?>" class="row-check"></td>
                    <td data-label="内容摘要"><div style="font-size:13px; line-height:1.5; color:var(--color-text-1);"><?=e(mb_substr($row['content'], 0, 120))?><?=mb_strlen($row['content'])>120?'...':''?></div></td>
                    <td data-label="影像附着">
                        <?php if($imgCount > 0): ?>
                            <span class="badge" style="background:var(--color-primary-light); color:var(--color-primary);"><?= $imgCount ?> 张</span>
                        <?php else: ?>
                            <span style="color:var(--color-text-3); font-size:12px;">纯文本</span>
                        <?php endif; ?>
                    </td>
                    <td data-label="发射时间" style="font-size:12px; color:var(--color-text-3);"><?=date('Y-m-d H:i', strtotime($row['created_at']))?></td>
                    <td data-label="操作">
                        <div style="display:flex; gap:8px; justify-content:flex-end;">
                            <a href="<?=url($isEdit ? 'admin/moments' : ('admin/moments?open_edit=' . (int)$row['id']))?>" class="btn btn-ghost icon-btn" title="编辑动态"><i class="ri-edit-line"></i></a>
                            <form method="POST" action="<?=url('admin/moments')?>" onsubmit="return confirm('警告：确认将该条动态从数据库物理抹除？')">
                                <?=csrf_field()?>
                                <input type="hidden" name="_action" value="delete">
                                <input type="hidden" name="id" value="<?=$row['id']?>">
                                <button type="submit" class="btn btn-ghost icon-btn is-danger" title="执行销毁"><i class="ri-delete-bin-line"></i></button>
                            </form>
                        </div>
                    </td>
                </tr>
                <?php if ($isEdit): ?>
                <tr class="edit-row">
                    <td colspan="5">
                        <div class="edit-box">
                            <div style="font-size:16px;font-weight:600;color:var(--color-text-1);margin-bottom:12px;">编辑动态</div>
                            <form method="POST" action="<?=url('admin/moments?open_edit=' . (int)$row['id'])?>" class="moment-edit-grid">
                                <?=csrf_field()?>
                                <input type="hidden" name="_action" value="edit">
                                <input type="hidden" name="id" value="<?=$row['id']?>">
                                <div>
                                    <label class="admin-stat__label">动态内容</label>
                                    <textarea name="content" class="form-textarea" rows="5" required><?=e((string)$row['content'])?></textarea>
                                </div>
                                <div>
                                    <label class="admin-stat__label">图片数组 JSON</label>
                                    <textarea name="images_json" class="form-textarea" rows="4" placeholder='["https://..."]'><?=e(json_encode(array_values($images), JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT))?></textarea>
                                    <?php if ($images): ?>
                                    <div class="moment-thumb-list">
                                        <?php foreach ($images as $img): ?>
                                            <img src="<?=e((string)$img)?>" alt="thumb">
                                        <?php endforeach; ?>
                                    </div>
                                    <?php endif; ?>
                                </div>
                                <div style="display:flex;justify-content:flex-end;gap:10px;">
                                    <a href="<?=url('admin/moments')?>" class="btn btn-ghost">取消</a>
                                    <button type="submit" class="btn btn-primary"><i class="ri-save-3-line"></i> 保存修改</button>
                                </div>
                            </form>
                        </div>
                    </td>
                </tr>
                <?php endif; ?>
            <?php endforeach; ?>
            </tbody>
        </table>
    </div>
    <?php if(empty($moments)): ?>
        <div class="admin-empty">当前环境无任何动态数据存留</div>
    <?php endif; ?>
</div>
</form>
<script>document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('[data-check-all]').forEach(function(all){all.addEventListener('change',function(){var table=all.closest('table');if(!table)return;table.querySelectorAll('.row-check').forEach(function(el){el.checked=all.checked;});});});});</script>
<?php if($totalPages > 1): ?>
<div style="display:flex; justify-content:center; gap:8px; margin-top:20px;">
    <a href="<?=url('admin/moments?page='.max(1, $page-1))?>" class="btn btn-ghost"><i class="ri-arrow-left-s-line"></i></a>
    <span class="btn" style="background:#fff; border-color:var(--color-border); cursor:default;"><?=$page?> / <?=$totalPages?></span>
    <a href="<?=url('admin/moments?page='.min($totalPages, $page+1))?>" class="btn btn-ghost"><i class="ri-arrow-right-s-line"></i></a>
</div>
<?php endif; ?>
<?php
$content = ob_get_clean();
require __DIR__ . '/layout.php';
