<?php

/**
 * Admin settings handler.
 *
 * @package GlobalAIBridge
 */

if (! defined('ABSPATH')) {
	exit;
}

class GAB_Settings
{
	/**
	 * Option key.
	 */
	const OPTION_KEY = 'gab_settings';

	/**
	 * Logger instance.
	 *
	 * @var GAB_Logger
	 */
	private $logger;

	/**
	 * Constructor.
	 *
	 * @param GAB_Logger $logger Logger instance.
	 */
	public function __construct(GAB_Logger $logger)
	{
		$this->logger = $logger;

		add_action('admin_init', array($this, 'register_settings'));
		add_action('admin_menu', array($this, 'register_settings_page'));
		add_action('admin_post_gab_clear_logs', array($this, 'handle_clear_logs'));
		add_action('wp_ajax_gab_test_connection', array($this, 'handle_test_connection'));
	}

	/**
	 * Returns default settings.
	 *
	 * @return array
	 */
	public static function defaults()
	{
		return array(
			'connection_mode' => 'cloud',
			'traffic_mode'    => 'outbound',
			'cloud_region'    => 'us',
			'custom_endpoint' => '',
			'site_token'      => self::generate_site_token(),
			'provider_api_token' => '',
			'default_provider' => 'openai',
			'default_model'   => '',
			'request_timeout' => 60,
			'enable_logging'  => 1,
			'enable_cache'    => 0,
		);
	}

	/**
	 * Returns built-in cloud endpoints.
	 *
	 * @return array
	 */
	public static function cloud_endpoints()
	{
		return array(
			'us' => array(
				'endpoint'     => 'https://us-aibridge.bluecdn.com/v1/chat/completions',
				'label'        => '美国节点（官方托管）',
				'traffic_mode' => 'outbound',
				'is_official'  => true,
			),
			'cn' => array(
				'endpoint'     => 'https://cn-aibridge.yite.net/v1/chat/completions',
				'label'        => '中国节点（官方托管）',
				'traffic_mode' => 'inbound',
				'is_official'  => true,
			),
		);
	}

	/**
	 * Returns list of official managed domains.
	 *
	 * @return string[]
	 */
	public static function official_domains()
	{
		return array(
			'us-aibridge.bluecdn.com',
			'cn-aibridge.yite.net',
		);
	}

	/**
	 * Returns merged settings.
	 *
	 * @return array
	 */
	public static function get_settings()
	{
		$settings = get_option(self::OPTION_KEY, array());

		if (! is_array($settings)) {
			$settings = array();
		}

		if (empty($settings['custom_endpoint']) && ! empty($settings['proxy_endpoint'])) {
			$settings['custom_endpoint'] = $settings['proxy_endpoint'];
		}

		if (empty($settings['site_token'])) {
			$settings['site_token'] = self::generate_site_token();
		}

		return wp_parse_args($settings, self::defaults());
	}

	/**
	 * Ensures defaults exist on activation.
	 *
	 * @return void
	 */
	public static function initialize_defaults()
	{
		$settings = self::get_settings();
		update_option(self::OPTION_KEY, $settings, false);
	}

	/**
	 * Generates a random site token value.
	 *
	 * @return string
	 */
	public static function generate_site_token()
	{
		return 'gab_' . wp_generate_password(40, false, false);
	}

	/**
	 * Returns the effective endpoint and mode data used by the proxy client.
	 *
	 * @return array
	 */
	public static function get_resolved_connection()
	{
		$settings        = self::get_settings();
		$cloud_endpoints = self::cloud_endpoints();
		$default_region  = 'inbound' === $settings['traffic_mode'] ? 'cn' : 'us';
		$region          = isset($cloud_endpoints[$settings['cloud_region']]) ? $settings['cloud_region'] : $default_region;
		if (isset($cloud_endpoints[$region]) && $cloud_endpoints[$region]['traffic_mode'] !== $settings['traffic_mode']) {
			$region = $default_region;
		}
		$endpoint        = 'custom' === $settings['connection_mode']
			? $settings['custom_endpoint']
			: $cloud_endpoints[$region]['endpoint'];

		return array(
			'mode'          => $settings['connection_mode'],
			'traffic_mode'  => $settings['traffic_mode'],
			'cloud_region'  => $region,
			'endpoint'      => $endpoint,
			'display_label' => 'custom' === $settings['connection_mode']
				? __('自定义地址', 'global-ai-bridge')
				: $cloud_endpoints[$region]['label'],
		);
	}

	/**
	 * Detects the backend mode by querying the health endpoint.
	 *
	 * @param string $endpoint The backend endpoint.
	 * @return array|
WP_Error
	 */
	public static function detect_backend_mode($endpoint)
	{
		$health_url = preg_replace('#/v1/chat/completions/?$#', '/healthz', $endpoint);
		$response   = wp_remote_get(
			$health_url,
			array(
				'timeout' => 10,
				'headers' => array('Accept' => 'application/json'),
			)
		);

		if (is_wp_error($response)) {
			return $response;
		}

		$status_code = wp_remote_retrieve_response_code($response);
		if ($status_code !== 200) {
			return new WP_Error(
				'gab_health_check_failed',
				sprintf(__('Health check failed with status: %d', 'global-ai-bridge'), $status_code)
			);
		}

		$body = json_decode(wp_remote_retrieve_body($response), true);
		if (! is_array($body)) {
			return new WP_Error(
				'gab_invalid_health_response',
				__('Invalid health check response', 'global-ai-bridge')
			);
		}

		// 判断后端模式
		$mode = isset($body['mode']) ? strtolower($body['mode']) : 'selfhosted';

		return array(
			'mode'         => $mode,
			'is_managed'   => $mode === 'managed',
			'is_selfhosted' => $mode === 'selfhosted',
			'node_name'    => $body['node_name'] ?? 'unknown',
			'traffic_mode' => $body['traffic_mode'] ?? 'outbound',
			'raw_response' => $body,
		);
	}

	/**
	 * Checks if the current endpoint is an official managed endpoint.
	 *
	 * @return bool
	 */
	public static function is_managed_endpoint()
	{
		$connection = self::get_resolved_connection();

		// 检查是否是官方托管域名
		$endpoint_host = wp_parse_url($connection['endpoint'], PHP_URL_HOST);
		if (in_array($endpoint_host, self::official_domains(), true)) {
			return true;
		}

		return false;
	}

