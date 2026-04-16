# Utterlog 安装指南

## 要求

- VPS 任何配置（512MB 起步即可 —— 脚本自动检测内存选最佳模式）
- Docker + Docker Compose plugin

就这些。

---

## 两条命令部署

```bash
# 初次部署
git clone https://github.com/Utterlog/utterlog.git && cd utterlog
make deploy

# 以后更新
make update
```

`make deploy` 自动做完以下所有事:
1. 检测你的 VPS 内存（≥2GB 本地构建 / <2GB 从 ghcr.io 拉预构建镜像）
2. 生成 `.env`（含随机 24 字符 DB_PASSWORD + 48 字符 JWT_SECRET）
3. 找空闲端口（默认 9527，被占则自动顺延）
4. 启动所有容器
5. 健康检查
6. 打印访问地址 + 凭据 + 下一步提示

成功后看到：
```
Access URL: http://127.0.0.1:9527  (loopback only, not public)
Point your reverse proxy at 127.0.0.1:9527
```

---

## 配反代（选一个场景）

Utterlog 只绑本机（`127.0.0.1`），公网看不到。你需要用已有反代软件把域名转发过去：

| 你的情况 | 怎么配 |
|---|---|
| **1Panel / 宝塔 / AAPanel** | 面板里加反向代理，域名 + `http://127.0.0.1:9527` → 见 [deploy/1panel.md](deploy/1panel.md) |
| **自建 nginx** | 复制 [deploy/nginx.conf.example](deploy/nginx.conf.example) 片段 |
| **自建 Caddy** | 复制 [deploy/Caddyfile.example](deploy/Caddyfile.example) |
| **纯净 VPS 啥都没有** | 换 `DOMAIN=blog.你域名 make deploy-tls` —— 自带 Caddy 自动 TLS |

完成后浏览器访问你的域名 → `/install` 向导 → 创建管理员。

---

## 常用命令

```bash
make logs       # 看日志
make ps         # 容器状态
make stop       # 停止
make help       # 查看所有命令
```

---

## 故障排查

### 部署后打不开
```bash
make ps         # 四个容器都应是 healthy
make logs-api   # 看 API 错误
```

### 想重装
```bash
make clean      # 删除所有数据（需确认 yes）
make deploy     # 重新来过
```

### API 没响应
检查反代目标端口是否跟 `.env` 里的 `UTTERLOG_PORT` 一致：
```bash
grep UTTERLOG_PORT .env
curl http://127.0.0.1:$(grep UTTERLOG_PORT .env | cut -d= -f2)/api/v1/install/status
```

### 域名 HTTPS 证书申请失败（deploy-tls 模式）
```bash
dig +short blog.yoursite.com    # 应返回 VPS IP
make logs                        # 查 caddy 日志
```

---

## 裸机部署（无 Docker）

不推荐。细节见 [deploy/README.md](deploy/README.md) 末尾。

## 更新 schema（开发）

```bash
make schema    # 导出当前 DB schema 到 api/schema.sql
git add api/schema.sql
git commit -m "schema: <描述>"
```
