<?php
/**
 * LiMhy - 分类管理控制器
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    提供文章分类目录的增删改查业务逻辑
 */
require_once __DIR__ . '/../index.php';
$p = prefix(); $currentNav = 'categories'; $pageTitle = '分类管理';

// 1. 数据变更网关
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $act = $_POST['_action'] ?? '';

    if ($act === 'save') {
        $id=(int)($_POST['id']??0); $name=clean($_POST['name']??'',100); $slug=clean($_POST['slug']??'',100); $desc=clean($_POST['description']??'',500); $sort=(int)($_POST['sort_order']??0);
        if ($name === '') { set_flash('error','名称不能为空'); redirect('admin/categories'); }
        if ($slug === '') { $slug=trim(strtolower(preg_replace('/[^a-zA-Z0-9]+/','-',$name)),'-')?:'cat-'.time(); }
        $exists = db_value("SELECT COUNT(*) FROM `{$p}categories` WHERE `slug`=? AND `id`!=?",[$slug,$id]);
        if ($exists) $slug.='-'.rand(10,99);

        if ($id>0) db_execute("UPDATE `{$p}categories` SET `name`=?,`slug`=?,`description`=?,`sort_order`=? WHERE `id`=?",[$name,$slug,$desc,$sort,$id]);
        else db_execute("INSERT INTO `{$p}categories` (`name`,`slug`,`description`,`sort_order`) VALUES (?,?,?,?)",[$name,$slug,$desc,$sort]);
        
        update_category_counts();
        set_flash('success','保存成功'); redirect('admin/categories');
    }
    if ($act === 'delete') {
        $id=(int)$_POST['id'];
        db_execute("UPDATE `{$p}posts` SET `category_id`=NULL WHERE `category_id`=?",[$id]);
        db_execute("DELETE FROM `{$p}categories` WHERE `id`=?",[$id]);
        update_category_counts();
        set_flash('success','删除成功'); redirect('admin/categories');
    }
    if ($act === 'batch_delete') {
        $ids = array_values(array_filter(array_map('intval', (array)($_POST['ids'] ?? []))));
        if (!$ids) { set_flash('error','请至少勾选一个分类'); redirect('admin/categories'); }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        db_execute("UPDATE `{$p}posts` SET `category_id`=NULL WHERE `category_id` IN ({$placeholders})", $ids);
        db_execute("DELETE FROM `{$p}categories` WHERE `id` IN ({$placeholders})", $ids);
        update_category_counts();
        set_flash('success','已批量删除 ' . count($ids) . ' 个分类'); redirect('admin/categories');
    }
}

// 2. 数据拉取与渲染
$categories = db_rows("SELECT * FROM `{$p}categories` ORDER BY `sort_order` ASC, `id` ASC");
$editCat = isset($_GET['edit']) ? db_row("SELECT * FROM `{$p}categories` WHERE `id`=?",[(int)$_GET['edit']]) : null;

ob_start();
?>
<div class="split-layout">
    <div class="card">
        <div class="card-header"><div class="card-title"><?=$editCat?'编辑分类':'新建分类'?></div></div>
        <form method="POST" action="<?=url('admin/categories')?>">
            <?=csrf_field()?>
            <input type="hidden" name="_action" value="save">
            <input type="hidden" name="id" value="<?=$editCat['id']??0?>">
            <div style="margin-bottom:16px"><label class="admin-stat__label">名称 *</label><input type="text" name="name" class="form-input" required value="<?=e($editCat['name']??'')?>"></div>
            <div style="margin-bottom:16px"><label class="admin-stat__label">别名</label><input type="text" name="slug" class="form-input" placeholder="自动生成" value="<?=e($editCat['slug']??'')?>"></div>
            <div style="margin-bottom:16px"><label class="admin-stat__label">描述</label><textarea name="description" class="form-textarea" rows="2"><?=e($editCat['description']??'')?></textarea></div>
            <div style="margin-bottom:16px"><label class="admin-stat__label">排序</label><input type="number" name="sort_order" class="form-input" value="<?=$editCat['sort_order']??0?>"></div>
            <div style="display:flex; gap:10px;">
                <button type="submit" class="btn btn-primary">保存</button>
                <?php if($editCat): ?><a href="<?=url('admin/categories')?>" class="btn btn-ghost">取消</a><?php endif; ?>
            </div>
        </form>
    </div>
    <form method="POST" action="<?=url('admin/categories')?>" onsubmit="return confirm('确定批量删除所选分类吗？相关文章将回退为未分类。');">
        <?=csrf_field()?>
        <input type="hidden" name="_action" value="batch_delete">
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-bottom:14px;">
            <button type="submit" class="btn btn-ghost is-danger"><i class="ri-delete-bin-line"></i> 批量删除</button>
        </div>
    <div class="card" style="padding:0; overflow:hidden;">
        <div class="table-wrap">
            <table class="table">
                <thead><tr><th width="52"><input type="checkbox" data-check-all></th><th>名称</th><th>别名</th><th>文章数</th><th>排序</th><th style="text-align:right">操作</th></tr></thead>
                <tbody>
                <?php foreach($categories as $cat): ?>
                <tr>
                    <td data-label="选择"><input type="checkbox" name="ids[]" value="<?=$cat['id']?>" class="row-check"></td>
                    <td data-label="名称" style="font-weight:500"><?=e($cat['name'])?></td>
                    <td data-label="别名" style="color:var(--color-text-3)"><?=e($cat['slug'])?></td>
                    <td data-label="文章"><span class="badge" style="background:var(--color-fill)"><?=$cat['post_count']?></span></td>
                    <td data-label="排序"><?=$cat['sort_order']?></td>
                    <td data-label="操作">
                        <div style="display:flex; gap:8px; justify-content:flex-end;">
                            <a href="<?=url("admin/categories?edit={$cat['id']}")?>" class="btn btn-ghost icon-btn"><i class="ri-edit-line"></i></a>
                            <form method="POST" action="<?=url('admin/categories')?>" onsubmit="return confirm('确定删除？')">
                                <?=csrf_field()?> <input type="hidden" name="_action" value="delete"> <input type="hidden" name="id" value="<?=$cat['id']?>">
                                <button class="btn btn-ghost icon-btn is-danger"><i class="ri-delete-bin-line"></i></button>
                            </form>
                        </div>
                    </td>
                </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php if(empty($categories)): ?><div class="admin-empty">暂无分类</div><?php endif; ?>
    </div>
    </div>
    </form>
</div>
<script>document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('[data-check-all]').forEach(function(all){all.addEventListener('change',function(){var table=all.closest('table');if(!table)return;table.querySelectorAll('.row-check').forEach(function(el){el.checked=all.checked;});});});});</script>
<?php $content = ob_get_clean(); require __DIR__ . '/layout.php'; ?>
