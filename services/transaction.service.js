const Transaction = require('../models/transaction.schema');
const { createResponse } = require('../utils/response');
const { Order } = require('../models');
const mongoose = require('mongoose');

class TransactionService {
  /**
   * Get all transactions with pagination and filtering
   */
  async getAllTransactions(query = {}) {
    try {
      const {
        page = 1,
        limit = 10,
        search,
        transactionMode,
        transactionForModel,
        dateFrom,
        dateTo,
        customerId
      } = query;

      const skip = (page - 1) * limit;
      const filter = {};

      // Search by transaction ID
      if (search) {
        filter.transactionId = { $regex: search, $options: 'i' };
      }

      // Filter by transaction mode
      if (transactionMode) {
        filter.transactionMode = transactionMode;
      }

      // Filter by transaction for model (Order/Customer)
      if (transactionForModel) {
        filter.transactionForModel = transactionForModel;
      }

      // Filter by customer
      if (customerId) {
        filter.customer = customerId;
      }

      // Date range filter
      if (dateFrom || dateTo) {
        filter.transactionDate = {};
        if (dateFrom) {
          filter.transactionDate.$gte = new Date(dateFrom);
        }
        if (dateTo) {
          filter.transactionDate.$lte = new Date(dateTo);
        }
      }

      const transactions = await Transaction.find(filter)
        .populate('customer', 'businessName customerId phone')
        .populate('createdBy', 'firstName lastName employeeId')
        .populate('transactionFor')
        .sort({ transactionDate: -1 })
        .skip(skip)
        .limit(parseInt(limit))
        .lean();

      const totalTransactions = await Transaction.countDocuments(filter);
      const totalPages = Math.ceil(totalTransactions / limit);

      return createResponse(true, 'Transactions retrieved successfully', {
        transactions,
        pagination: {
          currentPage: parseInt(page),
          totalPages,
          totalItems: totalTransactions,
          itemsPerPage: parseInt(limit),
          hasMore: page < totalPages
        }
      });
    } catch (error) {
      console.error('Error in getAllTransactions:', error);
      throw error;
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(transactionId) {
    try {
      const transaction = await Transaction.findById(transactionId)
        .populate('customer', 'businessName customerId phone email address')
        .populate('createdBy', 'firstName lastName employeeId email')
        .populate('transactionFor')
        .lean();

      if (!transaction) {
        return createResponse(false, 'Transaction not found', null, 404);
      }

      return createResponse(true, 'Transaction retrieved successfully', { transaction });
    } catch (error) {
      console.error('Error in getTransactionById:', error);
      throw error;
    }
  }

  /**
   * Create new transaction
   */
  async createTransaction(transactionData, userId) {
    try {
      const {
        transactionMode,
        transactionForModel,
        transactionFor,
        customer,
        amountPaid,
        transactionDate,
        createdFromService,
      } = transactionData;
      console.log()
      // Normalize transactionFor to an array
      const transactionForArray = Array.isArray(transactionFor)
        ? transactionFor
        : (transactionFor ? [transactionFor] : []);

      // Validate required fields
      if (!transactionMode || !transactionForModel || transactionForArray.length === 0 || !amountPaid) {
        return createResponse(false, 'Missing required fields: transactionMode, transactionForModel, transactionFor (array), amountPaid', null, 400);
      }

      // Validate transaction mode
      const validModes = ['Cash', 'Credit', 'Cheque', 'Online'];
      if (!validModes.includes(transactionMode)) {
        return createResponse(false, 'Invalid transaction mode. Must be one of: Cash, Credit, Cheque, Online', null, 400);
      }

      // Validate transaction for model
      const validModels = ['Order', 'Customer'];
      if (!validModels.includes(transactionForModel)) {
        return createResponse(false, 'Invalid transactionForModel. Must be either Order or Customer', null, 400);
      }

      // Validate amount
      if (amountPaid <= 0) {
        return createResponse(false, 'Amount paid must be greater than 0', null, 400);
      }

      // Create transaction object
      const newTransaction = new Transaction({
        transactionMode,
        transactionForModel,
        transactionFor: transactionForArray,
        customer,
        amountPaid,
        createdBy: userId,
        createdFromService,
        transactionDate: transactionDate || new Date()
      });

      // Save transaction
      const savedTransaction = await newTransaction.save();

      // Populate the saved transaction for response
      const populatedTransaction = await Transaction.findById(savedTransaction._id)
        .populate('customer', 'businessName customerId phone')
        .populate('createdBy', 'firstName lastName employeeId')
        .populate('transactionFor')
        .lean();

      return createResponse(true, 'Transaction created successfully', { transaction: populatedTransaction }, 201);
    } catch (error) {
      console.error('Error in createTransaction:', error);
      
      // Handle duplicate transaction ID error
      if (error.code === 11000 && error.keyPattern?.transactionId) {
        return createResponse(false, 'Transaction ID already exists. Please try again.', null, 400);
      }
      
      throw error;
    }
  }

  /**
   * Allocate a customer payment across unpaid/partial orders (oldest first)
   * - Fully pays oldest orders first, then partially pays next if amount remains
   * - Updates paymentStatus/paidAmount and overrides paymentTerms with selected mode
   * - Creates a single transaction referencing affected order IDs
   */
  async allocateCustomerPayment({ customerId, amountPaid, orderIds=[], paymentMode, transactionDate }, userId) {
    try {
      // Basic validation
      if (!customerId) {
        return createResponse(false, 'customerId is required', null, 400);
      }
      if (!amountPaid || amountPaid <= 0) {
        return createResponse(false, 'amountPaid must be greater than 0', null, 400);
      }
      const validModes = ['Cash', 'Credit', 'Cheque', 'Online'];
      if (!paymentMode || !validModes.includes(paymentMode)) {
        return createResponse(false, 'Invalid payment mode', null, 400);
      }

      const session = await mongoose.startSession();
      let affectedOrderIds = [];
      let remainingAmount = amountPaid;

      await session.withTransaction(async () => {
        // Build query for orders
        let orderQuery = {
          customer: customerId,
          type: 'order',
          paymentStatus: { $in: ['pending', 'partial', 'overdue'] },
        };

        // If specific orderIds are provided, filter by those IDs
        if (orderIds && orderIds.length > 0) {
          orderQuery._id = { $in: orderIds };
        }

        // Find orders (either specific ones or all unpaid), oldest first
        const orders = await Order.find(orderQuery)
          .sort({ orderDate: 1 })
          .select('_id totalAmount paidAmount paymentStatus paymentTerms')
          .session(session);

        for (const ord of orders) {
          if (remainingAmount <= 0) break;
          const alreadyPaid = ord.paidAmount || 0;
          const remainingForOrder = Math.max(0, (ord.totalAmount || 0) - alreadyPaid);
          if (remainingForOrder <= 0) continue;

          if (remainingAmount >= remainingForOrder) {
            // Fully pay this order
            const nextPaidAmount = alreadyPaid + remainingForOrder;
            await Order.updateOne(
              { _id: ord._id },
              {
                $set: {
                  paidAmount: nextPaidAmount,
                  paymentStatus: 'paid',
                  paymentTerms: paymentMode
                }
              },
              { session }
            );
            affectedOrderIds.push(ord._id);
            remainingAmount -= remainingForOrder;
          } else if (remainingAmount > 0) {
            // Partially pay this order and stop
            const nextPaidAmount = alreadyPaid + remainingAmount;
            await Order.updateOne(
              { _id: ord._id },
              {
                $set: {
                  paidAmount: nextPaidAmount,
                  paymentStatus: 'partial',
                  paymentTerms: paymentMode
                }
              },
              { session }
            );
            affectedOrderIds.push(ord._id);
            remainingAmount = 0;
            break;
          }
        }

        // Create transaction only if any orders affected
        if (affectedOrderIds.length > 0) {
          const newTransaction = new Transaction({
            transactionMode: paymentMode,
            transactionForModel: 'Order',
            transactionFor: affectedOrderIds,
            customer: customerId,
            amountPaid,
            createdBy: userId,
            createdFromService: "transaction",
            transactionDate: transactionDate || new Date(),
          });
          await newTransaction.save({ session });
        }
      });
      session.endSession();

      // Populate transaction for response (last transaction created for this customer)
      let populatedTransaction = null;
      if (affectedOrderIds.length > 0) {
        populatedTransaction = await Transaction.findOne({
          customer: customerId,
        })
          .sort({ createdAt: -1 })
          .populate('customer', 'businessName customerId phone')
          .populate('createdBy', 'firstName lastName employeeId')
          .populate('transactionFor')
          .lean();
      }

      return createResponse(true, 'Payment allocated successfully', {
        transaction: populatedTransaction,
        affectedOrderIds,
        affectedOrdersCount: affectedOrderIds.length,
        unallocatedAmount: Math.max(0, remainingAmount),
      }, affectedOrderIds.length > 0 ? 201 : 200);
    } catch (error) {
      console.error('Error in allocateCustomerPayment:', error);
      throw error;
    }
  }
}

module.exports = new TransactionService();