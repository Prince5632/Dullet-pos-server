const { AuditLog } = require('../models');

// Get all activity for a specific user with pagination and filtering
const getAllSystemActivity = async (page = 1, limit = 20, filters = {}, userId = null) => {
  // Calculate skip value for pagination
  const skip = (page - 1) * limit;

  // Extract filters
  const { module, action, resourceType } = filters;

  // Get user activity with pagination
  const result = await AuditLog.getAllSystemActivity({ 
    limit, 
    skip, 
    module, 
    action, 
    resourceType,
    userId 
  });

  return {
    success: true,
    message: "User activity retrieved successfully",
    data: {
      activities: result.logs,
      pagination: {
        currentPage: page,
        totalItems: result.total,
        itemsPerPage: limit,
        totalPages: Math.ceil(result.total / limit),
        hasMore: result.hasMore
      }
    }
  };
};

// Get available filter options
const getFilterOptions = async () => {
  try {
    // Get distinct modules
    const modules = await AuditLog.distinct('module');
    
    // Get distinct actions
    const actions = await AuditLog.distinct('action');
    
    // Get distinct resource types
    const resourceTypes = await AuditLog.distinct('resourceType');

    return {
      success: true,
      data: {
        modules: modules.sort(),
        actions: actions.sort(),
        resourceTypes: resourceTypes.sort()
      }
    };
  } catch (error) {
    throw new Error(error.message || 'Failed to get filter options');
  }
};

// Get activity statistics
const getActivityStats = async () => {
  try {
    const totalActivities = await AuditLog.countDocuments();
    
    // Get activities by module
    const moduleStats = await AuditLog.aggregate([
      {
        $group: {
          _id: '$module',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Get activities by action
    const actionStats = await AuditLog.aggregate([
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 }
        }
      },
      {
        $sort: { count: -1 }
      }
    ]);

    // Get recent activity count (last 24 hours)
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentActivities = await AuditLog.countDocuments({
      createdAt: { $gte: yesterday }
    });

    return {
      success: true,
      data: {
        totalActivities,
        recentActivities,
        moduleStats,
        actionStats
      }
    };
  } catch (error) {
    throw new Error(error.message || 'Failed to get activity statistics');
  }
};

module.exports = {
  getAllSystemActivity,
  getFilterOptions,
  getActivityStats
};