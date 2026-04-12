<?php

/**
 * Feeds缓存管理页面 - 优化版
 * 支持自定义缓存时间，显示详细错误信息
 */

// 安全检查
if (!defined('ABSPATH')) {
    exit;
}

/**
 * AJAX: 刷新单个 RSS 源
 */
function westlife_ajax_refresh_single_feed()
{
    // 安全验证
    if (!current_user_can('manage_options')) {
        wp_send_json_error(['message' => '权限不足']);
    }

    if (!wp_verify_nonce($_POST['nonce'] ?? '', 'westlife_ajax_nonce')) {
        wp_send_json_error(['message' => '安全验证失败']);
    }

    $feed_url = $_POST['feed_url'] ?? '';
    if (empty($feed_url)) {
        wp_send_json_error(['message' => '缺少 RSS 地址']);
    }

    // 查找匹配的书签
    $bookmarks = get_bookmarks([
        'orderby' => 'name',
        'limit' => -1,
        'hide_invisible' => 0,
        'category' => '',
    ]);

    $bookmark = null;
    foreach ($bookmarks as $bm) {
        if ($bm->link_rss === $feed_url) {
            $bookmark = $bm;
            break;
        }
    }

    if (!$bookmark) {
        wp_send_json_error(['message' => 'RSS 源不存在']);
    }

    // 强制刷新单个源
    $cache_dir = get_template_directory() . '/data/feeds/sources/';
    $cache_lifetime = get_option('westlife_feeds_cache_time', 120) * 60;
    $error_cache_lifetime = 30 * 60;

    try {
        $result = westlife_get_single_feed_cache(
            $bookmark,
            $feed_url,
            $cache_dir,
            $cache_lifetime,
            $error_cache_lifetime,
            true // 强制刷新
        );

        if (isset($result['error'])) {
            wp_send_json_error([
                'message' => $result['error'],
                'source' => $bookmark->link_name
            ]);
        } else {
            $items_count = count($result['items'] ?? []);
            wp_send_json_success([
                'message' => '刷新成功',
                'source' => $bookmark->link_name,
                'items_count' => $items_count
            ]);
        }
    } catch (Exception $e) {
        wp_send_json_error([
            'message' => $e->getMessage(),
            'source' => $bookmark->link_name
        ]);
    }
}
add_action('wp_ajax_refresh_single_feed', 'westlife_ajax_refresh_single_feed');

/**
 * Feeds 缓存管理页面
 */
