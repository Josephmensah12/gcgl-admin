const express = require('express');
const router = express.Router();
const ec = require('../controllers/expenseController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// Categories
router.get('/categories', ec.listCategories);
router.post('/categories', requireRole(['Admin', 'Manager']), ec.createCategory);
router.put('/categories/:id', requireRole(['Admin', 'Manager']), ec.updateCategory);
router.delete('/categories/:id', requireRole(['Admin']), ec.deleteCategory);

// Bulk auto-assign to shipments by date
router.post('/bulk-auto-assign', requireRole(['Admin']), ec.bulkAutoAssign);
router.post('/reassign-all', requireRole(['Admin']), ec.reassignAll);

// Analytics
router.get('/analytics', ec.analytics);

// Expenses CRUD
router.get('/', ec.list);
router.get('/:id', ec.detail);
router.post('/', ec.create);
router.put('/:id', ec.update);
router.delete('/:id', requireRole(['Admin', 'Manager']), ec.remove);

module.exports = router;
