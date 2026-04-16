<?php
/**
 * Plugin Name: Utterlog Sync
 * Plugin URI: https://utterlog.dev
 * Description: Export WordPress content as an Utterlog package (.ulbk) or sync normalized data directly to Utterlog.
 * Version: 0.2.0
 * Author: Gentpan
 * License: GPLv2 or later
 * Text Domain: utterlog-sync
 */

if (!defined('ABSPATH')) {
	exit;
}

require_once __DIR__ . '/includes/class-utterlog-sync-logger.php';
require_once __DIR__ . '/includes/class-utterlog-package-exporter.php';
require_once __DIR__ . '/includes/class-utterlog-sync-client.php';

final class Utterlog_Sync_Plugin {
	const OPTION_KEY = 'utterlog_sync_settings';
	const MENU_SLUG = 'utterlog-sync';
	const NONCE_SAVE = 'utterlog_sync_save';
	const NONCE_EXPORT = 'utterlog_sync_export';
	const NONCE_SYNC = 'utterlog_sync_push';
	const NONCE_CLEAR_LOG = 'utterlog_sync_clear_log';

	public static function boot() {
		static $instance = null;
		if ($instance === null) {
			$instance = new self();
		}
		return $instance;
	}

	private function __construct() {
		add_action('admin_menu', array($this, 'register_menu'));
		add_action('admin_post_utterlog_sync_save', array($this, 'handle_save'));
		add_action('admin_post_utterlog_sync_export', array($this, 'handle_export'));
		add_action('admin_post_utterlog_sync_push', array($this, 'handle_sync'));
		add_action('admin_post_utterlog_sync_clear_log', array($this, 'handle_clear_log'));
	}

	public function register_menu() {
		add_management_page(
			'Utterlog Sync',
			'Utterlog Sync',
			'manage_options',
			self::MENU_SLUG,
			array($this, 'render_page')
		);
	}

