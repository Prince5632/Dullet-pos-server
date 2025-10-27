const User = require("../models/user.schema");
const Customer = require("../models/customer.schema");
const Order = require("../models/order.schema");
const mongoose = require("mongoose");

/**
 * Get Sales Executive Reports
 */
exports.getSalesExecutiveReports = async (
  filters = {},
  sortBy = "totalRevenue",
  sortOrder = "desc",
  requestingUser = null
) => {
  try {
    const {
      dateRange,
      userId,
      department,
      godownId,
      roleIds = [],
      type,
      userActivityFilter,
    } = filters;

    const userMatch = {};
    if (userId) userMatch._id = new mongoose.Types.ObjectId(userId);
    if (department) userMatch.department = department;

    // ✅ Godown Access Logic
    let godownAccessFilter = {};
    let allowedGodowns = [];
    
    if (
      requestingUser &&
      (requestingUser.primaryGodown ||
        requestingUser.accessibleGodowns?.length > 0)
    ) {
      allowedGodowns = [
        ...(requestingUser.primaryGodown
          ? [requestingUser.primaryGodown._id || requestingUser.primaryGodown]
          : []),
        ...(requestingUser.accessibleGodowns?.map((g) => g._id || g) || []),
      ];

      if (allowedGodowns.length > 0) {
        godownAccessFilter.godown = {
          $in: allowedGodowns.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }
    }

    if (godownId) {
      const specificGodown = new mongoose.Types.ObjectId(godownId);
      if (godownAccessFilter.godown) {
        const isAllowed = godownAccessFilter.godown.$in.some((id) =>
          id.equals(specificGodown)
        );
        if (!isAllowed) {
          return {
            summary: {
              totalExecutives: 0,
              totalOrdersAll: 0,
              totalRevenueAll: 0,
              totalOutstandingAll: 0,
              avgOrderValueAll: 0,
            },
            reports: [],
            dateRange: dateRange || null,
          };
        }
      }
      // When a specific godownId is provided, filter users to only those with this godown
      godownAccessFilter.godown = {
        $in: [specificGodown],
      };
    }

    const reports = await User.aggregate([
      { $match: userMatch },

      // ✅ Lookup Role
      {
        $lookup: {
          from: "roles",
          localField: "role",
          foreignField: "_id",
          as: "roleData",
        },
      },
      {
        $unwind: {
          path: "$roleData",
          preserveNullAndEmptyArrays: true,
        },
      },
      {
        $match: {
          ...(roleIds.length > 0
            ? { role: { $in: roleIds } }
            : {
                $or: [
                  { "roleData.name": "Sales Executive" },
                  { "roleData.name": "Manager" },
                ],
              }),
        },
      },

      // ✅ Godown-based access filtering for Users
      ...(Object.keys(godownAccessFilter).length > 0
        ? [
            {
              $match: {
                $or: [
                  { primaryGodown: { $in: godownAccessFilter.godown.$in } },
                  { accessibleGodowns: { $in: godownAccessFilter.godown.$in } },
                ],
              },
            },
          ]
        : []),

      // ✅ Optimized Order Aggregation — No arrays returned
      {
        $lookup: {
          from: "orders",
          let: { userId: "$_id" },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ["$createdBy", "$$userId"] },
                type: type || "order",
                status: { $nin: ["cancelled", "rejected"] },
                ...(Object.keys(godownAccessFilter).length > 0 ? godownAccessFilter : {}),
                ...(dateRange && (dateRange.startDate || dateRange.endDate)
                  ? {
                      orderDate: {
                        ...(dateRange.startDate ? { $gte: dateRange.startDate } : {}),
                        ...(dateRange.endDate ? { $lte: dateRange.endDate } : {}),
                      },
                    }
                  : {}),
              },
            },
            {
              $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                totalRevenue: { $sum: "$totalAmount" },
                totalPaidAmount: { $sum: "$paidAmount" },
                pendingOrders: {
                  $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
                },
                approvedOrders: {
                  $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
                },
                deliveredOrders: {
                  $sum: { $cond: [{ $eq: ["$status", "delivered"] }, 1, 0] },
                },
                completedOrders: {
                  $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
                },
                uniqueCustomers: { $addToSet: "$customer" },
                lastActivityDate: { $max: "$orderDate" },
              },
            },
          ],
          as: "orderStats",
        },
      },

      {
        $addFields: {
          stats: { $arrayElemAt: ["$orderStats", 0] },
        },
      },

      // ✅ Final Computed Fields
      {
        $addFields: {
          totalOrders: { $ifNull: ["$stats.totalOrders", 0] },
          totalRevenue: { $round: [{ $ifNull: ["$stats.totalRevenue", 0] }, 2] },
          totalPaidAmount: { $round: [{ $ifNull: ["$stats.totalPaidAmount", 0] }, 2] },
          totalOutstanding: {
            $round: [
              {
                $subtract: [
                  { $ifNull: ["$stats.totalRevenue", 0] },
                  { $ifNull: ["$stats.totalPaidAmount", 0] },
                ],
              },
              2,
            ],
          },
          avgOrderValue: {
            $cond: [
              { $gt: [{ $ifNull: ["$stats.totalOrders", 0] }, 0] },
              {
                $round: [
                  {
                    $divide: [
                      { $ifNull: ["$stats.totalRevenue", 0] },
                      { $ifNull: ["$stats.totalOrders", 0] },
                    ],
                  },
                  2,
                ],
              },
              0,
            ],
          },
          pendingOrders: { $ifNull: ["$stats.pendingOrders", 0] },
          approvedOrders: { $ifNull: ["$stats.approvedOrders", 0] },
          deliveredOrders: { $ifNull: ["$stats.deliveredOrders", 0] },
          completedOrders: { $ifNull: ["$stats.completedOrders", 0] },
          uniqueCustomersCount: {
            $size: { $ifNull: ["$stats.uniqueCustomers", []] },
          },
          lastActivityDate: "$stats.lastActivityDate",
          daysSinceLastActivity: {
            $cond: [
              { $gt: ["$stats.lastActivityDate", null] },
              {
                $round: [
                  {
                    $divide: [
                      { $subtract: [new Date(), "$stats.lastActivityDate"] },
                      1000 * 60 * 60 * 24,
                    ],
                  },
                  0,
                ],
              },
              null,
            ],
          },
          roleName: "$roleData.name",
          executiveName: { $concat: ["$firstName", " ", "$lastName"] },
        },
      },

      // ✅ Filter by user activity (after stats calculated)
      ...(userActivityFilter
        ? [
            {
              $match: {
                ...(userActivityFilter === "active"
                  ? { totalOrders: { $gt: 0 } }
                  : userActivityFilter === "inactive"
                  ? { totalOrders: { $eq: 0 } }
                  : {}),
              },
            },
          ]
        : []),

      {
        $project: {
          orderStats: 0,
          stats: 0,
        },
      },

      { $sort: { [sortBy]: sortOrder === "desc" ? -1 : 1 } },
    ]);

    // ✅ Summary calculation (much faster now)
    const summary = {
      totalExecutives: reports.length,
      totalOrdersAll: reports.reduce((sum, r) => sum + r.totalOrders, 0),
      totalRevenueAll: reports.reduce((sum, r) => sum + r.totalRevenue, 0),
      totalOutstandingAll: reports.reduce(
        (sum, r) => sum + r.totalOutstanding,
        0
      ),
      avgOrderValueAll:
        reports.length > 0
          ? reports.reduce((sum, r) => sum + r.avgOrderValue, 0) /
            reports.length
          : 0,
    };

    return { summary, reports, dateRange: dateRange || null };
  } catch (error) {
    throw new Error(
      `Failed to generate sales executive reports: ${error.message}`
    );
  }
};


