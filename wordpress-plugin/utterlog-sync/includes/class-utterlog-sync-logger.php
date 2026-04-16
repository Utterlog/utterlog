<?php

if (!defined('ABSPATH')) {
	exit;
}

final class Utterlog_Sync_Logger {
	const OPTION_KEY = 'utterlog_sync_last_run';

	private $run = array();

	public function start($action, $context = array()) {
		$this->run = array(
			'action' => $action,
			'status' => 'running',
			'started_at' => gmdate('c'),
			'finished_at' => null,
			'context' => is_array($context) ? $context : array(),
			'messages' => array(),
			'result' => array(),
		);
		$this->persist();
	}

	public function append($message, $level = 'info', $context = array()) {
		if (empty($this->run)) {
			$this->start('unknown');
		}
		$this->run['messages'][] = array(
			'time' => gmdate('c'),
			'level' => $level,
			'message' => $message,
			'context' => is_array($context) ? $context : array(),
		);
		$this->persist();
	}

	public function finish($status, $result = array()) {
		if (empty($this->run)) {
			$this->start('unknown');
		}
		$this->run['status'] = $status;
		$this->run['finished_at'] = gmdate('c');
		$this->run['result'] = is_array($result) ? $result : array();
		$this->persist();
	}

	public static function get_last_run() {
		$data = get_option(self::OPTION_KEY, array());
		return is_array($data) ? $data : array();
	}

	public static function clear() {
		delete_option(self::OPTION_KEY);
	}

	private function persist() {
		update_option(self::OPTION_KEY, $this->run, false);
	}
}
