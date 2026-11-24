const { Op } = require('sequelize');
const { sequelize, Order, OrderItem, Product, Table, User, Customer, Topping, Category, Shift, ProductMovement } = require('../models');
const { SUGAR_ICE_LEVELS, PAYMENT_METHODS, POINTS_PER_VND, POINTS_TO_VND, SIZES, SIZE_UPCHARGE } = require('../constants');
const { lockedProducts, isSpecial } = require('./stockAlertController');
const { shiftLabels } = require('../utils/timeclock');

// Món hết hàng thì KHÔNG gọi được: chặn các món đang bị khóa (hết hàng / hết nguyên liệu / quản lý báo tắt
// mà nhân viên chưa đóng món), món đã tắt, và số lượng gọi vượt quá tồn kho đang theo dõi.
async function assertSellable(items, productMap) {
  const qtyByProduct = new Map();
  for (const i of items) {
    if (i.productId) qtyByProduct.set(i.productId, (qtyByProduct.get(i.productId) || 0) + (i.quantity || 1));
  }
  if (qtyByProduct.size === 0) return;
  const locked = await lockedProducts();
  for (const [productId, qty] of qtyByProduct) {
    const product = productMap.get(productId);
    if (!product) continue; // sẽ báo PRODUCT_NOT_FOUND ở bước dựng đơn
    let reason = null;
    if (!product.isAvailable) reason = 'đang tạm ngưng bán';
    else if (locked.has(productId)) reason = `${locked.get(productId).toLowerCase()} — nhân viên cần đóng món`;
    else if (!isSpecial(product) && product.stock !== null && product.stock !== undefined && qty > product.stock) {
      reason = `chỉ còn ${Math.max(0, product.stock)}`;
    }
    if (reason) {
      const err = new Error('PRODUCT_SOLD_OUT');
      err.userMessage = `"${product.name}" ${reason}, không gọi được`;
      throw err;
    }
  }
}

// The order gets tagged with whichever shift is currently open (if any) so
// shift reports reflect exactly what was sold during that window.
async function findOpenShiftId(t) {
  const businessDate = new Date().toISOString().slice(0, 10);
  const shift = await Shift.findOne({ where: { businessDate, status: 'open' }, transaction: t });
  return shift ? shift.id : null;
}

const includeFull = [
  { model: Table },
  { model: User, attributes: ['id', 'fullName', 'username'] },
  { model: Customer },
  { model: OrderItem, include: [{ model: Product }, { model: Topping }] },
];

function lineTotal(item) {
  if (item.isRedeemed) return 0;
  return (item.unitPrice + (item.toppingsPrice || 0) + (item.sizeExtraPrice || 0)) * item.quantity;
}

function computeTotal(orderItems) {
  return orderItems.reduce((sum, item) => sum + lineTotal(item), 0);
}

// Point redemption: staff picks any point amount (1 point = 100 VND off),
// limited only by the customer's balance and the invoice total, and only available when the
// order has at least one drink (cakes/snacks-only orders can't redeem at
// all). `pointsUsed` on the returned object is the point count spent (not
// VND) — multiply by POINTS_TO_VND to get the cash discount.
function computeRedemption(orderItems, customer, requestedPoints) {
  const rawTotal = computeTotal(orderItems);
  const hasDrink = orderItems.some((item) => item.size);
  const points = Math.max(0, Math.floor(Number(requestedPoints) || 0));

  if (points === 0) {
    return { rawTotal, discount: 0, finalTotal: rawTotal, pointsUsed: 0, hasDrink };
  }
  if (!hasDrink) throw new Error('REDEEM_REQUIRES_DRINK');
  if (!customer) throw new Error('CUSTOMER_REQUIRED_FOR_REDEEM');
  if (points > customer.points) throw new Error('INSUFFICIENT_POINTS');

  // Không giới hạn số điểm đổi (miễn khách đủ điểm), chỉ không được giảm quá giá trị hóa đơn.
  const maxAllowedPoints = Math.floor(rawTotal / POINTS_TO_VND);
  if (points > maxAllowedPoints) {
    const err = new Error('REDEEM_EXCEEDS_CAP');
    err.maxAllowedPoints = maxAllowedPoints;
    throw err;
  }

  const discount = points * POINTS_TO_VND;
  return { rawTotal, discount, finalTotal: rawTotal - discount, pointsUsed: points, hasDrink };
}

