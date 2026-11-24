require('dotenv').config();
const bcrypt = require('bcryptjs');
const { sequelize, User, Category, Product, Table, Topping } = require('./models');

async function seed() {
  await sequelize.sync({ force: true });

  const adminPassword = await bcrypt.hash('admin123', 10);
  const staffPassword = await bcrypt.hash('staff123', 10);

  await User.bulkCreate([
    { fullName: 'Quản trị viên', username: 'admin', password: adminPassword, role: 'admin' },
    { fullName: 'Nhân viên', username: 'staff', password: staffPassword, role: 'staff' },
  ]);

  const [caPhe, traSua, banh, anVat] = await Category.bulkCreate([
    { name: 'Cà phê', isDrink: true },
    { name: 'Trà sữa', isDrink: true },
    { name: 'Bánh ngọt', isDrink: false },
    { name: 'Ăn vặt', isDrink: false },
  ]);

  await Product.bulkCreate([
    { name: 'Cà phê đen', price: 20000, categoryId: caPhe.id },
    { name: 'Cà phê sữa', price: 25000, categoryId: caPhe.id },
    { name: 'Bạc xỉu', price: 27000, categoryId: caPhe.id },
    { name: 'Trà sữa truyền thống', price: 30000, categoryId: traSua.id },
    { name: 'Trà sữa matcha', price: 35000, categoryId: traSua.id },
    { name: 'Bánh croissant', price: 22000, categoryId: banh.id },
    { name: 'Bánh tiramisu', price: 32000, categoryId: banh.id },
    { name: 'Khoai tây chiên', price: 25000, categoryId: anVat.id },
    { name: 'Gà viên chiên', price: 28000, categoryId: anVat.id },
  ]);

  await Table.bulkCreate([
    { name: 'Bàn 1', capacity: 2 },
    { name: 'Bàn 2', capacity: 4 },
    { name: 'Bàn 3', capacity: 4 },
    { name: 'Bàn 4', capacity: 6 },
    { name: 'Bàn 5', capacity: 2 },
  ]);

  await Topping.bulkCreate([
    { name: 'Trân châu đen', price: 5000 },
    { name: 'Trân châu trắng', price: 5000 },
    { name: 'Thạch trái cây', price: 5000 },
    { name: 'Pudding trứng', price: 6000 },
    { name: 'Kem cheese', price: 8000 },
    { name: 'Thêm shot espresso', price: 10000 },
  ]);

  console.log('Seed data created successfully.');
  console.log('Admin login: admin / admin123');
  console.log('Staff login: staff / staff123');
  process.exit(0);
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
