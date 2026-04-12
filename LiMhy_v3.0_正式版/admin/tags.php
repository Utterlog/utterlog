<?php
/**
 * LiMhy - 标签云数据流控制器
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    提供内容标签的声明、合并及数据表索引关联
 */
require_once __DIR__ . '/../index.php';
$p = prefix(); $currentNav = 'tags'; $pageTitle = '标签管理';

// 1. 数据交互处理
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $act = $_POST['_action'] ?? '';
    
    if ($act === 'save') {
        $id=(int)($_POST['id']??0); $name=clean($_POST['name']??'',50); $slug=clean($_POST['slug']??'',100);
        if ($name==='') { set_flash('error','识别名不可空置'); redirect('admin/tags'); }
        if ($slug==='') { $slug=trim(strtolower(preg_replace('/[^a-zA-Z0-9]+/','-',$name)),'-')?:'tag-'.time(); }
        $exists=db_value("SELECT COUNT(*) FROM `{$p}tags` WHERE `slug`=? AND `id`!=?",[$slug,$id]);
        if($exists) $slug.='-'.rand(10,99);
        
        if($id>0) db_execute("UPDATE `{$p}tags` SET `name`=?,`slug`=? WHERE `id`=?",[$name,$slug,$id]);
        else db_execute("INSERT INTO `{$p}tags` (`name`,`slug`) VALUES (?,?)",[$name,$slug]);
        
        update_tag_counts(); set_flash('success','索引合并成功'); redirect('admin/tags');
    }
    
    if ($act === 'delete') {
        $id=(int)$_POST['id'];
        db_execute("DELETE FROM `{$p}post_tags` WHERE `tag_id`=?",[$id]);
        db_execute("DELETE FROM `{$p}tags` WHERE `id`=?",[$id]);
        set_flash('success','标签已粉碎'); redirect('admin/tags');
    }
    if ($act === 'batch_delete') {
        $ids = array_values(array_filter(array_map('intval', (array)($_POST['ids'] ?? []))));
        if (!$ids) { set_flash('error','请至少勾选一个标签'); redirect('admin/tags'); }
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        db_execute("DELETE FROM `{$p}post_tags` WHERE `tag_id` IN ({$placeholders})", $ids);
        db_execute("DELETE FROM `{$p}tags` WHERE `id` IN ({$placeholders})", $ids);
        update_tag_counts();
        set_flash('success','已批量删除 ' . count($ids) . ' 个标签'); redirect('admin/tags');
    }
}

// 2. 界面数据呈现
$page = max(1, (int)($_GET['page'] ?? 1));
$perPage = 20;
$total = (int)db_value("SELECT COUNT(*) FROM `{$p}tags`");
$pager = paginate($total, $page, $perPage);
$tags = db_rows("SELECT * FROM `{$p}tags` ORDER BY `post_count` DESC, `name` ASC LIMIT {$pager['per_page']} OFFSET {$pager['offset']}");
$editTag = isset($_GET['edit']) ? db_row("SELECT * FROM `{$p}tags` WHERE `id`=?",[(int)$_GET['edit']]) : null;

ob_start();
?>
<div class="split-layout">
    <div class="card">
        <div class="card-header"><div class="card-title"><?=$editTag?'修改标记属性':'新建关联标记'?></div></div>
        <form method="POST" action="<?=url('admin/tags')?>">
            <?=csrf_field()?> <input type="hidden" name="_action" value="save"> <input type="hidden" name="id" value="<?=$editTag['id']??0?>">
            <div style="margin-bottom:16px"><label class="admin-stat__label">视觉名称 *</label><input type="text" name="name" class="form-input" required value="<?=e($editTag['name']??'')?>"></div>
            <div style="margin-bottom:16px"><label class="admin-stat__label">底层路由别名 (Slug)</label><input type="text" name="slug" class="form-input" placeholder="让系统自行计算" value="<?=e($editTag['slug']??'')?>"></div>
            <div style="display:flex; gap:10px;">
                <button type="submit" class="btn btn-primary">应用规则</button>
                <?php if($editTag): ?><a href="<?=url('admin/tags')?>" class="btn btn-ghost">撤销</a><?php endif; ?>
            </div>
        </form>
    </div>
    <form method="POST" action="<?=url('admin/tags')?>" onsubmit="return confirm('确定批量删除所选标签吗？');">
        <?=csrf_field()?> <input type="hidden" name="_action" value="batch_delete">
        <div style="display:flex; justify-content:flex-end; gap:10px; margin-bottom:14px;">
            <button type="submit" class="btn btn-ghost is-danger"><i class="ri-delete-bin-line"></i> 批量删除</button>
        </div>
    <div class="card" style="padding:0; overflow:hidden;">
        <div class="table-wrap">
            <table class="table">
                <thead><tr><th width="52"><input type="checkbox" data-check-all></th><th>特征标记</th><th>路由键值</th><th>关联内容数</th><th style="text-align:right">介入操作</th></tr></thead>
                <tbody>
                <?php if (empty($tags)): ?>
                <tr><td colspan="4" style="text-align:center; color:var(--color-text-3); padding:32px 16px;">标签池当前为空</td></tr>
                <?php else: foreach($tags as $t): ?>
                <tr>
                    <td data-label="选择"><input type="checkbox" name="ids[]" value="<?=$t['id']?>" class="row-check"></td>
                    <td data-label="名称"><span class="badge" style="background:var(--color-primary-light); color:var(--color-primary)"><?=e($t['name'])?></span></td>
                    <td data-label="别名" style="color:var(--color-text-3)"><?=e($t['slug'])?></td>
                    <td data-label="文章"><?=$t['post_count']?></td>
                    <td data-label="操作">
                        <div style="display:flex; gap:8px; justify-content:flex-end;">
                            <a href="<?=url("admin/tags?edit={$t['id']}")?>" class="btn btn-ghost icon-btn"><i class="ri-edit-line"></i></a>
                            <form method="POST" action="<?=url('admin/tags')?>" onsubmit="return confirm('确定强行阻断并抹除该标记？')">
                                <?=csrf_field()?> <input type="hidden" name="_action" value="delete"> <input type="hidden" name="id" value="<?=$t['id']?>">
                                <button class="btn btn-ghost icon-btn is-danger"><i class="ri-delete-bin-line"></i></button>
                            </form>
                        </div>
                    </td>
                </tr>
                <?php endforeach; endif; ?>
                </tbody>
            </table>
        </div>
        <?php if ($pager['total_pages'] > 1): ?>
        <div class="admin-pagination">
            <a href="<?=url('admin/tags?page=' . max(1, $pager['page'] - 1))?>" class="btn btn-ghost <?= $pager['has_prev'] ? '' : 'is-disabled' ?>">上一页</a>
            <span class="admin-pagination__meta">第 <?=$pager['page']?> / <?=$pager['total_pages']?> 页 · 共 <?=$pager['total']?> 个标签</span>
            <a href="<?=url('admin/tags?page=' . min($pager['total_pages'], $pager['page'] + 1))?>" class="btn btn-ghost <?= $pager['has_next'] ? '' : 'is-disabled' ?>">下一页</a>
        </div>
        <?php endif; ?>
    </div>
    </div>
    </form>
</div>
<script>document.addEventListener('DOMContentLoaded',function(){document.querySelectorAll('[data-check-all]').forEach(function(all){all.addEventListener('change',function(){var table=all.closest('table');if(!table)return;table.querySelectorAll('.row-check').forEach(function(el){el.checked=all.checked;});});});});</script>
<?php $content = ob_get_clean(); require __DIR__ . '/layout.php'; ?>
