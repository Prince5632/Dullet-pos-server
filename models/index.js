const User = require('./user.schema');
const Role = require('./role.schema');
const Permission = require('./permission.schema');
const UserSession = require('./userSession.schema');
const AuditLog = require('./auditLog.schema');
const Customer = require('./customer.schema');
const Order = require('./order.schema');
const Godown = require('./godown.schema');
const Attendance = require('./attendance.schema');
const Inventory = require('./inventory.schema');
const Transit = require('./transit.schema');

module.exports = {
  User,
  Role,
  Permission,
  UserSession,
  AuditLog,
  Customer,
  Order,
  Godown,
  Attendance,
  Inventory,
  Transit
};

// Helper to seed core defaults where available
module.exports.seedDefaults = async () => {
  try {
    if (typeof Permission.seedDefaultPermissions === 'function') {
      await Permission.seedDefaultPermissions();
    }
    if (typeof Role.seedDefaultRoles === 'function') {
      await Role.seedDefaultRoles();
    }
    if (typeof Godown.seedDefaultGodowns === 'function') {
      await Godown.seedDefaultGodowns();
    }
  } catch (e) {
    console.error('Default seeds failed:', e);
  }
};
