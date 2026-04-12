'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuthStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { Button, Input, Modal } from '@/components/ui';
import { Save } from '@/components/icons';
import api from '@/lib/api';
import { useForm } from 'react-hook-form';

export default function ProfilePage() {
  const { user } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState('');
  const [gravatarUrl, setGravatarUrl] = useState('');
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Original values for detecting changes
  const [origEmail, setOrigEmail] = useState('');
  const [origUsername, setOrigUsername] = useState('');

  // Verification dialog
  const [showVerify, setShowVerify] = useState(false);
  const [verifyPassword, setVerifyPassword] = useState('');
  const [verifyCode, setVerifyCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [pendingData, setPendingData] = useState<any>(null);

  const { register, handleSubmit, reset, getValues } = useForm({
    defaultValues: { nickname: '', email: '', username: '', bio: '', url: '' },
  });

  const { register: registerPw, handleSubmit: handlePwSubmit, reset: resetPw } = useForm({
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  });

  // Fetch profile
  useEffect(() => {
    api.get('/profile').then((r: any) => {
      const d = r.data || r;
      reset({
        nickname: d.nickname || '',
        email: d.email || '',
        username: d.username || '',
        bio: d.bio || '',
        url: d.url || '',
      });
      setOrigEmail(d.email || '');
      setOrigUsername(d.username || '');
      if (d.gravatar_url) setGravatarUrl(d.gravatar_url);
      if (d.avatar) setAvatarUrl(d.avatar);
    }).catch(() => {});
  }, []);

  // Countdown timer
  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const onSaveProfile = async (data: any) => {
    const emailChanged = data.email !== origEmail;
    const usernameChanged = data.username !== origUsername;

    if (emailChanged || usernameChanged) {
      // Need verification
      setPendingData(data);
      setShowVerify(true);
      setVerifyPassword('');
      setVerifyCode('');
      setCodeSent(false);
      return;
    }

    // No sensitive change, save directly
    setSaving(true);
    try {
      await api.put('/profile', { ...data, avatar: avatarUrl || undefined });
      toast.success('资料已保存');
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  const handleSendCode = async () => {
    setSendingCode(true);
    try {
      const r: any = await api.post('/profile/send-code');
      toast.success(r.data?.message || r.message || '验证码已发送');
      setCodeSent(true);
      setCountdown(60);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.error?.message || '发送失败';
      toast.error(msg);
    }
    finally { setSendingCode(false); }
  };

  const handleVerifyAndSave = async () => {
    if (!verifyPassword) { toast.error('请输入当前密码'); return; }
    if (!verifyCode) { toast.error('请输入验证码'); return; }

    setSaving(true);
    try {
      await api.put('/profile', {
        ...pendingData,
        avatar: avatarUrl || undefined,
        password: verifyPassword,
        verify_code: verifyCode,
      });
      toast.success('资料已保存');
      setOrigEmail(pendingData.email);
      setOrigUsername(pendingData.username);
      setShowVerify(false);
      setPendingData(null);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.error?.message || '保存失败';
      toast.error(msg);
    }
    finally { setSaving(false); }
  };

  const onChangePassword = async (data: any) => {
    if (data.new_password !== data.confirm_password) { toast.error('两次密码不一致'); return; }
    setChangingPassword(true);
    try {
      await api.put('/auth/password', {
        current_password: data.current_password,
        new_password: data.new_password,
      });
      toast.success('密码已修改');
      resetPw();
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.error?.message || '修改失败';
      toast.error(msg);
    }
    finally { setChangingPassword(false); }
  };

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) { toast.error('请选择图片文件'); return; }
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r: any = await api.post('/media/upload', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const url = r.data?.url || r.url;
      if (url) {
        setAvatarUrl(url);
        await api.put('/profile', { avatar: url });
        toast.success('头像已更新');
      }
    } catch { toast.error('上传失败'); }
    finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  };

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Profile Info */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>基本信息</h2>

          {/* Avatar */}
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '20px', marginBottom: '20px' }}>
            <div style={{ textAlign: 'center' }}>
              <div style={{ width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden', background: 'var(--color-bg-soft)', border: '2px solid var(--color-border)' }}>
                {gravatarUrl && <img src={gravatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
              </div>
              <span className="text-dim" style={{ fontSize: '10px', marginTop: '4px', display: 'block' }}>Gravatar</span>
            </div>
            <div style={{ textAlign: 'center' }}>
              <div
                style={{ width: '72px', height: '72px', borderRadius: '50%', overflow: 'hidden', background: 'var(--color-bg-soft)', border: avatarUrl ? '2px solid var(--color-primary)' : '2px dashed var(--color-border)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}
                onClick={() => fileRef.current?.click()}
              >
                {avatarUrl ? (
                  <img src={avatarUrl} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--color-text-dim)" strokeWidth="1.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                )}
              </div>
              <span className="text-dim" style={{ fontSize: '10px', marginTop: '4px', display: 'block' }}>{avatarUrl ? '自定义' : '上传'}</span>
            </div>
            <div style={{ flex: 1, paddingTop: '8px' }}>
              <input ref={fileRef} type="file" accept="image/*" onChange={handleAvatarUpload} style={{ display: 'none' }} />
              <p className="text-dim" style={{ fontSize: '11px', lineHeight: 1.8 }}>
                Gravatar 头像在所有支持的网站通用，建议前往 <a href="https://gravatar.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>Gravatar</a> 注册设置。国内可使用 <a href="https://weavatar.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>Weavatar</a> 或 <a href="https://cnavatar.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--color-primary)' }}>Cnavatar</a>（三路回源）。
              </p>
              <p className="text-dim" style={{ fontSize: '11px', lineHeight: 1.8, marginTop: '4px' }}>
                自定义头像仅在 Utterlog 相关站点和用户站点间显示。
              </p>
            </div>
          </div>

          <form onSubmit={handleSubmit(onSaveProfile)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input label="登录账号" {...register('username')} />
            <Input label="邮箱" type="email" {...register('email')} />
            <Input label="昵称" {...register('nickname')} />
            <Input label="个人网站" placeholder="https://" {...register('url')} />
            <div>
              <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>简介</label>
              <textarea rows={3} className="input focus-ring" {...register('bio')} placeholder="介绍一下自己..." />
            </div>
            <p className="text-dim" style={{ fontSize: '11px' }}>
              修改登录账号或邮箱需要验证当前密码和邮箱验证码
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" loading={saving}><Save size={16} />保存</Button>
            </div>
          </form>
        </div>

        {/* Change Password */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>修改密码</h2>
          <form onSubmit={handlePwSubmit(onChangePassword)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input label="当前密码" type="password" {...registerPw('current_password')} />
            <Input label="新密码" type="password" {...registerPw('new_password')} />
            <Input label="确认新密码" type="password" {...registerPw('confirm_password')} />
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button type="submit" loading={changingPassword}>修改密码</Button>
            </div>
          </form>
        </div>
      </div>

      {/* Verification Dialog */}
      <Modal isOpen={showVerify} onClose={() => setShowVerify(false)} title="安全验证" size="sm">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <p className="text-sub" style={{ fontSize: '13px' }}>
            修改登录账号或邮箱需要验证身份，验证码将发送到当前邮箱。
          </p>
          <Input label="当前密码" type="password" value={verifyPassword} onChange={(e: any) => setVerifyPassword(e.target.value)} />
          <div>
            <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>邮箱验证码</label>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input
                value={verifyCode}
                onChange={e => setVerifyCode(e.target.value)}
                placeholder="6 位验证码"
                className="input"
                style={{ flex: 1 }}
                maxLength={6}
              />
              <Button
                variant="secondary"
                onClick={handleSendCode}
                disabled={sendingCode || countdown > 0}
                style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
              >
                {countdown > 0 ? `${countdown}s` : codeSent ? '重新发送' : '发送验证码'}
              </Button>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <Button variant="secondary" onClick={() => setShowVerify(false)}>取消</Button>
            <Button onClick={handleVerifyAndSave} loading={saving}>确认修改</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
