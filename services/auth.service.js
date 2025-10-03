const { User, UserSession, AuditLog, Attendance } = require('../models');
const { generateToken } = require('../middlewares/auth.middleware');
const crypto = require('crypto');

// User login (supports identifier: email | username | phone)
const login = async (loginData) => {
  const { email, identifier, password, ipAddress, userAgent, faceImage } = loginData;

  try {
      // Determine identifier: email field kept for backward compatibility
      const queryIdentifier = (identifier || email || '').toString().trim().toLowerCase();
      // Find user by email, username or phone
      const user = await User.findOne({
        $or: [
          { email: queryIdentifier },
          { username: queryIdentifier },
          { phone: queryIdentifier }
        ]
      })
        .populate({
          path: 'role',
          populate: {
            path: 'permissions'
          }
        })
        .populate('primaryGodown', 'name location')
        .populate('accessibleGodowns', 'name location');

      if (!user) {
        throw new Error('Invalid credentials');
      }

      // Check if account is active
      if (!user.isActive) {
        throw new Error('Account is deactivated. Please contact administrator.');
      }

      // Check if account is locked
      if (user.isLocked) {
        throw new Error('Account is locked due to multiple failed login attempts. Please try again later or contact administrator.');
      }

      // Verify password
      const isPasswordValid = await user.comparePassword(password);
      
      if (!isPasswordValid) {
        // Increment login attempts
        await user.incLoginAttempts();
        
        // Log failed login attempt
        await AuditLog.logAction({
          user: user._id,
          action: 'LOGIN',
          module: 'auth',
          resourceType: 'User',
          resourceId: user._id.toString(),
          description: 'Failed login attempt - invalid password',
          ipAddress: ipAddress || 'Unknown',
          userAgent: userAgent || 'Unknown'
        });

        throw new Error('Invalid credentials');
      }

      // Reset login attempts on successful login
      if (user.loginAttempts > 0) {
        await user.resetLoginAttempts();
      }

      // Generate session token
      const sessionToken = generateToken({
        userId: user._id,
        email: user.email,
        role: user.role.name
      });

      // Create user session
      const userSession = new UserSession({
        user: user._id,
        sessionToken,
        ipAddress: ipAddress || 'Unknown',
        userAgent: userAgent || 'Unknown',
        faceImage: faceImage || null,
        loginTime: new Date(),
        lastActivity: new Date(),
        isActive: true
      });

      await userSession.save();

      // Update user last login info
      user.lastLogin = new Date();
      user.lastLoginIP = ipAddress;
      await user.save();

      // Log successful login
      await AuditLog.logAction({
        user: user._id,
        action: 'LOGIN',
        module: 'auth',
        resourceType: 'User',
        resourceId: user._id.toString(),
        description: 'Successful login',
        ipAddress: ipAddress || 'Unknown',
        userAgent: userAgent || 'Unknown',
        sessionId: userSession._id
      });

      // Auto-mark attendance on first login of the day if face image is provided
      let attendanceMarked = false;
      if (faceImage) {
        try {
          const hasAttendanceToday = await Attendance.hasAttendanceToday(user._id);
          
          if (!hasAttendanceToday) {
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            
            const newAttendance = new Attendance({
              user: user._id,
              date: today,
              checkInTime: new Date(),
              checkInImage: faceImage,
              godown: user.primaryGodown?._id || null,
              isAutoMarked: true,
              markedBy: user._id,
              createdBy: user._id,
              ipAddress: ipAddress || 'Unknown',
              userAgent: userAgent || 'Unknown'
            });
            
            await newAttendance.save();
            attendanceMarked = true;
            
            console.log(`Auto-marked attendance for user ${user.email} on login`);
          }
        } catch (attendanceError) {
          console.error('Failed to auto-mark attendance:', attendanceError.message);
          // Don't fail login if attendance marking fails
        }
      }

      // Remove sensitive data from response
      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.passwordResetToken;
      delete userResponse.passwordResetExpires;
      delete userResponse.loginAttempts;
      delete userResponse.lockUntil;

      return {
        success: true,
        message: 'Login successful',
        data: {
          user: userResponse,
          token: sessionToken,
          session: {
            id: userSession._id,
            loginTime: userSession.loginTime
          },
          attendanceMarked // Indicate if attendance was auto-marked
        }
      };

  } catch (error) {
    throw new Error(error.message || 'Login failed');
  }
};

// User logout
const logout = async (userId, sessionToken, ipAddress, userAgent) => {
  try {
    // Find and end the session
    const session = await UserSession.findOne({
      user: userId,
      sessionToken,
      isActive: true
    });

    if (session) {
      await session.endSession('manual');
      
      // Log logout
      await AuditLog.logAction({
        user: userId,
        action: 'LOGOUT',
        module: 'auth',
        resourceType: 'User',
        resourceId: userId.toString(),
        description: 'User logout',
        ipAddress: ipAddress || 'Unknown',
        userAgent: userAgent || 'Unknown',
        sessionId: session._id
      });
    }

    return {
      success: true,
      message: 'Logout successful'
    };

  } catch (error) {
    throw new Error(error.message || 'Logout failed');
  }
};

