const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Raw material used to make drinks/toppings (trà, sữa, syrup, ...) — tracked
// separately from Product/Topping stock, via IngredientMovement entries
// (nhập/xuất) rather than automatic deduction on sale (no recipe/BOM model).
const Ingredient = sequelize.define('Ingredient', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  unit: { type: DataTypes.STRING, allowNull: false, defaultValue: 'kg' },
  stock: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'ingredients',
  timestamps: true,
});

module.exports = Ingredient;
