package util

import (
	"bytes"
	"crypto/tls"
	"encoding/json"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/smtp"
	"strings"
	"time"
)

type EmailConfig struct {
	Host       string
	Port       string
	User       string
	Pass       string
	Encryption string // tls, ssl, none
	From       string
	FromName   string
	// API-based providers
	Provider       string // smtp, resend, sendflare
	ResendAPIKey   string
	SendflareAPIKey string
}

func SendEmail(cfg EmailConfig, to, subject, body string) error {
	switch cfg.Provider {
	case "resend":
		return sendViaResend(cfg, to, subject, body)
	case "sendflare":
		return sendViaSendflare(cfg, to, subject, body)
	}
	// Default: SMTP
	if cfg.Host == "" {
		return fmt.Errorf("邮件服务未配置")
	}

	from := cfg.From
	if from == "" {
		from = cfg.User
	}

	// Build message
	fromHeader := from
	if cfg.FromName != "" {
		fromHeader = fmt.Sprintf("%s <%s>", cfg.FromName, from)
	}

	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n%s",
		fromHeader, to, subject, body)

	addr := net.JoinHostPort(cfg.Host, cfg.Port)

	auth := smtp.PlainAuth("", cfg.User, cfg.Pass, cfg.Host)

	if cfg.Encryption == "ssl" || cfg.Port == "465" {
		// SSL: direct TLS connection
		tlsCfg := &tls.Config{ServerName: cfg.Host}
		conn, err := tls.Dial("tcp", addr, tlsCfg)
		if err != nil {
			return fmt.Errorf("TLS连接失败: %v", err)
		}
		defer conn.Close()

		client, err := smtp.NewClient(conn, cfg.Host)
		if err != nil {
			return fmt.Errorf("SMTP客户端创建失败: %v", err)
		}
		defer client.Close()

		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP认证失败: %v", err)
		}
		if err = client.Mail(from); err != nil {
			return err
		}
		if err = client.Rcpt(to); err != nil {
			return err
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		_, err = w.Write([]byte(msg))
		if err != nil {
			return err
		}
		return w.Close()
	}

	// TLS (STARTTLS) or plain
	if cfg.Encryption == "tls" || cfg.Port == "587" {
		// Use STARTTLS
		client, err := smtp.Dial(addr)
		if err != nil {
			return fmt.Errorf("SMTP连接失败: %v", err)
		}
		defer client.Close()

		tlsCfg := &tls.Config{ServerName: cfg.Host}
		if err = client.StartTLS(tlsCfg); err != nil {
			return fmt.Errorf("STARTTLS失败: %v", err)
		}
		if err = client.Auth(auth); err != nil {
			return fmt.Errorf("SMTP认证失败: %v", err)
		}
		if err = client.Mail(from); err != nil {
			return err
		}
		if err = client.Rcpt(to); err != nil {
			return err
		}
		w, err := client.Data()
		if err != nil {
			return err
		}
		_, err = w.Write([]byte(msg))
		if err != nil {
			return err
		}
		return w.Close()
	}

	// Plain SMTP
	return smtp.SendMail(addr, auth, from, strings.Split(to, ","), []byte(msg))
}

func sendViaResend(cfg EmailConfig, to, subject, body string) error {
	if cfg.ResendAPIKey == "" {
		return fmt.Errorf("Resend API Key 未配置")
	}
	from := cfg.From
	if cfg.FromName != "" {
		from = fmt.Sprintf("%s <%s>", cfg.FromName, cfg.From)
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"from":    from,
		"to":      []string{to},
		"subject": subject,
		"html":    body,
	})
	req, _ := http.NewRequest("POST", "https://api.resend.com/emails", bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+cfg.ResendAPIKey)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("Resend 请求失败: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Resend 返回 %d: %s", resp.StatusCode, string(b))
	}
	return nil
}

func sendViaSendflare(cfg EmailConfig, to, subject, body string) error {
	if cfg.SendflareAPIKey == "" {
		return fmt.Errorf("Sendflare API Key 未配置")
	}
	from := cfg.From
	if cfg.FromName != "" {
		from = fmt.Sprintf("%s <%s>", cfg.FromName, cfg.From)
	}
	payload, _ := json.Marshal(map[string]interface{}{
		"from":    from,
		"to":      to,
		"subject": subject,
		"html":    body,
	})
	req, _ := http.NewRequest("POST", "https://api.sendflare.com/v1/send", bytes.NewReader(payload))
	req.Header.Set("Authorization", "Bearer "+cfg.SendflareAPIKey)
	req.Header.Set("Content-Type", "application/json")
	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("Sendflare 请求失败: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("Sendflare 返回 %d: %s", resp.StatusCode, string(b))
	}
	return nil
}