// Force logout (admin action)
const forceLogout = async (targetUserId, adminUserId, sessionId, ipAddress, userAgent) => {
    try {
      let sessionsEnded = 0;

      if (sessionId) {
        // End specific session
        const session = await UserSession.findOne({
          _id: sessionId,
          user: targetUserId,
          isActive: true
        });

        if (session) {
          await session.endSession('admin_force');
          sessionsEnded = 1;
        }
      } else {
        // End all active sessions for user
        const activeSessions = await UserSession.find({
          user: targetUserId,
          isActive: true
        });

        for (const session of activeSessions) {
          await session.endSession('admin_force');
          sessionsEnded++;
        }
      }

      // Log admin action
      await AuditLog.logAction({
        user: adminUserId,
        action: 'UPDATE',
        module: 'users',
        resourceType: 'UserSession',
        resourceId: targetUserId.toString(),
        description: `Admin forced logout - ${sessionsEnded} session(s) ended`,
        ipAddress: ipAddress || 'Unknown',
        userAgent: userAgent || 'Unknown',
        metadata: {
          targetUserId,
          sessionsEnded,
          sessionId: sessionId || null
        }
      });

      return {
        success: true,
        message: `Successfully ended ${sessionsEnded} session(s)`,
        data: { sessionsEnded }
      };

    } catch (error) {
      throw new Error(error.message || 'Force logout failed');
    }
  }

// Refresh token
const refreshToken = async (userId, oldSessionToken, ipAddress, userAgent) => {
    try {
      // Find current session
      const currentSession = await UserSession.findOne({
        user: userId,
        sessionToken: oldSessionToken,
        isActive: true
      });

      if (!currentSession) {
        throw new Error('Invalid session');
      }

      // Find user
      const user = await User.findById(userId)
        .populate({
          path: 'role',
          populate: {
            path: 'permissions'
          }
        });

      if (!user || !user.isActive) {
        throw new Error('User not found or inactive');
      }

      // Generate new token
      const newSessionToken = generateToken({
        userId: user._id,
        email: user.email,
        role: user.role.name
      });

      // Update session with new token
      currentSession.sessionToken = newSessionToken;
      currentSession.lastActivity = new Date();
      await currentSession.save();

      // Log token refresh
      await AuditLog.logAction({
        user: userId,
        action: 'UPDATE',
        module: 'auth',
        resourceType: 'UserSession',
        resourceId: currentSession._id.toString(),
        description: 'Token refreshed',
        ipAddress: ipAddress || 'Unknown',
        userAgent: userAgent || 'Unknown',
        sessionId: currentSession._id
      });

      return {
        success: true,
        message: 'Token refreshed successfully',
        data: {
          token: newSessionToken,
          session: {
            id: currentSession._id,
            lastActivity: currentSession.lastActivity
          }
        }
      };

    } catch (error) {
      throw new Error(error.message || 'Token refresh failed');
    }
  }

// Get user profile
const getProfile = async (userId) => {
    try {
      const user = await User.findById(userId)
        .populate({
          path: 'role',
          populate: {
            path: 'permissions'
          }
        })
        .populate('primaryGodown', 'name location')
        .populate('accessibleGodowns', 'name location')
        .select('-password -passwordResetToken -passwordResetExpires -loginAttempts -lockUntil');

      if (!user) {
        throw new Error('User not found');
      }

      // Get active sessions count
      const activeSessionsCount = await UserSession.countDocuments({
        user: userId,
        isActive: true
      });

      return {
        success: true,
        data: {
          user,
          activeSessionsCount,
          permissions: user.role.permissions.map(p => p.name)
        }
      };

    } catch (error) {
      throw new Error(error.message || 'Failed to get profile');
    }
  }

// Change password
const changePassword = async (userId, currentPassword, newPassword, ipAddress, userAgent) => {
    try {
      const user = await User.findById(userId);
      
      if (!user) {
        throw new Error('User not found');
      }

      // Verify current password
      const isCurrentPasswordValid = await user.comparePassword(currentPassword);
      if (!isCurrentPasswordValid) {
        throw new Error('Current password is incorrect');
      }

      // Update password
      user.password = newPassword;
      await user.save();

      // End all other sessions except current one
      await UserSession.updateMany(
        { 
          user: userId, 
          isActive: true 
        },
        { 
          isActive: false, 
          logoutTime: new Date(),
          autoLogoutReason: 'password_change'
        }
      );

      // Log password change
      await AuditLog.logAction({
        user: userId,
        action: 'UPDATE',
        module: 'auth',
        resourceType: 'User',
        resourceId: userId.toString(),
        description: 'Password changed',
        ipAddress: ipAddress || 'Unknown',
        userAgent: userAgent || 'Unknown'
      });

      return {
        success: true,
        message: 'Password changed successfully. Please login again.'
      };

    } catch (error) {
      throw new Error(error.message || 'Password change failed');
    }
  }

// Cleanup expired sessions (to be called by cron job)
const cleanupExpiredSessions = async () => {
    try {
      const cleanedCount = await UserSession.cleanupExpiredSessions();
      
      console.log(`Cleaned up ${cleanedCount} expired sessions`);
      
      return {
        success: true,
        message: `Cleaned up ${cleanedCount} expired sessions`
      };

    } catch (error) {
      console.error('Session cleanup failed:', error);
      throw new Error('Session cleanup failed');
    }
  }
module.exports = {
  login,
  logout,
  forceLogout,
  refreshToken,
  getProfile,
  changePassword,
  cleanupExpiredSessions
};
