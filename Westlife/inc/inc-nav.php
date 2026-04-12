<?php

/**
 * 导航功能模块
 *
 * @package Westlife
 */

if (!defined('ABSPATH')) {
    exit;
}

/**
 * 主导航菜单 Walker
 */

class WestLife_Nav_Walker extends Walker_Nav_Menu
{
    public function start_lvl(&$output, $depth = 0, $args = null)
    {
        $output .= '<div class="sub-menu-wrapper"><ul class="sub-menu">';
    }

    public function end_lvl(&$output, $depth = 0, $args = null)
    {
        $output .= '</ul></div>';
    }

    public function start_el(&$output, $item, $depth = 0, $args = [], $id = 0)
    {
        $classes = empty($item->classes) ? [] : (array) $item->classes;

        // 仅保留必要类（不再处理 Font Awesome）
        if (in_array('menu-item-has-children', $classes, true)) {
            $classes[] = 'has-children';
        }
        $classes[] = 'site-menu-item';
        $class_names = join(' ', array_filter($classes));

        // li
        $output .= sprintf(
            '<li id="menu-item-%d" class="%s">',
            (int)$item->ID,
            esc_attr($class_names)
        );

        // a 属性
        $atts = [];
        $atts['href'] = !empty($item->url) ? $item->url : '';
        if (!empty($item->attr_title)) $atts['title']  = $item->attr_title;
        if (!empty($item->target))     $atts['target'] = $item->target;
        if (!empty($item->xfn))        $atts['rel']    = $item->xfn;
        if (in_array('menu-item-has-children', $classes, true)) {
            $atts['aria-haspopup'] = 'true';
            $atts['aria-expanded'] = 'false';
        }

        $attributes = '';
        foreach ($atts as $attr => $value) {
            $attributes .= ' ' . $attr . '="' . esc_attr($value) . '"';
        }

        // 纯文字链接（不含任何图标）
        $title = apply_filters('the_title', $item->title, $item->ID);
        $output .= '<a' . $attributes . '><span class="menu-text">' . esc_html($title) . '</span></a>';
    }

    public function end_el(&$output, $item, $depth = 0, $args = [])
    {
        $output .= '</li>';
    }
}

/**
 * 分类菜单 Walker（补充图标支持）
 */

class WestLife_Category_Walker extends Walker_Nav_Menu
{
    public function start_el(&$output, $item, $depth = 0, $args = [], $id = 0)
    {
        $classes = empty($item->classes) ? [] : (array)$item->classes;

        // 提取并透传 FA 类，默认 fa-solid fa-tag
        $fa_classes = [];
        foreach ($classes as $class) {
            if (preg_match('/^(fa|fas|far|fal|fat|fab|fad|fa-(solid|regular|light|thin|duotone|brands)|fa-[a-z0-9-]+)$/i', $class)) {
                $fa_classes[] = $class;
            }
        }
        $fa_classes = array_unique($fa_classes);
        if (empty($fa_classes)) {
            $fa_classes = ['fa-solid', 'fa-tag'];
        }

        // 统计/激活态/分类ID
        $count_html = '';
        $active = '';
        $cat_id = 0;
        $has_count_class = '';
        if ($item->object === 'category') {
            $term = get_term((int)$item->object_id, 'category');
            if ($term && !is_wp_error($term)) {
                $cat_id = (int)$term->term_id;
                // 去括号，悬浮提示完整数字
                $count_html = sprintf('<span class="count" title="%1$d">%1$d</span>', (int)$term->count);
                $has_count_class = ' has-count';
                if (is_category($term->term_id)) $active = ' active';
            }
        }

        $output .= sprintf(
            '<a href="%s" class="category-item%s%s" data-category="%d"><i class="%s" aria-hidden="true"></i><span class="text">%s</span>%s</a>',
            esc_url($item->url),
            $active,
            $has_count_class,
            $cat_id,
            esc_attr(implode(' ', $fa_classes)),
            esc_html($item->title),
            $count_html
        );
    }
}

/**
 * 站点菜单 Walker
 */
class WestLife_Site_Menu_Walker extends Walker_Nav_Menu
{
    public function start_el(&$output, $item, $depth = 0, $args = [], $id = 0)
    {
        $classes = empty($item->classes) ? [] : (array) $item->classes;

        // 提取 FA 类
        $fa_classes = [];
        foreach ($classes as $class) {
            if (preg_match('/^(fa|fas|far|fal|fat|fab|fad|fa-(solid|regular|light|thin|duotone|brands)|fa-[a-z0-9-]+)$/i', $class)) {
                $fa_classes[] = $class;
            }
        }
        $fa_classes = array_unique($fa_classes);
        if (empty($fa_classes)) {
            $fa_classes = ['fa-solid', 'fa-link'];
        }

        $classes[] = 'site-menu-item';

        // 允许从菜单项中读取图标颜色：
        // 1) CSS 类包含 color-xxxxxx（hex，无#），如 color-d1cb15
        // 2) 标题属性(attr_title)为 #xxxxxx（hex，带#）
        // 注意：仅接受 hex 以保证安全
        $icon_color = '';
        foreach ($classes as $c) {
            if (preg_match('/^color-([0-9a-fA-F]{3,8})$/', $c, $m)) {
                $icon_color = '#' . $m[1];
                break;
            }
        }
        if (!$icon_color && is_string($item->attr_title)) {
            $attr = trim($item->attr_title);
            if (preg_match('/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/', $attr)) {
                $icon_color = $attr;
            }
        }
        $class_names = join(' ', array_filter($classes));

        // li
        $output .= sprintf(
            '<li id="menu-item-%d" class="%s">',
            (int)$item->ID,
            esc_attr($class_names)
        );

        // a
        $output .= sprintf(
            '<a href="%s" title="%s"%s%s>',
            esc_url($item->url),
            esc_attr($item->attr_title ?: $item->title),
            $item->target ? ' target="' . esc_attr($item->target) . '"' : '',
            $item->xfn ? ' rel="' . esc_attr($item->xfn) . '"' : ''
        );

        $style_attr = $icon_color ? ' style="color:' . esc_attr($icon_color) . ';"' : '';
        $output .= sprintf(
            '<i class="%s"%s></i><span class="menu-text">%s</span>',
            esc_attr(implode(' ', $fa_classes)),
            $style_attr,
            esc_html($item->title)
        );

        $output .= '</a>';
    }