	public function render_page() {
		if (!current_user_can('manage_options')) {
			wp_die(esc_html__('You do not have permission to access this page.', 'utterlog-sync'));
		}

		$settings = $this->get_settings();
		$logger = new Utterlog_Sync_Logger();
		$exporter = new Utterlog_Package_Exporter($settings, $logger);
		$preview = $exporter->collect_preview(
			array(
				'include_assets' => true,
				'include_raw_wordpress' => true,
				'batch_size' => (int) $settings['batch_size'],
			)
		);
		$last_run = Utterlog_Sync_Logger::get_last_run();
		?>
		<div class="wrap">
			<h1>Utterlog Sync</h1>
			<p>这是一个纯 PHP 的 WordPress 插件，用于导出 <code>.ulbk</code>、预览导出规模、记录任务日志，并向 Utterlog 发送分批 JSON 同步请求。</p>

			<?php $this->render_notice(); ?>

			<h2>同步设置</h2>
			<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
				<input type="hidden" name="action" value="utterlog_sync_save" />
				<?php wp_nonce_field(self::NONCE_SAVE); ?>
				<table class="form-table" role="presentation">
					<tbody>
						<tr>
							<th scope="row"><label for="utterlog_url">Utterlog 地址</label></th>
							<td>
								<input name="utterlog_url" id="utterlog_url" type="url" class="regular-text" value="<?php echo esc_attr($settings['utterlog_url']); ?>" placeholder="https://blog.example.com" />
								<p class="description">直推同步时使用，不参与本地导出。</p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="site_uuid">目标站点 UUID</label></th>
							<td><input name="site_uuid" id="site_uuid" type="text" class="regular-text" value="<?php echo esc_attr($settings['site_uuid']); ?>" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="sync_token">同步 Token</label></th>
							<td><input name="sync_token" id="sync_token" type="password" class="regular-text" value="<?php echo esc_attr($settings['sync_token']); ?>" autocomplete="off" /></td>
						</tr>
						<tr>
							<th scope="row"><label for="sync_path">同步路径</label></th>
							<td>
								<input name="sync_path" id="sync_path" type="text" class="regular-text" value="<?php echo esc_attr($settings['sync_path']); ?>" />
								<p class="description">默认协议：<code>/api/v1/sync/wordpress/start</code>、<code>/batch</code>、<code>/finish</code></p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="batch_size">批大小</label></th>
							<td>
								<input name="batch_size" id="batch_size" type="number" min="20" max="1000" class="small-text" value="<?php echo esc_attr($settings['batch_size']); ?>" />
								<p class="description">大站建议 100-300。这个值同时用于分批导出和直推同步。</p>
							</td>
						</tr>
						<tr>
							<th scope="row"><label for="timeout">请求超时（秒）</label></th>
							<td><input name="timeout" id="timeout" type="number" min="10" max="300" class="small-text" value="<?php echo esc_attr($settings['timeout']); ?>" /></td>
						</tr>
						<tr>
							<th scope="row">SSL 验证</th>
							<td>
								<label>
									<input name="verify_ssl" type="checkbox" value="1" <?php checked($settings['verify_ssl'], 1); ?> />
									同步请求验证 HTTPS 证书
								</label>
							</td>
						</tr>
					</tbody>
				</table>
				<?php submit_button('保存设置'); ?>
			</form>

			<hr />

			<h2>导出预览</h2>
			<p>这里只统计对象数，不生成包。可以用来预估导出规模、同步批次数和站点复杂度。</p>
			<table class="widefat striped" style="max-width: 720px">
				<thead>
					<tr>
						<th>对象</th>
						<th>数量</th>
					</tr>
				</thead>
				<tbody>
					<?php foreach ($preview['counts'] as $resource => $count) : ?>
						<tr>
							<td><?php echo esc_html($resource); ?></td>
							<td><?php echo esc_html(number_format_i18n($count)); ?></td>
						</tr>
					<?php endforeach; ?>
				</tbody>
			</table>
			<p class="description">当前设置：批大小 <?php echo esc_html($preview['options']['batch_size']); ?>，附件导出 <?php echo $preview['options']['include_assets'] ? '启用' : '关闭'; ?>，原始表快照 <?php echo $preview['options']['include_raw_wordpress'] ? '启用' : '关闭'; ?>。</p>

			<hr />

			<h2>本地导出 .ulbk</h2>
			<p>导出内容包含 richer 字段、评论 meta、菜单、旧 slug，并按批次写入 NDJSON，避免大站一次性把全部数据读进内存。</p>
			<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
				<input type="hidden" name="action" value="utterlog_sync_export" />
				<?php wp_nonce_field(self::NONCE_EXPORT); ?>
				<fieldset>
					<label>
						<input type="checkbox" name="include_assets" value="1" checked="checked" />
						打包上传目录中的原始附件文件
					</label>
					<br />
					<label>
						<input type="checkbox" name="include_raw_wordpress" value="1" checked="checked" />
						打包 raw/wordpress 原始表快照
					</label>
				</fieldset>
				<?php submit_button('下载 Utterlog Package', 'primary', 'submit', false); ?>
			</form>

			<hr />

			<h2>直接同步到 Utterlog</h2>
			<p>插件会先构建标准化工作区，再按资源和批次调用 Utterlog 的同步接口。当前模式不会上传二进制附件，也不会附带 raw/wordpress 快照，只发送标准化 JSON 和媒体 URL。</p>
			<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>">
				<input type="hidden" name="action" value="utterlog_sync_push" />
				<?php wp_nonce_field(self::NONCE_SYNC); ?>
				<?php submit_button('开始同步到 Utterlog', 'secondary', 'submit', false); ?>
			</form>

			<hr />

			<h2>最近日志</h2>
			<?php if (empty($last_run)) : ?>
				<p>暂无日志。</p>
			<?php else : ?>
				<p>
					<strong>动作：</strong><?php echo esc_html($last_run['action']); ?>
					&nbsp;|&nbsp;
					<strong>状态：</strong><?php echo esc_html($last_run['status']); ?>
					&nbsp;|&nbsp;
					<strong>开始：</strong><?php echo esc_html($last_run['started_at']); ?>
					<?php if (!empty($last_run['finished_at'])) : ?>
						&nbsp;|&nbsp;
						<strong>结束：</strong><?php echo esc_html($last_run['finished_at']); ?>
					<?php endif; ?>
				</p>
				<table class="widefat striped">
					<thead>
						<tr>
							<th style="width: 140px;">时间</th>
							<th style="width: 100px;">级别</th>
							<th>消息</th>
						</tr>
					</thead>
					<tbody>
						<?php foreach ((array) $last_run['messages'] as $message) : ?>
							<tr>
								<td><?php echo esc_html($message['time']); ?></td>
								<td><?php echo esc_html($message['level']); ?></td>
								<td><?php echo esc_html($message['message']); ?></td>
							</tr>
						<?php endforeach; ?>
					</tbody>
				</table>
				<form method="post" action="<?php echo esc_url(admin_url('admin-post.php')); ?>" style="margin-top: 12px;">
					<input type="hidden" name="action" value="utterlog_sync_clear_log" />
					<?php wp_nonce_field(self::NONCE_CLEAR_LOG); ?>
					<?php submit_button('清空日志', 'delete', 'submit', false); ?>
				</form>
			<?php endif; ?>
		</div>
		<?php
	}

	public function handle_save() {
		$this->guard_manage_options();
		check_admin_referer(self::NONCE_SAVE);

		$settings = array(
			'utterlog_url' => isset($_POST['utterlog_url']) ? esc_url_raw(wp_unslash($_POST['utterlog_url'])) : '',
			'site_uuid' => isset($_POST['site_uuid']) ? sanitize_text_field(wp_unslash($_POST['site_uuid'])) : '',
			'sync_token' => isset($_POST['sync_token']) ? sanitize_text_field(wp_unslash($_POST['sync_token'])) : '',
			'sync_path' => isset($_POST['sync_path']) ? sanitize_text_field(wp_unslash($_POST['sync_path'])) : Utterlog_Sync_Client::DEFAULT_SYNC_PATH,
			'batch_size' => isset($_POST['batch_size']) ? max(20, min(Utterlog_Package_Exporter::MAX_BATCH_SIZE, (int) $_POST['batch_size'])) : Utterlog_Package_Exporter::DEFAULT_BATCH_SIZE,
			'timeout' => isset($_POST['timeout']) ? max(10, min(300, (int) $_POST['timeout'])) : 30,
			'verify_ssl' => !empty($_POST['verify_ssl']) ? 1 : 0,
		);

		update_option(self::OPTION_KEY, $settings, false);
		$this->redirect_with_notice('saved');
	}

