const express = require('express');
const roleController = require('../controllers/role.controller');
const { authenticate, authorize, authorizeAny } = require('../middlewares/auth.middleware');

const router = express.Router();

// Get all roles
router.get('/', authenticate, authorizeAny(['roles.read', 'users.create']), roleController.getAllRoles);

// Get all roles in simple format (for dropdowns)
router.get('/simple', authenticate, authorizeAny(['roles.read', 'orders.read']), roleController.getAllRolesSimple);

// Get available permissions (must be before /:id routes)
router.get('/permissions/available', authenticate, authorize('roles.read'), roleController.getAvailablePermissions);

// Get role by ID
router.get('/:id', authenticate, authorize('roles.read'), roleController.getRoleById);

// Create new role
router.post('/', authenticate, authorize('roles.create'), roleController.createRole);

// Update role
router.put('/:id', authenticate, authorize('roles.update'), roleController.updateRole);

// Delete role (soft delete)
router.delete('/:id', authenticate, authorize('roles.delete'), roleController.deleteRole);

// Reactivate role
router.put('/:id/activate', authenticate, authorize('roles.update'), roleController.reactivateRole);

// Get role permissions
router.get('/:id/permissions', authenticate, authorize('roles.read'), roleController.getRolePermissions);

// Update role permissions
router.put('/:id/permissions', authenticate, authorize('roles.update'), roleController.updateRolePermissions);

module.exports = router;
