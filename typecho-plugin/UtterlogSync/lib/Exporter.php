<?php
/**
 * Typecho → Utterlog package exporter.
 *
 * 把 Typecho 的 5 类资源（categories / tags / posts / pages / comments）
 * 翻译成 Utterlog 服务端期望的 JSON 形态 —— 字段名跟 WordPress 插件保持
 * 一致（source_id / title / slug / content / categories[] / tags[] /
 * published_at_gmt / updated_at_gmt / status / allow_comment ...）。
 *
 * Typecho 表：
 *   typecho_contents       —— 文章 + 独立页面（type='post' / 'page'）
 *   typecho_metas          —— 分类 + 标签（type='category' / 'tag'）
 *   typecho_relationships  —— content × meta 关联
 *   typecho_comments       —— 评论
 *
 * Typecho 时间戳是 UTC unix int，直接 gmdate() 转 ISO 即可。
 */

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

class UtterlogSync_Exporter
{
    const RESOURCES = array('categories', 'tags', 'posts', 'pages', 'comments');
    const DEFAULT_BATCH_SIZE = 100;

    /** @var Typecho_Db */
    private $db;
    private $prefix;
    private $options;

    public function __construct($db, $options = null)
    {
        $this->db = $db;
        $this->prefix = $db->getPrefix();
        $this->options = $options ?: Typecho_Widget::widget('Widget_Options');
    }

    public function buildManifest()
    {
        return array(
            'source_url'        => rtrim($this->options->siteUrl, '/'),
            'plugin_version'    => defined('UtterlogSync_Plugin::VERSION') ? UtterlogSync_Plugin::VERSION : '0.1.0',
            'cms'               => 'typecho',
            'cms_version'       => isset($this->options->version) ? (string)$this->options->version : '',
            'site_name'         => (string)$this->options->title,
            'exported_at'       => gmdate('c'),
            'resources_planned' => self::RESOURCES,
            'counts'            => $this->collectCounts(),
        );
    }

    public function collectCounts()
    {
        return array(
            'categories' => $this->countMetas('category'),
            'tags'       => $this->countMetas('tag'),
            'posts'      => $this->countContents('post'),
            'pages'      => $this->countContents('page'),
            'comments'   => $this->countComments(),
        );
    }

    public function countResource($name)
    {
        switch ($name) {
            case 'categories': return $this->countMetas('category');
            case 'tags':       return $this->countMetas('tag');
            case 'posts':      return $this->countContents('post');
            case 'pages':      return $this->countContents('page');
            case 'comments':   return $this->countComments();
        }
        return 0;
    }

    public function getBatch($name, $offset, $limit)
    {
        $offset = max(0, (int)$offset);
        $limit  = max(1, min(1000, (int)$limit));
        switch ($name) {
            case 'categories': return $this->fetchMetas('category', $offset, $limit);
            case 'tags':       return $this->fetchMetas('tag', $offset, $limit);
            case 'posts':      return $this->fetchContents('post', $offset, $limit);
            case 'pages':      return $this->fetchContents('page', $offset, $limit);
            case 'comments':   return $this->fetchComments($offset, $limit);
        }
        return array();
    }

    // ------------------- metas (categories / tags) -------------------

    private function countMetas($type)
    {
        $row = $this->db->fetchRow($this->db->select(array('COUNT(mid)' => 'cnt'))
            ->from('table.metas')->where('type = ?', $type));
        return isset($row['cnt']) ? (int)$row['cnt'] : 0;
    }

    private function fetchMetas($type, $offset, $limit)
    {
        $rows = $this->db->fetchAll($this->db->select('mid', 'name', 'slug', 'description', 'parent')
            ->from('table.metas')
            ->where('type = ?', $type)
            ->order('mid', Typecho_Db::SORT_ASC)
            ->offset($offset)->limit($limit));
        $items = array();
        foreach ($rows as $row) {
            $slug = (string)$row['slug'];
            // Typecho 中文 slug 也常被 urlencode；解一次让 Utterlog 收到真实字符
            if (strpos($slug, '%') !== false) {
                $decoded = urldecode($slug);
                if ($decoded !== '' && $decoded !== false) $slug = $decoded;
            }
            $items[] = array(
                'source_id'   => (int)$row['mid'],
                'name'        => (string)$row['name'],
                'slug'        => $slug,
                'description' => (string)$row['description'],
            );
        }
        return $items;
    }

    // ------------------- contents (posts / pages) -------------------

    private function countContents($type)
    {
        $row = $this->db->fetchRow($this->db->select(array('COUNT(cid)' => 'cnt'))
            ->from('table.contents')
            ->where('type = ?', $type)
            ->where('status IN ?', array('publish', 'hidden', 'private', 'waiting')));
        return isset($row['cnt']) ? (int)$row['cnt'] : 0;
    }

