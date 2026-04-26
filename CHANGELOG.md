# Changelog

本文件记录 Utterlog 的版本变更。格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

每次提交前先在 `Unreleased` 段落里按 `Added / Changed / Fixed / Removed` 归类追加条目。
发布时把 `Unreleased` 的内容连同当天日期一起降级为新版本段落。

## [Unreleased]

## [1.5.1] - 2026-04-26

### Fixed

- **首页和文章页 view_count 数字不一致**：用户反馈「首页 149，点开文章显示 150，回到首页刷新还是 149，再开第二天还是这个跳变」。根因是 Azure / Chred / Flux 三个主题的 `PostPage.tsx` 写死了 `{(post.view_count || 0) + 1}` 做「乐观 +1」，但这个 +1 是无条件加的：
  - 同访客同篇文章当天再访问会被 `/track` 的 `isFirstPostViewToday` dedup 拦截 → DB 不再 +1
  - 但页面照样无脑显示 +1 → 首页（raw DB）跟文章页（cosmetic +1）数字永远差 1，看着像统计 bug
  - 修复：3 个主题 PostPage 直接渲染 `post.view_count || 0`（DB 真实值），跟首页列表一致。/track 真触发了增量后，刷新文章或首页都会同步看到新值。Utterlog 主题原本就是这样，没受影响

## [1.5.0] - 2026-04-26

### Added

- **AI 陪读卡片新增「关闭 / 重新打开」**：之前文章页陪读卡片一旦显示就没法关掉，遮挡阅读。现在跟左侧音乐卡片同款交互：
  - 折叠卡片右上角加 X 关闭按钮（22×22，灰色 hover 变深，stopPropagation 防止冒泡触发卡片展开）
  - 关掉之后 footer「回到顶部」左边（`right:64`）出现「重新打开陪读」按钮（Azure / Chred 主题），点一下卡片回来
  - Utterlog / Flux footer 没有「回到顶部」锚点，重开按钮用 fixed 定位浮在视口右下角
  - 跨组件状态由新 `useReaderChatStore` 维护：AIReaderChat 挂载 `mount()` / 卸载 `unmount()`，进入新文章时一律重置 `dismissed` —— 用户在文章 A 关掉陪读，不影响文章 B 第一次访问的默认行为
- **首页 hero 切换分类增加 loading 过场**：之前点分类 tab，hero 大图直接硬切，看着像「啪一下」。现在加一层「先预加载 + 半透蒙层 + 旋转 spinner」的过场，新图加载完成且最少展示 700ms 才切，配合 `<FadeCover key={displaySrc}>` 触发 `[data-blog-image][data-loaded]` 现有的淡入动画。视觉总长 700ms（最短）+ 0.4s 蒙层淡出与新图淡入并行
- **新增「全站浮动聊天气泡」AIChatBubble 组件**：之前 admin「前端聊天气泡」section 没有对应的前端组件 —— 实际渲染只有 `AIReaderChat`（文章页陪读，针对当前文章）。现在拆成 2 个独立功能：
  - **聊天气泡 (`AIChatBubble`)**：全站浮动 AI 助手，挂载到 (blog) layout，仅**非文章页**显示（usePathname + permalink_structure 自检），对话上下文是「博主助手」（注入 `ai_blogger_name / ai_blogger_bio / ai_blogger_style / ai_blogger_memory`）。由 `ai_chat_enabled` option 控制
  - **AI 陪读 (`AIReaderChat`)**：仅**文章详情页**底部显示，对话上下文是当前文章。无条件显示（恢复之前误加的 ai_chat_enabled 守卫，陪读应该是文章独立功能）
  - 同一页面不会同时出现两者：文章页只渲染陪读，非文章页只渲染气泡
- **后端 `/ai/reader-chat` 支持 `post_id=0` 通用模式**：之前 PostID 是 required 字段，post_id=0 会被拒绝 + 强制查文章 → 不能给「站点通用聊天」用。改造 handler：post_id>0 走原文章陪读逻辑；post_id==0 走新「博主助手」system prompt（注入博主资料 + 跳过文章 context 查询）
- **聊天气泡 + 陪读动态 footer 避让**：之前 `AIReaderChat` 用 `bottom: footer.offsetHeight + 8` **静态偏移**（不管用户在页面哪都抬到 footer 高度），导致用户在顶部时气泡也被抬高浪费空间。改为**滚动监听**：footer 没进入 viewport 时贴底 24px，footer 进入 viewport 时跟着 footer 顶部一起上移避免重叠。AIChatBubble 用同款逻辑，4 主题 AIReaderChat 都同步升级
- **AIReaderChat z-index 1000 → 9999**，避免被 cookie banner / TOC 等 overlay 盖住

