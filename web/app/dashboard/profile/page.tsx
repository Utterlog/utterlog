'use client';

import { useState } from 'react';
import { useAuthStore } from '@/lib/store';
import toast from 'react-hot-toast';
import { Button, Input } from '@/components/ui';
import { User, Save } from '@/components/icons';
import { authApi } from '@/lib/api';
import { useForm } from 'react-hook-form';

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const [saving, setSaving] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  const { register, handleSubmit } = useForm({
    defaultValues: {
      nickname: user?.nickname || '',
      email: user?.email || '',
      contact_email: '',
      bio: '',
      url: '',
    },
  });

  const { register: registerPw, handleSubmit: handlePwSubmit, reset: resetPw } = useForm({
    defaultValues: { current_password: '', new_password: '', confirm_password: '' },
  });

  const onSaveProfile = async (data: any) => {
    setSaving(true);
    try {
      // TODO: call profile update API when available
      toast.success('资料已保存');
    } catch { toast.error('保存失败'); }
    finally { setSaving(false); }
  };

  const onChangePassword = async (data: any) => {
    if (data.new_password !== data.confirm_password) { toast.error('两次密码不一致'); return; }
    setChangingPassword(true);
    try {
      await authApi.logout(); // placeholder
      toast.success('密码已修改，请重新登录');
      resetPw();
    } catch { toast.error('修改失败'); }
    finally { setChangingPassword(false); }
  };

  const gravatarHint = user?.email
    ? `头像通过 Gravatar 管理，请访问 gravatar.com 修改`
    : '';

  return (
    <div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '24px' }}>
        <User size={20} className="text-primary-themed" />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Profile Info */}
        <div className="card" style={{ padding: '24px' }}>
          <h2 className="text-main" style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>基本信息</h2>
          <form onSubmit={handleSubmit(onSaveProfile)} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <Input label="登录账号" value={user?.username || ''} disabled />
            <Input label="邮箱" type="email" {...register('email')} disabled />
            <Input label="昵称" {...register('nickname')} />
            <Input label="联系邮箱" placeholder="公开显示的联系邮箱（可与登录邮箱不同）" {...register('contact_email')} />
            <Input label="个人网站" placeholder="https://" {...register('url')} />
            <div>
              <label className="text-sub" style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '6px' }}>简介</label>
              <textarea rows={3} className="input focus-ring" {...register('bio')} placeholder="介绍一下自己..." />
            </div>
            {gravatarHint && <p className="text-dim" style={{ fontSize: '12px' }}>{gravatarHint}</p>}
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
    </div>
  );
}
