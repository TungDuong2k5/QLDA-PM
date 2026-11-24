require('dotenv').config();
const { DataTypes } = require('sequelize');
const { sequelize } = require('./models');

// One-off, idempotent column additions for existing databases.
// Plain `sequelize.sync()` only creates missing tables, it never alters
// existing ones (SQLite + Sequelize's alter-sync is unreliable — see README).
// Run this after pulling changes that add new columns to existing tables.
async function addColumnIfMissing(table, column, spec) {
  const qi = sequelize.getQueryInterface();
  const description = await qi.describeTable(table);
  if (description[column]) {
    console.log(`- ${table}.${column} already exists, skipping`);
    return;
  }
  await qi.addColumn(table, column, spec);
  console.log(`+ added ${table}.${column}`);
}

async function migrate() {
  await addColumnIfMissing('categories', 'isDrink', {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  });
  await addColumnIfMissing('order_items', 'size', {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await addColumnIfMissing('order_items', 'sizeExtraPrice', {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });
  await addColumnIfMissing('categories', 'imageUrl', {
    type: DataTypes.STRING,
    allowNull: true,
  });
  await addColumnIfMissing('orders', 'orderType', {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'dine_in',
  });
  await addColumnIfMissing('orders', 'shiftId', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await addColumnIfMissing('products', 'stock', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await addColumnIfMissing('toppings', 'stock', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await addColumnIfMissing('order_items', 'toppingId', {
    type: DataTypes.INTEGER,
    allowNull: true,
  });
  await addColumnIfMissing('shifts', 'openingCash', {
    type: DataTypes.FLOAT,
    allowNull: false,
    defaultValue: 0,
  });

  console.log('Migration complete.');
  process.exit(0);
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
