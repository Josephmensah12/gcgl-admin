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
router.delete('/:id', requireRole(['Admin', 'Manager']), shipmentController.delete);

module.exports = router;
