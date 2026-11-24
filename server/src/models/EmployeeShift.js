const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Chấm công: nhân viên đã làm ca nào trong ngày nào (sáng / chiều / tối).
const EmployeeShift = sequelize.define('EmployeeShift', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  employeeId: { type: DataTypes.INTEGER, allowNull: false },
  workDate: { type: DataTypes.DATEONLY, allowNull: false },
  slot: { type: DataTypes.ENUM('morning', 'afternoon', 'evening'), allowNull: false },
}, {
  tableName: 'employee_shifts',
  timestamps: true,
  indexes: [{ unique: true, fields: ['employeeId', 'workDate', 'slot'] }],
});

module.exports = EmployeeShift;
