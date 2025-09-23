const jwt = require('jsonwebtoken');
const { User, UserSession, AuditLog } = require('../models');

const JWT_SECRET = process.env.JWT_SECRET || 'dullet_pos_secret_key_2024';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '24h';

// Generate JWT token
const generateToken = (payload) => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

// Verify JWT token
const verifyToken = (token) => {
  return jwt.verify(token, JWT_SECRET);
};

// Authentication middleware
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Access token is required'
      });
    }

    const token = authHeader.substring(7); // Remove 'Bearer ' prefix
    
    try {
      const decoded = verifyToken(token);
      
      // Find user and populate role with permissions
      const user = await User.findById(decoded.userId)
        .populate({
          path: 'role',
          populate: {
            path: 'permissions'
          }
        })
        .select('-password');

      if (!user) {
        return res.status(401).json({
          success: false,
          message: 'User not found'
        });
      }

      if (!user.isActive) {
        return res.status(401).json({
          success: false,
          message: 'Account is deactivated'
        });
      }

      if (user.isLocked) {
        return res.status(401).json({
          success: false,
          message: 'Account is locked due to multiple failed login attempts'
        });
      }

      // Check if session is still active
      const activeSession = await UserSession.findOne({
        user: user._id,
        sessionToken: token,
        isActive: true
      });

      if (!activeSession) {
        return res.status(401).json({
          success: false,
          message: 'Session expired or invalid'
        });
      }

      // Update last activity
      activeSession.lastActivity = new Date();
      await activeSession.save();

      req.user = user;
      req.session = activeSession;
      next();

    } catch (tokenError) {
      if (tokenError.name === 'TokenExpiredError') {
        return res.status(401).json({
          success: false,
          message: 'Token has expired'
        });
      }
      
      return res.status(401).json({
        success: false,
        message: 'Invalid token'
      });
    }

  } catch (error) {
    console.error('Authentication error:', error);
    return res.status(500).json({
      success: false,
      message: 'Authentication failed'
    });
  }
};

// Authorization middleware - check if user has specific permission
const authorize = (permissionName) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      const hasPermission = await req.user.hasPermission(permissionName);
      
      if (!hasPermission) {
        // Log unauthorized access attempt
        await AuditLog.logAction({
          user: req.user._id,
          action: 'READ',
          module: 'auth',
          resourceType: 'Permission',
          resourceId: permissionName,
          description: `Unauthorized access attempt to ${permissionName}`,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent') || 'Unknown',
          sessionId: req.session._id
        });

        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization failed'
      });
    }
  };
};

// Check multiple permissions (OR logic - user needs at least one)
const authorizeAny = (permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      let hasAnyPermission = false;
      
      for (const permission of permissions) {
        if (await req.user.hasPermission(permission)) {
          hasAnyPermission = true;
          break;
        }
      }
      
      if (!hasAnyPermission) {
        await AuditLog.logAction({
          user: req.user._id,
          action: 'READ',
          module: 'auth',
          resourceType: 'Permission',
          resourceId: permissions.join(','),
          description: `Unauthorized access attempt to any of: ${permissions.join(', ')}`,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent') || 'Unknown',
          sessionId: req.session._id
        });

        return res.status(403).json({
          success: false,
          message: 'Insufficient permissions'
        });
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization failed'
      });
    }
  };
};

// Check multiple permissions (AND logic - user needs all)
const authorizeAll = (permissions) => {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      for (const permission of permissions) {
        if (!(await req.user.hasPermission(permission))) {
          await AuditLog.logAction({
            user: req.user._id,
            action: 'READ',
            module: 'auth',
            resourceType: 'Permission',
            resourceId: permissions.join(','),
            description: `Unauthorized access attempt - missing: ${permission}`,
            ipAddress: req.ip || req.connection.remoteAddress,
            userAgent: req.get('User-Agent') || 'Unknown',
            sessionId: req.session._id
          });

          return res.status(403).json({
            success: false,
            message: 'Insufficient permissions'
          });
        }
      }

      next();
    } catch (error) {
      console.error('Authorization error:', error);
      return res.status(500).json({
        success: false,
        message: 'Authorization failed'
      });
    }
  };
};

// Role-based authorization
const authorizeRole = (roles) => {
  const roleArray = Array.isArray(roles) ? roles : [roles];
  
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'Authentication required'
        });
      }

      await req.user.populate('role');
      
      if (!roleArray.includes(req.user.role.name)) {
        await AuditLog.logAction({
          user: req.user._id,
          action: 'READ',
          module: 'auth',
          resourceType: 'Role',
          resourceId: req.user.role._id.toString(),
          description: `Unauthorized role access attempt. Required: ${roleArray.join(', ')}, Has: ${req.user.role.name}`,
          ipAddress: req.ip || req.connection.remoteAddress,
          userAgent: req.get('User-Agent') || 'Unknown',
          sessionId: req.session._id
        });

        return res.status(403).json({
          success: false,
          message: 'Insufficient role permissions'
        });
      }

      next();
    } catch (error) {
      console.error('Role authorization error:', error);
      return res.status(500).json({
        success: false,
        message: 'Role authorization failed'
      });
    }
  };
};

module.exports = {
  generateToken,
  verifyToken,
  authenticate,
  authorize,
  authorizeAny,
  authorizeAll,
  authorizeRole
};
