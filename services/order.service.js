const { Order, Customer, Godown } = require('../models');
const { AuditLog } = require('../models');
const { QUICK_PRODUCTS, getQuickProductsMap } = require('../config/pricing.config');

class OrderService {
  // Get all orders with pagination and filtering
  async getAllOrders(query = {}, currentUser) {
    const {
      page = 1,
      limit = 10,
      search = '',
      status = '',
      paymentStatus = '',
      customerId = '',
      dateFrom = '',
      dateTo = '',
      sortBy = 'orderDate',
      sortOrder = 'desc'
    } = query;

    // Build filter object
    const filter = {};
    
    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } }
      ];
    }
    
    if (status) {
      filter.status = status;
    }
    
    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }
    
    if (customerId) {
      filter.customer = customerId;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.orderDate = {};
      if (dateFrom) {
        filter.orderDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.orderDate.$lte = new Date(dateTo);
      }
    }

    // Scope by godown if provided in query or by user's accessible godowns
    if (query.godownId) {
      filter.godown = query.godownId;
    } else if (currentUser && currentUser.role && currentUser.role.name !== 'Super Admin') {
      // Only restrict if not super admin; ensure IDs not populated docs
      const toIds = (arr) => (arr || []).map(v => (typeof v === 'object' && v?._id ? v._id : v));
      const accessibleList = currentUser.accessibleGodowns?.length ? toIds(currentUser.accessibleGodowns) : (currentUser.primaryGodown ? [ (typeof currentUser.primaryGodown === 'object' ? currentUser.primaryGodown._id : currentUser.primaryGodown) ] : []);
      if (accessibleList && accessibleList.length > 0) {
        filter.godown = { $in: accessibleList };
      } else {
        // If user has no assigned godowns, show only their own orders as a fallback
        filter.createdBy = currentUser._id;
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Execute queries
    const [orders, totalOrders] = await Promise.all([
      Order.find(filter)
        .populate('customer', 'customerId businessName contactPersonName phone')
        .populate('godown', 'name location')
        .populate('createdBy', 'firstName lastName')
        .populate('approvedBy', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    return {
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          limit: parseInt(limit),
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    };
  }

  // Get order by ID
  async getOrderById(orderId) {
    const order = await Order.findById(orderId)
      .populate('customer')
      .populate('godown', 'name location')
      .populate('createdBy', 'firstName lastName')
      .populate('approvedBy', 'firstName lastName')
      .lean();

    if (!order) {
      throw new Error('Order not found');
    }

    return {
      success: true,
      data: { order }
    };
  }

  // Create new order
  async createOrder(orderData, createdBy) {
    // Validate customer exists
    const customer = await Customer.findById(orderData.customer);
    if (!customer) {
      throw new Error('Customer not found');
    }

    if (!customer.isActive) {
      throw new Error('Customer is inactive');
    }

    // If godown provided, validate it and product availability
    if (orderData.godown) {
      const godown = await Godown.findById(orderData.godown);
      if (!godown || !godown.isActive) {
        throw new Error('Invalid or inactive godown');
      }
      // Optional: validate allowedProducts
      if (Array.isArray(godown.allowedProducts) && godown.allowedProducts.length > 0) {
        const invalidItem = (orderData.items || []).find(it => it.productName && !godown.allowedProducts.includes(it.productName));
        if (invalidItem) {
          throw new Error(`Product ${invalidItem.productName} not available in selected godown`);
        }
      }
    }

    // Determine creator role name for audit fields
    const { User } = require('../models');
    let creatorRoleName = '';
    try {
      const creator = await User.findById(createdBy).populate('role');
      creatorRoleName = creator?.role?.name || '';
    } catch {}

    // Create order
    const order = new Order({
      ...orderData,
      createdBy,
      createdByRole: creatorRoleName
    });

    // If no godown explicitly provided, infer from user's primary
    if (!order.godown) {
      try {
        const creator = await require('../models').User.findById(createdBy);
        if (creator?.primaryGodown) {
          order.godown = creator.primaryGodown;
        }
      } catch {}
    }

    await order.save();

    // Update customer statistics
    await Customer.findByIdAndUpdate(orderData.customer, {
      $inc: { totalOrders: 1, totalOrderValue: order.totalAmount },
      lastOrderDate: new Date()
    });

    // Log the action
    await AuditLog.create({
      user: createdBy,
      action: 'CREATE',
      module: 'orders',
      resourceType: 'Order',
      resourceId: order._id.toString(),
      newValues: order.toObject(),
      description: `Created order: ${order.orderNumber}`,
      ipAddress: '0.0.0.0',
      userAgent: 'System'
    });

    return {
      success: true,
      data: { order },
      message: 'Order created successfully'
    };
  }

  // Update order
  async updateOrder(orderId, updateData, updatedBy) {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    // Store old values for audit
    const oldValues = order.toObject();
    const oldPaidAmount = order.paidAmount;
    const oldPaymentStatus = order.paymentStatus;

    // Update order
    Object.assign(order, updateData, { updatedBy });
    await order.save();

    // Log the action
    // Build a richer description when payment fields changed
    let description = `Updated order: ${order.orderNumber}`;
    const changes = [];
    if (typeof updateData.paidAmount === 'number' && updateData.paidAmount !== oldPaidAmount) {
      changes.push(`paidAmount ${oldPaidAmount ?? 0} -> ${updateData.paidAmount}`);
    }
    if (typeof updateData.paymentStatus === 'string' && updateData.paymentStatus !== oldPaymentStatus) {
      changes.push(`paymentStatus ${oldPaymentStatus} -> ${updateData.paymentStatus}`);
    }
    if (changes.length > 0) {
      description += ` (${changes.join(', ')})`;
    }

    await AuditLog.create({
      user: updatedBy,
      action: 'UPDATE',
      module: 'orders',
      resourceType: 'Order',
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description,
      ipAddress: '0.0.0.0',
      userAgent: 'System'
    });

    return {
      success: true,
      data: { order },
      message: 'Order updated successfully'
    };
  }

  // Update order status
  async updateOrderStatus(orderId, status, updatedBy, notes = '') {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    const oldStatus = order.status;
    const oldValues = order.toObject();

    // Update status and related fields
    order.status = status;
    order.updatedBy = updatedBy;

    // Set appropriate dates based on status
    const now = new Date();
    switch (status) {
      case 'approved':
        order.approvedBy = updatedBy;
        order.approvedDate = now;
        break;
      case 'dispatched':
        order.dispatchDate = now;
        break;
      case 'delivered':
        order.deliveryDate = now;
        break;
    }

    if (notes) {
      order.internalNotes = order.internalNotes ? `${order.internalNotes}\n${notes}` : notes;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: updatedBy,
      action: 'UPDATE',
      module: 'orders',
      resourceType: 'Order',
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Updated order status from ${oldStatus} to ${status}: ${order.orderNumber}`,
      ipAddress: '0.0.0.0',
      userAgent: 'System'
    });

    return {
      success: true,
      data: { order },
      message: `Order status updated to ${status}`
    };
  }

  // Get customer order history
  async getCustomerOrderHistory(customerId, query = {}) {
    const {
      page = 1,
      limit = 10,
      status = '',
      dateFrom = '',
      dateTo = ''
    } = query;

    // Validate customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error('Customer not found');
    }

    // Build filter
    const filter = { customer: customerId };
    
    if (status) {
      filter.status = status;
    }

    if (dateFrom || dateTo) {
      filter.orderDate = {};
      if (dateFrom) {
        filter.orderDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.orderDate.$lte = new Date(dateTo);
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute queries
    const [orders, totalOrders] = await Promise.all([
      Order.find(filter)
        .populate('createdBy', 'firstName lastName')
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    // Calculate summary statistics
    const [totalValue, avgOrderValue] = await Promise.all([
      Order.aggregate([
        { $match: { customer: customer._id } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]).then(result => result[0]?.total || 0),
      Order.aggregate([
        { $match: { customer: customer._id } },
        { $group: { _id: null, avg: { $avg: '$totalAmount' } } }
      ]).then(result => result[0]?.avg || 0)
    ]);

    return {
      success: true,
      data: {
        customer: {
          _id: customer._id,
          customerId: customer.customerId,
          businessName: customer.businessName,
          contactPersonName: customer.contactPersonName
        },
        orders,
        statistics: {
          totalOrders: customer.totalOrders,
          totalValue,
          avgOrderValue: Math.round(avgOrderValue)
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          limit: parseInt(limit),
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    };
  }

  // Approve order
  async approveOrder(orderId, approvedBy, notes = '') {
    const { User } = require('../models');
    
    // Check if user has approval permission
    const user = await User.findById(approvedBy).populate('role');
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user has permission to approve orders
    const hasApprovalPermission = await user.hasPermission('orders.approve');
    if (!hasApprovalPermission) {
      throw new Error('Only Manager or Admin can approve orders');
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'pending') {
      throw new Error('Order is not in pending status');
    }

    const oldValues = order.toObject();

    // Update order status to approved
    order.status = 'approved';
    order.approvedBy = approvedBy;
    order.approvedDate = new Date();
    order.updatedBy = approvedBy;

    if (notes) {
      order.internalNotes = order.internalNotes ? `${order.internalNotes}\n[APPROVED] ${notes}` : `[APPROVED] ${notes}`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: approvedBy,
      action: 'UPDATE',
      module: 'orders',
      resourceType: 'Order',
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Approved order: ${order.orderNumber}`,
      ipAddress: '0.0.0.0',
      userAgent: 'System'
    });

    // Populate order data
    await order.populate('customer', 'customerId businessName contactPersonName phone');
    await order.populate('createdBy', 'firstName lastName');
    await order.populate('approvedBy', 'firstName lastName');

    return {
      success: true,
      data: { order },
      message: 'Order approved successfully'
    };
  }

  // Reject order
  async rejectOrder(orderId, rejectedBy, notes = '') {
    const { User } = require('../models');
    
    // Check if user has approval permission
    const user = await User.findById(rejectedBy).populate('role');
    if (!user) {
      throw new Error('User not found');
    }

    // Check if user has permission to approve/reject orders
    const hasApprovalPermission = await user.hasPermission('orders.approve');
    if (!hasApprovalPermission) {
      throw new Error('Only Manager or Admin can reject orders');
    }

    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'pending') {
      throw new Error('Order is not in pending status');
    }

    const oldValues = order.toObject();

    // Update order status to rejected
    order.status = 'rejected';
    order.updatedBy = rejectedBy;

    if (notes) {
      order.internalNotes = order.internalNotes ? `${order.internalNotes}\n[REJECTED] ${notes}` : `[REJECTED] ${notes}`;
    } else {
      order.internalNotes = order.internalNotes ? `${order.internalNotes}\n[REJECTED] Order rejected by ${user.fullName}` : `[REJECTED] Order rejected by ${user.fullName}`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: rejectedBy,
      action: 'UPDATE',
      module: 'orders',
      resourceType: 'Order',
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Rejected order: ${order.orderNumber}`,
      ipAddress: '0.0.0.0',
      userAgent: 'System'
    });

    // Populate order data
    await order.populate('customer', 'customerId businessName contactPersonName phone');
    await order.populate('createdBy', 'firstName lastName');

    return {
      success: true,
      data: { order },
      message: 'Order rejected successfully'
    };
  }

  // Get pending orders for approval
  async getPendingOrdersForApproval(query = {}) {
    const {
      page = 1,
      limit = 10,
      search = '',
      dateFrom = '',
      dateTo = '',
      sortBy = 'orderDate',
      sortOrder = 'desc'
    } = query;

    // Build filter object for pending orders only
    const filter = { status: 'pending' };
    
    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.orderDate = {};
      if (dateFrom) {
        filter.orderDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.orderDate.$lte = new Date(dateTo);
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Execute queries
    const [orders, totalOrders] = await Promise.all([
      Order.find(filter)
        .populate('customer', 'customerId businessName contactPersonName phone')
        .populate('createdBy', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    return {
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          limit: parseInt(limit),
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    };
  }

  // Move order to production
  async moveToProduction(orderId, userId, notes = '') {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'approved') {
      throw new Error('Order must be approved before moving to production');
    }

    const oldValues = order.toObject();

    order.status = 'processing';
    order.updatedBy = userId;

    if (notes) {
      order.internalNotes = order.internalNotes ? `${order.internalNotes}\n[PRODUCTION] ${notes}` : `[PRODUCTION] ${notes}`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: userId,
      action: 'UPDATE',
      module: 'orders',
      resourceType: 'Order',
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Moved order to production: ${order.orderNumber}`,
      ipAddress: '0.0.0.0',
      userAgent: 'System'
    });

    await order.populate('customer', 'customerId businessName contactPersonName phone');
    await order.populate('createdBy', 'firstName lastName');
    await order.populate('approvedBy', 'firstName lastName');

    return {
      success: true,
      data: { order },
      message: 'Order moved to production successfully'
    };
  }

  // Mark order as ready for dispatch
  async markAsReady(orderId, userId, notes = '') {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'processing') {
      throw new Error('Order must be in processing status');
    }

    const oldValues = order.toObject();

    order.status = 'ready';
    order.updatedBy = userId;

    if (notes) {
      order.internalNotes = order.internalNotes ? `${order.internalNotes}\n[READY] ${notes}` : `[READY] ${notes}`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: userId,
      action: 'UPDATE',
      module: 'orders',
      resourceType: 'Order',
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Marked order as ready: ${order.orderNumber}`,
      ipAddress: '0.0.0.0',
      userAgent: 'System'
    });

    await order.populate('customer', 'customerId businessName contactPersonName phone');
    await order.populate('createdBy', 'firstName lastName');
    await order.populate('approvedBy', 'firstName lastName');

    return {
      success: true,
      data: { order },
      message: 'Order marked as ready for dispatch'
    };
  }

  // Dispatch order
  async dispatchOrder(orderId, userId, notes = '') {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'ready') {
      throw new Error('Order must be ready for dispatch');
    }

    const oldValues = order.toObject();

    order.status = 'dispatched';
    order.dispatchDate = new Date();
    order.updatedBy = userId;

    if (notes) {
      order.internalNotes = order.internalNotes ? `${order.internalNotes}\n[DISPATCHED] ${notes}` : `[DISPATCHED] ${notes}`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: userId,
      action: 'UPDATE',
      module: 'orders',
      resourceType: 'Order',
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Dispatched order: ${order.orderNumber}`,
      ipAddress: '0.0.0.0',
      userAgent: 'System'
    });

    await order.populate('customer', 'customerId businessName contactPersonName phone');
    await order.populate('createdBy', 'firstName lastName');
    await order.populate('approvedBy', 'firstName lastName');

    return {
      success: true,
      data: { order },
      message: 'Order dispatched successfully'
    };
  }

  // Mark order as delivered
  async markAsDelivered(orderId, userId, notes = '') {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'dispatched') {
      throw new Error('Order must be dispatched before marking as delivered');
    }

    const oldValues = order.toObject();

    order.status = 'delivered';
    order.deliveryDate = new Date();
    order.updatedBy = userId;

    if (notes) {
      order.internalNotes = order.internalNotes ? `${order.internalNotes}\n[DELIVERED] ${notes}` : `[DELIVERED] ${notes}`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: userId,
      action: 'UPDATE',
      module: 'orders',
      resourceType: 'Order',
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Marked order as delivered: ${order.orderNumber}`,
      ipAddress: '0.0.0.0',
      userAgent: 'System'
    });

    await order.populate('customer', 'customerId businessName contactPersonName phone');
    await order.populate('createdBy', 'firstName lastName');
    await order.populate('approvedBy', 'firstName lastName');

    return {
      success: true,
      data: { order },
      message: 'Order marked as delivered'
    };
  }

  // Complete order
  async completeOrder(orderId, userId, notes = '') {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'delivered') {
      throw new Error('Order must be delivered before completing');
    }

    const oldValues = order.toObject();

    order.status = 'completed';
    order.updatedBy = userId;

    if (notes) {
      order.internalNotes = order.internalNotes ? `${order.internalNotes}\n[COMPLETED] ${notes}` : `[COMPLETED] ${notes}`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: userId,
      action: 'UPDATE',
      module: 'orders',
      resourceType: 'Order',
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Completed order: ${order.orderNumber}`,
      ipAddress: '0.0.0.0',
      userAgent: 'System'
    });

    await order.populate('customer', 'customerId businessName contactPersonName phone');
    await order.populate('createdBy', 'firstName lastName');
    await order.populate('approvedBy', 'firstName lastName');

    return {
      success: true,
      data: { order },
      message: 'Order completed successfully'
    };
  }

  // Cancel order
  async cancelOrder(orderId, userId, notes = '') {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error('Order not found');
    }

    if (!['pending', 'approved', 'processing'].includes(order.status)) {
      throw new Error('Cannot cancel order in current status');
    }

    const oldValues = order.toObject();

    order.status = 'cancelled';
    order.updatedBy = userId;

    if (notes) {
      order.internalNotes = order.internalNotes ? `${order.internalNotes}\n[CANCELLED] ${notes}` : `[CANCELLED] ${notes}`;
    } else {
      order.internalNotes = order.internalNotes ? `${order.internalNotes}\n[CANCELLED] Order cancelled` : `[CANCELLED] Order cancelled`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: userId,
      action: 'UPDATE',
      module: 'orders',
      resourceType: 'Order',
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Cancelled order: ${order.orderNumber}`,
      ipAddress: '0.0.0.0',
      userAgent: 'System'
    });

    await order.populate('customer', 'customerId businessName contactPersonName phone');
    await order.populate('createdBy', 'firstName lastName');
    await order.populate('approvedBy', 'firstName lastName');

    return {
      success: true,
      data: { order },
      message: 'Order cancelled successfully'
    };
  }

  // Get orders by status
  async getOrdersByStatus(status, query = {}) {
    const {
      page = 1,
      limit = 10,
      search = '',
      dateFrom = '',
      dateTo = '',
      sortBy = 'orderDate',
      sortOrder = 'desc'
    } = query;

    // Build filter object
    const filter = { status };
    
    if (search) {
      filter.$or = [
        { orderNumber: { $regex: search, $options: 'i' } }
      ];
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.orderDate = {};
      if (dateFrom) {
        filter.orderDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.orderDate.$lte = new Date(dateTo);
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === 'desc' ? -1 : 1 };

    // Execute queries
    const [orders, totalOrders] = await Promise.all([
      Order.find(filter)
        .populate('customer', 'customerId businessName contactPersonName phone')
        .populate('createdBy', 'firstName lastName')
        .populate('approvedBy', 'firstName lastName')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(filter)
    ]);

    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    return {
      success: true,
      data: {
        orders,
        status,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          limit: parseInt(limit),
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1
        }
      }
    };
  }

  // Get order statistics (supports optional godown scoping)
  async getOrderStats(query = {}, currentUser) {
    const filter = {};
    // Scope by explicit godownId
    if (query.godownId) {
      filter.godown = query.godownId;
    } else if (currentUser && currentUser.role && currentUser.role.name !== 'Super Admin') {
      // Non super-admins limited to their accessible/primary godowns
      const accessible = currentUser.accessibleGodowns?.length ? currentUser.accessibleGodowns : (currentUser.primaryGodown ? [currentUser.primaryGodown] : []);
      if (accessible && accessible.length > 0) {
        filter.godown = { $in: accessible };
      }
    }

    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
    const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

    const [
      totalOrders,
      pendingOrders,
      approvedOrders,
      completedOrders,
      rejectedOrders,
      todayOrders,
      monthlyRevenue
    ] = await Promise.all([
      Order.countDocuments(filter),
      Order.countDocuments({ ...filter, status: 'pending' }),
      Order.countDocuments({ ...filter, status: 'approved' }),
      Order.countDocuments({ ...filter, status: 'completed' }),
      Order.countDocuments({ ...filter, status: 'rejected' }),
      Order.countDocuments({ ...filter, orderDate: { $gte: startOfToday } }),
      Order.aggregate([
        { $match: { orderDate: { $gte: startOfMonth }, ...(filter.godown ? { godown: filter.godown } : {}) } },
        { $group: { _id: null, total: { $sum: '$totalAmount' } } }
      ]).then(result => (Array.isArray(result) && result[0]?.total) || 0)
    ]);

    return {
      success: true,
      data: {
        totalOrders,
        pendingOrders,
        approvedOrders,
        completedOrders,
        rejectedOrders,
        todayOrders,
        monthlyRevenue
      }
    };
  }

  // Quick-order: expose catalog
  getQuickProducts() {
    return {
      success: true,
      data: { products: QUICK_PRODUCTS }
    };
  }

  // Quick-order: create using product keys and simple qty inputs
  async createQuickOrder(quickData, createdBy) {
    const { customer, items = [], paymentTerms = 'Cash', priority = 'normal', notes = '', deliveryInstructions = '', paidAmount: inputPaidAmount, paymentStatus: inputPaymentStatus } = quickData || {};

    // Validate customer exists and active
    const customerDoc = await Customer.findById(customer);
    if (!customerDoc) throw new Error('Customer not found');
    if (!customerDoc.isActive) throw new Error('Customer is inactive');

    const productMap = getQuickProductsMap();
    if (!Array.isArray(items) || items.length === 0) {
      throw new Error('At least one item is required');
    }

    // Build standard order items
    const orderItems = items.map((it, idx) => {
      const p = productMap[it.productKey];
      if (!p) throw new Error(`Invalid product key at item ${idx + 1}`);

      // Determine quantity in KG
      let quantityKg = 0;
      if (typeof it.quantityKg === 'number' && it.quantityKg > 0) {
        quantityKg = it.quantityKg;
      } else if (typeof it.bags === 'number' && it.bags > 0 && p.bagSizeKg) {
        quantityKg = it.bags * p.bagSizeKg;
      } else {
        throw new Error(`Quantity missing or invalid for item ${idx + 1}`);
      }

      const ratePerUnit = Number(p.pricePerKg);
      const totalAmount = quantityKg * ratePerUnit;

      return {
        productName: p.name,
        grade: '',
        quantity: quantityKg,
        unit: 'KG',
        ratePerUnit,
        totalAmount,
        packaging: it.packaging || p.defaultPackaging || 'Standard'
      };
    });

    // Compute totals to derive payment status
    const computedTotal = orderItems.reduce((sum, it) => sum + (it.totalAmount || 0), 0);
    const paidAmount = Math.max(0, Number(inputPaidAmount ?? 0));
    let paymentStatus = inputPaymentStatus;
    if (!paymentStatus) {
      if (paidAmount >= computedTotal) paymentStatus = 'paid';
      else if (paidAmount > 0) paymentStatus = 'partial';
      else paymentStatus = 'pending';
    }

    const orderPayload = {
      customer,
      items: orderItems,
      discountPercentage: 0,
      discount: 0,
      taxAmount: 0,
      paymentTerms,
      priority,
      deliveryInstructions,
      notes,
      paidAmount,
      paymentStatus,
    };

    // Reuse standard creation flow for validations, numbering and auditing
    return await this.createOrder(orderPayload, createdBy);
  }
}

module.exports = new OrderService();

