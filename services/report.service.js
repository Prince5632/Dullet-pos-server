const User = require('../models/user.schema');
const Customer = require('../models/customer.schema');
const Order = require('../models/order.schema');
const mongoose = require('mongoose');

/**
 * Get Sales Executive Reports
 */
exports.getSalesExecutiveReports = async (filters = {}, sortBy = 'totalRevenue', sortOrder = 'desc', requestingUser = null) => {
  try {
    const { dateRange, userId, department, godownId, type } = filters;

    // Match base user filters
    const userMatch = {};
    if (userId) userMatch._id = new mongoose.Types.ObjectId(userId);
    if (department) userMatch.department = department;

    // Handle godown access logic
    let godownAccessFilter = {};
    if (requestingUser && (requestingUser.primaryGodown || (requestingUser.accessibleGodowns?.length > 0))) {
      const allowedGodowns = [
        ...(requestingUser.primaryGodown ? [requestingUser.primaryGodown._id || requestingUser.primaryGodown] : []),
        ...(requestingUser.accessibleGodowns?.map(g => g._id || g) || [])
      ];
      if (allowedGodowns.length > 0) {
        godownAccessFilter.godown = { $in: allowedGodowns.map(id => new mongoose.Types.ObjectId(id)) };
      }
    }

    if (godownId) {
      const specificGodown = new mongoose.Types.ObjectId(godownId);
      if (godownAccessFilter.godown) {
        const isAllowed = godownAccessFilter.godown.$in.some(id => id.equals(specificGodown));
        if (!isAllowed) {
          return {
            summary: {
              totalSalesExecutives: 0,
              totalOrdersAll: 0,
              totalRevenueAll: 0,
              totalOutstandingAll: 0,
              avgOrderValueAll: 0
            },
            reports: [],
            dateRange: dateRange || null
          };
        }
      }
      godownAccessFilter.godown = specificGodown;
    }

    const reports = await User.aggregate([
      { $match: userMatch },

      // ✅ Include role info
      {
        $lookup: {
          from: "roles",
          localField: "role",
          foreignField: "_id",
          as: "roleData"
        }
      },
      {
        $unwind: {
          path: "$roleData",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: {
          "roleData.name": "Sales Executive"
        }
      },

      // ✅ Lookup their orders (even if none)
      {
        $lookup: {
          from: 'orders',
          let: { userId: '$_id' },
          pipeline: [
            {
              $match: {
                $expr: { $eq: ['$createdBy', '$$userId'] },
                type: type || 'order',
                status: { $nin: ['cancelled', 'rejected'] },
                ...(Object.keys(godownAccessFilter).length > 0 ? godownAccessFilter : {})
              }
            },
            ...(dateRange && (dateRange.startDate || dateRange.endDate)
              ? [{
                  $match: {
                    orderDate: {
                      ...(dateRange.startDate ? { $gte: new Date(dateRange.startDate) } : {}),
                      ...(dateRange.endDate ? { $lte: new Date(dateRange.endDate + 'T23:59:59.999Z') } : {})
                    }
                  }
                }]
              : []),
          ],
          as: 'orders'
        }
      },

      // ✅ Compute all required stats
      {
        $addFields: {
          totalOrders: { $size: { $ifNull: ['$orders', []] } },
          totalRevenue: { $sum: '$orders.totalAmount' },
          totalPaidAmount: { $sum: '$orders.paidAmount' },
          totalOutstanding: {
            $subtract: [
              { $ifNull: [{ $sum: '$orders.totalAmount' }, 0] },
              { $ifNull: [{ $sum: '$orders.paidAmount' }, 0] }
            ]
          },
          avgOrderValue: {
            $cond: [
              { $gt: [{ $size: '$orders' }, 0] },
              { $avg: '$orders.totalAmount' },
              0
            ]
          },
          pendingOrders: {
            $size: {
              $filter: { input: '$orders', as: 'o', cond: { $eq: ['$$o.status', 'pending'] } }
            }
          },
          approvedOrders: {
            $size: {
              $filter: { input: '$orders', as: 'o', cond: { $eq: ['$$o.status', 'approved'] } }
            }
          },
          deliveredOrders: {
            $size: {
              $filter: { input: '$orders', as: 'o', cond: { $eq: ['$$o.status', 'delivered'] } }
            }
          },
          completedOrders: {
            $size: {
              $filter: { input: '$orders', as: 'o', cond: { $eq: ['$$o.status', 'completed'] } }
            }
          },
          uniqueCustomersCount: {
            $size: {
              $setUnion: {
                $map: { input: '$orders', as: 'order', in: '$$order.customer' }
              }
            }
          },
          conversionRate: {
            $round: [
              {
                $multiply: [
                  {
                    $cond: [
                      { $eq: [{ $size: '$orders' }, 0] },
                      0,
                      {
                        $divide: [
                          {
                            $size: {
                              $filter: { input: '$orders', as: 'o', cond: { $eq: ['$$o.status', 'completed'] } }
                            }
                          },
                          { $size: '$orders' }
                        ]
                      }
                    ]
                  },
                  100
                ]
              },
              2
            ]
          }
        }
      },

      {
        $project: {
          _id: 1,
          executiveName: { $concat: ['$firstName', ' ', '$lastName'] },
          employeeId: 1,
          email: 1,
          phone: 1,
          department: 1,
          position: 1,
          totalOrders: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          totalPaidAmount: { $round: ['$totalPaidAmount', 2] },
          totalOutstanding: { $round: ['$totalOutstanding', 2] },
          avgOrderValue: { $round: ['$avgOrderValue', 2] },
          pendingOrders: 1,
          approvedOrders: 1,
          deliveredOrders: 1,
          completedOrders: 1,
          uniqueCustomersCount: 1,
          conversionRate: 1
        }
      },

      { $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 } }
    ]);

    const summary = {
      totalExecutives: reports.length,
      totalOrdersAll: reports.reduce((sum, r) => sum + (r.totalOrders || 0), 0),
      totalRevenueAll: reports.reduce((sum, r) => sum + (r.totalRevenue || 0), 0),
      totalOutstandingAll: reports.reduce((sum, r) => sum + (r.totalOutstanding || 0), 0),
      avgOrderValueAll: reports.length > 0
        ? reports.reduce((sum, r) => sum + (r.avgOrderValue || 0), 0) / reports.length
        : 0
    };

    return { summary, reports, dateRange: dateRange || null };
  } catch (error) {
    throw new Error(`Failed to generate sales executive reports: ${error.message}`);
  }
};


