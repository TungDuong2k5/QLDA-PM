const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Topping = sequelize.define('Topping', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  isAvailable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  // Remaining stock. null = not tracked (unlimited); a number is decremented
  // on each sale and checkout is blocked once it would go negative.
  stock: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'toppings',
  timestamps: true,
});

module.exports = Topping;
