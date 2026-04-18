import DocLayout from '@/components/DocLayout';

export const metadata = { title: '联盟 (Federation)' };

export default function FederationPage() {
  return (
    <DocLayout currentPath="/federation">
      <h1>联盟 (Federation)</h1>
      <p className="lede">
        Utterlog 是一个<strong>联邦式</strong>的博客系统：每个站点独立部署、独立存储，
        通过 utterlog.com 联盟中心站和 id.utterlog.com 账号中心互相发现、互相访问。
      </p>

      <h2>设计原则</h2>
      <ul>
        <li><strong>你的数据始终在你的服务器</strong> — 中心站只存元数据（站名、URL、头像），从不镜像你的文章内容</li>
        <li><strong>退出联盟不损失任何内容</strong> — 只是中心站的发现页找不到你，但博客本体完好</li>
        <li><strong>没有审查权</strong> — 中心站无法让你下线，也无法修改你的内容</li>
        <li><strong>没有 SaaS 绑定</strong> — 联盟本身也是开源的，可以 fork 出自己的联盟中心</li>
      </ul>

      <h2>三个角色</h2>
      <table>
        <thead><tr><th>站点</th><th>角色</th><th>存什么</th></tr></thead>
        <tbody>
          <tr>
            <td><code>blog.example.com</code></td>
            <td>独立博客（就是你自己的 Utterlog 实例）</td>
            <td>全部内容：文章、评论、媒体、用户</td>
          </tr>
          <tr>
            <td><code>utterlog.com</code></td>
            <td>联盟中心</td>
            <td>站点目录（友链广场）、RSS 聚合索引</td>
          </tr>
          <tr>
            <td><code>id.utterlog.com</code></td>
            <td>账号中心</td>
            <td>读者账号、OAuth tokens、passkey 凭据</td>
          </tr>
        </tbody>
      </table>

      <h2>读者跨站评论如何发生</h2>
      <ol>
        <li>读者在 A 站点的文章下点「评论」</li>
        <li>A 站点发现当前浏览器没有登录 Utterlog ID，弹出 OAuth 授权窗</li>
        <li>窗口跳到 <code>id.utterlog.com/oauth/authorize</code>，读者用自己已有的 Utterlog ID 登录（或注册）</li>
        <li>id.utterlog.com 签发 access_token 回给 A 站点</li>
        <li>A 站点把评论写入<strong>自己</strong>的数据库，并记录评论者的 Utterlog ID 用户名</li>
        <li>同一读者随后访问 B 站点时，自动识别同一 Utterlog ID，评论立刻可发</li>
      </ol>
      <blockquote className="info">
        关键：评论内容存在 A 站点，不在 id.utterlog.com，也不在 utterlog.com。中心站完全不碰内容层。
      </blockquote>

      <h2>加入 / 退出联盟</h2>
      <p>
        当前版本联盟加入是<strong>管理员在后台主动申请</strong>的：后台 →「联盟」→ 填站名/简介/分类 → 提交给 <a href="https://utterlog.com">utterlog.com</a> 中心站审核。
        通过后你的站出现在 utterlog.com 的博客目录和 RSS 聚合里。
      </p>
      <p>
        <strong>退出</strong>：后台同一处点「退出联盟」即可。中心站收到请求后会删除目录条目。
        你的读者依然可以直接访问 <code>blog.example.com</code>，只是在 utterlog.com 搜不到你了。
      </p>

      <h2>自建联盟中心</h2>
      <p>
        utterlog.com 本身也是个 Utterlog 实例（启用了「中心站」模式）。如果你想搭私有联盟（比如
        公司内部博客群、学校论坛等），也可以 fork 源码自己跑一个。
      </p>
      <p>未来会写详细的「自建联盟中心」指南，暂时可参考 <a href="https://github.com/utterlog/utterlog/tree/main/hub" target="_blank" rel="noopener">hub/</a> 目录。</p>

      <h2>相关</h2>
      <ul>
        <li><a href="/id">Utterlog ID</a> — 账号中心的详细行为</li>
        <li><a href="/data-safety">数据保护</a> — 升级、备份、灾难恢复时数据怎么处理</li>
      </ul>
    </DocLayout>
  );
}
