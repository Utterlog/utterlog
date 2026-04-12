# Utterlog 开发文档

> 本文档供 AI 助手开发参考，包含完整项目架构、接口规范、数据库设计。

---

## 📋 项目概述

Utterlog 是一个企业级 Headless CMS，采用前后端分离架构。

| 模块 | 技术栈 | 端口 |
|------|--------|------|
| 后端 API | PHP 8.5 + SQLite/PostgreSQL + Redis | 8000 |
| 前端后台 | Next.js 16 + TypeScript + Tailwind | 3000 |

---

## 🏗️ 项目架构

```
utterlog/
├── utterlog-api/              # 后端 API
│   ├── app/
│   │   ├── Core/              # 框架核心
│   │   │   ├── Application.php     # 应用容器
│   │   │   ├── Router.php          # 路由引擎
│   │   │   ├── Request.php         # 请求对象
│   │   │   ├── Response.php        # 响应对象
│   │   │   ├── Database.php        # PDO 封装
│   │   │   ├── Cache.php           # 缓存 (Redis/File)
│   │   │   └── Pipeline.php        # 中间件管道
│   │   ├── Controllers/       # 控制器
│   │   ├── Models/            # 数据模型 (Eloquent-style)
│   │   ├── Services/          # 业务服务
│   │   │   ├── Media/         # 图床服务 (本地/S3/R2/兰空)
│   │   │   └── Import/        # 数据导入 (Typecho/WordPress)
│   │   └── Middleware/        # 中间件
│   ├── config/                # 配置文件
│   ├── database/migrations/   # 数据库迁移
│   ├── routes/api.php         # 路由定义
│   └── public/index.php       # 入口文件
│
└── utterlog-admin/            # 前端后台
    ├── app/
    │   ├── dashboard/         # 管理页面
    │   │   ├── page.tsx       # 仪表盘
    │   │   ├── posts/         # 文章管理
    │   │   ├── categories/    # 分类管理
    │   │   ├── tags/          # 标签管理
    │   │   ├── comments/      # 评论管理
    │   │   ├── links/         # 友链管理
    │   │   ├── media/         # 媒体库
    │   │   └── settings/      # 系统设置
    │   └── login/page.tsx     # 登录页
    ├── components/ui/         # UI 组件库
    ├── lib/
    │   ├── api.ts             # Axios 封装
    │   ├── store.ts           # Zustand 状态管理
    │   └── utils.ts           # 工具函数
    └── hooks/                 # React Hooks
```

---

## 🔌 API 接口规范

### 基础信息
- **基础 URL**: `http://localhost:8000/api/v1`
- **响应格式**: JSON
- **认证方式**: JWT (Bearer Token)

### 响应结构
```typescript
interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta?: {
    request_id: string;
    timestamp: string;
  };
  error?: {
    code: string;
    message: string;
  };
}
```

### 接口列表

#### 认证
```http
POST /auth/login              # 登录
POST /auth/register           # 注册
POST /auth/refresh            # 刷新 Token
POST /auth/logout             # 退出
GET  /auth/me                 # 获取当前用户
```

#### 文章
```http
GET    /posts                 # 文章列表
GET    /posts/{id}            # 文章详情
POST   /posts                 # 创建文章 (需认证)
PUT    /posts/{id}            # 更新文章 (需认证)
DELETE /posts/{id}            # 删除文章 (需认证)
```

#### 分类
```http
GET    /categories            # 分类列表
POST   /categories            # 创建分类 (需认证)
PUT    /categories/{id}       # 更新分类 (需认证)
DELETE /categories/{id}       # 删除分类 (需认证)
```

#### 标签
```http
GET    /tags                  # 标签列表
POST   /tags                  # 创建标签 (需认证)
PUT    /tags/{id}             # 更新标签 (需认证)
DELETE /tags/{id}             # 删除标签 (需认证)
```

#### 评论
```http
GET    /comments              # 评论列表
POST   /comments              # 发表评论
PUT    /comments/{id}         # 更新评论 (需认证)
DELETE /comments/{id}         # 删除评论 (需认证)
```

#### 媒体
```http
GET    /media                 # 文件列表 (需认证)
POST   /media/upload          # 上传文件 (需认证)
DELETE /media/{id}            # 删除文件 (需认证)
```

---

## 🗄️ 数据库设计

### 数据表清单

| 表名 | 用途 | 关键字段 |
|------|------|----------|
| `users` | 用户 | id, username, email, password, role, status |
| `posts` | 文章 | id, title, slug, content, author_id, status |
| `categories` | 分类 | id, name, slug, parent_id, count |
| `tags` | 标签 | id, name, slug, post_count |
| `relationships` | 关系 | post_id, meta_id, type |
| `comments` | 评论 | post_id, author_name, content, status |
| `links` | 友链 | name, url, order_num, status |
| `options` | 配置 | name, value, autoload |
| `media` | 媒体 | name, filename, url, mime_type, size |
| `notifications` | 通知 | user_id, type, title, content, is_read |

### 核心模型方法
```php
// BaseModel 提供的方法
find($id): ?array
create(array $data): int
update(int $id, array $data): bool
delete(int $id): bool
where($column, $operator, $value): self
orderBy($column, $direction): self
limit($limit): self
offset($offset): self
get(): array
first(): ?array
paginate($page, $perPage): array
```

---

## 🧩 核心功能模块

