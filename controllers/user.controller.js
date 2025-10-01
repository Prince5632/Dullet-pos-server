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
      accessibleGodowns
    } = req.body;

    // Validation
    if (!firstName || !lastName || !email || !phone || !password || !roleId || !department || !position) {
      return res.status(400).json({
        success: false,
        message: 'All required fields must be provided'
      });
    }

    const userData = {
      firstName,
      lastName,
      email,
      phone,
      password,
      roleId,
      department,
      position,
      profilePhoto: req.file ? req.file.buffer.toString('base64') : null,
      primaryGodown,
      accessibleGodowns
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
    if (req.file) {
      updateData.profilePhoto = req.file.buffer.toString('base64');
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

module.exports = {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  reactivateUser
};
