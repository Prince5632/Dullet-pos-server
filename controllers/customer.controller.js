const customerService = require("../services/customer.service");

// Get all customers controller
const getAllCustomers = async (req, res) => {
  try {
    const result = await customerService.getAllCustomers(req.query, req.user);
    res.status(200).json(result);
  } catch (error) {
    const status = error.status || error.statusCode || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

// Get customer by ID controller
const getCustomerById = async (req, res) => {
  try {
    const result = await customerService.getCustomerById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === "Customer not found") {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
};

// Create customer controller
const createCustomer = async (req, res) => {
  try {
    let customerData = req.body;
    if (customerData.assignedGodownId === "") {
      const { assignedGodownId, ...otherData } = customerData;
      customerData = otherData;
    }
    const result = await customerService.createCustomer(
      customerData,
      req.user.id
    );
    res.status(201).json(result);
  } catch (error) {
    if (error.message.includes("already exists")) {
      res.status(409).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
};

// Update customer controller
const updateCustomer = async (req, res) => {
  try {
    const result = await customerService.updateCustomer(
      req.params.id,
      req.body,
      req.user.id
    );
    res.status(200).json(result);
  } catch (error) {
    if (error.message === "Customer not found") {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else if (error.message.includes("already exists")) {
      res.status(409).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(400).json({
        success: false,
        message: error.message,
      });
    }
  }
};

// Delete customer controller (hard delete)
const deleteCustomer = async (req, res) => {
  try {
    const result = await customerService.deleteCustomer(
      req.params.id,
      req.user.id
    );
    res.status(200).json(result);
  } catch (error) {
    if (error.message === "Customer not found") {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
};

// Reactivate customer controller
const reactivateCustomer = async (req, res) => {
  try {
    const result = await customerService.reactivateCustomer(
      req.params.id,
      req.user.id
    );
    res.status(200).json(result);
  } catch (error) {
    if (error.message === "Customer not found") {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
};

// Get customer statistics controller
const getCustomerStats = async (req, res) => {
  try {
    const result = await customerService.getCustomerStats();
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getAllCustomers,
  getCustomerById,
  createCustomer,
  updateCustomer,
  deleteCustomer,
  reactivateCustomer,
  getCustomerStats,
};
