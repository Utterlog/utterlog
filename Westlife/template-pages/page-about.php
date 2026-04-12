<?php

/**
 * Template Name: 关于我们
 * Description: 关于我（主题内置，无插件依赖）
 * @package Westlife
 */

// 安全检查：防止直接访问
if (!defined('ABSPATH')) exit;

get_header();
echo '<main id="primary" class="site-main"><div class="container">';
// 直接加载所需资源（避免每次条件判断分支），主题版本号用于缓存失效
$__uri = get_template_directory_uri();
$__ver = wp_get_theme()->get('Version');
$__has_app_bundle = function_exists('westlife_has_app_bundle') && westlife_has_app_bundle();
if (!$__has_app_bundle) {
    wp_enqueue_style('westlife-page-about', $__uri . '/assets/css/pages/page-about.css', ['westlife-page'], $__ver);
    wp_enqueue_script('westlife-page-about', $__uri . '/assets/js/pages/page-about.js', [], $__ver, true);
}

// 建站与十年之约进度（增强健壮性 + 状态标签）
// 允许后台“签约时间”支持常见分隔符：YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD
$blog_decade_start_raw = trim((string) get_option('blog_decade_start', ''));
if ($blog_decade_start_raw === '') {
    $blog_decade_start_raw = (string) get_option('site_established', '2020-01-01');
}
// 统一替换可能的分隔符为 -
$normalized_start = preg_replace('#[./\\\-]#', '-', $blog_decade_start_raw); // 统一各种分隔符为 -
// 只截取日期部分（防止有人填入日期+时间）
if (preg_match('/^(\d{4}-\d{1,2}-\d{1,2})/', $normalized_start, $m)) {
    $normalized_start = $m[1];
}
// 补零成 YYYY-MM-DD
if (preg_match('/^(\d{4})-(\d{1,2})-(\d{1,2})$/', $normalized_start, $m)) {
    $normalized_start = sprintf('%04d-%02d-%02d', $m[1], $m[2], $m[3]);
}
// 非法则回退
if (!preg_match('/^\d{4}-\d{2}-\d{2}$/', $normalized_start)) {
    $normalized_start = '2020-01-01';
}
$start_ts = westlife_parse_timestamp($normalized_start . ' 00:00:00');
if (!$start_ts) {
    $start_ts = westlife_parse_timestamp('2020-01-01 00:00:00');
}
$end_ts = (new DateTimeImmutable('@' . $start_ts))
    ->setTimezone(westlife_wp_timezone())
    ->modify('+10 years')
    ->getTimestamp();
$today_ts = westlife_current_timestamp();
$is_future = $today_ts < $start_ts;
$days_total = max(1, (int) ceil(($end_ts - $start_ts) / 86400));
$days_passed = $is_future ? 0 : max(0, (int) floor(($today_ts - $start_ts) / 86400));
$days_left = max(0, $days_total - $days_passed);
$percent_raw = $is_future ? 0 : ($days_passed / $days_total) * 100;
$decade_percent = min(100, max(0, $percent_raw)); // 重命名为 decade_percent 避免与性格特征的 $percent 冲突
$start_date_display = wp_date('Y-m-d', $start_ts, westlife_wp_timezone());
$end_date = wp_date('Y-m-d', $end_ts, westlife_wp_timezone());
// 状态标签
if ($is_future) {
    $progress_state_note = '未开始';
} elseif ($decade_percent >= 100) {
    $progress_state_note = '已完成';
} elseif ($decade_percent <= 0 && !$is_future) {
    $progress_state_note = '刚开始';
} else {
    $progress_state_note = '';
}

// 头像与文案
$author_avatar = trim(get_option('author_avatar')) ?: get_avatar_url(get_option('admin_email'), ['size' => 200]);
$author_name = trim(get_option('author_name')) ?: get_bloginfo('name');
$author_slogan = trim(get_option('author_slogan')) ?: '保持好奇，持续精进';
$author_bio = trim(get_option('author_bio')) ?: '热爱简洁与高效，专注 Web / WordPress / 前后端协作。';

// 备用名字：使用去重合并写法
$alt_names_raw = (string) get_option('about_alt_names', '');
$alt_names = $alt_names_raw === '' ? [] : preg_split('/[,，、\r\n]+/', $alt_names_raw);
$alt_names = array_filter(array_map('trim', (array)$alt_names));
$names = array_unique(array_filter(array_merge([$author_name], $alt_names)));
if (count($names) < 2) {
    $names = array_values(array_unique(array_filter([
        $author_name ?: '醉倚西风',
        '西风',
        'gentpan'
    ])));
} else {
    $names = array_values($names);
}

