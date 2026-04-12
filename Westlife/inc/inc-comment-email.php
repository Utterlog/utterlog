<?php

/**
 * 评论邮件通知模板
 * 使用内联样式确保邮件客户端兼容性
 */

if (!defined('ABSPATH')) exit;

/**
 * 获取用户头像（邮件专用，使用绝对URL）
 */
function westlife_get_email_avatar($email, $size = 80)
{
    $avatar_url = get_avatar_url($email, ['size' => $size, 'default' => 'mystery']);

    // 确保使用绝对URL
    if (strpos($avatar_url, 'http') !== 0) {
        $avatar_url = home_url($avatar_url);
    }

    return $avatar_url;
}

/**
 * 处理评论内容中的表情和格式（邮件专用）
 */
function westlife_format_comment_for_email($content)
{
    // 处理段落和换行
    $content = wpautop($content);

    // 确保所有图片使用绝对URL
    $content = preg_replace_callback('/<img[^>]+src=["\']([^"\']+)["\'][^>]*>/i', function ($matches) {
        $img_tag = $matches[0];
        $src = $matches[1];

        // 如果是相对URL，转换为绝对URL
        if (strpos($src, 'http') !== 0) {
            $src = home_url($src);
            $img_tag = preg_replace('/(src=["\'])([^"\']+)(["\'])/', '$1' . $src . '$3', $img_tag);
        }

        return $img_tag;
    }, $content);

    return $content;
}

/**
 * 生成邮件HTML模板
 */
function westlife_get_email_template($params)
{
    $defaults = [
        'title' => '',
        'header_icon' => '💬',
        'greeting' => '',
        'content' => '',
        'footer_text' => '感谢您的参与！',
        'site_name' => get_bloginfo('name'),
        'site_url' => home_url(),
    ];
    
    $params = array_merge($defaults, $params);
    extract($params);
    
    // 获取站点 Logo
    $logo_url = '';
    $custom_logo_id = get_theme_mod('custom_logo');
    if ($custom_logo_id) {
        $logo_url = wp_get_attachment_image_url($custom_logo_id, 'full');
    }
    
    // 如果没有自定义 Logo，使用站点图标
    if (!$logo_url) {
        $site_icon_id = get_option('site_icon');
        if ($site_icon_id) {
            $logo_url = wp_get_attachment_image_url($site_icon_id, 'full');
        }
    }
    
    // 确保 Logo URL 是绝对路径
    if ($logo_url && strpos($logo_url, 'http') !== 0) {
        $logo_url = home_url($logo_url);
    }

    $template = '<!DOCTYPE html PUBLIC "-//W3C//DTD XHTML 1.0 Transitional//EN" "http://www.w3.org/TR/xhtml1/DTD/xhtml1-transitional.dtd">
<html xmlns="http://www.w3.org/1999/xhtml" lang="zh-CN">
<head>
    <meta http-equiv="Content-Type" content="text/html; charset=UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta name="format-detection" content="telephone=no" />
    <title>' . esc_html($title) . '</title>
    <style type="text/css">
        /* 邮件客户端兼容性样式 */
        body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; -ms-text-size-adjust: 100%; }
        img { border: 0; height: auto; line-height: 100%; outline: none; text-decoration: none; -ms-interpolation-mode: bicubic; }
        table { border-collapse: collapse; mso-table-lspace: 0pt; mso-table-rspace: 0pt; }
    </style>
