require('dotenv').config();
const path = require('path');
const { DataTypes } = require('sequelize');
const express = require('express');
const cors = require('cors');
const { sequelize, Ingredient, Employee, User } = require('./models');

const authRoutes = require('./routes/auth');
const categoryRoutes = require('./routes/categories');
const productRoutes = require('./routes/products');
const tableRoutes = require('./routes/tables');
const orderRoutes = require('./routes/orders');
const dashboardRoutes = require('./routes/dashboard');
const toppingRoutes = require('./routes/toppings');
const customerRoutes = require('./routes/customers');
const shiftRoutes = require('./routes/shifts');
const ingredientRoutes = require('./routes/ingredients');
const uploadRoutes = require('./routes/uploads');
const stockAlertRoutes = require('./routes/stockAlerts');
const employeeRoutes = require('./routes/employees');
const timeclockRoutes = require('./routes/timeclock');
const stockCheckRoutes = require('./routes/stockChecks');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/api/health', (req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/products', productRoutes);
app.use('/api/tables', tableRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/toppings', toppingRoutes);
app.use('/api/customers', customerRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/ingredients', ingredientRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/stock-alerts', stockAlertRoutes);
app.use('/api/employees', employeeRoutes);
app.use('/api/timeclock', timeclockRoutes);
app.use('/api/stock-checks', stockCheckRoutes);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ message: 'Internal server error' });
});

const PORT = process.env.PORT || 5000;

// Default raw-material list (trà sữa + topping ingredients) — inserted once
// if the table is empty; admin can add/remove/rename from there.
const DEFAULT_INGREDIENTS = [
  { name: 'Trà lài', unit: 'kg' },
  { name: 'Trà olong nướng', unit: 'kg' },
  { name: 'Trà đen', unit: 'kg' },
  { name: 'Trà olong xanh', unit: 'kg' },
  { name: 'Trà hibicus', unit: 'kg' },
  { name: 'Trà hoa cúc', unit: 'kg' },
  { name: 'Đường cát', unit: 'kg' },
  { name: 'Bột chanh', unit: 'kg' },
  { name: 'Cốt dừa', unit: 'lít' },
  { name: 'Anchor', unit: 'hộp' },
  { name: 'Sữa tươi', unit: 'lít' },
  { name: 'Sữa đặc', unit: 'hộp' },
  { name: 'Puree dừa non Long Beach', unit: 'chai' },
  { name: 'Bột sữa', unit: 'kg' },
  { name: 'Bơ đông lạnh', unit: 'kg' },
  { name: 'Dâu đông lạnh', unit: 'kg' },
  { name: 'Fruit mix dâu', unit: 'chai' },
  { name: 'Nước ép cóc', unit: 'chai' },
  { name: 'Mứt thơm Long Beach', unit: 'chai' },
  { name: 'Mật ong', unit: 'chai' },
  { name: 'Cà phê phin', unit: 'kg' },
  { name: 'Đào', unit: 'hộp' },
  { name: 'Vải', unit: 'hộp' },
  { name: 'Chôm chôm', unit: 'hộp' },
  { name: 'Đác', unit: 'hộp' },
  { name: 'Bột thạch jelly', unit: 'kg' },
  { name: 'Quế', unit: 'kg' },
  { name: 'Bột cheese', unit: 'kg' },
  { name: 'Sirup vanilla', unit: 'chai' },
  { name: 'Sirup lựu', unit: 'chai' },
  { name: 'Mứt ổi hồng', unit: 'chai' },
];

async function seedDefaultIngredientsIfEmpty() {
  const count = await Ingredient.count();
  if (count > 0) return;
  await Ingredient.bulkCreate(DEFAULT_INGREDIENTS.map((i) => ({ ...i, stock: 0 })));
  console.log(`Seeded ${DEFAULT_INGREDIENTS.length} default ingredients.`);
}

// Lần đầu có bảng employees: đưa các nhân viên đã có sẵn trong bảng users (vai trò employee) sang danh sách mới.
async function importEmployeesFromUsersIfEmpty() {
  if ((await Employee.count()) > 0) return;
  const old = await User.findAll({ where: { role: 'employee' }, order: [['id', 'ASC']] });
  if (old.length === 0) return;
  await Employee.bulkCreate(old.map((u) => ({
    fullName: u.fullName,
    startDate: new Date(u.createdAt).toISOString().slice(0, 10),
    isActive: u.isActive,
  })));
  console.log(`Đã chuyển ${old.length} nhân viên cũ sang danh sách nhân viên mới.`);
}

// sync() chỉ tạo bảng thiếu, không thêm cột vào bảng đã có — cột pinHash của employees thêm riêng (chạy lặp lại an toàn).
async function ensureEmployeePinColumn() {
  const qi = sequelize.getQueryInterface();
  const columns = await qi.describeTable('employees');
  if (!columns.pinHash) {
    await qi.addColumn('employees', 'pinHash', { type: DataTypes.STRING, allowNull: true });
    console.log('Added employees.pinHash');
  }
}

Promise.resolve()
  .then(() => require('./controllers/stockCheckController').migrateStockCheckSlot())
  .then(() => sequelize.sync())
  .then(ensureEmployeePinColumn)
  .then(() => require('./controllers/stockCheckController').ensureSoldQtyColumn())
  .then(() => require('./controllers/stockCheckController').applyLegacyPending())
  .then(importEmployeesFromUsersIfEmpty)
  .then(seedDefaultIngredientsIfEmpty)
  .then(() => {
    app.listen(PORT, () => {
      console.log(`Coffee shop API listening on http://localhost:${PORT}`);
    });
  });