	/**
	 * Registers plugin settings.
	 *
	 * @return void
	 */
	public function register_settings()
	{
		register_setting(
			'gab_settings_group',
			self::OPTION_KEY,
			array($this, 'sanitize_settings')
		);

		add_settings_section(
			'gab_main_section',
			__('代理配置', 'global-ai-bridge'),
			array($this, 'render_main_section'),
			'gab-settings'
		);

		$fields = array(
			'traffic_mode'    => __('流量方向', 'global-ai-bridge'),
			'connection_mode' => __('连接方式', 'global-ai-bridge'),
			'cloud_region'    => __('云节点区域', 'global-ai-bridge'),
			'custom_endpoint' => __('自定义地址', 'global-ai-bridge'),
			'site_token'      => __('AI Bridge 访问令牌', 'global-ai-bridge'),
			'provider_api_token' => __('模型 API Token', 'global-ai-bridge'),
			'default_provider' => __('默认提供商', 'global-ai-bridge'),
			'default_model'   => __('默认模型', 'global-ai-bridge'),
			'request_timeout' => __('请求超时', 'global-ai-bridge'),
			'enable_logging'  => __('启用日志', 'global-ai-bridge'),
			'enable_cache'    => __('启用缓存标记', 'global-ai-bridge'),
		);

		foreach ($fields as $field => $label) {
			add_settings_field(
				$field,
				$label,
				array($this, 'render_field'),
				'gab-settings',
				'gab_main_section',
				array(
					'field' => $field,
				)
			);
		}
	}

	/**
	 * Registers admin page.
	 *
	 * @return void
	 */
	public function register_settings_page()
	{
		add_management_page(
			__('AI Bridge', 'global-ai-bridge'),
			__('AI Bridge', 'global-ai-bridge'),
			'manage_options',
			'gab-settings',
			array($this, 'render_settings_page')
		);
	}

	/**
	 * Sanitizes settings on save.
	 *
	 * @param array $input Raw values.
	 * @return array
	 */
	public function sanitize_settings($input)
	{
		$defaults = self::defaults();
		$output   = array();
		$regions  = self::cloud_endpoints();

		$output['connection_mode']  = (isset($input['connection_mode']) && 'custom' === $input['connection_mode']) ? 'custom' : 'cloud';
		$output['traffic_mode']     = (isset($input['traffic_mode']) && 'inbound' === $input['traffic_mode']) ? 'inbound' : 'outbound';
		$output['cloud_region']     = (isset($input['cloud_region']) && isset($regions[$input['cloud_region']])) ? $input['cloud_region'] : $defaults['cloud_region'];
		if (isset($regions[$output['cloud_region']]) && $regions[$output['cloud_region']]['traffic_mode'] !== $output['traffic_mode']) {
			$output['cloud_region'] = 'inbound' === $output['traffic_mode'] ? 'cn' : 'us';
		}
		$output['custom_endpoint']  = isset($input['custom_endpoint']) ? esc_url_raw(trim((string) $input['custom_endpoint'])) : '';
		$output['site_token']       = isset($input['site_token']) && '' !== trim((string) $input['site_token']) ? sanitize_text_field((string) $input['site_token']) : self::generate_site_token();
		$output['provider_api_token'] = isset($input['provider_api_token']) ? sanitize_text_field((string) $input['provider_api_token']) : $defaults['provider_api_token'];
		$output['default_provider'] = isset($input['default_provider']) ? sanitize_key((string) $input['default_provider']) : $defaults['default_provider'];
		$output['default_model']    = isset($input['default_model']) ? sanitize_text_field((string) $input['default_model']) : $defaults['default_model'];
		$output['request_timeout']  = isset($input['request_timeout']) ? max(5, absint($input['request_timeout'])) : $defaults['request_timeout'];
		$output['enable_logging']   = empty($input['enable_logging']) ? 0 : 1;
		$output['enable_cache']     = empty($input['enable_cache']) ? 0 : 1;

		add_settings_error(
			self::OPTION_KEY,
			'gab_settings_saved',
			__('AI Bridge 设置已保存。', 'global-ai-bridge'),
			'updated'
		);

		return $output;
	}

	/**
	 * Renders section copy.
	 *
	 * @return void
	 */
	public function render_main_section()
	{
		echo '<p>' . esc_html__('AI Bridge 是一个面向 WordPress 的 AI 代理桥接插件。它不托管模型能力，而是负责在不同网络环境下稳定转发请求，让站点更顺畅地连接海外或国内 AI 服务。', 'global-ai-bridge') . '</p>';

		// 根据后端模式显示不同的说明
		if (self::is_managed_endpoint()) {
			echo '<p><strong>' . esc_html__('托管模式：', 'global-ai-bridge') . '</strong> ' . esc_html__('您正在使用 AI Bridge 托管服务。需要申请访问 Token 才能使用，点击"申请 Token"按钮获取。', 'global-ai-bridge') . '</p>';
		} else {
			echo '<p><strong>' . esc_html__('自托管模式：', 'global-ai-bridge') . '</strong> ' . esc_html__('您正在使用自己部署的后端服务。直接使用 AI 服务商的 API Token 即可，无需额外申请。', 'global-ai-bridge') . '</p>';
		}
	}

