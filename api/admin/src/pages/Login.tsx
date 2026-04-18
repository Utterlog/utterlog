import { useState, useEffect } from 'react';
import { useAuthStore } from '@/lib/store';
import { authApi } from '@/lib/api';
import toast from 'react-hot-toast';

function base64urlToBuffer(b64: string): ArrayBuffer {
  const base64 = b64.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4 === 0 ? '' : '='.repeat(4 - (base64.length % 4));
  const bin = atob(base64 + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export default function Login() {
  const { login, validate2FA, cancel2FA, setAuth } = useAuthStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [totpCode, setTotpCode] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [needTotp, setNeedTotp] = useState(false);

  // Passkey — show button only if browser supports WebAuthn AND the server
  // has at least one passkey registered (otherwise the option is dead).
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [showPasskey, setShowPasskey] = useState(false);
  useEffect(() => {
    if (!window.PublicKeyCredential) return;
    authApi.passkeyAvailable()
      .then((res: any) => { if (res?.data?.available) setShowPasskey(true); })
      .catch(() => { /* silent — just hide the button */ });
  }, []);

  // Forgot password modal (stub — backend endpoint not wired yet)
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      toast.error('请输入邮箱和密码');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
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
      // Delay redirect so the toast is actually visible before navigation wipes it
      setTimeout(() => { window.location.href = '/admin/'; }, 800);
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
      // Delay redirect so the toast is actually visible before navigation wipes it
      setTimeout(() => { window.location.href = '/admin/'; }, 800);
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

  const handlePasskeyLogin = async () => {
    setPasskeyLoading(true);
    try {
      const beginRes: any = await authApi.passkeyLoginBegin();
      const resData = beginRes.data;
      const sessionId = resData.session_id;
      const options = resData.publicKey;

      options.challenge = base64urlToBuffer(options.challenge);
      if (options.allowCredentials) {
        options.allowCredentials = options.allowCredentials.map((c: any) => ({
          ...c, id: base64urlToBuffer(c.id),
        }));
      }

      const credential = await navigator.credentials.get({ publicKey: options }) as PublicKeyCredential;
      if (!credential) throw new Error('认证取消');

      const assertion = credential.response as AuthenticatorAssertionResponse;
      const response: any = await authApi.passkeyLoginFinish({
        id: credential.id,
        rawId: bufferToBase64url(credential.rawId),
        type: credential.type,
        response: {
          authenticatorData: bufferToBase64url(assertion.authenticatorData),
          clientDataJSON: bufferToBase64url(assertion.clientDataJSON),
          signature: bufferToBase64url(assertion.signature),
          userHandle: assertion.userHandle ? bufferToBase64url(assertion.userHandle) : undefined,
        },
      }, sessionId);

      const { user, access_token, refresh_token } = response.data;
      setAuth(user, access_token, refresh_token);
      toast.success('登录成功');
      // Delay redirect so the toast is actually visible before navigation wipes it
      setTimeout(() => { window.location.href = '/admin/'; }, 800);
    } catch (err: any) {
      const msg = err?.response?.data?.error?.message || err?.message || '通行密钥验证失败';
      if (!msg.includes('取消')) toast.error(msg);
    } finally {
      setPasskeyLoading(false);
    }
  };

  const handleForgotSubmit = async () => {
    if (!forgotEmail) return;
    setForgotSending(true);
    try {
      // TODO: backend endpoint not implemented — simulated success for now
      await new Promise((r) => setTimeout(r, 800));
      setForgotSent(true);
    } catch {
      toast.error('发送失败');
    }
    setForgotSending(false);
  };

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: 'var(--color-bg-main)', padding: 24,
    }}>
      <form
        onSubmit={needTotp ? handle2FA : handleSubmit}
        className="login-form"
        style={{
          width: '100%', maxWidth: 380, background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border)', borderRadius: 0, padding: '32px 28px',
        }}
      >
        <div style={{ textAlign: 'center', marginBottom: 28 }}>
          <svg
            width="64" height="64" viewBox="0 0 24 24"
            className="login-logo"
            style={{ margin: '0 auto', display: 'block' }}
          >
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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <label style={{ fontSize: 13, fontWeight: 500 }}>密码</label>
                <button
                  type="button"
                  tabIndex={-1}
                  onClick={() => setShowForgot(true)}
                  style={{ fontSize: 12, color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  找回密码
                </button>
              </div>
              <input
                type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                className="input"
              />
            </div>

            <button type="submit" className="btn btn-primary" disabled={submitting} style={{ width: '100%' }}>
              {submitting ? '登录中...' : '登录'}
            </button>

            {showPasskey && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '20px 0 16px' }}>
                  <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                  <span style={{ fontSize: 11, color: 'var(--color-text-dim)' }}>或</span>
                  <div style={{ flex: 1, height: 1, background: 'var(--color-border)' }} />
                </div>
                <button
                  type="button"
                  onClick={handlePasskeyLogin}
                  disabled={passkeyLoading}
                  className="btn btn-secondary"
                  style={{ width: '100%', gap: 8 }}
                >
                  <i className="fa-light fa-fingerprint" style={{ fontSize: 16 }} />
                  {passkeyLoading ? '验证中...' : '使用通行密钥登录'}
                </button>
              </>
            )}
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
                style={{ flex: 1 }}
              >
                返回
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting} style={{ flex: 2 }}>
                {submitting ? '验证中...' : '验证'}
              </button>
            </div>
          </>
        )}
      </form>

      {showForgot && (
        <>
          <div
            onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }}
          />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 51, width: 380, maxWidth: '90vw',
            background: 'var(--color-bg-card)', borderRadius: 0,
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)', padding: 28,
          }}>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 6 }}>找回密码</h2>
            <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginBottom: 20 }}>
              输入管理员邮箱，系统将发送密码重置链接
            </p>

            {forgotSent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: 32, marginBottom: 12 }}>
                  <i className="fa-light fa-envelope-open-text" style={{ color: 'var(--color-primary)' }} />
                </div>
                <p style={{ fontSize: 14, fontWeight: 500 }}>重置链接已发送</p>
                <p style={{ fontSize: 12, color: 'var(--color-text-dim)', marginTop: 6 }}>
                  请检查 {forgotEmail} 的收件箱
                </p>
                <button
                  onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); }}
                  className="btn btn-primary"
                  style={{ marginTop: 16, width: '100%' }}
                >
                  返回登录
                </button>
              </div>
            ) : (
              <>
                <input
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  type="email"
                  placeholder="管理员邮箱"
                  className="input"
                  style={{ marginBottom: 16 }}
                />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    onClick={() => { setShowForgot(false); setForgotEmail(''); }}
                    className="btn btn-secondary"
                    style={{ flex: 1 }}
                  >
                    取消
                  </button>
                  <button
                    type="button"
                    disabled={forgotSending || !forgotEmail}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={handleForgotSubmit}
                  >
                    {forgotSending ? '发送中...' : '发送重置链接'}
                  </button>
                </div>
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