// 环绕词
$circle_words = ['Web开发', 'PHP', 'WordPress', '前端', '后端', '优化', '可用性', '设计', '开源', '数据驱动'];
$circle_words_opt = trim((string) get_option('about_circle_words', ''));
if ($circle_words_opt !== '') {
    $user_circle_words = array_values(array_filter(array_map('trim', preg_split('/[,，、\r\n]+/', $circle_words_opt))));
    if (!empty($user_circle_words)) {
        $circle_words = $user_circle_words;
    }
}
// 解码用户可能输入的 HTML 实体，避免显示为“&middot;”之类的字面量
$circle_words = array_map(function ($s) {
    return trim(html_entity_decode($s, ENT_QUOTES, 'UTF-8'));
}, $circle_words);
$ring_text = implode(' · ', $circle_words) . ' · ';

// 在线状态
$admin_online = function_exists('westlife_is_admin_online') ? westlife_is_admin_online() : false;
$last_seen_ts = (int) get_transient('westlife_admin_last_seen');
$ago_text = $last_seen_ts ? westlife_human_time_diff($last_seen_ts) : '';
$status_title = $admin_online
    ? ('在线：' . ($ago_text ? $ago_text . '内活跃' : '刚刚活跃'))
    : ('离线：' . ($ago_text ? $ago_text . '前' : '未知'));

// 滚动关键词
$rolling_words = ['持续学习', '拥抱开源', '用数据说话', 'Less is more', '代码即资产', '体验优先'];
$rolling_opt = trim((string) get_option('about_rolling_words', ''));
if ($rolling_opt !== '') {
    $user_rolling_words = array_values(array_filter(array_map('trim', preg_split('/[,，、\r\n]+/', $rolling_opt))));
    if (!empty($user_rolling_words)) {
        $rolling_words = $user_rolling_words;
    }
}
// 同样解码滚动关键词中的 HTML 实体，保证中文/符号正常
$rolling_words = array_map(function ($s) {
    return trim(html_entity_decode($s, ENT_QUOTES, 'UTF-8'));
}, $rolling_words);


// MBTI 配置
$__mbti_titles = [
    'INTJ' => ['建筑师', '#88619a'],
    'INTP' => ['逻辑学家', '#88619a'],
    'ENTJ' => ['指挥官', '#88619a'],
    'ENTP' => ['辩论家', '#88619a'],
    'INFJ' => ['提倡者', '#33a474'],
    'INFP' => ['调停者', '#33a474'],
    'ENFJ' => ['主人公', '#33a474'],
    'ENFP' => ['竞选者', '#33a474'],
    'ISTJ' => ['物流师', '#4298b4'],
    'ISFJ' => ['守卫者', '#4298b4'],
    'ESTJ' => ['总经理', '#4298b4'],
    'ESFJ' => ['执政官', '#4298b4'],
    'ISTP' => ['鉴赏家', '#e4ae3a'],
    'ISFP' => ['探险家', '#e4ae3a'],
    'ESTP' => ['企业家', '#e4ae3a'],
    'ESFP' => ['表演者', '#e4ae3a'],
];
$mbti_code = strtoupper(preg_replace('/[^A-Z]/i', '', get_option('westlife_mbti_code', 'INTJ')));
if (!isset($__mbti_titles[$mbti_code])) $mbti_code = 'INTJ';
[$mbti_title, $mbti_accent] = $__mbti_titles[$mbti_code];
$mbti_img = sprintf('https://static.xifengcdn.com/images/16personalities/%s.svg', strtolower($mbti_code));
$mbti_link = sprintf('https://www.16personalities.com/ch/%s-%%E4%%BA%%BA%%E6%%A0%%BC', $mbti_code);
// MBTI主色 => hero背景色映射
$mbti_bg_map = [
    '#88619a' => 'linear-gradient(135deg, #f3e8ff 0%, #e9d5ff 100%)', // 紫
    '#33a474' => 'linear-gradient(135deg, #d1fae5 0%, #bbf7d0 100%)', // 绿
    '#4298b4' => 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)', // 蓝
    '#e4ae3a' => 'linear-gradient(135deg, #fef9c3 0%, #fde68a 100%)', // 黄
];
$about_hero_bg = $mbti_bg_map[strtolower($mbti_accent)] ?? 'linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%)';

