import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { PAYMENT_CONFIG } from '../utils/paymentConfig';
import { buildVietQR, buildMomoLink } from '../utils/paymentQr';

function formatCurrency(value) {
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND' }).format(value || 0);
}

// Hiện mã QR có sẵn số tiền cho các phương thức chuyển khoản / MoMo / ZaloPay.
// Khách quét xong, app tự điền số tiền — nhân viên chỉ cần đối chiếu rồi bấm xác nhận.
export default function PaymentQR({ method, amount, note }) {
  const [dataUrl, setDataUrl] = useState('');

  const { bank, momo } = PAYMENT_CONFIG;
  const bankReady = Boolean(bank.bin && bank.accountNumber);
  const momoReady = Boolean(momo.phone);

  // MoMo dùng liên kết riêng của MoMo; chuyển khoản và ZaloPay dùng VietQR
  // (app ZaloPay quét được VietQR của ngân hàng).
  let payload = '';
  let ready = false;
  if (amount > 0) {
    if (method === 'momo' && momoReady) {
      payload = buildMomoLink({ phone: momo.phone, amount });
      ready = true;
    } else if ((method === 'bank_transfer' || method === 'zalopay') && bankReady) {
      payload = buildVietQR({ bin: bank.bin, accountNumber: bank.accountNumber, amount, note });
      ready = true;
    }
  }

  useEffect(() => {
    let cancelled = false;
    if (!payload) { setDataUrl(''); return undefined; }
    QRCode.toDataURL(payload, { width: 280, margin: 1, errorCorrectionLevel: 'M' })
      .then((url) => { if (!cancelled) setDataUrl(url); })
      .catch(() => { if (!cancelled) setDataUrl(''); });
    return () => { cancelled = true; };
  }, [payload]);

  if (method === 'cash') return null;

  if (amount <= 0) {
    return <p className="hint">Hóa đơn 0đ — không cần quét mã thanh toán.</p>;
  }

  if (!ready) {
    return (
      <div className="payment-qr payment-qr-missing">
        <strong>Chưa cấu hình tài khoản nhận tiền</strong>
        <p>
          Điền thông tin {method === 'momo' ? 'MoMo' : 'ngân hàng'} của quán trong
          {' '}<code>client/src/utils/paymentConfig.js</code> để hiện mã QR.
        </p>
      </div>
    );
  }

  const title = method === 'momo' ? 'Quét mã bằng app MoMo'
    : method === 'zalopay' ? 'Mở ZaloPay → Quét mã (VietQR)'
      : 'Quét mã bằng app ngân hàng';

  return (
    <div className="payment-qr">
      <strong>{title}</strong>
      {dataUrl ? <img src={dataUrl} alt="Mã QR thanh toán" width="240" height="240" /> : <p className="hint">Đang tạo mã...</p>}
      <div className="payment-qr-amount">Số tiền: <b>{formatCurrency(amount)}</b></div>
      {method === 'momo' ? (
        <p className="hint">Nhận tiền: ví MoMo {momo.phone}</p>
      ) : (
        <div className="payment-qr-info">
          {bank.bankName && <div>Ngân hàng: {bank.bankName}</div>}
          <div>STK: {bank.accountNumber}</div>
          {bank.accountName && <div>Chủ TK: {bank.accountName}</div>}
          {note && <div>Nội dung: {note}</div>}
        </div>
      )}
      <p className="hint">Số tiền đã được điền sẵn trong mã. Đối chiếu khách đã chuyển rồi mới bấm xác nhận.</p>
    </div>
  );
}
