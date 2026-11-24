const { Customer } = require('../models');

async function lookup(req, res) {
  const customer = await Customer.findOne({ where: { phone: req.params.phone } });
  if (!customer) return res.status(404).json({ message: 'Customer not found' });
  res.json(customer);
}

module.exports = { lookup };
