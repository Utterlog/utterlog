<?php

/**
 * AJAX 处理模块
 * 
 * 提供主题所有 AJAX 功能的统一处理
 * 包括：用户认证、内容加载、友链管理、状态检测等
 * 
 * @package Westlife
 * @since 1.0.0
 */

// 防止直接访问
if (!defined('ABSPATH')) exit;

/* ==========================================================================
   工具函数
   ========================================================================== */

/**
 * 统一的通知响应函数
 * 
 * @param string $message 消息内容
 * @param string $type 消息类型 (success|error|info)
 * @param bool $success 是否成功
 * @param array $additional_data 额外数据
 */
function westlife_send_notification_response($message, $type = 'info', $success = true, $additional_data = [])
{
    $response_data = array_merge([
        'message' => $message,
        'notification' => [
            'text' => $message,
            'type' => $type,
            'duration' => $type === 'error' ? 5000 : 3000
        ]
    ], $additional_data);

    if ($success) {
        wp_send_json_success($response_data);
    } else {
        wp_send_json_error($response_data);
    }
}

/**
 * 统一的 AJAX 请求验证
 * 
 * @param string $action       动作名称
 * @param string $method       请求方法 (POST/GET)
 * @param string $nonce_field  nonce 字段名
 * @param string $nonce_action nonce 动作名
 * @return bool 验证成功返回 true，失败返回 false 并发送错误响应
 */
function westlife_verify_ajax_request(
    $action = 'westlife_ajax',
    $method = 'POST',
    $nonce_field = 'nonce',
    $nonce_action = 'westlife_ajax_nonce'
) {
    // 验证请求方法
    if ($_SERVER['REQUEST_METHOD'] !== strtoupper($method)) {
        westlife_send_notification_response(
            __('请求方法错误', 'westlife'),
            'error',
            false
        );
        return false;
    }

    // 验证 nonce
    $nonce = isset($_REQUEST[$nonce_field]) ? sanitize_text_field($_REQUEST[$nonce_field]) : '';
    if (!wp_verify_nonce($nonce, $nonce_action)) {
        westlife_send_notification_response(
            __('安全验证失败，请刷新页面重试', 'westlife'),
            'error',
            false
        );
        return false;
    }

    return true;
}

/* ==========================================================================
   首页友链切换：随机返回若干友链
   ========================================================================== */

function westlife_get_random_friend_links()
{
    // 验证 nonce（与前端一致）
    if (!check_ajax_referer('westlife_ajax_nonce', 'nonce', false)) {
        wp_send_json_error(['message' => __('安全验证失败', 'westlife')]);
    }

    if (!function_exists('get_bookmarks')) {
        wp_send_json_success(['links' => []]);
    }

    $count = isset($_REQUEST['count']) ? max(1, min(12, absint($_REQUEST['count']))) : 5;
    $bookmarks = get_bookmarks([
        'orderby' => 'rand',
        'limit'   => $count,
    ]);

    $links = [];
    foreach ((array)$bookmarks as $bk) {
        $url = isset($bk->link_url) ? (string)$bk->link_url : '';
        $name = isset($bk->link_name) ? (string)$bk->link_name : '';
        $desc = isset($bk->link_description) ? (string)$bk->link_description : '';
        $image = '';
        if (!empty($bk->link_image)) {
            $image = esc_url_raw($bk->link_image);
        } else {
            $image = function_exists('westlife_get_favicon_url') ? esc_url_raw((string) westlife_get_favicon_url($url)) : '';
        }
        $links[] = [
            'url' => esc_url_raw($url),
            'name' => $name,
            'desc' => $desc,
            'image' => $image,
        ];
    }

    wp_send_json_success(['links' => $links]);
}

add_action('wp_ajax_westlife_get_random_friend_links', 'westlife_get_random_friend_links');
add_action('wp_ajax_nopriv_westlife_get_random_friend_links', 'westlife_get_random_friend_links');

/* ==========================================================================
   用户认证相关
   ========================================================================== */

/**
 * AJAX 用户登录
 * 
 * 处理前端登录表单的 AJAX 提交
 * 必需参数：log (用户名), pwd (密码)
 * 可选参数：rememberme (记住登录)
 */
function westlife_ajax_login()
{
    // 安全验证
    if (!check_ajax_referer('westlife_ajax_nonce', 'nonce', false)) {
        westlife_send_notification_response(
            __('安全验证失败，请刷新页面重试', 'westlife'),
            'error',
            false
        );
        wp_die();
    }

    // 清理输出缓冲
    while (ob_get_level() > 0) {
        ob_end_clean();
    }

    try {
        // 验证必需字段
        if (empty($_POST['log']) || empty($_POST['pwd'])) {
            throw new Exception(__('请填写用户名和密码', 'westlife'));
        }

        // 准备登录信息
        $credentials = [
            'user_login'    => sanitize_user(wp_unslash($_POST['log'])),
            'user_password' => $_POST['pwd'],
            'remember'      => !empty($_POST['rememberme']),
        ];

        // 执行登录
        $user = wp_signon($credentials, is_ssl());

        if (is_wp_error($user)) {
            throw new Exception($user->get_error_message());
        }

        // 设置登录状态
        wp_set_current_user($user->ID);
        wp_set_auth_cookie($user->ID, $credentials['remember']);

        // 返回成功响应
        westlife_send_notification_response(
            __('登录成功', 'westlife'),
            'success',
            true,
            [
                'redirect' => home_url(),
                'user' => [
                    'id' => $user->ID,
                    'display_name' => $user->display_name,
                    'avatar_url' => get_avatar_url($user->ID)
                ]
            ]
        );
    } catch (Exception $e) {
        westlife_send_notification_response($e->getMessage(), 'error', false);
    }
}

