const godownService = require("../services/godown.service");
const { Order, Inventory, Customer } = require("../models");
const mongoose = require("mongoose");

const createGodown = async (req, res) => {
  try {
    const result = await godownService.createGodown(req.body, req.user._id);
    res.status(201).json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getGodowns = async (req, res) => {
  try {
    // Pass user ID from authenticated token to service for godown filtering
    const userId = req.user ? req.user._id : null; // [memory:1][memory:2]
    const result = await godownService.getGodowns(req.query, userId); // [memory:1][memory:2]
    let { roleIds } = req.query;

    let extractedRoleIds = [];

    // Handle different possible formats
    if (Array.isArray(roleIds)) {
      extractedRoleIds = roleIds;
    } else if (typeof roleIds === "string" && roleIds.trim() !== "") {
      // Handle comma-separated or single string
      extractedRoleIds = roleIds.split(",").map((id) => id.trim());
    }

    const godowns = result?.data?.godowns || []; // [memory:1]
    let godownIds = godowns.map((g) => g._id); // [memory:1]
    // Scope counts to the requesting user's assigned godowns when available
    // If the auth token includes user details with primaryGodown/accesssibleGodowns, use those
    const assignedIds = [];
    const primary =
      req.user && req.user.primaryGodown ? req.user.primaryGodown : null;
    const accessible =
      req.user && Array.isArray(req.user.accessibleGodowns)
        ? req.user.accessibleGodowns
        : [];

    if (primary) assignedIds.push(primary);
    if (accessible && accessible.length > 0) assignedIds.push(...accessible);

    if (assignedIds.length > 0) {
      // Restrict counts to intersection of returned godowns and user's assigned godowns
      const assignedSet = new Set(assignedIds.map((id) => id.toString()));
      godownIds = godownIds.filter((id) => assignedSet.has(id.toString()));
    }

    // Prepare maps
    let orderCountsMap = {};
    let visitCountsMap = {}; // [memory:1][memory:2]
    let inventoryCountsMap = {};
    let customerCountsMap = {};

    if (godownIds.length > 0) {
      // Build filter for counting based on query parameters
      const countFilter = { godown: { $in: godownIds } };

      // Apply search filter
      if (req.query.search) {
        countFilter.$or = [
          { orderNumber: { $regex: req.query.search, $options: "i" } },
        ];
      }

      // Apply status filter
      if (req.query.status) {
        countFilter.status = req.query.status;
      }

      // Apply delivery status filter
      if (req.query.deliveryStatus) {
        countFilter.deliveryStatus = req.query.deliveryStatus;
      }

      // Apply payment status filter
      if (req.query.paymentStatus) {
        countFilter.paymentStatus = req.query.paymentStatus;
      }

      // Apply customer filter
      if (req.query.customerId) {
        countFilter.customer = new mongoose.Types.ObjectId(
          req.query.customerId
        );
      }

      // Apply priority filter
      if (req.query.priority) {
        countFilter.priority = req.query.priority;
      }

      // Apply amount range filter
      if (req.query.minAmount || req.query.maxAmount) {
        countFilter.totalAmount = {};
        if (req.query.minAmount) {
          countFilter.totalAmount.$gte = parseFloat(req.query.minAmount);
        }
        if (req.query.maxAmount) {
          countFilter.totalAmount.$lte = parseFloat(req.query.maxAmount);
        }
      }

      // Apply date range filter
      if (req.query.dateFrom || req.query.dateTo) {
        countFilter.orderDate = {};
        if (req.query.dateFrom) {
          countFilter.orderDate.$gte = new Date(req.query.dateFrom);
        }
        if (req.query.dateTo) {
          // Set end date to end of day (23:59:59.999) to include all orders on that date
          const endDate = new Date(req.query.dateTo);
          endDate.setHours(23, 59, 59, 999);
          countFilter.orderDate.$lte = endDate;
        }
      }

      // Apply visit-specific filters
      if (req.query.scheduleStatus) {
        countFilter.scheduleStatus = req.query.scheduleStatus;
      }

      if (req.query.visitStatus) {
        countFilter.visitStatus = req.query.visitStatus;
      }

      if (req.query.hasImage) {
        if (req.query.hasImage === "true") {
          countFilter.capturedImage = { $exists: true, $ne: null };
        } else if (req.query.hasImage === "false") {
          countFilter.$or = [
            { capturedImage: { $exists: false } },
            { capturedImage: null },
          ];
        }
      }

      if (req.query.address) {
        countFilter["captureLocation.address"] = {
          $regex: req.query.address,
          $options: "i",
        };
      }

      // Note: Role filter is applied in aggregation pipelines below, not here
      // since orders don't have a direct roleId field - they're linked through createdBy -> user -> role

      // Apply consistent filtering with Sales Executive Reports
      // Exclude cancelled and rejected orders/visits
      const baseOrderFilter = {
        ...countFilter,
        type: "order",
        status: { $nin: ["cancelled", "rejected"] },
      };

      const baseVisitFilter = {
        ...countFilter,
        type: "visit",
        status: { $nin: ["cancelled", "rejected"] },
      };

      // Get department filter from query params (optional)
      const department = req.query.department;

      // Build aggregation pipeline for order counts
      const orderPipeline = [
        { $match: baseOrderFilter },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByUser",
          },
        },
        {
          $unwind: { path: "$createdByUser", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "roles",
            localField: "createdByUser.role", // role ObjectId from User
            foreignField: "_id",
            as: "userRole",
          },
        },
        {
          $unwind: { path: "$userRole", preserveNullAndEmptyArrays: true },
        },
      ];

      // Create a separate pipeline for deleted user orders
      const deletedUserOrderPipeline = [
        {
          $match: {
            ...baseOrderFilter,
            $or: [
              { createdBy: null },
              { createdBy: { $exists: false } }
            ]
          }
        }
      ];

      // Create a separate pipeline for orphaned orders (createdBy references non-existent user)
      const orphanedOrderPipeline = [
        {
          $match: {
            ...baseOrderFilter,
            createdBy: { $exists: true, $ne: null }
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "userExists",
          },
        },
        {
          $match: {
            userExists: { $size: 0 } // No matching user found
          }
        }
      ];
      if (req.query.onlySalesExecutive === "true") {
        orderPipeline.push({
          $match: {
            ...(extractedRoleIds.length > 0
              ? {
                "userRole._id": {
                  $in: extractedRoleIds?.map(
                    (id) => new mongoose.Types.ObjectId(id)
                  ),
                },
              }
              : {
                $or: [
                  { "userRole.name": "Sales Executive" },
                  { "userRole.name": "Manager" },
                ],
              }),
          },
        });
      }
      // Add department filter only if specified
      if (department) {
        orderPipeline.push({
          $match: { "createdByUser.department": department },
        });
      }
      // Add role filter only if specified
      if (req.query.roleId) {
        orderPipeline.push({
          $match: {
            "createdByUser.role": new mongoose.Types.ObjectId(req.query.roleId),
          },
        });
      }

      orderPipeline.push({ $group: { _id: "$godown", count: { $sum: 1 } } });

      // Add grouping for deleted user pipelines
      deletedUserOrderPipeline.push({ $group: { _id: "$godown", count: { $sum: 1 } } });
      orphanedOrderPipeline.push({ $group: { _id: "$godown", count: { $sum: 1 } } });

      // Aggregate order counts with filters
      console.log("🔍 Godown API - Processing order counts...");
      const orderCounts = await Order.aggregate(orderPipeline); // [memory:1][memory:2]

      // Aggregate deleted user order counts
      const deletedUserOrderCounts = await Order.aggregate(deletedUserOrderPipeline);
      const orphanedOrderCounts = await Order.aggregate(orphanedOrderPipeline);

      console.log("📊 Godown API - Regular orders:", orderCounts.reduce((sum, c) => sum + c.count, 0));
      console.log("📊 Godown API - Deleted user orders:", deletedUserOrderCounts.reduce((sum, c) => sum + c.count, 0));
      console.log("📊 Godown API - Orphaned orders:", orphanedOrderCounts.reduce((sum, c) => sum + c.count, 0));

      // Combine all order counts
      const allOrderCounts = [...orderCounts, ...deletedUserOrderCounts, ...orphanedOrderCounts];

      orderCountsMap = allOrderCounts.reduce((acc, c) => {
        const godownId = c._id?.toString() || 'null';
        acc[godownId] = (acc[godownId] || 0) + c.count;
        return acc;
      }, {}); // [memory:1]

      console.log("✅ Godown API - Total orders counted:", Object.values(orderCountsMap).reduce((sum, count) => sum + count, 0));

      // Build aggregation pipeline for visit counts
      const visitPipeline = [
        { $match: baseVisitFilter },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByUser",
          },
        },
        {
          $unwind: { path: "$createdByUser", preserveNullAndEmptyArrays: true },
        },
        {
          $lookup: {
            from: "roles",
            localField: "createdByUser.role", // role ObjectId from User
            foreignField: "_id",
            as: "userRole",
          },
        },
        {
          $unwind: { path: "$userRole", preserveNullAndEmptyArrays: true },
        },
      ];

      // Create separate pipelines for deleted user visits
      const deletedUserVisitPipeline = [
        {
          $match: {
            ...baseVisitFilter,
            $or: [
              { createdBy: null },
              { createdBy: { $exists: false } }
            ]
          }
        }
      ];

      const orphanedVisitPipeline = [
        {
          $match: {
            ...baseVisitFilter,
            createdBy: { $exists: true, $ne: null }
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "userExists",
          },
        },
        {
          $match: {
            userExists: { $size: 0 } // No matching user found
          }
        }
      ];
      if (req.query.onlySalesExecutive === "true") {
        visitPipeline.push({
          $match: {
            ...(extractedRoleIds.length > 0
              ? {
                "userRole._id": {
                  $in: extractedRoleIds?.map(
                    (id) => new mongoose.Types.ObjectId(id)
                  ),
                },
              }
              : {
                $or: [
                  { "userRole.name": "Sales Executive" },
                  { "userRole.name": "Manager" },
                ],
              }),
          },
        });
      }
      // Add department filter only if specified
      if (department) {
        visitPipeline.push({
          $match: { "createdByUser.department": department },
        });
      }
      // Add role filter only if specified
      if (req.query.roleId) {
        visitPipeline.push({
          $match: {
            "createdByUser.role": new mongoose.Types.ObjectId(req.query.roleId),
          },
        });
      }

      visitPipeline.push({ $group: { _id: "$godown", count: { $sum: 1 } } });

      // Add grouping for deleted user visit pipelines
      deletedUserVisitPipeline.push({ $group: { _id: "$godown", count: { $sum: 1 } } });
      orphanedVisitPipeline.push({ $group: { _id: "$godown", count: { $sum: 1 } } });

      // Aggregate visit counts with filters
      const visitCounts = await Order.aggregate(visitPipeline); // [memory:1][memory:2]

      // Aggregate deleted user visit counts
      const deletedUserVisitCounts = await Order.aggregate(deletedUserVisitPipeline);
      const orphanedVisitCounts = await Order.aggregate(orphanedVisitPipeline);

      // Combine all visit counts
      const allVisitCounts = [...visitCounts, ...deletedUserVisitCounts, ...orphanedVisitCounts];

      visitCountsMap = allVisitCounts.reduce((acc, c) => {
        const godownId = c._id?.toString() || 'null';
        acc[godownId] = (acc[godownId] || 0) + c.count;
        return acc;
      }, {}); // [memory:1]

      // Build inventory filter for counting based on query parameters
      const inventoryCountFilter = { godown: { $in: godownIds } };

      // Apply inventory type filter
      if (req.query.inventoryType) {
        inventoryCountFilter.inventoryType = req.query.inventoryType;
      }

      // Apply date range filter for inventory
      if (req.query.dateFrom || req.query.dateTo) {
        inventoryCountFilter.dateOfStock = {};
        if (req.query.dateFrom) {
          inventoryCountFilter.dateOfStock.$gte = new Date(req.query.dateFrom);
        }
        if (req.query.dateTo) {
          // Set end date to end of day (23:59:59.999) to include all inventory on that date
          const endDate = new Date(req.query.dateTo);
          endDate.setHours(23, 59, 59, 999);
          inventoryCountFilter.dateOfStock.$lte = endDate;
        }
      }

      // Apply search filter for inventory
      if (req.query.search) {
        const searchConditions = [
          { stockId: { $regex: req.query.search, $options: "i" } },
          { inventoryType: { $regex: req.query.search, $options: "i" } },
          { unit: { $regex: req.query.search, $options: "i" } },
          { additionalNotes: { $regex: req.query.search, $options: "i" } },
        ];

        // If search is a valid number, also search in quantity field
        const numericSearch = parseFloat(req.query.search);
        if (!isNaN(numericSearch)) {
          searchConditions.push({ quantity: numericSearch });
        }

        inventoryCountFilter.$or = searchConditions;
      }

      // Build aggregation pipeline for inventory counts
      const inventoryPipeline = [
        { $match: inventoryCountFilter },
        {
          $lookup: {
            from: "users",
            localField: "loggedBy",
            foreignField: "_id",
            as: "loggedByUser",
          },
        },
        {
          $unwind: { path: "$loggedByUser", preserveNullAndEmptyArrays: true },
        },
      ];

      // Apply logged by filter (search by user name)
      if (req.query.loggedBy) {
        inventoryPipeline.push({
          $match: {
            $or: [
              {
                "loggedByUser.firstName": {
                  $regex: req.query.loggedBy,
                  $options: "i",
                },
              },
              {
                "loggedByUser.lastName": {
                  $regex: req.query.loggedBy,
                  $options: "i",
                },
              },
              {
                $expr: {
                  $regexMatch: {
                    input: {
                      $concat: [
                        "$loggedByUser.firstName",
                        " ",
                        "$loggedByUser.lastName",
                      ],
                    },
                    regex: req.query.loggedBy,
                    options: "i",
                  },
                },
              },
            ],
          },
        });
      }

      inventoryPipeline.push({
        $group: { _id: "$godown", count: { $sum: 1 } },
      });

      // Aggregate inventory counts with filters
      const inventoryCounts = await Inventory.aggregate(inventoryPipeline);

      inventoryCountsMap = inventoryCounts.reduce((acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      }, {});

      // Build customer filter for counting based on orders placed in godowns
      // This matches the logic used in customer reports API

      // Check if we need to count inactive customers
      const inactiveDays = req.query.inactiveDays ? parseInt(req.query.inactiveDays) : null;

      if (inactiveDays) {
        // For inactive customers per godown: count customers assigned to or who have ordered from each godown
        // and check if they're inactive in that specific godown
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

        // Get all customers who have ever ordered from these godowns
        const customerOrderStatusFilter = req.query.status
          ? req.query.status
          : { $nin: ["cancelled", "rejected"] };
        const customersWithOrders = await Order.distinct('customer', {
          godown: { $in: godownIds },
          type: "order",
          status: customerOrderStatusFilter
        });

        // Get customers assigned to these godowns
        const assignedCustomers = await Customer.find({
          isActive: true,
          assignedGodownId: { $in: godownIds }
        }).select('_id assignedGodownId');

        // Combine both sets of customers
        const allRelevantCustomerIds = new Set();
        assignedCustomers.forEach(c => allRelevantCustomerIds.add(c._id.toString()));
        customersWithOrders.forEach(c => allRelevantCustomerIds.add(c.toString()));

        // Validate that all customers exist in customers collection (matching customer reports API logic)
        const validCustomerIds = await Customer.find({
          _id: { $in: Array.from(allRelevantCustomerIds).map(id => new mongoose.Types.ObjectId(id)) }
        }).distinct('_id');
        const validCustomerIdSet = new Set(validCustomerIds.map(id => id.toString()));
        const allRelevantCustomerIdsFiltered = Array.from(allRelevantCustomerIds).filter(id => validCustomerIdSet.has(id));

        // Get last order date for each customer in each godown
        const customerGodownOrders = await Order.aggregate([
          {
            $match: {
              customer: { $in: allRelevantCustomerIdsFiltered.map(id => new mongoose.Types.ObjectId(id)) },
              godown: { $in: godownIds },
              type: "order",
              status: customerOrderStatusFilter
            }
          },
          {
            $group: {
              _id: {
                godown: "$godown",
                customer: "$customer"
              },
              lastOrderDate: { $max: "$orderDate" }
            }
          }
        ]);

        // Create maps for godown assignments and order history
        const godownAssignmentMap = new Map();
        assignedCustomers.forEach(c => {
          // Only include valid customers
          if (validCustomerIdSet.has(c._id.toString())) {
            const godownId = c.assignedGodownId.toString();
            if (!godownAssignmentMap.has(godownId)) {
              godownAssignmentMap.set(godownId, new Set());
            }
            godownAssignmentMap.get(godownId).add(c._id.toString());
          }
        });

        const godownCustomerOrderMap = new Map();
        customerGodownOrders.forEach(item => {
          const godownId = item._id.godown.toString();
          if (!godownCustomerOrderMap.has(godownId)) {
            godownCustomerOrderMap.set(godownId, new Map());
          }
          godownCustomerOrderMap.get(godownId).set(
            item._id.customer.toString(),
            item.lastOrderDate
          );
        });

        // Count inactive customers per godown
        godownIds.forEach(godownId => {
          const godownIdStr = godownId.toString();
          const assignedToGodown = godownAssignmentMap.get(godownIdStr) || new Set();
          const customerOrdersInGodown = godownCustomerOrderMap.get(godownIdStr) || new Map();

          // Get all relevant customers for this godown (assigned or have ordered)
          const relevantCustomers = new Set(assignedToGodown);
          customerOrdersInGodown.forEach((_, customerId) => {
            relevantCustomers.add(customerId);
          });

          // Count customers who are inactive in this godown
          const inactiveCount = Array.from(relevantCustomers).filter(customerId => {
            const lastOrderDate = customerOrdersInGodown.get(customerId);
            // Customer is inactive if they never ordered from this godown OR last order was before cutoff
            return !lastOrderDate || lastOrderDate < cutoffDate;
          }).length;

          customerCountsMap[godownIdStr] = inactiveCount;
        });
      } else {
        // Check if we should only count customers with orders (for customer reports)
        const onlyWithOrders = req.query.onlyWithOrders === 'true';
        if (onlyWithOrders) {
          // For customer reports: count only customers who have placed orders in date range
          const customerOrderFilter = {
            godown: { $in: godownIds },
            type: "order",
            status: req.query.status
              ? req.query.status
              : { $nin: ["cancelled", "rejected"] }
          };

          // Apply date range filter for orders if provided
          if (req.query.dateFrom || req.query.dateTo) {
            customerOrderFilter.orderDate = {};
            if (req.query.dateFrom) {
              customerOrderFilter.orderDate.$gte = new Date(req.query.dateFrom);
            }
            if (req.query.dateTo) {
              const endDate = new Date(req.query.dateTo);
              endDate.setHours(23, 59, 59, 999);
              customerOrderFilter.orderDate.$lte = endDate;
            }
          }

          // Aggregate unique customer counts by godown based on orders (matching customer reports API logic)
          const customerCounts = await Order.aggregate([
            { $match: customerOrderFilter },
            {
              $group: {
                _id: {
                  godown: "$godown",
                  customer: "$customer"
                }
              }
            },
            {
              $lookup: {
                from: "customers",
                localField: "_id.customer",
                foreignField: "_id",
                as: "customerInfo"
              }
            },
            {
              $unwind: "$customerInfo"
            },
            {
              $group: {
                _id: "$_id.godown",
                count: { $sum: 1 }
              }
            }
          ]);

          customerCountsMap = customerCounts.reduce((acc, c) => {
            acc[c._id.toString()] = c.count;
            return acc;
          }, {});
        } else {
          // For all customers: count ALL active customers (assigned or have ordered from godown)
          // This matches the CustomersPage which shows all customers regardless of order history

          // Build customer filter based on query parameters (matching customer API)
          const customerFilter = {};

          // Apply customer filters from query
          if (req.query.customerType) {
            customerFilter.customerType = req.query.customerType;
          }

          if (req.query.customerIsActive !== undefined && req.query.customerIsActive !== '') {
            customerFilter.isActive = req.query.customerIsActive === 'true';
          } else {
            customerFilter.isActive = true; // Default to active customers
          }

          if (req.query.customerState) {
            customerFilter['address.state'] = req.query.customerState;
          }

          if (req.query.customerCity) {
            customerFilter['address.city'] = { $regex: req.query.customerCity, $options: 'i' };
          }

          // Apply customer date range filter (for customer createdAt)
          if (req.query.customerDateFrom || req.query.customerDateTo) {
            customerFilter.createdAt = {};
            if (req.query.customerDateFrom) {
              const d = new Date(req.query.customerDateFrom);
              customerFilter.createdAt.$gte = new Date(
                Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
              );
            }
            if (req.query.customerDateTo) {
              const d = new Date(req.query.customerDateTo);
              customerFilter.createdAt.$lte = new Date(
                Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)
              );
            }
          }

          // Get customers assigned to these godowns with filters applied
          const assignedCustomers = await Customer.find({
            ...customerFilter,
            assignedGodownId: { $in: godownIds }
          }).select('_id assignedGodownId businessName contactPersonName phone customerId location address');

          // Get all customers who have ever ordered from these godowns
          const customersWithOrders = await Order.distinct('customer', {
            godown: { $in: godownIds },
            type: "order",
            status: { $nin: ["cancelled", "rejected"] }
          });

          // Get customers without assignedGodownId (or null) who have orders, with filters applied
          const customersWithoutAssignment = await Customer.find({
            ...customerFilter,
            _id: { $in: customersWithOrders },
            $or: [
              { assignedGodownId: { $exists: false } },
              { assignedGodownId: null }
            ]
          }).select('_id businessName contactPersonName phone customerId location address');

          // Apply customer search filter if provided
          let filteredAssignedCustomers = assignedCustomers;
          let filteredCustomersWithoutAssignment = customersWithoutAssignment;

          if (req.query.customerSearch) {
            const searchRegex = new RegExp(req.query.customerSearch, 'i');
            filteredAssignedCustomers = assignedCustomers.filter(c =>
              searchRegex.test(c.businessName) ||
              searchRegex.test(c.contactPersonName) ||
              searchRegex.test(c.phone) ||
              searchRegex.test(c.customerId) ||
              searchRegex.test(c.location)
            );
            filteredCustomersWithoutAssignment = customersWithoutAssignment.filter(c =>
              searchRegex.test(c.businessName) ||
              searchRegex.test(c.contactPersonName) ||
              searchRegex.test(c.phone) ||
              searchRegex.test(c.customerId) ||
              searchRegex.test(c.location)
            );
          }

          // Create maps for godown assignments
          const godownAssignmentMap = new Map();
          filteredAssignedCustomers.forEach(c => {
            const godownId = c.assignedGodownId.toString();
            if (!godownAssignmentMap.has(godownId)) {
              godownAssignmentMap.set(godownId, new Set());
            }
            godownAssignmentMap.get(godownId).add(c._id.toString());
          });

          // Get godown for each customer with orders but no assignedGodownId
          const customersWithoutAssignmentIds = filteredCustomersWithoutAssignment.map(c => c._id);
          const customerGodownOrders = await Order.aggregate([
            {
              $match: {
                customer: { $in: customersWithoutAssignmentIds },
                godown: { $in: godownIds },
                type: "order",
                status: { $nin: ["cancelled", "rejected"] }
              }
            },
            {
              $group: {
                _id: {
                  godown: "$godown",
                  customer: "$customer"
                }
              }
            }
          ]);

          const godownCustomerOrderMap = new Map();
          customerGodownOrders.forEach(item => {
            const godownId = item._id.godown.toString();
            if (!godownCustomerOrderMap.has(godownId)) {
              godownCustomerOrderMap.set(godownId, new Set());
            }
            godownCustomerOrderMap.get(godownId).add(item._id.customer.toString());
          });

          // Count all customers per godown (assigned + customers with orders but no assignment)
          godownIds.forEach(godownId => {
            const godownIdStr = godownId.toString();
            const assignedToGodown = godownAssignmentMap.get(godownIdStr) || new Set();
            const customersWithOrdersInGodown = godownCustomerOrderMap.get(godownIdStr) || new Set();

            // Combine both sets to get all relevant customers
            const allCustomers = new Set([...assignedToGodown, ...customersWithOrdersInGodown]);

            customerCountsMap[godownIdStr] = allCustomers.size;
          });
        }
      }
    }

    // Calculate total customer count based on orders placed (matching customer reports API)
    let allCustomerCount = 0;

    // Check if we need to count inactive customers
    const inactiveDaysForTotal = req.query.inactiveDays ? parseInt(req.query.inactiveDays) : null;

    if (inactiveDaysForTotal) {
      // For inactive customers: count ALL active customers who haven't ordered in N days
      // This matches the logic in getInactiveCustomers service
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - inactiveDaysForTotal);

      // Get all active customers
      const allActiveCustomers = await Customer.find({ isActive: true }).select('_id');
      const customerIds = allActiveCustomers.map(c => c._id);

      // Get last order date for each customer
      const inactiveCustomerStatusFilter = req.query.status
        ? req.query.status
        : { $nin: ["cancelled", "rejected"] };
      const customerLastOrders = await Order.aggregate([
        {
          $match: {
            customer: { $in: customerIds },
            type: "order",
            status: inactiveCustomerStatusFilter
          }
        },
        {
          $group: {
            _id: "$customer",
            lastOrderDate: { $max: "$orderDate" }
          }
        }
      ]);

      // Create a map of customer ID to last order date
      const lastOrderMap = new Map();
      customerLastOrders.forEach(item => {
        lastOrderMap.set(item._id.toString(), item.lastOrderDate);
      });

      // Count customers who are inactive (no order or last order before cutoff)
      allCustomerCount = customerIds.filter(customerId => {
        const lastOrderDate = lastOrderMap.get(customerId.toString());
        return !lastOrderDate || lastOrderDate < cutoffDate;
      }).length;
    } else {
      // Check if we should only count customers with orders
      const onlyWithOrders = req.query.onlyWithOrders === 'true';

      if (onlyWithOrders) {
        // For customer reports: count unique customers who have placed orders in the date range
        // This should match the customer reports API logic
        const allCustomerOrderFilter = {
          type: "order",
          status: req.query.status
            ? req.query.status
            : { $nin: ["cancelled", "rejected"] }
        };

        // Apply godown filtering to match customer reports API
        if (godownIds.length > 0) {
          allCustomerOrderFilter.godown = { $in: godownIds };
        }

        // Apply date range filter for orders if provided
        if (req.query.dateFrom || req.query.dateTo) {
          allCustomerOrderFilter.orderDate = {};
          if (req.query.dateFrom) {
            allCustomerOrderFilter.orderDate.$gte = new Date(req.query.dateFrom);
          }
          if (req.query.dateTo) {
            const endDate = new Date(req.query.dateTo);
            endDate.setHours(23, 59, 59, 999);
            allCustomerOrderFilter.orderDate.$lte = endDate;
          }
        }

        // Count unique customers across all orders (matching customer reports API logic)
        const allCustomerCountResult = await Order.aggregate([
          { $match: allCustomerOrderFilter },
          {
            $group: {
              _id: "$customer"
            }
          },
          {
            $lookup: {
              from: "customers",
              localField: "_id",
              foreignField: "_id",
              as: "customerInfo"
            }
          },
          {
            $unwind: "$customerInfo"
          },
          {
            $count: "totalCustomers"
          }
        ]);

        allCustomerCount = allCustomerCountResult.length > 0 ? allCustomerCountResult[0].totalCustomers : 0;
      } else {
        // For all customers: count ALL active customers (matching CustomersPage) with filters applied
        const totalCustomerFilter = {};

        // Apply customer filters from query
        if (req.query.customerType) {
          totalCustomerFilter.customerType = req.query.customerType;
        }

        if (req.query.customerIsActive !== undefined && req.query.customerIsActive !== '') {
          totalCustomerFilter.isActive = req.query.customerIsActive === 'true';
        } else {
          totalCustomerFilter.isActive = true; // Default to active customers
        }

        if (req.query.customerState) {
          totalCustomerFilter['address.state'] = req.query.customerState;
        }

        if (req.query.customerCity) {
          totalCustomerFilter['address.city'] = { $regex: req.query.customerCity, $options: 'i' };
        }

        // Apply customer date range filter (for customer createdAt)
        if (req.query.customerDateFrom || req.query.customerDateTo) {
          totalCustomerFilter.createdAt = {};
          if (req.query.customerDateFrom) {
            const d = new Date(req.query.customerDateFrom);
            totalCustomerFilter.createdAt.$gte = new Date(
              Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
            );
          }
          if (req.query.customerDateTo) {
            const d = new Date(req.query.customerDateTo);
            totalCustomerFilter.createdAt.$lte = new Date(
              Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)
            );
          }
        }

        // Apply search filter if provided
        if (req.query.customerSearch) {
          totalCustomerFilter.$or = [
            { businessName: { $regex: req.query.customerSearch, $options: 'i' } },
            { contactPersonName: { $regex: req.query.customerSearch, $options: 'i' } },
            { phone: { $regex: req.query.customerSearch, $options: 'i' } },
            { customerId: { $regex: req.query.customerSearch, $options: 'i' } },
            { location: { $regex: req.query.customerSearch, $options: 'i' } }
          ];
        }

        allCustomerCount = await Customer.countDocuments(totalCustomerFilter);
      }
    }

    const godownsWithCounts = godowns.map((g) => ({
      ...g,
      orderCount: orderCountsMap[g._id.toString()] || 0,
      visitCount: visitCountsMap[g._id.toString()] || 0,
      inventoryCount: inventoryCountsMap[g._id.toString()] || 0,
      customerCount: customerCountsMap[g._id.toString()] || 0,
    })); // [memory:1]

    res
      .status(200)
      .json({
        success: true,
        data: {
          godowns: godownsWithCounts,
          allCustomerCount: allCustomerCount
        }
      }); // [memory:1]
  } catch (error) {
    res.status(500).json({ success: false, message: error.message }); // [memory:10]
  }
};

