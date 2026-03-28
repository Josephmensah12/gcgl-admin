const db = require('../models');

async function seedAdmin() {
  try {
    const existing = await db.User.findOne({ where: { username: 'admin' } });
    if (!existing) {
      await db.User.create({
        username: 'admin',
        email: 'admin@gcgl.com',
        password_hash: 'admin123',  // Will be hashed by beforeCreate hook
        full_name: 'System Admin',
        role: 'Admin',
      });
      console.log('Default admin user created (admin / admin123)');
    }
  } catch (err) {
    console.error('Seed admin error:', err.message);
  }
}

module.exports = seedAdmin;