/**
 * AJAX 密码找回
 * 
 * 发送密码重置链接到用户邮箱
 * 必需参数：user_login (用户名或邮箱)
 */
function westlife_forgot_password_handler()
{
    // 安全验证
    if (!check_ajax_referer('westlife_ajax_nonce', 'nonce', false)) {
        westlife_send_notification_response(
            __('安全验证失败', 'westlife'),
            'error',
            false
        );
        wp_die();
    }

    $user_login = sanitize_text_field($_POST['user_login'] ?? '');

    if (empty($user_login)) {
        westlife_send_notification_response(
            __('请输入用户名或邮箱', 'westlife'),
            'error',
            false
        );
        return;
    }

    // 查找用户
    $user = get_user_by('email', $user_login) ?: get_user_by('login', $user_login);

    if (!$user) {
        westlife_send_notification_response(
            __('未找到该用户', 'westlife'),
            'error',
            false
        );
        return;
    }

    // 生成重置密钥
    $key = get_password_reset_key($user);

    if (is_wp_error($key)) {
        westlife_send_notification_response(
            __('重置密码失败，请稍后重试', 'westlife'),
            'error',
            false
        );
        return;
    }

    // 构建重置链接
    $reset_link = network_site_url(
        "wp-login.php?action=rp&key=$key&login=" . rawurlencode($user->user_login),
        'login'
    );

    // 发送邮件
    $to      = $user->user_email;
    $subject = sprintf('[%s] %s', get_bloginfo('name'), __('重置密码请求', 'westlife'));
    $message = sprintf(
        __("有人请求重置您在 %s 的密码。\n\n如果这不是您的操作，请忽略此邮件。\n\n要重置密码，请访问以下链接：\n%s", 'westlife'),
        get_bloginfo('name'),
        $reset_link
    );

    if (wp_mail($to, $subject, $message)) {
        westlife_send_notification_response(
            __('重置密码链接已发送到您的邮箱', 'westlife'),
            'success'
        );
    } else {
        westlife_send_notification_response(
            __('发送邮件失败，请稍后重试', 'westlife'),
            'error',
            false
        );
    }
}

/**
 * AJAX 刷新 Nonce
 * 
 * 为长时间停留的页面刷新安全令牌
 */
function westlife_refresh_nonce()
{
    wp_send_json_success([
        'nonce' => wp_create_nonce('westlife_ajax_nonce'),
        'timestamp' => time()
    ]);
}

/**
 * 根据邮箱返回 WordPress 内置头像 URL（尊重站点的头像代理设置）
 * 参数：email (POST)
 */
function westlife_get_avatar_url_by_email()
{
    if (!check_ajax_referer('westlife_ajax_nonce', 'nonce', false)) {
        westlife_send_notification_response(
            __('安全验证失败', 'westlife'),
            'error',
            false
        );
        wp_die();
    }

    $email = isset($_POST['email']) ? sanitize_email(wp_unslash($_POST['email'])) : '';
    $size  = isset($_POST['size']) ? absint($_POST['size']) : 40;

    if (empty($email) || !is_email($email)) {
        westlife_send_notification_response(__('邮箱不合法', 'westlife'), 'error', false);
    }

    // WordPress 会自动计算哈希并根据过滤器应用自定义 Gravatar 代理
    $url = get_avatar_url($email, ['size' => $size * 2]);
    wp_send_json_success(['url' => $url]);
}

add_action('wp_ajax_westlife_get_avatar_url', 'westlife_get_avatar_url_by_email');
add_action('wp_ajax_nopriv_westlife_get_avatar_url', 'westlife_get_avatar_url_by_email');

/**
 * 根据邮箱返回该邮箱在全站已批准（approve）的评论总数
 * 参数：email (POST)
 */
function westlife_get_approved_comment_count()
{
    if (!check_ajax_referer('westlife_ajax_nonce', 'nonce', false)) {
        westlife_send_notification_response(
            __('安全验证失败', 'westlife'),
            'error',
            false
        );
        wp_die();
    }

    $email = isset($_POST['email']) ? sanitize_email(wp_unslash($_POST['email'])) : '';
    if (empty($email) || !is_email($email)) {
        westlife_send_notification_response(__('邮箱不合法', 'westlife'), 'error', false);
        return;
    }

    // 统计该邮箱在全站的已批准评论数
    $count = get_comments([
        'author_email' => $email,
        'status'       => 'approve',
        'count'        => true,
        'update_comment_meta_cache' => false,
        'update_comment_post_cache' => false,
    ]);

    wp_send_json_success(['count' => intval($count)]);
}

add_action('wp_ajax_westlife_get_approved_comment_count', 'westlife_get_approved_comment_count');
add_action('wp_ajax_nopriv_westlife_get_approved_comment_count', 'westlife_get_approved_comment_count');

/* ==========================================================================
   内容加载相关
   ========================================================================== */

/**
 * AJAX 加载分类文章
 * 
 * 根据分类和页码加载文章列表
 * 参数：category (分类ID), page (页码)
 */
