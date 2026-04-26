# Changelog

本文件记录 Utterlog 的版本变更。格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

每次提交前先在 `Unreleased` 段落里按 `Added / Changed / Fixed / Removed` 归类追加条目。
发布时把 `Unreleased` 的内容连同当天日期一起降级为新版本段落。

## [Unreleased]

## [1.4.0] - 2026-04-26

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

[Unreleased]: https://github.com/utterlog/utterlog/compare/v1.4.0...HEAD
[1.4.0]: https://github.com/utterlog/utterlog/releases/tag/v1.4.0
[1.3.2]: https://github.com/utterlog/utterlog/releases/tag/v1.3.2
[1.3.1]: https://github.com/utterlog/utterlog/releases/tag/v1.3.1