const getGodownById = async (req, res) => {
  try {
    const result = await godownService.getGodownById(req.params.id);
    res.status(200).json(result);
  } catch (error) {
    res.status(404).json({ success: false, message: error.message });
  }
};

const updateGodown = async (req, res) => {
  try {
    const result = await godownService.updateGodown(
      req.params.id,
      req.body,
      req.user._id
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteGodown = async (req, res) => {
  try {
    const result = await godownService.deleteGodown(
      req.params.id,
      req.user._id
    );
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Simple godown list without counts - for basic dropdowns and selections
const getGodownsSimple = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const result = await godownService.getGodowns(req.query, userId);

    // Return only basic godown information without counts
    const godowns = result?.data?.godowns || [];

    res.status(200).json({
      success: true,
      data: { godowns }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Godowns with order/visit counts - for orders and visits pages
const getGodownsWithOrderCounts = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const result = await godownService.getGodowns(req.query, userId);
    let { roleIds } = req.query;

    let extractedRoleIds = [];
    if (Array.isArray(roleIds)) {
      extractedRoleIds = roleIds;
    } else if (typeof roleIds === "string" && roleIds.trim() !== "") {
      extractedRoleIds = roleIds.split(",").map((id) => id.trim());
    }

    const godowns = result?.data?.godowns || [];
    let godownIds = godowns.map((g) => g._id);

    // Apply user godown restrictions
    const assignedIds = [];
    const primary = req.user && req.user.primaryGodown ? req.user.primaryGodown : null;
    const accessible = req.user && Array.isArray(req.user.accessibleGodowns) ? req.user.accessibleGodowns : [];

    if (primary) assignedIds.push(primary);
    if (accessible && accessible.length > 0) assignedIds.push(...accessible);

    if (assignedIds.length > 0) {
      const assignedSet = new Set(assignedIds.map((id) => id.toString()));
      godownIds = godownIds.filter((id) => assignedSet.has(id.toString()));
    }

    let orderCountsMap = {};
    let visitCountsMap = {};

    // Build filter for counting based on query parameters
    const countFilter = {};

    // Only apply godown filtering if we have specific godowns to filter by
    // AND the request is asking for godown-specific counts (not global counts)
    if (godownIds.length > 0 && req.query.godownId) {
      countFilter.godown = { $in: godownIds };
    }

    // If no specific godown filter is applied, we want to count ALL orders
    // but still group them by godown for proper distribution

    // Always execute the counting logic, even if no godowns are specified
    // This allows counting ALL orders when no godown filter is applied
    if (true) {

      // Apply all the same filters as the original getGodowns method
      if (req.query.search) {
        countFilter.$or = [
          { orderNumber: { $regex: req.query.search, $options: "i" } },
        ];
      }
      if (req.query.status) countFilter.status = req.query.status;
      if (req.query.deliveryStatus) countFilter.deliveryStatus = req.query.deliveryStatus;
      if (req.query.paymentStatus) countFilter.paymentStatus = req.query.paymentStatus;
      if (req.query.customerId) {
        countFilter.customer = new mongoose.Types.ObjectId(req.query.customerId);
      }
      if (req.query.priority) countFilter.priority = req.query.priority;

      // Apply amount range filter
      if (req.query.minAmount || req.query.maxAmount) {
        countFilter.totalAmount = {};
        if (req.query.minAmount) countFilter.totalAmount.$gte = parseFloat(req.query.minAmount);
        if (req.query.maxAmount) countFilter.totalAmount.$lte = parseFloat(req.query.maxAmount);
      }

      // Apply date range filter
      if (req.query.dateFrom || req.query.dateTo) {
        countFilter.orderDate = {};
        if (req.query.dateFrom) countFilter.orderDate.$gte = new Date(req.query.dateFrom);
        if (req.query.dateTo) {
          const endDate = new Date(req.query.dateTo);
          endDate.setHours(23, 59, 59, 999);
          countFilter.orderDate.$lte = endDate;
        }
      }

      // Apply visit-specific filters
      if (req.query.scheduleStatus) countFilter.scheduleStatus = req.query.scheduleStatus;
      if (req.query.visitStatus) countFilter.visitStatus = req.query.visitStatus;
      if (req.query.hasImage) {
        if (req.query.hasImage === "true") {
          countFilter.capturedImage = { $exists: true, $ne: null };
        } else if (req.query.hasImage === "false") {
          countFilter.$or = [
            { capturedImage: { $exists: false } },
            { capturedImage: null },
          ];
        }
      }
      if (req.query.address) {
        countFilter["captureLocation.address"] = {
          $regex: req.query.address,
          $options: "i",
        };
      }
      if (req.query.onlySalesExecutive === "true" && !req.query.status && !req.query.deliveryStatus) {
        countFilter.status = {
          $nin: ["rejected", "cancelled"]
        }
        countFilter.deliveryStatus = {
          $nin: ["not_delivered", "cancelled"]
        }
      }
      // Base filters for orders and visits
      const baseOrderFilter = {
        ...countFilter,
        type: "order",
      };

      const baseVisitFilter = {
        ...countFilter,
        type: "visit",
      };



      // Remove the automatic exclusion of cancelled/rejected orders

      // Build aggregation pipelines for order and visit counts
      // FIXED: Only count orders with VALID users (not null, not deleted)
      const orderPipeline = [
        { $match: baseOrderFilter },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByUser",
          },
        },
        { $unwind: { path: "$createdByUser", preserveNullAndEmptyArrays: false } }, // CHANGED: Only include orders with valid users
        {
          $lookup: {
            from: "roles",
            localField: "createdByUser.role",
            foreignField: "_id",
            as: "userRole",
          },
        },
        { $unwind: { path: "$userRole", preserveNullAndEmptyArrays: true } },
      ];

      // FIXED: Only count visits with VALID users (not null, not deleted)
      const visitPipeline = [
        { $match: baseVisitFilter },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "createdByUser",
          },
        },
        { $unwind: { path: "$createdByUser", preserveNullAndEmptyArrays: false } }, // CHANGED: Only include visits with valid users
        {
          $lookup: {
            from: "roles",
            localField: "createdByUser.role",
            foreignField: "_id",
            as: "userRole",
          },
        },
        { $unwind: { path: "$userRole", preserveNullAndEmptyArrays: true } },
      ];

      // Apply role filters
      if (req.query.onlySalesExecutive === "true") {
        const roleFilter = {
          $match: {
            ...(extractedRoleIds.length > 0
              ? {
                "userRole._id": {
                  $in: extractedRoleIds?.map((id) => new mongoose.Types.ObjectId(id)),
                },
              }
              : {
                $or: [
                  { "userRole.name": "Sales Executive" },
                  { "userRole.name": "Manager" },
                ],
              }),
          },
        };
        orderPipeline.push(roleFilter);
        visitPipeline.push(roleFilter);
      }

      if (req.query.roleId) {
        const roleIdFilter = {
          $match: {
            "createdByUser.role": new mongoose.Types.ObjectId(req.query.roleId),
          },
        };
        orderPipeline.push(roleIdFilter);
        visitPipeline.push(roleIdFilter);
      }

      orderPipeline.push({ $group: { _id: "$godown", count: { $sum: 1 } } });
      visitPipeline.push({ $group: { _id: "$godown", count: { $sum: 1 } } });

      // Create separate pipelines for deleted user orders (similar to original getGodowns)
      const deletedUserOrderPipeline = [
        {
          $match: {
            ...baseOrderFilter,
            $or: [
              { createdBy: null },
              { createdBy: { $exists: false } }
            ]
          }
        },
        { $group: { _id: "$godown", count: { $sum: 1 } } }
      ];

      // Create separate pipeline for orphaned orders (createdBy references non-existent user)
      const orphanedOrderPipeline = [
        {
          $match: {
            ...baseOrderFilter,
            createdBy: { $exists: true, $ne: null }
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "userExists",
          },
        },
        {
          $match: {
            userExists: { $size: 0 } // No matching user found
          }
        },
        { $group: { _id: "$godown", count: { $sum: 1 } } }
      ];

      // Similar pipelines for visits
      const deletedUserVisitPipeline = [
        {
          $match: {
            ...baseVisitFilter,
            $or: [
              { createdBy: null },
              { createdBy: { $exists: false } }
            ]
          }
        },
        { $group: { _id: "$godown", count: { $sum: 1 } } }
      ];

      const orphanedVisitPipeline = [
        {
          $match: {
            ...baseVisitFilter,
            createdBy: { $exists: true, $ne: null }
          }
        },
        {
          $lookup: {
            from: "users",
            localField: "createdBy",
            foreignField: "_id",
            as: "userExists",
          },
        },
        {
          $match: {
            userExists: { $size: 0 } // No matching user found
          }
        },
        { $group: { _id: "$godown", count: { $sum: 1 } } }
      ];

      // DEBUG: Count ALL orders in database for comparison
      const totalOrdersInDB = await Order.countDocuments({ type: "order" });
      const totalOrdersExcludingCancelledRejected = await Order.countDocuments({
        type: "order",
        status: { $nin: ["cancelled", "rejected"] },
        deliveryStatus: { $nin: ["cancelled", "not_delivered"] }
      });
      console.log("🔍 DEBUG - Total orders in DB with type='order':", totalOrdersInDB);
      console.log("🔍 DEBUG - Total orders excluding cancelled/rejected:", totalOrdersExcludingCancelledRejected);

      // Execute all aggregations
      const [orderCounts, visitCounts, deletedUserOrderCounts, orphanedOrderCounts, deletedUserVisitCounts, orphanedVisitCounts] = await Promise.all([
        Order.aggregate(orderPipeline),
        Order.aggregate(visitPipeline),
        Order.aggregate(deletedUserOrderPipeline),
        Order.aggregate(orphanedOrderPipeline),
        Order.aggregate(deletedUserVisitPipeline),
        Order.aggregate(orphanedVisitPipeline)
      ]);

      // VERIFICATION: Check for any overlap between the three categories
      const regularGodowns = new Set(orderCounts.map(c => c._id?.toString()));
      const deletedGodowns = new Set(deletedUserOrderCounts.map(c => c._id?.toString()));
      const orphanedGodowns = new Set(orphanedOrderCounts.map(c => c._id?.toString()));

      // Combine all order counts
      const allOrderCounts = [...orderCounts, ...deletedUserOrderCounts, ...orphanedOrderCounts];
      const allVisitCounts = [...visitCounts, ...deletedUserVisitCounts, ...orphanedVisitCounts];

      orderCountsMap = allOrderCounts.reduce((acc, c) => {
        const godownId = c._id?.toString() || 'null';
        acc[godownId] = (acc[godownId] || 0) + c.count;
        return acc;
      }, {});

      visitCountsMap = allVisitCounts.reduce((acc, c) => {
        const godownId = c._id?.toString() || 'null';
        acc[godownId] = (acc[godownId] || 0) + c.count;
        return acc;
      }, {});

    
    }

    const godownsWithCounts = godowns.map((g) => ({
      ...g,
      orderCount: orderCountsMap[g._id.toString()] || 0,
      visitCount: visitCountsMap[g._id.toString()] || 0,
    }));

   
    res.status(200).json({
      success: true,
      data: { godowns: godownsWithCounts }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Godowns with customer counts - for customer reports and customer pages
const getGodownsWithCustomerCounts = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const result = await godownService.getGodowns(req.query, userId);

    const godowns = result?.data?.godowns || [];
    let godownIds = godowns.map((g) => g._id);

    // Apply user godown restrictions
    const assignedIds = [];
    const primary = req.user && req.user.primaryGodown ? req.user.primaryGodown : null;
    const accessible = req.user && Array.isArray(req.user.accessibleGodowns) ? req.user.accessibleGodowns : [];

    if (primary) assignedIds.push(primary);
    if (accessible && accessible.length > 0) assignedIds.push(...accessible);

    if (assignedIds.length > 0) {
      const assignedSet = new Set(assignedIds.map((id) => id.toString()));
      godownIds = godownIds.filter((id) => assignedSet.has(id.toString()));
    }

    let customerCountsMap = {};
    let allCustomerCount = 0;

    if (godownIds.length > 0) {
      // Check if we need to count inactive customers
      const inactiveDays = req.query.inactiveDays ? parseInt(req.query.inactiveDays) : null;

      if (inactiveDays) {
        // Handle inactive customer counting logic (similar to original getGodowns)
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - inactiveDays);

        const customerOrderStatusFilter = req.query.status
          ? req.query.status
          : { $nin: ["cancelled", "rejected"] };
        const customersWithOrders = await Order.distinct('customer', {
          godown: { $in: godownIds },
          type: "order",
          status: customerOrderStatusFilter
        });

        const assignedCustomers = await Customer.find({
          isActive: true,
          assignedGodownId: { $in: godownIds }
        }).select('_id assignedGodownId');

        // Combine both sets of customers
        const allRelevantCustomerIds = new Set();
        assignedCustomers.forEach(c => allRelevantCustomerIds.add(c._id.toString()));
        customersWithOrders.forEach(c => allRelevantCustomerIds.add(c.toString()));

        // Validate that all customers exist in customers collection (matching customer reports API logic)
        const validCustomerIds = await Customer.find({
          _id: { $in: Array.from(allRelevantCustomerIds).map(id => new mongoose.Types.ObjectId(id)) }
        }).distinct('_id');
        const validCustomerIdSet = new Set(validCustomerIds.map(id => id.toString()));
        const allRelevantCustomerIdsFiltered = Array.from(allRelevantCustomerIds).filter(id => validCustomerIdSet.has(id));

        // Get last order date for each customer in each godown
        const customerGodownOrders = await Order.aggregate([
          {
            $match: {
              customer: { $in: allRelevantCustomerIdsFiltered.map(id => new mongoose.Types.ObjectId(id)) },
              godown: { $in: godownIds },
              type: "order",
              status: customerOrderStatusFilter
            }
          },
          {
            $group: {
              _id: {
                godown: "$godown",
                customer: "$customer"
              },
              lastOrderDate: { $max: "$orderDate" }
            }
          }
        ]);

        // Create maps for godown assignments and order history
        const godownAssignmentMap = new Map();
        assignedCustomers.forEach(c => {
          // Only include valid customers
          if (validCustomerIdSet.has(c._id.toString())) {
            const godownId = c.assignedGodownId.toString();
            if (!godownAssignmentMap.has(godownId)) {
              godownAssignmentMap.set(godownId, new Set());
            }
            godownAssignmentMap.get(godownId).add(c._id.toString());
          }
        });

        const godownCustomerOrderMap = new Map();
        customerGodownOrders.forEach(item => {
          const godownId = item._id.godown.toString();
          if (!godownCustomerOrderMap.has(godownId)) {
            godownCustomerOrderMap.set(godownId, new Map());
          }
          godownCustomerOrderMap.get(godownId).set(
            item._id.customer.toString(),
            item.lastOrderDate
          );
        });

        // Count inactive customers per godown
        godownIds.forEach(godownId => {
          const godownIdStr = godownId.toString();
          const assignedToGodown = godownAssignmentMap.get(godownIdStr) || new Set();
          const customerOrdersInGodown = godownCustomerOrderMap.get(godownIdStr) || new Map();

          // Get all relevant customers for this godown (assigned or have ordered)
          const relevantCustomers = new Set(assignedToGodown);
          customerOrdersInGodown.forEach((_, customerId) => {
            relevantCustomers.add(customerId);
          });

          // Count customers who are inactive in this godown
          const inactiveCount = Array.from(relevantCustomers).filter(customerId => {
            const lastOrderDate = customerOrdersInGodown.get(customerId);
            // Customer is inactive if they never ordered from this godown OR last order was before cutoff
            return !lastOrderDate || lastOrderDate < cutoffDate;
          }).length;

          customerCountsMap[godownIdStr] = inactiveCount;
        });

      } else {
        // Check if we should only count customers with orders
        const onlyWithOrders = req.query.onlyWithOrders === 'true';

        if (onlyWithOrders) {
          // Count customers who have placed orders
          const customerOrderFilter = {
            godown: { $in: godownIds },
            type: "order",
            status: req.query.status
              ? req.query.status
              : { $nin: ["cancelled", "rejected"] }
          };

          if (req.query.dateFrom || req.query.dateTo) {
            customerOrderFilter.orderDate = {};
            if (req.query.dateFrom) customerOrderFilter.orderDate.$gte = new Date(req.query.dateFrom);
            if (req.query.dateTo) {
              const endDate = new Date(req.query.dateTo);
              endDate.setHours(23, 59, 59, 999);
              customerOrderFilter.orderDate.$lte = endDate;
            }
          }

          const customerCounts = await Order.aggregate([
            { $match: customerOrderFilter },
            {
              $group: {
                _id: {
                  godown: "$godown",
                  customer: "$customer"
                }
              }
            },
            {
              $lookup: {
                from: "customers",
                localField: "_id.customer",
                foreignField: "_id",
                as: "customerInfo"
              }
            },
            { $unwind: "$customerInfo" },
            {
              $group: {
                _id: "$_id.godown",
                count: { $sum: 1 }
              }
            }
          ]);

          customerCountsMap = customerCounts.reduce((acc, c) => {
            acc[c._id.toString()] = c.count;
            return acc;
          }, {});

          // Calculate total customer count
          const allCustomerCountResult = await Order.aggregate([
            { $match: customerOrderFilter },
            { $group: { _id: "$customer" } },
            {
              $lookup: {
                from: "customers",
                localField: "_id",
                foreignField: "_id",
                as: "customerInfo"
              }
            },
            { $unwind: "$customerInfo" },
            { $count: "totalCustomers" }
          ]);

          allCustomerCount = allCustomerCountResult.length > 0 ? allCustomerCountResult[0].totalCustomers : 0;
        } else {
          // For all customers: count ALL active customers (assigned or have ordered from godown)
          // This matches the CustomersPage which shows all customers regardless of order history

          // Build customer filter based on query parameters (matching customer API)
          const customerFilter = {};

          // Apply customer filters from query
          if (req.query.customerType) {
            customerFilter.customerType = req.query.customerType;
          }

          if (req.query.customerIsActive !== undefined && req.query.customerIsActive !== '') {
            customerFilter.isActive = req.query.customerIsActive === 'true';
          } else {
            customerFilter.isActive = true; // Default to active customers
          }

          if (req.query.customerState) {
            customerFilter['address.state'] = req.query.customerState;
          }

          if (req.query.customerCity) {
            customerFilter['address.city'] = { $regex: req.query.customerCity, $options: 'i' };
          }

          // Apply customer date range filter (for customer createdAt)
          if (req.query.customerDateFrom || req.query.customerDateTo) {
            customerFilter.createdAt = {};
            if (req.query.customerDateFrom) {
              const d = new Date(req.query.customerDateFrom);
              customerFilter.createdAt.$gte = new Date(
                Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
              );
            }
            if (req.query.customerDateTo) {
              const d = new Date(req.query.customerDateTo);
              customerFilter.createdAt.$lte = new Date(
                Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)
              );
            }
          }

          // Get customers assigned to these godowns with filters applied
          const assignedCustomers = await Customer.find({
            ...customerFilter,
            assignedGodownId: { $in: godownIds }
          }).select('_id assignedGodownId businessName contactPersonName phone customerId location address');

          // Get all customers who have ever ordered from these godowns
          const customersWithOrders = await Order.distinct('customer', {
            godown: { $in: godownIds },
            type: "order",
            status: { $nin: ["cancelled", "rejected"] }
          });

          // Get customers without assignedGodownId (or null) who have orders, with filters applied
          const customersWithoutAssignment = await Customer.find({
            ...customerFilter,
            _id: { $in: customersWithOrders },
            $or: [
              { assignedGodownId: { $exists: false } },
              { assignedGodownId: null }
            ]
          }).select('_id businessName contactPersonName phone customerId location address');

          // Apply customer search filter if provided
          let filteredAssignedCustomers = assignedCustomers;
          let filteredCustomersWithoutAssignment = customersWithoutAssignment;

          if (req.query.customerSearch) {
            const searchRegex = new RegExp(req.query.customerSearch, 'i');
            filteredAssignedCustomers = assignedCustomers.filter(c =>
              searchRegex.test(c.businessName) ||
              searchRegex.test(c.contactPersonName) ||
              searchRegex.test(c.phone) ||
              searchRegex.test(c.customerId) ||
              searchRegex.test(c.location)
            );
            filteredCustomersWithoutAssignment = customersWithoutAssignment.filter(c =>
              searchRegex.test(c.businessName) ||
              searchRegex.test(c.contactPersonName) ||
              searchRegex.test(c.phone) ||
              searchRegex.test(c.customerId) ||
              searchRegex.test(c.location)
            );
          }

          // Create maps for godown assignments
          const godownAssignmentMap = new Map();
          filteredAssignedCustomers.forEach(c => {
            const godownId = c.assignedGodownId.toString();
            if (!godownAssignmentMap.has(godownId)) {
              godownAssignmentMap.set(godownId, new Set());
            }
            godownAssignmentMap.get(godownId).add(c._id.toString());
          });

          // Get godown for each customer with orders but no assignedGodownId
          const customersWithoutAssignmentIds = filteredCustomersWithoutAssignment.map(c => c._id);
          const customerGodownOrders = await Order.aggregate([
            {
              $match: {
                customer: { $in: customersWithoutAssignmentIds },
                godown: { $in: godownIds },
                type: "order",
                status: { $nin: ["cancelled", "rejected"] }
              }
            },
            {
              $group: {
                _id: {
                  godown: "$godown",
                  customer: "$customer"
                }
              }
            }
          ]);

          const godownCustomerOrderMap = new Map();
          customerGodownOrders.forEach(item => {
            const godownId = item._id.godown.toString();
            if (!godownCustomerOrderMap.has(godownId)) {
              godownCustomerOrderMap.set(godownId, new Set());
            }
            godownCustomerOrderMap.get(godownId).add(item._id.customer.toString());
          });

          // Count all customers per godown (assigned + customers with orders but no assignment)
          godownIds.forEach(godownId => {
            const godownIdStr = godownId.toString();
            const assignedToGodown = godownAssignmentMap.get(godownIdStr) || new Set();
            const customersWithOrdersInGodown = godownCustomerOrderMap.get(godownIdStr) || new Set();

            // Combine both sets to get all relevant customers
            const allCustomers = new Set([...assignedToGodown, ...customersWithOrdersInGodown]);

            customerCountsMap[godownIdStr] = allCustomers.size;
          });
        }
      }
    }

    // Calculate total customer count based on the same logic as original getGodowns
    const inactiveDaysForTotal = req.query.inactiveDays ? parseInt(req.query.inactiveDays) : null;

    if (inactiveDaysForTotal) {
      // For inactive customers: count ALL active customers who haven't ordered in N days
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - inactiveDaysForTotal);

      // Get all active customers
      const allActiveCustomers = await Customer.find({ isActive: true }).select('_id');
      const customerIds = allActiveCustomers.map(c => c._id);

      // Get last order date for each customer
      const inactiveCustomerStatusFilter = req.query.status
        ? req.query.status
        : { $nin: ["cancelled", "rejected"] };
      const customerLastOrders = await Order.aggregate([
        {
          $match: {
            customer: { $in: customerIds },
            type: "order",
            status: inactiveCustomerStatusFilter
          }
        },
        {
          $group: {
            _id: "$customer",
            lastOrderDate: { $max: "$orderDate" }
          }
        }
      ]);

      // Create a map of customer ID to last order date
      const lastOrderMap = new Map();
      customerLastOrders.forEach(item => {
        lastOrderMap.set(item._id.toString(), item.lastOrderDate);
      });

      // Count customers who are inactive (no order or last order before cutoff)
      allCustomerCount = customerIds.filter(customerId => {
        const lastOrderDate = lastOrderMap.get(customerId.toString());
        return !lastOrderDate || lastOrderDate < cutoffDate;
      }).length;
    } else {
      // Check if we should only count customers with orders
      const onlyWithOrders = req.query.onlyWithOrders === 'true';

      if (onlyWithOrders) {
        // For customer reports: count unique customers who have placed orders in the date range
        const allCustomerOrderFilter = {
          type: "order",
          status: req.query.status
            ? req.query.status
            : { $nin: ["cancelled", "rejected"] }
        };

        // Apply godown filtering to match customer reports API
        if (godownIds.length > 0) {
          allCustomerOrderFilter.godown = { $in: godownIds };
        }

        // Apply date range filter for orders if provided
        if (req.query.dateFrom || req.query.dateTo) {
          allCustomerOrderFilter.orderDate = {};
          if (req.query.dateFrom) {
            allCustomerOrderFilter.orderDate.$gte = new Date(req.query.dateFrom);
          }
          if (req.query.dateTo) {
            const endDate = new Date(req.query.dateTo);
            endDate.setHours(23, 59, 59, 999);
            allCustomerOrderFilter.orderDate.$lte = endDate;
          }
        }

        // Count unique customers across all orders (matching customer reports API logic)
        const allCustomerCountResult = await Order.aggregate([
          { $match: allCustomerOrderFilter },
          {
            $group: {
              _id: "$customer"
            }
          },
          {
            $lookup: {
              from: "customers",
              localField: "_id",
              foreignField: "_id",
              as: "customerInfo"
            }
          },
          {
            $unwind: "$customerInfo"
          },
          {
            $count: "totalCustomers"
          }
        ]);

        allCustomerCount = allCustomerCountResult.length > 0 ? allCustomerCountResult[0].totalCustomers : 0;
      } else {
        // For all customers: count ALL active customers (matching CustomersPage) with filters applied
        const totalCustomerFilter = {};

        // Apply customer filters from query
        if (req.query.customerType) {
          totalCustomerFilter.customerType = req.query.customerType;
        }

        if (req.query.customerIsActive !== undefined && req.query.customerIsActive !== '') {
          totalCustomerFilter.isActive = req.query.customerIsActive === 'true';
        } else {
          totalCustomerFilter.isActive = true; // Default to active customers
        }

        if (req.query.customerState) {
          totalCustomerFilter['address.state'] = req.query.customerState;
        }

        if (req.query.customerCity) {
          totalCustomerFilter['address.city'] = { $regex: req.query.customerCity, $options: 'i' };
        }

        // Apply customer date range filter (for customer createdAt)
        if (req.query.customerDateFrom || req.query.customerDateTo) {
          totalCustomerFilter.createdAt = {};
          if (req.query.customerDateFrom) {
            const d = new Date(req.query.customerDateFrom);
            totalCustomerFilter.createdAt.$gte = new Date(
              Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0)
            );
          }
          if (req.query.customerDateTo) {
            const d = new Date(req.query.customerDateTo);
            totalCustomerFilter.createdAt.$lte = new Date(
              Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999)
            );
          }
        }

        // Apply search filter if provided
        if (req.query.customerSearch) {
          totalCustomerFilter.$or = [
            { businessName: { $regex: req.query.customerSearch, $options: 'i' } },
            { contactPersonName: { $regex: req.query.customerSearch, $options: 'i' } },
            { phone: { $regex: req.query.customerSearch, $options: 'i' } },
            { customerId: { $regex: req.query.customerSearch, $options: 'i' } },
            { location: { $regex: req.query.customerSearch, $options: 'i' } }
          ];
        }

        allCustomerCount = await Customer.countDocuments(totalCustomerFilter);
      }
    }

    const godownsWithCounts = godowns.map((g) => ({
      ...g,
      customerCount: customerCountsMap[g._id.toString()] || 0,
    }));

    res.status(200).json({
      success: true,
      data: {
        godowns: godownsWithCounts,
        allCustomerCount: allCustomerCount
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Godowns with inventory counts - for inventory management
const getGodownsWithInventoryCounts = async (req, res) => {
  try {
    const userId = req.user ? req.user._id : null;
    const result = await godownService.getGodowns(req.query, userId);

    const godowns = result?.data?.godowns || [];
    let godownIds = godowns.map((g) => g._id);

    // Apply user godown restrictions
    const assignedIds = [];
    const primary = req.user && req.user.primaryGodown ? req.user.primaryGodown : null;
    const accessible = req.user && Array.isArray(req.user.accessibleGodowns) ? req.user.accessibleGodowns : [];

    if (primary) assignedIds.push(primary);
    if (accessible && accessible.length > 0) assignedIds.push(...accessible);

    if (assignedIds.length > 0) {
      const assignedSet = new Set(assignedIds.map((id) => id.toString()));
      godownIds = godownIds.filter((id) => assignedSet.has(id.toString()));
    }

    let inventoryCountsMap = {};

    if (godownIds.length > 0) {
      // Build inventory filter
      const inventoryCountFilter = { godown: { $in: godownIds } };

      if (req.query.inventoryType) inventoryCountFilter.inventoryType = req.query.inventoryType;

      if (req.query.dateFrom || req.query.dateTo) {
        inventoryCountFilter.dateOfStock = {};
        if (req.query.dateFrom) inventoryCountFilter.dateOfStock.$gte = new Date(req.query.dateFrom);
        if (req.query.dateTo) {
          const endDate = new Date(req.query.dateTo);
          endDate.setHours(23, 59, 59, 999);
          inventoryCountFilter.dateOfStock.$lte = endDate;
        }
      }

      if (req.query.search) {
        const searchConditions = [
          { stockId: { $regex: req.query.search, $options: "i" } },
          { inventoryType: { $regex: req.query.search, $options: "i" } },
          { unit: { $regex: req.query.search, $options: "i" } },
          { additionalNotes: { $regex: req.query.search, $options: "i" } },
        ];

        const numericSearch = parseFloat(req.query.search);
        if (!isNaN(numericSearch)) {
          searchConditions.push({ quantity: numericSearch });
        }

        inventoryCountFilter.$or = searchConditions;
      }

      const inventoryPipeline = [
        { $match: inventoryCountFilter },
        {
          $lookup: {
            from: "users",
            localField: "loggedBy",
            foreignField: "_id",
            as: "loggedByUser",
          },
        },
        { $unwind: { path: "$loggedByUser", preserveNullAndEmptyArrays: true } },
      ];

      if (req.query.loggedBy) {
        inventoryPipeline.push({
          $match: {
            $or: [
              { "loggedByUser.firstName": { $regex: req.query.loggedBy, $options: "i" } },
              { "loggedByUser.lastName": { $regex: req.query.loggedBy, $options: "i" } },
              {
                $expr: {
                  $regexMatch: {
                    input: { $concat: ["$loggedByUser.firstName", " ", "$loggedByUser.lastName"] },
                    regex: req.query.loggedBy,
                    options: "i",
                  },
                },
              },
            ],
          },
        });
      }

      inventoryPipeline.push({ $group: { _id: "$godown", count: { $sum: 1 } } });

      const inventoryCounts = await Inventory.aggregate(inventoryPipeline);

      inventoryCountsMap = inventoryCounts.reduce((acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      }, {});
    }

    const godownsWithCounts = godowns.map((g) => ({
      ...g,
      inventoryCount: inventoryCountsMap[g._id.toString()] || 0,
    }));

    res.status(200).json({
      success: true,
      data: { godowns: godownsWithCounts }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  createGodown,
  getGodowns,
  getGodownsSimple,
  getGodownsWithOrderCounts,
  getGodownsWithCustomerCounts,
  getGodownsWithInventoryCounts,
  getGodownById,
  updateGodown,
  deleteGodown,
};
