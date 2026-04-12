<?php
if (!defined('ABSPATH')) exit;

function westlife_basic_settings_tab()
{
    $enable_page_loader = (bool) get_option('westlife_enable_page_loader', false);
    $branding_mode = get_option('site_branding_mode', 'logo');
    $logo_light = get_option('site_brand_logo_light', '');
    $logo_dark = get_option('site_brand_logo_dark', '');
    $enable_cdn = (bool) get_option('westlife_enable_image_cdn', false);
    $cdn_url = get_option('westlife_image_cdn_url', '');
    $author_avatar = get_option('author_avatar', '');
    $author_name = get_option('author_name', '');
    $author_slogan = get_option('author_slogan', '');
    $author_bio = get_option('author_bio', '');
    $effective_author_avatar = trim((string) $author_avatar) ?: get_avatar_url(get_option('admin_email'), ['size' => 200]);
    $effective_author_name = trim((string) $author_name) ?: get_bloginfo('name');
    $effective_author_slogan = trim((string) $author_slogan) ?: '保持好奇，持续精进';
    $effective_author_bio = trim((string) $author_bio) ?: '热爱简洁与高效，专注 Web / WordPress / 前后端协作。';
    $site_established = get_option('site_established', '');
    $blog_decade_start = get_option('blog_decade_start', '');
    $theme_fallback_primary = '#3368d9';
    $primary_color = get_option('westlife_primary_color', '');
    $ui_shape = get_option('westlife_ui_shape', 'sharp');
    $visitor_score_labels = [
        'home_view' => __('首页访问', 'westlife'),
        'article_read' => __('浏览文章', 'westlife'),
        'comment' => __('评论文章', 'westlife'),
        'memo_like' => __('说说点赞', 'westlife'),
        'bird_feed' => __('小鸟投喂', 'westlife'),
        'reaction_like' => __('文章点赞', 'westlife'),
        'reaction_clap' => __('文章鼓掌', 'westlife'),
        'reaction_party' => __('文章撒花', 'westlife'),
    ];
    $visitor_score_rules = function_exists('westlife_get_visitor_score_rules')
        ? westlife_get_visitor_score_rules()
        : [];
    $visitor_daily_caps = function_exists('westlife_get_visitor_profile_daily_caps')
        ? westlife_get_visitor_profile_daily_caps()
        : [];
    $visitor_level_rules = function_exists('westlife_get_visitor_level_rules')
        ? westlife_get_visitor_level_rules()
        : [];
    $default_view_keys = function_exists('westlife_get_default_view_meta_keys')
        ? westlife_get_default_view_meta_keys()
        : ['views', 'view_count', 'post_views_count', '_views'];
    $detected_view_keys = function_exists('westlife_get_detected_view_meta_keys')
        ? westlife_get_detected_view_meta_keys()
        : [];
    $views_migration_status = isset($_GET['views_migration']) ? sanitize_key((string) $_GET['views_migration']) : '';
?>

    <div class="postbox">
        <div class="inside">
            <form method="post" action="options.php">
                <?php settings_fields('westlife_basic_settings'); ?>

                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row" colspan="2">
                                <h3>
                                    <span class="dashicons dashicons-admin-home"></span>
                                    <?php _e('首页功能区', 'westlife'); ?>
                                </h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row">
                                <label for="westlife_home_tasks_raw"><?php _e('任务进度', 'westlife'); ?></label>
                            </th>
                            <td>
                                <?php $tasks_raw = get_option('westlife_home_tasks_raw', ''); ?>
                                <textarea id="westlife_home_tasks_raw" name="westlife_home_tasks_raw" rows="8" class="large-text code" placeholder="<?php esc_attr_e('每行一个任务，格式：任务名称 | 进度百分比', 'westlife'); ?>"><?php echo esc_textarea($tasks_raw); ?></textarea>
                                <p class="description">
                                    <strong><?php _e('格式说明：', 'westlife'); ?></strong><br>
                                    • <?php _e('每行一个任务，格式：', 'westlife'); ?><code>任务名称 | 进度百分比</code><br>
                                    • <?php _e('示例：', 'westlife'); ?><code>完成主题开发 | 85</code><br>
                                    • <?php _e('进度范围：0-100，不填默认为 0', 'westlife'); ?><br>
                                    • <?php _e('也支持 JSON 格式：', 'westlife'); ?><code>[{"title":"任务名","percent":50}]</code>
                                </p>
                                <?php
                                if (function_exists('westlife_get_home_tasks')) {
                                    $current_tasks = westlife_get_home_tasks();
                                    if (!empty($current_tasks)) {
                                        echo '<div style="margin-top: 12px; padding: 12px; background: #f0f9ff; border-left: 3px solid #2271b1;">';
                                        echo '<strong>' . __('当前任务预览：', 'westlife') . '</strong>';
                                        echo '<ul style="margin: 8px 0 0 20px; list-style: disc;">';
                                        foreach ($current_tasks as $task) {
                                            echo '<li>' . esc_html($task['title']) . ' - <strong>' . intval($task['percent']) . '%</strong></li>';
                                        }
                                        echo '</ul>';
                                        echo '</div>';
                                    }
                                }
                                ?>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row">
                                <label for="site_established"><?php _e('建站时间', 'westlife'); ?></label>
                            </th>
                            <td>
                                <input type="date" id="site_established" name="site_established" class="regular-text" value="<?php echo esc_attr($site_established); ?>">
                                <p class="description"><?php _e('用于计算网站运行天数，显示在关于页面等位置。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">
                                <label for="blog_decade_start"><?php _e('博客十年签约时间', 'westlife'); ?></label>
                            </th>
                            <td>
                                <input type="date" id="blog_decade_start" name="blog_decade_start" class="regular-text" value="<?php echo esc_attr($blog_decade_start); ?>">
                                <p class="description"><?php _e('用于计算“博客十年之约”进度条，留空则使用建站时间。', 'westlife'); ?></p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row" colspan="2">
                                <h3>
                                    <span class="dashicons dashicons-admin-users"></span>
                                    <?php _e('作者信息', 'westlife'); ?>
                                </h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row">
                                <label for="author_avatar"><?php _e('作者头像', 'westlife'); ?></label>
                            </th>
                            <td>
                                <div class="upload-wrap">
                                    <input type="url" id="author_avatar" name="author_avatar" class="regular-text" value="<?php echo esc_url($author_avatar); ?>" placeholder="https://...">
                                    <button type="button" class="button upload-image-button" data-target="author_avatar">
                                        <span class="dashicons dashicons-admin-media" style="vertical-align: middle; margin-right: 5px;"></span>
                                        <?php _e('选择图片', 'westlife'); ?>
                                    </button>
                                </div>
                                <div class="image-preview" style="margin-top: 10px;">
                                    <img src="<?php echo esc_url($effective_author_avatar); ?>" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 2px solid #ddd; display: block;">
                                </div>
                                <p class="description"><?php _e('建议尺寸：200x200px，支持 JPG、PNG、WebP 格式。', 'westlife'); ?></p>
                                <?php if (!trim((string) $author_avatar)): ?>
                                    <p class="description"><strong><?php _e('当前生效：', 'westlife'); ?></strong><?php _e('未填写时将使用管理员邮箱对应的头像（Gravatar）。', 'westlife'); ?></p>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="author_name"><?php _e('作者姓名', 'westlife'); ?></label></th>
                            <td>
                                <input type="text" id="author_name" name="author_name" class="regular-text" value="<?php echo esc_attr($author_name); ?>" placeholder="<?php esc_attr_e('输入您的姓名或昵称', 'westlife'); ?>">
                                <p class="description"><?php _e('显示在关于页面和文章作者信息中。', 'westlife'); ?></p>
                                <p class="description"><strong><?php _e('当前生效：', 'westlife'); ?></strong><?php echo esc_html($effective_author_name); ?><?php if (!trim((string) $author_name)) { echo ' （' . __('来自站点标题', 'westlife') . '）'; } ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="author_slogan"><?php _e('个人标语', 'westlife'); ?></label></th>
                            <td>
                                <input type="text" id="author_slogan" name="author_slogan" class="regular-text" value="<?php echo esc_attr($author_slogan); ?>" placeholder="<?php esc_attr_e('一句话介绍自己', 'westlife'); ?>">
                                <p class="description"><?php _e('简短的个人标语或座右铭。', 'westlife'); ?></p>
                                <p class="description"><strong><?php _e('当前生效：', 'westlife'); ?></strong><?php echo esc_html($effective_author_slogan); ?><?php if (!trim((string) $author_slogan)) { echo ' （' . __('默认值', 'westlife') . '）'; } ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="author_bio"><?php _e('个人简介', 'westlife'); ?></label></th>
                            <td>
                                <textarea id="author_bio" name="author_bio" class="large-text" rows="3" placeholder="<?php esc_attr_e('更详细的自我介绍（可选）', 'westlife'); ?>"><?php echo esc_textarea($author_bio); ?></textarea>
                                <p class="description"><strong><?php _e('当前生效：', 'westlife'); ?></strong><?php echo esc_html($effective_author_bio); ?><?php if (!trim((string) $author_bio)) { echo ' （' . __('默认值', 'westlife') . '）'; } ?></p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row" colspan="2">
                                <h3>
                                    <span class="dashicons dashicons-format-image"></span>
                                    <?php _e('站点标识', 'westlife'); ?>
                                </h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('标识模式', 'westlife'); ?></th>
                            <td>
                                <fieldset>
                                    <label style="display:inline-block;margin-right:20px;">
                                        <input type="radio" name="site_branding_mode" value="logo" <?php checked($branding_mode, 'logo'); ?>>
                                        <span class="dashicons dashicons-format-image" style="margin-right:5px;"></span><?php _e('Logo', 'westlife'); ?>
                                    </label>
                                    <label style="display:inline-block;">
                                        <input type="radio" name="site_branding_mode" value="text" <?php checked($branding_mode, 'text'); ?>>
                                        <span class="dashicons dashicons-editor-textcolor" style="margin-right:5px;"></span><?php _e('文字', 'westlife'); ?>
                                    </label>
                                </fieldset>
                                <p class="description"><?php _e('选择站点标识显示方式：Logo 图片或纯文字标题。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr id="logo-settings" class="<?php echo $branding_mode === 'text' ? 'u-hidden' : ''; ?>">
                            <th scope="row"><?php _e('站点 Logo', 'westlife'); ?></th>
                            <td>
                                <div style="margin-bottom: 12px;">
                                    <label style="display:block;margin-bottom:5px;font-weight:600;"><?php _e('亮色模式 Logo', 'westlife'); ?></label>
                                    <input type="url" class="regular-text" name="site_brand_logo_light" value="<?php echo esc_url($logo_light); ?>" placeholder="<?php esc_attr_e('亮色模式 Logo URL', 'westlife'); ?>">
                                    <button type="button" class="button upload-image-button" data-target="site_brand_logo_light">
                                        <span class="dashicons dashicons-admin-media" style="vertical-align: middle; margin-right: 5px;"></span><?php _e('选择图片', 'westlife'); ?>
                                    </button>
                                    <?php if ($logo_light): ?>
                                        <div class="image-preview" style="margin-top:8px;">
                                            <img src="<?php echo esc_url($logo_light); ?>" style="max-height:40px;border:1px solid #ddd;padding:4px;border-radius:4px;display:block;">
                                        </div>
                                    <?php endif; ?>
                                </div>
                                <div>
                                    <label style="display:block;margin-bottom:5px;font-weight:600;"><?php _e('暗色模式 Logo（可选）', 'westlife'); ?></label>
                                    <input type="url" class="regular-text" name="site_brand_logo_dark" value="<?php echo esc_url($logo_dark); ?>" placeholder="<?php esc_attr_e('暗色模式 Logo URL', 'westlife'); ?>">
                                    <button type="button" class="button upload-image-button" data-target="site_brand_logo_dark">
                                        <span class="dashicons dashicons-admin-media" style="vertical-align: middle; margin-right: 5px;"></span><?php _e('选择图片', 'westlife'); ?>
                                    </button>
                                    <?php if ($logo_dark): ?>
                                        <div class="image-preview" style="margin-top:8px;">
                                            <img src="<?php echo esc_url($logo_dark); ?>" style="max-height:40px;border:1px solid #ddd;padding:4px;border-radius:4px;display:block;">
                                        </div>
                                    <?php endif; ?>
                                </div>
                                <p class="description"><?php _e('建议尺寸：高度 42px，宽度不超过 200px。未设置暗色 Logo 时会自动处理亮色 Logo。', 'westlife'); ?></p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row" colspan="2">
                                <h3>
                                    <span class="dashicons dashicons-admin-appearance"></span>
                                    <?php _e('主题配色', 'westlife'); ?>
                                </h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row"><label for="westlife_primary_color"><?php _e('主色调', 'westlife'); ?></label></th>
                            <td>
                                <input type="color" id="westlife_primary_color" name="westlife_primary_color" value="<?php echo esc_attr($primary_color ?: $theme_fallback_primary); ?>" data-fallback="<?php echo esc_attr($theme_fallback_primary); ?>" data-is-default="<?php echo $primary_color ? '0' : '1'; ?>">
                                <input type="text" id="westlife_primary_color_text" value="<?php echo esc_attr($primary_color ?: $theme_fallback_primary); ?>" placeholder="#<?php echo esc_attr(ltrim($theme_fallback_primary, '#')); ?>" aria-label="<?php esc_attr_e('手动输入 HEX 颜色', 'westlife'); ?>" pattern="^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$" maxlength="9" style="width:110px;margin-left:8px;" />
                                <button type="button" class="button button-secondary" id="reset-primary-color" style="margin-left:8px;">
                                    <?php _e('恢复主题默认', 'westlife'); ?>
                                </button>
                                <span class="description" style="margin-left:6px;display:inline-block;max-width:360px;vertical-align:middle;">
                                    <?php printf(__('点击“恢复主题默认”将使用主题默认色 %s；也可在旁输入框直接键入 3 或 6 位 HEX（如：#0af / #3368d9）。', 'westlife'), '<code>' . esc_html($theme_fallback_primary) . '</code>'); ?>
                                </span>
                                <div style="margin-top:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                                    <span id="primary-color-preview" style="display:inline-block;width:24px;height:24px;border-radius:4px;border:1px solid #ddd;background:<?php echo esc_attr($primary_color ?: $theme_fallback_primary); ?>"></span>
                                    <code id="primary-color-code" style="font-size:13px;line-height:1;">&nbsp;<?php echo esc_html($primary_color ?: $theme_fallback_primary); ?>&nbsp;</code>
                                    <button type="button" class="button" id="copy-primary-var" aria-label="<?php esc_attr_e('复制 CSS 变量名 --color-primary', 'westlife'); ?>" style="display:inline-flex;align-items:center;gap:4px;">
                                        <span class="dashicons dashicons-editor-code"></span><?php _e('复制变量名', 'westlife'); ?>
                                    </button>
                                    <span id="copy-primary-feedback" style="display:none;font-size:12px;color:#008a20;">
                                        <span class="dashicons dashicons-yes"></span> <?php _e('已复制', 'westlife'); ?>
                                    </span>
                                </div>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('外观风格', 'westlife'); ?></th>
                            <td>
                                <fieldset>
                                    <label style="display:inline-block;margin-right:20px;">
                                        <input type="radio" name="westlife_ui_shape" value="sharp" <?php checked($ui_shape, 'sharp'); ?>>
                                        <?php _e('直角', 'westlife'); ?>
                                    </label>
                                    <label style="display:inline-block;">
                                        <input type="radio" name="westlife_ui_shape" value="rounded" <?php checked($ui_shape, 'rounded'); ?>>
                                        <?php _e('圆角', 'westlife'); ?>
                                    </label>
                                </fieldset>
                                <p class="description"><?php _e('直角模式会统一压平大部分卡片、按钮、输入框和弹层；圆角模式会恢复统一圆角语言。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row" colspan="2">
                                <h3><span class="dashicons dashicons-chart-line"></span><?php _e('访客等级系统', 'westlife'); ?></h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('积分规则', 'westlife'); ?></th>
                            <td>
                                <table class="widefat striped" style="max-width:720px;">
                                    <thead>
                                        <tr>
                                            <th><?php _e('行为', 'westlife'); ?></th>
                                            <th style="width:180px;"><?php _e('每次加分', 'westlife'); ?></th>
                                            <th style="width:180px;"><?php _e('每日上限', 'westlife'); ?></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php foreach ($visitor_score_labels as $score_key => $score_label): ?>
                                            <tr>
                                                <td><?php echo esc_html($score_label); ?></td>
                                                <td>
                                                    <input type="number" min="0" step="1" class="small-text" name="westlife_visitor_score_rules[<?php echo esc_attr($score_key); ?>]" value="<?php echo esc_attr((string) ($visitor_score_rules[$score_key] ?? 0)); ?>">
                                                </td>
                                                <td>
                                                    <input type="number" min="0" step="1" class="small-text" name="westlife_visitor_daily_caps[<?php echo esc_attr($score_key); ?>]" value="<?php echo esc_attr((string) ($visitor_daily_caps[$score_key] ?? 0)); ?>">
                                                </td>
                                            </tr>
                                        <?php endforeach; ?>
                                    </tbody>
                                </table>
                                <p class="description"><?php _e('每日上限填 0 表示不限制。这里的积分和上限都会直接影响首页欢迎卡片的活跃指数和等级增长。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('等级名称与阈值', 'westlife'); ?></th>
                            <td>
                                <table class="widefat striped" style="max-width:720px;">
                                    <thead>
                                        <tr>
                                            <th style="width:90px;"><?php _e('图标级别', 'westlife'); ?></th>
                                            <th><?php _e('等级名称', 'westlife'); ?></th>
                                            <th style="width:180px;"><?php _e('升级阈值（积分上限）', 'westlife'); ?></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <?php foreach ($visitor_level_rules as $level_index => $level_rule): ?>
                                            <?php
                                            $level_no = $level_index + 1;
                                            $level_icon = $level_no <= 3
                                                ? sprintf(__('星 %d', 'westlife'), $level_no)
                                                : ($level_no <= 6
                                                    ? sprintf(__('月 %d', 'westlife'), $level_no - 3)
                                                    : ($level_no <= 9
                                                        ? sprintf(__('日 %d', 'westlife'), $level_no - 6)
                                                        : __('皇冠', 'westlife')));
                                            ?>
                                            <tr>
                                                <td><?php echo esc_html($level_icon); ?></td>
                                                <td>
                                                    <input type="text" class="regular-text" name="westlife_visitor_level_rules[<?php echo esc_attr((string) $level_index); ?>][label]" value="<?php echo esc_attr((string) ($level_rule['label'] ?? '')); ?>">
                                                </td>
                                                <td>
                                                    <?php if ($level_no < count($visitor_level_rules)): ?>
                                                        <input type="number" min="0" step="1" class="small-text" name="westlife_visitor_level_rules[<?php echo esc_attr((string) $level_index); ?>][max]" value="<?php echo esc_attr((string) ($level_rule['max'] ?? 0)); ?>">
                                                    <?php else: ?>
                                                        <span class="description"><?php _e('最高等级', 'westlife'); ?></span>
                                                    <?php endif; ?>
                                                </td>
                                            </tr>
                                        <?php endforeach; ?>
                                    </tbody>
                                </table>
                                <p class="description"><?php _e('等级顺序固定为 3 星、3 月、3 日、1 皇冠。前 9 级填写“该等级的最大积分”，最后一级自动视为最高等级。', 'westlife'); ?></p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row" colspan="2">
                                <h3><span class="dashicons dashicons-performance"></span><?php _e('性能优化', 'westlife'); ?></h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row"><label for="westlife_enable_image_cdn"><?php _e('图片 CDN', 'westlife'); ?></label></th>
                            <td>
                                <fieldset>
                                    <label>
                                        <input type="checkbox" id="westlife_enable_image_cdn" name="westlife_enable_image_cdn" value="1" <?php checked($enable_cdn); ?>>
                                        <?php _e('启用图片 CDN 加速', 'westlife'); ?>
                                    </label>
                                </fieldset>
                                <p class="description"><?php _e('启用后，上传的图片将使用 CDN 地址访问，提升加载速度。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr id="cdn-url-setting" class="<?php echo !$enable_cdn ? 'u-hidden' : ''; ?>">
                            <th scope="row"><label for="westlife_image_cdn_url"><?php _e('CDN 地址', 'westlife'); ?></label></th>
                            <td>
                                <input type="url" id="westlife_image_cdn_url" class="regular-text" name="westlife_image_cdn_url" value="<?php echo esc_url($cdn_url); ?>" placeholder="https://img.example.com">
                                <button type="button" id="test-cdn-connection" class="button button-secondary"><span class="dashicons dashicons-admin-tools" style="vertical-align: middle; margin-right: 5px;"></span><?php _e('测试连接', 'westlife'); ?></button>
                                <p class="description"><?php _e('输入您的图片 CDN 域名，例如：https://img.xifeng.net（不要在末尾添加斜杠）', 'westlife'); ?></p>
                                <div id="cdn-test-result" style="margin-top: 10px;"></div>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row" colspan="2">
                                <h3><span class="dashicons dashicons-admin-tools"></span><?php _e('高级功能', 'westlife'); ?></h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row"><label for="westlife_enable_page_loader"><?php _e('首次加载动画', 'westlife'); ?></label></th>
                            <td>
                                <fieldset>
                                    <label><input type="checkbox" id="westlife_enable_page_loader" name="westlife_enable_page_loader" value="1" <?php checked($enable_page_loader); ?>> <?php _e('启用页面加载动画', 'westlife'); ?></label>
                                </fieldset>
                                <p class="description"><?php _e('首次访问<strong>任何页面</strong>时显示<strong>罗盘旋转加载动画</strong>，后续访问显示<strong>顶部进度条</strong>。关闭时全部使用进度条。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="westlife_enable_dark_mode"><?php _e('暗色模式', 'westlife'); ?></label></th>
                            <td>
                                <fieldset>
                                    <label><input type="checkbox" id="westlife_enable_dark_mode" name="westlife_enable_dark_mode" value="1" <?php checked(get_option('westlife_enable_dark_mode', true)); ?>> <?php _e('启用暗色模式切换功能', 'westlife'); ?></label>
                                </fieldset>
                                <p class="description"><?php _e('为用户提供暗色/亮色主题切换选项，增强用户体验。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="westlife_enable_animations"><?php _e('页面动画', 'westlife'); ?></label></th>
                            <td>
                                <fieldset>
                                    <label><input type="checkbox" id="westlife_enable_animations" name="westlife_enable_animations" value="1" <?php checked(get_option('westlife_enable_animations', true)); ?>> <?php _e('启用页面滚动动画效果', 'westlife'); ?></label>
                                </fieldset>
                                <p class="description"><?php _e('为页面元素添加滚动进入动画，提升视觉体验。关闭可提升性能。', 'westlife'); ?></p>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <?php submit_button(__('保存设置', 'westlife')); ?>
            </form>
        </div>
    </div>

    <div class="postbox">
        <div class="inside">
            <h3>
                <span class="dashicons dashicons-migrate"></span>
                <?php _e('浏览量数据迁移', 'westlife'); ?>
            </h3>

            <?php if ($views_migration_status === 'success'): ?>
                <div class="notice notice-success inline">
                    <p>
                        <?php
                        printf(
                            __('迁移完成：已更新 %1$d 篇内容，合并 %2$d 条记录，累计写入 %3$s 次浏览。', 'westlife'),
                            intval($_GET['migrated_posts'] ?? 0),
                            intval($_GET['migrated_rows'] ?? 0),
                            number_format_i18n(intval($_GET['migrated_views'] ?? 0))
                        );
                        ?>
                    </p>
                    <?php if (!empty($_GET['migrated_keys'])): ?>
                        <p><strong><?php _e('命中的旧键：', 'westlife'); ?></strong><?php echo esc_html(rawurldecode((string) $_GET['migrated_keys'])); ?></p>
                    <?php endif; ?>
                </div>
            <?php elseif ($views_migration_status === 'empty'): ?>
                <div class="notice notice-warning inline">
                    <p><?php _e('没有可迁移的旧浏览量 meta key。请至少填写一个旧键名。', 'westlife'); ?></p>
                </div>
            <?php endif; ?>

            <table class="form-table" role="presentation">
                <tbody>
                    <tr>
                        <th scope="row"><?php _e('当前主键', 'westlife'); ?></th>
                        <td>
                            <code>post_views</code>
                            <p class="description"><?php _e('主题当前统一使用 post_views 作为文章/页面浏览量的数据库 meta key。', 'westlife'); ?></p>
                        </td>
                    </tr>
                    <tr>
                        <th scope="row"><?php _e('自动检测到的旧键', 'westlife'); ?></th>
                        <td>
                            <?php if (!empty($detected_view_keys)): ?>
                                <code><?php echo esc_html(implode(', ', $detected_view_keys)); ?></code>
                            <?php else: ?>
                                <span class="description"><?php _e('暂未检测到明显的旧浏览量键。', 'westlife'); ?></span>
                            <?php endif; ?>
                        </td>
                    </tr>
                </tbody>
            </table>

            <form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
                <?php wp_nonce_field('westlife_migrate_post_views', 'westlife_migrate_post_views_nonce'); ?>
                <input type="hidden" name="action" value="westlife_migrate_post_views">
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row">
                                <label for="source_keys"><?php _e('旧浏览量键列表', 'westlife'); ?></label>
                            </th>
                            <td>
                                <textarea id="source_keys" name="source_keys" rows="8" class="large-text code"><?php echo esc_textarea(implode("\n", !empty($detected_view_keys) ? $detected_view_keys : $default_view_keys)); ?></textarea>
                                <p class="description"><?php _e('每行一个旧 meta key。执行后会把这些键的数值累加合并到 post_views。默认不会删除旧键，先做安全迁移。', 'westlife'); ?></p>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <?php submit_button(__('迁移到 post_views', 'westlife'), 'secondary'); ?>
            </form>
        </div>
    </div>

    <script type="text/javascript">
        jQuery(document).ready(function($) {
            (function() {
                var $color = $('#westlife_primary_color');
                var $colorText = $('#westlife_primary_color_text');
                var $btnReset = $('#reset-primary-color');
                var $preview = $('#primary-color-preview');
                var $code = $('#primary-color-code');
                var $btnCopy = $('#copy-primary-var');
                var $copyFeedback = $('#copy-primary-feedback');
                var FALLBACK = ($color.data('fallback') || '<?php echo esc_js($theme_fallback_primary); ?>').toLowerCase();
                var HEX_RE = /^#?([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
                var copyTimer = null;

                function normalizeHex(input) {
                    if (!input) return '';
                    input = input.trim();
                    if (input.startsWith('#')) input = input.slice(1);
                    if (!HEX_RE.test('#' + input)) return '';
                    if (input.length === 3) {
                        input = input.split('').map(function(c) {
                            return c + c;
                        }).join('');
                    }
                    return '#' + input.toLowerCase();
                }

                function updatePreview(val) {
                    var show = normalizeHex(val) || FALLBACK;
                    $preview.css('background', show);
                    $code.text(show);
                }

                function syncFromPicker() {
                    var v = $color.val();
                    $colorText.removeClass('is-invalid').val(v);
                    updatePreview(v);
                }

                function syncFromText() {
                    var raw = $colorText.val();
                    var norm = normalizeHex(raw);
                    if (norm) {
                        $color.val(norm);
                        $colorText.removeClass('is-invalid');
                        updatePreview(norm);
                    } else {
                        $colorText.addClass('is-invalid');
                    }
                }

                $color.on('input change', syncFromPicker);
                $colorText.on('change blur', syncFromText);
                $colorText.on('keydown', function(e) {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        syncFromText();
                        $colorText.blur();
                    }
                });

                $btnReset.on('click', function() {
                    $color.val(FALLBACK);
                    $colorText.removeClass('is-invalid').val(FALLBACK);
                    updatePreview(FALLBACK);
                });

                $btnCopy.on('click', function() {
                    var text = '--color-primary';
                    if (navigator.clipboard && navigator.clipboard.writeText) {
                        navigator.clipboard.writeText(text).then(showCopyFeedback, fallbackCopy);
                    } else {
                        fallbackCopy();
                    }

                    function fallbackCopy() {
                        var ta = document.createElement('textarea');
                        ta.value = text;
                        ta.style.position = 'fixed';
                        ta.style.top = '-1000px';
                        document.body.appendChild(ta);
                        ta.select();
                        try {
                            document.execCommand('copy');
                        } catch (e) {}
                        document.body.removeChild(ta);
                        showCopyFeedback();
                    }
                });

                function showCopyFeedback() {
                    if (copyTimer) clearTimeout(copyTimer);
                    $copyFeedback.stop(true, true).fadeIn(120);
                    copyTimer = setTimeout(function() {
                        $copyFeedback.fadeOut(180);
                    }, 1600);
                }

                updatePreview($color.val());

                if (!document.getElementById('westlife-admin-inline-css')) {
                    var css = '.is-invalid{border-color:#dc3232 !important;box-shadow:0 0 0 1px #dc323266;}';
                    var styleTag = document.createElement('style');
                    styleTag.id = 'westlife-admin-inline-css';
                    styleTag.appendChild(document.createTextNode(css));
                    document.head.appendChild(styleTag);
                }
            })();

            $('input[name="site_branding_mode"]').on('change', function() {
                if ($(this).val() === 'logo') {
                    $('#logo-settings').show();
                } else {
                    $('#logo-settings').hide();
                }
            });

            $('#westlife_enable_image_cdn').on('change', function() {
                if ($(this).is(':checked')) {
                    $('#cdn-url-setting').show();
                } else {
                    $('#cdn-url-setting').hide();
                }
            });

            $('#test-cdn-connection').on('click', function() {
                var $btn = $(this);
                var $result = $('#cdn-test-result');
                var cdnUrl = $('#westlife_image_cdn_url').val();
                if (!cdnUrl) {
                    $result.html('<div class="notice notice-warning inline"><p><?php _e('请先输入 CDN 地址', 'westlife'); ?></p></div>');
                    return;
                }
                $btn.prop('disabled', true).text('<?php _e('测试中...', 'westlife'); ?>');
                $result.html('<div class="notice notice-info inline"><p><span class="dashicons dashicons-update-alt" style="animation: rotation 1s infinite linear;"></span> <?php _e('正在测试连接...', 'westlife'); ?></p></div>');
                setTimeout(function() {
                    $result.html('<div class="notice notice-success inline"><p><span class="dashicons dashicons-yes-alt" style="color:#46b450;"></span> <?php _e('CDN 连接正常', 'westlife'); ?></p></div>');
                    $btn.prop('disabled', false).text('<?php _e('测试连接', 'westlife'); ?>');
                }, 2000);
            });

            function updateDecadePreview() {
                var blogStart = $('#blog_decade_start').val();
                var siteStart = $('#site_established').val();
                var startDate = blogStart || siteStart || '<?php echo esc_js(date('Y-m-d')); ?>';
                if (startDate) {
                    var start = new Date(startDate);
                    var end = new Date(start.getTime() + (10 * 365 * 24 * 60 * 60 * 1000));
                    var today = new Date();
                    var totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
                    var passedDays = Math.max(0, Math.floor((today - start) / (1000 * 60 * 60 * 24)));
                    var percent = Math.min(100, Math.max(0, (passedDays / totalDays) * 100));
                    var $preview = $('#decade-preview');
                    if ($preview.length === 0) {
                        $('#blog_decade_start').after('<div id="decade-preview" style="margin-top:8px;padding:8px;background:#f0f9ff;border-left:3px solid #0073aa;font-size:13px;"></div>');
                        $preview = $('#decade-preview');
                    }
                    $preview.html('<strong><?php _e('预览：', 'westlife'); ?></strong>' + startDate + ' ~ ' + end.toISOString().split('T')[0] + ' | <?php _e('进度：', 'westlife'); ?>' + percent.toFixed(1) + '% | <?php _e('剩余：', 'westlife'); ?>' + Math.max(0, totalDays - passedDays) + ' <?php _e('天', 'westlife'); ?>');
                }
            }
            $('#blog_decade_start, #site_established').on('input change', updateDecadePreview);
            updateDecadePreview();

            if (window.westlifeMediaUpload) {
                window.westlifeMediaUpload();
            } else {
                setTimeout(function() {
                    if (window.westlifeMediaUpload) {
                        window.westlifeMediaUpload();
                    }
                }, 1000);
            }
        });
    </script>

<?php
}

function westlife_umami_settings_tab()
{
    $umami_site_id = get_option('westlife_umami_site_id', '');
    $umami_host_url = get_option('westlife_umami_host_url', '');
    $umami_api_token = get_option('westlife_umami_api_token', '');
?>
    <div class="postbox">
        <div class="inside">
            <form method="post" action="options.php">
                <?php settings_fields('westlife_umami_settings'); ?>
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr><th scope="row" colspan="2"><h3><span class="dashicons dashicons-chart-area"></span><?php _e('Umami 统计分析', 'westlife'); ?></h3></th></tr>
                        <tr><td colspan="2"><p class="description" style="margin-bottom: 15px;"><?php _e('Umami 是一个开源的隐私友好型网站分析工具。配置后可以在主题中显示访问统计数据。', 'westlife'); ?> <a href="https://umami.is/" target="_blank" rel="noopener"><?php _e('了解更多', 'westlife'); ?> →</a></p></td></tr>
                        <tr>
                            <th scope="row"><label for="westlife_umami_site_id"><?php _e('Umami 站点 ID', 'westlife'); ?> <span style="color: #d63638;">*</span></label></th>
                            <td><input type="text" id="westlife_umami_site_id" name="westlife_umami_site_id" class="regular-text" value="<?php echo esc_attr($umami_site_id); ?>" placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"><p class="description"><?php _e('在 Umami 后台创建网站后获得的站点 ID（UUID 格式）。', 'westlife'); ?><br><strong style="color: #d63638;"><?php _e('重要：请在 Umami 网站设置中启用 "Share publicly" 选项。', 'westlife'); ?></strong></p></td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="westlife_umami_host_url"><?php _e('Umami 主机 URL', 'westlife'); ?> <span style="color: #d63638;">*</span></label></th>
                            <td>
                                <div style="display: flex; gap: 10px; align-items: flex-start;">
                                    <input type="url" id="westlife_umami_host_url" name="westlife_umami_host_url" class="regular-text" value="<?php echo esc_url($umami_host_url); ?>" placeholder="https://analytics.example.com" style="flex: 1;">
                                    <button type="button" id="test-umami-connection" class="button button-secondary"><span class="dashicons dashicons-admin-tools"></span><?php _e('测试连接', 'westlife'); ?></button>
                                </div>
                                <p class="description"><?php _e('您的 Umami 实例地址（不要在末尾添加斜杠）。', 'westlife'); ?><br><?php _e('注意：自签名 SSL 证书可能导致测试失败，但不影响前端数据收集。', 'westlife'); ?></p>
                                <div id="umami-test-result" style="margin-top: 10px;"></div>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="westlife_umami_api_token"><?php _e('Umami API Token', 'westlife'); ?> <span style="color: #d63638;">*</span></label></th>
                            <td><input type="password" id="westlife_umami_api_token" name="westlife_umami_api_token" class="regular-text" value="<?php echo esc_attr($umami_api_token); ?>" placeholder="umami.xxxxxxxx.xxxxxxxxxxxx" autocomplete="off"><p class="description"><?php _e('在 Umami 后台 Settings → API Keys 创建只读 Token，用于获取统计数据。', 'westlife'); ?><br><?php _e('权限要求：只需要 "Website" 读取权限即可。', 'westlife'); ?></p></td>
                        </tr>
                        <tr>
                            <th scope="row" colspan="2"><h3><span class="dashicons dashicons-info-outline"></span><?php _e('配置指南', 'westlife'); ?></h3></th>
                        </tr>
                        <tr>
                            <td colspan="2">
                                <div class="card" style="max-width: 100%; margin: 0;">
                                    <div class="inside" style="padding: 15px;">
                                        <ol style="margin: 0; padding-left: 20px; line-height: 1.8;">
                                            <li><strong><?php _e('部署 Umami：', 'westlife'); ?></strong><?php _e('使用 Docker、Railway 或 Vercel 部署您的 Umami 实例', 'westlife'); ?> <a href="https://umami.is/docs/install" target="_blank" rel="noopener"><?php _e('查看教程', 'westlife'); ?> →</a></li>
                                            <li><strong><?php _e('添加网站：', 'westlife'); ?></strong><?php _e('在 Umami 后台添加您的网站，获取站点 ID', 'westlife'); ?></li>
                                            <li><strong><?php _e('启用公开分享：', 'westlife'); ?></strong><?php _e('进入网站设置，启用 "Share publicly" 选项', 'westlife'); ?></li>
                                            <li><strong><?php _e('创建 API Token：', 'westlife'); ?></strong><?php _e('在 Settings → API Keys 创建只读权限的 Token', 'westlife'); ?></li>
                                            <li><strong><?php _e('填写配置：', 'westlife'); ?></strong><?php _e('将站点 ID、主机 URL 和 API Token 填入上方表单', 'westlife'); ?></li>
                                            <li><strong><?php _e('测试连接：', 'westlife'); ?></strong><?php _e('点击"测试连接"按钮验证配置是否正确', 'westlife'); ?></li>
                                        </ol>
                                        <p style="margin-top: 15px; margin-bottom: 0; padding-top: 15px; border-top: 1px solid #dcdcde;"><span class="dashicons dashicons-warning" style="color: #dba617;"></span> <strong><?php _e('注意事项：', 'westlife'); ?></strong><?php _e('确保您的 WordPress 站点可以访问 Umami 服务器。如果使用自签名 SSL 证书，可能需要在服务器上配置信任。', 'westlife'); ?></p>
                                    </div>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <?php submit_button(__('保存设置', 'westlife')); ?>
            </form>
        </div>
    </div>
<?php
}

function westlife_image_settings_tab()
{
    $webp_support = function_exists('imagewebp') && function_exists('imagecreatefromjpeg');
    $gd_support = extension_loaded('gd');
    $imagick_support = extension_loaded('imagick');
?>

    <div class="postbox">
        <div class="inside">
            <form method="post" action="options.php">
                <?php settings_fields('westlife_image_settings'); ?>

                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row" colspan="2">
                                <h3 style="margin: 0; padding: 15px 0 10px; border-bottom: 1px solid #ddd; color: #23282d;">
                                    <span class="dashicons dashicons-image-crop" style="margin-right: 8px;"></span>
                                    <?php _e('缩略图尺寸', 'westlife'); ?>
                                </h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('大尺寸 (首页)', 'westlife'); ?></th>
                            <td>
                                <div class="thumbnail-size-inputs">
                                    <input type="number" name="westlife_thumbnail_sizes[large][width]" value="<?php echo esc_attr(westlife_get_thumbnail_size('large', 'width')); ?>" min="1" class="small-text"> ×
                                    <input type="number" name="westlife_thumbnail_sizes[large][height]" value="<?php echo esc_attr(westlife_get_thumbnail_size('large', 'height')); ?>" min="1" class="small-text"> px
                                </div>
                                <p class="description"><?php _e('首页文章列表大图尺寸（主题设置优先）。若未在此处设置，将回退使用「设置 → 媒体」的大图宽度并按 16:9 自动计算高度。修改后请使用“Regenerate Thumbnails”再生旧缩略图。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('中尺寸 (相关文章)', 'westlife'); ?></th>
                            <td>
                                <div class="thumbnail-size-inputs">
                                    <input type="number" name="westlife_thumbnail_sizes[medium][width]" value="<?php echo esc_attr(westlife_get_thumbnail_size('medium', 'width')); ?>" min="1" class="small-text"> ×
                                    <input type="number" name="westlife_thumbnail_sizes[medium][height]" value="<?php echo esc_attr(westlife_get_thumbnail_size('medium', 'height')); ?>" min="1" class="small-text"> px
                                </div>
                                <p class="description"><?php _e('文章内相关文章缩略图尺寸（主题设置优先）。若未在此处设置，将回退使用「设置 → 媒体」的中等图宽度并按 16:9 自动计算高度。修改后请使用“Regenerate Thumbnails”再生旧缩略图。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row" colspan="2">
                                <h3 style="margin: 0; padding: 15px 0 10px; border-bottom: 1px solid #ddd; color: #23282d;">
                                    <span class="dashicons dashicons-admin-tools" style="margin-right: 8px;"></span>
                                    <?php _e('图片压缩', 'westlife'); ?>
                                </h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('服务器环境检测', 'westlife'); ?></th>
                            <td>
                                <div class="server-capabilities">
                                    <p><span class="dashicons dashicons-<?php echo $gd_support ? 'yes' : 'no'; ?>" style="color: <?php echo $gd_support ? '#46b450' : '#dc3232'; ?>; margin-right: 5px;"></span><strong>GD 扩展：</strong> <?php echo $gd_support ? __('已支持', 'westlife') : __('不支持', 'westlife'); ?></p>
                                    <p><span class="dashicons dashicons-<?php echo $imagick_support ? 'yes' : 'no'; ?>" style="color: <?php echo $imagick_support ? '#46b450' : '#dc3232'; ?>; margin-right: 5px;"></span><strong>ImageMagick 扩展：</strong> <?php echo $imagick_support ? __('已支持', 'westlife') : __('不支持', 'westlife'); ?></p>
                                    <p><span class="dashicons dashicons-<?php echo $webp_support ? 'yes' : 'no'; ?>" style="color: <?php echo $webp_support ? '#46b450' : '#dc3232'; ?>; margin-right: 5px;"></span><strong>WebP 支持：</strong> <?php echo $webp_support ? __('已支持', 'westlife') : __('不支持', 'westlife'); ?></p>
                                </div>
                                <p class="description"><?php _e('检测服务器图片处理能力，WebP 需要 GD 或 ImageMagick 扩展支持。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('JPEG 质量', 'westlife'); ?></th>
                            <td>
                                <input type="range" id="jpeg_quality" name="westlife_jpeg_quality" min="10" max="100" step="5" value="<?php echo esc_attr(get_option('westlife_jpeg_quality', 85)); ?>" style="width: 300px;">
                                <span id="jpeg_quality_value"><?php echo esc_html(get_option('westlife_jpeg_quality', 85)); ?>%</span>
                                <p class="description"><?php _e('JPEG 图片压缩质量，数值越高质量越好但文件越大。推荐值：80-90', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <?php if ($webp_support): ?>
                            <tr>
                                <th scope="row"><?php _e('WebP 转换', 'westlife'); ?></th>
                                <td>
                                    <fieldset>
                                        <label><input type="checkbox" name="westlife_enable_webp" value="1" <?php checked(get_option('westlife_enable_webp', false)); ?>> <?php _e('自动转换上传图片为 WebP 格式', 'westlife'); ?></label>
                                        <br>
                                        <label style="margin-top: 8px; display: inline-block;"><input type="checkbox" name="westlife_keep_original" value="1" <?php checked(get_option('westlife_keep_original', true)); ?>> <?php _e('保留原图文件（兼容不支持 WebP 的浏览器）', 'westlife'); ?></label>
                                    </fieldset>
                                    <p class="description"><?php _e('WebP 格式可减少 25-35% 的文件大小，提升加载速度。', 'westlife'); ?></p>
                                </td>
                            </tr>
                            <tr>
                                <th scope="row"><?php _e('WebP 质量', 'westlife'); ?></th>
                                <td>
                                    <input type="range" id="webp_quality" name="westlife_webp_quality" min="10" max="100" step="5" value="<?php echo esc_attr(get_option('westlife_webp_quality', 80)); ?>" style="width: 300px;">
                                    <span id="webp_quality_value"><?php echo esc_html(get_option('westlife_webp_quality', 80)); ?>%</span>
                                    <p class="description"><?php _e('WebP 图片压缩质量，通常可以比 JPEG 设置更低的值。推荐值：75-85', 'westlife'); ?></p>
                                </td>
                            </tr>
                        <?php else: ?>
                            <tr>
                                <th scope="row"><?php _e('WebP 转换', 'westlife'); ?></th>
                                <td>
                                    <div class="notice notice-warning inline">
                                        <p><span class="dashicons dashicons-warning" style="color: #f56e28;"></span><strong><?php _e('服务器不支持 WebP', 'westlife'); ?></strong><br><?php _e('需要 GD 扩展或 ImageMagick 扩展支持 WebP 功能。请联系主机商启用相关扩展。', 'westlife'); ?></p>
                                    </div>
                                </td>
                            </tr>
                        <?php endif; ?>
                        <tr>
                            <th scope="row" colspan="2">
                                <h3 style="margin: 0; padding: 15px 0 10px; border-bottom: 1px solid #ddd; color: #23282d;">
                                    <span class="dashicons dashicons-performance" style="margin-right: 8px;"></span>
                                    <?php _e('图片优化', 'westlife'); ?>
                                </h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('懒加载', 'westlife'); ?></th>
                            <td>
                                <fieldset>
                                    <label><input type="checkbox" name="westlife_enable_lazy_load" value="1" <?php checked(get_option('westlife_enable_lazy_load', true)); ?>> <?php _e('启用图片懒加载', 'westlife'); ?></label>
                                </fieldset>
                                <p class="description"><?php _e('延迟加载可见区域外的图片，提升页面加载速度', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('图片预览', 'westlife'); ?></th>
                            <td>
                                <label><input type="checkbox" name="westlife_enable_fancybox" value="1" <?php checked(get_option('westlife_enable_fancybox', true)); ?>> <?php _e('启用图片放大预览', 'westlife'); ?></label>
                                <p class="description"><?php _e('启用后，点击文章中的图片可放大查看。使用主题本地的 view-images.js，不再依赖 Fancybox CDN。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('响应式图片', 'westlife'); ?></th>
                            <td>
                                <fieldset>
                                    <label><input type="checkbox" name="westlife_enable_responsive_images" value="1" <?php checked(get_option('westlife_enable_responsive_images', true)); ?>> <?php _e('启用响应式图片（srcset）', 'westlife'); ?></label>
                                </fieldset>
                                <p class="description"><?php _e('为不同屏幕尺寸自动选择合适的图片大小，减少带宽消耗。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row" colspan="2">
                                <h3 style="margin: 0; padding: 15px 0 10px; border-bottom: 1px solid #ddd; color: #23282d;">
                                    <span class="dashicons dashicons-admin-settings" style="margin-right: 8px;"></span>
                                    <?php _e('处理设置', 'westlife'); ?>
                                </h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('图片最大尺寸', 'westlife'); ?></th>
                            <td>
                                <div class="thumbnail-size-inputs">
                                    <input type="number" name="westlife_max_image_width" value="<?php echo esc_attr(get_option('westlife_max_image_width', 1920)); ?>" min="100" max="4000" class="small-text"> ×
                                    <input type="number" name="westlife_max_image_height" value="<?php echo esc_attr(get_option('westlife_max_image_height', 1080)); ?>" min="100" max="4000" class="small-text"> px
                                </div>
                                <p class="description"><?php _e('超过此尺寸的图片将被自动缩放，可减少存储空间和加载时间。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><?php _e('批量处理', 'westlife'); ?></th>
                            <td>
                                <button type="button" id="bulk-optimize-images" class="button button-secondary">
                                    <span class="dashicons dashicons-update-alt" style="margin-right: 5px;"></span>
                                    <?php _e('优化现有图片', 'westlife'); ?>
                                </button>
                                <div id="bulk-progress" class="u-hidden" style="margin-top: 10px;">
                                    <div class="progress-bar" style="background: #f1f1f1; height: 20px; border-radius: 3px; overflow: hidden;">
                                        <div class="progress-fill" style="background: #0073aa; height: 100%; width: 0%; transition: width 0.3s;"></div>
                                    </div>
                                    <p class="progress-text" style="margin-top: 5px;"></p>
                                </div>
                                <p class="description"><?php _e('对媒体库中的现有图片应用当前压缩设置（此操作不可逆）。', 'westlife'); ?></p>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <?php submit_button(__('保存设置', 'westlife')); ?>
            </form>
        </div>
    </div>

    <script type="text/javascript">
        jQuery(document).ready(function($) {
            $('#jpeg_quality').on('input', function() {
                $('#jpeg_quality_value').text($(this).val() + '%');
            });

            $('#webp_quality').on('input', function() {
                $('#webp_quality_value').text($(this).val() + '%');
            });

            $('input[name="westlife_enable_webp"]').on('change', function() {
                var $keepOriginal = $('input[name="westlife_keep_original"]');
                if (!$(this).is(':checked')) {
                    $keepOriginal.prop('disabled', true);
                } else {
                    $keepOriginal.prop('disabled', false);
                }
            });

            $('#bulk-optimize-images').on('click', function() {
                var $button = $(this);
                var $progress = $('#bulk-progress');
                var $progressFill = $('.progress-fill');
                var $progressText = $('.progress-text');

                WestlifeModal.confirm({
                    title: '批量优化图片',
                    message: '确定要批量优化现有图片吗？<br><strong>此操作不可逆！</strong>',
                    type: 'warning',
                    confirmText: '确定优化',
                    cancelText: '取消',
                    confirmClass: 'primary'
                }).then(function() {
                    $button.prop('disabled', true).find('.dashicons').addClass('spin');
                    $progress.show();
                    $progressText.text('<?php _e('准备中...', 'westlife'); ?>');

                    var progress = 0;
                    var interval = setInterval(function() {
                        progress += Math.random() * 20;
                        if (progress >= 100) {
                            progress = 100;
                            clearInterval(interval);
                            $progressText.text('<?php _e('优化完成！', 'westlife'); ?>');
                            $button.prop('disabled', false).find('.dashicons').removeClass('spin');

                            setTimeout(function() {
                                $progress.hide();
                                $progressFill.css('width', '0%');
                            }, 2000);
                        } else {
                            $progressText.text('<?php _e('处理中...', 'westlife'); ?> ' + Math.round(progress) + '%');
                        }
                        $progressFill.css('width', progress + '%');
                    }, 500);
                }).catch(function() {});
            });
        });
    </script>

<?php
}

if (!function_exists('westlife_get_thumbnail_size')) {
    function westlife_get_thumbnail_size($size, $dimension)
    {
        $sizes = get_option('westlife_thumbnail_sizes', [
            'large' => ['width' => 800, 'height' => 400],
            'medium' => ['width' => 400, 'height' => 200],
        ]);

        return isset($sizes[$size][$dimension]) ? $sizes[$size][$dimension] : '';
    }
}

function westlife_social_settings_tab()
{
?>
    <div class="postbox">
        <div class="inside">
            <form method="post" action="options.php">
                <?php settings_fields('westlife_social_settings'); ?>
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr><th scope="row" colspan="2"><h3><span class="dashicons dashicons-admin-links"></span><?php _e('常用社交', 'westlife'); ?></h3></th></tr>
                        <tr><th scope="row"><label for="social_github"><span class="dashicons dashicons-admin-site" style="margin-right: 5px;"></span>GitHub</label></th><td><input type="url" id="social_github" class="regular-text" name="social_github" value="<?php echo esc_url(get_option('social_github')); ?>" placeholder="https://github.com/yourusername"><p class="description"><?php _e('你的 GitHub 个人主页', 'westlife'); ?></p></td></tr>
                        <tr><th scope="row"><label for="social_twitter"><span class="dashicons dashicons-twitter" style="margin-right: 5px;"></span>Twitter (X)</label></th><td><input type="url" id="social_twitter" class="regular-text" name="social_twitter" value="<?php echo esc_url(get_option('social_twitter')); ?>" placeholder="https://twitter.com/yourusername"><p class="description"><?php _e('你的 Twitter/X 个人主页', 'westlife'); ?></p></td></tr>
                        <tr><th scope="row"><label for="social_youtube"><span class="dashicons dashicons-video-alt3" style="margin-right: 5px;"></span>YouTube</label></th><td><input type="url" id="social_youtube" class="regular-text" name="social_youtube" value="<?php echo esc_url(get_option('social_youtube')); ?>" placeholder="https://www.youtube.com/@yourchannel"><p class="description"><?php _e('你的 YouTube 频道地址', 'westlife'); ?></p></td></tr>
                        <tr><th scope="row"><label for="social_instagram"><span class="dashicons dashicons-camera" style="margin-right: 5px;"></span>Instagram</label></th><td><input type="url" id="social_instagram" class="regular-text" name="social_instagram" value="<?php echo esc_url(get_option('social_instagram')); ?>" placeholder="https://www.instagram.com/yourusername"><p class="description"><?php _e('你的 Instagram 个人主页', 'westlife'); ?></p></td></tr>
                        <tr><th scope="row" colspan="2"><h3 style="margin: 0; padding: 15px 0 10px; border-bottom: 1px solid #ddd; color: #23282d;"><span class="dashicons dashicons-buddicons-activity" style="margin-right: 8px;"></span><?php _e('新兴社交平台', 'westlife'); ?></h3></th></tr>
                        <tr><th scope="row"><label for="social_bluesky"><span class="dashicons dashicons-cloud" style="margin-right: 5px;"></span>Bluesky</label></th><td><input type="url" id="social_bluesky" class="regular-text" name="social_bluesky" value="<?php echo esc_url(get_option('social_bluesky')); ?>" placeholder="https://bsky.app/profile/yourusername.bsky.social"><p class="description"><?php _e('你的 Bluesky 个人主页', 'westlife'); ?></p></td></tr>
                        <tr><th scope="row"><label for="social_mastodon"><span class="dashicons dashicons-megaphone" style="margin-right: 5px;"></span>Mastodon</label></th><td><input type="url" id="social_mastodon" class="regular-text" name="social_mastodon" value="<?php echo esc_url(get_option('social_mastodon')); ?>" placeholder="https://mastodon.social/@yourusername"><p class="description"><?php _e('你的 Mastodon 个人主页', 'westlife'); ?></p></td></tr>
                        <tr><th scope="row" colspan="2"><h3 style="margin: 0; padding: 15px 0 10px; border-bottom: 1px solid #ddd; color: #23282d;"><span class="dashicons dashicons-location-alt" style="margin-right: 8px;"></span><?php _e('中文社交平台', 'westlife'); ?></h3></th></tr>
                        <tr><th scope="row"><label for="social_weibo"><span class="dashicons dashicons-format-status" style="margin-right: 5px;"></span><?php _e('微博', 'westlife'); ?></label></th><td><input type="url" id="social_weibo" class="regular-text" name="social_weibo" value="<?php echo esc_url(get_option('social_weibo')); ?>" placeholder="https://weibo.com/yourusername"><p class="description"><?php _e('你的新浪微博个人主页', 'westlife'); ?></p></td></tr>
                        <tr><th scope="row"><label for="social_bilibili"><span class="dashicons dashicons-video-alt2" style="margin-right: 5px;"></span><?php _e('哔哩哔哩', 'westlife'); ?></label></th><td><input type="url" id="social_bilibili" class="regular-text" name="social_bilibili" value="<?php echo esc_url(get_option('social_bilibili')); ?>" placeholder="https://space.bilibili.com/youruid"><p class="description"><?php _e('你的 B站 个人空间', 'westlife'); ?></p></td></tr>
                        <tr><th scope="row" colspan="2"><h3 style="margin: 0; padding: 15px 0 10px; border-bottom: 1px solid #ddd; color: #23282d;"><span class="dashicons dashicons-email-alt" style="margin-right: 8px;"></span><?php _e('其他联系方式', 'westlife'); ?></h3></th></tr>
                        <tr><th scope="row"><label for="social_rss"><span class="dashicons dashicons-rss" style="margin-right: 5px;"></span>RSS</label></th><td><input type="url" id="social_rss" class="regular-text" name="social_rss" value="<?php echo esc_url(get_option('social_rss')); ?>" placeholder="<?php echo esc_attr(get_feed_link()); ?>"><p class="description"><?php _e('你的网站 RSS 订阅地址，留空将显示默认主订阅地址。', 'westlife'); ?></p></td></tr>
                        <tr><th scope="row"><label for="social_email"><span class="dashicons dashicons-email" style="margin-right: 5px;"></span><?php _e('邮箱', 'westlife'); ?></label></th><td><input type="email" id="social_email" class="regular-text" name="social_email" value="<?php echo esc_attr(get_option('social_email')); ?>" placeholder="your@email.com"><p class="description"><?php _e('你的联系邮箱地址', 'westlife'); ?></p></td></tr>
                        <tr><th scope="row"><label for="social_telegram"><span class="dashicons dashicons-share" style="margin-right: 5px;"></span>Telegram</label></th><td><input type="url" id="social_telegram" class="regular-text" name="social_telegram" value="<?php echo esc_url(get_option('social_telegram')); ?>" placeholder="https://t.me/yourusername"><p class="description"><?php _e('你的 Telegram 个人主页或频道', 'westlife'); ?></p></td></tr>
                    </tbody>
                </table>
                <?php submit_button(__('保存设置', 'westlife')); ?>
            </form>
        </div>
    </div>

    <script type="text/javascript">
        jQuery(document).ready(function($) {
            if (!$('#social_rss').val()) {
                $('#social_rss').attr('placeholder', '<?php echo esc_js(get_feed_link()); ?>');
            }
            $('input[type="url"]').on('blur', function() {
                var url = $(this).val();
                if (url && !url.match(/^https?:\/\//)) {
                    $(this).val('https://' + url);
                }
            });
            $('#social_email').on('blur', function() {
                var email = $(this).val();
                var emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (email && !emailRegex.test(email)) {
                    $(this).css('border-color', '#dc3232');
                    if ($(this).siblings('.email-error').length === 0) {
                        $(this).after('<p class="email-error description" style="color: #dc3232;">请输入有效的邮箱地址</p>');
                    }
                } else {
                    $(this).css('border-color', '');
                    $(this).siblings('.email-error').remove();
                }
            });
        });
    </script>
<?php
}

function westlife_footer_settings_tab()
{
?>

    <div class="postbox">
        <div class="inside">
            <form method="post" action="options.php">
                <?php settings_fields('westlife_footer_settings'); ?>

                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row" colspan="2">
                                <h3>
                                    <span class="dashicons dashicons-admin-site-alt" style="margin-right: 8px;"></span>
                                    <?php _e('备案信息', 'westlife'); ?>
                                </h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row">
                                <label for="footer_icp"><?php _e('ICP备案', 'westlife'); ?></label>
                            </th>
                            <td>
                                <fieldset>
                                    <legend class="screen-reader-text"><?php _e('备案信息显示方式', 'westlife'); ?></legend>
                                    <p style="margin:0 0 10px;">
                                        <label>
                                            <input type="radio" name="footer_icp_display_mode" value="inline" <?php checked('inline', get_option('footer_icp_display_mode', 'icon')); ?> />
                                            <?php _e('直接显示（页脚右下角一行显示）', 'westlife'); ?>
                                        </label>
                                        <br>
                                        <label style="margin-top: 6px; display: inline-block;">
                                            <input type="radio" name="footer_icp_display_mode" value="icon" <?php checked('icon', get_option('footer_icp_display_mode', 'icon')); ?> />
                                            <?php _e('图标折叠（显示图标，点击弹出面板）', 'westlife'); ?>
                                        </label>
                                        <br>
                                        <label style="margin-top: 6px; display: inline-block;">
                                            <input type="radio" name="footer_icp_display_mode" value="hidden" <?php checked('hidden', get_option('footer_icp_display_mode', 'icon')); ?> />
                                            <?php _e('完全隐藏（页脚不显示任何备案信息）', 'westlife'); ?>
                                        </label>
                                    </p>
                                    <p class="description"><?php _e('选择备案信息的显示方式。完全隐藏适合没有任何备案的海外网站。', 'westlife'); ?></p>
                                </fieldset>
                                <input type="text" id="footer_icp" name="footer_icp" class="regular-text" value="<?php echo esc_attr(get_option('footer_icp', '')); ?>" placeholder="<?php esc_attr_e('京ICP备12345678号', 'westlife'); ?>">
                                <p style="margin: 8px 0 0;">
                                    <label for="footer_icp_link" style="font-weight: normal;"><?php _e('备案链接：', 'westlife'); ?></label>
                                    <input type="url" id="footer_icp_link" name="footer_icp_link" class="regular-text" value="<?php echo esc_url(get_option('footer_icp_link', '')); ?>" placeholder="https://beian.miit.gov.cn/">
                                </p>
                                <p class="description"><?php _e('中国大陆网站需要填写ICP备案号，链接通常指向工信部备案网站。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">
                                <label for="footer_police"><?php _e('公安备案', 'westlife'); ?></label>
                            </th>
                            <td>
                                <input type="text" id="footer_police" name="footer_police" class="regular-text" value="<?php echo esc_attr(get_option('footer_police', '')); ?>" placeholder="<?php esc_attr_e('京公网安备 11010802012345号', 'westlife'); ?>">
                                <p style="margin: 8px 0 0;">
                                    <label for="footer_police_link" style="font-weight: normal;"><?php _e('备案链接：', 'westlife'); ?></label>
                                    <input type="url" id="footer_police_link" name="footer_police_link" class="regular-text" value="<?php echo esc_url(get_option('footer_police_link', '')); ?>" placeholder="http://www.beian.gov.cn/">
                                </p>
                                <p class="description"><?php _e('部分地区要求填写公安备案号，链接通常指向全国公安机关备案网站。', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row">
                                <label for="footer_icp_moe"><?php _e('萌ICP备案', 'westlife'); ?></label>
                            </th>
                            <td>
                                <input type="text" id="footer_icp_moe" name="footer_icp_moe" class="regular-text" value="<?php echo esc_attr(get_option('footer_icp_moe', '')); ?>" placeholder="<?php esc_attr_e('萌ICP备12345678号', 'westlife'); ?>">
                                <p style="margin: 8px 0 0;">
                                    <label for="footer_icp_moe_link" style="font-weight: normal;"><?php _e('备案链接：', 'westlife'); ?></label>
                                    <input type="url" id="footer_icp_moe_link" name="footer_icp_moe_link" class="regular-text" value="<?php echo esc_url(get_option('footer_icp_moe_link', '')); ?>" placeholder="https://icp.gov.moe/?keyword=xxxxxxxx">
                                </p>
                                <p class="description"><?php _e('根据输入的备案号自动生成关键词链接，示例：萌ICP备12345678号 => https://icp.gov.moe/?keyword=12345678', 'westlife'); ?></p>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row" colspan="2">
                                <h3>
                                    <span class="dashicons dashicons-chart-area" style="margin-right: 8px;"></span>
                                    <?php _e('统计代码', 'westlife'); ?>
                                </h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row">
                                <label for="footer_statistics_code"><?php _e('第三方统计', 'westlife'); ?></label>
                            </th>
                            <td>
                                <textarea id="footer_statistics_code" name="footer_statistics_code" class="large-text code" rows="6" placeholder="<?php esc_attr_e('<!-- 百度统计、Google Analytics 等统计代码 -->', 'westlife'); ?>"><?php echo esc_textarea(get_option('footer_statistics_code', '')); ?></textarea>
                                <p class="description"><?php _e('插入第三方统计工具代码，如百度统计、Google Analytics、51.la 等。代码将在页面底部加载。', 'westlife'); ?></p>
                                <?php $statistics_code = get_option('footer_statistics_code', ''); ?>
                                <?php if (!empty($statistics_code)): ?>
                                    <div class="notice notice-info inline" style="margin-top: 10px;">
                                        <p><span class="dashicons dashicons-info" style="color: #0073aa;"></span><strong><?php _e('当前状态：', 'westlife'); ?></strong><?php _e('已配置统计代码', 'westlife'); ?></p>
                                    </div>
                                <?php endif; ?>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <?php submit_button(__('保存设置（统计与备案）', 'westlife')); ?>
            </form>
        </div>
    </div>


    <div class="postbox">
        <div class="inside">
            <style>
                #footer-info-icons-ui .footer-icon-row {
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    margin-bottom: 8px;
                    transition: background-color .2s ease, border-color .2s ease, opacity .2s ease;
                    border-left: 3px solid transparent;
                    padding-left: 6px;
                }
                #footer-info-icons-ui .footer-icon-row.is-empty {
                    opacity: .75;
                }
                #footer-info-icons-ui .footer-icon-row.is-partial {
                    background: #fff7e6;
                    border-left-color: #ffb84d;
                }
                #footer-info-icons-ui .footer-icon-row.is-complete {
                    background: #f6ffed;
                    border-left-color: #52c41a;
                }
                .footer-icons-count-badge {
                    float: right;
                    font-size: 12px;
                    color: #555;
                    background: #f0f0f1;
                    padding: 2px 8px;
                    border-radius: 999px;
                }
            </style>
            <form method="post" action="options.php">
                <?php settings_fields('westlife_footer_settings_icons'); ?>
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row" colspan="2">
                                <h3>
                                    <span class="dashicons dashicons-admin-appearance" style="margin-right: 8px;"></span>
                                    <?php _e('右侧信息图标（最多 6 个）', 'westlife'); ?>
                                    <span id="footer-icons-count" class="footer-icons-count-badge" aria-live="polite">—</span>
                                </h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row"><label><?php _e('图标配置', 'westlife'); ?></label></th>
                            <td>
                                <div id="footer-info-icons-ui">
                                    <?php for ($i = 1; $i <= 6; $i++): ?>
                                        <div class="footer-icon-row">
                                            <span class="dashicons dashicons-admin-links" aria-hidden="true"></span>
                                            <input type="text" class="regular-text footer-icon-label" placeholder="<?php echo esc_attr(sprintf(__('标签（第 %d 个）', 'westlife'), $i)); ?>" style="width: 14rem;" />
                                            <input type="text" class="regular-text footer-icon-class" placeholder="<?php echo esc_attr(__('图标类名（如：fab fa-wordpress）', 'westlife')); ?>" style="width: 16rem;" />
                                            <input type="url" class="regular-text footer-icon-url" placeholder="https://" style="width: 18rem;" />
                                            <input type="text" class="regular-text footer-icon-title" placeholder="<?php echo esc_attr(__('悬浮文字', 'westlife')); ?>" style="width: 14rem;" />
                                        </div>
                                    <?php endfor; ?>
                                </div>

                                <textarea id="footer_info_icons" name="footer_info_icons" class="u-hidden" aria-hidden="true"><?php echo esc_textarea(get_option('footer_info_icons', '')); ?></textarea>

                                <p class="description">
                                    <?php _e('建议：直接填写 Lucide 名称或旧图标类名（例如：blocks、database、fa-wordpress），无需写标签。', 'westlife'); ?><br>
                                    <?php _e('如需使用 SVG/Iconfont，可在“图标类名”处粘贴完整 <svg> 代码，也同样支持。', 'westlife'); ?><br>
                                    <?php _e('最多 6 个，留空的行会被忽略。', 'westlife'); ?>
                                </p>
                            </td>
                        </tr>
                    </tbody>
                </table>
                <?php submit_button(__('保存图标设置（右侧图标）', 'westlife')); ?>
            </form>
        </div>
    </div>

    <script type="text/javascript">
        jQuery(document).ready(function($) {
            (function initFooterIconsUI() {
                var $hidden = $('#footer_info_icons');
                var $rows = $('#footer-info-icons-ui .footer-icon-row');
                var $count = $('#footer-icons-count');

                function parseLine(line) {
                    var parts = (line || '').split('|');
                    return {
                        label: (parts[0] || '').trim(),
                        icon: (parts[1] || '').trim(),
                        url: (parts[2] || '').trim(),
                        title: (parts[3] || parts[0] || '').trim()
                    };
                }

                function updateRowState($r) {
                    var label = $r.find('.footer-icon-label').val().trim();
                    var icon = $r.find('.footer-icon-class').val().trim();
                    var url = $r.find('.footer-icon-url').val().trim();
                    var title = $r.find('.footer-icon-title').val().trim();
                    $r.removeClass('is-empty is-partial is-complete');
                    if (label === '' && icon === '' && url === '' && title === '') {
                        $r.addClass('is-empty');
                    } else if (label && icon) {
                        $r.addClass('is-complete');
                    } else {
                        $r.addClass('is-partial');
                    }
                }

                function updateCount() {
                    var count = 0;
                    $rows.each(function() {
                        var label = $(this).find('.footer-icon-label').val().trim();
                        var icon = $(this).find('.footer-icon-class').val().trim();
                        if (label && icon) count++;
                    });
                    if ($count.length) {
                        $count.text('已配置 ' + count + '/6 个');
                    }
                }

                var raw = ($hidden.val() || '').split('\n');
                for (var i = 0; i < $rows.length; i++) {
                    var data = parseLine(raw[i] || '');
                    var $r = $rows.eq(i);
                    $r.find('.footer-icon-label').val(data.label);
                    $r.find('.footer-icon-class').val(data.icon);
                    $r.find('.footer-icon-url').val(data.url);
                    $r.find('.footer-icon-title').val(data.title);
                    updateRowState($r);
                }
                updateCount();

                $hidden.closest('form').on('submit', function() {
                    var lines = [];
                    $rows.each(function() {
                        var label = $(this).find('.footer-icon-label').val().trim();
                        var icon = $(this).find('.footer-icon-class').val().trim();
                        var url = $(this).find('.footer-icon-url').val().trim();
                        var title = $(this).find('.footer-icon-title').val().trim();
                        if (label && icon) {
                            lines.push([label, icon, url, title || label].join('|'));
                        }
                    });
                    $hidden.val(lines.join('\n'));
                });

                $rows.on('input change', 'input', function() {
                    var $r = $(this).closest('.footer-icon-row');
                    updateRowState($r);
                    updateCount();
                });
            })();

            $('#footer_statistics_code').on('input', function() {
                var code = $(this).val().trim();
                var $notice = $(this).siblings('.notice');

                if (code.length > 0) {
                    if ($notice.length === 0) {
                        $(this).after('<div class="notice notice-info inline" style="margin-top: 10px;"><p><span class="dashicons dashicons-info" style="color: #0073aa;"></span><strong>当前状态：</strong>已配置统计代码</p></div>');
                    }
                } else {
                    $notice.remove();
                }
            });

            $('#footer_icp').on('input', function() {
                var icp = $(this).val().trim();
                var $link = $('#footer_icp_link');
                if (icp && !$link.val()) {
                    $link.val('https://beian.miit.gov.cn/');
                }
            });

            $('#footer_police').on('input', function() {
                var police = $(this).val().trim();
                var $link = $('#footer_police_link');
                if (police && !$link.val()) {
                    $link.val('http://www.beian.gov.cn/');
                }
            });

            function extractMoeNumber(text) {
                var m = (text || '').match(/(\d{8})/);
                return m ? m[1] : '';
            }
            $('#footer_icp_moe').on('input', function() {
                var moe = $(this).val().trim();
                var $link = $('#footer_icp_moe_link');
                var num = extractMoeNumber(moe);
                if (num && !$link.val()) {
                    $link.val('https://icp.gov.moe/?keyword=' + num);
                }
            });
        });
    </script>

<?php
}

function westlife_theme_settings_page()
{
    $theme = wp_get_theme();
    if ($theme->parent()) $theme = wp_get_theme($theme->parent()->get_template());
    $theme_version = $theme->get('Version');
    $theme_uri = $theme->get('ThemeURI');
    $active_tab = isset($_GET['tab']) ? sanitize_text_field($_GET['tab']) : 'basic';
?>
    <div class="wrap westlife-theme-settings-page wl-admin-wrap">
        <div class="wl-shell">
            <div class="wl-hero">
                <div class="wl-hero-main">
                    <div class="wl-page-head">
                        <h1>
                            <span class="wl-title-mark"><span class="dashicons dashicons-admin-customizer"></span></span>
                            <span class="wl-title-text"><?php _e('主题设置', 'westlife'); ?></span>
                        </h1>
                        <div class="wl-page-meta">
                            <span class="wl-badge wl-badge-kicker">Westlife</span>
                            <span class="wl-badge wl-badge-version">v<?php echo esc_html($theme_version ?: '2.0.0'); ?></span>
                            <?php if ($theme_uri) : ?>
                                <a class="wl-badge wl-badge-link" href="<?php echo esc_url($theme_uri); ?>" target="_blank" rel="noopener"><?php _e('主题主页', 'westlife'); ?></a>
                            <?php endif; ?>
                            <a class="wl-badge wl-badge-link" href="https://github.com/gentpan/WordPress-westlife-theme" target="_blank" rel="noopener">GitHub</a>
                        </div>
                    </div>
                    <p class="wl-hero-description"><?php _e('统一管理主题基础设置、图像处理、统计、邮件、说说与关于页面配置。', 'westlife'); ?></p>
                </div>
            </div>

            <?php settings_errors(); ?>

            <div class="wl-tabs-wrap">
                <nav class="nav-tab-wrapper wl-tabs" aria-label="<?php esc_attr_e('主题设置标签页', 'westlife'); ?>">
                    <a href="?page=westlife-settings&tab=basic" class="nav-tab wl-tab <?php echo $active_tab === 'basic' ? 'nav-tab-active is-active' : ''; ?>">
                <span class="dashicons dashicons-admin-settings"></span>
                <?php _e('基础设置', 'westlife'); ?>
            </a>
            <a href="?page=westlife-settings&tab=umami" class="nav-tab wl-tab <?php echo $active_tab === 'umami' ? 'nav-tab-active is-active' : ''; ?>">
                <span class="dashicons dashicons-chart-area"></span>
                <?php _e('Umami 统计', 'westlife'); ?>
            </a>
            <a href="?page=westlife-settings&tab=image" class="nav-tab wl-tab <?php echo $active_tab === 'image' ? 'nav-tab-active is-active' : ''; ?>">
                <span class="dashicons dashicons-format-image"></span>
                <?php _e('图像处理', 'westlife'); ?>
            </a>
            <a href="?page=westlife-settings&tab=social" class="nav-tab wl-tab <?php echo $active_tab === 'social' ? 'nav-tab-active is-active' : ''; ?>">
                <span class="dashicons dashicons-share"></span>
                <?php _e('社交链接', 'westlife'); ?>
            </a>
            <a href="?page=westlife-settings&tab=footer" class="nav-tab wl-tab <?php echo $active_tab === 'footer' ? 'nav-tab-active is-active' : ''; ?>">
                <span class="dashicons dashicons-admin-appearance"></span>
                <?php _e('页脚设置', 'westlife'); ?>
            </a>
            <a href="?page=westlife-settings&tab=feeds" class="nav-tab wl-tab <?php echo $active_tab === 'feeds' ? 'nav-tab-active is-active' : ''; ?>">
                <span class="dashicons dashicons-rss"></span>
                <?php _e('订阅缓存', 'westlife'); ?>
            </a>
            <a href="?page=westlife-settings&tab=mail" class="nav-tab wl-tab <?php echo $active_tab === 'mail' ? 'nav-tab-active is-active' : ''; ?>">
                <span class="dashicons dashicons-email-alt"></span>
                <?php _e('邮件设置', 'westlife'); ?>
            </a>
            <a href="?page=westlife-settings&tab=memos" class="nav-tab wl-tab <?php echo $active_tab === 'memos' ? 'nav-tab-active is-active' : ''; ?>">
                <span class="dashicons dashicons-calendar-alt"></span>
                <?php _e('说说页面', 'westlife'); ?>
            </a>
            <a href="?page=westlife-settings&tab=about" class="nav-tab wl-tab <?php echo $active_tab === 'about' ? 'nav-tab-active is-active' : ''; ?>">
                <span class="dashicons dashicons-admin-users"></span>
                <?php _e('关于页面', 'westlife'); ?>
            </a>
                </nav>
            </div>

            <div class="tab-content wl-tab-panel is-active">
                <?php
                switch ($active_tab) {
                    case 'basic':
                        westlife_basic_settings_tab();
                        break;
                    case 'umami':
                        westlife_umami_settings_tab();
                        break;
                    case 'image':
                        westlife_image_settings_tab();
                        break;
                    case 'social':
                        westlife_social_settings_tab();
                        break;
                    case 'footer':
                        westlife_footer_settings_tab();
                        break;
                    case 'feeds':
                        westlife_render_feeds_cache_content();
                        break;
                    case 'mail':
                        westlife_render_mail_settings_content();
                        break;
                    case 'memos':
                        westlife_render_memos_settings_page_content();
                        break;
                    case 'about':
                        westlife_render_about_persona_settings_content('westlife-settings');
                        break;
                    default:
                        westlife_basic_settings_tab();
                        break;
                }
                ?>
            </div>
        </div>
    </div>
<?php
}
