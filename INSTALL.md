# Utterlog 安装指南

## 要求

- Docker + Docker Compose
- 开放端口：3000（Web）、8080（API）

## 快速安装（推荐）

```bash
# 1. 克隆
git clone https://github.com/<your-user>/utterlog.git
cd utterlog

# 2. 准备环境变量
cp .env.example .env
# 编辑 .env，修改 DB_PASSWORD 和 JWT_SECRET

# 3. 启动
docker compose up -d

# 4. 完成安装
# 打开浏览器访问 http://localhost:3000
# 系统会自动跳转到 /install 向导
# 按步骤：创建管理员 → 填写站点信息 → 完成
```

就这样。

## 发生了什么

1. **Postgres 容器首启** — 根据 `POSTGRES_DB` / `POSTGRES_USER` / `POSTGRES_PASSWORD` 自动创建数据库
2. **API 容器启动** — 连接数据库，检测到 `ul_users` 表不存在（全新安装），自动加载 `api/schema.sql`
3. **Web 中间件** — 请求根路径时检查 `/install/status`，未安装则跳转 `/install`
4. **安装向导** — 三步：欢迎 → 管理员 → 站点信息

## 目录结构

```
utterlog/
├── api/                 Go 后端
│   ├── schema.sql       数据库 schema（全新安装自动加载）
│   └── .env.example
├── web/                 Next.js 前端
│   └── .env.example
├── docker-compose.yml   容器编排
├── .env.example         顶层环境变量模板
└── INSTALL.md           本文件
```

## 更新 schema.sql（开发者）

如果修改了 DB 结构，需要重新生成 schema.sql：

```bash
./scripts/dump-schema.sh
git add api/schema.sql
git commit -m "chore: update schema"
```

脚本会从运行中的 Postgres 容器导出最新 schema，覆盖 `api/schema.sql`。

## 裸机安装（无 Docker）

1. 安装 PostgreSQL 15+ 和 Redis 7+
2. 创建数据库和用户：
   ```sql
   CREATE DATABASE utterlog;
   CREATE USER utterlog WITH PASSWORD 'your-password';
   GRANT ALL ON DATABASE utterlog TO utterlog;
   ```
3. 加载 schema：
   ```bash
   psql -U utterlog -d utterlog < api/schema.sql
   ```
4. 编辑 `api/.env` 和 `web/.env.local` 填入正确的连接信息
5. 启动后端：
   ```bash
   cd api && go run .
   ```
6. 启动前端：
   ```bash
   cd web && npm install && npm run dev
   ```
7. 访问 http://localhost:3000 完成安装向导

## 修改配置

安装完成后，所有可配置项均在后台「设置」中修改，不需要改 env 文件：

- 站点信息、SEO、主题
- S3/R2 云存储
- 邮件 SMTP
- Telegram Bot
- AI 提供商

只有**数据库连接**和 **JWT Secret** 需要在 `.env` 中修改（修改后需重启服务）。

## 安装完成后再次进入向导

如果需要重置安装（谨慎！会删除所有数据）：

```bash
# 停止服务并删除数据库卷
docker compose down -v
rm -rf pgdata

# 重新启动
docker compose up -d
# 访问 http://localhost:3000 会再次进入向导
```

## 故障排查

### 向导卡在"等待 schema 加载"

- 确认 `api/schema.sql` 文件存在且不为空
- 查看 API 日志：`docker compose logs api | grep -i schema`
- 确认 API 容器有读取 `schema.sql` 的权限

### 向导显示"无法连接后端 API"

- 确认 API 服务正在运行：`docker compose ps`
- 确认 `NEXT_PUBLIC_API_URL` 指向正确地址
- 浏览器控制台查看具体错误

### 重置管理员密码

如果忘记密码，直接进数据库改：

```bash
docker compose exec postgres psql -U utterlog -d utterlog

# 生成 bcrypt 哈希（在 api 容器里）
docker compose exec api go run -exec "cmd" -e 'package main; import ("fmt";"golang.org/x/crypto/bcrypt"); func main() { h,_:=bcrypt.GenerateFromPassword([]byte("new-password"), 10); fmt.Println(string(h)) }'

# 在 psql 里：
UPDATE ul_users SET password = '$2a$10$...' WHERE role = 'admin';
```
