const godownService = require('../services/godown.service');
const { Order, Inventory } = require('../models');
const mongoose = require('mongoose');

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

    const godowns = result?.data?.godowns || []; // [memory:1]
    let godownIds = godowns.map(g => g._id); // [memory:1]

    // Scope counts to the requesting user's assigned godowns when available
    // If the auth token includes user details with primaryGodown/accesssibleGodowns, use those
    const assignedIds = [];
    const primary = req.user && req.user.primaryGodown ? req.user.primaryGodown : null;
    const accessible = req.user && Array.isArray(req.user.accessibleGodowns) ? req.user.accessibleGodowns : [];

    if (primary) assignedIds.push(primary);
    if (accessible && accessible.length > 0) assignedIds.push(...accessible);

    if (assignedIds.length > 0) {
      // Restrict counts to intersection of returned godowns and user's assigned godowns
      const assignedSet = new Set(assignedIds.map(id => id.toString()));
      godownIds = godownIds.filter(id => assignedSet.has(id.toString()));
    }

    // Prepare maps
    let orderCountsMap = {};
    let visitCountsMap = {}; // [memory:1][memory:2]
    let inventoryCountsMap = {};

    if (godownIds.length > 0) {
      // Build filter for counting based on query parameters
      const countFilter = { godown: { $in: godownIds } };
      
      // Apply search filter
      if (req.query.search) {
        countFilter.$or = [{ orderNumber: { $regex: req.query.search, $options: "i" } }];
      }

      // Apply status filter
      if (req.query.status) {
        countFilter.status = req.query.status;
      }

      // Apply payment status filter
      if (req.query.paymentStatus) {
        countFilter.paymentStatus = req.query.paymentStatus;
      }

      // Apply customer filter
      if (req.query.customerId) {
        countFilter.customer = new mongoose.Types.ObjectId(req.query.customerId);
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
          countFilter.orderDate.$lte = new Date(req.query.dateTo);
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
        if (req.query.hasImage === 'true') {
          countFilter.capturedImage = { $exists: true, $ne: null };
        } else if (req.query.hasImage === 'false') {
          countFilter.$or = [
            { capturedImage: { $exists: false } },
            { capturedImage: null }
          ];
        }
      }

      if (req.query.address) {
        countFilter['captureLocation.address'] = { $regex: req.query.address, $options: "i" };
      }

      // Apply consistent filtering with Sales Executive Reports
      // Exclude cancelled and rejected orders/visits
      const baseOrderFilter = { 
        ...countFilter, 
        type: 'order',
        status: { $nin: ['cancelled', 'rejected'] }
      };

      const baseVisitFilter = { 
        ...countFilter, 
        type: 'visit',
        status: { $nin: ['cancelled', 'rejected'] }
      };

      // Get department filter from query params (optional)
      const department = req.query.department;

      // Build aggregation pipeline for order counts
      const orderPipeline = [
        { $match: baseOrderFilter },
        {
          $lookup: {
            from: 'users',
            localField: 'createdBy',
            foreignField: '_id',
            as: 'createdByUser'
          }
        },
        { $unwind: { path: '$createdByUser', preserveNullAndEmptyArrays: true } }
      ];

      // Add department filter only if specified
      if (department) {
        orderPipeline.push({ $match: { 'createdByUser.department': department } });
      }

      orderPipeline.push({ $group: { _id: '$godown', count: { $sum: 1 } } });

      // Aggregate order counts with filters
      const orderCounts = await Order.aggregate(orderPipeline); // [memory:1][memory:2]

      orderCountsMap = orderCounts.reduce((acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      }, {}); // [memory:1]

      // Build aggregation pipeline for visit counts
      const visitPipeline = [
        { $match: baseVisitFilter },
        {
          $lookup: {
            from: 'users',
            localField: 'createdBy',
            foreignField: '_id',
            as: 'createdByUser'
          }
        },
        { $unwind: { path: '$createdByUser', preserveNullAndEmptyArrays: true } }
      ];

      // Add department filter only if specified
      if (department) {
        visitPipeline.push({ $match: { 'createdByUser.department': department } });
      }

      visitPipeline.push({ $group: { _id: '$godown', count: { $sum: 1 } } });

      // Aggregate visit counts with filters
      const visitCounts = await Order.aggregate(visitPipeline); // [memory:1][memory:2]

      visitCountsMap = visitCounts.reduce((acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      }, {}); // [memory:1]

      // Aggregate inventory counts
      const inventoryCounts = await Inventory.aggregate([
        { $match: { godown: { $in: godownIds } } },
        { $group: { _id: '$godown', count: { $sum: 1 } } }
      ]);

      inventoryCountsMap = inventoryCounts.reduce((acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      }, {});
    }

    const godownsWithCounts = godowns.map(g => ({
      ...g,
      orderCount: orderCountsMap[g._id.toString()] || 0,
      visitCount: visitCountsMap[g._id.toString()] || 0,
      inventoryCount: inventoryCountsMap[g._id.toString()] || 0
    })); // [memory:1]

    res.status(200).json({ success: true, data: { godowns: godownsWithCounts } }); // [memory:1]
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
    const result = await godownService.updateGodown(req.params.id, req.body, req.user._id);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteGodown = async (req, res) => {
  try {
    const result = await godownService.deleteGodown(req.params.id, req.user._id);
    res.status(200).json(result);
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  createGodown,
  getGodowns,
  getGodownById,
  updateGodown,
  deleteGodown
};


