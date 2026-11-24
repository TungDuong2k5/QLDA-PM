import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const pad = (n) => String(n).padStart(2, '0');
const hm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// Thông báo nổi ở góc màn hình (mọi trang của tài khoản staff): tới giờ tan ca thì hiện
// "Đến giờ tan ca: tên nhân viên" kèm nút Check-out (nhập PIN). Check-out là việc của từng nhân viên.
export default function CheckoutAlert() {
  const { user } = useAuth();
  const isStaff = user?.role === 'staff';
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null); // nhân viên đang check-out
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => {
    if (!isStaff) return;
    api.get('/timeclock').then(({ data: d }) => setData(d)).catch(() => {});
  }, [isStaff]);

  useEffect(() => {
    if (!isStaff) return undefined;
    load();
    const timer = setInterval(load, 20000);
    window.addEventListener('timeclock-changed', load);
    return () => { clearInterval(timer); window.removeEventListener('timeclock-changed', load); };
  }, [isStaff, load]);

  if (!isStaff || !data) return null;

  const due = data.employees.filter((e) => e.canCheckout);
  const waiting = data.employees.filter((e) => e.checkoutWaitingShift); // hết giờ ca nhưng ca bán hàng chưa kết

  async function confirm(e) {
    e.preventDefault();
    e.stopPropagation();
    setBusy(true);
    setError('');
    try {
      const { data: log } = await api.post('/timeclock/checkout', { employeeId: dialog.id, pin });
      const h = Math.floor(log.workedMinutes / 60);
      setNotice(`✔ ${dialog.fullName} đã check-out lúc ${hm(log.checkOutAt)} — làm ${h > 0 ? `${h} giờ ` : ''}${log.workedMinutes % 60} phút. Cảm ơn nhé!`);
      setDialog(null);
      window.dispatchEvent(new Event('timeclock-changed'));
    } catch (err) {
      setError(err.response?.data?.message || 'Check-out thất bại');
    } finally {
      setBusy(false);
    }
  }

  if (due.length === 0 && waiting.length === 0 && !notice) return null;

  return (
    <>
      <div className="ck-alert" role="alert">
        {notice && <div className="ck-alert-ok" onClick={() => setNotice('')}>{notice}</div>}
        {waiting.length > 0 && (
          <>
            <div className="ck-alert-title">⏳ Hết giờ ca — chưa kết ca</div>
            {waiting.map((emp) => (
              <div key={emp.id} className="ck-alert-row">
                <span><b>{emp.fullName}</b>: {emp.checkoutReason}</span>
              </div>
            ))}
          </>
        )}
        {due.length > 0 && (
          <>
            <div className="ck-alert-title">⏰ Đến giờ tan ca</div>
            {due.map((emp) => {
              const open = emp.logs.find((l) => !l.checkOutAt);
              return (
                <div key={emp.id} className="ck-alert-row">
                  <span>
                    Đến giờ <b>{emp.fullName}</b> tan {data.slots[open.slot].label.toLowerCase()} ({hm(emp.checkoutAt)})
                  </span>
                  <button type="button" className="danger" onClick={() => { setDialog(emp); setPin(''); setError(''); }}>Check-out</button>
                </div>
              );
            })}
          </>
        )}
      </div>

      {dialog && createPortal(
        <div className="emp-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDialog(null); }}>
          <form className="emp-modal ck-dialog" onSubmit={confirm}>
            <h2 style={{ marginTop: 0 }}>Check-out (tan ca)</h2>
            <p><strong>{dialog.fullName}</strong></p>
            <p className="hint">Check-out khi tan ca. Giờ làm tính từ lúc check-in đến bây giờ.</p>
            {dialog.hasPin ? (
              <label className="ck-pin">
                Mã PIN
                <input
                  type="password"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                  autoFocus
                  required
                />
              </label>
            ) : (
              <p className="hint">Nhân viên này chưa có mã PIN nên không cần nhập.</p>
            )}
            {error && <p className="error-text">{error}</p>}
            <div className="emp-actions" style={{ marginTop: 12 }}>
              <button type="submit" disabled={busy}>{busy ? 'Đang xử lý...' : 'Xác nhận'}</button>
              <button type="button" className="secondary" onClick={() => setDialog(null)}>Hủy</button>
            </div>
          </form>
        </div>,
        document.body,
      )}
    </>
  );
}
