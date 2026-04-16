# Utterlog Sync

纯 PHP 的 WordPress 插件，提供四类能力：

1. richer 字段导出：站点、作者、文章、页面、附件、评论、评论 meta、菜单、旧 slug、友情链接
2. 直接同步：按资源和批次将标准化 JSON 推送到 Utterlog
3. 导出预览和日志：后台显示对象数量、记录最近一次导出/同步日志
4. 分批导出：使用批大小控制大站导出和同步的内存压力

## 当前版本

`v0.2.0`

已实现：

- 管理后台设置页
- 导出预览
- 生成 `Utterlog Package v1` (`.ulbk`)
- 导出 `normalized/*.json|ndjson`
- 可选导出 `raw/wordpress/*.ndjson`
- 可选打包 `assets/uploads/*`
- 直接同步到 Utterlog 的批量 JSON 请求
- 最近任务日志展示

仍未实现：

- 增量同步
- 远端进度回调和断点续传
- 二进制附件直接上传到 Utterlog

## 安装方式

1. 把 `utterlog-sync` 目录放到 `wp-content/plugins/`
2. 在 WordPress 后台启用 `Utterlog Sync`
3. 进入 `工具 -> Utterlog Sync`
4. 配置 `Utterlog 地址 / site_uuid / sync_token`
5. 选择本地导出 `.ulbk` 或直接同步

## 直推同步协议

插件默认会请求：

- `POST {utterlog_url}/api/v1/sync/wordpress/start`
- `POST {utterlog_url}/api/v1/sync/wordpress/batch`
- `POST {utterlog_url}/api/v1/sync/wordpress/finish`

如果你的 Utterlog 后端路径不同，可以在后台修改同步路径。插件会自动把结尾误填的 `/start`、`/batch`、`/finish` 修正回基础路径。

## 说明

- 插件端不依赖 Go，也不执行 Go 二进制
- 直推同步不会上传二进制附件本体，只发送标准化数据和媒体 URL
- 直推同步也不会附带 `raw/wordpress` 原始表快照，这两类内容只会出现在本地 `.ulbk` 导出里
- 如果你需要完整二进制附件迁移，优先使用 `.ulbk` 本地导入
