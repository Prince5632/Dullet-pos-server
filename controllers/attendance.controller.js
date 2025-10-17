const attendanceService = require('../services/attendance.service');
const { uploadToS3, uploadBase64ToS3 } = require('../utils/s3Upload');

const uploadAttendanceImage = async ({ file, base64Input, folder, userId, type }) => {
  if (!file && !base64Input) {
    return null;
  }

  if (file) {
    const fileName = file.originalname || `${type}-${userId || 'user'}-${Date.now()}`;
    const mimeType = file.mimetype || 'image/jpeg';
    const result = await uploadToS3(file.buffer, fileName, mimeType, folder);
    return result.fileUrl;
  }

  const base64String = base64Input || '';
  const dataPrefixMatch = base64String.match(/^data:(.*?);base64,/);
  const mimeType = dataPrefixMatch ? dataPrefixMatch[1] : 'image/jpeg';
  const normalizedBase64 = base64String.startsWith('data:')
    ? base64String
    : `data:${mimeType};base64,${base64String}`;
  const extension = mimeType.split('/')[1] || 'jpg';
  const fileName = `${type}-${userId || 'user'}-${Date.now()}.${extension}`;

  const result = await uploadBase64ToS3(normalizedBase64, fileName, mimeType, folder);
  return result.fileUrl;
};

// Get all attendance records
const getAllAttendance = async (req, res) => {
  try {
    const result = await attendanceService.getAllAttendance(req.query, req.user);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get attendance by ID
const getAttendanceById = async (req, res) => {
  try {
    const result = await attendanceService.getAttendanceById(req.params.id, req.user);
    res.status(200).json(result);
  } catch (error) {
    const statusCode = error.message.includes('not found') ? 404 : 
                      error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

// Mark attendance (check-in)
const markAttendance = async (req, res) => {
  try {
    const targetUserId = req.body.userId || req.user._id;
    const checkInImageUrl = await uploadAttendanceImage({
      file: req.file,
      base64Input: req.body.checkInImage,
      folder: 'attendance/checkin',
      userId: targetUserId,
      type: 'checkin'
    });

    const attendanceData = {
      userId: targetUserId,
      checkInImage: checkInImageUrl,
      location: req.body.location ? JSON.parse(req.body.location) : null,
      notes: req.body.notes || '',
      isAutoMarked: req.body.isAutoMarked === 'true',
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    };

    const result = await attendanceService.markAttendance(attendanceData, req.user);
    res.status(201).json(result);
  } catch (error) {
    const statusCode = error.message.includes('already marked') ? 409 :
                      error.message.includes('Access denied') ? 403 :
                      error.message.includes('not found') ? 404 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

// Mark check-out
const markCheckOut = async (req, res) => {
  try {
    const checkOutImageUrl = await uploadAttendanceImage({
      file: req.file,
      base64Input: req.body.checkOutImage,
      folder: 'attendance/checkout',
      userId: req.user?._id,
      type: 'checkout'
    });

    const checkOutData = {
      checkOutImage: checkOutImageUrl,
      location: req.body.location ? JSON.parse(req.body.location) : null
    };

    const result = await attendanceService.markCheckOut(req.params.id, checkOutData, req.user);
    res.status(200).json(result);
  } catch (error) {
    const statusCode = error.message.includes('not found') ? 404 :
                      error.message.includes('Already checked out') ? 409 :
                      error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

// Update attendance record
const updateAttendance = async (req, res) => {
  try {
    const result = await attendanceService.updateAttendance(req.params.id, req.body, req.user);
    res.status(200).json(result);
  } catch (error) {
    const statusCode = error.message.includes('not found') ? 404 :
                      error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

// Delete attendance record
const deleteAttendance = async (req, res) => {
  try {
    const result = await attendanceService.deleteAttendance(req.params.id, req.user);
    res.status(200).json(result);
  } catch (error) {
    const statusCode = error.message.includes('not found') ? 404 :
                      error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

// Get attendance statistics
const getAttendanceStats = async (req, res) => {
  try {
    const result = await attendanceService.getAttendanceStats(req.query, req.user);
    res.status(200).json(result);
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Get today's attendance for current user
const getTodaysAttendance = async (req, res) => {
  try {
    const userId = req.params.userId || req.user._id;
    const attendance = await attendanceService.getTodaysAttendance(userId);
    
    res.status(200).json({
      success: true,
      data: attendance
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

// Mark check-out for today's attendance
const markTodaysCheckOut = async (req, res) => {
  try {
    const userId = req.body.userId || req.user._id;
    const todaysAttendance = await attendanceService.getTodaysAttendance(userId);
    
    if (!todaysAttendance) {
      return res.status(404).json({
        success: false,
        message: 'No check-in record found for today'
      });
    }

    const checkOutImageUrl = await uploadAttendanceImage({
      file: req.file,
      base64Input: req.body.checkOutImage,
      folder: 'attendance/checkout',
      userId,
      type: 'checkout'
    });

    const checkOutData = {
      checkOutImage: checkOutImageUrl,
      location: req.body.location ? JSON.parse(req.body.location) : null
    };

    const result = await attendanceService.markCheckOut(todaysAttendance._id, checkOutData, req.user);
    res.status(200).json(result);
  } catch (error) {
    const statusCode = error.message.includes('Already checked out') ? 409 :
                      error.message.includes('Access denied') ? 403 : 500;
    res.status(statusCode).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = {
  getAllAttendance,
  getAttendanceById,
  markAttendance,
  markCheckOut,
  updateAttendance,
  deleteAttendance,
  getAttendanceStats,
  getTodaysAttendance,
  markTodaysCheckOut
};
