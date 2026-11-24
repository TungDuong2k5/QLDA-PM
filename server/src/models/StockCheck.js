const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Phiếu kiểm kho cuối mỗi ca: nhân viên đếm hàng thực tế rồi gửi cho quản lý kiểm tra.
// Mỗi ca (sáng / chiều / tối) của một ngày kinh doanh một phiếu; bị từ chối thì nhân viên đếm lại và gửi lại (ghi đè phiếu).
//   submitted = đã gửi, chờ quản lý · approved = quản lý đã duyệt · rejected = yêu cầu kiểm lại
const StockCheck = sequelize.define('StockCheck', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  businessDate: { type: DataTypes.DATEONLY, allowNull: false },
  slot: { type: DataTypes.ENUM('morning', 'afternoon', 'evening'), allowNull: false, defaultValue: 'morning' },
  status: { type: DataTypes.ENUM('submitted', 'approved', 'rejected'), allowNull: false, defaultValue: 'submitted' },
  submittedByUserId: { type: DataTypes.INTEGER, allowNull: true },
  submittedAt: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
  note: { type: DataTypes.STRING, allowNull: true },
  reviewedByUserId: { type: DataTypes.INTEGER, allowNull: true },
  reviewedAt: { type: DataTypes.DATE, allowNull: true },
  reviewNote: { type: DataTypes.STRING, allowNull: true },
  applied: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false }, // đã cập nhật tồn kho theo số đếm
}, {
  tableName: 'stock_checks',
  timestamps: true,
  indexes: [{ unique: true, fields: ['businessDate', 'slot'] }],
});

module.exports = StockCheck;
