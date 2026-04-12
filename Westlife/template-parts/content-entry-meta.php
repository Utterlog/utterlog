<?php

/**
 * 文章底部 - 版权与作者信息模块
 *
 * 文件位置: template-parts/content-entry-meta.php
 * 被引用处: single.php -> get_template_part('template-parts/content', 'entry-meta')
 *
 * 说明: 从 single.php 提取，保持原有结构与逻辑不变
 */
?>

<!-- 版权和作者信息区域 -->
<div class="entry-meta-box">
    <div class="entry-meta-svg" aria-hidden="true">
        <svg t="1759844083860" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="12454" width="200" height="200">
            <path d="M845.3 317.7c33.5 57.1 52.7 123.6 52.7 194.6 0 212.6-72 385-385 385s-385-172.4-385-385c0-68.7 18-133.2 49.5-189-24-12.8-39.2-39.1-36.7-67.9l5.2-59.8c3.4-38.5 37.3-67 75.8-63.6l59.8 5.2c23.1 2 42.5 15 53.7 33.4 53.2-27.7 113.6-43.4 177.7-43.4 60.5 0 117.7 14 168.7 38.8 11.5-15.9 29.6-27 50.7-28.8l59.8-5.2c38.5-3.4 72.5 25.1 75.8 63.6l5.2 59.8c2.2 25.2-9.1 48.3-27.9 62.3z" fill="#FFDDD3" p-id="12455"></path>
            <path d="M513 912.3c-77.1 0-143.5-10.5-197.6-31.3-50.9-19.5-92.6-48.8-123.9-87-28.3-34.5-49.2-77.7-61.9-128.2-11.2-44.2-16.6-94.4-16.6-153.5 0-64.1 15.4-127.5 44.8-184a84.62 84.62 0 0 1-31.9-74.1l5.2-59.8c4.1-46.7 45.4-81.3 92.1-77.3l59.8 5.2c22.2 1.9 42.6 12.6 57 29.2 53.6-25.7 113.2-39.3 173.1-39.3 57.5 0 112.9 11.9 164.7 35.4 14.1-14.5 33-23.5 53.4-25.3l59.8-5.2c46.7-4.1 88 30.6 92.1 77.3l5.2 59.8c2.2 25.1-6.6 49.2-23.8 66.8 31.9 58.4 48.7 124.3 48.7 191.3 0 59.1-5.4 109.3-16.6 153.5-12.8 50.5-33.6 93.7-61.9 128.2-31.3 38.2-73 67.5-123.9 87-54.3 20.8-120.7 31.3-197.8 31.3zM215.7 146.8c-28.2 0-52.2 21.6-54.8 50.2l-5.2 59.8c-1.9 22 9.4 42.9 28.9 53.3l13.5 7.2-7.5 13.4C159.4 385.8 143 448.6 143 512.3c0 56.6 5.1 104.4 15.7 146.2 11.8 46.9 30.2 85 56 116.5 28.4 34.6 64.8 60.1 111.4 78 50.6 19.4 113.4 29.3 186.8 29.3s136.2-9.8 186.8-29.3c46.6-17.9 83.1-43.4 111.4-78 25.9-31.5 44.2-69.7 56-116.5 10.6-41.8 15.7-89.6 15.7-146.2 0-65.9-17.5-130.5-50.6-187l-6.8-11.6 10.8-8c15.4-11.5 23.6-29.8 22-48.9L853 197c-2.6-30.2-29.4-52.6-59.6-50l-59.8 5.2c-16 1.4-30.5 9.7-39.8 22.7l-7.4 10.3-11.4-5.5c-50.7-24.8-105.2-37.3-162.1-37.3-59.4 0-118.4 14.4-170.7 41.7l-12.4 6.5-7.3-12c-9.1-14.9-24.9-24.7-42.2-26.2l-59.8-5.2c-1.6-0.3-3.2-0.4-4.8-0.4z" fill="#525252" p-id="12456"></path>
            <path d="M292 462.3m-84 0a84 84 0 1 0 168 0 84 84 0 1 0-168 0Z" fill="#FFFFFF" p-id="12457"></path>
            <path d="M734 462.3m-84 0a84 84 0 1 0 168 0 84 84 0 1 0-168 0Z" fill="#FFFFFF" p-id="12458"></path>
            <path d="M667.6 619.6c-9.3 50.2-53.2 86.6-104.3 86.6H460.5c-51.1 0-94.9-36.4-104.3-86.6-3.4-18.5 0.5-37.2 11.2-52.8 10.6-15.5 26.7-26 45.2-29.4 4.2-0.8 8.6-1.2 12.9-1.2h172.8c38.9 0 70.5 31.6 70.5 70.5-0.1 4.3-0.5 8.7-1.2 12.9z" fill="#F0B3B3" p-id="12459"></path>
            <path d="M292 462.3m-25 0a25 25 0 1 0 50 0 25 25 0 1 0-50 0Z" fill="#525252" p-id="12460"></path>
            <path d="M734 462.3m-25 0a25 25 0 1 0 50 0 25 25 0 1 0-50 0Z" fill="#525252" p-id="12461"></path>
            <path d="M474.7 595.8c-12-6.9-32.2 5.9-39.2 17.8-6.9 12-2.8 27.2 9.2 34.2 12 6.9 27.2 2.8 34.2-9.2 6.8-11.9 7.7-35.9-4.2-42.8zM550.7 595.8c-12 6.9-11.1 30.9-4.2 42.8 6.9 12 22.2 16.1 34.2 9.2 12-6.9 16.1-22.2 9.2-34.2-7-11.9-27.3-24.7-39.2-17.8z" fill="#525252" p-id="12462"></path>
            <path d="M385 462.3c0-51.3-41.7-93-93-93s-93 41.7-93 93 41.7 93 93 93 93-41.7 93-93z m-93 75c-41.4 0-75-33.6-75-75s33.6-75 75-75 75 33.6 75 75-33.6 75-75 75zM734 369.3c-51.3 0-93 41.7-93 93s41.7 93 93 93 93-41.7 93-93-41.7-93-93-93z m0 168c-41.4 0-75-33.6-75-75s33.6-75 75-75 75 33.6 75 75-33.6 75-75 75zM599.4 518.3H426.6c-5.4 0-10.9 0.5-16.2 1.5-23.2 4.3-43.4 17.4-56.8 36.9-13.4 19.5-18.3 43-14 66.2 9.8 52.7 52.1 92.4 103.8 100 0.3 1 0.7 1.9 1.4 2.7 16.2 21.7 42.1 34.6 69.4 34.6 26.2 0 50.5-11.7 66.8-32 1.3-1.6 1.9-3.5 2-5.4 51.5-7.8 93.6-47.4 103.4-100 1-5.3 1.5-10.8 1.5-16.2-0.1-48.6-39.7-88.3-88.5-88.3z m-131.7 206h92.5c-12.4 11.5-28.7 18-46 18-17.6 0-34-6.4-46.5-18z m201-104.6c-9.3 50.2-53.2 86.6-104.3 86.6H461.6c-51.1 0-94.9-36.4-104.3-86.6-3.4-18.5 0.5-37.2 11.2-52.8 10.6-15.5 26.7-26 45.2-29.4 4.2-0.8 8.6-1.2 12.9-1.2h172.8c38.9 0 70.5 31.6 70.5 70.5-0.1 4.3-0.5 8.6-1.2 12.9z" fill="#525252" p-id="12463"></path>
        </svg>
    </div>

    <!-- 头像（左） -->
    <div class="author-avatar">
        <?php echo get_avatar(get_the_author_meta('ID'), 60); ?>

        <!-- 社交按钮（头像悬浮显示） -->
        <ul class="author-social">
            <?php if ($tw = esc_url(get_option('social_twitter'))): ?>
                <li>
                    <a class="as-btn twitter" href="<?php echo $tw; ?>" target="_blank" rel="noopener" aria-label="Twitter">
                        <i class="fab fa-twitter as-icon" aria-hidden="true"></i>
                        <span class="text">Twitter</span>
                    </a>
                </li>
            <?php endif; ?>

            <?php if ($gh = esc_url(get_option('social_github'))): ?>
                <li>
                    <a class="as-btn github" href="<?php echo $gh; ?>" target="_blank" rel="noopener" aria-label="GitHub">
                        <i class="fab fa-github as-icon" aria-hidden="true"></i>
                        <span class="text">GitHub</span>
                    </a>
                </li>
            <?php endif; ?>

            <?php if ($x = esc_url(get_option('social_x'))): ?>
                <li>
                    <a class="as-btn x" href="<?php echo $x; ?>" target="_blank" rel="noopener" aria-label="X (Twitter)">
                        <i class="fab fa-x-twitter as-icon" aria-hidden="true"></i>
                        <span class="text">X</span>
                    </a>
                </li>
            <?php endif; ?>

            <?php if ($mastodon = esc_url(get_option('social_mastodon'))): ?>
                <li>
                    <a class="as-btn mastodon" href="<?php echo $mastodon; ?>" target="_blank" rel="me noopener" aria-label="Mastodon">
                        <i class="fab fa-mastodon as-icon" aria-hidden="true"></i>
                        <span class="text">Mastodon</span>
                    </a>
                </li>
            <?php endif; ?>
        </ul>
    </div>


    <!-- 作者与版权信息（中） -->
    <div class="copyright-content">

        <div class="copyright-info">
            <?php
            $cats = get_the_category();
            $cat_html = '';
            if (!empty($cats)) {
                $primary = $cats[0];
                $cat_html = '<a href="' . esc_url(get_category_link($primary->term_id)) . '">' . esc_html($primary->name) . '</a>';
            }
            ?>
            <p class="article-author">
                本文由 <?php the_author_posts_link(); ?>
                <?php if ($cat_html): ?>
                    发布于 <span class="in-cat"><?php echo $cat_html; ?></span> 分类下
                <?php endif; ?>
                <span class="sep">·</span>
                <span class="published">发布时间：<?php echo esc_html(get_the_date('Y/m/d')); ?></span>
                <span class="sep">·</span>
                <span class="updated-time">最后更新：<?php echo esc_html(get_the_modified_date('Y/m/d')); ?></span>
                <?php /* 恢复显示最后更新时间 */ ?>
            </p>

            <p class="article-link">
                <span>本文链接：</span>
                <a href="<?php the_permalink(); ?>"><?php the_permalink(); ?></a>
                <button class="copy-link-btn" type="button" aria-label="复制本文链接" data-url="<?php echo esc_url(get_permalink()); ?>">
                    <i class="fas fa-copy"></i>
                </button>
            </p>

            <p class="article-license">
                本文采用 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/" class="license-link" target="_blank" rel="noopener">CC BY-NC-SA 4.0</a> 许可协议。转载请注明来源：
                <a class="site-name" href="<?php echo esc_url(home_url('/')); ?>"><?php bloginfo('name'); ?></a>
            </p>
        </div>
    </div>
</div>