<?php
/**
 * LiMhy - 赞赏与支持视图
 */
?>
<style>
.sponsor-page { max-width: 640px; margin: 0 auto 60px; padding-top: 20px; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #000; }
.sponsor-title { font-size: 32px; font-weight: 900; margin: 0 0 20px 0; letter-spacing: 1px; }

.sponsor-card { background: #fff; border: 2px solid #000; padding: 40px 20px 20px; text-align: center; margin-bottom: 40px; position: relative; }

.sponsor-bear {
    position: absolute;
    right: 8px;
    top: -2px;
    transform: translateY(-100%);
    width: 55px;
    z-index: 10;
    pointer-events: none;
}

.sponsor-qr-box { width: 220px; height: 220px; margin: 0 auto 20px; }
.sponsor-qr-box img { width: 100%; height: 100%; object-fit: contain; }
.sponsor-motto { font-size: 16px; font-weight: 900; letter-spacing: 0.5px; }

.sponsor-section-title { font-size: 24px; font-weight: 900; margin-bottom: 12px; margin-top: 0; }

.sp-table-wrap {
    width: 100%;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
    border: 2px solid #000;
    background: #fff;
    margin-bottom: 40px;
}
.sp-table { width: 100%; min-width: 500px; border-collapse: collapse; text-align: left; background: #fff; color: #111; }
.sp-table th {
    background: linear-gradient(180deg, #d8a688 0%, #ecd3c4 100%);
    color: #000; font-weight: 900; font-size: 16px;
    padding: 12px 16px; border-bottom: 2px solid #000;
}
.sp-table td {
    padding: 12px 16px; font-size: 15px; font-weight: 700;
    border-bottom: 2px solid #000;
    color: #111;
    background: transparent;
}
.sp-table tr:last-child td { border-bottom: none; }
.sponsor-empty {
    text-align: center;
    padding: 30px;
    border: 2px solid #000;
    font-weight: 900;
    margin-bottom: 40px;
    background: #fff;
    color: #111;
}

.cost-text { font-size: 16px; font-weight: 900; line-height: 1.6; white-space: pre-wrap; }

[data-theme="dark"] .sponsor-page { color: #fff; }
[data-theme="dark"] .sponsor-card,
[data-theme="dark"] .sp-table-wrap,
[data-theme="dark"] .sponsor-empty {
    background: #1a1a1a;
    border-color: #555;
}
[data-theme="dark"] .sp-table {
    background: #1a1a1a;
    color: #e5e7eb;
}
[data-theme="dark"] .sp-table th {
    background: linear-gradient(180deg, #3a2a22 0%, #5c4334 100%);
    color: #f8fafc;
    border-color: #555;
}
[data-theme="dark"] .sp-table td {
    color: #e5e7eb;
    border-color: #555;
    background: transparent;
}
[data-theme="dark"] .sp-table tr:nth-child(even) td { background: rgba(255,255,255,0.03); }
[data-theme="dark"] .sponsor-section-title,
[data-theme="dark"] .sponsor-motto,
[data-theme="dark"] .cost-text,
[data-theme="dark"] .sponsor-empty { color: #f8fafc; }
</style>

<div class="container">
    <div class="sponsor-page">
        <h1 class="sponsor-title">请站长喝杯咖啡~</h1>

        <div class="sponsor-card">
            <img src="<?=url('assets/img/xxzs.png')?>" alt="赞赏支持" class="sponsor-bear">

            <div class="sponsor-qr-box">
                <?php if(!empty($qrUrl)): ?>
                    <img src="<?=e($qrUrl)?>" alt="收款码">
                <?php else: ?>
                    <div style="height:100%; display:flex; align-items:center; justify-content:center; color:#999; font-weight:bold; border: 2px dashed #ccc;">收款码未上传</div>
                <?php endif; ?>
            </div>
            <div class="sponsor-motto">
                您的每一次支持，都是本站持续运转与创作的动力。
            </div>
        </div>

        <h2 class="sponsor-section-title">赞赏名单</h2>
        <?php if(empty($sponsors)): ?>
            <div class="sponsor-empty">暂无记录，成为第一个支持的人吧！</div>
        <?php else: ?>
            <div class="sp-table-wrap">
                <table class="sp-table">
                    <thead>
                        <tr>
                            <th>赞赏人</th>
                            <th>金额</th>
                            <th>日期</th>
                            <th>附言备注</th>
                        </tr>
                    </thead>
                    <tbody>
                        <?php foreach($sponsors as $sp): ?>
                        <tr>
                            <td><?=e($sp['name'] ?? '佚名')?></td>
                            <td><?=e($sp['amount'] ?? '0.00')?></td>
                            <td><?=e($sp['date'] ?? '-')?></td>
                            <td><?=e($sp['note'] ?? '')?></td>
                        </tr>
                        <?php endforeach; ?>
                    </tbody>
                </table>
            </div>
        <?php endif; ?>

        <h2 class="sponsor-section-title">服务器与运营成本</h2>
        <div class="cost-text"><?= $costText ? e($costText) : '暂无成本公开数据。' ?></div>

    </div>
</div>
