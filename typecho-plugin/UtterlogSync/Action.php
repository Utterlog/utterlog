<?php
/**
 * AJAX endpoints for the sync flow. Reachable at
 *   /action/utterlog-sync?do=ping|prepare|batch|complete|diag
 * All require admin login and a matching CSRF token.
 *
 * Mirrors the WordPress plugin's flow:
 *   1) ping     —— 测试 Utterlog 凭据
 *   2) prepare  —— 数 5 个资源 + 远端 /start，返回 job_id + 计划
 *   3) batch    —— 单批次（按 resource + offset + limit）抽数据并推送
 *   4) complete —— 远端 /finish，关闭 job
 *   5) diag     —— 4 路 cURL 探针（IPv4/IPv6 × verify/no-verify）
 */

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

class UtterlogSync_Action extends Typecho_Widget implements Widget_Interface_Do
{
    private $options;
    private $settings;

    public function __construct($request, $response, $params = null)
    {
        parent::__construct($request, $response, $params);
        $this->user = Typecho_Widget::widget('Widget_User');
        $this->user->pass('administrator');
        $this->options = Typecho_Widget::widget('Widget_Options');
        $this->settings = $this->loadSettings();
    }

    public function execute()
    {
        $do = $this->request->get('do', '');
        switch ($do) {
            case 'ping':     $this->doPing(); break;
            case 'prepare':  $this->doPrepare(); break;
            case 'batch':    $this->doBatch(); break;
            case 'complete': $this->doComplete(); break;
            case 'diag':     $this->doDiag(); break;
            default:
                $this->jsonError('未知的 action: ' . $do, 400);
        }
    }

    public function action() { $this->execute(); }

    private function loadSettings()
    {
        $plugin = Typecho_Widget::widget('Widget_Options')->plugin('UtterlogSync');
        return array(
            'utterlog_url' => isset($plugin->utterlog_url) ? trim($plugin->utterlog_url) : '',
            'site_uuid'    => isset($plugin->site_uuid) ? trim($plugin->site_uuid) : '',
            'sync_token'   => isset($plugin->sync_token) ? trim($plugin->sync_token) : '',
            'batch_size'   => max(20, min(1000, isset($plugin->batch_size) ? (int)$plugin->batch_size : 100)),
            'timeout'      => max(10, min(300, isset($plugin->timeout) ? (int)$plugin->timeout : 60)),
            'verify_ssl'   => isset($plugin->verify_ssl) ? (int)$plugin->verify_ssl : 1,
        );
    }

    private function client()
    {
        return new UtterlogSync_Client($this->settings);
    }

    private function exporter()
    {
        return new UtterlogSync_Exporter(Typecho_Db::get(), $this->options);
    }

    private function jsonOk($data)
    {
        $this->response->throwJson(array('success' => true, 'data' => $data));
    }

    private function jsonError($message, $status = 400, $extra = array())
    {
        $this->response->setStatus($status);
        $this->response->throwJson(array('success' => false, 'data' => array_merge(array('message' => $message), $extra)));
    }

    private function ensureConfigured()
    {
        if ($this->settings['utterlog_url'] === '' || $this->settings['site_uuid'] === '' || $this->settings['sync_token'] === '') {
            $this->jsonError('请先在「控制台 → 设置 → 插件 → UtterlogSync」填写接收地址、UUID 和 Token', 400);
        }
    }

    private function doPing()
    {
        $this->ensureConfigured();
        $result = $this->client()->ping();
        if (isset($result['error'])) {
            $this->jsonError($result['error'], 400);
        }
        $this->jsonOk($result);
    }

    private function doPrepare()
    {
        $this->ensureConfigured();
        $exporter = $this->exporter();
        $manifest = $exporter->buildManifest();

        $logger = new UtterlogSync_Logger();
        $logger->start('sync');
        $logger->append('启动同步任务', 'info', array('counts' => $manifest['counts']));

        $client = $this->client();
        $start = $client->start($manifest);
        if (isset($start['error'])) {
            $logger->append('start 失败: ' . $start['error'], 'error');
            $logger->finish('failed');
            $this->jsonError('start 请求失败: ' . $start['error'], 400);
        }
        $jobId = isset($start['job_id']) ? (string)$start['job_id'] : '';
        if ($jobId === '') {
            $logger->finish('failed');
            $this->jsonError('远端未返回 job_id', 500);
        }
        $logger->append('已获得 job_id: ' . $jobId, 'info');

        $plan = array();
        foreach (UtterlogSync_Exporter::RESOURCES as $r) {
            $plan[] = array('resource' => $r, 'total' => (int)$manifest['counts'][$r]);
        }

        $this->jsonOk(array(
            'job_id'     => $jobId,
            'plan'       => $plan,
            'batch_size' => $this->settings['batch_size'],
        ));
    }

    private function doBatch()
    {
        $this->ensureConfigured();
        $resource = $this->request->get('resource', '');
        $jobId    = $this->request->get('job_id', '');
        $offset   = max(0, (int)$this->request->get('offset', 0));
        $batchNo  = max(1, (int)$this->request->get('batch_no', 1));

        if (!in_array($resource, UtterlogSync_Exporter::RESOURCES, true)) {
            $this->jsonError('未知 resource: ' . $resource, 400);
        }
        if ($jobId === '') {
            $this->jsonError('缺少 job_id', 400);
        }

        @set_time_limit(0);
        @ini_set('memory_limit', '512M');

        $exporter = $this->exporter();
        $items = $exporter->getBatch($resource, $offset, $this->settings['batch_size']);
        $pushed = count($items);

        if ($pushed > 0) {
            $resp = $this->client()->pushBatch($jobId, $resource, $batchNo, $items);
            if (isset($resp['error'])) {
                $this->jsonError($resource . ' 批次 ' . $batchNo . ' 推送失败: ' . $resp['error'], 500, array('resource' => $resource, 'offset' => $offset));
            }
        }

        // 小于一批 → 说明到尾了；空批次也算 done
        $resourceDone = $pushed < $this->settings['batch_size'];
        $this->jsonOk(array(
            'resource'      => $resource,
            'batch_no'      => $batchNo,
            'offset'        => $offset,
            'pushed'        => $pushed,
            'resource_done' => $resourceDone,
        ));
    }