	/**
	 * Renders a single settings field.
	 *
	 * @param array $args Field args.
	 * @return void
	 */
	public function render_field(array $args)
	{
		$field    = $args['field'];
		$settings = self::get_settings();
		$value    = isset($settings[$field]) ? $settings[$field] : '';
		$name     = self::OPTION_KEY . '[' . $field . ']';

		switch ($field) {
			case 'connection_mode':
				$endpoints = self::cloud_endpoints();
				$blog_url  = $this->get_self_hosted_blog_url();
				$is_managed = self::is_managed_endpoint();
?>
				<fieldset>
					<div style="margin-bottom: 15px;">
						<label style="display: block; margin-bottom: 10px; font-weight: 600;">
							<input type="radio" name="<?php echo esc_attr($name); ?>" value="cloud" <?php checked($value, 'cloud'); ?> style="margin-right: 8px;" />
							<?php echo esc_html__('使用官方托管服务（推荐）', 'global-ai-bridge'); ?>
						</label>
						<div style="margin-left: 24px; padding: 10px; background: #f0f6fc; border-radius: 4px;">
							<select name="<?php echo esc_attr(self::OPTION_KEY . '[cloud_region]'); ?>" id="gab-cloud-region-inline" style="margin-right: 10px;">
								<option value="us" <?php selected($settings['cloud_region'], 'us'); ?>><?php echo esc_html__('美国节点', 'global-ai-bridge'); ?></option>
								<option value="cn" <?php selected($settings['cloud_region'], 'cn'); ?>><?php echo esc_html__('中国节点', 'global-ai-bridge'); ?></option>
							</select>
							<span class="description" style="color: #666;">
								<?php echo esc_html__('由 AI Bridge 官方提供，需要申请访问 Token', 'global-ai-bridge'); ?>
							</span>
						</div>
					</div>

					<div>
						<label style="display: block; margin-bottom: 10px; font-weight: 600;">
							<input type="radio" name="<?php echo esc_attr($name); ?>" value="custom" <?php checked($value, 'custom'); ?> style="margin-right: 8px;" />
							<?php echo esc_html__('使用自己的服务器（自托管）', 'global-ai-bridge'); ?>
						</label>
						<div style="margin-left: 24px; padding: 10px; background: #f6f7f7; border-radius: 4px;">
							<p class="description" style="margin-bottom: 10px;">
								<?php echo esc_html__('在你自己的服务器上部署后端，API Key 只在你自己的服务器上流转，无需信任第三方。', 'global-ai-bridge'); ?>
								<?php if ('' !== $blog_url) : ?>
									<a href="<?php echo esc_url($blog_url); ?>" target="_blank" rel="noopener noreferrer"><?php echo esc_html__('查看部署教程 →', 'global-ai-bridge'); ?></a>
								<?php endif; ?>
							</p>
						</div>
					</div>
				</fieldset>
			<?php
				break;

			case 'traffic_mode':
			?>
				<fieldset>
					<div class="gab-inline-options">
						<label class="gab-inline-option">
							<input type="radio" name="<?php echo esc_attr($name); ?>" value="outbound" <?php checked($value, 'outbound'); ?> />
							<?php echo esc_html__('出国模式', 'global-ai-bridge'); ?>
						</label>
						<label class="gab-inline-option">
							<input type="radio" name="<?php echo esc_attr($name); ?>" value="inbound" <?php checked($value, 'inbound'); ?> />
							<?php echo esc_html__('回国模式', 'global-ai-bridge'); ?>
						</label>
					</div>
					<p class="description"><?php echo esc_html__('适用于中国大陆或香港站点，通过美国节点访问海外 AI 提供商。', 'global-ai-bridge'); ?></p>
					<p class="description"><?php echo esc_html__('适用于海外服务器或请求，通过中国节点回国访问国内 AI 服务。', 'global-ai-bridge'); ?></p>
				</fieldset>
		<?php
				break;

			case 'cloud_region':
				echo '<span id="gab-cloud-region-row-note" class="description">' . esc_html__('云节点区域已合并到“连接方式”中显示。', 'global-ai-bridge') . '</span>';
				break;

			case 'custom_endpoint':
				printf(
					'<input type="url" class="regular-text code" id="gab-custom-endpoint" name="%1$s" value="%2$s" placeholder="https://your-server.com/v1/chat/completions" />',
					esc_attr($name),
					esc_attr($value)
				);
				echo '<p class="description">' . esc_html__('填入你自己部署的后端地址。支持 Go 版本和 PHP 版本。', 'global-ai-bridge') . '</p>';
				echo '<ul style="margin-left: 20px; list-style: disc;">';
				echo '<li>' . esc_html__('Go 版本: http://your-server:8080/v1/chat/completions', 'global-ai-bridge') . '</li>';
				echo '<li>' . esc_html__('PHP 版本: https://your-domain.com/bridge.php/v1/chat/completions', 'global-ai-bridge') . '</li>';
				echo '</ul>';
				break;

			case 'site_token':
				// 根据后端模式显示不同的内容
				$is_managed = self::is_managed_endpoint();

				if ($is_managed) {
					// 托管模式：显示 Token 输入和申请按钮
					printf(
						'<input type="text" class="regular-text code" id="gab-site-token" name="%1$s" value="%2$s" autocomplete="off" /> <button type="button" class="button button-secondary" id="gab-regenerate-site-token">%3$s</button> <button type="button" class="button button-secondary" id="gab-apply-token">%4$s</button>',
						esc_attr($name),
						esc_attr($value),
						esc_html__('重新生成', 'global-ai-bridge'),
						esc_html__('申请 Token', 'global-ai-bridge')
					);
					echo '<p class="description">' . esc_html__('用于访问 AI Bridge 托管服务的令牌。点击"申请 Token"从后端申请，或使用"重新生成"创建本地令牌。', 'global-ai-bridge') . '</p>';
					echo '<div id="gab-apply-token-modal" style="display:none;margin-top:10px;padding:15px;background:#f0f6fc;border:1px solid #c5d9ed;border-radius:4px;">';
					echo '<p><strong>' . esc_html__('申请 AI Bridge Token', 'global-ai-bridge') . '</strong></p>';
					echo '<p><input type="email" id="gab-apply-email" class="regular-text" placeholder="your@email.com" /></p>';
					echo '<p><button type="button" class="button button-primary" id="gab-apply-token-submit">' . esc_html__('提交申请', 'global-ai-bridge') . '</button> <button type="button" class="button button-secondary" id="gab-apply-token-cancel">' . esc_html__('取消', 'global-ai-bridge') . '</button></p>';
					echo '<p id="gab-apply-result" style="margin-top:10px;"></p>';
					echo '</div>';
				} else {
					// 自托管模式：显示可选提示，不强制要求
					printf(
						'<input type="text" class="regular-text code" id="gab-site-token" name="%1$s" value="%2$s" autocomplete="off" placeholder="' . esc_attr__('自托管模式可选', 'global-ai-bridge') . '" /> <button type="button" class="button button-secondary" id="gab-regenerate-site-token">%3$s</button>',
						esc_attr($name),
						esc_attr($value),
						esc_html__('重新生成', 'global-ai-bridge')
					);
					echo '<p class="description">' . esc_html__('自托管模式下此字段可选。留空即可，插件将直接使用 AI 服务商的 Token 访问后端。', 'global-ai-bridge') . '</p>';
				}
				break;

			case 'provider_api_token':
				$is_managed = self::is_managed_endpoint();
				printf(
					'<input type="password" class="regular-text" name="%1$s" value="%2$s" autocomplete="off" />',
					esc_attr($name),
					esc_attr($value)
				);
				if ($is_managed) {
					echo '<p class="description">' . esc_html__('填写你自己的 OpenAI、Claude、Gemini 或其他提供商的 API Token。此 Token 仅用于转发请求到 AI 服务商，不会被存储。', 'global-ai-bridge') . '</p>';
				} else {
					echo '<p class="description">' . esc_html__('填写你自己的 OpenAI、Claude、Gemini 或其他提供商的 API Token。由于使用自托管后端，此 Token 只会发送到你自己的服务器。', 'global-ai-bridge') . '</p>';
				}
				break;

			case 'default_provider':
				$providers = $this->get_provider_metadata();

				echo '<select name="' . esc_attr($name) . '" id="gab-default-provider">';
				foreach ($providers as $provider_key => $provider_meta) {
					printf(
						'<option value="%1$s" %2$s>%3$s</option>',
						esc_attr($provider_key),
						selected($value, $provider_key, false),
						esc_html($provider_meta['label'])
					);
				}
				echo '</select>';
				echo ' <span id="gab-provider-token-link" class="gab-inline-link"></span>';
				break;

			case 'default_model':
				printf(
					'<input type="text" class="regular-text" name="%1$s" value="%2$s" placeholder="gpt-4.1-mini" />',
					esc_attr($name),
					esc_attr($value)
				);
				echo '<p class="description">' . esc_html__('可选项，仅在调用方未传模型时作为兜底值使用。', 'global-ai-bridge') . '</p>';
				break;

			case 'request_timeout':
				printf(
					'<input type="number" class="small-text" min="5" step="1" name="%1$s" value="%2$s" /> <span class="description">%3$s</span>',
					esc_attr($name),
					esc_attr((string) $value),
					esc_html__('秒', 'global-ai-bridge')
				);
				break;

			case 'enable_logging':
			case 'enable_cache':
				printf(
					'<label><input type="checkbox" name="%1$s" value="1" %2$s /> %3$s</label>',
					esc_attr($name),
					checked(! empty($value), true, false),
					'enable_logging' === $field
						? esc_html__('在 WordPress 选项中保存最近的请求元数据。', 'global-ai-bridge')
						: esc_html__('向代理发送缓存偏好标记。', 'global-ai-bridge')
				);
				break;
		}
	}

