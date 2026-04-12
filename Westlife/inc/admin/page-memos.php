<?php

/**
 * Memos说说管理页面
 * @package Westlife
 */

if (!defined('ABSPATH')) exit;

function westlife_render_memos_settings_tab()
{
    $api_url = get_option('westlife_memos_api_url', '');
    $api_token = get_option('westlife_memos_api_token', '');
    $cache_time = get_option('westlife_memos_cache_time', 300);
    $connection_status = '';
    $last_test = get_transient('westlife_memos_last_test');
    if ($last_test) {
        $connection_status = $last_test['success']
            ? '<span style="color: #46b450;">✓ 连接成功</span>'
            : '<span style="color: #dc3232;">✗ 连接失败: ' . esc_html($last_test['error']) . '</span>';
    }
?>
    <div class="westlife-tab-content" id="tab-memos">
        <p class="description" style="margin-top: 0;">配置 Memos API 以在首页显示说说热力图和说说列表。</p>

        <form method="post" action="options.php" class="westlife-form">
            <?php settings_fields('westlife_memos_settings'); ?>

            <div class="westlife-section">
                <h3>基础配置</h3>
                <div class="westlife-field">
                    <label for="westlife_memos_api_url">
                        <strong>API 地址</strong>
                        <span class="description">Memos API 的完整地址（例如：https://memos.example.com）</span>
                    </label>
                    <input type="url" id="westlife_memos_api_url" name="westlife_memos_api_url" value="<?php echo esc_attr($api_url); ?>" class="regular-text" placeholder="https://memos.example.com" required />
                </div>

                <div class="westlife-field">
                    <label for="westlife_memos_api_token">
                        <strong>API Token</strong>
                        <span class="description">从 Memos 后台获取的访问令牌</span>
                    </label>
                    <input type="text" id="westlife_memos_api_token" name="westlife_memos_api_token" value="<?php echo esc_attr($api_token); ?>" class="large-text code" placeholder="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..." required />
                    <p class="description"><strong>获取方法：</strong>登录 Memos → 设置 → 我的账户 → 访问令牌 → 创建</p>
                </div>

                <div class="westlife-field">
                    <label for="westlife_memos_cache_time">
                        <strong>缓存时间（秒）</strong>
                        <span class="description">数据缓存时间，默认 300 秒（5分钟）</span>
                    </label>
                    <input type="number" id="westlife_memos_cache_time" name="westlife_memos_cache_time" value="<?php echo esc_attr($cache_time); ?>" class="small-text" min="60" max="3600" />
                    <span class="description">建议值：300-600</span>
                </div>
            </div>

            <div class="westlife-section">
                <h3>评论系统</h3>
                <div class="westlife-field">
                    <label for="westlife_memos_comment_system">
                        <strong>评论系统</strong>
                        <span class="description">选择要在 Memos 页面使用的评论系统</span>
                    </label>
                    <select id="westlife_memos_comment_system" name="westlife_memos_comment_system" class="regular-text">
                        <option value="none" <?php selected(get_option('westlife_memos_comment_system', 'none'), 'none'); ?>>不使用</option>
                        <option value="twikoo" <?php selected(get_option('westlife_memos_comment_system'), 'twikoo'); ?>>Twikoo</option>
                        <option value="waline" <?php selected(get_option('westlife_memos_comment_system'), 'waline'); ?>>Waline</option>
                    </select>
                </div>

                <div class="westlife-field" id="twikoo-config" style="<?php echo get_option('westlife_memos_comment_system') === 'twikoo' ? '' : 'display:none;'; ?>">
                    <label for="westlife_memos_twikoo_envid">
                        <strong>Twikoo 环境 ID</strong>
                        <span class="description">Twikoo 的 envId 或服务端地址</span>
                    </label>
                    <input type="text" id="westlife_memos_twikoo_envid" name="westlife_memos_twikoo_envid" value="<?php echo esc_attr(get_option('westlife_memos_twikoo_envid', '')); ?>" class="large-text" placeholder="https://twikoo.example.com 或 your-env-id.ap-shanghai.service.tcloudbase.com" />
                    <p class="description">支持腾讯云环境 ID 或自建 Vercel/Railway 服务地址<br><strong>获取方法：</strong><a href="https://twikoo.js.org/quick-start.html" target="_blank">查看 Twikoo 文档</a></p>
                </div>

                <div class="westlife-field" id="waline-config" style="<?php echo get_option('westlife_memos_comment_system') === 'waline' ? '' : 'display:none;'; ?>">
                    <label for="westlife_memos_waline_serverurl">
                        <strong>Waline 服务端地址</strong>
                        <span class="description">Waline 的服务端 URL</span>
                    </label>
                    <input type="url" id="westlife_memos_waline_serverurl" name="westlife_memos_waline_serverurl" value="<?php echo esc_attr(get_option('westlife_memos_waline_serverurl', '')); ?>" class="large-text" placeholder="https://waline.example.com" />
                    <p class="description"><strong>获取方法：</strong><a href="https://waline.js.org/guide/get-started.html" target="_blank">查看 Waline 文档</a></p>
                </div>
            </div>

            <div class="westlife-section">
                <h3>连接测试</h3>
                <div class="westlife-field">
                    <button type="button" id="test-memos-connection" class="button button-secondary"><span class="dashicons dashicons-update"></span> 测试连接</button>
                    <button type="button" id="clear-memos-cache" class="button button-secondary"><span class="dashicons dashicons-trash"></span> 清除缓存</button>
                    <button type="button" id="refresh-memos-heatmap" class="button button-secondary"><span class="dashicons dashicons-chart-area"></span> 强制刷新热力图</button>
                    <div id="memos-test-result" style="margin-top: 10px;"><?php echo $connection_status; ?></div>
                </div>

                <div class="westlife-field" id="memos-test-details" style="display: none; margin-top: 15px;">
                    <h4>测试详情</h4>
                    <div style="background: #f5f5f5; padding: 15px; border-radius: 5px; font-family: monospace; font-size: 12px;">
                        <div id="memos-test-details-content"></div>
                    </div>
                </div>
            </div>

            <div class="westlife-section">
                <h3>常用 API 方法</h3>
                <table class="widefat" style="max-width: 800px;">
                    <thead>
                        <tr><th>方法</th><th>说明</th><th>示例</th></tr>
                    </thead>
                    <tbody>
                        <tr><td><code>GET /api/v1/memos</code></td><td>获取说说列表</td><td><button type="button" class="button button-small test-api-method" data-method="list">测试</button></td></tr>
                        <tr><td><code>GET /api/v1/memo/{id}</code></td><td>获取单条说说</td><td><button type="button" class="button button-small test-api-method" data-method="single">测试</button></td></tr>
                        <tr><td><code>GET /api/v1/user/me</code></td><td>获取当前用户信息</td><td><button type="button" class="button button-small test-api-method" data-method="user">测试</button></td></tr>
                    </tbody>
                </table>
            </div>

            <div class="westlife-section">
                <h3>使用说明</h3>
                <ol>
                    <li>在 Memos 后台创建访问令牌：设置 → 我的账户 → 访问令牌</li>
                    <li>复制令牌并填入上方配置</li>
                    <li>点击"测试连接"确认配置正确</li>
                    <li>保存设置后，首页热力图将显示说说数据</li>
                </ol>

                <div style="background: #fff3cd; border-left: 4px solid #ffc107; padding: 10px; margin-top: 15px;">
                    <strong>⚠️ 注意事项：</strong>
                    <ul style="margin: 5px 0 0 20px;">
                        <li>API 地址不要包含末尾斜杠</li>
                        <li>确保 API Token 有读取权限</li>
                        <li>首次加载可能较慢，数据会被缓存</li>
                        <li>如果更新了 Memos 内容，可以点击"清除缓存"立即刷新</li>
                    </ul>
                </div>
            </div>

            <?php submit_button('保存配置'); ?>
        </form>
    </div>
<?php
}

