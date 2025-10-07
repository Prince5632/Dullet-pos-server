const reportService = require('../services/report.service');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Get Sales Executive Reports
 * @route GET /api/reports/sales-executives
 */
exports.getSalesExecutiveReports = async (req, res) => {
  try {
    const { startDate, endDate, userId, sortBy = 'totalRevenue', sortOrder = 'desc', department, godownId, type } = req.query;

    const filters = {};
    if (startDate || endDate) {
      filters.dateRange = {};
      if (startDate) {
        filters.dateRange.startDate = new Date(startDate);
      }
      if (endDate) {
        filters.dateRange.endDate = new Date(endDate);
      }
    }
    if (userId) {
      filters.userId = userId;
    }
    // Default to Sales department if not specified
    filters.department = department || 'Sales';
    if (godownId) {
      filters.godownId = godownId;
    }
    if (type) {
      filters.type = type;
    }

    const report = await reportService.getSalesExecutiveReports(filters, sortBy, sortOrder);

    return sendSuccess(res, report, 'Sales executive reports retrieved successfully');
  } catch (error) {
    console.error('Error fetching sales executive reports:', error);
    return sendError(res, error.message, 500);
  }
};

/**
 * Get Godown-wise Sales Reports
 * @route GET /api/reports/godowns
 */
exports.getGodownSalesReports = async (req, res) => {
  try {
    const { startDate, endDate, sortBy = 'totalRevenue', sortOrder = 'desc' } = req.query;

    const filters = {};
    if (startDate || endDate) {
      filters.dateRange = {};
      if (startDate) {
        filters.dateRange.startDate = new Date(startDate);
      }
      if (endDate) {
        filters.dateRange.endDate = new Date(endDate);
      }
    }

    const report = await reportService.getGodownSalesReports(filters, sortBy, sortOrder);

    return sendSuccess(res, report, 'Godown-wise sales reports retrieved successfully');
  } catch (error) {
    console.error('Error fetching godown sales reports:', error);
    return sendError(res, error.message, 500);
  }
};

/**
 * Get Customer Reports
 * @route GET /api/reports/customers
 */
exports.getCustomerReports = async (req, res) => {
  try {
    const { 
      startDate, 
      endDate, 
      customerId, 
      sortBy = 'totalSpent', 
      sortOrder = 'desc',
      inactiveDays // Dynamic parameter for inactive customers
    } = req.query;

    const filters = {};
    if (startDate || endDate) {
      filters.dateRange = {};
      if (startDate) {
        filters.dateRange.startDate = new Date(startDate);
      }
      if (endDate) {
        filters.dateRange.endDate = new Date(endDate);
      }
    }
    if (customerId) {
      filters.customerId = customerId;
    }
    if (inactiveDays) {
      filters.inactiveDays = parseInt(inactiveDays);
    }

    const report = await reportService.getCustomerReports(filters, sortBy, sortOrder);

    return sendSuccess(res, report, 'Customer reports retrieved successfully');
  } catch (error) {
    console.error('Error fetching customer reports:', error);
    return sendError(res, error.message, 500);
  }
};

/**
 * Get Inactive Customers
 * @route GET /api/reports/customers/inactive
 */
exports.getInactiveCustomers = async (req, res) => {
  try {
    const { days = 7 } = req.query;

    const inactiveCustomers = await reportService.getInactiveCustomers(parseInt(days));

    return sendSuccess(res, inactiveCustomers, 'Inactive customers retrieved successfully');
  } catch (error) {
    console.error('Error fetching inactive customers:', error);
    return sendError(res, error.message, 500);
  }
};

/**
 * Get Executive Performance Detail
 * @route GET /api/reports/sales-executives/:userId
 */
exports.getExecutivePerformanceDetail = async (req, res) => {
  try {
    const { userId } = req.params;
    const { startDate, endDate, type } = req.query;

    const filters = {};
    if (startDate || endDate) {
      filters.dateRange = {};
      if (startDate) {
        filters.dateRange.startDate = new Date(startDate);
      }
      if (endDate) {
        filters.dateRange.endDate = new Date(endDate);
      }
    }
    if (type) {
      filters.type = type;
    }

    const detail = await reportService.getExecutivePerformanceDetail(userId, filters);

    return sendSuccess(res, detail, 'Executive performance detail retrieved successfully');
  } catch (error) {
    console.error('Error fetching executive performance detail:', error);
    return sendError(res, error.message, 500);
  }
};

/**
 * Get Customer Purchase Detail
 * @route GET /api/reports/customers/:customerId
 */
exports.getCustomerPurchaseDetail = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate } = req.query;

    const filters = {};
    if (startDate || endDate) {
      filters.dateRange = {};
      if (startDate) {
        filters.dateRange.startDate = new Date(startDate);
      }
      if (endDate) {
        filters.dateRange.endDate = new Date(endDate);
      }
    }

    const detail = await reportService.getCustomerPurchaseDetail(customerId, filters);

    return sendSuccess(res, detail, 'Customer purchase detail retrieved successfully');
  } catch (error) {
    console.error('Error fetching customer purchase detail:', error);
    return sendError(res, error.message, 500);
  }
};

