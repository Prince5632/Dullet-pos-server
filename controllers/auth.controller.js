const authService = require('../services/auth.service');
const { uploadToS3 } = require('../utils/s3Upload');

// Login controller
const login = async (req, res) => {
  try {
    const { email, identifier, password } = req.body;

    if (!(email || identifier) || !password) {
      return res.status(400).json({
        success: false,
        message: 'Identifier and password are required'
      });
    }

    let faceImage = null;
    if (req.file) {
      const fileName = req.file.originalname || `login-${identifier || email || 'user'}-${Date.now()}`;
      const mimeType = req.file.mimetype || 'image/jpeg';
      const uploadResult = await uploadToS3(
        req.file.buffer,
        fileName,
        mimeType,
        'auth/face-images'
      );
      faceImage = uploadResult.fileUrl;
    } else if (req.body.faceImage) {
      faceImage = req.body.faceImage;
    }

    const loginData = {
      email,
      identifier,
      password,
      ipAddress: req.ip || req.connection.remoteAddress,
      userAgent: req.get('User-Agent'),
      faceImage
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