	/**
	 * Builds stats from recent logs.
	 *
	 * @param array $logs Recent logs.
	 * @return array
	 */
	private function build_stats(array $logs)
	{
		$stats = array(
			'total_requests' => count($logs),
			'total_tokens'   => 0,
			'avg_latency'    => 0,
			'success_count'  => 0,
			'daily'          => array(),
		);

		if (empty($logs)) {
			return $stats;
		}

		$total_latency = 0;
		foreach ($logs as $log) {
			$tokens = isset($log['tokens']) ? absint($log['tokens']) : 0;
			$latency = isset($log['latency_ms']) ? absint($log['latency_ms']) : 0;
			$status = isset($log['status']) ? (string) $log['status'] : '';
			$date_key = ! empty($log['timestamp']) ? gmdate('m-d', strtotime($log['timestamp'])) : gmdate('m-d');

			$stats['total_tokens'] += $tokens;
			$total_latency += $latency;
			if (is_numeric($status) && (int) $status >= 200 && (int) $status < 300) {
				$stats['success_count']++;
			}

			if (! isset($stats['daily'][$date_key])) {
				$stats['daily'][$date_key] = array(
					'requests' => 0,
					'tokens'   => 0,
				);
			}
			$stats['daily'][$date_key]['requests']++;
			$stats['daily'][$date_key]['tokens'] += $tokens;
		}

		ksort($stats['daily']);
		$stats['daily'] = array_slice($stats['daily'], -7, 7, true);
		$stats['avg_latency'] = (int) round($total_latency / max(1, $stats['total_requests']));

		return $stats;
	}

	/**
	 * Returns provider options for filters.
	 *
	 * @return array
	 */
	private function get_provider_options()
	{
		return array(
			''         => __('全部提供商', 'global-ai-bridge'),
			'openai'   => 'OpenAI',
			'claude'   => 'Claude',
			'google'   => 'Google',
			'gemini'   => 'Gemini',
			'qwen'     => 'Qwen',
			'baidu'    => 'Baidu',
			'deepseek' => 'DeepSeek',
			'doubao'   => 'Doubao',
			'kimi'     => 'Kimi',
			'minimax'  => 'MiniMax',
		);
	}

	/**
	 * Returns provider labels and token URLs.
	 *
	 * @return array
	 */
	private function get_provider_metadata()
	{
		return array(
			'openai' => array(
				'label'     => 'OpenAI',
				'token_url' => 'https://platform.openai.com/api-keys',
			),
			'claude' => array(
				'label'     => 'Claude',
				'token_url' => 'https://console.anthropic.com/settings/keys',
			),
			'google' => array(
				'label'     => 'Google',
				'token_url' => 'https://aistudio.google.com/apikey',
			),
			'gemini' => array(
				'label'     => 'Gemini',
				'token_url' => 'https://aistudio.google.com/apikey',
			),
			'qwen' => array(
				'label'     => 'Qwen',
				'token_url' => 'https://www.alibabacloud.com/help/en/model-studio/use-qwen-by-calling-api',
			),
			'baidu' => array(
				'label'     => 'Baidu',
				'token_url' => 'https://console.bce.baidu.com/qianfan/ais/console/apiKey',
			),
			'deepseek' => array(
				'label'     => 'DeepSeek',
				'token_url' => 'https://platform.deepseek.com/api_keys',
			),
			'doubao' => array(
				'label'     => 'Doubao',
				'token_url' => 'https://console.volcengine.com/ark',
			),
			'kimi' => array(
				'label'     => 'Kimi',
				'token_url' => 'https://platform.moonshot.cn/console/api-keys',
			),
			'minimax' => array(
				'label'     => 'MiniMax',
				'token_url' => 'https://platform.minimaxi.com/',
			),
		);
	}

	/**
	 * Filters logs by provider.
	 *
	 * @param array  $logs     Logs.
	 * @param string $provider Provider key.
	 * @return array
	 */
	private function filter_logs_by_provider(array $logs, $provider)
	{
		$provider = sanitize_key((string) $provider);
		if ('' === $provider) {
			return $logs;
		}

		return array_values(
			array_filter(
				$logs,
				static function ($log) use ($provider) {
					return isset($log['provider']) && $provider === sanitize_key((string) $log['provider']);
				}
			)
		);
	}

	/**
	 * Handles clear logs action.
	 *
	 * @return void
	 */
	public function handle_clear_logs()
	{
		if (! current_user_can('manage_options')) {
			wp_die(esc_html__('无权限执行该操作。', 'global-ai-bridge'));
		}

		check_admin_referer('gab_clear_logs');
		$this->logger->clear_logs();

		wp_safe_redirect(admin_url('tools.php?page=gab-settings&gab_notice=logs_cleared'));
		exit;
	}

