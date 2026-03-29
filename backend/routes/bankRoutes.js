const express = require('express');
const router = express.Router();
const bc = require('../controllers/bankController');
const { authenticate, requireRole } = require('../middleware/auth');

router.use(authenticate);

// Plaid connection
router.post('/link-token', bc.createLinkToken);
router.post('/exchange-token', bc.exchangeToken);
router.get('/connections', bc.listConnections);
router.delete('/connections/:id', requireRole(['Admin']), bc.removeConnection);

// Transaction sync
router.post('/sync', requireRole(['Admin', 'Manager']), bc.syncTransactions);
router.post('/import-csv', requireRole(['Admin', 'Manager']), bc.importCSV);

// Transaction review
router.get('/transactions', bc.listPending);
router.post('/transactions/:id/review', bc.reviewTransaction);
router.post('/transactions/bulk-review', bc.bulkReview);

// Stats
router.get('/stats', bc.getStats);

module.exports = router;
