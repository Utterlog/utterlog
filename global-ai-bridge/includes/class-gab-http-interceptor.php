<?php
/**
 * Intercepts outgoing provider HTTP requests and reroutes them through AI Bridge.
 *
 * @package GlobalAIBridge
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class GAB_HTTP_Interceptor {
	/**
	 * Logger instance.
	 *
	 * @var GAB_Logger
	 */
	private $logger;

	/**
	 * Known provider API hosts.
	 *
	 * @var string[]
	 */
	private $provider_hosts = array(
		'api.openai.com',
		'api.anthropic.com',
		'generativelanguage.googleapis.com',
		'api.deepseek.com',
		'dashscope.aliyuncs.com',
		'qianfan.baidubce.com',
		'ark.cn-beijing.volces.com',
		'api.moonshot.cn',
		'api.minimaxi.chat',
	);

	/**
	 * Known AI path fragments.
	 *
	 * @var string[]
	 */
	private $provider_path_fragments = array(
		'/chat/completions',
		'/responses',
		'/messages',
		':generatecontent',
		'/embeddings',
		'/images/generations',
		'/text/chatcompletion',
	);

	/**
	 * Registers hooks.
	 */
	public function __construct( GAB_Logger $logger ) {
		$this->logger = $logger;
		add_filter( 'pre_http_request', array( $this, 'intercept_request' ), 10, 3 );
	}

	/**
	 * Intercepts matching provider requests and forwards them through AI Bridge.
	 *
	 * @param false|array|WP_Error $preempt Whether to preempt.
	 * @param array                $args    Request args.
	 * @param string               $url     Target URL.
	 * @return false|array|WP_Error
	 */
	public function intercept_request( $preempt, $args, $url ) {
		if ( ! empty( $args['headers']['X-GAB-Intercepted'] ) ) {
			return $preempt;
		}

		$settings   = GAB_Settings::get_settings();
		$connection = GAB_Settings::get_resolved_connection();

		if ( empty( $connection['endpoint'] ) || empty( $settings['site_token'] ) ) {
			return $preempt;
		}

		$target_host = wp_parse_url( $url, PHP_URL_HOST );
		$proxy_host  = wp_parse_url( $connection['endpoint'], PHP_URL_HOST );

		if ( ! empty( $target_host ) && ! empty( $proxy_host ) && $target_host === $proxy_host ) {
			$direct_proxy_response = $this->handle_direct_proxy_request( $args, $url, $settings, $connection );
			if ( false !== $direct_proxy_response ) {
				return $direct_proxy_response;
			}
		}

		$match_type = $this->get_intercept_match_type( $target_host, $url );

		if ( empty( $target_host ) || $target_host === $proxy_host || '' === $match_type ) {
			return $preempt;
		}

		$payload = array(
			'target_url' => $url,
			'method'     => isset( $args['method'] ) ? strtoupper( (string) $args['method'] ) : 'GET',
			'headers'    => isset( $args['headers'] ) && is_array( $args['headers'] ) ? $this->normalize_headers( $args['headers'] ) : array(),
			'body'       => isset( $args['body'] ) ? $args['body'] : '',
			'timeout'    => isset( $args['timeout'] ) ? (int) $args['timeout'] : (int) $settings['request_timeout'],
			'meta'       => array(
				'source'          => 'wordpress-http-connector',
				'site'            => home_url(),
				'connection_mode' => $connection['mode'],
				'traffic_mode'    => $connection['traffic_mode'],
				'cloud_region'    => $connection['cloud_region'],
			),
		);

		// 准备请求头，托管模式需要 site_token，自托管模式不需要
		$request_headers = array(
			'Content-Type'      => 'application/json',
			'Accept'            => 'application/json',
			'X-GAB-Intercepted' => '1',
		);
		
		// 只有托管模式才需要 site_token 进行认证
		if ( GAB_Settings::is_managed_endpoint() && ! empty( $settings['site_token'] ) ) {
			$request_headers['Authorization'] = 'Bearer ' . $settings['site_token'];
		}

		$response = wp_remote_post(
			preg_replace( '#/v1/chat/completions/?$#', '/v1/connectors/proxy', $connection['endpoint'] ),
			array(
				'timeout' => isset( $args['timeout'] ) ? (int) $args['timeout'] : (int) $settings['request_timeout'],
				'headers' => $request_headers,
				'body'    => wp_json_encode( $payload ),
			)
		);

		if ( is_wp_error( $response ) ) {
			$this->logger->log_connector(
				array(
					'host'         => (string) $target_host,
					'target_url'   => (string) $url,
					'path'         => (string) wp_parse_url( $url, PHP_URL_PATH ),
					'method'       => $payload['method'],
					'status'       => 'request_error',
					'traffic_mode' => $connection['traffic_mode'],
					'match_type'   => $match_type,
				)
			);
			return $response;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$body        = wp_remote_retrieve_body( $response );
		$data        = json_decode( $body, true );

		if ( ! is_array( $data ) ) {
			return new WP_Error( 'gab_connector_proxy_invalid_response', __( '连接器代理返回了无效响应。', 'global-ai-bridge' ) );
		}

		if ( $status_code < 200 || $status_code >= 300 ) {
			$this->logger->log_connector(
				array(
					'host'         => (string) $target_host,
					'target_url'   => (string) $url,
					'path'         => (string) wp_parse_url( $url, PHP_URL_PATH ),
					'method'       => $payload['method'],
					'status'       => $status_code,
					'traffic_mode' => $connection['traffic_mode'],
					'match_type'   => $match_type,
				)
			);
			$message = isset( $data['error']['message'] ) ? (string) $data['error']['message'] : __( '连接器代理请求失败。', 'global-ai-bridge' );
			return new WP_Error( 'gab_connector_proxy_http_error', $message, $data );
		}

		$this->logger->log_connector(
			array(
				'host'         => (string) $target_host,
				'target_url'   => (string) $url,
				'path'         => (string) wp_parse_url( $url, PHP_URL_PATH ),
				'method'       => $payload['method'],
				'status'       => $status_code,
				'traffic_mode' => $connection['traffic_mode'],
				'match_type'   => $match_type,
			)
		);

		return array(
			'headers'  => isset( $data['headers'] ) && is_array( $data['headers'] ) ? $data['headers'] : array(),
			'body'     => isset( $data['body'] ) ? (string) $data['body'] : '',
			'response' => array(
				'code'    => isset( $data['status'] ) ? (int) $data['status'] : 200,
				'message' => '',
			),
			'cookies'  => array(),
			'filename' => null,
		);
	}

	/**
	 * Checks whether a host should be intercepted.
	 *
	 * @param string $host Request host.
	 * @return bool
	 */
	private function should_intercept_host( $host ) {
		return '' !== $this->get_intercept_match_type( $host, '' );
	}

	/**
	 * Returns the intercept match type for a request.
	 *
	 * @param string $host Request host.
	 * @param string $url  Full request URL.
	 * @return string
	 */
	private function get_intercept_match_type( $host, $url ) {
		$host = strtolower( (string) $host );
		$path = strtolower( (string) wp_parse_url( $url, PHP_URL_PATH ) );

		if ( in_array( $host, $this->provider_hosts, true ) ) {
			return 'known_host';
		}

		if ( $this->looks_like_ai_host( $host ) && $this->looks_like_ai_path( $path ) ) {
			return 'host_and_path_pattern';
		}

		return '';
	}

	/**
	 * Returns whether a host looks like an AI provider endpoint.
	 *
	 * @param string $host Host name.
	 * @return bool
	 */
	private function looks_like_ai_host( $host ) {
		if ( '' === $host ) {
			return false;
		}

		$fragments = array(
			'openai',
			'anthropic',
			'deepseek',
			'moonshot',
			'minimax',
			'dashscope',
			'qianfan',
			'volces',
			'gemini',
			'generativelanguage',
			'ai',
			'llm',
			'model',
		);

		foreach ( $fragments as $fragment ) {
			if ( false !== strpos( $host, $fragment ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Returns whether a path looks like an AI API path.
	 *
	 * @param string $path URL path.
	 * @return bool
	 */
	private function looks_like_ai_path( $path ) {
		if ( '' === $path ) {
			return false;
		}

		foreach ( $this->provider_path_fragments as $fragment ) {
			if ( false !== strpos( $path, $fragment ) ) {
				return true;
			}
		}

		return false;
	}

	/**
	 * Normalizes request headers to string pairs.
	 *
	 * @param array $headers Raw headers.
	 * @return array
	 */
	private function normalize_headers( array $headers ) {
		$normalized = array();
		foreach ( $headers as $key => $value ) {
			if ( is_array( $value ) ) {
				$value = implode( ', ', array_map( 'strval', $value ) );
			}
			$normalized[ (string) $key ] = (string) $value;
		}
		return $normalized;
	}

	/**
	 * Handles requests that already target the AI Bridge endpoint directly.
	 *
	 * Some themes or plugins can be configured with a custom endpoint and still
	 * send the user provider token in the Authorization header. This rewrites the
	 * request into the AI Bridge native format and converts the normalized response
	 * back into an OpenAI-compatible payload for the caller.
	 *
	 * @param array  $args       Request args.
	 * @param string $url        Target URL.
	 * @param array  $settings   Plugin settings.
	 * @param array  $connection Resolved connection.
	 * @return array|WP_Error|false
	 */
	private function handle_direct_proxy_request( array $args, $url, array $settings, array $connection ) {
		$headers = isset( $args['headers'] ) && is_array( $args['headers'] ) ? $this->normalize_headers( $args['headers'] ) : array();
		$auth    = $this->get_header_value( $headers, 'Authorization' );

		if ( empty( $auth ) || 0 !== stripos( $auth, 'Bearer ' ) ) {
			return false;
		}

		if ( ! empty( $settings['site_token'] ) && 'Bearer ' . $settings['site_token'] === $auth ) {
			return false;
		}

		$body = isset( $args['body'] ) ? (string) $args['body'] : '';
		$data = json_decode( $body, true );
		if ( ! is_array( $data ) || empty( $data['messages'] ) || ! is_array( $data['messages'] ) ) {
			return false;
		}

		$provider_token = trim( substr( $auth, 7 ) );
		if ( '' === $provider_token ) {
			return false;
		}

		$payload = $data;
		if ( empty( $payload['provider'] ) ) {
			$payload['provider'] = $this->infer_provider_for_direct_proxy_request( $settings );
		}
		if ( empty( $payload['meta'] ) || ! is_array( $payload['meta'] ) ) {
			$payload['meta'] = array();
		}

		$payload['meta'] = array_merge(
			$payload['meta'],
			array(
				'source'          => 'wordpress-direct-proxy',
				'site'            => home_url(),
				'connection_mode' => $connection['mode'],
				'traffic_mode'    => $connection['traffic_mode'],
				'cloud_region'    => $connection['cloud_region'],
			)
		);

		// 准备请求头，托管模式需要 site_token，自托管模式不需要
		$direct_headers = array(
			'Content-Type'              => 'application/json',
			'Accept'                    => 'application/json',
			'X-AIBRIDGE-PROVIDER-TOKEN' => $provider_token,
			'X-GAB-Intercepted'         => '1',
		);
		
		// 只有托管模式才需要 site_token 进行认证
		if ( GAB_Settings::is_managed_endpoint() && ! empty( $settings['site_token'] ) ) {
			$direct_headers['Authorization'] = 'Bearer ' . $settings['site_token'];
		}

		$response = wp_remote_post(
			$url,
			array(
				'timeout' => isset( $args['timeout'] ) ? (int) $args['timeout'] : (int) $settings['request_timeout'],
				'headers' => $direct_headers,
				'body'    => wp_json_encode( $payload ),
			)
		);

		if ( is_wp_error( $response ) ) {
			$this->logger->log_connector(
				array(
					'host'         => (string) wp_parse_url( $url, PHP_URL_HOST ),
					'target_url'   => (string) $url,
					'path'         => (string) wp_parse_url( $url, PHP_URL_PATH ),
					'method'       => isset( $args['method'] ) ? strtoupper( (string) $args['method'] ) : 'POST',
					'status'       => 'direct_proxy_error',
					'traffic_mode' => $connection['traffic_mode'],
					'match_type'   => 'direct_proxy_rewrite',
				)
			);
			return $response;
		}

		$status_code = wp_remote_retrieve_response_code( $response );
		$response_body = wp_remote_retrieve_body( $response );
		$response_data = json_decode( $response_body, true );

		if ( $status_code < 200 || $status_code >= 300 ) {
			$this->logger->log_connector(
				array(
					'host'         => (string) wp_parse_url( $url, PHP_URL_HOST ),
					'target_url'   => (string) $url,
					'path'         => (string) wp_parse_url( $url, PHP_URL_PATH ),
					'method'       => isset( $args['method'] ) ? strtoupper( (string) $args['method'] ) : 'POST',
					'status'       => $status_code,
					'traffic_mode' => $connection['traffic_mode'],
					'match_type'   => 'direct_proxy_rewrite',
				)
			);
			$error_message = is_array( $response_data ) && isset( $response_data['error']['message'] )
				? (string) $response_data['error']['message']
				: __( 'AI Bridge 代理请求失败。', 'global-ai-bridge' );
			return new WP_Error( 'gab_direct_proxy_http_error', $error_message, $response_data );
		}

		$this->logger->log_connector(
			array(
				'host'         => (string) wp_parse_url( $url, PHP_URL_HOST ),
				'target_url'   => (string) $url,
				'path'         => (string) wp_parse_url( $url, PHP_URL_PATH ),
				'method'       => isset( $args['method'] ) ? strtoupper( (string) $args['method'] ) : 'POST',
				'status'       => 200,
				'traffic_mode' => $connection['traffic_mode'],
				'match_type'   => 'direct_proxy_rewrite',
			)
		);

		$compat = $this->normalize_chat_response_to_openai_shape( $response_data, $payload );

		return array(
			'headers'  => array(
				'Content-Type' => 'application/json',
			),
			'body'     => wp_json_encode( $compat ),
			'response' => array(
				'code'    => 200,
				'message' => '',
			),
			'cookies'  => array(),
			'filename' => null,
		);
	}

	/**
	 * Reads a header value in a case-insensitive way.
	 *
	 * @param array  $headers Header map.
	 * @param string $name    Header name.
	 * @return string
	 */
	private function get_header_value( array $headers, $name ) {
		foreach ( $headers as $header_name => $value ) {
			if ( 0 === strcasecmp( (string) $header_name, (string) $name ) ) {
				return (string) $value;
			}
		}

		return '';
	}

	/**
	 * Infers provider for direct proxy requests.
	 *
	 * @param array $settings Plugin settings.
	 * @return string
	 */
	private function infer_provider_for_direct_proxy_request( array $settings ) {
		$lared_provider = get_option( 'lared_ai_provider', '' );
		if ( is_string( $lared_provider ) && '' !== trim( $lared_provider ) ) {
			return sanitize_key( $lared_provider );
		}

		return ! empty( $settings['default_provider'] ) ? sanitize_key( (string) $settings['default_provider'] ) : 'openai';
	}

	/**
	 * Converts normalized AI Bridge responses into an OpenAI-compatible shape.
	 *
	 * @param array $response_data Normalized response.
	 * @param array $payload       Original request payload.
	 * @return array
	 */
	private function normalize_chat_response_to_openai_shape( array $response_data, array $payload ) {
		$model = ! empty( $response_data['model'] ) ? (string) $response_data['model'] : ( isset( $payload['model'] ) ? (string) $payload['model'] : '' );
		$content = isset( $response_data['content'] ) ? (string) $response_data['content'] : '';
		$usage = isset( $response_data['usage'] ) && is_array( $response_data['usage'] ) ? $response_data['usage'] : array();

		return array(
			'id'      => isset( $response_data['id'] ) ? (string) $response_data['id'] : 'gab_' . wp_generate_password( 12, false, false ),
			'object'  => 'chat.completion',
			'model'   => $model,
			'choices' => array(
				array(
					'index'         => 0,
					'message'       => array(
						'role'    => 'assistant',
						'content' => $content,
					),
					'finish_reason' => 'stop',
				),
			),
			'usage'   => array(
				'prompt_tokens'     => isset( $usage['prompt_tokens'] ) ? absint( $usage['prompt_tokens'] ) : 0,
				'completion_tokens' => isset( $usage['completion_tokens'] ) ? absint( $usage['completion_tokens'] ) : 0,
				'total_tokens'      => isset( $usage['total_tokens'] ) ? absint( $usage['total_tokens'] ) : 0,
			),
		);
	}
}
