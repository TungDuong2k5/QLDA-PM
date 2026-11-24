const { Op } = require('sequelize');
const { sequelize, Product, Category, ProductMovement, ProductNotice, User } = require('../models');

async function list(req, res) {
  const products = await Product.findAll({
    include: [{ model: Category }],
    order: [['name', 'ASC']],
  });
  res.json(products);
}

// Món thuộc nhóm có theo dõi kho (bánh, đồ ăn vặt: không phải đồ uống, không phải nhóm "special") thì tự vào kho:
// không nhập tồn đầu thì bắt đầu từ 0 (hiện ở trang Kho và trong phiếu kiểm kho); có tồn đầu thì ghi thành phiếu nhập.
async function isStockTracked(categoryId) {
  if (!categoryId) return false;
  const cat = await Category.findByPk(categoryId);
  return Boolean(cat) && !cat.isDrink && String(cat.name || '').trim().toLowerCase() !== 'special';
}

async function create(req, res) {
  const { name, price, categoryId, imageUrl, description, isAvailable, stock } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ message: 'name and price are required' });
  }
  const tracked = await isStockTracked(categoryId);
  const given = stock === '' || stock === undefined || stock === null ? null : Number(stock);
  if (given !== null && (!Number.isFinite(given) || given < 0)) return res.status(400).json({ message: 'Tồn kho phải là số không âm' });
  const initial = given ?? (tracked ? 0 : null);
  const product = await sequelize.transaction(async (t) => {
    const created = await Product.create({
      name,
      price,
      categoryId: categoryId ?? null,
      imageUrl: imageUrl ?? null,
      description: description ?? null,
      isAvailable: isAvailable ?? true,
      stock: initial,
    }, { transaction: t });
    if (tracked && initial > 0) {
      await ProductMovement.create({ productId: created.id, type: 'in', quantity: initial, note: 'Tồn đầu khi thêm món mới', userId: req.user.id }, { transaction: t });
    }
    return created;
  });
  res.status(201).json(product);
}

async function update(req, res) {
  const product = await Product.findByPk(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  const { name, price, categoryId, imageUrl, description, isAvailable, stock } = req.body;
  // Chuyển món sang nhóm có theo dõi kho mà chưa có tồn thì bắt đầu từ 0 để vào kho.
  const nowTracked = categoryId !== undefined && categoryId !== product.categoryId && await isStockTracked(categoryId);
  const autoStock = nowTracked && product.stock === null && stock === undefined ? 0 : undefined;
  await product.update({
    name: name ?? product.name,
    price: price ?? product.price,
    categoryId: categoryId !== undefined ? categoryId : product.categoryId,
    imageUrl: imageUrl !== undefined ? imageUrl : product.imageUrl,
    description: description !== undefined ? description : product.description,
    isAvailable: isAvailable !== undefined ? isAvailable : product.isAvailable,
    stock: stock !== undefined ? (stock === '' ? null : stock) : (autoStock ?? product.stock),
  });
  res.json(product);
}

async function remove(req, res) {
  const product = await Product.findByPk(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  try {
    await product.destroy();
  } catch (err) {
    if (err.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ message: 'Không thể xóa sản phẩm đã có trong đơn hàng — hãy chuyển sang "Ngừng bán" thay vì xóa' });
    }
    throw err;
  }
  res.status(204).send();
}

// Admin types a quantity directly into the Nhập or Xuất cell for a
// finished-good product (bánh, đồ ăn vặt...) — that's the only way stock
// changes manually (sales also auto-record an 'out' — see orderController's
// consumeStock). A product never tracked before (stock === null) starts
// from 0 the first time a movement is recorded.
async function addMovement(req, res) {
  const { type, quantity, note } = req.body;
  if (!['in', 'out'].includes(type)) {
    return res.status(400).json({ message: 'type must be "in" or "out"' });
  }
  const qty = Number(quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ message: 'quantity must be a positive number' });
  }

  const product = await Product.findByPk(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });

  const currentStock = product.stock ?? 0;
  if (type === 'out' && currentStock < qty) {
    return res.status(400).json({ message: `Không đủ tồn kho — hiện còn ${currentStock}` });
  }

  await sequelize.transaction(async (t) => {
    await ProductMovement.create({
      productId: product.id,
      type,
      quantity: qty,
      note: note || null,
      userId: req.user.id,
    }, { transaction: t });
    await product.update(
      { stock: type === 'in' ? currentStock + qty : currentStock - qty },
      { transaction: t }
    );
  });

  res.json(product);
}

