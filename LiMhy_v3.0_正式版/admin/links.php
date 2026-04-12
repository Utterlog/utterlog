<?php
/**
 * LiMhy - 友情链接管理
 * 
 * @package LiMhy
 * @version v1.1
 * @author  Jason（QQ：895443171）
 * @desc    处理站点互联的配置与排序，增加前端自助申请的审核能力，集成表结构自愈引擎
 */
require_once __DIR__ . '/../index.php';
$p = prefix(); $currentNav = 'links'; $pageTitle = '友情链接';

try {
    db_val("SELECT `desc`, `logo` FROM `{$p}links` LIMIT 1");
} catch (\Throwable $e) {
    @db_execute("ALTER TABLE `{$p}links` ADD COLUMN `desc` varchar(255) DEFAULT '' AFTER `url`");
    @db_execute("ALTER TABLE `{$p}links` ADD COLUMN `logo` varchar(500) DEFAULT '' AFTER `desc`");
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    verify_csrf();
    $act = $_POST['_action'] ?? '';
    
    if ($act === 'save') {
        $id=(int)($_POST['id']??0); 
        $name=clean($_POST['name']??'',100); 
        $urlVal=clean($_POST['url']??'',500); 
        $desc=clean($_POST['description']??'',200); 
        $logo=clean($_POST['avatar']??'',500); 
        $sort=(int)($_POST['sort_order']??0);

        if($name===''||$urlVal==='') { set_flash('error','名称和网址必填'); redirect('admin/links'); }
        if($id>0) {
            db_execute("UPDATE `{$p}links` SET `name`=?, `url`=?, `desc`=?, `logo`=?, `sort_order`=?, `visible`=1 WHERE `id`=?", [$name, $urlVal, $desc, $logo, $sort, $id]);
        } else {
            db_execute("INSERT INTO `{$p}links` (`name`,`url`,`desc`,`logo`,`sort_order`, `visible`) VALUES (?,?,?,?,?,1)", [$name, $urlVal, $desc, $logo, $sort]);
        }
        set_flash('success','保存成功并已展示'); redirect('admin/links');
    }
    
    if ($act === 'toggle_visible') {
        $id = (int)$_POST['id'];
        db_execute("UPDATE `{$p}links` SET `visible` = 1 - `visible` WHERE `id`=?", [$id]);
        set_flash('success', '链接状态已更新'); redirect('admin/links');
    }

    if ($act === 'delete') {
        $id=(int)$_POST['id']; db_execute("DELETE FROM `{$p}links` WHERE `id`=?",[$id]);
        set_flash('success','删除成功'); redirect('admin/links');
    }
}

$links = db_rows("SELECT * FROM `{$p}links` ORDER BY `visible` ASC, `sort_order` ASC, `id` DESC");
$editLink = isset($_GET['edit']) ? db_row("SELECT * FROM `{$p}links` WHERE `id`=?",[(int)$_GET['edit']]) : null;

ob_start();
?>
<div class="split-layout">
    <div class="card">
        <div class="card-header"><div class="card-title"><?=$editLink?'编辑链接':'添加链接'?></div></div>
        <form method="POST" action="<?=url('admin/links')?>">
            <?=csrf_field()?> <input type="hidden" name="_action" value="save"> <input type="hidden" name="id" value="<?=$editLink['id']??0?>">
            <div style="margin-bottom:16px"><label class="admin-stat__label">网站名称 *</label><input type="text" name="name" class="form-input" required value="<?=e($editLink['name']??'')?>"></div>
            <div style="margin-bottom:16px"><label class="admin-stat__label">网站地址 *</label><input type="url" name="url" class="form-input" required value="<?=e($editLink['url']??'')?>"></div>
            <div style="margin-bottom:16px"><label class="admin-stat__label">一句话描述</label><input type="text" name="description" class="form-input" value="<?=e($editLink['desc']??'')?>"></div>
            <div style="margin-bottom:16px"><label class="admin-stat__label">Logo 头像链接</label><input type="url" name="avatar" class="form-input" value="<?=e($editLink['logo']??'')?>"></div>
            <div style="margin-bottom:16px"><label class="admin-stat__label">排序 (越小越靠前)</label><input type="number" name="sort_order" class="form-input" value="<?=$editLink['sort_order']??0?>"></div>
            <div style="display:flex; gap:10px;">
                <button type="submit" class="btn btn-primary">直接发布</button>
                <?php if($editLink): ?><a href="<?=url('admin/links')?>" class="btn btn-ghost">取消</a><?php endif; ?>
            </div>
        </form>
    </div>

    <div class="card" style="padding:0; overflow:hidden;">
        <div class="table-wrap">
            <table class="table">
                <thead><tr><th>站点名称</th><th>网址信息</th><th>状态</th><th style="text-align:right">操作管控</th></tr></thead>
                <tbody>
                <?php foreach($links as $lnk): ?>
                <tr style="<?= $lnk['visible'] == 0 ? 'background: var(--color-warning-bg);' : '' ?>">
                    <td data-label="名称" style="display:flex; align-items:center; gap:8px;">
                        <?php if(!empty($lnk['logo'])): ?> <img src="<?=e($lnk['logo'])?>" style="width:24px;height:24px;border-radius:50%;object-fit:cover;"> <?php endif; ?>
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-weight:600; font-size:14px;"><?=e($lnk['name'])?></span>
                            <span style="font-size:12px; color:var(--color-text-3);"><?=e($lnk['desc'] ?? '')?></span>
                        </div>
                    </td>
                    <td data-label="网址" style="color:var(--color-text-2); font-size:13px; max-width:200px; overflow:hidden; text-overflow:ellipsis;">
                        <a href="<?=e($lnk['url'])?>" target="_blank" style="text-decoration:underline;"><?=e($lnk['url'])?></a>
                    </td>
                    <td data-label="状态">
                        <span class="badge badge-<?= $lnk['visible'] ? 'published' : 'pending' ?>">
                            <?= $lnk['visible'] ? '已展示' : '待审核' ?>
                        </span>
                    </td>
                    <td data-label="操作">
                        <div style="display:flex; gap:8px; justify-content:flex-end;">
                            <form method="POST" action="<?=url('admin/links')?>">
                                <?=csrf_field()?> 
                                <input type="hidden" name="_action" value="toggle_visible"> 
                                <input type="hidden" name="id" value="<?=$lnk['id']?>">
                                <button class="btn btn-ghost icon-btn" style="color:<?= $lnk['visible'] ? 'var(--color-warning)' : 'var(--color-success)' ?>" title="<?= $lnk['visible'] ? '下架隐藏' : '通过审核并展示' ?>">
                                    <i class="<?= $lnk['visible'] ? 'ri-eye-off-line' : 'ri-check-double-line' ?>"></i>
                                </button>
                            </form>
                            <a href="<?=url("admin/links?edit={$lnk['id']}")?>" class="btn btn-ghost icon-btn" title="编辑"><i class="ri-edit-line"></i></a>
                            <form method="POST" action="<?=url('admin/links')?>" onsubmit="return confirm('确定永久删除该站点记录？')">
                                <?=csrf_field()?> <input type="hidden" name="_action" value="delete"> <input type="hidden" name="id" value="<?=$lnk['id']?>">
                                <button class="btn btn-ghost icon-btn is-danger" title="删除"><i class="ri-delete-bin-line"></i></button>
                            </form>
                        </div>
                    </td>
                </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php if(empty($links)): ?><div class="admin-empty">当前没有收到任何友链数据</div><?php endif; ?>
    </div>
</div>
<?php $content = ob_get_clean(); require __DIR__ . '/layout.php'; ?>
