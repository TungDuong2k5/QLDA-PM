import { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Link } from 'react-router-dom';
import api from '../api/axios';

const pad = (n) => String(n).padStart(2, '0');
const hm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const money = (n) => `${Number(n).toLocaleString('vi-VN')}đ`;

// Danh sách nhân viên để check-in / check-out bằng mã PIN.
//  - Check-in: chỉ người có lịch làm việc hôm nay, đúng ca đang chạy.
//  - Check-out: nút chỉ hiện khi tới giờ tan ca của ca đang làm; từng người tự check-out. Kết ca bán hàng không check-out hộ.
// onChange({ inCount, outCount, canInCount }) báo số người đang trong ca / đến giờ tan ca / đang check-in được.
export default function CheckinPanel({ onChange }) {
  const [data, setData] = useState(null);
  const [dialog, setDialog] = useState(null); // { type: 'in' | 'out' | 'undo', emp }
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(() => api.get('/timeclock').then(({ data: d }) => {
    setData(d);
    if (onChange) {
      onChange({
        inCount: d.employees.filter((e) => e.state === 'in').length,
        // Người đã check-in ĐÚNG CA ĐANG CHẠY (điều kiện để mở ca); người còn "trong ca" từ ca trước không tính.
        slotInCount: d.employees.filter((e) => e.logs.some((l) => !l.checkOutAt && (!d.checkinSlot || l.slot === d.checkinSlot))).length,
        slotLabel: d.checkinSlot ? d.slots[d.checkinSlot].label.toLowerCase() : null,
        outCount: d.employees.filter((e) => e.canCheckout).length,
        canInCount: d.employees.filter((e) => e.canCheckin).length,
      });
    }
  }), [onChange]);

  useEffect(() => {
    load();
    const timer = setInterval(load, 20000);
    window.addEventListener('timeclock-changed', load); // check-out làm từ thông báo tan ca ở nơi khác
    return () => { clearInterval(timer); window.removeEventListener('timeclock-changed', load); };
  }, [load]);

  const [remindingKey, setRemindingKey] = useState(null);

  // Nhắc quản lý về nhân viên có lịch ca đã qua mà chưa check-in.
  async function remind(emp, slot) {
    setRemindingKey(`${emp.id}-${slot}`);
    try {
      await api.post('/timeclock/remind', { employeeId: emp.id, slot });
      setNotice(`Đã nhắc quản lý: ${emp.fullName} chưa check-in ${data.slots[slot].label.toLowerCase()}`);
      window.dispatchEvent(new Event('timeclock-changed'));
    } catch (err) {
      setNotice(err.response?.data?.message || 'Nhắc quản lý thất bại');
    } finally {
      setRemindingKey(null);
    }
  }

  function openDialog(type, emp) {
    setDialog({ type, emp });
    setPin('');
    setError('');
  }

  async function confirm(e) {
    // Panel nằm trong form mở ca: không để sự kiện submit của hộp thoại PIN lọt ra form ngoài.
    e.preventDefault();
    e.stopPropagation();
    const { type, emp } = dialog;
    setBusy(true);
    setError('');
    try {
      if (type === 'in') {
        const { data: log } = await api.post('/timeclock/checkin', { employeeId: emp.id, pin });
        const label = data.slots[log.slot].label;
        if (log.lateMinutes > 0) {
          setNotice(`✔ ${emp.fullName} đã check-in ${label} lúc ${hm(log.checkInAt)} — quá hạn ${data.graceMinutes} phút, tính muộn ${log.lateMinutes} phút, phạt ${money(log.latePenalty)}`);
        } else {
          setNotice(`✔ ${emp.fullName} đã check-in ${label} lúc ${hm(log.checkInAt)} — đúng giờ`);
        }
      } else if (type === 'out') {
        const { data: log } = await api.post('/timeclock/checkout', { employeeId: emp.id, pin });
        const h = Math.floor(log.workedMinutes / 60);
        setNotice(`✔ ${emp.fullName} đã check-out lúc ${hm(log.checkOutAt)} — làm ${h > 0 ? `${h} giờ ` : ''}${log.workedMinutes % 60} phút. Cảm ơn nhé!`);
      } else {
        await api.post('/timeclock/undo', { employeeId: emp.id, pin });
        setNotice(`Đã hủy check-in của ${emp.fullName}`);
      }
      setDialog(null);
      window.dispatchEvent(new Event('timeclock-changed'));
    } catch (err) {
      setError(err.response?.data?.message || 'Thao tác thất bại');
    } finally {
      setBusy(false);
    }
  }

  if (!data) return <p className="hint">Đang tải danh sách nhân viên...</p>;
  if (data.employees.length === 0) return <p className="hint">Chưa có nhân viên nào — quản lý thêm ở mục Nhân viên.</p>;

  // Đến giờ tan ca lên đầu; rồi người check-in được; đang làm; đã xong ca xuống cuối.
  const rank = (e) => (e.canCheckout ? -1 : e.state === 'in' ? 2 : e.state === 'done' ? 3 : e.canCheckin ? 0 : 1);
  const employees = [...data.employees].sort((a, b) => rank(a) - rank(b) || a.fullName.localeCompare(b.fullName, 'vi'));

  const cur = data.checkinSlot ? data.slots[data.checkinSlot] : null;
  const deadline = data.onTimeUntil ? hm(data.onTimeUntil) : null;
  const titles = { in: 'Check-in', out: 'Check-out (tan ca)', undo: 'Hủy check-in nhầm' };

  return (
    <div className="ck-panel">
      {notice &&<p className="ck-notice" onClick={() => setNotice('')}>{notice}</p>}
      {data.blockingShift && (
        <p className="ck-block">
          ⚠ {data.blockingShift.label}{data.blockingShift.businessDate !== data.date ? ` (${data.blockingShift.businessDate.slice(8, 10)}/${data.blockingShift.businessDate.slice(5, 7)})` : ''} chưa kết ca — ca nào kết xong thì ca sau mới check-in được.
          {' '}<Link to="/dashboard">Kết ca ở Bảng điều khiển</Link>
        </p>
      )}
      {employees.map((emp) => {
        const open = emp.logs.find((l) => !l.checkOutAt);
        const recent = open && (Date.now() - new Date(open.checkInAt).getTime()) <= data.undoWindowMinutes * 60000;
        return (
          <div key={emp.id} className={`ck-row ck-${emp.state} ${emp.canCheckout ? 'ck-time-out' : ''}`}>
            <div>
              <div className="ck-name">
                {emp.fullName}
                {emp.plannedSlots.length > 0 && <span className="ck-tag">có lịch {emp.plannedSlots.map((s) => data.slots[s].label.toLowerCase()).join(', ')}</span>}
                {!emp.hasPin && <small title="Chưa đặt mã PIN, ai cũng bấm hộ được"> · chưa có PIN</small>}
              </div>
              <div className="ck-sub">
                {emp.state === 'out' && (
                  emp.waitingShift
                    ? 'Chờ kết ca trước mới check-in được'
                    : emp.plannedSlots.length === 0
                    ? 'Được nghỉ' // hôm nay không có lịch làm
                    : emp.canCheckin
                      ? 'Chưa check-in'
                      : emp.upcoming.length > 0
                        ? 'Chưa đến giờ check-in' // có lịch ca sau, chưa tới giờ
                        : 'Chưa check-in'
                )}
                {emp.state === 'in' && (
                  <>
                    Đã check-in {data.slots[open.slot].label.toLowerCase()} lúc {hm(open.checkInAt)}
                    {open.lateMinutes > 0 && <b className="ck-late"> · muộn {open.lateMinutes} phút</b>}
                    {emp.canCheckout
                      ? <b className="ck-out-now"> · đã đến giờ tan ca ({hm(emp.checkoutAt)})</b>
                      : emp.checkoutWaitingShift
                        ? <b className="ck-late"> · hết giờ ca nhưng chưa kết ca bán hàng — kết ca xong mới check-out được</b>
                        : <> · tan ca lúc {hm(emp.checkoutAt)}</>}
                  </>
                )}
                {emp.state === 'done' && 'Đã xong ca: ' + emp.logs.filter((l) => l.checkOutAt).map((l) => `${hm(l.checkInAt)}–${hm(l.checkOutAt)}`).join(', ')}
              </div>
              {/* Ca có lịch đã qua giờ mà chưa check-in: nhắc quản lý xử lý (thêm chấm công tay). */}
              {emp.missed.map((m) => (
                <div key={m.slot} className="ck-missed">
                  <span>Chưa check-in {data.slots[m.slot].label.toLowerCase()} (đã qua giờ)</span>
                  <button type="button" className="secondary" disabled={m.reminded || remindingKey === `${emp.id}-${m.slot}`} onClick={() => remind(emp, m.slot)}>
                    {m.reminded ? '✔ Đã nhắc quản lý' : 'Nhắc quản lý'}
                  </button>
                </div>
              ))}
            </div>
            <div className="ck-actions">
              {emp.state !== 'in' && (
                <button type="button" disabled={!emp.canCheckin} onClick={() => openDialog('in', emp)}>Check-in</button>
              )}
              {emp.state === 'in' && (
                <button
                  type="button"
                  className={emp.canCheckout ? 'danger' : 'secondary'}
                  disabled={!emp.canCheckout}
                  title={emp.checkoutReason || undefined}
                  onClick={() => openDialog('out', emp)}
                >
                  Check-out
                </button>
              )}
              {recent && <button type="button" className="secondary" onClick={() => openDialog('undo', emp)}>Hủy nhầm</button>}
            </div>
          </div>
        );
      })}

      {dialog && createPortal(
        <div className="emp-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setDialog(null); }}>
          <form className="emp-modal ck-dialog" onSubmit={confirm}>
            <h2 style={{ marginTop: 0 }}>{titles[dialog.type]}</h2>
            <p><strong>{dialog.emp.fullName}</strong></p>
            {dialog.type === 'in' && cur && <p className="hint">Check-in vào <strong>{cur.label}</strong> (ca đang chạy). Đúng giờ nếu trước {deadline}; sau đó phạt {money(data.latePenaltyPerMinute)}/phút muộn.</p>}
            {dialog.type === 'out' && <p className="hint">Check-out khi tan ca. Giờ làm tính từ lúc check-in đến bây giờ.</p>}
            {dialog.emp.hasPin ? (
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
    </div>
  );
}