	/**
	 * Handles endpoint speed test.
	 *
	 * @return void
	 */
	public function handle_test_connection()
	{
		if (! current_user_can('manage_options')) {
			wp_send_json_error(
				array(
					'message' => __('无权限执行该操作。', 'global-ai-bridge'),
				),
				403
			);
		}

		check_ajax_referer('gab_test_connection', 'nonce');

		$connection = self::get_resolved_connection();
		$health_url = preg_replace('#/v1/chat/completions/?$#', '/healthz', $connection['endpoint']);
		$start      = microtime(true);
		$response   = wp_remote_get(
			$health_url,
			array(
				'timeout' => 10,
				'headers' => array(
					'Accept' => 'application/json',
				),
			)
		);
		$latency_ms = (int) round((microtime(true) - $start) * 1000);

		if (is_wp_error($response)) {
			wp_send_json_error(
				array(
					'message' => $response->get_error_message(),
				),
				500
			);
		}

		$body = json_decode(wp_remote_retrieve_body($response), true);
		wp_send_json_success(
			array(
				'latency_ms'   => $latency_ms,
				'node_name'    => isset($body['node_name']) ? (string) $body['node_name'] : '',
				'traffic_mode' => isset($body['traffic_mode']) ? (string) $body['traffic_mode'] : $connection['traffic_mode'],
			)
		);
	}