</head>
<body style="margin:0; padding:0; font-family:-apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,\'Helvetica Neue\',Arial,sans-serif; background-color:#f0f4f8; color:#2c3e50;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f0f4f8; padding:30px 15px;">
        <tr>
            <td align="center">
                <!-- 主容器 -->
                <table width="750" cellpadding="0" cellspacing="0" border="0" style="background-color:#ffffff; border-radius:10px; box-shadow:0 2px 8px rgba(0,0,0,0.06); overflow:hidden; max-width:750px;">
                    
                    <!-- 头部 -->
                    <tr>
                        <td style="background-color:#002FA7; padding:24px 45px;">
                            <!-- Logo 和站点名称 -->
                            <table width="100%" cellpadding="0" cellspacing="0" border="0">
                                <tr>
                                    <td width="50" valign="middle">';
    
    if ($logo_url) {
        $template .= '
                                        <img src="' . esc_url($logo_url) . '" alt="' . esc_attr($site_name) . '" width="42" height="42" style="display:block; border-radius:8px; box-shadow:0 2px 6px rgba(0,0,0,0.15);" />';
    } else {
        $template .= '
                                        <div style="width:42px; height:42px; background-color:rgba(255,255,255,0.15); border-radius:8px; font-size:20px; font-weight:600; color:#ffffff; text-align:center; line-height:42px;">' . mb_substr($site_name, 0, 1) . '</div>';
    }
    
    $template .= '
                                    </td>
                                    <td valign="middle" style="padding-left:14px;">
                                        <a href="' . esc_url($site_url) . '" style="font-size:19px; font-weight:600; color:#ffffff; text-decoration:none; line-height:1.3;">' . esc_html($site_name) . '</a>
                                    </td>
                                    <td valign="middle" align="right">
                                        <table cellpadding="0" cellspacing="0" border="0" style="display:inline-block;">
                                            <tr>
                                                <td style="background-color:rgba(255,255,255,0.15); padding:6px 16px; border-radius:20px;">
                                                    <span style="font-size:24px; line-height:1; margin-right:6px; vertical-align:middle;">' . $header_icon . '</span>
                                                    <span style="font-size:15px; font-weight:500; color:#ffffff; vertical-align:middle;">' . esc_html($title) . '</span>
                                                </td>
                                            </tr>
                                        </table>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>
                    
                    <!-- 问候语 -->
                    <tr>
                        <td style="padding:30px 45px 20px; background-color:#fafbfc;">
                            <p style="margin:0; font-size:15px; color:#475569; line-height:1.7;">' . $greeting . '</p>
                        </td>
                    </tr>
                    
                    <!-- 主内容 -->
                    <tr>
                        <td style="padding:20px 45px 30px;">
                            ' . $content . '
                        </td>
                    </tr>
                    
                    <!-- 底部 -->
                    <tr>
                        <td style="background-color:#fafbfc; padding:24px 45px; border-top:1px solid #e5e7eb; text-align:center;">
                            <p style="margin:0 0 10px; font-size:14px; color:#002FA7; font-weight:600;">' . $footer_text . '</p>
                            <p style="margin:0 0 6px; font-size:13px; color:#6b7280;">此邮件由系统自动发送，请勿直接回复</p>
                            <p style="margin:0 0 8px; font-size:13px; color:#6b7280;">
                                来自：<a href="' . esc_url($site_url) . '" style="color:#002FA7; text-decoration:none; font-weight:600;">' . esc_html($site_name) . '</a>
                            </p>
                            <p style="margin:0; font-size:12px; color:#9ca3af;">发送时间：' . current_time('Y-m-d H:i:s') . '</p>
                        </td>
                    </tr>
                    
                </table>
            </td>
        </tr>
    </table>
</body>
</html>';

    return $template;
}

/**
 * 生成评论卡片HTML（带头像）
 */
function westlife_get_comment_card_html($comment, $params = [])
{
    $defaults = [
        'show_parent' => false,
        'is_reply' => false,
        'label' => '评论内容'
    ];
    $params = array_merge($defaults, $params);

    $avatar_url = westlife_get_email_avatar($comment->comment_author_email);
    $content = westlife_format_comment_for_email($comment->comment_content);
    $comment_time = get_comment_date('Y-m-d H:i', $comment->comment_ID);

    $card_bg = $params['is_reply'] ? '#faf5ff' : '#f8fafc';
    $border_color = $params['is_reply'] ? '#e9d5ff' : '#e2e8f0';

    $html = '
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr>
            <td style="background-color:' . $card_bg . '; border:1px solid ' . $border_color . '; border-radius:12px; padding:20px;">
                
                <!-- 标签 -->
                <div style="margin-bottom:14px;">
                    <span style="display:inline-block; background-color:#002FA7; color:#ffffff; font-size:12px; font-weight:600; padding:5px 14px; border-radius:20px; letter-spacing:0.5px;">' . esc_html($params['label']) . '</span>
                </div>
                
                <!-- 用户信息 -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:16px;">
                    <tr>
                        <td width="56" valign="top">
                            <img src="' . esc_url($avatar_url) . '" alt="' . esc_attr($comment->comment_author) . '" width="48" height="48" style="border-radius:50%; display:block; border:2px solid #ffffff; box-shadow:0 2px 8px rgba(0,0,0,0.1);" />
                        </td>
                        <td valign="top" style="padding-left:12px;">
                            <div style="font-size:16px; font-weight:600; color:#1e293b; margin-bottom:4px;">' . esc_html($comment->comment_author) . '</div>
                            <div style="font-size:13px; color:#64748b;">' . esc_html($comment_time) . '</div>
                        </td>
                    </tr>
                </table>
                
                <!-- 评论内容 -->
                <div style="background-color:#ffffff; border-radius:8px; padding:16px; font-size:15px; color:#334155; line-height:1.8; word-wrap:break-word;">
                    ' . $content . '
                </div>
                
            </td>
        </tr>
    </table>';

    return $html;
}

