<?php
/**
 * 短代码功能
 * 
 * @package Westlife
 */

if (!defined('ABSPATH')) exit;

/*--------------------------------------------------------------
 * 自定义按钮短代码  下载区域短代码
--------------------------------------------------------------*/

/**
 * 下载区域短代码
 */

 function westlife_download_button_shortcode($atts) {
    // 合并默认值和传入参数
    $args = shortcode_atts(array(
        'dl_name' => '',              // 文件名称
        'dl_url' => '',              // 本站下载
        'dl_text' => '立即下载',     // 按钮文字  
        'dl_size' => '',            // 文件大小
        'dl_format' => '',          // 文件格式
        'dl_version' => '',         // 版本号
        'dl_update_time' => '',     // 添加更新时间参数
        'dl_baidu_url' => '',       // 百度网盘链接
        'dl_baidu_code' => '',      // 百度网盘提取码
        'dl_lanzou_url' => '',      // 蓝奏云链接
        'dl_lanzou_code' => '',     // 蓝奏云密码
        'dl_note' => '',            // 下载说明
    ), $atts);

    // 文件信息数组
    $file_info = array();
    if (!empty($args['dl_size'])) {
        $file_info[] = sprintf(
            '<span class="file-size"><i class="fas fa-weight-hanging"></i> %s</span>', 
            esc_html($args['dl_size'])
        );
    }
    if (!empty($args['dl_format'])) {
        $file_info[] = sprintf(
            '<span class="file-format"><i class="fas fa-file-alt"></i> %s</span>', 
            esc_html($args['dl_format'])
        );
    }
    if (!empty($args['dl_version'])) {
        $file_info[] = sprintf(
            '<span class="file-version"><i class="fas fa-code-branch"></i> %s</span>', 
            esc_html($args['dl_version'])
        );
    }

    // 下载按钮数组
    $download_buttons = array();
    
    // 本站下载按钮
    if (!empty($args['dl_url'])) {
        $download_buttons[] = sprintf(
            '<button class="download-btn site-download" onclick="window.open(\'%s\', \'_blank\')">
                <div class="button-content">
                    <div class="svg-container">
                        <svg class="download-icon" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">
                            <path fill="currentColor" d="M19.479 10.092c-.212-3.951-3.473-7.092-7.479-7.092-4.005 0-7.267 3.141-7.479 7.092-2.57.463-4.521 2.706-4.521 5.408 0 3.037 2.463 5.5 5.5 5.5h13c3.037 0 5.5-2.463 5.5-5.5 0-2.702-1.951-4.945-4.521-5.408zm-7.479 6.908l-4-4h3v-4h2v4h3l-4 4z"></path>
                        </svg>
                    </div>
                    <div class="text-container">
                        <div class="text">%s</div>
                    </div>
                </div>
            </button>',
            esc_url($args['dl_url']),
            esc_html($args['dl_text'])
        );
    }
    
    // 百度网盘按钮
    if (!empty($args['dl_baidu_url'])) {
        $download_buttons[] = sprintf(
            '<button class="download-btn baidu-download" onclick="window.open(\'%s\', \'_blank\')">
                <div class="button-content">
                    <div class="svg-container">
                        <i class="fas fa-cloud download-icon"></i>
                    </div>
                    <div class="text-container">
                        <div class="text">百度网盘</div>
                    </div>
                </div>
                %s
            </button>',
            esc_url($args['dl_baidu_url']),
            !empty($args['dl_baidu_code']) ? sprintf(
                '<span class="download-code">提取码: %s</span>', 
                esc_html($args['dl_baidu_code'])
            ) : ''
        );
    }
    
    // 蓝奏云按钮
    if (!empty($args['dl_lanzou_url'])) {
        $download_buttons[] = sprintf(
            '<button class="download-btn lanzou-download" onclick="window.open(\'%s\', \'_blank\')">
                <div class="button-content">
                    <div class="svg-container">
                        <i class="fas fa-cloud download-icon"></i>
                    </div>
                    <div class="text-container">
                        <div class="text">蓝奏云盘</div>
                    </div>
                </div>
                %s
            </button>',
            esc_url($args['dl_lanzou_url']),
            !empty($args['dl_lanzou_code']) ? sprintf(
                '<span class="download-code">密码: %s</span>', 
                esc_html($args['dl_lanzou_code'])
            ) : ''
        );
    }

    // 处理下载说明中的换行符
    $note = '';
    if (!empty($args['dl_note'])) {
        $note = sprintf(
            '<div class="download-note">%s</div>',
            nl2br(esc_html($args['dl_note']))
        );
    }
        
        // 头部右侧信息
        $header_info = array();
        
        // 文件大小
        if (!empty($args['dl_size'])) {
            $header_info[] = sprintf(
                '<div class="info-item file-size"><i class="fas fa-weight-hanging"></i> %s</div>', 
                esc_html($args['dl_size'])
            );
        }
        
        // 文件格式
        if (!empty($args['dl_format'])) {
            $header_info[] = sprintf(
                '<div class="info-item file-format"><i class="fas fa-file-alt"></i> %s</div>', 
                esc_html($args['dl_format'])
            );
        }
        
        // 版本号
        if (!empty($args['dl_version'])) {
            $header_info[] = sprintf(
                '<div class="info-item version-info"><i class="fas fa-code-branch"></i> %s</div>', 
                esc_html($args['dl_version'])
            );
        }
        
        // 更新时间
        $update_time = !empty($args['dl_update_time']) ? $args['dl_update_time'] : date_i18n('Y-m-d');
        $header_info[] = sprintf(
            '<div class="info-item update-time"><i class="fas fa-clock"></i> %s</div>',
            esc_html($update_time)
        );
    

                // 将所有信息合并到header_right
                $header_right = '<div class="header-info">' . implode('', $header_info) . '</div>';
            
                // 标题（文件名称），留空则回退
                $title_text = ($args['dl_name'] !== '') ? $args['dl_name'] : '资源下载';
            
                // HTML结构生成
                return sprintf(
                    '<div class="download-area">
                        <div class="download-header">
                            <div class="header-left">
                                <i class="fas fa-download download-icon"></i>
                                <div class="download-title">%s</div>
                            </div>
                            <div class="header-right">
                                %s
                            </div>
                        </div>
                        <div class="download-content">
                            <div class="download-action">
                                %s
                            </div>
                            %s
                        </div>
                        <div class="download-footer">
                            <div class="tips">
                                <i class="fas fa-info-circle"></i>
                                <span>下载说明：如遇链接失效，请留言反馈</span>
                            </div>
                        </div>
                    </div>',
                    esc_html($title_text),          // 文件名称（标题）
                    $header_right,                  // 头部右侧信息
                    implode('', $download_buttons), // 下载按钮列表
                    $note                           // 下载说明
                );
    }

