const express = require('express');
const router = express.Router();
const godownController = require('../controllers/godown.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

// Godown CRUD
router.get('/', authenticate, authorize('godowns.read'), godownController.getGodowns);
router.post('/', authenticate, authorize('godowns.create'), godownController.createGodown);
router.get('/:id', authenticate, authorize('godowns.read'), godownController.getGodownById);
router.put('/:id', authenticate, authorize('godowns.update'), godownController.updateGodown);
router.delete('/:id', authenticate, authorize('godowns.delete'), godownController.deleteGodown);

module.exports = router;


