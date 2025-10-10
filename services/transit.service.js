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
      filter.fromLocation = { $regex: fromLocation, $options: "i" };
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
        // Set end date to end of day (23:59:59.999) to include all orders on that date
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filter.dateOfDispatch.$lte = endDate;
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
        .populate("toLocation", "name address city")
        .populate("assignedTo", "firstName lastName email")
        .populate("driverId", "firstName lastName email phone")
        .populate("createdBy", "firstName lastName email")
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
      .populate("toLocation", "name address city")
      .populate("assignedTo", "firstName lastName email")
      .populate("driverId", "firstName lastName email phone")
      .populate("createdBy", "firstName lastName email")
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

    // Validate that toLocation exists (fromLocation is now a string)
    const toGodown = await Godown.findById(transitData.toLocation);

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

    // Process attachments if any
    if (transitData.attachments && transitData.attachments.length > 0) {
      const processedAttachments = [];
      
      for (const file of transitData.attachments) {
        // Convert file buffer to base64
        const base64Data = file.buffer.toString('base64');
        
        processedAttachments.push({
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          base64Data: base64Data,
          uploadedAt: new Date()
        });
      }
      
      transitData.attachments = processedAttachments;
    }

    const transit = new Transit(transitData);
    await transit.save();

    // Log audit trail
    await AuditLog.create({
      user: currentUser._id,
      action: "CREATE",
      module: "transits",
      resourceType: "Transit",
      resourceId: transit._id.toString(),
      description: `Created transit ${transit.transitId} from ${transitData.fromLocation} to ${toGodown.name}`,
      metadata: {
        transitId: transit.transitId,
        fromLocation: transitData.fromLocation,
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

    // Validate status transitions
    const validStatusTransitions = {
      "Pending": ["In Transit", "Cancelled"],
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

    // Handle attachments properly
    let finalAttachments = [...(transit.attachments || [])];
    // Remove attachments that are marked for removal
    if (updateData.removedAttachments && Array.isArray(updateData.removedAttachments)) {
      finalAttachments = finalAttachments.filter(attachment => 
  !updateData.removedAttachments.includes(attachment?._id?.toString())
);

    }
    
    // Process new attachments if any
    if (updateData.newAttachments && updateData.newAttachments.length > 0) {
      const processedNewAttachments = [];
      
      for (const file of updateData.newAttachments) {
        // Convert file buffer to base64
        const base64Data = file.buffer.toString('base64');
        
        processedNewAttachments.push({
          fileName: file.originalname,
          fileType: file.mimetype,
          fileSize: file.size,
          base64Data: base64Data,
          uploadedAt: new Date()
        });
      }
      
      // Add new attachments to existing ones
      finalAttachments = [...finalAttachments, ...processedNewAttachments];
    }
    
    // Update the attachments array
    updateData.attachments = finalAttachments;
    
    // Clean up the temporary fields
    delete updateData.newAttachments;
    delete updateData.removedAttachments;

    // Update transit
    Object.assign(transit, updateData);
    await transit.save();

    // Log audit trail
    await AuditLog.create({
      user: currentUser._id,
      action: "UPDATE",
      module: "transits",
      resourceType: "Transit",
      resourceId: transit._id.toString(),
      description: `Updated transit ${transit.transitId}`,
      metadata: {
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


    // Check if transit can be deleted (only Pending or Cancelled transits)
    if (!["Pending", "Cancelled"].includes(transit.status)) {
      throw new Error("Only transits with status 'Pending' or 'Cancelled' can be deleted");
    }

    await Transit.findByIdAndDelete(transitId);

    // Log audit trail
    await AuditLog.create({
      user: currentUser._id,
      action: "DELETE",
      module: "transits",
      resourceType: "Transit",
      resourceId: transitId.toString(),
      description: `Deleted transit ${transit.transitId} with status ${transit.status}`,
      metadata: {
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
      // Regular users can only see stats for transits assigned to them or created by them
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

    // Initialize counts for all possible statuses
    const statusCounts = {
      pending: 0,
      inTransit: 0,
      received: 0,
      partiallyReceived: 0,
      cancelled: 0,
    };

    // Map server status names to client expected names
    stats.forEach((stat) => {
      const status = stat._id;
      if (status === 'Pending') {
        statusCounts.pending = stat.count;
      } else if (status === 'In Transit') {
        statusCounts.inTransit = stat.count;
      } else if (status === 'Received') {
        statusCounts.received = stat.count;
      } else if (status === 'Partially Received') {
        statusCounts.partiallyReceived = stat.count;
      } else if (status === 'Cancelled') {
        statusCounts.cancelled = stat.count;
      }
    });

    const total = Object.values(statusCounts).reduce((sum, count) => sum + count, 0);

    return {
      success: true,
      data: {
        total,
        pending: statusCounts.pending,
        inTransit: statusCounts.inTransit,
        received: statusCounts.received,
        partiallyReceived: statusCounts.partiallyReceived,
        cancelled: statusCounts.cancelled,
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
      // Regular users can only see transits assigned to them or created by them
      const userFilter = {
        $or: [
          { assignedTo: currentUser._id },
          { createdBy: currentUser._id },
          { driverId: currentUser._id },
        ]
      };
      
      // Combine location filter with user access filter
      filter.$and = [
        // Keep the original location filter
        type === "from" ? { fromLocation: locationId } : { toLocation: locationId },
        userFilter
      ];
      
      // Remove the individual location filters since we're using $and
      delete filter.fromLocation;
      delete filter.toLocation;
    }

    const transits = await Transit.find(filter)
      .populate("toLocation", "name address city")
      .populate("assignedTo", "name email")
      .populate("driverId", "firstName lastName email phone")
      .populate("createdBy", "firstName lastName email")
      .sort({ createdAt: -1 })
      .lean();

    return {
      success: true,
      data: transits,
    };
  }

  // Get transit audit trail
  async getTransitAuditTrail(transitId, page = 1, limit = 20) {
    // First check if transit exists
    const transit = await Transit.findById(transitId);
    if (!transit) {
      throw new Error("Transit not found");
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get audit trail for this transit with pagination
    const result = await AuditLog.getResourceAuditTrail("Transit", transitId, {
      limit,
      skip,
    });

    return {
      success: true,
      message: "Transit audit trail retrieved successfully",
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

module.exports = new TransitService();