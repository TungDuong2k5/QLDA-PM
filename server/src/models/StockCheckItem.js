const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');

// Một dòng của phiếu kiểm kho: tồn trên hệ thống lúc gửi và số nhân viên đếm được.
// name/unit lưu lại để phiếu cũ vẫn đọc được dù nguyên liệu / món sau này đổi tên hay bị xóa.
const StockCheckItem = sequelize.define('StockCheckItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  kind: { type: DataTypes.ENUM('ingredient', 'product'), allowNull: false },
  refId: { type: DataTypes.INTEGER, allowNull: false },
  name: { type: DataTypes.STRING, allowNull: false },
  unit: { type: DataTypes.STRING, allowNull: true },
  systemQty: { type: DataTypes.FLOAT, allowNull: false },
  countedQty: { type: DataTypes.FLOAT, allowNull: false },
  // Số bánh / đồ ăn vặt đã bán (tự động từ hóa đơn) kể từ phiếu kiểm kho ca trước tới lúc gửi phiếu này; nguyên liệu luôn 0.
  soldQty: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
}, {
  tableName: 'stock_check_items',
  timestamps: false,
});

module.exports = StockCheckItem;