/**
 * Get Godown-wise Sales Reports
 */
exports.getGodownSalesReports = async (
  filters = {},
  sortBy = "totalRevenue",
  sortOrder = "desc",
  requestingUser = null
) => {
  try {
    const { dateRange } = filters;

    const matchCriteria = {
      type: "order",
      status: { $nin: ["cancelled", "rejected"] },
    };

    if (dateRange && (dateRange.startDate || dateRange.endDate)) {
      matchCriteria.orderDate = {};
      if (dateRange.startDate) {
        matchCriteria.orderDate.$gte = dateRange.startDate;
      }
      if (dateRange.endDate) {
        matchCriteria.orderDate.$lte = dateRange.endDate;
      }
    }

    // Apply user-specific godown filtering
    if (
      requestingUser &&
      (requestingUser.primaryGodown ||
        (requestingUser.accessibleGodowns &&
          requestingUser.accessibleGodowns.length > 0))
    ) {
      const allowedGodowns = [];

      if (requestingUser.primaryGodown) {
        allowedGodowns.push(
          requestingUser.primaryGodown._id || requestingUser.primaryGodown
        );
      }

      if (
        requestingUser.accessibleGodowns &&
        requestingUser.accessibleGodowns.length > 0
      ) {
        allowedGodowns.push(
          ...requestingUser.accessibleGodowns.map((g) => g._id || g)
        );
      }

      if (allowedGodowns.length > 0) {
        matchCriteria.godown = {
          $in: allowedGodowns.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }
    }

    const reports = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: "$godown",
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paidAmount" },
          avgOrderValue: { $avg: "$totalAmount" },
        },
      },
      {
        $lookup: {
          from: "godowns",
          localField: "_id",
          foreignField: "_id",
          as: "godownInfo",
        },
      },
      { $unwind: { path: "$godownInfo", preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          godownName: "$godownInfo.name",
          location: "$godownInfo.location",
          totalOrders: 1,
          totalRevenue: { $round: ["$totalRevenue", 2] },
          totalPaid: { $round: ["$totalPaid", 2] },
          totalOutstanding: {
            $round: [{ $subtract: ["$totalRevenue", "$totalPaid"] }, 2],
          },
          avgOrderValue: { $round: ["$avgOrderValue", 2] },
        },
      },
      { $sort: { [sortBy]: sortOrder === "desc" ? -1 : 1 } },
    ]);

    const summary = {
      totalGodowns: reports.length,
      totalOrdersAll: reports.reduce((s, r) => s + r.totalOrders, 0),
      totalRevenueAll: reports.reduce((s, r) => s + r.totalRevenue, 0),
      totalOutstandingAll: reports.reduce((s, r) => s + r.totalOutstanding, 0),
      avgOrderValueAll: reports.length
        ? reports.reduce((s, r) => s + r.avgOrderValue, 0) / reports.length
        : 0,
    };

    return { summary, reports, dateRange: dateRange || null };
  } catch (error) {
    throw new Error(
      `Failed to generate godown sales reports: ${error.message}`
    );
  }
};

/**
 * Get Customer Reports
 */
exports.getCustomerReports = async (
  filters = {},
  sortBy = "totalSpent",
  sortOrder = "desc",
  requestingUser = null,
  page = 1,
  limit = 10
) => {
  try {
    // Validate pagination parameters
    const validPage = Math.max(1, parseInt(page) || 1);
    const validLimit = Math.max(1, Math.min(100, parseInt(limit) || 10));
    
    const { dateRange, customerId, inactiveDays, godownId } = filters;

    // Build match criteria
    const matchCriteria = {
      type: "order",
      status: { $nin: ["cancelled", "rejected"] },
    };

    if (dateRange && (dateRange.startDate || dateRange.endDate)) {
      matchCriteria.orderDate = {};
      if (dateRange.startDate) {
        matchCriteria.orderDate.$gte = dateRange.startDate;
      }
      if (dateRange.endDate) {
        matchCriteria.orderDate.$lte = dateRange.endDate;
      }
    }

    if (customerId) {
      matchCriteria.customer = new mongoose.Types.ObjectId(customerId);
    }

    // Apply godown filtering
    if (godownId) {
      matchCriteria.godown = new mongoose.Types.ObjectId(godownId);
    } else if (
      requestingUser &&
      (requestingUser.primaryGodown ||
        (requestingUser.accessibleGodowns &&
          requestingUser.accessibleGodowns.length > 0))
    ) {
      // Apply user-specific godown filtering only if no specific godown is requested
      const allowedGodowns = [];

      if (requestingUser.primaryGodown) {
        allowedGodowns.push(
          requestingUser.primaryGodown._id || requestingUser.primaryGodown
        );
      }

      if (
        requestingUser.accessibleGodowns &&
        requestingUser.accessibleGodowns.length > 0
      ) {
        allowedGodowns.push(
          ...requestingUser.accessibleGodowns.map((g) => g._id || g)
        );
      }

      if (allowedGodowns.length > 0) {
        matchCriteria.godown = {
          $in: allowedGodowns.map((id) => new mongoose.Types.ObjectId(id)),
        };
      }
    }

    // Aggregate orders by customer
    const allReports = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: "$customer",
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paidAmount" },
          avgOrderValue: { $avg: "$totalAmount" },
          lastOrderDate: { $max: "$orderDate" },
          firstOrderDate: { $min: "$orderDate" },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
          },
          completedOrders: {
            $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
          },
          orderStatuses: { $push: "$status" },
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "_id",
          as: "customerInfo",
        },
      },
      {
        $unwind: "$customerInfo",
      },
      {
        $project: {
          _id: 1,
          customerId: "$customerInfo.customerId",
          businessName: "$customerInfo.businessName",
          contactPerson: "$customerInfo.contactPersonName",
          phone: "$customerInfo.phone",
          email: "$customerInfo.email",
          customerType: "$customerInfo.customerType",
          city: "$customerInfo.address.city",
          state: "$customerInfo.address.state",
          isActive: "$customerInfo.isActive",
          creditLimit: "$customerInfo.creditLimit",
          outstandingAmount: "$customerInfo.outstandingAmount",
          totalOrders: 1,
          totalSpent: { $round: ["$totalSpent", 2] },
          totalPaid: { $round: ["$totalPaid", 2] },
          totalOutstanding: {
            $round: [{ $subtract: ["$totalSpent", "$totalPaid"] }, 2],
          },
          avgOrderValue: { $round: ["$avgOrderValue", 2] },
          lastOrderDate: 1,
          firstOrderDate: 1,
          daysSinceLastOrder: {
            $round: [
              {
                $divide: [
                  { $subtract: [new Date(), "$lastOrderDate"] },
                  1000 * 60 * 60 * 24,
                ],
              },
              0,
            ],
          },
          pendingOrders: 1,
          completedOrders: 1,
          lifetimeValue: { $round: ["$totalSpent", 2] },
        },
      },
      {
        $sort: { [sortBy]: sortOrder === "desc" ? -1 : 1 },
      },
    ]);

    // Calculate summary statistics from ALL reports (before pagination)
    const summary = {
      totalCustomers: allReports.length,
      activeCustomers: allReports.filter((r) => r.daysSinceLastOrder <= 30).length,
      inactiveCustomers: inactiveDays 
        ? allReports.filter((r) => r.daysSinceLastOrder >= inactiveDays).length 
        : 0,
      totalRevenueAll: allReports.reduce((sum, r) => sum + r.totalSpent, 0),
      totalOutstandingAll: allReports.reduce(
        (sum, r) => sum + r.totalOutstanding,
        0
      ),
      avgCustomerValue:
        allReports.length > 0
          ? allReports.reduce((sum, r) => sum + r.lifetimeValue, 0) /
            allReports.length
          : 0,
    };

    // Apply pagination AFTER calculating summary
    const totalRecords = allReports.length;
    const totalPages = Math.ceil(totalRecords / validLimit);
    const skip = (validPage - 1) * validLimit;
    const reports = allReports.slice(skip, skip + validLimit);

    // Filter inactive customers if requested (from paginated results)
    let inactiveCustomers = [];
    if (inactiveDays) {
      inactiveCustomers = reports.filter(
        (r) => r.daysSinceLastOrder >= inactiveDays
      );
    }

    return {
      summary,
      reports: inactiveDays ? inactiveCustomers : reports,
      dateRange: dateRange || null,
      filters: { inactiveDays },
      pagination: {
        currentPage: validPage,
        totalPages,
        totalRecords,
        limit: validLimit,
        hasNext: validPage < totalPages,
        hasPrev: validPage > 1,
      },
    };
  } catch (error) {
    throw new Error(`Failed to generate customer reports: ${error.message}`);
  }
};

