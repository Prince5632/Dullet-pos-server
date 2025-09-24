const express = require('express');
const customerController = require('../controllers/customer.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/customers:
 *   get:
 *     summary: Get all customers with pagination and filtering
 *     description: Retrieve all customers with optional search, filtering, and pagination
 *     tags: [Customer Management]
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
 *         description: Number of customers per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in business name, contact person, phone, or customer ID
 *       - in: query
 *         name: customerType
 *         schema:
 *           type: string
 *           enum: [Retailer, Distributor, Wholesaler]
 *         description: Filter by customer type
 *       - in: query
 *         name: isActive
 *         schema:
 *           type: boolean
 *         description: Filter by active status
 *     responses:
 *       200:
 *         description: Customers retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/', authenticate, authorize('customers.read'), customerController.getAllCustomers);

/**
 * @swagger
 * /api/customers/{id}:
 *   get:
 *     summary: Get customer by ID
 *     description: Retrieve customer details by ID
 *     tags: [Customer Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer retrieved successfully
 *       404:
 *         description: Customer not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/:id', authenticate, authorize('customers.read'), customerController.getCustomerById);

/**
 * @swagger
 * /api/customers:
 *   post:
 *     summary: Create new customer
 *     description: Create a new customer record
 *     tags: [Customer Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - businessName
 *               - contactPersonName
 *               - phone
 *               - address
 *             properties:
 *               businessName:
 *                 type: string
 *                 example: "Sharma General Store"
 *               contactPersonName:
 *                 type: string
 *                 example: "Rajesh Sharma"
 *               email:
 *                 type: string
 *                 example: "rajesh@sharmastore.com"
 *               phone:
 *                 type: string
 *                 example: "9876543210"
 *               alternatePhone:
 *                 type: string
 *                 example: "9876543211"
 *               address:
 *                 type: object
 *                 required:
 *                   - street
 *                   - city
 *                   - pincode
 *                 properties:
 *                   street:
 *                     type: string
 *                     example: "Main Market, Near Bus Stand"
 *                   city:
 *                     type: string
 *                     example: "Ludhiana"
 *                   state:
 *                     type: string
 *                     example: "Punjab"
 *                   pincode:
 *                     type: string
 *                     example: "141001"
 *               gstNumber:
 *                 type: string
 *                 example: "03ABCDE1234F1Z5"
 *               panNumber:
 *                 type: string
 *                 example: "ABCDE1234F"
 *               creditLimit:
 *                 type: number
 *                 example: 50000
 *               creditDays:
 *                 type: number
 *                 example: 30
 *               customerType:
 *                 type: string
 *                 enum: [Retailer, Distributor, Wholesaler]
 *                 example: "Retailer"
 *               notes:
 *                 type: string
 *                 example: "Regular customer, prefers wheat flour grade A"
 *     responses:
 *       201:
 *         description: Customer created successfully
 *       400:
 *         description: Invalid request data
 *       409:
 *         description: Customer with phone number already exists
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post('/', authenticate, authorize('customers.create'), customerController.createCustomer);

/**
 * @swagger
 * /api/customers/{id}:
 *   put:
 *     summary: Update customer
 *     description: Update customer details
 *     tags: [Customer Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               businessName:
 *                 type: string
 *               contactPersonName:
 *                 type: string
 *               email:
 *                 type: string
 *               phone:
 *                 type: string
 *               alternatePhone:
 *                 type: string
 *               address:
 *                 type: object
 *               gstNumber:
 *                 type: string
 *               panNumber:
 *                 type: string
 *               creditLimit:
 *                 type: number
 *               creditDays:
 *                 type: number
 *               customerType:
 *                 type: string
 *                 enum: [Retailer, Distributor, Wholesaler]
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Customer updated successfully
 *       404:
 *         description: Customer not found
 *       400:
 *         description: Invalid request data
 *       409:
 *         description: Phone number already exists
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id', authenticate, authorize('customers.update'), customerController.updateCustomer);

/**
 * @swagger
 * /api/customers/{id}:
 *   delete:
 *     summary: Deactivate customer
 *     description: Soft delete (deactivate) a customer
 *     tags: [Customer Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer deactivated successfully
 *       404:
 *         description: Customer not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.delete('/:id', authenticate, authorize('customers.delete'), customerController.deleteCustomer);

/**
 * @swagger
 * /api/customers/{id}/activate:
 *   put:
 *     summary: Reactivate customer
 *     description: Reactivate a deactivated customer
 *     tags: [Customer Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
 *     responses:
 *       200:
 *         description: Customer reactivated successfully
 *       404:
 *         description: Customer not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id/activate', authenticate, authorize('customers.update'), customerController.reactivateCustomer);

/**
 * @swagger
 * /api/customers/stats:
 *   get:
 *     summary: Get customer statistics
 *     description: Get customer statistics and counts
 *     tags: [Customer Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Customer statistics retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/stats/summary', authenticate, authorize('customers.read'), customerController.getCustomerStats);

module.exports = router;

