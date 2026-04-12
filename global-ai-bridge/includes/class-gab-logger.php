<?php
/**
 * Lightweight request logger.
 *
 * @package GlobalAIBridge
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class GAB_Logger {
	/**
	 * Log option key.
	 */
	const LOG_OPTION_KEY = 'gab_request_logs';

	/**
	 * Connector debug log option key.
	 */
	const CONNECTOR_LOG_OPTION_KEY = 'gab_connector_logs';

	/**
	 * Max stored rows.
	 */
	const MAX_LOG_ROWS = 100;

	/**
	 * Stores a log row if logging is enabled.
	 *
	 * @param array $entry Log data.
	 * @return void
	 */
	public function log( array $entry ) {
		$settings = GAB_Settings::get_settings();

		if ( empty( $settings['enable_logging'] ) ) {
			return;
		}

		$logs   = $this->get_logs();
		$logs[] = wp_parse_args(
			$entry,
			array(
				'timestamp'  => current_time( 'mysql' ),
				'provider'   => '',
				'model'      => '',
				'traffic_mode' => '',
				'status'     => '',
				'latency_ms' => 0,
				'tokens'     => 0,
			)
		);

		if ( count( $logs ) > self::MAX_LOG_ROWS ) {
			$logs = array_slice( $logs, -1 * self::MAX_LOG_ROWS );
		}

		update_option( self::LOG_OPTION_KEY, $logs, false );
	}

	/**
	 * Returns all stored logs.
	 *
	 * @return array
	 */
	public function get_logs() {
		$logs = get_option( self::LOG_OPTION_KEY, array() );

		if ( ! is_array( $logs ) ) {
			return array();
		}

		return array_reverse( $logs );
	}

	/**
	 * Clears stored logs.
	 *
	 * @return void
	 */
	public function clear_logs() {
		delete_option( self::LOG_OPTION_KEY );
	}

	/**
	 * Stores a connector interception log row.
	 *
	 * @param array $entry Log data.
	 * @return void
	 */
	public function log_connector( array $entry ) {
		$settings = GAB_Settings::get_settings();

		if ( empty( $settings['enable_logging'] ) ) {
			return;
		}

		$logs   = $this->get_connector_logs();
		$logs[] = wp_parse_args(
			$entry,
			array(
				'timestamp'   => current_time( 'mysql' ),
				'host'        => '',
				'target_url'  => '',
				'method'      => '',
				'status'      => '',
				'traffic_mode'=> '',
				'path'        => '',
				'match_type'  => '',
			)
		);

		if ( count( $logs ) > self::MAX_LOG_ROWS ) {
			$logs = array_slice( $logs, -1 * self::MAX_LOG_ROWS );
		}

		update_option( self::CONNECTOR_LOG_OPTION_KEY, $logs, false );
	}

	/**
	 * Returns connector interception logs.
	 *
	 * @return array
	 */
	public function get_connector_logs() {
		$logs = get_option( self::CONNECTOR_LOG_OPTION_KEY, array() );

		if ( ! is_array( $logs ) ) {
			return array();
		}

		return array_reverse( $logs );
	}

	/**
	 * Clears connector logs.
	 *
	 * @return void
	 */
	public function clear_connector_logs() {
		delete_option( self::CONNECTOR_LOG_OPTION_KEY );
	}
}
