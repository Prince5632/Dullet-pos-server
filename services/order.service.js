const { Order, Customer, Godown } = require("../models");
const { AuditLog } = require("../models");
const {
  QUICK_PRODUCT_BASES,
  CITY_CONFIG,
  CITY_TOKENS,
  getProductsForGodowns,
  getProductsForGodown,
} = require("../config/pricing.config");
const { default: mongoose } = require("mongoose");

class OrderService {
  // Get all orders with pagination and filtering
  async getAllOrders(query = {}, currentUser) {
    const {
      page = 1,
      limit = 10,
      search = "",
      status = "",
      paymentStatus = "",
      customerId = "",
      dateFrom = "",
      dateTo = "",
      sortBy = "orderDate",
      sortOrder = "desc",
      type = "order",
      // Order-specific filters
      priority = "",
      minAmount = "",
      maxAmount = "",
      // Visit-specific filters
      scheduleStatus = "",
      visitStatus = "",
      hasImage = "",
      address = "",
    } = query;

    // Build filter object
    const filter = {};

    if (search) {
      filter.$or = [{ orderNumber: { $regex: search, $options: "i" } }];
    }

    if (status) {
      filter.status = status;
    }

    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }

    if (customerId) {
      filter.customer = new mongoose.Types.ObjectId(customerId);
    }

    if (type) {
      filter.type = type;
    }

    // Order-specific filters
    if (type === "order") {
      if (priority) {
        filter.priority = priority;
      }

      if (minAmount || maxAmount) {
        filter.totalAmount = {};
        if (minAmount) {
          filter.totalAmount.$gte = parseFloat(minAmount);
        }
        if (maxAmount) {
          filter.totalAmount.$lte = parseFloat(maxAmount);
        }
      }
    }

    // Visit-specific filters
    if (type === "visit") {
      if (scheduleStatus) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);

