<?php

/**
 * 关于页面设置管理
 * @package Westlife
 */

if (!defined('ABSPATH')) exit;

function westlife_about_settings_tab()
{
    if (isset($_GET['westlife_action']) && $_GET['westlife_action'] === 'dismiss_utf8mb4' && current_user_can('manage_options')) {
        $nonce_ok = isset($_GET['_wpnonce']) && wp_verify_nonce(sanitize_text_field(wp_unslash($_GET['_wpnonce'])), 'westlife_utf8mb4_notice');
        if ($nonce_ok) {
            update_option('westlife_dismiss_utf8mb4_notice', '1');
            $redirect = remove_query_arg(['westlife_action', '_wpnonce']);
            wp_safe_redirect($redirect);
            exit;
        }
    }

    if (function_exists('wp_enqueue_media')) {
        wp_enqueue_media();
    }

    global $wpdb;
?>
    <div class="postbox">
        <div class="inside">
            <?php
            $db_charset = defined('DB_CHARSET') ? strtolower(DB_CHARSET) : '';
            $utf8mb4_cap = method_exists($wpdb, 'has_cap') ? $wpdb->has_cap('utf8mb4') : false;
            $utf8mb4_notice_dismissed = get_option('westlife_dismiss_utf8mb4_notice') === '1';
            if (!$utf8mb4_notice_dismissed && (!$utf8mb4_cap || $db_charset !== 'utf8mb4')) :
                $dismiss_url = wp_nonce_url(add_query_arg('westlife_action', 'dismiss_utf8mb4'), 'westlife_utf8mb4_notice'); ?>
                <div class="notice notice-warning" style="margin: 10px 0 20px; display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
                    <p style="margin:0;">
                        <strong>Emoji 存储诊断：</strong>检测到当前数据库可能未完全启用 <code>utf8mb4</code>。这会导致保存 Emoji 时变成黑色问号（�）。
                        请将数据库/数据表字符集与排序规则升级为 <code>utf8mb4</code>（如 <code>utf8mb4_unicode_ci</code>），并确保 <code>wp-config.php</code> 中 <code>DB_CHARSET</code> 为 <code>utf8mb4</code>。
                    </p>
                    <p style="margin:0; white-space:nowrap;">
                        <a href="<?php echo esc_url($dismiss_url); ?>" class="button-link">不再提示</a>
                    </p>
                </div>
            <?php endif; ?>
            <form method="post" action="options.php">
                <?php settings_fields('westlife_about_main_settings'); ?>
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row" colspan="2">
                                <h3><span class="dashicons dashicons-id"></span><?php _e('基本信息', 'westlife'); ?></h3>
                            </th>
                        </tr>
                        <tr>
                            <th scope="row"><label for="about_circle_words"><?php _e('头像环绕词', 'westlife'); ?></label></th>
                            <td>
                                <?php $circle = get_option('about_circle_words', ''); ?>
                                <textarea id="about_circle_words" name="about_circle_words" rows="4" class="large-text" placeholder="<?php esc_attr_e('每行一个，或用逗号分隔', 'westlife'); ?>"><?php echo esc_textarea($circle); ?></textarea>
                                <p class="description"><?php _e('用于头像圆环文字（如：Web开发、PHP、WordPress…）。留空将使用默认词汇。支持中文逗号、英文逗号或换行分隔。', 'westlife'); ?></p>
                                <?php if (!empty($circle)): ?>
                                    <p class="description"><strong><?php _e('当前预览：', 'westlife'); ?></strong><?php $preview_words = array_values(array_filter(array_map('trim', preg_split('/[,，、\r\n]+/', $circle)))); echo esc_html(implode(' · ', $preview_words) . ' · '); ?></p>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="about_alt_names"><?php _e('备用名字（打字机）', 'westlife'); ?></label></th>
                            <td>
                                <?php $alt_names_raw = get_option('about_alt_names', ''); ?>
                                <textarea id="about_alt_names" name="about_alt_names" rows="3" class="large-text" placeholder="每行一个，或用逗号分隔（如：小潘，Pang）"><?php echo esc_textarea($alt_names_raw); ?></textarea>
                                <p class="description"><?php _e('用于“我叫 …”的打字机名字列表。支持中文/英文逗号或换行分隔，展示时会与作者名合并并去重。建议 2~3 个。', 'westlife'); ?></p>
                                <?php if (!empty($alt_names_raw)): $preview_alt = array_values(array_filter(array_map('trim', preg_split('/[,，、\r\n]+/', (string) $alt_names_raw)))); ?>
                                    <p class="description"><strong><?php _e('当前预览：', 'westlife'); ?></strong><?php echo esc_html(implode('、', $preview_alt)); ?></p>
                                <?php endif; ?>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="about_main_color"><?php _e('关于页主色调', 'westlife'); ?></label></th>
                            <td>
                                <?php
                                $about_main_color = (string) get_option('about_main_color', '');
                                $mbti_map = [
                                    'INTJ' => ['建筑师', '#88619a'], 'INTP' => ['逻辑学家', '#88619a'], 'ENTJ' => ['指挥官', '#88619a'], 'ENTP' => ['辩论家', '#88619a'],
                                    'INFJ' => ['提倡者', '#33a474'], 'INFP' => ['调停者', '#33a474'], 'ENFJ' => ['主人公', '#33a474'], 'ENFP' => ['竞选者', '#33a474'],
                                    'ISTJ' => ['物流师', '#4298b4'], 'ISFJ' => ['守卫者', '#4298b4'], 'ESTJ' => ['总经理', '#4298b4'], 'ESFJ' => ['执政官', '#4298b4'],
                                    'ISTP' => ['鉴赏家', '#e4ae3a'], 'ISFP' => ['探险家', '#e4ae3a'], 'ESTP' => ['企业家', '#e4ae3a'], 'ESFP' => ['表演者', '#e4ae3a'],
                                ];
                                $mbti_code_tmp = strtoupper(preg_replace('/[^A-Z]/i', '', get_option('westlife_mbti_code', 'INTJ')));
                                if (!isset($mbti_map[$mbti_code_tmp])) $mbti_code_tmp = 'INTJ';
                                $mbti_accent_tmp = $mbti_map[$mbti_code_tmp][1];
                                $display_raw = $about_main_color !== '' ? $about_main_color : $mbti_accent_tmp;
                                $about_main_color_display = sanitize_hex_color($display_raw);
                                if (!$about_main_color_display) $about_main_color_display = sanitize_hex_color($mbti_accent_tmp) ?: '#4298b4';
                                ?>
                                <input type="color" id="about_main_color" name="about_main_color" value="<?php echo esc_attr($about_main_color_display); ?>" data-mbti-default="<?php echo esc_attr($mbti_accent_tmp); ?>" <?php if ($about_main_color === ''): ?> data-empty-original="1" data-default="<?php echo esc_attr($about_main_color_display); ?>" <?php endif; ?>>
                                <button type="button" class="button button-secondary" id="reset-about-color" style="margin-left:8px;"><?php _e('恢复默认色（MBTI）', 'westlife'); ?></button>
                                <span class="description" style="margin-left:6px;">&nbsp;<?php _e('留空将沿用 MBTI 主色；设置后此页以该色为主色调。', 'westlife'); ?></span>
                            </td>
                        </tr>
                        <tr>
                            <th scope="row"><label for="about_rolling_words"><?php _e('此刻关键词', 'westlife'); ?></label></th>
                            <td>
                                <?php $rolling = get_option('about_rolling_words', ''); ?>
                                <textarea id="about_rolling_words" name="about_rolling_words" rows="4" class="large-text" placeholder="<?php esc_attr_e('每行一个，或用逗号分隔', 'westlife'); ?>"><?php echo esc_textarea($rolling); ?></textarea>
                                <p class="description"><?php _e('用于个人介绍区域的动态轮播关键词，每3秒自动切换。留空将使用默认词汇。支持中文逗号、英文逗号或换行分隔。', 'westlife'); ?></p>
                                <?php if (!empty($rolling)): ?>
                                    <p class="description"><strong><?php _e('当前关键词：', 'westlife'); ?></strong><?php $preview_rolling = array_values(array_filter(array_map('trim', preg_split('/[,，、\r\n]+/', $rolling)))); echo esc_html(implode('、', $preview_rolling)); ?></p>
                                <?php endif; ?>
                            </td>
                        </tr>
                    </tbody>
                </table>

                <hr>
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr><th scope="row" colspan="2"><h3><span class="dashicons dashicons-welcome-write-blog"></span><?php _e('为什么建站（Purpose）', 'westlife'); ?></h3></th></tr>
                        <tr><th scope="row">徽章图标 class</th><td><input type="text" name="about_purpose_chip_icon" class="regular-text" value="<?php echo esc_attr(get_option('about_purpose_chip_icon', 'fas fa-bullseye')); ?>" placeholder="fas fa-bullseye" disabled><p class="description"><strong>已弃用：</strong>前端新版本不再显示徽章。可清空；保留仅做历史记录。</p></td></tr>
                        <tr><th scope="row">徽章文字</th><td><input type="text" name="about_purpose_chip_text" class="regular-text" value="<?php echo esc_attr(get_option('about_purpose_chip_text', '为什么建站')); ?>" disabled><p class="description"><strong>已弃用：</strong>与上方徽章一起移除，不再渲染。</p></td></tr>
                        <tr><th scope="row">主标题</th><td><input type="text" name="about_purpose_title" class="regular-text" value="<?php echo esc_attr(get_option('about_purpose_title', '记录与分享的初心')); ?>"></td></tr>
                        <tr><th scope="row">高亮 Emoji 与文案</th><td><input type="text" name="about_purpose_highlight_emoji" class="small-text" value="<?php echo esc_attr(get_option('about_purpose_highlight_emoji', '📚')); ?>" disabled><input type="text" name="about_purpose_highlight_text" class="regular-text" value="<?php echo esc_attr(get_option('about_purpose_highlight_text', '记录与输出，沉淀长期价值')); ?>" style="width:28rem;max-width:100%;" disabled><p class="description"><strong>已弃用：</strong>Purpose 模块已移除单独高亮行；若需重新启用请告知。</p></td></tr>
                        <tr><th scope="row">副标题</th><td><input type="text" name="about_purpose_subtitle" class="regular-text" value="<?php echo esc_attr(get_option('about_purpose_subtitle', '以站促学，以学促创；构建可复用的知识与组件资产。')); ?>" style="width:36rem;max-width:100%;"></td></tr>
                        <tr><th scope="row">正文段落（每段一行）</th><td><textarea name="about_purpose_paragraphs" rows="6" class="large-text" placeholder="每段一行"><?php echo esc_textarea(get_option('about_purpose_paragraphs', '')); ?></textarea></td></tr>
                        <tr><th scope="row">结尾强调句（单独样式）</th><td><input type="text" name="about_purpose_closing_text" class="regular-text" style="width:36rem;max-width:100%;" value="<?php echo esc_attr(get_option('about_purpose_closing_text', '')); ?>" placeholder="这就是本站的意义，也是我的生活方式……"><p class="description">此句将使用专用样式渲染在段落末尾。</p></td></tr>
                        <tr><th scope="row">右侧配图</th><td><?php $img = esc_url((string) get_option('about_purpose_image', '')); ?><input type="text" name="about_purpose_image" class="regular-text" style="width:28rem;max-width:100%;" value="<?php echo $img; ?>" placeholder="https://..."><button type="button" class="button upload-image-button" data-target="about_purpose_image">上传/选择</button><?php if ($img): ?><div style="margin-top:8px;"><img src="<?php echo $img; ?>" alt="预览" style="max-width:240px;height:auto;border:1px solid #ddd;padding:2px;background:#fff;"></div><?php endif; ?><p class="description">建议 800×600 或相近比例，支持本地媒体库与外链。</p></td></tr>
                    </tbody>
                </table>

                <hr>
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr>
                            <th scope="row" colspan="2">
                                <h3><span class="dashicons dashicons-yes"></span> 短期计划（Short-term Plan）</h3>
                                <p class="description">每项包含：Emoji、内容、状态（未完成 pending / 进行中 in-progress / 已完成 completed）<a href="#" class="button button-secondary add-row-btn" data-template="tpl-short-plan" style="margin-left:8px;">添加一项</a></p>
                                <p class="description">更多的 Emoji 可在 <a href="https://emojipedia.org/" target="_blank" rel="noopener">Emojipedia</a> 浏览。</p>
                            </th>
                        </tr>
                        <?php $short_plans = (array) get_option('about_short_plans', []); $rows = max(2, count($short_plans)); for ($i = 0; $i < $rows; $i++): $item = $short_plans[$i] ?? ['emoji' => '', 'text' => '', 'status' => 'pending']; ?>
                            <tr class="js-row" data-index="<?php echo $i; ?>">
                                <th scope="row">项目 <span class="row-number"><?php echo $i + 1; ?></span></th>
                                <td><input type="text" name="about_short_plans[<?php echo $i; ?>][emoji]" value="<?php echo esc_attr($item['emoji']); ?>" class="small-text" placeholder="😀"><input type="text" name="about_short_plans[<?php echo $i; ?>][text]" value="<?php echo esc_attr($item['text']); ?>" class="regular-text" style="width:28rem;max-width:100%;" placeholder="计划内容"><select name="about_short_plans[<?php echo $i; ?>][status]"><?php $st = $item['status'] ?: 'pending'; ?><option value="pending" <?php selected($st, 'pending'); ?>>未完成</option><option value="in-progress" <?php selected($st, 'in-progress'); ?>>进行中</option><option value="completed" <?php selected($st, 'completed'); ?>>已完成</option></select><button type="button" class="button-link remove-row" style="margin-left:8px;">删除</button></td>
                            </tr>
                        <?php endfor; ?>
                    </tbody>
                </table>

                <table class="form-table" role="presentation">
                    <tbody>
                        <tr><th scope="row" colspan="2"><h3><span class="dashicons dashicons-flag"></span> 长期计划（Long-term Plan）</h3><p class="description"><a href="#" class="button button-secondary add-row-btn" data-template="tpl-long-plan">添加一项</a></p></th></tr>
                        <?php $long_plans = (array) get_option('about_long_plans', []); $rows = max(2, count($long_plans)); for ($i = 0; $i < $rows; $i++): $item = $long_plans[$i] ?? ['emoji' => '', 'text' => '', 'status' => 'pending']; ?>
                            <tr class="js-row" data-index="<?php echo $i; ?>">
                                <th scope="row">项目 <span class="row-number"><?php echo $i + 1; ?></span></th>
                                <td><input type="text" name="about_long_plans[<?php echo $i; ?>][emoji]" value="<?php echo esc_attr($item['emoji']); ?>" class="small-text" placeholder="🏔️"><input type="text" name="about_long_plans[<?php echo $i; ?>][text]" value="<?php echo esc_attr($item['text']); ?>" class="regular-text" style="width:28rem;max-width:100%;" placeholder="计划内容"><select name="about_long_plans[<?php echo $i; ?>][status]"><?php $st = $item['status'] ?: 'pending'; ?><option value="pending" <?php selected($st, 'pending'); ?>>未完成</option><option value="in-progress" <?php selected($st, 'in-progress'); ?>>进行中</option><option value="completed" <?php selected($st, 'completed'); ?>>已完成</option></select><button type="button" class="button-link remove-row" style="margin-left:8px;">删除</button></td>
                            </tr>
                        <?php endfor; ?>
                    </tbody>
                </table>

                <table class="form-table" role="presentation">
                    <tbody>
                        <tr><th scope="row" colspan="2"><h3><span class="dashicons dashicons-heart"></span> 兴趣爱好</h3><p class="description">每项包含：Emoji、文本、颜色（背景圆圈用）<a href="#" class="button button-secondary add-row-btn" data-template="tpl-hobby" style="margin-left:8px;">添加一项</a></p></th></tr>
                        <?php $hobbies = (array) get_option('about_hobbies', []); $rows = max(2, count($hobbies)); for ($i = 0; $i < $rows; $i++): $item = $hobbies[$i] ?? ['emoji' => '', 'text' => '', 'color' => '']; $origColor = isset($item['color']) ? (string) $item['color'] : ''; $displayColor = $origColor !== '' ? $origColor : '#60a5fa'; ?>
                            <tr class="js-row" data-index="<?php echo $i; ?>">
                                <th scope="row">项目 <span class="row-number"><?php echo $i + 1; ?></span></th>
                                <td><input type="text" name="about_hobbies[<?php echo $i; ?>][emoji]" value="<?php echo esc_attr($item['emoji']); ?>" class="small-text" placeholder="🎮"><input type="text" name="about_hobbies[<?php echo $i; ?>][text]" value="<?php echo esc_attr($item['text']); ?>" class="regular-text" style="width:24rem;max-width:100%;" placeholder="兴趣名称"><input type="color" name="about_hobbies[<?php echo $i; ?>][color]" value="<?php echo esc_attr($displayColor); ?>" <?php if ($origColor === ''): ?> data-empty-original="1" data-default="<?php echo esc_attr($displayColor); ?>" <?php endif; ?>><button type="button" class="button-link remove-row" style="margin-left:8px;">删除</button></td>
                            </tr>
                        <?php endfor; ?>
                    </tbody>
                </table>
                <?php submit_button(__('保存设置', 'westlife')); ?>
            </form>
        </div>
    </div>

    <script type="text/javascript">
        jQuery(document).ready(function($) {
            window.westlifeMediaUpload && window.westlifeMediaUpload();
            function nextIndexFromInputs($container, prefix) {
                var maxIdx = -1;
                $container.find('input, select, textarea').each(function() {
                    var name = $(this).attr('name') || '';
                    var m = name.match(new RegExp('^' + prefix.replace(/[\[\]]/g, '\\$&') + '\\[(\\d+)\\]'));
                    if (m) {
                        var idx = parseInt(m[1], 10);
                        if (!isNaN(idx) && idx > maxIdx) maxIdx = idx;
                    }
                });
                return maxIdx + 1;
            }
            function renumberRows($tbody) { $tbody.find('tr.js-row').each(function(i) { $(this).find('.row-number').text(i + 1); }); }
            $(document).on('click', '.add-row-btn', function(e) {
                e.preventDefault();
                var $btn = $(this), tplId = $btn.data('template'), tpl = $('#' + tplId).html(), $table = $btn.closest('table'), $tbody = $table.find('tbody');
                var prefix = 'about_short_plans';
                if (tplId === 'tpl-long-plan') prefix = 'about_long_plans';
                if (tplId === 'tpl-hobby') prefix = 'about_hobbies';
                var idx = nextIndexFromInputs($tbody, prefix);
                $tbody.append(tpl.replace(/__INDEX__/g, String(idx)));
                renumberRows($tbody);
            });
            $(document).on('click', '.remove-row', function(e) {
                e.preventDefault();
                var $tbody = $(this).closest('tbody');
                $(this).closest('tr').remove();
                renumberRows($tbody);
            });
            (function() {
                var mediaFrames = {};
                $(document).on('click', '.upload-image-button', function(e) {
                    e.preventDefault();
                    var target = $(this).data('target');
                    if (window.wp && wp.media && typeof wp.media === 'function') {
                        if (!mediaFrames[target]) {
                            mediaFrames[target] = wp.media({ title: '<?php echo esc_js(__('选择图片', 'westlife')); ?>', multiple: false, library: { type: 'image' } });
                            mediaFrames[target].on('select', function() {
                                var attachment = mediaFrames[target].state().get('selection').first().toJSON();
                                var url = attachment && attachment.url ? attachment.url : '';
                                if (url && target) $('input[name="' + target + '"]').val(url).trigger('change');
                            });
                        }
                        mediaFrames[target].open();
                    } else if (window.westlifeMediaUpload) {
                        window.westlifeMediaUpload({ onSelect: function(url) { if (url && target) $('input[name="' + target + '"]').val(url).trigger('change'); } });
                    }
                });
            })();
            $('#westlife_mbti_code').on('input', function() {
                var value = $(this).val().toUpperCase().replace(/[^A-Z]/g, '');
                if (value.length > 4) value = value.substring(0, 4);
                $(this).val(value);
            });
            $('form[action="options.php"]').on('submit', function() {
                $(this).find('input[type="color"][data-empty-original="1"]').each(function() {
                    var $el = $(this), def = $el.data('default');
                    if (def && $el.val() && $el.val().toLowerCase() === String(def).toLowerCase()) {
                        var name = $el.attr('name');
                        if (name) {
                            $('<input>', { type: 'hidden', name: name, value: '' }).insertBefore($el);
                            $el.removeAttr('name');
                        }
                    }
                });
            });
            (function() {
                var $color = $('#about_main_color'), $btn = $('#reset-about-color');
                $btn.on('click', function() {
                    var defaultDisplay = $color.data('default') || $color.data('mbtiDefault');
                    if (defaultDisplay) {
                        $color.val(String(defaultDisplay));
                        $color.data('empty-original', '1');
                        $color.attr('data-empty-original', '1');
                        $color.attr('data-default', String(defaultDisplay));
                        $color.data('default', String(defaultDisplay));
                        $color.trigger('change');
                    } else {
                        $color.val('').trigger('change');
                    }
                });
            })();
        });
    </script>

    <script type="text/template" id="tpl-short-plan">
        <tr class="js-row" data-index="__INDEX__"><th scope="row">项目 <span class="row-number"></span></th><td><input type="text" name="about_short_plans[__INDEX__][emoji]" value="" class="small-text" placeholder="😀"><input type="text" name="about_short_plans[__INDEX__][text]" value="" class="regular-text" style="width:28rem;max-width:100%;" placeholder="计划内容"><select name="about_short_plans[__INDEX__][status]"><option value="pending">未完成</option><option value="in-progress">进行中</option><option value="completed">已完成</option></select><button type="button" class="button-link remove-row" style="margin-left:8px;">删除</button></td></tr>
    </script>
    <script type="text/template" id="tpl-long-plan">
        <tr class="js-row" data-index="__INDEX__"><th scope="row">项目 <span class="row-number"></span></th><td><input type="text" name="about_long_plans[__INDEX__][emoji]" value="" class="small-text" placeholder="🏔️"><input type="text" name="about_long_plans[__INDEX__][text]" value="" class="regular-text" style="width:28rem;max-width:100%;" placeholder="计划内容"><select name="about_long_plans[__INDEX__][status]"><option value="pending">未完成</option><option value="in-progress">进行中</option><option value="completed">已完成</option></select><button type="button" class="button-link remove-row" style="margin-left:8px;">删除</button></td></tr>
    </script>
    <script type="text/template" id="tpl-hobby">
        <tr class="js-row" data-index="__INDEX__"><th scope="row">项目 <span class="row-number"></span></th><td><input type="text" name="about_hobbies[__INDEX__][emoji]" value="" class="small-text" placeholder="🎮"><input type="text" name="about_hobbies[__INDEX__][text]" value="" class="regular-text" style="width:24rem;max-width:100%;" placeholder="兴趣名称"><input type="color" name="about_hobbies[__INDEX__][color]" value="#60a5fa" data-empty-original="1" data-default="#60a5fa"><button type="button" class="button-link remove-row" style="margin-left:8px;">删除</button></td></tr>
    </script>
<?php
}

