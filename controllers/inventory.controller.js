const inventoryService = require("../services/inventory.service");

// Get all inventory records
const getAllInventory = async (req, res) => {
  try {
    const result = await inventoryService.getAllInventory(req.query);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get inventory record by ID
const getInventoryById = async (req, res) => {
  try {
    const result = await inventoryService.getInventoryById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === "Inventory record not found") {
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

// Create new inventory record
const createInventory = async (req, res) => {
  try {
    const result = await inventoryService.createInventory(
      req.body,
      req.user.id
    );
    res.status(201).json(result);
  } catch (error) {
    if (error.message.includes("required") || 
        error.message.includes("Invalid")) {
      res.status(400).json({
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

// Update inventory record
const updateInventory = async (req, res) => {
  try {
    const result = await inventoryService.updateInventory(
      req.params.id,
      req.body,
      req.user.id
    );
    res.status(200).json(result);
  } catch (error) {
    if (error.message === "Inventory record not found") {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else if (error.message.includes("Invalid")) {
      res.status(400).json({
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

// Delete inventory record
const deleteInventory = async (req, res) => {
  try {
    const result = await inventoryService.deleteInventory(
      req.params.id,
      req.user.id
    );
    res.status(200).json(result);
  } catch (error) {
    if (error.message === "Inventory record not found") {
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

// Get inventory statistics
const getInventoryStats = async (req, res) => {
  try {
    const result = await inventoryService.getInventoryStats(req.query);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get inventory by godown
const getInventoryByGodown = async (req, res) => {
  try {
    const result = await inventoryService.getInventoryByGodown(
      req.params.godownId,
      req.query
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

module.exports = {
  getAllInventory,
  getInventoryById,
  createInventory,
  updateInventory,
  deleteInventory,
  getInventoryStats,
  getInventoryByGodown,
};