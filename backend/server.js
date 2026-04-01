require('dotenv').config();
const cron = require('node-cron');
const app = require('./app');
const db = require('./models');
const seedAdmin = require('./seeders/seedAdmin');
const seedExpenseCategories = require('./seeders/seedExpenseCategories');
const fixedCostService = require('./services/fixedCostAllocationService');

const PORT = process.env.PORT || 4100;

async function start() {
  try {
    await db.sequelize.authenticate();
    console.log('Database connected');

    await db.sequelize.sync({ alter: true });
    console.log('Models synced');

    // Schema fixes
    const safeAlter = async (sql) => { try { await db.sequelize.query(sql); } catch (e) { /* already applied */ } };
    await safeAlter('ALTER TABLE imported_transactions ALTER COLUMN bank_connection_id DROP NOT NULL');
    await safeAlter('ALTER TABLE shipments ADD COLUMN start_date DATE');
    await safeAlter('ALTER TABLE shipments ADD COLUMN end_date DATE');
    await safeAlter('ALTER TABLE shipments ADD COLUMN active_days INTEGER DEFAULT 0');
    await safeAlter('ALTER TABLE shipments ADD COLUMN daily_fixed_rate DECIMAL(10,2) DEFAULT 0');
    await safeAlter('ALTER TABLE shipments ADD COLUMN accrued_fixed_costs DECIMAL(10,2) DEFAULT 0');
    await safeAlter('ALTER TABLE shipments ADD COLUMN admin_start_date_override DATE');
    await safeAlter('ALTER TABLE shipments ADD COLUMN admin_end_date_override DATE');
    await safeAlter('ALTER TABLE shipments ADD COLUMN manual_fixed_cost_override DECIMAL(10,2)');
    await safeAlter('ALTER TABLE shipments ADD COLUMN fixed_cost_notes TEXT');
    await safeAlter('ALTER TABLE expense_categories ADD COLUMN is_fixed_cost BOOLEAN DEFAULT false');
    await safeAlter('ALTER TABLE imported_transactions ADD COLUMN is_fixed_cost BOOLEAN DEFAULT false');

    await seedAdmin();
    await seedExpenseCategories();

    // Backfill expense numbers
    try {
      const unnumbered = await db.Expense.findAll({ where: { expense_number: null }, order: [['id', 'ASC']] });
      if (unnumbered.length > 0) {
        const lastNumbered = await db.Expense.findOne({ where: { expense_number: { [require('sequelize').Op.ne]: null } }, order: [['id', 'DESC']] });
        let counter = lastNumbered?.expense_number ? parseInt(lastNumbered.expense_number.replace('EXP-', '')) : 0;
        for (const exp of unnumbered) {
          counter++;
          await exp.update({ expense_number: `EXP-${String(counter).padStart(5, '0')}` });
        }
        console.log(`Backfilled ${unnumbered.length} expense numbers`);
      }
    } catch (e) { console.error('Expense number backfill:', e.message); }

    app.listen(PORT, () => {
      console.log(`GCGL Admin Portal API running on port ${PORT}`);

      // Daily fixed cost allocation at 1:00 AM CST
      cron.schedule('0 1 * * *', async () => {
        console.log('Running daily fixed cost allocation...');
        try {
          const result = await fixedCostService.allocateDaily();
          console.log('Fixed cost allocation complete:', result);
        } catch (err) {
          console.error('Fixed cost allocation failed:', err.message);
        }
      }, { timezone: 'America/Chicago' });
      console.log('Fixed cost allocation cron scheduled (daily 1:00 AM CST)');
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
