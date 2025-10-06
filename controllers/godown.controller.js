const godownService = require('../services/godown.service');
const { Order } = require('../models');

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

    if (godownIds.length > 0) {
      // Aggregate order counts
      const orderCounts = await Order.aggregate([
        { $match: { godown: { $in: godownIds }, type: 'order' } },
        { $group: { _id: '$godown', count: { $sum: 1 } } }
      ]); // [memory:1][memory:2]

      orderCountsMap = orderCounts.reduce((acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      }, {}); // [memory:1]

      // Aggregate visit counts
      const visitCounts = await Order.aggregate([
        { $match: { godown: { $in: godownIds }, type: 'visit' } },
        { $group: { _id: '$godown', count: { $sum: 1 } } }
      ]); // [memory:1][memory:2]

      visitCountsMap = visitCounts.reduce((acc, c) => {
        acc[c._id.toString()] = c.count;
        return acc;
      }, {}); // [memory:1]
    }

    const godownsWithCounts = godowns.map(g => ({
      ...g,
      orderCount: orderCountsMap[g._id.toString()] || 0,
      visitCount: visitCountsMap[g._id.toString()] || 0
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


