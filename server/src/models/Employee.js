const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Nhân viên của quán: chỉ là hồ sơ (không có tài khoản đăng nhập).
const Employee = sequelize.define('Employee', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fullName: { type: DataTypes.STRING, allowNull: false },
  phone: { type: DataTypes.STRING, allowNull: true },
  startDate: { type: DataTypes.DATEONLY, allowNull: true },
  // false = đã nghỉ việc (vẫn giữ lại để không mất lịch sử chấm công).
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
  // Mã PIN (4–6 số) đã băm bằng bcrypt để nhân viên tự check-in; null = chưa đặt PIN.
  pinHash: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'employees',
  timestamps: true,
});

module.exports = Employee;
