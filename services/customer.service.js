const { Customer } = require("../models");
const { AuditLog } = require("../models");

class CustomerService {
  // Get all customers with pagination and filtering
  async getAllCustomers(query = {}) {
    const {
      page = 1,
      limit = 10,
      search = "",
      customerType = "",
      isActive = "",
      state = "",
      city = "",
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    // Build filter object
    const filter = {};

    if (search) {
      filter.$or = [
        { businessName: { $regex: search, $options: "i" } },
        { contactPersonName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { customerId: { $regex: search, $options: "i" } },
      ];
    }

    if (customerType) {
      filter.customerType = customerType;
    }

    if (isActive !== "") {
      filter.isActive = isActive === "true";
    }

    if (state) {
      filter["address.state"] = state;
    }

    if (city) {
      filter["address.city"] = { $regex: city, $options: "i" };
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Execute queries
    const [customers, totalCustomers] = await Promise.all([
      Customer.find(filter)
        .populate("createdBy", "firstName lastName")
        .populate("updatedBy", "firstName lastName")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Customer.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalCustomers / parseInt(limit));

    return {
      success: true,
      data: {
        customers,
      },
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalRecords: totalCustomers,
        limit: parseInt(limit),
        hasNext: parseInt(page) < totalPages,
        hasPrev: parseInt(page) > 1,
      },
    };
  }

  // Get customer by ID
  async getCustomerById(customerId) {
    const customer = await Customer.findById(customerId)
      .populate("createdBy", "firstName lastName")
      .populate("updatedBy", "firstName lastName")
      .lean();

    if (!customer) {
      throw new Error("Customer not found");
    }

    return {
      success: true,
      data: { customer },
    };
  }

  // Create new customer
  async createCustomer(customerData, createdBy) {
    // Check if customer with same phone already exists
    const existingCustomer = await Customer.findOne({
      phone: customerData.phone,
    });
    if (existingCustomer) {
      throw new Error("Customer with this phone number already exists");
    }
   

    // Create customer
    const customer = new Customer({
      ...customerData,
      createdBy,
    });

    await customer.save();

    // Log the action
    await AuditLog.create({
      user: createdBy,
      action: "CREATE",
      module: "customers",
      resourceType: "Customer",
      resourceId: customer._id.toString(),
      newValues: customer.toObject(),
      description: `Created customer: ${customer.businessName}`,
      ipAddress: "0.0.0.0", // This should come from request
      userAgent: "System",
    });

    return {
      success: true,
      data: { customer },
      message: "Customer created successfully",
    };
  }

  // Update customer
  async updateCustomer(customerId, updateData, updatedBy) {
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error("Customer not found");
    }

    // Store old values for audit
    const oldValues = customer.toObject();

    // Check if phone is being changed and if it conflicts
    if (updateData.phone && updateData.phone !== customer.phone) {
      const existingCustomer = await Customer.findOne({
        phone: updateData.phone,
        _id: { $ne: customerId },
      });
      if (existingCustomer) {
        throw new Error("Customer with this phone number already exists");
      }
    }

    // Update customer
    Object.assign(customer, updateData, { updatedBy });
    await customer.save();

    // Log the action
    await AuditLog.create({
      user: updatedBy,
      action: "UPDATE",
      module: "customers",
      resourceType: "Customer",
      resourceId: customer._id.toString(),
      oldValues,
      newValues: customer.toObject(),
      description: `Updated customer: ${customer.businessName}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      data: { customer },
      message: "Customer updated successfully",
    };
  }

  // Soft delete customer
  async deleteCustomer(customerId, deletedBy) {
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error("Customer not found");
    }

    const oldValues = customer.toObject();

    customer.isActive = false;
    customer.updatedBy = deletedBy;
    await customer.save();

    // Log the action
    await AuditLog.create({
      user: deletedBy,
      action: "DELETE",
      module: "customers",
      resourceType: "Customer",
      resourceId: customer._id.toString(),
      oldValues,
      newValues: customer.toObject(),
      description: `Deactivated customer: ${customer.businessName}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      message: "Customer deactivated successfully",
    };
  }

  // Reactivate customer
  async reactivateCustomer(customerId, reactivatedBy) {
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error("Customer not found");
    }

    const oldValues = customer.toObject();

    customer.isActive = true;
    customer.updatedBy = reactivatedBy;
    await customer.save();

    // Log the action
    await AuditLog.create({
      user: reactivatedBy,
      action: "UPDATE",
      module: "customers",
      resourceType: "Customer",
      resourceId: customer._id.toString(),
      oldValues,
      newValues: customer.toObject(),
      description: `Reactivated customer: ${customer.businessName}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      data: { customer },
      message: "Customer reactivated successfully",
    };
  }

  // Get customer statistics
  async getCustomerStats() {
    const [
      totalCustomers,
      activeCustomers,
      inactiveCustomers,
      recentCustomers,
    ] = await Promise.all([
      Customer.countDocuments(),
      Customer.countDocuments({ isActive: true }),
      Customer.countDocuments({ isActive: false }),
      Customer.countDocuments({
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      }),
    ]);

    return {
      success: true,
      data: {
        totalCustomers,
        activeCustomers,
        inactiveCustomers,
        recentCustomers,
      },
    };
  }
}

module.exports = new CustomerService();
