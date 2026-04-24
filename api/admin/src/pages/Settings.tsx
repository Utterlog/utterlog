
import { useEffect, useState } from 'react';
import { optionsApi } from '@/lib/api';
import toast from 'react-hot-toast';
import { Button, Input, Toggle } from '@/components/ui';
import api from '@/lib/api';
import { useForm } from 'react-hook-form';
import { FormSectionC, FormRowInputC, FormRowTextareaC } from '@/components/form/FormC';
import SystemUpdatePanel from '@/components/SystemUpdatePanel';

// Shared style constants
const cardStyle = { padding: '28px', marginBottom: '20px' } as const;
const sectionTitleStyle = { fontSize: '15px', fontWeight: 600, marginBottom: '24px' } as const;
const subSectionStyle = 'p-5 space-y-4 border border-line';
const subTitleRow = { display: 'flex', justifyContent: 'space-between', alignItems: 'center' } as const;

// Tab IDs recognized on #hash so deep links like /settings#update land
// directly on the right pane. Keep in sync with `tabs` below.
const VALID_TABS = new Set(['general', 'email', 'telegram', 'comment', 'media', 'image', 'update']);

function initialTabFromHash(): string {
  if (typeof window === 'undefined') return 'general';
  const h = window.location.hash.replace(/^#/, '');
  return VALID_TABS.has(h) ? h : 'general';
}

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<string>(initialTabFromHash);

  // Respond to hash changes (e.g. VersionBadge link from sidebar) and
  // update the URL when the user clicks a tab so refresh/bookmark work.
  useEffect(() => {
    const onHash = () => setActiveTab(initialTabFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  useEffect(() => {
    const currentHash = window.location.hash.replace(/^#/, '');
    if (activeTab !== currentHash) {
      history.replaceState(null, '', `#${activeTab}`);
    }
  }, [activeTab]);

  const { register, handleSubmit, reset, getValues, watch, setValue } = useForm();
  const emailProvider = watch('email_provider', 'smtp');
  const mediaDriver = watch('media_driver', 'local');
  const imageQuality = watch('image_quality', 82);
  const storageLimitGb = watch('storage_limit_gb', 10);
  const [storageStats, setStorageStats] = useState<{ files: number; size: number; drivers?: Record<string, { files: number; size: number }> }>({ files: 0, size: 0 });
  const [testingStorage, setTestingStorage] = useState(false);
  const [tgChats, setTgChats] = useState<{ id: string; type: string; name: string }[]>([]);
  const [fetchingChatId, setFetchingChatId] = useState(false);

  useEffect(() => { fetchSettings(); }, []);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const response: any = await optionsApi.list();
      const s = response.data || {};
      reset({
        // 常规
        site_title: s.site_title || '',
        site_subtitle: s.site_subtitle || '',
        admin_email: s.admin_email || '',
        site_description: s.site_description || '',
        site_keywords: s.site_keywords || '',
        site_url: s.site_url || '',
        site_logo: s.site_logo || '',
        site_logo_dark: s.site_logo_dark || '',
        site_favicon: s.site_favicon || '',
        beian_gongan: s.beian_gongan || '',
        beian_icp: s.beian_icp || '',
        custom_head_code: s.custom_head_code || '',
        slot_before_content: s.slot_before_content || '',
        slot_after_content: s.slot_after_content || '',
        slot_sidebar_top: s.slot_sidebar_top || '',
        slot_sidebar_bottom: s.slot_sidebar_bottom || '',
        site_since: s.site_since || '',
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
        comment_trust_returning: s.comment_trust_returning ?? true,
        comment_require_email: s.comment_require_email ?? true,
        comment_notify_admin: s.comment_notify_admin ?? true,
        comment_pagination: s.comment_pagination ?? false,
        comment_per_page: s.comment_per_page || 10,
        comment_order: s.comment_order || 'newest',
        comment_captcha_mode: s.comment_captcha_mode || 'pow',
        comment_captcha_difficulty: s.comment_captcha_difficulty || 4,
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
        storage_limit_gb: s.storage_limit_gb || 10,
        media_driver: s.media_driver || 'local',
        max_upload_size: s.max_upload_size || 20,
        allowed_extensions: s.allowed_extensions || 'jpg, jpeg, png, gif, webp, svg, ico, mp4, mp3, pdf, zip, doc, docx, xls, xlsx, ppt, pptx, txt, md',
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
        folder_driver_covers: s.folder_driver_covers || '',
        folder_driver_books: s.folder_driver_books || '',
        folder_driver_movies: s.folder_driver_movies || '',
        folder_driver_music: s.folder_driver_music || '',
        folder_driver_links: s.folder_driver_links || '',
        folder_driver_moments: s.folder_driver_moments || '',
        folder_driver_albums: s.folder_driver_albums || '',
        folder_driver_avatars: s.folder_driver_avatars || '',
        // Utterlog 网络
        utterlog_auto_push: s.utterlog_auto_push ?? true,
        utterlog_share_posts: s.utterlog_share_posts ?? true,
        utterlog_share_moments: s.utterlog_share_moments ?? false,
        utterlog_share_comments: s.utterlog_share_comments ?? false,
        // 安全
        require_login: s.require_login ?? false,
        rate_limit: s.rate_limit || 60,
        two_factor_enabled: s.two_factor_enabled ?? false,
        two_factor_code: '',
      });
      try {
        const sr: any = await api.get('/media/stats');
        if (sr.success || sr.data) {
          const d = sr.data || sr;
          setStorageStats({ files: d.files || 0, size: d.size || 0 });
        }
      } catch {}
    } catch {
      toast.error('获取设置失败');
    } finally {
      setLoading(false);
    }
  };

  const tabFields: Record<string, string[]> = {
    // Must include every field the General tab actually renders via
    // register(...). onSubmit filters the form payload through this
    // whitelist — if a field is missing here, the user's edit silently
    // vanishes (the save POST just doesn't include that key, so the DB
    // row stays unchanged and on reload the field reverts).
    general: [
      'site_title', 'site_subtitle', 'site_url', 'site_description', 'site_keywords',
      'admin_email', 'site_since',
      'site_logo', 'site_logo_dark', 'site_favicon',
      'beian_gongan', 'beian_icp',
      'custom_head_code',
    ],
    email: ['email_provider', 'email_from', 'email_from_name', 'smtp_host', 'smtp_port', 'smtp_user', 'smtp_pass', 'smtp_encryption', 'resend_api_key', 'sendflare_api_key'],
    telegram: ['telegram_bot_token', 'telegram_chat_id', 'telegram_webhook_secret', 'tg_notify_comment', 'tg_notify_follow', 'tg_notify_publish', 'tg_daily_report', 'tg_comment_approve', 'tg_comment_reply', 'tg_publish_moment', 'tg_upload_media'],
    comment: ['allow_comments', 'comment_moderation', 'comment_trust_returning', 'comment_require_email', 'comment_notify_admin', 'comment_pagination', 'comment_per_page', 'comment_order', 'comment_captcha_mode', 'comment_captcha_difficulty'],
    media: ['media_driver', 's3_endpoint', 's3_region', 's3_bucket', 's3_access_key', 's3_secret_key', 's3_custom_domain', 'storage_limit_gb', 'max_upload_size', 'allowed_extensions', 'folder_driver_covers', 'folder_driver_books', 'folder_driver_movies', 'folder_driver_music', 'folder_driver_links', 'folder_driver_moments', 'folder_driver_albums', 'folder_driver_avatars'],
    image: [
      'image_convert_format', 'image_quality', 'image_max_width', 'image_strip_exif',
      'tinypng_enabled', 'tinypng_api_key',
      'random_image_enabled', 'random_image_api',
      // Display effect + lightbox fields were rendered but missing
      // from the whitelist — saves silently dropped them, so the
      // front-end always saw the default 'fade' regardless of choice.
      'image_display_effect', 'image_display_duration',
      'image_lazy_load', 'image_lazy_load_placeholder',
      'image_lightbox', 'image_lightbox_style',
    ],
  };

  const onSubmit = async (data: any) => {
    setSaving(true);
    try {
      const fields = tabFields[activeTab];
      if (fields) {
        const filtered: Record<string, any> = {};
        for (const key of fields) {
          if (key in data) filtered[key] = data[key];
        }
        await optionsApi.updateMany(filtered);
      } else {
        await optionsApi.updateMany(data);
      }
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
      if (!vals.s3_bucket || !vals.s3_access_key || !vals.s3_secret_key) {
        toast.error('请先填写 Bucket、Access Key 和 Secret Key');
        setTestingStorage(false);
        return;
      }
      const r: any = await api.post('/media/test-connection', {
        driver: vals.media_driver,
        endpoint: vals.s3_endpoint,
        region: vals.s3_region || 'auto',
        bucket: vals.s3_bucket,
        access_key: vals.s3_access_key,
        secret_key: vals.s3_secret_key,
      });
      if (r.success) toast.success('连接成功');
      else toast.error(r.error?.message || r.error || '连接失败');
    } catch (e: any) {
      const msg = e?.response?.data?.error?.message || e?.message || '连接失败';
      toast.error(msg);
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

  const handleBrandingUpload = async (e: React.ChangeEvent<HTMLInputElement>, purpose: 'logo' | 'dark-logo' | 'favicon', field: string) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const allowed = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'ico', 'svg'];
    if (!ext || !allowed.includes(ext)) {
      toast.error('请上传 PNG/JPG/GIF/WebP/AVIF/ICO/SVG 格式');
      e.target.value = '';
      return;
    }
    const fd = new FormData();
    fd.append('file', file);
    fd.append('purpose', purpose);
    try {
      const r: any = await api.post('/media/upload-branding', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = r.url || r.data?.url;
      if (url) {
        reset({ ...getValues(), [field]: url });
        await optionsApi.updateMany({ [field]: url });
        toast.success('上传成功');
      }
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || '上传失败');
    }
    e.target.value = '';
  };

  const tabs = [
    { id: 'general', label: '常规设置', icon: 'fa-regular fa-globe' },
    { id: 'email', label: '邮件设置', icon: 'fa-regular fa-envelope' },
    { id: 'telegram', label: 'Telegram', icon: 'fa-brands fa-telegram' },
    { id: 'comment', label: '评论设置', icon: 'fa-regular fa-comments' },
    { id: 'media', label: '存储设置', icon: 'fa-regular fa-database' },
    { id: 'image', label: '图片处理', icon: 'fa-regular fa-image' },
    { id: 'update', label: '系统更新', icon: 'fa-solid fa-cloud-arrow-down' },
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
              whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '6px',
            }}
          >
            <i className={tab.icon} style={{ fontSize: '13px' }} />
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
              <FormSectionC title="站点基础信息" icon="fa-regular fa-circle-info">
                <FormRowInputC label="站点名称" register={register('site_title')} placeholder="我的博客" />
                <FormRowInputC label="副标题" register={register('site_subtitle')} placeholder="一句话 Slogan" />
                <FormRowInputC label="站点网址" register={register('site_url')} placeholder="https://yourdomain.com" />
                <FormRowInputC label="管理员邮箱" type="email" register={register('admin_email')} placeholder="admin@yourdomain.com" hint="接收系统升级、安全通知等消息" />
                <FormRowTextareaC label="站点描述" rows={2} register={register('site_description')} placeholder="一句话描述你的站点" />
                <FormRowInputC label="站点关键词" register={register('site_keywords')} placeholder="博客,技术,生活" />
                <FormRowInputC label="建站时间" type="date" register={register('site_since')} hint="留空则从第一篇文章算起" last />
              </FormSectionC>

              <FormSectionC title="Logo & Favicon" icon="fa-regular fa-image" footerHint="上传后自动保存为固定地址（logo.格式 / dark-logo.格式 / favicon.格式），不压缩不转换。">
                <div style={{ padding: '16px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                  {([
                    { label: '网站 Logo', field: 'site_logo', purpose: 'logo' as const, placeholder: 'https://...' },
                    { label: '深色模式 Logo', field: 'site_logo_dark', purpose: 'dark-logo' as const, placeholder: '留空沿用默认' },
                    { label: 'Favicon', field: 'site_favicon', purpose: 'favicon' as const, placeholder: 'https://...' },
                  ]).map(item => {
                    const val = watch(item.field);
                    return (
                      <div key={item.field} style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        <label className="text-sub" style={{ fontSize: '12px', fontWeight: 500 }}>{item.label}</label>
                        <div style={{
                          height: '80px', border: '1px solid var(--color-border)',
                          background: item.purpose === 'dark-logo' ? '#1a1a1a' : 'var(--color-bg-soft)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                        }}>
                          {val ? (
                            <img src={val} alt={item.label} style={{ maxHeight: '48px', maxWidth: '80%', objectFit: 'contain' }} onError={(e) => (e.currentTarget.style.display = 'none')} />
                          ) : (
                            <i className="fa-regular fa-image text-dim" style={{ fontSize: '24px', opacity: 0.3 }} />
                          )}
                        </div>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input className="input text-sm" style={{ flex: 1, fontSize: '12px' }} placeholder={item.placeholder} {...register(item.field)} />
                          <label
                            className="btn btn-secondary"
                            title="上传图片"
                            style={{ cursor: 'pointer', flexShrink: 0, width: 40, minWidth: 40, height: 40, minHeight: 40, padding: 0 }}
                          >
                            <i className="fa-regular fa-cloud-arrow-up" style={{ fontSize: '14px' }} />
                            <input type="file" accept=".png,.jpg,.jpeg,.gif,.webp,.avif,.ico,.svg" style={{ display: 'none' }} onChange={(e) => handleBrandingUpload(e, item.purpose, item.field)} />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </FormSectionC>

              <FormSectionC
                title="ICP / 公安备案"
                icon="fa-regular fa-shield-halved"
                footerHint="公安备案链接自动从备案号提取编号生成；ICP 备案链接固定指向 beian.miit.gov.cn。"
              >
                <FormRowInputC
                  label="公安联网备案号"
                  register={register('beian_gongan')}
                  placeholder="鲁公网安备00000000000000号"
                />
                <FormRowInputC
                  label="ICP 备案号"
                  register={register('beian_icp')}
                  placeholder="鲁ICP备00000000号"
                  last
                />
              </FormSectionC>

              <FormSectionC
                title="代码注入"
                icon="fa-regular fa-code"
                footerHint="插入到页面 <head> 标签内，用于接入第三方统计 / 监控 / 验证脚本。请只填可信来源的代码。"
              >
                <FormRowTextareaC
                  label="自定义 <head> 代码"
                  rows={6}
                  register={register('custom_head_code')}
                  placeholder={'<!-- Google Analytics / 百度统计 / Clarity 等 -->\n<script async src="https://..."></script>'}
                  hint="支持任意 <script> / <meta> / <link> 标签。保存后立即生效。"
                  last
                />
              </FormSectionC>
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
                <div style={{ marginBottom: '24px' }}>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>选择服务商</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {[
                      { value: 'smtp', label: 'SMTP', icon: 'fa-regular fa-envelope', desc: '通用 SMTP 协议' },
                      { value: 'resend', label: 'Resend', icon: 'fa-regular fa-paper-plane', desc: '免费 3000 封/月' },
                      { value: 'sendflare', label: 'Sendflare', icon: 'fa-solid fa-dove', desc: '免费 5000 封/月' },
                    ].map(d => (
                      <label key={d.value} style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                        padding: '16px 12px', borderRadius: 0,
                        border: `1px solid ${emailProvider === d.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background: emailProvider === d.value ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : 'transparent',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>
                        <input type="radio" value={d.value} {...register('email_provider')} style={{ display: 'none' }} />
                        <i className={d.icon} style={{ fontSize: '20px', color: emailProvider === d.value ? 'var(--color-primary)' : 'var(--color-text-dim)' }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: emailProvider === d.value ? 'var(--color-primary)' : 'var(--color-text-main)' }}>{d.label}</span>
                        <span className="text-dim" style={{ fontSize: '11px' }}>{d.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {emailProvider === 'smtp' && (
                  <div style={{ padding: '24px', border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fa-regular fa-envelope" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
                        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>SMTP 配置</h4>
                      </div>
                      <a href="https://support.google.com/a/answer/176600" target="_blank" rel="noopener noreferrer" className="text-dim" style={{ fontSize: '12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fa-regular fa-arrow-up-right-from-square" style={{ fontSize: '10px' }} /> Gmail SMTP 指南
                      </a>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>SMTP 主机</label>
                        <input className="input text-sm" {...register('smtp_host')} placeholder="smtp.gmail.com" />
                      </div>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>端口</label>
                        <input className="input text-sm" {...register('smtp_port')} placeholder="587" />
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>用户名</label>
                        <input className="input text-sm" {...register('smtp_user')} />
                      </div>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>密码</label>
                        <input className="input text-sm" type="password" {...register('smtp_pass')} />
                      </div>
                    </div>
                    <div>
                      <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>加密方式</label>
                      <select className="input text-sm" {...register('smtp_encryption')} style={{ maxWidth: '200px' }}>
                        <option value="tls">TLS</option>
                        <option value="ssl">SSL</option>
                        <option value="none">无加密</option>
                      </select>
                    </div>
                  </div>
                )}

                {emailProvider === 'resend' && (
                  <div style={{ padding: '24px', border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fa-regular fa-paper-plane" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
                        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Resend 配置</h4>
                      </div>
                      <a href="https://resend.com" target="_blank" rel="noopener noreferrer" className="text-dim" style={{ fontSize: '12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fa-regular fa-arrow-up-right-from-square" style={{ fontSize: '10px' }} /> resend.com
                      </a>
                    </div>
                    <div>
                      <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>API Key</label>
                      <input className="input text-sm" type="password" {...register('resend_api_key')} placeholder="re_..." />
                      <p className="text-xs text-dim" style={{ marginTop: '6px' }}>在 resend.com Dashboard 的 API Keys 中创建</p>
                    </div>
                  </div>
                )}

                {emailProvider === 'sendflare' && (
                  <div style={{ padding: '24px', border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <i className="fa-solid fa-dove" style={{ fontSize: '15px', color: 'var(--color-primary)' }} />
                        <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>Sendflare 配置</h4>
                      </div>
                      <a href="https://sendflare.com?affiliateCode=98ee3f7h4nqf" target="_blank" rel="noopener noreferrer" className="text-dim" style={{ fontSize: '12px', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <i className="fa-regular fa-arrow-up-right-from-square" style={{ fontSize: '10px' }} /> sendflare.com
                      </a>
                    </div>
                    <div>
                      <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>API Key</label>
                      <input className="input text-sm" type="password" {...register('sendflare_api_key')} placeholder="sf_..." />
                      <p className="text-xs text-dim" style={{ marginTop: '6px' }}>在 sendflare.com Dashboard 的 API Keys 中创建</p>
                    </div>
                  </div>
                )}
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>测试邮件</h3>
                <p className="text-xs text-dim" style={{ marginTop: '-16px', marginBottom: '16px' }}>保存设置后发送测试邮件，验证邮件服务是否正常</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    className="input text-sm"
                    placeholder="收件邮箱（留空发送到管理员邮箱）"
                    style={{ maxWidth: '320px' }}
                    id="test-email-input"
                  />
                  <button
                    type="button"
                    className="btn btn-secondary text-sm"
                    style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}
                    onClick={async () => {
                      const input = document.getElementById('test-email-input') as HTMLInputElement;
                      try {
                        const r: any = await api.post('/options/test-email', { to: input?.value || '' });
                        toast.success(r.data?.message || '测试邮件已发送');
                      } catch (e: any) {
                        toast.error(e?.response?.data?.error?.message || '发送失败');
                      }
                    }}
                  >
                    <i className="fa-regular fa-paper-plane" style={{ fontSize: '13px' }} /> 发送
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ==================== Telegram ==================== */}
          {activeTab === 'telegram' && (
            <>
              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>Bot 连接</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  <div>
                    <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Bot Token</label>
                    <input className="input text-sm" type="password" placeholder="从 @BotFather 获取" {...register('telegram_bot_token')} />
                    <p className="text-xs text-dim" style={{ marginTop: '4px' }}>在 Telegram 中搜索 <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>@BotFather</a>，发送 /newbot 创建</p>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    <div>
                      <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Chat ID</label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <input className="input text-sm" placeholder="你的用户/群组 ID" style={{ flex: 1 }} {...register('telegram_chat_id')} />
                        <button
                          type="button"
                          className="btn btn-secondary text-sm"
                          style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: '5px' }}
                          disabled={fetchingChatId}
                          onClick={async () => {
                            setFetchingChatId(true);
                            setTgChats([]);
                            try {
                              const vals = getValues();
                              const r: any = await api.post('/telegram/get-chat-id', { bot_token: vals.telegram_bot_token });
                              setTgChats(r.data?.chats || []);
                              if (!r.data?.chats?.length) toast(r.data?.hint || '未找到聊天记录，请先向 Bot 发送一条消息', { icon: 'ℹ️' });
                            } catch (e: any) { toast.error(e?.response?.data?.error?.message || '获取失败'); }
                            finally { setFetchingChatId(false); }
                          }}
                        >
                          {fetchingChatId ? <i className="fa-solid fa-spinner fa-spin" style={{ fontSize: '12px' }} /> : <i className="fa-regular fa-magnifying-glass" style={{ fontSize: '12px' }} />}
                          获取
                        </button>
                      </div>
                      {tgChats.length > 0 && (
                        <div style={{ marginTop: '6px', border: '1px solid var(--color-border)', borderRadius: '6px', overflow: 'hidden' }}>
                          {tgChats.map((chat) => (
                            <button
                              key={chat.id}
                              type="button"
                              onClick={() => { reset({ ...getValues(), telegram_chat_id: chat.id }); setTgChats([]); }}
                              style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '7px 10px', fontSize: '12px', background: 'none', border: 'none', borderBottom: '1px solid var(--color-border)', cursor: 'pointer', textAlign: 'left' }}
                              className="hover-bg"
                            >
                              <i className={chat.type === 'channel' ? 'fa-regular fa-bullhorn' : chat.type === 'group' || chat.type === 'supergroup' ? 'fa-regular fa-users' : 'fa-regular fa-user'} style={{ fontSize: '12px', color: 'var(--color-text-sub)', width: '14px' }} />
                              <span style={{ flex: 1, color: 'var(--color-text)' }}>{chat.name || '(未知)'}</span>
                              <span style={{ color: 'var(--color-text-dim)', fontFamily: 'monospace' }}>{chat.id}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Webhook Secret</label>
                      <input className="input text-sm" type="password" placeholder="自定义密钥（可选）" {...register('telegram_webhook_secret')} />
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '4px' }}>
                    <button
                      type="button"
                      className="btn btn-secondary text-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      onClick={async () => {
                        try {
                          const vals = getValues();
                          const r: any = await api.post('/telegram/test', {
                            bot_token: vals.telegram_bot_token,
                            chat_id: vals.telegram_chat_id,
                          });
                          toast.success(r.data?.message || '连接成功');
                        } catch (e: any) { toast.error(e?.response?.data?.error?.message || '连接失败'); }
                      }}
                    >
                      <i className="fa-regular fa-plug" style={{ fontSize: '13px' }} /> 测试连接
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary text-sm"
                      style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                      onClick={async () => {
                        try {
                          const r: any = await api.post('/telegram/setup-webhook');
                          toast.success(r.data?.message || 'Webhook 设置成功');
                        } catch (e: any) { toast.error(e?.response?.data?.error?.message || 'Webhook 设置失败'); }
                      }}
                    >
                      <i className="fa-regular fa-link" style={{ fontSize: '13px' }} /> 设置 Webhook
                    </button>
                  </div>
                  <p className="text-xs text-dim" style={{ padding: '10px 12px', background: 'var(--color-bg-soft)', border: '1px solid var(--color-border)', lineHeight: 1.8 }}>
                    <strong>Webhook</strong> 是 Telegram 向你的服务器推送消息的回调地址。设置后，Bot 收到的消息会实时转发到你的博客后端，用于评论审批、回复等功能。需要先保存 Bot Token，再点「设置 Webhook」。
                  </p>
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
                <Toggle
                  label="信任历史访客"
                  description="评论者邮箱或浏览器指纹之前有过通过的评论，自动通过审核"
                  {...register('comment_trust_returning')}
                />
                <Toggle label="评论需要填写邮箱" {...register('comment_require_email')} />
                <Toggle label="新评论邮件通知管理员" {...register('comment_notify_admin')} />

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px', marginTop: '20px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>分页与排序</h4>

                  <div style={{ marginBottom: '16px' }}>
                    <Toggle
                      label="开启评论分页"
                      description="关闭后所有评论一次性展开（移动端友好，适合评论较少的博客）"
                      {...register('comment_pagination')}
                    />
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                    {watch('comment_pagination') && (
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>
                          每页评论数
                          <span className="text-dim" style={{ fontWeight: 400, marginLeft: 6 }}>（仅分页开启时生效）</span>
                        </label>
                        <Input type="number" min={5} max={100} {...register('comment_per_page')} style={{ width: '100%' }} />
                      </div>
                    )}
                    <div style={{ gridColumn: watch('comment_pagination') ? 'auto' : '1 / -1' }}>
                      <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>默认排序</label>
                      <select {...register('comment_order')} className="input text-sm">
                        <option value="newest">最新评论在前</option>
                        <option value="oldest">最早评论在前</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px', marginTop: '20px' }}>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>人机验证</h4>
                  <div>
                    <label className="text-sm text-sub" style={{ display: 'block', marginBottom: '8px' }}>验证方式</label>
                    <div style={{ display: 'flex', gap: '10px' }}>
                      {([
                        { value: 'off', label: '关闭', desc: '不验证' },
                        { value: 'pow', label: 'PoW 验证', desc: '点击计算' },
                        { value: 'image', label: '图片验证码', desc: '输入字符' },
                      ] as const).map(opt => (
                        <label key={opt.value} style={{
                          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px',
                          padding: '12px 8px', borderRadius: 0,
                          border: `1px solid ${watch('comment_captcha_mode') === opt.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                          background: watch('comment_captcha_mode') === opt.value ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : 'transparent',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                          <input type="radio" value={opt.value} {...register('comment_captcha_mode')} style={{ display: 'none' }} />
                          <span style={{ fontSize: '13px', fontWeight: 600, color: watch('comment_captcha_mode') === opt.value ? 'var(--color-primary)' : 'var(--color-text-main)' }}>{opt.label}</span>
                          <span style={{ fontSize: '11px', color: 'var(--color-text-dim)' }}>{opt.desc}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                  {watch('comment_captcha_mode') === 'pow' && (
                    <div style={{ marginTop: '12px' }}>
                      <label className="text-sm text-sub" style={{ display: 'block', marginBottom: '6px' }}>验证难度 (1-6，越大越难)</label>
                      <Input type="number" min={1} max={6} {...register('comment_captcha_difficulty')} style={{ width: '120px' }} />
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ==================== 存储设置 ==================== */}
          {activeTab === 'media' && (
            <>
              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>存储用量</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {(() => {
                    const drivers = storageStats.drivers || {};
                    const local = drivers['local'] || { files: 0, size: 0 };
                    const cloud = drivers['s3'] || drivers['r2'] || { files: 0, size: 0 };
                    const limitBytes = (Number(storageLimitGb) || 10) * 1024 * 1024 * 1024;
                    const localRatio = local.size / limitBytes;
                    const cloudRatio = cloud.size / limitBytes;
                    return (<>
                      {/* Local */}
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                          <span className="text-sm text-sub" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <i className="fa-regular fa-hard-drive" style={{ fontSize: '12px' }} /> 本地存储
                            <span className="text-dim" style={{ fontSize: '12px' }}>({local.files} 个文件)</span>
                          </span>
                          <span className="text-xs text-sub font-mono">{formatSize(local.size)}</span>
                        </div>
                        <div style={{ height: '6px', background: 'var(--color-border)', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(localRatio * 100, 100)}%`, height: '100%', background: localRatio > 0.9 ? '#dc2626' : localRatio > 0.7 ? '#f59e0b' : 'var(--color-primary)', transition: 'width 0.3s ease' }} />
                        </div>
                      </div>
                      {/* Cloud (show when configured or has data) */}
                      {(mediaDriver === 's3' || mediaDriver === 'r2' || cloud.files > 0) && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                            <span className="text-sm text-sub" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                              <i className={mediaDriver === 'r2' ? 'fa-brands fa-cloudflare' : 'fa-brands fa-aws'} style={{ fontSize: '12px' }} />
                              {mediaDriver === 'r2' ? 'Cloudflare R2' : 'AWS S3'}
                              <span className="text-dim" style={{ fontSize: '12px' }}>({cloud.files} 个文件)</span>
                            </span>
                            <span className="text-xs text-sub font-mono">{formatSize(cloud.size)}</span>
                          </div>
                          <div style={{ height: '6px', background: 'var(--color-border)', overflow: 'hidden' }}>
                            <div style={{ width: `${Math.min(cloudRatio * 100, 100)}%`, height: '100%', background: cloudRatio > 0.9 ? '#dc2626' : cloudRatio > 0.7 ? '#f59e0b' : '#f59e0b', transition: 'width 0.3s ease' }} />
                          </div>
                        </div>
                      )}
                    </>);
                  })()}
                </div>
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>存储方式</h3>
                <div style={{ marginBottom: '24px' }}>
                  <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '8px' }}>存储驱动</label>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    {[
                      { value: 'local', label: '本地存储', icon: 'fa-regular fa-hard-drive', desc: '文件保存在服务器本地' },
                      { value: 's3', label: 'AWS S3', icon: 'fa-brands fa-aws', desc: 'Amazon S3 / 兼容存储' },
                      { value: 'r2', label: 'Cloudflare R2', icon: 'fa-brands fa-cloudflare', desc: '零出口费用对象存储' },
                    ].map(d => (
                      <label key={d.value} style={{
                        flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px',
                        padding: '16px 12px', borderRadius: 0,
                        border: `1px solid ${mediaDriver === d.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                        background: mediaDriver === d.value ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : 'transparent',
                        cursor: 'pointer', transition: 'all 0.15s',
                      }}>
                        <input type="radio" value={d.value} {...register('media_driver')} style={{ display: 'none' }} />
                        <i className={d.icon} style={{ fontSize: '22px', color: mediaDriver === d.value ? 'var(--color-primary)' : 'var(--color-text-dim)' }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: mediaDriver === d.value ? 'var(--color-primary)' : 'var(--color-text-main)' }}>{d.label}</span>
                        <span className="text-dim" style={{ fontSize: '11px', textAlign: 'center' }}>{d.desc}</span>
                      </label>
                    ))}
                  </div>
                </div>

                {(mediaDriver === 's3' || mediaDriver === 'r2') && (
                  <div style={{ padding: '24px', border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <i className={mediaDriver === 'r2' ? 'fa-brands fa-cloudflare' : 'fa-brands fa-aws'} style={{ fontSize: '16px', color: 'var(--color-primary)' }} />
                      <h4 style={{ fontSize: '14px', fontWeight: 600, margin: 0 }}>{mediaDriver === 'r2' ? 'Cloudflare R2' : 'AWS S3'} 配置</h4>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Endpoint</label>
                        <input className="input text-sm" {...register('s3_endpoint')} placeholder={mediaDriver === 'r2' ? 'https://<account_id>.r2.cloudflarestorage.com' : 'https://s3.amazonaws.com'} />
                      </div>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Region</label>
                        <input className="input text-sm" {...register('s3_region')} placeholder={mediaDriver === 'r2' ? 'auto' : 'us-east-1'} />
                      </div>
                    </div>

                    <div>
                      <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Bucket</label>
                      <input className="input text-sm" {...register('s3_bucket')} placeholder="my-bucket" style={{ maxWidth: '320px' }} />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Access Key</label>
                        <input className="input text-sm" {...register('s3_access_key')} placeholder="AKIA..." />
                      </div>
                      <div>
                        <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>Secret Key</label>
                        <input className="input text-sm" type="password" {...register('s3_secret_key')} placeholder="••••••••" />
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                        <i className="fa-regular fa-globe" style={{ fontSize: '13px', color: 'var(--color-primary)' }} />
                        <label className="text-sub" style={{ fontSize: '13px', fontWeight: 500 }}>自定义域名 (CDN)</label>
                      </div>
                      <input className="input text-sm" {...register('s3_custom_domain')} placeholder="https://cdn.yourdomain.com" style={{ maxWidth: '400px' }} />
                      <p className="text-dim" style={{ fontSize: '12px', marginTop: '8px', lineHeight: 1.6 }}>
                        绑定自定义域名后，所有文件 URL 将使用此域名访问。
                        {mediaDriver === 'r2' && ' R2 可在 Cloudflare Dashboard 中绑定自定义域名。'}
                        {mediaDriver === 's3' && ' 建议配合 CloudFront 或其他 CDN 使用。'}
                        留空则使用 Bucket 原始地址。
                      </p>
                    </div>

                    <div style={{ borderTop: '1px solid var(--color-border)', paddingTop: '20px' }}>
                      <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>空间容量限制 (GB)</label>
                      <input className="input text-sm" type="number" min={1} {...register('storage_limit_gb')} placeholder="10" style={{ width: '160px' }} />
                      <p className="text-xs text-dim" style={{ marginTop: '4px' }}>超过此容量将不允许继续上传</p>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', paddingTop: '4px' }}>
                      <button type="button" className="btn btn-secondary text-sm" onClick={testStorageConnection} disabled={testingStorage} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                        <i className={testingStorage ? 'fa-solid fa-spinner fa-spin' : 'fa-regular fa-plug'} style={{ fontSize: '13px' }} />
                        {testingStorage ? '测试中...' : '测试连接'}
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="card" style={cardStyle}>
                <h3 style={sectionTitleStyle}>分类存储路由</h3>
                <p className="text-dim" style={{ fontSize: '12px', marginBottom: '20px', lineHeight: 1.7 }}>
                  为每个上传分类单独指定存储位置。选择「云端」时，该分类的文件将上传至已配置的 S3/R2；选择「本地」时始终保存在服务器本地。「跟随全局」使用上方存储方式设置。
                </p>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  {[
                    { key: 'folder_driver_covers', label: '文章封面', icon: 'fa-regular fa-image' },
                    { key: 'folder_driver_books', label: '书单封面', icon: 'fa-regular fa-book' },
                    { key: 'folder_driver_movies', label: '影视封面', icon: 'fa-regular fa-film' },
                    { key: 'folder_driver_music', label: '音乐封面', icon: 'fa-regular fa-music' },
                    { key: 'folder_driver_links', label: '友链头像', icon: 'fa-regular fa-link' },
                    { key: 'folder_driver_moments', label: '动态图片', icon: 'fa-regular fa-bolt' },
                    { key: 'folder_driver_albums', label: '相册图片', icon: 'fa-regular fa-images' },
                    { key: 'folder_driver_avatars', label: '用户头像', icon: 'fa-regular fa-user' },
                  ].map(({ key, label, icon }) => (
                    <div key={key} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', border: '1px solid var(--color-border)', background: 'var(--color-bg-soft)' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}>
                        <i className={icon} style={{ fontSize: '13px', color: 'var(--color-text-dim)', width: '14px' }} />
                        {label}
                      </span>
                      <select className="input text-sm" {...register(key)} style={{ width: '100px', padding: '3px 8px', fontSize: '12px' }}>
                        <option value="">跟随全局</option>
                        <option value="local">本地</option>
                        <option value="cloud">云端</option>
                      </select>
                    </div>
                  ))}
                </div>
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
                <ImgEtBuilder register={register} watch={watch} setValue={setValue} />
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
                            padding: '12px 10px', textAlign: 'center', borderRadius: 0,
                            border: `1px solid ${val === effect.value ? 'var(--color-primary)' : 'var(--color-border)'}`,
                            background: val === effect.value ? 'color-mix(in srgb, var(--color-primary) 5%, transparent)' : 'transparent',
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

          {/* ==================== 系统更新 ==================== */}
          {activeTab === 'update' && (
            <div>
              <div style={sectionTitleStyle as React.CSSProperties}>
                <i className="fa-solid fa-cloud-arrow-down" style={{ marginRight: 8, color: 'var(--color-primary)' }} />
                系统更新
              </div>
              <p className="text-dim" style={{ fontSize: 13, lineHeight: 1.7, marginBottom: 20 }}>
                Utterlog 通过 GitHub Releases 推送新版本。下方会实时比对你当前运行的版本和最新发布；
                有新版本时点「一键升级」即可。升级过程保留所有数据、配置和用户上传。
              </p>
              <SystemUpdatePanel />
              <div style={{ marginTop: 24, padding: '14px 18px', background: 'var(--color-bg-soft, #fafafa)', border: '1px solid var(--color-border)', fontSize: 12, color: 'var(--color-text-dim)', lineHeight: 1.8 }}>
                <div style={{ fontWeight: 600, color: 'var(--color-text)', marginBottom: 4 }}>
                  <i className="fa-regular fa-circle-info" style={{ marginRight: 6 }} />
                  其它升级方式
                </div>
                · 命令行：<code style={{ fontFamily: 'ui-monospace,monospace', fontSize: 11, background: 'var(--color-bg-card, #fff)', padding: '1px 5px', border: '1px solid var(--color-border)' }}>curl -fsSL https://utterlog.io/update.sh | bash</code>
                <br />
                · 历史版本：<a href="https://utterlog.io/changelog" target="_blank" rel="noopener" style={{ color: 'var(--color-primary)' }}>utterlog.io/changelog</a>
                <br />
                · 文档：<a href="https://docs.utterlog.io/update/" target="_blank" rel="noopener" style={{ color: 'var(--color-primary)' }}>docs.utterlog.io/update</a>
              </div>
            </div>
          )}

          {/* Save button — only shows on editable tabs (not read-only "update" tab) */}
          {activeTab !== 'update' && (
            <div style={{ paddingTop: '24px', borderTop: '1px solid var(--color-border)', marginTop: '8px', display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={handleSubmit(onSubmit)} loading={saving}>
                <i className="fa-regular fa-floppy-disk" style={{ fontSize: '14px' }} />
                保存设置
              </Button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}

// ================== img.et Random Image Builder ==================
// Visual builder for https://img.et/<w>/<h>?type=...&r=...&s=...&format=...
// Writes result URL to the `random_image_api` form field.
function ImgEtBuilder({ register, watch, setValue }: { register: any; watch: any; setValue: any }) {
  const currentUrl: string = watch('random_image_api') || '';

  // Local builder state — persisted into the URL on change
  const parsed = (() => {
    try {
      if (currentUrl.startsWith('https://img.et/') || currentUrl.startsWith('http://img.et/')) {
        const u = new URL(currentUrl);
        const m = u.pathname.match(/^\/(\d+)\/(\d+)\/?$/);
        return {
          width: m?.[1] || '1920',
          height: m?.[2] || '1080',
          type: u.searchParams.get('type') || '',
          r: u.searchParams.get('r') || '',
          s: u.searchParams.get('s') || '',
          format: u.searchParams.get('format') || 'webp',
          isImgEt: true,
        };
      }
    } catch {}
    return { width: '1920', height: '1080', type: 'banner', r: '', s: '', format: 'webp', isImgEt: false };
  })();

  const buildURL = (w: string, h: string, type: string, r: string, s: string, format: string) => {
    const q = new URLSearchParams();
    if (type) q.set('type', type);
    if (r) q.set('r', r);
    if (s) q.set('s', s);
    if (format) q.set('format', format);
    const qs = q.toString();
    return `https://img.et/${w}/${h}${qs ? '?' + qs : ''}`;
  };

  const update = (patch: Partial<typeof parsed>) => {
    const next = { ...parsed, ...patch };
    const url = buildURL(next.width, next.height, next.type, next.r, next.s, next.format);
    setValue('random_image_api', url, { shouldDirty: true });
  };

  const typeOptions = [
    { value: '', label: '任意 / 随机' },
    { value: 'banner', label: 'banner — 通用横幅、默认头图' },
    { value: 'landscape', label: 'landscape — 风景、山水、自然场景' },
    { value: 'beauty', label: 'beauty — 人物、人像、美图' },
    { value: 'anime', label: 'anime — 动漫、插画、二次元' },
    { value: 'city', label: 'city — 城市、建筑、街景' },
    { value: 'nature', label: 'nature — 森林、海洋、天空、植物' },
    { value: 'car', label: 'car — 汽车、机车、赛道' },
    { value: 'game', label: 'game — 游戏、电竞、虚拟场景' },
    { value: 'food', label: 'food — 美食、甜点、饮品' },
    { value: 'animal', label: 'animal — 动物、萌宠、野生生态' },
    { value: 'travel', label: 'travel — 旅行、目的地、度假' },
    { value: 'space', label: 'space — 星空、宇宙、科幻' },
    { value: 'tech', label: 'tech — 科技、数码、未来感' },
    { value: 'business', label: 'business — 商务、办公、团队' },
    { value: 'sports', label: 'sports — 运动、健身、赛事' },
    { value: 'architecture', label: 'architecture — 建筑、室内、空间设计' },
  ];

  const formatOptions = [
    { value: 'webp', label: 'WebP（推荐，体积小）' },
    { value: 'avif', label: 'AVIF（更小，新浏览器）' },
    { value: 'jpg', label: 'JPEG（兼容性好）' },
    { value: 'png', label: 'PNG（有损压缩）' },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Service preset selector */}
      <div>
        <label className="text-sub" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>服务</label>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => update({})}
            style={{
              padding: '6px 14px', fontSize: 12, fontWeight: 500,
              background: parsed.isImgEt ? 'var(--color-primary)' : 'var(--color-bg-card)',
              color: parsed.isImgEt ? '#fff' : 'var(--color-text-main)',
              border: `1px solid ${parsed.isImgEt ? 'var(--color-primary)' : 'var(--color-border)'}`,
              cursor: 'pointer',
            }}
          >
            img.et （推荐）
          </button>
          <span className="text-dim" style={{ fontSize: 11, alignSelf: 'center', marginLeft: 4 }}>
            或在下方直接填自定义 URL
          </span>
        </div>
      </div>

      {/* Params grid (only enabled when img.et is selected) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
        <div>
          <label className="text-sub" style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>宽度 (px)</label>
          <input
            type="number"
            value={parsed.width}
            onChange={(e) => update({ width: e.target.value })}
            className="input text-sm"
            min={100}
            max={4096}
          />
        </div>
        <div>
          <label className="text-sub" style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>高度 (px)</label>
          <input
            type="number"
            value={parsed.height}
            onChange={(e) => update({ height: e.target.value })}
            className="input text-sm"
            min={100}
            max={4096}
          />
        </div>
        <div>
          <label className="text-sub" style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>输出格式 format</label>
          <select
            value={parsed.format}
            onChange={(e) => update({ format: e.target.value })}
            className="input text-sm"
          >
            {formatOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>

        <div>
          <label className="text-sub" style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>类型 type</label>
          <select
            value={parsed.type}
            onChange={(e) => update({ type: e.target.value })}
            className="input text-sm"
          >
            {typeOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label className="text-sub" style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            固定 r
            <span className="text-dim" style={{ fontWeight: 400, marginLeft: 4 }}>（按规则锁定图片）</span>
          </label>
          <input
            type="text"
            value={parsed.r}
            onChange={(e) => update({ r: e.target.value })}
            className="input text-sm"
            placeholder="留空"
          />
        </div>
        <div>
          <label className="text-sub" style={{ display: 'block', fontSize: 12, fontWeight: 500, marginBottom: 4 }}>
            多图位置 s
            <span className="text-dim" style={{ fontWeight: 400, marginLeft: 4 }}>（0/1/2/...）</span>
          </label>
          <input
            type="text"
            value={parsed.s}
            onChange={(e) => update({ s: e.target.value })}
            className="input text-sm"
            placeholder="留空"
          />
        </div>
      </div>

      {/* Raw URL input + preview */}
      <div>
        <label className="text-sub" style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
          最终 API 地址
          <span className="text-dim" style={{ fontWeight: 400, marginLeft: 6, fontSize: 11 }}>
            （可直接编辑；改上方参数会覆盖）
          </span>
        </label>
        <input
          className="input text-sm"
          {...register('random_image_api')}
          placeholder="https://img.et/1920/1080?type=landscape&format=webp"
          style={{ fontFamily: 'ui-monospace, monospace', fontSize: 12 }}
        />
      </div>

      {/* Preview */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <label className="text-sub" style={{ fontSize: 13, fontWeight: 500 }}>预览</label>
          <button
            type="button"
            onClick={() => setValue('random_image_api', currentUrl + (currentUrl.includes('?') ? '&' : '?') + '_=' + Date.now(), { shouldDirty: true })}
            className="text-dim"
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
            title="刷新预览"
          >
            <i className="fa-regular fa-arrows-rotate" style={{ fontSize: 11 }} /> 换一张
          </button>
        </div>
        {currentUrl ? (
          <div style={{
            width: '100%', aspectRatio: parsed.width && parsed.height ? `${parsed.width} / ${parsed.height}` : '16 / 9',
            maxHeight: 280, overflow: 'hidden',
            background: 'var(--color-bg-soft)',
            border: '1px solid var(--color-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <img
              src={currentUrl}
              alt="preview"
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => { (e.currentTarget.parentElement!.innerHTML = '<span style="color: var(--color-text-dim); font-size: 12px">图片加载失败，请检查 URL 或参数</span>'); }}
            />
          </div>
        ) : (
          <div className="text-dim" style={{ padding: 40, textAlign: 'center', fontSize: 12, background: 'var(--color-bg-soft)', border: '1px dashed var(--color-border)' }}>
            填入参数后会显示预览
          </div>
        )}
      </div>

      <p className="text-xs text-dim" style={{ lineHeight: 1.7 }}>
        <i className="fa-regular fa-lightbulb" style={{ marginRight: 6, color: 'var(--color-primary)' }} />
        <strong>用法示例</strong>：
        <code style={{ background: 'var(--color-bg-soft)', padding: '1px 5px', margin: '0 4px', fontSize: 11 }}>
          https://img.et/1920/1080?type=landscape&format=webp
        </code>
        现代浏览器默认用 <strong>webp</strong>；Safari 17+ / Chrome 100+ 可选 <strong>avif</strong> 体积更小。更多详细用法可访问{' '}
        <a
          href="https://img.et"
          target="_blank"
          rel="noopener noreferrer"
          style={{ color: 'var(--color-primary)', textDecoration: 'none', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 3 }}
        >
          img.et
          <i className="fa-regular fa-up-right-from-square" style={{ fontSize: 10 }} />
        </a>
        。
      </p>
    </div>
  );
}
