<?php

/**
 * 分类封面图功能
 * 
 * 在分类编辑页面添加封面图上传字段
 * 
 * @package Westlife
 */

if (!defined('ABSPATH')) exit;

/**
 * 添加分类封面图字段 - 新增分类时
 */
function westlife_add_category_thumbnail_field()
{
?>
    <div class="form-field term-thumbnail-wrap">
        <label for="category-thumbnail"><?php _e('分类封面图', 'westlife'); ?></label>
        <div class="category-thumbnail-preview" style="margin-bottom: 10px;">
            <img id="category-thumbnail-preview" src="" class="u-hidden" style="max-width: 300px; height: auto;" /><!-- migrated: inline display:none -> u-hidden -->
        </div>
        <input type="hidden" id="category-thumbnail" name="category_thumbnail" value="" />
        <button type="button" class="button category-thumbnail-upload" id="category-thumbnail-upload-btn">
            <?php _e('上传封面图', 'westlife'); ?>
        </button>
        <button type="button" class="button category-thumbnail-remove u-hidden" id="category-thumbnail-remove-btn"><!-- migrated: inline display:none -> u-hidden -->
            <?php _e('移除封面图', 'westlife'); ?>
        </button>
        <p class="description"><?php _e('建议尺寸: 800x400px,用作分类卡片背景图', 'westlife'); ?></p>

        <p style="margin-top: 15px;">
            <label for="category-thumbnail-url"><?php _e('或输入图片网址:', 'westlife'); ?></label>
            <input type="text" id="category-thumbnail-url" class="regular-text" placeholder="https://example.com/image.jpg" style="margin-top: 5px;" />
            <button type="button" class="button" id="category-thumbnail-url-btn" style="margin-top: 5px;">
                <?php _e('使用此网址', 'westlife'); ?>
            </button>
        </p>
    </div>

    <div class="form-field term-icon-wrap">
        <label for="category-icon"><?php _e('分类图标', 'westlife'); ?></label>
        <input type="text" id="category-icon" name="category_icon" value="" class="regular-text" placeholder="folder" />
        <p class="description">
            <?php _e('输入 Font Awesome 图标类名，例如：fa-folder、fa-book、fa-heart。', 'westlife'); ?>
        </p>
    </div>
<?php
}
add_action('category_add_form_fields', 'westlife_add_category_thumbnail_field');

/**
 * 添加分类封面图字段 - 编辑分类时
 */
function westlife_edit_category_thumbnail_field($term)
{
    $thumbnail = get_term_meta($term->term_id, 'category_thumbnail', true);
?>
    <tr class="form-field term-thumbnail-wrap">
        <th scope="row">
            <label for="category-thumbnail"><?php _e('分类封面图', 'westlife'); ?></label>
        </th>
        <td>
            <div class="category-thumbnail-preview" style="margin-bottom: 10px;">
                <?php if ($thumbnail) : ?>
                    <img id="category-thumbnail-preview" src="<?php echo esc_url($thumbnail); ?>" style="max-width: 300px; height: auto;" />
                <?php else : ?>
                    <img id="category-thumbnail-preview" src="" class="u-hidden" style="max-width: 300px; height: auto;" /><!-- migrated: inline display:none -> u-hidden -->
                <?php endif; ?>
            </div>
            <input type="hidden" id="category-thumbnail" name="category_thumbnail" value="<?php echo esc_attr($thumbnail); ?>" />
            <button type="button" class="button category-thumbnail-upload" id="category-thumbnail-upload-btn">
                <?php _e('上传封面图', 'westlife'); ?>
            </button>
            <button type="button" class="button category-thumbnail-remove<?php echo $thumbnail ? '' : ' u-hidden'; ?>" id="category-thumbnail-remove-btn"><!-- migrated: inline display:none -> u-hidden -->
                <?php _e('移除封面图', 'westlife'); ?>
            </button>
            <p class="description"><?php _e('建议尺寸: 800x400px,用作分类卡片背景图', 'westlife'); ?></p>

            <p style="margin-top: 15px;">
                <label for="category-thumbnail-url"><?php _e('或输入图片网址:', 'westlife'); ?></label><br>
                <input type="text" id="category-thumbnail-url" class="regular-text" placeholder="https://example.com/image.jpg" style="margin-top: 5px; width: 100%; max-width: 500px;" />
                <button type="button" class="button" id="category-thumbnail-url-btn" style="margin-top: 5px;">
                    <?php _e('使用此网址', 'westlife'); ?>
                </button>
            </p>
        </td>
    </tr>

    <tr class="form-field term-icon-wrap">
        <th scope="row">
            <label for="category-icon"><?php _e('分类图标', 'westlife'); ?></label>
        </th>
        <td>
            <?php $icon = get_term_meta($term->term_id, 'category_icon', true); ?>
            <input type="text" id="category-icon" name="category_icon" value="<?php echo esc_attr($icon); ?>" class="regular-text" placeholder="folder" />
            <p class="description">
                <?php _e('输入 Font Awesome 图标类名，例如：fa-folder、fa-book、fa-heart。', 'westlife'); ?>
            </p>
            <?php if ($icon) : ?>
                <p style="margin-top: 10px;">
                    <strong><?php _e('预览:', 'westlife'); ?></strong>
                    <?php echo westlife_lucide_icon($icon, ['style' => 'font-size:24px;margin-left:10px;color:#0073aa;']); ?>
                </p>
            <?php endif; ?>
        </td>
    </tr>
<?php
}
add_action('category_edit_form_fields', 'westlife_edit_category_thumbnail_field');

