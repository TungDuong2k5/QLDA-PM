const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// A work shift, opened automatically when staff log in (or right after the
// previous one closes) and ended with an explicit "kết ca" action. Shifts
// are independent, sequential sessions — not tied to fixed times of day.
const Shift = sequelize.define('Shift', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  sequence: { type: DataTypes.INTEGER, allowNull: false },
  businessDate: { type: DataTypes.DATEONLY, allowNull: false },
  status: { type: DataTypes.ENUM('open', 'closed'), allowNull: false, defaultValue: 'open' },
  openedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  closedAt: { type: DataTypes.DATE, allowNull: true },
  // Tiền mặt có sẵn trong két khi mở ca (đếm tay trước khi bán).
  openingCash: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'shifts',
  timestamps: true,
});

module.exports = Shift;
