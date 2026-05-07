# 更新日志

本文件记录 Utterlog 的版本变更。版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

发布说明统一使用中文分类，每个版本固定保留四个段落：`新增`、`优化`、`修复`、`移除`。
Docker 镜像地址不写入更新日志；镜像发布由 GitHub Actions 的 Docker workflow 自动处理。

## 未发布

### 新增

暂无。

### 优化

暂无。

### 修复

暂无。

### 移除

暂无。

## [2.3.4] - 2026-05-07

### 新增

- **版本检查走 utterlog.io 自家代理（不再依赖 GitHub API）**：之前每个用户的 admin 后台都直接打 `api.github.com/repos/utterlog/utterlog/releases/latest`，匿名 60/h 配额（按 IP 计）经常爆 → 403 → 升级面板看不到新版本号。新架构：utterlog-landing 站构建期跑 `scripts/build-api-cache.js`，用 GitHub Actions 的 `GITHUB_TOKEN` 拉一次 release 列表，写到 `public/api/version.json` 和 `public/api/releases.json` 静态文件 → next build 自动导出 → Cloudflare CDN 缓存。所有用户的 utterlog 后台改成查 `https://utterlog.io/api/version.json`，**单一 token 在 landing 上，N 个用户共享同一份缓存，永远不会 rate-limit**。用户**不用配任何 GitHub Token**，开箱即用；国内访问也比直连 `api.github.com` 快得多。GitHub API 仍然是 fallback，主路径失败时自动切换。
- **`version_source_url` admin 选项**：私有部署 / 企业 fork 想用自己的 mirror，可以在 admin options 加 `version_source_url`（如 `https://your-mirror.example.com`），代码会自动去 `<url>/api/version.json` 拉取。空 → 用默认 utterlog.io。

### 优化

- **升级日志输出格式参考 1Panel**：原 `[2026-05-07T15:30:20Z] sidecar starting in /opt/...` 改成 `2026/05/07 23:30:20 升级应用 [Utterlog] 任务开始 [START]` 风格 —— 时间戳本地时区 + 中文动作 + `[对象]` + 状态/`[标记]`，每一步语义清晰。容器名（`[utterlog-pancn-api-1]`）、安装目录、镜像 tag、digest 全部动态显示在日志里，肉眼能确认探测正确。
- **后台升级日志面板高亮**：`SystemUpdatePanel.tsx` 新增 `highlightLogLine(line)` 函数，按语义着色：时间戳 → 暗灰 / `[START]` `[TASK-END]` → 琥珀加粗 / `[xxx]` 容器名/路径/镜像 → 天蓝 / `成功` → 亮绿 / `WARN` → 黄 / `ERROR` `失败` → 红。容器外观也调整：背景 `#0f172a` → 更深的 `#0a0e1a`（终端感）+ 圆角 6px + 顶部状态徽标分割线 + max-height 280 → 360px。
- **GFM 表格在 changelog 渲染中支持**：admin 后台 `SystemUpdatePanel.tsx` 的 `renderChangelog()` 之前不识别 `| col1 | col2 |` + `|---|---|` 表格语法，release notes 里的对比表都显示成原文 raw 字符。补上 GFM table parser → 输出 `<table class="changelog-table">`，新增 CSS（紧凑边框 + 表头浅灰底 + zebra 行）。`---` 分隔线 → `<hr/>` 也补上。utterlog-landing 的 `app/changelog/page.tsx` 同步修复。
- **后台升级面板"更新内容"标题只显示版本号**：`{info.latest.name || info.latest.version}` 改成 `{info.latest.version}`。GitHub release name 经常是 `v2.3.3 — upgrade works on any compose project name` 这种长描述，标题里啰嗦。现在固定显示 `更新内容 — v2.3.3`。配套：把 GitHub releases 上的 v2.3.1 / v2.3.2 / v2.3.3 标题改成纯版本号，v2.0.2 补上 `v` 前缀。

### 修复

- 暂无。

## [2.3.3] - 2026-05-07

### 修复

- **后台一键升级在自定义 compose 项目名下静默失败**：sidecar 脚本写死 `docker inspect utterlog-api-1`，但 docker compose 给容器命名是 `<project>-<service>-<index>` —— 项目名取决于安装目录的 basename（或 `COMPOSE_PROJECT_NAME` env / `name:` 字段）。装在 `/opt/utterlog-pancn/`（1Panel 默认）/ `/root/my-blog/` 等任何非 `/opt/utterlog/` 路径，容器都叫 `utterlog-pancn-api-1` / `my-blog-api-1`，全部 `docker inspect` 调用都拿不到容器，健康检查 120s 干等到超时，admin UI 报 "升级未生效"。
- **修复方案**：`api/internal/handler/system_version.go` 新增 `apiContainerName()` 助手 —— api 进程用 `os.Hostname()`（docker 默认把 hostname 设成短 ID）+ `docker inspect <id>` 反查自己的真实容器名；`webContainerName(api)` 通过 `com.docker.compose.project` label 反查同项目里的 web 容器。所有原本写死 `utterlog-api-1` 的地方（`probeComposeWorkingDir` / `probeAPIUploadsMountSource` / sidecar 健康检查 loop / sidecar 终态 digest 输出）改成用动态名字；sidecar 启动时通过 `API_CONTAINER` / `WEB_CONTAINER` 环境变量传递。
- **覆盖面**：未来任何用户不管装在哪个目录、用什么 compose project 名（`utterlog` / `utterlog-pancn` / `my-blog` / 大写小写下划线），后台升级按钮都能找到自己的容器、正确执行 pull / recreate / health check。
- **GitHub API 403 rate-limit**：`api/internal/handler/system_version.go` 三个 GitHub API 调用（`releases/latest` / `releases?per_page=20` / `commits/{tag}`）都没鉴权，云出口共享 IP 的 60/h 匿名配额一打就爆。新增 `applyGitHubHeaders(req)` 助手，admin 配了 `github_access_token` / `coding_github_token` 时自动加 `Authorization: Bearer ...`，配额从 60/h 涨到 5000/h。403 错误信息也明确化（提示去后台填 token），不再是裸的 "github API 403: ..."。
- **后台升级面板"升级未生效"误报**：`SystemUpdatePanel.tsx` 的 `verifyUpgradeApplied` 之前只看 version 字符串严格相等，dev 安装（BuildVersion='dev' 永不变）/ 生产 `:latest` 还没同步 / 用户 compose 锁定具体 tag 这些场景都会被卡 60s 然后误报 "升级未生效"。改成三层成功信号（version 等式 / commit 变化 / built_at 变化）任一命中即成功，超时 60s → 180s，错误信息显示实际拿到的 version + commit。
- **生产 named volume 模式下 sidecar 日志看不到**：`docker-compose.prod.yml` 用 `uploads:/app/public/uploads`（命名卷），api 读卷里的 upgrade.log；sidecar 写到 `$INSTALL_DIR/uploads/upgrade.log`（宿主目录），两个完全不同的物理文件，admin 看不到 sidecar 真实输出。新增 `probeAPIUploadsMountSource()` 探测 api 容器 `/app/public/uploads` 的实际挂载源（bind 返宿主路径 / volume 返卷名），api 启动 sidecar 时把同一个源也挂载给 sidecar（`-v <source>:/api-uploads` + `API_UPLOADS_DIR=/api-uploads`），双方写读同一个文件。
- **安装目录写死 `/opt/utterlog`**：`runUpgrade()` 之前默认 `installDir = /opt/utterlog`，1Panel 装在 `/opt/utterlog-pancn/` 或自定义路径直接报"找不到 docker-compose 文件"。新增 `probeComposeWorkingDir()` 用 `com.docker.compose.project.working_dir` label 自动探测真实路径，环境变量 / 兜底逻辑保留。

## [2.3.2] - 2026-05-07