function westlife_load_category_posts()
{
    // 安全验证
    if (!check_ajax_referer('westlife_ajax_nonce', 'nonce', false)) {
        westlife_send_notification_response(
            __('安全校验失败', 'westlife'),
            'error',
            false
        );
        return;
    }

    try {
        // 获取参数
        $category = isset($_POST['category']) ? intval($_POST['category']) : 0;
        $page     = isset($_POST['page']) ? max(1, intval($_POST['page'])) : 1;

        // 构建查询参数
        $query_args = [
            'post_type'      => 'post',
            'post_status'    => 'publish',
            'posts_per_page' => get_option('posts_per_page'),
            'paged'          => $page,
            'no_found_rows'  => false, // 确保分页正常工作
        ];

        // 如果指定了分类
        if ($category > 0) {
            $query_args['cat'] = $category;
        }

        // 执行查询
        $query = new WP_Query($query_args);

        // 渲染文章列表
        ob_start();
        if ($query->have_posts()) {
            while ($query->have_posts()) {
                $query->the_post();
                get_template_part('template-parts/content', get_post_format() ?: 'card');
            }
        } else {
            get_template_part('template-parts/content', 'none');
        }
        $html = ob_get_clean();

        // 渲染分页
        ob_start();
        westlife_get_pagination([
            'total' => $query->max_num_pages,
            'current' => $page
        ]);
        $pagination = ob_get_clean();

        wp_reset_postdata();

        // 返回响应
        wp_send_json_success([
            'html'       => $html,
            'pagination' => $pagination,
            'url'        => $category > 0 ? get_category_link($category) : home_url('/'),
            'found_posts' => $query->found_posts,
            'max_pages'   => $query->max_num_pages
        ]);
    } catch (Exception $e) {
        westlife_send_notification_response(
            __('加载失败，请刷新页面重试', 'westlife'),
            'error',
            false
        );
    }
}

/**
 * AJAX 加载随机相关文章
 * 
 * 基于当前文章加载相关推荐
 * 参数：post_id (文章ID), seen (已查看的ID列表), seed (随机种子)
 */
function westlife_load_random_related()
{
    // 安全验证
    if (!westlife_verify_ajax_request('westlife_load_random_related', 'POST', 'nonce', 'westlife_ajax_nonce')) {
        return;
    }

    try {
        // 验证文章ID
        $post_id = isset($_POST['post_id']) ? absint($_POST['post_id']) : 0;
        if (!$post_id || !get_post($post_id)) {
            throw new Exception(__('无效的文章ID', 'westlife'));
        }

        // 处理已查看列表
        $seen = [];
        if (!empty($_POST['seen'])) {
            $seen = array_filter(array_map('absint', explode(',', sanitize_text_field($_POST['seen']))));
        }

        // 获取随机种子
        $seed = !empty($_POST['seed']) ? sanitize_text_field($_POST['seed']) : null;

        // 获取相关文章
        $posts = westlife_get_related_posts_randomized($post_id, 3, $seen, $seed);

        // 渲染文章卡片
        ob_start();
        foreach ($posts as $post) {
            setup_postdata($post);
?>
            <article class="related-item" data-post-id="<?php echo esc_attr($post->ID); ?>">
                <a href="<?php echo esc_url(get_permalink($post)); ?>" class="related-link">
                    <div class="related-thumb">
                        <?php echo function_exists('westlife_render_post_thumbnail') ? westlife_render_post_thumbnail($post->ID, 'related') : ''; ?>
                        <time class="related-date" datetime="<?php echo esc_attr(get_the_date('c', $post)); ?>">
                            <?php echo esc_html(get_the_date('Y-m-d', $post)); ?>
                        </time>
                    </div>
                    <div class="related-content">
                        <h4 class="related-item-title">
                            <?php echo wp_trim_words(get_the_title($post->ID), 30); ?>
                        </h4>
                    </div>
                </a>
            </article>
<?php
        }
        wp_reset_postdata();

        wp_send_json_success([
            'html' => ob_get_clean(),
            'count' => count($posts),
            'post_ids' => wp_list_pluck($posts, 'ID')
        ]);
    } catch (Exception $e) {
        westlife_send_notification_response($e->getMessage(), 'error', false);
    }
}

/* ==========================================================================
   友链管理相关
   ========================================================================== */

/**
 * AJAX 提交友链申请
 * 
 * 创建待审核的友链
 * 参数：name, url, rss, avatar, desc
 */