/**
 * 保存分类封面图和图标
 */
function westlife_save_category_thumbnail($term_id)
{
    if (isset($_POST['category_thumbnail'])) {
        update_term_meta($term_id, 'category_thumbnail', sanitize_text_field($_POST['category_thumbnail']));
    }
    if (isset($_POST['category_icon'])) {
        update_term_meta($term_id, 'category_icon', sanitize_text_field($_POST['category_icon']));
    }
}
add_action('created_category', 'westlife_save_category_thumbnail');
add_action('edited_category', 'westlife_save_category_thumbnail');

/**
 * 添加分类列表中的缩略图列
 */
function westlife_add_category_thumbnail_column($columns)
{
    $new_columns = array();
    foreach ($columns as $key => $value) {
        if ($key === 'name') {
            $new_columns['thumbnail'] = __('封面图', 'westlife');
        }
        $new_columns[$key] = $value;
    }
    return $new_columns;
}
add_filter('manage_edit-category_columns', 'westlife_add_category_thumbnail_column');

/**
 * 显示分类列表中的缩略图
 */
function westlife_show_category_thumbnail_column($content, $column_name, $term_id)
{
    if ($column_name === 'thumbnail') {
        $thumbnail = get_term_meta($term_id, 'category_thumbnail', true);
        if ($thumbnail) {
            $content = '<img src="' . esc_url($thumbnail) . '" style="width: 60px; height: 30px; object-fit: cover; border-radius: 4px;" />';
        } else {
            $content = '<span style="color: #999;">—</span>';
        }
    }
    return $content;
}
add_filter('manage_category_custom_column', 'westlife_show_category_thumbnail_column', 10, 3);

/**
 * 加载媒体上传器脚本
 */
function westlife_category_thumbnail_scripts($hook)
{
    if ('edit-tags.php' !== $hook && 'term.php' !== $hook) {
        return;
    }

    // 确保只在分类页面加载
    $screen = get_current_screen();
    if (!$screen || $screen->taxonomy !== 'category') {
        return;
    }

    // 加载媒体上传器
    wp_enqueue_media();

    wp_enqueue_style('font-awesome', 'https://icons.bluecdn.com/fontawesome-pro/css/all.min.css', array(), null);

    wp_add_inline_script('jquery', "
        jQuery(document).ready(function($) {
            var mediaUploader;

            // 上传按钮点击
            $(document).on('click', '#category-thumbnail-upload-btn', function(e) {
                e.preventDefault();

                if (mediaUploader) {
                    mediaUploader.open();
                    return;
                }

                mediaUploader = wp.media({
                    title: '选择分类封面图',
                    button: {
                        text: '使用这张图片'
                    },
                    multiple: false
                });

                mediaUploader.on('select', function() {
                    var attachment = mediaUploader.state().get('selection').first().toJSON();
                    $('#category-thumbnail').val(attachment.url);
                    $('#category-thumbnail-preview').attr('src', attachment.url).show();
                    $('#category-thumbnail-remove-btn').show();
                });

                mediaUploader.open();
            });

            // 移除按钮点击
            $(document).on('click', '#category-thumbnail-remove-btn', function(e) {
                e.preventDefault();
                $('#category-thumbnail').val('');
                $('#category-thumbnail-preview').attr('src', '').hide();
                $(this).hide();
            });

            // 使用网址按钮
            $(document).on('click', '#category-thumbnail-url-btn', function(e) {
                e.preventDefault();
                var imageUrl = $('#category-thumbnail-url').val().trim();
                
                if (imageUrl) {
                    // 简单验证URL格式
                    if (imageUrl.match(/^https?:\\/\\/.+\\.(jpg|jpeg|png|gif|webp|svg)$/i)) {
                        $('#category-thumbnail').val(imageUrl);
                        $('#category-thumbnail-preview').attr('src', imageUrl).show();
                        $('#category-thumbnail-remove-btn').show();
                        $('#category-thumbnail-url').val('');
                        alert('图片网址已设置成功!');
                    } else {
                        alert('请输入有效的图片网址(支持 jpg, png, gif, webp, svg 格式)');
                    }
                } else {
                    alert('请先输入图片网址');
                }
            });
        });
    ");
}
add_action('admin_enqueue_scripts', 'westlife_category_thumbnail_scripts');

/**
 * 获取分类封面图
 * 
 * @param int $term_id 分类ID
 * @return string|false 封面图URL或false
 */
function westlife_get_category_thumbnail($term_id)
{
    return get_term_meta($term_id, 'category_thumbnail', true);
}

/**
 * 获取分类图标
 * 
 * @param int $term_id 分类ID
 * @return string 图标名称,兼容旧的 fa-* 值
 */
function westlife_get_category_icon($term_id)
{
    $icon = get_term_meta($term_id, 'category_icon', true);
    return $icon ? $icon : 'folder';
}

/**
 * 输出分类图标 SVG
 *
 * @param int   $term_id 分类 ID
 * @param array $attrs   额外属性
 * @return string
 */
function westlife_render_category_icon($term_id, $attrs = array())
{
    $icon = westlife_get_category_icon($term_id);
    return westlife_lucide_icon($icon, $attrs);
}