/**
 * Memos说说设置页面
 */
function westlife_memos_settings_page()
{
    if (!current_user_can('manage_options')) {
        wp_die(__('您没有足够的权限访问此页面。', 'westlife'));
    }
?>
    <div class="wrap westlife-theme-settings-page westlife-memos-wrap wl-admin-wrap">
        <div class="wl-shell">
            <div class="wl-hero">
                <div class="wl-hero-main">
                    <div class="wl-page-head">
                        <h1>
                            <span class="wl-title-mark"><span class="dashicons dashicons-calendar-alt"></span></span>
                            <span class="wl-title-text"><?php _e('Memos 说说设置', 'westlife'); ?></span>
                        </h1>
                        <div class="wl-page-meta">
                            <span class="wl-badge wl-badge-kicker">Westlife</span>
                            <span class="wl-badge wl-badge-version">Memos</span>
                        </div>
                    </div>
                    <p class="wl-hero-description">配置 Memos API、缓存策略和页面评论系统。</p>
                </div>
            </div>

            <div class="wl-tab-panel is-active">
                <?php settings_errors(); ?>

                <?php westlife_render_memos_settings_tab(); ?>
            </div>
        </div>
    </div>
<?php
}

function westlife_render_memos_settings_page_content()
{
    settings_errors();
    westlife_render_memos_settings_tab();
}
