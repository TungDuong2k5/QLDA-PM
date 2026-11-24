import { useEffect, useRef, useState } from 'react';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_METHODS } from '../utils/constants';
import DayCalendar from '../components/DayCalendar';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
}


// Số chạy lên mượt mà (doanh thu đổi giá trị thì chạy từ số cũ sang số mới). Tôn trọng chế độ "giảm chuyển động".
function useCountUp(target, duration = 800) {
  const [val, setVal] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const end = Number(target) || 0;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      prev.current = end;
      setVal(end);
      return undefined;
    }
    const from = prev.current;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      setVal(from + (end - from) * (1 - (1 - t) ** 3));
      if (t < 1) raf = requestAnimationFrame(tick); else prev.current = end;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return val;
}

function Money({ value, className }) {
  const v = useCountUp(value);
  return <span className={className}>{formatCurrency(Math.round(v))}</span>;
}

// Mở / đóng mượt (chiều cao và độ mờ chuyển dần).
function Collapse({ open, children }) {
  return (
    <div className={`collapse ${open ? 'open' : ''}`} aria-hidden={!open}>
      <div className="collapse-inner">{children}</div>
    </div>
  );
}

// Số tiền rút gọn để ghi nhỏ trong ô lịch: 2.457.000 -> 2,5tr, 85.000 -> 85k.
function shortMoney(v) {
  if (v >= 1e6) return `${(v / 1e6).toFixed(1).replace('.', ',').replace(',0', '')}tr`;
  if (v >= 1e3) return `${Math.round(v / 1e3)}k`;
  return String(Math.round(v));
}

