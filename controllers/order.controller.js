const orderService = require('../services/order.service');

// Get all orders controller
const getAllOrders = async (req, res) => {
  try {
    const result = await orderService.getAllOrders(req.query);
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

// Get order statistics controller
const getOrderStats = async (req, res) => {
  try {
    const result = await orderService.getOrderStats();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getAllOrders,
  getOrderById,
  createOrder,
  updateOrder,
  updateOrderStatus,
  getCustomerOrderHistory,
  getOrderStats
};