/**
 * Get Inactive Customers
 */
exports.getInactiveCustomers = async (days = 7, godownId = null, page = 1, limit = 10) => {
  try {
    // Validate pagination parameters
    const validPage = Math.max(1, parseInt(page) || 1);
    const validLimit = Math.max(1, Math.min(100, parseInt(limit) || 10));
    
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    // Build aggregation pipeline to get last order date for each customer
    const orderMatchCriteria = {
      type: "order",
      status: { $nin: ["cancelled", "rejected"] }
    };
    
    if (godownId) {
      orderMatchCriteria.godown = new mongoose.Types.ObjectId(godownId);
    }

    // Get last order info for all customers using aggregation (much faster)
    const customerLastOrders = await Order.aggregate([
      { $match: orderMatchCriteria },
      {
        $group: {
          _id: "$customer",
          lastOrderDate: { $max: "$orderDate" },
          lastOrderNumber: { $last: "$orderNumber" },
          lastOrderAmount: { $last: "$totalAmount" }
        }
      }
    ]);

    // Create a map of customer ID to last order info
    const lastOrderMap = new Map();
    customerLastOrders.forEach(item => {
      lastOrderMap.set(item._id.toString(), {
        lastOrderDate: item.lastOrderDate,
        lastOrderNumber: item.lastOrderNumber,
        lastOrderAmount: item.lastOrderAmount
      });
    });

    // Build customer filter
    const customerFilter = { isActive: true };
    
    if (godownId) {
      const godownObjectId = new mongoose.Types.ObjectId(godownId);
      
      // Get customers assigned to this godown
      const assignedCustomerIds = await Customer.find({ 
        isActive: true,
        assignedGodownId: godownObjectId
      }).distinct('_id');
      
      // Get customers who have ordered from this godown
      const customersWithOrderIds = Array.from(lastOrderMap.keys()).map(id => new mongoose.Types.ObjectId(id));
      
      // Combine both sets
      const relevantCustomerIds = new Set([
        ...assignedCustomerIds.map(id => id.toString()),
        ...customersWithOrderIds.map(id => id.toString())
      ]);
      
      customerFilter._id = { 
        $in: Array.from(relevantCustomerIds).map(id => new mongoose.Types.ObjectId(id)) 
      };
    }

    // Get all active customers
    const customers = await Customer.find(customerFilter)
      .select('customerId businessName contactPersonName phone email customerType address totalOrders totalOrderValue outstandingAmount')
      .lean();

    // Filter inactive customers and build response
    const inactiveCustomers = [];
    
    for (const customer of customers) {
      const lastOrderInfo = lastOrderMap.get(customer._id.toString());
      const lastOrderDate = lastOrderInfo?.lastOrderDate || null;
      
      // Check if customer is inactive (no orders or last order before cutoff)
      if (!lastOrderDate || lastOrderDate < cutoffDate) {
        const daysSinceLastOrder = lastOrderDate
          ? Math.floor((new Date() - lastOrderDate) / (1000 * 60 * 60 * 24))
          : null;

        inactiveCustomers.push({
          _id: customer._id,
          customerId: customer.customerId,
          businessName: customer.businessName,
          contactPerson: customer.contactPersonName,
          phone: customer.phone,
          email: customer.email || '',
          customerType: customer.customerType,
          city: customer.address?.city || '',
          state: customer.address?.state || '',
          lastOrderDate: lastOrderDate,
          lastOrderNumber: lastOrderInfo?.lastOrderNumber || null,
          lastOrderAmount: lastOrderInfo?.lastOrderAmount || 0,
          daysSinceLastOrder,
          totalOrders: customer.totalOrders || 0,
          totalOrderValue: customer.totalOrderValue || 0,
          outstandingAmount: customer.outstandingAmount || 0,
        });
      }
    }

    // Sort by days since last order (descending)
    inactiveCustomers.sort((a, b) => {
      if (a.daysSinceLastOrder === null) return 1;
      if (b.daysSinceLastOrder === null) return -1;
      return b.daysSinceLastOrder - a.daysSinceLastOrder;
    });

    // Apply pagination
    const totalRecords = inactiveCustomers.length;
    const totalPages = Math.ceil(totalRecords / validLimit);
    const skip = (validPage - 1) * validLimit;
    const paginatedCustomers = inactiveCustomers.slice(skip, skip + validLimit);

    return {
      days,
      count: totalRecords,
      customers: paginatedCustomers,
      pagination: {
        currentPage: validPage,
        totalPages,
        totalRecords,
        limit: validLimit,
        hasNext: validPage < totalPages,
        hasPrev: validPage > 1,
      },
    };
  } catch (error) {
    console.error('Error in getInactiveCustomers:', error);
    throw new Error(`Failed to get inactive customers: ${error.message}`);
  }
};