### Changed

- **Azure 主题 hero 下方那行播放控制按钮 → 博主社交链接图标**：原本是 5 个 hero 轮播按钮（快退 / 上一篇 / 暂停 / 下一篇 / 快进），实际使用率很低。改为渲染社交链接图标横排（GitHub / Twitter / Weibo / Telegram / YouTube / Instagram / Bilibili / 邮箱 / 网站），数据源走 `useThemeContext().options`（自带 `social_links` JSON → 平铺 `social_*` 键展开）。`paused` / hero 自动轮播的「悬停暂停」逻辑保留在 hero 自身的 `onMouseEnter/Leave` 里
- **Azure 主题侧栏头像下面的社交链接图标删除**：避免和上面 hero 那行重复展示，简介下方现在只留博主名 + 简介
- **AI 聊天气泡 / 陪读 footer 避让动画跟左侧音乐卡片对齐**：之前 React state 改 `bottom` 是跳变的，看上去像「瞬移」或「没动」。加上 `transition: 'bottom 0.25s ease'`（跟 `GlobalMiniPlayer` 完全一致），footer 进入视口时浮窗平滑上推
- **AI 聊天气泡 / 陪读 scroll 监听同时挂 window 和 `.blog-main`**：之前只监听 `window.scroll`，但 Azure / Chred / Utterlog 三个主题的 Layout 把 `<main className="blog-main">` 设成 `overflowY: auto`，页面滚动发生在内层容器，window scroll 永远不触发。现在两个事件源都挂上，覆盖两种滚动模型；额外用 `ResizeObserver` 监听 footer 自身尺寸抖动（在线人数、备案号等异步数据加载完会改 footer 高度），避免初始 compute 拿到的旧值失真
- **AI 聊天气泡展开面板也跟随 footer 上推**：原本 `bottom: 24` 写死，即使 scroll 检测修好，展开后还是会被 footer 盖住。改为 `bottom: bottomOffset` 跟折叠态一致
- **首页相关文章卡片网格无间隙紧贴**（Azure）：`.post-related-grid` 的 `gap: 12px` → `gap: 0`，`padding: 12px 0` → `padding: 0`，5 列卡片直接接到 tabs 下边沿
- **8 个 AI 默认提示词全面重写**，针对每个 prompt 模型最常见的失败模式做防御性优化：
  - **摘要**：加角色设定（专业编辑），明确禁用 8 种套话开头（"本文介绍了"、"通过…作者表达了"等），强调"提炼而非复述第一段"
  - **Slug**：从"整句翻译压缩"改为"提取 2-5 个关键概念词"，给好坏对照例子（Debian/phpMyAdmin/我的中秋节），明确跳过冠词介词
  - **关键词**：明确排除泛词列表（博客 / 技术 / 文章 / 内容 / 教程 / 分享 / 笔记...），优先级"具体技术名 > 主题领域 > 抽象概念"，每标签 2-6 字限制
  - **润色**：重写整段 prompt（用户痛点最多）—— 新结构「只能改 5 项 + 绝对不能改 5 项 + 输出要求 4 项」，强调代码块 / 技术术语 / 人称 / 内容本身一字不改
  - **推荐问题**：禁用模板烂问题（"主要观点"、"详细介绍"），要求基于文中具体名词、3 个角度分散（细节 / 应用 / 对比 / 注意 / 下一步），给好问题示例
  - **封面图**：重组结构 —— 「画面要求」+「氛围参考」+「视觉风格 4 项」+「绝对禁止 5 项」。明确 {title} 是"氛围参考"不要画到画面里，留白比例 30-40% 便于叠加标题
  - **评论审核**：扩充「判定不通过」+「保护正常交流」双向规则（短表态 / 负面观点 / Emoji / 闲聊 都过），confidence 评分锚点细化（1.0 / 0.8 / 0.5），reason 限 30 字
  - **评论回复**：用户体验最敏感的提示词 —— 强烈禁用 6 种机械化开头（"感谢您的评论"等），明确博主第一人称（不用"小编 / 笔者"），给烂回复对照 + 好回复示例（phpMyAdmin / 排版 / 写得不错），不加签名结尾
