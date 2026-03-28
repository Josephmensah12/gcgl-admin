const express = require('express');
const router = express.Router();
const catalogController = require('../controllers/catalogController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

router.get('/', catalogController.list);
router.post('/', requireRole(['Admin', 'Manager']), catalogController.create);
router.put('/:id', requireRole(['Admin', 'Manager']), catalogController.update);
router.delete('/:id', requireRole(['Admin']), catalogController.delete);

module.exports = router;