    public function end_el(&$output, $item, $depth = 0, $args = [])
    {
        $output .= '</li>';
    }
}

/**
 * 注册导航菜单位置
 */
function westlife_register_nav_menus()
{
    register_nav_menus([
        'primary'  => esc_html__('主菜单', 'westlife'),
        'category' => esc_html__('分类导航', 'westlife'),
        'site_menu_left'  => esc_html__('站点菜单左侧', 'westlife'),
        'site_menu_right' => esc_html__('站点菜单右侧', 'westlife'),
    ]);
}
add_action('after_setup_theme', 'westlife_register_nav_menus');

/**
 * 添加菜单类
 */
function westlife_nav_menu_css_class($classes, $item)
{
    if (in_array('current-menu-item', $classes)) {
        $classes[] = 'active';
    }
    if (in_array('menu-item-has-children', $classes)) {
        $classes[] = 'dropdown';
    }
    return $classes;
}
add_filter('nav_menu_css_class', 'westlife_nav_menu_css_class', 10, 2);

/**
 * 分类导航输出：优先绑定后台“分类导航”菜单，否则回退为自动分类列表
 */
function westlife_category_nav()
{
    if (has_nav_menu('category')) {
        $locations = get_nav_menu_locations();
        $menu_id   = isset($locations['category']) ? (int)$locations['category'] : 0;
        $items     = $menu_id ? wp_get_nav_menu_items($menu_id, ['update_post_term_cache' => false]) : [];

        echo '<div class="category-list">';
        if (!empty($items)) {
            foreach ($items as $item) {
                // 直接复用 Walker 的输出逻辑
                $walker = new WestLife_Category_Walker();
                $out = '';
                $walker->start_el($out, $item, 0, (object)[], 0);
                echo $out;
            }
        }
        echo '</div>';
        return;
    }

    // 回退：自动分类列表（补充 data-category）
    $output = '<div class="category-list">';
    $output .= sprintf(
        '<a href="%s" class="category-item%s" data-category="0"><i class="fas fa-layer-group"></i><span class="text">%s</span></a>',
        esc_url(home_url('/')),
        (is_home() || is_front_page()) ? ' active' : '',
        esc_html__('全部', 'westlife')
    );

    $categories = get_categories([
        'orderby'    => 'count',
        'order'      => 'DESC',
        'hide_empty' => 1,
        'parent'     => 0
    ]);

    foreach ($categories as $category) {
        $active_class = is_category($category->term_id) ? ' active' : '';
        $output .= sprintf(
            '<a href="%s" class="category-item has-count%s" data-category="%d"><i class="fas fa-tag"></i><span class="text">%s</span><span class="count" title="%d">%d</span></a>',
            esc_url(get_category_link($category->term_id)),
            $active_class,
            (int)$category->term_id,
            esc_html($category->name),
            (int)$category->count,
            (int)$category->count
        );
    }
    $output .= '</div>';
    echo $output;
}

/**
 * 文章和评论分页
 */

function westlife_get_pagination($args = [])
{
    $defaults = [
        'type'      => 'posts',    // posts 或 comments
        'prev_text' => '<i class="fa-solid fa-chevron-left"></i>',
        'next_text' => '<i class="fa-solid fa-chevron-right"></i>',
        'mid_size'  => 2,
        'end_size'  => 1
    ];

    $args = wp_parse_args($args, $defaults);

    // 标记此 wrapper 类型，便于前端精准选择
    $wrapper_type = ($args['type'] === 'comments') ? 'comments' : 'posts';
    echo '<div class="pagination-wrapper is-' . esc_attr($wrapper_type) . '">';

    if ($args['type'] === 'comments' && get_comment_pages_count() > 1) {
        echo '<nav class="comment-pagination" role="navigation">';
        $links = paginate_comments_links(array_merge($args, [
            'type' => 'array',
            'echo' => false
        ]));
        if ($links) {
            echo '<div class="nav-links" data-post-id="' . get_the_ID() . '">';
            foreach ($links as $link) {
                echo str_replace('page-numbers', 'page-number', $link);
            }
            echo '</div>';
        }
        echo '</nav>';
    } else {
        echo '<div class="posts-pagination">';
        echo paginate_links(array_merge($args, [
            'type' => 'plain',
            'before_page_number' => '<span class="page-number">',
            'after_page_number'  => '</span>'
        ]));
        echo '</div>';
    }
    echo '</div>';
}
