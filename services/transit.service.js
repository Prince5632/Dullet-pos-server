const { Transit, Godown, User } = require("../models");
const { AuditLog } = require("../models");
const { default: mongoose } = require("mongoose");

class TransitService {
  // Get all transits with pagination and filtering
  async getAllTransits(query = {}, currentUser) {
    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      fromLocation = "",
      toLocation = "",
      dateFrom = "",
      dateTo = "",
      sortBy = "createdAt",
      sortOrder = "desc",
      vehicleType = "",
      assignedTo = "",
      driverId = "",
    } = query;

    // Build filter object
    const filter = {};

    if (search) {
      filter.$or = [
        { transitId: { $regex: search, $options: "i" } },
        { vehicleNumber: { $regex: search, $options: "i" } },
        { transporterName: { $regex: search, $options: "i" } },
      ];
    }

    if (status) {
      filter.status = status;
    }

    if (fromLocation) {
      filter.fromLocation = fromLocation;
    }

    if (toLocation) {
      filter.toLocation = toLocation;
    }

    if (vehicleType) {
      filter.vehicleType = vehicleType;
    }

    if (assignedTo) {
      filter.assignedTo = assignedTo;
    }

    if (driverId) {
      filter.driverId = driverId;
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.dateOfDispatch = {};
      if (dateFrom) {
        filter.dateOfDispatch.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        filter.dateOfDispatch.$lte = new Date(dateTo);
      }
    }

    // Role-based filtering
    if (currentUser.role?.name?.toLowerCase() !== "super admin") {
      // Regular users can only see transits assigned to them or created by them
      filter.$or = [
        { assignedTo: currentUser._id },
        { createdBy: currentUser._id },
        { driverId: currentUser._id },
      ];
    }

    const skip = (page - 1) * limit;
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "asc" ? 1 : -1;

    const [transits, total] = await Promise.all([
      Transit.find(filter)
        .populate("fromLocation", "name address city")
        .populate("toLocation", "name address city")
        .populate("assignedTo", "name email")
        .populate("driverId", "name email phone")
        .populate("createdBy", "name email")
        .populate("productDetails.productId", "name")
        .sort(sortOptions)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Transit.countDocuments(filter),
    ]);

