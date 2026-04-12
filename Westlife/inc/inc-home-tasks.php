<?php

/**
 * Home Tasks Admin Page + REST Endpoint
 */
if (!defined('ABSPATH')) exit;

// Ensure parser exists (fallback to previous implementation if not loaded yet)
if (!function_exists('westlife_get_home_tasks')) {
    function westlife_get_home_tasks()
    {
        $raw = get_option('westlife_home_tasks_raw', '');
        if (!$raw) return [];
        $items = [];
        $trimmed = trim($raw);
        if ($trimmed === '') return [];
        if (preg_match('/^\s*\[/', $trimmed)) {
            $json = json_decode($trimmed, true);
            if (is_array($json)) {
                foreach ($json as $row) {
                    if (!is_array($row)) continue;
                    $title = isset($row['title']) ? wp_strip_all_tags($row['title']) : '';
                    $pct = isset($row['percent']) ? intval($row['percent']) : 0;
                    if ($title === '') continue;
                    if ($pct < 0) $pct = 0;
                    if ($pct > 100) $pct = 100;
                    $items[] = ['title' => $title, 'percent' => $pct];
                }
                return $items;
            }
        }
        $lines = preg_split('/\r?\n/', $trimmed);
        foreach ($lines as $ln) {
            $ln = trim($ln);
            if ($ln === '') continue;
            if (strpos($ln, '|') !== false) {
                list($title, $pct) = array_map('trim', explode('|', $ln, 2));
            } else {
                $title = $ln;
                $pct = '0';
            }
            $title = wp_strip_all_tags($title);
            if ($title === '') continue;
            $pct = intval(preg_replace('/[^0-9]/', '', $pct));
            if ($pct < 0) $pct = 0;
            if ($pct > 100) $pct = 100;
            $items[] = ['title' => $title, 'percent' => $pct];
        }
        return $items;
    }
}

// Admin Page - 已整合到基础设置，不再需要独立菜单
// add_action('admin_menu', function () {
//     add_submenu_page(
//         'westlife-settings',
//         '首页任务进度',
//         '任务进度',
//         'manage_options',
//         'westlife-home-tasks',
//         'westlife_render_home_tasks_page'
//     );
// }, 20);

function westlife_render_home_tasks_page()
{
    if (!current_user_can('manage_options')) return;
    $updated = false;
    $error = '';
    if (isset($_POST['westlife_tasks_nonce']) && wp_verify_nonce($_POST['westlife_tasks_nonce'], 'westlife_save_tasks')) {
        $raw = isset($_POST['westlife_home_tasks_raw']) ? wp_unslash($_POST['westlife_home_tasks_raw']) : '';
        update_option('westlife_home_tasks_raw', $raw);
        $updated = true;
    }
    $raw = get_option('westlife_home_tasks_raw', '');
    echo '<div class="wrap"><h1>首页任务进度</h1>';
    if ($updated) echo '<div class="updated notice"><p>已保存。</p></div>';
    if ($error) echo '<div class="error notice"><p>' . esc_html($error) . '</p></div>';
    echo '<form method="post"><table class="form-table" role="presentation"><tbody>';
    echo '<tr><th scope="row"><label for="westlife_home_tasks_raw">任务列表</label></th><td>';
    echo '<textarea id="westlife_home_tasks_raw" name="westlife_home_tasks_raw" rows="10" style="width:100%;max-width:760px;font-family:monospace;" placeholder="支持两种格式:\n1) 每行: 标题|百分比\n2) JSON: [{\"title\":\"重构\",\"percent\":70}]">' . esc_textarea($raw) . '</textarea>';
    echo '<p class="description">留空则前端显示“暂无任务”。百分比限定 0-100。</p>';
    echo '</td></tr>';
    echo '</tbody></table>';
    wp_nonce_field('westlife_save_tasks', 'westlife_tasks_nonce');
    submit_button('保存任务');
    echo '</form>';
    // Preview
    $tasks = westlife_get_home_tasks();
    echo '<h2>解析预览</h2>';
    if (empty($tasks)) {
        echo '<p><em>暂无任务</em></p>';
    } else {
        echo '<ol>';
        foreach ($tasks as $t) {
            printf('<li>%s (%d%%)</li>', esc_html($t['title']), (int)$t['percent']);
        }
        echo '</ol>';
    }
    echo '</div>';
}

// REST Endpoint: /wp-json/westlife/v1/tasks
add_action('rest_api_init', function () {
    register_rest_route('westlife/v1', '/tasks', [
        'methods' => WP_REST_Server::READABLE,
        'callback' => function () {
            $tasks = westlife_get_home_tasks();
            return rest_ensure_response(['success' => true, 'tasks' => $tasks, 'generated' => time()]);
        },
        'permission_callback' => '__return_true', // Public read
        'args' => []
    ]);
});
