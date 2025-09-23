const mongoose = require('mongoose');

const userSessionSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  sessionToken: {
    type: String,
    required: true,
    unique: true
  },
  loginTime: {
    type: Date,
    default: Date.now
  },
  logoutTime: {
    type: Date,
    default: null
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  deviceInfo: {
    type: String,
    default: null
  },
  faceImage: {
    type: String, // URL to captured face image during login
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Auto-logout tracking
  lastActivity: {
    type: Date,
    default: Date.now
  },
  autoLogoutReason: {
    type: String,
    enum: ['inactivity', 'admin_force', 'session_expired', 'manual'],
    default: null
  }
}, {
  timestamps: true
});

// Indexes (sessionToken already has unique constraint)
userSessionSchema.index({ user: 1 });
userSessionSchema.index({ isActive: 1 });
userSessionSchema.index({ loginTime: -1 });
userSessionSchema.index({ lastActivity: 1 });

// Virtual for session duration
userSessionSchema.virtual('sessionDuration').get(function() {
  const endTime = this.logoutTime || new Date();
  return endTime - this.loginTime;
});

// Instance method to end session
userSessionSchema.methods.endSession = function(reason = 'manual') {
  this.logoutTime = new Date();
  this.isActive = false;
  this.autoLogoutReason = reason;
  return this.save();
};

// Static method to cleanup expired sessions
userSessionSchema.statics.cleanupExpiredSessions = async function() {
  const inactivityTimeout = 30 * 60 * 1000; // 30 minutes
  const expiredTime = new Date(Date.now() - inactivityTimeout);
  
  const expiredSessions = await this.find({
    isActive: true,
    lastActivity: { $lt: expiredTime }
  });
  
  for (const session of expiredSessions) {
    await session.endSession('inactivity');
  }
  
  return expiredSessions.length;
};

module.exports = mongoose.model('UserSession', userSessionSchema);
