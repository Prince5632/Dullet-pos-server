const { Role, Permission, User, AuditLog } = require('../models');

// Get all roles with pagination and filtering
const getAllRoles = async (queryParams) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    isActive = ''
  } = queryParams;

  const query = {};

  // Search functionality
  if (search) {
    query.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }

  // Filter by active status
  if (isActive !== '') {
    query.isActive = isActive === 'true';
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const roles = await Role.find(query)
    .populate('permissions', 'name description module action')
    .populate('createdBy', 'firstName lastName email')
    .populate('updatedBy', 'firstName lastName email')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const totalRoles = await Role.countDocuments(query);
  const totalPages = Math.ceil(totalRoles / parseInt(limit));

  return {
    success: true,
    data: {
      roles,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalRoles,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    }
  };
};

// Get role by ID
const getRoleById = async (roleId) => {
  const role = await Role.findById(roleId)
    .populate('permissions')
    .populate('createdBy', 'firstName lastName email')
    .populate('updatedBy', 'firstName lastName email');

  if (!role) {
    throw new Error('Role not found');
  }

  // Get count of users with this role
  const userCount = await User.countDocuments({ role: role._id, isActive: true });

  return {
    success: true,
    data: {
      role,
      userCount
    }
  };
};

// Create new role
const createRole = async (roleData, createdBy) => {
  const { name, description, permissions = [] } = roleData;

  // Validate permissions
  if (permissions.length > 0) {
    const validPermissions = await Permission.find({
      _id: { $in: permissions },
      isActive: true
    });

    if (validPermissions.length !== permissions.length) {
      throw new Error('One or more permissions are invalid');
    }
  }

  // Create role
  const newRoleData = {
    name: name.trim(),
    description: description.trim(),
    permissions,
    isDefault: false,
    isActive: true,
    createdBy
  };

  const role = new Role(newRoleData);
  await role.save();

  // Log role creation
  await AuditLog.logAction({
    user: createdBy,
    action: 'CREATE',
    module: 'roles',
    resourceType: 'Role',
    resourceId: role._id.toString(),
    description: `Created new role: ${role.name}`,
    newValues: {
      name: role.name,
      description: role.description,
      permissionCount: permissions.length
    }
  });

  // Return role with populated permissions
  const createdRole = await Role.findById(role._id)
    .populate('permissions', 'name description module action');

  return {
    success: true,
    message: 'Role created successfully',
    data: { role: createdRole }
  };
};

// Update role
const updateRole = async (roleId, updateData, updatedBy) => {
  const { name, description, permissions } = updateData;

  // Find existing role
  const existingRole = await Role.findById(roleId);
  if (!existingRole) {
    throw new Error('Role not found');
  }

  // Prevent updating default roles
  if (existingRole.isDefault) {
    throw new Error('Cannot modify default system roles');
  }

  // Store old values for audit log
  const oldValues = {
    name: existingRole.name,
    description: existingRole.description,
    permissionCount: existingRole.permissions.length
  };

  const updateFields = {
    updatedBy
  };

  // Update name if provided
  if (name && name.trim() !== existingRole.name) {
    updateFields.name = name.trim();
  }

  // Update description if provided
  if (description && description.trim() !== existingRole.description) {
    updateFields.description = description.trim();
  }

  // Update permissions if provided
  if (permissions && Array.isArray(permissions)) {
    // Validate permissions
    const validPermissions = await Permission.find({
      _id: { $in: permissions },
      isActive: true
    });

    if (validPermissions.length !== permissions.length) {
      throw new Error('One or more permissions are invalid');
    }

    updateFields.permissions = permissions;
  }

  // Update role
  const updatedRole = await Role.findByIdAndUpdate(
    roleId,
    updateFields,
    { new: true, runValidators: true }
  ).populate('permissions', 'name description module action');

  // Log role update
  await AuditLog.logAction({
    user: updatedBy,
    action: 'UPDATE',
    module: 'roles',
    resourceType: 'Role',
    resourceId: roleId,
    description: `Updated role: ${updatedRole.name}`,
    oldValues,
    newValues: {
      name: updatedRole.name,
      description: updatedRole.description,
      permissionCount: updatedRole.permissions.length
    }
  });

  return {
    success: true,
    message: 'Role updated successfully',
    data: { role: updatedRole }
  };
};

