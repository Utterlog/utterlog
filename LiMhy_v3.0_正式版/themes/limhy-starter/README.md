# LiMhy 官方主题仓库标准包

这是 LiMhy 主题生态第一阶段的官方示例主题仓库，用于给第三方主题作者提供一份**可直接复制、修改、打包、发布**的标准起手模板。

## 适用范围

适用于当前 LiMhy 主题系统第一阶段：

- 支持主题目录扫描
- 支持后台主题外观页识别
- 支持 ZIP 安装导入
- 支持主题启用 / 切换 / 删除
- 支持主题健康检查与兼容校验

## 主题目录结构

```text
my-theme/
  theme.php
  layout.php
  home.php
  post.php
  page.php
  category.php
  tag.php
  search.php
  comments.php
  preview.png
  README.md
  assets/
    style.css
    app.js
```

## 必填文件

### 1. theme.php
主题元信息清单。LiMhy 会读取这里的字段，在后台展示主题信息，并参与兼容性检查。

### 2. layout.php
主题总布局文件。所有页面内容最终应注入到这里。

### 3. home.php
首页模板。缺失会导致主题被判定为异常，且禁止启用。

## 推荐文件

- `post.php`：文章详情页模板
- `page.php`：独立页面模板
- `category.php`：分类页模板
- `tag.php`：标签页模板
- `search.php`：搜索页模板
- `comments.php`：评论区模板
- `preview.png`：后台主题卡预览图
- `assets/style.css`：主题样式文件
- `assets/app.js`：主题脚本文件

## theme.php 字段规范

```php
<?php
declare(strict_types=1);

return [
    'name' => 'LiMhy Starter',
    'slug' => 'limhy-starter',
    'version' => '2.0.0',
    'author' => 'Jason',
    'description' => 'LiMhy 官方主题起手模板',
    'requires' => '2.0.0',
];
```

### 字段说明

- `name`：主题显示名称，必填
- `slug`：主题目录标识，建议与目录名一致，只允许小写字母、数字、中划线
- `version`：主题版本号，建议使用 `major.minor.patch`
- `author`：作者名，建议必填
- `description`：主题简介，建议必填
- `requires`：最低兼容内核版本，建议必填

## 资源引用规范

请优先使用主题资源函数：

```php
<link rel="stylesheet" href="<?= htmlspecialchars(theme_asset('style.css'), ENT_QUOTES, 'UTF-8') ?>">
<script src="<?= htmlspecialchars(theme_asset('app.js'), ENT_QUOTES, 'UTF-8') ?>" defer></script>
```

不要把前台主题样式继续写死到系统级 `/assets/` 里。否则会导致主题切换后仍共用同一套前台资源，失去主题隔离意义。

## ZIP 打包规范

### 正确

压缩包展开后应只有**一个主题根目录**：

```text
my-theme.zip
  └── my-theme/
      ├── theme.php
      ├── layout.php
      ├── home.php
      └── assets/
```

### 错误

#### 错误 1：ZIP 里直接散落文件

```text
my-theme.zip
  ├── theme.php
  ├── layout.php
  └── home.php
```

#### 错误 2：ZIP 里套了多层无意义目录

```text
my-theme.zip
  └── release/
      └── final/
          └── my-theme/
```

#### 错误 3：一个 ZIP 里打进多套主题

```text
my-theme.zip
  ├── theme-a/
  └── theme-b/
```

## 健康检查规则（面向主题作者）

### 通过项

- `theme.php` 存在
- `layout.php` 存在
- `home.php` 存在
- `preview.png/jpg/webp` 存在（建议）
- `assets/` 存在（建议）
- `author` 已填写（建议）
- `description` 已填写（建议）
- `version` 已填写（建议）
- `requires` 已填写（建议）
- `requires <= 当前内核版本`

### 异常项（会阻止启用）

- 缺失 `theme.php`
- 缺失 `layout.php`
- 缺失 `home.php`
- `requires` 高于当前 LiMhy 内核版本

## 禁止事项

- 不要尝试覆盖后台文件
- 不要把主题包做成多主题混装包
- 不要依赖系统未公开的内部模板路径
- 不要在主题中假设某些自定义字段一定存在
- 不要把敏感逻辑写到可被前台直接调用的资源文件里

## 发布前检查清单

- [ ] 目录名与 `theme.php` 中的 `slug` 一致
- [ ] `theme.php` / `layout.php` / `home.php` 齐全
- [ ] 预览图可在后台正确显示
- [ ] `assets/style.css` 可正常加载
- [ ] 主题启用后首页可正常打开
- [ ] 文章页 / 分类页 / 搜索页至少不会报错
- [ ] ZIP 中只有一套主题根目录
- [ ] 兼容版本填写正确

## 推荐发布流程

1. 基于本标准包复制一个新目录
2. 修改 `theme.php`
3. 替换 `preview.png`
4. 完成前台模板与样式开发
5. 在测试站安装 ZIP 包进行验证
6. 确认健康检查为“健康”或“警告”后发布

## 后续建议

当 LiMhy 进入主题生态第二阶段后，可以继续扩展：

- 主题配置面板
- 官方示例主题仓库
- 第三方主题提交流程
- 主题签名与来源校验

---

本标准包的目标不是“做一个漂亮主题”，而是给主题作者一份**可稳定落地、可规范发布、可被系统识别**的官方起手模板。
