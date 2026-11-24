const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

const User = sequelize.define('User', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  fullName: { type: DataTypes.STRING, allowNull: false },
  username: { type: DataTypes.STRING, allowNull: false, unique: true },
  password: { type: DataTypes.STRING, allowNull: false },
  // admin = quản lý; staff = tài khoản đăng nhập chung của quán (bán hàng); employee = nhân viên (chỉ là tên trong danh sách, không đăng nhập).
  role: { type: DataTypes.ENUM('admin', 'staff', 'employee'), allowNull: false, defaultValue: 'staff' },
  // false = nhân viên đã bị xóa (nghỉ việc): không đăng nhập được, không hiện trong danh sách,
  // nhưng giữ lại để lịch sử đơn hàng, ca, bảng lương không bị mất.
  isActive: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'users',
  timestamps: true,
});

module.exports = User;
