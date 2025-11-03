const express = require('express');
const router = express.Router();
const godownController = require('../controllers/godown.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// Godown CRUD
router.get('/', authenticate, authorize('godowns.read'), godownController.getGodowns);
router.get('/simple', authenticate, authorize('godowns.read'), godownController.getGodownsSimple);
router.get('/with-order-counts', authenticate, authorize('godowns.read'), godownController.getGodownsWithOrderCounts);
router.get('/with-customer-counts', authenticate, authorize('godowns.read'), godownController.getGodownsWithCustomerCounts);
router.get('/with-inventory-counts', authenticate, authorize('godowns.read'), godownController.getGodownsWithInventoryCounts);
router.post('/', authenticate, authorize('godowns.create'), godownController.createGodown);
router.get('/:id', authenticate, authorize('godowns.read'), godownController.getGodownById);
router.put('/:id', authenticate, authorize('godowns.update'), godownController.updateGodown);
router.delete('/:id', authenticate, authorize('godowns.delete'), godownController.deleteGodown);

module.exports = router;