/**
 * Get Executive Performance Detail
 */
exports.getExecutivePerformanceDetail = async (userId, filters = {}) => {
  try {
    const { dateRange, type } = filters;

    // Get user info
    const user = await User.findById(userId)
      .populate("role")
      .select("-password");

    if (!user) {
      throw new Error("User not found");
    }

    // Build match criteria
    const matchCriteria = {
      createdBy: new mongoose.Types.ObjectId(userId),
      type: type || "order",
      status: { $nin: ["cancelled", "rejected"] },
    };

    if (dateRange && (dateRange.startDate || dateRange.endDate)) {
      matchCriteria.orderDate = {};
      if (dateRange.startDate) {
        matchCriteria.orderDate.$gte = dateRange.startDate;
      }
      if (dateRange.endDate) {
        matchCriteria.orderDate.$lte = dateRange.endDate;
      }
    }

    // Get orders
    const orders = await Order.find(matchCriteria)
      .populate("customer", "businessName customerId phone city")
      .sort({ orderDate: -1 })
      .limit(100);

    // Enrich recent orders with attaKg (normalized KG for all items)
    const recentOrders = orders.map((doc) => {
      const order = doc.toObject();
      const items = Array.isArray(order.items) ? order.items : [];
      let totalKg = 0;
      console.log(
        `Processing order ${order.orderNumber} with ${items.length} items`
      );

      for (const item of items) {
        const name = (item?.productName || "").toString().trim();
        const unit = (item?.unit || "").toString().trim();
        const quantity = Number(item?.quantity || 0);

        console.log(`Item: "${name}", Unit: "${unit}", Quantity: ${quantity}`);

        // Skip if no quantity
        if (quantity <= 0) {
          console.log(`Skipping item with invalid quantity: ${quantity}`);
          continue;
        }

        let kg = 0;

        // Convert to KG based on unit
        switch (unit.toUpperCase()) {
          case "KG":
            kg = quantity;
            break;
          case "QUINTAL":
            kg = quantity * 100;
            break;
          case "TON":
            kg = quantity * 1000;
            break;
          case "BAGS":
            const pack = (item?.packaging || "").toString();
            let bagKg = 0;

            // Try to extract weight from packaging string
            if (pack) {
              if (pack.includes("5kg") || pack.includes("5 kg")) bagKg = 5;
              else if (pack.includes("10kg") || pack.includes("10 kg"))
                bagKg = 10;
              else if (pack.includes("25kg") || pack.includes("25 kg"))
                bagKg = 25;
              else if (pack.includes("40kg") || pack.includes("40 kg"))
                bagKg = 40;
              else if (pack.includes("50kg") || pack.includes("50 kg"))
                bagKg = 50;
              else {
                // Try to extract number followed by kg
                const match = pack.match(/(\d+)\s*kg/i);
                if (match) bagKg = Number(match[1]);
              }
            }

            // Default bag weight if not specified (common 50kg bags for flour)
            if (bagKg === 0) {
              bagKg = 50; // Default assumption for flour bags
              console.log(
                `Using default bag weight: ${bagKg}kg for packaging: "${pack}"`
              );
            }

            kg = quantity * bagKg;
            console.log(
              `Bags calculation: ${quantity} bags × ${bagKg}kg = ${kg}kg (packaging: "${pack}")`
            );
            break;
          default:
            console.log(`Unknown unit: "${unit}", treating as KG`);
            kg = quantity; // Default to treating as KG
            break;
        }

        console.log(`Item "${name}" contributes: ${kg}kg`);
        totalKg += kg;
      }

      order.attaKg = Number(totalKg.toFixed(2));
      console.log(`Order ${order.orderNumber} total attaKg: ${order.attaKg}`);
      return order;
    });

    // Get performance metrics
    let metrics;
    if (type === "visit") {
      // Visit-specific metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get total visits today
      const todayVisitsCount = await Order.countDocuments({
        ...matchCriteria,
        orderDate: { $gte: today, $lt: tomorrow },
      });

      // Calculate unique locations and other visit metrics
      const visitMetrics = await Order.aggregate([
        { $match: matchCriteria },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            uniqueLocations: { $addToSet: "$customer" },
            totalRevenue: { $sum: { $ifNull: ["$totalAmount", 0] } },
            totalPaid: { $sum: { $ifNull: ["$paidAmount", 0] } },
            avgOrderValue: { $avg: { $ifNull: ["$totalAmount", 0] } },
            maxOrderValue: { $max: { $ifNull: ["$totalAmount", 0] } },
            minOrderValue: { $min: { $ifNull: ["$totalAmount", 0] } },
            completedVisits: {
              $sum: {
                $cond: [{ $in: ["$status", ["completed", "delivered"]] }, 1, 0],
              },
            },
            // Get date range for calculating average locations per day
            minDate: { $min: "$orderDate" },
            maxDate: { $max: "$orderDate" },
          },
        },
        {
          $addFields: {
            uniqueLocationsCount: { $size: "$uniqueLocations" },
            daysDifference: {
              $max: [
                1, // Minimum 1 day to avoid division by zero
                {
                  $ceil: {
                    $divide: [
                      { $subtract: ["$maxDate", "$minDate"] },
                      1000 * 60 * 60 * 24, // Convert milliseconds to days
                    ],
                  },
                },
              ],
            },
          },
        },
        {
          $addFields: {
            avgLocationsPerDay: {
              $round: [
                { $divide: ["$uniqueLocationsCount", "$daysDifference"] },
                2,
              ],
            },
          },
        },
      ]);

      metrics = visitMetrics[0]
        ? {
            ...visitMetrics[0],
            uniqueLocations: visitMetrics[0].uniqueLocationsCount,
            totalVisitsToday: todayVisitsCount,
            avgLocationsPerDay: visitMetrics[0].avgLocationsPerDay || 0,
          }
        : {
            totalOrders: 0,
            totalRevenue: 0,
            totalPaid: 0,
            avgOrderValue: 0,
            maxOrderValue: 0,
            minOrderValue: 0,
            uniqueLocations: 0,
            completedVisits: 0,
            totalVisitsToday: todayVisitsCount,
            avgLocationsPerDay: 0,
          };
    } else {
      // Order-specific metrics (existing logic)
      const orderMetrics = await Order.aggregate([
        { $match: matchCriteria },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: "$totalAmount" },
            totalPaid: { $sum: "$paidAmount" },
            avgOrderValue: { $avg: "$totalAmount" },
            maxOrderValue: { $max: "$totalAmount" },
            minOrderValue: { $min: "$totalAmount" },
          },
        },
      ]);

      metrics = orderMetrics[0] || {
        totalOrders: 0,
        totalRevenue: 0,
        totalPaid: 0,
        avgOrderValue: 0,
        maxOrderValue: 0,
        minOrderValue: 0,
      };
    }

    // Get monthly trend
    const monthlyTrend = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: {
            year: { $year: "$orderDate" },
            month: { $month: "$orderDate" },
          },
          orders: { $sum: 1 },
          revenue: { $sum: "$totalAmount" },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
    ]);

    // Get top customers
    const topCustomers = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: "$customer",
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" },
        },
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "_id",
          as: "customerInfo",
        },
      },
      { $unwind: "$customerInfo" },
    ]);

    // Compute total sales stats for ALL items (normalize to KG)
    const attaTotalsAgg = await Order.aggregate([
      { $match: matchCriteria },
      { $unwind: "$items" },
      {
        $addFields: {
          itemKg: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$items.unit", "KG"] },
                  then: "$items.quantity",
                },
                {
                  case: { $eq: ["$items.unit", "Quintal"] },
                  then: { $multiply: ["$items.quantity", 100] },
                },
                {
                  case: { $eq: ["$items.unit", "Ton"] },
                  then: { $multiply: ["$items.quantity", 1000] },
                },
                {
                  case: { $eq: ["$items.unit", "Bags"] },
                  then: {
                    $multiply: [
                      "$items.quantity",
                      {
                        $switch: {
                          branches: [
                            {
                              case: {
                                $regexMatch: {
                                  input: "$items.packaging",
                                  regex: /5\s*kg/i,
                                },
                              },
                              then: 5,
                            },
                            {
                              case: {
                                $regexMatch: {
                                  input: "$items.packaging",
                                  regex: /10\s*kg/i,
                                },
                              },
                              then: 10,
                            },
                            {
                              case: {
                                $regexMatch: {
                                  input: "$items.packaging",
                                  regex: /25\s*kg/i,
                                },
                              },
                              then: 25,
                            },
                            {
                              case: {
                                $regexMatch: {
                                  input: "$items.packaging",
                                  regex: /40\s*kg/i,
                                },
                              },
                              then: 40,
                            },
                            {
                              case: {
                                $regexMatch: {
                                  input: "$items.packaging",
                                  regex: /50\s*kg/i,
                                },
                              },
                              then: 50,
                            },
                          ],
                          default: 50,
                        },
                      },
                    ],
                  },
                },
              ],
              default: "$items.quantity",
            },
          },
        },
      },
      {
        $group: {
          _id: null,
          totalKg: { $sum: "$itemKg" },
          totalAmount: { $sum: "$items.totalAmount" },
        },
      },
    ]);

    const attaByGrade = await Order.aggregate([
      { $match: matchCriteria },
      { $unwind: "$items" },
      {
        $addFields: {
          itemKg: {
            $switch: {
              branches: [
                {
                  case: { $eq: ["$items.unit", "KG"] },
                  then: "$items.quantity",
                },
                {
                  case: { $eq: ["$items.unit", "Quintal"] },
                  then: { $multiply: ["$items.quantity", 100] },
                },
                {
                  case: { $eq: ["$items.unit", "Ton"] },
                  then: { $multiply: ["$items.quantity", 1000] },
                },
                {
                  case: { $eq: ["$items.unit", "Bags"] },
                  then: {
                    $multiply: [
                      "$items.quantity",
                      {
                        $switch: {
                          branches: [
                            {
                              case: {
                                $regexMatch: {
                                  input: "$items.packaging",
                                  regex: /5\s*kg/i,
                                },
                              },
                              then: 5,
                            },
                            {
                              case: {
                                $regexMatch: {
                                  input: "$items.packaging",
                                  regex: /10\s*kg/i,
                                },
                              },
                              then: 10,
                            },
                            {
                              case: {
                                $regexMatch: {
                                  input: "$items.packaging",
                                  regex: /25\s*kg/i,
                                },
                              },
                              then: 25,
                            },
                            {
                              case: {
                                $regexMatch: {
                                  input: "$items.packaging",
                                  regex: /40\s*kg/i,
                                },
                              },
                              then: 40,
                            },
                            {
                              case: {
                                $regexMatch: {
                                  input: "$items.packaging",
                                  regex: /50\s*kg/i,
                                },
                              },
                              then: 50,
                            },
                          ],
                          default: 50,
                        },
                      },
                    ],
                  },
                },
              ],
              default: "$items.quantity",
            },
          },
        },
      },
      {
        $group: {
          _id: "$items.grade",
          kg: { $sum: "$itemKg" },
          amount: { $sum: "$items.totalAmount" },
        },
      },
      {
        $project: {
          _id: 0,
          grade: "$_id",
          kg: { $round: ["$kg", 2] },
          amount: { $round: ["$amount", 2] },
          avgPricePerKg: {
            $cond: [
              { $gt: ["$kg", 0] },
              { $round: [{ $divide: ["$amount", "$kg"] }, 2] },
              0,
            ],
          },
        },
      },
      { $sort: { amount: -1 } },
    ]);

    return {
      executive: {
        _id: user._id,
        name: `${user.firstName} ${user.lastName}`,
        employeeId: user.employeeId,
        email: user.email,
        phone: user.phone,
        department: user.department,
        position: user.position,
        role: user.role?.name,
      },
      metrics,
      monthlyTrend,
      topCustomers,
      recentOrders,
      attaSummary: {
        totalKg: attaTotalsAgg[0]?.totalKg || 0,
        totalAmount: attaTotalsAgg[0]?.totalAmount || 0,
        avgPricePerKg:
          attaTotalsAgg[0] && attaTotalsAgg[0].totalKg > 0
            ? Number(
                (
                  (attaTotalsAgg[0].totalAmount || 0) / attaTotalsAgg[0].totalKg
                ).toFixed(2)
              )
            : 0,
        byGrade: attaByGrade,
      },
    };
  } catch (error) {
    throw new Error(
      `Failed to get executive performance detail: ${error.message}`
    );
  }
};

