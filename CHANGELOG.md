# Changelog

本文件记录 Utterlog 的版本变更。格式参照 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，
版本号遵循 [Semantic Versioning](https://semver.org/lang/zh-CN/)。

每次提交前先在 `Unreleased` 段落里按 `Added / Changed / Fixed / Removed` 归类追加条目。
发布时把 `Unreleased` 的内容连同当天日期一起降级为新版本段落。

## [Unreleased]

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

[Unreleased]: https://github.com/utterlog/utterlog/compare/v1.3.2...HEAD
[1.3.2]: https://github.com/utterlog/utterlog/releases/tag/v1.3.2
[1.3.1]: https://github.com/utterlog/utterlog/releases/tag/v1.3.1