// Delete role (soft delete)
const deleteRole = async (roleId, deletedBy) => {
  const role = await Role.findById(roleId);
  if (!role) {
    throw new Error('Role not found');
  }

  // Prevent deleting default roles
  if (role.isDefault) {
    throw new Error('Cannot delete default system roles');
  }

  // Check if any users are assigned to this role
  const usersWithRole = await User.countDocuments({ role: roleId, isActive: true });
  if (usersWithRole > 0) {
    throw new Error(`Cannot delete role. ${usersWithRole} user(s) are currently assigned to this role.`);
  }

  // Soft delete by setting isActive to false
  role.isActive = false;
  role.updatedBy = deletedBy;
  await role.save();

  // Log role deletion
  await AuditLog.logAction({
    user: deletedBy,
    action: 'DELETE',
    module: 'roles',
    resourceType: 'Role',
    resourceId: roleId,
    description: `Deactivated role: ${role.name}`,
    oldValues: { isActive: true },
    newValues: { isActive: false }
  });

  return {
    success: true,
    message: 'Role deactivated successfully'
  };
};

// Reactivate role
const reactivateRole = async (roleId, reactivatedBy) => {
  const role = await Role.findById(roleId);
  if (!role) {
    throw new Error('Role not found');
  }

  role.isActive = true;
  role.updatedBy = reactivatedBy;
  await role.save();

  // Log role reactivation
  await AuditLog.logAction({
    user: reactivatedBy,
    action: 'UPDATE',
    module: 'roles',
    resourceType: 'Role',
    resourceId: roleId,
    description: `Reactivated role: ${role.name}`,
    oldValues: { isActive: false },
    newValues: { isActive: true }
  });

  return {
    success: true,
    message: 'Role reactivated successfully'
  };
};

// Get role permissions
const getRolePermissions = async (roleId) => {
  const role = await Role.findById(roleId)
    .populate('permissions');

  if (!role) {
    throw new Error('Role not found');
  }

  return {
    success: true,
    data: {
      roleId: role._id,
      roleName: role.name,
      permissions: role.permissions
    }
  };
};

// Update role permissions
const updateRolePermissions = async (roleId, permissions, updatedBy) => {
  if (!Array.isArray(permissions)) {
    throw new Error('Permissions must be an array');
  }

  const role = await Role.findById(roleId);
  if (!role) {
    throw new Error('Role not found');
  }

  // Prevent updating default roles
  if (role.isDefault) {
    throw new Error('Cannot modify permissions of default system roles');
  }

  // Validate permissions
  const validPermissions = await Permission.find({
    _id: { $in: permissions },
    isActive: true
  });

  if (validPermissions.length !== permissions.length) {
    throw new Error('One or more permissions are invalid');
  }

  // Store old permissions for audit log
  const oldPermissions = role.permissions;

  // Update permissions
  role.permissions = permissions;
  role.updatedBy = updatedBy;
  await role.save();

  // Log permission update
  await AuditLog.logAction({
    user: updatedBy,
    action: 'UPDATE',
    module: 'roles',
    resourceType: 'Role',
    resourceId: roleId,
    description: `Updated permissions for role: ${role.name}`,
    oldValues: { permissionCount: oldPermissions.length },
    newValues: { permissionCount: permissions.length }
  });

  // Return updated role with populated permissions
  const updatedRole = await Role.findById(roleId)
    .populate('permissions', 'name description module action');

  return {
    success: true,
    message: 'Role permissions updated successfully',
    data: { role: updatedRole }
  };
};

// Get all available permissions grouped by module
const getAvailablePermissions = async () => {
  const permissions = await Permission.find({ isActive: true })
    .sort({ module: 1, action: 1 });

  // Group permissions by module
  const groupedPermissions = permissions.reduce((acc, permission) => {
    if (!acc[permission.module]) {
      acc[permission.module] = [];
    }
    acc[permission.module].push(permission);
    return acc;
  }, {});

  return {
    success: true,
    data: {
      permissions: groupedPermissions,
      totalPermissions: permissions.length
    }
  };
};

module.exports = {
  getAllRoles,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  reactivateRole,
  getRolePermissions,
  updateRolePermissions,
  getAvailablePermissions
};