/**
 * Get Customer Purchase Detail
 */
exports.getCustomerPurchaseDetail = async (customerId, filters = {}) => {
  try {
    const { dateRange } = filters;

    // Get customer info
    const customer = await Customer.findById(customerId);

    if (!customer) {
      throw new Error("Customer not found");
    }

    // Build match criteria
    const matchCriteria = {
      customer: new mongoose.Types.ObjectId(customerId),
      type: "order",
      status: { $nin: ["cancelled", "rejected"] },
    };

    if (dateRange && (dateRange.startDate || dateRange.endDate)) {
      matchCriteria.orderDate = {};
      if (dateRange.startDate) {
        matchCriteria.orderDate.$gte = dateRange.startDate;
      }
      if (dateRange.endDate) {
        matchCriteria.orderDate.$lte = dateRange.endDate;
      }
    }

    // Get orders
    const orders = await Order.find(matchCriteria)
      .populate("createdBy", "firstName lastName employeeId")
      .sort({ orderDate: -1 })
      .limit(100);

    // Get purchase metrics
    const metrics = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$paidAmount" },
          avgOrderValue: { $avg: "$totalAmount" },
          maxOrderValue: { $max: "$totalAmount" },
          minOrderValue: { $min: "$totalAmount" },
        },
      },
    ]);

    // Get product insights
    const productInsights = await Order.aggregate([
      { $match: matchCriteria },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productName",
          totalQuantity: { $sum: "$items.quantity" },
          totalAmount: { $sum: "$items.totalAmount" },
          orderCount: { $sum: 1 },
        },
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 10 },
    ]);

    // Get monthly trend
    const monthlyTrend = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: {
            year: { $year: "$orderDate" },
            month: { $month: "$orderDate" },
          },
          orders: { $sum: 1 },
          spent: { $sum: "$totalAmount" },
        },
      },
      { $sort: { "_id.year": -1, "_id.month": -1 } },
      { $limit: 12 },
    ]);

    // Calculate days since last order
    const lastOrder = orders[0];
    const daysSinceLastOrder = lastOrder
      ? Math.floor(
          (new Date() - new Date(lastOrder.orderDate)) / (1000 * 60 * 60 * 24)
        )
      : null;

    return {
      customer: {
        _id: customer._id,
        customerId: customer.customerId,
        businessName: customer.businessName,
        contactPerson: customer.contactPersonName,
        phone: customer.phone,
        email: customer.email,
        customerType: customer.customerType,
        address: customer.address,
        creditLimit: customer.creditLimit,
        outstandingAmount: customer.outstandingAmount,
        isActive: customer.isActive,
        totalOrders: customer.totalOrders,
        totalOrderValue: customer.totalOrderValue,
      },
      metrics: metrics[0] || {
        totalOrders: 0,
        totalSpent: 0,
        totalPaid: 0,
        avgOrderValue: 0,
        maxOrderValue: 0,
        minOrderValue: 0,
      },
      daysSinceLastOrder,
      productInsights,
      monthlyTrend,
      recentOrders,
    };
  } catch (error) {
    throw new Error(`Failed to get customer purchase detail: ${error.message}`);
  }
};

