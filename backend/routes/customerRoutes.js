const express = require('express');
const router = express.Router();
const customerController = require('../controllers/customerController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/', customerController.list);
router.get('/:id', customerController.getById);
router.put('/:id', customerController.update);

module.exports = router;