	/**
	 * Renders usage stats and charts.
	 *
	 * @param array $stats Calculated stats.
	 * @return void
	 */
	private function render_stats(array $stats)
	{
		$max_requests = 1;
		$max_tokens   = 1;
		foreach ($stats['daily'] as $day) {
			$max_requests = max($max_requests, $day['requests']);
			$max_tokens   = max($max_tokens, $day['tokens']);
		}
		?>
		<style>
			.gab-grid {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
				gap: 12px;
				margin: 16px 0
			}

			.gab-header {
				display: flex;
				align-items: center;
				justify-content: space-between;
				gap: 20px;
				padding: 18px 20px;
				margin: 16px 0;
				background: linear-gradient(135deg, #f2f9ff 0%, #ffffff 100%);
				border: 1px solid #cdddf2;
				border-left: 4px solid #0278fe
			}

			.gab-header-main {
				display: flex;
				align-items: center;
				gap: 16px;
				min-width: 0
			}

			.gab-logo {
				width: 52px;
				height: 52px;
				flex: 0 0 52px
			}

			.gab-logo svg {
				display: block;
				width: 100%;
				height: 100%
			}

			.gab-header-copy h1 {
				margin: 0;
				font-size: 26px;
				line-height: 1.1
			}

			.gab-header-copy p {
				margin: 6px 0 0;
				color: #50575e
			}

			.gab-header-meta {
				display: flex;
				flex-direction: column;
				gap: 6px;
				align-items: flex-end
			}

			.gab-badge {
				display: inline-block;
				padding: 6px 10px;
				border: 1px solid #b7d6ff;
				background: #e9f3ff;
				color: #0258b8;
				font-size: 12px;
				font-weight: 600
			}

			.gab-endpoint {
				font-size: 12px;
				color: #50575e
			}

			.gab-card {
				background: #fff;
				border: 1px solid #dcdcde;
				border-radius: 0;
				padding: 14px
			}

			.gab-metric {
				font-size: 24px;
				font-weight: 600;
				line-height: 1.2
			}

			.gab-label {
				color: #50575e;
				margin-top: 4px
			}

			.gab-panels {
				display: grid;
				grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
				gap: 16px;
				margin: 16px 0
			}

			.gab-panel {
				background: #fff;
				border: 1px solid #dcdcde;
				border-radius: 0;
				padding: 16px
			}

			.gab-chart-row {
				display: flex;
				align-items: flex-end;
				gap: 10px;
				height: 180px;
				margin-top: 12px
			}

			.gab-bar-wrap {
				flex: 1;
				display: flex;
				flex-direction: column;
				align-items: center;
				gap: 6px
			}

			.gab-bar {
				width: 100%;
				max-width: 42px;
				border-radius: 0;
				background: linear-gradient(180deg, #0f62fe, #56a3ff)
			}

			.gab-bar-token {
				background: linear-gradient(180deg, #107c41, #55d38a)
			}

			.gab-bar-label {
				font-size: 11px;
				color: #50575e
			}

			.gab-help {
				background: linear-gradient(180deg, #f3fbf6 0%, #ffffff 100%);
				border: 1px solid #c7e7d1;
				border-left: 4px solid #1f8f4e;
				border-radius: 0;
				padding: 16px;
				margin: 16px 0
			}

			.gab-toolbar {
				display: flex;
				flex-wrap: wrap;
				gap: 10px;
				align-items: center;
				margin: 12px 0
			}

			.gab-note {
				margin-top: 8px;
				color: #50575e
			}

			.gab-hidden-row {
				display: none
			}

			.gab-inline-options {
				display: flex;
				flex-wrap: wrap;
				gap: 18px;
				align-items: center
			}

			.gab-inline-option {
				display: flex;
				align-items: center;
				gap: 6px
			}

			.gab-inline-link {
				font-size: 12px;
				color: #50575e;
				white-space: nowrap
			}

			.gab-inline-link a {
				text-decoration: none
			}

			.gab-empty {
				display: flex;
				flex-direction: column;
				gap: 6px;
				background: linear-gradient(180deg, #f9fafb 0%, #ffffff 100%);
				border: 1px solid #dcdcde;
				border-left: 4px solid #1f8f4e;
				padding: 16px 18px;
				margin: 10px 0
			}

			.gab-empty-title {
				margin: 0;
				font-size: 14px;
				font-weight: 600;
				line-height: 1.4;
				color: #1d2327
			}

			.gab-empty-desc {
				margin: 0;
				font-size: 13px;
				line-height: 1.6;
				color: #50575e
			}
		</style>
		<div class="gab-grid">
			<div class="gab-card">
				<div class="gab-metric"><?php echo esc_html(number_format_i18n($stats['total_requests'])); ?></div>
				<div class="gab-label"><?php echo esc_html__('请求数', 'global-ai-bridge'); ?></div>
			</div>
			<div class="gab-card">
				<div class="gab-metric"><?php echo esc_html(number_format_i18n($stats['total_tokens'])); ?></div>
				<div class="gab-label"><?php echo esc_html__('Token 使用量', 'global-ai-bridge'); ?></div>
			</div>
			<div class="gab-card">
				<div class="gab-metric"><?php echo esc_html(number_format_i18n($stats['avg_latency'])); ?>ms</div>
				<div class="gab-label"><?php echo esc_html__('平均延迟', 'global-ai-bridge'); ?></div>
			</div>
			<div class="gab-card">
				<div class="gab-metric"><?php echo esc_html(number_format_i18n($stats['success_count'])); ?></div>
				<div class="gab-label"><?php echo esc_html__('成功请求', 'global-ai-bridge'); ?></div>
			</div>
		</div>
		<div class="gab-panels">
			<div class="gab-panel">
				<h3><?php echo esc_html__('请求趋势（7 天）', 'global-ai-bridge'); ?></h3>
				<div class="gab-chart-row">
					<?php foreach ($stats['daily'] as $label => $day) : ?>
						<?php $height = max(10, (int) round(($day['requests'] / $max_requests) * 140)); ?>
						<div class="gab-bar-wrap">
							<div><?php echo esc_html((string) $day['requests']); ?></div>
							<div class="gab-bar" style="height: <?php echo esc_attr((string) $height); ?>px;"></div>
							<div class="gab-bar-label"><?php echo esc_html($label); ?></div>
						</div>
					<?php endforeach; ?>
				</div>
			</div>
			<div class="gab-panel">
				<h3><?php echo esc_html__('Token 趋势（7 天）', 'global-ai-bridge'); ?></h3>
				<div class="gab-chart-row">
					<?php foreach ($stats['daily'] as $label => $day) : ?>
						<?php $height = max(10, (int) round(($day['tokens'] / $max_tokens) * 140)); ?>
						<div class="gab-bar-wrap">
							<div><?php echo esc_html((string) $day['tokens']); ?></div>
							<div class="gab-bar gab-bar-token" style="height: <?php echo esc_attr((string) $height); ?>px;"></div>
							<div class="gab-bar-label"><?php echo esc_html($label); ?></div>
						</div>
					<?php endforeach; ?>
				</div>
			</div>
		</div>
	<?php
	}

	/**
	 * Renders plugin overview copy.
	 *
	 * @return void
	 */
	private function render_plugin_help()
	{
	?>
		<div class="gab-help">
			<h2><?php echo esc_html__('插件说明', 'global-ai-bridge'); ?></h2>
			<p><?php echo esc_html__('AI Bridge 提供两种代理方向。出国模式默认通过美国节点访问海外 AI 服务，适合中国大陆或香港站点；回国模式默认通过中国节点访问国内 AI 服务，适合海外服务器或海外业务回连国内模型。', 'global-ai-bridge'); ?></p>
			<p><?php echo esc_html__('插件采用纯代理架构。你的模型 API Token 保存在当前 WordPress 站点中，请求时由 AI Bridge 按所选模式转发到目标节点，让你在不同网络环境中保持统一的调用方式。', 'global-ai-bridge'); ?></p>
			<p><?php echo esc_html__('美国节点部署在 DMIT 美国服务器，网络环境稳定，IP 质量良好，适合承担海外 AI 请求代理。AI Bridge 不会主动共享或滥用用户的模型 Token，但账号状态仍取决于模型提供商的风控规则、Token 来源与实际使用行为。', 'global-ai-bridge'); ?></p>
		</div>
	<?php
	}

	/**
	 * Renders settings page header.
	 *
	 * @param array $connection Resolved connection data.
	 * @return void
	 */
	private function render_page_header(array $connection)
	{
		$mode_label = 'outbound' === $connection['traffic_mode']
			? __('出国模式', 'global-ai-bridge')
			: __('回国模式', 'global-ai-bridge');
	?>
		<div class="gab-header">
			<div class="gab-header-main">
				<div class="gab-logo" aria-hidden="true">
					<svg viewBox="0 0 1024 1024" xmlns="http://www.w3.org/2000/svg">
						<path d="M963.764706 180.705882H180.705882a60.235294 60.235294 0 0 0-60.235294 60.235294v602.352942a60.235294 60.235294 0 0 0 60.235294 60.235294h481.882353v120.470588l192.752941-120.470588H963.764706a60.235294 60.235294 0 0 0 60.235294-60.235294V240.941176a60.235294 60.235294 0 0 0-60.235294-60.235294z" fill="#95C7FF" opacity=".6"></path>
						<path d="M813.176471 120.470588H361.411765V0L120.470588 150.588235 361.411765 301.176471V180.705882h451.764706a30.117647 30.117647 0 0 1 30.117647 30.117647v542.117647h60.235294v-542.117647A90.352941 90.352941 0 0 0 813.176471 120.470588zM542.117647 783.058824H90.352941a30.117647 30.117647 0 0 1-30.117647-30.117648v-542.117647H0v542.117647A90.352941 90.352941 0 0 0 90.352941 843.294118H542.117647v120.470588l240.941177-150.588235L542.117647 662.588235z" fill="#0278FE"></path>
					</svg>
				</div>
				<div class="gab-header-copy">
					<h1><?php echo esc_html__('AI Bridge', 'global-ai-bridge'); ?></h1>
					<p><?php echo esc_html__('WordPress AI 代理桥接控制台', 'global-ai-bridge'); ?></p>
				</div>
			</div>
			<div class="gab-header-meta">
				<span class="gab-badge"><?php echo esc_html($mode_label . ' / ' . $connection['display_label']); ?></span>
				<div class="gab-endpoint"><?php echo esc_html__('当前节点已生效', 'global-ai-bridge'); ?></div>
			</div>
		</div>
	<?php
	}

	/**
	 * Returns self-hosted article URL.
	 *
	 * @return string
	 */
	private function get_self_hosted_blog_url()
	{
		$url = apply_filters('gab_self_hosted_blog_url', 'https://xifeng.net/ai-bridge-backend-deploy');
		return is_string($url) ? trim($url) : '';
	}

	/**
	 * Renders settings page.
	 *
	 * @return void
	 */
	public function render_settings_page()
	{
		if (! current_user_can('manage_options')) {
			return;
		}

		$notice = isset($_GET['gab_notice']) ? sanitize_key((string) wp_unslash($_GET['gab_notice'])) : '';
		$provider_filter = isset($_GET['gab_provider']) ? sanitize_key((string) wp_unslash($_GET['gab_provider'])) : '';
		$logs = $this->filter_logs_by_provider($this->logger->get_logs(), $provider_filter);
		$connector_logs = $this->logger->get_connector_logs();
		$connection = self::get_resolved_connection();
		$settings = self::get_settings();
		$stats = $this->build_stats($logs);
		$provider_options = $this->get_provider_options();
		$provider_metadata = $this->get_provider_metadata();
	?>
		<div class="wrap">
			<?php $this->render_page_header($connection); ?>

			<?php if ('logs_cleared' === $notice) : ?>
				<div class="notice notice-success is-dismissible">
					<p><?php echo esc_html__('日志已清空。', 'global-ai-bridge'); ?></p>
				</div>
			<?php endif; ?>

			<?php $this->render_plugin_help(); ?>

			<form action="options.php" method="post">
				<?php
				settings_fields('gab_settings_group');
				do_settings_sections('gab-settings');
				submit_button();
				?>
			</form>

			<hr />
			<h2><?php echo esc_html__('使用统计', 'global-ai-bridge'); ?></h2>
			<div class="gab-toolbar">
				<form method="get">
					<input type="hidden" name="page" value="gab-settings" />
					<select name="gab_provider">
						<?php foreach ($provider_options as $provider_key => $provider_label) : ?>
							<option value="<?php echo esc_attr($provider_key); ?>" <?php selected($provider_filter, $provider_key); ?>><?php echo esc_html($provider_label); ?></option>
						<?php endforeach; ?>
					</select>
					<?php submit_button(__('筛选', 'global-ai-bridge'), 'secondary', '', false); ?>
				</form>
				<button type="button" class="button button-secondary" id="gab-test-connection"><?php echo esc_html__('测速当前节点', 'global-ai-bridge'); ?></button>
				<span id="gab-test-result" class="gab-note"></span>
				<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
					<input type="hidden" name="action" value="gab_clear_logs" />
					<?php wp_nonce_field('gab_clear_logs'); ?>
					<?php submit_button(__('清空日志', 'global-ai-bridge'), 'delete', '', false, array('onclick' => "return confirm('确认清空日志吗？');")); ?>
				</form>
			</div>
			<?php $this->render_stats($stats); ?>

			<h2><?php echo esc_html__('最近日志', 'global-ai-bridge'); ?></h2>
			<?php if (empty($logs)) : ?>
				<div class="gab-empty">
					<p class="gab-empty-title"><?php echo esc_html__('暂无请求日志', 'global-ai-bridge'); ?></p>
					<p class="gab-empty-desc"><?php echo esc_html__('当站点开始通过 AI Bridge 转发请求后，这里会显示最近的请求记录、状态、延迟和 Token 使用量。', 'global-ai-bridge'); ?></p>
				</div>
			<?php else : ?>
				<table class="widefat striped">
					<thead>
						<tr>
							<th><?php echo esc_html__('时间', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('提供商', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('模型', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('方向', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('状态', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('延迟', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('Token', 'global-ai-bridge'); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ($logs as $log) : ?>
							<tr>
								<td><?php echo esc_html($log['timestamp']); ?></td>
								<td><?php echo esc_html($log['provider']); ?></td>
								<td><?php echo esc_html($log['model']); ?></td>
								<td><?php echo esc_html(! empty($log['traffic_mode']) ? $log['traffic_mode'] : '-'); ?></td>
								<td><?php echo esc_html($log['status']); ?></td>
								<td><?php echo esc_html($log['latency_ms'] . 'ms'); ?></td>
								<td><?php echo esc_html((string) $log['tokens']); ?></td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>

			<h2><?php echo esc_html__('连接器接管日志', 'global-ai-bridge'); ?></h2>
			<?php if (empty($connector_logs)) : ?>
				<div class="gab-empty">
					<p class="gab-empty-title"><?php echo esc_html__('暂无连接器接管记录', 'global-ai-bridge'); ?></p>
					<p class="gab-empty-desc"><?php echo esc_html__('当 WordPress 中的 AI 连接器请求被 AI Bridge 拦截并改走代理后，这里会显示接管时间、目标主机、路径和请求状态。', 'global-ai-bridge'); ?></p>
				</div>
			<?php else : ?>
				<table class="widefat striped">
					<thead>
						<tr>
							<th><?php echo esc_html__('时间', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('目标主机', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('目标地址', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('路径', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('方法', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('匹配方式', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('方向', 'global-ai-bridge'); ?></th>
							<th><?php echo esc_html__('状态', 'global-ai-bridge'); ?></th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ($connector_logs as $log) : ?>
							<tr>
								<td><?php echo esc_html($log['timestamp']); ?></td>
								<td><?php echo esc_html($log['host']); ?></td>
								<td style="word-break:break-all;"><?php echo esc_html(! empty($log['target_url']) ? $log['target_url'] : '-'); ?></td>
								<td><?php echo esc_html($log['path']); ?></td>
								<td><?php echo esc_html($log['method']); ?></td>
								<td><?php echo esc_html(! empty($log['match_type']) ? $log['match_type'] : '-'); ?></td>
								<td><?php echo esc_html(! empty($log['traffic_mode']) ? $log['traffic_mode'] : '-'); ?></td>
								<td><?php echo esc_html($log['status']); ?></td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
			<?php endif; ?>
		</div>
		<script>
			document.addEventListener('DOMContentLoaded', function() {
				const connectionInputs = document.querySelectorAll('input[name="<?php echo esc_js(self::OPTION_KEY . '[connection_mode]'); ?>"]');
				const trafficModeInputs = document.querySelectorAll('input[name="<?php echo esc_js(self::OPTION_KEY . '[traffic_mode]'); ?>"]');
				const customEndpointInput = document.querySelector('input[name="<?php echo esc_js(self::OPTION_KEY . '[custom_endpoint]'); ?>"]');
				const customEndpointRow = customEndpointInput ? customEndpointInput.closest('tr') : null;
				const cloudRegionInline = document.getElementById('gab-cloud-region-inline');
				const defaultProviderSelect = document.getElementById('gab-default-provider');
				const providerTokenLink = document.getElementById('gab-provider-token-link');
				const cloudRegionRowNote = document.getElementById('gab-cloud-region-row-note');
				const cloudRegionRow = cloudRegionRowNote ? cloudRegionRowNote.closest('tr') : null;
				const selfHostedInline = document.getElementById('gab-self-hosted-inline');
				const siteTokenInput = document.getElementById('gab-site-token');
				const regenerateTokenButton = document.getElementById('gab-regenerate-site-token');
				const button = document.getElementById('gab-test-connection');
				const result = document.getElementById('gab-test-result');

				function updateConnectionVisibility() {
					if (!customEndpointRow) {
						return;
					}
					const checked = document.querySelector('input[name="<?php echo esc_js(self::OPTION_KEY . '[connection_mode]'); ?>"]:checked');
					const mode = checked ? checked.value : '<?php echo esc_js($settings['connection_mode']); ?>';
					customEndpointRow.classList.toggle('gab-hidden-row', mode !== 'custom');
					if (cloudRegionInline) {
						cloudRegionInline.classList.toggle('gab-hidden-row', mode !== 'cloud');
					}
					if (cloudRegionRow) {
						cloudRegionRow.classList.add('gab-hidden-row');
					}
					if (selfHostedInline) {
						selfHostedInline.classList.toggle('gab-hidden-row', mode !== 'custom');
					}
				}

				function syncRegionWithTrafficMode() {
					if (!cloudRegionInline) {
						return;
					}
					const checkedTraffic = document.querySelector('input[name="<?php echo esc_js(self::OPTION_KEY . '[traffic_mode]'); ?>"]:checked');
					const trafficMode = checkedTraffic ? checkedTraffic.value : '<?php echo esc_js($settings['traffic_mode']); ?>';
					cloudRegionInline.value = trafficMode === 'inbound' ? 'cn' : 'us';
				}

				function updateProviderTokenLink() {
					if (!defaultProviderSelect || !providerTokenLink) {
						return;
					}
					const providerMap = <?php echo wp_json_encode($provider_metadata); ?>;
					const selected = defaultProviderSelect.value;
					const meta = providerMap[selected];

					if (!meta || !meta.token_url) {
						providerTokenLink.textContent = '';
						return;
					}

					providerTokenLink.innerHTML = '<?php echo esc_js(__('API Token 地址：', 'global-ai-bridge')); ?>' +
						'<a href="' + meta.token_url + '" target="_blank" rel="noopener noreferrer">' + meta.token_url + '</a>';
				}

				connectionInputs.forEach(function(input) {
					input.addEventListener('change', updateConnectionVisibility);
				});
				trafficModeInputs.forEach(function(input) {
					input.addEventListener('change', syncRegionWithTrafficMode);
				});
				if (defaultProviderSelect) {
					defaultProviderSelect.addEventListener('change', updateProviderTokenLink);
				}
				updateConnectionVisibility();
				syncRegionWithTrafficMode();
				updateProviderTokenLink();

				if (siteTokenInput && regenerateTokenButton) {
					regenerateTokenButton.addEventListener('click', function() {
						const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
						let token = 'gab_';
						for (let i = 0; i < 40; i++) {
							token += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
						}
						siteTokenInput.value = token;
					});
				}

				// Token 申请功能
				const applyTokenButton = document.getElementById('gab-apply-token');
				const applyTokenModal = document.getElementById('gab-apply-token-modal');
				const applyTokenCancel = document.getElementById('gab-apply-token-cancel');
				const applyTokenSubmit = document.getElementById('gab-apply-token-submit');
				const applyEmailInput = document.getElementById('gab-apply-email');
				const applyResult = document.getElementById('gab-apply-result');

				if (applyTokenButton && applyTokenModal) {
					applyTokenButton.addEventListener('click', function() {
						applyTokenModal.style.display = 'block';
						applyEmailInput.focus();
					});

					applyTokenCancel.addEventListener('click', function() {
						applyTokenModal.style.display = 'none';
						applyResult.textContent = '';
					});

					applyTokenSubmit.addEventListener('click', function() {
						const email = applyEmailInput.value.trim();
						if (!email || !email.includes('@')) {
							applyResult.innerHTML = '<span style="color:#d63638;"><?php echo esc_js(__('请输入有效的邮箱地址', 'global-ai-bridge')); ?></span>';
							return;
						}

						// 获取当前配置的端点
						const connectionMode = document.querySelector('input[name="gab_settings[connection_mode]"]:checked');
						let endpoint = '';
						if (connectionMode && connectionMode.value === 'custom') {
							const customEndpointInput = document.querySelector('input[name="gab_settings[custom_endpoint]"]');
							endpoint = customEndpointInput ? customEndpointInput.value.trim() : '';
						} else {
							// 云节点模式，使用当前选择的区域
							const regionSelect = document.getElementById('gab-cloud-region-inline');
							const region = regionSelect ? regionSelect.value : 'us';
							endpoint = region === 'cn' ? 'https://cn-aibridge.yite.net/v1/chat/completions' : 'https://us-aibridge.bluecdn.com/v1/chat/completions';
						}

						if (!endpoint) {
							applyResult.innerHTML = '<span style="color:#d63638;"><?php echo esc_js(__('请先配置代理地址', 'global-ai-bridge')); ?></span>';
							return;
						}

						// 构建申请 URL（替换路径为 /api/apply-token）
						const applyUrl = endpoint.replace(/\/v1\/chat\/completions\/?$/, '/api/apply-token');

						applyResult.innerHTML = '<span style="color:#2271b1;"><?php echo esc_js(__('申请中...', 'global-ai-bridge')); ?></span>';
						applyTokenSubmit.disabled = true;

						fetch(applyUrl, {
								method: 'POST',
								headers: {
									'Content-Type': 'application/json'
								},
								body: JSON.stringify({
									email: email
								})
							})
							.then(function(response) {
								return response.json();
							})
							.then(function(data) {
								if (data.success && data.token) {
									siteTokenInput.value = data.token;
									applyResult.innerHTML = '<span style="color:#00a32a;"><?php echo esc_js(__('申请成功！Token 已填充到上方输入框，请保存设置。', 'global-ai-bridge')); ?></span>';
									setTimeout(function() {
										applyTokenModal.style.display = 'none';
										applyResult.textContent = '';
										applyEmailInput.value = '';
									}, 2000);
								} else {
									throw new Error(data.message || '申请失败');
								}
							})
							.catch(function(error) {
								applyResult.innerHTML = '<span style="color:#d63638;"><?php echo esc_js(__('申请失败：', 'global-ai-bridge')); ?>' + error.message + '</span>';
							})
							.finally(function() {
								applyTokenSubmit.disabled = false;
							});
					});
				}

				if (!button || !result) {
					return;
				}

				button.addEventListener('click', function() {
					result.textContent = '<?php echo esc_js(__('测速中...', 'global-ai-bridge')); ?>';
					button.disabled = true;

					const data = new URLSearchParams();
					data.append('action', 'gab_test_connection');
					data.append('nonce', '<?php echo esc_js(wp_create_nonce('gab_test_connection')); ?>');

					fetch(ajaxurl, {
						method: 'POST',
						headers: {
							'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8'
						},
						body: data.toString()
					}).then(function(response) {
						return response.json();
					}).then(function(payload) {
						if (!payload.success) {
							throw new Error(payload.data && payload.data.message ? payload.data.message : '测速失败');
						}
						const data = payload.data || {};
						result.textContent = '<?php echo esc_js(__('延迟：', 'global-ai-bridge')); ?>' + data.latency_ms + 'ms' +
							' | node=' + (data.node_name || '-') +
							' | mode=' + (data.traffic_mode || '-');
					}).catch(function(error) {
						result.textContent = error.message;
					}).finally(function() {
						button.disabled = false;
					});
				});
			});
		</script>
<?php
	}
}