// 关于页主色（仅覆盖 MBTI 主色；不继承全局主题主色）
$about_main_color_opt = trim((string) get_option('about_main_color', ''));
// 统一清洗，保证为合法 #rrggbb；为空或非法时回退到 MBTI 主色，再兜底为主题蓝色
$about_main_color = sanitize_hex_color($about_main_color_opt);
if (!$about_main_color) {
    $about_main_color = sanitize_hex_color($mbti_accent) ?: '#4298b4';
}



// 辅助函数：Hex转RGB
function hex2rgb($hex)
{
    // 确保输入为合法的 #rrggbb；否则回退为主题蓝色 #4298b4（66,152,180）
    $hex = sanitize_hex_color((string)$hex);
    if (!$hex) {
        $hex = '#4298b4';
    }
    $hex = ltrim($hex, '#');
    if (strlen($hex) === 3) {
        $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
    }
    $r = hexdec(substr($hex, 0, 2));
    $g = hexdec(substr($hex, 2, 2));
    $b = hexdec(substr($hex, 4, 2));
    return "$r, $g, $b";
}

// 传递配置到前端
wp_localize_script('westlife-page-about', 'westlifeAbout', array(
    'rollingWords' => array_values($rolling_words),
));
?>
<!-- 移除重复 <main id="primary">，保持上方已打开的 primary 容器 -->
<div class="about-page" style="--about-main-color: <?php echo esc_attr($about_main_color); ?>;--about-main-color-rgb: <?php echo hex2rgb($about_main_color); ?>;--about-hero-bg: <?php echo esc_attr($about_hero_bg); ?>;"
    data-rolling-words="<?php echo esc_attr(implode('|', $rolling_words)); ?>"
    data-rolling-words-json='<?php echo esc_attr(wp_json_encode(array_values($rolling_words), JSON_UNESCAPED_UNICODE)); ?>'>

    <!-- Hero 区域 -->
    <section class="about-hero hero-bg-animated">
        <div class="hero-container">
            <div class="hero-inner">
                <!-- 头像 + 环绕词：占格 1/2/7/8/13/14 (Row1-3, Col1-2) -->
                <div class="hero-block hero-avatar-block">
                    <div class="about-avatar-section">
                        <div class="hero-avatar-wrap">
                            <div class="avatar-inner">
                                <img class="hero-avatar" src="<?php echo esc_url($author_avatar); ?>" alt="<?php echo esc_attr($author_name); ?>">
                                <span class="online-dot<?php echo $admin_online ? '' : ' offline'; ?>" title="<?php echo esc_attr($status_title); ?>"></span>
                            </div>
                            <svg class="avatar-ring" viewBox="0 0 200 200" aria-hidden="true">
                                <defs>
                                    <path id="ringPath" d="M100,100 m-90,0 a90,90 0 1,1 180,0 a90,90 0 1,1 -180,0"></path>
                                </defs>
                                <text class="ring-text">
                                    <textPath href="#ringPath" startOffset="0%"><?php echo esc_html($ring_text); ?></textPath>
                                </text>
                            </svg>
                        </div>
                    </div>
                </div>

                <!-- 标题：第5/6格 (Row1 Col5-6，跨两列居中) -->
                <div class="hero-block hero-title-block">
                    <h1 class="page-title"><i class="fas fa-user-circle"></i><?php _e('关于博主', 'westlife'); ?></h1>
                </div>

                <!-- 社交链接：第19/20 (Row4 Col1-2) -->
                <div class="hero-block hero-social-block">
                    <?php
                    $social_platforms = array(
                        'github'    => array('fa-brands fa-github', 'GitHub'),
                        'twitter'   => array('fa-brands fa-twitter', 'Twitter (X)'),
                        'youtube'   => array('fa-brands fa-youtube', 'YouTube'),
                        'instagram' => array('fa-brands fa-instagram', 'Instagram'),
                        'bluesky'   => array('fa-solid fa-cloud', 'Bluesky'),
                        'mastodon'  => array('fa-brands fa-mastodon', 'Mastodon'),
                        'weibo'     => array('fa-brands fa-weibo', '微博'),
                        'bilibili'  => array('fa-brands fa-bilibili', '哔哩哔哩'),
                        'email'     => array('fa-solid fa-envelope', '邮箱'),
                        'telegram'  => array('fa-brands fa-telegram', 'Telegram'),
                    );
                    echo '<div class="social-links about-hero-social">';
                    foreach ($social_platforms as $platform => $info) {
                        $url = get_option('social_' . $platform);
                        if ($url) {
                            $href = ($platform === 'email') ? ('mailto:' . $url) : $url;
                            printf(
                                '<a href="%s" data-platform="%s" target="_blank" rel="noopener noreferrer" title="%s"><i class="%s"></i></a>',
                                esc_url($href),
                                esc_attr($platform),
                                esc_attr($info[1]),
                                esc_attr($info[0])
                            );
                        }
                    }
                    echo '</div>';
                    ?>
                </div>

                <!-- 兴趣爱好：第21/22 (Row4 Col3-4) -->
                <div class="hero-block hero-hobbies-block" aria-label="兴趣爱好">
                    <?php
                    $hobbies_inline = (array) get_option('about_hobbies', []);
                    $hobby_items = [];
                    foreach ($hobbies_inline as $h) {
                        $emoji = trim($h['emoji'] ?? '');
                        $text  = trim($h['text'] ?? '');
                        $color = trim($h['color'] ?? '#60a5fa');
                        if ($text === '') continue;
                        $hobby_items[] = [
                            'emoji' => ($emoji !== '' ? $emoji : '•'),
                            'text'  => $text,
                            'color' => $color !== '' ? $color : '#60a5fa'
                        ];
                    }
                    if (!empty($hobby_items)) {
                        echo '<ul class="hero-hobby-list">';
                        foreach ($hobby_items as $hb) {
                            printf('<li class="hero-hobby-chip" style="--hobby-color:%s"><span class="chip-emoji" aria-hidden="true">%s</span><span class="chip-text">%s</span></li>', esc_attr($hb['color']), esc_html($hb['emoji']), esc_html($hb['text']));
                        }
                        echo '</ul>';
                    }
                    ?>
                </div>

                <!-- 统计：第17/18/23/24 (跨第3-4行 第5-6列) -->
                <aside class="about-stats-card hero-block hero-stats-block">
                    <?php
                    // 统计：去过国家、计划（进行中/已完成）
                    $visited_countries = intval(get_option('about_visited_countries', 0));
                    $short_plans = (array) get_option('about_short_plans', []);
                    $long_plans = (array) get_option('about_long_plans', []);

                    $count_in_progress = 0;
                    $count_completed = 0;
                    foreach ([$short_plans, $long_plans] as $list) {
                        foreach ($list as $p) {
                            $status = $p['status'] ?? '';
                            if ($status === 'in-progress') $count_in_progress++;
                            if ($status === 'completed') $count_completed++;
                        }
                    }
                    ?>
                    <div class="stats-summary">
                        <div class="summary-item" data-key="visited_countries">
                            <div class="summary-icon">
                                <span class="summary-value"><?php echo number_format_i18n(max(0, $visited_countries)); ?></span>
                            </div>
                            <span class="summary-label">
                                <i class="fas fa-globe-asia"></i>
                                去过国家
                            </span>
                        </div>
                        <div class="summary-item" data-key="plans_in_progress">
                            <div class="summary-icon">
                                <span class="summary-value"><?php echo number_format_i18n($count_in_progress); ?></span>
                            </div>
                            <span class="summary-label">
                                <i class="fas fa-hourglass-half"></i>
                                进行中的计划
                            </span>
                        </div>
                        <div class="summary-item" data-key="plans_completed">
                            <div class="summary-icon">
                                <span class="summary-value"><?php echo number_format_i18n($count_completed); ?></span>
                            </div>
                            <span class="summary-label">
                                <i class="fas fa-check-circle"></i>
                                完成的计划
                            </span>
                        </div>
                    </div>
                </aside>
            </div>
        </div>
    </section>

    <!-- 内容区域 -->
    <section class="about-section">
        <div class="about-container">

            <!-- Hero 下第一行：左右双卡（精简结构） -->
            <?php
            $rotating_items = array_values(array_filter(array_map('trim', (array) $rolling_words)));
            if (!$rotating_items) {
                $rotating_items = ['持续学习', '拥抱开源', '用数据说话', 'Less is more', '代码即资产', '体验优先'];
            }
            ?>
            <div class="content-row">
                <!-- 精简结构：直接使用 about-duo-cards 容器，移除中间 about-right-col 包裹 -->
                <div class="about-duo-cards about-duo-cards--hero">
                    <div class="about-card about-card--left about-card--intro">
                        <p class="intro-line greet">你好，很高兴认识你👋</p>
                        <p class="intro-line name"> <span class="intro-label">我叫</span> <span class="typewriter" data-names='<?php echo esc_attr(wp_json_encode($names, JSON_UNESCAPED_UNICODE)); ?>'></span></p>
                        <p class="intro-line bio intro-bio"><?php echo esc_html($author_bio); ?></p>
                    </div>
                    <div class="about-card about-card--rotating" data-rotate-interval="3000">
                        <p class="rotate-line heading">追求</p>
                        <p class="rotate-line subheading">源于热爱而去创造</p>
                        <div class="rotate-line carousel">
                            <div class="rotate-viewport" aria-live="polite" aria-atomic="true">
                                <div class="rotate-list">
                                    <?php foreach ($rotating_items as $item): ?>
                                        <div class="rotate-item"><?php echo esc_html($item); ?></div>
                                    <?php endforeach; ?>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>


            <!-- 为什么建站 -->
            <div class="content-row purpose-row" id="purpose">
                <div class="content-box purpose-box">
                    <div class="purpose-card" aria-labelledby="purpose-title">
                        <div class="purpose-content">
                            <?php
                            $purpose_title = trim((string) get_option('about_purpose_title', '记录与分享的初心')) ?: '记录与分享的初心';
                            $purpose_subtitle = trim((string) get_option('about_purpose_subtitle', '以站促学，以学促创；构建可复用的知识与组件资产。')) ?: '以站促学，以学促创；构建可复用的知识与组件资产。';
                            $purpose_paragraphs_raw = (string) get_option('about_purpose_paragraphs', '');
                            $purpose_paragraphs = array_values(array_filter(array_map('trim', preg_split('/\r?\n+/', $purpose_paragraphs_raw))));
                            // 增强空段落过滤：剔除只包含空格、全角空格、HTML 空格实体 (&nbsp;)，以及只由标点或换行组成的空行，确保不会输出空段落导致绿点误显
                            $purpose_paragraphs = array_filter($purpose_paragraphs, function ($line) {
                                // 转换常见 HTML 空格实体
                                $normalized = html_entity_decode($line, ENT_QUOTES, 'UTF-8');
                                // 去除常规与全角空白字符
                                $stripped = preg_replace('/[\pZ\s\x{3000}\x{00A0}]+/u', '', $normalized);
                                // 若为空则丢弃
                                if ($stripped === '') return false;
                                // 若只剩下标点（中英文逗号句号引号破折号等）也视为空
                                if (preg_match('/^[,，。.!！？“”"\'-—…··]+$/u', $stripped)) return false;
                                return true;
                            });
                            $purpose_paragraphs = array_values($purpose_paragraphs);
                            $purpose_closing = trim((string) get_option('about_purpose_closing_text', ''));
                            $purpose_image = trim((string) get_option('about_purpose_image', ''));
                            ?>
                            <div class="purpose-header">
                                <div class="purpose-heading">
                                    <h2 class="purpose-title" id="purpose-title">
                                        <span class="purpose-title-prefix purpose-title-prefix--halo" aria-hidden="true">
                                            <span class="halo-pulse"></span>
                                            <span class="halo-pulse2"></span>
                                        </span>
                                        <span class="purpose-title-text-main"><?php echo esc_html($purpose_title); ?></span>
                                        <?php if ($purpose_subtitle): ?>
                                            <span class="purpose-inline-sep" aria-hidden="true">·</span>
                                            <span class="purpose-subtitle-inline" data-source-option="about_purpose_subtitle"><?php echo esc_html($purpose_subtitle); ?></span>
                                        <?php endif; ?>
                                    </h2>
                                </div>
                            </div>

                            <div class="purpose-text">
                                <!-- 已移除高亮行（记录与输出，沉淀长期价值） -->

                                <div class="purpose-paragraphs">
                                    <?php if ($purpose_paragraphs): ?>
                                        <?php foreach ($purpose_paragraphs as $para): ?>
                                            <p><?php echo esc_html($para); ?></p>
                                        <?php endforeach; ?>
                                    <?php else: ?>
                                        <?php
                                        // 如果后台没填，提供一组默认描述性段落，帮助预览整体样式
                                        $default_purpose_paragraphs = [
                                            '最初建立这个站点，是想给自己一个沉淀与反刍的空间——把零散的灵感、项目踩坑、读书笔记系统化整理，降低遗忘成本。',
                                            '在不断迭代中，它逐渐演化为一个「个人知识与组件实验室」：我会把常用的脚本、样式片段、接口封装成可复用模块，服务后续的文章或 side project。',
                                            '与其把时间消耗在无序的信息流，不如构建自己的结构化认知体系；写作、输出与开源是逼迫自我升级最直接、也最温和的方法。',
                                            '我希望这里既能记录“我做过什么”，也能留下“我如何思考”的中间过程——这些过程往往比结果本身更有价值。'
                                        ];
                                        foreach ($default_purpose_paragraphs as $dp) {
                                            echo '<p>' . esc_html($dp) . '</p>';
                                        }
                                        ?>
                                    <?php endif; ?>
                                    <?php if ($purpose_closing): ?>
                                        <?php $purpose_closing_icon = trim((string) get_option('about_purpose_closing_icon', 'fa-solid fa-stars')) ?: 'fa-solid fa-stars';
                                        if (!$purpose_closing_icon) $purpose_closing_icon = 'fa-solid fa-stars'; ?>
                                        <p class="purpose-closing"><i class="<?php echo esc_attr($purpose_closing_icon); ?>" aria-hidden="true"></i><span><?php echo esc_html($purpose_closing); ?></span></p>
                                    <?php endif; ?>
                                </div>
                            </div>
                        </div>

                        <div class="purpose-image">
                            <div class="purpose-image-wrapper">
                                <?php if ($purpose_image): ?>
                                    <img src="<?php echo esc_url($purpose_image); ?>" alt="关于建站" loading="lazy">
                                <?php else: ?>
                                    <img src="<?php echo get_template_directory_uri(); ?>/static/images/about.webp" alt="关于建站" loading="lazy">
                                <?php endif; ?>
                                <div class="purpose-image-overlay"></div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- MBTI 与人格特征：整合为一个卡片容器（左右排列，保持原单卡类不变） -->
            <div class="content-row">
                <div class="content-box personality-box">
                    <div class="combined-personality-card">
                        <!-- 左侧：MBTI 人格类型卡片（原样嵌入） -->
                        <div class="combined-left">
                            <div class="mbti-card" style="--mbti-accent: <?php echo esc_attr($mbti_accent); ?>;">
                                <div class="mbti-left">
                                    <div class="mbti-chip">人格类型</div>
                                    <h3 class="mbti-title"><?php echo esc_html($mbti_title); ?></h3>
                                    <div class="mbti-code"><?php echo esc_html($mbti_code); ?></div>
                                    <p class="mbti-tip">
                                        了解更多：
                                        <a href="https://www.16personalities.com/" target="_blank" rel="noopener">16Personalities</a>
                                        ｜关于 <a href="<?php echo esc_url($mbti_link); ?>" target="_blank" rel="noopener"><?php echo esc_html($mbti_title); ?></a>
                                    </p>
                                </div>
                                <div class="mbti-right">
                                    <div class="mbti-figure">
                                        <img src="<?php echo esc_url($mbti_img); ?>" alt="<?php echo esc_attr($mbti_title); ?>" loading="lazy">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- 右侧：人格特征卡片（原样嵌入） -->
                        <div class="combined-right">
                            <div class="traits-card">
                                <div class="traits-list">
                                    <div class="traits-chip">人格特征</div>
                                    <?php
                                    // 默认特征标题
                                    $default_trait_titles = ['能量', '心智', '天性', '应对方式', '身份特征'];
                                    $trait_titles = [];
                                    for ($j = 1; $j <= 5; $j++) {
                                        $trait_titles[] = trim((string)get_option("about_trait_{$j}_title", $default_trait_titles[$j - 1])) ?: $default_trait_titles[$j - 1];
                                    }
                                    $default_traits = [
                                        ['left' => '外向', 'right' => '内向', 'percent' => 53, 'desc' => '你在社交中表现得较为主动，但也享受独处时光。', 'color' => '#4298b4'],
                                        ['left' => '天马行空', 'right' => '求真务实', 'percent' => 56, 'desc' => '你富有想象力，喜欢探索新奇的想法，但也能脚踏实地。', 'color' => '#e4ae3a'],
                                        ['left' => '理性思考', 'right' => '情感细腻', 'percent' => 64, 'desc' => '你倾向于用逻辑分析问题，但也能体察他人情绪。', 'color' => '#33a474'],
                                        ['left' => '运筹帷幄', 'right' => '随机应变', 'percent' => 57, 'desc' => '你喜欢有计划地推进事务，但也能灵活应对变化。', 'color' => '#88619a'],
                                        ['left' => '自信果断', 'right' => '情绪易波动', 'percent' => 67, 'desc' => '你通常自信果断，面对挑战时保持冷静。', 'color' => '#f76b6b'],
                                    ];
                                    for ($i = 1; $i <= 5; $i++) {
                                        $left = trim((string)get_option("about_trait_{$i}_label_left"));
                                        $right = trim((string)get_option("about_trait_{$i}_label_right"));
                                        $percent = get_option("about_trait_{$i}_percent");
                                        $desc = trim((string)get_option("about_trait_{$i}_desc"));
                                        $color = esc_attr(get_option("about_trait_{$i}_color"));
                                        // 若后台未填写则用默认值
                                        if ($left === '' && $right === '' && $percent === false && $desc === '' && $color === '') {
                                            $left = $default_traits[$i - 1]['left'];
                                            $right = $default_traits[$i - 1]['right'];
                                            $percent = $default_traits[$i - 1]['percent'];
                                            $desc = $default_traits[$i - 1]['desc'];
                                            $color = $default_traits[$i - 1]['color'];
                                        } else {
                                            if ($left === '') $left = $default_traits[$i - 1]['left'];
                                            if ($right === '') $right = $default_traits[$i - 1]['right'];
                                            if ($percent === false || $percent === '' || !is_numeric($percent)) $percent = $default_traits[$i - 1]['percent'];
                                            if ($desc === '') $desc = $default_traits[$i - 1]['desc'];
                                            if ($color === '') $color = $default_traits[$i - 1]['color'];
                                        }
                                        $title = $trait_titles[$i - 1];
                                        $rgb = $color ? hex2rgb($color) : '66, 66, 66';
                                    ?>
                                        <div class="trait-item" style="--trait-color:<?php echo $color; ?>;--trait-color-rgb:<?php echo $rgb; ?>;">
                                            <div class="trait-row">
                                                <div class="trait-meta">
                                                    <span class="trait-title"><?php echo esc_html($title); ?></span>
                                                </div>
                                                <div class="trait-bar-wrap">
                                                    <span class="trait-label"><?php echo esc_html($left); ?></span>
                                                    <div class="trait-bar">
                                                        <div class="trait-bar-fill" style="width:<?php echo max(1, min(100, (int)$percent)); ?>%;">
                                                            <span class="trait-value"><?php echo esc_html($percent); ?>%</span>
                                                            <span class="trait-dot"></span>
                                                        </div>
                                                    </div>
                                                    <span class="trait-label trait-label-right"><?php echo esc_html($right); ?></span>
                                                </div>
                                            </div>
                                            <div class="trait-desc-tooltip"><?php echo esc_html($desc); ?></div>
                                        </div>
                                    <?php } ?>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- 计划卡片行：左右两列 -->
            <div class="content-row plans-layout">
                <div class="about-wishlist-row">
                    <?php
                    $short_plans = (array) get_option('about_short_plans', []);
                    ?>
                    <div class="about-card wishlist-card wishlist-left">
                        <div class="about-card-label">
                            <i class="fas fa-bolt"></i>
                            <span>Short-term Plan</span>
                        </div>
                        <ul class="about-wishlist-list">
                            <?php if (!empty($short_plans)): foreach ($short_plans as $p): $emoji = $p['emoji'] ?? '';
                                    $text = $p['text'] ?? '';
                                    $status = $p['status'] ?? 'pending';
                                    if ($text === '') continue; ?>
                                    <li>
                                        <span class="wish-icon"><?php echo esc_html($emoji ?: '•'); ?></span>
                                        <span class="wish-content"><?php echo esc_html($text); ?></span>
                                        <span class="wish-status <?php echo esc_attr($status); ?>"><?php echo $status === 'completed' ? '已完成' : ($status === 'in-progress' ? '进行中' : '未完成'); ?></span>
                                    </li>
                            <?php endforeach;
                            endif; ?>
                        </ul>
                    </div>
                    <?php
                    $long_plans = (array) get_option('about_long_plans', []);
                    ?>
                    <div class="about-card wishlist-card wishlist-right">
                        <div class="about-card-label">
                            <i class="fas fa-mountain"></i>
                            <span>Long-term Plan</span>
                        </div>
                        <ul class="about-wishlist-list">
                            <?php if (!empty($long_plans)): foreach ($long_plans as $p): $emoji = $p['emoji'] ?? '';
                                    $text = $p['text'] ?? '';
                                    $status = $p['status'] ?? 'pending';
                                    if ($text === '') continue; ?>
                                    <li>
                                        <span class="wish-icon"><?php echo esc_html($emoji ?: '•'); ?></span>
                                        <span class="wish-content"><?php echo esc_html($text); ?></span>
                                        <span class="wish-status <?php echo esc_attr($status); ?>"><?php echo $status === 'completed' ? '已完成' : ($status === 'in-progress' ? '进行中' : '未完成'); ?></span>
                                    </li>
                            <?php endforeach;
                            endif; ?>
                        </ul>
                    </div>
                </div>

            </div>
        </div>
        <!-- 游戏与音乐（拆分为独立行，每个卡片100%宽度） -->
        <div class="content-row">
            <div class="content-box game-box">
                <h2 class="section-title">
                    <i class="fas fa-gamepad"></i>
                    <?php _e('游戏', 'westlife'); ?>
                </h2>
                <div class="section-content">
                    <div class="game-grid">
                        <!-- LOL 卡片（静态写死） -->
                        <div class="game-card game-card--lol" style="background-image: url('https://static.xifengcdn.com/images/about/LOL/lol.webp');">
                            <div class="game-mask"></div>
                            <div class="game-content">
                                <div class="game-logo">
                                    <i class="fas fa-chess-knight"></i>
                                    <span>英雄联盟</span>
                                </div>
                                <div class="game-info">
                                    <div class="game-meta">
                                        <span>艾欧尼亚</span>
                                        <span>Nightblue3</span>
                                    </div>
                                    <div class="game-position">ADC / 打野</div>
                                    <div class="game-champions">
                                        <img class="champion-avatar" src="https://static.xifengcdn.com/images/about/LOL/Ashe.webp" alt="艾希" title="艾希" loading="lazy">
                                        <img class="champion-avatar" src="https://static.xifengcdn.com/images/about/LOL/Kaisa.webp" alt="卡莎" title="卡莎" loading="lazy">
                                        <img class="champion-avatar" src="https://static.xifengcdn.com/images/about/LOL/Vayne.webp" alt="薇恩" title="薇恩" loading="lazy">
                                    </div>
                                </div>
                            </div>
                        </div>

                        <!-- PUBG 卡片（静态写死） -->
                        <div class="game-card game-card--pubg" style="background-image: url('https://static.xifengcdn.com/images/about/pubg.webp');">
                            <div class="game-mask"></div>
                            <div class="game-content">
                                <div class="game-logo">
                                    <i class="fas fa-crosshairs"></i>
                                    <span>PUBG</span>
                                </div>
                                <div class="game-info">
                                    <div class="game-meta">
                                        <span>PangSanZang</span>
                                    </div>
                                    <div class="game-position">步枪 / 支援</div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
        <div class="content-row">
            <div class="content-box music-box" style="box-shadow:none;border:none;background:none;">
                <div class="music-card" style="--bg: url('https://static.xifengcdn.com/images/about/music.webp');">
                    <div class="music-mask"></div>
                    <div class="music-inner">
                        <img class="music-avatar" src="https://static.xifengcdn.com/images/about/jay.jpg" alt="音乐头像" loading="lazy">
                        <div class="music-content">
                            <div class="music-row">
                                <span class="label">风格</span>
                                <span class="value">民谣 / 流行 / 轻音乐</span>
                            </div>
                            <div class="music-row">
                                <span class="label">人物</span>
                                <span class="value">陈奕迅 / 赵雷 / 周杰伦 / 雅尼</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </section>

    <!-- 建站十年之约进度条（页面底部） -->
    <div class="decade-section decade-bar about-bottom-bar">
        <div class="decade-bar-meta-row">
            <div class="decade-bar-title">
                <i class="fa-solid fa-blog"></i>
                博客十年之约<?php if (!empty($progress_state_note)) {
                            echo ' <span class="decade-state">' . esc_html($progress_state_note) . '</span>';
                        } ?>
            </div>
            <div class="decade-bar-meta-right">
                <a class="decade-link" href="https://www.foreverblog.cn/" target="_blank" rel="noopener">
                    申请加入 <i class="fas fa-arrow-right"></i>
                </a>
            </div>
        </div>
        <div class="decade-bar-row decade-bar-row--vertical">
            <div class="decade-bar-progress-wrap">
                <div class="decade-progress bar-full" style="position:relative;">
                    <div class="decade-fill<?php if ($decade_percent >= 100) echo ' full'; ?>" style="--decade-bar-width:<?php echo $decade_percent; ?>%"></div>
                    <div class="decade-percent-inside<?php if ($decade_percent >= 100) echo ' full'; ?>"><?php echo number_format($decade_percent, 1); ?>%</div>
                    <span class="decade-days-label inside-bar">剩余 <span class="days-left"><?php echo $days_left; ?></span> 天</span>
                </div>
                <div class="decade-bar-progress-labels">
                    <span class="decade-date start"><span><?php echo esc_html($start_date_display); ?></span></span>
                    <span class="decade-date end"><span><?php echo esc_html($end_date); ?></span></span>
                </div>
            </div>
        </div>
    </div>
    <?php
    echo '</div></main>';
    get_footer();
