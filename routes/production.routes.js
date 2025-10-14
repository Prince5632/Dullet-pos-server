const express = require('express');
const multer = require('multer');
const productionController = require('../controllers/production.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

// Configure multer for file uploads (attachments)
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 2 * 1024 * 1024 // 2MB limit to match frontend validation
  },
  fileFilter: (req, file, cb) => {
    // Allow only image files
    const allowedTypes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp'
    ];
    
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

/**
 * @swagger
 * /api/production:
 *   get:
 *     summary: Get all production records with pagination and filtering
 *     description: Retrieve all production records with optional search, filtering, and pagination
 *     tags: [Production Management]
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
 *         description: Number of production records per page
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in batch ID, location, or input type
 *       - in: query
 *         name: shift
 *         schema:
 *           type: string
 *           enum: [Morning, Afternoon, Night]
 *         description: Filter by shift
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Filter by location
 *       - in: query
 *         name: operator
 *         schema:
 *           type: string
 *         description: Filter by operator ID
 *       - in: query
 *         name: dateFrom
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter production records from this date (YYYY-MM-DD)
 *       - in: query
 *         name: dateTo
 *         schema:
 *           type: string
 *           format: date
 *         description: Filter production records to this date (YYYY-MM-DD)
 *     responses:
 *       200:
 *         description: Production records retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Production'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page:
 *                       type: integer
 *                     limit:
 *                       type: integer
 *                     total:
 *                       type: integer
 *                     pages:
 *                       type: integer
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/', authenticate,authorize('production.read'), productionController.getAllProduction);

/**
 * @swagger
 * /api/production/stats:
 *   get:
 *     summary: Get production statistics
 *     description: Get statistics about production records
 *     tags: [Production Management]
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
router.get('/stats', authenticate,authorize('production.read'), productionController.getProductionStats);

/**
 * @swagger
 * /api/production/{id}:
 *   get:
 *     summary: Get production record by ID
 *     description: Retrieve a specific production record by its ID
 *     tags: [Production Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Production record ID
 *     responses:
 *       200:
 *         description: Production record retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Production'
 *       404:
 *         description: Production record not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:id', authenticate,authorize('production.read'), productionController.getProductionById);

/**
 * @swagger
 * /api/production:
 *   post:
 *     summary: Create a new production record
 *     description: Create a new production record with auto-generated batch ID
 *     tags: [Production Management]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - productionDate
 *               - shift
 *               - location
 *               - operator
 *               - inputType
 *               - inputQty
 *               - inputUnit
 *               - outputDetails
 *             properties:
 *               productionDate:
 *                 type: string
 *                 description: Production date
 *               shift:
 *                 type: string
 *                 enum: [Morning, Afternoon, Night]
 *                 description: Production shift
 *               location:
 *                 type: string
 *                 description: Production location
 *               machine:
 *                 type: string
 *                 description: Machine used (optional)
 *               operator:
 *                 type: string
 *                 description: Operator user ID
 *               inputType:
 *                 type: string
 *                 description: Type of input material
 *               inputQty:
 *                 type: number
 *                 description: Input quantity
 *               inputUnit:
 *                 type: string
 *                 enum: [kg, quintal, ton, bags, pieces]
 *                 description: Input unit
 *               outputDetails:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required:
 *                     - itemName
 *                     - productQty
 *                     - productUnit
 *                   properties:
 *                     itemName:
 *                       type: string
 *                       enum: [Atta, Chokar, Wastage]
 *                       description: Output item name
 *                     productQty:
 *                       type: number
 *                       description: Product quantity
 *                     productUnit:
 *                       type: string
 *                       enum: [kg, quintal, ton, bags, pieces]
 *                       description: Product unit
 *                     notes:
 *                       type: string
 *                       description: Additional notes (optional)
 *               remarks:
 *                 type: string
 *                 description: General remarks (optional)
 *     responses:
 *       201:
 *         description: Production record created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Production'
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.post('/', authenticate, authorize('production.create'), upload.array('attachments', 10), productionController.createProduction);

/**
 * @swagger
 * /api/production/{id}:
 *   put:
 *     summary: Update production record
 *     description: Update an existing production record
 *     tags: [Production Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Production record ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productionDate:
 *                 type: string
 *                 description: Production date
 *               shift:
 *                 type: string
 *                 enum: [Morning, Afternoon, Night]
 *                 description: Production shift
 *               location:
 *                 type: string
 *                 description: Production location
 *               machine:
 *                 type: string
 *                 description: Machine used
 *               operator:
 *                 type: string
 *                 description: Operator user ID
 *               inputType:
 *                 type: string
 *                 description: Type of input material
 *               inputQty:
 *                 type: number
 *                 description: Input quantity
 *               inputUnit:
 *                 type: string
 *                 enum: [kg, quintal, ton, bags, pieces]
 *                 description: Input unit
 *               outputDetails:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     itemName:
 *                       type: string
 *                       enum: [Atta, Chokar, Wastage]
 *                       description: Output item name
 *                     productQty:
 *                       type: number
 *                       description: Product quantity
 *                     productUnit:
 *                       type: string
 *                       enum: [kg, quintal, ton, bags, pieces]
 *                       description: Product unit
 *                     notes:
 *                       type: string
 *                       description: Additional notes
 *               remarks:
 *                 type: string
 *                 description: General remarks
 *     responses:
 *       200:
 *         description: Production record updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/Production'
 *       404:
 *         description: Production record not found
 *       400:
 *         description: Bad request - validation error
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put('/:id', authenticate, authorize('production.update'), upload.array('attachments', 10), productionController.updateProduction);

/**
 * @swagger
 * /api/production/{id}/audit-trail:
 *   get:
 *     summary: Get production audit trail
 *     description: Retrieve the audit trail (activity log) for a specific production
 *     tags: [Production Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Production ID
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
 *           default: 20
 *         description: Number of items per page
 *     responses:
 *       200:
 *         description: Production audit trail retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                   example: "Production audit trail retrieved successfully"
 *                 data:
 *                   type: object
 *                   properties:
 *                     activities:
 *                       type: array
 *                       items:
 *                         type: object
 *                     pagination:
 *                       type: object
 *       404:
 *         description: Production not found
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.get('/:id/audit-trail', authenticate, authorize('production.read'), productionController.getProductionAuditTrail);

/**
 * @swagger
 * /api/production/{id}:
 *   delete:
 *     summary: Delete production record
 *     description: Delete a production record (admin only)
 *     tags: [Production Management]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Production record ID
 *     responses:
 *       200:
 *         description: Production record deleted successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       404:
 *         description: Production record not found
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden - admin access required
 *       500:
 *         description: Internal server error
 */