add_shortcode('download_button', 'westlife_download_button_shortcode');

/**
 * GitHub 仓库按钮短代码
 * 使用方法: [github_button url="仓库地址" text="按钮文字"]
 * 功能：显示 GitHub 仓库按钮，包含 logo、星星数和点击跳转
 */
function westlife_github_button_shortcode($atts) {
    // 默认参数
    $args = shortcode_atts(array(
        'url' => '#',
        'text' => 'GitHub',
    ), $atts);

    // 从 URL 提取仓库信息
    $repo_parts = array_filter(explode('/', parse_url($args['url'], PHP_URL_PATH)));
    $repo_full = implode('/', array_slice($repo_parts, -2));

    // 生成按钮 HTML
    return sprintf(
        '<button class="github-btn" onclick="window.open(\'%s\', \'_blank\')">
            <div class="github-btn-content">
                <div class="github-icon">
                    <svg height="32" viewBox="0 0 16 16" width="32">
                        <path fill="#fff" d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"></path>
                    </svg>
                </div>
                <span class="github-text">%s</span>
                <div class="github-stars">
                    <svg class="octicon" height="16" viewBox="0 0 16 16" width="16">
                        <path fill="#FFD700" d="M8 .25a.75.75 0 01.673.418l1.882 3.815 4.21.612a.75.75 0 01.416 1.279l-3.046 2.97.719 4.192a.75.75 0 01-1.088.791L8 12.347l-3.766 1.98a.75.75 0 01-1.088-.79l.72-4.194L.818 6.374a.75.75 0 01.416-1.28l4.21-.611L7.327.668A.75.75 0 018 .25z"></path>
                    </svg>
                    <span class="star-count" data-repo="%s">...</span>
                </div>
            </div>
        </button>',
        esc_url($args['url']),
        esc_html($args['text']),
        esc_attr($repo_full)
    );
}
add_shortcode('github_button', 'westlife_github_button_shortcode');

/**
 * 音乐短代码
 * [qqmusic id="歌曲或歌单ID" type="song/playlist"]
 */
