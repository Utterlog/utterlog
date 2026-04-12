<?php
/**
 * Compatibility layer for WordPress Connectors.
 *
 * @package GlobalAIBridge
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class GAB_Connectors_Compat {
	/**
	 * Constructor.
	 */
	public function __construct() {
		foreach ( $this->get_connector_setting_names() as $setting_name ) {
			add_filter( "sanitize_option_{$setting_name}", array( $this, 'preserve_connector_api_key' ), 99, 3 );
		}

		add_filter( 'rest_post_dispatch', array( $this, 'normalize_connector_settings_response' ), 99, 3 );
	}

	/**
	 * Preserves the original connector API key when AI Bridge is active.
	 *
	 * WordPress Connectors validates keys by trying to connect directly to the
	 * provider. In an AI Bridge setup, that validation can fail even though the
	 * key is valid once requests are proxied through AI Bridge.
	 *
	 * @param mixed  $value          Sanitized value.
	 * @param string $option         Option name.
	 * @param mixed  $original_value Original submitted value.
	 * @return string
	 */
	public function preserve_connector_api_key( $value, $option, $original_value ) {
		if ( ! $this->is_ai_bridge_ready() ) {
			return (string) $value;
		}

		$original_value = sanitize_text_field( (string) $original_value );
		if ( '' === $original_value ) {
			return '';
		}

		// If core validation blanked the key, keep the submitted key instead.
		if ( '' === (string) $value ) {
			return $original_value;
		}

		return (string) $value;
	}

	/**
	 * Rewrites invalid connector REST responses to the stored masked value.
	 *
	 * @param WP_REST_Response $response Response object.
	 * @param WP_REST_Server   $server   REST server.
	 * @param WP_REST_Request  $request  Request object.
	 * @return WP_REST_Response
	 */
	public function normalize_connector_settings_response( $response, $server, $request ) {
		if ( ! $response instanceof WP_REST_Response || ! $request instanceof WP_REST_Request ) {
			return $response;
		}

		if ( ! $this->is_ai_bridge_ready() || '/wp/v2/settings' !== $request->get_route() ) {
			return $response;
		}

		$data = $response->get_data();
		if ( ! is_array( $data ) ) {
			return $response;
		}

		$requested = $this->get_requested_fields( $request );
		if ( empty( $requested ) ) {
			return $response;
		}

		foreach ( $this->get_connector_setting_names() as $setting_name ) {
			if ( ! in_array( $setting_name, $requested, true ) ) {
				continue;
			}

			if ( ! isset( $data[ $setting_name ] ) || 'invalid_key' !== $data[ $setting_name ] ) {
				continue;
			}

			$stored_value = get_option( $setting_name, '' );
			if ( '' !== (string) $stored_value ) {
				$data[ $setting_name ] = (string) $stored_value;
			}
		}

		$response->set_data( $data );
		return $response;
	}

	/**
	 * Returns connector setting names.
	 *
	 * @return string[]
	 */
	private function get_connector_setting_names() {
		if ( function_exists( '_wp_connectors_get_connector_settings' ) ) {
			$settings = _wp_connectors_get_connector_settings();
			$names    = array();

			foreach ( $settings as $connector ) {
				if ( empty( $connector['authentication']['setting_name'] ) ) {
					continue;
				}
				$names[] = (string) $connector['authentication']['setting_name'];
			}

			return array_values( array_unique( $names ) );
		}

		return array(
			'connectors_ai_openai_api_key',
			'connectors_ai_google_api_key',
			'connectors_ai_anthropic_api_key',
		);
	}

	/**
	 * Returns whether AI Bridge proxy settings are ready.
	 *
	 * @return bool
	 */
	private function is_ai_bridge_ready() {
		$settings   = GAB_Settings::get_settings();
		$connection = GAB_Settings::get_resolved_connection();

		return ! empty( $settings['site_token'] ) && ! empty( $connection['endpoint'] );
	}

	/**
	 * Parses `_fields` from the request.
	 *
	 * @param WP_REST_Request $request Request object.
	 * @return string[]
	 */
	private function get_requested_fields( WP_REST_Request $request ) {
		$fields = $request->get_param( '_fields' );
		if ( empty( $fields ) ) {
			return array();
		}

		if ( is_array( $fields ) ) {
			return array_map( 'strval', $fields );
		}

		return array_map( 'trim', explode( ',', (string) $fields ) );
	}
}