async function todayMovements(req, res) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const movements = await ProductMovement.findAll({
    where: { createdAt: { [Op.gte]: startOfDay } },
    include: [{ model: Product }, { model: User, attributes: ['fullName'] }],
    order: [['createdAt', 'DESC']],
  });
  res.json(movements);
}

async function monthlySummary(req, res) {
  const month = req.query.month; // 'YYYY-MM'
  const now = new Date();
  const [year, mon] = month ? month.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 1);

  const products = await Product.findAll({ include: [{ model: Category }], order: [['name', 'ASC']] });
  const [inMonth, afterMonth] = await Promise.all([
    ProductMovement.findAll({ where: { createdAt: { [Op.gte]: start, [Op.lt]: end } } }),
    ProductMovement.findAll({ where: { createdAt: { [Op.gte]: end } } }),
  ]);

  const totals = new Map();
  for (const m of inMonth) {
    const entry = totals.get(m.productId) || { totalIn: 0, totalOut: 0 };
    if (m.type === 'in') entry.totalIn += m.quantity;
    else entry.totalOut += m.quantity;
    totals.set(m.productId, entry);
  }

  const netAfter = new Map();
  for (const m of afterMonth) {
    const delta = m.type === 'in' ? m.quantity : -m.quantity;
    netAfter.set(m.productId, (netAfter.get(m.productId) || 0) + delta);
  }

  res.json({
    month: `${year}-${String(mon).padStart(2, '0')}`,
    rows: products
      .filter((p) => p.stock !== null || totals.has(p.id))
      .map((p) => {
        const t = totals.get(p.id) || { totalIn: 0, totalOut: 0 };
        const endingStock = (p.stock ?? 0) - (netAfter.get(p.id) || 0);
        return {
          id: p.id,
          name: p.name,
          category: p.Category?.name || 'Khác',
          totalIn: t.totalIn,
          totalOut: t.totalOut,
          endingStock,
        };
      }),
  });
}

// Đóng / bật món (cả nhân viên cũng làm được) — dùng khi món hết hàng / hết
// nguyên liệu hoặc khi có hàng lại. Chỉ đổi cờ isAvailable và dọn lời nhắn liên quan.
async function setAvailability(req, res) {
  const product = await Product.findByPk(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  if (typeof req.body.isAvailable !== 'boolean') {
    return res.status(400).json({ message: 'isAvailable must be true or false' });
  }
  await product.update({ isAvailable: req.body.isAvailable });
  if (req.body.isAvailable) {
    // Bật lại món → xóa mọi lời nhắn cũ về món này.
    await ProductNotice.destroy({ where: { productId: product.id } });
  } else {
    // Tắt món → ghi nhớ "đã tắt vì hết hàng" để sau này nhắc bật khi có hàng lại.
    const existing = await ProductNotice.findOne({ where: { productId: product.id } });
    if (existing) await existing.update({ kind: 'closed_for_stock' });
    else await ProductNotice.create({ productId: product.id, kind: 'closed_for_stock' });
  }
  res.json(product);
}

// Quản lý báo nhân viên tắt (close_request) hoặc bật lại (reopen_request) một món.
async function requestNotice(req, res) {
  const product = await Product.findByPk(req.params.id);
  if (!product) return res.status(404).json({ message: 'Product not found' });
  const { kind } = req.body;
  if (!['close_request', 'reopen_request'].includes(kind)) {
    return res.status(400).json({ message: 'kind must be close_request or reopen_request' });
  }
  if (kind === 'close_request' && !product.isAvailable) {
    return res.status(400).json({ message: 'Món này đang tắt rồi' });
  }
  if (kind === 'reopen_request' && product.isAvailable) {
    return res.status(400).json({ message: 'Món này đang bán rồi' });
  }
  const existing = await ProductNotice.findOne({ where: { productId: product.id } });
  if (existing) await existing.update({ kind, requestedByUserId: req.user.id });
  else await ProductNotice.create({ productId: product.id, kind, requestedByUserId: req.user.id });
  res.status(201).json({ productId: product.id, kind });
}

// Hủy lời báo (quản lý đổi ý).
async function cancelNotice(req, res) {
  await ProductNotice.destroy({ where: { productId: req.params.id, kind: ['close_request', 'reopen_request'] } });
  res.status(204).send();
}

module.exports = { list, create, update, remove, setAvailability, requestNotice, cancelNotice, addMovement, todayMovements, monthlySummary };
