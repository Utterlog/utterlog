import DocLayout from '@/components/DocLayout';

export const metadata = { title: '升级' };

export default function UpdatePage() {
  return (
    <DocLayout currentPath="/update">
      <h1>升级 Utterlog</h1>
      <p className="lede">
        两种方式：管理后台「版本」页一键升级，或 SSH 到服务器跑一条命令。
        <strong>任一方式都不会丢数据、配置或用户上传内容</strong>。
      </p>

      <h2>方式 A — 后台一键（推荐）</h2>
      <p>登录你的 Utterlog 后台 <code>/admin</code>，侧边栏进入「<strong>版本</strong>」页。</p>
      <ul>
        <li>显示当前运行版本（如 <code>sha-ac5f491</code>）</li>
        <li>实时比对 GitHub 最新发布</li>
        <li>可展开 changelog 看改动详情</li>
        <li>有新版时按钮变蓝「一键升级到 vX.X.X」</li>
      </ul>
      <p>
        点击后，Utterlog 会在容器内 detach 一个子进程，调用宿主的 docker socket：
      </p>
      <pre><code>docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml pull
docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml up -d --remove-orphans</code></pre>
      <p>
        api 容器自我替换，web 容器同样。约 15–30 秒后后台自动恢复，「版本」页会轮询 API
        恢复后显示新版本号。
      </p>
      <blockquote className="info">
        后台升级要求 <code>docker-compose.prod.yml</code> 已挂载
        <code>/var/run/docker.sock</code> 到 api 容器（默认已挂）。
        升级到的镜像地址由 <code>UTTERLOG_IMAGE_PREFIX</code> 决定：
        <code>registry.utterlog.io/utterlog</code>（默认）或 <code>ghcr.io/utterlog</code>。
      </blockquote>

      <h2>方式 B — 命令行</h2>
      <pre><code>cd /path/to/utterlog && curl -fsSL https://utterlog.io/update.sh | bash</code></pre>
      <p>等同于方式 A，但适合 cron、脚本化、或者后台出问题时的兜底方式。</p>

      <h2>升级会保留什么？</h2>
      <table>
        <thead><tr><th>内容</th><th>位置</th><th>升级后</th></tr></thead>
        <tbody>
          <tr>
            <td>PostgreSQL 数据</td>
            <td><code>./pgdata/</code> 或 volume <code>pgdata</code></td>
            <td>✓ 完整保留，schema 迁移由 API 启动时自动跑</td>
          </tr>
          <tr>
            <td>Redis 缓存</td>
            <td><code>./redisdata/</code> 或 volume</td>
            <td>✓ 保留（即使清了也只是丢缓存，无伤）</td>
          </tr>
          <tr>
            <td>用户上传的图片 / 附件</td>
            <td>volume <code>uploads</code></td>
            <td>✓ 保留</td>
          </tr>
          <tr>
            <td>用户自定义主题 / 插件</td>
            <td><code>uploads/themes/</code></td>
            <td>✓ 保留（不在镜像里）</td>
          </tr>
          <tr>
            <td>配置文件 <code>.env</code></td>
            <td>宿主机安装目录</td>
            <td>✓ 保留（镜像不动）</td>
          </tr>
          <tr>
            <td>系统自带主题 (azure / flux 等)</td>
            <td>镜像内 <code>/app/public/themes/</code></td>
            <td>↻ 自动替换为最新版本</td>
          </tr>
          <tr>
            <td>API 二进制 + admin SPA</td>
            <td>镜像内</td>
            <td>↻ 更新到最新 commit</td>
          </tr>
        </tbody>
      </table>

      <h2>回滚</h2>
      <p>
        如果新版本有严重问题，指定 <code>UTTERLOG_IMAGE_TAG</code> 回到已知好的版本：
      </p>
      <pre><code>{`# .env 里改
UTTERLOG_IMAGE_TAG=sha-61f8b60   # 或任何历史 commit 短 SHA

# 重启
docker compose -f docker-compose.prod.yml -f docker-compose.pull.yml up -d`}</code></pre>
      <p>
        所有历史镜像都在 registry 里，回滚到任意版本都可以。
      </p>

      <h2>数据库 schema 迁移</h2>
      <p>
        Utterlog 的 API 启动时会自动检查 schema 并在需要时执行 <code>ALTER TABLE ... ADD COLUMN IF NOT EXISTS</code>
        等安全语句。升级<strong>不需要</strong>手动跑迁移脚本，也不会破坏旧数据。
      </p>

      <h2>遇到问题？</h2>
      <ul>
        <li>看 <code>docker compose logs api --tail=100</code></li>
        <li>看升级日志：<code>cat ./uploads/upgrade.log</code>（后台升级时的输出）</li>
        <li>在 <a href="https://github.com/utterlog/utterlog/issues">GitHub Issues</a> 反馈</li>
      </ul>
    </DocLayout>
  );
}