function westlife_shortcode_qqmusic($atts) {
    $atts = shortcode_atts([
        'id'   => '',
        'type' => 'song', // song 或 playlist
    ], $atts, 'qqmusic');

    if (empty($atts['id'])) return '';

    $type_map = ['song' => 2, 'playlist' => 1];
    $type_code = $type_map[$atts['type']] ?? 2;
    $iframe_url = sprintf(
        'https://y.qq.com/iframe/player.html?type=%d&mid=%s&auto=0&height=86',
        $type_code,
        esc_attr($atts['id'])
    );

    return sprintf(
        '<div class="media-embed media-embed-card music-player-card">
            <iframe class="player-iframe" src="%s" allowfullscreen="true"></iframe>
        </div>',
        esc_url($iframe_url)
    );
}
add_shortcode('qqmusic', 'westlife_shortcode_qqmusic');

/**
 * 网易云音乐短代码
 * [netease id="歌曲或歌单ID" type="song/playlist"]
 */
function westlife_shortcode_netease($atts) {
    $atts = shortcode_atts([
        'id'   => '',
        'type' => 'song', // song 或 playlist
    ], $atts, 'netease');

    if (empty($atts['id'])) return '';

    $type_map = ['song' => 2, 'playlist' => 0];
    $type_code = $type_map[$atts['type']] ?? 2;
    $iframe_url = sprintf(
        '//music.163.com/outchain/player?type=%d&id=%s&auto=0&height=66',
        $type_code,
        esc_attr($atts['id'])
    );

    return sprintf(
        '<div class="media-embed media-embed-card music-player-card">
            <iframe class="player-iframe" src="%s" allowfullscreen="true"></iframe>
        </div>',
        esc_url($iframe_url)
    );
}
add_shortcode('netease', 'westlife_shortcode_netease');

/**
 * 酷狗音乐短代码
 * [kugou hash="歌曲HASH"]
 */
function westlife_shortcode_kugou($atts) {
    $atts = shortcode_atts(['hash' => ''], $atts, 'kugou');
    if (empty($atts['hash'])) return '';

    $iframe_url = sprintf(
        'https://www.kugou.com/embed/hash=%s&height=86',
        esc_attr($atts['hash'])
    );

    return sprintf(
        '<div class="media-embed media-embed-card music-player-card">
            <iframe class="player-iframe" src="%s" allowfullscreen="true"></iframe>
        </div>',
        esc_url($iframe_url)
    );
}
add_shortcode('kugou', 'westlife_shortcode_kugou');


/**
 * YouTube 视频短代码
 * [youtube id="视频ID"]
 */
function westlife_shortcode_youtube($atts) {
    $atts = shortcode_atts(['id' => ''], $atts, 'youtube');
    if (empty($atts['id'])) return '';

    $iframe_url = sprintf(
        'https://www.youtube.com/embed/%s',
        esc_attr($atts['id'])
    );

    return sprintf(
        '<div class="media-embed video-container">
            <iframe src="%s" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
        </div>',
        esc_url($iframe_url)
    );
}
add_shortcode('youtube', 'westlife_shortcode_youtube');

/**
 * 优酷视频短代码
 * [youku id="视频ID"]
 */
function westlife_shortcode_youku($atts) {
    $atts = shortcode_atts(['id' => ''], $atts, 'youku');
    if (empty($atts['id'])) return '';

    $iframe_url = sprintf(
        'https://player.youku.com/embed/%s',
        esc_attr($atts['id'])
    );

    return sprintf(
        '<div class="media-embed video-container">
            <iframe src="%s" allowfullscreen="true"></iframe>
        </div>',
        esc_url($iframe_url)
    );
}
add_shortcode('youku', 'westlife_shortcode_youku');

/**
 * 腾讯视频短代码
 * [tencentvideo vid="视频VID"]
 */
function westlife_shortcode_tencentvideo($atts) {
    $atts = shortcode_atts(['vid' => ''], $atts, 'tencentvideo');
    if (empty($atts['vid'])) return '';

    $iframe_url = sprintf(
        'https://v.qq.com/txp/iframe/player.html?vid=%s&auto=0',
        esc_attr($atts['vid'])
    );

    return sprintf(
        '<div class="media-embed video-container">
            <iframe src="%s" allowfullscreen="true"></iframe>
        </div>',
        esc_url($iframe_url)
    );
}
add_shortcode('tencentvideo', 'westlife_shortcode_tencentvideo');


