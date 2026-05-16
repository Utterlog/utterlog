# UtterlogSync — Typecho 插件

把当前 Typecho 站点的分类、标签、文章、独立页面和评论一键推送到 Utterlog。协议与 WordPress 版 `utterlog-sync` 插件完全一致：服务端 `/api/v1/sync/typecho/*` 是 `/api/v1/sync/wordpress/*` 的别名（同一组 handler）。

## 安装

1. 把整个 `UtterlogSync/` 目录复制到 Typecho 的 `usr/plugins/UtterlogSync/`
2. 后台「控制台 → 插件」启用 `UtterlogSync`
3. 「控制台 → 设置 → 插件 → UtterlogSync」填写：
   - **Utterlog 接收地址**：目标 Utterlog 站点 URL，如 `https://your-utterlog.example.com`，迁移时也可填 `http://IP:端口`
   - **目标站点 UUID** + **同步 Token**：在 Utterlog 后台「工具 → Typecho 同步 → 新建授权」一次生成（Token 只显示一次，立即保存）
   - 批大小 / 超时 / SSL 校验按需调

## 使用

「控制台 → Utterlog 同步」面板：

1. 先点 **测试连接**，确认 URL / UUID / Token 都对
2. 点 **开始推送**，按 `categories → tags → posts → pages → comments` 顺序分批 AJAX 推送，每个资源有独立进度条
3. 完成后远端会自动扫文章内容里的图片 URL（按 `source_url` 域名 + `/usr/uploads/` 路径）异步下载媒体

如果某批失败，按 **重试** 从失败位置继续，不必从头再推。

## 网络诊断

如果连不上目标站，点 **网络诊断**。会跑 4 路 cURL 探针（IPv4/IPv6 × verify/no-verify），逐层报告 DNS / 连接 / TLS / 总耗时，定位问题在 DNS 解析、TCP 连不通、TLS 握手挂起、证书问题中的哪一层。

## 协议

POST `${utterlog_url}/api/v1/sync/typecho/{ping|start|batch|finish}` —— JSON body 带 `{site_uuid, token}` 认证。

- **/ping** — 测试凭据；不产生副作用
- **/start** — 提交 manifest，远端返回 `{job_id}`
- **/batch** — 推一个批次：`{job_id, resource, batch_no, items: [...]}`
- **/finish** — 关 job，触发媒体扫描 + 链接改写

## Typecho 字段映射

| Typecho | Utterlog 字段 |
|---|---|
| `contents.cid` | `source_id` |
| `contents.title` / `slug` / `text` | `title` / `slug` / `content` |
| `contents.created` / `modified` | `published_at_gmt` / `updated_at_gmt`（ISO 8601 UTC） |
| `contents.status` (`publish` / `hidden` / `private` / `waiting`) | `publish` / `draft` / `private` / `pending` |
| `contents.allowComment` | `allow_comment` (bool) |
| `metas.type='category'` | resource `categories` |
| `metas.type='tag'` | resource `tags` |
| `relationships` | `categories[]` + `tags[]` slug 数组 |
| `comments.status` (`approved` / `waiting` / `spam`) | `approved` / `pending` / `spam` |

Markdown 文章（Typecho 用 `<!--markdown-->` 标记）会自动去掉标记，原文按 markdown 直接推送。

## 兼容性

- Typecho 1.2+
- PHP 7.4+
- 需要 `curl` 扩展
- 默认强制 IPv4 出站（国内服务器 IPv6 常常挂起）

## 版本

0.1.0 (2026-05) — 初版，与 WordPress 插件 0.5.4 协议对齐