### 新增

- **Nebula 顶部进度条 `<TopProgress />`**：拦截全站 `<a>` 点击 + `popstate`，路由切换时顶部 2px 蓝色进度条带流光动画爬到 90%、`usePathname` 变化后跳到 100% 淡出；10s 兜底超时；支持 capture 阶段拦截，避免被业务 `stopPropagation` 截掉。
- **首页分类 tabs stagger fade-in**：切分类时旧卡片留位 + `.is-loading` 半透明，新数据回来用 `nebulaListItemIn` 关键帧错峰 30ms 飘入；按钮 hover `translateY(-1px)`、`:active` `scale(0.96)` 弹簧反馈；`prefers-reduced-motion` 自动关掉动效。
- **Nebula footer 回到顶部按钮**：贴在 footer 右内边距 20px、垂直居中、container 之外，36×36 squircle + 毛玻璃 + 蓝细边；滚动 ≤ 400px 时 visibility:hidden 占位不抖动；hover scale(1.12)。
- **Header logo / 站名 hover 中心放大**：logo 图块 / 渐变 mark / 纯文字站名都加 `transform-origin: center` + 弹簧 cubic-bezier 过渡，hover 1.15x；纯文字模式 `display: inline-block` 让 transform 生效。
- **/search 搜索结果页与 header 弹出搜索框样式统一**：input 44px 胶囊形 + 左 leading 放大镜 + sky 蓝胶囊 submit 按钮（深底字），共用一套 Nebula 视觉语言。
- **Nebula 段落点评弹窗改 `position: fixed`**：基于 trigger `getBoundingClientRect` 实时计算 `left/top`，监听 `.blog-main` + window 滚动 + resize 同步跟随；视口右溢出自动左移、最左 12px 安全边距。彻底脱离文档流，不被父级 overflow 裁切，绝不影响段落 box。
- **OG / Twitter Card 图片兜底**：`/[...permalink]` 路由原本只设 title/description，没 og:image —— 社交平台分享出来一直是占位卡片。现在跟 `/posts/[slug]` 一样用 `post.cover_url` 优先 + `randomCoverUrl(post.id)` 兜底，X / Telegram / 微信抓出来都有大图特色封面。

### 优化

- **代码块底色 `#0a0d14`**：之前 `--nebula-input` 是 `#121212`，跟文章卡片底色 `#131314` 仅差 1 个亮度档，代码块边界肉眼看不出来。改成更深的蓝调近黑（GitHub-style 嵌入感）。Prism token 配色（蓝/绿/橙/黄）在新底色上对比度更高、更易读。
- **页脚四个图标按钮统一成"logo 框"风格**：音乐 / RSS / Utterlog logo / 登录 全部 24×24 squircle + `border: 1px solid rgba(128,207,255,0.2)` + 半透深底，图标 16×16 居中。RSS 图标从 `fa-square-rss` 换成 `fa-rss`（外层方框已由按钮自身提供，避免方中带方）；登录占位 `fa-light fa-user` → `fa-solid` 跟其它视觉重量对齐。删掉了之前重复声明 `.nebula-footer-auth-btn` 的旧规则（让登录按钮用统一规则）。
- **Footer 已登录菜单对齐**：`.nebula-footer-login-menu-item` 全部规则加 `!important`（特异性 0,2,0），覆盖 `.nebula-footer-links a` (0,2,1) 偷过来的 `padding: 4px 8px / gap: 4px / font-size: 12px`。现在 `<Link>(a)` 和 `<button>` 两种 tag 视觉完全一致：相同 padding/gap、图标固定 16px 列宽、基线对齐。
- **ICP 备案盾形 icon 默认翻灰**：之前 `fill: var(--nebula-blue-accent) !important` 永久覆盖成蓝色，跟旁边备案号"默认灰、hover 高亮"的一致体验对不上。现在默认 `fill: rgba(225,231,238,0.5)` + hover 才恢复天蓝，加 `transition: fill 0.2s` 平滑淡入。
- **AIReaderChat 折叠卡片样式精炼**：右侧多余的 `fa-message-bot` 图标删掉；卡片 `border-radius: 12px` + `backdrop-filter: blur(20px) saturate(160%)` 毛玻璃 + 蓝细边；折叠态 hover 上抬 1px + 蓝边亮档 + 蓝光阴影；AI 角标 / 用户气泡 / 发送按钮全部翻 sky 蓝底 + navy 深字（跟"提交评论"按钮一致的对比策略）；推荐问题按钮加 hover 反馈。
- **AIReaderChat / AIChatBubble 取最后一个 `<footer>`**：Nebula 的 PostPage 里有内嵌的 `<footer class="nebula-post-foot">` 装文章 tags，DOM 顺序在主 `.nebula-footer` 之前。`querySelector('footer')` 拿到它就让陪读卡片去躲那个内层 footer，结果反而被推到视口顶部。改成 `querySelectorAll('footer')` 取最后一个。
- **AIReaderChat scroll-aware lift 加上限**：用 `cardRef` 实测卡片高度，`maxLift = viewportH - cardH - 16` 双向 clamp；`rect.top` 用 `Math.max(0, ...)` 兜底。在小视口 / footer 巨大 / footer 已滑过视口顶部等极端场景下卡片不再消失。
- **Nebula AI 聊天气泡（AIChatBubble）暗色适配**：用类钩子（`.ai-chat-bubble-fab` / `-panel` / `-msg--user|assistant` / `-input` / `-send` 等）整体翻深；浮标和发送按钮用 sky 蓝 + navy 深字；assistant 气泡半透蓝调 + 蓝细边。
- **段落点评弹窗暗色 + 抬升一档**：`.block-annotation-panel` 用 `#1a1d22`（比 `#121212` 浮起一档）+ 蓝细边 + 双层阴影 + 毛玻璃；输入框单独翻 `rgba(0,0,0,0.35)` 避免再次撞色。
- **LatestCommenters 头像去重**：之前用 `(author_name || author || author_email || id).toLowerCase()` 单一兜底字段，同一人不同评论里 name 大小写 / 空白 / 空缺不一致就 dedup 失效。改成 `email + name + avatar_url` 三键交叉判断，任一命中就跳过。
- **代码高亮 Prism token 配色**：之前 `pre code { color: var(--nebula-white) !important }` (specificity 0,4,2) 把 prism-tomorrow 所有 `.token.x` (0,2,0) 都吞掉，代码块一片白。去掉 white 强制覆盖 + 新增 Nebula 蓝调专属 token 调色板（keyword/string/number/property/tag/operator 各自配色）。
- **首页"边读边聊"卡片下沉避让 footer**：之前用静态 `footer.offsetHeight` 当 bottom，卡片永远悬浮在半空 + 滚到底盖住 footer 顶部（吃掉回到顶部按钮）。改成跟 MiniMusicPlayer 一致的 scroll-aware lift：默认 `bottom: 24` 贴底，footer 进入视口才上推。
- **字体托管全部转到 static.utterlog.com**：`Google Sans` / `Google Sans Text` → `Google Sans Display`（一套字重）；`Noto Sans SC` 也从 Google Fonts 换成自托管。Nebula 主题不再依赖 fonts.googleapis.com，国内访问更快。

### 修复

