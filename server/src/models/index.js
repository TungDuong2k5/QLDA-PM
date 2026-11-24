const sequelize = require('../config/db');
const User = require('./User');
const Category = require('./Category');
const Product = require('./Product');
const Table = require('./Table');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const Customer = require('./Customer');
const Topping = require('./Topping');
const Shift = require('./Shift');
const ShiftExpense = require('./ShiftExpense');
const Ingredient = require('./Ingredient');
const IngredientMovement = require('./IngredientMovement');
const ProductMovement = require('./ProductMovement');
const ProductNotice = require('./ProductNotice');
const Employee = require('./Employee');
const EmployeeShift = require('./EmployeeShift');
const TimeLog = require('./TimeLog');
const CheckinReminder = require('./CheckinReminder');
const StockCheck = require('./StockCheck');
const StockCheckItem = require('./StockCheckItem');

Category.hasMany(Product, { foreignKey: 'categoryId', onDelete: 'SET NULL' });
Product.belongsTo(Category, { foreignKey: 'categoryId' });

Table.hasMany(Order, { foreignKey: 'tableId' });
Order.belongsTo(Table, { foreignKey: 'tableId' });

User.hasMany(Order, { foreignKey: 'userId' });
Order.belongsTo(User, { foreignKey: 'userId' });

Customer.hasMany(Order, { foreignKey: 'customerId' });
Order.belongsTo(Customer, { foreignKey: 'customerId' });

Order.hasMany(OrderItem, { foreignKey: 'orderId', onDelete: 'CASCADE' });
OrderItem.belongsTo(Order, { foreignKey: 'orderId' });

Product.hasMany(OrderItem, { foreignKey: 'productId' });
OrderItem.belongsTo(Product, { foreignKey: 'productId' });

// A line can instead BE a standalone topping sale (no product) — see
// orderController's buildOrderItemsData.
Topping.hasMany(OrderItem, { foreignKey: 'toppingId' });
OrderItem.belongsTo(Topping, { foreignKey: 'toppingId' });

Shift.hasMany(Order, { foreignKey: 'shiftId' });
Order.belongsTo(Shift, { foreignKey: 'shiftId' });

User.hasMany(Shift, { foreignKey: 'openedByUserId' });
Shift.belongsTo(User, { as: 'OpenedBy', foreignKey: 'openedByUserId' });

Shift.hasMany(ShiftExpense, { foreignKey: 'shiftId', onDelete: 'CASCADE' });
ShiftExpense.belongsTo(Shift, { foreignKey: 'shiftId' });

User.hasMany(ShiftExpense, { foreignKey: 'userId' });
ShiftExpense.belongsTo(User, { foreignKey: 'userId' });

User.hasMany(ShiftExpense, { as: 'ApprovedExpenses', foreignKey: 'approvedByUserId' });
ShiftExpense.belongsTo(User, { as: 'ApprovedBy', foreignKey: 'approvedByUserId' });

Ingredient.hasMany(IngredientMovement, { foreignKey: 'ingredientId', onDelete: 'CASCADE' });
IngredientMovement.belongsTo(Ingredient, { foreignKey: 'ingredientId' });

User.hasMany(IngredientMovement, { foreignKey: 'userId' });
IngredientMovement.belongsTo(User, { foreignKey: 'userId' });

Product.hasMany(ProductMovement, { foreignKey: 'productId', onDelete: 'CASCADE' });
ProductMovement.belongsTo(Product, { foreignKey: 'productId' });

User.hasMany(ProductMovement, { foreignKey: 'userId' });
ProductMovement.belongsTo(User, { foreignKey: 'userId' });

// Công thức: món nào dùng nguyên liệu nào — để khi một nguyên liệu hết thì biết
// những món nào phải đóng. Bảng nối product_ingredients do Sequelize tự tạo.
Product.belongsToMany(Ingredient, { through: 'product_ingredients', foreignKey: 'productId', otherKey: 'ingredientId' });
Ingredient.belongsToMany(Product, { through: 'product_ingredients', foreignKey: 'ingredientId', otherKey: 'productId' });

// Nhân viên – chấm công theo ngày và ca.
Employee.hasMany(EmployeeShift, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
EmployeeShift.belongsTo(Employee, { foreignKey: 'employeeId' });

// Nhật ký check-in / check-out thật (giờ vào, giờ ra, đi muộn).
Employee.hasMany(TimeLog, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
TimeLog.belongsTo(Employee, { foreignKey: 'employeeId' });

// Quầy nhắc quản lý khi nhân viên có lịch mà qua ca vẫn chưa check-in.
Employee.hasMany(CheckinReminder, { foreignKey: 'employeeId', onDelete: 'CASCADE' });
CheckinReminder.belongsTo(Employee, { foreignKey: 'employeeId' });

Product.hasOne(ProductNotice, { foreignKey: 'productId', onDelete: 'CASCADE' });
ProductNotice.belongsTo(Product, { foreignKey: 'productId' });

// Kiểm kho cuối ngày: phiếu + các dòng đếm; người gửi / người duyệt.
StockCheck.hasMany(StockCheckItem, { foreignKey: 'stockCheckId', onDelete: 'CASCADE' });
StockCheckItem.belongsTo(StockCheck, { foreignKey: 'stockCheckId' });
StockCheck.belongsTo(User, { as: 'SubmittedBy', foreignKey: 'submittedByUserId' });
StockCheck.belongsTo(User, { as: 'ReviewedBy', foreignKey: 'reviewedByUserId' });

module.exports = {
  sequelize,
  User,
  Category,
  Product,
  Table,
  Order,
  OrderItem,
  Customer,
  Topping,
  Shift,
  ShiftExpense,
  Ingredient,
  IngredientMovement,
  ProductMovement,
  ProductNotice,
  Employee,
  EmployeeShift,
  TimeLog,
  CheckinReminder,
  StockCheck,
  StockCheckItem,
};
