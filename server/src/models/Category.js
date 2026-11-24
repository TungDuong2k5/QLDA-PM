const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Category = sequelize.define('Category', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  isDrink: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  imageUrl: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'categories',
  timestamps: true,
});

module.exports = Category;
