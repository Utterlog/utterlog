<?php
/**
 * Proxy request client.
 *
 * @package GlobalAIBridge
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class GAB_Proxy_Client {
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
	public function __construct( GAB_Logger $logger ) {
		$this->logger = $logger;
	}

	/**
	 * Sends a chat-style request to the configured proxy endpoint.
	 *
	 * @param array $messages Message list.
	 * @param array $args     Request arguments.
	 * @return array|WP_Error
	 */
	public function send_chat_request( array $messages, array $args = array() ) {
		$settings   = GAB_Settings::get_settings();
		$connection = GAB_Settings::get_resolved_connection();

		if ( empty( $connection['endpoint'] ) ) {
			return new WP_Error( 'gab_missing_endpoint', __( 'AI Bridge 代理地址尚未配置。', 'global-ai-bridge' ) );
		}

		if ( empty( $messages ) ) {
			return new WP_Error( 'gab_missing_messages', __( '至少需要一条消息。', 'global-ai-bridge' ) );
		}

		if ( empty( $settings['provider_api_token'] ) ) {
			return new WP_Error( 'gab_missing_provider_token', __( '需要填写模型提供商 API Token。', 'global-ai-bridge' ) );
		}

		$payload = array(
			'provider' => empty( $args['provider'] ) ? $settings['default_provider'] : sanitize_key( (string) $args['provider'] ),
			'model'    => empty( $args['model'] ) ? $settings['default_model'] : sanitize_text_field( (string) $args['model'] ),
			'messages' => array_values( $messages ),
			'stream'   => ! empty( $args['stream'] ),
			'meta'     => array(
				'source' => 'wordpress-ai-bridge',
				'site'   => home_url(),
				'connection_mode' => $connection['mode'],
				'traffic_mode'    => $connection['traffic_mode'],
				'cloud_region'    => $connection['cloud_region'],
			),
		);

		if ( isset( $args['temperature'] ) ) {
			$payload['temperature'] = (float) $args['temperature'];
		}

		if ( isset( $args['max_tokens'] ) ) {
			$payload['max_tokens'] = absint( $args['max_tokens'] );
		}

		if ( ! empty( $settings['enable_cache'] ) ) {
			$payload['cache'] = true;
		}

		$request_args = array(
			'timeout' => absint( $settings['request_timeout'] ),
			'headers' => $this->build_headers( $settings ),
			'body'    => wp_json_encode( $payload ),
		);

		$start    = microtime( true );
		$response = wp_remote_post( $connection['endpoint'], $request_args );
		$latency  = (int) round( ( microtime( true ) - $start ) * 1000 );

		if ( is_wp_error( $response ) ) {
			$this->logger->log(
				array(
					'provider'   => $payload['provider'],
					'model'      => $payload['model'],
					'traffic_mode' => $connection['traffic_mode'],
					'status'     => 'request_error',
					'latency_ms' => $latency,
					'tokens'     => 0,
				)
			);

			return $response;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = wp_remote_retrieve_body( $response );
		$data        = json_decode( $body, true );

		$this->logger->log(
			array(
				'provider'   => $payload['provider'],
				'model'      => $payload['model'],
				'traffic_mode' => $connection['traffic_mode'],
				'status'     => $status_code,
				'latency_ms' => $latency,
				'tokens'     => $this->extract_token_usage( $data ),
			)
		);

		if ( $status_code < 200 || $status_code >= 300 ) {
			return new WP_Error(
				'gab_proxy_http_error',
				sprintf(
					/* translators: %d is the upstream HTTP status code. */
					__( '代理请求失败，状态码：%d。', 'global-ai-bridge' ),
					$status_code
				),
				array(
					'status' => $status_code,
					'body'   => $data ? $data : $body,
				)
			);
		}

		return is_array( $data ) ? $data : array(
			'raw_body' => $body,
		);
	}

	/**
	 * Builds request headers.
	 *
	 * @param array $settings Plugin settings.
	 * @return array
	 */
	private function build_headers( array $settings ) {
		$headers = array(
			'Content-Type' => 'application/json',
			'Accept'       => 'application/json',
			'X-AIBRIDGE-PROVIDER-TOKEN' => $settings['provider_api_token'],
		);

		// 只有托管模式才需要 site_token 进行认证
		// 自托管模式直接使用 provider_api_token
		if ( ! empty( $settings['site_token'] ) && GAB_Settings::is_managed_endpoint() ) {
			$headers['Authorization'] = 'Bearer ' . $settings['site_token'];
		}

		return $headers;
	}

	/**
	 * Extracts token usage from common provider/proxy response shapes.
	 *
	 * @param mixed $data Parsed response.
	 * @return int
	 */
	private function extract_token_usage( $data ) {
		if ( ! is_array( $data ) || empty( $data['usage'] ) || ! is_array( $data['usage'] ) ) {
			return 0;
		}

		if ( isset( $data['usage']['total_tokens'] ) ) {
			return absint( $data['usage']['total_tokens'] );
		}

		if ( isset( $data['usage']['totalTokenCount'] ) ) {
			return absint( $data['usage']['totalTokenCount'] );
		}

		return 0;
	}
}
