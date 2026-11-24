const SUGAR_ICE_LEVELS = [0, 10, 30, 50, 70, 100];
const PAYMENT_METHODS = ['cash', 'bank_transfer', 'momo', 'zalopay'];
const POINTS_PER_VND = 10000;
// Redeeming points deducts cash at this rate (1 point = 100 VND — e.g. 59
// points off = 5,900 VND), and only when the order contains at least one drink.
// Staff picks any point amount as long as the customer has that many and it
// doesn't exceed the invoice total.
const POINTS_TO_VND = 100;
const SIZES = ['M', 'L'];
const SIZE_UPCHARGE = { M: 0, L: 10000 };

module.exports = { SUGAR_ICE_LEVELS, PAYMENT_METHODS, POINTS_PER_VND, POINTS_TO_VND, SIZES, SIZE_UPCHARGE };
