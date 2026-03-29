const db = require('../models');

const DEFAULT_CATEGORIES = [
  { name: 'Ghana Customs - IDF', sort_order: 1 },
  { name: 'Ghana Customs - CCVR', sort_order: 2 },
  { name: 'Ghana Customs - GPHA', sort_order: 3 },
  { name: 'Ghana Customs - Other', sort_order: 4 },
  { name: 'Port Fees - Terminal', sort_order: 5 },
  { name: 'Port Fees - Container', sort_order: 6 },
  { name: 'Port Fees - Documentation', sort_order: 7 },
  { name: 'Shipping - Freight', sort_order: 8 },
  { name: 'Shipping - Insurance', sort_order: 9 },
  { name: 'Operations - Fuel', sort_order: 10 },
  { name: 'Operations - Driver Pay', sort_order: 11 },
  { name: 'Operations - Supplies', sort_order: 12 },
  { name: 'Operations - Warehouse', sort_order: 13 },
  { name: 'Equipment', sort_order: 14 },
  { name: 'Ghana Delivery', sort_order: 15 },
  { name: 'Office & Admin', sort_order: 16 },
  { name: 'Other', sort_order: 99 },
];

async function seedExpenseCategories() {
  try {
    const count = await db.ExpenseCategory.count();
    if (count === 0) {
      await db.ExpenseCategory.bulkCreate(DEFAULT_CATEGORIES);
      console.log('Seeded default expense categories');
    }
  } catch (err) {
    console.error('Seed expense categories error:', err.message);
  }
}

module.exports = seedExpenseCategories;