/**
 * 评论回复通知邮件
 */
function westlife_send_reply_notification_email($parent_comment, $reply_comment, $post_title, $comment_link)
{
    // 检查是否是管理员回复
    $is_admin_reply = ($reply_comment->user_id && user_can($reply_comment->user_id, 'manage_options')) ||
        ($reply_comment->comment_author_email === get_option('admin_email'));

    $site_name = get_bloginfo('name');

    if ($is_admin_reply) {
        $subject = sprintf('[%s] 👨‍💼 管理员回复了您的评论', $site_name);
        $header_icon = '👨‍💼';
        $title = '管理员回复通知';
        $greeting = sprintf(
            '您好，<strong>%s</strong>！<br>您在文章《<strong>%s</strong>》中的评论收到了管理员的回复！',
            esc_html($parent_comment->comment_author),
            esc_html($post_title)
        );
        $footer_text = '感谢您的参与，我们重视每一条评论！';
    } else {
        $subject = sprintf('[%s] 💬 您的评论收到了新回复', $site_name);
        $header_icon = '💬';
        $title = '评论回复通知';
        $greeting = sprintf(
            '您好，<strong>%s</strong>！<br>您在文章《<strong>%s</strong>》中的评论收到了新回复！',
            esc_html($parent_comment->comment_author),
            esc_html($post_title)
        );
        $footer_text = '感谢您的参与，让社区更加活跃！';
    }

    // 生成内容
    $content = '';

    // 您的评论
    $content .= westlife_get_comment_card_html($parent_comment, [
        'label' => '您的评论',
        'is_reply' => false
    ]);

    // 新回复
    $reply_label = $is_admin_reply 
        ? '管理员回复' 
        : sprintf('%s 的回复', esc_html($reply_comment->comment_author));
    
    $content .= westlife_get_comment_card_html($reply_comment, [
        'label' => $reply_label,
        'is_reply' => true
    ]);

    // 操作按钮
    $content .= '
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
        <tr>
            <td align="center">
                <a href="' . esc_url($comment_link) . '" style="display:inline-block; background-color:#002FA7; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:13px 36px; border-radius:25px; box-shadow:0 3px 10px rgba(0,47,167,0.25); transition:all 0.3s;">
                    查看完整对话 →
                </a>
            </td>
        </tr>
    </table>';

    // 生成邮件
    $message = westlife_get_email_template([
        'title' => $title,
        'header_icon' => $header_icon,
        'greeting' => $greeting,
        'content' => $content,
        'footer_text' => $footer_text
    ]);

    $headers = [
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . $site_name . ' <' . get_bloginfo('admin_email') . '>'
    ];

    return wp_mail($parent_comment->comment_author_email, $subject, $message, $headers);
}

/**
 * 新评论通知管理员邮件
 */
