const express = require('express');
const router = express.Router();
const paymentController = require('../controllers/paymentController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', paymentController.list);
router.get('/summary', paymentController.getSummary);
router.put('/:id', paymentController.updatePayment);

module.exports = router;
