const { Op } = require('sequelize');
const { sequelize, Ingredient, IngredientMovement, Product, User } = require('../models');

async function list(req, res) {
  // Kèm danh sách món dùng nguyên liệu này (để hiện/ chỉnh công thức ở trang Kho).
  const ingredients = await Ingredient.findAll({
    include: [{ model: Product, attributes: ['id', 'name'], through: { attributes: [] } }],
    order: [['name', 'ASC']],
  });
  res.json(ingredients);
}

// Chọn những món có dùng nguyên liệu này. Nguyên liệu hết thì các món này
// sẽ được báo cho nhân viên đóng.
async function setProducts(req, res) {
  const ingredient = await Ingredient.findByPk(req.params.id);
  if (!ingredient) return res.status(404).json({ message: 'Ingredient not found' });
  const { productIds } = req.body;
  if (!Array.isArray(productIds)) {
    return res.status(400).json({ message: 'productIds must be an array' });
  }
  const ids = [...new Set(productIds.map(Number).filter(Number.isInteger))];
  await ingredient.setProducts(ids);
  res.json({ id: ingredient.id, productIds: ids });
}

async function create(req, res) {
  const { name, unit, stock } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });
  const initial = stock ? Number(stock) : 0;
  if (!Number.isFinite(initial) || initial < 0) return res.status(400).json({ message: 'Tồn kho phải là số không âm' });
  const ingredient = await sequelize.transaction(async (t) => {
    const created = await Ingredient.create({ name, unit: unit || 'kg', stock: initial }, { transaction: t });
    if (initial > 0) {
      await IngredientMovement.create({ ingredientId: created.id, type: 'in', quantity: initial, note: 'Tồn đầu khi thêm nguyên liệu', userId: req.user.id }, { transaction: t });
    }
    return created;
  });
  res.status(201).json(ingredient);
}

async function update(req, res) {
  const ingredient = await Ingredient.findByPk(req.params.id);
  if (!ingredient) return res.status(404).json({ message: 'Ingredient not found' });
  const { name, unit } = req.body;
  await ingredient.update({
    name: name ?? ingredient.name,
    unit: unit ?? ingredient.unit,
  });
  res.json(ingredient);
}

async function remove(req, res) {
  const ingredient = await Ingredient.findByPk(req.params.id);
  if (!ingredient) return res.status(404).json({ message: 'Ingredient not found' });
  await ingredient.destroy();
  res.status(204).send();
}

// Admin types a quantity directly into the Nhập or Xuất cell — that's the
// only way stock changes (no direct "tồn kho" edit): typing a number and
// confirming records exactly that much in or out.
async function addMovement(req, res) {
  const { type, quantity, note } = req.body;
  if (!['in', 'out'].includes(type)) {
    return res.status(400).json({ message: 'type must be "in" or "out"' });
  }
  const qty = Number(quantity);
  if (!qty || qty <= 0) {
    return res.status(400).json({ message: 'quantity must be a positive number' });
  }

  const ingredient = await Ingredient.findByPk(req.params.id);
  if (!ingredient) return res.status(404).json({ message: 'Ingredient not found' });

  if (type === 'out' && ingredient.stock < qty) {
    return res.status(400).json({ message: `Không đủ tồn kho — hiện còn ${ingredient.stock} ${ingredient.unit}` });
  }

  await sequelize.transaction(async (t) => {
    await IngredientMovement.create({
      ingredientId: ingredient.id,
      type,
      quantity: qty,
      note: note || null,
      userId: req.user.id,
    }, { transaction: t });
    await ingredient.update(
      { stock: type === 'in' ? ingredient.stock + qty : ingredient.stock - qty },
      { transaction: t }
    );
  });

  res.json(ingredient);
}

// Today's movements across all ingredients — the daily nhập/xuất/tồn view.
async function todayMovements(req, res) {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const movements = await IngredientMovement.findAll({
    where: { createdAt: { [Op.gte]: startOfDay } },
    include: [{ model: Ingredient }, { model: User, attributes: ['fullName'] }],
    order: [['createdAt', 'DESC']],
  });
  res.json(movements);
}

// Month-end summary: per ingredient, total nhập / xuất / ending stock for
// the given month (defaults to the current month).
async function monthlySummary(req, res) {
  const month = req.query.month; // 'YYYY-MM'
  const now = new Date();
  const [year, mon] = month ? month.split('-').map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const start = new Date(year, mon - 1, 1);
  const end = new Date(year, mon, 1);

  const ingredients = await Ingredient.findAll({ order: [['name', 'ASC']] });
  const [inMonth, afterMonth] = await Promise.all([
    IngredientMovement.findAll({ where: { createdAt: { [Op.gte]: start, [Op.lt]: end } } }),
    IngredientMovement.findAll({ where: { createdAt: { [Op.gte]: end } } }),
  ]);

  const totals = new Map();
  for (const m of inMonth) {
    const entry = totals.get(m.ingredientId) || { totalIn: 0, totalOut: 0 };
    if (m.type === 'in') entry.totalIn += m.quantity;
    else entry.totalOut += m.quantity;
    totals.set(m.ingredientId, entry);
  }

  // Undo movements that happened after this month so "ending stock" reflects
  // the balance as of the end of the requested month, not right now.
  const netAfter = new Map();
  for (const m of afterMonth) {
    const delta = m.type === 'in' ? m.quantity : -m.quantity;
    netAfter.set(m.ingredientId, (netAfter.get(m.ingredientId) || 0) + delta);
  }

  res.json({
    month: `${year}-${String(mon).padStart(2, '0')}`,
    rows: ingredients.map((ing) => {
      const t = totals.get(ing.id) || { totalIn: 0, totalOut: 0 };
      const endingStock = ing.stock - (netAfter.get(ing.id) || 0);
      return {
        id: ing.id,
        name: ing.name,
        unit: ing.unit,
        totalIn: t.totalIn,
        totalOut: t.totalOut,
        endingStock,
      };
    }),
  });
}

module.exports = { list, setProducts, create, update, remove, addMovement, todayMovements, monthlySummary };
