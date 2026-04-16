<?php

if (!defined('ABSPATH')) {
	exit;
}

final class Utterlog_Sync_Client {
	const DEFAULT_SYNC_PATH = '/api/v1/sync/wordpress';

	private $settings;
	private $logger;

	public function __construct($settings = array(), $logger = null) {
		$this->settings = is_array($settings) ? $settings : array();
		$this->logger = $logger;
	}

	public function sync_workspace($workspace, $args = array()) {
		$args = wp_parse_args(
			$args,
			array(
				'batch_size' => isset($this->settings['batch_size']) ? (int) $this->settings['batch_size'] : Utterlog_Package_Exporter::DEFAULT_BATCH_SIZE,
			)
		);
		$args['batch_size'] = max(20, min(Utterlog_Package_Exporter::MAX_BATCH_SIZE, (int) $args['batch_size']));

		$utterlog_url = isset($this->settings['utterlog_url']) ? trim($this->settings['utterlog_url']) : '';
		$site_uuid = isset($this->settings['site_uuid']) ? trim($this->settings['site_uuid']) : '';
		$sync_token = isset($this->settings['sync_token']) ? trim($this->settings['sync_token']) : '';
		$sync_path = isset($this->settings['sync_path']) && $this->settings['sync_path'] ? trim($this->settings['sync_path']) : self::DEFAULT_SYNC_PATH;

		if ($utterlog_url === '' || $site_uuid === '' || $sync_token === '') {
			return new WP_Error('sync_settings_missing', '请先配置 Utterlog 地址、站点 UUID 和同步 Token。');
		}

		$verify_ssl = !isset($this->settings['verify_ssl']) || (bool) $this->settings['verify_ssl'];
		$timeout = isset($this->settings['timeout']) ? max(10, (int) $this->settings['timeout']) : 30;
		$base_url = untrailingslashit($utterlog_url) . '/' . ltrim($this->normalize_sync_path($sync_path), '/');

		if ($this->logger) {
			$this->logger->append('开始推送到 Utterlog', 'info', array('base_url' => $base_url));
			$this->logger->append('直推模式不会上传二进制附件文件，仅发送标准化数据和媒体 URL。', 'warning');
		}

		$start_response = $this->post_json(
			$base_url . '/start',
			array(
				'site_uuid' => $site_uuid,
				'token' => $sync_token,
				'manifest' => $workspace['manifest'],
			),
			$timeout,
			$verify_ssl
		);

		if (is_wp_error($start_response)) {
			return $start_response;
		}

		$job_id = $this->extract_job_id($start_response);
		if (!$job_id) {
			return new WP_Error('sync_job_missing', 'Utterlog 未返回 job_id。');
		}

		$resources = array(
			'site' => 'normalized/site.json',
			'authors' => 'normalized/authors.ndjson',
			'categories' => 'normalized/categories.ndjson',
			'tags' => 'normalized/tags.ndjson',
			'posts' => 'normalized/posts.ndjson',
			'pages' => 'normalized/pages.ndjson',
			'media' => 'normalized/media.ndjson',
			'comments' => 'normalized/comments.ndjson',
			'comment_meta' => 'normalized/comment_meta.ndjson',
			'links' => 'normalized/links.ndjson',
			'menus' => 'normalized/menus.ndjson',
			'menu_items' => 'normalized/menu_items.ndjson',
			'redirects' => 'normalized/redirects.ndjson',
		);

		foreach ($resources as $resource => $relative_path) {
			$absolute_path = trailingslashit($workspace['package_root']) . $relative_path;
			if (!file_exists($absolute_path)) {
				continue;
			}

			if ($resource === 'site') {
				$site = json_decode((string) file_get_contents($absolute_path), true);
				$response = $this->post_json(
					$base_url . '/batch',
					array(
						'site_uuid' => $site_uuid,
						'token' => $sync_token,
						'job_id' => $job_id,
						'resource' => $resource,
						'batch_no' => 1,
						'items' => array($site),
					),
					$timeout,
					$verify_ssl
				);
				if (is_wp_error($response)) {
					return $response;
				}
				if ($this->logger) {
					$this->logger->append('已推送 site 批次 1', 'info');
				}
				continue;
			}

			$batch_no = 0;
			foreach ($this->read_ndjson_batches($absolute_path, $args['batch_size']) as $items) {
				$batch_no++;
				$response = $this->post_json(
					$base_url . '/batch',
					array(
						'site_uuid' => $site_uuid,
						'token' => $sync_token,
						'job_id' => $job_id,
						'resource' => $resource,
						'batch_no' => $batch_no,
						'items' => $items,
					),
					$timeout,
					$verify_ssl
				);
				if (is_wp_error($response)) {
					return $response;
				}
				if ($this->logger) {
					$this->logger->append(
						sprintf('已推送 %s 批次 %d（%d 条）', $resource, $batch_no, count($items)),
						'info'
					);
				}
			}
		}

		$finish_response = $this->post_json(
			$base_url . '/finish',
			array(
				'site_uuid' => $site_uuid,
				'token' => $sync_token,
				'job_id' => $job_id,
				'summary' => isset($workspace['manifest']['counts']) ? $workspace['manifest']['counts'] : array(),
			),
			$timeout,
			$verify_ssl
		);

		if (is_wp_error($finish_response)) {
			return $finish_response;
		}

		if ($this->logger) {
			$this->logger->append('Utterlog 同步完成', 'success', array('job_id' => $job_id));
		}

		return array(
			'job_id' => $job_id,
			'response' => $finish_response,
		);
	}

