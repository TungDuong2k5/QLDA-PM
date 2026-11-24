const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// One nhập (stock-in) or xuất (stock-out) entry for an Ingredient — the
// ledger that daily/monthly reports are computed from.
const IngredientMovement = sequelize.define('IngredientMovement', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  type: { type: DataTypes.ENUM('in', 'out'), allowNull: false },
  quantity: { type: DataTypes.FLOAT, allowNull: false },
  note: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'ingredient_movements',
  timestamps: true,
});

module.exports = IngredientMovement;
