require('dotenv').config();
const app = require('./app');
const db = require('./models');
const seedAdmin = require('./seeders/seedAdmin');
const seedExpenseCategories = require('./seeders/seedExpenseCategories');

const PORT = process.env.PORT || 4100;

async function start() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connected');

    await db.sequelize.sync({ alter: true });
    console.log('Models synced');

    await seedAdmin();
    await seedExpenseCategories();

    app.listen(PORT, () => {
      console.log(`GCGL Admin Portal API running on port ${PORT}`);
    });
  } catch (err) {
    console.error('Startup error:', err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, shutting down...');
  await db.sequelize.close();
  process.exit(0);
});

start();
