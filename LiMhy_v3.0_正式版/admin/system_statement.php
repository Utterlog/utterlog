<?php
declare(strict_types=1);
require_once __DIR__ . '/../index.php';
require_admin();
$currentNav = 'system_statement';
$pageTitle = '系统声明';
ob_start();
?>
<style>
.statement-wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:20px}.statement-card{background:var(--color-bg-white);border:1px solid var(--color-border);border-radius:var(--radius-l);padding:22px}.statement-card h3{margin:0 0 12px;color:var(--color-text-1)}.statement-card p,.statement-card li{color:var(--color-text-2);line-height:1.9}.statement-list{margin:0;padding-left:18px}.statement-badge{display:inline-flex;align-items:center;height:28px;padding:0 12px;border-radius:999px;background:rgba(59,130,246,.12);color:#1d4ed8;font-size:12px;font-weight:700}.statement-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.statement-mini{border:1px solid var(--color-border);border-radius:14px;padding:16px;background:var(--color-fill,#f8fafc)}@media(max-width:900px){.statement-wrap,.statement-grid{grid-template-columns:1fr}}
</style>
<div class="statement-wrap">
  <section class="statement-card">
    <div class="card-title"><i class="ri-book-open-line"></i> 系统声明</div>
    <p style="margin-top:10px;">这是一套面向个人博主与独立站长的完整博客系统。它不仅有文章、评论、主题和插件，还内置了一整套防御系统，帮助站长更轻松地看见风险、解释风险、处理风险。</p>
    <div style="display:flex;gap:10px;flex-wrap:wrap;margin:14px 0 6px;">
      <span class="statement-badge">LiMhy v3.0</span>
      <span class="statement-badge">原生 PHP 全栈系统</span>
      <span class="statement-badge">内建防御系统</span>
    </div>
    <h3>这套系统主要能做什么？</h3>
    <ul class="statement-list">
      <li>管理文章、评论、动态、独立页面、主题与插件。</li>
      <li>通过访问日志、F12 探针、信誉中心、决策中心和原因时间线，帮助站长看懂异常访问。</li>
      <li>把风险从“黑盒判断”变成“看得见、讲得清、可人工处理”的产品型防御体验。</li>
    </ul>
    <h3>为什么重点突出防御系统？</h3>
    <p>因为很多站长并不懂安全，但他们仍然需要知道：是谁在试探、为什么会被加分、什么时候该观察、什么时候该封禁。LiMhy 的防御系统就是为了把这些专业问题翻译成普通人也能看懂的后台信息。</p>
  </section>
  <aside class="statement-card">
    <div class="card-title"><i class="ri-shield-check-line"></i> 防御系统说明</div>
    <div class="statement-grid" style="margin-top:12px;">
      <div class="statement-mini"><strong>访问日志</strong><p>记录请求来源、路径、设备与轨迹。</p></div>
      <div class="statement-mini"><strong>F12 探针</strong><p>记录前台开发者工具调试与异常窥探行为。</p></div>
      <div class="statement-mini"><strong>信誉中心</strong><p>综合载荷、频率、路径、设备、ASN 等维度计算风险分。</p></div>
      <div class="statement-mini"><strong>决策中心</strong><p>把信誉分转成“观察、挑战、限制、封禁”的动作建议。</p></div>
      <div class="statement-mini"><strong>原因时间线</strong><p>把关键事件按时间串起来，方便排查误伤与追踪原因。</p></div>
      <div class="statement-mini"><strong>人工预处理</strong><p>支持信誉清零、清除 IP 历史、封禁与解封，适合误触后的恢复处理。</p></div>
    </div>
  </aside>
</div>
<div class="statement-wrap" style="margin-top:20px;grid-template-columns:1fr;">
  <section class="statement-card">
    <div class="card-title"><i class="ri-file-warning-line"></i> 用户声明与版权声明</div>
    <p><strong>用户声明：</strong>本系统用于博客建站与站点安全管理，请勿用于违法违规用途。站长应自行保管后台账户、服务器权限与数据备份。</p>
    <p><strong>版权声明：</strong>未经允许授权，严禁二次开发后进行出售、分发、倒卖或冒名发布。系统作者为 <strong>Jason</strong>。若需商业授权、深度定制或合作，请先取得作者许可。</p>
    <p><strong>给小白用户的话：</strong>你不需要先学会安全，先会看后台就行。看到风险时，先看“原因时间线”和“决策中心”，再决定是观察、放行还是封禁。遇到误伤，可以使用信誉清零与清除历史记录来预处理。</p>
  </section>
</div>
<?php
$content = ob_get_clean();
require __DIR__ . '/layout.php';
