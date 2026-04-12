const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/metrics', dashboardController.getMetrics);
router.get('/revenue-chart', dashboardController.getRevenueChart);
router.get('/recent-pickups', dashboardController.getRecentPickups);
router.get('/alerts', dashboardController.getAlerts);
router.get('/tracked-shipments', dashboardController.getTrackedShipments);

module.exports = router;
