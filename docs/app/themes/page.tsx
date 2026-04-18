import DocLayout from '@/components/DocLayout';

export const metadata = { title: '主题' };

export default function ThemesPage() {
  return (
    <DocLayout currentPath="/themes">
      <h1>主题</h1>
      <p className="lede">
        Utterlog 支持系统自带主题和用户自定义主题。两者隔离存储，升级时系统主题会跟着镜像更新，
        你自己上传的主题不受影响。
      </p>

      <h2>系统自带主题</h2>
      <p>当前发行版附带：</p>
      <ul>
        <li><strong>Azure</strong> — 默认主题，简洁蓝色调</li>
        <li><strong>Flux</strong> — 动效优先，适合图文并茂的博客</li>
        <li><strong>Utterlog 2026</strong> — 极简直角设计系统</li>
      </ul>
      <p>
        在后台「主题」页一键切换。系统主题代码位于 API 镜像内的 <code>/app/public/themes/</code>，
        每次升级自动更新到最新版本。
      </p>

      <h2>用户自定义主题</h2>
      <p>
        上传自己的主题：后台「主题」→「上传主题」，选 <code>.zip</code> 包。
        存储位置是 <code>uploads/themes/&lt;slug&gt;/</code>（宿主机 bind-mount），<strong>升级镜像不会覆盖</strong>。
      </p>

      <h3>主题结构</h3>
      <pre><code>{`my-theme/
├── theme.json            # 元数据
├── screenshot.png        # 后台预览图 (800x600 推荐)
├── README.md             # 说明（可选）
└── templates/
    ├── home.html         # 首页
    ├── post.html         # 文章详情
    ├── archive.html      # 归档
    ├── category.html     # 分类页
    ├── tag.html          # 标签页
    └── partials/
        ├── header.html
        ├── footer.html
        └── comment.html`}</code></pre>

      <h3><code>theme.json</code> 字段</h3>
      <pre><code>{`{
  "name": "我的主题",
  "slug": "my-theme",
  "version": "1.0.0",
  "author": "作者名",
  "description": "主题一句话介绍",
  "preview": "screenshot.png",
  "compatibility": ">=1.0.0"
}`}</code></pre>

      <h2>模板引擎</h2>
      <p>
        Utterlog 用 Go 的 <code>html/template</code>。模板里能用这些上下文变量：
      </p>
      <ul>
        <li><code>{'{{ .Site }}'}</code> — 站点标题、URL、描述、logo 等</li>
        <li><code>{'{{ .Posts }}'}</code> — 文章列表（列表页）</li>
        <li><code>{'{{ .Post }}'}</code> — 当前文章（详情页）</li>
        <li><code>{'{{ .User }}'}</code> — 当前登录用户（未登录则 nil）</li>
        <li><code>{'{{ partial "header" . }}'}</code> — 引入 <code>templates/partials/header.html</code></li>
      </ul>
      <blockquote className="info">
        完整上下文结构见源码 <code>api/internal/theme/context.go</code>（注释里列了所有字段）。
      </blockquote>

      <h2>主题开发工作流</h2>
      <ol>
        <li>在本地开发：<code>git clone</code> 一个起始主题（推荐 fork Azure）</li>
        <li>运行 <code>docker compose up -d</code> 让 api 起来</li>
        <li>把你的主题目录 bind-mount 进 api 容器：<code>-v ./my-theme:/app/public/themes/my-theme</code></li>
        <li>后台切换到该主题，浏览器改模板立刻刷新可见</li>
        <li>稳定后打包成 <code>.zip</code> 分享给其他用户</li>
      </ol>

      <h2>分享主题</h2>
      <p>
        我们准备在 utterlog.com 联盟中心站做一个主题市场（等一批好主题出现后启用）。暂时可以：
      </p>
      <ul>
        <li>在 GitHub 上新建 <code>utterlog-theme-&lt;name&gt;</code> 仓库</li>
        <li>README 里贴上截图和 <code>utterlog.com/install-theme?url=...</code> 链接</li>
        <li>开 issue 到 <a href="https://github.com/utterlog/utterlog/issues">utterlog/utterlog</a> 请求添加到官方目录</li>
      </ul>

      <h2>下一步</h2>
      <ul>
        <li><a href="/plugins">插件</a>（类似机制，可扩展 API 和后台）</li>
        <li><a href="/update">升级</a>（了解升级时主题如何处理）</li>
      </ul>
    </DocLayout>
  );
}
