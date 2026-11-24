import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '../api/axios';
import { productImageSrc, categoryImageSrc } from '../utils/productImage';
import { SUGAR_ICE_LEVELS, SIZES } from '../utils/constants';

function isDrinkProduct(product) {
  return product?.Category?.isDrink === true;
}

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

function emptyDraft() {
  // Số lượng bắt đầu từ 0 — nhân viên tự chọn/gõ bao nhiêu cốc trước khi thêm vào đơn.
  return { quantity: 0, size: 'M', sugarLevel: 100, iceLevel: 100, toppingQty: {} };
}

// Ô nhập số lượng tự gõ: cho phép xóa trống để gõ số mới (VD: xóa "1" rồi gõ "25"),
// bấm vào ô là bôi đen sẵn, chỉ chốt số hợp lệ khi rời ô.
function QtyInput({ value, min = 0, onChange, className }) {
  const [text, setText] = useState(String(value));
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setText(String(value));
  }, [value, focused]);

  function handleChange(e) {
    const raw = e.target.value.replace(/\D/g, '');
    setText(raw);
    if (raw !== '') onChange(Math.max(min, Number(raw)));
  }

  function handleBlur() {
    setFocused(false);
    const num = text === '' ? min : Math.max(min, Number(text));
    setText(String(num));
    onChange(num);
  }

  return (
    <input
      type="text"
      inputMode="numeric"
      className={className}
      value={text}
      onFocus={(e) => { setFocused(true); e.target.select(); }}
      onChange={handleChange}
      onBlur={handleBlur}
    />
  );
}

let nextLineKey = 1;