- **博主回复评论会发邮件**：`sendCommentNotifications` 的 reply 路径只检查 parent 是否 admin、不检查 sender 是否 admin。改成算完 `senderIsAdmin` 后直接 early-return，admin 的所有评论 / 回复一律跳过两条邮件路径。
- **评论邮件里访客信息不全**：原代码 `go LookupAndStoreGeo(...)` 和 `go sendCommentNotifications(...)` 两个 goroutine 并行起跑，邮件几乎一定先于地理查询完成 → 模板里 `{{.IPLocation}}` / `{{.CountryCode}}` 全空。改成同一个 goroutine 串行，邮件能拿到完整 IP + 国旗 + 城市/省份。
- **AIReaderChat × 关闭按钮无响应**：组件订阅了 `dismiss()` 但没读 store 的 `dismissed` 状态，也没调 `mount()`。补上 `useReaderChatStore(s => s.dismissed)` 订阅 + `mount()/unmount()` 生命周期 + `if (dismissed) return null`。点 × 立刻消失，强制刷新或切文章才会重新出现。
- **博主评论显示等级标签**：`comment.level && comment.level > 0` 没排除 admin —— 博主自带 crown 角标，又叠一个 `Lv.x` 标签视觉冗余。所有 5 处 CommentList 加 `!comment.is_admin` 排除。
- **首页 AIChatBubble 整体浅色**：组件 inline 写死白底 + #1a1a1a 字 + 蓝按钮白字，跟 Nebula 暗主题撞色。补上类钩子 + Nebula 暗色覆盖。
- **footer ICP 盾形图标默认显示蓝色**：`.nebula-footer-icp-icon path { fill: blue !important }` 之前永久覆盖，hover 没有变化。改成默认灰、hover 才蓝。
- **CommentForm 提交按钮蓝底白字看不清**：Nebula 主题的 `--color-primary` 是浅蓝 `--nebula-blue-accent`，浅蓝底上白字对比度差。加 `className="comment-submit-button"` 钩子 + Nebula 翻成 navy 深字。

### 移除

- **`<footer>` "重新打开陪读" 浮动按钮**：原本点 × 关闭后 footer 出现一个圆形 message-bot 按钮重新唤起卡片。按用户要求改为"关闭后只有强制刷新才重显"，简化交互。

## [2.3.1] - 2026-05-07

### 新增

- **Nebula 暗色科技主题**：电紫强调 + 深蓝表面 + 玻璃质感卡片 + 蓝调发光阴影。覆盖 Header（Alimama 方圆体 logo + admin `site_brand_mode` 联动）、首页（说说磨砂胶囊 + 4 个爱好图块 hover 弹跳 / 文字徽章 + 评论者头像墙 hover 弹评论详情 + 分类切换不变 URL + 统计 inline 在 § ARTICLES 行）、文章页（横幅嵌标题 + 思源宋体 h2-h6 + 苹方正文 + Google Sans Code 代码 / Prism + 右侧 fixed sticky TOC + H2 蓝胶囊徽章 + h3-h4 蓝方块前缀 + 表格行列双向网格 + 表头大写字距 + 评论 thread 包裹主评和回复气泡 + @mention popup 翻深色 + 边读边聊浮窗整套深色适配）、底部多行结构页脚（建站天数 + 总浏览 + 实时在线 + 最近访客地）。
- **足迹国旗装饰**：文章封面右下角自动显示该文涉及国家国旗（Nebula 主题 36×36 圆角，其他主题 50×50 不变）。
- **PostNavigation 友链卡随机封面**：RSS 拉不到友链文章特色图，改用 `randomCoverUrl(hashFeedSeed(link))` 取稳定的 img.et 占位图，每条 feed 用 djb2 哈希链接得到不同的整数 seed，刷新不闪、4 张卡 4 张图。
- **首页"最新评论者头像墙"**：首页底部一排圆头像（10–20 个，按昵称去重），hover 弹出磨砂玻璃 popup 显示该用户最新评论内容 + 文章标题 + 时间，点击跳到对应评论锚点。

### 优化

- **`randomCoverUrl` regex 放宽**：`[?&]r=\d+` → `[?&]r=[^&#]*`。之前 admin 设置 `r=abc` 等非数字 seed 时 regex 不匹配，会去 else 分支追加第二个 `r={id}` 参数，img.et 收到两个同名参数行为不可预测。现在任何 `r=<value>` 都会被替换成 `r={post.id}`，每篇文章拿到稳定唯一的随机封面。
- **AISummary 图标**：`fa-wand-magic-sparkles`（魔法棒） → `fa-microchip-ai`（AI 微芯片），更切题。共享组件，所有主题受益。
- **评论列表头像方→圆**：CommentList 三处 inline `borderRadius: 0` 全部改 `'50%'`，跟现代 UI 风格一致。共享组件。
- **PostNavigation 友链 tab 也按 `pageSize` 切片**：之前 feeds tab 不分页全部渲染，现在跟其他 tab 一样切片，Nebula 传 `pageSize={4}` 时友链卡也只显示 4 张。
- **CommentList / CommentForm / AIReaderChat 加 className 钩子**：`comment-card` / `comment-card--reply` / `comment-thread` / `comment-form` / `ai-reader-chat--collapsed` / `ai-reader-chat--open`，便于主题精准 override 而无需改 inline style。共享组件不动 inline 样式，其他主题不受影响。

### 修复

- 友链 tab 多张卡片可能拿到同一张占位图：原因是 `randomCoverUrl` 直接把整段 link URL 当 `r=` 传给 img.et，长 URL 被服务端截断或归一化后彼此变成相同 seed。修复见上面"`randomCoverUrl` regex 放宽" + 友链卡新加的 `hashFeedSeed()` djb2 哈希。

### 移除

- 暂无。

## [2.3.0] - 2026-05-05

### 优化

- **统计表前缀统一为 `ul_stats_`**:`ul_analytics_daily` → `ul_stats_daily`、`ul_visitor_dates` → `ul_stats_visitor_dates`、`ul_visitor_post_dates` → `ul_stats_visitor_post_dates`。`ul_stats_global` / `ul_stats_post_daily` 已是该前缀,本次对齐;`ul_access_logs` 不变(语义为"原始日志"非"聚合统计")。InitDB 自动 ALTER TABLE RENAME(IF 老表存在 + 新表不存在),老库平滑升级。
- **三个层面的"总访问量"统一口径**:footer `ArchiveStats` / 后台 `DashboardStats` / 后台数据统计页 `period=all` 全部走新增的 `handler.GlobalStats()` helper,直接读 `ul_stats_global` 单行 O(1)。之前 `DashboardStats` 用 `COUNT(*) FROM ul_access_logs` 会随 90 天 prune 而"变小"。
- 前端 `PageViewTracker` 删掉 `isAdmin` gate。v2.2.0 起后端"管理员也计入访问"是用户明确决定;前端再 gate 反而让管理员的浏览只 +view_count(走 SSR `?track=1` 路径)而不写 `access_logs`,造成"明细看不到管理员、但 view_count 涨了"的不一致。前后端口径统一为「全部都计入」。

### 移除

- `AccessLogger` middleware:函数体已退化为 `path filter + c.Next() + _ = path` 实际无副作用(v2.2.0 时为防与 `/track` 双计已停止写 access_log)。`main.go` 同步删 `r.Use(handler.AccessLogger())` 调用,以及只此一处用到的 `skipLogPrefix` / `assetExt` 常量。
- `CleanupBotLogs` / `CleanupBotLogsPreview` handler 与对应的两条 admin 路由(`POST /admin/analytics/cleanup-bots`、`GET /admin/analytics/cleanup-bots/preview`)。这是为旧版 `AccessLogger` 双写产生的"visitor_id 空、UA 真实"行清理用的工具,middleware 不再写,这种行也不再产生,无前端调用。
- `EnrichGeoIP` handler 与 `POST /analytics/enrich-geoip` 路由。`logAccess` 已经在写入时异步补 GeoIP,没有积压需要批量回填,亦无前端调用。
- `InitStatsSync()` 空 hook(v2.2.0 起只剩函数声明)以及 `main.go` 里的调用。
- `web/next.config.js` 的 `experimental.staleTimes` 配置:Next 16.2.4 默认 `staleTimes.dynamic = 0`,显式写 0 是 no-op,删除以保持配置最小化。

## [2.2.0] - 2026-05-05

### 新增

