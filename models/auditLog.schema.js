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
      "inventory",
      'godowns',
      'customers',
      'employees',
      'reports',
      'settings',
      'auth',
      'transits',
      "transactions"
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
    default: 'unknown'
  },
  userAgent: {
    type: String,
    default: 'system'
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
auditLogSchema.statics.getResourceAuditTrail = async function(resourceType, resourceId, options = {}) {
  const { limit = 50, skip = 0 } = options;
  
  const query = this.find({
    resourceType,
    resourceId
  })
  .populate('user', 'firstName lastName email employeeId')
  .sort({ createdAt: -1 });

  if (limit > 0) {
    query.limit(limit);
  }
  
  if (skip > 0) {
    query.skip(skip);
  }

  const logs = await query;
  const total = await this.countDocuments({ resourceType, resourceId });
  
  return {
    logs,
    total,
    hasMore: skip + logs.length < total
  };
};

// Static method to get user activity log
auditLogSchema.statics.getUserActivityLog = async function(userId, options = {}) {
  const { limit = 100, skip = 0 } = options;
  
  const query = this.find({ user: userId })
    .sort({ createdAt: -1 });

  if (limit > 0) {
    query.limit(limit);
  }
  
  if (skip > 0) {
    query.skip(skip);
  }

  const logs = await query;
  const total = await this.countDocuments({ user: userId });
  
  return {
    logs,
    total,
    hasMore: skip + logs.length < total
  };
};

// Static method to get activity log for a specific user
auditLogSchema.statics.getAllSystemActivity = async function(options = {}) {
  const { limit = 100, skip = 0, module, action, resourceType, userId } = options;
  
  // Build filter query
  const filter = {};
  if (module) filter.module = module;
  if (action) filter.action = action;
  if (resourceType) filter.resourceType = resourceType;
  
  // Filter by user ID if provided
  if (userId) {
    filter.user = userId;
  }
  
  const query = this.find(filter)
    .populate('user', 'firstName lastName email employeeId')
    .sort({ createdAt: -1 });

  if (limit > 0) {
    query.limit(limit);
  }
  
  if (skip > 0) {
    query.skip(skip);
  }

  const logs = await query;
  const total = await this.countDocuments(filter);
  
  return {
    logs,
    total,
    hasMore: skip + logs.length < total
  };
};

module.exports = mongoose.model('AuditLog', auditLogSchema);
