<?php
/**
 * LiMhy - SMTP 发信组件
 * 
 * @package LiMhy
 * @author  Jason（QQ：895443171）
 * @desc    基于原生 Socket 协议，支持 SSL/TLS 安全加密连接
 */

declare(strict_types=1);

class Mailer
{
    private string $host;
    private int $port;
    private string $user;
    private string $pass;
    private string $secure;
    private string $fromName;

    public function __construct()
    {
        $this->host = defined('SMTP_HOST') ? SMTP_HOST : '';
        $this->port = defined('SMTP_PORT') ? (int)SMTP_PORT : 465;
        $this->user = defined('SMTP_USER') ? SMTP_USER : '';
        $this->pass = defined('SMTP_PASS') ? SMTP_PASS : '';
        $this->secure = defined('SMTP_SECURE') ? SMTP_SECURE : 'ssl';
        $this->fromName = defined('SITE_NAME') ? SITE_NAME : 'LiMhy';
    }

    /**
     * 发送 HTML 邮件
     */
    public function send(string $to, string $subject, string $htmlContent): bool
    {
        if (empty($this->host) || empty($this->user)) return false;
        
        $socketUrl = ($this->secure === 'ssl' ? 'ssl://' : '') . $this->host . ':' . $this->port;
        $ctx = stream_context_create(['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
        $socket = @stream_socket_client($socketUrl, $errno, $errstr, 10, STREAM_CLIENT_CONNECT, $ctx);
        
        if (!$socket) return false;
        $this->read($socket);
        $hostName = $_SERVER['SERVER_NAME'] ?? 'localhost';

        if (!$this->cmd($socket, "EHLO {$hostName}")) $this->cmd($socket, "HELO {$hostName}");
        if (!$this->cmd($socket, "AUTH LOGIN")) return false;
        if (!$this->cmd($socket, base64_encode($this->user))) return false;
        if (!$this->cmd($socket, base64_encode($this->pass))) return false;
        if (!$this->cmd($socket, "MAIL FROM:<{$this->user}>")) return false;
        if (!$this->cmd($socket, "RCPT TO:<{$to}>")) return false;
        if (!$this->cmd($socket, "DATA")) return false;

        $headers = [
            "MIME-Version: 1.0", "Content-Type: text/html; charset=utf-8", "Content-Transfer-Encoding: base64",
            "From: =?UTF-8?B?" . base64_encode($this->fromName) . "?= <{$this->user}>",
            "To: <{$to}>", "Subject: =?UTF-8?B?" . base64_encode($subject) . "?=",
            "Date: " . date('r'), "X-Mailer: LiMhy-Native-Mailer/1.0"
        ];

        fputs($socket, implode("\r\n", $headers) . "\r\n\r\n" . chunk_split(base64_encode($htmlContent)) . "\r\n.\r\n");
        $this->read($socket);
        fputs($socket, "QUIT\r\n");
        fclose($socket);
        return true;
    }

    private function cmd($socket, string $cmd): bool {
        fputs($socket, $cmd . "\r\n");
        $response = $this->read($socket);
        return ((int)substr($response, 0, 3) < 400);
    }

    private function read($socket): string {
        $res = ''; while ($str = fgets($socket, 512)) { $res .= $str; if (substr($str, 3, 1) === ' ') break; }
        return $res;
    }
}


function mail_queue_file(): string
{
    $dir = ROOT . '/data/mail_queue';
    if (!is_dir($dir)) { @mkdir($dir, 0755, true); }
    return $dir . '/pending.jsonl';
}

function mail_queue_push(string $to, string $subject, string $html): void
{
    if (trim($to) === '') return;
    $payload = [
        'to' => $to,
        'subject' => $subject,
        'html' => $html,
        'created_at' => date('Y-m-d H:i:s'),
    ];
    @file_put_contents(mail_queue_file(), json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "
", FILE_APPEND | LOCK_EX);
}

function mail_queue_flush_once(int $limit = 1): void
{
    $file = mail_queue_file();
    if (!is_file($file)) return;
    $fp = @fopen($file, 'c+');
    if (!$fp) return;
    try {
        if (!@flock($fp, LOCK_EX)) { @fclose($fp); return; }
        $raw = stream_get_contents($fp);
        $lines = preg_split('/?
/', (string)$raw);
        $jobs = [];
        foreach ($lines as $line) {
            $line = trim($line);
            if ($line === '') continue;
            $job = json_decode($line, true);
            if (is_array($job) && !empty($job['to']) && !empty($job['subject']) && isset($job['html'])) {
                $jobs[] = $job;
            }
        }
        if (!$jobs) {
            ftruncate($fp, 0); rewind($fp); @flock($fp, LOCK_UN); @fclose($fp); return;
        }
        $mailer = new Mailer();
        $remain = [];
        $sent = 0;
        foreach ($jobs as $job) {
            if ($sent < $limit) {
                try {
                    $ok = $mailer->send((string)$job['to'], (string)$job['subject'], (string)$job['html']);
                    if ($ok) { $sent++; continue; }
                } catch (\Throwable $e) {}
            }
            $remain[] = $job;
        }
        ftruncate($fp, 0);
        rewind($fp);
        if ($remain) {
            $out = '';
            for ($i = 0; $i < count($remain); $i++) {
                $out .= json_encode($remain[$i], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES) . "
";
            }
            fwrite($fp, $out);
        }
        fflush($fp);
        @flock($fp, LOCK_UN);
        @fclose($fp);
    } catch (\Throwable $e) {
        @flock($fp, LOCK_UN);
        @fclose($fp);
    }
}