- **永久不丢失的实时统计系统**。新增 3 张永久不可删表：
  - `ul_stats_global`：1 行站点级累计计数器（`total_views` / `total_uniques` / `first_event_at`），footer "总访问" 现在 O(1) 读这里。
  - `ul_stats_post_daily`：每篇文章每日 PV/UV，文章历史曲线的来源。
  - `ul_visitor_post_dates`：每篇文章每日访客唯一去重表，per-post UV 的真相源。
- 站点 PV、文章 view_count、日聚合（`_total` 维度）现在事务化原子写入，单次访问一个事务，不再依赖每日 cron。
- 首次启动自动从历史数据回填 `ul_stats_global`：现存 `ul_access_logs` 行数 + `ul_analytics_daily` 中 prune 早期日期的 `_total` 聚合 + `ul_visitor_dates` 累计 distinct 访客。

### 优化

- footer "总访问量" 不再随 30 天 prune 而"变小"。`ArchiveStats` 接口由 `COUNT(*) FROM ul_access_logs` 改读 `ul_stats_global.total_views` 单行 O(1)。
- 站点 PV / UV / 维度日聚合改为**写入时实时累加**（UPSERT），不再等 cron。今日数字立刻可见。
- `rollupRetentionDays` 由 30 天提升至 90 天（`ul_access_logs` 热数据保留期）。永久数字现已在 `ul_stats_global` / `ul_analytics_daily`，`access_logs` 仅作"最近访客 / 维度 breakdown"的明细。
- 取消 `logAccess` 的 30 秒去重 + 60 秒速率闸（≥8 hits 拒绝），刷新就 +1。
- 取消管理员 skip：管理员自己访问也计入 PV / view_count。
- 取消文章 SSR `?track=1` 路径上的 `IsBot` UA 检查 —— 该路径 UA 永远是 Next.js 的 `node`，原检查导致每个真实访客的 SSR 渲染都被拦下不计数。bot 护栏保留在浏览器 `/track` 路径（UA 真实可信）。

### 修复

- 修复 `ul_posts.view_count` 与 `ul_stats_post_daily.views` 漂移的双计 bug：旧版 `logAccess`（浏览器 /track）和 `IncrPostViews`（SSR `?track=1`）都在累加 daily.views，一次 F5 文章被 +2。现 daily.views 由 SSR 路径独占。

### 移除

- 删除死代码 `IncrTotalViews()` / `GetTotalViews()` / Redis `stats:total_views` —— PV 真相已迁移到 SQL。
- `analytics_rollup` 不再聚合 `_total` 维度（由 `logAccess` 实时写入）；维度 breakdown（browser / os / device / country）仍保留 cron 滚动。

## [2.1.7] - 2026-05-04

### 优化

- **阅读数改为 WordPress 风格的服务端同步 +1**:文章详情页 SSR 拉取数据时(`/api/v1/posts/:id?track=1`)后端在同一请求里完成 `UPDATE view_count = view_count + 1` 并返回 +1 后的值,渲染出来的 HTML 数字就是新数字。
- **不再依赖客户端 /track 异步路径** 来统计阅读数,关 JS / 浏览器拦截 / 网络抖动也能正常计数,刷新页面就 +1 不丢。
- **整个数据流减少一次客户端请求**:文章卡片不再走客户端 fetch 实时拉数字(v2.1.6 的 `LiveViewCount` 客户端组件删除),完全靠 SSR 同步 +1 后的值。
- 后端 `/track` 现在只负责访客明细 / 在线访客 / 全站 PV 统计,不再 IncrPostViews,数据流更清晰。

### 修复

- 修复"点击进文章 → 阅读数 +1 → 回首页阅读数仍然是旧值"的体验问题。改造后:点击进文章时服务端就 +1,首页 SSR 直接读 DB 拿最新值;Router Cache / 浏览器缓存还可能让首页延迟刷新,但即便延迟,**数据本身是真实的**,而不是 v2.1.6 之前那种"客户端 +1 没成功 → DB 没真的改"的错位。
- 移除 4 个主题(Azure / Flux / Chred / Utterlog)文章页 cosmetic `+1` 显示逻辑(SSR 已经拿到 +1 之后的值,不再需要乐观补 1)。

### 移除

- 删除 `web/components/blog/LiveViewCount.tsx`(v2.1.6 引入的客户端 fetch 组件,被服务端 +1 取代)。

## [2.1.6] - 2026-05-04

### 修复

- 接续 v2.1.5 的修复。v2.1.5 设的 `experimental.staleTimes.dynamic = 0` 在 Next 16.2.4 实际是默认值,等于无操作,文章卡片在首页仍可能显示旧的阅读数。改成更直接的方案:新增客户端组件 `LiveViewCount`,每次卡片 mount 都向 `/api/v1/posts/<id>` 发一次 `cache:'no-store'` 的请求并把数字替换为最新值。Azure / Flux / Chred / Utterlog 四个主题的 `PostCard.tsx` 全部接入。无论 Router Cache、bfcache 还是浏览器其它隐性缓存,数字都会被客户端兜底更新。

### 移除

暂无。

## [2.1.5] - 2026-05-04

### 修复

- 修复点击进入文章后再回首页,文章阅读数 / 评论数显示不更新的问题(必须强制刷新才能看到新数字)。原因是 Next.js 客户端 Router Cache 默认对动态路由保留 RSC payload,导航回首页直接 replay 缓存,绕过服务端拉数据。`web/next.config.js` 加 `experimental.staleTimes.dynamic = 0`,强制每次导航重新拉数据;静态页面继续保留 5 分钟缓存。后端 view_count 和 /track 完全正常,本次只是前端缓存策略调整。

### 移除

暂无。

## [2.1.4] - 2026-05-04

### 新增

- 数据统计支持 6 个时间窗口:**24 小时 / 7 天 / 30 天 / 当年 / 近一年 / 全部**。后台 → 数据统计页右上角切换器对应新增 3 个长周期。
- 新增 `/api/v1/analytics/breakdown?period=&dimension=` 统一接口,返回任意时间窗口内的访问次数 / 唯一访客 / 浏览器 / 操作系统 / 设备 / 国家分布(含每项 ratio 比例)。`dimension=all` 一次性返回 4 个维度。

### 优化

- 数据保留架构改为分层:`ul_access_logs` 仅保留**最近 30 天**原始行,超期前会被聚合到永久表 `ul_analytics_daily`(每天每维度一行,带 visits + unique_visitors)。"全部 / 当年 / 近一年" 等长周期查询走 UNION(daily 聚合 + 最近 30 天 raw),保证历史数据永不丢失。
- 唯一访客在跨日窗口的精度问题:新增 `ul_visitor_dates(visitor_id, date)` 永久表,记录每位访客每天是否访问过。任意时间窗口的"唯一访客数"= `COUNT(DISTINCT visitor_id) WHERE date BETWEEN`,精确而非过计。
- 数据统计→**最近访客** 卡片限制为最近 7 天 + 上限 1000 条,卡片标题副文字加"最近 7 天 · 上限 1000 条"。
- 概览面板的浏览器 / 操作系统 / 设备 / 国家分布列表项 JSON 字段统一为 `{name, code, count, ratio}`(原先 devices 用 type、countries 用 country,字段名不一致),前端 IconStatList / CountryRow 同步更新。
- 启动时新增 `StartAnalyticsRollupCron()`,每 24 小时把昨天及更早的数据聚合到 daily 表,然后删 30 天前的 raw 行。幂等(走 ON CONFLICT DO UPDATE),重跑安全。

### 修复

暂无。

### 移除

暂无。

## [2.1.3] - 2026-05-04

### 新增

