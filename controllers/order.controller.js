const orderService = require('../services/order.service');

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
    const result = await orderService.createOrder(req.body, req.user.id);
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
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else if (error.message === 'Order is not in pending status' || 
               error.message === 'Only Manager or Admin can approve orders') {
      res.status(400).json({
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

// Reject order controller
const rejectOrder = async (req, res) => {
  try {
    const { notes } = req.body;
    const result = await orderService.rejectOrder(req.params.id, req.user.id, notes);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === 'Order not found') {
      res.status(404).json({
        success: false,
        message: error.message
      });
    } else if (error.message === 'Order is not in pending status' || 
               error.message === 'Only Manager or Admin can reject orders') {
      res.status(400).json({
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
const getQuickProducts = async (_req, res) => {
  try {
    const result = await orderService.getQuickProducts();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Quick-order: create order from quick payload
const createQuickOrder = async (req, res) => {
  try {
    const result = await orderService.createQuickOrder(req.body, req.user.id);
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
  getOrderStats
  , getQuickProducts
  , createQuickOrder
};

