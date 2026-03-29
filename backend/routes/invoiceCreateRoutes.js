const express = require('express');
const router = express.Router();
const ic = require('../controllers/invoiceCreateController');
const { authenticate } = require('../middleware/auth');

router.use(authenticate);

router.get('/search-customers', ic.searchCustomers);
router.post('/customers', ic.createCustomer);
router.get('/customers/:customerId/recipients', ic.getRecipients);
router.post('/customers/:customerId/recipients', ic.createRecipient);
router.get('/catalog', ic.getCatalog);
router.get('/next-number', ic.getNextNumber);
router.post('/', ic.createInvoice);

module.exports = router;
