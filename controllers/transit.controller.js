const transitService = require('../services/transit.service');

const buildErrorResponse = (res, error, defaultStatus = 500) => {
  const statusCode =
    error.message === 'Transit not found' ? 404 :
    error.message === 'From location (godown) not found' ? 404 :
    error.message === 'To location (godown) not found' ? 404 :
    error.message === 'Driver not found' ? 404 :
    error.message === 'Assigned user not found' ? 404 :
    error.message.startsWith('Only ') ? 403 :
    error.message.startsWith('Access denied') ? 403 :
    error.message.startsWith('Cannot change status') ? 400 :
    error.message.startsWith('From location and to location') ? 400 :
    error.message.startsWith('At least one product') ? 400 :
    error.message.includes('is required') ? 400 :
    defaultStatus;

  return res.status(statusCode).json({
    success: false,
    message: error.message
  });
};

// Get all transits controller
const getAllTransits = async (req, res) => {
  try {
    const result = await transitService.getAllTransits(req.query, req.user);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Get transit by ID controller
const getTransitById = async (req, res) => {
  try {
    const result = await transitService.getTransitById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Create transit controller
const createTransit = async (req, res) => {
  try {
    // Parse FormData fields
    const transitData = { ...req.body };
    
    // Parse JSON fields
    if (transitData.productDetails && typeof transitData.productDetails === 'string') {
      try {
        transitData.productDetails = JSON.parse(transitData.productDetails);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid productDetails format"
        });
      }
    }
    
    // Add uploaded files
    if (req.files && req.files.length > 0) {
      transitData.attachments = req.files;
    }
    
    const result = await transitService.createTransit(transitData, req.user);
    res.status(201).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Update transit controller
const updateTransit = async (req, res) => {
  try {
    // Parse FormData fields
    const transitData = { ...req.body };
    
    // Parse JSON fields
    if (transitData.productDetails && typeof transitData.productDetails === 'string') {
      try {
        transitData.productDetails = JSON.parse(transitData.productDetails);
      } catch (error) {
        return res.status(400).json({
          success: false,
          message: "Invalid productDetails format"
        });
      }
    }
    
    // Parse removedAttachments if provided
    if (transitData.removedAttachments && typeof transitData.removedAttachments === 'string') {
      try {
        transitData.removedAttachments = JSON.parse(transitData.removedAttachments);
      } catch (error) {
        // If parsing fails, treat as comma-separated string
        transitData.removedAttachments = transitData.removedAttachments.split(',').map(item => item.trim()).filter(item => item);
      }
    }
    
    // Add uploaded files
    if (req.files && req.files.length > 0) {
      transitData.newAttachments = req.files;
    }
    
    const result = await transitService.updateTransit(req.params.id, transitData, req.user);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Delete transit controller
const deleteTransit = async (req, res) => {
  try {
    const result = await transitService.deleteTransit(req.params.id, req.user);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Update transit status controller
const updateTransitStatus = async (req, res) => {
  try {
    const { status } = req.body;
    
    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['Pending', 'In Transit', 'Received', 'Partially Received', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Valid statuses are: ' + validStatuses.join(', ')
      });
    }

    const result = await transitService.updateTransitStatus(req.params.id, status, req.user);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Assign driver controller
const assignDriver = async (req, res) => {
  try {
    const { driverId } = req.body;
    
    if (!driverId) {
      return res.status(400).json({
        success: false,
        message: 'Driver ID is required'
      });
    }

    const result = await transitService.assignDriver(req.params.id, driverId, req.user);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Get transit statistics controller
const getTransitStats = async (req, res) => {
  try {
    const result = await transitService.getTransitStats(req.user);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Get transits by location controller
const getTransitsByLocation = async (req, res) => {
  try {
    const { locationId } = req.params;
    const { type = 'from' } = req.query;

    if (!['from', 'to'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type must be either "from" or "to"'
      });
    }

    const result = await transitService.getTransitsByLocation(locationId, type, req.user);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Bulk update transit status controller
const bulkUpdateTransitStatus = async (req, res) => {
  try {
    const { transitIds, status } = req.body;

    if (!transitIds || !Array.isArray(transitIds) || transitIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Transit IDs array is required'
      });
    }

    if (!status) {
      return res.status(400).json({
        success: false,
        message: 'Status is required'
      });
    }

    const validStatuses = ['Pending', 'In Transit', 'Received', 'Partially Received', 'Cancelled'];
    if (!validStatuses.includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Valid statuses are: ' + validStatuses.join(', ')
      });
    }

    const results = [];
    const errors = [];

    for (const transitId of transitIds) {
      try {
        const result = await transitService.updateTransitStatus(transitId, status, req.user);
        results.push({ transitId, success: true, data: result.data });
      } catch (error) {
        errors.push({ transitId, success: false, message: error.message });
      }
    }

    res.status(200).json({
      success: true,
      message: `Bulk update completed. ${results.length} successful, ${errors.length} failed.`,
      data: {
        successful: results,
        failed: errors,
        summary: {
          total: transitIds.length,
          successful: results.length,
          failed: errors.length
        }
      }
    });
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Get transit by transit ID (not MongoDB _id)
const getTransitByTransitId = async (req, res) => {
  try {
    const { transitId } = req.params;
    
    // Find transit by transitId field instead of _id
    const result = await transitService.getAllTransits({ search: transitId }, req.user);
    
    if (!result.data || result.data.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Transit not found'
      });
    }

    // Find exact match
    const transit = result.data.find(t => t.transitId === transitId);
    
    if (!transit) {
      return res.status(404).json({
        success: false,
        message: 'Transit not found'
      });
    }

    res.status(200).json({
      success: true,
      data: transit
    });
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Get pending transits (Pending and In Transit)
const getPendingTransits = async (req, res) => {
  try {
    const query = {
      ...req.query,
      status: req.query.status || 'Pending,In Transit'
    };

    // Convert comma-separated status to array for filtering
    if (query.status.includes(',')) {
      const statuses = query.status.split(',').map(s => s.trim());
      // We'll handle multiple statuses in the service if needed
      // For now, let's get all and filter
      delete query.status;
      const result = await transitService.getAllTransits(query, req.user);
      
      // Filter by multiple statuses
      const filteredData = result.data.filter(transit => 
        statuses.includes(transit.status)
      );

      res.status(200).json({
        ...result,
        data: filteredData,
        pagination: {
          ...result.pagination,
          totalItems: filteredData.length,
          totalPages: Math.ceil(filteredData.length / (query.limit || 10))
        }
      });
    } else {
      const result = await transitService.getAllTransits(query, req.user);
      res.status(200).json(result);
    }
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Get my transits (assigned to current user)
const getMyTransits = async (req, res) => {
  try {
    const query = {
      ...req.query,
      assignedTo: req.user._id
    };

    const result = await transitService.getAllTransits(query, req.user);
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

// Get transit audit trail
const getTransitAuditTrail = async (req, res) => {
  try {
    const { id } = req.params;
    const { page = 1, limit = 20 } = req.query;

    const result = await transitService.getTransitAuditTrail(id, parseInt(page), parseInt(limit));
    res.status(200).json(result);
  } catch (error) {
    buildErrorResponse(res, error);
  }
};

module.exports = {
  getAllTransits,
  getTransitById,
  createTransit,
  updateTransit,
  deleteTransit,
  updateTransitStatus,
  assignDriver,
  getTransitStats,
  getTransitsByLocation,
  bulkUpdateTransitStatus,
  getTransitByTransitId,
  getPendingTransits,
  getMyTransits,
  getTransitAuditTrail
};