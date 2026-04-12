'use client';

import { useEffect, useState } from 'react';
import { optionsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Toggle } from '@/components/ui';
import { Save, Globe, Mail, Database, Shield, Upload, ImageIcon } from '@/components/icons';
import api from '@/lib/api';
import { useForm } from 'react-hook-form';

// Shared style constants
const cardStyle = { padding: '28px', marginBottom: '20px' } as const;
const sectionTitleStyle = { fontSize: '15px', fontWeight: 600, marginBottom: '24px' } as const;
const subSectionStyle = 'p-5 bg-soft rounded-[4px] space-y-4';
const subTitleRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as const;

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  const { register, handleSubmit, reset, getValues, watch } = useForm();
  const emailProvider = watch('email_provider', 'smtp');
  const mediaDriver = watch('media_driver', 'local');
  const imageQuality = watch('image_quality', 82);
  const [storageStats, setStorageStats] = useState<{ files: number; size: number; limit: number }>({ files: 0, size: 0, limit: 10 * 1024 * 1024 * 1024 });
  const [testingStorage, setTestingStorage] = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response: any = await optionsApi.list();
      const s = response.data || {};
      reset({
        // 常规
        site_title: s.site_title || '',
        site_description: s.site_description || '',
        site_keywords: s.site_keywords || '',
        site_url: s.site_url || '',
        site_logo: s.site_logo || '',
        site_logo_dark: s.site_logo_dark || '',
        site_favicon: s.site_favicon || '',
        beian_gongan: s.beian_gongan || '',
        beian_icp: s.beian_icp || '',
        custom_head_code: s.custom_head_code || '',
        admin_email: s.admin_email || '',
        posts_per_page: s.posts_per_page || 10,
        // 邮件
        email_provider: s.email_provider || 'smtp',
        email_from: s.email_from || '',
        email_from_name: s.email_from_name || '',
        smtp_host: s.smtp_host || '',
        smtp_port: s.smtp_port || '587',
        smtp_user: s.smtp_user || '',
        smtp_pass: s.smtp_pass || '',
        smtp_encryption: s.smtp_encryption || 'tls',
        resend_api_key: s.resend_api_key || '',
        sendflare_api_key: s.sendflare_api_key || '',
        // 评论
        allow_comments: s.allow_comments !== false,
        comment_moderation: s.comment_moderation ?? false,
        comment_require_email: s.comment_require_email ?? true,
        comment_notify_admin: s.comment_notify_admin ?? true,
        // Telegram
        telegram_bot_token: s.telegram_bot_token || '',
        telegram_chat_id: s.telegram_chat_id || '',
        telegram_webhook_secret: s.telegram_webhook_secret || '',
        tg_notify_comment: s.tg_notify_comment ?? false,
        tg_notify_follow: s.tg_notify_follow ?? false,
        tg_notify_publish: s.tg_notify_publish ?? false,
        tg_daily_report: s.tg_daily_report ?? false,
        tg_comment_approve: s.tg_comment_approve ?? false,
        tg_comment_reply: s.tg_comment_reply ?? false,
        tg_publish_moment: s.tg_publish_moment ?? false,
        tg_ai_chat: s.tg_ai_chat ?? false,
        tg_auto_upload_image: s.tg_auto_upload_image ?? false,
        // 媒体
        media_driver: s.media_driver || 'local',
        max_upload_size: s.max_upload_size || 10,
        allowed_extensions: s.allowed_extensions || '',
        image_convert_format: s.image_convert_format || '',
        image_quality: s.image_quality || 82,
        image_max_width: s.image_max_width || '',
        image_strip_exif: s.image_strip_exif ?? true,
        // 图片处理
        random_image_api: s.random_image_api || '',
        random_image_enabled: s.random_image_enabled ?? false,
        tinypng_api_key: s.tinypng_api_key || '',
        tinypng_enabled: s.tinypng_enabled ?? false,
        image_lazy_load: s.image_lazy_load ?? true,
        image_lazy_load_placeholder: s.image_lazy_load_placeholder || 'blur',
        image_lightbox: s.image_lightbox ?? true,
        image_lightbox_style: s.image_lightbox_style || 'default',
        image_display_effect: s.image_display_effect || 'fade',
        image_display_duration: s.image_display_duration || 300,
        // S3/R2
        s3_endpoint: s.s3_endpoint || '',
        s3_region: s.s3_region || '',
        s3_bucket: s.s3_bucket || '',
        s3_access_key: s.s3_access_key || '',
        s3_secret_key: s.s3_secret_key || '',
        s3_custom_domain: s.s3_custom_domain || '',
        // 安全
        require_login: s.require_login ?? false,
        rate_limit: s.rate_limit || 60,
        two_factor_enabled: s.two_factor_enabled ?? false,
        two_factor_code: '',
        passkey_enabled: s.passkey_enabled ?? false,
      });
      try {
        const sr: any = await api.get('/media/stats');
        if (sr.success || sr.data) {
          const d = sr.data || sr;
          setStorageStats({ files: d.files || 0, size: d.size || 0, limit: d.limit || 10 * 1024 * 1024 * 1024 });
        }
      } catch {}
    } catch {
      toast.error('获取设置失败');
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      await optionsApi.updateMany(data);
      toast.success('设置已保存');
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const testStorageConnection = async () => {
    setTestingStorage(true);
    try {
      const vals = getValues();
      const r: any = await api.post('/media/test-connection', {
        driver: vals.media_driver,
        endpoint: vals.s3_endpoint,
        region: vals.s3_region,
        bucket: vals.s3_bucket,
        access_key: vals.s3_access_key,
        secret_key: vals.s3_secret_key,
      });
      if (r.success) toast.success('连接成功');
      else toast.error(r.error || '连接失败');
    } catch {
      toast.error('连接失败');
    } finally {
      setTestingStorage(false);
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>, field: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    try {
      const r: any = await api.post('/media/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = r.url || r.data?.url;
      if (url) {
        reset({ ...getValues(), [field]: url });
        toast.success('上传成功');
      }
    } catch {
      toast.error('上传失败');
    }
  };

  const tabs = [
    { id: 'general', label: '常规设置', icon: Globe },
    { id: 'email', label: '邮件设置', icon: Mail },
    { id: 'telegram', label: 'Telegram', icon: Mail },
    { id: 'comment', label: '评论设置', icon: Mail },
    { id: 'media', label: '存储设置', icon: Database },
    { id: 'image', label: '图片处理', icon: ImageIcon },
    { id: 'security', label: '安全设置', icon: Shield },
  ];

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 0', gap: '12px' }}>
        <svg width="32" height="32" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" fill="var(--color-primary)">
          <path d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" opacity=".25"/>
          <path d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z">
            <animateTransform attributeName="transform" type="rotate" dur="0.75s" values="0 12 12;360 12 12" repeatCount="indefinite"/>
          </path>
        </svg>
        <p className="text-dim" style={{ fontSize: '13px' }}>加载中...</p>
      </div>
    );
  }

  return (
    <div>
      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', borderBottom: '1px solid var(--color-border)', marginBottom: '28px' }}>
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            style={{
              padding: '10px 18px', fontSize: '13px', fontWeight: activeTab === tab.id ? 600 : 400,
              color: activeTab === tab.id ? 'var(--color-primary)' : 'var(--color-text-sub)',
              borderTop: 'none', borderLeft: 'none', borderRight: 'none',
              borderBottom: activeTab === tab.id ? '2px solid var(--color-primary)' : '2px solid transparent',
              background: 'none', cursor: 'pointer', transition: 'all 0.15s',
              whiteSpace: 'nowrap',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div>
        <form onSubmit={handleSubmit(onSubmit)}>

          {/* ==================== 常规设置 ==================== */}
          {activeTab === 'general' && (
            <>
              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>站点基础信息</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                  <Input label="站点名称" {...register('site_title')} />
                  <Input label="站点网址" placeholder="https://yourdomain.com" {...register('site_url')} />
                  <div className="col-span-2">
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>站点描述</label>
                    <textarea rows={2} className="input" {...register('site_description')} placeholder="一句话描述你的站点" />
                  </div>
                  <Input label="站点关键词" placeholder="博客,技术,生活" {...register('site_keywords')} />
                  <Input label="每页文章数" type="number" {...register('posts_per_page')} />
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>Logo & Favicon</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>网站 Logo</label>
                    <div className="flex gap-3">
                      <input className="input flex-1" placeholder="https://..." {...register('site_logo')} />
                      <label className="btn btn-secondary text-sm flex-shrink-0" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Upload size={14} /> 上传
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleUpload(e, 'site_logo')} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>深色模式 Logo</label>
                    <div className="flex gap-3">
                      <input className="input flex-1" placeholder="留空沿用默认" {...register('site_logo_dark')} />
                      <label className="btn btn-secondary text-sm flex-shrink-0" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Upload size={14} /> 上传
                        <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => handleUpload(e, 'site_logo_dark')} />
                      </label>
                    </div>
                  </div>
                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Favicon</label>
                    <div className="flex gap-3">
                      <input className="input flex-1" placeholder="https://..." {...register('site_favicon')} />
                      <label className="btn btn-secondary text-sm flex-shrink-0" style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Upload size={14} /> 上传
                        <input type="file" accept="image/*,.ico" style={{ display: 'none' }} onChange={(e) => handleUpload(e, 'site_favicon')} />
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>备案 & 高级</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                  <Input label="公安联网备案号" placeholder="留空则不显示" {...register('beian_gongan')} />
                  <Input label="ICP 备案号" placeholder="留空则不显示" {...register('beian_icp')} />
                </div>

                <div style={{ margin: '24px 0', borderTop: '1px dashed var(--color-border)' }} />

                <div>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>自定义头部代码</label>
                  <textarea rows={5} className="input font-mono text-sm" {...register('custom_head_code')} placeholder={'<!-- 注入到 <head> 标签结束前 -->\n<script>...</script>'} />
                  <p className="text-xs text-dim" style={{ marginTop: '6px' }}>用于插入访问统计、第三方监控组件等。系统会自动过滤不安全代码。</p>
                </div>
              </div>
            </>
          )}

          {/* ==================== 邮件设置 ==================== */}
          {activeTab === 'email' && (
            <>
              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>发件人信息</h3>
                <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                  <Input label="发件人邮箱" placeholder="noreply@yourdomain.com" {...register('email_from')} />
                  <Input label="发件人名称" placeholder="Utterlog" {...register('email_from_name')} />
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>邮件服务商</h3>
                <div style={{ marginBottom: '20px' }}>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>选择服务商</label>
                  <select className="input" {...register('email_provider')}>
                    <option value="smtp">SMTP</option>
                    <option value="resend">Resend</option>
                    <option value="sendflare">Sendflare</option>
                  </select>
                </div>

                {emailProvider === 'smtp' && (
                  <div className={subSectionStyle}>
                    <h4 className="text-sm font-semibold text-main">SMTP 配置</h4>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>SMTP 主机</label>
                        <input className="input text-sm" {...register('smtp_host')} placeholder="smtp.gmail.com" />
                      </div>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>端口</label>
                        <input className="input text-sm" {...register('smtp_port')} placeholder="587" />
                      </div>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>用户名</label>
                        <input className="input text-sm" {...register('smtp_user')} />
                      </div>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>密码</label>
                        <input className="input text-sm" type="password" {...register('smtp_pass')} />
                      </div>
                    </div>
                    <div>
                      <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>加密方式</label>
                      <select className="input text-sm" {...register('smtp_encryption')}>
                        <option value="tls">TLS</option>
                        <option value="ssl">SSL</option>
                        <option value="none">无加密</option>
                      </select>
                    </div>
                  </div>
                )}

                {emailProvider === 'resend' && (
                  <div className={subSectionStyle}>
                    <h4 className="text-sm font-semibold text-main">Resend 配置</h4>
                    <p className="text-xs text-dim">通过 resend.com 发送邮件，支持域名验证和邮件模板</p>
                    <div>
                      <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>API Key</label>
                      <input className="input text-sm" type="password" {...register('resend_api_key')} placeholder="re_..." />
                    </div>
                  </div>
                )}

                {emailProvider === 'sendflare' && (
                  <div className={subSectionStyle}>
                    <h4 className="text-sm font-semibold text-main">Sendflare 配置</h4>
                    <p className="text-xs text-dim">通过 sendflare.com 发送邮件，免费 5000 封/月</p>
                    <div>
                      <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>API Key</label>
                      <input className="input text-sm" type="password" {...register('sendflare_api_key')} placeholder="sf_..." />
                    </div>
                  </div>
                )}
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>测试邮件</h3>
                <div className="flex items-center gap-3">
                  <input className="input text-sm flex-1" placeholder="输入测试收件邮箱" />
                  <button type="button" className="btn btn-secondary text-sm flex-shrink-0">发送测试邮件</button>
                </div>
              </div>
            </>
          )}

          {/* ==================== Telegram ==================== */}
          {activeTab === 'telegram' && (
            <>
              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>Bot 连接</h3>
                <div className="grid gap-y-6">
                  <Input label="Bot Token" type="password" placeholder="从 @BotFather 获取" {...register('telegram_bot_token')} />
                  <div className="grid grid-cols-2 gap-x-8 gap-y-6">
                    <Input label="Chat ID" placeholder="你的 Telegram 用户/群组 ID" {...register('telegram_chat_id')} />
                    <Input label="Webhook Secret" type="password" placeholder="自定义密钥" {...register('telegram_webhook_secret')} />
                  </div>
                  <div className="flex gap-3" style={{ paddingTop: '4px' }}>
                    <button type="button" className="btn btn-secondary text-sm">测试连接</button>
                    <button type="button" className="btn btn-secondary text-sm">设置 Webhook</button>
                  </div>
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>通知功能</h3>
                <div className="space-y-5">
                  <Toggle label="新评论通知" {...register('tg_notify_comment')} />
                  <Toggle label="新关注通知" {...register('tg_notify_follow')} />
                  <Toggle label="文章发布通知" {...register('tg_notify_publish')} />
                  <Toggle label="每日数据报告" {...register('tg_daily_report')} />
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>管理功能</h3>
                <div className="space-y-5">
                  <Toggle label="评论审批" description="回复 /approve 通过" {...register('tg_comment_approve')} />
                  <Toggle label="回复评论" description="直接回复消息即可" {...register('tg_comment_reply')} />
                  <Toggle label="发布说说" description="发送文字/图片自动发布" {...register('tg_publish_moment')} />
                  <Toggle label="AI 聊天" description="/ai 开头消息对接 AI 助手" {...register('tg_ai_chat')} />
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>图片上传</h3>
                <p className="text-xs text-dim" style={{ marginTop: '-16px', marginBottom: '16px' }}>通过 Telegram 发送图片时，自动上传到媒体库</p>
                <Toggle label="自动上传图片到媒体库" {...register('tg_auto_upload_image')} />
              </div>
            </>
          )}

          {/* ==================== 评论设置 ==================== */}
          {activeTab === 'comment' && (
            <div className="card" style={cardStyle}>
              <h3 style={sectionTitleStyle}>评论设置</h3>
              <div className="space-y-5">
                <Toggle label="允许评论" {...register('allow_comments')} />
                <Toggle label="评论需要审核" {...register('comment_moderation')} />
                <Toggle label="评论需要填写邮箱" {...register('comment_require_email')} />
                <Toggle label="新评论邮件通知管理员" {...register('comment_notify_admin')} />
              </div>
            </div>
          )}

          {/* ==================== 存储设置 ==================== */}
          {activeTab === 'media' && (
            <>
              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>存储用量</h3>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                  <span className="text-sm text-sub">{storageStats.files} 个文件</span>
                  <span className="text-xs text-sub font-mono">
                    {formatSize(storageStats.size)} / {formatSize(storageStats.limit)}
                  </span>
                </div>
                <div style={{ height: '8px', background: 'var(--color-border)', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min((storageStats.size / storageStats.limit) * 100, 100)}%`,
                    height: '100%',
                    background: (storageStats.size / storageStats.limit) > 0.9 ? '#dc2626' : (storageStats.size / storageStats.limit) > 0.7 ? '#f59e0b' : 'var(--color-primary)',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                  }} />
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>存储方式</h3>
                <div style={{ marginBottom: '20px' }}>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>存储驱动</label>
                  <select className="input" {...register('media_driver')}>
                    <option value="local">本地存储</option>
                    <option value="s3">AWS S3</option>
                    <option value="r2">Cloudflare R2</option>
                  </select>
                </div>

                {(mediaDriver === 's3' || mediaDriver === 'r2') && (
                  <div className={subSectionStyle}>
                    <h4 className="text-sm font-semibold text-main">{mediaDriver === 'r2' ? 'Cloudflare R2' : 'AWS S3'} 配置</h4>
                    {mediaDriver === 'r2' && (
                      <p className="text-xs text-dim">Endpoint 格式：https://&lt;account_id&gt;.r2.cloudflarestorage.com</p>
                    )}
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Endpoint</label>
                        <input className="input text-sm" {...register('s3_endpoint')} placeholder={mediaDriver === 'r2' ? 'https://<account_id>.r2.cloudflarestorage.com' : 'https://s3.amazonaws.com'} />
                      </div>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Region</label>
                        <input className="input text-sm" {...register('s3_region')} placeholder={mediaDriver === 'r2' ? 'auto' : 'us-east-1'} />
                      </div>
                    </div>
                    <div>
                      <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Bucket</label>
                      <input className="input text-sm" {...register('s3_bucket')} placeholder="my-bucket" />
                    </div>
                    <div className="grid grid-cols-2 gap-x-8 gap-y-5">
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Access Key</label>
                        <input className="input text-sm" {...register('s3_access_key')} placeholder="AKIA..." />
                      </div>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>Secret Key</label>
                        <input className="input text-sm" type="password" {...register('s3_secret_key')} />
                      </div>
                    </div>
                    <div>
                      <label className="text-sub" style={{ display: 'block', fontSize: '12px', fontWeight: 500, marginBottom: '6px' }}>自定义域名（CDN）</label>
                      <input className="input text-sm" {...register('s3_custom_domain')} placeholder="https://cdn.yourdomain.com（可选）" />
                      <p className="text-xs text-dim" style={{ marginTop: '6px' }}>配置后文件 URL 将使用此域名，留空则使用 Bucket 原始地址</p>
                    </div>
                    <button type="button" className="btn btn-secondary text-sm" onClick={testStorageConnection} disabled={testingStorage}>
                      {testingStorage ? '测试中...' : '测试连接'}
                    </button>
                  </div>
                )}
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>上传限制</h3>
                <div className="grid gap-y-6">
                  <Input label="最大上传大小 (MB)" type="number" {...register('max_upload_size')} />
                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>允许的文件类型</label>
                    <textarea className="input text-sm font-mono" rows={3} {...register('allowed_extensions')} placeholder="每行一个扩展名，或用逗号分隔" />
                    <p className="text-xs text-dim" style={{ marginTop: '6px' }}>
                      常用：jpg, jpeg, png, gif, webp, svg, ico, mp4, mp3, pdf, zip, doc, docx, xls, xlsx, ppt, pptx, txt, md
                    </p>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* ==================== 图片处理 ==================== */}
          {activeTab === 'image' && (
            <>
              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>压缩与转换</h3>
                <div className="grid gap-y-6">
                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>上传后自动转换格式</label>
                    <select className="input text-sm" {...register('image_convert_format')}>
                      <option value="">不转换（保持原格式）</option>
                      <option value="webp">WebP（推荐，体积小兼容好）</option>
                      <option value="jpg">JPEG</option>
                    </select>
                  </div>

                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>压缩质量 (1-100)</label>
                    <div className="flex items-center gap-4">
                      <input type="range" min="1" max="100" className="flex-1" {...register('image_quality')} />
                      <span className="text-sm text-sub font-mono" style={{ width: '32px', textAlign: 'right' }}>{imageQuality}</span>
                    </div>
                    <p className="text-xs text-dim" style={{ marginTop: '6px' }}>推荐 75-85，越低体积越小但画质降低</p>
                  </div>

                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>最大宽度 (px)</label>
                    <input className="input text-sm" type="number" {...register('image_max_width')} placeholder="留空不限制，建议 1920 或 2560" />
                    <p className="text-xs text-dim" style={{ marginTop: '6px' }}>超过此宽度的图片会自动等比缩小</p>
                  </div>

                  <Toggle label="去除 EXIF 信息" description="保护隐私，减小体积" {...register('image_strip_exif')} />
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <div style={subTitleRow}>
                  <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>TinyPNG 压缩</h3>
                  <Toggle {...register('tinypng_enabled')} />
                </div>
                <p className="text-xs text-dim" style={{ marginTop: '8px', marginBottom: '20px' }}>使用 TinyPNG API 进行高质量无损压缩，每月免费 500 张</p>
                <div>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>API Key</label>
                  <input className="input text-sm" type="password" {...register('tinypng_api_key')} placeholder="从 tinypng.com/developers 获取" />
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <div style={subTitleRow}>
                  <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>随机图片 API</h3>
                  <Toggle {...register('random_image_enabled')} />
                </div>
                <p className="text-xs text-dim" style={{ marginTop: '8px', marginBottom: '20px' }}>文章没有特色图片时，自动从 API 获取随机封面</p>
                <div>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>API 地址</label>
                  <input className="input text-sm" {...register('random_image_api')} placeholder="https://api.unsplash.com/photos/random 或自定义接口" />
                  <p className="text-xs text-dim" style={{ marginTop: '6px' }}>支持 Unsplash、Picsum、Bing 每日图片等，返回图片 URL 即可</p>
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>图片显示效果</h3>
                <p className="text-xs text-dim" style={{ marginTop: '-16px', marginBottom: '20px' }}>前端文章特色图片和正文图片的加载动画效果</p>
                <div className="grid gap-y-6">
                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>显示效果</label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
                      {[
                        { value: 'fade', label: '淡入', desc: '渐变透明度' },
                        { value: 'blur', label: '模糊', desc: '从模糊到清晰' },
                        { value: 'blinds', label: '百叶窗', desc: '条纹滑入' },
                        { value: 'pixel', label: '像素化', desc: '从像素到清晰' },
                        { value: 'slide-up', label: '上滑', desc: '从下方滑入' },
                        { value: 'scale', label: '缩放', desc: '从小到大' },
                        { value: 'curtain', label: '幕帘', desc: '从中间展开' },
                        { value: 'none', label: '无', desc: '直接显示' },
                      ].map(effect => {
                        const val = watch('image_display_effect', 'fade');
                        return (
                          <label key={effect.value} className="cursor-pointer" style={{
                            padding: '12px 10px', textAlign: 'center', borderRadius: '4px',
                            border: `2px solid ${val === effect.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            background: val === effect.value ? 'rgba(var(--color-primary-rgb, 0,0,0), 0.04)' : 'transparent',
                            transition: 'all 0.15s',
                          }}>
                            <input type="radio" value={effect.value} {...register('image_display_effect')} style={{ display: 'none' }} />
                            <p style={{ fontSize: '13px', fontWeight: 600, color: val === effect.value ? 'var(--color-primary)' : 'var(--color-text-main)' }}>{effect.label}</p>
                            <p className="text-dim" style={{ fontSize: '11px', marginTop: '3px' }}>{effect.desc}</p>
                          </label>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>动画时长 (ms)</label>
                    <input className="input text-sm" type="number" {...register('image_display_duration')} placeholder="300" />
                  </div>
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <div style={subTitleRow}>
                  <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>懒加载</h3>
                  <Toggle {...register('image_lazy_load')} />
                </div>
                <p className="text-xs text-dim" style={{ marginTop: '8px', marginBottom: '20px' }}>图片进入可视区域时才加载，提升页面加载速度</p>
                <div>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>占位效果</label>
                  <select className="input text-sm" {...register('image_lazy_load_placeholder')}>
                    <option value="blur">模糊缩略图（推荐）</option>
                    <option value="color">主色调占位</option>
                    <option value="skeleton">骨架屏</option>
                    <option value="spinner">加载动画</option>
                    <option value="none">空白</option>
                  </select>
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <div style={subTitleRow}>
                  <h3 style={{ ...sectionTitleStyle, marginBottom: 0 }}>图片灯箱</h3>
                  <Toggle {...register('image_lightbox')} />
                </div>
                <p className="text-xs text-dim" style={{ marginTop: '8px', marginBottom: '20px' }}>点击文章图片时全屏预览，支持缩放、拖拽、键盘导航、图片组切换</p>
                <div>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>灯箱风格</label>
                  <select className="input text-sm" {...register('image_lightbox_style')}>
                    <option value="default">默认（深色遮罩 + 缩放）</option>
                    <option value="minimal">极简（无边框，纯图片）</option>
                    <option value="gallery">画廊（底部缩略图导航）</option>
                    <option value="slide">滑动（左右滑动切换）</option>
                  </select>
                  <p className="text-xs text-dim" style={{ marginTop: '6px' }}>基于 ViewImage.js 实现，支持触屏手势和键盘操作</p>
                </div>
              </div>
            </>
          )}

          {/* ==================== 安全设置 ==================== */}
          {activeTab === 'security' && (
            <>
              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>访问控制</h3>
                <div className="grid gap-y-6">
                  <Toggle label="需要登录才能访问前台" {...register('require_login')} />
                  <Input label="API 限流 (次/分钟)" type="number" {...register('rate_limit')} />
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>两步验证 (2FA)</h3>
                <p className="text-xs text-dim" style={{ marginTop: '-16px', marginBottom: '20px' }}>启用后登录时需要输入 TOTP 验证码（Google Authenticator / Authy）</p>
                <div className="grid gap-y-5">
                  <Toggle label="启用两步验证" {...register('two_factor_enabled')} />
                  <button type="button" className="btn btn-secondary text-sm" style={{ width: 'fit-content' }}>生成 QR 码</button>
                  <Input label="验证码确认" placeholder="输入 6 位验证码以激活" {...register('two_factor_code')} />
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>Passkey 无密码登录</h3>
                <p className="text-xs text-dim" style={{ marginTop: '-16px', marginBottom: '20px' }}>使用指纹、面容或安全密钥登录，无需输入密码。基于 WebAuthn/FIDO2 标准，支持 Touch ID、Face ID、Windows Hello、YubiKey 等</p>
                <div className="grid gap-y-5">
                  <Toggle label="启用 Passkey 登录" {...register('passkey_enabled')} />
                  <div className="flex gap-3">
                    <button type="button" className="btn btn-secondary text-sm">注册新 Passkey</button>
                    <button type="button" className="btn btn-ghost text-sm text-dim">管理已注册的密钥</button>
                  </div>
                </div>
              </div>
            </>
          )}

          {/* Save button */}
          <div style={{ paddingTop: '24px', borderTop: '1px solid var(--color-border)', marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
            <Button onClick={handleSubmit(onSubmit)} loading={saving}>
              <Save className="w-4 h-4" />
              保存设置
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
