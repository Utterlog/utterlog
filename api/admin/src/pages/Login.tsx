import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import toast from 'react-hot-toast';

export default function Login() {
  const { login, validate2FA, cancel2FA } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Local mirror of pending2FA so UI reacts immediately
  const [needTotp, setNeedTotp] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error('请输入邮箱和密码');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // login() returns silently when 2FA is required — check the store
      const { pending2FA, accessToken } = useAuthStore.getState();
      if (pending2FA) {
        setNeedTotp(true);
        setSubmitting(false);
        toast('请输入动态验证码', { icon: 'i' });
        return;
      }
      if (!accessToken) {
        toast.error('登录异常，请重试');
        setSubmitting(false);
        return;
      }
      toast.success('登录成功');
      window.location.href = '/admin/';
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || '登录失败');
      setSubmitting(false);
    }
  };

  const handle2FA = async (e: React.FormEvent) => {
    e.preventDefault();
    const code = totpCode.trim();
    if (code.length < 6) {
      toast.error('请输入 6 位验证码');
      return;
    }
    setSubmitting(true);
    try {
      await validate2FA(code);
      toast.success('登录成功');
      window.location.href = '/admin/';
    } catch (err: any) {
      toast.error(err?.response?.data?.error?.message || '验证码错误');
      setSubmitting(false);
      setTotpCode('');
    }
  };

  const handleBack = () => {
    cancel2FA();
    setNeedTotp(false);
    setTotpCode('');
    setSubmitting(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg-main)', padding: 24,
    }}>
      <form
        onSubmit={needTotp ? handle2FA : handleSubmit}
        style={{
          width: '100%', maxWidth: 380, background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)', padding: '32px 28px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <svg width="40" height="40" viewBox="0 0 24 24" style={{ margin: '0 auto' }}>
            <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="var(--color-primary)" />
            <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
          </svg>
          <h1 style={{ fontSize: 18, fontWeight: 700, margin: '12px 0 4px' }}>Utterlog</h1>
          <p style={{ fontSize: 12, color: 'var(--color-text-dim)', margin: 0 }}>
            {needTotp ? '请输入动态验证码' : '管理后台登录'}
          </p>
        </div>

        {!needTotp ? (
          <>
            <div style={{ marginBottom: 16 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>邮箱</label>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className="input" placeholder="you@example.com" autoFocus
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>密码</label>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </div>

            <button type="submit" className="btn" disabled={submitting} style={{ width: '100%', justifyContent: 'center' }}>
              {submitting ? '登录中...' : '登录'}
            </button>
          </>
        ) : (
          <>
            <div style={{ marginBottom: 24 }}>
              <label style={{ display: 'block', fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                6 位验证码
                <span style={{ fontSize: 11, fontWeight: 400, color: 'var(--color-text-dim)', marginLeft: 6 }}>
                  （Authenticator App 生成）
                </span>
              </label>
              <input
                type="text" inputMode="numeric" pattern="[0-9]*" maxLength={8}
                value={totpCode}
                onChange={(e) => setTotpCode(e.target.value.replace(/\D/g, ''))}
                className="input"
                placeholder="000000"
                autoFocus
                style={{
                  textAlign: 'center', fontSize: 20, letterSpacing: 6,
                  fontFamily: 'ui-monospace, monospace',
                }}
              />
              <p style={{ fontSize: 11, color: 'var(--color-text-dim)', marginTop: 6, margin: '6px 0 0' }}>
                没有 App？使用 8 位备用恢复码
              </p>
            </div>

            <div style={{ display: 'flex', gap: 8 }}>
              <button
                type="button"
                onClick={handleBack}
                className="btn btn-secondary"
                style={{ flex: 1, justifyContent: 'center' }}
              >
                返回
              </button>
              <button type="submit" className="btn" disabled={submitting} style={{ flex: 2, justifyContent: 'center' }}>
                {submitting ? '验证中...' : '验证'}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}
