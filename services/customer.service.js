const { Customer } = require("../models");
const { AuditLog } = require("../models");
const { Order } = require("../models");
const { Transaction } = require("../models");
const orderSchema = require("../models/order.schema");

class CustomerService {
  // Get all customers with pagination and filtering
  async getAllCustomers(query = {}, requestingUser = null) {
    let {
      page = 1,
      limit = 10,
      search = "",
      customerType = "",
      isActive = "",
      state = "",
      city = "",
      dateFrom = "",
      dateTo = "",
      sortBy = "createdAt",
      sortOrder = "desc",
      godownId = "",
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

    // Date range filter for createdAt
    if (dateFrom || dateTo) {
      // Validate inputs
      let fromDate = null;
      let toDate = null;

      if (dateFrom) {
        const d = new Date(dateFrom);
        if (isNaN(d.getTime())) {
          const err = new Error("Invalid dateFrom format. Use YYYY-MM-DD.");
          err.status = 400;
          throw err;
        }
        // Normalize to start of day UTC
        fromDate = new Date(
          Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            0,
            0,
            0,
            0
          )
        );
      }

      if (dateTo) {
        const d = new Date(dateTo);
        if (isNaN(d.getTime())) {
          const err = new Error("Invalid dateTo format. Use YYYY-MM-DD.");
          err.status = 400;
          throw err;
        }
        // Normalize to end of day UTC
        toDate = new Date(
          Date.UTC(
            d.getUTCFullYear(),
            d.getUTCMonth(),
            d.getUTCDate(),
            23,
            59,
            59,
            999
          )
        );
      }

      // Ensure dateFrom <= dateTo
      if (fromDate && toDate && fromDate.getTime() > toDate.getTime()) {
        const err = new Error("dateFrom cannot be later than dateTo.");
        err.status = 400;
        throw err;
      }

      // Reasonable range: limit to 365 days
      if (fromDate && toDate) {
        const diffMs = toDate.getTime() - fromDate.getTime();
        const diffDays = diffMs / (1000 * 60 * 60 * 24);
        if (diffDays > 365) {
          const err = new Error(
            "Date range too large. Please select up to 365 days."
          );
          err.status = 400;
          throw err;
        }
      }

      // Prevent future dates for toDate
      const now = new Date();
      if (toDate && toDate.getTime() > now.getTime()) {
        toDate = now;
      }

      filter.createdAt = {};
      if (fromDate) filter.createdAt.$gte = fromDate;
      if (toDate) filter.createdAt.$lte = toDate;
    }

    // Apply godown filtering
    let godownConditions = null;
    const mongoose = require("mongoose");
    
    if (godownId) {
      // If specific godownId is provided, filter by that godown
      const godownObjectId = new mongoose.Types.ObjectId(godownId);
      
      // Get customers who have orders from this godown (excluding cancelled/rejected orders)
      const { Order } = require("../models");
      const customersWithOrders = await Order.distinct("customer", {
        godown: godownObjectId,
        type: "order",
        status: { $nin: ["cancelled", "rejected"] }
      });
      
      if (customersWithOrders.length > 0) {
        // Include customers assigned to this godown OR active customers who have ordered from it (but have no assignedGodownId)
        godownConditions = [
          { assignedGodownId: godownObjectId },
          { _id: { $in: customersWithOrders }, assignedGodownId: { $exists: false } },
          { _id: { $in: customersWithOrders }, assignedGodownId: null },
        ];
      } else {
        // Only filter by assignedGodownId if no orders found
        filter.assignedGodownId = godownObjectId;
      }
    } else if (
      requestingUser &&
      (requestingUser.primaryGodown ||
        (requestingUser.accessibleGodowns &&
          requestingUser.accessibleGodowns.length > 0))
    ) {
      // Apply user-specific godown filtering based on accessible godowns
      const allowedGodowns = [];

      if (requestingUser.primaryGodown) {
        allowedGodowns.push(
          requestingUser.primaryGodown._id || requestingUser.primaryGodown
        );
      }

      if (
        requestingUser.accessibleGodowns &&
        requestingUser.accessibleGodowns.length > 0
      ) {
        allowedGodowns.push(
          ...requestingUser.accessibleGodowns.map((g) => g._id || g)
        );
      }

      if (allowedGodowns.length > 0) {
        // Also include customers who have orders from accessible godowns but no assignedGodownId
        const { Order } = require("../models");
        const customersWithOrders = await Order.distinct("customer", {
          godown: {
            $in: allowedGodowns.map((id) => new mongoose.Types.ObjectId(id)),
          },
          type: "order",
          status: { $nin: ["cancelled", "rejected"] }
        });

        if (customersWithOrders.length > 0) {
          // Godown conditions: customers with assignedGodownId OR customers with orders from accessible godowns
          godownConditions = [
            {
              assignedGodownId: {
                $in: allowedGodowns.map(
                  (id) => new mongoose.Types.ObjectId(id)
                ),
              },
            },
            {
              _id: { $in: customersWithOrders },
              assignedGodownId: { $exists: false },
            },
            { _id: { $in: customersWithOrders }, assignedGodownId: null },
          ];
        } else {
          // Only filter by assignedGodownId if no orders found
          filter.assignedGodownId = {
            $in: allowedGodowns.map((id) => new mongoose.Types.ObjectId(id)),
          };
        }
      }
    }

    // Combine search and godown conditions properly
    if (searchConditions && godownConditions) {
      // Both search and godown filters exist - combine them with $and
      filter.$and = [{ $or: searchConditions }, { $or: godownConditions }];
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

    // Calculate balances for all customers in the current page
    const customerIds = customers.map((customer) => customer._id);
    const balances = await this.calculateMultipleCustomerBalances(customerIds);

    // Add balance to each customer object
    const customersWithBalance = customers.map((customer) => ({
      ...customer,
      netBalance: balances[customer._id.toString()] || 0,
    }));

    const totalPages = Math.ceil(totalCustomers / parseInt(limit));

    return {
      success: true,
      data: {
        customers: customersWithBalance,
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

    // Calculate net balance for the customer
    const netBalance = await this.calculateCustomerBalance(customerId);
    customer.netBalance = netBalance;

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

  // Calculate net balance for a customer
  async calculateCustomerBalance(customerId) {
    try {
      // Get customer's outstanding amount
      const customer = await Customer.findById(customerId);
      if (!customer) {
        throw new Error("Customer not found");
      }

      // Build filter
      const filter = {
        customer: customerId,
        type: "order",
      };

      // Get other orders for this customer
      const otherCustomerOrders = await Order.find(filter)
        .select("totalAmount paidAmount")
        .lean();

      // Safe number conversion helper
      const safeNumber = (val) => (isNaN(Number(val)) ? 0 : Number(val));

      // Calculate total previous balance
      const previousBalance = otherCustomerOrders.reduce((total, ord) => {
        const totalAmt = safeNumber(ord.totalAmount);
        const paidAmt = safeNumber(ord.paidAmount);
        const outstanding = Math.max(0, totalAmt - paidAmt);
        return total + outstanding;
      }, 0);
      return previousBalance;
    } catch (error) {
      console.error("Error calculating customer balance:", error);
      return 0;
    }
  }

  // Calculate balances for multiple customers efficiently
  async calculateMultipleCustomerBalances(customerIds) {
    try {
      if (!Array.isArray(customerIds) || customerIds.length === 0) {
        return {};
      }

      // Fetch all relevant orders for these customers in one query
      const outstandingOrders = await orderSchema
        .find({
          customer: { $in: customerIds },
          type: "order", // Only consider actual orders
          paymentStatus: { $in: ["pending", "partial", "overdue"] },
        })
        .select("customer totalAmount paidAmount")
        .lean();

      // Group and sum outstanding amounts per customer
      const balances = outstandingOrders.reduce((acc, order) => {
        const customerId = order.customer.toString();
        const outstanding = (order.totalAmount || 0) - (order.paidAmount || 0);
        acc[customerId] = (acc[customerId] || 0) + outstanding;
        return acc;
      }, {});

      // Ensure every provided customerId appears, even if 0 outstanding
      for (const id of customerIds) {
        if (!(id.toString() in balances)) {
          balances[id.toString()] = 0;
        }
      }

      return balances;
    } catch (error) {
      console.error("Error calculating multiple customer balances:", error);
      return {};
    }
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
