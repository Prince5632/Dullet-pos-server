const { User, Role, AuditLog, UserSession } = require('../models');

// Get all users with pagination and filtering
const getAllUsers = async (queryParams, requestingUserId = null) => {
  const {
    page = 1,
    limit = 10,
    search = '',
    department = '',
    role = '',
    isActive = ''
  } = queryParams;

  const query = {};

  // Search functionality
  if (search) {
    query.$or = [
      { firstName: { $regex: search, $options: 'i' } },
      { lastName: { $regex: search, $options: 'i' } },
      { email: { $regex: search, $options: 'i' } },
      { employeeId: { $regex: search, $options: 'i' } }
    ];
  }

  // Filter by department
  if (department) {
    query.department = department;
  }

  // Filter by role
  if (role) {
    const roleObj = await Role.findOne({ name: role });
    if (roleObj) {
      query.role = roleObj._id;
    }
  }

  // Filter by active status
  if (isActive !== '') {
    query.isActive = isActive === 'true';
  }

  // Special filtering for drivers based on requesting user's godown access
  if (role === 'Driver' && requestingUserId) {
    // Get the requesting user's godown information
    const requestingUser = await User.findById(requestingUserId)
      .select('primaryGodown accessibleGodowns')
      .lean();

    if (requestingUser && (requestingUser.primaryGodown || (requestingUser.accessibleGodowns && requestingUser.accessibleGodowns.length > 0))) {
      // Collect all godowns the requesting user has access to
      const allowedGodowns = [];
      
      if (requestingUser.primaryGodown) {
        allowedGodowns.push(requestingUser.primaryGodown);
      }
      
      if (requestingUser.accessibleGodowns && requestingUser.accessibleGodowns.length > 0) {
        allowedGodowns.push(...requestingUser.accessibleGodowns);
      }

      // Remove duplicates
      const uniqueGodowns = [...new Set(allowedGodowns.map(id => id.toString()))];

      // Filter drivers to only those with common godowns
      query.$or = [
        // Drivers whose primaryGodown matches any of the requesting user's godowns
        { primaryGodown: { $in: uniqueGodowns } },
        // Drivers whose accessibleGodowns have at least one common godown
        { accessibleGodowns: { $in: uniqueGodowns } }
      ];

      // If there was already a search query, combine it with the godown filter
      if (search) {
        query.$and = [
          {
            $or: [
              { firstName: { $regex: search, $options: 'i' } },
              { lastName: { $regex: search, $options: 'i' } },
              { email: { $regex: search, $options: 'i' } },
              { employeeId: { $regex: search, $options: 'i' } }
            ]
          },
          {
            $or: [
              { primaryGodown: { $in: uniqueGodowns } },
              { accessibleGodowns: { $in: uniqueGodowns } }
            ]
          }
        ];
        // Remove the original $or since we're using $and now
        delete query.$or;
      }
    }
  }

  const skip = (parseInt(page) - 1) * parseInt(limit);

  const users = await User.find(query)
    .populate('role', 'name description')
    .populate('primaryGodown', 'name location')
    .populate('accessibleGodowns', 'name location')
    .select('-password -passwordResetToken -passwordResetExpires -loginAttempts -lockUntil')
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const totalUsers = await User.countDocuments(query);
  const totalPages = Math.ceil(totalUsers / parseInt(limit));

  return {
    success: true,
    data: {
      users,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalUsers,
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1
      }
    }
  };
};

// Get user by ID
const getUserById = async (userId) => {
  const user = await User.findById(userId)
    .populate('role')
    .populate('role.permissions')
    .populate('primaryGodown', 'name location')
    .populate('accessibleGodowns', 'name location')
    .populate('createdBy', 'firstName lastName email')
    .populate('updatedBy', 'firstName lastName email')
    .select('-password -passwordResetToken -passwordResetExpires -loginAttempts -lockUntil');

  if (!user) {
    throw new Error('User not found');
  }

  return {
    success: true,
    data: { user }
  };
};

// Create new user
const createUser = async (userData, createdBy) => {
  const {
    firstName,
    lastName,
    email,
    phone,
    password,
    roleId,
    department,
    position,
    profilePhoto,
    primaryGodown,
    accessibleGodowns
  } = userData;

  // Check if role exists
  const role = await Role.findById(roleId);
  if (!role || !role.isActive) {
    throw new Error('Invalid or inactive role');
  }

  // Create user object
  const newUserData = {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.toLowerCase().trim(),
    phone: phone.trim(),
    password,
    role: roleId,
    department,
    position: position.trim(),
    profilePhoto: profilePhoto || null,
    primaryGodown: primaryGodown || null,
    accessibleGodowns: Array.isArray(accessibleGodowns) ? accessibleGodowns : (primaryGodown ? [primaryGodown] : []),
    createdBy: createdBy,
    isActive: true
  };

  const user = new User(newUserData);
  await user.save();

  // Log user creation
  await AuditLog.logAction({
    user: createdBy,
    action: 'CREATE',
    module: 'users',
    resourceType: 'User',
    resourceId: user._id.toString(),
    description: `Created new user: ${user.fullName} (${user.email})`,
    newValues: {
      firstName: user.firstName,
      lastName: user.lastName,
      email: user.email,
      phone: user.phone,
      department: user.department,
      position: user.position,
      role: role.name
    }
  });

  // Return user without sensitive data
  const userResponse = await User.findById(user._id)
    .populate('role', 'name description')
    .select('-password -passwordResetToken -passwordResetExpires -loginAttempts -lockUntil');

  return {
    success: true,
    message: 'User created successfully',
    data: { user: userResponse }
  };
};