// Shared by create() and checkout(): validates products/toppings and builds
// the OrderItem rows (topping quantities are unbounded — e.g. trân châu x10).
// A line with toppingId and no productId sells that topping on its own.
function buildOrderItemsData(items, productMap, toppingMap) {
  return items.map((i) => {
    if (i.toppingId && !i.productId) {
      const tp = toppingMap.get(i.toppingId);
      if (!tp) throw new Error('TOPPING_NOT_FOUND');
      return {
        productId: null,
        toppingId: tp.id,
        quantity: i.quantity || 1,
        unitPrice: tp.price,
        sugarLevel: 100,
        iceLevel: 100,
        toppings: [],
        toppingsPrice: 0,
        size: null,
        sizeExtraPrice: 0,
      };
    }

    const product = productMap.get(i.productId);
    if (!product) throw new Error('PRODUCT_NOT_FOUND');
    const isDrink = product.Category?.isDrink === true;

    const sugarLevel = i.sugarLevel ?? 100;
    const iceLevel = i.iceLevel ?? 100;
    if (!SUGAR_ICE_LEVELS.includes(sugarLevel) || !SUGAR_ICE_LEVELS.includes(iceLevel)) {
      throw new Error('INVALID_LEVEL');
    }

    // Topping only applies to drinks (e.g. cakes/snacks don't have toppings)
    const requestedToppings = isDrink ? (i.toppings || []) : [];
    const selectedToppings = requestedToppings
      .map((t) => {
        const tp = toppingMap.get(t.id ?? t.toppingId);
        if (!tp) throw new Error('TOPPING_NOT_FOUND');
        const quantity = Math.max(1, Number(t.quantity) || 1);
        return { id: tp.id, name: tp.name, price: tp.price, quantity };
      })
      .filter((t) => t.quantity > 0);
    const toppingsPrice = selectedToppings.reduce((sum, tp) => sum + tp.price * tp.quantity, 0);

    let size = null;
    let sizeExtraPrice = 0;
    if (isDrink) {
      size = i.size ?? 'M';
      if (!SIZES.includes(size)) throw new Error('INVALID_SIZE');
      sizeExtraPrice = SIZE_UPCHARGE[size];
    }

    return {
      productId: product.id,
      quantity: i.quantity || 1,
      unitPrice: product.price,
      sugarLevel,
      iceLevel,
      toppings: selectedToppings,
      toppingsPrice,
      size,
      sizeExtraPrice,
    };
  });
}

// Finished-goods products (bánh, đồ ăn vặt...) auto-track from every sale —
// admin never has to "activate" tracking with an initial nhập, and a sale
// is never blocked just because nobody has entered a stock count yet (the
// balance can go negative, which is itself the signal that a nhập is due).
// Toppings keep the older opt-in behaviour (stock === null = unlimited,
// blocked if a tracked count would go negative) since that wasn't asked to
// change.
async function consumeStock(items, productMap, toppingMap, t, userId) {
  const productQty = new Map();
  const toppingQty = new Map();

  for (const i of items) {
    if (i.toppingId && !i.productId) {
      toppingQty.set(i.toppingId, (toppingQty.get(i.toppingId) || 0) + (i.quantity || 1));
      continue;
    }
    productQty.set(i.productId, (productQty.get(i.productId) || 0) + (i.quantity || 1));
    for (const tp of i.toppings || []) {
      const toppingId = tp.id ?? tp.toppingId;
      const consumed = (Number(tp.quantity) || 1) * (i.quantity || 1);
      toppingQty.set(toppingId, (toppingQty.get(toppingId) || 0) + consumed);
    }
  }

  for (const [toppingId, qty] of toppingQty) {
    const topping = toppingMap.get(toppingId);
    if (topping.stock === null || topping.stock === undefined) continue;
    if (topping.stock < qty) {
      const err = new Error('INSUFFICIENT_STOCK');
      err.itemName = topping.name;
      err.available = topping.stock;
      throw err;
    }
  }

  for (const [productId, qty] of productQty) {
    const product = productMap.get(productId);
    // Drinks are made to order from ingredients, not counted finished
    // goods — only bánh/đồ ăn vặt (non-drink categories) auto-track.
    if (product.Category?.isDrink !== false) continue;
    await product.update({ stock: (product.stock ?? 0) - qty }, { transaction: t });
    await ProductMovement.create({
      productId,
      type: 'out',
      quantity: qty,
      note: 'Bán hàng',
      userId,
    }, { transaction: t });
  }
  for (const [toppingId, qty] of toppingQty) {
    const topping = toppingMap.get(toppingId);
    if (topping.stock === null || topping.stock === undefined) continue;
    await topping.decrement('stock', { by: qty, transaction: t });
  }
}