function westlife_send_admin_notification_email($comment, $post_title, $edit_link, $view_link)
{
    $site_name = get_bloginfo('name');
    $subject = sprintf('[%s] 🔔 收到新评论', $site_name);

    $greeting = sprintf(
        '文章《<strong>%s</strong>》收到来自 <strong>%s</strong> 的新评论',
        esc_html($post_title),
        esc_html($comment->comment_author)
    );

    // 生成内容
    $content = '';

    // 评论者信息卡片
    $content .= '
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
        <tr>
            <td style="background-color:#fef3c7; border:1px solid #fde68a; border-radius:12px; padding:20px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                        <td width="40%" style="padding-right:12px; border-right:1px solid #fde68a;">
                            <div style="font-size:13px; color:#92400e; margin-bottom:4px;">评论者</div>
                            <div style="font-size:15px; font-weight:600; color:#78350f;">' . esc_html($comment->comment_author) . '</div>
                        </td>
                        <td width="60%" style="padding-left:12px;">
                            <div style="font-size:13px; color:#92400e; margin-bottom:4px;">邮箱</div>
                            <div style="font-size:14px; color:#78350f;">' . esc_html($comment->comment_author_email) . '</div>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>';

    // 如果是回复评论，显示父评论
    if ($comment->comment_parent) {
        $parent_comment = get_comment($comment->comment_parent);
        if ($parent_comment) {
            $content .= westlife_get_comment_card_html($parent_comment, [
                'label' => '回复的评论 (来自 ' . $parent_comment->comment_author . ')',
                'is_reply' => false
            ]);
        }
    }

    // 新评论内容
    $content .= westlife_get_comment_card_html($comment, [
        'label' => '评论内容',
        'is_reply' => false
    ]);

    // 操作按钮
    $content .= '
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">
        <tr>
            <td align="center">
                <table cellpadding="0" cellspacing="0" border="0" style="display:inline-block;">
                    <tr>
                        <td style="padding:0 6px;">
                            <a href="' . esc_url($edit_link) . '" style="display:inline-block; background:#dc2626; color:#ffffff; text-decoration:none; font-size:14px; font-weight:600; padding:12px 24px; border-radius:8px;">
                                立即审核
                            </a>
                        </td>
                        <td style="padding:0 6px;">
                            <a href="' . esc_url($view_link) . '" style="display:inline-block; background:#64748b; color:#ffffff; text-decoration:none; font-size:14px; font-weight:600; padding:12px 24px; border-radius:8px;">
                                查看评论
                            </a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>';

    // 生成邮件
    $message = westlife_get_email_template([
        'title' => '新评论通知',
        'header_icon' => '🔔',
        'greeting' => $greeting,
        'content' => $content,
        'footer_text' => '请及时处理评论审核'
    ]);

    $headers = [
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . $site_name . ' <' . get_bloginfo('admin_email') . '>'
    ];

    return wp_mail(get_option('admin_email'), $subject, $message, $headers);
}

/**
 * 评论审核通过通知邮件
 */
function westlife_send_approved_notification_email($comment, $post_title, $comment_link)
{
    $site_name = get_bloginfo('name');
    $subject = sprintf('[%s] ✅ 您的评论已通过审核', $site_name);

    $greeting = sprintf(
        '您好，<strong>%s</strong>！<br>您在文章《<strong>%s</strong>》中的评论已通过审核并发布！',
        esc_html($comment->comment_author),
        esc_html($post_title)
    );

    // 生成内容
    $content = westlife_get_comment_card_html($comment, [
        'label' => '您的评论',
        'is_reply' => false
    ]);

    // 操作按钮
    $content .= '
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
        <tr>
            <td align="center">
                <a href="' . esc_url($comment_link) . '" style="display:inline-block; background-color:#002FA7; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:13px 36px; border-radius:25px; box-shadow:0 3px 10px rgba(0,47,167,0.25); transition:all 0.3s;">
                    查看我的评论 →
                </a>
            </td>
        </tr>
    </table>';

    // 生成邮件
    $message = westlife_get_email_template([
        'title' => '评论审核通过',
        'header_icon' => '✅',
        'greeting' => $greeting,
        'content' => $content,
        'footer_text' => '感谢您的参与，期待您的更多精彩评论！'
    ]);

    $headers = [
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . $site_name . ' <' . get_bloginfo('admin_email') . '>'
    ];

    return wp_mail($comment->comment_author_email, $subject, $message, $headers);
}

/**
 * 友链申请通知邮件 - 通知管理员
 */
