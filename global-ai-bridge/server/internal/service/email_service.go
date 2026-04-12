package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"html/template"
	"net/http"
	"strings"
	"time"
)

// EmailService 邮件发送服务
type EmailService struct {
	enabled    bool
	provider   string // sendflare, resend, smtp
	apiKey     string
	fromAddr   string
	fromName   string
	httpClient *http.Client
}

// EmailConfig 邮件配置
type EmailConfig struct {
	Provider string // sendflare, resend
	APIKey   string
	FromAddr string
	FromName string
}

// NewEmailService 创建邮件服务
func NewEmailService(cfg EmailConfig) *EmailService {
	return &EmailService{
		enabled:    cfg.APIKey != "" && cfg.FromAddr != "",
		provider:   cfg.Provider,
		apiKey:     cfg.APIKey,
		fromAddr:   cfg.FromAddr,
		fromName:   cfg.FromName,
		httpClient: &http.Client{Timeout: 30 * time.Second},
	}
}

// IsEnabled 检查邮件服务是否启用
func (s *EmailService) IsEnabled() bool {
	return s.enabled
}

// SendTokenEmail 发送 Token 申请成功邮件
func (s *EmailService) SendTokenEmail(toEmail, token, nodeName string) error {
	if !s.enabled {
		return fmt.Errorf("email service not enabled")
	}

	subject := "AI Bridge - Token 申请成功"
	body, err := s.renderTokenEmail(token, nodeName)
	if err != nil {
		return fmt.Errorf("render email template failed: %w", err)
	}

	switch s.provider {
	case "sendflare":
		return s.sendViaSendflare(toEmail, subject, body)
	case "resend":
		return s.sendViaResend(toEmail, subject, body)
	default:
		return fmt.Errorf("unsupported email provider: %s", s.provider)
	}
}

// sendViaSendflare 通过 Sendflare 发送邮件
func (s *EmailService) sendViaSendflare(toEmail, subject, htmlBody string) error {
	url := "https://api.sendflare.com/v1/send"

	payload := map[string]string{
		"from":    s.formatFrom(),
		"to":      toEmail,
		"subject": subject,
		"html":    htmlBody,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("sendflare API error: status %d", resp.StatusCode)
	}

	return nil
}

// sendViaResend 通过 Resend 发送邮件
func (s *EmailService) sendViaResend(toEmail, subject, htmlBody string) error {
	url := "https://api.resend.com/emails"

	payload := map[string]interface{}{
		"from":    s.formatFrom(),
		"to":      toEmail,
		"subject": subject,
		"html":    htmlBody,
	}

	jsonData, err := json.Marshal(payload)
	if err != nil {
		return err
	}

	req, err := http.NewRequest("POST", url, bytes.NewBuffer(jsonData))
	if err != nil {
		return err
	}

	req.Header.Set("Authorization", "Bearer "+s.apiKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := s.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("resend API error: status %d", resp.StatusCode)
	}

	return nil
}

// formatFrom 格式化发件人地址
func (s *EmailService) formatFrom() string {
	if s.fromName != "" {
		return fmt.Sprintf("%s <%s>", s.fromName, s.fromAddr)
	}
	return s.fromAddr
}

