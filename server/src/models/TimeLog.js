const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Nhật ký check-in / check-out thật của nhân viên trong một ca.
const TimeLog = sequelize.define('TimeLog', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employeeId: { type: DataTypes.INTEGER, allowNull: false },
  workDate: { type: DataTypes.DATEONLY, allowNull: false },
  slot: { type: DataTypes.ENUM('morning', 'afternoon', 'evening'), allowNull: false },
  checkInAt: { type: DataTypes.DATE, allowNull: false },
  checkOutAt: { type: DataTypes.DATE, allowNull: true },
  // Phút đi muộn và tiền phạt (1.000đ/phút) tính lúc check-in; quản lý sửa giờ vào thì tính lại.
  lateMinutes: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  latePenalty: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  // true = ô chấm công của ca này do chính lần check-in tạo ra (hủy check-in thì gỡ luôn ô đó).
  autoMarked: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
}, {
  tableName: 'time_logs',
  timestamps: true,
  indexes: [{ unique: true, fields: ['employeeId', 'workDate', 'slot'] }],
});

module.exports = TimeLog;