/**
 * Get Godown-wise Sales Reports
 */
exports.getGodownSalesReports = async (filters = {}, sortBy = 'totalRevenue', sortOrder = 'desc', requestingUser = null) => {
  try {
    const { dateRange } = filters;

    const matchCriteria = { type: 'order', status: { $nin: ['cancelled', 'rejected'] } };

    if (dateRange && (dateRange.startDate || dateRange.endDate)) {
      matchCriteria.orderDate = {};
      if (dateRange.startDate) {
        matchCriteria.orderDate.$gte = new Date(dateRange.startDate);
      }
      if (dateRange.endDate) {
        const endDate = new Date(dateRange.endDate);
        endDate.setHours(23, 59, 59, 999);
        matchCriteria.orderDate.$lte = endDate;
      }
    }

    // Apply user-specific godown filtering
    if (requestingUser && (requestingUser.primaryGodown || (requestingUser.accessibleGodowns && requestingUser.accessibleGodowns.length > 0))) {
      const allowedGodowns = [];
      
      if (requestingUser.primaryGodown) {
        allowedGodowns.push(requestingUser.primaryGodown._id || requestingUser.primaryGodown);
      }
      
      if (requestingUser.accessibleGodowns && requestingUser.accessibleGodowns.length > 0) {
        allowedGodowns.push(...requestingUser.accessibleGodowns.map(g => g._id || g));
      }
      
      if (allowedGodowns.length > 0) {
        matchCriteria.godown = { $in: allowedGodowns.map(id => new mongoose.Types.ObjectId(id)) };
      }
    }

    const reports = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: '$godown',
          totalOrders: { $sum: 1 },
          totalRevenue: { $sum: '$totalAmount' },
          totalPaid: { $sum: '$paidAmount' },
          avgOrderValue: { $avg: '$totalAmount' }
        }
      },
      {
        $lookup: {
          from: 'godowns',
          localField: '_id',
          foreignField: '_id',
          as: 'godownInfo'
        }
      },
      { $unwind: { path: '$godownInfo', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          godownName: '$godownInfo.name',
          location: '$godownInfo.location',
          totalOrders: 1,
          totalRevenue: { $round: ['$totalRevenue', 2] },
          totalPaid: { $round: ['$totalPaid', 2] },
          totalOutstanding: { $round: [{ $subtract: ['$totalRevenue', '$totalPaid'] }, 2] },
          avgOrderValue: { $round: ['$avgOrderValue', 2] }
        }
      },
      { $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 } }
    ]);

    const summary = {
      totalGodowns: reports.length,
      totalOrdersAll: reports.reduce((s, r) => s + r.totalOrders, 0),
      totalRevenueAll: reports.reduce((s, r) => s + r.totalRevenue, 0),
      totalOutstandingAll: reports.reduce((s, r) => s + r.totalOutstanding, 0),
      avgOrderValueAll: reports.length ? reports.reduce((s, r) => s + r.avgOrderValue, 0) / reports.length : 0
    };

    return { summary, reports, dateRange: dateRange || null };
  } catch (error) {
    throw new Error(`Failed to generate godown sales reports: ${error.message}`);
  }
};

