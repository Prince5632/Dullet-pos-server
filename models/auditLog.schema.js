const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'CREATE',
      'READ',
      'UPDATE', 
      'DELETE',
      'LOGIN',
      'LOGOUT',
      'APPROVE',
      'REJECT',
      'TRANSFER',
      'EXPORT'
    ]
  },
  module: {
    type: String,
    required: true,
    enum: [
      'users',
      'roles',
      'permissions',
      'orders',
      'billing',
      'stock',
      'production',
      'godowns',
      'customers',
      'employees',
      'reports',
      'settings',
      'auth'
    ]
  },
  resourceType: {
    type: String,
    required: true // e.g., 'User', 'Order', 'Role'
  },
  resourceId: {
    type: String,
    required: true // ID of the affected resource
  },
  oldValues: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  newValues: {
    type: mongoose.Schema.Types.Mixed,
    default: null
  },
  description: {
    type: String,
    required: true
  },
  ipAddress: {
    type: String,
    required: true
  },
  userAgent: {
    type: String,
    required: true
  },
  sessionId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'UserSession',
    default: null
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed,
    default: {}
  }
}, {
  timestamps: true
});

// Indexes
auditLogSchema.index({ user: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ module: 1 });
auditLogSchema.index({ resourceType: 1, resourceId: 1 });
auditLogSchema.index({ createdAt: -1 });

// Static method to log an action
auditLogSchema.statics.logAction = async function(logData) {
  try {
    const auditLog = new this(logData);
    await auditLog.save();
    return auditLog;
  } catch (error) {
    console.error('Failed to create audit log:', error);
    // Don't throw error to avoid breaking the main operation
    return null;
  }
};

// Static method to get audit trail for a resource
auditLogSchema.statics.getResourceAuditTrail = async function(resourceType, resourceId, limit = 50) {
  return await this.find({
    resourceType,
    resourceId
  })
  .populate('user', 'firstName lastName email employeeId')
  .sort({ createdAt: -1 })
  .limit(limit);
};

// Static method to get user activity log
auditLogSchema.statics.getUserActivityLog = async function(userId, limit = 100) {
  return await this.find({ user: userId })
    .sort({ createdAt: -1 })
    .limit(limit);
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
