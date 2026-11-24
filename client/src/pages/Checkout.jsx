import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { productImageSrc } from '../utils/productImage';
import PaymentQR from '../components/PaymentQR';
import { PAYMENT_METHODS, POINTS_TO_VND } from '../utils/constants';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

export default function Checkout() {
  const { state } = useLocation();
  const navigate = useNavigate();

  const [products, setProducts] = useState([]);
  const [toppings, setToppings] = useState([]);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customer, setCustomer] = useState(null);
  const [customerChecked, setCustomerChecked] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get('/products').then(({ data }) => setProducts(data));
    api.get('/toppings').then(({ data }) => setToppings(data));
  }, []);

  // Came here without a cart in hand (e.g. page refresh) — nothing to check out.
  if (!state?.items?.length) {
    return (
      <div className="page">
        <h1>Thanh toán</h1>
        <p className="hint">Không có đơn hàng nào đang chờ thanh toán.</p>
        <button onClick={() => navigate('/')}>Về trang bán hàng</button>
      </div>
    );
  }

  const { orderType, tableId, tableName, note, items } = state;
  const billTime = new Date().toLocaleString('vi-VN', { hour12: false });

  function lineDetails(item) {
    if (item.toppingId) {
      const topping = toppings.find((t) => t.id === item.toppingId);
      const unitPrice = topping?.price || 0;
      return { product: null, topping, unitPrice, lineTotal: unitPrice * item.quantity };
    }
    const product = products.find((p) => p.id === item.productId);
    const toppingsPrice = (item.toppings || []).reduce((sum, t) => {
      const tp = toppings.find((x) => x.id === t.id);
      return sum + (tp?.price || 0) * t.quantity;
    }, 0);
    const sizeExtra = item.size === 'L' ? 10000 : 0;
    const unitPrice = (product?.price || 0) + toppingsPrice + sizeExtra;
    return { product, unitPrice, lineTotal: unitPrice * item.quantity };
  }

  const total = items.reduce((sum, item) => sum + lineDetails(item).lineTotal, 0);
  const totalQty = items.reduce((sum, item) => sum + item.quantity, 0);
  const hasDrink = items.some((item) => item.size);
  const canRedeem = hasDrink && customer && customer.points > 0;
  const maxRedeemablePoints = canRedeem
    ? Math.min(customer.points, Math.floor(total / POINTS_TO_VND))
    : 0;
  const redeemPointsNum = Math.min(Math.max(0, Number(redeemPoints) || 0), maxRedeemablePoints);
  const discount = redeemPointsNum * POINTS_TO_VND;
  const finalTotal = total - discount;

  async function handleLookupCustomer() {
    setError('');
    setCustomerChecked(false);
    if (!customerPhone) return;
    try {
      const { data } = await api.get(`/customers/${customerPhone}`);
      setCustomer(data);
      setCustomerName(data.name);
    } catch (err) {
      setCustomer(null);
    } finally {
      setCustomerChecked(true);
    }
  }

  async function handleConfirm(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const { data } = await api.post('/orders/checkout', {
        orderType,
        tableId: orderType === 'dine_in' ? tableId : undefined,
        note,
        items,
        paymentMethod,
        customerPhone: customerPhone || undefined,
        customerName: customerName || undefined,
        redeemPoints: redeemPointsNum,
      });
      navigate(`/orders/${data.id}`, { replace: true });
    } catch (err) {
      setError(err.response?.data?.message || 'Thanh toán thất bại');
      setSubmitting(false);
    }
  }

  return (
    <div className="page page-wide">
      <div className="order-flow-actions">
        <button className="link-back" onClick={() => navigate(-1)}>&larr; Quay lại chọn món</button>
        <button type="button" className="danger" onClick={() => { if (window.confirm('Hủy đơn đang lập cho khách này?')) navigate('/', { replace: true }); }}>Hủy đơn</button>
      </div>
      <h1>Thanh toán</h1>

      <div className="order-detail-layout">
        <div className="order-detail-main">
          <div className="bill">
            <div className="bill-head">
              <div className="bill-shop">Trạm Trà Chill</div>
              <div className="bill-title">HÓA ĐƠN</div>
              <div className="bill-meta">
                <span>{orderType === 'takeaway' ? 'Mang về' : <>Bàn: <strong>{tableName}</strong></>}</span>
                <span>{billTime}</span>
              </div>
            </div>

            <table className="bill-table">
              <thead>
                <tr><th>Món</th><th className="num">SL</th><th className="num">Thành tiền</th></tr>
              </thead>
              <tbody>
                {items.map((item, idx) => {
                  const { product, topping, unitPrice, lineTotal } = lineDetails(item);
                  return (
                    <tr key={idx}>
                      <td>
                        <div className="bill-item-name">{item.toppingId ? `${topping?.name} (topping riêng)` : product?.name}</div>
                        {item.size && <div className="bill-item-sub">Size {item.size} · Đường {item.sugarLevel}% · Đá {item.iceLevel}%</div>}
                        {item.toppings?.length > 0 && (
                          <div className="bill-item-sub">Topping: {item.toppings.map((t) => `${toppings.find((x) => x.id === t.id)?.name} x${t.quantity}`).join(', ')}</div>
                        )}
                        <div className="bill-item-sub">{formatCurrency(unitPrice)} / phần</div>
                      </td>
                      <td className="num">{item.quantity}</td>
                      <td className="num">{formatCurrency(lineTotal)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            {note && <div className="bill-note">Ghi chú: {note}</div>}

            <div className="bill-sum">
              <div className="bill-row"><span>Tổng số lượng</span><span>{totalQty} món</span></div>
              <div className="bill-row"><span>Tạm tính</span><span>{formatCurrency(total)}</span></div>
              {discount > 0 && (
                <div className="bill-row"><span>Giảm giá ({redeemPointsNum} điểm)</span><span>-{formatCurrency(discount)}</span></div>
              )}
              <div className="bill-row bill-total"><span>Tổng cộng</span><span>{formatCurrency(finalTotal)}</span></div>
            </div>
            <div className="bill-foot">Cảm ơn quý khách — hẹn gặp lại!</div>
          </div>
        </div>

        <div className="order-detail-side">
          <form className="payment-panel" onSubmit={handleConfirm}>
            <h3>Phương thức thanh toán</h3>
            <label>
              Chọn phương thức
              <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </label>

            <PaymentQR method={paymentMethod} amount={finalTotal} note="Tram Tra Chill" />

            <div className="customer-lookup">
              <label>
                SĐT khách (tích điểm)
                <input
                  value={customerPhone}
                  onChange={(e) => { setCustomerPhone(e.target.value); setCustomerChecked(false); }}
                  placeholder="VD: 0901234567"
                />
              </label>
              <button type="button" onClick={handleLookupCustomer}>Tra cứu</button>
            </div>

            {customerChecked && (
              customer
                ? <p className="hint">Khách quen: {customer.name} - đang có {customer.points} điểm.</p>
                : <p className="hint">Chưa có trong hệ thống, nhập tên để tạo mới.</p>
            )}

            {customerPhone && (
              <label>
                Tên khách hàng
                <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Tên khách" />
              </label>
            )}

            {customerChecked && customer && (
              hasDrink ? (
                maxRedeemablePoints > 0 ? (
                  <label>
                    Đổi điểm (khách có {customer.points} điểm, đổi tối đa {maxRedeemablePoints} điểm = {formatCurrency(maxRedeemablePoints * POINTS_TO_VND)})
                    <input
                      type="number"
                      min="0"
                      max={maxRedeemablePoints}
                      value={redeemPoints}
                      onChange={(e) => setRedeemPoints(e.target.value)}
                      placeholder="Số điểm muốn đổi"
                    />
                  </label>
                ) : (
                  <p className="hint">Khách chưa đủ điểm để đổi.</p>
                )
              ) : (
                <p className="hint">Đơn chỉ có bánh/đồ ăn vặt — không dùng điểm để giảm giá được.</p>
              )
            )}

            {error && <p className="error-text">{error}</p>}
            <button type="submit" disabled={submitting}>
              {submitting ? 'Đang xử lý...' : `Xác nhận thanh toán — ${formatCurrency(finalTotal)}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
