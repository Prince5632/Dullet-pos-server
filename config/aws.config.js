const { S3Client } = require('@aws-sdk/client-s3');

// AWS S3 Configuration
const s3Config = {
  region: process.env.AWS_REGION || 'ap-south-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
};

// Create S3 client
const s3Client = new S3Client(s3Config);

// S3 Bucket name
const bucketName = process.env.S3_BUCKET;

// CloudFront domain (optional, for faster delivery)
const cloudFrontDomain = process.env.AWS_CLOUDFRONT_DOMAIN || null;

module.exports = {
  s3Client,
  bucketName,
  cloudFrontDomain,
  s3Config,
};
