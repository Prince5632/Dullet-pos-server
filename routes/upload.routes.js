const express = require('express');
const multer = require('multer');
const uploadController = require('../controllers/upload.controller');
const { authenticate } = require('../middlewares/auth.middleware');

const router = express.Router();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// All upload routes require authentication
router.use(authenticate);

// Upload single file
router.post('/file', upload.single('file'), uploadController.uploadFile);

// Upload multiple files
router.post('/files', upload.array('files', 10), uploadController.uploadFiles);

// Upload base64 encoded file
router.post('/base64', uploadController.uploadBase64);

// Delete file
router.delete('/file', uploadController.deleteFile);

module.exports = router;
