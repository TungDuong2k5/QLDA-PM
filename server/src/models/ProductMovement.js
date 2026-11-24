const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Manual stock adjustment for a finished-goods product (bánh, đồ ăn vặt...),
// auto-recorded whenever admin edits the stock number directly — the delta
// becomes an 'in' or 'out' entry so monthly nhập/xuất/tồn reports still work.
const ProductMovement = sequelize.define('ProductMovement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  type: { type: DataTypes.ENUM('in', 'out'), allowNull: false },
  quantity: { type: DataTypes.FLOAT, allowNull: false },
  note: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'product_movements',
  timestamps: true,
});

module.exports = ProductMovement;