function westlife_submit_friend_link()
{
    // 安全验证
    if (!westlife_verify_ajax_request('westlife_submit_friend_link', 'POST', 'nonce', 'westlife_ajax_nonce')) {
        return;
    }

    // 加载必要的函数
    if (!function_exists('wp_insert_link')) {
        require_once ABSPATH . 'wp-admin/includes/bookmark.php';
    }

    // 获取并验证表单数据
    $name   = sanitize_text_field($_POST['name'] ?? '');
    $url    = esc_url_raw(trim($_POST['url'] ?? ''));
    $rss    = esc_url_raw(trim($_POST['rss'] ?? ''));
    $avatar = esc_url_raw(trim($_POST['avatar'] ?? ''));
    $desc   = wp_strip_all_tags($_POST['desc'] ?? '');

    // 验证必需字段
    if (empty($name) || empty($url)) {
        westlife_send_notification_response(
            __('请填写网站名称和网址', 'westlife'),
            'error',
            false
        );
        return;
    }

    // 验证URL格式
    if (!filter_var($url, FILTER_VALIDATE_URL)) {
        westlife_send_notification_response(
            __('请填写有效的网址', 'westlife'),
            'error',
            false
        );
        return;
    }

    // 获取或创建友链分类
    $term_name = '友链';
    $term = term_exists($term_name, 'link_category');

    if (!$term) {
        $term = wp_insert_term($term_name, 'link_category', [
            'slug' => 'friend-links',
            'description' => '友情链接'
        ]);

        if (is_wp_error($term)) {
            westlife_send_notification_response(
                __('友链分类创建失败', 'westlife'),
                'error',
                false
            );
            return;
        }
    }

    $term_id = is_array($term) ? (int)$term['term_id'] : (int)$term;

    // 准备友链数据
    $link_data = [
        'link_name'        => $name,
        'link_url'         => $url,
        'link_description' => $desc,
        'link_image'       => $avatar,
        'link_rss'         => $rss,
        'link_target'      => '_blank',
        'link_rel'         => 'friend',
        'link_visible'     => 'N', // 默认不可见，需要审核
        'link_category'    => [$term_id],
        'link_rating'      => 0,
        'link_notes'       => sprintf('申请时间：%s', current_time('mysql'))
    ];

    // 插入友链
    $link_id = wp_insert_link($link_data, true);

    if (is_wp_error($link_id)) {
        westlife_send_notification_response(
            $link_id->get_error_message() ?: __('提交失败，请稍后重试', 'westlife'),
            'error',
            false
        );
        return;
    }

    // 发送邮件通知管理员
    westlife_send_friend_link_application_email($link_data, $link_id);

    // 发送成功响应
    westlife_send_notification_response(
        __('友链申请已提交，请等待审核', 'westlife'),
        'success',
        true,
        ['link_id' => $link_id]
    );
}

/* ==========================================================================
   友链检测相关
   ========================================================================== */

/**
 * AJAX 检测友链可用性
 * 本功能仅通过 HEAD 请求检测友链网站的可访问性，
 * 用于维护友链质量，不会对对方网站造成任何访问压力或安全风险。
 */
function westlife_check_link_head()
{
    // 验证 nonce（可选，因为这是公开功能）
    if (isset($_POST['nonce']) && !wp_verify_nonce($_POST['nonce'], 'westlife_ajax_nonce')) {
        westlife_send_notification_response(
            'Security verification failed',
            'error',
            false
        );
        return;
    }

    // 获取URL数据 - 兼容多种格式
    $urls = [];

    // 方式1：直接从 POST 获取 urls 参数
    if (isset($_POST['urls'])) {
        $raw_urls = $_POST['urls'];

        // 如果是字符串，尝试JSON解析
        if (is_string($raw_urls)) {
            $decoded = json_decode($raw_urls, true);
            if (is_array($decoded)) {
                $urls = $decoded;
            } else {
                // 可能是逗号分隔的字符串
                $urls = array_map('trim', explode(',', $raw_urls));
            }
        } elseif (is_array($raw_urls)) {
            $urls = $raw_urls;
        }
    }

    // 方式2：从表单字段解析（如果上面没获取到）
    if (empty($urls)) {
        // 尝试从其他可能的字段获取
        foreach ($_POST as $key => $value) {
            if (strpos($key, 'url') !== false && !empty($value)) {
                if (is_string($value)) {
                    $urls[] = $value;
                }
            }
        }
    }

    // 过滤和验证URL
    $valid_urls = [];
    foreach ($urls as $url) {
        $url = is_string($url) ? esc_url_raw(trim($url)) : '';
        if (!empty($url) && filter_var($url, FILTER_VALIDATE_URL)) {
            $valid_urls[] = $url;
        }
    }

    // 调试信息（开发环境）
    if (defined('WP_DEBUG') && WP_DEBUG) {
    }

    if (empty($valid_urls)) {
        westlife_send_notification_response(
            '参数错误：缺少有效的URL列表',
            'error',
            false,
            [
                'debug' => [
                    'post_data' => $_POST,
                    'parsed_urls' => $urls,
                    'valid_urls' => $valid_urls
                ]
            ]
        );
        return;
    }

    $results = [];
    $timeout = 8; // 增加超时时间到8秒
    $max_urls = 30; // 增加批处理数量
    $valid_urls = array_slice($valid_urls, 0, $max_urls);

    foreach ($valid_urls as $url) {
        // 发送 HEAD 请求检测可访问性
        $response = wp_remote_head($url, [
            'timeout' => $timeout,
            'redirection' => 3,
            'user-agent' => 'Mozilla/5.0 (compatible; WestlifeTheme/1.0; +' . home_url() . ')',
            'headers' => [
                'Accept' => 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language' => 'zh-CN,zh;q=0.9,en;q=0.8',
                'Cache-Control' => 'no-cache',
                'Pragma' => 'no-cache'
            ],
            'sslverify' => false // 允许自签名证书
        ]);

        if (is_wp_error($response)) {
            $results[$url] = [
                'status' => false,
                'code' => 0,
                'message' => $response->get_error_message(),
                'timestamp' => time()
            ];
        } else {
            $code = wp_remote_retrieve_response_code($response);
            $message = wp_remote_retrieve_response_message($response);

            // 判断状态：2xx 和 3xx 都认为可访问
            $is_accessible = ($code >= 200 && $code < 400);

            $results[$url] = [
                'status' => $is_accessible,
                'code' => $code,
                'message' => $message ?: 'Unknown',
                'timestamp' => time()
            ];
        }
    }

    // 缓存结果（1小时）
    if (!empty($results)) {
        $cache_key = 'westlife_link_check_' . md5(serialize($valid_urls));
        set_transient($cache_key, $results, HOUR_IN_SECONDS);
    }

    // 返回结果
    wp_send_json_success([
        'results' => $results,
        'timestamp' => time(),
        'total_checked' => count($results),
        'debug' => defined('WP_DEBUG') && WP_DEBUG ? [
            'input_urls' => $urls,
            'valid_urls' => $valid_urls
        ] : null
    ]);
}