    return {
      success: true,
      data: transits,
      pagination: {
        currentPage: parseInt(page),
        totalPages: Math.ceil(total / limit),
        totalItems: total,
        itemsPerPage: parseInt(limit),
      },
    };
  }

  // Get transit by ID
  async getTransitById(transitId) {
    const transit = await Transit.findById(transitId)
      .populate("fromLocation", "name address city")
      .populate("toLocation", "name address city")
      .populate("assignedTo", "name email")
      .populate("driverId", "name email phone")
      .populate("createdBy", "name email")
      .populate("productDetails.productId", "name")
      .lean();

    if (!transit) {
      throw new Error("Transit not found");
    }

    return {
      success: true,
      data: transit,
    };
  }

  // Create new transit
  async createTransit(transitData, currentUser) {
    // Validate required fields
    const requiredFields = [
      "fromLocation",
      "toLocation",
      "dateOfDispatch",
      "vehicleNumber",
      "productDetails",
    ];

    for (const field of requiredFields) {
      if (!transitData[field]) {
        throw new Error(`${field} is required`);
      }
    }

    // Validate that fromLocation and toLocation are different
    if (transitData.fromLocation === transitData.toLocation) {
      throw new Error("From location and to location cannot be the same");
    }

    // Validate that fromLocation and toLocation exist
    const [fromGodown, toGodown] = await Promise.all([
      Godown.findById(transitData.fromLocation),
      Godown.findById(transitData.toLocation),
    ]);

    if (!fromGodown) {
      throw new Error("From location (godown) not found");
    }

    if (!toGodown) {
      throw new Error("To location (godown) not found");
    }

    // Validate driver if provided
    if (transitData.driverId) {
      const driver = await User.findById(transitData.driverId);
      if (!driver) {
        throw new Error("Driver not found");
      }
    }

    // Validate assigned user if provided
    if (transitData.assignedTo) {
      const assignedUser = await User.findById(transitData.assignedTo);
      if (!assignedUser) {
        throw new Error("Assigned user not found");
      }
    }

    // Validate product details
    if (!Array.isArray(transitData.productDetails) || transitData.productDetails.length === 0) {
      throw new Error("At least one product detail is required");
    }

    // Set createdBy to current user
    transitData.createdBy = currentUser._id;

    const transit = new Transit(transitData);
    await transit.save();

    // Log audit trail
    await AuditLog.create({
      action: "CREATE",
      resource: "Transit",
      resourceId: transit._id,
      userId: currentUser._id,
      details: {
        transitId: transit.transitId,
        fromLocation: fromGodown.name,
        toLocation: toGodown.name,
        vehicleNumber: transit.vehicleNumber,
      },
    });

    return {
      success: true,
      message: "Transit created successfully",
      data: await this.getTransitById(transit._id),
    };
  }

  // Update transit
  async updateTransit(transitId, updateData, currentUser) {
    const transit = await Transit.findById(transitId);

    if (!transit) {
      throw new Error("Transit not found");
    }

    // Check permissions
    if (
      currentUser.role?.name?.toLowerCase() !== "super admin" &&
      transit.createdBy.toString() !== currentUser._id.toString() &&
      transit.assignedTo?.toString() !== currentUser._id.toString()
    ) {
      throw new Error("Access denied. You can only update transits assigned to you or created by you");
    }

    // Validate status transitions
    const validStatusTransitions = {
      "New": ["In Transit", "Cancelled"],
      "In Transit": ["Received", "Partially Received", "Cancelled"],
      "Partially Received": ["Received", "Cancelled"],
      "Received": [],
      "Cancelled": [],
    };

    if (updateData.status && updateData.status !== transit.status) {
      const allowedTransitions = validStatusTransitions[transit.status] || [];
      if (!allowedTransitions.includes(updateData.status)) {
        throw new Error(`Cannot change status from ${transit.status} to ${updateData.status}`);
      }
    }

    // Validate locations if being updated
    if (updateData.fromLocation && updateData.toLocation) {
      if (updateData.fromLocation === updateData.toLocation) {
        throw new Error("From location and to location cannot be the same");
      }
    }

    // Validate driver if being updated
    if (updateData.driverId) {
      const driver = await User.findById(updateData.driverId);
      if (!driver) {
        throw new Error("Driver not found");
      }
    }

    // Validate assigned user if being updated
    if (updateData.assignedTo) {
      const assignedUser = await User.findById(updateData.assignedTo);
      if (!assignedUser) {
        throw new Error("Assigned user not found");
      }
    }

    // Store original data for audit log
    const originalData = {
      status: transit.status,
      vehicleNumber: transit.vehicleNumber,
      driverId: transit.driverId,
      assignedTo: transit.assignedTo,
    };

    // Update transit
    Object.assign(transit, updateData);
    await transit.save();

    // Log audit trail
    await AuditLog.create({
      action: "UPDATE",
      resource: "Transit",
      resourceId: transit._id,
      userId: currentUser._id,
      details: {
        transitId: transit.transitId,
        changes: updateData,
        originalData,
      },
    });

    return {
      success: true,
      message: "Transit updated successfully",
      data: await this.getTransitById(transit._id),
    };
  }

  // Delete transit
  async deleteTransit(transitId, currentUser) {
    const transit = await Transit.findById(transitId);

    if (!transit) {
      throw new Error("Transit not found");
    }

    // Check permissions - only super admin or creator can delete
    if (
      currentUser.role?.name?.toLowerCase() !== "super admin" &&
      transit.createdBy.toString() !== currentUser._id.toString()
    ) {
      throw new Error("Access denied. Only super admin or transit creator can delete transits");
    }

    // Check if transit can be deleted (only New or Cancelled transits)
    if (!["New", "Cancelled"].includes(transit.status)) {
      throw new Error("Only transits with status 'New' or 'Cancelled' can be deleted");
    }

    await Transit.findByIdAndDelete(transitId);

    // Log audit trail
    await AuditLog.create({
      action: "DELETE",
      resource: "Transit",
      resourceId: transitId,
      userId: currentUser._id,
      details: {
        transitId: transit.transitId,
        status: transit.status,
      },
    });

    return {
      success: true,
      message: "Transit deleted successfully",
    };
  }

  // Update transit status
  async updateTransitStatus(transitId, status, currentUser) {
    return await this.updateTransit(transitId, { status }, currentUser);
  }

  // Assign driver to transit
  async assignDriver(transitId, driverId, currentUser) {
    return await this.updateTransit(transitId, { driverId }, currentUser);
  }

  // Get transit statistics
  async getTransitStats(currentUser) {
    const filter = {};

    // Role-based filtering
    if (currentUser.role?.name?.toLowerCase() !== "super admin") {
      filter.$or = [
        { assignedTo: currentUser._id },
        { createdBy: currentUser._id },
        { driverId: currentUser._id },
      ];
    }

    const stats = await Transit.aggregate([
      { $match: filter },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
        },
      },
    ]);

    const statusCounts = {
      "New": 0,
      "In Transit": 0,
      "Received": 0,
      "Partially Received": 0,
      "Cancelled": 0,
    };

    stats.forEach((stat) => {
      statusCounts[stat._id] = stat.count;
    });

    const totalTransits = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

    return {
      success: true,
      data: {
        statusCounts,
        totalTransits,
      },
    };
  }

  // Get transits by location
  async getTransitsByLocation(locationId, type = "from", currentUser) {
    const filter = {};
    
    if (type === "from") {
      filter.fromLocation = locationId;
    } else {
      filter.toLocation = locationId;
    }

    // Role-based filtering
    if (currentUser.role?.name?.toLowerCase() !== "super admin") {
      filter.$or = [
        { assignedTo: currentUser._id },
        { createdBy: currentUser._id },
        { driverId: currentUser._id },
      ];
    }

    const transits = await Transit.find(filter)
      .populate("fromLocation", "name address city")
      .populate("toLocation", "name address city")
      .populate("assignedTo", "name email")
      .populate("driverId", "name email phone")
      .populate("createdBy", "name email")
      .sort({ createdAt: -1 })
      .lean();

    return {
      success: true,
      data: transits,
    };
  }
}

module.exports = new TransitService();