	private function post_json($url, $payload, $timeout, $verify_ssl) {
		$response = wp_remote_post(
			$url,
			array(
				'timeout' => $timeout,
				'headers' => array(
					'Content-Type' => 'application/json',
					'Accept' => 'application/json',
				),
				'sslverify' => $verify_ssl,
				'body' => wp_json_encode($payload),
			)
		);

		if (is_wp_error($response)) {
			if ($this->logger) {
				$this->logger->append('请求失败：' . $response->get_error_message(), 'error', array('url' => $url));
			}
			return $response;
		}

		$status = wp_remote_retrieve_response_code($response);
		$body = wp_remote_retrieve_body($response);
		$data = json_decode($body, true);

		if ($status < 200 || $status >= 300) {
			$message = 'Utterlog 返回错误状态：' . $status;
			if (is_array($data) && isset($data['error']['message'])) {
				$message .= ' - ' . $data['error']['message'];
			}
			if ($this->logger) {
				$this->logger->append($message, 'error', array('url' => $url, 'body' => $body));
			}
			return new WP_Error('sync_http_error', $message);
		}

		return is_array($data) ? $data : array('raw' => $body);
	}

	private function extract_job_id($response) {
		if (isset($response['data']['job_id']) && $response['data']['job_id']) {
			return $response['data']['job_id'];
		}
		if (isset($response['job_id']) && $response['job_id']) {
			return $response['job_id'];
		}
		return null;
	}

	private function normalize_sync_path($sync_path) {
		$sync_path = '/' . ltrim((string) $sync_path, '/');
		foreach (array('/start', '/batch', '/finish') as $suffix) {
			if (substr($sync_path, -strlen($suffix)) === $suffix) {
				$sync_path = substr($sync_path, 0, -strlen($suffix));
				break;
			}
		}
		return rtrim($sync_path, '/');
	}

	private function read_ndjson_batches($path, $batch_size) {
		$handle = fopen($path, 'r');
		if (!$handle) {
			return;
		}

		$items = array();
		while (($line = fgets($handle)) !== false) {
			$line = trim($line);
			if ($line === '') {
				continue;
			}
			$decoded = json_decode($line, true);
			if ($decoded === null && $line !== 'null') {
				continue;
			}
			$items[] = $decoded;
			if (count($items) >= $batch_size) {
				yield $items;
				$items = array();
			}
		}
		fclose($handle);

		if (!empty($items)) {
			yield $items;
		}
	}
}