/**
 * 兼容旧版本的简单检测接口
 */
function westlife_check_links_simple()
{
    // 直接调用新版本接口
    westlife_check_link_head();
}

/* ==========================================================================
   交互功能相关
   ========================================================================== */

/**
 * AJAX 文章互动反应
 * 
 * 处理文章的点赞、鼓掌等互动
 * 参数：post_id, type (like|clap|party), op (add|remove)
 */
function westlife_ajax_react()
{
    // 安全验证
    if (!westlife_verify_ajax_request('westlife_react', 'POST', 'nonce', 'westlife_ajax_nonce')) {
        return;
    }

    try {
        // 获取参数
        $post_id = isset($_POST['post_id']) ? absint($_POST['post_id']) : 0;
        $type    = isset($_POST['type']) ? sanitize_key($_POST['type']) : '';
        $op      = isset($_POST['op']) ? sanitize_key($_POST['op']) : 'add';

        // 验证文章
        if (!$post_id || !get_post($post_id)) {
            throw new Exception('文章不存在');
        }

        // 验证反应类型
        $allowed_types = function_exists('westlife_reaction_types')
            ? westlife_reaction_types()
            : ['like', 'clap', 'party'];

        if (!in_array($type, $allowed_types, true)) {
            throw new Exception('无效的反应类型');
        }

        // 验证操作类型
        $op = ($op === 'remove') ? 'remove' : 'add';

        // 更新计数
        if (function_exists('westlife_update_reaction_count')) {
            $counts = westlife_update_reaction_count($post_id, $type, $op);
        } else {
            // 兜底实现
            $counts = get_post_meta($post_id, 'westlife_reactions', true);
            if (!is_array($counts)) $counts = [];

            $defaults = array_fill_keys($allowed_types, 0);
            $counts = array_intersect_key($counts + $defaults, $defaults);

            if ($op === 'remove') {
                $counts[$type] = max(0, (int)$counts[$type] - 1);
            } else {
                $counts[$type] = (int)$counts[$type] + 1;
            }

            update_post_meta($post_id, 'westlife_reactions', $counts);
        }

        if (function_exists('westlife_track_visitor_profile_event')) {
            westlife_track_visitor_profile_event('reaction_' . $type, [
                'delta' => $op === 'remove' ? -1 : 1,
                'email' => sanitize_email($_POST['email'] ?? ''),
                'name' => sanitize_text_field($_POST['name'] ?? ''),
                'url' => esc_url_raw($_POST['url'] ?? ''),
            ]);
        }

        // 返回响应
        westlife_send_notification_response(
            '操作成功',
            'success',
            true,
            [
                'post_id' => $post_id,
                'type' => $type,
                'operation' => $op,
                'counts' => $counts,
                'new_count' => $counts[$type]
            ]
        );
    } catch (Exception $e) {
        westlife_send_notification_response($e->getMessage(), 'error', false);
    }
}

/* ==========================================================================
   状态检测相关
   ========================================================================== */

/**
 * AJAX 管理员在线状态
 * 
 * 获取管理员的在线状态
 * 参数：ttl (有效期，秒)
 */
function westlife_ajax_admin_status()
{
    // 获取有效期参数
    $ttl = isset($_REQUEST['ttl']) ? max(60, absint($_REQUEST['ttl'])) : 300;

    // 检查在线状态
    $online = function_exists('westlife_is_admin_online')
        ? westlife_is_admin_online($ttl)
        : false;

    // 获取最后活动时间
    $last_seen = (int) get_transient('westlife_admin_last_seen');

    // 计算时间差
    $ago = '';
    if ($last_seen) {
        $ago = human_time_diff($last_seen, time());
    }

    // 生成状态描述
    $status_title = $online
        ? __('管理员在线', 'westlife')
        : sprintf(__('上次在线：%s前', 'westlife'), $ago ?: __('未知', 'westlife'));

    // 返回响应
    wp_send_json_success([
        'online'       => $online,
        'last_seen'    => $last_seen,
        'ago'          => $ago,
        'status_title' => $status_title,
        'ttl'          => $ttl
    ]);
}


/* ==========================================================================
   辅助函数
   ========================================================================== */

/**
 * 获取随机相关文章
 * 
 * @param int   $post_id  当前文章ID
 * @param int   $target   目标数量
 * @param array $seen_ids 已查看的ID列表
 * @param string $seed    随机种子
 * @return array 文章对象数组
 */
function westlife_get_related_posts_randomized($post_id, $target = 3, $seen_ids = [], $seed = null)
{
    $post_id = absint($post_id);
    if (!$post_id) {
        return [];
    }

    $exclude = array_unique(array_map('absint', array_merge([$post_id], $seen_ids)));
    $candidate_ids = westlife_get_related_posts_candidate_ids($post_id);
    if (empty($candidate_ids)) {
        return [];
    }

    $candidate_ids = array_values(array_diff($candidate_ids, $exclude));
    if (empty($candidate_ids)) {
        return [];
    }

    if ($seed === null) {
        $seed = wp_generate_uuid4();
    }

    usort($candidate_ids, function ($a, $b) use ($seed) {
        return crc32($seed . ':' . $a) <=> crc32($seed . ':' . $b);
    });

    $picked_ids = array_slice($candidate_ids, 0, max(1, absint($target)));
    if (empty($picked_ids)) {
        return [];
    }

    return get_posts([
        'post_type'              => 'post',
        'post_status'            => 'publish',
        'post__in'               => $picked_ids,
        'orderby'                => 'post__in',
        'posts_per_page'         => count($picked_ids),
        'ignore_sticky_posts'    => 1,
        'update_post_meta_cache' => true,
        'update_post_term_cache' => true,
    ]);
}

