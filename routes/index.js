const authRoutes = require('./auth.routes');
const userRoutes = require('./user.routes');
const roleRoutes = require('./role.routes');
const customerRoutes = require('./customer.routes');
const orderRoutes = require('./order.routes');
const reportRoutes = require('./report.routes');
const inventoryRoutes = require('./inventory.routes');
const auditRoutes = require('./audit.routes');
const godownRoutes = require('./godown.routes');
const transitRoutes = require('./transit.routes');
const transactionRoutes = require('./transaction.routes');
const productionRoutes = require('./production.routes');

module.exports = {
  authRoutes,
  userRoutes,
  roleRoutes,
  customerRoutes,
  orderRoutes,
  reportRoutes,
  inventoryRoutes,
  auditRoutes,
  godownRoutes,
  transitRoutes,
  transactionRoutes,
  productionRoutes
};
