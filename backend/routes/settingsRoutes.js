const express = require('express');
const router = express.Router();
const settingsController = require('../controllers/settingsController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', settingsController.get);
router.put('/', requireRole(['Admin']), settingsController.update);
router.put('/:section', requireRole(['Admin']), settingsController.updateSection);

module.exports = router;