function westlife_get_related_posts_candidate_ids($post_id)
{
    $post_id = absint($post_id);
    if (!$post_id) {
        return [];
    }

    $cache_key = 'wl_related_candidates_v2_' . $post_id;
    $cached = get_transient($cache_key);
    if (is_array($cached)) {
        return array_values(array_unique(array_map('absint', $cached)));
    }

    $categories = get_the_category($post_id);
    $cat_ids = $categories ? array_values(array_filter(array_map('absint', wp_list_pluck($categories, 'term_id')))) : [];
    $tags = get_the_tags($post_id);
    $tag_ids = $tags ? array_values(array_filter(array_map('absint', wp_list_pluck($tags, 'term_id')))) : [];

    $base_args = [
        'post_type'              => 'post',
        'post_status'            => 'publish',
        'ignore_sticky_posts'    => 1,
        'no_found_rows'          => true,
        'fields'                 => 'ids',
        'post__not_in'           => [$post_id],
        'update_post_meta_cache' => false,
        'update_post_term_cache' => false,
    ];

    $candidates = [];
    $merge_unique = static function (array $ids) use (&$candidates) {
        foreach ($ids as $id) {
            $id = absint($id);
            if ($id > 0 && !in_array($id, $candidates, true)) {
                $candidates[] = $id;
            }
        }
    };

    if ($cat_ids || $tag_ids) {
        $tax_query = ['relation' => 'OR'];
        if ($cat_ids) {
            $tax_query[] = [
                'taxonomy' => 'category',
                'field'    => 'term_id',
                'terms'    => $cat_ids,
            ];
        }
        if ($tag_ids) {
            $tax_query[] = [
                'taxonomy' => 'post_tag',
                'field'    => 'term_id',
                'terms'    => $tag_ids,
            ];
        }

        $related_query = new WP_Query(array_merge($base_args, [
            'posts_per_page' => 18,
            'tax_query'      => $tax_query,
            'meta_key'       => 'post_views',
            'meta_type'      => 'NUMERIC',
            'orderby'        => [
                'meta_value_num' => 'DESC',
                'comment_count'  => 'DESC',
                'date'           => 'DESC',
            ],
        ]));
        $merge_unique($related_query->posts);
        wp_reset_postdata();
    }

    $fallback_query = new WP_Query(array_merge($base_args, [
        'posts_per_page' => 18,
        'date_query'     => [
            [
                'after'     => '18 months ago',
                'inclusive' => true,
            ],
        ],
        'meta_key'       => 'post_views',
        'meta_type'      => 'NUMERIC',
        'orderby'        => [
            'meta_value_num' => 'DESC',
            'comment_count'  => 'DESC',
            'date'           => 'DESC',
        ],
    ]));
    $merge_unique($fallback_query->posts);
    wp_reset_postdata();

    $candidates = array_slice($candidates, 0, 24);
    set_transient($cache_key, $candidates, DAY_IN_SECONDS);

    return $candidates;
}

/* ==========================================================================
   注册 AJAX 动作
   ========================================================================== */

// 用户认证相关
add_action('wp_ajax_westlife_ajax_login', 'westlife_ajax_login');
add_action('wp_ajax_nopriv_westlife_ajax_login', 'westlife_ajax_login');

add_action('wp_ajax_westlife_forgot_password', 'westlife_forgot_password_handler');
add_action('wp_ajax_nopriv_westlife_forgot_password', 'westlife_forgot_password_handler');

add_action('wp_ajax_westlife_refresh_nonce', 'westlife_refresh_nonce');
add_action('wp_ajax_nopriv_westlife_refresh_nonce', 'westlife_refresh_nonce');

// 内容加载相关
add_action('wp_ajax_westlife_load_category_posts', 'westlife_load_category_posts');
add_action('wp_ajax_nopriv_westlife_load_category_posts', 'westlife_load_category_posts');

add_action('wp_ajax_westlife_load_random_related', 'westlife_load_random_related');
add_action('wp_ajax_nopriv_westlife_load_random_related', 'westlife_load_random_related');

// 友链管理相关
add_action('wp_ajax_westlife_submit_friend_link', 'westlife_submit_friend_link');
add_action('wp_ajax_nopriv_westlife_submit_friend_link', 'westlife_submit_friend_link');

add_action('wp_ajax_westlife_check_link_head', 'westlife_check_link_head');
add_action('wp_ajax_nopriv_westlife_check_link_head', 'westlife_check_link_head');
add_action('wp_ajax_westlife_check_links_simple', 'westlife_check_links_simple');
add_action('wp_ajax_nopriv_westlife_check_links_simple', 'westlife_check_links_simple');

// 交互功能相关
add_action('wp_ajax_westlife_react', 'westlife_ajax_react');
add_action('wp_ajax_nopriv_westlife_react', 'westlife_ajax_react');

// 状态检测相关
add_action('wp_ajax_westlife_admin_status', 'westlife_ajax_admin_status');
add_action('wp_ajax_nopriv_westlife_admin_status', 'westlife_ajax_admin_status');