// renderTokenEmail 渲染 Token 邮件模板
func (s *EmailService) renderTokenEmail(token, nodeName string) (string, error) {
	tmpl := `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>AI Bridge Token 申请成功</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            background-color: #f5f7fa;
            padding: 40px 20px;
            color: #333;
        }
        .container {
            max-width: 600px;
            margin: 0 auto;
            background: #ffffff;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.08);
        }
        .header {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 40px 30px;
            text-align: center;
        }
        .header h1 {
            color: #ffffff;
            font-size: 24px;
            font-weight: 600;
        }
        .header p {
            color: rgba(255, 255, 255, 0.9);
            margin-top: 8px;
            font-size: 14px;
        }
        .content {
            padding: 40px 30px;
        }
        .success-icon {
            width: 64px;
            height: 64px;
            background: #10b981;
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            margin: 0 auto 24px;
        }
        .success-icon svg {
            width: 32px;
            height: 32px;
            fill: white;
        }
        .title {
            font-size: 20px;
            font-weight: 600;
            text-align: center;
            color: #1f2937;
            margin-bottom: 16px;
        }
        .description {
            text-align: center;
            color: #6b7280;
            font-size: 14px;
            line-height: 1.6;
            margin-bottom: 32px;
        }
        .token-box {
            background: #f9fafb;
            border: 1px solid #e5e7eb;
            border-radius: 8px;
            padding: 20px;
            margin-bottom: 24px;
        }
        .token-label {
            font-size: 12px;
            color: #6b7280;
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 8px;
        }
        .token-value {
            font-family: 'Monaco', 'Menlo', 'Consolas', monospace;
            font-size: 14px;
            color: #1f2937;
            word-break: break-all;
            background: #ffffff;
            padding: 12px;
            border-radius: 6px;
            border: 1px solid #e5e7eb;
        }
        .info-section {
            background: #eff6ff;
            border-left: 4px solid #3b82f6;
            padding: 16px 20px;
            border-radius: 0 8px 8px 0;
            margin-bottom: 24px;
        }
        .info-section h3 {
            font-size: 14px;
            color: #1e40af;
            margin-bottom: 8px;
        }
        .info-section ul {
            margin: 0;
            padding-left: 20px;
            color: #1e40af;
            font-size: 13px;
            line-height: 1.8;
        }
        .warning-section {
            background: #fff7ed;
            border-left: 4px solid #f97316;
            padding: 16px 20px;
            border-radius: 0 8px 8px 0;
            margin-bottom: 24px;
        }
        .warning-section h3 {
            font-size: 14px;
            color: #9a3412;
            margin-bottom: 8px;
        }
        .warning-section p {
            color: #9a3412;
            font-size: 13px;
            line-height: 1.6;
        }
        .cta-button {
            display: block;
            width: 100%;
            padding: 14px 24px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: #ffffff;
            text-align: center;
            text-decoration: none;
            border-radius: 8px;
            font-weight: 600;
            font-size: 16px;
            margin-top: 24px;
        }
        .footer {
            background: #f9fafb;
            padding: 24px 30px;
            text-align: center;
            border-top: 1px solid #e5e7eb;
        }
        .footer p {
            color: #9ca3af;
            font-size: 12px;
            margin-bottom: 4px;
        }
        .node-info {
            display: inline-block;
            background: #e0e7ff;
            color: #4338ca;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 12px;
            font-weight: 500;
            margin-top: 8px;
        }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🌉 AI Bridge</h1>
            <p>WordPress AI 代理桥接服务</p>
        </div>
        
        <div class="content">
            <div class="success-icon">
                <svg viewBox="0 0 20 20"><path d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"/></svg>
            </div>
            
            <h2 class="title">Token 申请成功！</h2>
            <p class="description">
                您的 AI Bridge 访问令牌已成功创建。请妥善保管以下信息，
                <br>此令牌将用于验证您的 API 请求。
            </p>
            
            <div class="token-box">
                <div class="token-label">您的访问令牌 (Access Token)</div>
                <div class="token-value">{{.Token}}</div>
                <span class="node-info">{{.NodeName}}</span>
            </div>
            
            <div class="info-section">
                <h3>📋 使用说明</h3>
                <ul>
                    <li>在 WordPress AI Bridge 插件设置中填入此 Token</li>
                    <li>同时需要配置您的 AI 提供商 API Key（OpenAI、Claude 等）</li>
                    <li>Token 与您的邮箱绑定，每个邮箱只能申请一个 Token</li>
                    <li>支持多种 AI 模型：GPT-4、Claude、Gemini、DeepSeek 等</li>
                </ul>
            </div>
            
            <div class="warning-section">
                <h3>⚠️ 安全提示</h3>
                <p>
                    请妥善保管您的 Token，不要分享给他人。如果怀疑 Token 泄露，
                    请联系管理员吊销并重新申请。
                </p>
            </div>
            
            <a href="#" class="cta-button">访问 AI Bridge 控制台</a>
        </div>
        
        <div class="footer">
            <p>此邮件由 AI Bridge 系统自动发送</p>
            <p>如有问题，请联系管理员</p>
        </div>
    </div>
</body>
</html>`

	data := struct {
		Token    string
		NodeName string
	}{
		Token:    token,
		NodeName: nodeName,
	}

	// 解析 HTML 模板
	t := template.Must(template.New("tokenEmail").Parse(tmpl))
	var buf bytes.Buffer
	if err := t.Execute(&buf, data); err != nil {
		return "", err
	}

	return buf.String(), nil
}

// ValidateEmail 验证邮箱格式
func ValidateEmail(email string) bool {
	email = strings.ToLower(strings.TrimSpace(email))
	if email == "" {
		return false
	}
	// 简单验证
	parts := strings.Split(email, "@")
	if len(parts) != 2 {
		return false
	}
	domain := parts[1]
	return strings.Contains(domain, ".")
}
