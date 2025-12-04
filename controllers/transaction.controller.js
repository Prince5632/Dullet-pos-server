const transactionService = require('../services/transaction.service');
const { createResponse } = require('../utils/response');

class TransactionController {
  /**
   * Get all transactions with pagination and filtering
   */
  async getAllTransactions(req, res) {
    try {
      const result = await transactionService.getAllTransactions(req.query);
      res.status(200).json(result);
    } catch (error) {
      console.error('Error in getAllTransactions controller:', error);
      res.status(500).json(createResponse(false, 'Internal server error', null, 500));
    }
  }

  /**
   * Get transaction by ID
   */
  async getTransactionById(req, res) {
    try {
      const { id } = req.params;
      
      if (!id) {
        return res.status(400).json(createResponse(false, 'Transaction ID is required', null, 400));
      }

      const result = await transactionService.getTransactionById(id);
      
      if (!result.success) {
        return res.status(result.statusCode || 404).json(result);
      }

      res.status(200).json(result);
    } catch (error) {
      console.error('Error in getTransactionById controller:', error);
      
      // Handle invalid ObjectId error
      if (error.name === 'CastError') {
        return res.status(400).json(createResponse(false, 'Invalid transaction ID format', null, 400));
      }
      
      res.status(500).json(createResponse(false, 'Internal server error', null, 500));
    }
  }

  /**
   * Create new transaction
   */
  async createTransaction(req, res) {
    try {
      const userId = req.user?.id;
      
      if (!userId) {
        return res.status(401).json(createResponse(false, 'User authentication required', null, 401));
      }

      const result = await transactionService.createTransaction(req.body, userId);
      
      if (!result.success) {
        return res.status(result.statusCode || 400).json(result);
      }

      res.status(201).json(result);
    } catch (error) {
      console.error('Error in createTransaction controller:', error);
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => err.message);
        return res.status(400).json(createResponse(false, 'Validation error', { errors: validationErrors }, 400));
      }
      
      // Handle duplicate key error
      if (error.code === 11000) {
        return res.status(400).json(createResponse(false, 'Transaction with this ID already exists', null, 400));
      }
      
      res.status(500).json(createResponse(false, 'Internal server error', null, 500));
    }
  }

  /**
   * Allocate customer payment across orders
   */
  async allocateCustomerPayment(req, res) {
    try {
      const userId = req.user?.id;
      if (!userId) {
        return res.status(401).json(createResponse(false, 'User authentication required', null, 401));
      }
      const { customerId, amountPaid,orderIds=[], paymentMode, transactionDate } = req.body || {};
      const result = await transactionService.allocateCustomerPayment({ customerId, amountPaid,orderIds, paymentMode, transactionDate }, userId);
      return res.status(result.statusCode || (result.success ? 200 : 400)).json(result);
    } catch (error) {
      console.error('Error in allocateCustomerPayment controller:', error);
      res.status(500).json(createResponse(false, 'Internal server error', null, 500));
    }
  }
}

module.exports = new TransactionController();