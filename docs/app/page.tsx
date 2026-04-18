import DocLayout from '@/components/DocLayout';

export default function DocsHome() {
  return (
    <DocLayout currentPath="/">
      <h1>欢迎使用 Utterlog</h1>
      <p className="lede">
        Utterlog 是一个去中心化的独立博客联盟。每个站点各自部署、各自掌控数据，
        通过 <a href="https://utterlog.com">utterlog.com</a> 联盟互相发现、互关互访。
      </p>

      <h2>15 秒了解</h2>
      <ul>
        <li><b>自托管</b> — Go + PostgreSQL 单容器部署，所有数据存在你自己的服务器</li>
        <li><b>联盟</b> — 通过 <a href="https://utterlog.com">utterlog.com</a> 中心站发现其它站点，互关、互评、RSS 聚合</li>
        <li><b>统一账号</b> — 读者用 <a href="https://id.utterlog.com">Utterlog ID</a> 在任一联盟站评论、订阅、收藏</li>
        <li><b>开源</b> — AGPL-3.0，你 Fork 后就是你自己的</li>
      </ul>

      <h2>最快上手路径</h2>
      <p>准备一台 Linux 服务器（1 核 1GB 起），装过 Docker。然后运行：</p>
      <pre><code>curl -fsSL https://utterlog.io/install.sh | bash</code></pre>
      <p>
        脚本会自动拉镜像、生成随机数据库密码、启动容器。3 分钟后访问
        <code>你的域名/install</code> 创建管理员账号就能用。详见{' '}
        <a href="/install">安装指南</a>。
      </p>

      <h2>核心概念</h2>
      <ul>
        <li><a href="/federation">联盟 (Federation)</a> — Utterlog 去中心化架构的工作原理</li>
        <li><a href="/themes">主题系统</a> — 系统默认主题和自定义主题的分离机制</li>
      </ul>

      <h2>需要帮助？</h2>
      <p>
        这个文档站还在完善中。暂时找不到答案可以：
      </p>
      <ul>
        <li>在 <a href="https://github.com/utterlog/utterlog/issues" target="_blank" rel="noopener">GitHub Issues</a> 提问</li>
        <li>查 <a href="https://github.com/utterlog/utterlog">源码</a>，注释比一些文档还详细</li>
        <li>关注 <a href="https://utterlog.io/changelog">更新日志</a> 看新功能发布</li>
      </ul>
    </DocLayout>
  );
}
