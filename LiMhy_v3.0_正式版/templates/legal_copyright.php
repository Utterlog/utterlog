<?php 
/**
 * LiMhy - 原创架构声明
 * 
 * @package LiMhy
 * @version v3.0
 * @author  Jason（QQ：895443171）
 * @desc    系统架构简介、技术防线申明及开源许可约定
 */
declare(strict_types=1);

$adminEmail = defined('ADMIN_EMAIL') && ADMIN_EMAIL ? ADMIN_EMAIL : 'admin@example.com';
?>
<div class="container">
    <nav class="breadcrumb">
        <a href="<?=url()?>">首页</a> &gt; <span>原创声明</span>
    </nav>

    <article class="post-detail">
        <header class="post-detail__header">
            <h1 class="post-detail__title">原创与技术架构声明</h1>
            <div class="post-detail__meta">Originality, Defense Architecture & Copyright Statement</div>
        </header>

        <div class="post-detail__content prose">
            <h3>关于 LiMhy 系统架构</h3>
            <p>本站底层运行于 <strong>LiMhy</strong>。这是一套由 <strong>Jason</strong> 构建的零依赖原生 PHP 全栈架构。我们拒绝臃肿的第三方框架，致力于用极简的代码实现最高效的性能与安全。</p>
            
            <h3>核心防线矩阵</h3>
            <p>系统底层搭载了多维度的防御与性能优化模块：</p>
            <ul>
                <li><strong>无状态极速引擎：</strong> 原生 PHP 8+ 驱动，配合非阻塞视图渲染与静态资源自愈机制，实现极低延迟。</li>
                <li><strong>态势感知防火墙：</strong> 内置动态应用层防护（WAF），自动阻断扫描探测并提供设备级的物理封禁能力。</li>
                <li><strong>高并发数据削峰：</strong> 原创的底层数据流聚合模块，平滑处理高频数据写入，保障主线程绝对稳定。</li>
            </ul>

            <h3>访问合规与监控说明</h3>
            <p>基于技术开放原则，本站前端允许一定的技术观察，但严禁任何形式的恶意调试。底层的<strong>态势感知探针</strong>将无感捕获异常调试行为：</p>
            <ul>
                <li><strong>静默追踪：</strong> 越权操作、环境模拟或漏洞探测行为将被系统自动甄别并记录。</li>
                <li><strong>安全反制：</strong> 对于突破安全底线的访问，系统将自动下发熔断指令，包括但不限于动态 IP 阻断与设备物理拒载。</li>
            </ul>

            <h3>知识共享许可</h3>
            <p>本站系统架构思路及非特指的博文内容，均采用 <a href="https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh" target="_blank" rel="nofollow">知识共享 署名-非商业性使用-相同方式共享 4.0 国际许可协议</a> 进行许可。</p>
            <ul>
                <li><strong>署名：</strong> 请清晰标注系统代号 <strong>LiMhy</strong> 及作者，并保留返回源站的超链接。</li>
                <li><strong>非商业性使用：</strong> 严禁将本站代码及技术方案用于任何商业性贩售。</li>
            </ul>

            <h3>技术探讨联络</h3>
            <p>如需技术交流或合作授权，请通过以下方式联系：</p>
            <p>📬 <strong>Email：</strong> <a href="mailto:<?=e($adminEmail)?>"><?=e($adminEmail)?></a></p>
        </div>
    </article>
</div>
