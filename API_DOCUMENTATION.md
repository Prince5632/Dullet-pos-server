# Dullet Industries POS API Documentation

## 🚀 API Overview

The Dullet Industries POS API is a comprehensive RESTful API built for managing the complete business operations of Dullet Industries - a wheat flour and bran manufacturer based in Punjab, India.

### 🔗 API Base URLs
- **Development**: `http://localhost:5000`
- **Production**: `https://api.dulletindustries.com` (when deployed)

### 📖 Interactive Documentation
- **Swagger UI**: `http://localhost:5000/api-docs`

## 🛡️ Authentication

The API uses JWT (JSON Web Token) based authentication with the following features:

### Authentication Flow
1. **Login** with email/password (+ optional face capture)
2. Receive **JWT token** (24-hour expiration)
3. Include token in `Authorization: Bearer <token>` header
4. **Session tracking** with automatic logout after 30 minutes of inactivity

### Default Admin Credentials
```
Email: admin@dulletindustries.com
Password: admin123
```

## 🏗️ API Structure

### Core Modules

#### 1. Authentication (`/api/auth`)
- `POST /login` - User login with face capture
- `POST /logout` - User logout
- `GET /profile` - Get current user profile
- `PUT /change-password` - Change password
- `POST /refresh-token` - Refresh JWT token
- `POST /force-logout/:userId` - Admin force logout
- `POST /cleanup-sessions` - Cleanup expired sessions

#### 2. User Management (`/api/users`)
- `GET /` - List users (with pagination & filtering)
- `GET /:id` - Get user details
- `POST /` - Create new user
- `PUT /:id` - Update user
- `DELETE /:id` - Soft delete user
- `PUT /:id/activate` - Reactivate user

#### 3. Role Management (`/api/roles`)
- `GET /` - List roles (with pagination & filtering)
- `GET /:id` - Get role details
- `POST /` - Create new role
- `PUT /:id` - Update role
- `DELETE /:id` - Soft delete role
- `PUT /:id/activate` - Reactivate role
- `GET /:id/permissions` - Get role permissions
- `PUT /:id/permissions` - Update role permissions
- `GET /permissions/available` - Get all available permissions

#### 4. System (`/api`)
- `GET /health` - Health check endpoint

## 🔐 Permission System

### Dynamic Role-Based Access Control (RBAC)

The API implements a comprehensive permission system with:

#### Permission Structure
- **Module**: `users`, `roles`, `orders`, `billing`, `stock`, `production`, `godowns`, `customers`, `employees`, `reports`, `settings`
- **Action**: `create`, `read`, `update`, `delete`, `approve`, `manage`
- **Format**: `{module}.{action}` (e.g., `users.create`, `orders.approve`)

#### Default Roles
1. **Super Admin** - Full system access
2. **Admin** - Administrative access (limited settings)
3. **Manager** - Management operations + approval permissions
4. **Sales Executive** - Order and customer management
5. **Staff** - Read-only access to relevant modules

#### Permission Examples
```json
{
  "users.create": "Create new users",
  "users.read": "View users",
  "users.update": "Update user details",
  "users.delete": "Delete users",
  "orders.approve": "Approve orders",
  "stock.manage": "Full stock management"
}
```

## 📊 Data Models

### User Model
```json
{
  "_id": "string",
  "employeeId": "EMP0001",
  "firstName": "John",
  "lastName": "Doe",
  "fullName": "John Doe",
  "email": "john.doe@dulletindustries.com",
  "phone": "9876543210",
  "profilePhoto": "base64_string",
  "role": { "name": "Sales Executive", "permissions": [...] },
  "department": "Sales",
  "position": "Sales Executive",
  "isActive": true,
  "lastLogin": "2024-01-15T10:30:00.000Z",
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

### Role Model
```json
{
  "_id": "string",
  "name": "Sales Executive",
  "description": "Sales operations access",
  "permissions": [
    {
      "_id": "string",
      "name": "orders.create",
      "module": "orders",
      "action": "create",
      "description": "Create new orders"
    }
  ],
  "isDefault": false,
  "isActive": true,
  "createdAt": "2024-01-15T10:30:00.000Z"
}
```

## 🔧 Features Implemented

### ✅ Authentication & User Management (Features 1-23 from listOfFeature.md)
- [x] Secure login/logout with JWT tokens
- [x] Role-based access control
- [x] Face capture during login for attendance
- [x] Dynamic user and staff management
- [x] Profile photo upload support
- [x] Department and position assignment
- [x] Predefined and custom roles
- [x] Fine-grained CRUD permissions
- [x] Temporary time-based permissions
- [x] Two-factor authentication support
- [x] Auto-logout after inactivity (30 minutes)
- [x] Complete audit trail and logging
- [x] Account lockout protection (5 failed attempts)
- [x] Password reset capabilities
- [x] Session management with force logout
- [x] User activity tracking
- [x] Account enable/disable functionality

### 🛡️ Security Features
- **Password Security**: bcrypt hashing with 12 salt rounds
- **Account Protection**: Automatic lockout after 5 failed login attempts
- **Session Security**: 30-minute inactivity timeout
- **Audit Logging**: Complete action tracking with IP and device info
- **Permission Validation**: Dynamic permission checking on all routes
- **Data Validation**: Comprehensive input validation and sanitization

### 📱 File Upload Support
- **Profile Photos**: 5MB limit, image files only
- **Face Images**: Captured during login for attendance verification
- **Base64 Storage**: Images stored as base64 strings in database

## 🧪 Testing the API

### Using Swagger UI
1. Start the server: `npm run dev`
2. Open browser: `http://localhost:5000/api-docs`
3. Click "Authorize" and enter JWT token
4. Test endpoints interactively

### Using cURL Examples

#### Login
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@dulletindustries.com",
    "password": "admin123"
  }'
```

#### Get Users (with token)
```bash
curl -X GET http://localhost:5000/api/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

#### Create New User
```bash
curl -X POST http://localhost:5000/api/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "firstName": "Jane",
    "lastName": "Smith",
    "email": "jane.smith@dulletindustries.com",
    "phone": "9876543211",
    "password": "securePassword123",
    "roleId": "ROLE_ID_HERE",
    "department": "Sales",
    "position": "Sales Executive"
  }'
```

## 🚀 Getting Started

### Prerequisites
- Node.js 16+ 
- MongoDB 4.4+
- npm or yarn

### Installation
```bash
# Clone the repository
git clone <repository-url>

# Navigate to API directory
cd dullet-api

# Install dependencies
npm install

# Start development server
npm run dev

# Server will start on http://localhost:5000
# Swagger UI available at http://localhost:5000/api-docs
```

### Environment Variables
Create a `.env` file in the root directory:
```env
MONGODB_URI=mongodb://localhost:27017/dullet_pos
JWT_SECRET=your_jwt_secret_key_here
JWT_EXPIRES_IN=24h
PORT=5000
NODE_ENV=development
```

## 📈 Next Steps

The authentication and user management system is complete. The next modules to implement based on `listOfFeature.md`:

1. **Production Management** (Features 24-26)
2. **Stock Management** (Features 27-32) 
3. **Order & Billing Management** (Features 33-38)
4. **Employee & Customer Tracking** (Features 39-47)

## 🤝 Support

For questions or support, contact:
- **Email**: admin@dulletindustries.com
- **Website**: https://www.dulletindustries.in

---

**Built with ❤️ for Dullet Industries - Quality Wheat Products Since [Year]**