add_action('wp_ajax_westlife_edit_comment', 'westlife_edit_comment');
add_action('wp_ajax_nopriv_westlife_edit_comment', 'westlife_edit_comment');

// 统计相关（需要 inc-stats.php 支持）
add_action('wp_ajax_westlife_update_visit_count', 'westlife_ajax_update_visit_count');
add_action('wp_ajax_nopriv_westlife_update_visit_count', 'westlife_ajax_update_visit_count');

/* ==========================================================================
   归档页：按月获取文章列表（合并至全站 AJAX）
   ========================================================================== */

add_action('wp_ajax_westlife_archive_month_articles', 'westlife_archive_month_articles_handler');
add_action('wp_ajax_nopriv_westlife_archive_month_articles', 'westlife_archive_month_articles_handler');

function westlife_archive_month_articles_handler()
{
    // 统一全站请求与 nonce 验证
    if (!westlife_verify_ajax_request('westlife_archive_month_articles', 'POST', 'nonce', 'westlife_ajax_nonce')) {
        return; // 已输出错误
    }

    $year  = isset($_POST['year']) ? intval($_POST['year']) : 0;
    $month = isset($_POST['month']) ? intval($_POST['month']) : 0;
    if ($year < 1970 || $month < 1 || $month > 12) {
        wp_send_json_error(['message' => 'Invalid parameters'], 400);
    }

    try {
        $articles = westlife_get_articles_by_month($year, $month);
        wp_send_json_success($articles);
    } catch (Throwable $e) {
        wp_send_json_error(['message' => 'Server error'], 500);
    }
}

// 工具：按年月获取文章（仅 post）
if (!function_exists('westlife_get_articles_by_month')) {
    function westlife_get_articles_by_month($year, $month)
    {
        $query = new WP_Query([
            'post_type'           => 'post',
            'post_status'         => 'publish',
            'posts_per_page'      => -1,
            'date_query'          => [['year' => $year, 'month' => $month]],
            'orderby'             => 'date',
            'order'               => 'DESC',
            'no_found_rows'       => true,
            'ignore_sticky_posts' => true,
        ]);

        $articles = [];
        if ($query->have_posts()) {
            while ($query->have_posts()) {
                $query->the_post();
                $categories = get_the_category();
                $category_name = !empty($categories) ? $categories[0]->name : '未分类';
                $excerpt = get_the_excerpt();
                if (empty($excerpt)) {
                    $excerpt = wp_trim_words(wp_strip_all_tags(get_the_content('')), 20, '…');
                }
                $articles[] = [
                    'id'            => get_the_ID(),
                    'title'         => get_the_title(),
                    'date'          => get_the_date('Y-m-d'),
                    'permalink'     => get_permalink(),
                    'category'      => $category_name,
                    'excerpt'       => $excerpt,
                    'author'        => get_the_author(),
                    'comment_count' => intval(get_comments_number()),
                ];
            }
        }
        wp_reset_postdata();
        return $articles;
    }
}

/* ==========================================================================
   小鸟投喂计数接口
   ========================================================================== */

if (!function_exists('westlife_get_default_bird_state')) {
    function westlife_get_default_bird_state()
    {
        return [
            'feed_total' => 0,
            'feed_today' => 0,
            'last_feed_at' => '',
            'last_feed_date' => '',
            'streak_days' => 0,
            'closeness' => 0,
            'mood' => 'curious',
            'stage' => 'nestling',
            'stage_label' => '雏鸟',
            'next_stage_score' => 10,
        ];
    }
}

if (!function_exists('westlife_get_bird_stage_definitions')) {
    function westlife_get_bird_stage_definitions()
    {
        return [
            ['slug' => 'nestling', 'label' => '雏鸟', 'min' => 0, 'next' => 10],
            ['slug' => 'perching', 'label' => '栖枝', 'min' => 10, 'next' => 25],
            ['slug' => 'chirpy', 'label' => '啾啾', 'min' => 25, 'next' => 45],
            ['slug' => 'trusted', 'label' => '亲近', 'min' => 45, 'next' => 70],
            ['slug' => 'companion', 'label' => '同行', 'min' => 70, 'next' => null],
        ];
    }
}

if (!function_exists('westlife_resolve_bird_stage')) {
    function westlife_resolve_bird_stage($closeness)
    {
        $closeness = max(0, (int) $closeness);
        $defs = westlife_get_bird_stage_definitions();
        $current = $defs[0];

        foreach ($defs as $def) {
            if ($closeness >= (int) $def['min']) {
                $current = $def;
            }
        }

        return [
            'slug' => $current['slug'],
            'label' => $current['label'],
            'next_stage_score' => isset($current['next']) ? $current['next'] : null,
        ];
    }
}

if (!function_exists('westlife_resolve_bird_mood')) {
    function westlife_resolve_bird_mood($state)
    {
        $feed_today = max(0, (int) ($state['feed_today'] ?? 0));
        $streak_days = max(0, (int) ($state['streak_days'] ?? 0));
        $closeness = max(0, (int) ($state['closeness'] ?? 0));

        if ($feed_today >= 6) {
            return 'excited';
        }
        if ($streak_days >= 7) {
            return 'attached';
        }
        if ($closeness >= 45) {
            return 'happy';
        }
        if ($feed_today >= 2) {
            return 'warmed';
        }

        return 'curious';
    }
}

if (!function_exists('westlife_get_bird_state_option_key')) {
    function westlife_get_bird_state_option_key()
    {
        return 'westlife_bird_state';
    }
}