    private function fetchContents($type, $offset, $limit)
    {
        $rows = $this->db->fetchAll($this->db->select(
                'cid', 'title', 'slug', 'created', 'modified', 'text', 'authorId',
                'type', 'status', 'password', 'commentsNum', 'allowComment', 'parent', 'views'
            )
            ->from('table.contents')
            ->where('type = ?', $type)
            ->where('status IN ?', array('publish', 'hidden', 'private', 'waiting'))
            ->order('cid', Typecho_Db::SORT_ASC)
            ->offset($offset)->limit($limit));

        $items = array();
        foreach ($rows as $row) {
            $cid = (int)$row['cid'];
            $text = $this->stripMarkdownFlag((string)$row['text']);
            $item = array(
                'source_id'        => $cid,
                'title'            => (string)$row['title'],
                'slug'             => (string)$row['slug'],
                'content'          => $text,
                'status'           => $this->mapContentStatus((string)$row['status']),
                'published_at_gmt' => gmdate('c', (int)$row['created']),
                'updated_at_gmt'   => gmdate('c', (int)$row['modified']),
                'excerpt'          => '',
                'featured_image_url' => null,
                'password'         => (string)$row['password'],
                'allow_comment'    => ((int)$row['allowComment']) === 1 || $row['allowComment'] === '1',
                'categories'       => $this->relatedMetaSlugs($cid, 'category'),
                'tags'             => $this->relatedMetaSlugs($cid, 'tag'),
            );
            if ((int)$row['views'] > 0) {
                $item['view_count'] = (int)$row['views'];
            }
            $items[] = $item;
        }
        return $items;
    }

    /** Typecho 用 <!--markdown--> 标记内容为 markdown；去掉后内容本身就是纯 markdown */
    private function stripMarkdownFlag($text)
    {
        return str_replace('<!--markdown-->', '', $text);
    }

    private function mapContentStatus($s)
    {
        // Typecho: publish / hidden / private / waiting / draft
        // Utterlog: publish / draft / private（兼容 WP）
        switch ($s) {
            case 'publish': return 'publish';
            case 'private': return 'private';
            case 'waiting': return 'pending';
            case 'hidden':
            case 'draft':
            default:        return 'draft';
        }
    }

    /** 查 content 关联的 metas slug 列表（按类型过滤） */
    private function relatedMetaSlugs($cid, $type)
    {
        $rows = $this->db->fetchAll($this->db->select('m.slug')
            ->from('table.relationships AS r')
            ->join('table.metas AS m', 'r.mid = m.mid')
            ->where('r.cid = ?', $cid)
            ->where('m.type = ?', $type));
        $out = array();
        foreach ($rows as $row) {
            $slug = (string)$row['slug'];
            if (strpos($slug, '%') !== false) {
                $decoded = urldecode($slug);
                if ($decoded !== '' && $decoded !== false) $slug = $decoded;
            }
            if ($slug !== '') $out[] = $slug;
        }
        return $out;
    }

    // ------------------- comments -------------------

    private function countComments()
    {
        $row = $this->db->fetchRow($this->db->select(array('COUNT(coid)' => 'cnt'))
            ->from('table.comments')
            ->where('type IN ?', array('', 'comment')));
        return isset($row['cnt']) ? (int)$row['cnt'] : 0;
    }

    private function fetchComments($offset, $limit)
    {
        $rows = $this->db->fetchAll($this->db->select(
                'coid', 'cid', 'created', 'author', 'mail', 'url', 'ip', 'agent',
                'text', 'type', 'status', 'parent'
            )
            ->from('table.comments')
            ->where('type IN ?', array('', 'comment'))
            ->order('coid', Typecho_Db::SORT_ASC)
            ->offset($offset)->limit($limit));

        $items = array();
        foreach ($rows as $row) {
            $coid = (int)$row['coid'];
            $item = array(
                'source_id'        => $coid,
                'source_post_id'   => (int)$row['cid'],
                'author_name'      => (string)$row['author'],
                'content'          => (string)$row['text'],
                'author_email'     => (string)$row['mail'],
                'author_url'       => (string)$row['url'],
                'author_ip'        => (string)$row['ip'],
                'status'           => $this->mapCommentStatus((string)$row['status']),
                'comment_date_gmt' => gmdate('c', (int)$row['created']),
                'parent_source_id' => (int)$row['parent'],
                'client_hints'     => null,
            );
            $agent = (string)$row['agent'];
            if ($agent !== '') $item['author_agent'] = $agent;
            $items[] = $item;
        }
        return $items;
    }

    private function mapCommentStatus($s)
    {
        // Typecho: approved / waiting / spam
        switch ($s) {
            case 'approved': return 'approved';
            case 'waiting':  return 'pending';
            case 'spam':     return 'spam';
            default:         return 'pending';
        }
    }
}