router.delete('/:id', authenticate,authorize('production.delete'), productionController.deleteProduction);

/**
 * @swagger
 * components:
 *   schemas:
 *     Production:
 *       type: object
 *       properties:
 *         _id:
 *           type: string
 *           description: Production record ID
 *         batchId:
 *           type: string
 *           description: Auto-generated batch ID
 *         productionDate:
 *           type: string
 *           description: Production date
 *         shift:
 *           type: string
 *           enum: [Morning, Afternoon, Night]
 *           description: Production shift
 *         location:
 *           type: string
 *           description: Production location
 *         machine:
 *           type: string
 *           description: Machine used
 *         operator:
 *           type: object
 *           description: Operator details
 *         inputType:
 *           type: string
 *           description: Type of input material
 *         inputQty:
 *           type: number
 *           description: Input quantity
 *         inputUnit:
 *           type: string
 *           enum: [kg, quintal, ton, bags, pieces]
 *           description: Input unit
 *         outputDetails:
 *           type: array
 *           items:
 *             type: object
 *             properties:
 *               itemName:
 *                 type: string
 *                 enum: [Atta, Chokar, Wastage]
 *                 description: Output item name
 *               productQty:
 *                 type: number
 *                 description: Product quantity
 *               productUnit:
 *                 type: string
 *                 enum: [kg, quintal, ton, bags, pieces]
 *                 description: Product unit
 *               notes:
 *                 type: string
 *                 description: Additional notes
 *         remarks:
 *           type: string
 *           description: General remarks
 *         createdBy:
 *           type: object
 *           description: User who created the record
 *         totalOutputQty:
 *           type: number
 *           description: Total output quantity (virtual field)
 *         conversionEfficiency:
 *           type: string
 *           description: Conversion efficiency percentage (virtual field)
 *         createdAt:
 *           type: string
 *           format: date-time
 *           description: Creation timestamp
 *         updatedAt:
 *           type: string
 *           format: date-time
 *           description: Last update timestamp
 */

module.exports = router;