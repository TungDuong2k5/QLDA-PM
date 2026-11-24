const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const Table = sequelize.define('Table', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  name: { type: DataTypes.STRING, allowNull: false, unique: true },
  capacity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },
  status: {
    type: DataTypes.ENUM('available', 'occupied'),
    allowNull: false,
    defaultValue: 'available',
  },
}, {
  tableName: 'tables',
  timestamps: true,
});

module.exports = Table;
