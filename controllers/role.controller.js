const roleService = require('../services/role.service');

// Get all roles in simple format (for dropdowns)
const getAllRolesSimple = async (req, res) => {
  try {
    const result = await roleService.getAllRolesSimple();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get all roles controller
const getAllRoles = async (req, res) => {
  try {
    const result = await roleService.getAllRoles(req.query);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get role by ID controller
const getRoleById = async (req, res) => {
  try {
    const result = await roleService.getRoleById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Role not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Create role controller
const createRole = async (req, res) => {
  try {
    const { name, description, permissions = [] } = req.body;

    // Validation
    if (!name || !description) {
      return res.status(400).json({
        success: false,
        message: 'Name and description are required'
      });
    }

    const roleData = { name, description, permissions };
    const result = await roleService.createRole(roleData, req.user._id);
    res.status(201).json(result);

  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Role name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update role controller
const updateRole = async (req, res) => {
  try {
    const roleId = req.params.id;
    const { name, description, permissions } = req.body;

    const updateData = { name, description, permissions };
    const result = await roleService.updateRole(roleId, updateData, req.user._id);
    res.status(200).json(result);

  } catch (error) {
    if (error.message === 'Role not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    if (error.message === 'Cannot modify default system roles') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: 'Role name already exists'
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete role controller
const deleteRole = async (req, res) => {
  try {
    const roleId = req.params.id;
    const result = await roleService.deleteRole(roleId, req.user._id);
    res.status(200).json(result);

  } catch (error) {
    if (error.message === 'Role not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    if (error.message.includes('Cannot delete')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Reactivate role controller
const reactivateRole = async (req, res) => {
  try {
    const roleId = req.params.id;
    const result = await roleService.reactivateRole(roleId, req.user._id);
    res.status(200).json(result);

  } catch (error) {
    if (error.message === 'Role not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get role permissions controller
const getRolePermissions = async (req, res) => {
  try {
    const result = await roleService.getRolePermissions(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Role not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update role permissions controller
const updateRolePermissions = async (req, res) => {
  try {
    const roleId = req.params.id;
    const { permissions } = req.body;

    const result = await roleService.updateRolePermissions(roleId, permissions, req.user._id);
    res.status(200).json(result);

  } catch (error) {
    if (error.message === 'Role not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    if (error.message.includes('Cannot modify') || error.message.includes('must be an array') || error.message.includes('invalid')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get available permissions controller
const getAvailablePermissions = async (req, res) => {
  try {
    const result = await roleService.getAvailablePermissions();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getAllRoles,
  getAllRolesSimple,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  reactivateRole,
  getRolePermissions,
  updateRolePermissions,
  getAvailablePermissions
};
