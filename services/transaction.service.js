const Transaction = require('../models/transaction.schema');
const { createResponse } = require('../utils/response');

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
        transactionDate
      } = transactionData;

      // Validate required fields
      if (!transactionMode || !transactionForModel || !transactionFor || !amountPaid) {
        return createResponse(false, 'Missing required fields: transactionMode, transactionForModel, transactionFor, amountPaid', null, 400);
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
        transactionFor,
        customer,
        amountPaid,
        createdBy: userId,
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
}

module.exports = new TransactionService();