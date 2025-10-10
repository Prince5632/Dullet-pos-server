const express = require('express');
const multer = require('multer');
const transitController = require('../controllers/transit.controller');
const { authenticate, authorize, authorizePermissionOrRole } = require('../middlewares/auth.middleware');

const router = express.Router();

// Configure multer for file uploads (attachments)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    // Allow documents and images
    const allowedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF, Word documents, and image files are allowed'), false);
    }
  }
});

/**
 * @swagger
 * components:
 *   schemas:
 *     ProductDetail:
 *       type: object
 *       required:
 *         - productId
 *         - productName
 *         - quantity
 *         - unit
 *       properties:
 *         productId:
 *           type: string
 *           description: Product ID reference
 *         productName:
 *           type: string
 *           description: Product name
 *         quantity:
 *           type: number
 *           minimum: 0
 *           description: Quantity of product
 *         unit:
 *           type: string
 *           enum: [Kg, Quintal]
 *           description: Unit of measurement
 *         additionalNote:
 *           type: string
 *           description: Additional notes for the product
 *     
 *     Transit:
 *       type: object
 *       required:
 *         - fromLocation
 *         - toLocation
 *         - dateOfDispatch
 *         - vehicleNumber
 *         - productDetails
 *       properties:
 *         transitId:
 *           type: string
 *           description: Auto-generated transit ID
 *         fromLocation:
 *           type: string
 *           description: Source godown ID
 *         toLocation:
 *           type: string
 *           description: Destination godown ID
 *         dateOfDispatch:
 *           type: string
 *           format: date
 *           description: Date of dispatch
 *         expectedArrivalDate:
 *           type: string
 *           format: date
 *           description: Expected arrival date
 *         vehicleNumber:
 *           type: string
 *           description: Vehicle number
 *         vehicleType:
 *           type: string
 *           enum: [Truck, Mini Truck, Van, Other]
 *           description: Type of vehicle
 *         driverId:
 *           type: string
 *           description: Driver user ID
 *         assignedTo:
 *           type: string
 *           description: Assigned user ID
 *         productDetails:
 *           type: array
 *           items:
 *             $ref: '#/components/schemas/ProductDetail'
 *           description: List of products being transported
 *         transporterName:
 *           type: string
 *           description: Name of the transporter
 *         remarks:
 *           type: string
 *           description: Additional remarks
 *         status:
 *           type: string
 *           enum: [New, In Transit, Received, Partially Received, Cancelled]
 *           description: Transit status
 */

/**
 * @swagger
 * /api/transits:
 *   get:
 *     summary: Get all transits with pagination and filtering
 *     description: Retrieve all transits with optional search, filtering, and pagination
 *     tags: [Transit Management]
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
 *         description: Number of transits per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by transit ID, vehicle number, or transporter name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [New, In Transit, Received, Partially Received, Cancelled]
 *         description: Filter by status
 *       - in: query
 *         name: fromLocation
 *         schema:
 *           type: string
 *         description: Filter by source location ID
 *       - in: query
 *         name: toLocation
 *         schema:
 *           type: string
 *         description: Filter by destination location ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by dispatch date from
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter by dispatch date to
 *       - in: query
 *         name: vehicleType
 *         schema:
 *           type: string
 *           enum: [Truck, Mini Truck, Van, Other]
 *         description: Filter by vehicle type
 *       - in: query
 *         name: assignedTo
 *         schema:
 *           type: string
 *         description: Filter by assigned user ID
 *       - in: query
 *         name: driverId
 *         schema:
 *           type: string
 *         description: Filter by driver ID
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort order
 *     responses:
 *       200:
 *         description: Transits retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate,authorize('transits.read'), transitController.getAllTransits);

/**
 * @swagger
 * /api/transits/stats:
 *   get:
 *     summary: Get transit statistics
 *     description: Get statistics about transit statuses
 *     tags: [Transit Management]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/stats', authenticate,authorize('transits.read'), transitController.getTransitStats);

/**
 * @swagger
 * /api/transits/pending:
 *   get:
 *     summary: Get pending transits
 *     description: Get transits with status 'New' or 'In Transit'
 *     tags: [Transit Management]
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
 *         description: Number of transits per page
 *     responses:
 *       200:
 *         description: Pending transits retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/pending', authenticate,authorize('transits.read'), transitController.getPendingTransits);

/**
 * @swagger
 * /api/transits/my:
 *   get:
 *     summary: Get my assigned transits
 *     description: Get transits assigned to the current user
 *     tags: [Transit Management]
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
 *         description: Number of transits per page
 *     responses:
 *       200:
 *         description: My transits retrieved successfully
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/my', authenticate,authorize('transits.read'), transitController.getMyTransits);

/**
 * @swagger
 * /api/transits/location/{locationId}:
 *   get:
 *     summary: Get transits by location
 *     description: Get transits from or to a specific location
 *     tags: [Transit Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: locationId
 *         required: true
 *         schema:
 *           type: string
 *         description: Location (godown) ID
 *       - in: query
 *         name: type
 *         schema:
 *           type: string
 *           enum: [from, to]
 *           default: from
 *         description: Whether to get transits from or to this location
 *     responses:
 *       200:
 *         description: Transits retrieved successfully
 *       400:
 *         description: Invalid type parameter
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/location/:locationId', authenticate,authorize('transits.read'), transitController.getTransitsByLocation);

/**
 * @swagger
 * /api/transits/transit-id/{transitId}:
 *   get:
 *     summary: Get transit by transit ID
 *     description: Get a specific transit by its transit ID (not MongoDB _id)
 *     tags: [Transit Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: transitId
 *         required: true
 *         schema:
 *           type: string
 *         description: Transit ID (e.g., T00001)
 *     responses:
 *       200:
 *         description: Transit retrieved successfully
 *       404:
 *         description: Transit not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/transit-id/:transitId', authenticate,authorize('transits.read'), transitController.getTransitByTransitId);

/**
 * @swagger
 * /api/transits/{id}:
 *   get:
 *     summary: Get transit by ID
 *     description: Get a specific transit by its MongoDB ID
 *     tags: [Transit Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transit MongoDB ID
 *     responses:
 *       200:
 *         description: Transit retrieved successfully
 *       404:
 *         description: Transit not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:id', authenticate,authorize('transits.read'), transitController.getTransitById);

/**
 * @swagger
 * /api/transits:
 *   post:
 *     summary: Create a new transit
 *     description: Create a new transit record
 *     tags: [Transit Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Transit'
 *     responses:
 *       201:
 *         description: Transit created successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Referenced resource not found
 *       500:
 *         description: Internal server error
 */
