<?php
if (!defined('ABSPATH')) exit;

function westlife_sanitize_mbti_code($val)
{
    $code = strtoupper(preg_replace('/[^A-Z]/i', '', (string)$val));
    $allowed = ['INTJ', 'INTP', 'ENTJ', 'ENTP', 'INFJ', 'INFP', 'ENFJ', 'ENFP', 'ISTJ', 'ISFJ', 'ESTJ', 'ESFJ', 'ISTP', 'ISFP', 'ESTP', 'ESFP'];
    return in_array($code, $allowed, true) ? $code : 'INTJ';
}

if (!function_exists('westlife_sanitize_ui_shape')) {
    function westlife_sanitize_ui_shape($value)
    {
        $value = is_string($value) ? strtolower(trim($value)) : 'sharp';
        return in_array($value, ['sharp', 'rounded'], true) ? $value : 'sharp';
    }
}

if (!function_exists('westlife_sanitize_visitor_score_rules')) {
    function westlife_sanitize_visitor_score_rules($value)
    {
        $defaults = function_exists('westlife_get_default_visitor_score_rules')
            ? westlife_get_default_visitor_score_rules()
            : [
                'home_view' => 1,
                'article_read' => 1,
                'comment' => 3,
                'memo_like' => 1,
                'bird_feed' => 1,
                'reaction_like' => 2,
                'reaction_clap' => 2,
                'reaction_party' => 2,
            ];

        $value = is_array($value) ? $value : [];
        $sanitized = [];
        foreach ($defaults as $key => $default) {
            $sanitized[$key] = isset($value[$key]) ? max(0, absint($value[$key])) : (int) $default;
        }

        return $sanitized;
    }
}

if (!function_exists('westlife_sanitize_visitor_daily_caps')) {
    function westlife_sanitize_visitor_daily_caps($value)
    {
        $defaults = function_exists('westlife_get_default_visitor_profile_daily_caps')
            ? westlife_get_default_visitor_profile_daily_caps()
            : [
                'home_view' => 1,
                'article_read' => 30,
                'comment' => 10,
                'memo_like' => 10,
                'bird_feed' => 10,
                'reaction_like' => 20,
                'reaction_clap' => 20,
                'reaction_party' => 20,
            ];

        $value = is_array($value) ? $value : [];
        $sanitized = [];
        foreach ($defaults as $key => $default) {
            $sanitized[$key] = isset($value[$key]) ? max(0, absint($value[$key])) : (int) $default;
        }

        return $sanitized;
    }
}

if (!function_exists('westlife_sanitize_visitor_level_rules')) {
    function westlife_sanitize_visitor_level_rules($value)
    {
        $defaults = function_exists('westlife_get_default_visitor_level_rules')
            ? westlife_get_default_visitor_level_rules()
            : [
                ['max' => 19, 'slug' => 'star-1', 'label' => '见习访客'],
                ['max' => 49, 'slug' => 'star-2', 'label' => '常驻来客'],
                ['max' => 89, 'slug' => 'star-3', 'label' => '留言旅人'],
                ['max' => 149, 'slug' => 'moon-1', 'label' => '互动达人'],
                ['max' => 229, 'slug' => 'moon-2', 'label' => '核心同路'],
                ['max' => 329, 'slug' => 'moon-3', 'label' => '荣誉来宾'],
                ['max' => 469, 'slug' => 'sun-1', 'label' => '星光来客'],
                ['max' => 639, 'slug' => 'sun-2', 'label' => '曜光同行'],
                ['max' => 859, 'slug' => 'sun-3', 'label' => '烈阳贵客'],
                ['max' => PHP_INT_MAX, 'slug' => 'crown', 'label' => '王冠站友'],
            ];

        $value = is_array($value) ? $value : [];
        $sanitized = [];
        $previous_max = -1;
        $last_index = count($defaults) - 1;

        foreach ($defaults as $index => $default) {
            $item = isset($value[$index]) && is_array($value[$index]) ? $value[$index] : [];
            $label = sanitize_text_field($item['label'] ?? $default['label']);
            if ($label === '') {
                $label = $default['label'];
            }

            $max = $default['max'];
            if ($index < $last_index) {
                $submitted_max = isset($item['max']) ? absint($item['max']) : (int) $default['max'];
                $max = max($previous_max + 1, $submitted_max);
            }

            $sanitized[$index] = [
                'label' => $label,
                'max' => $max,
                'slug' => $default['slug'],
            ];

            $previous_max = $max;
        }

        return $sanitized;
    }
}

