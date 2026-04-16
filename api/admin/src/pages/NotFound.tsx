import { Link } from 'react-router-dom';

export default function NotFound() {
  return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', padding: '80px 20px', textAlign: 'center',
    }}>
      <i className="fa-regular fa-ghost" style={{ fontSize: 48, color: 'var(--color-text-dim)', marginBottom: 16 }} />
      <h1 style={{ fontSize: 20, fontWeight: 600, margin: '0 0 8px' }}>页面未找到</h1>
      <p className="text-sub" style={{ fontSize: 13, margin: '0 0 20px' }}>此页面正在迁移中或不存在</p>
      <Link to="/" className="btn btn-secondary" style={{ textDecoration: 'none' }}>返回概览</Link>
    </div>
  );
}
