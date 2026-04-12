<?php

/**
 * Plugin Name: AI Bridge
 * Plugin URI: https://xifeng.net/global-ai-bridge
 * Description: Connect WordPress AI features to global AI providers through your own proxy gateway.
 * Version: 0.1.0
 * Author: Gent Pan
 * Text Domain: global-ai-bridge
 * Requires at least: 6.0
 * Requires PHP: 7.4
 *
 * @package GlobalAIBridge
 */

if (! defined('ABSPATH')) {
	exit;
}

define('GAB_VERSION', '0.1.0');
define('GAB_PLUGIN_FILE', __FILE__);
define('GAB_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('GAB_PLUGIN_URL', plugin_dir_url(__FILE__));

require_once GAB_PLUGIN_DIR . 'includes/class-gab-logger.php';
require_once GAB_PLUGIN_DIR . 'includes/class-gab-proxy-client.php';
require_once GAB_PLUGIN_DIR . 'includes/class-gab-http-interceptor.php';
require_once GAB_PLUGIN_DIR . 'includes/class-gab-connectors-compat.php';
require_once GAB_PLUGIN_DIR . 'includes/class-gab-theme-compat.php';
require_once GAB_PLUGIN_DIR . 'includes/class-gab-settings.php';
require_once GAB_PLUGIN_DIR . 'includes/class-gab-plugin.php';

register_activation_hook(__FILE__, array('GAB_Settings', 'initialize_defaults'));

/**
 * Returns the plugin singleton.
 *
 * @return GAB_Plugin
 */
function gab_ai_bridge()
{
	return GAB_Plugin::instance();
}

gab_ai_bridge();

/**
 * Convenience wrapper for sending AI requests through the configured proxy.
 *
 * @param array $messages Chat-style message payload.
 * @param array $args     Additional request arguments.
 * @return array|WP_Error
 */
function gab_send_ai_request(array $messages, array $args = array())
{
	return gab_ai_bridge()->get_proxy_client()->send_chat_request($messages, $args);
}

/**
 * Checks if the configured site token is a dynamic token (applied from backend).
 *
 * @return bool
 */
function gab_is_dynamic_token()
{
	$settings = GAB_Settings::get_settings();
	$token    = $settings['site_token'] ?? '';
	return strpos($token, 'abt_') === 0;
}

/**
 * Returns the site token type description.
 *
 * @return string
 */
function gab_get_token_type()
{
	$settings = GAB_Settings::get_settings();
	$token    = $settings['site_token'] ?? '';

	if (strpos($token, 'abt_') === 0) {
		return __('动态申请 Token', 'global-ai-bridge');
	} elseif (strpos($token, 'gab_') === 0) {
		return __('本地生成 Token', 'global-ai-bridge');
	}

	return __('自定义 Token', 'global-ai-bridge');
}
