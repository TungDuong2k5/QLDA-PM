import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AdminView as StockCheckAdmin } from './StockCheck';
import api from '../api/axios';

function formatTime(value) {
  return new Date(value).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
}

function currentMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// So khớp tìm kiếm không phân biệt hoa/thường và dấu tiếng Việt.
function norm(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase();
}

// Nhóm "special" là các nguyên liệu đã nằm trong danh sách nguyên vật liệu pha
// chế ở trên, nên không hiện lại trong phần Bánh & Đồ ăn vặt.
function isSpecialCategory(name) {
  return String(name || '').trim().toLowerCase() === 'special';
}

// An empty box you type a quantity into — on blur/Enter with a positive
// number it submits that as one nhập/xuất entry, then clears itself. No
// quantity typed means nothing happens (this is the only way stock moves).
function MovementInput({ onSubmit, danger }) {
  const [draft, setDraft] = useState('');

  function commit() {
    const num = Number(draft);
    if (num > 0) onSubmit(num);
    setDraft('');
  }

  return (
    <input
      type="number"
      min="0"
      placeholder="0"
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') e.target.blur(); }}
      style={{ width: 80, borderColor: danger ? '#c94f4f' : undefined }}
    />
  );
}

const TABS = [
  { key: 'stock', label: 'Tồn kho' },
  { key: 'history', label: 'Lịch sử hôm nay' },
  { key: 'monthly', label: 'Tổng hợp theo tháng' },
  { key: 'check', label: 'Kiểm kho cuối ca' },
];