/**
 * Get Customer Reports
 */
exports.getCustomerReports = async (filters = {}, sortBy = 'totalSpent', sortOrder = 'desc', requestingUser = null) => {
  try {
    const { dateRange, customerId, inactiveDays } = filters;

    // Build match criteria
    const matchCriteria = { type: 'order', status: { $nin: ['cancelled', 'rejected'] } };
    
    if (dateRange && (dateRange.startDate || dateRange.endDate)) {
      matchCriteria.orderDate = {};
      if (dateRange.startDate) {
        matchCriteria.orderDate.$gte = new Date(dateRange.startDate);
      }
      if (dateRange.endDate) {
        const endDate = new Date(dateRange.endDate);
        endDate.setHours(23, 59, 59, 999);
        matchCriteria.orderDate.$lte = endDate;
      }
    }

    if (customerId) {
      matchCriteria.customer = new mongoose.Types.ObjectId(customerId);
    }

    // Apply user-specific godown filtering
    if (requestingUser && (requestingUser.primaryGodown || (requestingUser.accessibleGodowns && requestingUser.accessibleGodowns.length > 0))) {
      const allowedGodowns = [];
      
      if (requestingUser.primaryGodown) {
        allowedGodowns.push(requestingUser.primaryGodown._id || requestingUser.primaryGodown);
      }
      
      if (requestingUser.accessibleGodowns && requestingUser.accessibleGodowns.length > 0) {
        allowedGodowns.push(...requestingUser.accessibleGodowns.map(g => g._id || g));
      }
      
      if (allowedGodowns.length > 0) {
        matchCriteria.godown = { $in: allowedGodowns.map(id => new mongoose.Types.ObjectId(id)) };
      }
    }

    // Aggregate orders by customer
    const reports = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: '$customer',
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$totalAmount' },
          totalPaid: { $sum: '$paidAmount' },
          avgOrderValue: { $avg: '$totalAmount' },
          lastOrderDate: { $max: '$orderDate' },
          firstOrderDate: { $min: '$orderDate' },
          pendingOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
          },
          completedOrders: {
            $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
          },
          orderStatuses: { $push: '$status' }
        }
      },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customerInfo'
        }
      },
      {
        $unwind: '$customerInfo'
      },
      {
        $project: {
          _id: 1,
          customerId: '$customerInfo.customerId',
          businessName: '$customerInfo.businessName',
          contactPerson: '$customerInfo.contactPersonName',
          phone: '$customerInfo.phone',
          email: '$customerInfo.email',
          customerType: '$customerInfo.customerType',
          city: '$customerInfo.address.city',
          state: '$customerInfo.address.state',
          isActive: '$customerInfo.isActive',
          creditLimit: '$customerInfo.creditLimit',
          outstandingAmount: '$customerInfo.outstandingAmount',
          totalOrders: 1,
          totalSpent: { $round: ['$totalSpent', 2] },
          totalPaid: { $round: ['$totalPaid', 2] },
          totalOutstanding: {
            $round: [{ $subtract: ['$totalSpent', '$totalPaid'] }, 2]
          },
          avgOrderValue: { $round: ['$avgOrderValue', 2] },
          lastOrderDate: 1,
          firstOrderDate: 1,
          daysSinceLastOrder: {
            $round: [
              {
                $divide: [
                  { $subtract: [new Date(), '$lastOrderDate'] },
                  1000 * 60 * 60 * 24
                ]
              },
              0
            ]
          },
          pendingOrders: 1,
          completedOrders: 1,
          lifetimeValue: { $round: ['$totalSpent', 2] }
        }
      },
      {
        $sort: { [sortBy]: sortOrder === 'desc' ? -1 : 1 }
      }
    ]);

    // Filter inactive customers if requested
    let inactiveCustomers = [];
    if (inactiveDays) {
      inactiveCustomers = reports.filter(r => r.daysSinceLastOrder >= inactiveDays);
    }

    // Calculate summary statistics
    const summary = {
      totalCustomers: reports.length,
      activeCustomers: reports.filter(r => r.daysSinceLastOrder <= 30).length,
      inactiveCustomers: inactiveDays ? inactiveCustomers.length : 0,
      totalRevenueAll: reports.reduce((sum, r) => sum + r.totalSpent, 0),
      totalOutstandingAll: reports.reduce((sum, r) => sum + r.totalOutstanding, 0),
      avgCustomerValue: reports.length > 0 
        ? reports.reduce((sum, r) => sum + r.lifetimeValue, 0) / reports.length 
        : 0
    };

    return {
      summary,
      reports: inactiveDays ? inactiveCustomers : reports,
      dateRange: dateRange || null,
      filters: { inactiveDays }
    };
  } catch (error) {
    throw new Error(`Failed to generate customer reports: ${error.message}`);
  }
};

