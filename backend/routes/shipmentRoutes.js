const express = require('express');
const router = express.Router();
const shipmentController = require('../controllers/shipmentController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/active', shipmentController.getActiveShipments);
router.get('/', shipmentController.list);
router.post('/', shipmentController.create);
router.get('/:id', shipmentController.getById);
router.put('/:id', shipmentController.update);
router.get('/:id/volume', shipmentController.volumeAnalysis);
router.get('/:id/notify/preview', shipmentController.notifyPreview);
router.post('/:id/notify', shipmentController.notifyCustomers);
router.delete('/:id', requireRole(['Admin', 'Manager']), shipmentController.delete);

module.exports = router;
