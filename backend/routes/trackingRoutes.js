const express = require('express');
const router = express.Router();
const trackingController = require('../controllers/trackingController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.post('/shipments/:id/track', trackingController.setTrackingNumber);
router.get('/shipments/:id/events', trackingController.getEvents);
router.get('/tracking/status', trackingController.trackingStatus);

module.exports = router;
