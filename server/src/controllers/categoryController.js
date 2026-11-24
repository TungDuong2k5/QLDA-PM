const { Category, Product } = require('../models');

async function list(req, res) {
  const categories = await Category.findAll({ order: [['name', 'ASC']] });
  res.json(categories);
}

async function create(req, res) {
  const { name, isDrink, imageUrl } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });
  const category = await Category.create({ name, isDrink: isDrink ?? true, imageUrl: imageUrl ?? null });
  res.status(201).json(category);
}

async function update(req, res) {
  const category = await Category.findByPk(req.params.id);
  if (!category) return res.status(404).json({ message: 'Category not found' });
  const wasDrink = category.isDrink;
  await category.update({
    name: req.body.name ?? category.name,
    isDrink: req.body.isDrink !== undefined ? req.body.isDrink : category.isDrink,
    imageUrl: req.body.imageUrl !== undefined ? req.body.imageUrl : category.imageUrl,
  });
  // Nhóm chuyển từ đồ uống sang bánh / đồ ăn vặt: các món chưa theo dõi tồn vào kho với tồn 0.
  if (wasDrink && !category.isDrink && String(category.name || '').trim().toLowerCase() !== 'special') {
    await Product.update({ stock: 0 }, { where: { categoryId: category.id, stock: null } });
  }
  res.json(category);
}

async function remove(req, res) {
  const category = await Category.findByPk(req.params.id);
  if (!category) return res.status(404).json({ message: 'Category not found' });
  await Product.update({ categoryId: null }, { where: { categoryId: category.id } });
  await category.destroy();
  res.status(204).send();
}

module.exports = { list, create, update, remove };
