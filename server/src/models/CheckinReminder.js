const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Quầy nhắc quản lý: nhân viên có lịch một ca nhưng ca đã qua mà chưa check-in.
// Quản lý xử lý bằng cách thêm chấm công tay (tự hết nhắc khi đã có chấm công) hoặc bấm "Bỏ qua".
const CheckinReminder = sequelize.define('CheckinReminder', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employeeId: { type: DataTypes.INTEGER, allowNull: false },
  workDate: { type: DataTypes.DATEONLY, allowNull: false },
  slot: { type: DataTypes.ENUM('morning', 'afternoon', 'evening'), allowNull: false },
  resolvedAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'checkin_reminders',
  timestamps: true,
  indexes: [{ unique: true, fields: ['employeeId', 'workDate', 'slot'] }],
});

module.exports = CheckinReminder;
