<?php
/**
 * LiMhy - 独立相册视图 (View Only)
 */
?>

<script id="js-album-data" type="application/json">
<?= json_encode($flatPhotos, JSON_UNESCAPED_UNICODE) ?: '[]' ?>
</script>

<div class="album-container">
    
    <div class="album-tabs">
        <button class="album-tab active js-tab-trigger" data-view="cal"><i class="ri-calendar-2-line"></i> 日历</button>
        <button class="album-tab js-tab-trigger" data-view="gal"><i class="ri-image-line"></i> 相册</button>
    </div>

    <div id="view-cal" class="album-view-section active">
        <?php foreach ($photos as $year => $monthsData): ?>
            <div class="cal-year-title"><?=$year?></div>
            <?php foreach ($monthsData as $month => $daysData): 
                $totalPics = 0; 
                foreach ($daysData as $pics) $totalPics += count($pics);
                
                $firstDayStamp = strtotime("{$year}-{$month}-01");
                $daysInMonth = (int)date('t', $firstDayStamp);
                $startDayOfWeek = (int)date('w', $firstDayStamp); 
            ?>
                <div class="cal-month-title"><?=$month?>月 <span><?=$daysInMonth?>天, <?=$totalPics?>张</span></div>
                <div class="cal-week-header">
                    <div>周日</div><div>周一</div><div>周二</div><div>周三</div><div>周四</div><div>周五</div><div>周六</div>
                </div>
                
                <div class="cal-days-grid">
                    <?php 
                    for ($i = 0; $i < $startDayOfWeek; $i++) {
                        echo '<div class="cal-day empty-slot"></div>';
                    }
                    
                    for ($day = 1; $day <= $daysInMonth; $day++) {
                        if (isset($daysData[$day]) && !empty($daysData[$day])) {
                            $firstPic = $daysData[$day][0];
                            $picCount = count($daysData[$day]);
                            echo "<div class='cal-day has-pic js-cal-trigger' data-y='{$year}' data-m='{$month}' title='点击查看当月相册'>
                                    <img src='".e($firstPic['src'])."' loading='lazy'>
                                    <span class='cal-date-center'>{$day}</span>
                                    " . ($picCount > 1 ? "<span class='cal-count-badge'>{$picCount}张</span>" : "") . "
                                  </div>";
                        } else {
                            echo "<div class='cal-day no-pic'>{$day}</div>";
                        }
                    }
                    ?>
                </div>
            <?php endforeach; ?>
        <?php endforeach; ?>
    </div>

    <div id="view-gal" class="album-view-section">
        <?php foreach ($photos as $year => $monthsData): ?>
            <div class="cal-year-title" style="margin-bottom: 0;"><?=$year?></div>
            
            <?php foreach ($monthsData as $month => $daysData): 
                $monthPics = [];
                foreach ($daysData as $pics) {
                    foreach ($pics as $pic) { $monthPics[] = $pic; }
                }
                $totalPics = count($monthPics);
            ?>
                <div class="gal-month-title" id="gal-month-<?=$year?>-<?=$month?>">
                    <?=$month?>月 <span><?=$totalPics?>张</span>
                </div>
                
                <div class="gal-grid">
                    <?php foreach ($monthPics as $idx => $pic): ?>
                        <?php if ($idx < 9): ?>
                            <div class="gal-item js-pv-trigger" data-idx="<?=$pic['global_idx']?>">
                                <img src="<?=e($pic['src'])?>" loading="lazy">
                            </div>
                        <?php elseif ($idx == 9): ?>
                            <div class="gal-more-cover js-expand-trigger" data-y="<?=$year?>" data-m="<?=$month?>">
                                <img src="<?=e($pic['src'])?>" loading="lazy">
                                <div class="gal-more-text">+<?=($totalPics - 9)?> 张</div>
                            </div>
                            <div class="gal-item hidden-gal-item js-pv-trigger group-<?=$year?>-<?=$month?>" data-idx="<?=$pic['global_idx']?>">
                                <img src="<?=e($pic['src'])?>" loading="lazy">
                            </div>
                        <?php else: ?>
                            <div class="gal-item hidden-gal-item js-pv-trigger group-<?=$year?>-<?=$month?>" data-idx="<?=$pic['global_idx']?>">
                                <img src="<?=e($pic['src'])?>" loading="lazy">
                            </div>
                        <?php endif; ?>
                    <?php endforeach; ?>
                </div>
            <?php endforeach; ?>
        <?php endforeach; ?>
    </div>

</div>

<div id="pv-overlay" class="pv-overlay">
    <div class="pv-top">
        <div class="pv-title" id="pv-title"></div>
        <div class="pv-time" id="pv-time"></div>
        <i class="ri-close-line pv-close js-pv-close"></i>
    </div>
    <div class="pv-center">
        <img id="pv-img" class="pv-img" src="" alt="View">
        <div class="pv-nav pv-prev js-pv-nav" data-delta="-1"><i class="ri-arrow-left-s-line"></i></div>
        <div class="pv-nav pv-next js-pv-nav" data-delta="1"><i class="ri-arrow-right-s-line"></i></div>
    </div>
    <div class="pv-bottom">
        <a id="pv-link" href="#" class="pv-link-btn" target="_blank">前往图片原文</a>
        <div class="pv-thumb-track" id="pv-thumbs">
        </div>
    </div>
</div>
