const { default: mongoose } = require("mongoose");
const reportService = require("../services/report.service");
const { sendSuccess, sendError } = require("../utils/response");

/**
 * Get Sales Executive Reports
 * @route GET /api/reports/sales-executives
 */
exports.getSalesExecutiveReports = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      userId,
      sortBy = "totalRevenue",
      sortOrder = "desc",
      department,
      godownId,
      userActivityFilter,
      type,
    } = req.query;
    let roleIds = req.query['roleIds[]'] || [];
    roleIds = Array.isArray(roleIds) ? roleIds : [roleIds];
    roleIds = roleIds.map((id) => new mongoose.Types.ObjectId(id));
    
    const filters = {};
    if (startDate || endDate) {
      filters.dateRange = {};

      if (startDate) {
        const dateFrom = new Date(startDate);
        dateFrom.setHours(0, 0, 0, 0);
        filters.dateRange.startDate = dateFrom;
      }
      if (endDate) {
        const dateTo = new Date(endDate);
        dateTo.setHours(23, 59, 59, 999);
        filters.dateRange.endDate = dateTo;
      }
    }
    if (userId) {
      filters.userId = userId;
    }
    if (roleIds?.length > 0) {
      filters.roleIds = roleIds;
    }
    // Add department filter only if specified
    if (department) {
      filters.department = department;
    }
    if (godownId) {
      filters.godownId = godownId;
    }
    if (type) {
      filters.type = type;
    }
    if (userActivityFilter && userActivityFilter !== "all") {
      filters.userActivityFilter = userActivityFilter;
    }

    const report = await reportService.getSalesExecutiveReports(
      filters,
      sortBy,
      sortOrder,
      req.user
    );

    return sendSuccess(
      res,
      report,
      "Sales executive reports retrieved successfully"
    );
  } catch (error) {
    console.error("Error fetching sales executive reports:", error);
    return sendError(res, error.message, 500);
  }
};

/**
 * Get Godown-wise Sales Reports
 * @route GET /api/reports/godowns
 */
exports.getGodownSalesReports = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      sortBy = "totalRevenue",
      sortOrder = "desc",
    } = req.query;

    const filters = {};
    if (startDate || endDate) {
      filters.dateRange = {};
      if (startDate) {
        const dateFrom = new Date(startDate);
        dateFrom.setHours(0, 0, 0, 0);
        filters.dateRange.startDate = dateFrom;
      }
      if (endDate) {
        const dateTo = new Date(endDate);
        dateTo.setHours(23, 59, 59, 999);
        filters.dateRange.endDate = dateTo;
      }
    }

    const report = await reportService.getGodownSalesReports(
      filters,
      sortBy,
      sortOrder,
      req.user
    );

    return sendSuccess(
      res,
      report,
      "Godown-wise sales reports retrieved successfully"
    );
  } catch (error) {
    console.error("Error fetching godown sales reports:", error);
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
      sortBy = "totalSpent",
      sortOrder = "desc",
      inactiveDays, // Dynamic parameter for inactive customers
      godownId, // Add godown filtering support
      status, // Order status filter
      page = 1,
      limit = 10,
    } = req.query;

    const filters = {};
    if (startDate || endDate) {
      filters.dateRange = {};
      if (startDate) {
        const dateFrom = new Date(startDate);
        dateFrom.setHours(0, 0, 0, 0);
        filters.dateRange.startDate = dateFrom;
      }
      if (endDate) {
        const dateTo = new Date(endDate);
        dateTo.setHours(23, 59, 59, 999);
        filters.dateRange.endDate = dateTo;
      }
    }
    if (customerId) {
      filters.customerId = customerId;
    }
    if (inactiveDays) {
      filters.inactiveDays = parseInt(inactiveDays);
    }
    if (godownId) {
      filters.godownId = godownId;
    }
    if (status) {
      filters.status = status;
    }

    const report = await reportService.getCustomerReports(
      filters,
      sortBy,
      sortOrder,
      req.user,
      parseInt(page),
      parseInt(limit)
    );

    return sendSuccess(res, report, "Customer reports retrieved successfully");
  } catch (error) {
    console.error("Error fetching customer reports:", error);
    return sendError(res, error.message, 500);
  }
};

