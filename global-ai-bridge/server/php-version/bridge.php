<?php

/**
 * AI Bridge - PHP Version
 * 
 * 简单的 PHP 版本 AI Bridge 后端，适用于无法部署 Go 服务的用户。
 * 要求：PHP 7.4+，curl 扩展
 * 
 * 使用方法：
 * 1. 将此文件上传到 PHP 服务器
 * 2. 修改 $CONFIG 配置
 * 3. 访问 https://your-domain.com/bridge.php/healthz 测试
 */

// 基础配置
$CONFIG = [
    // 是否启用调试模式
    'debug' => false,

    // 允许的来源（CORS）
    'allowed_origins' => ['*'],

    // AI 提供商配置
    'providers' => [
        'openai' => [
            'base_url' => 'https://api.openai.com/v1',
            'default_model' => 'gpt-4.1-mini',
        ],
        'claude' => [
            'base_url' => 'https://api.anthropic.com/v1',
            'default_model' => '',
            'api_version' => '2023-06-01',
        ],
        'google' => [
            'base_url' => 'https://generativelanguage.googleapis.com/v1beta',
            'default_model' => '',
        ],
        'gemini' => [
            'base_url' => 'https://generativelanguage.googleapis.com/v1beta',
            'default_model' => '',
        ],
        'deepseek' => [
            'base_url' => 'https://api.deepseek.com/v1',
            'default_model' => '',
        ],
    ],
];

// 错误处理
set_error_handler(function ($severity, $message, $file, $line) {
    throw new ErrorException($message, 0, $severity, $file, $line);
});

set_exception_handler(function ($e) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode([
        'error' => [
            'code' => 'internal_error',
            'message' => $GLOBALS['CONFIG']['debug'] ? $e->getMessage() : 'Internal server error',
        ]
    ]);
    exit;
});

// CORS 头
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if (in_array('*', $CONFIG['allowed_origins']) || in_array($origin, $CONFIG['allowed_origins'])) {
    header("Access-Control-Allow-Origin: " . ($origin ?: '*'));
    header("Access-Control-Allow-Methods: GET, POST, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization, X-AIBRIDGE-PROVIDER-TOKEN");
}

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// 路由处理
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = str_replace(dirname($_SERVER['SCRIPT_NAME']), '', $path);
$path = trim($path, '/');

switch ($path) {
    case 'healthz':
        handle_healthz();
        break;

    case 'v1/chat/completions':
        handle_chat_completions($CONFIG);
        break;

    default:
        http_response_code(404);
        header('Content-Type: application/json');
        echo json_encode([
            'error' => [
                'code' => 'not_found',
                'message' => 'Endpoint not found: ' . $path,
            ]
        ]);
        break;
}

/**
 * 健康检查
 */
function handle_healthz()
{
    header('Content-Type: application/json');
    echo json_encode([
        'ok' => true,
        'time' => date('c'),
        'node_name' => 'php-bridge',
        'traffic_mode' => 'selfhosted',
        'mode' => 'Self-Hosted',
        'version' => '1.0.0-php',
    ]);
}

/**
 * 处理聊天完成请求
 */
function handle_chat_completions($config)
{
    if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
        http_response_code(405);
        header('Content-Type: application/json');
        echo json_encode([
            'error' => [
                'code' => 'method_not_allowed',
                'message' => 'POST required',
            ]
        ]);
        return;
    }

    // 获取请求体
    $input = json_decode(file_get_contents('php://input'), true);

    if (!$input || !isset($input['messages']) || !is_array($input['messages'])) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode([
            'error' => [
                'code' => 'invalid_request',
                'message' => 'messages array is required',
            ]
        ]);
        return;
    }

    // 获取提供商 Token
    $provider_token = $_SERVER['HTTP_X_AIBRIDGE_PROVIDER_TOKEN'] ?? '';

    if (empty($provider_token)) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode([
            'error' => [
                'code' => 'missing_provider_token',
                'message' => 'X-AIBRIDGE-PROVIDER-TOKEN header is required',
            ]
        ]);
        return;
    }

    // 确定提供商
    $provider = strtolower($input['provider'] ?? 'openai');

    if (!isset($config['providers'][$provider])) {
        http_response_code(400);
        header('Content-Type: application/json');
        echo json_encode([
            'error' => [
                'code' => 'unsupported_provider',
                'message' => 'Provider not supported: ' . $provider,
            ]
        ]);
        return;
    }

    $provider_config = $config['providers'][$provider];

    // 转发到上游
    try {
        $start_time = microtime(true);

        $response = forward_to_provider(
            $provider,
            $provider_config,
            $provider_token,
            $input
        );

        $latency_ms = round((microtime(true) - $start_time) * 1000);

        // 添加元数据
        $response['raw'] = [
            'latency_ms' => $latency_ms,
        ];

        header('Content-Type: application/json');
        echo json_encode($response);
    } catch (Exception $e) {
        http_response_code(502);
        header('Content-Type: application/json');
        echo json_encode([
            'error' => [
                'code' => 'upstream_error',
                'message' => $e->getMessage(),
            ]
        ]);
    }
}

/**
 * 转发请求到 AI 提供商
 */