// Update user
const updateUser = async (userId, updateData, updatedBy) => {
  // Find existing user
  const existingUser = await User.findById(userId);
  if (!existingUser) {
    throw new Error('User not found');
  }

  // Store old values for audit log
  const oldValues = {
    firstName: existingUser.firstName,
    lastName: existingUser.lastName,
    email: existingUser.email,
    phone: existingUser.phone,
    department: existingUser.department,
    position: existingUser.position,
    isActive: existingUser.isActive,
    primaryGodown: existingUser.primaryGodown,
    accessibleGodowns: existingUser.accessibleGodowns
  };

  // Remove sensitive fields that shouldn't be updated via this route
  delete updateData.password;
  delete updateData.loginAttempts;
  delete updateData.lockUntil;
  delete updateData.passwordResetToken;
  delete updateData.passwordResetExpires;

  // Validate role if provided
  if (updateData.roleId) {
    const role = await Role.findById(updateData.roleId);
    if (!role || !role.isActive) {
      throw new Error('Invalid or inactive role');
    }
    updateData.role = updateData.roleId;
    delete updateData.roleId;
  }

  // Normalize godown fields if provided
  if (updateData.primaryGodown === '') delete updateData.primaryGodown;
  if (updateData.accessibleGodowns && !Array.isArray(updateData.accessibleGodowns)) {
    updateData.accessibleGodowns = [updateData.accessibleGodowns].filter(Boolean);
  }

  // Add updatedBy field
  updateData.updatedBy = updatedBy;

  // Update user
  const updatedUser = await User.findByIdAndUpdate(
    userId,
    updateData,
    { new: true, runValidators: true }
  )
    .populate('role', 'name description')
    .select('-password -passwordResetToken -passwordResetExpires -loginAttempts -lockUntil');

  // Log user update
  await AuditLog.logAction({
    user: updatedBy,
    action: 'UPDATE',
    module: 'users',
    resourceType: 'User',
    resourceId: userId,
    description: `Updated user: ${updatedUser.fullName} (${updatedUser.email})`,
    oldValues,
    newValues: {
      firstName: updatedUser.firstName,
      lastName: updatedUser.lastName,
      email: updatedUser.email,
      phone: updatedUser.phone,
      department: updatedUser.department,
      position: updatedUser.position,
      isActive: updatedUser.isActive
    }
  });

  return {
    success: true,
    message: 'User updated successfully',
    data: { user: updatedUser }
  };
};

// Delete user (soft delete)
const deleteUser = async (userId, deletedBy) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Soft delete by setting isActive to false
  user.isActive = false;
  user.updatedBy = deletedBy;
  await user.save();

  // Log user deletion
  await AuditLog.logAction({
    user: deletedBy,
    action: 'DELETE',
    module: 'users',
    resourceType: 'User',
    resourceId: userId,
    description: `Deactivated user: ${user.fullName} (${user.email})`,
    oldValues: { isActive: true },
    newValues: { isActive: false }
  });

  return {
    success: true,
    message: 'User deactivated successfully'
  };
};

// Reactivate user
const reactivateUser = async (userId, reactivatedBy) => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  user.isActive = true;
  user.updatedBy = reactivatedBy;
  await user.save();

  // Log user reactivation
  await AuditLog.logAction({
    user: reactivatedBy,
    action: 'UPDATE',
    module: 'users',
    resourceType: 'User',
    resourceId: userId,
    description: `Reactivated user: ${user.fullName} (${user.email})`,
    oldValues: { isActive: false },
    newValues: { isActive: true }
  });

  return {
    success: true,
    message: 'User reactivated successfully'
  };
};

// Reset user password (admin function)
const resetUserPassword = async (userId, newPassword, adminUserId) => {
  // Find the user to update
  const user = await User.findById(userId);
  if (!user) {
    throw new Error('User not found');
  }

  // Store old values for audit log
  const oldValues = {
    passwordLastChanged: user.passwordLastChanged
  };

  // Update password
  user.password = newPassword;
  user.passwordLastChanged = new Date();
  user.updatedBy = adminUserId;
  await user.save();

  // End all active sessions for the user (force re-login)
  await UserSession.updateMany(
    { 
      user: userId, 
      isActive: true 
    },
    { 
      isActive: false, 
      logoutTime: new Date(),
      autoLogoutReason: 'password_reset_by_admin'
    }
  );

  // Log password reset action
  await AuditLog.logAction({
    user: adminUserId,
    action: 'UPDATE',
    module: 'users',
    resourceType: 'User',
    resourceId: userId,
    description: `Password reset for user: ${user.fullName} (${user.email})`,
    oldValues,
    newValues: {
      passwordLastChanged: user.passwordLastChanged
    }
  });

  return {
    success: true,
    message: 'Password reset successfully. User will need to login again.'
  };
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  reactivateUser,
  resetUserPassword
};