function westlife_persona_settings_tab()
{
?>
    <div class="postbox">
        <div class="inside">
            <form method="post" action="options.php">
                <?php settings_fields('westlife_about_settings'); ?>
                <table class="form-table" role="presentation">
                    <tbody>
                        <tr><th scope="row" colspan="2"><h3><span class="dashicons dashicons-id"></span> MBTI 人格</h3></th></tr>
                        <tr>
                            <th scope="row"><label for="westlife_mbti_code">MBTI 代码</label></th>
                            <td>
                                <?php $mbti = strtoupper(preg_replace('/[^A-Z]/i', '', get_option('westlife_mbti_code', 'INTJ'))); ?>
                                <input type="text" id="westlife_mbti_code" name="westlife_mbti_code" value="<?php echo esc_attr($mbti); ?>" class="regular-text" maxlength="4" placeholder="INTJ / INFP / ENTP ...">
                                <p class="description">填写四位代码（大小写不限），用于关于页的人格卡片展示。</p>
                            </td>
                        </tr>
                        <tr><th scope="row" colspan="2"><h3><span class="dashicons dashicons-groups"></span> 人格特征（五维度）</h3></th></tr>
                        <?php
                        $default_traits = [
                            ['left' => '外向', 'right' => '内向', 'percent' => 53, 'desc' => '你在社交中表现得较为主动，但也享受独处时光。'],
                            ['left' => '天马行空', 'right' => '求真务实', 'percent' => 56, 'desc' => '你富有想象力，喜欢探索新奇的想法，但也能脚踏实地。'],
                            ['left' => '理性思考', 'right' => '情感细腻', 'percent' => 64, 'desc' => '你倾向于用逻辑分析问题，但也能体察他人情绪。'],
                            ['left' => '运筹帷幄', 'right' => '随机应变', 'percent' => 57, 'desc' => '你喜欢有计划地推进事务，但也能灵活应对变化。'],
                            ['left' => '自信果断', 'right' => '情绪易波动', 'percent' => 67, 'desc' => '你通常自信果断，面对挑战时保持冷静。'],
                        ];
                        $default_colors = ['#4298b4', '#e4ae3a', '#33a474', '#88619a', '#f76b6b'];
                        $default_titles = ['能量', '心智', '天性', '应对方式', '身份特征'];
                        for ($i = 1; $i <= 5; $i++) {
                            $left = get_option("about_trait_{$i}_label_left", $default_traits[$i - 1]['left']);
                            $right = get_option("about_trait_{$i}_label_right", $default_traits[$i - 1]['right']);
                            $percent = get_option("about_trait_{$i}_percent", $default_traits[$i - 1]['percent']);
                            $desc = get_option("about_trait_{$i}_desc", $default_traits[$i - 1]['desc']);
                            $color = get_option("about_trait_{$i}_color", $default_colors[$i - 1]);
                            $title = get_option("about_trait_{$i}_title", $default_titles[$i - 1]);
                        ?>
                            <tr><th scope="row">特征<?php echo $i; ?> 标题</th><td><input type="text" name="about_trait_<?php echo $i; ?>_title" value="<?php echo esc_attr($title); ?>" class="regular-text" placeholder="特征标题"><span class="description">如：能量、心智、天性等</span></td></tr>
                            <tr><th scope="row">特征<?php echo $i; ?> 左/右标签</th><td><input type="text" name="about_trait_<?php echo $i; ?>_label_left" value="<?php echo esc_attr($left); ?>" class="regular-text" placeholder="左侧标签"><span>/</span><input type="text" name="about_trait_<?php echo $i; ?>_label_right" value="<?php echo esc_attr($right); ?>" class="regular-text" placeholder="右侧标签"></td></tr>
                            <tr><th scope="row">特征<?php echo $i; ?> 百分比</th><td><input type="number" name="about_trait_<?php echo $i; ?>_percent" value="<?php echo esc_attr($percent); ?>" min="0" max="100" class="small-text"> %</td></tr>
                            <tr><th scope="row">特征<?php echo $i; ?> 描述</th><td><input type="text" name="about_trait_<?php echo $i; ?>_desc" value="<?php echo esc_attr($desc); ?>" class="regular-text" style="width: 40rem; max-width: 100%;"></td></tr>
                            <tr><th scope="row">特征<?php echo $i; ?> 颜色</th><td><input type="color" name="about_trait_<?php echo $i; ?>_color" value="<?php echo esc_attr($color); ?>"><span class="description">用于进度条的颜色</span></td></tr>
                        <?php } ?>
                    </tbody>
                </table>
                <?php submit_button(__('保存设置', 'westlife')); ?>
            </form>
        </div>
    </div>

    <script type="text/javascript">
        jQuery(document).ready(function($) {
            $('#westlife_mbti_code').on('input', function() {
                var value = $(this).val().toUpperCase().replace(/[^A-Z]/g, '');
                if (value.length > 4) value = value.substring(0, 4);
                $(this).val(value);
            });
        });
    </script>
<?php
}

