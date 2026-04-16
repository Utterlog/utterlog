# Utterlog 安装指南

## 要求

- **Docker** + Docker Compose plugin
- **1GB+ RAM**（生产模式 ~600MB 实际占用）
- **一个高位端口可用**（默认 9527，被占则自动顺延）
- 可选：自己的 nginx / Caddy 做 TLS 反代（推荐，跟已有服务共存）

## 生产部署（3 步）

```bash
# 1. 克隆
git clone https://github.com/Utterlog/utterlog.git && cd utterlog

# 2. 部署（自动生成 .env + 随机密码 + 找空闲端口 + 构建 + 启动 + 健康检查）
make deploy

# 3. 部署完成后脚本会打印:
#    - 访问地址（127.0.0.1:9527 或自动选的端口）
#    - DB_PASSWORD / JWT_SECRET（首次生成，保存好）
#    - 使用 Docker 日志、停止命令等
```

就这些。首次运行因为要构建镜像 + `npm run build` + `go build`，需要 3-5 分钟。

### 部署后做什么

1. **验证**：`curl http://127.0.0.1:9527` 应返回 HTML（/install 向导）
2. **配置反代**：编辑 `deploy/nginx.conf.example` 或 `deploy/Caddyfile.example`，替换域名和端口，丢到你的 nginx/caddy 配置里 reload
3. **SSH 隧道试访问**（如果先不想配反代）：
   ```bash
   ssh -L 9527:127.0.0.1:9527 your-vps
   # 本地浏览器打开 http://localhost:9527
   ```
4. **浏览器打开你的域名** → 跳转 `/install` 向导 → 创建管理员 → 填站点信息 → 完成

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
