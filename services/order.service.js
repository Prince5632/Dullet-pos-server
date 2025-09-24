const { Order, Customer } = require('../models');
const { AuditLog } = require('../models');

class OrderService {
  // Get all orders with pagination and filtering
  async getAllOrders(query = {}) {
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

    // Create order
    const order = new Order({
      ...orderData,
      createdBy
    });

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

    // Update order
    Object.assign(order, updateData, { updatedBy });
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
      description: `Updated order: ${order.orderNumber}`,
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

  // Get order statistics
  async getOrderStats() {
    const [
      totalOrders,
      pendingOrders,
      approvedOrders,
      completedOrders,
      todayOrders,
      monthlyRevenue
    ] = await Promise.all([
      Order.countDocuments(),
      Order.countDocuments({ status: 'pending' }),
      Order.countDocuments({ status: 'approved' }),
      Order.countDocuments({ status: 'completed' }),
      Order.countDocuments({
        orderDate: { 
          $gte: new Date(new Date().setHours(0, 0, 0, 0)) 
        }
      }),
      Order.aggregate([
        {
          $match: {
            orderDate: {
              $gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1)
            }
          }
        },
        {
          $group: {
            _id: null,
            total: { $sum: '$totalAmount' }
          }
        }
      ]).then(result => result[0]?.total || 0)
    ]);

    return {
      success: true,
      data: {
        totalOrders,
        pendingOrders,
        approvedOrders,
        completedOrders,
        todayOrders,
        monthlyRevenue
      }
    };
  }
}

module.exports = new OrderService();