function westlife_render_about_persona_settings_content($base_page = 'westlife-about')
{
    $active_tab = isset($_GET['subtab']) ? sanitize_text_field($_GET['subtab']) : 'about';
?>
    <?php settings_errors(); ?>

    <div class="wl-tabs-wrap wl-tabs-wrap--subtabs">
        <nav class="nav-tab-wrapper wl-tabs" aria-label="<?php esc_attr_e('关于页面子标签页', 'westlife'); ?>">
            <a href="?page=<?php echo esc_attr($base_page); ?>&tab=about&subtab=about" class="nav-tab wl-tab <?php echo $active_tab === 'about' ? 'nav-tab-active is-active' : ''; ?>">
                <span class="dashicons dashicons-admin-users"></span>
                <?php _e('关于页面', 'westlife'); ?>
            </a>
            <a href="?page=<?php echo esc_attr($base_page); ?>&tab=about&subtab=persona" class="nav-tab wl-tab <?php echo $active_tab === 'persona' ? 'nav-tab-active is-active' : ''; ?>">
                <span class="dashicons dashicons-groups"></span>
                <?php _e('人格与特征', 'westlife'); ?>
            </a>
        </nav>
    </div>

    <div class="tab-content wl-tab-panel is-active">
        <?php
        switch ($active_tab) {
            case 'persona':
                westlife_persona_settings_tab();
                break;
            case 'about':
            default:
                westlife_about_settings_tab();
                break;
        }
        ?>
    </div>
<?php
}

function westlife_about_persona_settings_page()
{
    if (!current_user_can('manage_options')) {
        wp_die(__('您没有足够的权限访问此页面。', 'westlife'));
    }
?>
    <div class="wrap westlife-theme-settings-page westlife-about-wrap wl-admin-wrap">
        <div class="wl-shell">
            <div class="wl-hero">
                <div class="wl-hero-main">
                    <div class="wl-page-head">
                        <h1>
                            <span class="wl-title-mark"><span class="dashicons dashicons-admin-users"></span></span>
                            <span class="wl-title-text"><?php _e('关于页面设置', 'westlife'); ?></span>
                        </h1>
                        <div class="wl-page-meta">
                            <span class="wl-badge wl-badge-kicker">Westlife</span>
                            <span class="wl-badge wl-badge-version">About</span>
                        </div>
                    </div>
                    <p class="wl-hero-description"><?php _e('配置关于页面主体内容、计划项目以及人格与特征信息。', 'westlife'); ?></p>
                </div>
            </div>

            <?php westlife_render_about_persona_settings_content('westlife-about'); ?>
        </div>
    </div>
<?php
}