/**
 * Helper function to get date-wise order breakdown
 */
const getDateWiseOrderBreakdown = async (filters, requestingUser) => {
  const Order = require("../models/order.schema");
  const { dateRange, userId, department, godownId, roleIds = [], type } = filters;

  // Build match conditions
  const matchConditions = {};

  if (type) {
    matchConditions.type = type;
  }

  if (dateRange) {
    matchConditions.orderDate = {};
    if (dateRange.startDate) matchConditions.orderDate.$gte = new Date(dateRange.startDate);
    if (dateRange.endDate) matchConditions.orderDate.$lte = new Date(dateRange.endDate);
  }

  if (userId) {
    matchConditions.createdBy = new mongoose.Types.ObjectId(userId);
  }

  if (godownId) {
    matchConditions.godown = new mongoose.Types.ObjectId(godownId);
  }

  // Handle godown access filter
  if (requestingUser && (requestingUser.primaryGodown || requestingUser.accessibleGodowns?.length > 0)) {
    const allowedGodowns = [
      ...(requestingUser.primaryGodown ? [requestingUser.primaryGodown._id || requestingUser.primaryGodown] : []),
      ...(requestingUser.accessibleGodowns?.map((g) => g._id || g) || []),
    ];
    if (allowedGodowns.length > 0 && !godownId) {
      matchConditions.godown = { $in: allowedGodowns.map((id) => new mongoose.Types.ObjectId(id)) };
    }
  }

  const pipeline = [
    { $match: matchConditions },
    {
      $lookup: {
        from: "users",
        localField: "createdBy",
        foreignField: "_id",
        as: "creator",
      },
    },
    { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },

    // Combine firstName and lastName into fullName
    {
      $addFields: {
        "creator.fullName": {
          $trim: {
            input: {
              $concat: [
                { $ifNull: ["$creator.firstName", ""] },
                " ",
                { $ifNull: ["$creator.lastName", ""] },
              ],
            },
          },
        },
      },
    },
  ];

  // Filter by department if specified
  if (department) {
    pipeline.push({ $match: { "creator.department": department } });
  }

  // Lookup role data before filtering
  pipeline.push(
    {
      $lookup: {
        from: "roles",
        localField: "creator.role",
        foreignField: "_id",
        as: "creatorRoleData",
      },
    },
    {
      $unwind: {
        path: "$creatorRoleData",
        preserveNullAndEmptyArrays: true,
      },
    }
  );

  // Filter by roles - if roleIds provided, use them; otherwise default to Manager or Sales Executive
  if (roleIds.length > 0) {
    pipeline.push({
      $match: {
        "creator.role": { $in: roleIds }, // roleIds are already ObjectIds from controller
      },
    });
  } else {
    pipeline.push({
      $match: {
        $or: [
          { "creatorRoleData.name": "Sales Executive" },
          { "creatorRoleData.name": "Manager" },
        ],
      },
    });
  }

  // Group by date and executive
  pipeline.push(
    {
      $group: {
        _id: {
          date: { $dateToString: { format: "%Y-%m-%d", date: "$orderDate" } },
          executiveId: "$createdBy",
          executiveName: "$creator.fullName", // use combined fullName
          employeeId: "$creator.employeeId",
          department: "$creator.department",
          position: "$creator.position",
        },
        orderCount: { $sum: 1 },
        totalRevenue: { $sum: "$totalAmount" },
        roleName: { $first: "$creatorRoleData.name" }, // Use already fetched role name
      },
    },
    {
      $project: {
        _id: 1,
        orderCount: 1,
        totalRevenue: 1,
        roleName: { $ifNull: ["$roleName", "N/A"] },
      },
    },
    {
      $sort: { "_id.date": 1, "_id.executiveName": 1 },
    }
  );

  const results = await Order.aggregate(pipeline);
  return results;
};

/**
 * Helper function to get month-wise order breakdown
 */
