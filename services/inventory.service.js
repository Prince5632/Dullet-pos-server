const { Inventory, AuditLog } = require("../models");

class InventoryService {
  // Get all inventory records with filtering and pagination
  async getAllInventory(query = {}) {
    const {
      page = 1,
      limit = 10,
      inventoryType,
      godown,
      unit,
      dateFrom,
      dateTo,
      loggedBy,
      search,
    } = query;

    // Build filter object
    const filter = {};

    if (inventoryType) {
      filter.inventoryType = inventoryType;
    }

    if (godown) {
      filter.godown = godown;
    }

    if (unit) {
      filter.unit = unit;
    }

    if (loggedBy) {
      filter.loggedBy = loggedBy;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.dateOfStock = {};
      if (dateFrom) {
        filter.dateOfStock.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.dateOfStock.$lte = new Date(dateTo);
      }
    }

    // Search across multiple fields
    if (search) {
      const searchConditions = [
        { stockId: { $regex: search, $options: "i" } },
        { inventoryType: { $regex: search, $options: "i" } },
        { unit: { $regex: search, $options: "i" } },
        { additionalNotes: { $regex: search, $options: "i" } }
      ];

      // If search is a valid number, also search in quantity field
      const numericSearch = parseFloat(search);
      if (!isNaN(numericSearch)) {
        searchConditions.push({ quantity: numericSearch });
      }

      filter.$or = searchConditions;
    }

    const skip = (page - 1) * limit;

    const [inventory, total] = await Promise.all([
      Inventory.find(filter)
        .populate("godown", "name location")
        .populate("loggedBy", "firstName lastName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Inventory.countDocuments(filter),
    ]);

    return {
      success: true,
      data: {
        inventory,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRecords: total,
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      },
    };
  }

  // Get inventory record by ID
  async getInventoryById(inventoryId) {
    const inventory = await Inventory.findById(inventoryId)
      .populate("godown", "name location")
      .populate("loggedBy", "firstName lastName")
      .lean();

    if (!inventory) {
      throw new Error("Inventory record not found");
    }

    return {
      success: true,
      data: { inventory },
    };
  }

  // Create new inventory record
  async createInventory(inventoryData, loggedBy) {
    // Validate required fields
    const requiredFields = ['inventoryType', 'dateOfStock', 'quantity', 'unit'];
    for (const field of requiredFields) {
      if (!inventoryData[field]) {
        throw new Error(`${field} is required`);
      }
    }

    // Validate enum values
    const validInventoryTypes = ['New Stock', 'Stock Sold', 'Damaged / Return'];
    const validUnits = ['Kg', 'Quintal',"40Kg Bag"];

    if (!validInventoryTypes.includes(inventoryData.inventoryType)) {
      throw new Error('Invalid inventory type');
    }

    if (!validUnits.includes(inventoryData.unit)) {
      throw new Error('Invalid unit');
    }

    // Create inventory record
    const inventory = new Inventory({
      ...inventoryData,
      loggedBy,
    });

    await inventory.save();

    // Populate the created record
    await inventory.populate("godown", "name location");
    await inventory.populate("loggedBy", "firstName lastName");

    // Log the action
    await AuditLog.create({
      user: loggedBy,
      action: "CREATE",
      module: "inventory",
      resourceType: "Inventory",
      resourceId: inventory._id.toString(),
      newValues: inventory.toObject(),
      description: `Created inventory record: ${inventory.inventoryType} - ${inventory.quantity} ${inventory.unit}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      data: { inventory },
      message: "Inventory record created successfully",
    };
  }

  // Update inventory record
  async updateInventory(inventoryId, updateData, updatedBy) {
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) {
      throw new Error("Inventory record not found");
    }

    const oldValues = inventory.toObject();

    // Validate enum values if they are being updated
    if (updateData.inventoryType) {
      const validInventoryTypes = ['New Stock', 'Stock Sold', 'Damaged / Return'];
      if (!validInventoryTypes.includes(updateData.inventoryType)) {
        throw new Error('Invalid inventory type');
      }
    }

    if (updateData.unit) {
      const validUnits = ['Kg', 'Quintal',"40Kg Bag"];
      if (!validUnits.includes(updateData.unit)) {
        throw new Error('Invalid unit');
      }
    }

    // Update the inventory record
    Object.assign(inventory, updateData);
    await inventory.save();

    // Populate the updated record
    await inventory.populate("godown", "name location");
    await inventory.populate("loggedBy", "firstName lastName");

    // Log the action
    await AuditLog.create({
      user: updatedBy,
      action: "UPDATE",
      module: "inventory",
      resourceType: "Inventory",
      resourceId: inventory._id.toString(),
      oldValues,
      newValues: inventory.toObject(),
      description: `Updated inventory record: ${inventory.inventoryType} - ${inventory.quantity} ${inventory.unit}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      data: { inventory },
      message: "Inventory record updated successfully",
    };
  }

  // Delete inventory record
  async deleteInventory(inventoryId, deletedBy) {
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) {
      throw new Error("Inventory record not found");
    }

    const oldValues = inventory.toObject();

    // Permanently delete the inventory record
    await Inventory.findByIdAndDelete(inventoryId);

    // Log the action
    await AuditLog.create({
      user: deletedBy,
      action: "DELETE",
      module: "inventory",
      resourceType: "Inventory",
      resourceId: inventory._id.toString(),
      oldValues,
      newValues: null,
      description: `Deleted inventory record: ${inventory.inventoryType} - ${inventory.quantity} ${inventory.unit}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      message: "Inventory record deleted successfully",
    };
  }

  // Get inventory statistics
  async getInventoryStats(query = {}) {
    const { godown, dateFrom, dateTo } = query;

    // Build filter for stats
    const filter = {};
    
    if (godown) {
      filter.godown = godown;
    }

    if (dateFrom || dateTo) {
      filter.dateOfStock = {};
      if (dateFrom) {
        filter.dateOfStock.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.dateOfStock.$lte = new Date(dateTo);
      }
    }

    const stats = await Inventory.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$inventoryType",
          totalQuantityKg: {
            $sum: {
              $cond: [
                { $eq: ["$unit", "Quintal"] },
                { $multiply: ["$quantity", 100] },
                "$quantity"
              ]
            }
          },
          totalRecords: { $sum: 1 },
          avgPricePerKg: { $avg: "$pricePerKg" }
        }
      }
    ]);

    // Calculate total stock in Kg
    const totalStockStats = await Inventory.aggregate([
      { $match: filter },
      {
        $group: {
          _id: null,
          totalStockKg: {
            $sum: {
              $cond: [
                { $eq: ["$unit", "Quintal"] },
                { $multiply: ["$quantity", 100] },
                "$quantity"
              ]
            }
          },
          totalRecords: { $sum: 1 }
        }
      }
    ]);

    return {
      success: true,
      data: {
        byType: stats,
        total: totalStockStats[0] || { totalStockKg: 0, totalRecords: 0 }
      },
    };
  }

  // Get inventory by godown
  async getInventoryByGodown(godownId, query = {}) {
    const { page = 1, limit = 10, inventoryType, dateFrom, dateTo } = query;

    const filter = { godown: godownId };

    if (inventoryType) {
      filter.inventoryType = inventoryType;
    }

    if (dateFrom || dateTo) {
      filter.dateOfStock = {};
      if (dateFrom) {
        filter.dateOfStock.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.dateOfStock.$lte = new Date(dateTo);
      }
    }

    const skip = (page - 1) * limit;

    const [inventory, total] = await Promise.all([
      Inventory.find(filter)
        .populate("godown", "name location")
        .populate("loggedBy", "firstName lastName")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Inventory.countDocuments(filter),
    ]);

    return {
      success: true,
      data: {
        inventory,
        pagination: {
          currentPage: parseInt(page),
          totalPages: Math.ceil(total / limit),
          totalRecords: total,
          hasNext: page * limit < total,
          hasPrev: page > 1,
        },
      },
    };
  }

  // Get inventory audit trail
  async getInventoryAuditTrail(inventoryId, options = {}) {
    const { page = 1, limit = 10 } = options;

    // First check if inventory exists
    const inventory = await Inventory.findById(inventoryId);
    if (!inventory) {
      throw new Error("Inventory record not found");
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get audit trail for this inventory with pagination
    const result = await AuditLog.getResourceAuditTrail("Inventory", inventoryId, {
      limit,
      skip,
    });

    return {
      success: true,
      message: "Inventory audit trail retrieved successfully",
      data: {
        activities: result.logs,
        pagination: {
          currentPage: page,
          totalItems: result.total,
          itemsPerPage: limit,
          totalPages: Math.ceil(result.total / limit),
          hasMore: result.hasMore,
        },
      },
    };
  }
}

module.exports = new InventoryService();