/**
 * Twitter / X 短代码
 * [tweet url="推文URL"]
 */
function westlife_shortcode_tweet($atts) {
    $atts = shortcode_atts(['url' => ''], $atts, 'tweet');
    if (empty($atts['url'])) return '';

    // 使用 oEmbed 获取推文数据
    $response = wp_remote_get('https://publish.twitter.com/oembed?url=' . esc_url($atts['url']));
    if (is_wp_error($response) || wp_remote_retrieve_response_code($response) !== 200) {
        return '<!-- Tweet oEmbed failed -->';
    }

    $data = json_decode(wp_remote_retrieve_body($response), true);
    if (empty($data['html'])) {
        return '<!-- Tweet data parsing failed -->';
    }

    // 简单解析作者信息
    preg_match('/<a href="https:\/\/twitter\.com\/([^"]+)">([^<]+)<\/a>/', $data['html'], $matches);
    $author_handle = $matches[1] ?? '';
    $author_name = $matches[2] ?? '';

    // 简单解析推文内容
    preg_match('/<p lang="[^"]+">(.+?)<\/p>/s', $data['html'], $content_matches);
    $content = $content_matches[1] ?? '...';

    // 简单解析日期
    preg_match('/<a href="[^"]+">([^<]+)<\/a><\/blockquote>/', $data['html'], $date_matches);
    $date = $date_matches[1] ?? '';

    return sprintf(
        '<div class="media-embed media-embed-card twitter-card-embed">
            <div class="tweet-header">
                <img class="tweet-avatar" src="https://unavatar.io/twitter/%s" alt="%s">
                <div class="tweet-author">
                    <div class="name">%s</div>
                    <div class="handle">@%s</div>
                </div>
            </div>
            <div class="tweet-body">%s</div>
            <div class="tweet-footer">%s</div>
            <a href="%s" target="_blank" rel="noopener" class="tweet-logo" aria-label="在 X 上查看">
                <svg viewBox="0 0 24 24" aria-hidden="true" style="width:24px;height:24px;fill:currentColor;"><g><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"></path></g></svg>
            </a>
        </div>',
        esc_attr($author_handle),
        esc_attr($author_name),
        esc_html($author_name),
        esc_html($author_handle),
        wp_kses_post($content), // 允许链接等
        esc_html($date),
        esc_url($atts['url'])
    );
}
add_shortcode('tweet', 'westlife_shortcode_tweet');

/**
 * 豆瓣短代码
 * [douban id="条目ID" type="movie/book/music" rating="评分" meta="元信息" summary="简介" poster="海报URL"]
 */
function westlife_shortcode_douban($atts) {
    $atts = shortcode_atts([
        'id'      => '',
        'type'    => 'movie',
        'title'   => '未知条目',
        'rating'  => '',
        'meta'    => '',
        'summary' => '',
        'poster'  => '',
    ], $atts, 'douban');

    if (empty($atts['id'])) return '';

    $base_url = 'https://';
    switch ($atts['type']) {
        case 'book': $base_url .= 'book.douban.com/subject/'; break;
        case 'music': $base_url .= 'music.douban.com/subject/'; break;
        default: $base_url .= 'movie.douban.com/subject/'; break;
    }
    $link = esc_url($base_url . $atts['id'] . '/');

    $poster_html = '';
    if (!empty($atts['poster'])) {
        $poster_html = sprintf('<div class="douban-poster"><img src="%s" alt="%s" loading="lazy"></div>', esc_url($atts['poster']), esc_attr($atts['title']));
    }

    $rating_html = '';
    if (!empty($atts['rating'])) {
        $rating_html = sprintf(
            '<div class="douban-rating">
                <span class="rating-value">%.1f</span>
                <span>/ 10</span>
            </div>',
            floatval($atts['rating'])
        );
    }

    return sprintf(
        '<div class="media-embed media-embed-card douban-card-embed">
            %s
            <div class="douban-info">
                <h3 class="douban-title"><a href="%s" target="_blank" rel="noopener">%s</a></h3>
                %s
                <div class="douban-meta">%s</div>
                <div class="douban-summary">%s</div>
            </div>
        </div>',
        $poster_html,
        $link,
        esc_html($atts['title']),
        $rating_html,
        esc_html($atts['meta']),
        esc_html($atts['summary'])
    );
}
add_shortcode('douban', 'westlife_shortcode_douban');
?>