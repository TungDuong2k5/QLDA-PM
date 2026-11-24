const { Table } = require('../models');

async function list(req, res) {
  const tables = await Table.findAll();
  tables.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));
  res.json(tables);
}

async function create(req, res) {
  const { name, capacity } = req.body;
  if (!name) return res.status(400).json({ message: 'name is required' });
  const table = await Table.create({ name, capacity: capacity ?? 4 });
  res.status(201).json(table);
}

async function update(req, res) {
  const table = await Table.findByPk(req.params.id);
  if (!table) return res.status(404).json({ message: 'Table not found' });
  const { name, capacity, status } = req.body;
  await table.update({
    name: name ?? table.name,
    capacity: capacity ?? table.capacity,
    status: status ?? table.status,
  });
  res.json(table);
}

async function remove(req, res) {
  const table = await Table.findByPk(req.params.id);
  if (!table) return res.status(404).json({ message: 'Table not found' });
  try {
    await table.destroy();
  } catch (err) {
    if (err.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ message: 'Không thể xóa bàn đã có đơn hàng liên kết' });
    }
    throw err;
  }
  res.status(204).send();
}

module.exports = { list, create, update, remove };
