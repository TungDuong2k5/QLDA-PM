const {
  Shift, ShiftExpense, Order, OrderItem, Product, Category, Topping, User, TimeLog,
} = require('../models');
const tc = require('../utils/timeclock');

function todayDateOnly() {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

// Aggregates paid orders tagged with this shift into revenue / payment
// method totals / items sold — live for an open shift, frozen once closed
// (an order's shiftId never changes after checkout).
async function computeShiftReport(shift) {
  const orders = await Order.findAll({
    where: { shiftId: shift.id, status: 'paid' },
    include: [{
      model: OrderItem,
      include: [{ model: Product, include: [{ model: Category }] }, { model: Topping }],
    }],
  });

  const paymentMethods = {};
  const itemMap = new Map();
  let revenue = 0;

  for (const order of orders) {
    revenue += order.total;
    paymentMethods[order.paymentMethod] = (paymentMethods[order.paymentMethod] || 0) + order.total;
    for (const item of order.OrderItems || []) {
      const name = item.Product?.name || (item.Topping ? `${item.Topping.name} (topping riêng)` : 'Không rõ');
      itemMap.set(name, (itemMap.get(name) || 0) + item.quantity);
    }
  }

  const cashRevenue = paymentMethods.cash || 0;
  const openingCash = shift.openingCash || 0;

  const expenseRows = await ShiftExpense.findAll({
    where: { shiftId: shift.id },
    include: [
      { model: User, attributes: ['fullName'] },
      { model: User, as: 'ApprovedBy', attributes: ['fullName'] },
    ],
    order: [['createdAt', 'ASC']],
  });
  // Khoản bị quản lí từ chối không tính là tiền đã chi khỏi két nữa.
  const totalExpenses = expenseRows
    .filter((e) => e.status !== 'rejected')
    .reduce((sum, e) => sum + e.amount, 0);

  return {
    revenue,
    orderCount: orders.length,
    paymentMethods,
    // Tách riêng từng phần để thu ngân đối chiếu/chốt két cho dễ.
    openingCash,
    cashRevenue,
    totalExpenses,
    expenses: expenseRows.map((e) => ({
      id: e.id,
      amount: e.amount,
      note: e.note,
      status: e.status,
      createdAt: e.createdAt,
      user: e.User?.fullName,
      approvedBy: e.ApprovedBy?.fullName,
    })),
    // Tiền mặt hiện có trong két = tiền đầu ca + doanh thu tiền mặt - chi phát sinh (không tính khoản bị từ chối).
    cashOnHand: openingCash + cashRevenue - totalExpenses,
    items: [...itemMap.entries()]
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((a, b) => b.quantity - a.quantity),
  };
}

// Tên ca theo khung giờ lúc mở (sáng = Ca 1, chiều = Ca 2, tối = Ca 3), xét trong các ca cùng ngày.
async function labelOf(shift) {
  const sameDay = await Shift.findAll({ where: { businessDate: shift.businessDate }, attributes: ['id', 'openedAt'] });
  return tc.shiftLabels(sameDay).get(shift.id) || `Ca ${shift.sequence}`;
}

async function serializeShift(shift) {
  const report = await computeShiftReport(shift);
  return {
    id: shift.id,
    label: await labelOf(shift),
    status: shift.status,
    openedAt: shift.openedAt,
    closedAt: shift.closedAt,
    openedBy: shift.OpenedBy?.fullName,
    ...report,
  };
}

async function openNextShift(userId, t, openingCash = 0) {
  const businessDate = todayDateOnly();
  const lastToday = await Shift.findOne({
    where: { businessDate },
    order: [['sequence', 'DESC']],
    transaction: t,
  });
  return Shift.create({
    sequence: lastToday ? lastToday.sequence + 1 : 1,
    businessDate,
    status: 'open',
    openedAt: new Date(),
    openedByUserId: userId ?? null,
    openingCash: Number(openingCash) || 0,
  }, { transaction: t });
}

async function getOpenShift(t) {
  return Shift.findOne({ where: { businessDate: todayDateOnly(), status: 'open' }, transaction: t });
}

async function current(req, res) {
  const open = await Shift.findOne({
    where: { businessDate: todayDateOnly(), status: 'open' },
    include: [{ model: User, as: 'OpenedBy', attributes: ['fullName'] }],
  });
  res.json(open ? await serializeShift(open) : null);
}

async function today(req, res) {
  const shifts = await Shift.findAll({
    where: { businessDate: todayDateOnly() },
    include: [{ model: User, as: 'OpenedBy', attributes: ['fullName'] }],
    order: [['sequence', 'ASC']],
  });
  res.json({ shifts: await Promise.all(shifts.map(serializeShift)) });
}

// Mở ca: nhân viên đã nhập PIN check-in trước đó (ít nhất một người); nhập tiền két đầu ca rồi mở ca để bán hàng.
async function open(req, res) {
  const existing = await getOpenShift();
  if (existing) {
    return res.status(400).json({ message: `Đang có ${(await labelOf(existing)).toLowerCase()} mở, hãy kết ca đó trước` });
  }
  // Phải có người check-in đúng CA ĐANG CHẠY (người còn "trong ca" từ ca trước không tính).
  // Ngoài giờ các ca (không có ca nào đang check-in) thì chỉ cần có người đang check-in.
  const slot = tc.checkinSlot(new Date());
  const where = { workDate: todayDateOnly(), checkOutAt: null, ...(slot ? { slot } : {}) };
  const checkedIn = await TimeLog.count({ where });
  if (checkedIn === 0) {
    const label = slot ? tc.SLOTS[slot].label.toLowerCase() : 'ca hiện tại';
    return res.status(400).json({ message: `Chưa có nhân viên nào check-in ${label} — nhân viên nhập mã PIN check-in rồi mới mở ca được` });
  }
  const shift = await openNextShift(req.user.id, undefined, req.body?.openingCash);
  res.status(201).json(await serializeShift(shift));
}

// Kết ca: chỉ đóng ca bán hàng (chốt doanh thu, két). KHÔNG check-out hộ nhân viên —
// mỗi nhân viên tự check-out bằng mã PIN khi tới giờ tan ca. Ca tiếp theo chỉ mở khi bấm Mở ca.
async function close(req, res) {
  const shift = await Shift.findByPk(req.params.id);
  if (!shift) return res.status(404).json({ message: 'Shift not found' });
  if (shift.status === 'closed') return res.status(400).json({ message: 'Ca này đã kết rồi' });

  await shift.update({ status: 'closed', closedAt: new Date() });

  res.json({ closed: await serializeShift(shift) });
}

async function report(req, res) {
  const shift = await Shift.findByPk(req.params.id, {
    include: [{ model: User, as: 'OpenedBy', attributes: ['fullName'] }],
  });
  if (!shift) return res.status(404).json({ message: 'Shift not found' });
  res.json(await serializeShift(shift));
}

// Ghi nhận một khoản chi tiền mặt phát sinh trong ca (VD: sửa máy cà phê,
// mua giấy ăn) — trừ thẳng vào tiền mặt hiện có trong két của ca đó.
async function addExpense(req, res) {
  const { amount, note } = req.body;
  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ message: 'Số tiền phải lớn hơn 0' });
  }
  if (!note || !note.trim()) {
    return res.status(400).json({ message: 'Vui lòng nhập ghi chú (lý do chi tiền)' });
  }
  const shift = await Shift.findByPk(req.params.id);
  if (!shift) return res.status(404).json({ message: 'Shift not found' });

  await ShiftExpense.create({
    shiftId: shift.id,
    userId: req.user.id,
    amount: Number(amount),
    note: note.trim(),
  });
  res.status(201).json(await serializeShift(shift));
}

// Quản lí duyệt hoặc từ chối một khoản chi do nhân viên ghi nhận.
async function reviewExpense(req, res) {
  const { status } = req.body;
  if (!['approved', 'rejected'].includes(status)) {
    return res.status(400).json({ message: 'status phải là approved hoặc rejected' });
  }
  const expense = await ShiftExpense.findByPk(req.params.expenseId);
  if (!expense) return res.status(404).json({ message: 'Expense not found' });

  await expense.update({ status, approvedByUserId: req.user.id, approvedAt: new Date() });

  const shift = await Shift.findByPk(expense.shiftId);
  res.json(await serializeShift(shift));
}

module.exports = {
  current, today, open, close, report, addExpense, reviewExpense, getOpenShift, openNextShift, todayDateOnly,
};
