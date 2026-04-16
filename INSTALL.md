# Utterlog 安装指南

## 要求

- **Docker** + Docker Compose plugin
- **1GB+ RAM**（生产模式 ~600MB 实际占用）
- **一个高位端口可用**（默认 9527，被占则自动顺延）
- 可选：自己的 nginx / Caddy 做 TLS 反代（推荐，跟已有服务共存）

## 生产部署

3 种部署方式，任选其一：

### 方式 A：全自动（推荐新手）

```bash
git clone https://github.com/Utterlog/utterlog.git && cd utterlog
make deploy
# 脚本自动生成 .env（含随机 24 字符 DB_PASSWORD + 48 字符 JWT_SECRET）
# 完成后打印密码，务必保存（也在 .env 里）
```

随机源 = 内核 `/dev/urandom`（密码管理器同款熵源），每个部署都不同。

### 方式 B：交互式（部署时提示你输入）

```bash
git clone https://github.com/Utterlog/utterlog.git && cd utterlog
make deploy-interactive
# 提示:
#   DB_PASSWORD (24-char random by default): <按回车 = 自动生成 | 或键入自定义>
#   JWT_SECRET  (48-char random by default): <同上>
```

### 方式 C：手动编辑（完全自己掌控）

```bash
git clone https://github.com/Utterlog/utterlog.git && cd utterlog
cp .env.example .env
$EDITOR .env   # 自己填 DB_PASSWORD 和 JWT_SECRET
make deploy    # 检测到 .env 已存在，不会覆盖
```

### 三种方式都会做的事

脚本统一做：找空闲端口（9527 被占则顺延）→ 构建镜像 → 启动容器 → 健康检查 → 打印访问地址和反代提示。首次约 3-5 分钟。

### 部署后做什么（按你的 VPS 情况选一条）

| 你的情况 | 做什么 |
|---|---|
| **用 1Panel / 宝塔 / AAPanel** | 看 [deploy/1panel.md](deploy/1panel.md) —— GUI 两栏填完搞定 |
| **已有自己的 nginx** | 复制 `deploy/nginx.conf.example` 片段，改域名和端口，reload |
| **已有自己的 caddy** | 复制 `deploy/Caddyfile.example` 片段 |
| **纯净 VPS，啥都没有** | **别用 `make deploy`**，用 `DOMAIN=你.域名 make deploy-tls`（自带 Caddy，自动 TLS） |

最后：浏览器打开你的域名（或 `http://localhost:9527` 经 SSH 隧道）→ 跳转 `/install` 向导 → 创建管理员 → 填站点信息 → 完成。

---

## 场景 C：纯净 VPS + 自动 TLS（零配置）

如果 VPS 上什么反代都没装：

```bash
git clone https://github.com/Utterlog/utterlog.git && cd utterlog

# 一行命令：带域名 + 启用内置 Caddy
DOMAIN=blog.yoursite.com make deploy-tls
```

`make deploy-tls` 额外做的事：
1. 启动一个 Caddy 容器占 80/443
2. Caddy 自动向 Let's Encrypt 申请证书
3. 自动续签
4. 内部反代到 `api:8080`（docker 网络内），不占用 `UTTERLOG_PORT`

**前提**：
- 域名 A 记录已解析到 VPS IP
- VPS 的 80/443 没有其他服务占用（因为要给 Caddy 用）

第一次访问 `https://blog.yoursite.com` 会等 5-30 秒（ACME challenge），之后正常。

## 架构

```
用户浏览器
   │
   ▼
你的 nginx/caddy (80/443, 你原本的)
   │
   ▼
127.0.0.1:9527 (Utterlog API 容器, 仅本机可见)
   │
   ├─ /admin/*     → 内嵌 Vite SPA (管理后台)
   ├─ /api/v1/*    → Go 后端 (数据/认证/业务)
   ├─ /uploads/*   → 本地文件
   └─ 其他         → 反代到 web 容器 (Next.js 博客 SSR)
                     │
                     └─ web 容器: 无公网端口, 仅 docker 内部通信
```

**公网端口:** 0 个新增（你已有的 80/443 继续由你的 nginx 管）
**内部绑定:** 1 个（127.0.0.1:9527）

## 常用命令

```bash
make deploy          # 一键部署 / 重新部署
make deploy-fast     # 重新部署但跳过镜像构建
make logs            # 所有容器日志
make logs-api        # 只看 API 日志
make ps              # 查看容器状态
make stop            # 停止服务
make down            # 停止并删除容器（保留数据）
make clean           # 删除数据（危险，会删库）
```

## 故障排查

### `docker` 找不到
脚本检查依赖并退出。先装 Docker：[docs.docker.com/engine/install](https://docs.docker.com/engine/install/)

### 端口 9527 被占
脚本自动扫描 9527-9576 找空闲端口，找到后写回 `.env`。想固定用其他端口，改 `.env` 里的 `UTTERLOG_PORT=`。

### API 180 秒没起来
```bash
make logs-api
```
常见原因：
- 数据库连接失败 → 检查 postgres 容器是否 healthy：`make ps`
- `schema.sql` 没加载 → 手动 `docker compose -f docker-compose.prod.yml exec postgres psql -U $DB_USER -d $DB_NAME < api/schema.sql`
- pgvector 扩展缺失 → 不会发生（用的是 `pgvector/pgvector:pg18` 镜像）

### 想用自己的 Postgres / Redis
删掉 `docker-compose.prod.yml` 里的 `postgres` 和 `redis` 服务，改 `.env` 里的 `DB_HOST` / `REDIS_HOST` 指向外部实例。

### 完全重置
```bash
make clean   # 会确认 yes 再执行；删除所有容器 + 数据卷
```

## 裸机部署（无 Docker）

不推荐，但可行。需要：
- PostgreSQL 15+（带 pgvector 扩展）
- Redis 7+
- Go 1.26+（编译用）
- Node.js 22+（编译 admin SPA + 跑 Next.js）

```bash
# 1. 数据库
createdb utterlog
psql utterlog -c 'CREATE EXTENSION vector;'
psql utterlog < api/schema.sql

# 2. 构建 admin SPA
cd api/admin && npm ci && npm run build && cd ..

# 3. 构建 Go binary
go build -o utterlog-api .

# 4. 构建 Next.js
cd ../web && npm ci && npm run build

# 5. 启动（分别用 systemd unit 管理更好）
cd ../api && ./utterlog-api &
cd ../web && npm start &
```

## 更新 schema（开发者）

改了 DB 结构后：

```bash
make schema            # = bash scripts/dump-schema.sh
git add api/schema.sql
git commit -m "schema: <描述>"
```

新安装会在首次启动时自动加载 `schema.sql`。