- **封面图默认提示词改为纯中文**：之前首行「禁止文字」指令是中英双语（"Absolutely no text, no letters... 纯视觉画面，禁止出现任何文字字符。"），原本是利用图像生成模型对英文 negative prompt 更敏感的特性。按用户要求改成纯中文：「纯视觉画面，绝对禁止出现任何文字、字母、数字、符号、Logo、水印或 UI 元素。」。⚠️ 提示：部分模型对中文负面指令的遵守率可能略低，如果生成的封面图又出现英文乱码，可手动在「自定义提示词」里加回原英文 prompt
- **AI 设置「自定义提示词」改为博主资料同款 FormRow 风格**：之前是自己 inline 渲染（`<div borderBottom='1px solid var(--color-border)' marginBottom='14px'>` 风格），跟博主资料 / 评论设置等用 FormRow 标准（32% 标签列 + ROW_BORDER 行底分割线）的 section 不一致。现在 8 个提示词 row 都走 `<FormRowTextareaC>`，跟博主资料的「博客简介 / 写作风格 / AI 记忆」textarea row 完全同款。`FormRowTextareaC` 新增 `labelExtra?: ReactNode` slot 让「恢复默认」按钮可以在 label 旁边右对齐，新增 `mono?: boolean` 切换等宽字体（提示词模板用 mono 看起来更像代码）
- **表单视觉系统统一**：之前 admin 有 51 处 form row 用标准 `FormRow*` 组件（FormC.tsx），但还有 2 处 inline 复刻（gridTemplateColumns 32%/1fr + minHeight 56 + borderBottom 自己写）—— design token 改了容易漂移。
  - 新增 `FormRowRadioC` 组件，行内 N 个原生 `<input type="radio">` 圆孔，复用 FormC 的 `LABEL_WIDTH` / `ROW_BORDER` / `FORM_ROW_MIN_HEIGHT` / `FORM_LABEL_PADDING` / `FORM_VALUE_PADDING` token
  - 把 Settings.tsx 「标题显示方式」+「评论默认排序」2 处 inline 写法替换为 `<FormRowRadioC>`
  - FormC.tsx 把 design token 改成 `export const`（`FORM_LABEL_WIDTH` / `FORM_ROW_BORDER` / `FORM_ROW_MIN_HEIGHT` / `FORM_LABEL_PADDING` / `FORM_VALUE_PADDING`），未来想 inline 写也能用同一份。改这几个常量 = 全表单视觉一致变化
- **`FormSectionC` section 标题和长描述布局重构**：原本 title + description 在同一 flex 行显示，遇到长 description（如 AI 设置「自定义提示词」section 那段几百字说明）会把标题挤变形 / 截断。改成 title 单独一行，description 在标题下方独立段落（`paddingLeft: 21px` 跟标题文字左对齐），短描述也能自然显示。视觉一致 + 长文不再挤压
- **后台所有「保存」按钮去掉 fa-floppy-disk 软盘图标**：保留纯文字「保存」更简洁，避免凌乱视觉。覆盖 12 个文件 18 处实例（AiSettings 6 处、Settings / Tools / PostCreate / PostEdit / PageCreate / PageEdit / Profile / Utterlog / Menus / Security / Albums 各 1-2 处）。**保留 icon 的按钮**：上传类（`fa-cloud-arrow-up`）、AI 类（`fa-wand-magic-sparkles` / `fa-robot` / `fa-brain` 等）

### Fixed

- **dashboard 访问统计被双计 + 看起来像爬虫泛滥**：
  - 根因：`AccessLogger` middleware 在 SSR 命中 HTML 页时同步写一条 `ul_access_logs`（`visitor_id=""` 退化成 IP 做 dedup key），`PageViewTracker` 在浏览器渲染后又 POST `/api/v1/track` 写一条（visitor_id 是浏览器签发的真值）—— 两条 dedup key 不同（IP vs visitor_id）互不拦截，**同一访客被记两次**。dashboard 的「unique 访客」用 `COUNT(DISTINCT COALESCE(visitor_id, ip))` 把这两条算成两个不同访客，admin 误以为统计里混入了爬虫
  - 修复：让 `AccessLogger` middleware **不再写** access_log，让 `/track` 成为唯一访客记录入口。爬虫绝大多数不执行 JS 自然不会触发 PageViewTracker → 不写 access_log → 统计自动接近真实访客数。代价：JS-disabled 访客不被记录，但比例 < 0.1%
  - 历史数据清理：`PurgeAnalytics`（admin 后台「数据统计 → 数据清理」按钮）的 `duplicates` pass 增加 SSR 双计精准清理 —— 删除 `visitor_id 空 + fingerprint 空 + UA 是真浏览器 + 30s 内同 IP 同 path 有真 visitor_id 姐妹行` 的记录。一次点击清理两类重复
  - 也新增 `/admin/analytics/cleanup-bots/preview` 和 `/admin/analytics/cleanup-bots` 独立 endpoint（命令行场景方便）

## [1.4.2] - 2026-04-26

### Fixed

