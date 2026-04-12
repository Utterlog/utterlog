# Westlife Turnstile - 验证码系统

类似Cloudflare Turnstile的现代化人机验证系统，用于WordPress评论保护。

## 📦 文件结构

```
assets/modules/turnstile/
├── turnstile.css      # 验证组件样式（Cloudflare风格）
├── turnstile.js       # 验证组件逻辑（独立模块）
└── README.md          # 本文档
```

## ✨ 功能特性

### 1. **Cloudflare风格UI**
- ✅ 现代化的复选框验证界面
- ✅ 流畅的加载动画
- ✅ 清晰的状态反馈（验证中/成功/失败）
- ✅ 深色模式支持
- ✅ 响应式设计

### 2. **智能验证策略**
- ✅ **已登录用户**：无需验证
- ✅ **信任用户**：已批准评论数 ≥ 3 的游客无需验证
- ✅ **新访客**：需要完成验证

### 3. **安全机制**
- ✅ Token挑战-响应机制
- ✅ Session存储验证状态
- ✅ 5分钟有效期
- ✅ 一次性Token（使用后自动销毁）
- ✅ 后端强制验证
- ✅ Nonce安全校验

## 🚀 使用方法

### 前端集成

验证码系统已自动集成到评论表单中，无需手动调用。

```javascript
// 在comment.js中已自动初始化
this.turnstile = new WestlifeTurnstile(this.form);
this.turnstile.inject();
```

### 手动使用

如果需要在其他表单中使用：

```javascript
// 创建实例
const turnstile = new WestlifeTurnstile(document.getElementById('your-form'));

// 注入验证组件
await turnstile.inject();

// 提交前验证
if (turnstile.isVerified()) {
    // 验证通过，可以提交
} else {
    // 验证未通过
    alert('请先完成人机验证');
}

// 重置验证状态
turnstile.reset();
```

## 🔧 技术实现

### 前端流程

1. **检查用户状态**
   - 登录状态 → 不显示验证码
   - 信任用户 → 不显示验证码
   - 新访客 → 显示验证码

2. **用户点击复选框**
   - 触发验证动画
   - 请求服务器生成Token
   - 显示加载状态

3. **验证成功**
   - 显示成功状态
   - 存储Token到隐藏字段
   - 禁用复选框

4. **提交评论**
   - 验证Token是否存在
   - 将Token随表单提交

### 后端流程

1. **生成Token**
   ```php
   westlife_generate_captcha_token()
   ```
   - 生成32位随机Token
   - 存储到Session
   - 设置5分钟有效期

2. **验证Token**
   ```php
   westlife_verify_comment_captcha($commentdata)
   ```
   - 检查用户登录状态
   - 检查信任用户状态
   - 验证Token是否存在
   - 验证Token是否过期
   - 验证Token是否匹配
   - 使用后销毁Token

3. **查询评论数**
   ```php
   westlife_get_approved_comment_count()
   ```
   - 根据邮箱查询已批准评论数
   - 用于判断是否为信任用户

## 📊 状态管理

### CSS状态类

| 状态类 | 描述 | 视觉效果 |
|--------|------|----------|
| `.wl-turnstile-box` | 默认状态 | 灰色边框 |
| `.wl-verifying` | 验证中 | 蓝色边框 + 加载动画 |
| `.wl-verified` | 验证成功 | 绿色边框 + 成功图标 |
| `.wl-verify-failed` | 验证失败 | 红色边框 + 错误提示 |

### Session数据

| 键名 | 类型 | 描述 |
|------|------|------|
| `wl_captcha_token` | string | 验证Token |
| `wl_captcha_expires` | int | 过期时间戳 |
| `wl_captcha_timestamp` | int | 生成时间戳 |

## 🎨 样式定制

### 修改主题色

```css
/* 验证成功颜色 */
.wl-turnstile-box.wl-verified {
  border-color: #52c41a; /* 绿色 */
}

/* 验证中颜色 */
.wl-turnstile-box.wl-verifying {
  border-color: #1890ff; /* 蓝色 */
}

/* 验证失败颜色 */
.wl-turnstile-box.wl-verify-failed {
  border-color: #ff4d4f; /* 红色 */
}
```

### 修改Logo文本

修改 `turnstile.js` 第491行：

```javascript
<span class="wl-turnstile-logo">Your Brand Name</span>
```

## 🔐 安全建议

1. **定期更新Token有效期**
   - 修改 `inc-turnstile.php` 第17行
   - 默认：300秒（5分钟）

2. **监控验证失败日志**
   - 检查 WordPress 错误日志
   - 关注异常的验证失败模式

3. **调整信任用户阈值**
   - 修改评论数阈值（默认：3）
   - `turnstile.js` 第48行
   - `inc-turnstile.php` 第77行

## 📝 API接口

### 1. 生成Token

```
POST /wp-admin/admin-ajax.php
action: westlife_generate_captcha_token
nonce: westlife_ajax_nonce
timestamp: 当前时间戳
```

**响应：**
```json
{
  "success": true,
  "data": {
    "token": "xxxxx...",
    "expires": 1234567890,
    "message": "验证token生成成功"
  }
}
```

### 2. 查询评论数

```
POST /wp-admin/admin-ajax.php
action: westlife_get_approved_comment_count
nonce: westlife_ajax_nonce
email: 用户邮箱
```

**响应：**
```json
{
  "success": true,
  "data": {
    "count": 5,
    "email": "user@example.com"
  }
}
```

## 🐛 调试

### 启用控制台日志

验证码系统已内置详细的控制台日志：

```javascript
// 查看验证流程
[Turnstile] 验证成功，Token: xxxxx...
[Turnstile] 验证失败: Error message
```

### 检查PHP错误日志

```bash
# 查看WordPress错误日志
tail -f wp-content/debug.log | grep Turnstile
```

## 📄 许可

与主题保持一致，采用相同的开源许可。

## 🔗 相关链接

- Cloudflare Turnstile: https://www.cloudflare.com/products/turnstile/
- WordPress Session: https://developer.wordpress.org/plugins/users/
- WordPress Nonce: https://developer.wordpress.org/apis/security/nonces/

---

**版本：** 2.0.0  
**作者：** Westlife Theme  
**更新：** 2025-10-08