    private function doComplete()
    {
        $this->ensureConfigured();
        $jobId = $this->request->get('job_id', '');
        if ($jobId === '') {
            $this->jsonError('缺少 job_id', 400);
        }
        $summaryRaw = $this->request->get('summary', '');
        $summary = array();
        if ($summaryRaw !== '') {
            $decoded = json_decode($summaryRaw, true);
            if (is_array($decoded)) $summary = $decoded;
        }
        $resp = $this->client()->finish($jobId, $summary);
        if (isset($resp['error'])) {
            $this->jsonError('finish 请求失败: ' . $resp['error'], 500);
        }
        $logger = new UtterlogSync_Logger();
        $logger->append('同步完成', 'success', array('job_id' => $jobId));
        $logger->finish('success', array('job_id' => $jobId));
        $this->jsonOk(array('job_id' => $jobId));
    }

    /**
     * 4 路 cURL 探针 —— IPv4/IPv6 × verify/no-verify，逐层报告 DNS /
     * 连接 / TLS / 总耗时。诊断 Utterlog 接收地址不通时的具体原因。
     */
    private function doDiag()
    {
        $url = $this->settings['utterlog_url'];
        if ($url === '') {
            $this->jsonError('请先填写 Utterlog URL', 400);
        }
        $probe = rtrim($url, '/') . '/api/v1/install/status';
        $parsed = parse_url($probe);
        $host = isset($parsed['host']) ? $parsed['host'] : '';

        $report = array(
            'url'          => $probe,
            'host'         => $host,
            'php_version'  => PHP_VERSION,
            'curl_version' => function_exists('curl_version') ? curl_version()['version'] : 'n/a',
            'dns'          => array(
                'A'    => $host ? @gethostbynamel($host) : null,
                'AAAA' => null,
            ),
            'tests'        => array(),
        );
        if ($host && function_exists('dns_get_record')) {
            $aaaa = @dns_get_record($host, DNS_AAAA);
            if (is_array($aaaa)) {
                $report['dns']['AAAA'] = array_column($aaaa, 'ipv6');
            }
        }

        $run = function ($label, $ipResolve, $verify) use ($probe) {
            if (!function_exists('curl_init')) {
                return array('label' => $label, 'error' => 'curl ext missing');
            }
            $ch = curl_init();
            $verbose = fopen('php://temp', 'rw+');
            curl_setopt_array($ch, array(
                CURLOPT_URL            => $probe,
                CURLOPT_RETURNTRANSFER => true,
                CURLOPT_CONNECTTIMEOUT => 10,
                CURLOPT_TIMEOUT        => 20,
                CURLOPT_SSL_VERIFYPEER => $verify,
                CURLOPT_SSL_VERIFYHOST => $verify ? 2 : 0,
                CURLOPT_USERAGENT      => 'UtterlogSync-Typecho-Diag/1.0',
                CURLOPT_FOLLOWLOCATION => true,
                CURLOPT_MAXREDIRS      => 3,
                CURLOPT_IPRESOLVE      => $ipResolve,
                CURLOPT_VERBOSE        => true,
                CURLOPT_STDERR         => $verbose,
            ));
            $body = curl_exec($ch);
            $errno = curl_errno($ch);
            $err = curl_error($ch);
            $info = curl_getinfo($ch);
            rewind($verbose);
            $verboseLog = stream_get_contents($verbose);
            fclose($verbose);
            curl_close($ch);
            return array(
                'label'        => $label,
                'ok'           => $errno === 0 && isset($info['http_code']) && $info['http_code'] >= 200 && $info['http_code'] < 400,
                'errno'        => $errno,
                'error'        => $err,
                'http_code'    => isset($info['http_code']) ? (int)$info['http_code'] : 0,
                'primary_ip'   => isset($info['primary_ip']) ? $info['primary_ip'] : '',
                't_dns_ms'     => isset($info['namelookup_time']) ? (int)round($info['namelookup_time'] * 1000) : 0,
                't_connect_ms' => isset($info['connect_time']) ? (int)round($info['connect_time'] * 1000) : 0,
                't_tls_ms'     => isset($info['appconnect_time']) ? (int)round($info['appconnect_time'] * 1000) : 0,
                't_total_ms'   => isset($info['total_time']) ? (int)round($info['total_time'] * 1000) : 0,
                'bytes'        => isset($info['size_download']) ? (int)$info['size_download'] : 0,
                'body_preview' => is_string($body) ? substr($body, 0, 200) : '',
                'verbose'      => substr((string)$verboseLog, 0, 4000),
            );
        };

        $report['tests'][] = $run('IPv4 + verify',  CURL_IPRESOLVE_V4, true);
        $report['tests'][] = $run('IPv4 no-verify', CURL_IPRESOLVE_V4, false);
        $report['tests'][] = $run('IPv6',           CURL_IPRESOLVE_V6, true);
        $report['tests'][] = $run('Auto (default)', CURL_IPRESOLVE_WHATEVER, true);

        $this->jsonOk($report);
    }
}