- **文章浏览量（`view_count`）一直不增加**：`analytics.go` 的 `/track` handler 硬编码只识别 `/posts/<slug>` 前缀来匹配文章页，但 admin 在「常规设置 → Permalink」配的模板可以是 `/archives/%post_id%`、`/%year%/%month%/%postname%` 等多种形式 —— 一旦不是 `/posts/` 前缀，view_count 就永远不会 +1。改为按 `permalink_structure` option 编译模板正则反向解析 path，提取 `post_id` 或 `slug` 后查 DB；regex 缓存到 `sync.Map` 避免每次请求重编译。模板支持 `%postname% / %post_id% / %year% / %month% / %day% / %category%`，跟前端 `web/lib/permalink.ts` 1:1 对齐
- 后台「常规设置 → Logo & Favicon」上传后预览框空白：之前 `<img onError={display:none}>` 加载失败时直接 hide，但 ternary 是 `val ? img : icon` —— val 非空 img 加载失败被 hide 后 fa-image 占位也不显示，容器一片空白让用户以为没存上。抽出 `BrandingPreview` 子组件用 `useState(error)` 跟踪加载状态，失败降级到 `fa-image-slash` + 「加载失败」文字，父组件 `key={val}` 让路径变化时重新挂载（修正 url 后自动重试）

## [1.4.1] - 2026-04-26

### Fixed

- **生产环境样式全丢 + 大图片覆盖文章页（hotfix）**：v1.4.0 把 `web/public/themes/<T>/styles.css` 改成 symlink 指向 source 后，dev 模式（bind mount）正常但**生产 Docker 镜像 runner stage 只 COPY `/app/public`**，symlink 目标 `/app/themes/...` 不在镜像里 → 浏览器请求 `/themes/Azure/styles.css` 等返回 404 → CSS 全失效 → 图片没 `max-width` 限制把整页覆盖。修复：
  - 把 4 主题的 `public/themes/<T>/styles.css` 恢复为真实文件（cp -L 解引用，git 追踪真实内容）
  - 新增 `web/scripts/sync-theme-styles.mjs` 自动同步 source → public，挂在 `predev` / `prebuild` npm 钩子下，开发者改完 source 启动 dev / build 时自动同步，不会忘
  - 新增 `web/scripts/sync-theme-styles.mjs` 通过 npm `predev` / `prebuild` 钩子触发
  - `Dockerfile.prod` 加防御性 `find public -type l` 步骤，万一未来再加 symlink 也会在 build 时解引用
  - 撤销之前 `(blog)/layout.tsx` 给 styles.css link 加的 dev cache-buster（symlink 没了，cache 不再是问题）
  - 注：用户在生产环境 admin 上传的 `logo.jpg` / `favicon.jpg` 仍 404 是另一个问题 —— 是生产 uploads volume 里没有对应文件（跨环境 volume 不共享），需要在生产 admin 重新上传

### Changed

- 后台 `.btn` 按钮的 icon-文字间距全局加大（影响 72+ 处带 icon 的 `<Button>` 实例）：
  - `.btn` (md): `0.5rem` → `0.625rem`（8px → 10px）
  - `.btn-sm`: `0.375rem` → `0.5rem`（6px → 8px）
  - `.btn-lg`: `0.625rem` → `0.75rem`（10px → 12px）
  - 修复用户反馈的「+ 添加菜单项 / 📄 从已有页面添加」icon 跟文字贴太近的问题，对 fa-light/fa-regular 细线图标视觉更舒服
- Utterlog 主题文章页相关文章 6 篇/页 → 3 篇/页（一行 3 列布局，更极简，去掉之前的 3×2 网格）
- Utterlog 主题全局视觉圆角统一为 4px（极简风）：
  - 7 处 inline `borderRadius: 0` 直角（CommentList / CommentForm 头像、输入框、textarea）→ `4px`
  - 大圆角元素也降到 4px（PostPage / PostCard / HomePage 卡片 12px → 4px、Header nav active 8px → 4px、tag 6px → 4px、相关文章卡 10px → 4px、链接预览框 8px → 4px、tab-count 徽章 8px → 4px）
  - 评论卡片新增 4px 圆角（reply 子评论 / 总评论框 / 编辑表单 / 操作按钮 / mention card）
  - blockquote 的 `0 4px 4px 0` 保留（左侧粗 border 故意直角）；`borderRadius: '50%'` 头像圆形 / `1px` 列表小圆点 都保留语义

### Added

