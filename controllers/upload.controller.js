const { uploadToS3, uploadBase64ToS3, deleteFromS3 } = require('../utils/s3Upload');
const { sendSuccess, sendError } = require('../utils/response');

/**
 * Upload single file to S3
 * @route POST /api/upload/file
 */
exports.uploadFile = async (req, res) => {
  try {
    if (!req.file) {
      return sendError(res, 'No file provided', 400);
    }

    const { folder = 'uploads' } = req.body;
    
    const result = await uploadToS3(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      folder
    );
    console.log(result);

    return sendSuccess(res, result, 'File uploaded successfully');
  } catch (error) {
    console.error('Upload File Error:', error);
    return sendError(res, error.message, 500);
  }
};

/**
 * Upload multiple files to S3
 * @route POST /api/upload/files
 */
exports.uploadFiles = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return sendError(res, 'No files provided', 400);
    }

    const { folder = 'uploads' } = req.body;
    
    const uploadPromises = req.files.map(file =>
      uploadToS3(file.buffer, file.originalname, file.mimetype, folder)
    );

    const results = await Promise.all(uploadPromises);

    return sendSuccess(res, { files: results }, 'Files uploaded successfully');
  } catch (error) {
    console.error('Upload Files Error:', error);
    return sendError(res, error.message, 500);
  }
};

/**
 * Upload base64 encoded file to S3
 * @route POST /api/upload/base64
 */
exports.uploadBase64 = async (req, res) => {
  try {
    const { base64Data, fileName, mimeType, folder = 'uploads' } = req.body;

    if (!base64Data || !fileName || !mimeType) {
      return sendError(res, 'base64Data, fileName, and mimeType are required', 400);
    }

    const result = await uploadBase64ToS3(base64Data, fileName, mimeType, folder);

    return sendSuccess(res, result, 'Base64 file uploaded successfully');
  } catch (error) {
    console.error('Upload Base64 Error:', error);
    return sendError(res, error.message, 500);
  }
};

/**
 * Delete file from S3
 * @route DELETE /api/upload/file
 */
exports.deleteFile = async (req, res) => {
  try {
    const { fileKey } = req.body;

    if (!fileKey) {
      return sendError(res, 'fileKey is required', 400);
    }

    await deleteFromS3(fileKey);

    return sendSuccess(res, { deleted: true }, 'File deleted successfully');
  } catch (error) {
    console.error('Delete File Error:', error);
    return sendError(res, error.message, 500);
  }
};
