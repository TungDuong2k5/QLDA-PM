import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api/axios';
import DayCalendar from '../components/DayCalendar';

const STATUS_LABEL = {
  pending: 'Chờ xử lý',
  served: 'Đã pha xong',
  paid: 'Đã thanh toán',
  cancelled: 'Đã hủy',
};

const pad = (n) => String(n).padStart(2, '0');
const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const dayLabel = (s) => {
  const d = new Date(`${s}T00:00:00`);
  return `${WEEKDAY[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const timeOf = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };

// Mô tả một dòng món trong bill (không có giá): size / đường / đá / topping.
function itemDetail(it) {
  const parts = [];
  if (it.size) parts.push(`size ${it.size}, đường ${it.sugarLevel}%, đá ${it.iceLevel}%`);
  if (it.toppings.length > 0) parts.push(`topping: ${it.toppings.map((t) => `${t.name} ×${t.quantity}`).join(', ')}`);
  if (it.redeemed) parts.push('đổi điểm');
  return parts.join(' · ');
}

function Bill({ bill }) {
  return (
    <div className={`bill-card ${bill.status === 'cancelled' ? 'cancelled' : ''}`}>
      <div className="bill-head">
        <span>
          <strong>Bill #{bill.id}</strong>
          <span className="bill-meta"> · {timeOf(bill.createdAt)} · {bill.orderType === 'takeaway' ? 'Mang về' : (bill.table || 'Tại chỗ')}{bill.user ? ` · ${bill.user}` : ''}</span>
        </span>
        <span className="bill-right">
          <span className={`badge status-${bill.status}`}>{STATUS_LABEL[bill.status]}</span>
          <Link to={`/orders/${bill.id}`}>Xem</Link>
        </span>
      </div>
      <ul className="bill-items">
        {bill.items.map((it, i) => (
          <li key={`${it.name}-${i}`}>
            <span className="bill-item-name">{it.name}</span>
            <span className="bill-item-qty">× {it.quantity}</span>
            {itemDetail(it) && <small className="bill-item-detail">{itemDetail(it)}</small>}
          </li>
        ))}
      </ul>
    </div>
  );
}

// Một ca: tổng hợp số món đã bán + các bill của ca.
function ShiftPanel({ shift }) {
  return (
    <div className="shift-panel">
      <h4>Món đã bán trong {shift.label.toLowerCase()} ({shift.totalQuantity} món)</h4>
      {shift.summary.length === 0 ? (
        <p className="hint">Chưa có món nào được bán.</p>
      ) : (
        <table className="data-table day-table">
          <thead><tr><th>#</th><th>Món</th><th>Số lượng</th></tr></thead>
          <tbody>
            {shift.summary.map((r, i) => (
              <tr key={r.name}><td>{i + 1}</td><td>{r.name}</td><td><strong>{r.quantity}</strong></td></tr>
            ))}
          </tbody>
        </table>
      )}
      <h4>Các bill ({shift.billCount})</h4>
      {shift.bills.length === 0 ? <p className="hint">Chưa có bill nào.</p> : shift.bills.map((b) => <Bill key={b.id} bill={b} />)}
    </div>
  );
}

// Một ngày: danh sách ca; bấm vào ca để xem bill.
function DayPanel({ date, isToday }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState('');
  const [openShift, setOpenShift] = useState(null);

  const load = useCallback(() => {
    api.get(`/orders/days/${date}`)
      .then(({ data }) => { setDetail(data); setError(''); })
      .catch((err) => setError(err.response?.data?.message || 'Không tải được dữ liệu ngày'));
  }, [date]);

  useEffect(() => {
    load();
    if (!isToday) return undefined;
    const timer = setInterval(load, 15000); // hôm nay: bill mới liên tục
    return () => clearInterval(timer);
  }, [load, isToday]);

  if (error) return <p className="error-text" style={{ padding: '0 16px' }}>{error}</p>;
  if (!detail) return <p className="hint" style={{ padding: '0 16px' }}>Đang tải...</p>;
  if (detail.shifts.length === 0) return <p className="hint" style={{ padding: '0 16px 12px' }}>Ngày này chưa có ca nào.</p>;

  return (
    <div className="shift-list">
      {detail.shifts.map((s) => {
        const key = s.id ?? 'outside';
        const isOpen = openShift === key;
        return (
          <div key={key} className={`shift-item ${isOpen ? 'open' : ''}`}>
            <button type="button" className="shift-head" onClick={() => setOpenShift(isOpen ? null : key)}>
              <span className="shift-name">{isOpen ? '▼' : '▶'} {s.label}</span>
              <span className="shift-meta">
                {s.openedAt ? `${timeOf(s.openedAt)} – ${s.closedAt ? timeOf(s.closedAt) : 'đang mở'}` : ''}
                {s.status === 'open' && <span className="badge status-served" style={{ marginLeft: 8 }}>Đang mở</span>}
                <span style={{ marginLeft: 10 }}>{s.billCount} bill · {s.totalQuantity} món</span>
              </span>
            </button>
            {isOpen && <ShiftPanel shift={s} />}
          </div>
        );
      })}
    </div>
  );
}

export default function Orders() {
  const [days, setDays] = useState([]);
  const [today, setToday] = useState(null);
  const [pickedDate, setPickedDate] = useState(null);

  useEffect(() => {
    api.get('/orders/days').then(({ data }) => {
      setDays(data.days);
      setToday(data.today);
    });
  }, []);

  const pastDays = days.filter((d) => d.date !== today);

  return (
    <div className="page">
      <h1>Đơn hàng</h1>

      {/* Hôm nay: hiện thẳng các ca và bill */}
      {today && (
        <div className="page-card">
          <h2 style={{ marginTop: 0 }}>Hôm nay — {dayLabel(today)}</h2>
          <p className="hint" style={{ marginTop: 0 }}>Bấm vào ca để xem các bill của ca đó và mỗi bill đã bán món gì.</p>
          <DayPanel date={today} isToday />
        </div>
      )}

      {/* Các ngày trước: chọn trên tờ lịch */}
      <div className="page-card">
        <h2 style={{ marginTop: 0 }}>Xem lại đơn các ngày trước</h2>
        {pastDays.length === 0 ? (
          <p className="hint">Chưa có ngày nào trước hôm nay có ca hay đơn hàng.</p>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 0 }}>Bấm vào một ngày trên lịch để xem các ca; bấm vào ca để xem bill.</p>
            <DayCalendar
              marked={Object.fromEntries(pastDays.map((d) => [d.date, `${d.orderCount} bill`]))}
              today={today}
              selected={pickedDate}
              onSelect={setPickedDate}
            />
            {pickedDate && (
              <div className="pick-day" key={pickedDate}>
                <h3 className="pick-day-title">{dayLabel(pickedDate)}</h3>
                <DayPanel date={pickedDate} isToday={false} />
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