function westlife_register_all_settings()
{
    // 基础设置
    register_setting('westlife_basic_settings', 'site_established');
    register_setting('westlife_basic_settings', 'blog_decade_start');
    register_setting('westlife_basic_settings', 'author_avatar');
    register_setting('westlife_basic_settings', 'author_name');
    register_setting('westlife_basic_settings', 'author_slogan');
    // 个人简介（后台与关于页均使用）
    register_setting('westlife_basic_settings', 'author_bio', [
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => 'sanitize_textarea_field',
    ]);
    register_setting('westlife_basic_settings', 'westlife_enable_page_loader', ['type' => 'boolean', 'default' => false]);

    register_setting('westlife_basic_settings', 'site_branding_mode');
    register_setting('westlife_basic_settings', 'site_brand_logo');
    register_setting('westlife_basic_settings', 'site_brand_logo_light');
    register_setting('westlife_basic_settings', 'site_brand_logo_dark');

    register_setting('westlife_basic_settings', 'site_background_mode', [
        'type' => 'string',
        'default' => 'none',
        'sanitize_callback' => function ($v) {
            $v = is_string($v) ? strtolower($v) : 'none';
            $a = ['none', 'image', 'bg1', 'bg2', 'bg3'];
            return in_array($v, $a, true) ? $v : 'none';
        }
    ]);
    register_setting('westlife_basic_settings', 'site_background_image');

    // 社交
    foreach (['github', 'twitter', 'youtube', 'weibo', 'email'] as $p) {
        if ($p !== 'rss') {
            register_setting('westlife_social_settings', "social_{$p}");
        }
    }
    register_setting('westlife_social_settings', 'social_custom_name');
    register_setting('westlife_social_settings', 'social_custom_icon');
    register_setting('westlife_social_settings', 'social_custom_url');
    register_setting('westlife_social_settings', 'social_bluesky');
    register_setting('westlife_social_settings', 'social_mastodon');
    register_setting('westlife_social_settings', 'social_instagram');
    register_setting('westlife_social_settings', 'social_bilibili');
    register_setting('westlife_social_settings', 'social_telegram');
    register_setting('westlife_social_settings', 'social_rss');

    // 页脚
    register_setting('westlife_footer_settings', 'footer_copyright');
    register_setting('westlife_footer_settings', 'footer_links');
    register_setting('westlife_footer_settings', 'footer_icp');
    register_setting('westlife_footer_settings', 'footer_icp_link');
    // 备案显示方式：隐藏为图标折叠
    register_setting('westlife_footer_settings', 'footer_icp_hide', [
        'type' => 'boolean',
        'default' => true,
    ]);
    // 萌ICP备案
    register_setting('westlife_footer_settings', 'footer_icp_moe');
    register_setting('westlife_footer_settings', 'footer_icp_moe_link');
    register_setting('westlife_footer_settings', 'footer_police');
    register_setting('westlife_footer_settings', 'footer_police_link');
    register_setting('westlife_footer_settings', 'footer_statistics_code');
    // 自定义页脚右侧信息图标单独分组，避免与其他表单互相覆盖
    // 保留原始文本（包含换行与可能的 <svg>），前端渲染时使用 wp_kses 过滤
    register_setting('westlife_footer_settings_icons', 'footer_info_icons', [
        'type' => 'string',
        'sanitize_callback' => function ($val) {
            return (string) $val;
        },
        'default' => '',
    ]);

    // 图像
    register_setting('westlife_image_settings', 'westlife_thumbnail_sizes');
    register_setting('westlife_image_settings', 'westlife_enable_webp', ['type' => 'boolean', 'default' => false]);
    register_setting('westlife_image_settings', 'westlife_keep_original', ['type' => 'boolean', 'default' => true]);
    register_setting('westlife_image_settings', 'westlife_enable_lazy_load', ['type' => 'boolean', 'default' => true]);
    // 图片预览开关（本地 view-images.js）
    register_setting('westlife_image_settings', 'westlife_enable_fancybox', [
        'type' => 'boolean',
        'default' => true,
        'sanitize_callback' => function ($value) {
            return (bool) $value;
        }
    ]);

    // 图像
    register_setting('westlife_image_settings', 'westlife_jpeg_quality', ['type' => 'integer', 'default' => 85]);
    register_setting('westlife_image_settings', 'westlife_webp_quality', ['type' => 'integer', 'default' => 80]);
    register_setting('westlife_image_settings', 'westlife_enable_responsive_images', ['type' => 'boolean', 'default' => true]);
    register_setting('westlife_image_settings', 'westlife_max_image_width', ['type' => 'integer', 'default' => 1920]);
    register_setting('westlife_image_settings', 'westlife_max_image_height', ['type' => 'integer', 'default' => 1080]);

    // 关于（人格/特征 等留在 westlife_about_settings；关于页主体内容改为独立组，避免相互覆盖）
    register_setting('westlife_about_settings', 'westlife_mbti_code', ['type' => 'string', 'sanitize_callback' => 'westlife_sanitize_mbti_code', 'default' => 'INTJ']);
    register_setting('westlife_about_settings', 'about_music_styles');
    register_setting('westlife_about_settings', 'about_music_artists');
    register_setting('westlife_about_settings', 'about_music_bg');
    register_setting('westlife_about_settings', 'about_music_avatar');

    // 关于页主体内容（独立表单组：westlife_about_main_settings）
    register_setting('westlife_about_main_settings', 'about_circle_words', ['type' => 'string', 'sanitize_callback' => 'sanitize_textarea_field']);
    register_setting('westlife_about_main_settings', 'about_rolling_words', ['type' => 'string', 'sanitize_callback' => 'sanitize_textarea_field']);
    // 关于页：备用名字（打字机）
    register_setting('westlife_about_main_settings', 'about_alt_names', [
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => 'sanitize_textarea_field',
    ]);

    // 关于：为什么建站（Purpose）
    register_setting('westlife_about_main_settings', 'about_purpose_chip_icon', [
        'type' => 'string',
        'default' => 'fas fa-bullseye',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
    register_setting('westlife_about_main_settings', 'about_purpose_chip_text', [
        'type' => 'string',
        'default' => '为什么建站',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
    register_setting('westlife_about_main_settings', 'about_purpose_title', [
        'type' => 'string',
        'default' => '记录与分享的初心',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
    register_setting('westlife_about_main_settings', 'about_purpose_highlight_emoji', [
        'type' => 'string',
        'default' => '📚',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
    register_setting('westlife_about_main_settings', 'about_purpose_highlight_text', [
        'type' => 'string',
        'default' => '记录与输出，沉淀长期价值',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
    register_setting('westlife_about_main_settings', 'about_purpose_subtitle', [
        'type' => 'string',
        'default' => '以站促学，以学促创；构建可复用的知识与组件资产。',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
    register_setting('westlife_about_main_settings', 'about_purpose_paragraphs', [
        'type' => 'string',
        'default' => "创建这个小站的初衷，是希望有一个地方能积累知识与兴趣。分享让积累更有意义，如果能帮助到别人，那一定是很棒的事情。\n\n从最早的新浪博客，到现在个人网站，我一直在分享。喜欢研究数码与软件，也想探索互联网是如何创造与发展的。网络带给我很多收获，我也愿意分享一些生活里的点滴。\n\n这里的内容不会局限：有技能教程与干货；有生活吐槽与小妙招；也有思考与随想。研究什么、发现什么，就分享什么。\n\n这就是本站的意义，也是我的生活方式。很高兴与你相遇，希望我们能共同留下美好的记忆。",
        'sanitize_callback' => 'sanitize_textarea_field',
    ]);
    // Purpose 结尾强调句（单独样式）
    register_setting('westlife_about_main_settings', 'about_purpose_closing_text', [
        'type' => 'string',
        'default' => '这就是本站的意义，也是我的生活方式。很高兴与你相遇，希望我们能共同留下美好的记忆。',
        'sanitize_callback' => 'sanitize_text_field',
    ]);
    // Purpose 右侧配图
    register_setting('westlife_about_main_settings', 'about_purpose_image', [
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => function ($url) {
            $url = esc_url_raw((string)$url);
            if (!$url) return '';
            // 仅允许 http/https
            if (strpos($url, 'http://') !== 0 && strpos($url, 'https://') !== 0) return '';
            return $url;
        },
    ]);

    // 关于：计划（短期/长期）与兴趣爱好（数组结构）
    if (!function_exists('westlife_sanitize_plan_items')) {
        function westlife_sanitize_plan_items($val)
        {
            $out = [];
            if (is_array($val)) {
                foreach ($val as $item) {
                    $emoji = isset($item['emoji']) ? wp_strip_all_tags((string)$item['emoji']) : '';
                    $text  = isset($item['text']) ? sanitize_text_field((string)$item['text']) : '';
                    $status = isset($item['status']) ? strtolower((string)$item['status']) : 'pending';
                    if (!in_array($status, ['pending', 'in-progress', 'completed'], true)) $status = 'pending';
                    if ($emoji === '' && $text === '') continue;
                    $out[] = [
                        'emoji' => $emoji, // 保留完整 emoji 序列，避免截断破坏
                        'text' => $text,
                        'status' => $status,
                    ];
                }
            }
            return $out;
        }
    }
    if (!function_exists('westlife_sanitize_hobby_items')) {
        function westlife_sanitize_hobby_items($val)
        {
            $out = [];
            if (is_array($val)) {
                foreach ($val as $item) {
                    $emoji = isset($item['emoji']) ? wp_strip_all_tags((string)$item['emoji']) : '';
                    $text  = isset($item['text']) ? sanitize_text_field((string)$item['text']) : '';
                    $color = isset($item['color']) ? sanitize_hex_color((string)$item['color']) : '';
                    if ($emoji === '' && $text === '') continue;
                    $out[] = [
                        'emoji' => $emoji, // 保留完整 emoji 序列，避免截断破坏
                        'text' => $text,
                        'color' => $color ?: '',
                    ];
                }
            }
            return $out;
        }
    }

    register_setting('westlife_about_main_settings', 'about_short_plans', [
        'type' => 'array',
        'sanitize_callback' => 'westlife_sanitize_plan_items',
        'default' => [],
    ]);
    register_setting('westlife_about_main_settings', 'about_long_plans', [
        'type' => 'array',
        'sanitize_callback' => 'westlife_sanitize_plan_items',
        'default' => [],
    ]);
    register_setting('westlife_about_main_settings', 'about_hobbies', [
        'type' => 'array',
        'sanitize_callback' => 'westlife_sanitize_hobby_items',
        'default' => [],
    ]);

    // 人格特征设置（5个特征）
    for ($i = 1; $i <= 5; $i++) {
        register_setting('westlife_about_settings', "about_trait_{$i}_title", ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']);
        register_setting('westlife_about_settings', "about_trait_{$i}_label_left", ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']);
        register_setting('westlife_about_settings', "about_trait_{$i}_label_right", ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']);
        register_setting('westlife_about_settings', "about_trait_{$i}_percent", ['type' => 'integer', 'sanitize_callback' => function ($v) {
            return max(0, min(100, absint($v)));
        }]);
        register_setting('westlife_about_settings', "about_trait_{$i}_desc", ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']);
        register_setting('westlife_about_settings', "about_trait_{$i}_color", ['type' => 'string', 'sanitize_callback' => 'sanitize_hex_color']);
    }

    // CDN
    register_setting('westlife_basic_settings', 'westlife_image_cdn_url', [
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => function ($url) {
            $url = trim((string)$url);
            if (empty($url)) return '';
            $url = rtrim($url, '/');
            if (!filter_var($url, FILTER_VALIDATE_URL)) return '';
            if (strpos($url, 'https://') !== 0) return '';
            return $url;
        }
    ]);
    register_setting('westlife_basic_settings', 'westlife_enable_image_cdn', ['type' => 'boolean', 'default' => false]);

    // Umami 统计配置（独立设置组）
    register_setting('westlife_umami_settings', 'westlife_umami_site_id', [
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => 'sanitize_text_field'
    ]);
    register_setting('westlife_umami_settings', 'westlife_umami_host_url', [
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => function ($url) {
            $url = trim((string)$url);
            if (empty($url)) return '';
            $url = rtrim($url, '/');
            if (!filter_var($url, FILTER_VALIDATE_URL)) return '';
            return $url;
        }
    ]);
    register_setting('westlife_umami_settings', 'westlife_umami_api_token', [
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => 'sanitize_text_field'
    ]);

    // 高级功能开关
    register_setting('westlife_basic_settings', 'westlife_enable_dark_mode', [
        'type' => 'boolean',
        'default' => true,
        'sanitize_callback' => function ($v) {
            return $v ? 1 : 0;
        },
    ]);
    register_setting('westlife_basic_settings', 'westlife_enable_animations', [
        'type' => 'boolean',
        'default' => true,
        'sanitize_callback' => function ($v) {
            return $v ? 1 : 0;
        },
    ]);

    // 主题主色（基础设置）
    register_setting('westlife_basic_settings', 'westlife_primary_color', [
        'type' => 'string',
        'default' => '#3368d9',
        'sanitize_callback' => 'sanitize_hex_color'
    ]);
    register_setting('westlife_basic_settings', 'westlife_ui_shape', [
        'type' => 'string',
        'default' => 'sharp',
        'sanitize_callback' => 'westlife_sanitize_ui_shape',
    ]);
    register_setting('westlife_basic_settings', 'westlife_visitor_score_rules', [
        'type' => 'array',
        'default' => function_exists('westlife_get_default_visitor_score_rules')
            ? westlife_get_default_visitor_score_rules()
            : [],
        'sanitize_callback' => 'westlife_sanitize_visitor_score_rules',
    ]);
    register_setting('westlife_basic_settings', 'westlife_visitor_daily_caps', [
        'type' => 'array',
        'default' => function_exists('westlife_get_default_visitor_profile_daily_caps')
            ? westlife_get_default_visitor_profile_daily_caps()
            : [],
        'sanitize_callback' => 'westlife_sanitize_visitor_daily_caps',
    ]);
    register_setting('westlife_basic_settings', 'westlife_visitor_level_rules', [
        'type' => 'array',
        'default' => function_exists('westlife_get_default_visitor_level_rules')
            ? westlife_get_default_visitor_level_rules()
            : [],
        'sanitize_callback' => 'westlife_sanitize_visitor_level_rules',
    ]);

    // 首页任务进度
    register_setting('westlife_basic_settings', 'westlife_home_tasks_raw', [
        'type' => 'string',
        'sanitize_callback' => function ($value) {
            // 保持原始格式，只做基本清理
            return is_string($value) ? wp_kses_post($value) : '';
        },
        'default' => ''
    ]);

    // 数量固定为 5，取消人数/条数设置注册

    // 自定义 hex 颜色清洗：无效或空 => 保存为空字符串
    if (!function_exists('westlife_sanitize_hex_or_empty')) {
        function westlife_sanitize_hex_or_empty($val)
        {
            $val = trim((string)$val);
            if ($val === '') return '';
            if (function_exists('sanitize_hex_color')) {
                $v2 = sanitize_hex_color($val);
                return $v2 ?: '';
            }
            return preg_match('/^#([0-9a-fA-F]{6})$/', $val) ? strtolower($val) : '';
        }
    }
    // 关于页主色（覆盖 MBTI 主色） => 放入独立组，避免被其它表单清空
    register_setting('westlife_about_main_settings', 'about_main_color', [
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => 'westlife_sanitize_hex_or_empty'
    ]);

    // Memos 设置
    register_setting('westlife_memos_settings', 'westlife_memos_api_url', [
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => function ($url) {
            $url = trim((string)$url);
            if (empty($url)) return '';
            $url = rtrim($url, '/');
            if (!filter_var($url, FILTER_VALIDATE_URL)) return '';
            return $url;
        }
    ]);

    register_setting('westlife_memos_settings', 'westlife_memos_api_token', [
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => 'sanitize_text_field'
    ]);

    register_setting('westlife_memos_settings', 'westlife_memos_cache_time', [
        'type' => 'integer',
        'default' => 300,
        'sanitize_callback' => function ($v) {
            return max(60, min(3600, absint($v)));
        }
    ]);

    // Memos 评论系统设置
    register_setting('westlife_memos_settings', 'westlife_memos_comment_system', [
        'type' => 'string',
        'default' => 'none',
        'sanitize_callback' => function ($v) {
            $allowed = ['none', 'twikoo', 'waline'];
            return in_array($v, $allowed, true) ? $v : 'none';
        }
    ]);

    register_setting('westlife_memos_settings', 'westlife_memos_twikoo_envid', [
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => 'sanitize_text_field'
    ]);

    register_setting('westlife_memos_settings', 'westlife_memos_waline_serverurl', [
        'type' => 'string',
        'default' => '',
        'sanitize_callback' => function ($url) {
            $url = trim((string)$url);
            if (empty($url)) return '';
            $url = rtrim($url, '/');
            if (!filter_var($url, FILTER_VALIDATE_URL)) return '';
            return $url;
        }
    ]);
}

function westlife_init_theme_settings()
{
    westlife_register_all_settings();
}
add_action('admin_init', 'westlife_init_theme_settings');