function westlife_send_friend_link_application_email($link_data, $link_id)
{
    $site_name = get_bloginfo('name');
    $subject = sprintf('[%s] 🔗 收到新的友链申请', $site_name);
    
    // 提取友链信息
    $link_name = $link_data['link_name'] ?? '';
    $link_url = $link_data['link_url'] ?? '';
    $link_desc = $link_data['link_description'] ?? '';
    $link_avatar = $link_data['link_image'] ?? '';
    $link_rss = $link_data['link_rss'] ?? '';
    
    // 问候语
    $greeting = sprintf(
        '您好，管理员！<br>您的网站收到了新的友情链接申请，详情如下：'
    );
    
    // 友链信息卡片
    $content = '
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
        <tr>
            <td style="background-color:#fef3c7; border:1px solid #fde68a; border-radius:12px; padding:24px;">
                
                <!-- 友链头像和名称 -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:20px;">
                    <tr>
                        <td width="70" valign="top">';
    
    if ($link_avatar) {
        $content .= '
                            <img src="' . esc_url($link_avatar) . '" alt="' . esc_attr($link_name) . '" width="60" height="60" style="display:block; border-radius:12px; box-shadow:0 2px 8px rgba(0,0,0,0.1);" />';
    } else {
        $first_char = mb_substr($link_name, 0, 1);
        $content .= '
                            <div style="width:60px; height:60px; background-color:#002FA7; border-radius:12px; font-size:28px; font-weight:600; color:#ffffff; text-align:center; line-height:60px;">' . esc_html($first_char) . '</div>';
    }
    
    $content .= '
                        </td>
                        <td valign="top" style="padding-left:16px;">
                            <div style="font-size:20px; font-weight:600; color:#78350f; margin-bottom:6px;">' . esc_html($link_name) . '</div>
                            <div style="font-size:14px; color:#92400e; word-break:break-all;">
                                <a href="' . esc_url($link_url) . '" style="color:#002FA7; text-decoration:none;">' . esc_html($link_url) . '</a>
                            </div>
                        </td>
                    </tr>
                </table>
                
                <!-- 友链详细信息 -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#fffbeb; border-radius:8px; padding:16px;">
                    <tr>
                        <td>
                            <div style="margin-bottom:14px;">
                                <div style="font-size:12px; color:#92400e; margin-bottom:4px; font-weight:600;">站点描述</div>
                                <div style="font-size:14px; color:#78350f; line-height:1.6;">' . esc_html($link_desc) . '</div>
                            </div>';
    
    if ($link_rss) {
        $content .= '
                            <div style="margin-bottom:14px;">
                                <div style="font-size:12px; color:#92400e; margin-bottom:4px; font-weight:600;">RSS 订阅</div>
                                <div style="font-size:13px; color:#78350f; word-break:break-all;">
                                    <a href="' . esc_url($link_rss) . '" style="color:#002FA7; text-decoration:none;">' . esc_html($link_rss) . '</a>
                                </div>
                            </div>';
    }
    
    $content .= '
                            <div>
                                <div style="font-size:12px; color:#92400e; margin-bottom:4px; font-weight:600;">申请时间</div>
                                <div style="font-size:13px; color:#78350f;">' . current_time('Y-m-d H:i:s') . '</div>
                            </div>
                        </td>
                    </tr>
                </table>
                
            </td>
        </tr>
    </table>';
    
    // 提示信息
    $content .= '
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:24px;">
        <tr>
            <td style="background-color:#e0f2fe; border:1px solid #bae6fd; border-radius:8px; padding:16px;">
                <div style="font-size:14px; color:#075985; line-height:1.6;">
                    <strong>💡 温馨提示：</strong><br>
                    • 请先访问对方网站确认是否已添加本站友链<br>
                    • 检查网站内容是否符合友链要求<br>
                    • 审核通过后可修改友链分类和评分<br>
                    • 默认状态为"不可见"，审核后请手动设置为"可见"
                </div>
            </td>
        </tr>
    </table>';
    
    // 操作按钮
    $edit_link = admin_url('link-manager.php');
    $link_edit_link = admin_url('link.php?action=edit&link_id=' . $link_id);
    
    $content .= '
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:28px;">
        <tr>
            <td align="center">
                <table cellpadding="0" cellspacing="0" border="0" style="display:inline-block;">
                    <tr>
                        <td style="padding:0 8px;">
                            <a href="' . esc_url($link_edit_link) . '" style="display:inline-block; background-color:#002FA7; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:13px 28px; border-radius:25px; box-shadow:0 3px 10px rgba(0,47,167,0.25);">
                                立即审核 →
                            </a>
                        </td>
                        <td style="padding:0 8px;">
                            <a href="' . esc_url($edit_link) . '" style="display:inline-block; background-color:#64748b; color:#ffffff; text-decoration:none; font-size:15px; font-weight:600; padding:13px 28px; border-radius:25px; box-shadow:0 3px 10px rgba(100,116,139,0.25);">
                                管理友链
                            </a>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>';
    
    // 生成邮件
    $message = westlife_get_email_template([
        'title' => '新友链申请',
        'header_icon' => '🔗',
        'greeting' => $greeting,
        'content' => $content,
        'footer_text' => '请及时处理友链申请'
    ]);
    
    $headers = [
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . $site_name . ' <' . get_bloginfo('admin_email') . '>'
    ];
    
    return wp_mail(get_option('admin_email'), $subject, $message, $headers);
}
