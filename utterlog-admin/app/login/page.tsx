'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { toast } from 'react-hot-toast';
import { Spinner } from '@/components/icons';
import { authApi } from '@/lib/api';
import { useAuthStore } from '@/lib/store';

const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱'),
  password: z.string().min(6, '密码至少6位'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [showForgot, setShowForgot] = useState(false);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotSending, setForgotSending] = useState(false);
  const [forgotSent, setForgotSent] = useState(false);
  const setAuth = useAuthStore((state) => state.setAuth);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    setIsLoading(true);
    try {
      const response: any = await authApi.login(data.email, data.password);
      const { user, access_token, refresh_token } = response.data;
      setAuth(user, access_token, refresh_token);
      toast.success('登录成功');
      router.push('/dashboard');
    } catch (error: any) {
      toast.error(error?.response?.data?.error?.message || '登录失败');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-main" style={{ padding: '24px' }}>
      <div className="w-full" style={{ maxWidth: '420px' }}>
        {/* Logo + Brand — horizontal centered */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '40px', justifyContent: 'center' }}>
          <div
            className="flex items-center justify-center flex-shrink-0"
            style={{ width: '56px', height: '56px' }}
          >
            <svg width="56" height="56" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              {/* Squircle background */}
              <path d="M12 0c9.601 0 12 2.399 12 12 0 9.601-2.399 12-12 12-9.601 0-12-2.399-12-12C0 2.399 2.399 0 12 0z" fill="var(--color-primary)" />
              {/* Chat bubble icon inside squircle */}
              <path d="M17.008 17.29H11.44a5.57 5.57 0 0 1-5.562-5.567A5.57 5.57 0 0 1 11.44 6.16a5.57 5.57 0 0 1 5.567 5.563Z" fill="white" />
            </svg>
          </div>
          <div>
            <h1 className="font-logo text-main" style={{ fontSize: '24px', letterSpacing: '0.02em' }}>Utterlog!</h1>
            <p className="text-dim" style={{ fontSize: '14px', marginTop: '2px' }}>登录管理后台</p>
          </div>
        </div>

        {/* Form Card */}
        <div style={{ maxWidth: '380px', width: '100%', background: '#fff', border: '1px solid var(--color-border)', borderRadius: '4px', padding: '40px 32px', boxShadow: '0 10px 40px -10px rgba(0,0,0,0.05)' }}>
          <form onSubmit={handleSubmit(onSubmit)}>
            {/* Email */}
            <div style={{ marginBottom: '24px' }}>
              <label htmlFor="email" className="text-main block" style={{ fontSize: '14px', fontWeight: 500, marginBottom: '8px' }}>
                邮箱
              </label>
              <input
                {...register('email')}
                id="email"
                type="email"
                autoComplete="email"
                className="input focus-ring"
                placeholder="name@example.com"
                style={{ height: '44px', fontSize: '14px' }}
              />
              {errors.email && (
                <p className="text-red-500" style={{ fontSize: '13px', marginTop: '6px' }}>{errors.email.message}</p>
              )}
            </div>

            {/* Password */}
            <div style={{ marginBottom: '28px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                <label htmlFor="password" className="text-main" style={{ fontSize: '14px', fontWeight: 500 }}>
                  密码
                </label>
                <button type="button" onClick={() => setShowForgot(true)} className="text-primary-themed" style={{ fontSize: '13px', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  找回密码
                </button>
              </div>
              <input
                {...register('password')}
                id="password"
                type="password"
                autoComplete="current-password"
                className="input focus-ring"
                placeholder="输入密码"
                style={{ height: '44px', fontSize: '14px' }}
              />
              {errors.password && (
                <p className="text-red-500" style={{ fontSize: '13px', marginTop: '6px' }}>{errors.password.message}</p>
              )}
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary w-full"
              style={{ height: '44px', fontSize: '15px' }}
            >
              {isLoading ? (
                <>
                  <Spinner size={18} />
                  登录中...
                </>
              ) : (
                '登录'
              )}
            </button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-dim" style={{ fontSize: '12px', marginTop: '32px' }}>
          &copy; {new Date().getFullYear()} <a href="https://utterlog.io" target="_blank" style={{ color: 'inherit', textDecoration: 'none' }}>Utterlog!</a>
        </p>
      </div>

      {/* Forgot password modal */}
      {showForgot && (
        <>
          <div onClick={() => setShowForgot(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.3)', zIndex: 50 }} />
          <div style={{
            position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
            zIndex: 51, width: '380px', maxWidth: '90vw',
            background: 'var(--color-bg-card)', borderRadius: '8px',
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)', padding: '28px',
          }}>
            <h2 className="text-main" style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>找回密码</h2>
            <p className="text-dim" style={{ fontSize: '13px', marginBottom: '20px' }}>输入管理员邮箱，系统将发送密码重置链接</p>

            {forgotSent ? (
              <div style={{ textAlign: 'center', padding: '16px 0' }}>
                <div style={{ fontSize: '32px', marginBottom: '12px' }}>✉️</div>
                <p className="text-main" style={{ fontSize: '14px', fontWeight: 500 }}>重置链接已发送</p>
                <p className="text-dim" style={{ fontSize: '13px', marginTop: '6px' }}>请检查 {forgotEmail} 的收件箱</p>
                <button onClick={() => { setShowForgot(false); setForgotSent(false); setForgotEmail(''); }} className="btn btn-primary" style={{ marginTop: '16px', width: '100%' }}>
                  返回登录
                </button>
              </div>
            ) : (
              <>
                <input
                  value={forgotEmail}
                  onChange={e => setForgotEmail(e.target.value)}
                  type="email"
                  placeholder="管理员邮箱"
                  className="input focus-ring"
                  style={{ height: '44px', fontSize: '14px', marginBottom: '16px' }}
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => setShowForgot(false)} className="btn btn-secondary" style={{ flex: 1 }}>取消</button>
                  <button
                    type="button"
                    disabled={forgotSending || !forgotEmail}
                    className="btn btn-primary"
                    style={{ flex: 1 }}
                    onClick={async () => {
                      if (!forgotEmail) return;
                      setForgotSending(true);
                      try {
                        // TODO: call password reset API
                        await new Promise(r => setTimeout(r, 1000));
                        setForgotSent(true);
                      } catch {
                        toast.error('发送失败');
                      }
                      setForgotSending(false);
                    }}
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
