import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../api/axios';

const SLOT_KEYS = ['morning', 'afternoon', 'evening'];
const SLOT_SHORT = { morning: 'S', afternoon: 'C', evening: 'T' };
const SLOT_FULL = { morning: 'Ca sáng 7:30–12:30', afternoon: 'Ca chiều 12:30–17:30', evening: 'Ca tối 17:30–22:30' };
const WEEKDAYS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

const pad = (n) => String(n).padStart(2, '0');
const toStr = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
function mondayOfToday() {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return toStr(d);
}
function shiftWeek(from, weeks) {
  const d = new Date(`${from}T00:00:00`);
  d.setDate(d.getDate() + weeks * 7);
  return toStr(d);
}
const dmy = (s) => (s ? `${s.slice(8, 10)}/${s.slice(5, 7)}/${s.slice(0, 4)}` : '—');
const dm = (s) => `${s.slice(8, 10)}/${s.slice(5, 7)}`;
const markKey = (id, date, slot) => `${id}|${date}|${slot}`;

const fmtMinutes = (m) => (m ? `${Math.floor(m / 60)}g${pad(m % 60)}` : '');
const fmtMoney = (n) => (n ? `${Number(n).toLocaleString('vi-VN')}đ` : '');

// ======================= Bảng chấm công chi tiết của một nhân viên (dạng bảng tính) =======================
// Chấm công = check-in (nhập PIN lúc mở ca) và check-out (kết ca). Lịch làm việc chỉ hiện để đối chiếu.
function EmployeeSheet({ id, initialMonth, prefill, onClose }) {
  const [month, setMonth] = useState(initialMonth);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ checkIn: '', checkOut: '' });
  // Mở từ lời nhắc của quầy: mở sẵn form "Thêm chấm công tay" với đúng ngày và ca bị thiếu.
  const [adding, setAdding] = useState(Boolean(prefill));
  const [add, setAdd] = useState({ workDate: prefill?.workDate || '', slot: prefill?.slot || 'morning', checkIn: '', checkOut: '' });

  useEffect(() => {
    setData(null);
    setError('');
    api.get(`/employees/${id}/attendance`, { params: { month } })
      .then(({ data: d }) => setData(d))
      .catch((err) => setError(err.response?.data?.message || 'Không tải được bảng chấm công'));
  }, [id, month, reloadKey]);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const today = toStr(new Date());
  const logs = data ? data.days.flatMap((d) => d.logs.map((l) => ({ ...l, date: d.date }))) : [];
  const reload = () => setReloadKey((k) => k + 1);

  function startEdit(l) {
    setEditId(l.id);
    setEdit({ checkIn: l.checkIn, checkOut: l.checkOut || '' });
    setError('');
  }

  async function saveEdit() {
    setError('');
    try {
      await api.patch(`/employees/timelogs/${editId}`, { checkIn: edit.checkIn, checkOut: edit.checkOut || null });
      setEditId(null);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Lưu thất bại');
    }
  }

  async function removeLog(l) {
    if (!confirm(`Xóa lần chấm công ${dm(l.date)} (${SLOT_FULL[l.slot]})?`)) return;
    setError('');
    try {
      await api.delete(`/employees/timelogs/${l.id}`);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Xóa thất bại');
    }
  }

  function openAdd() {
    setAdd({ workDate: today.slice(0, 7) === month ? today : `${month}-01`, slot: 'morning', checkIn: '', checkOut: '' });
    setAdding(true);
    setError('');
  }

  async function submitAdd(e) {
    e.preventDefault();
    setError('');
    try {
      await api.post(`/employees/${id}/timelogs`, { ...add, checkOut: add.checkOut || null });
      setAdding(false);
      reload();
    } catch (err) {
      setError(err.response?.data?.message || 'Thêm thất bại');
    }
  }

  return (
    <div className="emp-modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="emp-modal emp-modal-lg" role="dialog" aria-modal="true">
        <div className="emp-modal-head">
          <div>
            <h2>Bảng chấm công — {data ? data.employee.fullName : '...'}</h2>
            {data && (
              <p className="hint">
                {data.employee.phone ? `SĐT ${data.employee.phone} · ` : ''}Vào làm {dmy(data.employee.startDate)} · {data.employee.isActive ? 'Đang làm' : 'Đã nghỉ'}
              </p>
            )}
          </div>
          <button type="button" className="secondary" onClick={onClose}>Đóng ✕</button>
        </div>

        <label className="emp-inline-label">
          Tháng
          <input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} />
        </label>
        {error && <p className="error-text">{error}</p>}
        {!data && !error && <p className="hint">Đang tải...</p>}

        {data && (
          <>
            <div className="emp-summary">
              <span>Đã làm <strong>{data.totals.shifts}</strong> ca</span>
              <span><strong>{data.totals.daysWorked}</strong> ngày</span>
              <span>Sáng <strong>{data.totals.morning}</strong></span>
              <span>Chiều <strong>{data.totals.afternoon}</strong></span>
              <span>Tối <strong>{data.totals.evening}</strong></span>
              <span><strong>{Math.floor(data.totals.minutes / 60)}g{pad(data.totals.minutes % 60)}</strong> giờ làm</span>
              <span className={data.totals.lateMinutes ? 'ck-late' : ''}>Muộn <strong>{data.totals.lateMinutes}</strong> phút · phạt <strong>{Number(data.totals.latePenalty).toLocaleString('vi-VN')}đ</strong></span>
              <span>Xếp lịch <strong>{data.totals.plannedShifts}</strong> ca</span>
              <span className={data.totals.absentShifts ? 'ck-late' : ''}>Vắng <strong>{data.totals.absentShifts}</strong> ca</span>
            </div>
            {data.totals.openLogs > 0 && <p className="ck-late">Có {data.totals.openLogs} ca đã check-in nhưng chưa check-out (chưa tính giờ). Nhân viên check-out bằng PIN khi tan ca, hoặc bạn sửa giờ ra ở bảng bên dưới nếu họ quên.</p>}

            <div className="emp-sheet-wrap">
              <table className="emp-sheet">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th>Thứ</th>
                    <th>Ca sáng<small>7:30–12:30</small></th>
                    <th>Ca chiều<small>12:30–17:30</small></th>
                    <th>Ca tối<small>17:30–22:30</small></th>
                    <th>Số ca</th>
                    <th>Giờ làm</th>
                    <th>Muộn (phút)</th>
                    <th>Phạt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((d) => {
                    const late = d.logs.reduce((s, l) => s + l.lateMinutes, 0);
                    const pen = d.logs.reduce((s, l) => s + l.latePenalty, 0);
                    return (
                      <tr key={d.date} className={`${d.weekday >= 5 ? 'weekend' : ''} ${d.date === today ? 'today' : ''} ${d.logs.length ? 'worked' : ''}`}>
                        <td>{dm(d.date)}</td>
                        <td>{WEEKDAYS[d.weekday]}</td>
                        {SLOT_KEYS.map((sl) => {
                          const log = d.logs.find((l) => l.slot === sl);
                          if (log) {
                            return <td key={sl} className="cell-on">✔<small className="cell-time">{log.checkIn}–{log.checkOut || '…'}</small></td>;
                          }
                          if (d.absent.includes(sl)) return <td key={sl} className="cell-absent">✗<small className="cell-time">vắng</small></td>;
                          if (d.planned.includes(sl)) return <td key={sl} className="cell-plan"><small className="cell-time">có lịch</small></td>;
                          return <td key={sl} />;
                        })}
                        <td>{d.logs.length || ''}</td>
                        <td>{fmtMinutes(d.minutes)}</td>
                        <td className={late ? 'ck-late' : ''}>{late || ''}</td>
                        <td className={pen ? 'ck-late' : ''}>{fmtMoney(pen)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>Tổng cộng</td>
                    <td>{data.totals.morning}</td>
                    <td>{data.totals.afternoon}</td>
                    <td>{data.totals.evening}</td>
                    <td>{data.totals.shifts}</td>
                    <td>{fmtMinutes(data.totals.minutes)}</td>
                    <td>{data.totals.lateMinutes || ''}</td>
                    <td>{fmtMoney(data.totals.latePenalty)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <p className="hint">
              <strong className="legend-on">✔ giờ vào–giờ ra</strong>: đã chấm công (nhân viên nhập PIN check-in lúc vào ca và check-out lúc tan ca) ·{' '}
              <strong className="legend-absent">✗ vắng</strong>: có lịch nhưng không check-in ·{' '}
              <strong className="legend-plan">có lịch</strong>: đã xếp lịch, chưa tới giờ hoặc đang chờ. Chỉ ca có ✔ mới được tính giờ và đi muộn; ca chưa kết thì chưa tính giờ.
            </p>

            <div className="emp-log-head">
              <h3>Giờ vào / ra chi tiết</h3>
              {!adding && <button type="button" className="secondary" onClick={openAdd}>+ Thêm chấm công tay</button>}
            </div>
            {adding && (
              <form className="inline-form emp-addlog" onSubmit={submitAdd}>
                <input type="date" value={add.workDate} min={`${month}-01`} max={`${month}-31`} onChange={(e) => setAdd({ ...add, workDate: e.target.value })} required />
                <select value={add.slot} onChange={(e) => setAdd({ ...add, slot: e.target.value })}>
                  {SLOT_KEYS.map((k) => <option key={k} value={k}>{SLOT_FULL[k]}</option>)}
                </select>
                <label className="emp-inline-label">Vào <input type="time" value={add.checkIn} onChange={(e) => setAdd({ ...add, checkIn: e.target.value })} required /></label>
                <label className="emp-inline-label">Ra <input type="time" value={add.checkOut} onChange={(e) => setAdd({ ...add, checkOut: e.target.value })} /></label>
                <button type="submit">Thêm</button>
                <button type="button" className="secondary" onClick={() => setAdding(false)}>Hủy</button>
              </form>
            )}
            {logs.length === 0 ? <p className="hint">Tháng này chưa có lần chấm công nào. Nhân viên nhập PIN lúc mở ca là bắt đầu có chấm công; nếu quên check-in, bấm "Thêm chấm công tay".</p> : (
              <table className="data-table emp-logtable">
                <thead><tr><th>Ngày</th><th>Ca</th><th>Giờ vào</th><th>Giờ ra</th><th>Giờ làm</th><th>Muộn</th><th>Phạt</th><th></th></tr></thead>
                <tbody>
                  {logs.map((l) => (
                    <tr key={l.id}>
                      <td>{dm(l.date)}</td>
                      <td>{SLOT_FULL[l.slot]}</td>
                      {editId === l.id ? (
                        <>
                          <td><input type="time" value={edit.checkIn} onChange={(e) => setEdit({ ...edit, checkIn: e.target.value })} /></td>
                          <td><input type="time" value={edit.checkOut} onChange={(e) => setEdit({ ...edit, checkOut: e.target.value })} /></td>
                          <td colSpan={3} className="hint">Muộn và phạt tự tính lại khi lưu</td>
                          <td className="emp-actions">
                            <button type="button" onClick={saveEdit}>Lưu</button>
                            <button type="button" className="secondary" onClick={() => setEditId(null)}>Hủy</button>
                          </td>
                        </>
                      ) : (
                        <>
                          <td>{l.checkIn}</td>
                          <td>{l.checkOut || <span className="ck-late">chưa check-out</span>}</td>
                          <td>{l.minutes === null ? '—' : fmtMinutes(l.minutes) || '0'}</td>
                          <td className={l.lateMinutes ? 'ck-late' : ''}>{l.lateMinutes ? `${l.lateMinutes} phút` : 'đúng giờ'}</td>
                          <td className={l.latePenalty ? 'ck-late' : ''}>{fmtMoney(l.latePenalty)}</td>
                          <td className="emp-actions">
                            <button type="button" className="secondary" onClick={() => startEdit(l)}>Sửa giờ</button>
                            <button type="button" className="danger" onClick={() => removeLog(l)}>Xóa</button>
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ======================= Tab: danh sách nhân viên =======================
function EmployeeList({ onOpenSheet }) {
  const [month, setMonth] = useState(toStr(new Date()).slice(0, 7));
  const [employees, setEmployees] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ fullName: '', phone: '', startDate: toStr(new Date()) });
  const [editId, setEditId] = useState(null);
  const [edit, setEdit] = useState({ fullName: '', phone: '', startDate: '' });
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    api.get('/employees', { params: { month } })
      .then(({ data }) => setEmployees(data.employees))
      .finally(() => setLoading(false));
  }, [month]);

  useEffect(load, [load]);

  async function handleAdd(e) {
    e.preventDefault();
    setError('');
    setMessage('');
    try {
      await api.post('/employees', form);
      setForm({ fullName: '', phone: '', startDate: toStr(new Date()) });
      setMessage('Đã thêm nhân viên');
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Thêm nhân viên thất bại');
    }
  }

  function startEdit(emp) {
    setEditId(emp.id);
    setEdit({ fullName: emp.fullName, phone: emp.phone || '', startDate: emp.startDate || '' });
    setError('');
    setMessage('');
  }

  async function saveEdit(id) {
    setError('');
    try {
      await api.patch(`/employees/${id}`, edit);
      setEditId(null);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Lưu thất bại');
    }
  }

  // Đặt / đổi / xóa mã PIN để nhân viên tự check-in (4–6 chữ số, để trống = xóa PIN).
  async function setPin(emp) {
    const v = prompt(`Mã PIN mới cho ${emp.fullName} (4–6 chữ số).\nĐể trống rồi bấm OK để xóa PIN.`, '');
    if (v === null) return;
    setError('');
    setMessage('');
    try {
      await api.put(`/employees/${emp.id}/pin`, { pin: v.trim() });
      setMessage(v.trim() ? `Đã đặt PIN cho ${emp.fullName}` : `Đã xóa PIN của ${emp.fullName}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Đặt PIN thất bại');
    }
  }

  async function toggleActive(emp) {
    setError('');
    setMessage('');
    try {
      await api.patch(`/employees/${emp.id}`, { isActive: !emp.isActive });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Thao tác thất bại');
    }
  }

  async function handleDelete(emp) {
    if (!confirm(`Xóa nhân viên "${emp.fullName}"?`)) return;
    setError('');
    setMessage('');
    try {
      await api.delete(`/employees/${emp.id}`);
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Xóa thất bại');
    }
  }

  const working = employees.filter((e) => e.isActive).length;

  return (
    <div className="page-card">
      <h2 style={{ marginTop: 0 }}>Thêm nhân viên</h2>
      <form className="inline-form emp-form" onSubmit={handleAdd} style={{ marginTop: 0 }}>
        <input placeholder="Họ và tên" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} required />
        <input placeholder="Số điện thoại" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <label className="emp-inline-label">
          Ngày vào làm
          <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} required />
        </label>
        <button type="submit">Thêm nhân viên</button>
      </form>
      {message && <p className="emp-ok">{message}</p>}
      {error && <p className="error-text">{error}</p>}

      <div className="emp-list-head">
        <h2>Danh sách nhân viên <small className="hint">({working} đang làm / {employees.length} người)</small></h2>
        <label className="emp-inline-label">
          Tháng
          <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>

      {loading ? <p className="hint">Đang tải...</p> : employees.length === 0 ? (
        <p className="hint">Chưa có nhân viên nào.</p>
      ) : (
        <table className="data-table emp-table">
          <thead>
            <tr><th>#</th><th>Họ và tên</th><th>Số điện thoại</th><th>Ngày vào làm</th><th>Trạng thái</th><th>Mã PIN</th><th>Số ca đã chấm công tháng {month.slice(5)}/{month.slice(0, 4)}</th><th></th></tr>
          </thead>
          <tbody>
            {employees.map((emp, i) => (
              <tr key={emp.id} className={emp.isActive ? '' : 'emp-off'}>
                <td>{i + 1}</td>
                {editId === emp.id ? (
                  <>
                    <td><input value={edit.fullName} onChange={(e) => setEdit({ ...edit, fullName: e.target.value })} /></td>
                    <td><input value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} /></td>
                    <td><input type="date" value={edit.startDate} onChange={(e) => setEdit({ ...edit, startDate: e.target.value })} /></td>
                  </>
                ) : (
                  <>
                    <td><button type="button" className="emp-name-link" title="Xem bảng chấm công chi tiết" onClick={() => onOpenSheet(emp.id, month)}>{emp.fullName}</button></td>
                    <td>{emp.phone || '—'}</td>
                    <td>{dmy(emp.startDate)}</td>
                  </>
                )}
                <td><span className={`emp-badge ${emp.isActive ? 'on' : 'off'}`}>{emp.isActive ? 'Đang làm' : 'Đã nghỉ'}</span></td>
                <td>
                  <span className={`emp-badge ${emp.hasPin ? 'on' : 'off'}`}>{emp.hasPin ? 'Đã có PIN' : 'Chưa có'}</span>{' '}
                  <button type="button" className="secondary" onClick={() => setPin(emp)}>{emp.hasPin ? 'Đổi PIN' : 'Đặt PIN'}</button>
                </td>
                <td>{emp.shiftCount}</td>
                <td className="emp-actions">
                  {editId === emp.id ? (
                    <>
                      <button type="button" onClick={() => saveEdit(emp.id)}>Lưu</button>
                      <button type="button" className="secondary" onClick={() => setEditId(null)}>Hủy</button>
                    </>
                  ) : (
                    <>
                      <button type="button" className="secondary" onClick={() => startEdit(emp)}>Sửa</button>
                      <button type="button" className="secondary" onClick={() => toggleActive(emp)}>{emp.isActive ? 'Cho nghỉ việc' : 'Làm lại'}</button>
                      <button type="button" className="danger" onClick={() => handleDelete(emp)}>Xóa</button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="hint">Bấm vào tên nhân viên để xem bảng chấm công chi tiết. Nhân viên đã có chấm công thì không xóa được — hãy chọn "Cho nghỉ việc" để giữ lịch sử.</p>
    </div>
  );
}

// ======================= Tab: lịch làm việc (xếp ca theo tuần) =======================
// Chỉ là lịch dự kiến: chưa tính vào chấm công. Chấm công chỉ phát sinh khi nhân viên nhập PIN lúc mở ca.
function Schedule({ onOpenSheet }) {
  const [from, setFrom] = useState(mondayOfToday());
  const [data, setData] = useState(null);
  const [marks, setMarks] = useState(new Set());
  const [saved, setSaved] = useState(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const load = useCallback(() => {
    setData(null);
    api.get('/employees/schedule', { params: { from } }).then(({ data: d }) => {
      const set = new Set(d.marks.map((m) => markKey(m.employeeId, m.workDate, m.slot)));
      setData(d);
      setMarks(set);
      setSaved(new Set(set));
    });
  }, [from]);

  useEffect(load, [load]);

  const dirty = useMemo(() => {
    if (marks.size !== saved.size) return true;
    return [...marks].some((k) => !saved.has(k));
  }, [marks, saved]);

  function changeWeek(next) {
    if (dirty && !confirm('Lịch tuần này chưa lưu. Bỏ thay đổi và chuyển tuần?')) return;
    setError('');
    setMessage('');
    setFrom(next);
  }

  function toggle(id, date, slot) {
    setMessage('');
    setMarks((prev) => {
      const next = new Set(prev);
      const k = markKey(id, date, slot);
      if (next.has(k)) next.delete(k); else next.add(k);
      return next;
    });
  }

  async function handleSave() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const list = [...marks].map((k) => {
        const [employeeId, workDate, slot] = k.split('|');
        return { employeeId: Number(employeeId), workDate, slot };
      });
      await api.put('/employees/schedule', { from: data.from, marks: list });
      setSaved(new Set(marks));
      setMessage('Đã lưu lịch làm việc tuần này');
    } catch (err) {
      setError(err.response?.data?.message || 'Lưu thất bại');
    } finally {
      setSaving(false);
    }
  }

  const today = toStr(new Date());
  const weekCount = (id) => data.days.reduce((s, d) => s + SLOT_KEYS.filter((sl) => marks.has(markKey(id, d, sl))).length, 0);
  const dayCount = (date) => data.employees.reduce((s, e) => s + SLOT_KEYS.filter((sl) => marks.has(markKey(e.id, date, sl))).length, 0);

  return (
    <div className="page-card">
      <h2 style={{ marginTop: 0 }}>Xếp lịch làm việc theo tuần</h2>
      <div className="emp-weekbar">
        <button type="button" className="secondary" onClick={() => changeWeek(shiftWeek(from, -1))}>‹ Tuần trước</button>
        <button type="button" className="secondary" onClick={() => changeWeek(mondayOfToday())}>Tuần này</button>
        <button type="button" className="secondary" onClick={() => changeWeek(shiftWeek(from, 1))}>Tuần sau ›</button>
        {data && <strong className="emp-weeklabel">Tuần {dm(data.from)} – {dmy(data.to)}</strong>}
      </div>
      {!data ? <p className="hint">Đang tải...</p> : data.employees.length === 0 ? (
        <p className="hint">Chưa có nhân viên nào — hãy thêm nhân viên ở tab Danh sách nhân viên.</p>
      ) : (
        <div className="emp-grid-wrap">
          <table className="emp-grid">
            <thead>
              <tr>
                <th className="emp-name-col">Nhân viên</th>
                {data.days.map((d, i) => (
                  <th key={d} className={d === today ? 'emp-today' : ''}>{WEEKDAYS[i]}<small>{dm(d)}</small></th>
                ))}
                <th>Ca xếp</th>
              </tr>
            </thead>
            <tbody>
              {data.employees.map((emp) => (
                <tr key={emp.id} className={emp.isActive ? '' : 'emp-off'}>
                  <td className="emp-name-col">
                    <button type="button" className="emp-name-link" title="Xem bảng chấm công chi tiết cả tháng" onClick={() => onOpenSheet(emp.id, from.slice(0, 7))}>{emp.fullName}</button>
                    {!emp.isActive && <small> (đã nghỉ)</small>}
                  </td>
                  {data.days.map((d) => (
                    <td key={d} className={d === today ? 'emp-today' : ''}>
                      <div className="emp-slots">
                        {SLOT_KEYS.map((sl) => (
                          <button
                            key={sl}
                            type="button"
                            title={SLOT_FULL[sl]}
                            className={`emp-slot ${marks.has(markKey(emp.id, d, sl)) ? 'on' : ''}`}
                            onClick={() => toggle(emp.id, d, sl)}
                          >
                            {SLOT_SHORT[sl]}
                          </button>
                        ))}
                      </div>
                    </td>
                  ))}
                  <td className="emp-total">{weekCount(emp.id)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td className="emp-name-col">Số ca mỗi ngày</td>
                {data.days.map((d) => <td key={d} className="emp-total">{dayCount(d)}</td>)}
                <td className="emp-total">{data.days.reduce((s, d) => s + dayCount(d), 0)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {data && data.employees.length > 0 && (
        <div className="emp-savebar">
          <button type="button" onClick={handleSave} disabled={saving || !dirty}>{saving ? 'Đang lưu...' : 'Lưu lịch tuần'}</button>
          {dirty && <span className="emp-dirty">Có thay đổi chưa lưu</span>}
          {message && <span className="emp-ok">{message}</span>}
          {error && <span className="error-text">{error}</span>}
        </div>
      )}
    </div>
  );
}

export default function Staff() {
  const [params, setParams] = useSearchParams();
  const [tab, setTab] = useState('list');
  // { id, month, prefill? } — nhân viên đang xem bảng chấm công chi tiết.
  // Mở từ chuông (?open=ID&month=&date=&slot=): hiện bảng của nhân viên đó với form thêm chấm công điền sẵn.
  const [sheet, setSheet] = useState(() => (params.get('open')
    ? { id: Number(params.get('open')), month: params.get('month') || toStr(new Date()).slice(0, 7), prefill: params.get('date') ? { workDate: params.get('date'), slot: params.get('slot') || 'morning' } : null }
    : null));
  useEffect(() => { if (params.get('open')) setParams({}, { replace: true }); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const openSheet = (id, month) => setSheet({ id, month });
  const closeSheet = useCallback(() => setSheet(null), []);
  return (
    <div className="page page-wide">
      <h1>Quản lý nhân viên</h1>
      <div className="emp-tabs">
        <button type="button" className={tab === 'list' ? 'active' : ''} onClick={() => setTab('list')}>Danh sách nhân viên</button>
        <button type="button" className={tab === 'schedule' ? 'active' : ''} onClick={() => setTab('schedule')}>Lịch làm việc</button>
      </div>
      {tab === 'list' ? <EmployeeList onOpenSheet={openSheet} /> : <Schedule onOpenSheet={openSheet} />}
      {sheet && <EmployeeSheet key={`${sheet.id}`} id={sheet.id} initialMonth={sheet.month} prefill={sheet.prefill} onClose={closeSheet} />}
    </div>
  );
}