- 新增评论邮件支持 bilibili 表情:`[:slug:]` 标记现在会渲染为对应的表情图(共 40 个),适用于"新评论""待审核评论""评论回复"三类邮件,图片走站点 `/emoji/bilibili/` 静态路径。
- 新增评论邮件展示访客来源:昵称同行右侧显示国旗 + IP + 归属地(省市),邮箱 / 网址独立两行,正文下方右下角显示完整时间戳(`2026-05-04 11:32:18`)。昵称如果填了网址会变成可点击链接。
- 新增密码重置邮件展示申请来源:申请来源块在重置按钮下方,显示触发请求的 IP、归属地、国旗与精确时间,便于账号主人核对是否本人发起。
- 新增评论回复邮件的退订能力:回复通知邮件页脚左侧"不想再收到回复通知?点击此处退订",链接走 HMAC 签名的 `/api/v1/unsubscribe/comment-reply?e=…&t=…`,handler 验签后写入 `comment_reply_optouts_v1` option,后续给该邮箱的回复通知会被自动跳过。退订成功 / 链接无效都会渲染独立确认页。
- 新增 Azure 主题侧栏欢迎卡片右侧无缝衔接:卡片往右溢出 1px 覆盖 sidebar 灰色 border-right,蓝色卡片不再有"分割线撞文章"的视觉断层。

### 优化

- 邮件模板整体重设计:卡片 4px 圆角、隐藏右上角域名、品牌 logo + 站点标题首行加 `aria-hidden`/`user-select:none`,屏幕阅读器与系统朗读会跳过 brand 行直接读正文;站点标题使用阿里妈妈方圆体,英文 fallback 链使用 Ubuntu;Powered by 改为单行居中、`Utterlog!` 加粗带链接(指向 utterlog.io)。
- 邮件链接全部加 `target="_blank" rel="noopener noreferrer"`,在 webmail 里点击不会替换掉邮件视图。
- 邮件正文移除装饰 emoji(⚠ / 🔗 / 📝 / 🔐 / ⏳ / 🎉),由文本和颜色承担语义;`verify_code` 邮件的提示 ℹ 改为内联 SVG。
- 待审核评论邮件标题加上文章名(链接到对应文章),meta 行结构跟新评论邮件统一,删除底部冗余的"文章 / IP 归属 / 提交时间"卡。
- 邮件主题去掉装饰 emoji(💬 / 🔐),保留纯文本主题。
- `model.LookupGeo` 导出供非评论场景(如密码重置)直接拿 IP 归属信息,不再误调 `LookupAndStoreGeo` 写入 commentID=0。

### 修复

暂无。

### 移除

暂无。

## [2.1.2] - 2026-05-03

### 新增

暂无。

### 优化

暂无。

### 修复

- 修复文章评论中深层回复链被多次重复渲染的问题(后台数据库正常,只在前端显示)。原因是 `CommentRow` 在每一层都重新调用 `flattenReplies` 扁平化,深度为 n 的子评论会被渲染 2^(n-1) 次;现把扁平化只保留在顶层 `depth === 0`,递归层不再二次扁平。Azure / Flux / Chred / Utterlog 四个主题以及公共 `components/blog/CommentList` 五处统一修正。

### 移除

暂无。

## [2.1.1] - 2026-05-03

### 新增

暂无。

### 优化

- 优化文章页底部「友链更新」板块，后端改为从 RSS 订阅缓存随机抽取 5 条，前端卡片重新布局为左上角站点名、右上角发布时间、底部悬停显示文章标题与「阅读原文」入口；卡片复用 16:10 网格槽位，没有真实封面时使用渐变底色与 RSS 水印保持视觉一致。
- 优化文章页底部相关板块的「换一批」按钮在友链更新 tab 下的行为，改为重新调用导航接口拉取新的随机 5 条订阅，比单纯翻页更符合换一批的语义。

### 修复

- 修复文章页底部「友链更新」tab 一直显示为禁用、有订阅缓存数据时也无法点击进入的问题。原因是 tabs 的启用判断使用了占位空数组的长度，feeds 实际数据走独立变量被忽略；现改为统一通过 `count` 字段判断，feeds 的 count 直接取真实订阅条数。

### 移除

暂无。

## [2.1.0] - 2026-05-03

### 新增

暂无。

### 优化

- 优化前台说说散落布局，未激活的卡片硬限制最高 280px 并裁掉超长内容，无论文字多长、配图多大都不会跨行覆盖下一行卡片；点击卡片激活后解除限制查看完整内容，配合鼠标悬停升顶逻辑保证视觉层次清晰。
- 优化前台说说卡片正文截断显示，配图说说限 2 行、纯文字说说限 6 行，配合外层硬限高让卡片高度真正可控。
- 优化 Coding 页面 GitHub 数据缓存策略，新鲜期从 1 小时调整为 30 分钟，过期后的容忍期从 6 小时延长到 30 天。30 分钟内访问命中内存 / Redis 缓存毫秒返回；过 30 分钟在 30 天内访问立即返回旧数据并后台异步刷新接力，避免冷启动或长间隔访问时同步等待 GitHub 接口造成 4-5 秒卡顿。

### 修复

暂无。

### 移除

暂无。

## [2.0.10] - 2026-05-03

### 新增

- 新增前台说说发布弹窗的推荐标签按最近使用动态聚合，默认展示 8 个，按每个标签最近一次使用时间倒序，不再写死 4 个固定关键词。
- 新增 `GET /api/v1/moments/recent-tags?limit=8` 接口，从已发布的说说聚合最近使用过的 mood 标签。
- 新增前台说说卡片散落布局的鼠标悬停自动升顶逻辑，光标移到哪张卡片，那张就自动浮到最上层，避免相邻卡片视觉遮挡正在阅读的内容。

### 优化

- 优化前台说说卡片单图显示，统一按卡片宽度的 16:9 比例渲染，不再跟随原图高度撑高卡片导致溢出行高、压住下一行卡片；点击图片仍按原始比例弹出大图查看。
- 优化说说发布与编辑流程，提交时新出现的 mood 标签会自动合并进后台 `moment_tags` 选项，管理员后台标签管理器无需手工维护即可看到全部用过的标签。

### 修复

暂无。

### 移除

暂无。

## [2.0.9] - 2026-05-03

### 新增

暂无。

### 优化

- 优化全站中文 UI 文案排版，统一按中文排版规范处理：中文相邻的省略号 `...` 全部改为 `…`、中文后紧跟的半角冒号 `:` 全部改为全角 `：`、中文上下文里的半角括号 `()` 改为全角 `（）`，覆盖 5 套博客主题与管理后台共约 200 处字符串。

### 修复

暂无。

### 移除

暂无。

## [2.0.8] - 2026-05-03

### 新增

暂无。

### 优化

- 优化前台文章、分类、标签、日期和分页等列表型链接的预取策略，减少 Next.js 自动生成的 `_rsc` 预加载请求数量。
- 优化前台首页 Hero 区数据加载，取消打开首页时把所有分类和模式组合一次性预拉的逻辑，改为切换 tab 时按需懒加载并把结果缓存在内存中复用，首屏减少大量 `/posts?per_page=1` 重复请求。
- 优化前台 Azure 主题首页 Hero 自动轮播，循环范围跟随后台配置的 sidebar 分类，不再切到 sidebar 之外的隐藏分类，避免出现"左侧 tab 没有反应但文章在切换"的错觉。
- 优化博客主题（Flux / Utterlog / Renascent / Chred）所有内部链接的预取行为，统一关闭 Next.js 默认 prefetch，避免视口可见或鼠标悬停时大量 `?_rsc` 请求触发。
- 优化前台 Coding 页面 SHIPPING LOG 分段显示，按"最近 3 天 / 本周 / 更早"三段分组，每段单独标题与天数计数，便于快速浏览近期与历史活动。
- 优化前台 Coding 页面所有日期与时间按后台设置的站点时区渲染，避免浏览器本地时区影响分组边界与时间显示。
- 优化公安备案图标改为使用本地静态资源 `/images/beian/ghs.png`，不再每次远程请求 `beian.mps.gov.cn`，加载更快也避免外部依赖。

