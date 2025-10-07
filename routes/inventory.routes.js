const express = require('express');
const inventoryController = require('../controllers/inventory.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/inventory:
 *   get:
 *     summary: Get all inventory records with pagination and filtering
 *     description: Retrieve all inventory records with optional search, filtering, and pagination
 *     tags: [Inventory Management]
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
 *         description: Number of records per page
 *       - in: query
 *         name: inventoryType
 *         schema:
 *           type: string
 *           enum: [New Stock, Stock Sold, Damaged / Return]
 *         description: Filter by inventory type
 *       - in: query
 *         name: godown
 *         schema:
 *           type: string
 *         description: Filter by godown ID
 *       - in: query
 *         name: unit
 *         schema:
 *           type: string
 *           enum: [Kg, Quintal]
 *         description: Filter by unit
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter records from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter records to this date
 *       - in: query
 *         name: loggedBy
 *         schema:
 *           type: string
 *         description: Filter by user who logged the record
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in additional notes
 *     responses:
 *       200:
 *         description: Inventory records retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate, authorize('stock.read'), inventoryController.getAllInventory);

/**
 * @swagger
 * /api/inventory/{id}:
 *   get:
 *     summary: Get inventory record by ID
 *     description: Retrieve a specific inventory record by its ID
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory record ID
 *     responses:
 *       200:
 *         description: Inventory record retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Inventory record not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id', authenticate, authorize('stock.read'), inventoryController.getInventoryById);

/**
 * @swagger
 * /api/inventory:
 *   post:
 *     summary: Create new inventory record
 *     description: Create a new inventory record
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - inventoryType
 *               - dateOfStock
 *               - quantity
 *               - unit
 *             properties:
 *               inventoryType:
 *                 type: string
 *                 enum: [New Stock, Stock Sold, Damaged / Return]
 *                 description: Type of inventory transaction
 *               dateOfStock:
 *                 type: string
 *                 format: date
 *                 description: Date of the stock transaction
 *               quantity:
 *                 type: number
 *                 description: Quantity of stock
 *               unit:
 *                 type: string
 *                 enum: [Kg, Quintal]
 *                 description: Unit of measurement
 *               godown:
 *                 type: string
 *                 description: Godown ID (optional)
 *               pricePerKg:
 *                 type: number
 *                 description: Price per kilogram (optional)
 *               additionalNotes:
 *                 type: string
 *                 description: Additional notes (optional)
 *     responses:
 *       201:
 *         description: Inventory record created successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.post('/', authenticate, authorize('stock.create'), inventoryController.createInventory);

/**
 * @swagger
 * /api/inventory/{id}:
 *   put:
 *     summary: Update inventory record
 *     description: Update an existing inventory record
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               inventoryType:
 *                 type: string
 *                 enum: [New Stock, Stock Sold, Damaged / Return]
 *                 description: Type of inventory transaction
 *               dateOfStock:
 *                 type: string
 *                 format: date
 *                 description: Date of the stock transaction
 *               quantity:
 *                 type: number
 *                 description: Quantity of stock
 *               unit:
 *                 type: string
 *                 enum: [Kg, Quintal]
 *                 description: Unit of measurement
 *               godown:
 *                 type: string
 *                 description: Godown ID
 *               pricePerKg:
 *                 type: number
 *                 description: Price per kilogram
 *               additionalNotes:
 *                 type: string
 *                 description: Additional notes
 *     responses:
 *       200:
 *         description: Inventory record updated successfully
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Inventory record not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id', authenticate, authorize('stock.update'), inventoryController.updateInventory);

/**
 * @swagger
 * /api/inventory/{id}:
 *   delete:
 *     summary: Delete inventory record
 *     description: Permanently delete an inventory record
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory record ID
 *     responses:
 *       200:
 *         description: Inventory record deleted successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Inventory record not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', authenticate, authorize('stock.delete'), inventoryController.deleteInventory);

/**
 * @swagger
 * /api/inventory/stats/summary:
 *   get:
 *     summary: Get inventory statistics
 *     description: Get comprehensive inventory statistics
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: godown
 *         schema:
 *           type: string
 *         description: Filter by godown ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter records from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter records to this date
 *     responses:
 *       200:
 *         description: Inventory statistics retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.get('/stats/summary', authenticate, authorize('stock.read'), inventoryController.getInventoryStats);

/**
 * @swagger
 * /api/inventory/godown/{godownId}:
 *   get:
 *     summary: Get inventory records by godown
 *     description: Retrieve inventory records for a specific godown
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: godownId
 *         required: true
 *         schema:
 *           type: string
 *         description: Godown ID
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
 *         description: Number of records per page
 *       - in: query
 *         name: inventoryType
 *         schema:
 *           type: string
 *           enum: [New Stock, Stock Sold, Damaged / Return]
 *         description: Filter by inventory type
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter records from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter records to this date
 *     responses:
 *       200:
 *         description: Inventory records retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       500:
 *         description: Internal server error
 */
router.get('/godown/:godownId', authenticate, authorize('stock.read'), inventoryController.getInventoryByGodown);

/**
 * @swagger
 * /api/inventory/{id}/audit-trail:
 *   get:
 *     summary: Get inventory audit trail
 *     description: Retrieve the audit trail for a specific inventory record
 *     tags: [Inventory Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Inventory record ID
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
 *         description: Number of activities per page
 *     responses:
 *       200:
 *         description: Inventory audit trail retrieved successfully
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Inventory record not found
 *       500:
 *         description: Internal server error
 */
router.get('/:id/audit-trail', authenticate, authorize('stock.read'), inventoryController.getInventoryAuditTrail);

module.exports = router;