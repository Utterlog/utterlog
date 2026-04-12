# AI Bridge - PHP 版本

适用于无法部署 Go 服务的环境，只需 PHP 7.4+ 和 curl 扩展。

## 部署要求

- PHP 7.4 或更高版本
- curl 扩展
- 允许出站 HTTPS 连接

## 快速开始

1. **上传文件**
   ```bash
   # 将 bridge.php 上传到你的 PHP 服务器
   # 例如: https://your-domain.com/ai-bridge/bridge.php
   ```

2. **测试部署**
   ```bash
   curl https://your-domain.com/ai-bridge/bridge.php/healthz
   ```

3. **在插件中使用**
   - 连接方式：自定义地址
   - 自定义地址：`https://your-domain.com/ai-bridge/bridge.php/v1/chat/completions`
   - 模型 API Token：你的 OpenAI/Claude 等 Token
   - AI Bridge 访问令牌：留空（自托管模式不需要）

## 支持的提供商

- OpenAI (GPT-4, GPT-3.5)
- Claude (Anthropic)
- Google Gemini
- DeepSeek

## 配置

编辑 `bridge.php` 中的 `$CONFIG` 数组：

```php
$CONFIG = [
    'debug' => false,
    'allowed_origins' => ['*'],
    'providers' => [
        'openai' => [
            'base_url' => 'https://api.openai.com/v1',
            'default_model' => 'gpt-4.1-mini',
        ],
        // ... 其他提供商
    ],
];
```

## Nginx 配置

如果使用 Nginx，添加重写规则：

```nginx
location /ai-bridge/ {
    try_files $uri $uri/ /ai-bridge/bridge.php?$query_string;
}
```

## 与 Go 版本的区别

| 特性 | PHP 版本 | Go 版本 |
|------|----------|---------|
| 部署要求 | PHP 7.4+ | 独立二进制 |
| 性能 | 中等 | 高 |
| 内存使用 | 较高 | 低 |
| 并发处理 | 中等 | 高 |
| Token 申请 | ❌ 不支持 | ✅ 支持 |
| 使用量统计 | ❌ 不支持 | ✅ 支持 |
| 邮件通知 | ❌ 不支持 | ✅ 支持 |
| Connector 代理 | ❌ 不支持 | ✅ 支持 |

## 适用场景

- 共享主机环境
- 已有 PHP 服务器
- 快速测试
- 低流量场景

## 生产建议

对于生产环境，建议使用 Go 版本：
- 更好的性能
- 更低的资源占用
- 完整的 Token 管理
- 使用量统计
