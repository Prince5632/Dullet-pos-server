const express = require('express');
const router = express.Router();
const reportController = require('../controllers/report.controller');
const { authenticate } = require('../middlewares/auth.middleware');

// Apply authentication middleware to all routes
router.use(authenticate);

// Sales Executive Reports
router.get('/sales-executives/export/excel', reportController.exportSalesExecutiveReportsToExcel);
router.get('/sales-executives', reportController.getSalesExecutiveReports);
router.get('/sales-executives/:userId', reportController.getExecutivePerformanceDetail);

// Godown-wise Sales Reports
router.get('/godowns', reportController.getGodownSalesReports);

// Customer Reports
router.get('/customers', reportController.getCustomerReports);
router.get('/customers/inactive', reportController.getInactiveCustomers);
router.get('/customers/:customerId', reportController.getCustomerPurchaseDetail);

module.exports = router;

