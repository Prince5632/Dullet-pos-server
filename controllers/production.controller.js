const productionService = require("../services/production.service");

// Get all production records controller
const getAllProduction = async (req, res) => {
  try {
    const result = await productionService.getAllProduction(req.query, req.user);
    res.status(200).json(result);
  } catch (error) {
    const status = error.status || error.statusCode || 500;
    res.status(status).json({
      success: false,
      message: error.message,
    });
  }
};

// Get production record by ID controller
const getProductionById = async (req, res) => {
  try {
    const result = await productionService.getProductionById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === "Production record not found") {
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

// Create production record controller
const createProduction = async (req, res) => {
  try {
    // Parse FormData fields
    const productionData = { ...req.body };
    
    // Parse JSON fields
    if (productionData.outputDetails && typeof productionData.outputDetails === 'string') {
      try {
        productionData.outputDetails = JSON.parse(productionData.outputDetails);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid outputDetails format"
        });
      }
    }
    
    // Add uploaded files
    if (req.files && req.files.length > 0) {
      productionData.attachments = req.files;
    }
    
    const result = await productionService.createProduction(
      productionData,
      req.user.id
    );
    res.status(201).json(result);
  } catch (error) {
    if (error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        message: error.message,
        errors: error.errors
      });
    } else if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: "Batch ID already exists",
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
};

// Update production record controller
const updateProduction = async (req, res) => {
  try {
    // Parse FormData fields
    const productionData = { ...req.body };
    
    // Parse JSON fields
    if (productionData.outputDetails && typeof productionData.outputDetails === 'string') {
      try {
        productionData.outputDetails = JSON.parse(productionData.outputDetails);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid outputDetails format"
        });
      }
    }
    
    // Parse removedAttachments if provided
    if (productionData.removedAttachments && typeof productionData.removedAttachments === 'string') {
      try {
        productionData.removedAttachments = JSON.parse(productionData.removedAttachments);
      } catch (error) {
        // If parsing fails, treat as comma-separated string
        productionData.removedAttachments = productionData.removedAttachments.split(',').map(item => item.trim()).filter(item => item);
      }
    }
    
    // Add uploaded files
    if (req.files && req.files.length > 0) {
      productionData.newAttachments = req.files;
    }
    
    const result = await productionService.updateProduction(
      req.params.id,
      productionData,
      req.user.id
    );
    res.status(200).json(result);
  } catch (error) {
    if (error.message === "Production record not found") {
      res.status(404).json({
        success: false,
        message: error.message,
      });
    } else if (error.name === 'ValidationError') {
      res.status(400).json({
        success: false,
        message: error.message,
        errors: error.errors
      });
    } else if (error.code === 11000) {
      res.status(400).json({
        success: false,
        message: "Batch ID already exists",
      });
    } else {
      res.status(500).json({
        success: false,
        message: error.message,
      });
    }
  }
};

// Delete production record controller
const deleteProduction = async (req, res) => {
  try {
    const result = await productionService.deleteProduction(req.params.id, req.user.id);
    res.status(200).json(result);
  } catch (error) {
    if (error.message === "Production record not found") {
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

// Get production statistics controller
const getProductionStats = async (req, res) => {
  try {
    const result = await productionService.getProductionStats(req.query, req.user);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get production summary by date range controller
const getProductionSummary = async (req, res) => {
  try {
    const result = await productionService.getProductionSummary(req.query, req.user);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};

// Get production audit trail controller
const getProductionAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;
    const result = await productionService.getProductionAuditTrail(id, parseInt(page), parseInt(limit));
    res.status(200).json(result);
  } catch (error) {
    console.error('Error getting production audit trail:', error);
    res.status(500).json({
      success: false,
      message: error.message || 'Failed to get production audit trail',
    });
  }
};

module.exports = {
  getAllProduction,
  getProductionById,
  createProduction,
  updateProduction,
  deleteProduction,
  getProductionStats,
  getProductionSummary,
  getProductionAuditTrail
};