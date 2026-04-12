<!--
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
░████▒█▒▒█▒▄██▄▒█▒▒█▒▒███▒▒█▒▒█▒████░
░█▒▒▒▒█▒▒█▒█▒▒▒▒█▒█▒▒▒█▒▒█▒█▒▒█▒█▒▒▒░
░████▒█▒▒█▒█▒▒▒▒██▒▒▒▒████▒█▒▒█▒█▒██░
░█▒▒▒▒█▒▒█▒█▒▒▒▒█▒█▒▒▒█▒▒█▒█▒▒█▒█▒▒█░
░█▒▒▒▒▒██▒▒▀██▀▒█▒▒█▒▒███▒▒▒██▒▒████░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░           
XIFENG.NET @2025░░WORDPRESS WESTLITE THEME░░░░░░░░░░░░░░░
░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░
-->
<!DOCTYPE html>
<?php $wl_anim_on = (bool) get_option('westlife_enable_animations', true); ?>
<html <?php language_attributes(); ?> data-theme="system" <?php echo $wl_anim_on ? '' : 'data-animations="off"'; ?>>

<head>
    <meta charset="<?php bloginfo('charset'); ?>">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- SEO meta 已通过 wp_head 钩子 (inc/inc-seo.php) 输出，防止重复调用 -->
    <?php if (!$wl_anim_on): ?>
        <style id="westlife-disable-animations">
            /* 关闭全站过渡与动画，提升性能 */
            [data-animations="off"] *,
            [data-animations="off"] *::before,
            [data-animations="off"] *::after {
                -webkit-animation: none !important;
                animation: none !important;
                -webkit-transition: none !important;
                transition: none !important;
                scroll-behavior: auto !important;
            }
        </style>
    <?php endif; ?>
    <?php wp_head(); ?>
    <?php
    // 全局主色：用于注入 CSS 变量（需要在样式表之后注入以覆盖默认变量值）
    // 主题默认主色更新为 #3368d9，兼容历史未保存设置站点
    $wl_primary = get_option('westlife_primary_color', '#3368d9');
    $wl_primary = $wl_primary ?: '#3368d9';
    // 计算 RGB
    $hex = ltrim($wl_primary, '#');
    if (strlen($hex) === 3) {
        $hex = $hex[0] . $hex[0] . $hex[1] . $hex[1] . $hex[2] . $hex[2];
    }
    $r = hexdec(substr($hex, 0, 2));
    $g = hexdec(substr($hex, 2, 2));
    $b = hexdec(substr($hex, 4, 2));
    ?>
    <style id="westlife-primary-color">
        :root {
            --primary-color: <?php echo esc_html($wl_primary); ?>;
            --primary-color-rgb: <?php echo esc_html("$r, $g, $b"); ?>;
            /* 兼容旧样式变量名 */
            --color-primary: <?php echo esc_html($wl_primary); ?>;
            --color-primary-rgb: <?php echo esc_html("$r, $g, $b"); ?>;
        }
    </style>
    <style id="westlife-header-compass-spin">
        /* 固定头部指南针旋转速度，避免被页面样式覆盖 */
        .site-header .site-menu-toggle .wl-icon.is-spin,
        .site-header .site-menu-toggle .is-spin,
        .site-header .site-menu-toggle .lucide.is-spin {
            animation-duration: 2s !important;
            animation-timing-function: linear !important;
            animation-iteration-count: infinite !important;
        }
    </style>
    <script id="westlife-initial-theme" data-inline>
        (function() {
            var d = document.documentElement;
            try {
                // 兼容旧 key 'theme' 与新 key 'theme-mode'
                var stored = localStorage.getItem('theme-mode') || localStorage.getItem('theme');
                var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
                var mode = stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system';
                var finalTheme = mode === 'system' ? (prefersDark ? 'dark' : 'light') : mode;
                d.setAttribute('data-theme', finalTheme);
                d.setAttribute('data-theme-mode', mode);
            } catch (_) {}
        })();
    </script>
</head>

