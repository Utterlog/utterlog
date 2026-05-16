<?php
/**
 * Thin HTTP client for Utterlog sync endpoints.
 * POST /api/v1/sync/typecho/{ping|start|batch|finish|rollback}
 * 所有请求都在 JSON body 里带 {site_uuid, token}。
 *
 * 协议跟 WordPress 插件完全一致，端点路径换成 /sync/typecho 只是为了
 * 调试时一眼分辨；服务端两组路径共享同一组 handler。
 */

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

class UtterlogSync_Client
{
    const DEFAULT_SYNC_PATH = '/api/v1/sync/typecho';

    private $settings;
    private $baseUrl;

    public function __construct($settings)
    {
        $this->settings = $settings;
        $base = isset($settings['utterlog_url']) ? rtrim((string)$settings['utterlog_url'], '/') : '';
        $this->baseUrl = $base !== '' ? $base . self::DEFAULT_SYNC_PATH : '';
    }

    public function ping()
    {
        return $this->post('/ping', array());
    }

    public function start($manifest)
    {
        $resp = $this->post('/start', array('manifest' => $manifest));
        if (isset($resp['error'])) return $resp;
        // 服务端返回 {data: {job_id, ...}} 或裸 {job_id, ...}
        $jobId = $this->unwrap($resp, 'job_id');
        return array('job_id' => $jobId);
    }

    public function pushBatch($jobId, $resource, $batchNo, $items)
    {
        return $this->post('/batch', array(
            'job_id'   => $jobId,
            'resource' => $resource,
            'batch_no' => (int)$batchNo,
            'items'    => $items,
        ));
    }

    public function finish($jobId, $summary = array())
    {
        return $this->post('/finish', array(
            'job_id'  => $jobId,
            'summary' => is_array($summary) ? $summary : array(),
        ));
    }

    public function rollback()
    {
        return $this->post('/rollback', array());
    }

    private function post($suffix, $payload)
    {
        if ($this->baseUrl === '') {
            return array('error' => 'Utterlog URL 未配置');
        }
        if (empty($this->settings['site_uuid']) || empty($this->settings['sync_token'])) {
            return array('error' => 'Site UUID / Token 未配置');
        }
        if (!function_exists('curl_init')) {
            return array('error' => '服务器未安装 cURL 扩展');
        }

        $body = array_merge(
            array(
                'site_uuid' => (string)$this->settings['site_uuid'],
                'token'     => (string)$this->settings['sync_token'],
            ),
            $payload
        );
        $json = json_encode($body, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        if ($json === false) {
            return array('error' => 'JSON 编码失败: ' . json_last_error_msg());
        }

        $ch = curl_init();
        $headers = array(
            'Content-Type: application/json; charset=utf-8',
            'Accept: application/json',
        );
        $verify = !empty($this->settings['verify_ssl']);
        $timeout = isset($this->settings['timeout']) ? (int)$this->settings['timeout'] : 60;

        curl_setopt_array($ch, array(
            CURLOPT_URL            => $this->baseUrl . $suffix,
            CURLOPT_POST           => true,
            CURLOPT_POSTFIELDS     => $json,
            CURLOPT_HTTPHEADER     => $headers,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 15,
            CURLOPT_TIMEOUT        => $timeout,
            CURLOPT_SSL_VERIFYPEER => $verify,
            CURLOPT_SSL_VERIFYHOST => $verify ? 2 : 0,
            CURLOPT_USERAGENT      => 'UtterlogSync-Typecho/' . (defined('UtterlogSync_Plugin::VERSION') ? UtterlogSync_Plugin::VERSION : '0.1.0'),
            CURLOPT_FOLLOWLOCATION => true,
            CURLOPT_MAXREDIRS      => 3,
            CURLOPT_IPRESOLVE      => CURL_IPRESOLVE_V4, // 强制 IPv4 —— IPv6 在国内服务器常常挂起
        ));

        $raw = curl_exec($ch);
        $errno = curl_errno($ch);
        $err = curl_error($ch);
        $httpCode = (int)curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($errno !== 0) {
            return array('error' => 'cURL 错误 (' . $errno . '): ' . $err);
        }
        if ($httpCode >= 400) {
            $msg = 'HTTP ' . $httpCode;
            $decoded = json_decode((string)$raw, true);
            if (is_array($decoded)) {
                $serverMsg = $this->unwrap($decoded, 'message');
                if (!$serverMsg && isset($decoded['error']['message'])) {
                    $serverMsg = $decoded['error']['message'];
                }
                if ($serverMsg) $msg .= ' — ' . $serverMsg;
            } else {
                $msg .= ' — ' . substr((string)$raw, 0, 300);
            }
            return array('error' => $msg);
        }

        $decoded = json_decode((string)$raw, true);
        if (!is_array($decoded)) {
            return array('error' => '响应不是合法 JSON: ' . substr((string)$raw, 0, 200));
        }
        return $decoded;
    }

    /** 服务端可能直接返回字段，或包在 {data: {...}} 里 —— 都兼容。 */
    private function unwrap($resp, $field)
    {
        if (isset($resp[$field])) return $resp[$field];
        if (isset($resp['data'][$field])) return $resp['data'][$field];
        return null;
    }
}
