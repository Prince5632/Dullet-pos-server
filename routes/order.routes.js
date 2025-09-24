const express = require('express');
const orderController = require('../controllers/order.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

/**
 * @swagger
 * /api/orders:
 *   get:
 *     summary: Get all orders with pagination and filtering
 *     description: Retrieve all orders with optional search, filtering, and pagination
 *     tags: [Order Management]
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
 *         description: Number of orders per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by order number
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, processing, ready, dispatched, delivered, completed, cancelled]
 *         description: Filter by order status
 *       - in: query
 *         name: paymentStatus
 *         schema:
 *           type: string
 *           enum: [pending, partial, paid, overdue]
 *         description: Filter by payment status
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
 *         description: Filter orders from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter orders to this date
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/', authenticate, authorize('orders.read'), orderController.getAllOrders);

/**
 * @swagger
 * /api/orders/{id}:
 *   get:
 *     summary: Get order by ID
 *     description: Retrieve order details by ID
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     responses:
 *       200:
 *         description: Order retrieved successfully
 *       404:
 *         description: Order not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/:id', authenticate, authorize('orders.read'), orderController.getOrderById);

/**
 * @swagger
 * /api/orders:
 *   post:
 *     summary: Create new order
 *     description: Create a new order record
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - customer
 *               - items
 *               - paymentTerms
 *             properties:
 *               customer:
 *                 type: string
 *                 description: Customer ID
 *                 example: "60d5ecb8b392c72b8c8b4567"
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - productName
 *                     - quantity
 *                     - unit
 *                     - ratePerUnit
 *                     - totalAmount
 *                   properties:
 *                     productName:
 *                       type: string
 *                       enum: [Wheat Flour, Wheat Bran, Custom Product]
 *                       example: "Wheat Flour"
 *                     grade:
 *                       type: string
 *                       example: "Grade A"
 *                     quantity:
 *                       type: number
 *                       example: 100
 *                     unit:
 *                       type: string
 *                       enum: [KG, Quintal, Ton, Bags]
 *                       example: "KG"
 *                     ratePerUnit:
 *                       type: number
 *                       example: 25
 *                     totalAmount:
 *                       type: number
 *                       example: 2500
 *                     packaging:
 *                       type: string
 *                       enum: [Standard, Custom, 25kg Bags, 50kg Bags]
 *                       example: "25kg Bags"
 *               discountPercentage:
 *                 type: number
 *                 example: 5
 *               taxAmount:
 *                 type: number
 *                 example: 125
 *               paymentTerms:
 *                 type: string
 *                 enum: [Cash, Credit, Advance]
 *                 example: "Credit"
 *               requiredDate:
 *                 type: string
 *                 format: date
 *                 example: "2024-02-15"
 *               deliveryAddress:
 *                 type: object
 *                 properties:
 *                   street:
 *                     type: string
 *                   city:
 *                     type: string
 *                   state:
 *                     type: string
 *                   pincode:
 *                     type: string
 *               deliveryInstructions:
 *                 type: string
 *                 example: "Deliver between 10 AM to 4 PM"
 *               notes:
 *                 type: string
 *                 example: "Regular customer order"
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Invalid request data or customer not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post('/', authenticate, authorize('orders.create'), orderController.createOrder);

/**
 * @swagger
 * /api/orders/{id}:
 *   put:
 *     summary: Update order
 *     description: Update order details
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *               discountPercentage:
 *                 type: number
 *               taxAmount:
 *                 type: number
 *               paymentTerms:
 *                 type: string
 *                 enum: [Cash, Credit, Advance]
 *               requiredDate:
 *                 type: string
 *                 format: date
 *               deliveryAddress:
 *                 type: object
 *               deliveryInstructions:
 *                 type: string
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Order updated successfully
 *       404:
 *         description: Order not found
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id', authenticate, authorize('orders.update'), orderController.updateOrder);

/**
 * @swagger
 * /api/orders/{id}/status:
 *   put:
 *     summary: Update order status
 *     description: Update order status with optional notes
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - status
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [pending, approved, rejected, processing, ready, dispatched, delivered, completed, cancelled]
 *                 example: "approved"
 *               notes:
 *                 type: string
 *                 example: "Order approved by manager"
 *     responses:
 *       200:
 *         description: Order status updated successfully
 *       404:
 *         description: Order not found
 *       400:
 *         description: Invalid status or request data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id/status', authenticate, authorize('orders.update'), orderController.updateOrderStatus);

/**
 * @swagger
 * /api/orders/{id}/approve:
 *   put:
 *     summary: Approve order
 *     description: Approve a pending order (Manager and Admin only)
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 example: "Order approved for production"
 *     responses:
 *       200:
 *         description: Order approved successfully
 *       404:
 *         description: Order not found
 *       400:
 *         description: Order not in pending status or insufficient permissions
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id/approve', authenticate, authorize('orders.approve'), orderController.approveOrder);

/**
 * @swagger
 * /api/orders/{id}/reject:
 *   put:
 *     summary: Reject order
 *     description: Reject a pending order (Manager and Admin only)
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 example: "Insufficient stock available"
 *     responses:
 *       200:
 *         description: Order rejected successfully
 *       404:
 *         description: Order not found
 *       400:
 *         description: Order not in pending status or insufficient permissions
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id/reject', authenticate, authorize('orders.approve'), orderController.rejectOrder);

/**
 * @swagger
 * /api/orders/pending/approval:
 *   get:
 *     summary: Get pending orders for approval
 *     description: Get list of orders pending approval (Manager and Admin only)
 *     tags: [Order Management]
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
 *         description: Number of orders per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by order number
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter orders from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter orders to this date
 *     responses:
 *       200:
 *         description: Pending orders retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/pending/approval', authenticate, authorize('orders.approve'), orderController.getPendingOrdersForApproval);

/**
 * @swagger
 * /api/orders/{id}/production:
 *   put:
 *     summary: Move order to production
 *     description: Move approved order to production status
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 example: "Started production batch #123"
 *     responses:
 *       200:
 *         description: Order moved to production successfully
 *       404:
 *         description: Order not found
 *       400:
 *         description: Order not in approved status
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id/production', authenticate, authorize('orders.update'), orderController.moveToProduction);

/**
 * @swagger
 * /api/orders/{id}/ready:
 *   put:
 *     summary: Mark order as ready for dispatch
 *     description: Mark processing order as ready for dispatch
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 example: "Quality check completed, ready for dispatch"
 *     responses:
 *       200:
 *         description: Order marked as ready successfully
 *       404:
 *         description: Order not found
 *       400:
 *         description: Order not in processing status
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id/ready', authenticate, authorize('orders.update'), orderController.markAsReady);

/**
 * @swagger
 * /api/orders/{id}/dispatch:
 *   put:
 *     summary: Dispatch order
 *     description: Dispatch ready order to customer
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 example: "Dispatched via truck ABC123"
 *     responses:
 *       200:
 *         description: Order dispatched successfully
 *       404:
 *         description: Order not found
 *       400:
 *         description: Order not ready for dispatch
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id/dispatch', authenticate, authorize('orders.update'), orderController.dispatchOrder);

/**
 * @swagger
 * /api/orders/{id}/delivered:
 *   put:
 *     summary: Mark order as delivered
 *     description: Mark dispatched order as delivered
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 example: "Delivered and signed by customer"
 *     responses:
 *       200:
 *         description: Order marked as delivered successfully
 *       404:
 *         description: Order not found
 *       400:
 *         description: Order not dispatched
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id/delivered', authenticate, authorize('orders.update'), orderController.markAsDelivered);

/**
 * @swagger
 * /api/orders/{id}/complete:
 *   put:
 *     summary: Complete order
 *     description: Mark delivered order as completed
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 example: "Order completed successfully"
 *     responses:
 *       200:
 *         description: Order completed successfully
 *       404:
 *         description: Order not found
 *       400:
 *         description: Order not delivered
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id/complete', authenticate, authorize('orders.update'), orderController.completeOrder);

/**
 * @swagger
 * /api/orders/{id}/cancel:
 *   put:
 *     summary: Cancel order
 *     description: Cancel order (only if in pending, approved, or processing status)
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Order ID
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               notes:
 *                 type: string
 *                 example: "Customer requested cancellation"
 *     responses:
 *       200:
 *         description: Order cancelled successfully
 *       404:
 *         description: Order not found
 *       400:
 *         description: Cannot cancel order in current status
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id/cancel', authenticate, authorize('orders.update'), orderController.cancelOrder);

/**
 * @swagger
 * /api/orders/status/{status}:
 *   get:
 *     summary: Get orders by status
 *     description: Get orders filtered by specific status
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: status
 *         required: true
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, processing, ready, dispatched, delivered, completed, cancelled]
 *         description: Order status
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
 *         description: Number of orders per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by order number
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter orders from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter orders to this date
 *     responses:
 *       200:
 *         description: Orders retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/status/:status', authenticate, authorize('orders.read'), orderController.getOrdersByStatus);

/**
 * @swagger
 * /api/orders/customer/{customerId}/history:
 *   get:
 *     summary: Get customer order history
 *     description: Get order history for a specific customer
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: customerId
 *         required: true
 *         schema:
 *           type: string
 *         description: Customer ID
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
 *         description: Number of orders per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by order status
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter orders from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter orders to this date
 *     responses:
 *       200:
 *         description: Customer order history retrieved successfully
 *       404:
 *         description: Customer not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/customer/:customerId/history', authenticate, authorize('orders.read'), orderController.getCustomerOrderHistory);

/**
 * @swagger
 * /api/orders/stats/summary:
 *   get:
 *     summary: Get order statistics
 *     description: Get order statistics and counts
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Order statistics retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/stats/summary', authenticate, authorize('orders.read'), orderController.getOrderStats);

module.exports = router;

