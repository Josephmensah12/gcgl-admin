const express = require('express');
const router = express.Router();
const pickupController = require('../controllers/pickupController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', pickupController.list);
router.get('/warehouse-summary', pickupController.getWarehouseSummary);
router.get('/:id', pickupController.getById);
router.post('/assign', pickupController.assignToShipment);
router.post('/unassign', pickupController.unassignFromShipment);

module.exports = router;