        switch (scheduleStatus) {
          case "today":
            filter.scheduleDate = {
              $gte: today,
              $lt: tomorrow,
            };
            break;
          case "upcoming":
            filter.scheduleDate = { $gte: tomorrow };
            break;
          case "overdue":
            filter.scheduleDate = { $lt: today };
            filter.status = { $ne: "completed" };
            break;
        }
      }

      if (visitStatus) {
        filter.visitStatus = visitStatus;
      }

      if (hasImage !== "") {
        if (hasImage === "true") {
          filter.captureLocation = { $exists: true, $ne: null };
        } else if (hasImage === "false") {
          filter.$or = [
            { captureLocation: { $exists: false } },
            { captureLocation: null },
          ];
        }
      }

      if (address) {
        filter["captureLocation.address"] = { $regex: address, $options: "i" };
      }
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.orderDate = {};
      if (dateFrom) {
        filter.orderDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Set end date to end of day (23:59:59.999) to include all orders on that date
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filter.orderDate.$lte = endDate;
      }
    }

    // Scope by godown if provided in query or by user's accessible godowns
    if (query.godownId) {
      filter.godown = new mongoose.Types.ObjectId(query.godownId);
    } else if (
      currentUser &&
      currentUser.role &&
      currentUser.role.name !== "Super Admin"
    ) {
      // Role-based filtering
      const roleName = currentUser.role.name;

      if (roleName === "Driver") {
        // Drivers can only see orders assigned to them
        filter["driverAssignment.driver"] = currentUser._id;
      } else if (["Sales Executive", "Staff"].includes(roleName)) {
        // Sales Executive and Staff: only show their own created orders
        filter.createdBy = currentUser._id;
      } else {
        // Manager, Admin, and other roles: show orders from their accessible godowns
        // Only restrict if not super admin; ensure IDs not populated docs
        const toIds = (arr) =>
          (arr || []).map((v) => (typeof v === "object" && v?._id ? v._id : v));
        const accessibleList = currentUser.accessibleGodowns?.length
          ? toIds(currentUser.accessibleGodowns)
          : currentUser.primaryGodown
          ? [
              typeof currentUser.primaryGodown === "object"
                ? currentUser.primaryGodown._id
                : currentUser.primaryGodown,
            ]
          : [];
        if (accessibleList && accessibleList.length > 0) {
          filter.godown = { $in: accessibleList };
        } else {
          // If user has no assigned godowns, show only their own orders as a fallback
          filter.createdBy = currentUser._id;
        }
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Execute queries
    const [orders, totalOrders, totalAmountSum] = await Promise.all([
      Order.find(filter)
        .populate("customer", "customerId businessName contactPersonName phone")
        .populate("godown", "name location")
        .populate("createdBy", "firstName lastName")
        .populate("approvedBy", "firstName lastName")
        .populate("driverAssignment.driver", "firstName lastName phone")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(filter),
      Order.aggregate([
        { $match: filter },
        { $group: { _id: null, totalSum: { $sum: "$totalAmount" } } }
      ]).then(result => result.length > 0 ? result[0].totalSum : 0),
    ]);

    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    return {
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          totalAmountSum,
          limit: parseInt(limit),
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      },
    };
  }

  // Get order by ID
  async getOrderById(orderId) {
    const order = await Order.findById(orderId)
      .populate("customer")
      .populate("godown", "name location contact")
      .populate("createdBy", "firstName lastName")
      .populate("approvedBy", "firstName lastName")
      .populate("driverAssignment.driver", "firstName lastName phone")
      .lean();

    if (!order) {
      throw new Error("Order not found");
    }

    return {
      success: true,
      data: { order },
    };
  }

  // Create new order
  async createOrder(orderData, createdBy) {
    // Validate customer exists
    console.log(orderData);
    const customer = await Customer.findById(orderData.customer);
    if (!customer) {
      throw new Error("Customer not found");
    }

    if (!customer.isActive) {
      throw new Error("Customer is inactive");
    }

    // Validate required fields for orders
    if (orderData.type === "order") {
      if (!orderData.capturedImage) {
        throw new Error("Captured image is required for orders");
      }
      if (
        !orderData.captureLocation ||
        !orderData.captureLocation.latitude ||
        !orderData.captureLocation.longitude
      ) {
        throw new Error("Capture location is required for orders");
      }
    }

    // If godown provided, validate it and product availability
    if (orderData.godown) {
      const godown = await Godown.findById(orderData.godown);
      if (!godown || !godown.isActive) {
        throw new Error("Invalid or inactive godown");
      }
      // Optional: validate allowedProducts
      if (
        Array.isArray(godown.allowedProducts) &&
        godown.allowedProducts.length > 0
      ) {
        const invalidItem = (orderData.items || []).find(
          (it) =>
            it.productName && !godown.allowedProducts.includes(it.productName)
        );
        if (invalidItem) {
          throw new Error(
            `Product ${invalidItem.productName} not available in selected godown`
          );
        }
      }
    }

    // Determine creator role name for audit fields
    const { User } = require("../models");
    let creatorRoleName = "";
    try {
      const creator = await User.findById(createdBy).populate("role");
      creatorRoleName = creator?.role?.name || "";
    } catch {}

    // Create order
    const order = new Order({
      ...orderData,
      createdBy,
      createdByRole: creatorRoleName,
    });

    // If no godown explicitly provided, infer from user's primary
    if (!order.godown) {
      try {
        const creator = await require("../models").User.findById(createdBy);
        if (creator?.primaryGodown) {
          order.godown = creator.primaryGodown;
        }
      } catch {}
    }

    await order.save();

    // Update customer statistics
    await Customer.findByIdAndUpdate(orderData.customer, {
      $inc: { totalOrders: 1, totalOrderValue: order.totalAmount },
      lastOrderDate: new Date(),
    });

    // Log the action
    await AuditLog.create({
      user: createdBy,
      action: "CREATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      newValues: order.toObject(),
      description: `Created order: ${order.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      data: { order },
      message: "Order created successfully",
    };
  }

  // Update order
  async updateOrder(orderId, updateData, updatedBy) {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Store old values for audit
    const oldValues = order.toObject();
    const oldPaidAmount = order.paidAmount;
    const oldPaymentStatus = order.paymentStatus;

    // Update order
    Object.assign(order, updateData, { updatedBy });
    await order.save();

    // Log the action
    // Determine resource type based on order type
    const resourceType = order.type === "visit" ? "Visit" : "Order";
    const resourceName = order.type === "visit" ? "visit" : "order";

    // Build a richer description when payment fields changed
    let description = `Updated ${resourceName}: ${order.orderNumber}`;
    const changes = [];
    if (
      typeof updateData.paidAmount === "number" &&
      updateData.paidAmount !== oldPaidAmount
    ) {
      changes.push(
        `paidAmount ${oldPaidAmount ?? 0} -> ${updateData.paidAmount}`
      );
    }
    if (
      typeof updateData.paymentStatus === "string" &&
      updateData.paymentStatus !== oldPaymentStatus
    ) {
      changes.push(
        `paymentStatus ${oldPaymentStatus} -> ${updateData.paymentStatus}`
      );
    }
    if (changes.length > 0) {
      description += ` (${changes.join(", ")})`;
    }

    await AuditLog.create({
      user: updatedBy,
      action: "UPDATE",
      module: "orders",
      resourceType: resourceType,
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      data: { order },
      message: "Order updated successfully",
    };
  }

  // Update order status
  async updateOrderStatus(orderId, status, updatedBy, notes = "") {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    const oldStatus = order.status;
    const oldValues = order.toObject();

    // Update status and related fields
    order.status = status;
    order.updatedBy = updatedBy;

    // Set appropriate dates based on status
    const now = new Date();
    switch (status) {
      case "approved":
        order.approvedBy = updatedBy;
        order.approvedDate = now;
        break;
      case "dispatched":
        order.dispatchDate = now;
        break;
      case "delivered":
        order.deliveryDate = now;
        break;
    }

    if (notes) {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\n${notes}`
        : notes;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: updatedBy,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Updated order status from ${oldStatus} to ${status}: ${order.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      data: { order },
      message: `Order status updated to ${status}`,
    };
  }

  // Get customer order history
  async getCustomerOrderHistory(customerId, query = {}) {
    const {
      page = 1,
      limit = 10,
      status = "",
      dateFrom = "",
      dateTo = "",
    } = query;

    // Validate customer exists
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error("Customer not found");
    }

    // Build filter
    const filter = { customer: customerId };

    if (status) {
      filter.status = status;
    }

    if (dateFrom || dateTo) {
      filter.orderDate = {};
      if (dateFrom) {
        filter.orderDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Set end date to end of day (23:59:59.999) to include all orders on that date
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filter.orderDate.$lte = endDate;
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Execute queries
    const [orders, totalOrders] = await Promise.all([
      Order.find(filter)
        .populate("createdBy", "firstName lastName")
        .sort({ orderDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    // Calculate summary statistics
    const [totalValue, avgOrderValue] = await Promise.all([
      Order.aggregate([
        { $match: { customer: customer._id } },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]).then((result) => result[0]?.total || 0),
      Order.aggregate([
        { $match: { customer: customer._id } },
        { $group: { _id: null, avg: { $avg: "$totalAmount" } } },
      ]).then((result) => result[0]?.avg || 0),
    ]);

    return {
      success: true,
      data: {
        customer: {
          _id: customer._id,
          customerId: customer.customerId,
          businessName: customer.businessName,
          contactPersonName: customer.contactPersonName,
        },
        orders,
        statistics: {
          totalOrders: customer.totalOrders,
          totalValue,
          avgOrderValue: Math.round(avgOrderValue),
        },
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          limit: parseInt(limit),
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      },
    };
  }

  // Approve order
  async approveOrder(orderId, approvedBy, notes = "") {
    const { User } = require("../models");

    const user = await User.findById(approvedBy).populate("role");
    if (!user) throw new Error("User not found");

    const hasApprovalPermission = await user.hasPermission("orders.approve");
    if (!hasApprovalPermission) {
      throw new Error("Only Manager or Admin can approve orders");
    }

    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status !== "pending")
      throw new Error("Order is not in pending status");

    const oldValues = order.toObject();

    order.status = "approved";
    order.approvedBy = approvedBy;
    order.approvedDate = new Date();
    order.updatedBy = approvedBy;

    if (notes) {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\n[APPROVED] ${notes}`
        : `[APPROVED] ${notes}`;
    }

    await order.save();

    await AuditLog.create({
      user: approvedBy,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Approved order: ${order.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    await order.populate(
      "customer",
      "customerId businessName contactPersonName phone"
    );
    await order.populate("createdBy", "firstName lastName");
    await order.populate("approvedBy", "firstName lastName");

    return {
      success: true,
      data: { order },
      message: "Order approved successfully",
    };
  }

  async rejectOrder(orderId, rejectedBy, notes = "") {
    const { User } = require("../models");

    const user = await User.findById(rejectedBy).populate("role");
    if (!user) throw new Error("User not found");

    const hasApprovalPermission = await user.hasPermission("orders.approve");
    if (!hasApprovalPermission) {
      throw new Error("Only Manager or Admin can reject orders");
    }

    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");
    if (order.status !== "pending")
      throw new Error("Order is not in pending status");

    const oldValues = order.toObject();

    order.status = "rejected";
    order.updatedBy = rejectedBy;

    if (notes) {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\n[REJECTED] ${notes}`
        : `[REJECTED] ${notes}`;
    } else {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\n[REJECTED] Order rejected by ${user.fullName}`
        : `[REJECTED] Order rejected by ${user.fullName}`;
    }

    await order.save();

    await AuditLog.create({
      user: rejectedBy,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Rejected order: ${order.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    await order.populate(
      "customer",
      "customerId businessName contactPersonName phone"
    );
    await order.populate("createdBy", "firstName lastName");

    return {
      success: true,
      data: { order },
      message: "Order rejected successfully",
    };
  }

  async assignDriver(
    orderId,
    driverId,
    assignedBy,
    notes = "",
    vehicleNumber = ""
  ) {
    const { User } = require("../models");

    const user = await User.findById(assignedBy).populate("role");
    if (!user) throw new Error("User not found");

    const hasManagePermission = await user.hasPermission("orders.manage");
    const isManagerOrAdmin = ["Manager", "Admin", "Super Admin"].includes(
      user.role?.name
    );

    if (!hasManagePermission && !isManagerOrAdmin) {
      throw new Error("Access denied: insufficient permissions");
    }

    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    if (order.status !== "approved") {
      throw new Error("Order must be approved before assigning a driver");
    }

    if (!driverId) {
      throw new Error("Driver ID is required");
    }

    const driverUser = await User.findById(driverId).populate("role");
    if (!driverUser) {
      throw new Error("Driver not found");
    }

    if (driverUser.role?.name !== "Driver") {
      throw new Error("Selected user is not assigned the Driver role");
    }

    const oldValues = order.toObject();

    order.status = "driver_assigned";
    order.driverAssignment = {
      driver: driverId,
      assignedAt: new Date(),
      driverNotes: notes || "",
      vehicleNumber: vehicleNumber || "",
    };
    order.updatedBy = assignedBy;

    await order.save();

    await AuditLog.create({
      user: assignedBy,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Assigned driver to order ${order.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    await order.populate("driverAssignment.driver", "firstName lastName phone");

    return {
      success: true,
      data: { order },
      message: "Driver assigned successfully",
    };
  }

  async unassignDriver(orderId, updatedBy, notes = "") {
    const { User } = require("../models");

    const user = await User.findById(updatedBy).populate("role");
    if (!user) throw new Error("User not found");

    const hasManagePermission = await user.hasPermission("orders.manage");
    const isManagerOrAdmin = ["Manager", "Admin", "Super Admin"].includes(
      user.role?.name
    );

    if (!hasManagePermission && !isManagerOrAdmin) {
      throw new Error("Access denied: insufficient permissions");
    }

    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    if (order.status !== "driver_assigned") {
      throw new Error("Cannot unassign driver in current order status");
    }

    const oldValues = order.toObject();

    order.status = "approved";
    order.driverAssignment = {};
    order.updatedBy = updatedBy;

    if (notes) {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\n[DRIVER REMOVED] ${notes}`
        : `[DRIVER REMOVED] ${notes}`;
    }

    await order.save();

    await AuditLog.create({
      user: updatedBy,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Unassigned driver from order ${order.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      data: { order },
      message: "Driver unassigned successfully",
    };
  }

  async markOutForDelivery(orderId, user, { notes = "", location } = {}) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    if (order.status !== "driver_assigned") {
      throw new Error(
        "Order must have an assigned driver before marking out for delivery"
      );
    }

    const isDriver = user.role?.name === "Driver";
    const isAssignedDriver =
      order.driverAssignment?.driver?.toString() === user._id.toString();

    const hasManagePermission = await require("../models")
      .User.findById(user._id)
      .then((u) => u.hasPermission("orders.manage"));
    const isManagerOrAdmin = ["Manager", "Admin", "Super Admin"].includes(
      user.role?.name
    );

    if (
      !hasManagePermission &&
      !isManagerOrAdmin &&
      !(isDriver && isAssignedDriver)
    ) {
      throw new Error("Access denied: Cannot mark this order out for delivery");
    }

    const oldValues = order.toObject();

    order.status = "out_for_delivery";
    order.driverAssignment = {
      ...order.driverAssignment,
      pickupAt: new Date(),
      pickupLocation: location,
      driverNotes: notes || order.driverAssignment?.driverNotes || "",
    };
    order.updatedBy = user._id;

    await order.save();

    await AuditLog.create({
      user: user._id,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Order ${order.orderNumber} marked out for delivery`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      data: { order },
      message: "Order marked out for delivery",
    };
  }

  async recordDelivery(orderId, user, payload = {}) {
    const order = await Order.findById(orderId);
    if (!order) throw new Error("Order not found");

    if (order.status !== "out_for_delivery") {
      throw new Error(
        "Order must be out for delivery before recording delivery"
      );
    }

    const isDriver = user.role?.name === "Driver";
    const isAssignedDriver =
      order.driverAssignment?.driver?.toString() === user._id.toString();

    const hasManagePermission = await require("../models")
      .User.findById(user._id)
      .then((u) => u.hasPermission("orders.manage"));
    const isManagerOrAdmin = ["Manager", "Admin", "Super Admin"].includes(
      user.role?.name
    );

    if (
      !hasManagePermission &&
      !isManagerOrAdmin &&
      !(isDriver && isAssignedDriver)
    ) {
      throw new Error("Access denied: Cannot mark this order as delivered");
    }

    if (!payload.signatures?.driver || !payload.signatures?.receiver) {
      throw new Error("Driver and receiver signatures are required");
    }

    const oldValues = order.toObject();

    // Calculate payment updates
    const amountCollected = payload.settlement?.amountCollected || 0;
    const newPaidAmount = (order.paidAmount || 0) + amountCollected;
    
    // Update payment status based on new paid amount
    let newPaymentStatus = order.paymentStatus;
    if (newPaidAmount >= order.totalAmount) {
      newPaymentStatus = "paid";
    } else if (newPaidAmount > 0) {
      newPaymentStatus = "partial";
    } else {
      newPaymentStatus = "pending";
    }

    order.status = "delivered";
    order.driverAssignment = {
      ...order.driverAssignment,
      deliveryAt: new Date(),
      deliveryLocation: payload.location,
    };
    order.signatures = payload.signatures;
    order.settlements = [
      {
        amountCollected: amountCollected,
        notes: payload.settlement?.notes || "",
        recordedBy: user._id,
        recordedAt: new Date(),
      },
    ];
    
    // Update payment fields
    order.paidAmount = newPaidAmount;
    order.paymentStatus = newPaymentStatus;
    order.updatedBy = user._id;

    await order.save();

    await AuditLog.create({
      user: user._id,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Order ${order.orderNumber} marked as delivered`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    await order.populate("driverAssignment.driver", "firstName lastName phone");

    return {
      success: true,
      data: { order },
      message: "Order marked as delivered",
    };
  }

  // Get pending orders for approval
  async getPendingOrdersForApproval(query = {}) {
    const {
      page = 1,
      limit = 10,
      search = "",
      dateFrom = "",
      dateTo = "",
      sortBy = "orderDate",
      sortOrder = "desc",
    } = query;

    // Build filter object for pending orders only
    const filter = { status: "pending" };

    if (search) {
      filter.$or = [{ orderNumber: { $regex: search, $options: "i" } }];
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.orderDate = {};
      if (dateFrom) {
        filter.orderDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Set end date to end of day (23:59:59.999) to include all orders on that date
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filter.orderDate.$lte = endDate;
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Execute queries
    const [orders, totalOrders, totalAmountSum] = await Promise.all([
      Order.find(filter)
        .populate("customer", "customerId businessName contactPersonName phone")
        .populate("createdBy", "firstName lastName")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(filter),
      Order.aggregate([
        { $match: filter },
        { $group: { _id: null, totalSum: { $sum: "$totalAmount" } } }
      ]).then(result => result.length > 0 ? result[0].totalSum : 0),
    ]);

    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    return {
      success: true,
      data: {
        orders,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          totalAmountSum,
          limit: parseInt(limit),
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      },
    };
  }

  // Move order to production
  async moveToProduction(orderId, userId, notes = "") {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status !== "approved") {
      throw new Error("Order must be approved before moving to production");
    }

    const oldValues = order.toObject();

    order.status = "processing";
    order.updatedBy = userId;

    if (notes) {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\n[PRODUCTION] ${notes}`
        : `[PRODUCTION] ${notes}`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: userId,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Moved order to production: ${order.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    await order.populate(
      "customer",
      "customerId businessName contactPersonName phone"
    );
    await order.populate("createdBy", "firstName lastName");
    await order.populate("approvedBy", "firstName lastName");

    return {
      success: true,
      data: { order },
      message: "Order moved to production successfully",
    };
  }

  // Mark order as ready for dispatch
  async markAsReady(orderId, userId, notes = "") {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status !== "processing") {
      throw new Error("Order must be in processing status");
    }

    const oldValues = order.toObject();

    order.status = "ready";
    order.updatedBy = userId;

    if (notes) {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\n[READY] ${notes}`
        : `[READY] ${notes}`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: userId,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Marked order as ready: ${order.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    await order.populate(
      "customer",
      "customerId businessName contactPersonName phone"
    );
    await order.populate("createdBy", "firstName lastName");
    await order.populate("approvedBy", "firstName lastName");

    return {
      success: true,
      data: { order },
      message: "Order marked as ready for dispatch",
    };
  }

  // Dispatch order
  async dispatchOrder(orderId, userId, notes = "") {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status !== "ready") {
      throw new Error("Order must be ready for dispatch");
    }

    const oldValues = order.toObject();

    order.status = "dispatched";
    order.dispatchDate = new Date();
    order.updatedBy = userId;

    if (notes) {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\n[DISPATCHED] ${notes}`
        : `[DISPATCHED] ${notes}`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: userId,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Dispatched order: ${order.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    await order.populate(
      "customer",
      "customerId businessName contactPersonName phone"
    );
    await order.populate("createdBy", "firstName lastName");
    await order.populate("approvedBy", "firstName lastName");

    return {
      success: true,
      data: { order },
      message: "Order dispatched successfully",
    };
  }

  // Mark order as delivered
  async markAsDelivered(orderId, userId, notes = "") {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status !== "dispatched") {
      throw new Error("Order must be dispatched before marking as delivered");
    }

    const oldValues = order.toObject();

    order.status = "delivered";
    order.deliveryDate = new Date();
    order.updatedBy = userId;

    if (notes) {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\n[DELIVERED] ${notes}`
        : `[DELIVERED] ${notes}`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: userId,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Marked order as delivered: ${order.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    await order.populate(
      "customer",
      "customerId businessName contactPersonName phone"
    );
    await order.populate("createdBy", "firstName lastName");
    await order.populate("approvedBy", "firstName lastName");

    return {
      success: true,
      data: { order },
      message: "Order marked as delivered",
    };
  }

  // Complete order
  async completeOrder(orderId, userId, notes = "") {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (order.status !== "delivered") {
      throw new Error("Order must be delivered before completing");
    }

    const oldValues = order.toObject();

    order.status = "completed";
    order.updatedBy = userId;

    if (notes) {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\n[COMPLETED] ${notes}`
        : `[COMPLETED] ${notes}`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: userId,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Completed order: ${order.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    await order.populate(
      "customer",
      "customerId businessName contactPersonName phone"
    );
    await order.populate("createdBy", "firstName lastName");
    await order.populate("approvedBy", "firstName lastName");

    return {
      success: true,
      data: { order },
      message: "Order completed successfully",
    };
  }

  // Cancel order
  async cancelOrder(orderId, userId, notes = "") {
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    if (!["pending", "approved", "processing"].includes(order.status)) {
      throw new Error("Cannot cancel order in current status");
    }

    const oldValues = order.toObject();

    order.status = "cancelled";
    order.updatedBy = userId;

    if (notes) {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\n[CANCELLED] ${notes}`
        : `[CANCELLED] ${notes}`;
    } else {
      order.internalNotes = order.internalNotes
        ? `${order.internalNotes}\n[CANCELLED] Order cancelled`
        : `[CANCELLED] Order cancelled`;
    }

    await order.save();

    // Log the action
    await AuditLog.create({
      user: userId,
      action: "UPDATE",
      module: "orders",
      resourceType: "Order",
      resourceId: order._id.toString(),
      oldValues,
      newValues: order.toObject(),
      description: `Cancelled order: ${order.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    await order.populate(
      "customer",
      "customerId businessName contactPersonName phone"
    );
    await order.populate("createdBy", "firstName lastName");
    await order.populate("approvedBy", "firstName lastName");

    return {
      success: true,
      data: { order },
      message: "Order cancelled successfully",
    };
  }

  // Get orders by status
  async getOrdersByStatus(status, query = {}, currentUser) {
    const {
      page = 1,
      limit = 10,
      search = "",
      dateFrom = "",
      dateTo = "",
      sortBy = "orderDate",
      sortOrder = "desc",
    } = query;

    // Build filter object
    const filter = { status };

    if (search) {
      filter.$or = [{ orderNumber: { $regex: search, $options: "i" } }];
    }

    // Date range filter
    if (dateFrom || dateTo) {
      filter.orderDate = {};
      if (dateFrom) {
        filter.orderDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Set end date to end of day (23:59:59.999) to include all orders on that date
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filter.orderDate.$lte = endDate;
      }
    }

    // Apply same role-based filtering as getAllOrders
    if (
      currentUser &&
      currentUser.role &&
      currentUser.role.name !== "Super Admin"
    ) {
      // Role-based filtering
      const roleName = currentUser.role.name;

      if (roleName === "Driver") {
        // Drivers can only see orders assigned to them
        filter["driverAssignment.driver"] = currentUser._id;
      } else if (["Sales Executive", "Staff"].includes(roleName)) {
        // Sales Executive and Staff: only show their own orders
        filter.createdBy = currentUser._id;
      } else {
        // Manager, Admin, and other roles: show orders from their accessible godowns
        const toIds = (arr) =>
          (arr || []).map((v) => (typeof v === "object" && v?._id ? v._id : v));
        const accessibleList = currentUser.accessibleGodowns?.length
          ? toIds(currentUser.accessibleGodowns)
          : currentUser.primaryGodown
          ? [
              typeof currentUser.primaryGodown === "object"
                ? currentUser.primaryGodown._id
                : currentUser.primaryGodown,
            ]
          : [];
        if (accessibleList && accessibleList.length > 0) {
          filter.godown = { $in: accessibleList };
        } else {
          // If user has no assigned godowns, show only their own orders as a fallback
          filter.createdBy = currentUser._id;
        }
      }
    }

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = { [sortBy]: sortOrder === "desc" ? -1 : 1 };

    // Execute queries
    const [orders, totalOrders, totalAmountSum] = await Promise.all([
      Order.find(filter)
        .populate("customer", "customerId businessName contactPersonName phone")
        .populate("createdBy", "firstName lastName")
        .populate("approvedBy", "firstName lastName")
        .populate("driverAssignment.driver", "firstName lastName phone")
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      Order.countDocuments(filter),
      Order.aggregate([
        { $match: filter },
        { $group: { _id: null, totalSum: { $sum: "$totalAmount" } } }
      ]).then(result => result.length > 0 ? result[0].totalSum : 0),
    ]);

    const totalPages = Math.ceil(totalOrders / parseInt(limit));

    return {
      success: true,
      data: {
        orders,
        status,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalOrders,
          totalAmountSum,
          limit: parseInt(limit),
          hasNext: parseInt(page) < totalPages,
          hasPrev: parseInt(page) > 1,
        },
      },
    };
  }

  // Get order statistics (supports optional godown scoping and all order filters)
  async getOrderStats(query = {}, currentUser) {
    const {
      search = "",
      status = "",
      paymentStatus = "",
      customerId = "",
      dateFrom = "",
      dateTo = "",
      priority = "",
      minAmount = "",
      maxAmount = "",
      godownId = "",
    } = query;

    const filter = {};
    
    // Apply search filter
    if (search) {
      filter.$or = [{ orderNumber: { $regex: search, $options: "i" } }];
    }

    // Apply status filter
    if (status) {
      filter.status = status;
    }

    // Apply payment status filter
    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }

    // Apply customer filter
    if (customerId) {
      filter.customer = new mongoose.Types.ObjectId(customerId);
    }

    // Apply priority filter
    if (priority) {
      filter.priority = priority;
    }

    // Apply amount range filter
    if (minAmount || maxAmount) {
      filter.totalAmount = {};
      if (minAmount) {
        filter.totalAmount.$gte = parseFloat(minAmount);
      }
      if (maxAmount) {
        filter.totalAmount.$lte = parseFloat(maxAmount);
      }
    }

    // Apply date range filter
    if (dateFrom || dateTo) {
      filter.orderDate = {};
      if (dateFrom) {
        filter.orderDate.$gte = new Date(dateFrom);
      }
      if (dateTo) {
        // Set end date to end of day (23:59:59.999) to include all orders on that date
        const endDate = new Date(dateTo);
        endDate.setHours(23, 59, 59, 999);
        filter.orderDate.$lte = endDate;
      }
    }
    
    // Priority 1: If godownId is provided and not empty, use it
    if (godownId && godownId !== "") {
      filter.godown = new mongoose.Types.ObjectId(godownId);
    } else if (currentUser && currentUser.role) {
      // Role-based filtering for non-super admins
      const roleName = currentUser.role.name;

      if (roleName === "Driver") {
        // Drivers can only see stats for orders assigned to them
        filter["driverAssignment.driver"] = currentUser._id;
      } else if (["Sales Executive", "Staff"].includes(roleName)) {
        // Sales Executive and Staff: only show their own order stats
        filter.createdBy = currentUser._id;
      } else if (roleName !== "Super Admin") {
        // Manager, Admin, and other roles: use godown hierarchy
        // Priority 2: Check for user's accessible godowns
        if (currentUser.accessibleGodowns && currentUser.accessibleGodowns.length > 0) {
          // Convert to ObjectIds if needed
          const accessibleIds = currentUser.accessibleGodowns.map(godown => 
            typeof godown === 'object' && godown._id ? godown._id : godown
          );
          filter.godown = { $in: accessibleIds };
        } 
        // Priority 3: Check for user's primary godown
        else if (currentUser.primaryGodown) {
          const primaryGodownId = typeof currentUser.primaryGodown === 'object' && currentUser.primaryGodown._id 
            ? currentUser.primaryGodown._id 
            : currentUser.primaryGodown;
          filter.godown = primaryGodownId;
        }
        // Priority 4: If no godowns assigned, show only their own stats as fallback
        else {
          filter.createdBy = currentUser._id;
        }
      }
      // Super Admin: No godown filter applied (shows all godowns)
    }
    console.log(filter);

    const startOfToday = new Date(new Date().setHours(0, 0, 0, 0));
    const startOfMonth = new Date(
      new Date().getFullYear(),
      new Date().getMonth(),
      1
    );

    const [
      totalOrders,
      totalVisits,
      pendingOrders,
      approvedOrders,
      completedOrders,
      rejectedOrders,
      todayOrders,
      todayVisits,
      monthlyRevenue,
    ] = await Promise.all([
      Order.countDocuments({ ...filter, type: "order" }),
      Order.countDocuments({ ...filter, type: "visit" }),
      Order.countDocuments({ ...filter, type: "order", status: "pending" }),
      Order.countDocuments({ ...filter, type: "order", status: "approved" }),
      Order.countDocuments({ ...filter, type: "order", status: "completed" }),
      Order.countDocuments({ ...filter, type: "order", status: "rejected" }),
      Order.countDocuments({
        ...filter,
        type: "order",
        orderDate: { $gte: startOfToday },
      }),
      Order.countDocuments({
        ...filter,
        type: "visit",
        orderDate: { $gte: startOfToday },
      }),
      Order.aggregate([
        {
          $match: {
            type: "order",
            orderDate: { $gte: startOfMonth },
            ...filter,
          },
        },
        { $group: { _id: null, total: { $sum: "$totalAmount" } } },
      ]).then((result) => (Array.isArray(result) && result[0]?.total) || 0),
    ]);

    return {
      success: true,
      data: {
        totalOrders,
        totalVisits,
        pendingOrders,
        approvedOrders,
        completedOrders,
        rejectedOrders,
        todayOrders,
        todayVisits,
        monthlyRevenue,
      },
    };
  }

  // Quick-order: expose catalog
  async getQuickProducts(requestingUser) {
    let godowns = [];

    if (requestingUser) {
      const godownIds = [];
      if (requestingUser.primaryGodown) {
        godownIds.push(requestingUser.primaryGodown);
      }
      if (Array.isArray(requestingUser.accessibleGodowns)) {
        requestingUser.accessibleGodowns.forEach((g) => godownIds.push(g));
      }

      if (godownIds.length > 0) {
        godowns = await Godown.find({ _id: { $in: godownIds } }).select(
          "location city name"
        );
      }
    }

    if (!godowns.length) {
      godowns = await Godown.find({ isActive: true }).select(
        "location city name"
      );
    }

    const products = getProductsForGodowns(godowns);

    return {
      success: true,
      data: { products },
    };
  }

  // Quick-order: create using product keys and simple qty inputs
  async createQuickOrder(quickData, createdBy) {
    let {
      customer,
      items = [],
      paymentTerms = "Cash",
      priority = "normal",
      notes = "",
      deliveryInstructions = "",
      paidAmount: inputPaidAmount,
      paymentStatus: inputPaymentStatus,
      capturedImage,
      captureLocation,
      godown,
    } = quickData || {};
    items = typeof items === "string" ? JSON.parse(items) : items;
    // Validate customer exists and active
    const customerDoc = await Customer.findById(customer);
    if (!customerDoc) throw new Error("Customer not found");
    if (!customerDoc.isActive) throw new Error("Customer is inactive");

    // Validate required fields for quick orders
    if (!capturedImage) {
      throw new Error("Captured image is required for quick orders");
    }
    if (!captureLocation) {
      throw new Error("Capture location is required for quick orders");
    }

    const userGodowns = [];
    const creator = await require("../models")
      .User.findById(createdBy)
      .populate("primaryGodown accessibleGodowns");
    if (creator?.primaryGodown) userGodowns.push(creator.primaryGodown);
    if (Array.isArray(creator?.accessibleGodowns))
      userGodowns.push(...creator.accessibleGodowns);

    let pricingGodown = null;
    if (quickData.godown) {
      pricingGodown = await Godown.findById(quickData.godown).select(
        "location city name"
      );
    }
    if (!pricingGodown && userGodowns.length > 0) {
      pricingGodown = userGodowns[0];
    }

    if (!pricingGodown) {
      throw new Error("Unable to determine godown for pricing");
    }

    const availableProducts = getProductsForGodown(pricingGodown);
    const productMap = availableProducts.reduce((acc, p) => {
      acc[p.key] = p;
      return acc;
    }, {});

    if (!Array.isArray(items) || items.length === 0) {
      throw new Error("At least one item is required");
    }

    const orderItems = items.map((it, idx) => {
      const product = productMap[it.productKey];
      if (!product) {
        throw new Error(
          `Product ${it.productKey} is not available for the selected godown`
        );
      }
      // Determine quantity in KG
      let quantityKg = 0;
      if (typeof it.quantityKg === "number" && it.quantityKg > 0) {
        quantityKg = it.quantityKg;
      } else if (
        typeof it.bags === "number" &&
        it.bags > 0 &&
        product.bagSizeKg
      ) {
        quantityKg = it.bags * product.bagSizeKg;
      } else if (
        typeof it.bagPieces === "number" &&
        it.bagPieces > 0 &&
        product.bagSizeKg
      ) {
        quantityKg = it.bagPieces * product.bagSizeKg;
      } else {
        throw new Error(`Quantity missing or invalid for item ${idx + 1}`);
      }

      const ratePerUnit = Number(product.pricePerKg);
      const totalAmount = quantityKg * ratePerUnit;

      return {
        productName: product.name,
        isBagSelection: it.isBagSelection,
        grade: "",
        quantity: quantityKg,
        unit: "KG",
        ratePerUnit,
        totalAmount,
        packaging: it.packaging || product.defaultPackaging || "Standard",
      };
    });

    // Compute totals to derive payment status
    const computedTotal = orderItems.reduce(
      (sum, it) => sum + (it.totalAmount || 0),
      0
    );
    const paidAmount = Math.max(0, Number(inputPaidAmount ?? 0));
    let paymentStatus = inputPaymentStatus;
    if (!paymentStatus) {
      if (paidAmount >= computedTotal) paymentStatus = "paid";
      else if (paidAmount > 0) paymentStatus = "partial";
      else paymentStatus = "pending";
    }

    const orderPayload = {
      customer,
      items: orderItems,
      discountPercentage: 0,
      discount: 0,
      taxAmount: 0,
      paymentTerms,
      priority,
      deliveryInstructions,
      notes,
      paidAmount,
      paymentStatus,
      capturedImage,
      captureLocation,
      godown,
    };

    // Reuse standard creation flow for validations, numbering and auditing
    return await this.createOrder(orderPayload, createdBy);
  }

  // Create visit
  async createVisit(visitData, createdBy) {
    const {
      customer: customerId,
      notes,
      scheduleDate,
      capturedImage,
      captureLocation,
    } = visitData;

    // Validate customer
    const customer = await Customer.findById(customerId);
    if (!customer) {
      throw new Error("Customer not found");
    }
    if (!customer.isActive) {
      throw new Error("Customer is inactive");
    }

    // Validate required visit fields
    if (!scheduleDate) {
      throw new Error("Schedule date is required for visits");
    }
    if (!capturedImage) {
      throw new Error("Captured image is required for visits");
    }
    if (!captureLocation) {
      throw new Error("Capture location is required for visits");
    }

    // Create visit
    const visit = new Order({
      type: "visit",
      customer: customerId,
      notes,
      scheduleDate: new Date(scheduleDate),
      capturedImage,
      captureLocation,
      createdBy,
      status: "pending",
      items: [], // Visits don't have items
      subtotal: 0,
      totalAmount: 0,
    });
    if (customer.assignedGodownId) {
      visit.godown = customer.assignedGodownId;
    }

    // If no godown explicitly provided, infer from user's primary
    if (!visit.godown && !customer.assignedGodownId) {
      try {
        const creator = await require("../models").User.findById(createdBy);
        if (creator?.primaryGodown) {
          visit.godown = creator.primaryGodown;
        }
      } catch {}
    }

    await visit.save();

    // Log the action
    await AuditLog.create({
      user: createdBy,
      action: "CREATE",
      module: "orders",
      resourceType: "Visit",
      resourceId: visit._id.toString(),
      newValues: visit.toObject(),
      description: `Created visit: ${visit.orderNumber}`,
      ipAddress: "0.0.0.0",
      userAgent: "System",
    });

    return {
      success: true,
      data: { order: visit },
      message: "Visit created successfully",
    };
  }
  // Get order audit trail
  async getOrderAuditTrail(orderId, page = 1, limit = 20) {
    // First check if order exists
    const order = await Order.findById(orderId);
    if (!order) {
      throw new Error("Order not found");
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get audit trail for this order with pagination
    const result = await AuditLog.getResourceAuditTrail("Order", orderId, {
      limit,
      skip,
    });

    return {
      success: true,
      message: "Order audit trail retrieved successfully",
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

  async getVisitAuditTrail(visitId, options = {}) {
    const { page = 1, limit = 10 } = options;

    // First check if visit exists and is of type 'visit'
    const visit = await Order.findById(visitId);
    if (!visit) {
      throw new Error("Visit not found");
    }

    if (visit.type !== "visit") {
      throw new Error("Invalid resource type - not a visit");
    }

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Get audit trail for this visit with pagination
    const result = await AuditLog.getResourceAuditTrail("Visit", visitId, {
      limit,
      skip,
    });

    return {
      success: true,
      message: "Visit audit trail retrieved successfully",
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

module.exports = new OrderService();