### 1. 认证系统 (JWT)
```php
// 登录
POST /auth/login
Body: { email: string, password: string }
Response: { user, access_token, refresh_token }

// Token 刷新
POST /auth/refresh
Response: { access_token }
```

### 2. 文章管理
- 支持 Markdown 编辑
- 文章状态: `publish`, `draft`, `private`, `pending`
- SEO 字段: title, description, keywords
- 关联分类/标签 (多对多)

### 3. 图床服务
```php
// 配置 .env
MEDIA_DRIVER=local|lsky|s3|r2

// 上传接口
POST /media/upload
Content-Type: multipart/form-data
Body: { file: File }
```

### 4. 数据导入
```php
// Typecho 导入
POST /import/typecho
Body: { host, database, username, password, prefix }

// WordPress 导入
POST /import/wordpress
Content-Type: multipart/form-data
Body: { file: XML }
```

---

## 🎨 前端组件库

### 基础组件
```typescript
// Button
<Button variant="primary|secondary|danger|ghost" size="sm|md|lg" loading={boolean}>

// Input
<Input label="标题" error="错误信息" {...register('name')} />

// Table
<Table columns={columns} data={data} loading={boolean} />

// Modal
<Modal isOpen={boolean} onClose={fn} title="标题">

// Toast
const { success, error, info } = useToast();
success('操作成功');
```

### 页面路由
```typescript
/login                      # 登录页
/dashboard                  # 仪表盘
/dashboard/posts           # 文章列表
/dashboard/posts/create    # 新建文章
/dashboard/posts/edit/:id  # 编辑文章
/dashboard/categories      # 分类管理
/dashboard/tags            # 标签管理
/dashboard/comments        # 评论管理
/dashboard/links           # 友链管理
/dashboard/media           # 媒体库
/dashboard/settings        # 系统设置
```

---

## 🔧 开发规范

### PHP 规范
- 使用 `declare(strict_types=1);`
- 命名空间: `App\Namespace`
- 数组语法: 短数组 `[]`
- 返回类型: 必须声明

### TypeScript 规范
- 严格模式开启
- 组件使用函数式 + Hooks
- Props 必须定义类型
- API 调用统一封装

### 命名规范
| 类型 | 规范 | 示例 |
|------|------|------|
| 类名 | PascalCase | `PostController` |
| 方法 | camelCase | `getPosts` |
| 变量 | camelCase | `$userId` |
| 常量 | UPPER_SNAKE | `MAX_UPLOAD_SIZE` |
| 数据库 | snake_case | `created_at` |

---

## 🚀 开发命令

### 后端
```bash
cd utterlog-api

# 安装依赖
composer install

# 数据库迁移
php database/migrate.php

# 启动开发服务器
php -S localhost:8000 -t public/
```

### 前端
```bash
cd utterlog-admin

# 安装依赖
npm install

# 启动开发服务器
npm run dev

# 构建
npm run build
```

---

## 📦 环境配置

### 后端 (.env)
```env
APP_ENV=development
APP_DEBUG=true
APP_URL=http://localhost:8000

# 数据库
DB_DRIVER=sqlite
DB_FILE=/path/to/storage/database.sqlite

# JWT
JWT_SECRET=your-secret-key

# 图床
MEDIA_DRIVER=local
```

### 前端 (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1
```

---

## 🐛 调试技巧

### 后端
```php
// 日志记录
error_log(json_encode($data));

// 调试 SQL
$db = Database::getInstance();
$pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
```

### 前端
```typescript
// API 请求调试
console.log('API Response:', await api.get('/posts'));

// React Query 调试
const { data, error, isLoading } = useQuery({
  queryKey: ['posts'],
  queryFn: fetchPosts,
});
```

---

## 📚 关键文件速查

| 功能 | 文件路径 |
|------|----------|
| 路由定义 | `utterlog-api/routes/api.php` |
| 数据库连接 | `utterlog-api/app/Core/Database.php` |
| JWT 工具 | `utterlog-api/app/Utils/Jwt.php` |
| 基础模型 | `utterlog-api/app/Models/BaseModel.php` |
| API 封装 | `utterlog-admin/lib/api.ts` |
| 状态管理 | `utterlog-admin/lib/store.ts` |
| UI 组件 | `utterlog-admin/components/ui/` |

---

## ⚡ 常用代码片段

### 后端创建接口
```php
// Controller
public function store(Request $request): Response
{
    $data = $request->validated([
        'title' => 'required|string',
        'content' => 'required|string',
    ]);
    
    $id = $this->post->create($data);
    return $this->success(['id' => $id], '创建成功', 201);
}
```

### 前端表单提交
```typescript
const { register, handleSubmit } = useForm();
const { success, error } = useToast();

const onSubmit = async (data) => {
  try {
    await postsApi.create(data);
    success('创建成功');
    router.push('/dashboard/posts');
  } catch (err) {
    error('创建失败');
  }
};
```

---

## 📝 注意事项

1. **缓存清理**: 修改配置后清除 `storage/cache/`
2. **文件权限**: `storage/` 和 `public/uploads/` 需可写
3. **JWT 过期**: Access Token 15分钟, Refresh Token 7天
4. **图片上传**: 默认限制 10MB, 支持 jpg/png/gif/webp
5. **跨域**: 开发环境已允许所有来源, 生产需配置 CORS

---

*最后更新: 2026-04-11*
