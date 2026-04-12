<?php
/**
 * LiMhy - 隐私政策声明
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    提供数据收集机制与底层安全防御的公开声明
 */
?>
<div class="container">
    <nav class="breadcrumb">
        <a href="<?=url()?>">首页</a> &gt; <span>隐私政策</span>
    </nav>

    <article class="post-detail">
        <header class="post-detail__header">
            <h1 class="post-detail__title">隐私政策</h1>
            <div class="post-detail__meta">Privacy Policy</div>
        </header>

        <div class="post-detail__content prose">
            <p>我们高度重视访客隐私。本政策详细说明了 <?=e(SITE_NAME)?> 如何处理您的数字足迹。</p>

            <h3>1. 安全技术与信息收集</h3>
            <p>为了防止恶意爬虫、CC 攻击及垃圾评论，本站底层集成了 <strong>LiMhy Defense 综合防御引擎</strong>：</p>
            <ul>
                <li><strong>设备指纹：</strong> 访问时，系统会通过底层接口生成唯一的设备识别码。该码不关联您的真实身份，仅用于识别恶意攻击设备。</li>
                <li><strong>持久化机制：</strong> 核心防御模块将依赖浏览器的本地存储功能以确保安全策略的连贯性。</li>
                <li><strong>审计溯源：</strong> 我们的态势感知组件会实时解析访问轨迹，异常行为将被自动拦截并上报记录。</li>
            </ul>

            <h3>2. 评论数据处理</h3>
            <p>发表评论时，您的电子邮箱将用于头像代理与回复通知。我们承诺绝不向任何未经授权的第三方分发您的联络方式。</p>

            <h3>3. 系统管理权限</h3>
            <p>系统管理员有权调取包含 IP 归属、历史互动轨迹及安全信誉评分的访问记录，并有权依据安全判定采取技术制裁。</p>
        </div>
    </article>
</div>
