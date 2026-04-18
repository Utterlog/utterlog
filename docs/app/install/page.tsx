import DocLayout from '@/components/DocLayout';

export const metadata = { title: '安装' };

export default function InstallPage() {
  return (
    <DocLayout currentPath="/install">
      <h1>安装</h1>
      <p className="lede">
        Utterlog 只依赖 Docker。几行命令即可在任何 Linux 发行版上跑起来。
      </p>

      <h2>要求</h2>
      <table>
        <thead><tr><th>资源</th><th>最低</th><th>推荐</th></tr></thead>
        <tbody>
          <tr><td>内存</td><td>1 GB</td><td>2 GB+</td></tr>
          <tr><td>磁盘</td><td>5 GB</td><td>20 GB+（含上传素材）</td></tr>
          <tr><td>CPU</td><td>1 核</td><td>2 核</td></tr>
          <tr><td>系统</td><td colSpan={2}>任何支持 Docker Engine 的 Linux（Debian/Ubuntu/RHEL/Alpine 等）</td></tr>
        </tbody>
      </table>

      <h2>一行命令安装</h2>
      <pre><code>curl -fsSL https://utterlog.io/install.sh | bash</code></pre>
      <p>脚本会依次：</p>
      <ol>
        <li>检查 Docker + docker-compose-plugin（缺了会提示安装命令）</li>
        <li>拉取 Utterlog 源（优先 git clone，失败降级为 tarball）到 <code>./utterlog/</code></li>
        <li>生成 <code>.env</code>，随机化 <code>DB_PASSWORD</code> 和 <code>JWT_SECRET</code></li>
        <li>自动检测 <code>9260</code> 端口占用，占用则顺延</li>
        <li><code>docker compose up -d</code> 启动四个容器（api、web、postgres、redis）</li>
      </ol>

      <blockquote className="info">
        <strong>默认镜像源：</strong> <code>registry.utterlog.io</code>（CF 加速 + CN 反代节点）。
        全球用户可切换到 GHCR：<br />
        <code>REGISTRY=ghcr.io/utterlog curl -fsSL https://utterlog.io/install.sh | bash</code>
      </blockquote>

      <h2>配置反向代理</h2>
      <p>
        API 默认绑在 <code>127.0.0.1:9260</code>，不对外开放。需要你自己的 nginx / caddy
        反代到公网端口。最小 nginx 片段：
      </p>
      <pre><code>{`server {
    listen 443 ssl http2;
    server_name blog.example.com;
    ssl_certificate     /path/to/fullchain.pem;
    ssl_certificate_key /path/to/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:9260;
        proxy_set_header Host              \$host;
        proxy_set_header X-Real-IP         \$remote_addr;
        proxy_set_header X-Forwarded-For   \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}`}</code></pre>
      <p>Caddy 用户更简单：</p>
      <pre><code>{`blog.example.com {
    reverse_proxy 127.0.0.1:9260
}`}</code></pre>

      <h3>让 Utterlog 自带 Caddy（可选）</h3>
      <p>
        如果你服务器上<strong>没有</strong>任何其他反向代理，可以让 Utterlog 直接接管 443：
      </p>
      <pre><code>DOMAIN=blog.example.com curl -fsSL https://utterlog.io/install.sh | bash</code></pre>
      <p>它会启用内置 Caddy 容器，自动申请 Let&apos;s Encrypt 证书。</p>

      <h2>完成安装向导</h2>
      <p>
        浏览器访问 <code>https://blog.example.com/install</code>，按三步向导走：
      </p>
      <ol>
        <li><strong>数据库</strong> — 已预填 Docker 默认值，点「测试连接」成功后下一步</li>
        <li><strong>Redis</strong> — 同上</li>
        <li><strong>管理员</strong> — 填邮箱、密码、站点标题和 URL，点「开始安装」</li>
      </ol>
      <p>
        完成后会显示<strong>凭据摘要页</strong>，列出数据库密码、JWT secret、管理员账号等全部信息。
        <strong>此页只显示一次</strong> — 请先点「复制全部」或「导出 TXT」保存到安全位置。
      </p>

      <h2>下一步</h2>
      <ul>
        <li><a href="/update">如何升级 Utterlog</a>（后台一键 + 命令行两种方式）</li>
        <li><a href="/reverse-proxy">反向代理完整配置</a>（nginx / Caddy / Traefik / OpenResty）</li>
        <li><a href="/backup">备份与恢复</a></li>
      </ul>
    </DocLayout>
  );
}
