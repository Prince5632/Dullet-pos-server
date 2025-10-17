const { PutObjectCommand, DeleteObjectCommand, GetObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
const { s3Client, bucketName, cloudFrontDomain } = require('../config/aws.config');
const path = require('path');
const crypto = require('crypto');

/**
 * Generate a unique file name with timestamp and random hash
 * @param {string} originalName - Original file name
 * @param {string} folder - Folder path in S3
 * @returns {string} - Unique file key
 */
const generateFileKey = (originalName, folder = '') => {
  const timestamp = Date.now();
  const randomHash = crypto.randomBytes(8).toString('hex');
  const ext = path.extname(originalName);
  const baseName = path.basename(originalName, ext).replace(/[^a-zA-Z0-9]/g, '_');
  
  const fileName = `${baseName}_${timestamp}_${randomHash}${ext}`;
  return folder ? `${folder}/${fileName}` : fileName;
};

/**
 * Upload a file to S3
 * @param {Buffer} fileBuffer - File buffer
 * @param {string} originalName - Original file name
 * @param {string} mimeType - File MIME type
 * @param {string} folder - Folder path in S3 (e.g., 'users/profiles', 'production/attachments')
 * @returns {Promise<Object>} - Upload result with file URL and key
 */
const uploadToS3 = async (fileBuffer, originalName, mimeType, folder = 'uploads') => {
  try {
    const fileKey = generateFileKey(originalName, folder);
    
    const command = new PutObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
      Body: fileBuffer,
      ContentType: mimeType,
      // Make files publicly readable (adjust based on your security requirements)
      // ACL: 'public-read', // Uncomment if you want public access
    });

    await s3Client.send(command);

    // Generate file URL
    let fileUrl;
    if (cloudFrontDomain) {
      // Use CloudFront for faster delivery
      fileUrl = `https://${cloudFrontDomain}/${fileKey}`;
    } else {
      // Use S3 direct URL
      fileUrl = `https://${bucketName}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${fileKey}`;
    }
    console.log("***********FILE URL ***********",fileUrl)
    return {
      success: true,
      fileUrl,
      fileKey,
      bucket: bucketName,
    };
  } catch (error) {
    console.error('S3 Upload Error:', error);
    throw new Error(`Failed to upload file to S3: ${error.message}`);
  }
};

/**
 * Upload base64 data to S3
 * @param {string} base64Data - Base64 encoded file data
 * @param {string} fileName - File name
 * @param {string} mimeType - File MIME type
 * @param {string} folder - Folder path in S3
 * @returns {Promise<Object>} - Upload result with file URL and key
 */
const uploadBase64ToS3 = async (base64Data, fileName, mimeType, folder = 'uploads') => {
  try {
    // Remove data URL prefix if present (e.g., "data:image/png;base64,")
    const base64String = base64Data.replace(/^data:.*?;base64,/, '');
    const fileBuffer = Buffer.from(base64String, 'base64');
    
    return await uploadToS3(fileBuffer, fileName, mimeType, folder);
  } catch (error) {
    console.error('Base64 to S3 Upload Error:', error);
    throw new Error(`Failed to upload base64 to S3: ${error.message}`);
  }
};

/**
 * Delete a file from S3
 * @param {string} fileKey - S3 file key
 * @returns {Promise<boolean>} - Success status
 */
const deleteFromS3 = async (fileKey) => {
  try {
    const command = new DeleteObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });

    await s3Client.send(command);
    return true;
  } catch (error) {
    console.error('S3 Delete Error:', error);
    throw new Error(`Failed to delete file from S3: ${error.message}`);
  }
};

/**
 * Generate a pre-signed URL for temporary access to a private file
 * @param {string} fileKey - S3 file key
 * @param {number} expiresIn - URL expiration time in seconds (default: 1 hour)
 * @returns {Promise<string>} - Pre-signed URL
 */
const getPresignedUrl = async (fileKey, expiresIn = 3600) => {
  try {
    const command = new GetObjectCommand({
      Bucket: bucketName,
      Key: fileKey,
    });

    const url = await getSignedUrl(s3Client, command, { expiresIn });
    return url;
  } catch (error) {
    console.error('Presigned URL Error:', error);
    throw new Error(`Failed to generate presigned URL: ${error.message}`);
  }
};

/**
 * Extract file key from S3 URL
 * @param {string} fileUrl - Full S3 URL
 * @returns {string} - File key
 */
const extractFileKeyFromUrl = (fileUrl) => {
  if (!fileUrl) return null;
  
  try {
    // Handle CloudFront URLs
    if (cloudFrontDomain && fileUrl.includes(cloudFrontDomain)) {
      return fileUrl.split(cloudFrontDomain + '/')[1];
    }
    
    // Handle S3 direct URLs
    if (fileUrl.includes('.s3.')) {
      return fileUrl.split('.amazonaws.com/')[1];
    }
    
    // If it's already a key
    return fileUrl;
  } catch (error) {
    console.error('Extract File Key Error:', error);
    return null;
  }
};

module.exports = {
  uploadToS3,
  uploadBase64ToS3,
  deleteFromS3,
  getPresignedUrl,
  extractFileKeyFromUrl,
  generateFileKey,
};
