const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Ghi nhớ "lời nhắn" giữa quản lý và nhân viên về một món (mỗi món tối đa một dòng):
//  - close_request:   quản lý báo nhân viên TẮT món (VD: hết hàng mà chưa nhập kịp)
//  - reopen_request:  quản lý báo nhân viên BẬT lại món
//  - closed_for_stock: nhân viên đã tắt món vì hết hàng → khi có hàng lại thì nhắc bật
const ProductNotice = sequelize.define('ProductNotice', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  productId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  kind: {
    type: DataTypes.ENUM('close_request', 'reopen_request', 'closed_for_stock'),
    allowNull: false,
  },
  requestedByUserId: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'product_notices',
  timestamps: true,
});

module.exports = ProductNotice;
