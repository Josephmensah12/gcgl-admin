const express = require('express');
const router = express.Router({ mergeParams: true });
const txController = require('../controllers/transactionController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', txController.getTransactions);
router.post('/', txController.createTransaction);
router.post('/:txId/void', txController.voidTransaction);

module.exports = router;
