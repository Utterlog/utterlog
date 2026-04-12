<?php
/**
 * Token 集成测试脚本
 * 
 * 使用方法：
 * 1. 配置好 WordPress 和 AI Bridge 插件
 * 2. 在 WordPress 根目录运行：wp eval-file test-token-integration.php
 * 或直接在浏览器访问（需添加认证）
 */

if ( ! defined( 'ABSPATH' ) ) {
    exit;
}

echo "=== AI Bridge Token 集成测试 ===\n\n";

// 检查插件是否激活
if ( ! function_exists( 'gab_ai_bridge' ) ) {
    echo "❌ AI Bridge 插件未激活\n";
    exit( 1 );
}

$settings   = GAB_Settings::get_settings();
$connection = GAB_Settings::get_resolved_connection();

echo "1. 配置检查\n";
echo "   - 连接模式: " . esc_html( $connection['mode'] ) . "\n";
echo "   - 流量方向: " . esc_html( $connection['traffic_mode'] ) . "\n";
echo "   - 端点地址: " . esc_html( $connection['endpoint'] ) . "\n";

// 检查 Token
$site_token = $settings['site_token'] ?? '';
echo "   - Site Token: ";
if ( empty( $site_token ) ) {
    echo "❌ 未配置\n";
} elseif ( strpos( $site_token, 'abt_' ) === 0 ) {
    echo "✅ 动态申请 Token (" . esc_html( substr( $site_token, 0, 12 ) ) . "...)\n";
} elseif ( strpos( $site_token, 'gab_' ) === 0 ) {
    echo "✅ 本地生成 Token (" . esc_html( substr( $site_token, 0, 12 ) ) . "...)\n";
} else {
    echo "⚠️  未知格式 (" . esc_html( substr( $site_token, 0, 12 ) ) . "...)\n";
}

echo "\n2. 提供商 Token 检查\n";
$provider_token = $settings['provider_api_token'] ?? '';
if ( empty( $provider_token ) ) {
    echo "   ⚠️  未配置提供商 Token（测试将可能失败）\n";
} else {
    echo "   ✅ 已配置 (" . esc_html( substr( $provider_token, 0, 8 ) ) . "...)\n";
}

echo "\n3. 测试健康检查端点\n";
$health_url = preg_replace( '#/v1/chat/completions/?$#', '/healthz', $connection['endpoint'] );
$response   = wp_remote_get( $health_url, array( 'timeout' => 10 ) );

if ( is_wp_error( $response ) ) {
    echo "   ❌ 请求失败: " . esc_html( $response->get_error_message() ) . "\n";
} else {
    $status = wp_remote_retrieve_response_code( $response );
    $body   = json_decode( wp_remote_retrieve_body( $response ), true );
    echo "   - HTTP 状态: " . esc_html( $status ) . "\n";
    echo "   - 节点名称: " . esc_html( $body['node_name'] ?? 'N/A' ) . "\n";
    echo "   - 节点模式: " . esc_html( $body['traffic_mode'] ?? 'N/A' ) . "\n";
}

echo "\n4. 测试 API 鉴权\n";
if ( empty( $site_token ) ) {
    echo "   ❌ 跳过测试（未配置 Site Token）\n";
} else {
    $test_url = preg_replace( '#/v1/chat/completions/?$#', '/metrics', $connection['endpoint'] );
    $response = wp_remote_get(
        $test_url,
        array(
            'timeout' => 10,
            'headers' => array(
                'Authorization' => 'Bearer ' . $site_token,
            ),
        )
    );

    if ( is_wp_error( $response ) ) {
        echo "   ❌ 请求失败: " . esc_html( $response->get_error_message() ) . "\n";
    } else {
        $status = wp_remote_retrieve_response_code( $response );
        if ( $status === 200 ) {
            echo "   ✅ Token 验证通过 (HTTP 200)\n";
        } elseif ( $status === 401 ) {
            echo "   ❌ Token 验证失败 (HTTP 401)\n";
        } else {
            echo "   ⚠️  返回状态: HTTP " . esc_html( $status ) . "\n";
        }
    }
}

echo "\n5. 发送测试请求\n";
if ( empty( $site_token ) || empty( $provider_token ) ) {
    echo "   ❌ 跳过测试（缺少必要配置）\n";
} else {
    $result = gab_send_ai_request(
        array( array( 'role' => 'user', 'content' => 'Hello, this is a test.' ) ),
        array( 'provider' => 'openai', 'model' => 'gpt-4.1-mini' )
    );

    if ( is_wp_error( $result ) ) {
        echo "   ❌ 请求失败: " . esc_html( $result->get_error_message() ) . "\n";
    } else {
        echo "   ✅ 请求成功\n";
        echo "   - 响应 ID: " . esc_html( $result['id'] ?? 'N/A' ) . "\n";
        echo "   - 使用模型: " . esc_html( $result['model'] ?? 'N/A' ) . "\n";
        if ( isset( $result['usage'] ) ) {
            echo "   - Token 使用: " . esc_html( $result['usage']['total_tokens'] ?? 0 ) . "\n";
        }
    }
}

echo "\n=== 测试完成 ===\n";
