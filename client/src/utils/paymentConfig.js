// ====================================================================
//  THÔNG TIN NHẬN TIỀN CỦA QUÁN — điền vào đây để mã QR thanh toán hoạt động.
//  Để trống thì trang thanh toán sẽ nhắc "chưa cấu hình" thay vì hiện QR sai.
// ====================================================================

export const PAYMENT_CONFIG = {
  bank: {
    // Mã BIN của ngân hàng (6 số). Một số mã thường gặp:
    //   Vietcombank 970436 · MB Bank 970422 · ACB 970416 · Techcombank 970407
    //   BIDV 970418 · VietinBank 970415 · TPBank 970423 · Agribank 970405
    bin: '970415',
    bankName: 'VietinBank',       // Tên hiển thị, VD: 'MB Bank'
    accountNumber: '0764530562',  // Số tài khoản nhận tiền
    accountName: 'ĐOAN TUNG DUONG',    // Tên chủ tài khoản (hiển thị cho nhân viên đối chiếu)
  },
  momo: {
    phone: '0764530562',          // Số điện thoại ví MoMo nhận tiền, VD: '0901234567'
  },
};