<body <?php body_class(); ?>>
    <?php wp_body_open(); ?>
    <?php if (get_option('westlife_enable_page_loader', false)) : ?>
        <div class="page-loader">
            <?php echo westlife_lucide_icon('fa-compass', ['class' => 'loader']); ?>
            <div class="loader-progress">0</div>
        </div>
    <?php endif; ?>

    <header id="masthead" class="site-header">
        <div class="header-inner">
            <div class="header-content">
                <div class="header-wrapper">
                    <!-- 站点菜单 -->
                    <div class="site-menu-wrapper">
                        <button class="site-menu-toggle"
                            aria-label="<?php esc_attr_e('站点菜单', 'westlife'); ?>"
                            aria-expanded="false">
                            <?php echo westlife_lucide_icon('fa-solid fa-compass fa-spin'); ?>
                        </button>
                    </div>

                    <!-- LOGO或站点信息 -->
                    <div class="site-branding">
                        <?php
                        $mode = get_option('site_branding_mode', 'logo'); // 'logo' | 'text'
                        $home = esc_url(home_url('/'));
                        $site_name = get_bloginfo('name');

                        // 新：读取亮/暗 Logo（兼容旧字段做亮色回退）
                        $logo_light = esc_url(get_option('site_brand_logo_light', get_option('site_brand_logo')));
                        $logo_dark  = esc_url(get_option('site_brand_logo_dark'));
                        $has_dual   = (!empty($logo_light) && !empty($logo_dark));

                        if ($mode === 'logo') {
                            if (!empty($logo_light) || !empty($logo_dark)) {
                                $link_classes = 'custom-logo-link' . ($has_dual ? ' has-dual-logo' : '');
                                echo '<a href="' . $home . '" class="' . $link_classes . '" rel="home" aria-label="' . esc_attr($site_name) . '">';
                                if (!empty($logo_light)) {
                                    echo '<img class="custom-logo logo--light" src="' . $logo_light . '" alt="' . esc_attr($site_name) . '" decoding="async" />';
                                }
                                if (!empty($logo_dark)) {
                                    echo '<img class="custom-logo logo--dark" src="' . $logo_dark . '" alt="' . esc_attr($site_name) . '" decoding="async" />';
                                }
                                echo '</a>';
                            } elseif (has_custom_logo()) {
                                the_custom_logo();
                            } else {
                                echo '<div class="site-title-wrapper">';
                                echo '  <h1 class="site-title"><a href="' . $home . '">' . esc_html($site_name) . '</a></h1>';
                                echo '</div>';
                            }
                        } else {
                            // 文字模式
                            echo '<div class="site-title-wrapper">';
                            echo '  <h1 class="site-title"><a href="' . $home . '">' . esc_html($site_name) . '</a></h1>';
                            echo '</div>';
                        }
                        ?>
                    </div>

                    <!-- 主导航 -->
                    <nav class="main-navigation" id="site-navigation">
                        <?php
                        wp_nav_menu([
                            'theme_location' => 'primary',
                            'menu_id'        => 'primary-menu',
                            'container'      => false,
                            'menu_class'     => 'nav-menu',
                            'fallback_cb'    => function () {
                                echo '<ul class="nav-menu"><li><a href="' . esc_url(admin_url('nav-menus.php')) . '">请设置主菜单</a></li></ul>';
                            }
                        ]);
                        ?>
                    </nav>

                    <!-- 工具栏 -->
                    <div class="header-tools">
                        <div class="tool-group">
                            <!-- 搜索按钮 / 紧凑输入（改用 label 包裹 + 快捷键提示） -->
                            <div class="search-wrapper">
                                <form role="search" method="get" class="search-form search-form--compact" action="<?php echo esc_url(home_url('/')); ?>">
                                    <?php
                                    // 判断平台显示快捷键提示（Mac: ⌘K 其它: Ctrl K）
                                    $is_mac = isset($_SERVER['HTTP_USER_AGENT']) && stripos($_SERVER['HTTP_USER_AGENT'], 'Mac') !== false;
                                    $shortcut_text = $is_mac ? '⌘K' : 'Ctrl K';
                                    // 占位符不再包含快捷键提示，仅显示“搜索”
                                    $ph = '搜索';
                                    ?>
                                    <label class="wl-search-label">
                                        <input type="search"
                                            class="wl-search-input"
                                            placeholder="<?php echo esc_attr($ph); ?>"
                                            value="<?php echo esc_attr(get_search_query()); ?>"
                                            name="s"
                                            aria-label="<?php esc_attr_e('站内搜索', 'westlife'); ?>"
                                            autocomplete="off" />
                                        <span class="wl-search-shortcut<?php echo $is_mac ? ' is-mac' : ''; ?>" aria-hidden="true"><?php echo esc_html($shortcut_text); ?></span>
                                    </label>
                                    <button type="submit" class="wl-search-submit sr-only">Search</button>
                                </form>
                            </div>

                            <!-- 用户头像/登录按钮 -->
                            <?php if (is_user_logged_in()): ?>
                                <?php $current_user = wp_get_current_user(); ?>
                                <div class="user-profile">
                                    <button class="tool-button user-avatar" aria-label="<?php esc_attr_e('用户菜单', 'westlife'); ?>">
                                        <span class="icon-swap" aria-hidden="true">
                                            <span class="avatar-default icon-default"><?php echo get_avatar($current_user->ID, 32); ?></span>
                                            <?php echo westlife_lucide_icon('fa-solid fa-right-from-bracket', ['class' => 'icon-hover']); ?>
                                        </span>
                                    </button>
                                    <div class="user-dropdown">
                                        <div class="user-info-line">
                                            <?php $wl_nickname = get_user_meta($current_user->ID, 'nickname', true); ?>
                                            <span class="user-name"><?php echo esc_html($wl_nickname ?: $current_user->display_name); ?></span>
                                            <?php
                                            $role_key = $current_user->roles[0] ?? '';
                                            $role_map = [
                                                'administrator' => __('管理员', 'westlife'),
                                                'editor' => __('编辑', 'westlife'),
                                                'author' => __('作者', 'westlife'),
                                                'contributor' => __('投稿者', 'westlife'),
                                                'subscriber' => __('订阅者', 'westlife')
                                            ];
                                            $role_label = $role_map[$role_key] ?? __('用户', 'westlife');
                                            ?>
                                            <span class="user-role-badge role-<?php echo esc_attr($role_key); ?>"><?php echo esc_html($role_label); ?></span>
                                        </div>
                                        <div class="user-links">
                                            <?php if (current_user_can('manage_options')): ?>
                                                <a href="<?php echo esc_url(admin_url()); ?>" class="user-link">
                                                    <?php echo westlife_lucide_icon('fa-solid fa-gauge-high'); ?> <?php _e('管理后台', 'westlife'); ?>
                                                </a>
                                            <?php endif; ?>
                                            <?php if (current_user_can('customize')): ?>
                                                <a href="<?php echo esc_url(admin_url('admin.php?page=westlife-settings')); ?>" class="user-link">
                                                    <?php echo westlife_lucide_icon('fa-solid fa-sliders'); ?> <?php _e('主题设置', 'westlife'); ?>
                                                </a>
                                            <?php endif; ?>
                                            <?php if (current_user_can('publish_posts')): ?>
                                                <a href="<?php echo esc_url(admin_url('post-new.php')); ?>" class="user-link">
                                                    <?php echo westlife_lucide_icon('fa-solid fa-pen-to-square'); ?> <?php _e('发布文章', 'westlife'); ?>
                                                </a>
                                            <?php endif; ?>
                                            <a href="<?php echo esc_url(admin_url('profile.php')); ?>" class="user-link">
                                                <?php echo westlife_lucide_icon('fa-solid fa-id-card'); ?> <?php _e('编辑资料', 'westlife'); ?>
                                            </a>
                                            <?php if (current_user_can('list_users')): ?>
                                                <a href="<?php echo esc_url(admin_url('edit-comments.php')); ?>" class="user-link">
                                                    <?php echo westlife_lucide_icon('fa-solid fa-comments'); ?> <?php _e('查看评论', 'westlife'); ?>
                                                </a>
                                            <?php endif; ?>

                                        </div>
                                    </div>
                                </div>
                                <!-- 登出确认弹层（点击头像红色退出图标后出现） -->
                                <div class="logout-confirm" role="dialog" aria-modal="true" aria-hidden="true" aria-labelledby="logoutConfirmTitle" aria-describedby="logoutConfirmDesc">
                                    <div class="logout-confirm-inner logout-card">
                                        <div class="logout-card-header">
                                            <div class="logout-card-icon" aria-hidden="true">
                                                <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                                                    <path d="M12 9v3.75M2.697 16.126c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                                                </svg>
                                            </div>
                                            <div class="logout-card-content">
                                                <h3 id="logoutConfirmTitle" class="logout-card-title"><?php _e('退出账号', 'westlife'); ?></h3>
                                                <p id="logoutConfirmDesc" class="logout-card-message"><?php _e('确认要退出当前登录？此操作可随时重新登录。', 'westlife'); ?></p>
                                            </div>
                                        </div>
                                        <div class="logout-card-actions">
                                            <a href="<?php echo esc_url(wp_logout_url(home_url())); ?>" class="btn-logout-confirm" data-final-exit><?php _e('退出登录', 'westlife'); ?></a>
                                            <button type="button" class="btn-logout-cancel"><?php _e('取消', 'westlife'); ?></button>
                                        </div>
                                    </div>
                                </div>
                            <?php else: ?>
                                <button class="tool-button login-button" title="<?php esc_attr_e('登录', 'westlife'); ?>" data-modal="login">
                                    <span class="icon-swap" aria-hidden="true">
                                        <?php echo westlife_lucide_icon('fa-solid fa-user', ['class' => 'icon-default']); ?>
                                        <?php echo westlife_lucide_icon('fa-solid fa-right-to-bracket', ['class' => 'icon-hover']); ?>
                                    </span>
                                </button>
                                <!-- 登录模态框内容 -->
                                <div class="login-modal" aria-hidden="true">
                                    <div class="login-modal-inner">
                                        <div class="login-header">
                                            <h3 class="modal-title"><?php _e('登录', 'westlife'); ?></h3>
                                            <button class="modal-close" aria-label="<?php esc_attr_e('关闭', 'westlife'); ?>">
                                                <?php echo westlife_lucide_icon('fa-solid fa-xmark'); ?>
                                            </button>
                                        </div>

                                        <div class="login-content">
                                            <!-- 登录表单 -->
                                            <form class="login-form" method="post">
                                                <div class="form-group">
                                                    <label for="username"><?php _e('用户名或邮箱', 'westlife'); ?></label>
                                                    <input type="text" id="username" name="log" required autocomplete="username">
                                                </div>

                                                <div class="form-group">
                                                    <label for="password"><?php _e('密码', 'westlife'); ?></label>
                                                    <div class="password-input">
                                                        <input type="password" id="password" name="pwd" required autocomplete="current-password">
                                                        <button type="button" class="toggle-password">
                                                            <?php echo westlife_lucide_icon('fa-regular fa-eye'); ?>
                                                        </button>
                                                    </div>
                                                </div>

                                                <div class="form-check">
                                                    <label>
                                                        <input type="checkbox" name="rememberme" value="forever">
                                                        <span><?php _e('记住我', 'westlife'); ?></span>
                                                    </label>
                                                    <a class="forgot-password" id="showForgotForm" style="cursor:pointer;">
                                                        <?php _e('忘记密码？', 'westlife'); ?>
                                                    </a>
                                                </div>

                                                <?php wp_nonce_field('westlife_ajax_nonce', 'login_nonce'); ?>
                                                <span class="sr-only visually-hidden login-status-live" aria-live="polite" aria-atomic="true"></span>
                                                <button type="submit" class="submit-btn">
                                                    <span class="btn-text"><?php _e('登录', 'westlife'); ?></span>
                                                    <span class="loading-icon u-hidden"><!-- migrated: inline display:none -> u-hidden -->
                                                        <?php echo westlife_lucide_icon('fa-solid fa-circle-notch fa-spin'); ?>
                                                    </span>
                                                </button>
                                            </form>

                                            <!-- 找回密码表单 -->
                                            <form class="forgot-form" method="post">
                                                <div class="form-group">
                                                    <label for="user_login"><?php _e('用户名或邮箱', 'westlife'); ?></label>
                                                    <input type="text" name="user_login" id="user_login" required>
                                                </div>

                                                <?php wp_nonce_field('westlife_ajax_nonce', 'forget_nonce'); ?>
                                                <span class="sr-only visually-hidden forgot-status-live" aria-live="polite" aria-atomic="true"></span>
                                                <button type="submit" class="submit-btn">
                                                    <span class="btn-text"><?php _e('重置密码', 'westlife'); ?></span>
                                                    <span class="loading-icon u-hidden"><!-- migrated: inline display:none -> u-hidden -->
                                                        <?php echo westlife_lucide_icon('fa-solid fa-circle-notch fa-spin'); ?>
                                                    </span>
                                                </button>

                                                <div class="login-footer">
                                                    <a class="back-to-login" id="backToLogin" style="cursor:pointer;">
                                                        <?php echo westlife_lucide_icon('fa-solid fa-arrow-left'); ?>
                                                        <?php _e('返回登录', 'westlife'); ?>
                                                    </a>
                                                </div>
                                            </form>

                                            <div class="login-footer social-signup-placeholder">
                                                <p class="social-hint">
                                                    <?php _e('使用第三方账号快速登录 / 注册', 'westlife'); ?>
                                                </p>
                                                <div class="social-login-buttons" aria-label="<?php esc_attr_e('社交账号登录', 'westlife'); ?>">
                                                    <!-- Google 按钮 -->
                                                    <button type="button" class="social-btn social-btn--google" disabled aria-disabled="true" title="Google 登录（稍后可用）" data-provider="google">
                                                        <span class="social-icon" aria-hidden="true">
                                                            <!-- Google full color logo (统一 20x20) -->
                                                            <svg version="1.1" viewBox="0 0 512 512" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                                                                <path style="fill:#FBBB00;" d="M113.47,309.408L95.648,375.94l-65.139,1.378C11.042,341.211,0,299.9,0,256 c0-42.451,10.324-82.483,28.624-117.732h0.014l57.992,10.632l25.404,57.644c-5.317,15.501-8.215,32.141-8.215,49.456 C103.821,274.792,107.225,292.797,113.47,309.408z" />
                                                                <path style="fill:#518EF8;" d="M507.527,208.176C510.467,223.662,512,239.655,512,256c0,18.328-1.927,36.206-5.598,53.451 c-12.462,58.683-45.025,109.925-90.134,146.187l-0.014-0.014l-73.044-3.727l-10.338-64.535 c29.932-17.554,53.324-45.025,65.646-77.911h-136.89V208.176h138.887L507.527,208.176L507.527,208.176z" />
                                                                <path style="fill:#28B446;" d="M416.253,455.624l0.014,0.014C372.396,490.901,316.666,512,256,512 c-97.491,0-182.252-54.491-225.491-134.681l82.961-67.91c21.619,57.698,77.278,98.771,142.53,98.771 c28.047,0,54.323-7.582,76.87-20.818L416.253,455.624z" />
                                                                <path style="fill:#F14336;" d="M419.404,58.936l-82.933,67.896c-23.335-14.586-50.919-23.012-80.471-23.012 c-66.729,0-123.429,42.957-143.965,102.724l-83.397-68.276h-0.014C71.23,56.123,157.06,0,256,0 C318.115,0,375.068,22.126,419.404,58.936z" />
                                                            </svg>
                                                        </span>
                                                        <span class="social-text">Google</span>
                                                    </button>
                                                    <!-- GitHub 按钮 -->
                                                    <button type="button" class="social-btn social-btn--github" disabled aria-disabled="true" title="GitHub 登录（稍后可用）" data-provider="github">
                                                        <span class="social-icon" aria-hidden="true">
                                                            <!-- GitHub logo (提供版本缩放至 20x20) -->
                                                            <svg class="icon" viewBox="0 0 1049 1024" width="20" height="20" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
                                                                <path fill="#191717" d="M524.979332 0C234.676191 0 0 234.676191 0 524.979332c0 232.068678 150.366597 428.501342 358.967656 498.035028 26.075132 5.215026 35.636014-11.299224 35.636014-25.205961 0-12.168395-0.869171-53.888607-0.869171-97.347161-146.020741 31.290159-176.441729-62.580318-176.441729-62.580318-23.467619-60.841976-58.234462-76.487055-58.234463-76.487055-47.804409-32.15933 3.476684-32.15933 3.476685-32.15933 53.019436 3.476684 80.83291 53.888607 80.83291 53.888607 46.935238 79.963739 122.553122 57.365291 152.97411 43.458554 4.345855-33.897672 18.252593-57.365291 33.028501-70.402857-116.468925-12.168395-239.022047-57.365291-239.022047-259.012982 0-57.365291 20.860106-104.300529 53.888607-140.805715-5.215026-13.037566-23.467619-66.926173 5.215027-139.067372 0 0 44.327725-13.906737 144.282399 53.888607 41.720212-11.299224 86.917108-17.383422 131.244833-17.383422s89.524621 6.084198 131.244833 17.383422C756.178839 203.386032 800.506564 217.29277 800.506564 217.29277c28.682646 72.1412 10.430053 126.029806 5.215026 139.067372 33.897672 36.505185 53.888607 83.440424 53.888607 140.805715 0 201.64769-122.553122 245.975415-239.891218 259.012982 19.121764 16.514251 35.636014 47.804409 35.636015 97.347161 0 70.402857-0.869171 126.898978-0.869172 144.282399 0 13.906737 9.560882 30.420988 35.636015 25.205961 208.601059-69.533686 358.967656-265.96635 358.967655-498.035028C1049.958663 234.676191 814.413301 0 524.979332 0z" />
                                                                <path fill="#191717" d="M199.040177 753.571326c-0.869171 2.607513-5.215026 3.476684-8.691711 1.738342s-6.084198-5.215026-4.345855-7.82254c0.869171-2.607513 5.215026-3.476684 8.691711-1.738342s5.215026 5.215026 4.345855 7.82254z m-6.953369-4.345856M219.900283 777.038945c-2.607513 2.607513-7.82254 0.869171-10.430053-2.607514-3.476684-3.476684-4.345855-8.691711-1.738342-11.299224 2.607513-2.607513 6.953369-0.869171 10.430053 2.607514 3.476684 4.345855 4.345855 9.560882 1.738342 11.299224z m-5.215026-5.215027M240.760389 807.459932c-3.476684 2.607513-8.691711 0-11.299224-4.345855-3.476684-4.345855-3.476684-10.430053 0-12.168395 3.476684-2.607513 8.691711 0 11.299224 4.345855 3.476684 4.345855 3.476684 9.560882 0 12.168395z m0 0M269.443034 837.011749c-2.607513 3.476684-8.691711 2.607513-13.906737-1.738342-4.345855-4.345855-6.084198-10.430053-2.607513-13.037566 2.607513-3.476684 8.691711-2.607513 13.906737 1.738342 4.345855 3.476684 5.215026 9.560882 2.607513 13.037566z m0 0M308.555733 853.526c-0.869171 4.345855-6.953369 6.084198-13.037566 4.345855-6.084198-1.738342-9.560882-6.953369-8.691711-10.430053 0.869171-4.345855 6.953369-6.084198 13.037566-4.345855 6.084198 1.738342 9.560882 6.084198 8.691711 10.430053z m0 0M351.145116 857.002684c0 4.345855-5.215026 7.82254-11.299224 7.82254-6.084198 0-11.299224-3.476684-11.299224-7.82254s5.215026-7.82254 11.299224-7.82254c6.084198 0 11.299224 3.476684 11.299224 7.82254z m0 0M391.126986 850.049315c0.869171 4.345855-3.476684 8.691711-9.560882 9.560882-6.084198 0.869171-11.299224-1.738342-12.168395-6.084197-0.869171-4.345855 3.476684-8.691711 9.560881-9.560882 6.084198-0.869171 11.299224 1.738342 12.168396 6.084197z" />
                                                            </svg>
                                                        </span>
                                                        <span class="social-text">GitHub</span>
                                                    </button>
                                                </div>
                                                <p class="social-later-note">※ 社交登录即将开放，当前为占位样式。</p>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            <?php endif; ?>

                            <!-- 随机文章 -->
                            <a href="<?php echo wp_random_post_link(); ?>" class="tool-button random-post" title="<?php esc_attr_e('随机文章', 'westlife'); ?>">
                                <span class="rp-icon" aria-hidden="true"><?php echo westlife_lucide_icon('fa-solid fa-dice'); ?></span>
                                <span class="wl-loading-indicator" aria-hidden="true">
                                    <?php echo westlife_lucide_icon('fa-solid fa-circle-notch fa-spin'); ?>
                                </span>
                            </a>

                            <!-- 虫洞穿梭 -->
                            <a href="https://www.foreverblog.cn/go.html"
                                class="tool-button wormhole-link"
                                title="<?php esc_attr_e('虫洞穿梭', 'westlife'); ?>"
                                target="_blank"
                                rel="noopener">
                                <span class="icon-swap" aria-hidden="true">
                                    <?php echo westlife_lucide_icon('fa-solid fa-shuffle', ['class' => 'icon-default']); ?>
                                    <?php echo westlife_lucide_icon('fa-solid fa-train', ['class' => 'icon-hover']); ?>
                                </span>
                            </a>

                            <!-- 功能面板 -->
                            <button class="tool-button site-panel-toggle"
                                aria-haspopup="dialog"
                                aria-controls="site-panel"
                                title="<?php esc_attr_e('功能面板', 'westlife'); ?>">
                                <span class="icon-swap" aria-hidden="true">
                                    <?php echo westlife_lucide_icon('fa-solid fa-table-cells-large', ['class' => 'icon-default']); ?>
                                    <?php echo westlife_lucide_icon('fa-solid fa-table-columns', ['class' => 'icon-hover']); ?>
                                </span>
                            </button>

                            <!-- 主题切换 / 回到顶部 动态占位 -->
                            <div class="tool-button-slot" data-role="switch-progress-slot">
                                <?php if (get_option('westlife_enable_dark_mode', true)) : ?>
                                    <div class="theme-dropdown" data-theme-dropdown>
                                        <button class="tool-button theme-dropdown-toggle" type="button" aria-haspopup="menu" aria-expanded="false" aria-label="<?php esc_attr_e('主题模式：点击选择', 'westlife'); ?>">
                                            <span class="theme-icon-stack" aria-hidden="true">
                                                <span class="ti ti-sun" data-icon="light"><?php echo westlife_lucide_icon('fa-solid fa-sun'); ?></span>
                                                <span class="ti ti-moon" data-icon="dark"><?php echo westlife_lucide_icon('fa-solid fa-moon'); ?></span>
                                                <span class="ti ti-system" data-icon="system"><?php echo westlife_lucide_icon('fa-solid fa-desktop'); ?></span>
                                            </span>
                                            <span class="sr-only current-mode-text">system</span>
                                        </button>
                                        <div class="theme-dropdown-menu" role="menu" aria-label="<?php esc_attr_e('选择主题模式', 'westlife'); ?>">
                                            <button class="theme-option" data-set-theme="system" role="menuitemradio" aria-checked="true">
                                                <span class="option-icon"><?php echo westlife_lucide_icon('fa-solid fa-desktop'); ?></span>
                                                <span class="option-label"><?php esc_html_e('跟随系统', 'westlife'); ?></span>
                                            </button>
                                            <button class="theme-option" data-set-theme="light" role="menuitemradio" aria-checked="false">
                                                <span class="option-icon"><?php echo westlife_lucide_icon('fa-solid fa-sun'); ?></span>
                                                <span class="option-label"><?php esc_html_e('浅色模式', 'westlife'); ?></span>
                                            </button>
                                            <button class="theme-option" data-set-theme="dark" role="menuitemradio" aria-checked="false">
                                                <span class="option-icon"><?php echo westlife_lucide_icon('fa-solid fa-moon'); ?></span>
                                                <span class="option-label"><?php esc_html_e('深色模式', 'westlife'); ?></span>
                                            </button>
                                        </div>
                                    </div>
                                <?php else: ?>
                                    <!-- 暗色模式关闭：回到顶部改为右下角独立按钮 -->
                                <?php endif; ?>
                            </div>

                        </div>
                    </div>

                    <!-- 全屏搜索框 -->
                    <div class="search-modal" aria-hidden="true">
                        <div class="search-modal-inner">
                            <div class="modal-search-header">
                                <?php echo westlife_lucide_icon('fa-solid fa-magnifying-glass', ['class' => 'search-icon']); ?>
                                <form role="search" method="get" class="modal-search-form" action="<?php echo esc_url(home_url('/')); ?>">
                                    <input type="search"
                                        class="modal-search-field"
                                        placeholder="输入关键词搜索..."
                                        value="<?php echo get_search_query(); ?>"
                                        name="s"
                                        autocomplete="off">
                                </form>
                                <button type="button" class="search-close" aria-label="关闭搜索" title="关闭 (Esc)"><?php echo westlife_lucide_icon('fa-solid fa-xmark'); ?></button>
                            </div>
                            <?php // 样式与脚本已外置到 assets/css/header.css 与 assets/js/nav.js 中 
                            ?>

                        </div>
                    </div>
                </div>
    </header>

    <?php get_template_part('template-parts/content-panel'); ?>
