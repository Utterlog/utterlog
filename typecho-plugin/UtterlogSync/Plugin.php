<?php
/**
 * 把 Typecho 的分类、标签、文章、独立页面和评论一键推送到 Utterlog。
 * 与 WordPress 版插件协议完全一致 —— 服务端 /api/v1/sync/typecho/*
 * 是 /api/v1/sync/wordpress/* 的别名（同一组 handler）。
 *
 * @package UtterlogSync
 * @author Utterlog
 * @version 0.1.0
 * @link https://utterlog.io/plugins
 */

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

require_once dirname(__FILE__) . '/lib/Exporter.php';
require_once dirname(__FILE__) . '/lib/Client.php';
require_once dirname(__FILE__) . '/lib/Logger.php';

class UtterlogSync_Plugin implements Typecho_Plugin_Interface
{
    const VERSION = '0.1.0';

    public static function activate()
    {
        Helper::addPanel(3, 'UtterlogSync/panel.php', 'Utterlog 同步', 'Utterlog 同步管理', 'administrator');
        Helper::addAction('utterlog-sync', 'UtterlogSync_Action');
        return _t('插件已激活。前往「控制台 → Utterlog 同步」配置接收地址、Site UUID 和 Token，再点「开始推送」。');
    }

    public static function deactivate()
    {
        Helper::removePanel(3, 'UtterlogSync/panel.php');
        Helper::removeAction('utterlog-sync');
    }

    public static function config(Typecho_Widget_Helper_Form $form)
    {
        $intro = new Typecho_Widget_Helper_Layout();
        $intro->html('<div style="background:#f8f8f8;border:1px solid #e8e8e8;padding:14px 16px;margin-bottom:18px;line-height:1.7;">'
            . '<h4 style="margin:0 0 6px;">Utterlog Sync</h4>'
            . '<p style="margin:0;color:#555;">把当前 Typecho 站点的内容（分类 / 标签 / 文章 / 独立页面 / 评论）通过 HTTP 推送到一个 Utterlog 实例。媒体由目标站扫描文章内容并按 <code>source_url</code> 抓取。</p>'
            . '<p style="margin:6px 0 0;color:#555;">先在 Utterlog 后台「工具 → Typecho 同步」生成 Site UUID + Token，再回到本页填入。</p>'
            . '</div>');
        $form->addItem($intro);

        $url = new Typecho_Widget_Helper_Form_Element_Text(
            'utterlog_url', null, '',
            _t('Utterlog 接收地址'),
            _t('例如 https://your-utterlog.example.com。迁移阶段可填 http://IP:端口，不必等域名接入。')
        );
        $form->addInput($url);

        $uuid = new Typecho_Widget_Helper_Form_Element_Text(
            'site_uuid', null, '',
            _t('目标站点 UUID'),
            _t('在 Utterlog 后台「工具 → Typecho 同步 → 新建授权」生成。')
        );
        $form->addInput($uuid);

        $token = new Typecho_Widget_Helper_Form_Element_Text(
            'sync_token', null, '',
            _t('同步 Token'),
            _t('与 UUID 同时生成，只展示一次。服务端 bcrypt 存储，丢失需重新生成。')
        );
        $form->addInput($token);

        $batch = new Typecho_Widget_Helper_Form_Element_Text(
            'batch_size', null, '100',
            _t('批大小'),
            _t('每批推送的条目数。20-1000，大站点建议 100-300。')
        );
        $form->addInput($batch);

        $timeout = new Typecho_Widget_Helper_Form_Element_Text(
            'timeout', null, '60',
            _t('请求超时（秒）'),
            _t('单次 HTTP 请求超时。慢网络可调高到 120-180。')
        );
        $form->addInput($timeout);

        $verify = new Typecho_Widget_Helper_Form_Element_Radio(
            'verify_ssl',
            array('1' => '验证', '0' => '不验证（仅当目标用 https://IP 且证书不匹配时关闭）'),
            '1',
            _t('SSL 证书校验'),
            _t('纯 http:// 不受此项影响。')
        );
        $form->addInput($verify);
    }

    public static function personalConfig(Typecho_Widget_Helper_Form $form) {}
}
