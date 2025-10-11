const express = require('express');
const transactionController = require('../controllers/transaction.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/transactions:
 *   get:
 *     summary: Get all transactions with pagination and filtering
 *     description: Retrieve all transactions with optional search, filtering, and pagination
 *     tags: [Transaction Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *         description: Number of transactions per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by transaction ID
 *       - in: query
 *         name: transactionMode
 *         schema:
 *           type: string
 *           enum: [Cash, Credit, Cheque, Online]
 *         description: Filter by transaction mode
 *       - in: query
 *         name: transactionForModel
 *         schema:
 *           type: string
 *           enum: [Order, Customer]
 *         description: Filter by transaction reference model
 *       - in: query
 *         name: customerId
 *         schema:
 *           type: string
 *         description: Filter by customer ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter transactions from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter transactions to this date
 *     responses:
 *       200:
 *         description: Transactions retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     transactions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           _id:
 *                             type: string
 *                           transactionId:
 *                             type: string
 *                           transactionDate:
 *                             type: string
 *                             format: date-time
 *                           transactionMode:
 *                             type: string
 *                             enum: [Cash, Credit, Cheque, Online]
 *                           transactionForModel:
 *                             type: string
 *                             enum: [Order, Customer]
 *                           transactionFor:
 *                             type: array
 *                             items:
 *                               type: string
 *                           customer:
 *                             type: object
 *                           createdBy:
 *                             type: object
 *                           amountPaid:
 *                             type: number
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         currentPage:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalItems:
 *                           type: integer
 *                         itemsPerPage:
 *                           type: integer
 *                         hasMore:
 *                           type: boolean
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, transactionController.getAllTransactions);

/**
 * @swagger
 * /api/transactions/{id}:
 *   get:
 *     summary: Get transaction by ID
 *     description: Retrieve a specific transaction by its ID
 *     tags: [Transaction Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transaction ID
 *     responses:
 *       200:
 *         description: Transaction retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         transactionId:
 *                           type: string
 *                         transactionDate:
 *                           type: string
 *                           format: date-time
 *                         transactionMode:
 *                           type: string
 *                           enum: [Cash, Credit, Cheque, Online]
 *                         transactionForModel:
 *                           type: string
 *                           enum: [Order, Customer]
 *                         transactionFor:
 *                           type: array
 *                           items:
 *                             type: object
 *                         customer:
 *                           type: object
 *                         createdBy:
 *                           type: object
 *                         amountPaid:
 *                           type: number
 *       400:
 *         description: Invalid transaction ID format
 *       401:
 *         description: Authentication required
 *       404:
 *         description: Transaction not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', authenticate, transactionController.getTransactionById);

/**
 * @swagger
 * /api/transactions:
 *   post:
 *     summary: Create new transaction
 *     description: Create a new transaction record
 *     tags: [Transaction Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transactionMode
 *               - transactionForModel
 *               - transactionFor
 *               - amountPaid
 *             properties:
 *               transactionMode:
 *                 type: string
 *                 enum: [Cash, Credit, Cheque, Online]
 *                 description: Payment method used
 *               transactionForModel:
 *                 type: string
 *                 enum: [Order, Customer]
 *                 description: Type of reference (Order or Customer)
 *               transactionFor:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: IDs of the referenced Orders or Customers
 *               customer:
 *                 type: string
 *                 description: Customer ID (optional, helps with queries)
 *               amountPaid:
 *                 type: number
 *                 minimum: 0.01
 *                 description: Amount paid in the transaction
 *               transactionDate:
 *                 type: string
 *                 format: date-time
 *                 description: Transaction date (defaults to current date)
 *     responses:
 *       201:
 *         description: Transaction created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     transaction:
 *                       type: object
 *                       properties:
 *                         _id:
 *                           type: string
 *                         transactionId:
 *                           type: string
 *                         transactionDate:
 *                           type: string
 *                           format: date-time
 *                         transactionMode:
 *                           type: string
 *                         transactionForModel:
 *                           type: string
 *                         transactionFor:
 *                           type: object
 *                         customer:
 *                           type: object
 *                         createdBy:
 *                           type: object
 *                         amountPaid:
 *                           type: number
 *       400:
 *         description: Validation error or missing required fields
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.post('/', authenticate, transactionController.createTransaction);

/**
 * @swagger
 * /api/transactions/allocate/customer:
 *   post:
 *     summary: Allocate a customer payment across unpaid/partial orders
 *     description: Applies payment to oldest unpaid orders first; updates orders and creates a transaction referencing affected orders.
 *     tags: [Transaction Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [customerId, amountPaid, paymentMode]
 *             properties:
 *               customerId:
 *                 type: string
 *               amountPaid:
 *                 type: number
 *                 minimum: 0.01
 *               paymentMode:
 *                 type: string
 *                 enum: [Cash, Credit, Cheque, Online]
 *               transactionDate:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Payment allocated and transaction created
 *       200:
 *         description: No orders affected but request processed
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       500:
 *         description: Internal server error
 */
router.post('/allocate/customer', authenticate, transactionController.allocateCustomerPayment);

module.exports = router;