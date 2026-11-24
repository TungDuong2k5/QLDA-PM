import { useCallback, useEffect, useMemo, useState } from 'react';
import { Navigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';

const pad = (n) => String(n).padStart(2, '0');
const WEEKDAY = ['Chủ nhật', 'Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7'];
const dayLabel = (s) => {
  const d = new Date(`${s}T00:00:00`);
  return `${WEEKDAY[d.getDay()]}, ${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
};
const hhmm = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const num = (n) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 3 }).format(n);
const signed = (n) => (n > 0 ? `+${num(n)}` : num(n));

const STATUS_TEXT = { submitted: 'Chờ quản lý duyệt', approved: 'Đã duyệt', rejected: 'Yêu cầu kiểm lại' };
const SLOT_STATE_TEXT = { upcoming: 'Chưa bắt đầu', running: 'Đang chạy', ended: 'Đã hết giờ' };

// Trạng thái kiểm kho của một ca: dùng cho nút chọn ca.
function slotChip(s) {
  if (s.check) return <StatusChip status={s.check.status} />;
  if (s.due) return <span className="status-chip rejected">Cần kiểm kho</span>;
  return <span className="status-chip slot-state">{SLOT_STATE_TEXT[s.state]}</span>;
}
const KIND_TITLE = { ingredient: 'Nguyên liệu', product: 'Bánh & đồ ăn vặt' };

function DiffText({ value }) {
  if (value === 0) return <span className="hint">—</span>;
  return <strong className={value < 0 ? 'diff-neg' : 'diff-pos'}>{signed(value)}</strong>;
}

function StatusChip({ status }) {
  return <span className={`status-chip ${status}`}>{STATUS_TEXT[status]}</span>;
}

// ---------------------------------------------------------------- Nhân viên
function StaffView() {
  const [data, setData] = useState(null);       // { date, check, template }
  const [counts, setCounts] = useState({});     // { 'kind:refId': '12' }
  const [note, setNote] = useState('');
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [slot, setSlot] = useState(null);

  const load = useCallback((pick) => {
    const target = typeof pick === 'string' ? pick : slot;
    api.get('/stock-checks/today', { params: target ? { slot: target } : {} }).then(({ data: d }) => {
      setData(d);
      setSlot(d.slot);
      setEditing(!d.check);
      setNote(d.check?.note || '');
      const init = {};
      for (const it of d.check?.items || []) init[`${it.kind}:${it.refId}`] = String(it.countedQty);
      setCounts(init);
    });
  }, [slot]);
  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Khi đã gửi phiếu: tự cập nhật để thấy hàng quản lý nhập thêm (không đụng vào ô đang gõ).
  useEffect(() => {
    if (editing || !data?.check) return undefined;
    const timer = setInterval(() => api.get('/stock-checks/today', { params: { slot } }).then(({ data: d }) => setData(d)).catch(() => {}), 15000);
    return () => clearInterval(timer);
  }, [editing, data?.check, slot]);

  const groups = useMemo(() => {
    const g = { ingredient: [], product: [] };
    for (const t of data?.template || []) g[t.kind].push(t);
    return g;
  }, [data]);

  if (!data) return <p>Đang tải...</p>;
  const { check } = data;
  const curSlot = data.slots.find((s) => s.slot === data.slot);
  const upcoming = curSlot?.state === 'upcoming';
  const locked = check?.status === 'approved';
  const filled = data.template.filter((t) => counts[`${t.kind}:${t.refId}`] !== undefined && counts[`${t.kind}:${t.refId}`] !== '').length;

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await api.post('/stock-checks', {
        slot: data.slot,
        note,
        items: data.template.map((t) => ({ kind: t.kind, refId: t.refId, countedQty: counts[`${t.kind}:${t.refId}`] })),
      });
      load();
    } catch (err) {
      setError(err.response?.data?.message || 'Gửi phiếu thất bại');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="page">
      <h1>Kiểm kho cuối ca</h1>
      <div className="page-card">
        <div className="slot-tabs">
          {data.slots.map((s) => (
            <button
              key={s.slot}
              type="button"
              className={`slot-tab ${s.slot === data.slot ? 'active' : ''} ${s.due ? 'due' : ''}`}
              disabled={!s.canCount}
              onClick={() => { setError(''); setEditing(false); load(s.slot); }}
            >
              <strong>{s.label}</strong>
              <small>{s.start}–{s.end}</small>
              {slotChip(s)}
            </button>
          ))}
        </div>
        <div className="live-head" style={{ margin: '12px 0 8px' }}>
          <strong>{data.slotLabel} · {dayLabel(data.date)}</strong>
          {check && <StatusChip status={check.status} />}
        </div>

        {upcoming && <p className="hint">{data.slotLabel} chưa bắt đầu nên chưa kiểm kho được.</p>}
        {!check && curSlot?.due && <p className="error-text">{data.slotLabel} đã hết giờ lúc {curSlot.end} — cần đếm kho và gửi phiếu cho quản lý.</p>}
        {!check && !upcoming && <p className="hint">Khi hết ca, đếm số lượng thực tế còn lại trong kho rồi gửi báo cáo cho quản lý. Số bạn đếm được ghi nhận là tồn kho còn lại. Bánh và đồ ăn vặt khách đã mua được hệ thống tự ghi ở cột "Đã bán" và tự tính vào chênh lệch (chênh lệch = số đếm − tồn hệ thống − đã bán; số âm là hàng đã xuất ra, gồm cả hàng bán). Nhập đủ tất cả các mục. Việc nhập thêm hàng do quản lý làm — hàng quản lý nhập sẽ tự cộng vào báo cáo của bạn.</p>}
        {check?.status === 'submitted' && !editing && <p className="hint">Đã gửi lúc {hhmm(check.submittedAt)} — đang chờ quản lý kiểm tra. Nếu quản lý nhập thêm hàng, số nhập sẽ tự hiện ở cột "Quản lý đã nhập". Nếu đếm nhầm, bấm "Sửa phiếu" để gửi lại.</p>}
        {check?.status === 'rejected' && (
          <p className="error-text">Quản lý yêu cầu kiểm lại{check.reviewNote ? `: ${check.reviewNote}` : ''}. Đếm lại rồi gửi lại phiếu.</p>
        )}
        {check && check.pendingItems?.length > 0 && !editing && !locked && (
          <p className="error-text">
            Có {check.pendingItems.length} mục mới thêm vào kho sau khi bạn gửi phiếu: {check.pendingItems.map((i) => i.name).join(', ')}. Bấm "Sửa phiếu" để đếm bổ sung rồi gửi lại.
          </p>
        )}
        {check && check.pendingItems?.length > 0 && locked && (
          <p className="hint">Mục mới thêm vào kho sau phiếu này ({check.pendingItems.map((i) => i.name).join(', ')}) sẽ được đếm ở phiếu của ca kế tiếp.</p>
        )}
        {check?.status === 'approved' && (
          <p className="hint">Quản lý đã duyệt{check.reviewedBy ? ` (${check.reviewedBy})` : ''} lúc {hhmm(check.reviewedAt)}.{check.reviewNote ? ` Ghi chú: ${check.reviewNote}` : ''}</p>
        )}

        {editing && !locked && !upcoming ? (
          <form onSubmit={submit}>
            {['ingredient', 'product'].map((kind) => groups[kind].length > 0 && (
              <div key={kind} className="shift-section">
                <div className="shift-section-title">{KIND_TITLE[kind]} ({groups[kind].length})</div>
                <table className="data-table">
                  <thead><tr><th>Tên</th><th>Tồn hệ thống</th>{kind === 'product' && <th>Đã bán (tự động)</th>}<th style={{ width: 200 }}>Số đếm thực tế</th><th>Chênh lệch</th></tr></thead>
                  <tbody>
                    {groups[kind].map((t) => {
                      const key = `${t.kind}:${t.refId}`;
                      return (
                        <tr key={key}>
                          <td>{t.name}</td>
                          <td>{num(t.systemQty)}{t.unit ? ` ${t.unit}` : ''}</td>
                          {kind === 'product' && <td>{t.soldQty > 0 ? <strong>{num(t.soldQty)}</strong> : '—'}</td>}
                          <td>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              inputMode="decimal"
                              required
                              value={counts[key] ?? ''}
                              onChange={(e) => setCounts((c) => ({ ...c, [key]: e.target.value }))}
                              style={{ width: 110 }}
                            />
                            {t.unit && <span className="hint" style={{ marginLeft: 6 }}>{t.unit}</span>}
                          </td>
                          <td>{counts[key] === undefined || counts[key] === '' ? '—' : <DiffText value={Math.round((Number(counts[key]) - t.systemQty - (t.soldQty || 0)) * 1000) / 1000} />}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
            {data.template.length === 0 && <p className="hint">Chưa có nguyên liệu hay món nào để kiểm.</p>}
            <input
              placeholder="Ghi chú cho quản lý (nếu có: hư hỏng, hao hụt, ...)"
              value={note}
              maxLength={250}
              onChange={(e) => setNote(e.target.value)}
              style={{ width: '100%', marginTop: 8 }}
            />
            {error && <p className="error-text">{error}</p>}
            <div className="recipe-actions" style={{ marginTop: 10 }}>
              <button type="submit" disabled={busy || data.template.length === 0}>{busy ? 'Đang gửi...' : 'Gửi cho quản lý'}</button>
              <span className="hint">Đã nhập {filled}/{data.template.length} mục</span>
              {check && <button type="button" className="secondary" onClick={() => { setEditing(false); load(); }}>Hủy sửa</button>}
            </div>
          </form>
        ) : (
          check && (
            <>
              {['ingredient', 'product'].map((kind) => {
                const rows = check.items.filter((i) => i.kind === kind);
                const pend = (check.pendingItems || []).filter((i) => i.kind === kind);
                return (rows.length > 0 || pend.length > 0) && (
                  <div key={kind} className="shift-section">
                    <div className="shift-section-title">{KIND_TITLE[kind]} ({rows.length + pend.length})</div>
                    <table className="data-table">
                      <thead><tr><th>Tên</th><th>Tồn hệ thống</th><th>Đã bán</th><th>Số đếm</th><th>Chênh lệch</th><th>Quản lý đã nhập</th><th>Bán sau khi đếm</th><th>Tồn hiện tại</th></tr></thead>
                      <tbody>
                        {pend.map((r) => (
                          <tr key={`new${r.kind}${r.refId}`} className="stock-diff">
                            <td>{r.name} <span className="status-chip submitted">Mục mới</span></td>
                            <td>{num(r.systemQty)}{r.unit ? ` ${r.unit}` : ''}</td>
                            <td colSpan={5}><strong className="diff-neg">Chưa đếm</strong></td>
                            <td>{num(r.currentQty)}{r.unit ? ` ${r.unit}` : ''}</td>
                          </tr>
                        ))}
                        {rows.map((r) => (
                          <tr key={`${r.kind}${r.refId}`} className={r.diff !== 0 ? 'stock-diff' : ''}>
                            <td>{r.name}</td>
                            <td>{num(r.systemQty)}{r.unit ? ` ${r.unit}` : ''}</td>
                            <td>{r.soldQty > 0 ? num(r.soldQty) : '—'}</td>
                            <td>{num(r.countedQty)}{r.unit ? ` ${r.unit}` : ''}</td>
                            <td><DiffText value={r.diff} /></td>
                            <td>{r.importedQty > 0 ? <strong className="diff-pos">+{num(r.importedQty)}</strong> : '—'}</td>
                            <td>{r.soldAfterQty > 0 ? <strong className="diff-neg">−{num(r.soldAfterQty)}</strong> : '—'}</td>
                            <td>{r.currentQty === null ? '—' : `${num(r.currentQty)}${r.unit ? ` ${r.unit}` : ''}`}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })}
              {check.note && <p className="hint">Ghi chú của bạn: {check.note}</p>}
              {!locked && <button type="button" onClick={() => setEditing(true)}>Sửa phiếu</button>}
            </>
          )
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Quản lý
export function AdminView({ embedded = false }) {
  const [params, setParams] = useSearchParams();
  const [checks, setChecks] = useState(null);
  const [detail, setDetail] = useState(null);
  const [onlyDiff, setOnlyDiff] = useState(false);
  const [reviewNote, setReviewNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [importQty, setImportQty] = useState({});   // { 'kind:refId': '5' }
  const [importBusy, setImportBusy] = useState(null);
  const openId = Number(params.get('open')) || null;
  const [overview, setOverview] = useState(null);   // { date, slots, template } — hôm nay, cả ca chưa có phiếu
  const [preview, setPreview] = useState(null);     // ca hôm nay chưa có phiếu đang xem danh sách cần đếm

  const loadOverview = useCallback(() => api.get('/stock-checks/today').then(({ data }) => setOverview(data)).catch(() => {}), []);
  const loadList = useCallback(() => { loadOverview(); return api.get('/stock-checks').then(({ data }) => setChecks(data)); }, [loadOverview]);
  useEffect(() => { loadList(); }, [loadList]);
  useEffect(() => {
    const timer = setInterval(loadOverview, 15000);
    window.addEventListener('stock-changed', loadOverview);
    return () => { clearInterval(timer); window.removeEventListener('stock-changed', loadOverview); };
  }, [loadOverview]);

  // Tự mở phiếu được chọn; nếu chưa chọn thì mở phiếu chờ duyệt mới nhất.
  useEffect(() => {
    if (!checks) return;
    if (preview && !openId) { setDetail(null); return; }
    const id = openId || checks.find((c) => c.status === 'submitted')?.id;
    if (!id) { setDetail(null); return; }
    api.get(`/stock-checks/${id}`).then(({ data }) => { setDetail(data); setReviewNote(''); setError(''); }).catch(() => setDetail(null));
  }, [checks, openId, preview]);

  // Quản lý nhập thêm hàng ngay trên phiếu; số nhập tự cộng vào tồn kho và vào báo cáo của nhân viên.
  async function importGoods(r) {
    const key = `${r.kind}:${r.refId}`;
    const qty = Number(importQty[key]);
    if (!qty || qty <= 0) { setError('Nhập số lượng hợp lệ'); return; }
    setError('');
    setImportBusy(key);
    try {
      const url = r.kind === 'ingredient' ? `/ingredients/${r.refId}/movements` : `/products/${r.refId}/movements`;
      await api.post(url, { type: 'in', quantity: qty, note: 'Nhập theo phiếu kiểm kho' });
      setImportQty((m) => ({ ...m, [key]: '' }));
      window.dispatchEvent(new Event('stock-changed'));
      const { data } = await api.get(`/stock-checks/${detail.id}`);
      setDetail(data);
    } catch (err) {
      setError(err.response?.data?.message || 'Nhập kho thất bại');
    } finally {
      setImportBusy(null);
    }
  }

  async function review(action) {
    setError('');
    setBusy(true);
    try {
      await api.patch(`/stock-checks/${detail.id}/review`, { action, note: reviewNote });
      window.dispatchEvent(new Event('stock-changed'));
      setPreview(null);
      setParams({ tab: 'check', open: String(detail.id) }); // ở lại phiếu vừa xử lý để xem kết quả
      await loadList();
    } catch (err) {
      setError(err.response?.data?.message || 'Thao tác thất bại');
    } finally {
      setBusy(false);
    }
  }

  if (!checks) return <p>Đang tải...</p>;
  const previewSlot = preview && overview ? overview.slots.find((s) => s.slot === preview) : null;
  const todayStr = (() => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; })();
  const canImport = !!detail && detail.businessDate === todayStr;
  const rows = detail ? (onlyDiff ? detail.items.filter((i) => i.diff !== 0) : detail.items) : [];

  return (
    <div className={embedded ? '' : 'page page-wide'}>
      {!embedded && <h1>Kiểm kho cuối ca</h1>}
      <div className="page-card" style={{ marginBottom: 12 }}>
      <p className="hint">Cuối mỗi ca (sáng, chiều, tối) nhân viên đếm kho và gửi phiếu về đây. Nguyên liệu, bánh, đồ ăn vặt mới thêm tự vào danh sách cần đếm. Số đếm là hàng còn lại thật nên tồn kho được cập nhật bằng số đếm ngay khi gửi; chênh lệch là phần đã xuất ra, gồm bánh và đồ ăn vặt khách đã mua (cột "Đã bán", tự động từ hóa đơn) và phần nhân viên xuất khác. Bạn xem lại, nhập thêm hàng ngay trên phiếu nếu cần (số nhập tự cộng vào tồn kho và hiện trong báo cáo của nhân viên), rồi duyệt hoặc yêu cầu kiểm lại (tồn kho trở về trước khi đếm cho tới khi nhân viên đếm lại).</p>
      </div>

      <div className="stockcheck-layout">
        <div className="page-card">
          {overview && (
            <>
              <h2 style={{ marginTop: 0 }}>Hôm nay · {dayLabel(overview.date)}</h2>
              <ul className="stockcheck-list" style={{ marginBottom: 16 }}>
                {overview.slots.map((s) => (
                  <li key={s.slot}>
                    <button
                      type="button"
                      className={`stockcheck-row ${(s.check && detail?.id === s.check.id) || (!s.check && preview === s.slot && !detail) ? 'active' : ''}`}
                      disabled={!s.check && !s.canCount}
                      onClick={() => {
                        if (s.check) { setPreview(null); setParams({ tab: 'check', open: String(s.check.id) }); } else { setPreview(s.slot); setParams({ tab: 'check' }); }
                      }}
                    >
                      <span><strong>{s.label}</strong><br /><small>{s.start}–{s.end}{s.check ? ` · ${s.check.diffCount > 0 ? `${s.check.diffCount} mục lệch` : 'khớp hết'}` : ''}</small></span>
                      {slotChip(s)}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
          <h2 style={{ marginTop: 0 }}>Các phiếu</h2>
          {checks.length === 0 ? <p className="hint">Chưa có phiếu kiểm kho nào.</p> : (
            <ul className="stockcheck-list">
              {checks.map((c) => (
                <li key={c.id}>
                  <button type="button" className={`stockcheck-row ${detail?.id === c.id ? 'active' : ''}`} onClick={() => { setPreview(null); setParams({ tab: 'check', open: String(c.id) }); }}>
                    <span><strong>{c.slotLabel} · {dayLabel(c.businessDate)}</strong><br /><small>{c.submittedBy || '—'} · {hhmm(c.submittedAt)} · {c.diffCount > 0 ? `${c.diffCount} mục lệch` : 'khớp hết'}</small></span>
                    <StatusChip status={c.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="page-card">
          {!detail && previewSlot && overview ? (
            <>
              <div className="live-head" style={{ marginBottom: 6 }}>
                <h2 style={{ margin: 0 }}>{previewSlot.label} · {dayLabel(overview.date)}</h2>
                {slotChip(previewSlot)}
              </div>
              <p className="hint" style={{ marginTop: 0 }}>
                {previewSlot.due ? `${previewSlot.label} đã hết giờ nhưng nhân viên chưa gửi phiếu.` : `${previewSlot.label} chưa có phiếu.`} Dưới đây là danh sách nhân viên cần đếm ({overview.template.length} mục, gồm cả nguyên liệu và món mới thêm) kèm tồn hệ thống hiện tại.
              </p>
              {['ingredient', 'product'].map((kind) => {
                const rows = overview.template.filter((t) => t.kind === kind);
                return rows.length > 0 && (
                  <div key={kind} className="shift-section">
                    <div className="shift-section-title">{KIND_TITLE[kind]} ({rows.length})</div>
                    <table className="data-table">
                      <thead><tr><th>Tên</th><th>Tồn hệ thống</th></tr></thead>
                      <tbody>{rows.map((t) => <tr key={`${t.kind}${t.refId}`}><td>{t.name}</td><td>{num(t.systemQty)}{t.unit ? ` ${t.unit}` : ''}</td></tr>)}</tbody>
                    </table>
                  </div>
                );
              })}
            </>
          ) : !detail ? <p className="hint">Chọn một phiếu để xem chi tiết.</p> : (
            <>
              <div className="live-head" style={{ marginBottom: 6 }}>
                <h2 style={{ margin: 0 }}>{detail.slotLabel} · {dayLabel(detail.businessDate)}</h2>
                <StatusChip status={detail.status} />
              </div>
              <p className="hint" style={{ marginTop: 0 }}>
                {detail.submittedBy || 'Nhân viên'} gửi lúc {hhmm(detail.submittedAt)} · {detail.itemCount} mục, {detail.diffCount} mục lệch
                {detail.note ? ` · Ghi chú: ${detail.note}` : ''}
              </p>
              {detail.status !== 'submitted' && (
                <p className="hint">
                  {detail.status === 'approved' ? 'Đã duyệt' : 'Đã yêu cầu kiểm lại'}{detail.reviewedBy ? ` bởi ${detail.reviewedBy}` : ''} lúc {detail.reviewedAt ? hhmm(detail.reviewedAt) : ''}
                  {detail.reviewNote ? ` Ghi chú: ${detail.reviewNote}` : ''}
                </p>
              )}

              {detail.pendingItems?.length > 0 && (
                <p className="error-text">
                  Có {detail.pendingItems.length} mục mới thêm vào kho sau khi nhân viên gửi phiếu, chưa được đếm: {detail.pendingItems.map((i) => i.name).join(', ')}.{' '}
                  {detail.status === 'approved' ? 'Các mục này sẽ được đếm ở phiếu của ca kế tiếp.' : 'Nhân viên cần sửa phiếu để đếm bổ sung.'}
                </p>
              )}
              <label className="check-inline">
                <input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} /> Chỉ hiện mục bị lệch
              </label>
              <table className="data-table">
                <thead><tr><th>Mục</th><th>Tồn trước khi đếm</th><th>Đã bán (tự động)</th><th>Số đếm (còn lại)</th><th>Chênh lệch (đã xuất, gồm bán)</th><th>Đã nhập thêm</th><th>Bán sau khi đếm</th><th>Tồn hiện tại</th>{canImport && <th>Nhập thêm</th>}</tr></thead>
                <tbody>
                  {(detail.pendingItems || []).map((r) => (
                    <tr key={`new${r.kind}${r.refId}`} className="stock-diff">
                      <td>{r.name} <small className="hint">({KIND_TITLE[r.kind]})</small> <span className="status-chip submitted">Mục mới</span></td>
                      <td>{num(r.systemQty)}{r.unit ? ` ${r.unit}` : ''}</td>
                      <td colSpan={5}><strong className="diff-neg">Chưa đếm</strong></td>
                      <td>{num(r.currentQty)}{r.unit ? ` ${r.unit}` : ''}</td>
                      {canImport && <td />}
                    </tr>
                  ))}
                  {rows.length === 0 && !(detail.pendingItems || []).length && <tr><td colSpan={9} className="hint">Không có mục nào lệch.</td></tr>}
                  {rows.map((r) => (
                    <tr key={`${r.kind}${r.refId}`} className={r.diff !== 0 ? 'stock-diff' : ''}>
                      <td>{r.name} <small className="hint">({KIND_TITLE[r.kind]})</small></td>
                      <td>{num(r.systemQty)}{r.unit ? ` ${r.unit}` : ''}</td>
                      <td>{r.soldQty > 0 ? num(r.soldQty) : '—'}</td>
                      <td>{num(r.countedQty)}{r.unit ? ` ${r.unit}` : ''}</td>
                      <td><DiffText value={r.diff} /></td>
                      <td>{r.importedQty > 0 ? <strong className="diff-pos">+{num(r.importedQty)}</strong> : '—'}</td>
                      <td>{r.soldAfterQty > 0 ? <strong className="diff-neg">−{num(r.soldAfterQty)}</strong> : '—'}</td>
                      <td>{r.currentQty === null ? '—' : `${num(r.currentQty)}${r.unit ? ` ${r.unit}` : ''}`}</td>
                      {canImport && (
                        <td className="import-cell">
                          <input type="number" min="0" step="any" inputMode="decimal" placeholder="SL" value={importQty[`${r.kind}:${r.refId}`] ?? ''} onChange={(e) => setImportQty((m) => ({ ...m, [`${r.kind}:${r.refId}`]: e.target.value }))} />
                          <button type="button" disabled={importBusy === `${r.kind}:${r.refId}`} onClick={() => importGoods(r)}>Nhập</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>

              {detail.status === 'submitted' && (
                <div className="stockcheck-review">
                  <input placeholder="Ghi chú (bắt buộc nếu yêu cầu kiểm lại)" value={reviewNote} maxLength={250} onChange={(e) => setReviewNote(e.target.value)} style={{ width: '100%' }} />
                  {error && <p className="error-text">{error}</p>}
                  <div className="recipe-actions" style={{ marginTop: 8 }}>
                    <button type="button" disabled={busy} onClick={() => review('approve')}>Duyệt phiếu</button>
                    <button type="button" className="danger" disabled={busy} onClick={() => review('reject')}>Yêu cầu kiểm lại</button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function StockCheck() {
  const { user } = useAuth();
  const [params] = useSearchParams();
  // Quản lý: Kiểm kho nằm chung trang Kho (tab "Kiểm kho cuối ca"), đường dẫn cũ chuyển sang đó.
  if (user.role === 'admin') {
    const open = params.get('open');
    return <Navigate to={`/ingredients?tab=check${open ? `&open=${open}` : ''}`} replace />;
  }
  return <StaffView />;
}
