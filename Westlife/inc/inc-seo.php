<?php

/**
 * SEO 相关功能
 * 
 * @package Westlife
 */

if (!defined('ABSPATH')) exit;

/**
 * 获取文章摘要
 */
function westlife_get_excerpt($length = 160)
{
    global $post;

    // 优先使用自定义摘要
    $excerpt = $post->post_excerpt;

    if (empty($excerpt)) {
        // 从内容中生成摘要
        $excerpt = wp_strip_all_tags($post->post_content);
        $excerpt = wp_trim_words($excerpt, $length, '...');
    }

    return apply_filters('westlife_excerpt', $excerpt);
}

/**
 * 获取关键词
 */
function westlife_get_keywords()
{
    global $post;

    $keywords = array();

    // 获取文章标签
    $tags = get_the_tags();
    if ($tags) {
        foreach ($tags as $tag) {
            $keywords[] = $tag->name;
        }
    }

    // 获取文章分类
    $categories = get_the_category();
    if ($categories) {
        foreach ($categories as $category) {
            $keywords[] = $category->name;
        }
    }

    // 如果没有标签和分类，使用标题关键词
    if (empty($keywords)) {
        $keywords[] = get_the_title();
    }

    // 限制关键词数量
    $keywords = array_slice($keywords, 0, 5);

    return apply_filters('westlife_keywords', implode(',', $keywords));
}

/**
 * 修改标题分隔符
 */
function westlife_title_separator($sep)
{
    return '|';
}
add_filter('document_title_separator', 'westlife_title_separator');

/**
 * 自定义标题格式
 */
function westlife_title_parts($title)
{
    if (is_home() || is_front_page()) {
        $title['tagline'] = get_bloginfo('description');
    }
    return $title;
}
add_filter('document_title_parts', 'westlife_title_parts');

/**
 * 添加robots meta
 */
function westlife_robots_meta()
{
    // 默认允许索引和跟踪
    $robots = array('index', 'follow');

    // 特定页面禁止索引
    if (is_archive() || is_search() || is_404()) {
        $robots = array('noindex', 'follow');
    }

    // 输出meta标签
    echo '<meta name="robots" content="' . esc_attr(implode(',', $robots)) . '">' . "\n";
}
add_action('wp_head', 'westlife_robots_meta', 1);

/**
 * 添加规范链接
 */
function westlife_canonical_url()
{
    if (is_singular()) {
        echo '<link rel="canonical" href="' . esc_url(get_permalink()) . '">' . "\n";
    }
}
add_action('wp_head', 'westlife_canonical_url', 1);

/**
 * 输出SEO meta标签
 */
function westlife_output_seo_meta()
{
    // 获取SEO信息
    $seo = westlife_get_seo_data();

    // 基本meta标签
    if (!empty($seo['description'])) {
        printf(
            '<meta name="description" content="%s">' . "\n",
            esc_attr($seo['description'])
        );
    }

    if (!empty($seo['keywords'])) {
        printf(
            '<meta name="keywords" content="%s">' . "\n",
            esc_attr($seo['keywords'])
        );
    }

    // Open Graph标签
    if (is_single() || is_page()) {
?>
        <meta property="og:type" content="article" />
        <meta property="og:title" content="<?php echo esc_attr(get_the_title()); ?>" />
        <meta property="og:description" content="<?php echo esc_attr($seo['description']); ?>" />
        <meta property="og:url" content="<?php echo esc_url(get_permalink()); ?>" />
        <?php if (has_post_thumbnail()): ?>
            <meta property="og:image" content="<?php echo esc_url(get_the_post_thumbnail_url(null, 'large')); ?>" />
    <?php endif;
    }

    // Twitter Card标签
    $twitter_card_type = get_option('twitter_card_type', 'summary_large_image');
    $twitter_site = get_option('twitter_site');
    $twitter_creator = get_option('twitter_creator');
    ?>
    <meta name="twitter:card" content="<?php echo esc_attr($twitter_card_type); ?>" />
    <?php if (!empty($twitter_site)): ?>
        <meta name="twitter:site" content="@<?php echo esc_attr($twitter_site); ?>" />
    <?php endif; ?>
    <?php if (!empty($twitter_creator)): ?>
        <meta name="twitter:creator" content="@<?php echo esc_attr($twitter_creator); ?>" />
    <?php endif; ?>
    <meta name="twitter:title" content="<?php echo esc_attr(wp_get_document_title()); ?>" />
    <?php if (!empty($seo['description'])): ?>
        <meta name="twitter:description" content="<?php echo esc_attr($seo['description']); ?>" />
    <?php endif; ?>
    <?php if (is_single() && has_post_thumbnail()): ?>
        <meta name="twitter:image" content="<?php echo esc_url(get_the_post_thumbnail_url(null, 'large')); ?>" />
<?php endif;
}
// 仅在开启内置 SEO 时输出（默认启用，可后台关闭）
if (!function_exists('westlife_should_enable_builtin_seo')) {
    function westlife_should_enable_builtin_seo()
    {
        return (bool) get_option('westlife_enable_builtin_seo', true);
    }
}
if (westlife_should_enable_builtin_seo()) {
    add_action('wp_head', 'westlife_output_seo_meta', 1);
}

/**
 * 获取页面SEO数据
 */
function westlife_get_seo_data()
{
    $seo = array(
        'description' => '',
        'keywords' => ''
    );

    // 首页
    if (is_home() || is_front_page()) {
        $seo['description'] = get_option('home_description');
        $seo['keywords'] = get_option('home_keywords');
    }
    // 文章和页面
    elseif (is_single() || is_page()) {
        $seo['description'] = westlife_get_excerpt(160);
        $seo['keywords'] = westlife_get_keywords();
    }
    // 分类页
    elseif (is_category()) {
        $cat = get_queried_object();
        $seo['description'] = strip_tags(category_description());
        $seo['keywords'] = $cat->name;
    }
    // 标签页
    elseif (is_tag()) {
        $tag = get_queried_object();
        $seo['description'] = strip_tags(tag_description());
        $seo['keywords'] = $tag->name;
    }

    return apply_filters('westlife_seo_data', $seo);
}
