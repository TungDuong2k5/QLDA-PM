const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const { PAYMENT_METHODS } = require('../constants');

const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  status: {
    type: DataTypes.ENUM('pending', 'preparing', 'served', 'paid', 'cancelled'),
    allowNull: false,
    defaultValue: 'pending',
  },
  orderType: {
    type: DataTypes.ENUM('dine_in', 'takeaway'),
    allowNull: false,
    defaultValue: 'dine_in',
  },
  total: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  note: { type: DataTypes.STRING, allowNull: true },
  paymentMethod: {
    type: DataTypes.ENUM(...PAYMENT_METHODS),
    allowNull: true,
  },
  pointsUsed: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  pointsEarned: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'orders',
  timestamps: true,
});

module.exports = Order;
