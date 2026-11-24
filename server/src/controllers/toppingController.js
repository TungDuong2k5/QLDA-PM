const { Topping } = require('../models');

async function list(req, res) {
  const toppings = await Topping.findAll({ order: [['name', 'ASC']] });
  res.json(toppings);
}

async function create(req, res) {
  const { name, price, isAvailable, stock } = req.body;
  if (!name || price === undefined) {
    return res.status(400).json({ message: 'name and price are required' });
  }
  const topping = await Topping.create({
    name,
    price,
    isAvailable: isAvailable ?? true,
    stock: stock === '' || stock === undefined ? null : stock,
  });
  res.status(201).json(topping);
}

async function update(req, res) {
  const topping = await Topping.findByPk(req.params.id);
  if (!topping) return res.status(404).json({ message: 'Topping not found' });
  const { name, price, isAvailable, stock } = req.body;
  await topping.update({
    name: name ?? topping.name,
    price: price ?? topping.price,
    isAvailable: isAvailable !== undefined ? isAvailable : topping.isAvailable,
    stock: stock !== undefined ? (stock === '' ? null : stock) : topping.stock,
  });
  res.json(topping);
}

async function remove(req, res) {
  const topping = await Topping.findByPk(req.params.id);
  if (!topping) return res.status(404).json({ message: 'Topping not found' });
  await topping.destroy();
  res.status(204).send();
}

module.exports = { list, create, update, remove };
