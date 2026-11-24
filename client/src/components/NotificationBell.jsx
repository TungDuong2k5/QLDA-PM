import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

// Nút chuông thông báo tồn kho.
//  - Quản lý: nguyên liệu / bánh / đồ ăn vặt đã hết → "Nhập kho". Chưa nhập kịp thì
//    "Báo NV tắt món" để nhân viên tắt món đó (với món bất kỳ: vào trang Thực đơn).
//  - Nhân viên: món hết hàng / hết nguyên liệu / quản lý báo tắt → "Đóng món";
//    khi có hàng lại hoặc quản lý báo bật → "Bật món".
export default function NotificationBell() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'admin';
  const [alerts, setAlerts] = useState(null);
  const [open, setOpen] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');
  const boxRef = useRef(null);

  const [stockChecks, setStockChecks] = useState([]); // phiếu kiểm kho cuối ca chờ quản lý duyệt
  const [dueChecks, setDueChecks] = useState([]); // ca đã hết giờ mà chưa kiểm kho
  const [reminders, setReminders] = useState([]); // quầy nhắc: nhân viên có lịch mà qua ca chưa check-in (chỉ quản lý thấy)

  const load = useCallback(() => {
    api.get('/stock-alerts').then(({ data }) => setAlerts(data)).catch(() => {});
    api.get('/stock-checks/due').then(({ data }) => setDueChecks(data.due)).catch(() => {});
    if (isAdmin) {
      api.get('/employees/reminders').then(({ data }) => setReminders(data)).catch(() => {});
      api.get('/stock-checks/pending').then(({ data }) => setStockChecks(data)).catch(() => {});
    }
  }, [isAdmin]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 15000);
    window.addEventListener('stock-changed', load);
    window.addEventListener('timeclock-changed', load);
    return () => {
      clearInterval(timer);
      window.removeEventListener('stock-changed', load);
      window.removeEventListener('timeclock-changed', load);
    };
  }, [load]);

  async function dismissReminder(id) {
    try {
      await api.patch(`/employees/reminders/${id}/resolve`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Thao tác thất bại');
    }
  }

  useEffect(() => {
    if (!open) return undefined;
    function onClickOutside(e) {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, [open]);

  async function run(productId, action) {
    setBusyId(productId);
    setError('');
    try {
      await action();
      window.dispatchEvent(new Event('stock-changed'));
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Thao tác thất bại');
    } finally {
      setBusyId(null);
    }
  }

  const setAvailable = (id, isAvailable) => run(id, () => api.patch(`/products/${id}/availability`, { isAvailable }));
  const sendNotice = (id, kind) => run(id, () => api.post(`/products/${id}/notice`, { kind }));
  const cancelNotice = (id) => run(id, () => api.delete(`/products/${id}/notice`));

  function go(path) {
    setOpen(false);
    navigate(path);
  }

  if (!alerts) return null;

  const outIngredients = alerts.outOfStockIngredients;
  const outProducts = alerts.outOfStockProducts || [];
  const count = isAdmin
    ? outIngredients.length + outProducts.length + reminders.length + stockChecks.length + dueChecks.length
    : alerts.toClose.length + alerts.toReopen.length + dueChecks.length;
  const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
  const hhmm = (iso) => { const d = new Date(iso); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  return (
    <div className="notif" ref={boxRef}>
      <button
        type="button"
        className={`notif-bell ${count > 0 ? 'has-alert' : ''}`}
        onClick={() => setOpen((v) => !v)}
        aria-label="Thông báo kho"
        title="Thông báo kho"
      >
        <span aria-hidden="true">🔔</span>
        {count > 0 && <span className="notif-badge">{count}</span>}
      </button>

      {open && (
        <div className="notif-panel">
          <div className="notif-title">Thông báo</div>
          {error && <p className="error-text">{error}</p>}

          {isAdmin ? (
            <>
              {count === 0 && <p className="notif-empty">Không có thông báo mới.</p>}

              {dueChecks.length > 0 && <div className="notif-section">Ca đã hết giờ, chưa kiểm kho</div>}
              {dueChecks.map((d) => (
                <div key={`due${d.slot}`} className="notif-item">
                  <div>
                    <strong>{d.label}</strong> đã hết giờ lúc {d.end}
                    <div className="notif-sub">{d.status === 'rejected' ? 'Quản lý yêu cầu kiểm lại — nhân viên cần đếm lại' : 'Nhân viên chưa gửi phiếu kiểm kho'}</div>
                  </div>
                  <div className="notif-actions">
                    <button type="button" className="secondary" onClick={() => go('/ingredients?tab=check')}>Xem</button>
                  </div>
                </div>
              ))}

              {stockChecks.length > 0 && <div className="notif-section">Phiếu kiểm kho chờ duyệt</div>}
              {stockChecks.map((c) => (
                <div key={`sc${c.id}`} className="notif-item">
                  <div>
                    <strong>Kiểm kho {c.slotLabel?.toLowerCase()} ngày {dmy(c.businessDate)}</strong>
                    <div className="notif-sub">{c.submittedBy || 'Nhân viên'} gửi lúc {hhmm(c.submittedAt)} — {c.diffCount > 0 ? `${c.diffCount} mục lệch` : 'khớp hết'}</div>
                  </div>
                  <div className="notif-actions">
                    <button type="button" onClick={() => go(`/ingredients?tab=check&open=${c.id}`)}>Xem phiếu</button>
                  </div>
                </div>
              ))}

              {reminders.length > 0 && <div className="notif-section">Nhân viên chưa check-in (quầy nhắc)</div>}
              {reminders.map((r) => (
                <div key={`rm${r.id}`} className="notif-item">
                  <div>
                    <strong>{r.fullName}</strong> chưa check-in {r.slotLabel.toLowerCase()} ngày {dmy(r.workDate)}
                    <div className="notif-sub">Quầy nhắc lúc {hhmm(r.createdAt)} — nếu nhân viên có đi làm, hãy thêm chấm công tay</div>
                  </div>
                  <div className="notif-actions">
                    <button type="button" onClick={() => go(`/staff?open=${r.employeeId}&month=${r.workDate.slice(0, 7)}&date=${r.workDate}&slot=${r.slot}`)}>Thêm chấm công</button>
                    <button type="button" className="secondary" onClick={() => dismissReminder(r.id)}>Bỏ qua</button>
                  </div>
                </div>
              ))}

              {outIngredients.length > 0 && <div className="notif-section">Nguyên vật liệu đã hết</div>}
              {outIngredients.map((ing) => (
                <div key={`i${ing.id}`} className="notif-item">
                  <div>
                    <strong>{ing.name}</strong> đã hết ({ing.stock} {ing.unit})
                    {ing.affectedProducts.length > 0 && (
                      <div className="notif-sub">Ảnh hưởng: {ing.affectedProducts.map((p) => p.name).join(', ')}</div>
                    )}
                  </div>
                  <div className="notif-actions">
                    <button type="button" onClick={() => go(`/ingredients?search=${encodeURIComponent(ing.name)}`)}>Nhập kho</button>
                    <button type="button" className="secondary" onClick={() => go('/menu')}>Báo tắt món</button>
                  </div>
                </div>
              ))}

              {outProducts.length > 0 && <div className="notif-section">Bánh &amp; đồ ăn vặt đã hết</div>}
              {outProducts.map((p) => (
                <div key={`p${p.id}`} className="notif-item">
                  <div>
                    <strong>{p.name}</strong> đã hết ({p.stock})
                    <div className="notif-sub">
                      {!p.isAvailable ? 'Món đang tắt' : p.hasCloseRequest ? 'Đã báo nhân viên tắt món' : 'Món vẫn đang bán'}
                    </div>
                  </div>
                  <div className="notif-actions">
                    <button type="button" onClick={() => go(`/ingredients?search=${encodeURIComponent(p.name)}`)}>Nhập kho</button>
                    {p.isAvailable && !p.hasCloseRequest && (
                      <button type="button" className="secondary" disabled={busyId === p.id} onClick={() => sendNotice(p.id, 'close_request')}>Báo NV tắt</button>
                    )}
                    {p.isAvailable && p.hasCloseRequest && (
                      <button type="button" className="secondary" disabled={busyId === p.id} onClick={() => cancelNotice(p.id)}>Hủy báo</button>
                    )}
                  </div>
                </div>
              ))}
            </>
          ) : (
            <>
              {alerts.toClose.length === 0 && alerts.toReopen.length === 0 && dueChecks.length === 0 && (
                <p className="notif-empty">Không có thông báo mới.</p>
              )}
              {dueChecks.length > 0 && <div className="notif-section">Cần kiểm kho (ca đã hết giờ)</div>}
              {dueChecks.map((d) => (
                <div key={`due${d.slot}`} className="notif-item">
                  <div>
                    <strong>{d.label}</strong> đã hết giờ lúc {d.end}
                    <div className="notif-sub">{d.status === 'rejected' ? 'Quản lý yêu cầu kiểm lại' : 'Chưa gửi phiếu kiểm kho'}</div>
                  </div>
                  <button type="button" onClick={() => go('/stock-check')}>Kiểm kho</button>
                </div>
              ))}
              {alerts.toClose.length > 0 && <div className="notif-section">Cần đóng món (bắt buộc — món đang bị khóa, không gọi được)</div>}
              {alerts.toClose.map((p) => (
                <div key={p.id} className="notif-item">
                  <div>
                    <strong>{p.name}</strong>
                    <div className="notif-sub">{p.reasons.join(' · ')}</div>
                  </div>
                  <button type="button" className="danger" disabled={busyId === p.id} onClick={() => setAvailable(p.id, false)}>Đóng món</button>
                </div>
              ))}
              {alerts.toReopen.length > 0 && <div className="notif-section">Có thể bật món</div>}
              {alerts.toReopen.map((p) => (
                <div key={p.id} className="notif-item">
                  <div>
                    <strong>{p.name}</strong>
                    <div className="notif-sub">{p.reason}</div>
                  </div>
                  <button type="button" disabled={busyId === p.id} onClick={() => setAvailable(p.id, true)}>Bật món</button>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