### 修复

- 修复生产 `docker-compose.prod.yml` 在 `.env` 缺少数据库密码或 JWT 密钥时被 Compose 拒绝启动的问题，改为允许空值并把宿主机 `.env` 挂入容器，使 Web 安装向导写入的配置在重启后可被读取，外部数据库 / 外部 Redis 模式下的安装流程现在能完整跑通。

### 移除

暂无。

## [2.0.7] - 2026-05-02

### 新增

- 新增第三方服务里的高德地图和腾讯位置服务 Key 配置，为后续国内地理编码和说说位置反查提供统一配置入口。
- 新增同源位置反查接口，说说前台定位优先通过后端读取 Mapbox 配置解析城市名，并可使用高德、腾讯位置服务作为后续国内兜底。

### 优化

- 优化 Markdown 编辑器代码相关按钮图标，区分行内代码和代码块语言选择器。
- 优化说说来源显示，网页发布统一显示为 `网页`，兼容旧数据中的 `local`、`web` 和 `browser`。
- 优化关于页面配置弹窗的模板操作按钮间距，避免按钮文字贴近边框。

### 修复

- 修复新建草稿发布为正式文章时可能因 slug 唯一约束冲突导致发布失败的问题。
- 修复草稿从文章列表快捷发布时分类、标签和足迹等关联信息丢失的问题。
- 修复草稿编辑页会把草稿创建时间写入发布时间，导致首次发布不能使用当前发布时间的问题。
- 修复新建文章发布时后台选择的发布时间没有写入数据库的问题。
- 修复发布时间解析没有使用站点时区的问题，`datetime-local` 输入现在按后台时区设置解析。
- 修复旧数据补全 `published_at` 时会错误写入未发布草稿的问题，并自动清理负数草稿 ID 上的发布时间残留。
- 修复公开文章列表、归档、日期页、搜索结果和主题文章卡片仍按草稿创建时间展示或排序的问题，统一优先使用发布时间。
- 修复文章创建和编辑时不能稳定从正文第一个 H1 自动识别标题的问题。
- 修复文章创建、编辑和列表快捷状态切换失败时只显示笼统错误，无法看到后端具体原因的问题。
- 修复前台说说位置反查失败时直接保存经纬度的问题，无法识别城市时改为提示手动填写，不再把坐标写入位置字段。
- 修复关于页面默认模板和自定义 Markdown 模式没有严格互斥的问题，并在保存设置后同步刷新 `/about` 页面缓存。

### 移除

暂无。

## [2.0.6] - 2026-05-01

### 新增

- 新增后台数据库清理按钮，可清理媒体库缺失文件记录、失效相册关联、孤儿文章关联、孤儿评论、足迹残留和过期授权数据。

### 优化

- 优化 Coding 页面 Hero 顶部间距，删除标题上方多余空白。
- 优化 Coding 页面 GitHub 数据缓存，支持 Redis 持久缓存、过期旧数据立即返回和后台刷新，减少打开页面时等待 GitHub API 的情况。
- 优化 Coding 页面前端数据缓存，后台保存设置时会同步刷新 Coding 页面缓存。

### 修复

暂无。

### 移除

暂无。

## [2.0.5] - 2026-05-01

### 新增

暂无。

### 优化

暂无。

### 修复

- 修复后台保存主题菜单或站点设置后 `/api/revalidate` 没有转发到 Next.js，导致前台菜单需要等待 options 缓存过期才生效的问题。

### 移除

暂无。

## [2.0.4] - 2026-05-01

### 新增

- 新增 Coding/GitHub 内置页面，支持从个人资料社交链接自动识别 GitHub 地址，也可在页面管理中单独配置 GitHub 用户名或主页地址。
- 新增 Coding/GitHub 页面 GitHub Token 配置，用于贡献统计 GraphQL 查询和提升 GitHub API 速率。

### 优化

- 优化 Coding/GitHub 页面热力图，改为当前自然年贡献口径；配置 GitHub Token 后优先通过 GraphQL 读取授权可见贡献数据，并补齐全年网格避免格子比例异常。
- 优化 Coding/GitHub 页面最近仓库列表，仓库标题只显示项目名，不再重复显示用户名。
- 优化 Coding/GitHub 页面项目展示方式，后台可从 GitHub 公开仓库中选择要展示的项目，前台按项目展示且每个项目最多显示 5 条最近动作。
- 优化 Coding/GitHub 页面 GitHub 组织账号支持，组织项目改用组织公开仓库接口读取，并按项目拉取最近动作。
- 优化 Coding/GitHub 页面用户来源解析，填写 GitHub 用户地址时会自动合并该用户所属组织的公开仓库，仍不读取私有仓库。
- 优化 Coding/GitHub 页面多 GitHub 地址支持，可同时配置多个用户或组织地址并汇总公开项目。
- 优化 Coding/GitHub 页面标题区，移除 `View on GitHub` 链接，改为直接展示贡献数、仓库数和关注者统计。
- 优化 Coding/GitHub 页面标题栏统计样式，避免统计项换行撑高标题栏，保持与其他页面标题栏高度一致。
- 优化 Coding/GitHub 页面标题内容，标题改为 `@用户名`，副标题显示 GitHub 简介，并将 GitHub 头像移动到热力图右侧。
- 优化 Coding/GitHub 页面标题栏排版，用户名和 GitHub 简介改为同一行显示。
- 优化 Coding/GitHub 页面结构，移除中间重复的 GitHub 资料卡。
- 优化 Coding/GitHub 页面标题栏用户名，改为 GitHub 链接并保持标题原色和无下划线样式，同时使用页面 serif 标题字体。
- 优化 Coding/GitHub 页面 Hero 文案和版式，改为更清晰的 GitHub Journal 标题区与右侧数据摘要。
- 优化 Coding/GitHub 页面贡献统计，标题栏 `total contributions` 改为全部历史贡献数，热力图图例明确显示当前自然年贡献数。
- 优化 Coding/GitHub 页面 Hero 右侧数据摘要，改为显示今天的 GitHub contributions 数值。
- 优化 Coding/GitHub 页面 Hero 文案，改为中英双语标题和说明。
- 优化 Coding/GitHub 页面 section 编号，活动和项目区改为 `§ 01`、`§ 02`。
- 优化 Coding/GitHub 页面项目元信息样式，移除语言、Star 和 Fork 的外边框，改为轻量 inline 信息。
- 优化 Coding/GitHub 页面 Hero 区域，移除 `GitHub Journal` 标签并压缩上下留白。
- 优化 Coding/GitHub 页面活动短标签，明确区分 `PUSH`、`COM`、`CMT` 等事件类型，避免 commit 和 comment 缩写混淆。
- 优化 Coding/GitHub 页面活动短标签样式，不同 GitHub 事件类型使用不同的低饱和标签颜色。
- 优化 Coding/GitHub 页面 Projects 区块，改为按日期聚合的 Shipping Log，按天展示涉及仓库和动作数量，并适配移动端单列阅读。
- 优化 Coding/GitHub 页面 Shipping Log 卡片，移除与 `ACROSS / REPOS` 和徽章重复的中文文字总结。
- 优化 Coding/GitHub 页面配置提示，明确组织仓库需要填写组织地址或仓库 URL，项目列表固定只读取公开仓库。
- 优化后台文章管理导航结构，分类和标签从左侧子菜单移入文章模块顶部 tabs，左侧只保留文章一级入口。
- 优化项目 README 文案，改为更偏产品介绍和使用场景的表达，减少过多技术细节。
- 统一后台设置页与 AI 设置页的 tabs、section、卡片和表单行风格，沉淀为同一套 settings 设计组件与样式 token。

