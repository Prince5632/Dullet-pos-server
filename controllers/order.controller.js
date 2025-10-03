const orderService = require('../services/order.service');

const buildErrorResponse = (res, error, defaultStatus = 500) => {
  const statusCode =
    error.message === 'Order not found' ? 404 :
    error.message.startsWith('Only ') ? 403 :
    error.message.startsWith('Access denied') ? 403 :
    error.message.startsWith('Order is not in') ? 400 :
    error.message.startsWith('Order must be') ? 400 :
    error.message.startsWith('Cannot assign driver') ? 400 :
    error.message.startsWith('Driver not found') ? 404 :
    defaultStatus;

  return res.status(statusCode).json({
    success: false,
    message: error.message
  });
};

// Get all orders controller
const getAllOrders = async (req, res) => {
  try {
    const result = await orderService.getAllOrders(req.query, req.user);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get order by ID controller
const getOrderById = async (req, res) => {
  try {
    const result = await orderService.getOrderById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Create order controller
const createOrder = async (req, res) => {
  try {
    const orderData = {
      ...req.body,
      type: 'order',
      capturedImage: req.file ? req.file.buffer.toString('base64') : req.body.capturedImage,
      captureLocation: req.body.captureLocation ? JSON.parse(req.body.captureLocation) : null
    };
    
    const result = await orderService.createOrder(orderData, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    if (error.message === 'Customer not found' || error.message === 'Customer is inactive') {
      res.status(400).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Update order controller
const updateOrder = async (req, res) => {
  try {
    const result = await orderService.updateOrder(req.params.id, req.body, req.user.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Update order status controller
const updateOrderStatus = async (req, res) => {
  try {
    const { status, notes } = req.body;
    const result = await orderService.updateOrderStatus(req.params.id, status, req.user.id, notes);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Get customer order history controller
const getCustomerOrderHistory = async (req, res) => {
  try {
    const result = await orderService.getCustomerOrderHistory(req.params.customerId, req.query);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Customer not found') {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Approve order controller
const approveOrder = async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await orderService.approveOrder(req.params.id, req.user.id, notes);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Reject order controller
const rejectOrder = async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await orderService.rejectOrder(req.params.id, req.user.id, notes);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

const assignDriver = async (req, res) => {
  try {
    const { driverId, notes } = req.body;
    const result = await orderService.assignDriver(req.params.id, driverId, req.user.id, notes);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

const unassignDriver = async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await orderService.unassignDriver(req.params.id, req.user.id, notes);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

const markOutForDelivery = async (req, res) => {
  try {
    const result = await orderService.markOutForDelivery(req.params.id, req.user, req.body);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

const recordDelivery = async (req, res) => {
  try {
    const result = await orderService.recordDelivery(req.params.id, req.user, req.body);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Get pending orders for approval
const getPendingOrdersForApproval = async (req, res) => {
  try {
    const result = await orderService.getPendingOrdersForApproval(req.query);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Move order to production controller
const moveToProduction = async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await orderService.moveToProduction(req.params.id, req.user.id, notes);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Mark as ready controller
const markAsReady = async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await orderService.markAsReady(req.params.id, req.user.id, notes);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Dispatch order controller
const dispatchOrder = async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await orderService.dispatchOrder(req.params.id, req.user.id, notes);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Mark as delivered controller
const markAsDelivered = async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await orderService.markAsDelivered(req.params.id, req.user.id, notes);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Complete order controller
const completeOrder = async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await orderService.completeOrder(req.params.id, req.user.id, notes);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Cancel order controller
const cancelOrder = async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await orderService.cancelOrder(req.params.id, req.user.id, notes);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Get orders by status controller
const getOrdersByStatus = async (req, res) => {
  try {
    const result = await orderService.getOrdersByStatus(req.params.status, req.query);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get order statistics controller
const getOrderStats = async (req, res) => {
  try {
    const result = await orderService.getOrderStats(req.query, req.user);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Quick-order: get catalog
const getQuickProducts = async (req, res) => {
  try {
    const result = await orderService.getQuickProducts(req.user);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Quick-order: create order from quick payload
const createQuickOrder = async (req, res) => {
  try {
    const quickData = {
      ...req.body,
      capturedImage: req.file ? req.file.buffer.toString('base64') : req.body.capturedImage,
      captureLocation: req.body.captureLocation ? JSON.parse(req.body.captureLocation) : null
    };
    
    const result = await orderService.createQuickOrder(quickData, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    if (error.message === 'Customer not found' || error.message === 'Customer is inactive') {
      res.status(400).json({ success: false, message: error.message });
    } else if (error.message?.startsWith('Invalid product key') || error.message?.includes('At least one item')) {
      res.status(400).json({ success: false, message: error.message });
    } else {
      res.status(400).json({ success: false, message: error.message });
    }
  }
};

// Create visit controller
const createVisit = async (req, res) => {
  try {
    const visitData = {
      ...req.body,
      type: 'visit',
      capturedImage: req.file ? req.file.buffer.toString('base64') : req.body.capturedImage,
      captureLocation: req.body.captureLocation ? JSON.parse(req.body.captureLocation) : null
    };
    
    const result = await orderService.createVisit(visitData, req.user.id);
    res.status(201).json(result);
  } catch (error) {
    if (error.message === 'Customer not found' || error.message === 'Customer is inactive') {
      res.status(400).json({ success: false, message: error.message });
    } else {
      res.status(400).json({ success: false, message: error.message });
    }
  }
};

// Get visits controller
const getVisits = async (req, res) => {
  try {
    const params = { ...req.query, type: 'visit' };
    const result = await orderService.getAllOrders(params, req.user);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get visit by ID controller
const getVisitById = async (req, res) => {
  try {
    const result = await orderService.getOrderById(req.params.id);
    
    // Verify it's actually a visit
    if (result.data.order.type !== 'visit') {
      return res.status(404).json({
        success: false,
        message: 'Visit not found'
      });
    }
    
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: 'Visit not found'
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Update visit controller
const updateVisit = async (req, res) => {
  try {
    // First verify it's a visit
    const existingVisit = await orderService.getOrderById(req.params.id);
    if (existingVisit.data.order.type !== 'visit') {
      return res.status(404).json({
        success: false,
        message: 'Visit not found'
      });
    }

    const result = await orderService.updateOrder(req.params.id, req.body, req.user.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: 'Visit not found'
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message
      });
    }
  }
};

// Get order audit trail controller
const getOrderAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const result = await orderService.getOrderAuditTrail(id, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.status(200).json({
      success: true,
      message: 'Order audit trail retrieved successfully',
      data: result
    });
  } catch (error) {
    console.error('Error getting order audit trail:', error);
    buildErrorResponse(res, error);
  }
};

const getVisitAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 10 } = req.query;

    const result = await orderService.getVisitAuditTrail(id, {
      page: parseInt(page),
      limit: parseInt(limit)
    });

    res.status(200).json({
      success: true,
      message: 'Visit audit trail retrieved successfully',
      data: result
    });
  } catch (error) {
    console.error('Error getting visit audit trail:', error);
    buildErrorResponse(res, error);
  }
};

module.exports = {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrder,
  updateOrderStatus,
  approveOrder,
  rejectOrder,
  getPendingOrdersForApproval,
  moveToProduction,
  markAsReady,
  dispatchOrder,
  markAsDelivered,
  completeOrder,
  cancelOrder,
  getOrdersByStatus,
  getCustomerOrderHistory,
  getOrderStats,
  assignDriver,
  unassignDriver,
  markOutForDelivery,
  recordDelivery,
  getQuickProducts,
  createQuickOrder,
  createVisit,
  getVisits,
  getVisitById,
  updateVisit,
  getOrderAuditTrail,
  getVisitAuditTrail
};

