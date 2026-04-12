<?php
/**
 * Core plugin bootstrap.
 *
 * @package GlobalAIBridge
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

class GAB_Plugin {
	/**
	 * Plugin singleton.
	 *
	 * @var GAB_Plugin|null
	 */
	private static $instance = null;

	/**
	 * Settings handler.
	 *
	 * @var GAB_Settings
	 */
	private $settings;

	/**
	 * Proxy client.
	 *
	 * @var GAB_Proxy_Client
	 */
	private $proxy_client;

	/**
	 * Logger instance.
	 *
	 * @var GAB_Logger
	 */
	private $logger;

	/**
	 * HTTP interceptor instance.
	 *
	 * @var GAB_HTTP_Interceptor
	 */
	private $http_interceptor;

	/**
	 * Connectors compatibility instance.
	 *
	 * @var GAB_Connectors_Compat
	 */
	private $connectors_compat;

	/**
	 * Theme compatibility instance.
	 *
	 * @var GAB_Theme_Compat
	 */
	private $theme_compat;

	/**
	 * Returns singleton.
	 *
	 * @return GAB_Plugin
	 */
	public static function instance() {
		if ( null === self::$instance ) {
			self::$instance = new self();
		}

		return self::$instance;
	}

	/**
	 * Constructor.
	 */
	private function __construct() {
		$this->logger       = new GAB_Logger();
		$this->proxy_client = new GAB_Proxy_Client( $this->logger );
		$this->settings     = new GAB_Settings( $this->logger );
		$this->http_interceptor = new GAB_HTTP_Interceptor( $this->logger );
		$this->connectors_compat = new GAB_Connectors_Compat();
		$this->theme_compat = new GAB_Theme_Compat();

		add_action( 'plugins_loaded', array( $this, 'load_textdomain' ) );
		add_filter( 'plugin_action_links_' . plugin_basename( GAB_PLUGIN_FILE ), array( $this, 'add_settings_link' ) );
	}

	/**
	 * Loads translations.
	 *
	 * @return void
	 */
	public function load_textdomain() {
		load_plugin_textdomain( 'global-ai-bridge', false, dirname( plugin_basename( GAB_PLUGIN_FILE ) ) . '/languages' );
	}

	/**
	 * Adds settings link in plugin list.
	 *
	 * @param array $links Existing action links.
	 * @return array
	 */
	public function add_settings_link( array $links ) {
		$url = admin_url( 'tools.php?page=gab-settings' );

		array_unshift(
			$links,
			sprintf(
				'<a href="%s">%s</a>',
				esc_url( $url ),
				esc_html__( '设置', 'global-ai-bridge' )
			)
		);

		return $links;
	}

	/**
	 * Returns settings handler.
	 *
	 * @return GAB_Settings
	 */
	public function get_settings() {
		return $this->settings;
	}

	/**
	 * Returns proxy client.
	 *
	 * @return GAB_Proxy_Client
	 */
	public function get_proxy_client() {
		return $this->proxy_client;
	}

	/**
	 * Returns logger.
	 *
	 * @return GAB_Logger
	 */
	public function get_logger() {
		return $this->logger;
	}
}
