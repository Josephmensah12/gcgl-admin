const express = require('express');
const router = express.Router();
const financialReportController = require('../controllers/financialReportController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/summary',   financialReportController.getSummary);
router.get('/pnl',       financialReportController.getProfitAndLoss);
router.get('/cash-flow', financialReportController.getCashFlow);

module.exports = router;
