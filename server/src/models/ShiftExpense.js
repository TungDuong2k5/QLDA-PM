const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// One cash-out entry for an incidental expense during a shift (e.g. sửa
// máy cà phê, mua giấy ăn) — reduces the shift's tiền mặt trong két.
// Nhân viên ghi khoản chi (mặc định "pending"), quản lí duyệt lại sau —
// "approved"/"rejected". Khoản bị từ chối không bị trừ vào tiền két nữa.
const ShiftExpense = sequelize.define('ShiftExpense', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  amount: { type: DataTypes.FLOAT, allowNull: false },
  note: { type: DataTypes.STRING, allowNull: false },
  status: { type: DataTypes.ENUM('pending', 'approved', 'rejected'), allowNull: false, defaultValue: 'pending' },
  approvedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'shift_expenses',
  timestamps: true,
});

module.exports = ShiftExpense;
