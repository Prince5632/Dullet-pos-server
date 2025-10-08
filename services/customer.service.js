const { Customer } = require("../models");
const { AuditLog } = require("../models");

class CustomerService {
  // Get all customers with pagination and filtering
  async getAllCustomers(query = {}, requestingUser = null) {
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
    
    // Store search conditions separately to combine with godown filters later
    let searchConditions = null;
    if (search) {
      searchConditions = [
        { businessName: { $regex: search, $options: "i" } },
        { contactPersonName: { $regex: search, $options: "i" } },
        { phone: { $regex: search, $options: "i" } },
        { customerId: { $regex: search, $options: "i" } },
        { location: { $regex: search, $options: "i" } },
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

    // Apply user-specific godown filtering based on assignedGodownId
    let godownConditions = null;
    if (requestingUser && (requestingUser.primaryGodown || (requestingUser.accessibleGodowns && requestingUser.accessibleGodowns.length > 0))) {
      const allowedGodowns = [];
      
      if (requestingUser.primaryGodown) {
        allowedGodowns.push(requestingUser.primaryGodown._id || requestingUser.primaryGodown);
      }
      
      if (requestingUser.accessibleGodowns && requestingUser.accessibleGodowns.length > 0) {
        allowedGodowns.push(...requestingUser.accessibleGodowns.map(g => g._id || g));
      }
      
      if (allowedGodowns.length > 0) {
        const mongoose = require('mongoose');
        
        // Also include customers who have orders from accessible godowns but no assignedGodownId
        const { Order } = require("../models");
        const customersWithOrders = await Order.distinct('customer', {
          godown: { $in: allowedGodowns.map(id => new mongoose.Types.ObjectId(id)) }
        });
        
        if (customersWithOrders.length > 0) {
          // Godown conditions: customers with assignedGodownId OR customers with orders from accessible godowns
          godownConditions = [
            { assignedGodownId: { $in: allowedGodowns.map(id => new mongoose.Types.ObjectId(id)) } },
            { _id: { $in: customersWithOrders }, assignedGodownId: { $exists: false } },
            { _id: { $in: customersWithOrders }, assignedGodownId: null }
          ];
        } else {
          // Only filter by assignedGodownId if no orders found
          filter.assignedGodownId = { 
            $in: allowedGodowns.map(id => new mongoose.Types.ObjectId(id)) 
          };
        }
      }
    }

    // Combine search and godown conditions properly
    if (searchConditions && godownConditions) {
      // Both search and godown filters exist - combine them with $and
      filter.$and = [
        { $or: searchConditions },
        { $or: godownConditions }
      ];
    } else if (searchConditions) {
      // Only search filter exists
      filter.$or = searchConditions;
    } else if (godownConditions) {
      // Only godown filter exists
      filter.$or = godownConditions;
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

    // Calculate outstanding amount from unpaid orders
    const Order = require('../models/order.schema');
    const outstandingOrders = await Order.find({
      customer: customerId,
      type: 'order', // Only consider orders, not visits
      paymentStatus: { $in: ['pending', 'partial', 'overdue'] }
    }).select('totalAmount paidAmount').lean();

    const calculatedOutstanding = outstandingOrders.reduce((total, order) => {
      return total + (order.totalAmount - (order.paidAmount || 0));
    }, 0);

    // Update the customer object with calculated outstanding amount
    customer.outstandingAmount = Math.max(0, calculatedOutstanding);

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

    // Permanently delete the customer from the database
    await Customer.findByIdAndDelete(customerId);

    // Log the action
    await AuditLog.create({
      user: deletedBy,
      action: "DELETE",
      module: "customers",
      resourceType: "Customer",
      resourceId: customer._id.toString(),
      oldValues,
      newValues: null, // Customer is permanently deleted
      description: `Permanently deleted customer: ${customer.businessName}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      message: "Customer deleted permanently",
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
