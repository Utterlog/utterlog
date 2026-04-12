#!/bin/bash
# 邮件发送测试脚本

set -e

API_BASE="${API_BASE:-http://localhost:8080}"
TEST_EMAIL="${TEST_EMAIL:-test@example.com}"

echo "=== AI Bridge 邮件功能测试 ==="
echo "API 地址: $API_BASE"
echo "测试邮箱: $TEST_EMAIL"
echo ""

echo "1. 测试申请 Token（会触发邮件发送）"
APPLY_RESPONSE=$(curl -s -X POST "$API_BASE/api/apply-token" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_EMAIL\"}")

echo "响应: $APPLY_RESPONSE"
echo ""

USER_TOKEN=$(echo "$APPLY_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$USER_TOKEN" ]; then
    echo "❌ 申请 Token 失败"
    exit 1
fi

echo "✅ Token 申请成功"
echo "   Token: ${USER_TOKEN:0:20}..."
echo ""

if echo "$APPLY_RESPONSE" | grep -q "邮件"; then
    echo "📧 邮件通知已触发（请检查邮箱）"
else
    echo "⚠️  邮件可能未配置或发送失败"
fi
echo ""

echo "2. 检查邮件服务状态"
# 尝试获取统计信息（如果配置了管理员 Token）
if [ -n "$ADMIN_TOKEN" ]; then
    STATS_RESPONSE=$(curl -s -X GET "$API_BASE/api/tokens/stats" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    
    if echo "$STATS_RESPONSE" | grep -q "email"; then
        EMAIL_STATUS=$(echo "$STATS_RESPONSE" | grep -o '"email":"[^"]*"' | cut -d'"' -f4)
        echo "邮件服务状态: $EMAIL_STATUS"
    fi
fi
echo ""

echo "=== 测试完成 ==="
echo ""
echo "提示: 如果邮件未收到，请检查："
echo "  1. .env 中的 EMAIL_PROVIDER、EMAIL_API_KEY、EMAIL_FROM_ADDR 配置"
echo "  2. 邮件服务提供商的 API Key 是否有效"
echo "  3. 发件人域名是否已在邮件服务商验证"
