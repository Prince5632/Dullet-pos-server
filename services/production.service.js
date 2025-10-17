const { Production, User } = require("../models");
const { AuditLog } = require("../models");
const { uploadToS3 } = require("../utils/s3Upload");

class ProductionService {
  // Get all production records with pagination and filtering
  async getAllProduction(query = {}, requestingUser = null) {
    const {
      page = 1,
      limit = 10,
      search = "",
      shift = "",
      location = "",
      machine = "",
      operator = "",
      dateFrom = "",
      dateTo = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    // Build filter object
    const filter = {};

    // Search functionality
    if (search) {
      filter.$or = [
        { batchId: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
        { inputType: { $regex: search, $options: "i" } },
        { machine: { $regex: search, $options: "i" } },
        { remarks: { $regex: search, $options: "i" } },
      ];
    }

    if (shift) {
      filter.shift = shift;
    }

    if (location) {
      filter.location = { $regex: location, $options: "i" };
    }

    if (operator) {
      filter.operator ={ $regex: operator, $options: "i" };
    }
    if (machine) {
      filter.machine ={ $regex: machine, $options: "i" };
    }
    if (dateFrom || dateTo) {
      countFilter.orderDate = {};

      if (dateFrom) {
        const startDate = new Date(dateFrom);
        startDate.setHours(0, 0, 0, 0); // Start of the day
        countFilter.orderDate.$gte = startDate;
      }

      if (dateTo) {
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // End of the day
        countFilter.orderDate.$lte = endDate;
      }
    }

    // Pagination
    const pageNum = Math.max(1, parseInt(page));
    const limitNum = Math.max(1, Math.min(100, parseInt(limit)));
    const skip = (pageNum - 1) * limitNum;

    // Sort options
    const sortOptions = {};
    const validSortFields = [
      "createdAt",
      "productionDate",
      "batchId",
      "shift",
      "location",
      "inputQty",
    ];
    const sortField = validSortFields.includes(sortBy) ? sortBy : "createdAt";
    const sortDirection = sortOrder === "asc" ? 1 : -1;
    sortOptions[sortField] = sortDirection;

    try {
      // Get total count
      const total = await Production.countDocuments(filter);

      // Get production records with population
      const productions = await Production.find(filter)
        .populate("createdBy", "firstName lastName email")
        .sort(sortOptions)
        .skip(skip)
        .limit(limitNum)
        .lean();

      return {
        success: true,
        data: productions,
        pagination: {
          page: pageNum,
          limit: limitNum,
          total,
          pages: Math.ceil(total / limitNum),
        },
      };
    } catch (error) {
      throw new Error(`Failed to fetch production records: ${error.message}`);
    }
  }

  // Get production record by ID
  async getProductionById(id) {
    try {
      const production = await Production.findById(id)
        .populate("createdBy", "firstName lastName email")
        .lean();

      if (!production) {
        throw new Error("Production record not found");
      }

      return {
        success: true,
        data: production,
      };
    } catch (error) {
      if (error.message === "Production record not found") {
        throw error;
      }
      throw new Error(`Failed to fetch production record: ${error.message}`);
    }
  }

  // Create new production record
  async createProduction(productionData, createdById) {
    try {
      // Validate operator is provided
      // if (!productionData.operator || !productionData.operator.trim()) {
      //   throw new Error("Operator name is required");
      // }

      // Validate output details
      // if (
      //   !productionData.outputDetails ||
      //   productionData.outputDetails.length === 0
      // ) {
      //   throw new Error("At least one output detail is required");
      // }

      // Validate each output detail
      // for (const output of productionData.outputDetails) {
      //   if (!output.itemName || !output.productQty || !output.productUnit) {
      //     throw new Error(
      //       "Each output detail must have itemName, productQty, and productUnit"
      //     );
      //   }
      //   if (output.productQty <= 0) {
      //     throw new Error("Product quantity must be greater than 0");
      //   }
      // }

      // Validate input quantity
      if (productionData.inputQty <= 0) {
        throw new Error("Input quantity must be greater than 0");
      }

      // Process attachments if any - Upload to S3
      if (productionData.attachments && productionData.attachments.length > 0) {
        const processedAttachments = [];
        
        for (const file of productionData.attachments) {
          // Upload file to S3
          const s3Result = await uploadToS3(
            file.buffer,
            file.originalname,
            file.mimetype,
            'production/attachments'
          );
          
          processedAttachments.push({
            fileName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size,
            base64Data: s3Result.fileUrl, // Store S3 URL instead of base64
            uploadedAt: new Date()
          });
        }
        
        productionData.attachments = processedAttachments;
      }

      const newProduction = new Production({
        ...productionData,
        createdBy: createdById,
      });

      const savedProduction = await newProduction.save();

      // Populate the saved production
      const populatedProduction = await Production.findById(savedProduction._id)
        .populate("createdBy", "firstName lastName email")
        .lean();

      // Log audit trail
      await AuditLog.create({
        user: createdById,
        action: "CREATE",
        module: "production",
        resourceType: "Production",
        resourceId: savedProduction._id.toString(),
        newValues: populatedProduction,
        description: `Created production record with batch ID: ${savedProduction.batchId}`,
        ipAddress: "0.0.0.0", // This should come from request
        userAgent: "System",
      });

      return {
        success: true,
        data: populatedProduction,
        message: "Production record created successfully",
      };
    } catch (error) {
      throw error;
    }
  }

  // Update production record
  async updateProduction(id, updateData, updatedById) {
    try {
      const existingProduction = await Production.findById(id);
      if (!existingProduction) {
        throw new Error("Production record not found");
      }

      // Validate operator if provided
      // if (!updateData.operator) {
      //     throw new Error("Operator not found");
      // }

      // Validate output details if provided
      if (updateData.status === "Finished" && updateData.outputDetails) {
        if (updateData.outputDetails.length === 0) {
          throw new Error("At least one output detail is required");
        }

        for (const output of updateData.outputDetails) {
          if (!output.itemName || !output.productQty || !output.productUnit) {
            throw new Error(
              "Each output detail must have itemName, productQty, and productUnit"
            );
          }
          if (output.productQty <= 0) {
            throw new Error("Product quantity must be greater than 0");
          }
        }
      }

      // Validate input quantity if provided
      if (updateData.inputQty !== undefined && updateData.inputQty <= 0) {
        throw new Error("Input quantity must be greater than 0");
      }

      // Handle attachments
      let finalAttachments = existingProduction.attachments || [];

      // Remove attachments that are marked for removal
      if (updateData.removedAttachments && Array.isArray(updateData.removedAttachments)) {
        finalAttachments = finalAttachments.filter(attachment => 
          !updateData.removedAttachments.includes(attachment?._id?.toString())
        );
      }
      
      // Process new attachments if any - Upload to S3
      if (updateData.newAttachments && updateData.newAttachments.length > 0) {
        const processedNewAttachments = [];
        
        for (const file of updateData.newAttachments) {
          // Upload file to S3
          const s3Result = await uploadToS3(
            file.buffer,
            file.originalname,
            file.mimetype,
            'production/attachments'
          );
          
          processedNewAttachments.push({
            fileName: file.originalname,
            fileType: file.mimetype,
            fileSize: file.size,
            base64Data: s3Result.fileUrl, // Store S3 URL instead of base64
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

      // Store old values for audit
      const oldValues = existingProduction.toObject();

      // Don't allow updating batchId directly
      delete updateData.batchId;

      const updatedProduction = await Production.findByIdAndUpdate(
        id,
        updateData,
        { new: true, runValidators: true }
      )
        .populate("createdBy", "firstName lastName email")
        .lean();

      // Log audit trail
      await AuditLog.create({
        user: updatedById,
        action: "UPDATE",
        module: "production",
        resourceType: "Production",
        resourceId: id,
        oldValues,
        newValues: updatedProduction,
        description: `Updated production record with batch ID: ${updatedProduction.batchId}`,
        ipAddress: "0.0.0.0",
        userAgent: "System",
      });

      return {
        success: true,
        data: updatedProduction,
        message: "Production record updated successfully",
      };
    } catch (error) {
      throw error;
    }
  }

  // Delete production record
  async deleteProduction(id, deletedBy) {
    try {
      const production = await Production.findById(id);
      if (!production) {
        throw new Error("Production record not found");
      }

      const oldValues = production.toObject();

      await Production.findByIdAndDelete(id);

      // Log audit trail
      await AuditLog.create({
        user: deletedBy,
        action: "DELETE",
        module: "production",
        resourceType: "Production",
        resourceId: id,
        oldValues,
        newValues: null, // Production is permanently deleted
        description: `Permanently deleted production record with batch ID: ${production.batchId}`,
        ipAddress: "0.0.0.0",
        userAgent: "System",
      });

      return {
        success: true,
        message: "Production record deleted successfully",
      };
    } catch (error) {
      if (error.message === "Production record not found") {
        throw error;
      }
      throw new Error(`Failed to delete production record: ${error.message}`);
    }
  }

  // Get production statistics
  async getProductionStats(query = {}, requestingUser = null) {
    const { dateFrom, dateTo, shift, location } = query;

    try {
      // Build match filter
      const matchFilter = {};

      if (shift) {
        matchFilter.shift = shift;
      }

      if (location) {
        matchFilter.location = { $regex: location, $options: "i" };
      }
 
      // Date range filter
      if (dateFrom || dateTo) {
        const dateFilter = {};
        if (dateFrom && dateTo) {
           const startDate = new Date(dateFrom);
        startDate.setHours(0, 0, 0, 0); // Start of the day
          dateFilter.$gte = startDate;
          const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // End of the day
          dateFilter.$lte = endDate;
        } else if (dateFrom) {
          const startDate = new Date(dateFrom);
        startDate.setHours(0, 0, 0, 0); // Start of the day
          dateFilter.$gte = startDate;
        } else if (dateTo) {
          const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // End of the day
          dateFilter.$lte = endDate;
        }

        if (Object.keys(dateFilter).length > 0) {
          matchFilter.productionDate = dateFilter;
        }
      }

      const stats = await Production.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: null,
            totalRecords: { $sum: 1 },
            totalInputQty: { $sum: "$inputQty" },
            totalOutputQty: {
              $sum: {
                $sum: "$outputDetails.productQty",
              },
            },
            avgInputQty: { $avg: "$inputQty" },
            avgOutputQty: {
              $avg: {
                $sum: "$outputDetails.productQty",
              },
            },
            shiftDistribution: {
              $push: "$shift",
            },
            locationDistribution: {
              $push: "$location",
            },
          },
        },
        {
          $project: {
            _id: 0,
            totalRecords: 1,
            totalInputQty: { $round: ["$totalInputQty", 2] },
            totalOutputQty: { $round: ["$totalOutputQty", 2] },
            avgInputQty: { $round: ["$avgInputQty", 2] },
            avgOutputQty: { $round: ["$avgOutputQty", 2] },
            conversionEfficiency: {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$totalOutputQty", "$totalInputQty"] },
                    100,
                  ],
                },
                2,
              ],
            },
            shiftDistribution: 1,
            locationDistribution: 1,
          },
        },
      ]);

      const result = stats[0] || {
        totalRecords: 0,
        totalInputQty: 0,
        totalOutputQty: 0,
        avgInputQty: 0,
        avgOutputQty: 0,
        conversionEfficiency: 0,
        shiftDistribution: [],
        locationDistribution: [],
      };

      return {
        success: true,
        data: result,
      };
    } catch (error) {
      throw new Error(
        `Failed to fetch production statistics: ${error.message}`
      );
    }
  }

  // Get production summary by date range
  async getProductionSummary(query = {}, requestingUser = null) {
    const { dateFrom, dateTo, groupBy = "day" } = query;

    try {
      const matchFilter = {};

      // Date range filter
      if (dateFrom || dateTo) {
        const dateFilter = {};
        if (dateFrom && dateTo) {
          const startDate = new Date(dateFrom);
        startDate.setHours(0, 0, 0, 0); // Start of the day
          dateFilter.$gte = startDate;
          const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // End of the day
          dateFilter.$lte = endDate;
        } else if (dateFrom) {
          const startDate = new Date(dateFrom);
        startDate.setHours(0, 0, 0, 0); // Start of the day
          dateFilter.$gte = startDate;
        } else if (dateTo) {
          const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999); // End of the day
          dateFilter.$lte = endDate;
        }

        if (Object.keys(dateFilter).length > 0) {
          matchFilter.productionDate = dateFilter;
        }
      }

      const summary = await Production.aggregate([
        { $match: matchFilter },
        {
          $group: {
            _id: "$productionDate",
            totalRecords: { $sum: 1 },
            totalInputQty: { $sum: "$inputQty" },
            totalOutputQty: {
              $sum: {
                $sum: "$outputDetails.productQty",
              },
            },
            shifts: { $addToSet: "$shift" },
            locations: { $addToSet: "$location" },
          },
        },
        {
          $project: {
            date: "$_id",
            totalRecords: 1,
            totalInputQty: { $round: ["$totalInputQty", 2] },
            totalOutputQty: { $round: ["$totalOutputQty", 2] },
            conversionEfficiency: {
              $round: [
                {
                  $multiply: [
                    { $divide: ["$totalOutputQty", "$totalInputQty"] },
                    100,
                  ],
                },
                2,
              ],
            },
            shifts: 1,
            locations: 1,
            _id: 0,
          },
        },
        { $sort: { date: 1 } },
      ]);

      return {
        success: true,
        data: summary,
      };
    } catch (error) {
      throw new Error(`Failed to fetch production summary: ${error.message}`);
    }
  }

  // Get production audit trail
  async getProductionAuditTrail(productionId, page = 1, limit = 20) {
    // First check if production exists
    const production = await Production.findById(productionId);
    if (!production) {
      throw new Error("Production not found");
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get audit trail for this production with pagination
    const result = await AuditLog.getResourceAuditTrail("Production", productionId, {
      limit,
      skip,
    });

    return {
      success: true,
      message: "Production audit trail retrieved successfully",
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

module.exports = new ProductionService();
