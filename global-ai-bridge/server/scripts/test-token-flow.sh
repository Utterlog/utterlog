#!/bin/bash
# Token 申请和验证流程测试脚本

set -e

API_BASE="${API_BASE:-http://localhost:8080}"
ADMIN_TOKEN="${ADMIN_TOKEN:-replace-with-a-random-site-token}"

echo "=== AI Bridge Token 流程测试 ==="
echo "API 地址: $API_BASE"
echo ""

# 测试邮箱
TEST_EMAIL="test-$(date +%s)@example.com"

echo "1. 测试申请 Token"
echo "   邮箱: $TEST_EMAIL"
echo ""

APPLY_RESPONSE=$(curl -s -X POST "$API_BASE/api/apply-token" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_EMAIL\"}")

echo "响应: $APPLY_RESPONSE"
echo ""

# 提取 Token
USER_TOKEN=$(echo "$APPLY_RESPONSE" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ -z "$USER_TOKEN" ]; then
    echo "❌ 申请 Token 失败"
    exit 1
fi

echo "✅ 申请成功"
echo "   Token: ${USER_TOKEN:0:20}..."
echo ""

# 测试重复申请（应该返回相同的 Token）
echo "2. 测试重复申请（应返回相同 Token）"
APPLY_RESPONSE2=$(curl -s -X POST "$API_BASE/api/apply-token" \
  -H "Content-Type: application/json" \
  -d "{\"email\": \"$TEST_EMAIL\"}")

USER_TOKEN2=$(echo "$APPLY_RESPONSE2" | grep -o '"token":"[^"]*"' | cut -d'"' -f4)

if [ "$USER_TOKEN" = "$USER_TOKEN2" ]; then
    echo "✅ 重复申请返回相同 Token"
else
    echo "❌ 重复申请返回了不同的 Token"
fi
echo ""

# 测试使用动态 Token 访问 API
echo "3. 测试使用动态 Token 访问 /v1/chat/completions"
CHAT_RESPONSE=$(curl -s -X POST "$API_BASE/v1/chat/completions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $USER_TOKEN" \
  -H "X-AIBRIDGE-PROVIDER-TOKEN: sk-test-token" \
  -d '{
    "provider": "openai",
    "model": "gpt-4.1-mini",
    "messages": [{"role": "user", "content": "Hello"}]
  }')

echo "响应: ${CHAT_RESPONSE:0:200}..."

if echo "$CHAT_RESPONSE" | grep -q "error\|upstream_error"; then
    echo "⚠️  请求被处理但可能因上游配置失败（这是正常的，因为未配置真实的 Provider Token）"
elif echo "$CHAT_RESPONSE" | grep -q "unauthorized\|invalid"; then
    echo "❌ Token 验证失败"
    exit 1
else
    echo "✅ Token 验证通过"
fi
echo ""

# 测试管理员接口
echo "4. 测试管理员查看 Token 列表"
if [ -n "$ADMIN_TOKEN" ]; then
    LIST_RESPONSE=$(curl -s -X GET "$API_BASE/api/tokens" \
      -H "Authorization: Bearer $ADMIN_TOKEN")
    
    echo "响应: ${LIST_RESPONSE:0:300}..."
    
    if echo "$LIST_RESPONSE" | grep -q "total"; then
        echo "✅ 管理员接口正常工作"
    else
        echo "❌ 管理员接口访问失败"
    fi
else
    echo "⚠️  未配置 ADMIN_TOKEN，跳过管理员接口测试"
fi
echo ""

echo "=== 测试完成 ==="
