const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Product = sequelize.define('Product', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false },
  price: { type: DataTypes.FLOAT, allowNull: false },
  imageUrl: { type: DataTypes.STRING, allowNull: true },
  description: { type: DataTypes.TEXT, allowNull: true },
  isAvailable: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  // Remaining stock. null = not tracked (unlimited); a number is decremented
  // on each sale and checkout is blocked once it would go negative.
  stock: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'products',
  timestamps: true,
});

module.exports = Product;
