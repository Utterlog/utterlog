# Utterlog 部署指南

## 📦 快速开始

### 环境要求
- Docker 20.10+
- Docker Compose 2.0+
- 4GB+ RAM
- 20GB+ 磁盘空间

### 1. 克隆代码
```bash
git clone <your-repo> utterlog
cd utterlog
```

### 2. 配置环境
```bash
# 后端配置
cd utterlog-api
cp .env.example .env
# 编辑 .env 配置数据库密码和 JWT 密钥

# 前端配置
cd ../utterlog-admin
cp .env.example .env.local
# 编辑 .env.local 配置 API 地址
```

### 3. 启动服务
```bash
# 开发环境
cd utterlog-api/docker
chmod +x deploy.sh
./deploy.sh development

# 生产环境
./deploy.sh production
```

## 🐳 Docker 部署

### 开发环境
```bash
cd utterlog-api/docker
docker-compose up -d
```

访问地址:
- API: http://localhost:8000
- 前端: http://localhost:3000
- pgAdmin: http://localhost:5050

### 生产环境
```bash
cd utterlog-api/docker
docker-compose -f docker-compose.prod.yml up -d
```

## ⚙️ 环境变量

### 后端 (.env)
```env
# 应用配置
APP_ENV=production
APP_DEBUG=false
APP_URL=https://your-domain.com

# 数据库
DB_HOST=db
DB_PORT=5432
DB_NAME=utterlog
DB_USER=postgres
DB_PASSWORD=your_secure_password

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password

# JWT
JWT_SECRET=your_jwt_secret_key

# 图床配置
MEDIA_DRIVER=local
# MEDIA_DRIVER=s3
# S3_KEY=your_key
# S3_SECRET=your_secret
# S3_BUCKET=your_bucket
# S3_REGION=us-east-1
```

### 前端 (.env.local)
```env
NEXT_PUBLIC_API_URL=https://your-domain.com/api/v1
```

## 🔒 SSL 配置

### 使用 Let's Encrypt
```bash
# 安装 certbot
docker run -it --rm \
  -v "$(pwd)/ssl:/etc/letsencrypt" \
  -v "$(pwd)/nginx:/data/letsencrypt" \
  certbot/certbot certonly \
  --webroot --webroot-path=/data/letsencrypt \
  -d your-domain.com
```

### 手动配置
将证书放入 `utterlog-api/docker/ssl/`:
- `cert.pem` - 证书
- `key.pem` - 私钥

## 🔄 更新部署

```bash
# 拉取最新代码
git pull origin main

# 重新构建
cd utterlog-api/docker
docker-compose down
docker-compose up -d --build

# 运行迁移
docker exec utterlog-php php /var/www/html/database/migrate.php
```

## 📊 监控

### 查看日志
```bash
# 所有服务
docker-compose logs -f

# 特定服务
docker-compose logs -f php
docker-compose logs -f nginx
docker-compose logs -f db
```

### 资源使用
```bash
docker stats
```

## 🛠️ 故障排查

### 数据库连接失败
```bash
# 检查数据库状态
docker-compose ps db

# 查看数据库日志
docker-compose logs db

# 手动连接测试
docker exec -it utterlog-db psql -U postgres -d utterlog
```

### 权限问题
```bash
# 修复文件权限
chmod -R 755 utterlog-api/storage
chmod -R 755 utterlog-api/public/uploads
chown -R www-data:www-data utterlog-api/storage
```

### 清理缓存
```bash
# 清除 Redis 缓存
docker exec utterlog-redis redis-cli FLUSHALL

# 清除文件缓存
docker exec utterlog-php rm -rf /var/www/html/storage/cache/*
```

## 📋 备份

### 数据库备份
```bash
# 自动备份脚本
docker exec utterlog-db pg_dump -U postgres utterlog > backup_$(date +%Y%m%d).sql
```

### 文件备份
```bash
# 备份上传文件
tar -czf uploads_backup_$(date +%Y%m%d).tar.gz utterlog-api/public/uploads
```
