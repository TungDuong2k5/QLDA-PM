const { Op } = require('sequelize');
const { Order, OrderItem, Product, Category, Topping, Shift, ShiftExpense } = require('../models');
const { todayDateOnly } = require('./shiftController');
const { shiftLabels } = require('../utils/timeclock');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const isRealDate = (s) => DATE_RE.test(String(s)) && localDate(new Date(`${s}T00:00:00`)) === s;
const dayRange = (date) => [new Date(`${date}T00:00:00`), new Date(`${date}T23:59:59.999`)];

// Doanh thu theo phương thức thanh toán của một nhóm đơn.
const byMethod = (list) => list.reduce((acc, o) => {
  acc[o.paymentMethod] = (acc[o.paymentMethod] || 0) + o.total;
  return acc;
}, {});

const withItems = [{
  model: OrderItem,
  include: [{ model: Product, include: [{ model: Category }] }, { model: Topping }],
}];

// Gom các đơn đã thanh toán: doanh thu, số đơn, theo phương thức thanh toán, theo danh mục, sản phẩm bán chạy.
function aggregate(orders) {
  const paymentMethods = {};
  const categories = new Map();
  const products = new Map();
  let revenue = 0;
  for (const order of orders) {
    revenue += order.total;
    paymentMethods[order.paymentMethod] = (paymentMethods[order.paymentMethod] || 0) + order.total;
    for (const item of order.OrderItems || []) {
      const categoryName = item.Product?.Category?.name || (item.Topping ? 'Topping (bán riêng)' : 'Khác');
      categories.set(categoryName, (categories.get(categoryName) || 0) + item.quantity);
      if (item.productId) {
        const row = products.get(item.productId) || { productId: item.productId, name: item.Product?.name || 'Món đã xóa', totalQuantity: 0 };
        row.totalQuantity += item.quantity;
        products.set(item.productId, row);
      }
    }
  }
  return {
    revenue,
    orderCount: orders.length,
    paymentMethods,
    categories: [...categories.entries()].map(([name, quantity]) => ({ name, quantity })).sort((a, b) => b.quantity - a.quantity),
    topProducts: [...products.values()].sort((a, b) => b.totalQuantity - a.totalQuantity).slice(0, 5),
  };
}

// Tổng hợp cả ngày hôm nay (doanh thu tất cả các ca, tiền két, danh mục, sản phẩm bán chạy của HÔM NAY):
// cả quản lý và nhân viên đều xem được, để nhân viên biết doanh thu của các ca còn lại.
async function summary(req, res) {
  const activeOrders = await Order.count({ where: { status: ['pending', 'preparing', 'served'] } });

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999);

  const [todayRevenue, todayOrders, paidOrdersToday, todayShifts] = await Promise.all([
    Order.sum('total', {
      where: { status: 'paid', updatedAt: { [Op.gte]: startOfDay } },
    }),
    Order.count({ where: { createdAt: { [Op.gte]: startOfDay } } }),
    Order.findAll({
      where: { status: 'paid', updatedAt: { [Op.gte]: startOfDay, [Op.lte]: endOfDay } },
      include: withItems,
    }),
    Shift.findAll({ where: { businessDate: todayDateOnly() } }),
  ]);

  const todayShiftIds = todayShifts.map((s) => s.id);
  const expenseTotal = todayShiftIds.length
    ? (await ShiftExpense.sum('amount', {
        where: { shiftId: { [Op.in]: todayShiftIds }, status: { [Op.ne]: 'rejected' } },
      })) || 0
    : 0;

  const agg = aggregate(paidOrdersToday);
  const openingCashTotal = todayShifts.reduce((sum, s) => sum + (s.openingCash || 0), 0);
  const cashRevenue = agg.paymentMethods.cash || 0;

  const dayTotal = {
    revenue: todayRevenue || 0,
    paymentMethods: agg.paymentMethods,
    categories: agg.categories,
    openingCash: openingCashTotal,
    cashRevenue,
    totalExpenses: expenseTotal,
    // Tổng tiền mặt trong két cả ngày = tiền đầu các ca + doanh thu tiền mặt - chi phát sinh.
    cashOnHand: openingCashTotal + cashRevenue - expenseTotal,
  };

  res.json({
    today: todayDateOnly(),
    activeOrders,
    todayRevenue: todayRevenue || 0,
    todayOrders,
    topProducts: agg.topProducts,
    dayTotal,
  });
}