export default function Ingredients() {
  const [searchParams] = useSearchParams();
  const [ingredients, setIngredients] = useState([]);
  const [ingredientMovements, setIngredientMovements] = useState([]);
  const [products, setProducts] = useState([]);
  const [productMovements, setProductMovements] = useState([]);
  const [newName, setNewName] = useState('');
  const [newUnit, setNewUnit] = useState('kg');
  const [month, setMonth] = useState(currentMonth());
  const [ingredientMonthly, setIngredientMonthly] = useState(null);
  const [productMonthly, setProductMonthly] = useState(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState(searchParams.get('tab') === 'check' || searchParams.get('open') ? 'check' : 'stock');
  const [pendingChecks, setPendingChecks] = useState(0); // phiếu kiểm kho chờ duyệt (hiện số trên tab)
  const [search, setSearch] = useState(searchParams.get('search') || '');

  function loadAll() {
    api.get('/ingredients').then(({ data }) => setIngredients(data));
    api.get('/ingredients/today').then(({ data }) => setIngredientMovements(data));
    api.get('/products').then(({ data }) => {
      setProducts(data.filter((p) => p.Category && !p.Category.isDrink && !isSpecialCategory(p.Category.name)));
    });
    api.get('/products/movements/today').then(({ data }) => setProductMovements(data));
  }

  // Báo cho chuông thông báo cập nhật lại ngay khi tồn kho thay đổi.
  function notifyStockChanged() {
    window.dispatchEvent(new Event('stock-changed'));
  }

  useEffect(loadAll, []);

  useEffect(() => {
    const load = () => api.get('/stock-checks/pending').then(({ data }) => setPendingChecks(data.length)).catch(() => {});
    load();
    const timer = setInterval(load, 15000);
    window.addEventListener('stock-changed', load);
    return () => { clearInterval(timer); window.removeEventListener('stock-changed', load); };
  }, []);

  // Bấm "Nhập kho" ở chuông thông báo → mở trang này với sẵn tên nguyên liệu trong ô tìm.
  useEffect(() => {
    const q = searchParams.get('search');
    if (q !== null) {
      setSearch(q);
      setTab('stock');
    }
    if (searchParams.get('tab') === 'check' || searchParams.get('open')) setTab('check');
  }, [searchParams]);

  function loadMonthly(m) {
    api.get('/ingredients/monthly-summary', { params: { month: m } }).then(({ data }) => setIngredientMonthly(data));
    api.get('/products/movements/monthly-summary', { params: { month: m } }).then(({ data }) => setProductMonthly(data));
  }

  useEffect(() => loadMonthly(month), []); // eslint-disable-line react-hooks/exhaustive-deps

  async function handleAddIngredient(e) {
    e.preventDefault();
    if (!newName.trim()) return;
    await api.post('/ingredients', { name: newName, unit: newUnit });
    setNewName('');
    setNewUnit('kg');
    loadAll();
    notifyStockChanged();
  }

  async function handleDeleteIngredient(id) {
    if (!confirm('Xóa nguyên vật liệu này? (sẽ mất luôn lịch sử nhập/xuất)')) return;
    await api.delete(`/ingredients/${id}`);
    loadAll();
    notifyStockChanged();
  }

  async function submitIngredientMovement(id, type, quantity) {
    setError('');
    try {
      await api.post(`/ingredients/${id}/movements`, { type, quantity });
      loadAll();
      loadMonthly(month);
      notifyStockChanged();
    } catch (err) {
      setError(err.response?.data?.message || 'Thao tác thất bại');
    }
  }

  async function submitProductMovement(id, type, quantity) {
    setError('');
    try {
      await api.post(`/products/${id}/movements`, { type, quantity });
      loadAll();
      loadMonthly(month);
    } catch (err) {
      setError(err.response?.data?.message || 'Thao tác thất bại');
    }
  }

  function handleMonthChange(e) {
    const m = e.target.value;
    setMonth(m);
    loadMonthly(m);
  }

  // Today's nhập/xuất totals per item, so the main table shows them at a
  // glance instead of only in the "Lịch sử hôm nay" list further down.
  function todayTotals(movements, idKey) {
    const map = new Map();
    for (const m of movements) {
      const entry = map.get(m[idKey]) || { in: 0, out: 0 };
      if (m.type === 'in') entry.in += m.quantity;
      else entry.out += m.quantity;
      map.set(m[idKey], entry);
    }
    return map;
  }
  const ingredientTodayTotals = todayTotals(ingredientMovements, 'ingredientId');
  const productTodayTotals = todayTotals(productMovements, 'productId');

  // Ô tìm kiếm lọc cả nguyên vật liệu lẫn bánh / đồ ăn vặt theo tên.
  const searchKey = norm(search.trim());
  const productGroups = Object.values(
    products.filter((p) => norm(p.name).includes(searchKey)).reduce((acc, p) => {
      const key = p.Category?.name || 'Khác';
      if (!acc[key]) acc[key] = { name: key, items: [] };
      acc[key].items.push(p);
      return acc;
    }, {})
  ).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  const outCount = ingredients.filter((i) => i.stock <= 0).length;
  const filteredIngredients = ingredients.filter((i) => norm(i.name).includes(norm(search.trim())));

  return (
    <div className="page page-wide">
      <h1>Kho</h1>
      {error && <p className="error-text">{error}</p>}

      <div className="kho-tabs">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`kho-tab ${tab === t.key ? 'active' : ''}`}
            onClick={() => setTab(t.key)}
          >
            {t.label}
            {t.key === 'check' && pendingChecks > 0 && <span className="kho-tab-badge">{pendingChecks}</span>}
          </button>
        ))}
      </div>

      {tab === 'check' && <StockCheckAdmin embedded />}

      {tab === 'stock' && (
        <>
          <div className="kho-summary">
            <div className="kho-stat"><span>Nguyên vật liệu</span><strong>{ingredients.length}</strong></div>
            <div className={`kho-stat ${outCount > 0 ? 'kho-stat-danger' : ''}`}><span>Đã hết hàng</span><strong>{outCount}</strong></div>
            <div className="kho-stat"><span>Bánh &amp; đồ ăn vặt</span><strong>{products.length}</strong></div>
          </div>

          <p className="hint">Gõ số lượng vào ô "Nhập" hoặc "Xuất" rồi bấm ra ngoài (hoặc Enter) để ghi nhận — không điền thì không có gì thay đổi.</p>

          <div className="kho-card">
            <h2>Nguyên vật liệu pha chế</h2>

            <div className="kho-toolbar">
              <input
                type="search"
                className="kho-search"
                placeholder="Tìm nguyên vật liệu, bánh, đồ ăn vặt..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <span className="hint">
                {search.trim() ? `Hiển thị ${filteredIngredients.length}/${ingredients.length}` : `${ingredients.length} nguyên liệu`}
              </span>
            </div>

            <form className="inline-form kho-add-form" onSubmit={handleAddIngredient}>
              <input placeholder="Tên nguyên liệu mới" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <input placeholder="Đơn vị (kg, lít, hộp, chai...)" value={newUnit} onChange={(e) => setNewUnit(e.target.value)} />
              <button type="submit">Thêm nguyên liệu</button>
            </form>

            {filteredIngredients.length === 0 ? (
              <p className="hint">Không tìm thấy nguyên vật liệu nào khớp "{search}".</p>
            ) : (
              <table className="data-table kho-table">
                <thead>
                  <tr>
                    <th>Tên</th>
                    <th>Đơn vị</th>
                    <th>Tồn kho</th>
                    <th>Nhập</th>
                    <th>Xuất</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIngredients.map((ing) => {
                    const t = ingredientTodayTotals.get(ing.id) || { in: 0, out: 0 };
                    const isOut = ing.stock <= 0;
                    return (
                      <tr key={ing.id} className={isOut ? 'row-out-of-stock' : ''}>
                        <td>
                          {ing.name}
                          {isOut && <span className="badge-out">Hết hàng</span>}
                        </td>
                        <td>{ing.unit}</td>
                        <td><strong className={isOut ? 'stock-out' : 'stock-ok'}>{ing.stock}</strong></td>
                        <td>
                          <MovementInput onSubmit={(qty) => submitIngredientMovement(ing.id, 'in', qty)} />
                          {t.in > 0 && <div className="hint">+{t.in} hôm nay</div>}
                        </td>
                        <td>
                          <MovementInput danger onSubmit={(qty) => submitIngredientMovement(ing.id, 'out', qty)} />
                          {t.out > 0 && <div className="hint">-{t.out} hôm nay</div>}
                        </td>
                        <td><button type="button" className="danger" onClick={() => handleDeleteIngredient(ing.id)}>Xóa</button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="kho-card">
            <h2>Bánh &amp; Đồ ăn vặt</h2>
            {productGroups.length === 0 && <p className="hint">Không có bánh / đồ ăn vặt nào khớp "{search}".</p>}
            <div className="kho-groups">
              {productGroups.map((group) => (
                <div key={group.name} className="kho-subgroup">
                  <h3>{group.name}</h3>
                  <table className="data-table kho-table">
                    <thead>
                      <tr>
                        <th>Tên</th>
                        <th>Tồn kho</th>
                        <th>Nhập</th>
                        <th>Xuất</th>
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((p) => {
                        const t = productTodayTotals.get(p.id) || { in: 0, out: 0 };
                        const stock = p.stock ?? 0;
                        return (
                          <tr key={p.id} className={stock <= 0 ? 'row-out-of-stock' : ''}>
                            <td>{p.name}</td>
                            <td><strong className={stock <= 0 ? 'stock-out' : 'stock-ok'}>{stock}</strong></td>
                            <td>
                              <MovementInput onSubmit={(qty) => submitProductMovement(p.id, 'in', qty)} />
                              {t.in > 0 && <div className="hint">+{t.in} hôm nay</div>}
                            </td>
                            <td>
                              <MovementInput danger onSubmit={(qty) => submitProductMovement(p.id, 'out', qty)} />
                              {t.out > 0 && <div className="hint">-{t.out} hôm nay</div>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {tab === 'history' && (
        <div className="kho-card">
          <h2>Nguyên vật liệu</h2>
          {ingredientMovements.length === 0 ? (
            <p className="hint">Chưa có thay đổi nào hôm nay.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Giờ</th><th>Tên</th><th>Loại</th><th>Số lượng</th><th>Người thực hiện</th></tr>
              </thead>
              <tbody>
                {ingredientMovements.map((m) => (
                  <tr key={m.id}>
                    <td>{formatTime(m.createdAt)}</td>
                    <td>{m.Ingredient?.name}</td>
                    <td><span className={`badge ${m.type === 'in' ? 'status-paid' : 'status-cancelled'}`}>{m.type === 'in' ? 'Nhập' : 'Xuất'}</span></td>
                    <td>{m.quantity} {m.Ingredient?.unit}</td>
                    <td>{m.User?.fullName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}

          <h2>Bánh &amp; Đồ ăn vặt</h2>
          {productMovements.length === 0 ? (
            <p className="hint">Chưa có thay đổi nào hôm nay.</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr><th>Giờ</th><th>Tên</th><th>Loại</th><th>Số lượng</th><th>Người thực hiện</th></tr>
              </thead>
              <tbody>
                {productMovements.map((m) => (
                  <tr key={m.id}>
                    <td>{formatTime(m.createdAt)}</td>
                    <td>{m.Product?.name}</td>
                    <td><span className={`badge ${m.type === 'in' ? 'status-paid' : 'status-cancelled'}`}>{m.type === 'in' ? 'Nhập' : 'Xuất'}</span></td>
                    <td>{m.quantity}</td>
                    <td>{m.User?.fullName || (m.note === 'Bán hàng' ? '(Bán hàng)' : '')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'monthly' && (
        <div className="kho-card">
          <label className="kho-month-picker">
            Chọn tháng
            <input type="month" value={month} onChange={handleMonthChange} />
          </label>

          {ingredientMonthly && (
            <>
              <h2>Nguyên vật liệu</h2>
              <table className="data-table">
                <thead>
                  <tr><th>Nguyên liệu</th><th>Tổng nhập</th><th>Tổng xuất</th><th>Tồn cuối kỳ</th></tr>
                </thead>
                <tbody>
                  {ingredientMonthly.rows.map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>+{r.totalIn} {r.unit}</td>
                      <td>-{r.totalOut} {r.unit}</td>
                      <td><strong>{r.endingStock} {r.unit}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          {productMonthly && productMonthly.rows.some((r) => !isSpecialCategory(r.category)) && (
            <>
              <h2>Bánh &amp; Đồ ăn vặt</h2>
              <table className="data-table">
                <thead>
                  <tr><th>Sản phẩm</th><th>Danh mục</th><th>Tổng nhập</th><th>Tổng xuất</th><th>Tồn cuối kỳ</th></tr>
                </thead>
                <tbody>
                  {productMonthly.rows.filter((r) => !isSpecialCategory(r.category)).map((r) => (
                    <tr key={r.id}>
                      <td>{r.name}</td>
                      <td>{r.category}</td>
                      <td>+{r.totalIn}</td>
                      <td>-{r.totalOut}</td>
                      <td><strong>{r.endingStock}</strong></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>
      )}
    </div>
  );
}