### 修复

- 修复 Coding/GitHub 页面配置中填写 GitHub 仓库 URL 时只截取 owner，导致组织仓库筛选混乱的问题；仓库 URL 现在会自动解析为 owner 来源和项目筛选。
- 修复关于页面编辑器在站点记录条目过多时弹窗内容不能滚动，导致上方配置区域被挤出视窗的问题。

### 移除

暂无。

## [2.0.3] - 2026-05-01

### 新增

- 新增 Renascent 主题，基于学术极简风格提供 serif 标题、黑白灰排版和克制蓝色强调。
- 新增文章内嵌说说短代码 `[moment id="123"][/moment]`，文章编辑器插入说说时改为引用原始说说 ID，并在前台使用独立卡片样式渲染。
- 新增 Markdown GitHub 仓库链接自动卡片化，正文中单独一行 `https://github.com/owner/repo` 会展示项目名称、描述、语言、版本号、Star、Fork 和作者头像。
- 新增 Markdown X/Twitter 帖子自动嵌入，正文中单独一行 X 或 Twitter 状态链接会使用官方 widgets 渲染帖子。

### 优化

- Renascent 主题改为独立组件和独立样式结构，按学术极简设计系统重写首页、文章页、页头、页脚和文章卡片，不再复用 Azure 的页面结构。
- Renascent 首页进一步对齐 `lixiaolai.com` 的 Reborn 风格，改为文字驱动的 Hero、编号指标列表、CURRENTLY 信息条和文章目录式列表。
- Renascent 文章页深度重构为出版式阅读版式，新增文章编号区、元信息侧栏、正文主栏、目录栏、封面题注、AI 摘要、上下篇、相关文章和评论区的统一视觉层级。
- 补充 `AGENT.md` 项目协作说明，明确本地开发、主题同步、当前进度、部署、版本号和更新日志维护规则。
- 主题菜单和资料卡设置文案改为通用描述，适配多套具备侧栏功能的主题。
- 后台仪表盘最近文章 / 最新评论改为左右逐行严格对齐，并把 30 天访问趋势的日期标签改为月份加粗 + 日期两行、跨月才显示月份的紧凑布局。
- 优化文章页边读边聊入口的显示时机，默认隐藏，阅读进度超过 40% 后再显示。
- 优化 GitHub 仓库卡片的数据加载时机，改为页面加载完成后异步拉取仓库信息，并增加 5 秒兜底和加载状态。
- 优化 GitHub 仓库卡片右侧视觉区，移除重复内容的 OpenGraph 预览图，改为 GitHub 用户头像和按语言占比渲染的全宽色条。
- 优化 GitHub 仓库卡片元信息展示，新增 latest release 或最新 tag 版本号。
- 优化 X/Twitter 帖子嵌入样式，恢复官方原始 widgets 渲染，不再对 iframe 做高度裁切和缩放。
- 优化统计页面最近访客卡片的分页体验，翻页时保留表格和页面位置，只替换访客列表内容。
- 优化 GitHub 仓库卡片为固定高度，描述改为单行省略，右侧视觉区改为轻量头像展示。
- 优化 GitHub 仓库卡片头像定位，避免主题正文图片样式干扰，头像始终显示在右侧区域正中心。
- 优化 GitHub 仓库卡片悬浮状态，保留边框和阴影反馈，不再产生位移。

### 修复

- 修复后台仪表盘最新评论卡片不显示评论者昵称的问题（JSON 字段 `author` 被错误读为 `author.name`）。
- 修复 Azure 主题评论提交或回复后整块评论区进入加载状态，导致页面出现重载感的问题。
- 修复本地单端口开发时 Next.js HMR WebSocket 被开发源校验和 Go 反代升级处理阻断，导致控制台持续出现 `/_next/webpack-hmr` 连接失败的问题。
- 修复 Renascent 切换后仍输出大量 Azure 组件结构和样式类名的问题。
- 修复后台评论管理、文章预览、仪表盘最近文章和最新评论中的文章链接仍写死 `/posts/slug` 或跳转编辑页的问题，统一跟随站点固定连接打开真实文章页，并在基础设置保存后刷新后台站点链接缓存。
- 修复 GitHub 仓库卡片被主题文章链接样式覆盖，导致卡片标题、描述和元信息出现下划线的问题。
- 修复 GitHub 仓库卡片右侧视觉区被内容高度拉伸导致布局异常的问题。

### 移除

暂无。

## [2.0.2] - 2026-04-29

### 新增

- 关于页面新增结构化个人主页模板，支持个人资料、MBTI、兴趣爱好、音乐偏好和站点更新记录。
- 关于页面支持在默认模板与自定义 Markdown 正文之间切换，Markdown 内容单独保存。

### 优化

- 友情链接分类管理支持上移/下移调整分类顺序，前台友链页按后台分类顺序展示。
- 后台系统页面的关于页编辑改为填表式配置，并继续兼容旧版自定义 HTML 内容。
- 页面管理中内置关于页的操作按钮明确指向关于页面配置编辑器。

### 修复

- 修复 WordPress 同步分类和标签时按大小写敏感 slug 查重，导致 `Debian` / `debian` 等同名标签重复生成 meta 的问题，并在再次同步时合并已产生的来源重复项。
- 修复主题自定义头部按钮和页脚图标时，Azure 固定随机访问按钮与固定 RSS 按钮可能被覆盖或挤出的问题。

### 移除

暂无。

## [2.0.1] - 2026-04-29

### 新增

- 新增 `content/` 运行时内容目录，后台上传主题统一保存到 `content/themes/`，插件统一保存到 `content/plugins/`。

### 优化

- 优化最近访客统计口径，同一访客会话只显示入站页面，并将会话内后续页面停留时间合并为总时长。
- 优化相册管理页「新建相册」和空状态「创建第一个相册」按钮宽度与水平留白。
- 优化 Utterlog 网络状态卡片的手动推送按钮宽度和水平留白，避免长文字贴近按钮边缘。
- 安全设置防御配置重构为统一表单行样式，访问控制、CC 防御和 GeoIP 封锁统一由底部「保存设置」提交，并补充个人博客使用提示。
- 安全设置的防御设置保存按钮文案统一为「保存设置」。
- 主题和插件管理改为优先读取 `content/` 目录，同时兼容旧版根目录 `themes/`、`plugins/`，避免升级后隐藏已有扩展。
- `/themes/*` 资源路由改为先读取用户上传主题资源，再回退到内置主题资源，内置主题源码继续保留在 `web/themes/` 参与前端构建。
- Docker 开发与生产编排新增 `content` 持久化挂载，系统备份与恢复同步覆盖 `content/` 运行时扩展目录。

### 修复

- 修复统计页面选择「全部」时间范围时国家/地区和来源聚合 SQL 条件拼接错误，导致已有国家数据也显示为空的问题。
- 修复数据统计访客地图在低缩放级别关闭世界复制时横向边界被夹住，导致只能上下拖动不能左右拖动的问题。
- 修复前台访问统计组件在部分运行时拿不到 zustand persist hydration API 时导致页面崩溃的问题。
- 修复 API 生产 Docker 镜像构建时因 `api/public/` 目录没有跟踪文件导致 CI 无法复制 public 目录的问题。
- 修复 `/themes/*` 的 `HEAD` 请求可能落到 Next.js 回退路由并返回异常的问题。
- 修复主题静态资源路由可能暴露点文件的问题。

### 移除

- 移除安全设置中的 IP 信誉功能，后台不再显示 IP 信誉 tab，后端不再记录本地风险评分或按评分自动封禁。
- 移除 API 侧重复的内置主题截图文件，内置主题静态资源统一由 web 侧构建产物提供。

## [2.0.0] - 2026-04-29

### 新增

