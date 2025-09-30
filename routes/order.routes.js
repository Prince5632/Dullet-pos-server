const express = require('express');
const multer = require('multer');
const orderController = require('../controllers/order.controller');
const { authenticate, authorize, authorizePermissionOrRole } = require('../middlewares/auth.middleware');

const router = express.Router();

// Configure multer for visit image upload
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

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
 * /api/orders/quick/products:
 *   get:
 *     summary: Get quick-order product catalog
 *     description: Fetch predefined quick-order products with pricing
 *     tags: [Order Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Quick-order products retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/quick/products', authenticate, authorize('orders.read'), orderController.getQuickProducts);

/**
 * @swagger
 * /api/orders/quick:
 *   post:
 *     summary: Create new order (Quick)
 *     description: Create a new order from quick-order payload
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
 *             properties:
 *               customer:
 *                 type: string
 *                 description: Customer ID
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [productKey]
 *                   properties:
 *                     productKey:
 *                       type: string
 *                     quantityKg:
 *                       type: number
 *                       description: Quantity in KG (alternative to bags)
 *                     bags:
 *                       type: number
 *                       description: Number of bags (multiplied by product bagSizeKg)
 *                     packaging:
 *                       type: string
 *               paymentTerms:
 *                 type: string
 *                 enum: [Cash, Credit, Advance]
 *               priority:
 *                 type: string
 *                 enum: [low, normal, high, urgent]
 *               paidAmount:
 *                 type: number
 *                 example: 5000
 *                 description: Amount paid at creation time
 *               paymentStatus:
 *                 type: string
 *                 enum: [pending, partial, paid, overdue]
 *                 description: If omitted, it will be derived from paidAmount vs total
 *               notes:
 *                 type: string
 *               deliveryInstructions:
 *                 type: string
 *     responses:
 *       201:
 *         description: Order created successfully
 *       400:
 *         description: Invalid request data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post('/quick', authenticate, authorize('orders.create'), orderController.createQuickOrder);

/**
 * @swagger
 * /api/orders/visits:
 *   get:
 *     summary: Get all visits
 *     description: Retrieve all visits with pagination and filtering
 *     tags: [Visit Management]
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
 *         description: Number of visits per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by visit number
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
 *         description: Filter visits from this date
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter visits to this date
 *     responses:
 *       200:
 *         description: Visits retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/visits', authenticate, authorize('orders.read'), orderController.getVisits);

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

// Summary stats (supports godownId in query)
router.get('/stats/summary', authenticate, authorize('orders.read'), orderController.getOrderStats);

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
router.patch('/:id/approve', authenticate, authorize('orders.approve'), orderController.approveOrder);

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
router.patch('/:id/reject', authenticate, authorize('orders.approve'), orderController.rejectOrder);

router.patch('/:id/assign-driver', authenticate, authorize('orders.manage'), orderController.assignDriver);
router.patch('/:id/unassign-driver', authenticate, authorize('orders.manage'), orderController.unassignDriver);
// Allow Managers/Admins via permission and Drivers by role; service validates assigned driver
router.patch(
  '/:id/out-for-delivery',
  authenticate,
  authorizePermissionOrRole('orders.manage', ['Manager', 'Admin', 'Super Admin', 'Driver']),
  orderController.markOutForDelivery
);
router.patch(
  '/:id/record-delivery',
  authenticate,
  authorizePermissionOrRole('orders.manage', ['Manager', 'Admin', 'Super Admin', 'Driver']),
  orderController.recordDelivery
);

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



/**
 * @swagger
 * /api/orders/visits:
 *   post:
 *     summary: Create new visit
 *     description: Create a new visit with customer, schedule date, notes, image, and location
 *     tags: [Visit Management]
 *     security:
 *       - bearerAuth: []
 *     consumes:
 *       - multipart/form-data
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - customer
 *               - scheduleDate
 *               - capturedImage
 *               - captureLocation
 *             properties:
 *               customer:
 *                 type: string
 *                 description: Customer ID
 *               scheduleDate:
 *                 type: string
 *                 format: date
 *                 description: Scheduled date for the visit
 *               notes:
 *                 type: string
 *                 description: Additional notes for the visit
 *               capturedImage:
 *                 type: string
 *                 format: binary
 *                 description: Captured image file
 *               captureLocation:
 *                 type: string
 *                 description: JSON string containing location data (latitude, longitude, address, timestamp)
 *     responses:
 *       201:
 *         description: Visit created successfully
 *       400:
 *         description: Invalid input data
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post('/visits', authenticate, authorize('orders.create'), upload.single('capturedImage'), orderController.createVisit);

module.exports = router;

