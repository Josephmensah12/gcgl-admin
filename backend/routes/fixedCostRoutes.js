const express = require('express');
const router = express.Router();
const fc = require('../controllers/fixedCostController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/dashboard', fc.getDashboard);
router.post('/trigger-allocation', requireRole(['Admin']), fc.triggerAllocation);
router.post('/recalculate-month', requireRole(['Admin']), fc.recalculateMonth);

// Shipment fixed costs
router.get('/shipments/:id', fc.getShipmentFixedCosts);
router.post('/shipments/:id/override-dates', requireRole(['Admin']), fc.overrideDates);
router.post('/shipments/:id/manual-allocation', requireRole(['Admin', 'Manager']), fc.manualAllocation);

// Toggle flags
router.post('/categories/:id/toggle-fixed', requireRole(['Admin']), fc.toggleCategoryFixed);
router.post('/transactions/:id/toggle-fixed', requireRole(['Admin']), fc.toggleTransactionFixed);

module.exports = router;
