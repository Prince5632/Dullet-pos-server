const userService = require('../services/user.service');

// Get all users controller
const getAllUsers = async (req, res) => {
  try {
    // Extract user information from token for driver filtering
    const requestingUserId = req.user._id;
    const result = await userService.getAllUsers(req.query, requestingUserId);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get user by ID controller
const getUserById = async (req, res) => {
  try {
    const result = await userService.getUserById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'User not found') {
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

// Create user controller
const createUser = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      email,
      phone,
      password,
      roleId,
      department,
      position,
      primaryGodown,
      accessibleGodowns,
      address,
      aadhaarNumber,
      panNumber,
      otherDocumentsMeta
    } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phone || !password || !roleId || !department || !position) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    let parsedAddress = null;
    if (address) {
      try {
        const parsed = typeof address === 'string' ? JSON.parse(address) : address;
        parsedAddress = parsed && typeof parsed === 'object' ? parsed : null;
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: 'Invalid address format'
        });
      }
    }

    let parsedOtherDocumentsMeta = [];
    if (otherDocumentsMeta) {
      try {
        parsedOtherDocumentsMeta = typeof otherDocumentsMeta === 'string'
          ? JSON.parse(otherDocumentsMeta)
          : otherDocumentsMeta;
      } catch (err) {
        return res.status(400).json({
          success: false,
          message: 'Invalid other documents metadata'
        });
      }
    }

    const buildDocumentPayload = (file, defaultType) => file ? {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      type: defaultType
    } : null;

    const files = req.files || {};
    const aadhaarDoc = buildDocumentPayload(files.aadhaarDocument?.[0], 'aadhaar');
    const panDoc = buildDocumentPayload(files.panDocument?.[0], 'pan');
    const otherDocs = (files.otherDocuments || []).map((file, index) => ({
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      type: parsedOtherDocumentsMeta[index]?.type || 'other',
      label: parsedOtherDocumentsMeta[index]?.label || file.originalname
    }));

    const userData = {
      firstName,
      lastName,
      email,
      phone,
      password,
      roleId,
      department,
      position,
      profilePhoto: files.profilePhoto?.[0]?.buffer || null,
      profilePhotoMimeType: files.profilePhoto?.[0]?.mimetype,
      primaryGodown,
      accessibleGodowns,
      address: parsedAddress,
      aadhaarNumber,
      panNumber,
      aadhaarDocument: aadhaarDoc,
      panDocument: panDoc,
      otherDocuments: otherDocs
    };

    const result = await userService.createUser(userData, req.user._id);
    res.status(201).json(result);

  } catch (error) {
    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `${field === 'email' ? 'Email' : 'Phone'} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Update user controller
const updateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const updateData = { ...req.body };

    // Handle profile photo upload
    if (req.files?.profilePhoto?.[0]) {
      updateData.profilePhoto = req.files.profilePhoto[0].buffer;
      updateData.profilePhotoMimeType = req.files.profilePhoto[0].mimetype;
    }

    const parseJsonField = (field, errorMessage) => {
      if (!updateData[field]) return undefined;
      try {
        return typeof updateData[field] === 'string'
          ? JSON.parse(updateData[field])
          : updateData[field];
      } catch (err) {
        throw new Error(errorMessage);
      }
    };

    const parsedAddress = parseJsonField('address', 'Invalid address format');
    if (parsedAddress !== undefined) {
      updateData.address = parsedAddress;
    }

    const parsedDocumentRemovals = parseJsonField('removeDocumentIds', 'Invalid document removal payload');
    if (parsedDocumentRemovals !== undefined) {
      updateData.removeDocumentIds = parsedDocumentRemovals;
    }

    const parsedOtherDocumentsMeta = parseJsonField('otherDocumentsMeta', 'Invalid other documents metadata');

    const buildDocumentPayload = (file, defaultType, index = 0) => file ? {
      buffer: file.buffer,
      mimetype: file.mimetype,
      originalname: file.originalname,
      type: parsedOtherDocumentsMeta?.[index]?.type || defaultType,
      label: parsedOtherDocumentsMeta?.[index]?.label || file.originalname
    } : null;

    if (req.files?.aadhaarDocument?.[0]) {
      updateData.aadhaarDocument = buildDocumentPayload(req.files.aadhaarDocument[0], 'aadhaar');
    }

    if (req.files?.panDocument?.[0]) {
      updateData.panDocument = buildDocumentPayload(req.files.panDocument[0], 'pan');
    }

    if (req.files?.otherDocuments?.length) {
      updateData.otherDocuments = req.files.otherDocuments.map((file, index) => buildDocumentPayload(file, 'other', index));
    }

    const result = await userService.updateUser(userId, updateData, req.user._id);
    res.status(200).json(result);

  } catch (error) {
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }

    if (error.message === 'Invalid address format' ||
        error.message === 'Invalid document removal payload' ||
        error.message === 'Invalid other documents metadata') {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }

    if (error.code === 11000) {
      const field = Object.keys(error.keyValue)[0];
      return res.status(400).json({
        success: false,
        message: `${field === 'email' ? 'Email' : 'Phone'} already exists`
      });
    }

    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Delete user controller
const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent self-deletion
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot delete your own account'
      });
    }

    const result = await userService.deleteUser(userId, req.user._id);
    res.status(200).json(result);

  } catch (error) {
    if (error.message === 'User not found') {
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

// Deactivate user controller
const deactivateUser = async (req, res) => {
  try {
    const userId = req.params.id;

    // Prevent self-deactivation
    if (userId === req.user._id.toString()) {
      return res.status(400).json({
        success: false,
        message: 'Cannot deactivate your own account'
      });
    }

    const result = await userService.deactivateUser(userId, req.user._id);
    res.status(200).json(result);

  } catch (error) {
    if (error.message === 'User not found') {
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

// Reactivate user controller
const reactivateUser = async (req, res) => {
  try {
    const userId = req.params.id;
    const result = await userService.reactivateUser(userId, req.user._id);
    res.status(200).json(result);

  } catch (error) {
    if (error.message === 'User not found') {
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

// Reset user password controller (admin function)
const resetUserPassword = async (req, res) => {
  try {
    const userId = req.params.id;
    const { password } = req.body;

    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'New password is required'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 6 characters long'
      });
    }

    const result = await userService.resetUserPassword(userId, password, req.user._id);
    res.status(200).json(result);

  } catch (error) {
    if (error.message === 'User not found') {
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

// Get user audit trail controller
const getUserAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    
    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit))); // Max 50 items per page
    
    const result = await userService.getUserAuditTrail(id, pageNum, limitNum);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error getting user audit trail:', error);
    if (error.message === 'User not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get user audit trail'
    });
  }
};

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  deactivateUser,
  reactivateUser,
  resetUserPassword,
  getUserAuditTrail
};
