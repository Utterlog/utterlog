<?php

/**
 * 邮件设置页面
 * 包含SMTP配置、邮件模板预览、测试发送
 */

if (!defined('ABSPATH')) exit;

/**
 * 注册邮件设置
 */
function westlife_register_mail_settings()
{
    // SMTP 配置
    register_setting('westlife_smtp_settings', 'smtp_enable', ['type' => 'boolean', 'default' => false]);
    register_setting('westlife_smtp_settings', 'smtp_host', ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']);
    register_setting('westlife_smtp_settings', 'smtp_port', ['type' => 'integer', 'default' => 465]);
    register_setting('westlife_smtp_settings', 'smtp_secure', [
        'type' => 'string',
        'default' => 'ssl',
        'sanitize_callback' => function ($v) {
            return in_array($v, ['ssl', 'tls', 'none'], true) ? $v : 'ssl';
        }
    ]);
    register_setting('westlife_smtp_settings', 'smtp_username', ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']);
    register_setting('westlife_smtp_settings', 'smtp_password', ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']);
    register_setting('westlife_smtp_settings', 'smtp_from_email', ['type' => 'string', 'sanitize_callback' => 'sanitize_email']);
    register_setting('westlife_smtp_settings', 'smtp_from_name', ['type' => 'string', 'sanitize_callback' => 'sanitize_text_field']);
}
add_action('admin_init', 'westlife_register_mail_settings');

/**
 * 邮件设置页面
 */
function westlife_render_mail_settings_content()
{
    $test_message = '';
    if (isset($_POST['send_test_email']) && wp_verify_nonce($_POST['test_email_nonce'] ?? '', 'send_test_email')) {
        $test_email = sanitize_email($_POST['test_email_address']);
        if ($test_email) {
            $result = westlife_send_test_email($test_email);
            if ($result) {
                $test_message = '<div class="notice notice-success is-dismissible"><p>✅ 测试邮件已发送到 ' . esc_html($test_email) . '，请检查收件箱！</p></div>';
            } else {
                $test_message = '<div class="notice notice-error is-dismissible"><p>❌ 测试邮件发送失败，请检查SMTP配置！</p></div>';
            }
        }
    }

    // 处理邮件模板预览
    if (isset($_POST['preview_email_template']) && wp_verify_nonce($_POST['preview_email_nonce'] ?? '', 'preview_email_template')) {
        $template_type = sanitize_text_field($_POST['template_type']);
        westlife_preview_email_template($template_type);
        return;
    }
    echo $test_message;
?>

        <!-- ========== SMTP 配置 ========== -->
        <div class="card">
            <h2 class="title">
                <span class="dashicons dashicons-admin-settings"></span>
                SMTP 邮件配置
            </h2>
            <div class="inside">
                <p class="description">配置SMTP服务器以确保WordPress邮件正常发送。推荐使用腾讯企业邮箱、阿里云邮件或Gmail等服务。</p>

                <form method="post" action="options.php">
                    <?php settings_fields('westlife_smtp_settings'); ?>

                    <table class="form-table">
                        <tr>
                            <th scope="row">
                                <label for="smtp_enable">启用SMTP</label>
                            </th>
                            <td>
                                <label>
                                    <input type="checkbox" id="smtp_enable" name="smtp_enable" value="1" <?php checked(get_option('smtp_enable'), 1); ?>>
                                    使用SMTP发送邮件（推荐）
                                </label>
                                <p class="description">启用后，WordPress将使用SMTP而不是默认的mail()函数发送邮件</p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row">
                                <label for="smtp_host">SMTP 服务器</label>
                            </th>
                            <td>
                                <input type="text" id="smtp_host" name="smtp_host" value="<?php echo esc_attr(get_option('smtp_host')); ?>" class="regular-text" placeholder="smtp.example.com">
                                <p class="description">
                                    常用SMTP服务器：<br>
                                    • 腾讯企业邮箱：<code>smtp.exmail.qq.com</code><br>
                                    • 阿里云邮件：<code>smtpdm.aliyun.com</code><br>
                                    • Gmail：<code>smtp.gmail.com</code><br>
                                    • QQ邮箱：<code>smtp.qq.com</code>
                                </p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row">
                                <label for="smtp_port">SMTP 端口</label>
                            </th>
                            <td>
                                <input type="number" id="smtp_port" name="smtp_port" value="<?php echo esc_attr(get_option('smtp_port', 465)); ?>" class="small-text" min="1" max="65535">
                                <p class="description">
                                    • SSL加密：<code>465</code>（推荐）<br>
                                    • TLS加密：<code>587</code><br>
                                    • 无加密：<code>25</code>（不推荐）
                                </p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row">
                                <label for="smtp_secure">加密方式</label>
                            </th>
                            <td>
                                <select id="smtp_secure" name="smtp_secure">
                                    <option value="ssl" <?php selected(get_option('smtp_secure', 'ssl'), 'ssl'); ?>>SSL（推荐，端口465）</option>
                                    <option value="tls" <?php selected(get_option('smtp_secure', 'ssl'), 'tls'); ?>>TLS（端口587）</option>
                                    <option value="none" <?php selected(get_option('smtp_secure', 'ssl'), 'none'); ?>>无加密（不推荐）</option>
                                </select>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row">
                                <label for="smtp_username">SMTP 用户名</label>
                            </th>
                            <td>
                                <input type="text" id="smtp_username" name="smtp_username" value="<?php echo esc_attr(get_option('smtp_username')); ?>" class="regular-text" placeholder="your@email.com" autocomplete="off">
                                <p class="description">通常是您的完整邮箱地址</p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row">
                                <label for="smtp_password">SMTP 密码</label>
                            </th>
                            <td>
                                <div class="form-inline" style="display: flex; gap: 8px;">
                                    <input type="password" id="smtp_password" name="smtp_password" value="<?php echo esc_attr(get_option('smtp_password')); ?>" class="regular-text" placeholder="••••••••" autocomplete="off">
                                    <button type="button" class="button" onclick="toggleSmtpPassword()">
                                        <span class="dashicons dashicons-visibility"></span>
                                    </button>
                                </div>
                                <p class="description">注意：部分邮箱需要使用"授权码"而不是登录密码</p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row">
                                <label for="smtp_from_email">发件人邮箱</label>
                            </th>
                            <td>
                                <input type="email" id="smtp_from_email" name="smtp_from_email" value="<?php echo esc_attr(get_option('smtp_from_email', get_option('admin_email'))); ?>" class="regular-text">
                                <p class="description">邮件的"发件人"地址，通常与SMTP用户名相同</p>
                            </td>
                        </tr>

                        <tr>
                            <th scope="row">
                                <label for="smtp_from_name">发件人名称</label>
                            </th>
                            <td>
                                <input type="text" id="smtp_from_name" name="smtp_from_name" value="<?php echo esc_attr(get_option('smtp_from_name', get_bloginfo('name'))); ?>" class="regular-text">
                                <p class="description">邮件的"发件人"显示名称</p>
                            </td>
                        </tr>
                    </table>

                    <?php submit_button('保存 SMTP 配置', 'primary'); ?>
                </form>
            </div>
        </div>

        <!-- ========== 测试邮件发送 ========== -->
        <div class="card">
            <h2 class="title">
                <span class="dashicons dashicons-yes-alt"></span>
                测试邮件发送
            </h2>
            <div class="inside">
                <p class="description">发送一封测试邮件以验证SMTP配置是否正确。</p>

                <form method="post" action="" style="margin-top: 15px;">
                    <?php wp_nonce_field('send_test_email', 'test_email_nonce'); ?>

                    <table class="form-table">
                        <tr>
                            <th scope="row">
                                <label for="test_email_address">收件人邮箱</label>
                            </th>
                            <td>
                                <input type="email" id="test_email_address" name="test_email_address" value="<?php echo esc_attr(get_option('admin_email')); ?>" class="regular-text" required>
                                <button type="submit" name="send_test_email" class="button button-secondary">
                                    <span class="dashicons dashicons-email"></span>
                                    发送测试邮件
                                </button>
                                <p class="description">将发送一封包含精美模板的测试邮件到指定邮箱</p>
                            </td>
                        </tr>
                    </table>
                </form>
            </div>
        </div>

        <!-- ========== 邮件模板预览 ========== -->
        <div class="card">
            <h2 class="title">
                <span class="dashicons dashicons-admin-appearance"></span>
                邮件模板预览
            </h2>
            <div class="inside">
                <p class="description">预览不同类型的邮件模板样式。点击按钮在新窗口中查看完整效果。</p>

                <div style="margin-top: 20px;">
                    <table class="widefat striped">
                        <thead>
                            <tr>
                                <th style="width: 200px;">模板类型</th>
                                <th>说明</th>
                                <th style="width: 150px;">操作</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td><strong>💬 评论回复通知</strong></td>
                                <td>当有人回复用户的评论时发送给原评论者（带头像和表情）</td>
                                <td>
                                    <button type="button" class="button" onclick="previewEmailTemplate('reply')">
                                        <span class="dashicons dashicons-visibility"></span>
                                        预览
                                    </button>
                                </td>
                            </tr>
                            <tr>
                                <td><strong>🔔 新评论通知（管理员）</strong></td>
                                <td>网站收到新评论时发送给管理员</td>
                                <td>
                                    <button type="button" class="button" onclick="previewEmailTemplate('admin')">
                                        <span class="dashicons dashicons-visibility"></span>
                                        预览
                                    </button>
                                </td>
                            </tr>
                            <tr>
                                <td><strong>✅ 评论审核通过通知</strong></td>
                                <td>评论通过审核后发送给评论者</td>
                                <td>
                                    <button type="button" class="button" onclick="previewEmailTemplate('approved')">
                                        <span class="dashicons dashicons-visibility"></span>
                                        预览
                                    </button>
                                </td>
                            </tr>
                            <tr>
                                <td><strong>🔗 友链申请通知</strong></td>
                                <td>收到新的友链申请时发送给管理员</td>
                                <td>
                                    <button type="button" class="button" onclick="previewEmailTemplate('friendlink')">
                                        <span class="dashicons dashicons-visibility"></span>
                                        预览
                                    </button>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="notice notice-info inline" style="margin-top: 20px;">
                    <p>
                        <strong>💡 邮件模板特性：</strong><br>
                        • 🎨 渐变色头部设计，紫色主题<br>
                        • 👤 用户头像圆形显示（48px）<br>
                        • 😊 B站表情自动渲染为图片<br>
                        • 🔘 精美的渐变按钮<br>
                        • 📧 内联样式，兼容所有邮件客户端<br>
                        • 📱 Table布局，Gmail/Outlook/QQ邮箱完美显示
                    </p>
                </div>
            </div>
        </div>

        <div class="card">
            <h2 class="title">
                <span class="dashicons dashicons-info"></span>
                常见问题 FAQ
            </h2>
            <div class="inside">
                <h4>Q: 为什么需要配置SMTP？</h4>
                <p>A: WordPress默认使用PHP的mail()函数发送邮件，但很多服务器禁用了此功能或被标记为垃圾邮件。使用SMTP可以提高邮件送达率。</p>

                <h4>Q: 什么是"授权码"？</h4>
                <p>A: 部分邮箱（如QQ邮箱、163邮箱）为了安全，不允许直接使用登录密码作为SMTP密码，需要在邮箱设置中生成专用的"授权码"。</p>

                <h4>Q: 测试邮件发送失败怎么办？</h4>
                <p>A: 请检查：<br>
                    1. SMTP服务器地址是否正确<br>
                    2. 端口号和加密方式是否匹配<br>
                    3. 用户名和密码是否正确（注意是否需要授权码）<br>
                    4. 服务器是否允许外部SMTP连接<br>
                    5. 防火墙是否阻止了SMTP端口</p>

                <h4>Q: 推荐使用哪个邮件服务？</h4>
                <p>A: 推荐使用：<br>
                    • <strong>腾讯企业邮箱</strong>：稳定可靠，送达率高，每天500封免费额度<br>
                    • <strong>阿里云邮件推送</strong>：专业的邮件发送服务，每天200封免费额度<br>
                    • <strong>Gmail</strong>：国外用户首选，但需要科学上网</p>

                <h4>Q: 如何查看邮件发送日志？</h4>
                <p>A: 可以在 WordPress 调试日志中查看邮件发送记录。在 <code>wp-config.php</code> 中启用调试模式，然后查看 <code>wp-content/debug.log</code> 文件。</p>
            </div>
        </div>
    <script>
        function toggleSmtpPassword() {
            const input = document.getElementById('smtp_password');
            const icon = event.target.closest('button').querySelector('.dashicons');
            if (input.type === 'password') {
                input.type = 'text';
                icon.className = 'dashicons dashicons-hidden';
            } else {
                input.type = 'password';
                icon.className = 'dashicons dashicons-visibility';
            }
        }

        function previewEmailTemplate(type) {
            const form = document.createElement('form');
            form.method = 'POST';
            form.action = '';
            form.target = '_blank';

            const nonceField = document.createElement('input');
            nonceField.type = 'hidden';
            nonceField.name = 'preview_email_nonce';
            nonceField.value = '<?php echo wp_create_nonce('preview_email_template'); ?>';

            const actionField = document.createElement('input');
            actionField.type = 'hidden';
            actionField.name = 'preview_email_template';
            actionField.value = '1';

            const typeField = document.createElement('input');
            typeField.type = 'hidden';
            typeField.name = 'template_type';
            typeField.value = type;

            form.appendChild(nonceField);
            form.appendChild(actionField);
            form.appendChild(typeField);
            document.body.appendChild(form);
            form.submit();
            document.body.removeChild(form);
        }
    </script>

<?php
}

function westlife_mail_settings_page()
{
    if (!current_user_can('manage_options')) {
        wp_die('您没有权限访问此页面');
    }
?>
    <div class="wrap westlife-theme-settings-page wl-admin-wrap">
        <div class="wl-shell">
            <div class="wl-hero">
                <div class="wl-hero-main">
                    <div class="wl-page-head">
                        <h1>
                            <span class="wl-title-mark"><span class="dashicons dashicons-email-alt"></span></span>
                            <span class="wl-title-text">邮件设置</span>
                        </h1>
                        <div class="wl-page-meta">
                            <span class="wl-badge wl-badge-kicker">Westlife</span>
                            <span class="wl-badge wl-badge-version">Mail</span>
                        </div>
                    </div>
                    <p class="wl-hero-description">集中管理 SMTP 配置、模板预览与测试邮件发送。</p>
                </div>
            </div>

            <div class="wl-tab-panel is-active">
                <?php westlife_render_mail_settings_content(); ?>
            </div>
        </div>
    </div>
<?php
}

/**
 * 发送测试邮件
 */
function westlife_send_test_email($to_email)
{
    $subject = '[' . get_bloginfo('name') . '] 测试邮件 - SMTP配置验证';

    $message = westlife_get_email_template([
        'title' => 'SMTP测试邮件',
        'header_icon' => '✅',
        'greeting' => '恭喜！如果您收到这封邮件，说明您的SMTP配置已经成功！',
        'content' => '
            <div style="text-align: center; padding: 30px 0;">
                <div style="font-size: 48px; margin-bottom: 16px;">🎉</div>
                <h3 style="margin: 0 0 12px; color: #10b981;">SMTP配置成功！</h3>
                <p style="margin: 0; color: #64748b; line-height: 1.8;">
                    您的WordPress站点现在可以正常发送邮件了。<br>
                    邮件模板已经启用了现代化的设计，包括：
                </p>
                <ul style="text-align: left; max-width: 400px; margin: 20px auto; color: #475569; line-height: 1.8;">
                    <li>✨ 渐变色头部设计</li>
                    <li>👤 用户头像圆形显示</li>
                    <li>😊 B站表情自动渲染</li>
                    <li>🔘 精美的操作按钮</li>
                    <li>📱 响应式布局设计</li>
                </ul>
                <p style="margin: 20px 0 0; color: #64748b;">
                    发送时间：' . current_time('Y-m-d H:i:s') . '
                </p>
            </div>
        ',
        'footer_text' => '这是一封SMTP测试邮件'
    ]);

    $headers = [
        'Content-Type: text/html; charset=UTF-8',
        'From: ' . get_bloginfo('name') . ' <' . get_option('smtp_from_email', get_option('admin_email')) . '>'
    ];

    return wp_mail($to_email, $subject, $message, $headers);
}

/**
 * 预览邮件模板
 */
function westlife_preview_email_template($type)
{
    // 创建示例评论对象
    $parent_comment = (object)[
        'comment_ID' => 1,
        'comment_author' => '张三',
        'comment_author_email' => 'zhangsan@example.com',
        'comment_content' => '这是一条示例评论内容，包含表情 :xiaoku: 和 :doge: 测试表情渲染效果！感谢站长分享这么好的内容。',
        'comment_date' => '2025-01-08 14:30:00',
        'comment_post_ID' => 1
    ];

    $reply_comment = (object)[
        'comment_ID' => 2,
        'comment_author' => '站长（李四）',
        'comment_author_email' => 'admin@example.com',
        'comment_content' => '感谢您的评论！:huaji: 很高兴内容对您有帮助。欢迎继续交流讨论！',
        'comment_date' => '2025-01-08 15:45:00',
        'comment_post_ID' => 1,
        'user_id' => 1
    ];

    $post_title = '如何优化WordPress网站性能 - 完整指南';
    $comment_link = home_url('/?p=1#comment-2');
    $edit_link = admin_url('comment.php?action=editcomment&c=1');
    $view_link = home_url('/?p=1#comment-1');

    // 根据类型生成不同的邮件HTML
    $html = '';

    switch ($type) {
        case 'reply':
            // 评论回复通知
            $html = westlife_get_reply_email_html($parent_comment, $reply_comment, $post_title, $comment_link);
            break;

        case 'admin':
            // 新评论通知（管理员）
            $html = westlife_get_admin_email_html($parent_comment, $post_title, $edit_link, $view_link);
            break;

        case 'approved':
            // 评论审核通过通知
            $html = westlife_get_approved_email_html($parent_comment, $post_title, $comment_link);
            break;

        case 'friendlink':
            // 友链申请通知
            $html = westlife_get_friendlink_email_html();
            break;

        default:
            wp_die('无效的模板类型');
    }

    // 直接输出HTML
    echo $html;
    exit;
}

/**
 * 生成回复通知邮件HTML（用于预览）
 */
function westlife_get_reply_email_html($parent, $reply, $post_title, $comment_link)
{
    $site_name = get_bloginfo('name');
    $is_admin_reply = true; // 预览时假设是管理员回复

    if ($is_admin_reply) {
        $title = '管理员回复通知';
        $header_icon = '👨‍💼';
        $greeting = sprintf(
            '您好，<strong>%s</strong>！<br>您在文章《<strong>%s</strong>》中的评论收到了管理员的回复！',
            esc_html($parent->comment_author),
            esc_html($post_title)
        );
    } else {
        $title = '评论回复通知';
        $header_icon = '💬';
        $greeting = sprintf(
            '您好，<strong>%s</strong>！<br>您在文章《<strong>%s</strong>》中的评论收到了新回复！',
            esc_html($parent->comment_author),
            esc_html($post_title)
        );
    }

    // 生成评论卡片
    $content = westlife_get_comment_card_html($parent, [
        'label' => '您的评论',
        'is_reply' => false
    ]);

    $reply_label = $is_admin_reply 
        ? '管理员回复' 
        : sprintf('%s 的回复', esc_html($reply->comment_author));
    
    $content .= westlife_get_comment_card_html($reply, [
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

    return westlife_get_email_template([
        'title' => $title,
        'header_icon' => $header_icon,
        'greeting' => $greeting,
        'content' => $content,
        'footer_text' => '感谢您的参与，我们重视每一条评论！'
    ]);
}

/**
 * 生成管理员通知邮件HTML（用于预览）
 */
function westlife_get_admin_email_html($comment, $post_title, $edit_link, $view_link)
{
    $greeting = sprintf(
        '文章《<strong>%s</strong>》收到来自 <strong>%s</strong> 的新评论',
        esc_html($post_title),
        esc_html($comment->comment_author)
    );

    // 评论者信息卡片
    $content = '
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

    return westlife_get_email_template([
        'title' => '新评论通知',
        'header_icon' => '🔔',
        'greeting' => $greeting,
        'content' => $content,
        'footer_text' => '请及时处理评论审核'
    ]);
}

/**
 * 生成审核通过通知邮件HTML（用于预览）
 */
function westlife_get_approved_email_html($comment, $post_title, $comment_link)
{
    $greeting = sprintf(
        '您好，<strong>%s</strong>！<br>您在文章《<strong>%s</strong>》中的评论已通过审核并发布！',
        esc_html($comment->comment_author),
        esc_html($post_title)
    );

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

    return westlife_get_email_template([
        'title' => '评论审核通过',
        'header_icon' => '✅',
        'greeting' => $greeting,
        'content' => $content,
        'footer_text' => '感谢您的参与，期待您的更多精彩评论！'
    ]);
}

/**
 * 生成友链申请通知邮件HTML（用于预览）
 */
function westlife_get_friendlink_email_html()
{
    // 示例友链数据
    $link_data = [
        'link_name' => '示例博客',
        'link_url' => 'https://example.com',
        'link_description' => '这是一个专注于技术分享的个人博客，内容涵盖前端开发、后端架构、DevOps等多个领域。',
        'link_image' => 'https://via.placeholder.com/60',
        'link_rss' => 'https://example.com/feed'
    ];
    
    $link_name = $link_data['link_name'];
    $link_url = $link_data['link_url'];
    $link_desc = $link_data['link_description'];
    $link_avatar = $link_data['link_image'];
    $link_rss = $link_data['link_rss'];
    
    $greeting = '您好，管理员！<br>您的网站收到了新的友情链接申请，详情如下：';
    
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
    $link_edit_link = admin_url('link.php?action=edit&link_id=1');
    
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
    
    return westlife_get_email_template([
        'title' => '新友链申请',
        'header_icon' => '🔗',
        'greeting' => $greeting,
        'content' => $content,
        'footer_text' => '请及时处理友链申请'
    ]);
}
