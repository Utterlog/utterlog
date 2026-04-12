<?php

/**
 * Footer
 */
?>
<footer class="site-footer">
    <div class="footer-content">
        <div class="footer-bottom">
            <div class="footer-inner">
                <?php
                // 仅当年
                $current_year = wp_date('Y', westlife_current_timestamp(), westlife_wp_timezone());

                // 备案信息
                $icp         = trim((string) get_option('footer_icp'));
                $icp_link    = trim((string) get_option('footer_icp_link'));
                $police      = trim((string) get_option('footer_police'));
                $police_link = trim((string) get_option('footer_police_link'));
                $icp_moe      = trim((string) get_option('footer_icp_moe'));
                $icp_moe_link = trim((string) get_option('footer_icp_moe_link'));
                if (!$icp_moe_link && $icp_moe && preg_match('/(\d{8})/', $icp_moe, $m)) {
                    $icp_moe_link = 'https://icp.gov.moe/?keyword=' . $m[1];
                }

                $legacy_icp_hide = get_option('footer_icp_hide', null);
                $stored_icp_mode = get_option('footer_icp_display_mode', null);
                if ($stored_icp_mode !== false && $stored_icp_mode !== null && $stored_icp_mode !== '') {
                    $icp_display_mode = (string) $stored_icp_mode;
                } elseif ($legacy_icp_hide !== null && $legacy_icp_hide !== false) {
                    $icp_display_mode = ((int) $legacy_icp_hide === 1) ? 'icon' : 'inline';
                } else {
                    $icp_display_mode = 'icon';
                }

                // 主题信息
                $theme = wp_get_theme();

                // 右侧信息图标配置（每行：label|icon_class|url|title）
                $icons_cfg_raw = (string) get_option('footer_info_icons');
                $icons = array();
                if (trim($icons_cfg_raw) !== '') {
                    foreach (explode("\n", $icons_cfg_raw) as $line) {
                        $parts = array_map('trim', explode('|', $line));
                        if (empty($parts[0]) || empty($parts[1])) continue;
                        $icons[] = array(
                            'label' => $parts[0],
                            'icon'  => $parts[1],
                            'url'   => $parts[2] ?? '',
                            'title' => $parts[3] ?? $parts[0],
                        );
                    }
                }
                if (empty($icons)) {
                    $icons = array(
                        array('label' => 'WordPress', 'icon' => 'blocks', 'url' => 'https://wordpress.org/', 'title' => 'WordPress 博客系统'),
                        array('label' => 'Theme', 'icon' => 'palette', 'url' => esc_url($theme->get('AuthorURI')), 'title' => '当前主题'),
                        array('label' => 'PHP', 'icon' => 'code-xml', 'url' => 'https://www.php.net/', 'title' => 'PHP 运行环境'),
                        array('label' => 'DB', 'icon' => 'database', 'url' => '#', 'title' => '数据库'),
                        array('label' => 'Cloud', 'icon' => 'cloud', 'url' => '#', 'title' => '云/存储'),
                    );
                }
                $icons = array_slice($icons, 0, 6);
                ?>
                <div class="footer-credits footer-credits--split">
                    <!-- 左：网站版权（仅当年） + 备案（更小更淡） + 状态绿点 -->
                    <div class="footer-left">
                        <div class="footer-meta-inline">
                            <div class="footer-copy">
                                © <?php echo esc_html($current_year); ?>
                                <span class="site-name-badge-wrapper">
                                    <a class="site-name-badge" href="<?php echo esc_url(home_url('/')); ?>">
                                        <?php echo esc_html(get_bloginfo('name')); ?>
                                    </a>
                                    <span class="site-name-tooltip">
                                        <p class="tooltip-title">Hello there! 👋</p>
                                        <p class="tooltip-text">彪悍的人生无需解释</p>
                                    </span>
                                </span>
                                All Rights Reserved.
                            </div>
                        <?php
                        // 总浏览量 & 最近访客来源（移到 footer-copy 下方，样式更小更弱化）
                        if (function_exists('westlife_get_total_views') && function_exists('westlife_get_latest_visitor_info')):
                            $total_views = westlife_get_total_views(false);
                            $visitor_info = westlife_get_latest_visitor_info();
                        ?>
                            <div class="footer-visitor-info">
                                <div class="total-views">
                                    <svg width="1.15em" height="1.15em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="views-icon" style="display: inline-block; vertical-align: -0.125em; width: 0.975em; height: 0.975em; margin-right: 0.25em;">
                                        <path d="M17 3.53516C18.1956 4.22677 19 5.51947 19 7.00004C19 8.48061 18.1956 9.77331 17 10.4649M21 20.7325C21.5978 20.3867 22 19.7403 22 19C22 17.5195 21.1956 16.2268 20 15.5352M14 7C14 9.20914 12.2091 11 10 11C7.79086 11 6 9.20914 6 7C6 4.79086 7.79086 3 10 3C12.2091 3 14 4.79086 14 7ZM6 15H14C16.2091 15 18 16.7909 18 19C18 20.1046 17.1046 21 16 21H4C2.89543 21 2 20.1046 2 19C2 16.7909 3.79086 15 6 15Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                                    </svg>
                                    总浏览量 <?php echo function_exists('westlife_format_number_short') ? westlife_format_number_short($total_views) : number_format_i18n(absint($total_views)); ?>
                                </div>
                                <?php if ($visitor_info): ?>
                                    <div class="recent-visitor">
                                        <svg width="1.15em" height="1.15em" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" class="visitor-icon" style="display: inline-block; vertical-align: -0.125em; width: 0.975em; height: 0.975em; margin-right: 0.25em;">
                                            <path d="M10.9984 4.87876V2.3042M15.8855 6.14698L17.4029 4.7401M4.87486 11.0023H2.30029M6.66833 6.6723L4.50335 4.50732M4.73619 17.4068L6.14307 15.8894M17.8689 16.1194C17.592 16.211 17.4535 16.2568 17.3285 16.3168C16.8842 16.5299 16.526 16.8881 16.3129 17.3324C16.2529 17.4574 16.2071 17.5959 16.1155 17.8728C15.6055 19.4151 15.3505 20.1863 15.1093 20.4888C14.2009 21.6281 12.4492 21.563 11.628 20.3593C11.41 20.0397 11.213 19.2517 10.819 17.6757L9.93491 14.1395C9.47306 12.2921 9.24214 11.3684 9.49424 10.7246C9.71428 10.1627 10.1588 9.71818 10.7207 9.49815C11.3645 9.24604 12.2882 9.47696 14.1356 9.93881L17.6718 10.8229C19.2478 11.2169 20.0358 11.4138 20.3554 11.6319C21.5591 12.4531 21.6242 14.2048 20.4849 15.1132C20.1824 15.3544 19.4112 15.6094 17.8689 16.1194Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                                        </svg>
                                        最近访客来自 <?php echo esc_html($visitor_info['city']); ?>, <?php echo !empty($visitor_info['country']) ? esc_html($visitor_info['country']) : esc_html($visitor_info['country_code']); ?>
                                        <?php if (!empty($visitor_info['country_code']) && function_exists('westlife_country_code_to_flag')): ?>
                                            <span class="country-flag"><?php echo westlife_country_code_to_flag($visitor_info['country_code'], $visitor_info['country'] ?: $visitor_info['country_code']); ?></span>
                                        <?php endif; ?>
                                    </div>
                                <?php endif; ?>
                            </div>
                        <?php endif; ?>
                        </div>
                    </div>

                    <!-- 右：环境/平台图标（后台可配置，最多 6 个） -->
                    <?php
                    if (empty($icons)) {
                        // 默认示例：保底 6 个
                        $theme_obj = wp_get_theme();
                        $theme_url = $theme_obj->get('ThemeURI') ?: $theme_obj->get('AuthorURI') ?: home_url('/');
                        $icons = array(
                            array('label' => 'Theme', 'icon' => 'palette', 'url' => esc_url($theme_url), 'title' => __('当前主题', 'westlife')),
                            array('label' => 'WordPress', 'icon' => 'blocks', 'url' => 'https://wordpress.org/', 'title' => 'WordPress'),
                            array('label' => 'PHP', 'icon' => 'code-xml', 'url' => 'https://www.php.net/', 'title' => 'PHP'),
                            array('label' => 'DB', 'icon' => 'database', 'url' => '#', 'title' => __('数据库', 'westlife')),
                            array('label' => 'Cloud', 'icon' => 'cloud', 'url' => '#', 'title' => __('云/存储', 'westlife')),
                        );
                    }
                    // 允许的图标 HTML 标签/属性白名单（SVG 或 i）
                    $allowed_icon_tags = array(
                        'i' => array(
                            'class' => true,
                            'aria-hidden' => true,
                        ),
                        'svg' => array(
                            'class' => true,
                            'viewBox' => true,
                            'xmlns' => true,
                            'xmlns:xlink' => true,
                            'width' => true,
                            'height' => true,
                            'fill' => true,
                            'aria-hidden' => true,
                            'focusable' => true,
                        ),
                        'path' => array(
                            'fill' => true,
                            'd' => true,
                        ),
                        'use' => array(
                            'xlink:href' => true,
                            'href' => true,
                            'fill' => true,
                            'aria-hidden' => true,
                            'focusable' => true,
                        ),
                    );
                    ?>
                    <div class="footer-right" aria-label="<?php esc_attr_e('站点环境', 'westlife'); ?>">
                        <div class="footer-icons-block">
                            <ul class="info-icons">
                                <?php foreach ($icons as $it): ?>
                                    <li>
                                        <a class="info-icon" href="<?php echo esc_url($it['url'] ?: '#'); ?>" target="_blank" rel="noopener" title="<?php echo esc_attr($it['title']); ?>" aria-label="<?php echo esc_attr($it['label']); ?>">
                                            <?php
                                            $raw_icon = (string) ($it['icon'] ?? '');
                                            // 若为纯图标名/旧类名（不含 "<"），自动转为 lucide 占位
                                            if ($raw_icon !== '' && strpos($raw_icon, '<') === false) {
                                                $icon_html = westlife_lucide_icon($raw_icon);
                                            } else {
                                                $icon_html = $raw_icon; // 可能是 <i> 或 <svg>
                                            }
                                            echo wp_kses($icon_html, $allowed_icon_tags);
                                            ?>
                                        </a>
                                    </li>
                                <?php endforeach; ?>

                                <?php
                                if ($icp_display_mode === 'icon') {
                                    ?>
                                    <li class="icp-toggle-wrapper">
                                        <button class="icp-toggle-btn info-icon" aria-label="查看备案信息" title="点击显示备案信息">
                                            <img src="<?php echo esc_url(get_template_directory_uri() . '/static/images/footer/icp.ico'); ?>" alt="ICP" class="icp-icon" width="20" height="20" />
                                        </button>
                                        <div class="icp-info-panel" id="icpInfoPanel">
                                            <div class="icp-info-content">
                                                <?php if ($icp): ?>
                                                    <a href="<?php echo esc_url($icp_link ?: 'https://beian.miit.gov.cn/'); ?>" target="_blank" rel="noopener" class="icp-item">
                                                        <img class="icon icp-icon-img" src="<?php echo esc_url(get_template_directory_uri() . '/static/images/footer/icp.ico'); ?>" alt="" aria-hidden="true" width="12" height="12" />
                                                        <span><?php echo esc_html($icp); ?></span>
                                                    </a>
                                                <?php endif; ?>
                                                <?php if ($icp_moe): ?>
                                                    <a href="<?php echo esc_url($icp_moe_link ?: '#'); ?>" target="_blank" rel="noopener" class="icp-item">
                                                        <img class="icon moe-icon" src="<?php echo esc_url(get_template_directory_uri() . '/static/images/footer/moe.png'); ?>" alt="" aria-hidden="true" width="12" height="12" />
                                                        <span><?php echo esc_html($icp_moe); ?></span>
                                                    </a>
                                                <?php endif; ?>
                                                <?php if ($police): ?>
                                                    <a href="<?php echo esc_url($police_link ?: 'https://www.beian.gov.cn/'); ?>" target="_blank" rel="noopener" class="icp-item">
                                                        <img class="icon police-icon" src="<?php echo esc_url(get_template_directory_uri() . '/static/images/footer/police.png'); ?>" alt="" aria-hidden="true" width="12" height="12" />
                                                        <span><?php echo esc_html($police); ?></span>
                                                    </a>
                                                <?php endif; ?>
                                            </div>
                                        </div>
                                    </li>
                                    <?php
                                }
                                // 如果是 hidden，则什么都不显示
                                ?>
                            </ul>
                        </div>
                        <?php if ($icp_display_mode === 'inline'): ?>
                            <?php
                            if ($icp || $icp_moe || $police):
                            ?>
                                <div class="icp-inline" aria-label="备案信息">
                                    <?php if ($icp): ?>
                                        <a class="icp-chip" href="<?php echo esc_url($icp_link ?: 'https://beian.miit.gov.cn/'); ?>" target="_blank" rel="noopener">
                                            <img class="icon" src="<?php echo esc_url(get_template_directory_uri() . '/static/images/footer/icp.ico'); ?>" alt="ICP" width="14" height="14" />
                                            <span><?php echo esc_html($icp); ?></span>
                                        </a>
                                    <?php endif; ?>
                                    <?php if ($icp_moe): ?>
                                        <a class="icp-chip" href="<?php echo esc_url($icp_moe_link ?: '#'); ?>" target="_blank" rel="noopener">
                                            <img class="icon" src="<?php echo esc_url(get_template_directory_uri() . '/static/images/footer/moe.png'); ?>" alt="MOE" width="14" height="14" />
                                            <span><?php echo esc_html($icp_moe); ?></span>
                                        </a>
                                    <?php endif; ?>
                                    <?php if ($police): ?>
                                        <a class="icp-chip" href="<?php echo esc_url($police_link ?: 'https://www.beian.gov.cn/'); ?>" target="_blank" rel="noopener">
                                            <img class="icon" src="<?php echo esc_url(get_template_directory_uri() . '/static/images/footer/police.png'); ?>" alt="Police" width="14" height="14" />
                                            <span><?php echo esc_html($police); ?></span>
                                        </a>
                                    <?php endif; ?>
                                </div>
                            <?php endif; ?>
                        <?php endif; ?>
                    </div>
                </div>
                <?php // 预留：额外页脚区块 
                ?>
            </div>
        </div>
    </div>
</footer>

<script>
    (function() {
        const toggleBtn = document.querySelector('.icp-toggle-btn');
        const icpPanel = document.getElementById('icpInfoPanel');
        if (!toggleBtn || !icpPanel) return;
        toggleBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            icpPanel.classList.toggle('active');
            toggleBtn.classList.toggle('active');
            const active = icpPanel.classList.contains('active');
            toggleBtn.setAttribute('aria-label', active ? '隐藏备案信息' : '查看备案信息');
        });
        document.addEventListener('click', function(e) {
            if (!icpPanel.contains(e.target) && !toggleBtn.contains(e.target)) {
                if (icpPanel.classList.contains('active')) {
                    icpPanel.classList.remove('active');
                    toggleBtn.classList.remove('active');
                    toggleBtn.setAttribute('aria-label', '查看备案信息');
                }
            }
        });
    })();
</script>

<?php
?>

<?php wp_footer(); ?>
</body>

</html>
