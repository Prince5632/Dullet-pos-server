const express = require('express');
const multer = require('multer');
const attendanceController = require('../controllers/attendance.controller');
const { authenticate, authorize } = require('../middlewares/auth.middleware');

const router = express.Router();

// Configure multer for attendance image upload
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
 * /api/attendance:
 *   get:
 *     summary: Get all attendance records
 *     description: Retrieve attendance records with role-based filtering and pagination
 *     tags: [Attendance]
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
 *         name: search
 *         schema:
 *           type: string
 *         description: Search in user name, email, or employee ID
 *       - in: query
 *         name: userId
 *         schema:
 *           type: string
 *         description: Filter by user ID
 *       - in: query
 *         name: godownId
 *         schema:
 *           type: string
 *         description: Filter by godown ID
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [present, late, half_day, absent]
 *         description: Filter by attendance status
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for date range filter
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for date range filter
 *     responses:
 *       200:
 *         description: Attendance records retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/', authenticate, authorize('attendance.read'), attendanceController.getAllAttendance);

/**
 * @swagger
 * /api/attendance/stats:
 *   get:
 *     summary: Get attendance statistics
 *     description: Retrieve attendance statistics with role-based filtering
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date
 *         description: Start date for statistics
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date
 *         description: End date for statistics
 *       - in: query
 *         name: godownId
 *         schema:
 *           type: string
 *         description: Filter by godown ID
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/stats', authenticate, authorize('attendance.read'), attendanceController.getAttendanceStats);

/**
 * @swagger
 * /api/attendance/today:
 *   get:
 *     summary: Get today's attendance for current user
 *     description: Retrieve today's attendance record for the authenticated user
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Today's attendance retrieved successfully
 *       404:
 *         description: No attendance record found for today
 *       401:
 *         description: Authentication required
 */
router.get('/today', authenticate, attendanceController.getTodaysAttendance);

/**
 * @swagger
 * /api/attendance/today/{userId}:
 *   get:
 *     summary: Get today's attendance for specific user
 *     description: Retrieve today's attendance record for a specific user (managers only)
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *         description: User ID
 *     responses:
 *       200:
 *         description: Today's attendance retrieved successfully
 *       404:
 *         description: No attendance record found for today
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/today/:userId', authenticate, authorize('attendance.read'), attendanceController.getTodaysAttendance);

/**
 * @swagger
 * /api/attendance/check-in:
 *   post:
 *     summary: Mark attendance (check-in)
 *     description: Mark attendance with image capture for check-in
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID (optional, defaults to current user)
 *               checkInImage:
 *                 type: string
 *                 format: binary
 *                 description: Check-in image
 *               location:
 *                 type: string
 *                 description: JSON string of location data
 *               notes:
 *                 type: string
 *                 description: Optional notes
 *               isAutoMarked:
 *                 type: boolean
 *                 description: Whether attendance was auto-marked on login
 *     responses:
 *       201:
 *         description: Attendance marked successfully
 *       409:
 *         description: Attendance already marked for today
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post('/check-in', authenticate, authorize('attendance.create'), upload.single('checkInImage'), attendanceController.markAttendance);

/**
 * @swagger
 * /api/attendance/check-out:
 *   post:
 *     summary: Mark check-out for today
 *     description: Mark check-out for today's attendance with image capture
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               userId:
 *                 type: string
 *                 description: User ID (optional, defaults to current user)
 *               checkOutImage:
 *                 type: string
 *                 format: binary
 *                 description: Check-out image
 *               location:
 *                 type: string
 *                 description: JSON string of location data
 *     responses:
 *       200:
 *         description: Check-out marked successfully
 *       404:
 *         description: No check-in record found for today
 *       409:
 *         description: Already checked out for today
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post('/check-out', authenticate, authorize('attendance.create'), upload.single('checkOutImage'), attendanceController.markTodaysCheckOut);

/**
 * @swagger
 * /api/attendance/{id}:
 *   get:
 *     summary: Get attendance by ID
 *     description: Retrieve a specific attendance record by ID
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Attendance ID
 *     responses:
 *       200:
 *         description: Attendance record retrieved successfully
 *       404:
 *         description: Attendance record not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get('/:id', authenticate, authorize('attendance.read'), attendanceController.getAttendanceById);

/**
 * @swagger
 * /api/attendance/{id}/check-out:
 *   patch:
 *     summary: Mark check-out for specific attendance
 *     description: Mark check-out for a specific attendance record with image capture
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Attendance ID
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               checkOutImage:
 *                 type: string
 *                 format: binary
 *                 description: Check-out image
 *               location:
 *                 type: string
 *                 description: JSON string of location data
 *     responses:
 *       200:
 *         description: Check-out marked successfully
 *       404:
 *         description: Attendance record not found
 *       409:
 *         description: Already checked out
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.patch('/:id/check-out', authenticate, authorize('attendance.update'), upload.single('checkOutImage'), attendanceController.markCheckOut);

/**
 * @swagger
 * /api/attendance/{id}:
 *   put:
 *     summary: Update attendance record
 *     description: Update an attendance record (managers and above only)
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Attendance ID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 enum: [present, late, half_day, absent]
 *                 description: Attendance status
 *               notes:
 *                 type: string
 *                 description: Notes
 *               checkInTime:
 *                 type: string
 *                 format: date-time
 *                 description: Check-in time
 *               checkOutTime:
 *                 type: string
 *                 format: date-time
 *                 description: Check-out time
 *     responses:
 *       200:
 *         description: Attendance updated successfully
 *       404:
 *         description: Attendance record not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.put('/:id', authenticate, authorize('attendance.update'), attendanceController.updateAttendance);

/**
 * @swagger
 * /api/attendance/{id}:
 *   delete:
 *     summary: Delete attendance record
 *     description: Delete an attendance record (admin only)
 *     tags: [Attendance]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Attendance ID
 *     responses:
 *       200:
 *         description: Attendance record deleted successfully
 *       404:
 *         description: Attendance record not found
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.delete('/:id', authenticate, authorize('attendance.delete'), attendanceController.deleteAttendance);

module.exports = router;
