import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../api/axios';
import CheckinPanel from '../components/CheckinPanel';

export default function SalesEntry() {
  const navigate = useNavigate();
  const [shift, setShift] = useState(undefined); // undefined = loading, null = no open shift
  const [openingCash, setOpeningCash] = useState('1000000');
  const [clock, setClock] = useState({ inCount: 0, slotInCount: 0, slotLabel: null, outCount: 0, canInCount: 0 }); // tóm tắt từ CheckinPanel
  // Mở ca cần người đã check-in ĐÚNG CA ĐANG CHẠY (người còn "trong ca" từ ca trước không tính).
  const checkedCount = clock.slotInCount;
  const [showLate, setShowLate] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  function loadShift() {
    api.get('/shifts/current').then(({ data }) => setShift(data));
  }

  useEffect(loadShift, []);

  // Mở ca: những nhân viên đã nhập PIN (check-in) ở trên được tính chấm công từ lúc họ check-in.
  async function handleOpenShift(e) {
    e.preventDefault();
    setError('');
    if (checkedCount === 0) {
      setError(`Cần ít nhất một nhân viên nhập PIN check-in${clock.slotLabel ? ` ${clock.slotLabel}` : ''} trước khi mở ca`);
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/shifts/open', { openingCash: Number(openingCash) || 0 });
      loadShift();
    } catch (err) {
      setError(err.response?.data?.message || 'Mở ca thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  if (shift === undefined) return <p className="hint">Đang tải...</p>;

  if (!shift) {
    return (
      <div className="welcome-gate">
        <h1 className="welcome-title">Bắt đầu ca làm việc</h1>
        <p className="welcome-sub">Nhân viên nhập mã PIN để check-in, sau đó nhập tiền két và mở ca</p>

        <form className="welcome-open-form ck-gate" onSubmit={handleOpenShift}>
          <div className="ck-gate-step">① Nhân viên check-in (nhập PIN)</div>
          <CheckinPanel onChange={setClock} />

          <div className="ck-gate-step">② Mở ca</div>
          <label>
            Tiền trong két hiện có
            <input type="number" min="0" value={openingCash} onChange={(e) => setOpeningCash(e.target.value)} />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button type="submit" disabled={submitting || checkedCount === 0}>
            {submitting ? 'Đang mở ca...' : checkedCount === 0 ? `Chờ nhân viên check-in${clock.slotLabel ? ` ${clock.slotLabel}` : ''}` : `Mở ca (${checkedCount} nhân viên đã check-in)`}
          </button>
        </form>
      </div>
    );
  }

  // Ca đang mở mà chưa có ai check-in đúng ca hiện tại: hiện luôn danh sách check-in (không cần bấm nút).
  const nobodyCheckedIn = clock.slotInCount === 0;
  const panelOpen = showLate || nobodyCheckedIn;

  return (
    <div className="page">
      <h1>Bán hàng</h1>
      <div className={`ck-banner ${clock.outCount > 0 || nobodyCheckedIn ? 'ck-banner-out' : ''}`}>
        <div className="ck-banner-row">
          <strong>
            {shift.label} đang mở.{' '}
            {nobodyCheckedIn
              ? `Chưa có nhân viên nào check-in${clock.slotLabel ? ` ${clock.slotLabel}` : ''} — nhân viên nhập PIN check-in bên dưới.`
              : clock.outCount > 0
                ? `Có ${clock.outCount} nhân viên đã đến giờ tan ca — bấm Check-out và nhập PIN.`
                : 'Nhân viên check-out (nhập PIN) khi tới giờ tan ca; kết ca không check-out hộ.'}
          </strong>
          {!nobodyCheckedIn && (
            <button type="button" className={clock.outCount > 0 ? 'danger' : 'secondary'} onClick={() => setShowLate((v) => !v)}>
              {showLate ? 'Ẩn check-in / check-out' : clock.outCount > 0 ? `Check-out (${clock.outCount})` : 'Check-in / Check-out nhân viên'}
            </button>
          )}
        </div>
        {/* Luôn gắn bảng để biết số người check-in / đến giờ tan ca; chỉ ẩn/hiện bằng nút. */}
        <div hidden={!panelOpen}><CheckinPanel onChange={setClock} /></div>
      </div>
      <div className="sales-entry-grid">
        <button type="button" className="sales-entry-card" onClick={() => navigate('/tables/pick')}>
          <span className="sales-entry-icon">🍽️</span>
          <span className="sales-entry-title">Bán tại chỗ</span>
          <span className="sales-entry-hint">Chọn bàn rồi vào thực đơn</span>
        </button>
        <button type="button" className="sales-entry-card" onClick={() => navigate('/orders/new?orderType=takeaway')}>
          <span className="sales-entry-icon">🥡</span>
          <span className="sales-entry-title">Bán mang về</span>
          <span className="sales-entry-hint">Vào thẳng thực đơn</span>
        </button>
      </div>
    </div>
  );
}