const getMonthWiseOrderBreakdown = async (filters, requestingUser) => {
  const Order = require("../models/order.schema");
  const { dateRange, userId, department, godownId, roleIds = [], type } = filters;

  // Build match conditions
  const matchConditions = {};
  
  if (type) {
    matchConditions.type = type;
  }
  
  if (dateRange) {
    matchConditions.orderDate = {};
    if (dateRange.startDate) matchConditions.orderDate.$gte = dateRange.startDate;
    if (dateRange.endDate) matchConditions.orderDate.$lte = dateRange.endDate;
  }

  if (userId) {
    matchConditions.createdBy = new mongoose.Types.ObjectId(userId);
  }

  if (godownId) {
    matchConditions.godown = new mongoose.Types.ObjectId(godownId);
  }

  // Handle godown access filter
  if (requestingUser && (requestingUser.primaryGodown || requestingUser.accessibleGodowns?.length > 0)) {
    const allowedGodowns = [
      ...(requestingUser.primaryGodown ? [requestingUser.primaryGodown._id || requestingUser.primaryGodown] : []),
      ...(requestingUser.accessibleGodowns?.map((g) => g._id || g) || []),
    ];
    if (allowedGodowns.length > 0 && !godownId) {
      matchConditions.godown = { $in: allowedGodowns.map((id) => new mongoose.Types.ObjectId(id)) };
    }
  }

  const pipeline = [
    { $match: matchConditions },
    {
      $lookup: {
        from: "users",
        localField: "createdBy",
        foreignField: "_id",
        as: "creator",
      },
    },
    { $unwind: { path: "$creator", preserveNullAndEmptyArrays: true } },
     // Combine firstName and lastName into fullName
    {
      $addFields: {
        "creator.fullName": {
          $trim: {
            input: {
              $concat: [
                { $ifNull: ["$creator.firstName", ""] },
                " ",
                { $ifNull: ["$creator.lastName", ""] },
              ],
            },
          },
        },
      },
    },
  ];

  // Filter by department if specified
  if (department) {
    pipeline.push({ $match: { "creator.department": department } });
  }

  // Lookup role data before filtering
  pipeline.push(
    {
      $lookup: {
        from: "roles",
        localField: "creator.role",
        foreignField: "_id",
        as: "creatorRoleData",
      },
    },
    {
      $unwind: {
        path: "$creatorRoleData",
        preserveNullAndEmptyArrays: true,
      },
    }
  );

  // Filter by roles - if roleIds provided, use them; otherwise default to Manager or Sales Executive
  if (roleIds.length > 0) {
    pipeline.push({
      $match: {
        "creator.role": { $in: roleIds }, // roleIds are already ObjectIds from controller
      },
    });
  } else {
    pipeline.push({
      $match: {
        $or: [
          { "creatorRoleData.name": "Sales Executive" },
          { "creatorRoleData.name": "Manager" },
        ],
      },
    });
  }

  // Group by month and executive
  pipeline.push(
    {
      $group: {
        _id: {
          month: { $dateToString: { format: "%Y-%m", date: "$orderDate" } },
          executiveId: "$createdBy",
          executiveName: "$creator.fullName",
          employeeId: "$creator.employeeId",
          department: "$creator.department",
          position: "$creator.position",
        },
        orderCount: { $sum: 1 },
        totalRevenue: { $sum: "$totalAmount" },
        roleName: { $first: "$creatorRoleData.name" }, // Use already fetched role name
      },
    },
    {
      $project: {
        _id: 1,
        orderCount: 1,
        totalRevenue: 1,
        roleName: { $ifNull: ["$roleName", "N/A"] },
      },
    },
    {
      $sort: { "_id.month": 1, "_id.executiveName": 1 },
    }
  );

  const results = await Order.aggregate(pipeline);
  return results;
};

/**
 * Generate Excel file for Sales Executive Reports with date-wise and month-wise breakdowns
 */