/**
 * Get Inactive Customers
 */
exports.getInactiveCustomers = async (days = 7) => {
  try {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const customers = await Customer.find({ isActive: true });
    
    const inactiveCustomers = [];

    for (const customer of customers) {
      const lastOrder = await Order.findOne({
        customer: customer._id,
        type: 'order',
        status: { $nin: ['cancelled', 'rejected'] }
      })
      .sort({ orderDate: -1 })
      .select('orderDate orderNumber totalAmount');

      if (!lastOrder || lastOrder.orderDate < cutoffDate) {
        const daysSinceLastOrder = lastOrder
          ? Math.floor((new Date() - lastOrder.orderDate) / (1000 * 60 * 60 * 24))
          : null;

        inactiveCustomers.push({
          _id: customer._id,
          customerId: customer.customerId,
          businessName: customer.businessName,
          contactPerson: customer.contactPersonName,
          phone: customer.phone,
          email: customer.email,
          customerType: customer.customerType,
          city: customer.address.city,
          state: customer.address.state,
          lastOrderDate: lastOrder?.orderDate || null,
          lastOrderNumber: lastOrder?.orderNumber || null,
          lastOrderAmount: lastOrder?.totalAmount || 0,
          daysSinceLastOrder,
          totalOrders: customer.totalOrders,
          totalOrderValue: customer.totalOrderValue,
          outstandingAmount: customer.outstandingAmount
        });
      }
    }

    // Sort by days since last order (descending)
    inactiveCustomers.sort((a, b) => {
      if (a.daysSinceLastOrder === null) return 1;
      if (b.daysSinceLastOrder === null) return -1;
      return b.daysSinceLastOrder - a.daysSinceLastOrder;
    });

    return {
      days,
      count: inactiveCustomers.length,
      customers: inactiveCustomers
    };
  } catch (error) {
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
      .populate('role')
      .select('-password');

    if (!user) {
      throw new Error('User not found');
    }

    // Build match criteria
    const matchCriteria = { 
      createdBy: new mongoose.Types.ObjectId(userId),
      type: type || 'order',
      status: { $nin: ['cancelled', 'rejected'] }
    };
    
    if (dateRange && (dateRange.startDate || dateRange.endDate)) {
      matchCriteria.orderDate = {};
      if (dateRange.startDate) {
        matchCriteria.orderDate.$gte = new Date(dateRange.startDate);
      }
      if (dateRange.endDate) {
        const endDate = new Date(dateRange.endDate);
        endDate.setHours(23, 59, 59, 999);
        matchCriteria.orderDate.$lte = endDate;
      }
    }

    // Get orders
    const orders = await Order.find(matchCriteria)
      .populate('customer', 'businessName customerId phone city')
      .sort({ orderDate: -1 })
      .limit(100);

    // Enrich recent orders with attaKg (normalized KG for all items)
    const recentOrders = orders.map((doc) => {
      const order = doc.toObject();
      const items = Array.isArray(order.items) ? order.items : [];
      let totalKg = 0;
      console.log(`Processing order ${order.orderNumber} with ${items.length} items`);
      
      for (const item of items) {
        const name = (item?.productName || '').toString().trim();
        const unit = (item?.unit || '').toString().trim();
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
          case 'KG':
            kg = quantity;
            break;
          case 'QUINTAL':
            kg = quantity * 100;
            break;
          case 'TON':
            kg = quantity * 1000;
            break;
          case 'BAGS':
            const pack = (item?.packaging || '').toString();
            let bagKg = 0;
            
            // Try to extract weight from packaging string
            if (pack) {
              if (pack.includes('5kg') || pack.includes('5 kg')) bagKg = 5;
              else if (pack.includes('10kg') || pack.includes('10 kg')) bagKg = 10;
              else if (pack.includes('25kg') || pack.includes('25 kg')) bagKg = 25;
              else if (pack.includes('40kg') || pack.includes('40 kg')) bagKg = 40;
              else if (pack.includes('50kg') || pack.includes('50 kg')) bagKg = 50;
              else {
                // Try to extract number followed by kg
                const match = pack.match(/(\d+)\s*kg/i);
                if (match) bagKg = Number(match[1]);
              }
            }
            
            // Default bag weight if not specified (common 50kg bags for flour)
            if (bagKg === 0) {
              bagKg = 50; // Default assumption for flour bags
              console.log(`Using default bag weight: ${bagKg}kg for packaging: "${pack}"`);
            }
            
            kg = quantity * bagKg;
            console.log(`Bags calculation: ${quantity} bags × ${bagKg}kg = ${kg}kg (packaging: "${pack}")`);
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
    if (type === 'visit') {
      // Visit-specific metrics
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      // Get total visits today
      const todayVisitsCount = await Order.countDocuments({
        ...matchCriteria,
        orderDate: { $gte: today, $lt: tomorrow }
      });

      // Calculate unique locations and other visit metrics
      const visitMetrics = await Order.aggregate([
        { $match: matchCriteria },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            uniqueLocations: { $addToSet: '$customer' },
            totalRevenue: { $sum: { $ifNull: ['$totalAmount', 0] } },
            totalPaid: { $sum: { $ifNull: ['$paidAmount', 0] } },
            avgOrderValue: { $avg: { $ifNull: ['$totalAmount', 0] } },
            maxOrderValue: { $max: { $ifNull: ['$totalAmount', 0] } },
            minOrderValue: { $min: { $ifNull: ['$totalAmount', 0] } },
            completedVisits: {
              $sum: {
                $cond: [
                  { $in: ['$status', ['completed', 'delivered']] },
                  1,
                  0
                ]
              }
            },
            // Get date range for calculating average locations per day
            minDate: { $min: '$orderDate' },
            maxDate: { $max: '$orderDate' }
          }
        },
        {
          $addFields: {
            uniqueLocationsCount: { $size: '$uniqueLocations' },
            daysDifference: {
              $max: [
                1, // Minimum 1 day to avoid division by zero
                {
                  $ceil: {
                    $divide: [
                      { $subtract: ['$maxDate', '$minDate'] },
                      1000 * 60 * 60 * 24 // Convert milliseconds to days
                    ]
                  }
                }
              ]
            }
          }
        },
        {
          $addFields: {
            avgLocationsPerDay: {
              $round: [
                { $divide: ['$uniqueLocationsCount', '$daysDifference'] },
                2
              ]
            }
          }
        }
      ]);

      metrics = visitMetrics[0] ? {
        ...visitMetrics[0],
        uniqueLocations: visitMetrics[0].uniqueLocationsCount,
        totalVisitsToday: todayVisitsCount,
        avgLocationsPerDay: visitMetrics[0].avgLocationsPerDay || 0
      } : {
        totalOrders: 0,
        totalRevenue: 0,
        totalPaid: 0,
        avgOrderValue: 0,
        maxOrderValue: 0,
        minOrderValue: 0,
        uniqueLocations: 0,
        completedVisits: 0,
        totalVisitsToday: todayVisitsCount,
        avgLocationsPerDay: 0
      };
    } else {
      // Order-specific metrics (existing logic)
      const orderMetrics = await Order.aggregate([
        { $match: matchCriteria },
        {
          $group: {
            _id: null,
            totalOrders: { $sum: 1 },
            totalRevenue: { $sum: '$totalAmount' },
            totalPaid: { $sum: '$paidAmount' },
            avgOrderValue: { $avg: '$totalAmount' },
            maxOrderValue: { $max: '$totalAmount' },
            minOrderValue: { $min: '$totalAmount' }
          }
        }
      ]);
      
      metrics = orderMetrics[0] || {
        totalOrders: 0,
        totalRevenue: 0,
        totalPaid: 0,
        avgOrderValue: 0,
        maxOrderValue: 0,
        minOrderValue: 0
      };
    }

    // Get monthly trend
    const monthlyTrend = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: {
            year: { $year: '$orderDate' },
            month: { $month: '$orderDate' }
          },
          orders: { $sum: 1 },
          revenue: { $sum: '$totalAmount' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    // Get top customers
    const topCustomers = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: '$customer',
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$totalAmount' }
        }
      },
      { $sort: { totalSpent: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'customers',
          localField: '_id',
          foreignField: '_id',
          as: 'customerInfo'
        }
      },
      { $unwind: '$customerInfo' }
    ]);

    // Compute total sales stats for ALL items (normalize to KG)
    const attaTotalsAgg = await Order.aggregate([
      { $match: matchCriteria },
      { $unwind: '$items' },
      {
        $addFields: {
          itemKg: {
            $switch: {
              branches: [
                { case: { $eq: ['$items.unit', 'KG'] }, then: '$items.quantity' },
                { case: { $eq: ['$items.unit', 'Quintal'] }, then: { $multiply: ['$items.quantity', 100] } },
                { case: { $eq: ['$items.unit', 'Ton'] }, then: { $multiply: ['$items.quantity', 1000] } },
                { 
                  case: { $eq: ['$items.unit', 'Bags'] }, 
                  then: {
                    $multiply: [
                      '$items.quantity',
                      {
                        $switch: {
                          branches: [
                            { case: { $regexMatch: { input: '$items.packaging', regex: /5\s*kg/i } }, then: 5 },
                            { case: { $regexMatch: { input: '$items.packaging', regex: /10\s*kg/i } }, then: 10 },
                            { case: { $regexMatch: { input: '$items.packaging', regex: /25\s*kg/i } }, then: 25 },
                            { case: { $regexMatch: { input: '$items.packaging', regex: /40\s*kg/i } }, then: 40 },
                            { case: { $regexMatch: { input: '$items.packaging', regex: /50\s*kg/i } }, then: 50 },
                          ],
                          default: 50
                        }
                      }
                    ]
                  }
                }
              ],
              default: '$items.quantity'
            }
          }
        }
      },
      {
        $group: {
          _id: null,
          totalKg: { $sum: '$itemKg' },
          totalAmount: { $sum: '$items.totalAmount' }
        }
      }
    ]);

    const attaByGrade = await Order.aggregate([
      { $match: matchCriteria },
      { $unwind: '$items' },
      {
        $addFields: {
          itemKg: {
            $switch: {
              branches: [
                { case: { $eq: ['$items.unit', 'KG'] }, then: '$items.quantity' },
                { case: { $eq: ['$items.unit', 'Quintal'] }, then: { $multiply: ['$items.quantity', 100] } },
                { case: { $eq: ['$items.unit', 'Ton'] }, then: { $multiply: ['$items.quantity', 1000] } },
                { 
                  case: { $eq: ['$items.unit', 'Bags'] }, 
                  then: {
                    $multiply: [
                      '$items.quantity',
                      {
                        $switch: {
                          branches: [
                            { case: { $regexMatch: { input: '$items.packaging', regex: /5\s*kg/i } }, then: 5 },
                            { case: { $regexMatch: { input: '$items.packaging', regex: /10\s*kg/i } }, then: 10 },
                            { case: { $regexMatch: { input: '$items.packaging', regex: /25\s*kg/i } }, then: 25 },
                            { case: { $regexMatch: { input: '$items.packaging', regex: /40\s*kg/i } }, then: 40 },
                            { case: { $regexMatch: { input: '$items.packaging', regex: /50\s*kg/i } }, then: 50 },
                          ],
                          default: 50
                        }
                      }
                    ]
                  }
                }
              ],
              default: '$items.quantity'
            }
          }
        }
      },
      {
        $group: {
          _id: '$items.grade',
          kg: { $sum: '$itemKg' },
          amount: { $sum: '$items.totalAmount' }
        }
      },
      { $project: { _id: 0, grade: '$_id', kg: { $round: ['$kg', 2] }, amount: { $round: ['$amount', 2] }, avgPricePerKg: { $cond: [ { $gt: ['$kg', 0] }, { $round: [ { $divide: ['$amount', '$kg'] }, 2 ] }, 0 ] } } },
      { $sort: { amount: -1 } }
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
        role: user.role?.name
      },
      metrics,
      monthlyTrend,
      topCustomers,
      recentOrders,
      attaSummary: {
        totalKg: attaTotalsAgg[0]?.totalKg || 0,
        totalAmount: attaTotalsAgg[0]?.totalAmount || 0,
        avgPricePerKg: (attaTotalsAgg[0] && attaTotalsAgg[0].totalKg > 0) ? Number(((attaTotalsAgg[0].totalAmount || 0) / attaTotalsAgg[0].totalKg).toFixed(2)) : 0,
        byGrade: attaByGrade
      }
    };
  } catch (error) {
    throw new Error(`Failed to get executive performance detail: ${error.message}`);
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
      throw new Error('Customer not found');
    }

    // Build match criteria
    const matchCriteria = { 
      customer: new mongoose.Types.ObjectId(customerId),
      type: 'order',
      status: { $nin: ['cancelled', 'rejected'] }
    };
    
    if (dateRange && (dateRange.startDate || dateRange.endDate)) {
      matchCriteria.orderDate = {};
      if (dateRange.startDate) {
        matchCriteria.orderDate.$gte = new Date(dateRange.startDate);
      }
      if (dateRange.endDate) {
        const endDate = new Date(dateRange.endDate);
        endDate.setHours(23, 59, 59, 999);
        matchCriteria.orderDate.$lte = endDate;
      }
    }

    // Get orders
    const orders = await Order.find(matchCriteria)
      .populate('createdBy', 'firstName lastName employeeId')
      .sort({ orderDate: -1 })
      .limit(100);

    // Get purchase metrics
    const metrics = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: null,
          totalOrders: { $sum: 1 },
          totalSpent: { $sum: '$totalAmount' },
          totalPaid: { $sum: '$paidAmount' },
          avgOrderValue: { $avg: '$totalAmount' },
          maxOrderValue: { $max: '$totalAmount' },
          minOrderValue: { $min: '$totalAmount' }
        }
      }
    ]);

    // Get product insights
    const productInsights = await Order.aggregate([
      { $match: matchCriteria },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.productName',
          totalQuantity: { $sum: '$items.quantity' },
          totalAmount: { $sum: '$items.totalAmount' },
          orderCount: { $sum: 1 }
        }
      },
      { $sort: { totalAmount: -1 } },
      { $limit: 10 }
    ]);

    // Get monthly trend
    const monthlyTrend = await Order.aggregate([
      { $match: matchCriteria },
      {
        $group: {
          _id: {
            year: { $year: '$orderDate' },
            month: { $month: '$orderDate' }
          },
          orders: { $sum: 1 },
          spent: { $sum: '$totalAmount' }
        }
      },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    // Calculate days since last order
    const lastOrder = orders[0];
    const daysSinceLastOrder = lastOrder
      ? Math.floor((new Date() - new Date(lastOrder.orderDate)) / (1000 * 60 * 60 * 24))
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
        totalOrderValue: customer.totalOrderValue
      },
      metrics: metrics[0] || {
        totalOrders: 0,
        totalSpent: 0,
        totalPaid: 0,
        avgOrderValue: 0,
        maxOrderValue: 0,
        minOrderValue: 0
      },
      daysSinceLastOrder,
      productInsights,
      monthlyTrend,
      recentOrders
    };
  } catch (error) {
    throw new Error(`Failed to get customer purchase detail: ${error.message}`);
  }
};