const dmy = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}`;
const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const dayName = (s) => `${WEEKDAY[new Date(`${s}T00:00:00`).getDay()]}, ${dmy(s)}`;

function paymentMethodLabel(value) {
  return PAYMENT_METHODS.find((m) => m.value === value)?.label || value;
}

function PaymentMethodList({ paymentMethods }) {
  const entries = Object.entries(paymentMethods || {});
  if (entries.length === 0) return <p className="hint">Chưa có giao dịch.</p>;
  const total = entries.reduce((sum, [, amount]) => sum + amount, 0) || 1;
  return (
    <ul className="payment-method-list">
      {entries.map(([method, amount]) => (
        <li key={method} className="pay-item">
          <span>{paymentMethodLabel(method)}</span>
          <strong>{formatCurrency(amount)}</strong>
          <i className="pay-bar" style={{ '--w': `${Math.round((amount / total) * 100)}%` }} />
        </li>
      ))}
    </ul>
  );
}

// Tách riêng từng phần (két gốc / doanh thu tiền mặt / chi phát sinh) để
// thu ngân đối chiếu và chốt két cho dễ, thay vì chỉ gộp 1 con số.
function CashBreakdown({ opening, cashRevenue, expenses, cashOnHand }) {
  return (
    <div className="cash-breakdown">
      <div className="cash-row">
        <span>Tiền két gốc (đầu ca)</span>
        <strong>{formatCurrency(opening)}</strong>
      </div>
      <div className="cash-row">
        <span>Doanh thu tiền mặt</span>
        <strong>{formatCurrency(cashRevenue)}</strong>
      </div>
      {expenses > 0 && (
        <div className="cash-row cash-row-negative">
          <span>Chi phát sinh</span>
          <strong>-{formatCurrency(expenses)}</strong>
        </div>
      )}
      <div className="cash-row cash-row-total">
        <span>Tổng tiền mặt hiện có trong két</span>
        <strong>{formatCurrency(cashOnHand)}</strong>
      </div>
    </div>
  );
}

const EXPENSE_STATUS_LABEL = {
  pending: 'Chờ duyệt',
  approved: 'Đã duyệt',
  rejected: 'Từ chối',
};

function ExpenseList({ expenses, onReview }) {
  if (!expenses || expenses.length === 0) return <p className="hint">Chưa có khoản chi nào.</p>;
  return (
    <ul className="expense-list">
      {expenses.map((e) => (
        <li key={e.id}>
          <div className="expense-list-main">
            <span>{formatTime(e.createdAt)} · {e.note}{e.user ? ` (${e.user})` : ''}</span>
            <span className={`badge expense-status-${e.status}`}>{EXPENSE_STATUS_LABEL[e.status]}</span>
          </div>
          <div className="expense-list-right">
            <strong>-{formatCurrency(e.amount)}</strong>
            {onReview && e.status === 'pending' && (
              <div className="expense-review-actions">
                <button type="button" onClick={() => onReview(e.id, 'approved')}>Duyệt</button>
                <button type="button" className="danger" onClick={() => onReview(e.id, 'rejected')}>Từ chối</button>
              </div>
            )}
          </div>
        </li>
      ))}
    </ul>
  );
}

function ExpenseForm({ onSubmit }) {
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    if (!amount || Number(amount) <= 0) return setError('Nhập số tiền hợp lệ');
    if (!note.trim()) return setError('Nhập ghi chú lý do chi (VD: sửa máy cà phê)');
    setSubmitting(true);
    try {
      await onSubmit(Number(amount), note.trim());
      setAmount('');
      setNote('');
    } catch (err) {
      setError(err.response?.data?.message || 'Ghi chi thất bại');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="expense-form" onSubmit={handleSubmit}>
      <input
        type="number"
        min="0"
        placeholder="Số tiền"
        value={amount}
        onChange={(e) => setAmount(e.target.value)}
      />
      <input
        placeholder="Ghi chú (VD: sửa máy cà phê, mua giấy ăn...)"
        value={note}
        onChange={(e) => setNote(e.target.value)}
      />
      <button type="submit" disabled={submitting}>Ghi chi</button>
      {error && <p className="error-text">{error}</p>}
    </form>
  );
}

// Danh sách món / danh mục: chỉ hiện vài dòng đầu, bấm để xem hết (đỡ dài trang).
function CollapsibleList({ items, empty, limit = 5, unit = 'SL' }) {
  const [all, setAll] = useState(false);
  if (items.length === 0) return <p className="hint">{empty}</p>;
  const shown = all ? items : items.slice(0, limit);
  return (
    <>
      <ul className="shift-item-list">
        {shown.map((item) => (
          <li key={item.name}>
            <span>{item.name}</span>
            <strong>{unit} {item.quantity}</strong>
          </li>
        ))}
      </ul>
      {items.length > limit && (
        <button type="button" className="link-more" onClick={() => setAll((v) => !v)}>
          {all ? 'Thu gọn ▲' : `Xem tất cả ${items.length} món ▼`}
        </button>
      )}
    </>
  );
}

function ShiftReportBody({ shift }) {
  return (
    <div className="shift-report-grid">
      <div className="shift-report-col">
        <Money value={shift.revenue} className="shift-revenue" />
        <CashBreakdown
          opening={shift.openingCash}
          cashRevenue={shift.cashRevenue}
          expenses={shift.totalExpenses}
          cashOnHand={shift.cashOnHand}
        />
      </div>
      <div className="shift-report-col">
        <div className="shift-section">
          <div className="shift-section-title">Phương thức thanh toán</div>
          <PaymentMethodList paymentMethods={shift.paymentMethods} />
        </div>
        <div className="shift-section">
          <div className="shift-section-title">Món bán được</div>
          <CollapsibleList items={shift.items} empty="Chưa có món nào." />
        </div>
      </div>
    </div>
  );
}

// Mục lớn riêng cho chi phí phát sinh — tách khỏi tờ báo cáo ca, gắn với
// ca đang mở. Cách hoạt động (nhân viên ghi, quản lý duyệt/từ chối) giữ
// nguyên như cũ, chỉ đổi chỗ hiển thị.
function ExpenseSection({ shift, onAddExpense, onReviewExpense }) {
  return (
    <div className="shift-card">
      <ExpenseList expenses={shift.expenses} onReview={onReviewExpense} />
      {onAddExpense && <ExpenseForm onSubmit={onAddExpense} />}
    </div>
  );
}

// Số liệu của một ngày (hôm nay hoặc ngày trước): thanh toán + két, danh mục, sản phẩm bán chạy.
function DayTotals({ data }) {
  return (
    <div className="dash-day-grid">
      <div>
        <div className="shift-section-title">Thanh toán và két</div>
        <PaymentMethodList paymentMethods={data.paymentMethods} />
        <CashBreakdown
          opening={data.openingCash}
          cashRevenue={data.cashRevenue}
          expenses={data.totalExpenses}
          cashOnHand={data.cashOnHand}
        />
      </div>
      <div>
        <div className="shift-section-title">Danh mục bán được</div>
        <CollapsibleList items={data.categories} empty="Chưa có dữ liệu." limit={6} unit="SL" />
      </div>
      <div>
        <div className="shift-section-title">Sản phẩm bán chạy</div>
        {data.topProducts.length === 0 ? (
          <p className="hint">Chưa có dữ liệu.</p>
        ) : (
          <ol className="dash-top-list">
            {data.topProducts.map((p) => (
              <li key={p.productId}>
                <span>{p.name}</span>
                <strong>{p.totalQuantity}</strong>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

// Một dòng bấm để mở ra (ca trước đó / ngày trước): tiêu đề, phụ đề, số tiền, mũi tên xoay.
function ExpandRow({ title, sub, amount, open, onToggle, children, style }) {
  return (
    <div className={`xrow dash-appear ${open ? 'open' : ''}`} style={style}>
      <button type="button" className="xrow-head" onClick={onToggle} aria-expanded={open}>
        <span className="xrow-chevron">▶</span>
        <span className="xrow-title">{title}</span>
        <span className="xrow-sub">{sub}</span>
        <strong className="xrow-amount">{formatCurrency(amount)}</strong>
      </button>
      <Collapse open={open}><div className="xrow-body">{children}</div></Collapse>
    </div>
  );
}

// Doanh thu của một ngày chọn từ tờ lịch: từng ca rồi cả ngày.
function PickedDay({ date, detail }) {
  if (!detail || detail === 'loading') return <p className="hint">Đang tải...</p>;
  if (detail === 'error') return <p className="error-text">Không tải được dữ liệu ngày này.</p>;
  return (
    <div className="pick-day" key={date}>
      <h3 className="pick-day-title">{dayName(date)}</h3>

      <div className="dash-subhead">Doanh thu theo ca</div>
      {detail.shifts.length === 0 ? (
        <p className="hint">Ngày này không có ca nào.</p>
      ) : (
        <div className="pick-shifts">
          {detail.shifts.map((sh) => (
            <div key={sh.id ?? 'out'} className="pick-shift">
              <div className="pick-shift-head">
                <strong>{sh.label}</strong>
                <span className="hint">{sh.openedAt ? `${formatTime(sh.openedAt)} – ${sh.closedAt ? formatTime(sh.closedAt) : '…'}` : ''}</span>
              </div>
              <span className="pick-shift-amount">{formatCurrency(sh.revenue)}</span>
              <div className="stat-line"><span>Số đơn</span><strong>{sh.orderCount}</strong></div>
              <div className="stat-line"><span>Tiền két gốc</span><strong>{formatCurrency(sh.openingCash)}</strong></div>
              <div className="stat-line"><span>Doanh thu tiền mặt</span><strong>{formatCurrency(sh.cashRevenue)}</strong></div>
              {sh.totalExpenses > 0 && <div className="stat-line"><span>Chi phát sinh</span><strong>-{formatCurrency(sh.totalExpenses)}</strong></div>}
              <PaymentMethodList paymentMethods={sh.paymentMethods} />
            </div>
          ))}
        </div>
      )}

      <div className="dash-subhead">Doanh thu cả ngày</div>
      <div className="live-shift" style={{ borderColor: 'var(--border)', background: '#fff' }}>
        <Money value={detail.revenue} className="shift-revenue" />
        <span className="hint">{detail.orderCount} đơn trong ngày</span>
        <DayTotals data={detail} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [summary, setSummary] = useState(null);
  const [currentShift, setCurrentShift] = useState(undefined);
  const [shiftsToday, setShiftsToday] = useState([]);
  const [openShiftId, setOpenShiftId] = useState(null);   // ca trước đó đang mở ra
  const [pastDays, setPastDays] = useState([]);
  const [pickedDate, setPickedDate] = useState(null);     // ngày chọn từ tờ lịch
  const [dayDetails, setDayDetails] = useState({});       // { [date]: dữ liệu | 'loading' | 'error' }
  const [showExpenses, setShowExpenses] = useState(null); // null = tự quyết định theo có khoản chờ duyệt không
  const [closing, setClosing] = useState(false);
  const [closeError, setCloseError] = useState('');
  const [closeSubmitting, setCloseSubmitting] = useState(false);

  function loadAll() {
    api.get('/dashboard/summary').then(({ data }) => setSummary(data));
    api.get('/shifts/current').then(({ data }) => setCurrentShift(data));
    api.get('/shifts/today').then(({ data }) => setShiftsToday(data.shifts));
    api.get('/dashboard/days').then(({ data }) => setPastDays(data.days)).catch(() => {});
  }

  useEffect(loadAll, []);

  // Kết ca chỉ đóng ca bán hàng; nhân viên tự check-out bằng PIN ở trang Bán hàng khi tới giờ tan ca.
  async function handleCloseShift(e) {
    e.preventDefault();
    if (!currentShift) return;
    setCloseError('');
    setCloseSubmitting(true);
    try {
      const { data } = await api.post(`/shifts/${currentShift.id}/close`, {});
      setOpenShiftId(data.closed.id); // mở luôn báo cáo của ca vừa kết
      setClosing(false);
      loadAll();
    } catch (err) {
      setCloseError(err.response?.data?.message || 'Kết ca thất bại');
    } finally {
      setCloseSubmitting(false);
    }
  }

  async function handleAddExpense(amount, note) {
    await api.post(`/shifts/${currentShift.id}/expenses`, { amount, note });
    loadAll();
  }

  async function handleReviewExpense(expenseId, status) {
    await api.patch(`/shifts/expenses/${expenseId}`, { status });
    loadAll();
  }

  function pickDay(date) {
    setPickedDate(date);
    if (!dayDetails[date] || dayDetails[date] === 'error') {
      setDayDetails((d) => ({ ...d, [date]: 'loading' }));
      api.get(`/dashboard/days/${date}`)
        .then(({ data }) => setDayDetails((d) => ({ ...d, [date]: data })))
        .catch(() => setDayDetails((d) => ({ ...d, [date]: 'error' })));
    }
  }

  if (!summary) return <p>Đang tải...</p>;

  const todayLabel = new Date().toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  const dayTotal = summary.dayTotal;
  const pastShifts = shiftsToday.filter((s) => s.status !== 'open');
  const pendingExpenses = (currentShift?.expenses || []).filter((e) => e.status === 'pending').length;
  const expensesOpen = showExpenses === null ? pendingExpenses > 0 : showExpenses;

  return (
    <div className="page page-wide dash">
      <div className="dash-top">
        <h1>Bảng điều khiển</h1>
        <span className="dash-date">{todayLabel}</span>
      </div>

      {/* ================= MỤC 1: DOANH THU THEO CA ================= */}
      <section className="dash-card dash-appear" style={{ '--i': 0 }}>
        <div className="dash-card-head">
          <h2>Doanh thu theo ca</h2>
          {summary.activeOrders > 0 && <span className="chip chip-warn">{summary.activeOrders} đơn đang xử lý</span>}
        </div>

        {/* Ca đang bán: hiện thẳng */}
        {currentShift === undefined && <p className="hint">Đang tải ca làm việc...</p>}
        {currentShift === null && <p className="hint">Chưa có ca nào đang bán — vào trang Bán hàng để mở ca.</p>}
        {currentShift && (
          <div className="live-shift">
            <div className="live-head">
              <span className="live-dot" />
              <strong>Đang bán · {currentShift.label}</strong>
              <span className="hint">mở lúc {formatTime(currentShift.openedAt)}{currentShift.openedBy ? ` · ${currentShift.openedBy}` : ''}</span>
            </div>
            <ShiftReportBody shift={currentShift} />

            <button type="button" className="xbtn" onClick={() => setShowExpenses(!expensesOpen)} aria-expanded={expensesOpen}>
              <span className="xrow-chevron" style={{ transform: expensesOpen ? 'rotate(90deg)' : 'none' }}>▶</span>
              Chi phí phát sinh ({(currentShift.expenses || []).length} khoản{pendingExpenses > 0 ? `, ${pendingExpenses} chờ duyệt` : ''})
            </button>
            <Collapse open={expensesOpen}>
              <div className="xrow-body">
                <ExpenseSection
                  shift={currentShift}
                  onAddExpense={user.role !== 'admin' ? handleAddExpense : undefined}
                  onReviewExpense={user.role === 'admin' ? handleReviewExpense : undefined}
                />
              </div>
            </Collapse>

            {!closing ? (
              <button className="danger" onClick={() => setClosing(true)} style={{ marginTop: 10 }}>Kết ca</button>
            ) : (
              <form className="close-shift-form" onSubmit={handleCloseShift}>
                <strong>Kết "{currentShift.label}"?</strong>
                <p className="hint">
                  Kết ca chỉ đóng ca bán hàng (chốt doanh thu và tiền két). Nhân viên tự <strong>check-out bằng mã PIN</strong> ở trang Bán hàng khi tới giờ tan ca.
                  {' '}Muốn bán tiếp thì vào trang Bán hàng, nhân viên nhập PIN check-in rồi mở ca mới.
                </p>
                {closeError && <p className="error-text">{closeError}</p>}
                <div className="recipe-actions">
                  <button type="submit" className="danger" disabled={closeSubmitting}>
                    {closeSubmitting ? 'Đang kết ca...' : 'Xác nhận kết ca'}
                  </button>
                  <button type="button" className="secondary" onClick={() => { setClosing(false); setCloseError(''); }}>Hủy</button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Các ca trước đó: bấm để mở */}
        {pastShifts.length > 0 && (
          <>
            <div className="dash-subhead">Các ca trước đó hôm nay ({pastShifts.length})</div>
            <div className="xlist">
              {pastShifts.map((sh, idx) => (
                <ExpandRow
                  key={sh.id}
                  title={sh.label}
                  sub={`${formatTime(sh.openedAt)} – ${formatTime(sh.closedAt)}`}
                  amount={sh.revenue}
                  open={openShiftId === sh.id}
                  onToggle={() => setOpenShiftId(openShiftId === sh.id ? null : sh.id)}
                  style={{ '--i': idx }}
                >
                  <ShiftReportBody shift={sh} />
                  {(sh.expenses || []).length > 0 && (
                    <div className="shift-section">
                      <div className="shift-section-title">Chi phí phát sinh</div>
                      <ExpenseList expenses={sh.expenses} />
                    </div>
                  )}
                  <button type="button" className="button-link" onClick={() => window.print()}>In / Xuất PDF</button>
                </ExpandRow>
              ))}
            </div>
          </>
        )}
      </section>

      {/* ================= MỤC 2: DOANH THU CẢ NGÀY ================= */}
      {dayTotal && (
        <section className="dash-card dash-appear" style={{ '--i': 1 }}>
          <div className="dash-card-head">
            <h2>Doanh thu cả ngày</h2>
            <span className="chip">{summary.todayOrders} đơn hôm nay</span>
          </div>

          {/* Hôm nay: hiện thẳng */}
          <div className="live-shift">
            <div className="live-head">
              <span className="live-dot" />
              <strong>Hôm nay</strong>
              <span className="hint">tất cả các ca</span>
            </div>
            <Money value={dayTotal.revenue} className="shift-revenue" />
            <DayTotals data={{ ...dayTotal, topProducts: summary.topProducts }} />
          </div>
        </section>
      )}

      {/* ================= MỤC 3: XEM LẠI CÁC NGÀY TRƯỚC (TỜ LỊCH) ================= */}
      <section className="dash-card dash-appear" style={{ '--i': 2 }}>
        <div className="dash-card-head">
          <h2>Xem lại doanh thu các ngày trước</h2>
        </div>
        {pastDays.length === 0 ? (
          <p className="hint">Chưa có ngày nào trước hôm nay.</p>
        ) : (
          <>
            <p className="hint" style={{ marginTop: 0 }}>Bấm vào một ngày trên lịch để xem doanh thu từng ca và doanh thu cả ngày.</p>
            <DayCalendar
              marked={Object.fromEntries(pastDays.map((d) => [d.date, shortMoney(d.revenue)]))}
              today={summary.today}
              selected={pickedDate}
              onSelect={pickDay}
            />
            {pickedDate && <PickedDay date={pickedDate} detail={dayDetails[pickedDate]} />}
          </>
        )}
      </section>
    </div>
  );
}
