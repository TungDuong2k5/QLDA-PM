// Tạo nội dung mã QR thanh toán có sẵn số tiền.

// CRC16-CCITT (poly 0x1021, init 0xFFFF) — dùng cho chuẩn QR EMVCo/VietQR.
export function crc16(str) {
  let crc = 0xffff;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

const tlv = (id, value) => `${id}${String(value.length).padStart(2, '0')}${value}`;

// Bỏ dấu tiếng Việt, chỉ giữ chữ-số-khoảng trắng, tối đa 25 ký tự (giới hạn của nhiều ngân hàng).
export function cleanTransferNote(text) {
  return String(text || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9 ]/g, '')
    .trim()
    .slice(0, 25);
}

// VietQR (NAPAS 247): quét bằng app ngân hàng, MoMo, ZaloPay... sẽ tự điền
// ngân hàng, số tài khoản, số tiền và nội dung chuyển khoản.
export function buildVietQR({ bin, accountNumber, amount, note }) {
  const account = tlv('38',
    tlv('00', 'A000000727') +
    tlv('01', tlv('00', bin) + tlv('01', accountNumber)) +
    tlv('02', 'QRIBFTTA'));
  const body =
    tlv('00', '01') +
    tlv('01', '12') + // 12 = QR động (có số tiền)
    account +
    tlv('53', '704') +
    tlv('54', String(Math.round(amount))) +
    tlv('58', 'VN') +
    (note ? tlv('62', tlv('08', cleanTransferNote(note))) : '') +
    '6304';
  return body + crc16(body);
}

// Liên kết "nhận tiền" của MoMo: mở app MoMo với số điện thoại và số tiền đã điền sẵn.
export function buildMomoLink({ phone, amount }) {
  return `https://nhantien.momo.vn/${encodeURIComponent(phone)}/${Math.round(amount)}`;
}