/**
 * Get Inactive Customers
 * @route GET /api/reports/customers/inactive
 */
exports.getInactiveCustomers = async (req, res) => {
  try {
    const { days = 7, godownId, status, page = 1, limit = 10 } = req.query;

    const inactiveCustomers = await reportService.getInactiveCustomers(
      parseInt(days),
      godownId,
      parseInt(page),
      parseInt(limit),
      status
    );

    return sendSuccess(
      res,
      inactiveCustomers,
      "Inactive customers retrieved successfully"
    );
  } catch (error) {
    console.error("Error fetching inactive customers:", error);
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
        const dateFrom = new Date(startDate);
        dateFrom.setHours(0, 0, 0, 0);
        filters.dateRange.startDate = dateFrom;
      }
      if (endDate) {
        const dateTo = new Date(endDate);
        dateTo.setHours(23, 59, 59, 999);
        filters.dateRange.endDate = dateTo;
      }
    }
    if (type) {
      filters.type = type;
    }

    const detail = await reportService.getExecutivePerformanceDetail(
      userId,
      filters
    );

    return sendSuccess(
      res,
      detail,
      "Executive performance detail retrieved successfully"
    );
  } catch (error) {
    console.error("Error fetching executive performance detail:", error);
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
        const dateFrom = new Date(startDate);
        dateFrom.setHours(0, 0, 0, 0);
        filters.dateRange.startDate = dateFrom;
      }
      if (endDate) {
        const dateTo = new Date(endDate);
        dateTo.setHours(23, 59, 59, 999);
        filters.dateRange.endDate = dateTo;
      }
    }

    const detail = await reportService.getCustomerPurchaseDetail(
      customerId,
      filters
    );

    return sendSuccess(
      res,
      detail,
      "Customer purchase detail retrieved successfully"
    );
  } catch (error) {
    console.error("Error fetching customer purchase detail:", error);
    return sendError(res, error.message, 500);
  }
};

/**
 * Export Sales Executive Reports to Excel
 * @route GET /api/reports/sales-executives/export/excel
 */
exports.exportSalesExecutiveReportsToExcel = async (req, res) => {
  try {
    const {
      startDate,
      endDate,
      userId,
      sortBy = "totalRevenue",
      sortOrder = "desc",
      department,
      godownId,
      userActivityFilter,
      type = "order",
    } = req.query;
    
    let roleIds = req.query['roleIds[]'] || [];
    roleIds = Array.isArray(roleIds) ? roleIds : [roleIds];
    roleIds = roleIds.map((id) => new mongoose.Types.ObjectId(id));
    
    const filters = {};
    if (startDate || endDate) {
      filters.dateRange = {};

      if (startDate) {
        const dateFrom = new Date(startDate);
        dateFrom.setHours(0, 0, 0, 0);
        filters.dateRange.startDate = dateFrom;
      }
      if (endDate) {
        const dateTo = new Date(endDate);
        dateTo.setHours(23, 59, 59, 999);
        filters.dateRange.endDate = dateTo;
      }
    }
    if (userId) {
      filters.userId = userId;
    }
    if (roleIds?.length > 0) {
      filters.roleIds = roleIds;
    }
    if (department) {
      filters.department = department;
    }
    if (godownId) {
      filters.godownId = godownId;
    }
    if (type) {
      filters.type = type;
    }
    if (userActivityFilter && userActivityFilter !== "all") {
      filters.userActivityFilter = userActivityFilter;
    }

    // Generate Excel file
    const excelBuffer = await reportService.generateSalesExecutiveExcel(
      filters,
      sortBy,
      sortOrder,
      req.user,
      type
    );

    // Set response headers for file download
    const reportTypeLabel = type === "visit" ? "visits" : "orders";
    const filename = `sales-executive-${reportTypeLabel}-reports-${new Date().toISOString().split("T")[0]}.xlsx`;
    
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.setHeader("Content-Length", excelBuffer.length);

    return res.send(excelBuffer);
  } catch (error) {
    console.error("Error exporting sales executive reports to Excel:", error);
    return sendError(res, error.message, 500);
  }
};


