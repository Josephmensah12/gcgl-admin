const express = require('express');
const router = express.Router();
const txController = require('../controllers/transactionController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

// Global transaction list & methods
router.get('/', txController.listAll);
router.get('/methods', txController.getMethods);

module.exports = router;
