<?php
/**
 * File-based logger for the sync flow. Persists the last run to
 * usr/plugins/UtterlogSync/.last-run.json so the admin panel can show
 * "最近一次同步" 即使浏览器 tab 关掉也能看见。
 */

if (!defined('__TYPECHO_ROOT_DIR__')) {
    exit;
}

class UtterlogSync_Logger
{
    const FILE = '/.last-run.json';

    private $action = '';
    private $messages = array();
    private $startedAt = 0;
    private $finishedAt = 0;
    private $status = 'running';
    private $extra = array();

    public static function logPath()
    {
        return dirname(__FILE__, 2) . self::FILE;
    }

    public function start($action, $extra = array())
    {
        $this->action = (string)$action;
        $this->startedAt = time();
        $this->extra = is_array($extra) ? $extra : array();
        $this->status = 'running';
        $this->messages = array();
        $this->persist();
    }

    public function append($message, $level = 'info', $extra = array())
    {
        $this->messages[] = array(
            'time'    => date('Y-m-d H:i:s'),
            'level'   => (string)$level,
            'message' => (string)$message,
            'extra'   => $extra,
        );
        $this->persist();
    }

    public function finish($status, $extra = array())
    {
        $this->status = (string)$status;
        $this->finishedAt = time();
        $this->extra = array_merge($this->extra, is_array($extra) ? $extra : array());
        $this->persist();
    }

    private function persist()
    {
        $path = self::logPath();
        $payload = array(
            'action'      => $this->action,
            'status'      => $this->status,
            'started_at'  => date('Y-m-d H:i:s', $this->startedAt ?: time()),
            'finished_at' => $this->finishedAt ? date('Y-m-d H:i:s', $this->finishedAt) : '',
            'messages'    => $this->messages,
            'extra'       => $this->extra,
        );
        @file_put_contents($path, json_encode($payload, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
    }

    public static function getLastRun()
    {
        $path = self::logPath();
        if (!is_file($path)) return null;
        $raw = @file_get_contents($path);
        if ($raw === false || $raw === '') return null;
        $decoded = json_decode($raw, true);
        return is_array($decoded) ? $decoded : null;
    }

    public static function clear()
    {
        $path = self::logPath();
        if (is_file($path)) @unlink($path);
    }
}
