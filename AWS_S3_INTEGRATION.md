# AWS S3 Integration Documentation

## Overview
This document describes the AWS S3 integration implemented for centralized file and image uploads in the Dullet POS backend system.

## Architecture

### Centralized Upload System
All file uploads are now handled through AWS S3 instead of local storage. The system maintains backward compatibility by storing S3 URLs in the same database fields that previously held base64 data or local file paths.

### Directory Structure in S3
```
dullet-pos-uploads/
├── users/
│   ├── profiles/          # User profile photos
│   └── documents/         # User documents (Aadhaar, PAN, etc.)
├── production/
│   └── attachments/       # Production record attachments
├── transit/
│   └── attachments/       # Transit record attachments
├── orders/
│   └── captured/          # Order captured images
├── attendance/
│   ├── checkin/           # Check-in images
│   └── checkout/          # Check-out images
└── auth/
    └── face-images/       # Login face recognition images
```

## Files Created

### 1. Configuration
- **`config/aws.config.js`** - AWS S3 client configuration

### 2. Utilities
- **`utils/s3Upload.js`** - Reusable S3 upload functions
  - `uploadToS3()` - Upload buffer to S3
  - `uploadBase64ToS3()` - Upload base64 encoded data to S3
  - `deleteFromS3()` - Delete file from S3
  - `getPresignedUrl()` - Generate temporary access URLs
  - `extractFileKeyFromUrl()` - Extract S3 key from URL

### 3. Controllers & Routes
- **`controllers/upload.controller.js`** - Centralized upload endpoints
- **`routes/upload.routes.js`** - Upload API routes

## Services Updated

### 1. Production Service (`services/production.service.js`)
- **Create Production**: Uploads attachments to S3 (`production/attachments/`)
- **Update Production**: Uploads new attachments to S3
- **Field**: `attachments[].base64Data` now stores S3 URL

### 2. Transit Service (`services/transit.service.js`)
- **Create Transit**: Uploads attachments to S3 (`transit/attachments/`)
- **Update Transit**: Uploads new attachments to S3
- **Field**: `attachments[].base64Data` now stores S3 URL

### 3. User Service (`services/user.service.js`)
- **Profile Photos**: Uploaded to S3 (`users/profiles/`)
- **Documents**: Uploaded to S3 (`users/documents/`)
- **Fields**: 
  - `profilePhoto` stores S3 URL
  - `documents[].url` stores S3 URL

### 4. Attendance Service (`services/attendance.service.js`)
- **Check-in Images**: Uploaded to S3 (`attendance/checkin/`)
- **Check-out Images**: Uploaded to S3 (`attendance/checkout/`)
- **Fields**:
  - `checkInImage` stores S3 URL
  - `checkOutImage` stores S3 URL

### 5. Order Service (`services/order.service.js`)
- **Captured Images**: Uploaded to S3 (`orders/captured/`)
- **Field**: `capturedImage` stores S3 URL

### 6. Auth Service (`services/auth.service.js`)
- **Face Images**: Uploaded to S3 (`auth/face-images/`)
- **Field**: `faceImage` in UserSession stores S3 URL

## API Endpoints

### Centralized Upload Endpoints
All endpoints require authentication.

#### 1. Upload Single File
```
POST /api/upload/file
Content-Type: multipart/form-data

Body:
- file: File (required)
- folder: String (optional, default: "uploads")

Response:
{
  "success": true,
  "data": {
    "fileUrl": "https://bucket.s3.region.amazonaws.com/folder/filename.ext",
    "fileKey": "folder/filename.ext",
    "bucket": "dullet-pos-uploads"
  }
}
```

#### 2. Upload Multiple Files
```
POST /api/upload/files
Content-Type: multipart/form-data

Body:
- files: File[] (required, max 10 files)
- folder: String (optional)

Response:
{
  "success": true,
  "data": {
    "files": [
      {
        "fileUrl": "...",
        "fileKey": "...",
        "bucket": "..."
      }
    ]
  }
}
```

#### 3. Upload Base64 File
```
POST /api/upload/base64
Content-Type: application/json

Body:
{
  "base64Data": "data:image/png;base64,iVBORw0KG...",
  "fileName": "image.png",
  "mimeType": "image/png",
  "folder": "uploads"
}

Response:
{
  "success": true,
  "data": {
    "fileUrl": "...",
    "fileKey": "...",
    "bucket": "..."
  }
}
```

#### 4. Delete File
```
DELETE /api/upload/file
Content-Type: application/json

Body:
{
  "fileKey": "folder/filename.ext"
}

Response:
{
  "success": true,
  "data": {
    "deleted": true
  }
}
```

## Environment Variables

Add these to your `.env` file:

```env
# AWS S3 Configuration
AWS_ACCESS_KEY_ID=your-aws-access-key-id
AWS_SECRET_ACCESS_KEY=your-aws-secret-access-key
AWS_REGION=ap-south-1
AWS_S3_BUCKET_NAME=dullet-pos-uploads
AWS_CLOUDFRONT_DOMAIN=your-cloudfront-domain.cloudfront.net  # Optional
```

## NPM Packages Required

Install the following AWS SDK packages:

```bash
npm install @aws-sdk/client-s3 @aws-sdk/s3-request-presigner
```

## Database Schema Changes

### No Schema Changes Required!
The integration maintains the existing database structure:

- **Simple string fields** (e.g., `profilePhoto`, `checkInImage`): Now store S3 URLs instead of local paths
- **Complex attachment arrays** (e.g., `attachments[]`): The `base64Data` field now stores S3 URLs instead of base64 strings
- All other fields (`fileName`, `fileType`, `fileSize`, `uploadedAt`) remain unchanged