function westlife_feeds_cache_page($embedded = false)
{
    if (!$embedded && !current_user_can('manage_options')) {
        wp_die('权限不足');
    }

    // 处理表单操作
    $message = '';
    if (isset($_POST['action'])) {
        $nonce = $_POST['_wpnonce'] ?? '';

        // 更新缓存时间设置
        if ($_POST['action'] === 'update_settings' && wp_verify_nonce($nonce, 'westlife_feeds_settings')) {
            $cache_time = intval($_POST['cache_time'] ?? 120);
            // 限制在 10 分钟到 24 小时之间
            $cache_time = max(10, min(1440, $cache_time));

            update_option('westlife_feeds_cache_time', $cache_time);
            $message = '<div class="notice notice-success is-dismissible"><p>✅ 缓存时间已更新为 ' . $cache_time . ' 分钟</p></div>';
        }

        // 清理缓存
        elseif ($_POST['action'] === 'clear_cache' && wp_verify_nonce($nonce, 'westlife_feeds_action')) {
            $cache_dir = get_template_directory() . '/data/feeds/sources/';
            $cache_files = glob($cache_dir . '*.json');
            $cleared_count = 0;

            foreach ($cache_files as $file) {
                if (@unlink($file)) {
                    $cleared_count++;
                }
            }

            $message = '<div class="notice notice-success is-dismissible"><p>✅ 已清理 ' . $cleared_count . ' 个缓存文件</p></div>';
        }

        // 强制刷新
        elseif ($_POST['action'] === 'force_refresh' && wp_verify_nonce($nonce, 'westlife_feeds_action')) {
            try {
                $start_time = microtime(true);
                $result = westlife_get_feeds(true);
                $elapsed = round(microtime(true) - $start_time, 2);

                if (isset($result['error'])) {
                    $message = '<div class="notice notice-error is-dismissible"><p>❌ 刷新失败：' . esc_html($result['error']) . '</p></div>';
                } else {
                    $stats = $result['stats'] ?? [];
                    $success_count = $stats['success'] ?? 0;
                    $error_count = $stats['errors'] ?? 0;
                    $total = $stats['total'] ?? 0;

                    $message = '<div class="notice notice-success is-dismissible">';
                    $message .= '<p><strong>✅ 刷新完成</strong> (耗时: ' . $elapsed . '秒)</p>';
                    $message .= '<ul style="margin-left: 20px;">';
                    $message .= '<li>总动态数: ' . $total . '</li>';
                    $message .= '<li>成功源: ' . $success_count . '</li>';
                    if ($error_count > 0) {
                        $message .= '<li style="color: #dc3232;">失败源: ' . $error_count . '</li>';
                    }
                    $message .= '</ul></div>';
                }
            } catch (Exception $e) {
                $message = '<div class="notice notice-error is-dismissible"><p>❌ 刷新失败：' . esc_html($e->getMessage()) . '</p></div>';
            }
        }
    }

    // 获取当前设置
    $cache_time_minutes = get_option('westlife_feeds_cache_time', 120); // 默认2小时
    $cache_lifetime = $cache_time_minutes * 60; // 转换为秒

    // 获取所有友情链接信息（用于匹配缓存文件）
    $bookmarks_map = [];
    $bookmarks = get_bookmarks([
        'orderby' => 'name',
        'limit' => -1,
        'hide_invisible' => 0,
        'category' => '',
    ]);

    foreach ($bookmarks as $bm) {
        if (!empty($bm->link_rss)) {
            // 生成与 inc-feeds.php 相同的缓存文件名
            $cache_key = md5($bm->link_rss);
            $bookmarks_map[$cache_key] = [
                'name' => $bm->link_name,
                'url' => $bm->link_url,
                'rss' => $bm->link_rss,
                'id' => $bm->link_id
            ];
        }
    }

    // 获取缓存状态
    $cache_dir = get_template_directory() . '/data/feeds/sources/';
    $cache_info = [];
    $cache_details = [];

    if (is_dir($cache_dir)) {
        $cache_files = glob($cache_dir . '*.json');
        $total_files = count($cache_files);

        $oldest_time = time();
        $newest_time = 0;
        $expired_count = 0;
        $error_count = 0;

        foreach ($cache_files as $file) {
            $mtime = filemtime($file);
            $oldest_time = min($oldest_time, $mtime);
            $newest_time = max($newest_time, $mtime);

            // 检查是否过期
            $is_expired = (time() - $mtime) > $cache_lifetime;
            if ($is_expired) {
                $expired_count++;
            }

            // 读取缓存内容获取详细信息
            $cache_data = json_decode(file_get_contents($file), true);
            $basename = basename($file, '.json');

            // 从缓存映射中获取友链信息
            $bookmark_info = $bookmarks_map[$basename] ?? null;

            $detail = [
                'file' => $basename,
                'time' => $mtime,
                'age_minutes' => floor((time() - $mtime) / 60),
                'is_expired' => $is_expired,
                'error' => null,
                'items_count' => 0,
                'bookmark' => $bookmark_info  // 添加友链信息
            ];

            if (isset($cache_data['error'])) {
                $error_count++;
                $detail['error'] = $cache_data['error'];
            } elseif (isset($cache_data['items'])) {
                $detail['items_count'] = count($cache_data['items']);
            }

            $cache_details[] = $detail;
        }

        // 按时间排序（最新的在前）
        usort($cache_details, function ($a, $b) {
            return $b['time'] - $a['time'];
        });

        $cache_info = [
            'total_sources' => $total_files,
            'expired_sources' => $expired_count,
            'error_sources' => $error_count,
            'oldest_cache' => $oldest_time,
            'newest_cache' => $newest_time,
            'cache_lifetime' => $cache_lifetime,
            'remaining_minutes' => max(0, ceil(($oldest_time + $cache_lifetime - time()) / 60)),
        ];
    }

    $next_cron = wp_next_scheduled('westlife_feeds_cron_hook');
?>
    <?php if (!$embedded) : ?>
    <div class="wrap westlife-theme-settings-page westlife-feeds-cache-page wl-admin-wrap">
        <div class="wl-shell">
            <div class="wl-hero">
                <div class="wl-hero-main">
                    <div class="wl-page-head">
                        <h1>
                            <span class="wl-title-mark"><span class="dashicons dashicons-rss"></span></span>
                            <span class="wl-title-text">Feeds 缓存管理</span>
                        </h1>
                        <div class="wl-page-meta">
                            <span class="wl-badge wl-badge-kicker">Westlife</span>
                            <span class="wl-badge wl-badge-version">Feeds</span>
                        </div>
                    </div>
                    <p class="wl-hero-description">管理友链动态抓取缓存、刷新策略与错误源状态。</p>
                </div>
            </div>

            <div class="wl-tab-panel is-active">
    <?php endif; ?>
                <?php echo $message; ?>

        <div class="card">
            <h2 class="title">
                <span class="dashicons dashicons-admin-settings"></span>
                缓存设置
            </h2>
            <div class="inside">
                <form method="post" action="">
                    <?php wp_nonce_field('westlife_feeds_settings'); ?>
                    <input type="hidden" name="action" value="update_settings">

                    <table class="form-table">
                        <tr>
                            <th scope="row">
                                <label for="cache_time">缓存有效期</label>
                            </th>
                            <td>
                                <input type="number" id="cache_time" name="cache_time"
                                    value="<?php echo esc_attr($cache_time_minutes); ?>"
                                    min="10" max="1440" step="10" class="small-text">
                                分钟
                                <p class="description">
                                    范围：10-1440 分钟（10分钟 - 24小时）。当前设置：
                                    <strong><?php
                                            if ($cache_time_minutes < 60) {
                                                echo $cache_time_minutes . ' 分钟';
                                            } else {
                                                echo round($cache_time_minutes / 60, 1) . ' 小时';
                                            }
                                            ?></strong>
                                </p>
                            </td>
                        </tr>
                    </table>

                    <?php submit_button('保存设置', 'primary', 'submit', false); ?>
                </form>
            </div>
        </div>

        <!-- 缓存状态概览 -->
        <div class="card">
            <h2 class="title">
                <span class="dashicons dashicons-chart-pie"></span>
                缓存状态概览
            </h2>
            <div class="inside">
                <?php if (!empty($cache_info)): ?>
                    <div class="stats-grid">
                        <div class="stat-box">
                            <div class="stat-icon">📦</div>
                            <div class="stat-content">
                                <div class="stat-value"><?php echo $cache_info['total_sources']; ?></div>
                                <div class="stat-label">缓存源数量</div>
                            </div>
                        </div>

                        <div class="stat-box <?php echo $cache_info['expired_sources'] > 0 ? 'stat-warning' : 'stat-success'; ?>">
                            <div class="stat-icon"><?php echo $cache_info['expired_sources'] > 0 ? '⚠️' : '✅'; ?></div>
                            <div class="stat-content">
                                <div class="stat-value"><?php echo $cache_info['expired_sources']; ?></div>
                                <div class="stat-label">过期源</div>
                            </div>
                        </div>

                        <div class="stat-box <?php echo $cache_info['error_sources'] > 0 ? 'stat-error' : 'stat-success'; ?>">
                            <div class="stat-icon"><?php echo $cache_info['error_sources'] > 0 ? '❌' : '✅'; ?></div>
                            <div class="stat-content">
                                <div class="stat-value"><?php echo $cache_info['error_sources']; ?></div>
                                <div class="stat-label">错误源</div>
                            </div>
                        </div>

                        <div class="stat-box">
                            <div class="stat-icon">⏱️</div>
                            <div class="stat-content">
                                <div class="stat-value"><?php echo $cache_info['remaining_minutes']; ?></div>
                                <div class="stat-label">剩余分钟</div>
                            </div>
                        </div>
                    </div>

                    <table class="widefat fixed striped" style="margin-top: 20px;">
                        <tbody>
                            <tr>
                                <th style="width: 200px;">最老缓存时间</th>
                                <td>
                                    <?php echo date('Y-m-d H:i:s', $cache_info['oldest_cache']); ?>
                                    <span class="description">(<?php echo human_time_diff($cache_info['oldest_cache']); ?>前)</span>
                                </td>
                            </tr>
                            <tr>
                                <th>最新缓存时间</th>
                                <td>
                                    <?php echo date('Y-m-d H:i:s', $cache_info['newest_cache']); ?>
                                    <span class="description">(<?php echo human_time_diff($cache_info['newest_cache']); ?>前)</span>
                                </td>
                            </tr>
                            <tr>
                                <th>下次自动更新</th>
                                <td>
                                    <?php
                                    if ($next_cron) {
                                        echo date('Y-m-d H:i:s', $next_cron);
                                        echo ' <span class="description">(' . human_time_diff($next_cron) . ($next_cron > time() ? '后' : '前') . ')</span>';
                                    } else {
                                        echo '<span style="color: #dc3232;">未安排</span>';
                                    }
                                    ?>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                <?php else: ?>
                    <div class="notice notice-info inline">
                        <p>📁 缓存目录不存在或没有缓存文件。点击"立即刷新"创建缓存。</p>
                    </div>
                <?php endif; ?>
            </div>
        </div>

        <!-- 缓存详情 -->
        <?php if (!empty($cache_details)): ?>
            <div class="card">
                <h2 class="title">
                    <span class="dashicons dashicons-list-view"></span>
                    缓存源详情
                    <span class="title-count">(共 <?php echo count($cache_details); ?> 个)</span>
                </h2>
                <div class="inside">
                    <div class="table-scroll-container">
                        <table class="widefat striped">
                            <thead>
                                <tr>
                                    <th style="width: 40px;">#</th>
                                    <th style="width: 150px;">友链名称</th>
                                    <th style="width: 200px;">友链网址</th>
                                    <th style="width: 250px;">RSS 源地址</th>
                                    <th style="width: 70px;">状态</th>
                                    <th style="width: 120px;">更新时间</th>
                                    <th style="width: 80px;">缓存年龄</th>
                                    <th style="width: 70px;">动态数</th>
                                    <th>错误信息</th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($cache_details as $index => $detail): ?>
                                    <tr class="<?php echo $detail['error'] ? 'cache-error-row' : ($detail['is_expired'] ? 'cache-expired-row' : ''); ?>">
                                        <td><?php echo $index + 1; ?></td>

                                        <!-- 友链名称 -->
                                        <td>
                                            <?php if ($detail['bookmark']): ?>
                                                <strong style="font-size: 14px;"><?php echo esc_html($detail['bookmark']['name']); ?></strong>
                                            <?php else: ?>
                                                <span class="description" style="color: #d63638;">⚠️ 未知</span>
                                            <?php endif; ?>
                                        </td>

                                        <!-- 友链网址 -->
                                        <td>
                                            <?php if ($detail['bookmark']): ?>
                                                <a href="<?php echo esc_url($detail['bookmark']['url']); ?>" target="_blank" style="font-size: 13px; color: #2271b1; text-decoration: none;">
                                                    <?php echo esc_html($detail['bookmark']['url']); ?> <span style="font-size: 11px;">↗</span>
                                                </a>
                                            <?php else: ?>
                                                <span class="description">-</span>
                                            <?php endif; ?>
                                        </td>

                                        <!-- RSS 源地址 -->
                                        <td>
                                            <?php if ($detail['bookmark']): ?>
                                                <code style="font-size: 11px; background: #f0f0f1; padding: 3px 6px; border-radius: 3px; display: inline-block; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                                                    <?php echo esc_html($detail['bookmark']['rss']); ?>
                                                </code>
                                            <?php else: ?>
                                                <code style="font-size: 11px; color: #999;"><?php echo esc_html($detail['file']); ?></code>
                                            <?php endif; ?>
                                        </td>
                                        <td>
                                            <?php if ($detail['error']): ?>
                                                <span class="status-badge status-error">❌ 错误</span>
                                            <?php elseif ($detail['is_expired']): ?>
                                                <span class="status-badge status-warning">⚠️ 过期</span>
                                            <?php else: ?>
                                                <span class="status-badge status-success">✅ 正常</span>
                                            <?php endif; ?>
                                        </td>
                                        <td>
                                            <?php echo date('m-d H:i:s', $detail['time']); ?>
                                        </td>
                                        <td>
                                            <?php
                                            $age = $detail['age_minutes'];
                                            if ($age < 60) {
                                                echo $age . ' 分钟';
                                            } else {
                                                echo round($age / 60, 1) . ' 小时';
                                            }
                                            ?>
                                        </td>
                                        <td>
                                            <?php echo $detail['error'] ? '-' : $detail['items_count']; ?>
                                        </td>
                                        <td>
                                            <?php if ($detail['error']): ?>
                                                <div class="error-message">
                                                    <?php echo esc_html($detail['error']); ?>
                                                </div>
                                            <?php else: ?>
                                                <span class="description">-</span>
                                            <?php endif; ?>
                                        </td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>
        <?php endif; ?>

        <!-- 缓存管理操作 -->
        <div class="card">
            <h2 class="title">
                <span class="dashicons dashicons-admin-tools"></span>
                缓存管理操作
            </h2>
            <div class="inside">
                <div class="feeds-action-buttons">
                    <div class="feeds-action-item">
                        <button type="button" id="refresh-all-feeds" class="feeds-btn feeds-btn-primary">
                            <span class="dashicons dashicons-update"></span>
                            <span class="btn-text">立即刷新缓存</span>
                        </button>
                        <p class="description">强制重新抓取所有 RSS 源，忽略当前缓存</p>
                    </div>

                    <div class="feeds-action-item">
                        <form method="post" id="clear-feeds-cache-form">
                            <?php wp_nonce_field('westlife_feeds_action'); ?>
                            <input type="hidden" name="action" value="clear_cache">
                            <button type="submit" class="feeds-btn feeds-btn-danger">
                                <span class="dashicons dashicons-trash"></span>
                                <span class="btn-text">清空缓存</span>
                            </button>
                        </form>
                        <p class="description">删除所有缓存文件，此操作不可逆</p>
                    </div>
                </div>
            </div>
        </div>

        <!-- 缓存说明 -->
        <div class="card">
            <h2 class="title">
                <span class="dashicons dashicons-info"></span>
                缓存机制说明
            </h2>
            <div class="inside">
                <div class="info-grid">
                    <div class="info-item">
                        <h3>🗂️ 分布式缓存</h3>
                        <p>每个RSS源使用独立的JSON文件存储，互不影响</p>
                    </div>

                    <div class="info-item">
                        <h3>🔄 智能更新</h3>
                        <p>只有过期的源会重新抓取，未过期的直接使用缓存</p>
                    </div>

                    <div class="info-item">
                        <h3>❌ 错误缓存</h3>
                        <p>抓取失败的源会缓存错误信息30分钟，避免频繁重试</p>
                    </div>

                    <div class="info-item">
                        <h3>⏱️ 定时任务</h3>
                        <p>WordPress Cron 每2小时检查一次，自动刷新过期缓存</p>
                    </div>
                </div>

                <div style="margin-top: 20px;">
                    <h4>📁 缓存目录：</h4>
                    <code class="cache-path"><?php echo esc_html($cache_dir); ?></code>
                </div>
            </div>
        </div>
    <?php if (!$embedded) : ?>
            </div>
        </div>
    </div>
    <?php endif; ?>

    <script>
        jQuery(document).ready(function($) {
            // 清空缓存确认
            $('#clear-feeds-cache-form').on('submit', function(e) {
                e.preventDefault();
                var $form = $(this);

                WestlifeModal.confirm({
                    title: '清空 Feeds 缓存',
                    message: '⚠️ 确定要清空所有缓存文件吗？<br>这将导致下次访问时重新抓取所有 RSS 源。',
                    type: 'warning',
                    confirmText: '确定清空',
                    cancelText: '取消',
                    confirmClass: 'danger'
                }).then(function() {
                    $form.off('submit').submit();
                }).catch(function() {
                    // User cancelled
                });
            });

            // 刷新所有订阅源
            $('#refresh-all-feeds').on('click', function() {
                var $btn = $(this);
                var $btnText = $btn.find('.btn-text');
                var $icon = $btn.find('.dashicons');
                var originalText = $btnText.text();

                // 检查 ajaxurl
                var ajaxurl = '<?php echo admin_url('admin-ajax.php'); ?>';
                var nonce = '<?php echo wp_create_nonce('westlife_ajax_nonce'); ?>';

                // 获取所有订阅源
                var feeds = <?php
                            // 获取所有友情链接（与 inc-feeds.php 保持一致）
                            $bookmarks = get_bookmarks([
                                'orderby' => 'name',
                                'limit' => -1,
                                'hide_invisible' => 0,
                                'category' => '',
                            ]);

                            // 过滤出有 RSS 地址的链接
                            $feed_urls = [];
                            foreach ($bookmarks as $bm) {
                                if (!empty($bm->link_rss)) {
                                    $feed_urls[] = [
                                        'url' => $bm->link_rss,
                                        'name' => $bm->link_name,
                                        'id' => $bm->link_id
                                    ];
                                }
                            }
                            echo json_encode($feed_urls);
                            ?>;

                console.log('Found feeds:', feeds.length);
                console.log('Feeds data:', feeds);

                if (feeds.length === 0) {
                    WestlifeModal.alert({
                        title: '没有订阅源',
                        message: '没有找到任何 RSS 订阅源。<br><br>请先在 WordPress 后台的 <strong>链接</strong> 菜单中添加友情链接，并填写 RSS 地址。',
                        type: 'warning'
                    }).catch(function() {
                        alert('没有找到订阅源\n\n请先在 WordPress 后台的"链接"菜单中添加友情链接，并填写 RSS 地址。');
                    });
                    return;
                }

                var total = feeds.length;
                var current = 0;
                var success = 0;
                var failed = 0;

                // 禁用按钮并更新文本
                $btn.prop('disabled', true);
                $icon.removeClass('dashicons-update').addClass('dashicons-update spin-animation');
                $btnText.text('正在刷新... (0 / ' + total + ')');

                // 递归刷新每个源
                function refreshNext() {
                    if (current >= total) {
                        // 全部完成
                        $icon.removeClass('dashicons-update spin-animation').addClass('dashicons-yes');
                        $btnText.text('✅ 完成！成功 ' + success + ' / 失败 ' + failed);

                        // 2秒后刷新页面
                        setTimeout(function() {
                            location.reload();
                        }, 2000);
                        return;
                    }

                    var feed = feeds[current];
                    var percent = Math.round((current / total) * 100);
                    $btnText.text('正在刷新... (' + current + ' / ' + total + ') ' + percent + '%');

                    $.ajax({
                        url: ajaxurl,
                        type: 'POST',
                        data: {
                            action: 'refresh_single_feed',
                            nonce: nonce,
                            feed_url: feed.url
                        },
                        success: function(response) {
                            current++;
                            if (response.success) {
                                success++;
                            } else {
                                failed++;
                            }
                            // 继续下一个
                            refreshNext();
                        },
                        error: function() {
                            current++;
                            failed++;
                            // 继续下一个
                            refreshNext();
                        }
                    });
                }

                // 开始刷新第一个
                refreshNext();
            });
        });
    </script>
<?php
}

function westlife_render_feeds_cache_content()
{
    westlife_feeds_cache_page(true);
}