- **AI 智能评论审核 + 智能回复**（参考 Typecho CommentAI 插件思路移植）：
  - **AI 审核**：访客评论提交时同步调 AI 判断是否合规，返回 `{passed, confidence, reason}` 结构化结果。失败按 `ai_comment_audit_fail_action` 处理（reject 默认 / pending 转人工 / ignore 不动）。复用现有 `ai_providers` 路由，admin 在「AI 设置 → 用途路由」可给 `comment-audit` purpose 单独绑 provider，未绑则走默认链
  - **AI 回复**：审核通过的评论异步生成回复入 `ul_ai_comment_queue` 队列，三种模式：`auto` 立即发布 / `audit` 入队列等管理员 review（推荐）/ `suggest` 仅显示建议。回复内容支持上下文注入（文章标题 / 摘要 / 父评论，独立开关）。并发安全：`processCommentReply` 内部有"队列已存在则跳过"的幂等检查，admin 反复点 approve 不会重复调用
  - **后台「评论 → AI 队列」管理页**：4 status tab（待审核/已发布/已拒绝/错误）+ 数量徽章 + 列表卡片。每条卡片显示原评论 + AI 审核结果 + AI 回复（pending 状态可编辑），操作按钮：发布 / 编辑后发布 / 重新生成 / 拒绝 / 删除
  - **后台「评论设置」新增两个 section**：AI 评论审核（启用 / 阈值 / 失败策略）+ AI 智能回复（启用 / 模式 / 标识文本 / 频率限制 / 延迟 / 上下文勾选 / 触发条件）
  - **AI 提示词管理**：`「AI 设置 → 自定义提示词」` 从 6 项扩到 8 项（加 `comment-audit` 审核 + `comment-reply` 回复），中文默认值 ready
  - **频率限制**：`ai_comment_reply_rate_limit` 限制每小时入队条数，0 = 不限制
  - **延迟**：`ai_comment_reply_delay` 秒数，让回复显得不那么"机械秒回"（默认 0 立即）
  - **触发过滤**：`ai_comment_reply_only_first` 仅对文章首条评论 AI 回复；自动跳过 trackback / pingback / admin 自评
  - **DB 改动**：新表 `ul_ai_comment_queue`（id / comment_id 外键 ON DELETE CASCADE / post_id / comment_text / ai_reply / status / created_at / processed_at / error_msg / reviewer_id / ai_audit_passed/confidence/reason）+ `ul_comments` 加 `is_ai_reply BOOLEAN` 标记
  - **前端展示**：4 主题 CommentList 在 AI 生成的评论旁显示 `🤖 AI 辅助` 紫色徽标（is_admin 博主徽标之后）；admin 在 AI 标识文本里配的尾缀（如 `🤖 AI 辅助回复`）也会附加在评论内容末尾，双重透明性保证
- 后台「常规设置 → 站点基础信息」站点名称下方新增 **标题显示方式** 单选（文字 / 文字 + Logo / Logo），存为 `site_brand_mode` option。**4 个主题 Utterlog / Azure / Chred / Flux 全部接入**，切换主题不会让设置失效；未设置时按"有 Logo 走 logo，没 Logo 走 text"做隐式默认，旧站升级视觉无突变

### Changed

- web 端 Next.js `^16.2.3` → `^16.2.4`（含 `eslint-config-next` 同步升级）。patch 版本，无 API 变更，本地 `next build` 通过；不影响管理面板（admin 是 Vite SPA，不依赖 Next）
- **主题视觉组件独立化（Phase 1 + 2 + 3 全部完成）**：把原共享视觉组件全部复制到每个主题目录，每个主题作者今后可独立调整 UI 不影响其他主题，跟现有 `Header.tsx` / `Footer.tsx` / `PostPage.tsx` / `PostCard.tsx` / `Layout.tsx` / `HomePage.tsx` 主题独立模式一致：
  - **Phase 1（视觉小件，consumer 都是 PostPage / HomePage）**:
    - `AISummary.tsx`（28 行）/ `Pagination.tsx`（109 行）/ `TableOfContents.tsx`（144 行）→ 4 主题各一份
    - `AIReaderChat.tsx`（381 行）→ 4 主题各一份。其中 Azure / Chred / Flux 通过 `PostInteractive.tsx` 间接消费（之前漏判已补）
  - **Phase 2（PostNavigation）**:
    - `PostNavigation.tsx`（321 行）→ 4 主题各一份。内部 `PostLink` / `FadeCover` 的 relative import 重写为绝对路径（路由 / 图片基础设施保持共享）
  - **Phase 3a（评论系统包，3 件强耦合）**:
    - `CommentList.tsx`（737 行）+ `CommentForm.tsx`（403 行）+ `CommentCaptcha.tsx`（212 行）→ 4 主题各一组（共 12 份）
    - 三件搬到同一主题目录，`CommentList → ./CommentForm → ./CommentCaptcha` 的 relative 链自然指向同主题副本
    - Utterlog 直接 `PostPage` 引用，Azure / Chred / Flux 通过各自 `PostInteractive.tsx` 引用（已同步改 import）
  - **Phase 3b（内容渲染包）**:
    - `PostContent.tsx`（560 行）+ `MusicPlayer.tsx`（213 行）→ 4 主题各一份
    - `PostContent` 内部 5 个共享基础设施 import（`code-highlight-styles.css` / `AnnotationProvider` / `BlockAnnotation` / `LazyImage` / `ImageGrid`）改成绝对路径
    - `PostContent` 用 `require('@/components/blog/MusicPlayer')` 动态加载 → 改为 `require('./MusicPlayer')` 指向本主题副本
  - **保留共享的基础设施**（不主题独立 —— 跨主题逻辑必须一致）：
    - 路由：`PostLink`
    - 图片：`FadeCover` / `LazyImage` / `ImageGrid` / `ImageEffects`
    - 批注：`AnnotationProvider` / `BlockAnnotation`
    - 全局：`PageViewTracker` / `SlotHeadClient`
    - 仅 About 页用：`SocialLinks`
  - 共享 `web/components/blog/<Name>.tsx` 保留作为新主题模板（跟 shared `PostCard.tsx` 同样模式），未来新加主题可从这套模板拷贝起步
  - 主题作者改 UI 现在完全自主 —— 改 `themes/<T>/<Component>.tsx` 任意子部分，对其他主题零影响