## Frontend Compatibility

### No Frontend Changes Required!
The frontend continues to work without modifications because:

1. **Upload Process**: Frontend still sends base64 or file buffers
2. **Display**: Frontend receives URLs (S3 URLs instead of local paths)
3. **Field Structure**: All field names and structures remain identical

### Example: Displaying Images
```javascript
// Before (local storage)
<img src={`http://localhost:5000${user.profilePhoto}`} />

// After (S3) - Same code works!
<img src={user.profilePhoto} />
// profilePhoto now contains: "https://bucket.s3.region.amazonaws.com/users/profiles/image.jpg"
```

## AWS S3 Setup

### 1. Create S3 Bucket
```bash
aws s3 mb s3://dullet-pos-uploads --region ap-south-1
```

### 2. Configure Bucket Policy (Public Read - Optional)
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "PublicReadGetObject",
      "Effect": "Allow",
      "Principal": "*",
      "Action": "s3:GetObject",
      "Resource": "arn:aws:s3:::dullet-pos-uploads/*"
    }
  ]
}
```

### 3. Configure CORS
```json
[
  {
    "AllowedHeaders": ["*"],
    "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": []
  }
]
```

### 4. Create IAM User
Create an IAM user with the following policy:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:PutObject",
        "s3:GetObject",
        "s3:DeleteObject",
        "s3:ListBucket"
      ],
      "Resource": [
        "arn:aws:s3:::dullet-pos-uploads",
        "arn:aws:s3:::dullet-pos-uploads/*"
      ]
    }
  ]
}
```

## CloudFront Setup (Optional - Recommended)

CloudFront provides faster content delivery through CDN.

### 1. Create CloudFront Distribution
- Origin: Your S3 bucket
- Origin Access: Public or OAI (Origin Access Identity)
- Viewer Protocol Policy: Redirect HTTP to HTTPS
- Allowed HTTP Methods: GET, HEAD, OPTIONS

### 2. Update Environment Variable
```env
AWS_CLOUDFRONT_DOMAIN=d1234567890.cloudfront.net
```

## Security Considerations

### 1. Private Files
For sensitive files, don't make the bucket public. Instead:
- Remove public read policy
- Use `getPresignedUrl()` to generate temporary access URLs
- Set appropriate expiration times

### 2. File Size Limits
Current limits in multer configuration:
- User documents: 5MB
- Production attachments: 2MB
- Transit attachments: 10MB
- Attendance images: 5MB

### 3. File Type Validation
Implement file type validation in controllers if needed:
```javascript
const allowedMimeTypes = ['image/jpeg', 'image/png', 'application/pdf'];
if (!allowedMimeTypes.includes(file.mimetype)) {
  throw new Error('Invalid file type');
}
```

## Migration from Local Storage

### Existing Data
If you have existing files in local storage:

1. **Keep local files** - Old URLs will still work
2. **Migrate gradually** - New uploads go to S3
3. **Batch migration** - Create a script to upload existing files to S3 and update database

### Migration Script Example
```javascript
const migrateToS3 = async () => {
  const users = await User.find({ profilePhoto: { $exists: true } });
  
  for (const user of users) {
    if (user.profilePhoto && user.profilePhoto.startsWith('/uploads/')) {
      const localPath = path.join(__dirname, user.profilePhoto);
      const buffer = await fs.readFile(localPath);
      
      const s3Result = await uploadToS3(
        buffer,
        path.basename(user.profilePhoto),
        'image/jpeg',
        'users/profiles'
      );
      
      user.profilePhoto = s3Result.fileUrl;
      await user.save();
    }
  }
};
```

## Monitoring & Logging

### S3 Upload Logs
All S3 operations log errors to console:
```javascript
console.error('S3 Upload Error:', error);
```

### Audit Trail
File uploads are logged in the audit system through existing audit logs.

## Cost Estimation

### S3 Storage Costs (ap-south-1)
- Storage: $0.023 per GB/month
- PUT requests: $0.005 per 1,000 requests
- GET requests: $0.0004 per 1,000 requests

### Example Monthly Cost
- 10GB storage: $0.23
- 100,000 uploads: $0.50
- 1,000,000 downloads: $0.40
- **Total: ~$1.13/month**

### CloudFront Costs
- Data Transfer: $0.085 per GB (first 10TB)
- Requests: $0.0075 per 10,000 requests

## Troubleshooting

### Issue: "Access Denied" Error
- Check AWS credentials in `.env`
- Verify IAM user has correct permissions
- Ensure bucket policy allows uploads

### Issue: "Bucket not found"
- Verify bucket name in `.env`
- Check bucket region matches `AWS_REGION`

### Issue: Images not displaying
- Check CORS configuration
- Verify bucket is public or using presigned URLs
- Check CloudFront distribution status

### Issue: Upload timeout
- Increase multer file size limits
- Check network connectivity to AWS
- Consider using multipart upload for large files

## Best Practices

1. **Use CloudFront** for better performance and lower costs
2. **Set lifecycle policies** to archive old files to Glacier
3. **Enable versioning** for important files
4. **Use presigned URLs** for sensitive content
5. **Implement retry logic** for failed uploads
6. **Monitor S3 costs** regularly
7. **Set up S3 event notifications** for upload tracking
8. **Use S3 Transfer Acceleration** for faster uploads from distant locations

## Support

For issues or questions:
1. Check AWS S3 documentation
2. Review CloudWatch logs
3. Check application logs for S3-related errors
4. Contact AWS support for S3-specific issues
