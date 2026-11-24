import { useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

// Tài khoản: người dùng (quản lý hoặc nhân viên) tự đổi mật khẩu của mình.
export default function Account() {
  const { user } = useAuth();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '', confirm: '' });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMsg({ type: '', text: '' });
    if (form.newPassword !== form.confirm) {
      setMsg({ type: 'err', text: 'Mật khẩu mới nhập lại chưa khớp' });
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/change-password', { currentPassword: form.currentPassword, newPassword: form.newPassword });
      setForm({ currentPassword: '', newPassword: '', confirm: '' });
      setMsg({ type: 'ok', text: 'Đã đổi mật khẩu. Lần đăng nhập sau hãy dùng mật khẩu mới.' });
    } catch (err) {
      setMsg({ type: 'err', text: err.response?.data?.message || 'Đổi mật khẩu thất bại' });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Đổi mật khẩu</h1>
      <div className="kho-card account-card">
        <p className="hint">Tài khoản: <strong>{user.fullName}</strong> ({user.username})</p>
        <form className="account-form" onSubmit={handleSubmit}>
          <label>
            Mật khẩu hiện tại
            <input type="password" value={form.currentPassword} onChange={(e) => setForm({ ...form, currentPassword: e.target.value })} autoComplete="current-password" required />
          </label>
          <label>
            Mật khẩu mới (tối thiểu 6 ký tự)
            <input type="password" value={form.newPassword} onChange={(e) => setForm({ ...form, newPassword: e.target.value })} autoComplete="new-password" required />
          </label>
          <label>
            Nhập lại mật khẩu mới
            <input type="password" value={form.confirm} onChange={(e) => setForm({ ...form, confirm: e.target.value })} autoComplete="new-password" required />
          </label>
          <button type="submit" disabled={busy}>{busy ? 'Đang lưu...' : 'Đổi mật khẩu'}</button>
        </form>
        {msg.text && <p className={msg.type === 'ok' ? 'success-text' : 'error-text'}>{msg.text}</p>}
      </div>
    </div>
  );
}