if (!function_exists('westlife_normalize_bird_state')) {
    function westlife_normalize_bird_state($state)
    {
        $state = wp_parse_args(is_array($state) ? $state : [], westlife_get_default_bird_state());
        $today = wp_date('Y-m-d', current_time('timestamp'), wp_timezone());
        if (($state['last_feed_date'] ?? '') !== $today) {
            $state['feed_today'] = 0;
        }

        $state['feed_total'] = max(0, (int) ($state['feed_total'] ?? 0));
        $state['feed_today'] = max(0, (int) ($state['feed_today'] ?? 0));
        $state['streak_days'] = max(0, (int) ($state['streak_days'] ?? 0));
        $state['closeness'] = max(0, (int) ($state['closeness'] ?? 0));

        $stage = westlife_resolve_bird_stage($state['closeness']);
        $state['stage'] = $stage['slug'];
        $state['stage_label'] = $stage['label'];
        $state['next_stage_score'] = $stage['next_stage_score'];
        $state['mood'] = westlife_resolve_bird_mood($state);

        return $state;
    }
}

if (!function_exists('westlife_get_bird_state')) {
    function westlife_get_bird_state()
    {
        return westlife_normalize_bird_state(get_option(westlife_get_bird_state_option_key(), []));
    }
}

if (!function_exists('westlife_save_bird_state')) {
    function westlife_save_bird_state($state)
    {
        $state = westlife_normalize_bird_state($state);
        update_option(westlife_get_bird_state_option_key(), $state, false);
        return $state;
    }
}

if (!function_exists('westlife_get_bird_status_message')) {
    function westlife_get_bird_status_message($state)
    {
        $stage_label = $state['stage_label'] ?? '雏鸟';
        $mood = $state['mood'] ?? 'curious';
        $closeness = max(0, (int) ($state['closeness'] ?? 0));
        $feed_today = max(0, (int) ($state['feed_today'] ?? 0));
        $streak_days = max(0, (int) ($state['streak_days'] ?? 0));

        switch ($mood) {
            case 'excited':
                return "吃得很开心，今天已经投喂 {$feed_today} 次了。";
            case 'attached':
                return "连续陪伴 {$streak_days} 天，小鸟已经把你当熟人了。";
            case 'happy':
                return "亲密度 {$closeness}，已经进入「{$stage_label}」阶段。";
            case 'warmed':
                return "状态回暖了，再喂几次会更亲近。";
            default:
                return "小鸟记住你了，亲密度现在是 {$closeness}。";
        }
    }
}

if (!function_exists('westlife_feed_bird_state')) {
    function westlife_feed_bird_state()
    {
        $state = westlife_get_bird_state();
        $today = wp_date('Y-m-d', current_time('timestamp'), wp_timezone());
        $yesterday = wp_date('Y-m-d', strtotime('-1 day', current_time('timestamp')), wp_timezone());

        if (($state['last_feed_date'] ?? '') !== $today) {
            $state['feed_today'] = 0;
            if (($state['last_feed_date'] ?? '') === $yesterday) {
                $state['streak_days'] = max(1, (int) ($state['streak_days'] ?? 0) + 1);
            } else {
                $state['streak_days'] = 1;
            }
        } elseif (empty($state['streak_days'])) {
            $state['streak_days'] = 1;
        }

        $state['feed_total'] = max(0, (int) ($state['feed_total'] ?? 0) + 1);
        $state['feed_today'] = max(0, (int) ($state['feed_today'] ?? 0) + 1);
        $state['closeness'] = max(0, (int) ($state['closeness'] ?? 0) + 1);
        $state['last_feed_at'] = wp_date('Y-m-d H:i:s', current_time('timestamp'), wp_timezone());
        $state['last_feed_date'] = $today;

        $state = westlife_save_bird_state($state);
        $state['message'] = westlife_get_bird_status_message($state);

        return $state;
    }
}

function westlife_bird_feed_handler()
{
    if (!empty($_POST['nonce']) && !wp_verify_nonce($_POST['nonce'], 'westlife_ajax_nonce')) {
        wp_send_json_error(['message' => '安全验证失败']);
    }
    $state = westlife_feed_bird_state();

    if (function_exists('westlife_track_visitor_profile_event')) {
        westlife_track_visitor_profile_event('bird_feed', [
            'email' => sanitize_email($_POST['email'] ?? ''),
            'name' => sanitize_text_field($_POST['name'] ?? ''),
            'url' => esc_url_raw($_POST['url'] ?? ''),
            'delta' => 1,
        ]);
    }

    wp_send_json_success([
        'total' => (int) ($state['feed_total'] ?? 0),
        'state' => [
            'feed_total' => (int) ($state['feed_total'] ?? 0),
            'feed_today' => (int) ($state['feed_today'] ?? 0),
            'streak_days' => (int) ($state['streak_days'] ?? 0),
            'closeness' => (int) ($state['closeness'] ?? 0),
            'mood' => (string) ($state['mood'] ?? 'curious'),
            'stage' => (string) ($state['stage'] ?? 'nestling'),
            'stage_label' => (string) ($state['stage_label'] ?? '雏鸟'),
            'next_stage_score' => isset($state['next_stage_score']) ? (int) $state['next_stage_score'] : null,
            'message' => (string) ($state['message'] ?? '谢谢投喂！'),
        ],
    ]);
}
add_action('wp_ajax_westlife_bird_feed', 'westlife_bird_feed_handler');
add_action('wp_ajax_nopriv_westlife_bird_feed', 'westlife_bird_feed_handler');
