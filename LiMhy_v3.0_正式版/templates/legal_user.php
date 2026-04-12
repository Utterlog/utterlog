<?php
/**
 * LiMhy - 访问用户协议
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    确立用户访问合规性约束与站点免责条款
 */
?>
<div class="container">
    <nav class="breadcrumb">
        <a href="<?=url()?>">首页</a> &gt; <span>用户协议</span>
    </nav>

    <article class="post-detail">
        <header class="post-detail__header">
            <h1 class="post-detail__title">用户协议</h1>
            <div class="post-detail__meta">User Agreement (Security Enhanced)</div>
        </header>

        <div class="post-detail__content prose">
            <p>欢迎访问 <?=e(SITE_NAME)?>。本站基于 <strong>LiMhy</strong> 构建。在使用服务前，请审慎阅读并同意本协议。</p>

            <h3>1. 安全机制触发约定</h3>
            <p>为保障数字资产安全，本站核心层部署了自动化防御引擎，您同意并接受：</p>
            <ul>
                <li>系统有权收集用于环境安全校验的浏览器特征信息。</li>
                <li>对于命中高危风险库的异常连接，系统将自动予以熔断。</li>
            </ul>

            <h3>2. 违规行为反制策略</h3>
            <p>本站对恶意渗透行为零容忍。系统将针对以下行为自动执行最高级别的网络及设备黑名单制裁：</p>
            <ul>
                <li>利用自动化脚本实施 CC 攻击或高频内容抓取。</li>
                <li>执行 SQL 注入、跨站脚本（XSS）或其他尝试绕过安全层的探测。</li>
                <li>发布破坏性或引导向恶意站点的违法信息。</li>
            </ul>

            <h3>3. 内容合规守则</h3>
            <p>用户发布的所有交互内容必须严格遵守所在地法律法规，不得传输任何危害国家安全、侵犯他人隐私及知识产权的非法内容。</p>

            <h3>4. 架构知识产权声明</h3>
            <p>本站依赖的 <strong>LiMhy Core</strong> 架构组件归属于系统原作者。严禁利用逆向工程提取底层防御算法结构。</p>

            <h3>5. 风险与免责</h3>
            <p>用户因主观恶意尝试触发防御机制而遭受的设备锁定、服务拒绝等后果，均由操作者自行承担，本站不提供解封义务。</p>
        </div>
    </article>
</div>