// Các ngày trước hôm nay có đơn đã thanh toán (mới nhất trước): ngày, số đơn, doanh thu. Tối đa 60 ngày.
async function days(req, res) {
  const today = localDate(new Date());
  const orders = await Order.findAll({ where: { status: 'paid' }, attributes: ['id', 'total', 'createdAt'], order: [['createdAt', 'DESC']] });
  const byDate = new Map();
  for (const o of orders) {
    const d = localDate(new Date(o.createdAt));
    if (d >= today) continue;
    const row = byDate.get(d) || { date: d, orderCount: 0, revenue: 0 };
    row.orderCount += 1;
    row.revenue += o.total;
    byDate.set(d, row);
  }
  res.json({ days: [...byDate.values()].sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 60) });
}

// Chi tiết doanh thu của một ngày: tổng, thanh toán, danh mục, sản phẩm bán chạy, tiền két và doanh thu từng ca.
async function dayDetail(req, res) {
  const { date } = req.params;
  if (!isRealDate(date)) return res.status(400).json({ message: 'Ngày không hợp lệ (YYYY-MM-DD)' });

  const orders = await Order.findAll({
    where: { status: 'paid', createdAt: { [Op.between]: dayRange(date) } },
    include: withItems,
  });
  const shifts = await Shift.findAll({ where: { businessDate: date }, order: [['sequence', 'ASC']] });
  const expenses = shifts.length
    ? await ShiftExpense.findAll({ where: { shiftId: { [Op.in]: shifts.map((s) => s.id) }, status: { [Op.ne]: 'rejected' } } })
    : [];

  const agg = aggregate(orders);
  const labels = shiftLabels(shifts);
  const shiftRows = shifts.map((s) => {
    const mine = orders.filter((o) => o.shiftId === s.id);
    const cash = mine.filter((o) => o.paymentMethod === 'cash').reduce((sum, o) => sum + o.total, 0);
    const spent = expenses.filter((e) => e.shiftId === s.id).reduce((sum, e) => sum + e.amount, 0);
    return {
      id: s.id,
      label: labels.get(s.id),
      openedAt: s.openedAt,
      closedAt: s.closedAt,
      orderCount: mine.length,
      revenue: mine.reduce((sum, o) => sum + o.total, 0),
      openingCash: s.openingCash || 0,
      cashRevenue: cash,
      totalExpenses: spent,
      paymentMethods: byMethod(mine),
    };
  });
  const knownIds = new Set(shifts.map((s) => s.id));
  const outside = orders.filter((o) => !knownIds.has(o.shiftId));
  if (outside.length > 0) {
    shiftRows.push({
      id: null, label: 'Ngoài ca', openedAt: null, closedAt: null, orderCount: outside.length,
      revenue: outside.reduce((sum, o) => sum + o.total, 0), openingCash: 0,
      cashRevenue: outside.filter((o) => o.paymentMethod === 'cash').reduce((sum, o) => sum + o.total, 0), totalExpenses: 0,
      paymentMethods: byMethod(outside),
    });
  }

  const openingCash = shiftRows.reduce((sum, s) => sum + s.openingCash, 0);
  const totalExpenses = shiftRows.reduce((sum, s) => sum + s.totalExpenses, 0);
  const cashRevenue = agg.paymentMethods.cash || 0;
  res.json({
    date,
    revenue: agg.revenue,
    orderCount: agg.orderCount,
    paymentMethods: agg.paymentMethods,
    categories: agg.categories,
    topProducts: agg.topProducts,
    openingCash,
    cashRevenue,
    totalExpenses,
    cashOnHand: openingCash + cashRevenue - totalExpenses,
    shifts: shiftRows,
  });
}

module.exports = { summary, days, dayDetail };