- 评论设置「分页与排序」section 改名为「排序」。默认排序从下拉选择改为单选圆孔（最新在前 / 最早在前），跟「标题显示方式」UI 一致
- Utterlog 主题 Header 导航改为 admin-driven only（跟 Azure / Chred 一致）：去掉主题代码层硬编码的 5 项 fallback（首页/归档/说说/订阅/关于）。admin 没在「主题 → 菜单 → 顶部导航」配置时 Header 不显示导航项（只剩 logo/文字 brand），点 admin 的「重置默认」按钮种入标准 6 项菜单（首页/关于/归档/说说/友链/订阅）。**BC 提示**：从老版本升级且从未配置过菜单的站点，导航会从 5 项变为空，admin 进「主题 → 菜单 → Utterlog → 顶部导航」点「重置默认」即可恢复
- admin「主题 → 菜单」Utterlog 的「顶部导航」hint 与 Azure 同款文案，提示 admin 留空时的标准菜单内容

### Removed

- 评论分页功能：`comment_pagination` 开关 + `comment_per_page` 每页数都是 placebo —— `CommentList.tsx` 从来没有分页代码，评论一直一次性渲染。后台表单字段移除，启动迁移 `DELETE FROM ul_options WHERE name IN ('comment_pagination','comment_per_page')` 清理墓碑
- 删除 3 个零引用死代码组件：`web/components/blog/BlogHeader.tsx`（103 行）/ `BlogFooter.tsx`（51 行）/ `VisitorAvatars.tsx`（71 行），共 225 行。前两个是各主题抽出独立 `Header.tsx` / `Footer.tsx` 之前的旧版残留；`VisitorAvatars.tsx` 整个仓库无任何 import / 字符串引用。删除后 `tsc --noEmit` 通过

### Fixed