- 后台安全设置新增 GeoIP 数据源选择，可在默认 `api.ipx.ee` 与 `cnip.io` 之间切换。
- 友情链接分类新增持久化配置，每个分类可单独选择卡片式或图标式显示。
- 友情链接新增图标式展示样式，分类可按需切换为紧凑的一行多列布局。

### 优化

- Azure 主题文章页 banner 恢复为与首页文章卡片一致的宽屏显示比例，避免 16:9 在文章页占用过高。
- Azure 主题侧边栏资料卡改为贴边满宽直角样式，并接管原首页顶部社交 icon 到卡片右下角显示。
- Azure 主题侧边栏排序调整，资料卡下方优先显示最新评论，文章、说说和友链统计卡片下移。
- 访客统计、评论归属地、GeoIP 封锁、WordPress 导入评论归属地和服务器出口 IP 识别统一使用同一套 GeoIP provider。
- 内置页面标题统一跟随后台页面名称，补齐说说、订阅、友链、相册、音乐等页面的浏览器标题。
- 后台纯图标操作按钮统一为正方形边框样式，图标居中显示。
- 版本线整理为正式发布版：历史版本合并为 `1.0.0`，当前版本作为 `2.0.0` 正式发布。

### 修复

- 修复友情链接新增空分类刷新后丢失的问题，并允许默认分类修改显示名称。
- 修复友情链接没有链接的分类仍在前台显示的问题。

### 移除

暂无。

## [1.0.0] - 2026-04-29

旧版本详细更新说明已归档到 [RELEASE_HISTORY.md](./RELEASE_HISTORY.md)，用于保留 `1.0.x` 到 `1.5.x` 整理前的历史记录。

### 新增

- 初始发布 Utterlog，提供博客发布、后台管理、前台展示和 Docker 部署基础。
- 新增后台、前台、主题系统、安装、登录、文章、页面、分类、标签、评论、媒体、备份和工具等核心基础能力。
- 新增 Utterlog、Azure、Chred、Flux 内置主题和主题系统基础能力。
- 新增找回密码、SEO、robots.txt、llms.txt、站点标题显示方式和固定链接设置。
- 新增 AI provider、AI 内容摘要、关键词、Slug、排版、封面图、智能评论审核和智能回复能力。
- 新增文章页 AI 陪读卡片、全站浮动 AI 聊天气泡和通用 AI 对话接口。
- 新增系统语言基础设施，后台可选择站点语言，语言包独立为标准翻译文件，内置简体中文、英语和俄语。
- 新增站点时区设置，前后台时间显示按站点时区统一。
- 新增「足迹」功能，支持文章加入足迹页、后台足迹管理、Mapbox token 配置、地理编码、地图和时间线展示。
- 新增文章公开编号规则，草稿使用临时编号，发布后按成功发布文章顺序分配公开编号。

### 优化

- 建立前后端分离架构、主题目录结构、插件目录结构和基础配置体系。
- 优化安装、登录、文章、页面、分类、标签、评论、媒体和主题管理等基础后台流程。
- 优化首页 Hero、文章页随机封面、站点标题字体、Logo/Favicon 上传预览和常规设置结构。
- 主题视觉组件独立化，Utterlog、Azure、Chred、Flux 可分别调整评论、内容、导航、文章信息和 AI 陪读等 UI。
- Azure 主题移动端、Header、搜索、全局 loading、灯箱、hero loading、Logo 悬浮、菜单悬浮和页脚评论表单重新适配。
- 后台主题菜单管理重构，主题可声明菜单位置，Azure Hero 固定分类 tab 保持写死样式。
- 统一文章字数统计，文章页、首页汇总和归档页使用同一套字数口径。
- 优化 AI 相关后台交互、图片生成流程、默认提示词和模型按用途分发。
- 优化文章页相关文章、分类文章、全文搜索 fallback、Markdown 下载卡片和相关文章 pageSize 配置。
- 支持 `site_url` 变更后迁移 cover/media URL，减少附件、品牌资源、RSS/feed 和固定链接中的跨环境写死地址。
- 邮件链接关闭 SES click tracking，管理员回复评论只通知被回复评论者。
- 文章访问统计按后台固定链接规则反向解析路径，支持多种 permalink 模板。
- 文章浏览量改为每次访问或刷新都计数，文章页和首页列表展示数据库真实阅读数。
- 后台按钮图标与文字间距、表单行、AI 设置和常规设置样式统一。
- Web 端 Next.js patch 升级到 `16.2.4`。

### 修复

- 修复早期部署、后台管理、主题切换、封面图展示、站点 URL 迁移和设置保存相关问题。
- 修复生产环境主题样式丢失导致页面样式全失效和大图覆盖文章页的问题。
- 修复生产 Docker 构建复制开发 symlink 后生成断链，导致 uploads 目录创建异常的问题。
- 修复 feeds 订阅页卡片展开时顶动布局、登录密码错误提示被 token 刷新重试冲掉、favicon 和 logo 升级后丢失等问题。
- 修复 AI 提取关键词或摘要时因旧提示词缺少占位符而失败的问题。
- 修复 dashboard 访问统计被 SSR 和前端 `/track` 双计，以及历史访问统计清理无法精准清理重复浏览器访问记录的问题。
- 修复相关文章列表在标签命中较多时丢内容、相关文章与分类文章来源混淆的问题。
- 修复文章页友链更新日期显示为 1970-01-01、PostNavigation 渲染期间触发 setState 的问题。
- 修复评论默认排序不响应后台设置、评论管理员身份显示、管理员回复邮件额外发送给管理员、AI 评论审核/回复未生效等问题。
- 修复 Utterlog 主题相关文章样式、分类 icon、文章页 TOC 和边界文章封面显示异常。
- 修复深色 Logo key 读取错误、Utterlog 和 Flux 主题不渲染上传 Logo 的问题。
- 修复固定链接变更后 RSS feed 仍输出旧默认地址的问题。
- 修复自定义固定链接下文章浏览量一直不增加的问题。
- 修复后台 Logo 与 Favicon 上传后预览框空白的问题。
- 修复友情链接新增时 ID 总是 `1`、排序不连续和默认编号异常的问题。
- 修复草稿占用公开文章编号、新发布文章编号不连续的问题。
- 修复新部署站点残留默认站点信息、关键词文章计数异常等问题。
- 修复站点域名或 `site_url` 变更后部分附件与品牌资源写死绝对地址导致迁移失效的问题。
- 修复后台首页访问按钮在本地端口测试时使用写死站点地址的问题。
- 修复默认 CC 频率限制误启用的问题，新安装默认关闭。
- 修复连续图片自动网格预处理吞掉图片组后的空行，导致紧跟的 Markdown `> ` 引用块被当作普通 `&gt;` 文本输出的问题。
- 修复后台通知铃铛待审核评论入口仍跳转旧 `/dashboard/comments/pending` 的问题，并统一后台相关回跳到 `/admin` 路径。

### 移除

暂无。

[Unreleased]: https://github.com/utterlog/utterlog/compare/v2.0.7...HEAD
[2.0.7]: https://github.com/utterlog/utterlog/releases/tag/v2.0.7
[2.0.6]: https://github.com/utterlog/utterlog/releases/tag/v2.0.6
[2.0.5]: https://github.com/utterlog/utterlog/releases/tag/v2.0.5
[2.0.4]: https://github.com/utterlog/utterlog/releases/tag/v2.0.4
[2.0.3]: https://github.com/utterlog/utterlog/releases/tag/v2.0.3
[2.0.2]: https://github.com/utterlog/utterlog/releases/tag/v2.0.2
[2.0.1]: https://github.com/utterlog/utterlog/releases/tag/v2.0.1
[2.0.0]: https://github.com/utterlog/utterlog/releases/tag/v2.0.0
[1.0.0]: https://github.com/utterlog/utterlog/releases/tag/v1.0.0