exports.generateSalesExecutiveExcel = async (
  filters = {},
  sortBy = "totalRevenue",
  sortOrder = "desc",
  requestingUser = null,
  type = "order"
) => {
  try {
    const ExcelJS = require("exceljs");

    // Get the report data
    const reportData = await exports.getSalesExecutiveReports(
      filters,
      sortBy,
      sortOrder,
      requestingUser
    );
    // Get date-wise and month-wise breakdowns
    const dateWiseData = await getDateWiseOrderBreakdown(filters, requestingUser);
    const monthWiseData = await getMonthWiseOrderBreakdown(filters, requestingUser);

    const workbook = new ExcelJS.Workbook();

    // ========== SHEET 1: Summary Report ==========
    const summarySheet = workbook.addWorksheet("Summary");

    // Define columns based on report type
    if (type === "visit") {
      summarySheet.columns = [
        { header: "Employee ID", key: "employeeId", width: 15 },
        { header: "Name", key: "executiveName", width: 25 },
        { header: "Department", key: "department", width: 15 },
        { header: "Position", key: "position", width: 20 },
        { header: "Role", key: "roleName", width: 20 },
        { header: "Total Visits", key: "totalOrders", width: 15 },
        { header: "Unique Locations", key: "uniqueCustomersCount", width: 18 },
      ];
    } else {
      summarySheet.columns = [
        { header: "Employee ID", key: "employeeId", width: 15 },
        { header: "Name", key: "executiveName", width: 25 },
        { header: "Department", key: "department", width: 15 },
        { header: "Position", key: "position", width: 20 },
        { header: "Role", key: "roleName", width: 20 },
        { header: "Total Orders", key: "totalOrders", width: 15 },
        { header: "Total Revenue", key: "totalRevenue", width: 18 },
        { header: "Total Paid", key: "totalPaidAmount", width: 15 },
        { header: "Outstanding", key: "totalOutstanding", width: 15 },
        { header: "Avg Order Value", key: "avgOrderValue", width: 18 },
        { header: "Unique Customers", key: "uniqueCustomersCount", width: 18 },
        { header: "Conversion Rate", key: "conversionRate", width: 18 },
        { header: "Pending", key: "pendingOrders", width: 12 },
        { header: "Approved", key: "approvedOrders", width: 12 },
        { header: "Delivered", key: "deliveredOrders", width: 12 },
        { header: "Completed", key: "completedOrders", width: 12 },
      ];
    }

    // Style the header row
    summarySheet.getRow(1).font = { bold: true, size: 12 };
    summarySheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF4472C4" },
    };
    summarySheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    summarySheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

    // Add data rows
    if (reportData.reports && reportData.reports.length > 0) {
      reportData.reports.forEach((report) => {
        const row = {
          employeeId: report.employeeId || "",
          executiveName: report.executiveName || "",
          department: report.department || "",
          position: report.position || "",
          roleName: report.roleName || "",
          totalOrders: report.totalOrders || 0,
          uniqueCustomersCount: report.uniqueCustomersCount || 0,
        };

        if (type !== "visit") {
          row.totalRevenue = report.totalRevenue || 0;
          row.totalPaidAmount = report.totalPaidAmount || 0;
          row.totalOutstanding = report.totalOutstanding || 0;
          row.avgOrderValue = report.avgOrderValue || 0;
          row.conversionRate = `${report.conversionRate || 0}%`;
          row.pendingOrders = report.pendingOrders || 0;
          row.approvedOrders = report.approvedOrders || 0;
          row.deliveredOrders = report.deliveredOrders || 0;
          row.completedOrders = report.completedOrders || 0;
        }

        summarySheet.addRow(row);
      });

      // Format currency columns for orders report
      if (type !== "visit") {
        summarySheet.getColumn("totalRevenue").numFmt = '₹#,##0.00';
        summarySheet.getColumn("totalPaidAmount").numFmt = '₹#,##0.00';
        summarySheet.getColumn("totalOutstanding").numFmt = '₹#,##0.00';
        summarySheet.getColumn("avgOrderValue").numFmt = '₹#,##0.00';
      }

      // Add borders to all cells
      summarySheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        });
      });

      // Add auto-filter to summary sheet
      if (reportData.reports.length > 0) {
        summarySheet.autoFilter = {
          from: { row: 1, column: 1 },
          to: { row: 1, column: summarySheet.columnCount },
        };
      }

      // Add summary row at the bottom for orders report
      if (type !== "visit" && reportData.summary) {
        const summaryRowNumber = summarySheet.rowCount + 2;
        summarySheet.getCell(`A${summaryRowNumber}`).value = "SUMMARY";
        summarySheet.getCell(`A${summaryRowNumber}`).font = { bold: true, size: 12 };
        summarySheet.getCell(`A${summaryRowNumber}`).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFE7E6E6" },
        };

        summarySheet.getCell(`F${summaryRowNumber}`).value = reportData.summary.totalOrdersAll || 0;
        summarySheet.getCell(`G${summaryRowNumber}`).value = reportData.summary.totalRevenueAll || 0;
        summarySheet.getCell(`G${summaryRowNumber}`).numFmt = '₹#,##0.00';
        summarySheet.getCell(`J${summaryRowNumber}`).value = reportData.summary.avgOrderValueAll || 0;
        summarySheet.getCell(`J${summaryRowNumber}`).numFmt = '₹#,##0.00';

        // Style summary row
        for (let col = 1; col <= summarySheet.columnCount; col++) {
          const cell = summarySheet.getCell(summaryRowNumber, col);
          cell.font = { bold: true };
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: "FFE7E6E6" },
          };
          cell.border = {
            top: { style: "thin" },
            left: { style: "thin" },
            bottom: { style: "thin" },
            right: { style: "thin" },
          };
        }
      }
    }

    // ========== SHEET 2: Date-wise Breakdown ==========
    const dateWiseSheet = workbook.addWorksheet("Date-wise Breakdown");
    
    // Define columns based on report type
    const dateWiseColumns = [
      { header: "Date", key: "date", width: 15 },
      { header: "Employee ID", key: "employeeId", width: 15 },
      { header: "Sales Executive", key: "executiveName", width: 25 },
      { header: "Department", key: "department", width: 15 },
      { header: "Position", key: "position", width: 20 },
      { header: "Role", key: "roleName", width: 20 },
      { header: type === "visit" ? "Visit Count" : "Order Count", key: "orderCount", width: 15 },
    ];

    if (type !== "visit") {
      dateWiseColumns.push({ header: "Total Revenue", key: "totalRevenue", width: 18 });
    }

    dateWiseSheet.columns = dateWiseColumns;

    // Style header
    dateWiseSheet.getRow(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    dateWiseSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF70AD47" },
    };
    dateWiseSheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

    // Add date-wise data
    dateWiseData.forEach((item) => {
      const row = {
        date: item._id.date,
        employeeId: item._id.employeeId || "",
        executiveName: item._id.executiveName || "Unknown",
        department: item._id.department || "",
        position: item._id.position || "",
        roleName: item.roleName || "N/A",
        orderCount: item.orderCount,
      };
      if (type !== "visit") {
        row.totalRevenue = item.totalRevenue || 0;
      }
      dateWiseSheet.addRow(row);
    });

    // Format currency column
    if (type !== "visit") {
      dateWiseSheet.getColumn("totalRevenue").numFmt = '₹#,##0.00';
    }

    // Add borders
    dateWiseSheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    // Add auto-filter to date-wise sheet
    if (dateWiseData.length > 0) {
      dateWiseSheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: dateWiseSheet.columnCount },
      };
    }

    // ========== SHEET 3: Month-wise Breakdown ==========
    const monthWiseSheet = workbook.addWorksheet("Month-wise Breakdown");
    
    // Define columns based on report type
    const monthWiseColumns = [
      { header: "Month", key: "month", width: 15 },
      { header: "Employee ID", key: "employeeId", width: 15 },
      { header: "Sales Executive", key: "executiveName", width: 25 },
      { header: "Department", key: "department", width: 15 },
      { header: "Position", key: "position", width: 20 },
      { header: "Role", key: "roleName", width: 20 },
      { header: type === "visit" ? "Visit Count" : "Order Count", key: "orderCount", width: 15 },
    ];

    if (type !== "visit") {
      monthWiseColumns.push({ header: "Total Revenue", key: "totalRevenue", width: 18 });
    }

    monthWiseSheet.columns = monthWiseColumns;

    // Style header
    monthWiseSheet.getRow(1).font = { bold: true, size: 12, color: { argb: "FFFFFFFF" } };
    monthWiseSheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFFFC000" },
    };
    monthWiseSheet.getRow(1).alignment = { vertical: "middle", horizontal: "center" };

    // Add month-wise data
    monthWiseData.forEach((item) => {
      const row = {
        month: item._id.month,
        employeeId: item._id.employeeId || "",
        executiveName: item._id.executiveName || "Unknown",
        department: item._id.department || "",
        position: item._id.position || "",
        roleName: item.roleName || "N/A",
        orderCount: item.orderCount,
      };
      if (type !== "visit") {
        row.totalRevenue = item.totalRevenue || 0;
      }
      monthWiseSheet.addRow(row);
    });

    // Format currency column
    if (type !== "visit") {
      monthWiseSheet.getColumn("totalRevenue").numFmt = '₹#,##0.00';
    }

    // Add borders
    monthWiseSheet.eachRow((row) => {
      row.eachCell((cell) => {
        cell.border = {
          top: { style: "thin" },
          left: { style: "thin" },
          bottom: { style: "thin" },
          right: { style: "thin" },
        };
      });
    });

    // Add auto-filter to month-wise sheet
    if (monthWiseData.length > 0) {
      monthWiseSheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: 1, column: monthWiseSheet.columnCount },
      };
    }

    // Generate buffer
    const buffer = await workbook.xlsx.writeBuffer();
    return buffer;
  } catch (error) {
    throw new Error(`Failed to generate Excel file: ${error.message}`);
  }
};