- 评论默认排序后台设置形同虚设：`CommentList.tsx` 之前只读 `localStorage.getItem('comment_order')`，访客没切换过时直接落到硬编码 `'oldest'`，admin 改后台「默认排序」前端从来不响应。改为「localStorage 用户偏好优先 → 没切换过用后台 `comment_order` option → 兜底 `'oldest'`」
- Utterlog 主题文章页「相关文章」无样式 + 封面图爆撑：主题 `styles.css` 还停留在老 `.post-related-item*` schema，但 `PostNavigation.tsx` 早升级为 `.post-related-card*` 网格 + 封面 `aspect-ratio: 16/10` + `object-fit: cover` 卡片。Utterlog 没跟上，导致 className 完全失配 + 封面 div 没有高度限制让 LazyCardImage 内部以原图尺寸渲染。换成 Utterlog 极简圆角白底卡片版（区别于 Azure 的 hover-overlay 黑卡）
- 主题样式文件双副本不同步：`web/themes/<T>/styles.css`（源）和 `web/public/themes/<T>/styles.css`（前端 `<link>` 实际加载的副本）是两份独立文件，每次改样式都要手动 copy，否则改了等于没改。这次发现 Utterlog / Azure 的 public 副本已经落后于源好几天。把 4 个主题的 public/styles.css 全部改成 symlink 指向源，今后改源即时生效（docker bind mount + Next dev 都能正确解析）
- Utterlog 主题分类 icon 不显示：`PostCard.tsx` / `PostPage.tsx` 的分类标签只渲染了 `categories[0].name`，没读 `categories[0].icon`。其他主题（Azure / Chred）在 `constants.ts` 有 `getCategoryIcon()` helper 加 fallback，Utterlog 极简风不加 fallback —— admin 在「主题 → 分类」给分类设了 FontAwesome icon 时显示图标 + 文字，没设时只显示文字
- Utterlog 主题文章页 TOC 不显示：组件 `<TableOfContents>` 已经 import 但被 article 卡片的 `overflow: hidden` 裁掉了。`.blog-toc-outer` 用 `position: absolute; left: calc(100% + 32px)` 突破 article 容器右边显示，但在原结构里 TOC 的 absolute 锚点（relative wrapper）位于带 overflow:hidden 的卡片**内部**。把 TOC 抬到卡片外面、在最外层包一个 relative wrapper 当锚点，TOC 现在会浮在文章卡右侧的空白区跟随滚动 sticky（≥xl 屏幕，1280px+）
- 文章页"已是最早一篇 / 最新文章"边界态封面显示灰色：`PostNavigation.tsx` 边界 fallback 走 `coverUrl` prop，调用方没传时 `{coverUrl && ...}` 不渲染 → 灰底。Utterlog 主题没传 `coverUrl`（Azure / Chred / Flux 都传了），所以症状只在 Utterlog 出现。改在 PostNavigation 内部再加一层 `randomCoverUrl(postId, options)` 兜底，4 主题都受益（有传 prop 时优先用 prop）

### Added

- 文章页相关文章 / 随机文章等 tab 区**主题级 pageSize**：`<PostNavigation>` 加 `pageSize` prop（默认 5，向后兼容 Azure / Chred / Flux）。Utterlog 主题传 `pageSize={6}` 配合 3 列 × 2 行网格布局
- Utterlog 主题文章页 meta 行扩充：除时间和阅读量外加上 **字数 / 阅读时长 / 评论数**（FontAwesome icon + 数字），分类移到行最右侧。阅读时长按中文 300 字/分钟估算，最少 1 分钟；任一字段为 0 不渲染对应项
- Markdown `[download title="" desc="" url=""]` shortcode 全局样式：`web/app/globals.css` 新增 `.md-download-card` / `.md-download-icon` / `.md-download-info` / `.md-download-title` / `.md-download-desc` / `.md-download-btn` 一组类，配色用 CSS 变量 `--md-download-bg` / `--md-download-accent` / `--md-download-text`，主题可在 `themes/<T>/styles.css` 里 override 调成跟主题色协调。原 `PostContent.tsx` 里的 inline style 拆出来走 className，调样式改一处即可。视觉默认保持深色 panel + 橙色 accent（跟原 inline 一致），新增窄屏（≤480px）按钮换行避免挤压

### Changed

- Utterlog 主题相关文章卡片切换为 Azure 同款 hover overlay 风格：平时只显封面 + 角标（日期/分类），hover 时全卡黑色渐变浮起 + 标题滑入 + 浏览/评论数淡入，封面图轻微 scale。原来的"白底卡 + 标题始终可见"改成跟 Azure 一致的交互。Utterlog 网格固定 3 列（窄屏 ≤ 720px 退回 2 列）。hover 触发同时绑定 `.post-related-card:hover` / `.post-related-card-cover:hover` / `:focus-within` 三种状态，更稳健
- dev 模式给主题 `styles.css` link 加 `?v=<timestamp>` 强制 cache-bust。public/ 下的主题样式表浏览器会激进缓存，symlink 替换或源文件改动后用户即使硬刷新也可能命中旧缓存。生产模式不加 query，靠版本化 docker 镜像保证 URL 一致
- Logo / Favicon 上传 URL 拼了 `site_url` 导致跨环境失效：`UploadBranding` 之前返回 `<site_url>/logo.png` 形式绝对地址写进 DB，admin 改 site_url 或迁移环境后 logo 就指向旧域名。改为返回根相对路径 `/logo.png`，浏览器自动用当前页面 origin 拼接，配置真正全局通用。配套 DB migration 把已存的 `<host>/<purpose>.<ext>` 严格匹配规范化为相对路径（admin 故意填的外部 CDN URL 不会被改）
- 文字+Logo 模式下 Header 显示双重站名：img `alt` 属性等于 siteName，破图 fallback 时浏览器同时显示 alt 文本 + 旁边的 `<span>` 文字。`text_logo` 模式 alt 改为空字符串（图片仅作装饰）；`logo` only 模式仍保留 alt={siteName} 服务无障碍 + 破图 fallback
- Azure / Chred 主题写死中文站名 `'西风'` 作为 `site.title` 的 fallback：admin 没设站名时显示别人的站名。改为中性 `'Utterlog'`
- Azure / Chred 主题未接入 `site_brand_mode`：admin 选「文字」也强制显示 logo + 文字。本次接入，4 主题统一遵守后台设置

