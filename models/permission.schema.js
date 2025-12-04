const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  module: {
    type: String,
    required: true,
    enum: [
      'users',
      'roles',
      'orders',
      'billing',
      'stock',
      'production',
      'godowns',
      'customers',
      'employees',
      'reports',
      'settings',
      'attendance',
      'audit',
      'transits',
    ]
  },
  action: {
    type: String,
    required: true,
    enum: ['create', 'read', 'update', 'delete', 'approve', 'manage']
  },
  description: {
    type: String,
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Compound index for module + action combination
permissionSchema.index({ module: 1, action: 1 }, { unique: true });

// Static method to seed default permissions
permissionSchema.statics.seedDefaultPermissions = async function() {
  const defaultPermissions = [
    // User Management
    { name: 'users.create', module: 'users', action: 'create', description: 'Create new users' },
    { name: 'users.read', module: 'users', action: 'read', description: 'View users' },
    { name: 'users.update', module: 'users', action: 'update', description: 'Update user details' },
    { name: 'users.delete', module: 'users', action: 'delete', description: 'Delete users' },
    { name: 'users.manage', module: 'users', action: 'manage', description: 'Full user management access' },
    
    // Role Management
    { name: 'roles.create', module: 'roles', action: 'create', description: 'Create new roles' },
    { name: 'roles.read', module: 'roles', action: 'read', description: 'View roles' },
    { name: 'roles.update', module: 'roles', action: 'update', description: 'Update roles' },
    { name: 'roles.delete', module: 'roles', action: 'delete', description: 'Delete roles' },
    
    // Customer Management
    { name: 'customers.create', module: 'customers', action: 'create', description: 'Create new customers' },
    { name: 'customers.read', module: 'customers', action: 'read', description: 'View customers' },
    { name: 'customers.update', module: 'customers', action: 'update', description: 'Update customers' },
    { name: 'customers.delete', module: 'customers', action: 'delete', description: 'Delete customers' },
    
    // Order Management
    { name: 'orders.create', module: 'orders', action: 'create', description: 'Create new orders' },
    { name: 'orders.read', module: 'orders', action: 'read', description: 'View orders' },
    { name: 'orders.update', module: 'orders', action: 'update', description: 'Update orders' },
    { name: 'orders.delete', module: 'orders', action: 'delete', description: 'Delete orders' },
    { name: 'orders.approve', module: 'orders', action: 'approve', description: 'Approve orders' },
    { name: 'orders.manage', module: 'orders', action: 'manage', description: 'Manage order assignments and delivery workflow' },
    { name: 'orders.editPrice', module: 'orders', action: 'editPrice', description: 'Edit order price' },
    { name: 'orders.manageStatus', module: 'orders', action: 'manageStatus', description: 'Edit order status' },
    { name: 'orders.manageDeliveryStatus', module: 'orders', action: 'manageDeliveryStatus', description: 'Edit order deliveryStatus' },
    
    // Stock Management
    { name: 'stock.create', module: 'stock', action: 'create', description: 'Add stock entries' },
    { name: 'stock.read', module: 'stock', action: 'read', description: 'View stock' },
    { name: 'stock.update', module: 'stock', action: 'update', description: 'Update stock' },
    { name: 'stock.delete', module: 'stock', action: 'delete', description: 'Delete stock entries' },
    
    // Production Management
    { name: 'production.create', module: 'production', action: 'create', description: 'Create production batches' },
    { name: 'production.read', module: 'production', action: 'read', description: 'View production data' },
    { name: 'production.update', module: 'production', action: 'update', description: 'Update production status' },
    { name: 'production.delete', module: 'production', action: 'delete', description: 'Delete production batches' },
    { name: 'production.manage', module: 'production', action: 'manage', description: 'Manage production batches' },
    
    // Godown Management
    { name: 'godowns.create', module: 'godowns', action: 'create', description: 'Create new godowns' },
    { name: 'godowns.read', module: 'godowns', action: 'read', description: 'View godowns' },
    { name: 'godowns.update', module: 'godowns', action: 'update', description: 'Update godown details' },
    { name: 'godowns.delete', module: 'godowns', action: 'delete', description: 'Delete godowns' },
    
    // Billing
    { name: 'billing.create', module: 'billing', action: 'create', description: 'Create invoices' },
    { name: 'billing.read', module: 'billing', action: 'read', description: 'View billing information' },
    { name: 'billing.update', module: 'billing', action: 'update', description: 'Update billing details' },
    
    // Reports
    { name: 'reports.read', module: 'reports', action: 'read', description: 'View reports' },
    
    // Settings
    { name: 'settings.manage', module: 'settings', action: 'manage', description: 'Manage system settings' },
    
    // Attendance Management
    { name: 'attendance.create', module: 'attendance', action: 'create', description: 'Mark attendance' },
    { name: 'attendance.read', module: 'attendance', action: 'read', description: 'View attendance records' },
    { name: 'attendance.update', module: 'attendance', action: 'update', description: 'Update attendance records' },
    { name: 'attendance.delete', module: 'attendance', action: 'delete', description: 'Delete attendance records' },
    { name: 'attendance.manage', module: 'attendance', action: 'manage', description: 'Full attendance management access' },
    
    // Audit & Activity Management
    { name: 'audit.read', module: 'audit', action: 'read', description: 'View system activity and audit logs' },
    { name: 'audit.manage', module: 'audit', action: 'manage', description: 'Full audit and activity management access' },
    
    // Transit Management
    { name: 'transits.create', module: 'transits', action: 'create', description: 'Create new transits' },
    { name: 'transits.read', module: 'transits', action: 'read', description: 'View transits' },
    { name: 'transits.update', module: 'transits', action: 'update', description: 'Update transits' },
    { name: 'transits.delete', module: 'transits', action: 'delete', description: 'Delete transits' },
    { name: 'transits.manage', module: 'transits', action: 'manage', description: 'Manage transit assignments and status' },
  ];

  for (const permission of defaultPermissions) {
    await this.findOneAndUpdate(
      { name: permission.name },
      permission,
      { upsert: true, new: true }
    );
  }
};

module.exports = mongoose.model('Permission', permissionSchema);
