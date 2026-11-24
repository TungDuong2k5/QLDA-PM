const { DataTypes } = require('sequelize');
const sequelize = require('../config/db');
const { SUGAR_ICE_LEVELS } = require('../constants');

const OrderItem = sequelize.define('OrderItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  quantity: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 1 },
  unitPrice: { type: DataTypes.FLOAT, allowNull: false },
  sugarLevel: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100,
    validate: { isIn: [SUGAR_ICE_LEVELS] },
  },
  iceLevel: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 100,
    validate: { isIn: [SUGAR_ICE_LEVELS] },
  },
  toppings: { type: DataTypes.JSON, allowNull: false, defaultValue: [] },
  toppingsPrice: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  size: { type: DataTypes.STRING, allowNull: true, validate: { isIn: [['M', 'L']] } },
  sizeExtraPrice: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  isRedeemed: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  // Set instead of productId when this line is a topping sold on its own
  // (e.g. a customer just wants extra trân châu, no drink attached).
  toppingId: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'order_items',
  timestamps: true,
});

module.exports = OrderItem;