### Fixed

- 深色 Logo（`site_logo_dark`）上传后前端读不到：`web/lib/theme-data.ts` 错读成 `site_dark_logo`，与后台 Settings.tsx / 后端 content.go 保存的 key 不一致。修正为 `site_logo_dark`。当前 Utterlog 主题暂未启用深色模式，此修复为后续接入预留正确的数据通道
- Utterlog 主题 Header 不渲染上传的 Logo：`web/themes/Utterlog/Header.tsx` 原本只显示文字标题，无视后台 `site_logo`。改为有上传时优先渲染 `<img>`（28px 高 / 180px 宽上限），无上传时退回原文字 lockup
- Flux 主题 Header 不渲染上传的 Logo：原本硬编码绿色圆形 SVG。改为有上传时图片替代圆形 mark，无上传时仍显示原绿色圆形（保留 Flux 默认品牌识别）

### Notes

- favicon / logo 持久化链路确认完整：上传写入 `public/uploads/branding/<purpose>.<ext>`（docker-compose 命名卷 `uploads:/app/public/uploads`，dev 是 `./api/public/uploads` bind mount），api 容器路由 `/logo.:ext` `/dark-logo.:ext` `/favicon.:ext` 优先读持久化路径，回退老路径；`docker compose pull && up -d` 不会丢文件。本次未改动该链路
- 其余主题 Azure / Chred 早已正确读取 `site.logo`，未修改

## [1.3.2] - 2026-04-26

### Fixed

- 文章页"相关文章"列表丢内容：tags 命中 ≥ 6 篇时，category / 全文搜索两个 fallback 的 `LIMIT 5-len(related)` 算成负数，PostgreSQL 直接报错被 sqlx 静默吞掉。统一为 `LIMIT 20-len(related)`，保留 20 条总上限的语义
- 文章页"友链更新"全部显示 1970-01-01：后端 SQL 漏选 `fi.pub_date` 列，结构体里 `db:"pub_date"` 取不到值默认 0；补上 SELECT 列
- PostNavigation `setState during render` 警告：分页越界自愈逻辑改到 `useEffect` 里依赖 `[activeTab, data, pageIndex]`

## [1.3.1] - 2026-04-25

### Fixed

- feeds 订阅页卡片展开不再顶动布局：长文卡片点击展开时用浮层方式盖在下方卡片之上，grid 单元格保持原位
- 登录密码错误提示丢失：axios 拦截器把 `/auth/login` 的 401 当成 token 过期触发刷新-重试，把 toast 提示带着重定向一起冲掉了；现在 `/auth/login` `/auth/refresh` `/auth/totp/validate` `/auth/passkey/*` 全部跳过刷新逻辑
- favicon / logo 升级后丢失：上传文件统一写入挂载卷下的 `public/uploads/branding/`，对外路径通过 `servePersistent` 优先走持久化路径
- AI 提取关键词/摘要回复 "Please provide the article"：旧版本保存的英文默认提示词没有 `{title}` `{content}` 占位符；增加占位符缺失时自动追加 `\n标题/内容` 兜底，并清理 DB 中 3 条已知的过时英文默认提示词

### Changed

- AI 封面图提示词加固：模型常把标题里的英文字母/版本号渲染成画面上的乱码字幕；新默认提示词把"禁止任何文字"指令前置到首行（中英双语），用 `{excerpt_block}` 作为主体描述，`{title}` 降级为尾部话题提示
- 6 项 AI 提示词全部可在后台编辑：摘要 / Slug / 关键词 / 排版 / 推荐问题 / 封面图；每项中文默认值，textarea 留空 + 保存自动恢复默认
- AI 模型分发改为按用途路由：把原先 8 个 `ai_purpose_*_provider` 收成 2 个槽位（content + chat）；DB 自动清理 7 条遗留 option

[Unreleased]: https://github.com/utterlog/utterlog/compare/v1.4.2...HEAD
[1.4.2]: https://github.com/utterlog/utterlog/releases/tag/v1.4.2
[1.4.1]: https://github.com/utterlog/utterlog/releases/tag/v1.4.1
[1.4.0]: https://github.com/utterlog/utterlog/releases/tag/v1.4.0
[1.3.2]: https://github.com/utterlog/utterlog/releases/tag/v1.3.2
[1.3.1]: https://github.com/utterlog/utterlog/releases/tag/v1.3.1
