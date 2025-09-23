const authService = require('../services/auth.service');

// Login controller
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required'
      });
    }

    const loginData = {
      email,
      password,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      faceImage: req.file ? req.file.buffer.toString('base64') : null
    };

    const result = await authService.login(loginData);
    
    res.status(200).json(result);

  } catch (error) {
    res.status(401).json({
      success: false,
      message: error.message
    });
  }
};

// Logout controller
const logout = async (req, res) => {
  try {
    const sessionToken = req.headers.authorization.substring(7);
    
    const result = await authService.logout(
      req.user._id,
      sessionToken,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    );

    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Refresh token controller
const refreshToken = async (req, res) => {
  try {
    const oldSessionToken = req.headers.authorization.substring(7);
    
    const result = await authService.refreshToken(
      req.user._id,
      oldSessionToken,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    );

    res.status(200).json(result);

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Get profile controller
const getProfile = async (req, res) => {
  try {
    const result = await authService.getProfile(req.user._id);
    
    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Change password controller
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required'
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 6 characters long'
      });
    }

    const result = await authService.changePassword(
      req.user._id,
      currentPassword,
      newPassword,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    );

    res.status(200).json(result);

  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message
    });
  }
};

// Force logout controller
const forceLogout = async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    const result = await authService.forceLogout(
      req.params.userId,
      req.user._id,
      sessionId,
      req.ip || req.connection.remoteAddress,
      req.get('User-Agent')
    );

    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Cleanup sessions controller
const cleanupSessions = async (req, res) => {
  try {
    const result = await authService.cleanupExpiredSessions();
    
    res.status(200).json(result);

  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  login,
  logout,
  refreshToken,
  getProfile,
  changePassword,
  forceLogout,
  cleanupSessions
};