export default function NewOrder() {
  const [searchParams] = useSearchParams();
  const orderType = searchParams.get('orderType') === 'takeaway' ? 'takeaway' : 'dine_in';
  const tableId = searchParams.get('tableId');

  const [tables, setTables] = useState([]);
  const [products, setProducts] = useState([]);
  const [allProducts, setAllProducts] = useState([]); // gồm cả món đã tắt, để vẫn hiện tên món trong hóa đơn
  const [toClose, setToClose] = useState([]); // món hết hàng / hết nguyên liệu / quản lý báo tắt mà chưa đóng — bị khóa, không gọi được
  const [closingId, setClosingId] = useState(null);
  const [toppings, setToppings] = useState([]);
  const [note, setNote] = useState('');
  const [lines, setLines] = useState([]);
  const linesRef = useRef([]);
  linesRef.current = lines;
  useEffect(() => {
    // Chặn tải lại / đóng tab nhầm khi đã chọn món.
    const warn = (e) => { if (linesRef.current.length > 0) { e.preventDefault(); e.returnValue = ''; } };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  const [expandedId, setExpandedId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [error, setError] = useState('');
  const navigate = useNavigate();

  // Đang lập đơn: không thoát sang chức năng khác; chỉ "Hủy đơn" (có xác nhận nếu đã chọn món) hoặc thanh toán.
  function cancelOrder() {
    if (linesRef.current.length > 0 && !window.confirm('Hủy đơn đang lập cho khách này? Các món đã chọn sẽ bị xóa.')) return;
    navigate('/', { replace: true });
  }

  const categoryRefs = useRef({});
  const lastCategoryIdRef = useRef(null);
  const prevExpandedIdRef = useRef(null);

  const loadMenu = useCallback(() => {
    api.get('/products').then(({ data }) => {
      setAllProducts(data);
      setProducts(data.filter((p) => p.isAvailable));
    });
    api.get('/stock-alerts').then(({ data }) => setToClose(data.toClose || [])).catch(() => {});
  }, []);

  useEffect(() => {
    api.get('/tables').then(({ data }) => setTables(data));
    api.get('/toppings').then(({ data }) => setToppings(data.filter((tp) => tp.isAvailable)));
    loadMenu();
    // Tồn kho thay đổi liên tục (người khác bán, quản lý nhập/báo tắt) nên làm mới thường xuyên.
    const timer = setInterval(loadMenu, 10000);
    window.addEventListener('stock-changed', loadMenu);
    return () => { clearInterval(timer); window.removeEventListener('stock-changed', loadMenu); };
  }, [loadMenu]);

  const lockedById = new Map(toClose.map((p) => [p.id, p.reasons.join(', ')]));

  // Bắt buộc đóng món: bấm là tắt món ngay tại đây (cùng việc với nút trên chuông thông báo).
  async function closeProduct(p) {
    setClosingId(p.id);
    setError('');
    try {
      await api.patch(`/products/${p.id}/availability`, { isAvailable: false });
      window.dispatchEvent(new Event('stock-changed'));
      loadMenu();
    } catch (err) {
      setError(err.response?.data?.message || 'Đóng món thất bại');
    } finally {
      setClosingId(null);
    }
  }

  // Returning from the full-page customize screen — jump back to the
  // category the item came from instead of leaving the scroll at the top.
  useEffect(() => {
    if (prevExpandedIdRef.current !== null && expandedId === null) {
      const el = categoryRefs.current[lastCategoryIdRef.current];
      if (el) el.scrollIntoView({ block: 'start' });
    }
    prevExpandedIdRef.current = expandedId;
  }, [expandedId]);

  const table = tables.find((t) => t.id === Number(tableId));

  const productGroups = Object.values(
    products.reduce((groups, p) => {
      const key = p.categoryId ?? 'none';
      if (!groups[key]) groups[key] = { categoryId: key, name: p.Category?.name || 'Khác', category: p.Category, products: [] };
      groups[key].products.push(p);
      return groups;
    }, {})
  ).sort((a, b) => a.name.localeCompare(b.name, 'vi'));

  function openProduct(product) {
    if (lockedById.has(product.id)) return; // món hết hàng: không gọi được
    if (!isDrinkProduct(product)) {
      addSimpleLine(product);
      return;
    }
    lastCategoryIdRef.current = product.categoryId ?? 'none';
    setExpandedId(product.id);
    setDraft(emptyDraft());
  }

  function closeExpanded() {
    setExpandedId(null);
    setDraft(emptyDraft());
  }

  // Bánh/đồ ăn vặt (không có tùy chỉnh) — bấm nhiều lần cùng món sẽ gộp
  // vào 1 dòng, tăng số lượng thay vì tạo nhiều dòng trùng nhau.
  function addSimpleLine(product) {
    setLines((prev) => {
      const existing = prev.find((l) => l.productId === product.id && !l.toppingId);
      if (existing) {
        return prev.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        { key: nextLineKey++, productId: product.id, quantity: 1, sugarLevel: 100, iceLevel: 100, size: null, toppings: [] },
      ];
    });
  }

  // Cho phép gõ thẳng số lượng lớn thay vì bấm + nhiều lần (VD: order 50 ly).
  function setLineQuantity(key, value) {
    const quantity = Math.max(1, Math.floor(Number(value)) || 1);
    setLines((prev) => prev.map((l) => (l.key === key ? { ...l, quantity } : l)));
  }

  function confirmDrinkLine(product) {
    if (draft.quantity <= 0) return;
    const toppingsChosen = Object.entries(draft.toppingQty)
      .filter(([, qty]) => qty > 0)
      .map(([id, qty]) => ({ id: Number(id), quantity: qty }));

    setLines((prev) => [
      ...prev,
      {
        key: nextLineKey++,
        productId: product.id,
        quantity: draft.quantity,
        sugarLevel: draft.sugarLevel,
        iceLevel: draft.iceLevel,
        size: draft.size,
        toppings: toppingsChosen,
      },
    ]);
    closeExpanded();
  }

  function removeLine(key) {
    setLines((prev) => prev.filter((l) => l.key !== key));
  }

  // Selling a topping on its own (no drink attached) — merges into an
  // existing standalone line for that same topping if there is one.
  function addStandaloneTopping(topping) {
    setLines((prev) => {
      const existing = prev.find((l) => l.toppingId === topping.id);
      if (existing) {
        return prev.map((l) => (l.key === existing.key ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [
        ...prev,
        { key: nextLineKey++, productId: null, toppingId: topping.id, quantity: 1, sugarLevel: null, iceLevel: null, size: null, toppings: [] },
      ];
    });
  }

  function adjustToppingQty(toppingId, delta) {
    setDraft((prev) => {
      const next = Math.max(0, (prev.toppingQty[toppingId] || 0) + delta);
      return { ...prev, toppingQty: { ...prev.toppingQty, [toppingId]: next } };
    });
  }

  function lineDetails(line) {
    if (line.toppingId) {
      const topping = toppings.find((t) => t.id === line.toppingId);
      const unitPrice = topping?.price || 0;
      return { product: null, topping, toppingsPrice: 0, sizeExtra: 0, unitPrice, lineTotal: unitPrice * line.quantity };
    }
    const product = allProducts.find((p) => p.id === line.productId);
    const toppingsPrice = line.toppings.reduce((sum, t) => {
      const tp = toppings.find((x) => x.id === t.id);
      return sum + (tp?.price || 0) * t.quantity;
    }, 0);
    const sizeExtra = line.size ? (SIZES.find((s) => s.value === line.size)?.extra || 0) : 0;
    const unitPrice = (product?.price || 0) + toppingsPrice + sizeExtra;
    return { product, toppingsPrice, sizeExtra, unitPrice, lineTotal: unitPrice * line.quantity };
  }

  const total = lines.reduce((sum, line) => sum + lineDetails(line).lineTotal, 0);
  const totalQty = lines.reduce((sum, line) => sum + line.quantity, 0);
  const expandedProduct = products.find((p) => p.id === expandedId) || null;

  // Dòng trong hóa đơn mà món đã hết hàng / bị khóa / đã tắt thì không thanh toán được.
  const lineBlocked = (line) => {
    if (!line.productId) return null;
    if (lockedById.has(line.productId)) return `Hết hàng: ${lockedById.get(line.productId)}`;
    const p = allProducts.find((x) => x.id === line.productId);
    if (p && !p.isAvailable) return 'Món đã đóng';
    return null;
  };
  const blockedLines = lines.filter((l) => lineBlocked(l));

  function handleGoToCheckout() {
    setError('');
    if (orderType === 'dine_in' && !tableId) return setError('Thiếu thông tin bàn');
    if (lines.length === 0) return setError('Vui lòng chọn ít nhất một món');
    if (blockedLines.length > 0) return setError('Trong hóa đơn có món đã hết hàng — hãy xóa các món đó trước khi thanh toán');

    navigate('/orders/checkout', {
      state: {
        orderType,
        tableId: tableId ? Number(tableId) : null,
        tableName: table?.name || null,
        note,
        items: lines.map((l) => ({
          productId: l.productId,
          toppingId: l.toppingId,
          quantity: l.quantity,
          sugarLevel: l.sugarLevel,
          iceLevel: l.iceLevel,
          size: l.size,
          toppings: l.toppings,
        })),
      },
    });
  }

  return (
    <div className="page page-wide">
      <h1>{orderType === 'takeaway' ? 'Bán mang về' : `Bán tại chỗ — ${table?.name || ''}`}</h1>
      {toClose.length > 0 && !expandedProduct && (
        <div className="soldout-banner">
          <strong>⚠ Có {toClose.length} món đã hết hàng — không gọi được. Nhân viên bắt buộc phải đóng món:</strong>
          {toClose.map((p) => (
            <div key={p.id} className="soldout-row">
              <span><b>{p.name}</b> <small>({p.reasons.join(', ')})</small></span>
              <button type="button" className="danger" disabled={closingId === p.id} onClick={() => closeProduct(p)}>
                {closingId === p.id ? 'Đang đóng...' : 'Đóng món'}
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="order-builder">
        <div className="order-builder-main">
          {expandedProduct ? (
            <div className="customize-page">
              <button type="button" className="link-back" onClick={closeExpanded}>&larr; Quay lại thực đơn</button>
              <div className="customize-header">
                <img className="customize-image" src={productImageSrc(expandedProduct)} alt={expandedProduct.name} />
                <div>
                  <h2>{expandedProduct.name}</h2>
                  <p className="product-pick-price">{formatCurrency(expandedProduct.price)}</p>
                </div>
              </div>

              <div className="product-configure">
                <label>
                  Số lượng
                  <div className="qty-control">
                    <button type="button" onClick={() => setDraft((d) => ({ ...d, quantity: Math.max(0, d.quantity - 1) }))}>-</button>
                    <QtyInput
                      className="qty-control-input"
                      value={draft.quantity}
                      onChange={(n) => setDraft((d) => ({ ...d, quantity: n }))}
                    />
                    <button type="button" onClick={() => setDraft((d) => ({ ...d, quantity: d.quantity + 1 }))}>+</button>
                  </div>
                </label>

                <label>
                  Size
                  <select value={draft.size} onChange={(e) => setDraft((d) => ({ ...d, size: e.target.value }))}>
                    {SIZES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}{s.extra > 0 ? ` (+${formatCurrency(s.extra)})` : ''}
                      </option>
                    ))}
                  </select>
                </label>

                <label>
                  Mức đường
                  <select value={draft.sugarLevel} onChange={(e) => setDraft((d) => ({ ...d, sugarLevel: Number(e.target.value) }))}>
                    {SUGAR_ICE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}%</option>)}
                  </select>
                </label>

                <label>
                  Mức đá
                  <select value={draft.iceLevel} onChange={(e) => setDraft((d) => ({ ...d, iceLevel: Number(e.target.value) }))}>
                    {SUGAR_ICE_LEVELS.map((lvl) => <option key={lvl} value={lvl}>{lvl}%</option>)}
                  </select>
                </label>

                {toppings.length > 0 && (
                  <div className="topping-qty-list">
                    <span className="topping-label">Topping (không giới hạn số lần):</span>
                    {toppings.map((tp) => (
                      <div key={tp.id} className="topping-qty-row">
                        <span>{tp.name} (+{formatCurrency(tp.price)})</span>
                        <div className="qty-control">
                          <button type="button" onClick={() => adjustToppingQty(tp.id, -1)}>-</button>
                          <QtyInput
                            className="qty-control-input"
                            value={draft.toppingQty[tp.id] || 0}
                            onChange={(n) => setDraft((d) => ({ ...d, toppingQty: { ...d.toppingQty, [tp.id]: n } }))}
                          />
                          <button type="button" onClick={() => adjustToppingQty(tp.id, 1)}>+</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {draft.quantity <= 0 && <p className="hint">Chọn số lượng cốc trước khi thêm vào đơn.</p>}
                <div className="product-configure-actions">
                  <button type="button" className="danger" onClick={closeExpanded}>Hủy</button>
                  <button type="button" disabled={draft.quantity <= 0} onClick={() => confirmDrinkLine(expandedProduct)}>
                    {draft.quantity <= 0 ? 'Nhập số lượng trước' : 'OK — Thêm vào hóa đơn'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <>
              {productGroups.map((group) => (
                <div
                  key={group.categoryId}
                  className="product-category-group"
                  ref={(el) => { categoryRefs.current[group.categoryId] = el; }}
                >
                  <style>{`.cat-bg-${group.categoryId} { background-image: url("${categoryImageSrc(group.category)}"); }`}</style>
                  <div className={`product-category-banner cat-bg-${group.categoryId}`}>
                    <h4 className="product-category-title">{group.name}</h4>
                  </div>
                  <div className="product-grid">
                    {group.products.map((p) => {
                      const drink = isDrinkProduct(p);
                      const lockReason = lockedById.get(p.id);
                      return (
                        <div key={p.id} className={`product-pick-card ${lockReason ? 'sold-out' : ''}`}>
                          <img className="product-pick-image" src={productImageSrc(p)} alt={p.name} />
                          <div className="product-pick-name">{p.name}</div>
                          <div className="product-pick-price">{formatCurrency(p.price)}</div>
                          {lockReason && <div className="sold-out-tag">Hết hàng — chờ đóng món</div>}
                          <button type="button" disabled={Boolean(lockReason)} onClick={() => openProduct(p)}>
                            {lockReason ? 'Hết hàng' : drink ? 'Chọn' : '+ Thêm vào đơn'}
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}

              {toppings.length > 0 && (
                <div className="product-category-group">
                  <div className="product-category-banner cat-bg-topping">
                    <h4 className="product-category-title">Topping (bán riêng)</h4>
                  </div>
                  <div className="product-grid">
                    {toppings.map((tp) => (
                      <div key={tp.id} className="product-pick-card">
                        <div className="product-pick-name">{tp.name}</div>
                        <div className="product-pick-price">{formatCurrency(tp.price)}</div>
                        <button type="button" onClick={() => addStandaloneTopping(tp)}>+ Thêm vào đơn</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {!expandedProduct && (
          <div className="order-builder-cart">
            <div className="order-flow-actions">
              <h3 style={{ margin: 0 }}>Hóa đơn{totalQty > 0 ? ` (${totalQty} món)` : ''}</h3>
              <button type="button" className="danger" onClick={cancelOrder}>Hủy đơn</button>
            </div>
            <p className="hint">
              {orderType === 'takeaway' ? 'Mang về' : `Tại chỗ — Bàn: ${table?.name || '...'}`}
            </p>
            <label>
              Ghi chú
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="VD: ít đường" />
            </label>

            {lines.length === 0 ? (
              <p className="hint">Chưa có món nào — chọn món bên trái để thêm.</p>
            ) : (
              <div className="order-lines">
                {lines.map((line) => {
                  const { product, topping, lineTotal } = lineDetails(line);
                  const blockedReason = lineBlocked(line);
                  return (
                    <div key={line.key} className={`order-line-compact ${blockedReason ? 'line-blocked' : ''}`}>
                      <div className="order-line-compact-header">
                        <strong>{line.toppingId ? `${topping?.name} (topping riêng)` : product?.name}</strong>
                        <button type="button" className="danger" onClick={() => removeLine(line.key)}>Xóa</button>
                      </div>
                      {blockedReason && <div className="line-blocked-msg">⚠ {blockedReason} — không gọi được, hãy xóa khỏi đơn</div>}
                      <div className="item-custom">
                        {line.size && <span>Size {line.size} · Đường {line.sugarLevel}% · Đá {line.iceLevel}%</span>}
                        {line.toppings.length > 0 && (
                          <span>Topping: {line.toppings.map((t) => `${toppings.find((x) => x.id === t.id)?.name} x${t.quantity}`).join(', ')}</span>
                        )}
                        <span className="line-qty-editor">
                          SL:
                          <QtyInput
                            min={1}
                            value={line.quantity}
                            onChange={(n) => setLineQuantity(line.key, n)}
                          />
                        </span>
                      </div>
                      <div className="order-line-total">{formatCurrency(lineTotal)}</div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="order-summary">
              <strong>Tổng cộng: {formatCurrency(total)}</strong>
            </div>

            {error && <p className="error-text">{error}</p>}
            {lines.length > 0 && (
              <button type="button" disabled={blockedLines.length > 0} onClick={handleGoToCheckout}>
                {blockedLines.length > 0 ? 'Xóa món hết hàng để thanh toán' : 'Thanh toán'}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