	public function handle_export() {
		$this->guard_manage_options();
		check_admin_referer(self::NONCE_EXPORT);

		$logger = new Utterlog_Sync_Logger();
		$logger->start('export', array('mode' => 'package'));
		$exporter = new Utterlog_Package_Exporter($this->get_settings(), $logger);
		$result = $exporter->build_package(
			array(
				'include_assets' => !empty($_POST['include_assets']),
				'include_raw_wordpress' => !empty($_POST['include_raw_wordpress']),
			)
		);

		if (is_wp_error($result)) {
			$logger->append($result->get_error_message(), 'error');
			$logger->finish('failed');
			wp_die(esc_html($result->get_error_message()));
		}

		$logger->finish('success', array(
			'filename' => $result['filename'],
			'counts' => isset($result['counts']) ? $result['counts'] : array(),
		));

		$path = $result['path'];
		if (!file_exists($path)) {
			wp_die('导出文件不存在。');
		}

		nocache_headers();
		header('Content-Type: application/zip');
		header('Content-Disposition: attachment; filename="' . rawurlencode($result['filename']) . '"');
		header('Content-Length: ' . filesize($path));
		readfile($path);

		if (!empty($result['cleanup_paths']) && is_array($result['cleanup_paths'])) {
			foreach ($result['cleanup_paths'] as $cleanup_path) {
				Utterlog_Package_Exporter::rrmdir($cleanup_path);
			}
		}
		exit;
	}

	public function handle_sync() {
		$this->guard_manage_options();
		check_admin_referer(self::NONCE_SYNC);

		$logger = new Utterlog_Sync_Logger();
		$logger->start('sync', array('mode' => 'direct'));

		$settings = $this->get_settings();
		$exporter = new Utterlog_Package_Exporter($settings, $logger);
		$workspace = $exporter->build_workspace(
			array(
				'include_assets' => false,
				'include_raw_wordpress' => false,
			)
		);

		if (is_wp_error($workspace)) {
			$logger->append($workspace->get_error_message(), 'error');
			$logger->finish('failed');
			$this->redirect_with_notice('sync_failed');
		}

		$client = new Utterlog_Sync_Client($settings, $logger);
		$result = $client->sync_workspace($workspace);

		if (!empty($workspace['base_tmp_dir'])) {
			Utterlog_Package_Exporter::rrmdir($workspace['base_tmp_dir']);
		}

		if (is_wp_error($result)) {
			$logger->append($result->get_error_message(), 'error');
			$logger->finish('failed');
			$this->redirect_with_notice('sync_failed');
		}

		$logger->finish('success', $result);
		$this->redirect_with_notice('synced');
	}

	public function handle_clear_log() {
		$this->guard_manage_options();
		check_admin_referer(self::NONCE_CLEAR_LOG);
		Utterlog_Sync_Logger::clear();
		$this->redirect_with_notice('log_cleared');
	}

	private function get_settings() {
		$settings = get_option(self::OPTION_KEY, array());
		return wp_parse_args(
			is_array($settings) ? $settings : array(),
			array(
				'utterlog_url' => '',
				'site_uuid' => '',
				'sync_token' => '',
				'sync_path' => Utterlog_Sync_Client::DEFAULT_SYNC_PATH,
				'batch_size' => Utterlog_Package_Exporter::DEFAULT_BATCH_SIZE,
				'timeout' => 30,
				'verify_ssl' => 1,
			)
		);
	}

	private function render_notice() {
		if (empty($_GET['utterlog_notice'])) {
			return;
		}

		$notice = sanitize_text_field(wp_unslash($_GET['utterlog_notice']));
		$map = array(
			'saved' => array('class' => 'notice notice-success', 'text' => '设置已保存。'),
			'synced' => array('class' => 'notice notice-success', 'text' => '同步任务已完成，请查看下方日志。'),
			'sync_failed' => array('class' => 'notice notice-error', 'text' => '同步失败，请查看下方日志。'),
			'log_cleared' => array('class' => 'notice notice-success', 'text' => '日志已清空。'),
		);

		if (!isset($map[$notice])) {
			return;
		}

		printf('<div class="%s"><p>%s</p></div>', esc_attr($map[$notice]['class']), esc_html($map[$notice]['text']));
	}

	private function redirect_with_notice($notice) {
		wp_safe_redirect(
			add_query_arg(
				array(
					'page' => self::MENU_SLUG,
					'utterlog_notice' => $notice,
				),
				admin_url('tools.php')
			)
		);
		exit;
	}

	private function guard_manage_options() {
		if (!current_user_can('manage_options')) {
			wp_die(esc_html__('You do not have permission to perform this action.', 'utterlog-sync'));
		}
	}
}

Utterlog_Sync_Plugin::boot();