router.post('/', authenticate,authorize('transits.create'), upload.array('attachments', 10), transitController.createTransit);

/**
 * @swagger
 * /api/transits/bulk-status:
 *   patch:
 *     summary: Bulk update transit status
 *     description: Update status for multiple transits
 *     tags: [Transit Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - transitIds
 *               - status
 *             properties:
 *               transitIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of transit IDs to update
 *               status:
 *                 type: string
 *                 enum: [New, In Transit, Received, Partially Received, Cancelled]
 *                 description: New status for all transits
 *     responses:
 *       200:
 *         description: Bulk update completed
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.patch('/bulk-status', authenticate,authorize('transits.update'), transitController.bulkUpdateTransitStatus);

/**
 * @swagger
 * /api/transits/{id}/status:
 *   patch:
 *     summary: Update transit status
 *     description: Update the status of a specific transit
 *     tags: [Transit Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transit ID
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
 *                 enum: [New, In Transit, Received, Partially Received, Cancelled]
 *                 description: New status
 *     responses:
 *       200:
 *         description: Status updated successfully
 *       400:
 *         description: Invalid status or transition
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Transit not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:id/status', authenticate,authorize('transits.update'), transitController.updateTransitStatus);

/**
 * @swagger
 * /api/transits/{id}/assign-driver:
 *   patch:
 *     summary: Assign driver to transit
 *     description: Assign a driver to a specific transit
 *     tags: [Transit Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transit ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - driverId
 *             properties:
 *               driverId:
 *                 type: string
 *                 description: Driver user ID
 *     responses:
 *       200:
 *         description: Driver assigned successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Transit or driver not found
 *       500:
 *         description: Internal server error
 */
router.patch('/:id/assign-driver', authenticate,authorize('transits.update'), transitController.assignDriver);

/**
 * @swagger
 * /api/transits/{id}:
 *   put:
 *     summary: Update transit
 *     description: Update a specific transit
 *     tags: [Transit Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transit ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             $ref: '#/components/schemas/Transit'
 *     responses:
 *       200:
 *         description: Transit updated successfully
 *       400:
 *         description: Validation error
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Transit not found
 *       500:
 *         description: Internal server error
 */
router.put('/:id', authenticate,authorize('transits.update'), transitController.updateTransit);

/**
 * @swagger
 * /api/transits/{id}:
 *   delete:
 *     summary: Delete transit
 *     description: Delete a specific transit (only for New or Cancelled status)
 *     tags: [Transit Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Transit ID
 *     responses:
 *       200:
 *         description: Transit deleted successfully
 *       400:
 *         description: Cannot delete transit with current status
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Access denied
 *       404:
 *         description: Transit not found
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', authenticate,authorize('transits.delete'), transitController.deleteTransit);

module.exports = router;