function forward_to_provider($provider, $config, $token, $request)
{
    $ch = curl_init();

    // 根据提供商构建请求
    switch ($provider) {
        case 'openai':
        case 'deepseek':
            $url = $config['base_url'] . '/chat/completions';
            $body = [
                'model' => $request['model'] ?? $config['default_model'],
                'messages' => $request['messages'],
                'temperature' => $request['temperature'] ?? 0.7,
            ];
            if (isset($request['max_tokens'])) {
                $body['max_tokens'] = $request['max_tokens'];
            }

            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'Authorization: Bearer ' . $token,
            ]);
            break;

        case 'claude':
            $url = $config['base_url'] . '/messages';
            $split = split_system_messages($request['messages']);
            $body = [
                'model' => $request['model'] ?? $config['default_model'],
                'messages' => $split['messages'],
                'max_tokens' => $request['max_tokens'] ?? 4096,
            ];
            if ($split['system'] !== '') {
                $body['system'] = $split['system'];
            }
            if (isset($request['temperature'])) {
                $body['temperature'] = $request['temperature'];
            }

            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'x-api-key: ' . $token,
                'anthropic-version: ' . ($config['api_version'] ?? '2023-06-01'),
            ]);
            break;

        case 'google':
        case 'gemini':
            $model = $request['model'] ?? $config['default_model'] ?: 'gemini-pro';
            $url = $config['base_url'] . '/models/' . $model . ':generateContent';

            $contents = [];
            $system_text = '';
            foreach ($request['messages'] as $msg) {
                $role = strtolower($msg['role'] ?? 'user');
                if ($role === 'system') {
                    $system_text .= ($system_text !== '' ? "\n\n" : '') . $msg['content'];
                    continue;
                }
                $contents[] = [
                    'role' => $role === 'assistant' ? 'model' : 'user',
                    'parts' => [['text' => $msg['content']]],
                ];
            }

            $body = ['contents' => $contents];
            if ($system_text !== '') {
                $body['systemInstruction'] = ['parts' => [['text' => $system_text]]];
            }
            if (isset($request['temperature']) || isset($request['max_tokens'])) {
                $gen_config = [];
                if (isset($request['temperature'])) $gen_config['temperature'] = $request['temperature'];
                if (isset($request['max_tokens'])) $gen_config['maxOutputTokens'] = $request['max_tokens'];
                $body['generationConfig'] = $gen_config;
            }

            curl_setopt($ch, CURLOPT_HTTPHEADER, [
                'Content-Type: application/json',
                'x-goog-api-key: ' . $token,
            ]);
            break;

        default:
            throw new Exception('Provider not implemented: ' . $provider);
    }

    curl_setopt($ch, CURLOPT_URL, $url);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
    curl_setopt($ch, CURLOPT_POST, true);
    curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($body));
    curl_setopt($ch, CURLOPT_TIMEOUT, 60);
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);

    $response = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $error = curl_error($ch);
    curl_close($ch);

    if ($error) {
        throw new Exception('Curl error: ' . $error);
    }

    if ($http_code !== 200) {
        throw new Exception('Upstream error: HTTP ' . $http_code . ' - ' . $response);
    }

    $data = json_decode($response, true);

    if (!$data) {
        throw new Exception('Invalid upstream response');
    }

    // 标准化响应格式
    return normalize_response($provider, $data);
}

/**
 * 分离 system 消息和普通消息
 */
function split_system_messages($messages)
{
    $system_parts = [];
    $filtered = [];
    foreach ($messages as $msg) {
        if (strtolower($msg['role'] ?? '') === 'system') {
            $content = trim($msg['content'] ?? '');
            if ($content !== '') {
                $system_parts[] = $content;
            }
            continue;
        }
        $filtered[] = [
            'role' => $msg['role'],
            'content' => $msg['content'],
        ];
    }
    return [
        'system' => implode("\n\n", $system_parts),
        'messages' => $filtered,
    ];
}

/**
 * 标准化消息格式
 */
function normalize_messages($messages)
{
    $normalized = [];
    foreach ($messages as $msg) {
        $normalized[] = [
            'role' => $msg['role'],
            'content' => $msg['content'],
        ];
    }
    return $normalized;
}

/**
 * 标准化响应格式
 */
function normalize_response($provider, $data)
{
    $result = [
        'id' => '',
        'provider' => $provider,
        'model' => '',
        'content' => '',
        'usage' => [
            'prompt_tokens' => 0,
            'completion_tokens' => 0,
            'total_tokens' => 0,
        ],
    ];

    switch ($provider) {
        case 'openai':
        case 'deepseek':
            $result['id'] = $data['id'] ?? '';
            $result['model'] = $data['model'] ?? '';
            $result['content'] = $data['choices'][0]['message']['content'] ?? '';
            $result['usage'] = $data['usage'] ?? $result['usage'];
            break;

        case 'claude':
            $result['id'] = $data['id'] ?? '';
            $result['model'] = $data['model'] ?? '';
            $result['content'] = $data['content'][0]['text'] ?? '';
            $result['usage'] = [
                'prompt_tokens' => $data['usage']['input_tokens'] ?? 0,
                'completion_tokens' => $data['usage']['output_tokens'] ?? 0,
                'total_tokens' => ($data['usage']['input_tokens'] ?? 0) + ($data['usage']['output_tokens'] ?? 0),
            ];
            break;

        case 'google':
        case 'gemini':
            $result['id'] = uniqid('gemini_');
            $result['model'] = 'gemini';
            $result['content'] = $data['candidates'][0]['content']['parts'][0]['text'] ?? '';
            $result['usage'] = [
                'prompt_tokens' => $data['usageMetadata']['promptTokenCount'] ?? 0,
                'completion_tokens' => $data['usageMetadata']['candidatesTokenCount'] ?? 0,
                'total_tokens' => $data['usageMetadata']['totalTokenCount'] ?? 0,
            ];
            break;
    }

    return $result;
}
