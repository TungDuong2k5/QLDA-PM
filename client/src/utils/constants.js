export const SUGAR_ICE_LEVELS = [0, 10, 30, 50, 70, 100];

export const SIZES = [
  { value: 'M', label: 'Size M', extra: 0 },
  { value: 'L', label: 'Size L', extra: 10000 },
];

export const PAYMENT_METHODS = [
  { value: 'cash', label: 'Tiền mặt' },
  { value: 'bank_transfer', label: 'Chuyển khoản ngân hàng' },
  { value: 'momo', label: 'MoMo' },
  { value: 'zalopay', label: 'ZaloPay' },
];

// Redeeming points deducts cash at this rate (1 point = 100 VND — e.g. 59
// points off = 5,900 VND), no cap on the number of points (only the customer's
// balance and the invoice total), and only when the order contains a drink.
export const POINTS_TO_VND = 100;
