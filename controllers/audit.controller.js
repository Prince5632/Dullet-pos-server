const auditService = require('../services/audit.service');

// Get all system activity for a specific user
const getAllSystemActivity = async (req, res) => {
  try {
    const { page = 1, limit = 20, module, action, resourceType, userId } = req.query;

    // Validate pagination parameters
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit))); // Max 50 items per page

    const filters = {};
    if (module) filters.module = module;
    if (action) filters.action = action;
    if (resourceType) filters.resourceType = resourceType;

    // Get user ID from query parameter
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "User ID is required",
      });
    }

    const result = await auditService.getAllSystemActivity(pageNum, limitNum, filters, userId);
    res.status(200).json(result);
  } catch (error) {
    console.error("Error getting user activity:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get user activity",
    });
  }
};

// Get filter options
const getFilterOptions = async (req, res) => {
  try {
    const result = await auditService.getFilterOptions();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error getting filter options:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get filter options",
    });
  }
};

// Get activity statistics
const getActivityStats = async (req, res) => {
  try {
    const result = await auditService.getActivityStats();
    res.status(200).json(result);
  } catch (error) {
    console.error("Error getting activity statistics:", error);
    res.status(500).json({
      success: false,
      message: error.message || "Failed to get activity statistics",
    });
  }
};

module.exports = {
  getAllSystemActivity,
  getFilterOptions,
  getActivityStats
};