<?php
/**
 * Theme compatibility helpers.
 *
 * @package GlobalAIBridge
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class GAB_Theme_Compat {
	/**
	 * Constructor.
	 */
	public function __construct() {
		add_filter( 'option_lared_ai_api_key', array( $this, 'filter_lared_ai_api_key' ), 99 );
	}

	/**
	 * Supplies the AI Bridge provider token to the Lared theme when its own key is empty.
	 *
	 * @param mixed $value Stored option value.
	 * @return string
	 */
	public function filter_lared_ai_api_key( $value ) {
		$value = (string) $value;
		if ( '' !== trim( $value ) ) {
			return $value;
		}

		$settings = GAB_Settings::get_settings();
		if ( empty( $settings['provider_api_token'] ) ) {
			return $value;
		}

		return (string) $settings['provider_api_token'];
	}
}