async function loadProductAndToppingMaps(items, t) {
  const productIds = items.map((i) => i.productId).filter(Boolean);
  const products = productIds.length
    ? await Product.findAll({ where: { id: productIds }, include: [{ model: Category }], transaction: t })
    : [];
  const productMap = new Map(products.map((p) => [p.id, p]));

  const toppingIds = [...new Set([
    ...items.flatMap((i) => (i.toppings || []).map((tp) => tp.id ?? tp.toppingId)),
    ...items.filter((i) => i.toppingId && !i.productId).map((i) => i.toppingId),
  ])];
  const toppingRows = toppingIds.length
    ? await Topping.findAll({ where: { id: toppingIds }, transaction: t })
    : [];
  const toppingMap = new Map(toppingRows.map((tp) => [tp.id, tp]));

  return { productMap, toppingMap };
}

// ---- Ngày (giờ địa phương của máy chủ) ----
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const padNum = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${padNum(d.getMonth() + 1)}-${padNum(d.getDate())}`;
const isRealDate = (s) => DATE_RE.test(String(s)) && localDate(new Date(`${s}T00:00:00`)) === s;
const dayRange = (date) => [new Date(`${date}T00:00:00`), new Date(`${date}T23:59:59.999`)];

// Danh sách đơn. ?date=YYYY-MM-DD chỉ lấy đơn của ngày đó (trang Đơn hàng dùng cho "hôm nay").
async function list(req, res) {
  const { status, date } = req.query;
  const where = status ? { status } : {};
  if (date) {
    if (!isRealDate(date)) return res.status(400).json({ message: 'Ngày không hợp lệ (YYYY-MM-DD)' });
    where.createdAt = { [Op.between]: dayRange(date) };
  }
  const orders = await Order.findAll({
    where,
    include: includeFull,
    order: [['createdAt', 'DESC']],
  });
  res.json(orders);
}

// Các ngày có hoạt động (có ca hoặc có đơn đã bán), mới nhất trước; luôn có hôm nay.
// Trang Đơn hàng chỉ liệt kê ca và bill nên KHÔNG trả doanh thu / tiền.
async function days(req, res) {
  const today = localDate(new Date());
  const [orders, shifts] = await Promise.all([
    Order.findAll({ attributes: ['id', 'status', 'createdAt'] }),
    Shift.findAll({ attributes: ['id', 'businessDate'] }),
  ]);
  const byDate = new Map();
  const row = (d) => {
    if (!byDate.has(d)) byDate.set(d, { date: d, shiftCount: 0, orderCount: 0 });
    return byDate.get(d);
  };
  row(today);
  shifts.forEach((sh) => { row(sh.businessDate).shiftCount += 1; });
  orders.filter((o) => o.status === 'paid').forEach((o) => { row(localDate(new Date(o.createdAt))).orderCount += 1; });
  res.json({ today, days: [...byDate.values()].sort((x, y) => (x.date < y.date ? 1 : -1)) });
}

// Các dòng món của một bill (không có giá): tên, số lượng, size / đường / đá, topping.
function billItems(order) {
  return (order.OrderItems || []).map((it) => {
    const isTopping = !it.productId && it.toppingId;
    let toppings = it.toppings;
    if (typeof toppings === 'string') { try { toppings = JSON.parse(toppings); } catch (e) { toppings = []; } }
    return {
      name: isTopping ? `${it.Topping?.name || 'Topping'} (topping bán riêng)` : (it.Product?.name || 'Món đã xóa'),
      quantity: it.quantity,
      size: it.size || null,
      sugarLevel: it.size ? it.sugarLevel : null,
      iceLevel: it.size ? it.iceLevel : null,
      toppings: (Array.isArray(toppings) ? toppings : []).map((t) => ({ name: t.name, quantity: t.quantity })),
      redeemed: Boolean(it.isRedeemed),
    };
  });
}

// Chi tiết một ngày: các ca trong ngày; mỗi ca có tổng hợp món đã bán và các bill (kèm món của từng bill).
// Bill của đơn chưa gắn ca nào gom vào "Ngoài ca". Không có doanh thu.
async function dayDetail(req, res) {
  const { date } = req.params;
  if (!isRealDate(date)) return res.status(400).json({ message: 'Ngày không hợp lệ (YYYY-MM-DD)' });
  const orders = await Order.findAll({
    where: { createdAt: { [Op.between]: dayRange(date) } },
    include: includeFull,
    order: [['createdAt', 'DESC']],
  });
  const shiftRows = await Shift.findAll({ where: { businessDate: date }, order: [['sequence', 'ASC']] });

  const mkBucket = (id, label, sh) => ({
    id, label, status: sh?.status || null, openedAt: sh?.openedAt || null, closedAt: sh?.closedAt || null, bills: [], summary: new Map(),
  });
  const labels = shiftLabels(shiftRows); // Ca 1 = sáng, Ca 2 = chiều, Ca 3 = tối (theo giờ mở ca)
  const buckets = new Map(shiftRows.map((sh) => [sh.id, mkBucket(sh.id, labels.get(sh.id), sh)]));
  const outside = mkBucket(null, 'Ngoài ca', null);

  for (const o of orders) {
    const bucket = buckets.get(o.shiftId) || outside;
    const items = billItems(o);
    bucket.bills.push({
      id: o.id,
      createdAt: o.createdAt,
      table: o.Table?.name || null,
      orderType: o.orderType,
      user: o.User?.fullName || null,
      status: o.status,
      items,
    });
    if (o.status === 'paid') {
      for (const it of items) bucket.summary.set(it.name, (bucket.summary.get(it.name) || 0) + it.quantity);
    }
  }

  const out = (b) => {
    const summary = [...b.summary.entries()]
      .map(([name, quantity]) => ({ name, quantity }))
      .sort((x, y) => y.quantity - x.quantity || x.name.localeCompare(y.name, 'vi'));
    return {
      id: b.id,
      label: b.label,
      status: b.status,
      openedAt: b.openedAt,
      closedAt: b.closedAt,
      billCount: b.bills.length,
      paidCount: b.bills.filter((x) => x.status === 'paid').length,
      totalQuantity: summary.reduce((sum, r) => sum + r.quantity, 0),
      summary,
      bills: b.bills,
    };
  };

  res.json({ date, shifts: [...buckets.values(), ...(outside.bills.length > 0 ? [outside] : [])].map(out) });
}

async function getOne(req, res) {
  const order = await Order.findByPk(req.params.id, { include: includeFull });
  if (!order) return res.status(404).json({ message: 'Order not found' });
  res.json(order);
}

function mapCreateError(err) {
  const map = {
    TABLE_NOT_FOUND: [404, 'Table not found'],
    PRODUCT_NOT_FOUND: [400, 'Invalid product in order'],
    TOPPING_NOT_FOUND: [400, 'Invalid topping in order'],
    INVALID_LEVEL: [400, `sugarLevel/iceLevel must be one of ${SUGAR_ICE_LEVELS.join(', ')}`],
    INVALID_SIZE: [400, `size must be one of ${SIZES.join(', ')}`],
  };
  return map[err.message];
}

function mapRedeemError(err) {
  const map = {
    CUSTOMER_NAME_REQUIRED: [400, 'customerName is required for a new customer'],
    REDEEM_REQUIRES_DRINK: [400, 'Đơn chỉ có bánh/đồ ăn vặt — không dùng điểm để giảm giá được'],
    CUSTOMER_REQUIRED_FOR_REDEEM: [400, 'Cần thông tin khách hàng (SĐT) để đổi điểm'],
    INSUFFICIENT_POINTS: [400, 'Khách không đủ điểm để đổi số lượng này'],
    REDEEM_EXCEEDS_CAP: [400, `Chỉ được đổi tối đa ${err.maxAllowedPoints} điểm cho hóa đơn này (không được giảm quá giá trị hóa đơn)`],
  };
  return map[err.message];
}

async function create(req, res) {
  const { tableId, orderType, items, note } = req.body;
  if (!tableId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'tableId and at least one item are required' });
  }

  const result = await sequelize.transaction(async (t) => {
    const table = await Table.findByPk(tableId, { transaction: t });
    if (!table) throw new Error('TABLE_NOT_FOUND');

    const { productMap, toppingMap } = await loadProductAndToppingMaps(items, t);
    await assertSellable(items, productMap);
    const orderItemsData = buildOrderItemsData(items, productMap, toppingMap);
    const total = computeTotal(orderItemsData);

    const order = await Order.create(
      { tableId, orderType: orderType === 'takeaway' ? 'takeaway' : 'dine_in', note: note ?? null, total, userId: req.user.id },
      { transaction: t }
    );

    await OrderItem.bulkCreate(
      orderItemsData.map((i) => ({ ...i, orderId: order.id })),
      { transaction: t }
    );

    await table.update({ status: 'occupied' }, { transaction: t });

    return order.id;
  }).catch((err) => {
    if (err.message === 'PRODUCT_SOLD_OUT') return { error: 400, message: err.userMessage, soldOut: true };
    const mapped = mapCreateError(err);
    if (mapped) return { error: mapped[0], message: mapped[1] };
    throw err;
  });

  if (result && result.error) {
    return res.status(result.error).json({ message: result.message });
  }

  const order = await Order.findByPk(result, { include: includeFull });
  res.status(201).json(order);
}

// Builds the order and charges it in one step: pick items -> pay -> done.
// No "pending/preparing/served" staging — matches the simplified staff flow.
async function checkout(req, res) {
  const {
    tableId, orderType, items, note,
    paymentMethod, customerPhone, customerName, redeemPoints,
  } = req.body;

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'At least one item is required' });
  }
  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ message: `paymentMethod must be one of ${PAYMENT_METHODS.join(', ')}` });
  }
  const isTakeaway = orderType === 'takeaway';
  if (!isTakeaway && !tableId) {
    return res.status(400).json({ message: 'tableId is required for dine-in orders' });
  }

  const result = await sequelize.transaction(async (t) => {
    let table = null;
    if (!isTakeaway) {
      table = await Table.findByPk(tableId, { transaction: t });
      if (!table) throw new Error('TABLE_NOT_FOUND');
    }

    const { productMap, toppingMap } = await loadProductAndToppingMaps(items, t);
    await assertSellable(items, productMap);
    const orderItemsData = buildOrderItemsData(items, productMap, toppingMap);
    await consumeStock(items, productMap, toppingMap, t, req.user.id);

    let customer = null;
    if (customerPhone) {
      customer = await Customer.findOne({ where: { phone: customerPhone }, transaction: t });
      if (!customer) {
        if (!customerName) throw new Error('CUSTOMER_NAME_REQUIRED');
        customer = await Customer.create({ phone: customerPhone, name: customerName, points: 0 }, { transaction: t });
      } else if (customerName && customerName !== customer.name) {
        await customer.update({ name: customerName }, { transaction: t });
      }
    }

    const { finalTotal, pointsUsed } = computeRedemption(orderItemsData, customer, redeemPoints);
    const pointsEarned = Math.floor(finalTotal / POINTS_PER_VND);

    if (customer) {
      customer.points = customer.points - pointsUsed + pointsEarned;
      await customer.save({ transaction: t });
    }

    const order = await Order.create({
      tableId: isTakeaway ? null : tableId,
      orderType: isTakeaway ? 'takeaway' : 'dine_in',
      note: note ?? null,
      status: 'paid',
      paymentMethod,
      customerId: customer ? customer.id : null,
      pointsUsed,
      pointsEarned,
      total: finalTotal,
      userId: req.user.id,
      shiftId: await findOpenShiftId(t),
    }, { transaction: t });

    await OrderItem.bulkCreate(
      orderItemsData.map((i) => ({ ...i, orderId: order.id })),
      { transaction: t }
    );

    if (table) {
      const otherActive = await Order.count({
        where: { tableId: table.id, status: ['pending', 'preparing', 'served'] },
        transaction: t,
      });
      if (otherActive === 0) await table.update({ status: 'available' }, { transaction: t });
    }

    return order.id;
  }).catch((err) => {
    if (err.message === 'PRODUCT_SOLD_OUT') return { error: 400, message: err.userMessage, soldOut: true };
    if (err.message === 'INSUFFICIENT_STOCK') {
      return { error: 400, message: `"${err.itemName}" không đủ hàng (còn ${err.available})` };
    }
    const mapped = mapCreateError(err) || mapRedeemError(err);
    if (mapped) return { error: mapped[0], message: mapped[1] };
    throw err;
  });

  if (result && result.error) {
    return res.status(result.error).json({ message: result.message });
  }

  const order = await Order.findByPk(result, { include: includeFull });
  res.status(201).json(order);
}

async function updateStatus(req, res) {
  const { status } = req.body;
  if (status === 'paid') {
    return res.status(400).json({ message: 'Use POST /orders/:id/pay (or /checkout) to mark an order as paid' });
  }
  // Cancelling is the only manual status change left for the simplified flow
  // (orders are created already paid via checkout) — admin-only, per policy.
  if (status !== 'cancelled') {
    return res.status(400).json({ message: 'status must be "cancelled"' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Only an admin can cancel an order' });
  }

  const order = await Order.findByPk(req.params.id, { include: [{ model: Table }] });
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (order.status === 'cancelled') {
    return res.status(400).json({ message: 'Order is already cancelled' });
  }

  await order.update({ status });

  const otherActive = await Order.count({
    where: { tableId: order.tableId, status: ['pending', 'preparing', 'served'] },
  });
  if (otherActive === 0 && order.Table) {
    await order.Table.update({ status: 'available' });
  }

  const updated = await Order.findByPk(order.id, { include: includeFull });
  res.json(updated);
}

async function pay(req, res) {
  const { paymentMethod, customerPhone, customerName, redeemPoints } = req.body;

  if (!PAYMENT_METHODS.includes(paymentMethod)) {
    return res.status(400).json({ message: `paymentMethod must be one of ${PAYMENT_METHODS.join(', ')}` });
  }

  const order = await Order.findByPk(req.params.id, {
    include: [{ model: Table }, { model: OrderItem }],
  });
  if (!order) return res.status(404).json({ message: 'Order not found' });
  if (order.status !== 'served') {
    return res.status(400).json({ message: 'Order must be in "served" status before payment' });
  }

  const result = await sequelize.transaction(async (t) => {
    let customer = null;
    if (customerPhone) {
      customer = await Customer.findOne({ where: { phone: customerPhone }, transaction: t });
      if (!customer) {
        if (!customerName) throw new Error('CUSTOMER_NAME_REQUIRED');
        customer = await Customer.create({ phone: customerPhone, name: customerName, points: 0 }, { transaction: t });
      } else if (customerName && customerName !== customer.name) {
        await customer.update({ name: customerName }, { transaction: t });
      }
    }

    const freshItems = await OrderItem.findAll({ where: { orderId: order.id }, transaction: t });
    const { finalTotal, pointsUsed } = computeRedemption(freshItems, customer, redeemPoints);
    const pointsEarned = Math.floor(finalTotal / POINTS_PER_VND);

    if (customer) {
      customer.points = customer.points - pointsUsed + pointsEarned;
      await customer.save({ transaction: t });
    }

    await order.update({
      status: 'paid',
      paymentMethod,
      customerId: customer ? customer.id : null,
      pointsUsed,
      pointsEarned,
      total: finalTotal,
      shiftId: await findOpenShiftId(t),
    }, { transaction: t });

    const otherActive = await Order.count({
      where: { tableId: order.tableId, status: ['pending', 'preparing', 'served'] },
      transaction: t,
    });
    if (otherActive === 0 && order.Table) {
      await order.Table.update({ status: 'available' }, { transaction: t });
    }

    return order.id;
  }).catch((err) => {
    const mapped = mapRedeemError(err);
    if (mapped) return { error: mapped[0], message: mapped[1] };
    throw err;
  });

  if (result && result.error) {
    return res.status(result.error).json({ message: result.message });
  }

  const updated = await Order.findByPk(result, { include: includeFull });
  res.json(updated);
}

module.exports = { list, days, dayDetail, getOne, create, checkout, updateStatus, pay };
