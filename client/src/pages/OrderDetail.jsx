import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../api/axios';
import { useAuth } from '../context/AuthContext';
import { PAYMENT_METHODS, POINTS_TO_VND } from '../utils/constants';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

const STATUS_LABEL = {
  pending: 'Chờ xử lý',
  served: 'Đã pha xong',
  paid: 'Đã thanh toán',
  cancelled: 'Đã hủy',
};

export default function OrderDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const [order, setOrder] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customer, setCustomer] = useState(null);
  const [customerChecked, setCustomerChecked] = useState(false);
  const [redeemPoints, setRedeemPoints] = useState('');
  const [payError, setPayError] = useState('');
  const navigate = useNavigate();

  function load() {
    api.get(`/orders/${id}`).then(({ data }) => setOrder(data));
  }

  useEffect(load, [id]);

  async function handleCancel() {
    if (!confirm('Hủy đơn hàng này?')) return;
    await api.patch(`/orders/${id}/status`, { status: 'cancelled' });
    load();
  }

  async function handleLookupCustomer() {
    setPayError('');
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

  async function handlePay(e) {
    e.preventDefault();
    setPayError('');
    try {
      const { data } = await api.post(`/orders/${id}/pay`, {
        paymentMethod,
        customerPhone: customerPhone || undefined,
        customerName: customerName || undefined,
        redeemPoints: redeemPointsNum,
      });
      setOrder(data);
    } catch (err) {
      setPayError(err.response?.data?.message || 'Thanh toán thất bại');
    }
  }

  if (!order) return <p>Đang tải...</p>;

  const totalQty = (order.OrderItems || []).reduce((sum, i) => sum + i.quantity, 0);
  const hasDrink = (order.OrderItems || []).some((i) => i.size);
  const canRedeem = hasDrink && customer && customer.points > 0;
  const maxRedeemablePoints = canRedeem
    ? Math.min(customer.points, Math.floor(order.total / POINTS_TO_VND))
    : 0;
  const redeemPointsNum = Math.min(Math.max(0, Number(redeemPoints) || 0), maxRedeemablePoints);
  const canCancel = user.role === 'admin' && order.status !== 'cancelled';

  return (
    <div className="page page-wide">
      <button className="link-back" onClick={() => navigate('/orders')}>&larr; Quay lại danh sách</button>
      <h1>Đơn hàng #{order.id}</h1>

      <div className="order-detail-layout">
        <div className="order-detail-main">
          <p>{order.orderType === 'takeaway' ? 'Mang về' : <>Bàn: <strong>{order.Table?.name}</strong></>}</p>
          <p>Nhân viên: {order.User?.fullName}</p>
          <p>Tổng số lượng món: <strong>{totalQty}</strong></p>
          {order.note && <p>Ghi chú: {order.note}</p>}
          <p>
            Trạng thái: <span className={`badge status-${order.status}`}>{STATUS_LABEL[order.status]}</span>
          </p>

          <table className="data-table">
            <thead>
              <tr>
                <th>Món</th>
                <th>Tùy chỉnh</th>
                <th>Đơn giá</th>
                <th>SL</th>
                <th>Thành tiền</th>
              </tr>
            </thead>
            <tbody>
              {order.OrderItems?.map((item) => (
                <tr key={item.id}>
                  <td>{item.Product?.name || (item.Topping ? `${item.Topping.name} (topping riêng)` : '')}</td>
                  <td>
                    <div className="item-custom">
                      {item.size && (
                        <>
                          <span>Size {item.size}</span>
                          <span>Đường {item.sugarLevel}% · Đá {item.iceLevel}%</span>
                        </>
                      )}
                      {item.toppings?.length > 0 && (
                        <span>Topping: {item.toppings.map((t) => `${t.name} x${t.quantity || 1}`).join(', ')}</span>
                      )}
                      {item.isRedeemed && <span className="badge status-paid">Đổi điểm - Miễn phí</span>}
                    </div>
                  </td>
                  <td>{formatCurrency(item.unitPrice + (item.toppingsPrice || 0) + (item.sizeExtraPrice || 0))}</td>
                  <td>{item.quantity}</td>
                  <td>{item.isRedeemed ? formatCurrency(0) : formatCurrency((item.unitPrice + (item.toppingsPrice || 0) + (item.sizeExtraPrice || 0)) * item.quantity)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <h2>Tổng cộng: {formatCurrency(order.total)}</h2>

          {canCancel && (
            <div className="status-actions">
              <button className="danger" onClick={handleCancel}>Hủy đơn (Quản lý)</button>
            </div>
          )}
        </div>

        <div className="order-detail-side">
          {order.status === 'paid' && (
            <div className="receipt">
              <h3>🧾 Hóa đơn</h3>
              <div className="receipt-row">
                <span>Phương thức thanh toán</span>
                <strong>{PAYMENT_METHODS.find((m) => m.value === order.paymentMethod)?.label}</strong>
              </div>
              {order.pointsUsed > 0 && (
                <div className="receipt-row">
                  <span>Tạm tính</span>
                  <strong>{formatCurrency(order.total + order.pointsUsed * POINTS_TO_VND)}</strong>
                </div>
              )}
              {order.pointsUsed > 0 && (
                <div className="receipt-row">
                  <span>Giảm giá (dùng {order.pointsUsed} điểm)</span>
                  <strong>-{formatCurrency(order.pointsUsed * POINTS_TO_VND)}</strong>
                </div>
              )}
              <div className="receipt-row">
                <span>Tổng tiền</span>
                <strong>{formatCurrency(order.total)}</strong>
              </div>
              {order.Customer ? (
                <>
                  <div className="receipt-divider" />
                  <div className="receipt-row">
                    <span>Khách hàng</span>
                    <strong>{order.Customer.name} ({order.Customer.phone})</strong>
                  </div>
                  {order.pointsEarned > 0 && (
                    <div className="receipt-row">
                      <span>Điểm được cộng</span>
                      <strong>+{order.pointsEarned}</strong>
                    </div>
                  )}
                  <div className="receipt-row receipt-highlight">
                    <span>Điểm tích lũy hiện tại</span>
                    <strong>{order.Customer.points}</strong>
                  </div>
                </>
              ) : (
                <p className="hint">Khách không để lại thông tin tích điểm.</p>
              )}
            </div>
          )}

          {order.status === 'served' && (
            <form className="payment-panel" onSubmit={handlePay}>
              <h3>Thanh toán</h3>

              <label>
                Phương thức thanh toán
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </label>

              <div className="customer-lookup">
                <label>
                  Số điện thoại khách (tích điểm)
                  <input
                    value={customerPhone}
                    onChange={(e) => { setCustomerPhone(e.target.value); setCustomerChecked(false); }}
                    placeholder="VD: 0901234567"
                  />
                </label>
                <button type="button" onClick={handleLookupCustomer}>Tra cứu điểm</button>
              </div>

              {customerChecked && (
                customer
                  ? <p className="hint">Khách quen: {customer.name} - đang có {customer.points} điểm.</p>
                  : <p className="hint">Chưa có trong hệ thống, nhập tên để tạo mới và bắt đầu tích điểm.</p>
              )}

              {customerPhone && (
                <label>
                  Tên khách hàng
                  <input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Tên khách" />
                </label>
              )}

              {customerChecked && customer && (
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
                  <p className="hint">
                    {hasDrink ? 'Khách chưa đủ điểm để đổi.' : 'Đơn chỉ có bánh/đồ ăn vặt — không dùng điểm để giảm giá được.'}
                  </p>
                )
              )}

              {payError && <p className="error-text">{payError}</p>}
              <button type="submit">Xác nhận thanh toán</button>
            </form>
          )}

          {order.status === 'cancelled' && (
            <p className="hint">Đơn hàng này đã bị hủy.</p>
          )}
        </div>
      </div>
    </div>
  );
}
