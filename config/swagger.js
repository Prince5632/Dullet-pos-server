const swaggerJsdoc = require('swagger-jsdoc');
const swaggerUi = require('swagger-ui-express');

const options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Dullet Industries POS API',
      version: '1.0.0',
      description: 'Comprehensive POS system API for Dullet Industries - Wheat flour and bran manufacturer',
      contact: {
        name: 'Dullet Industries',
        url: 'https://www.dulletindustries.in',
        email: 'admin@dulletindustries.com'
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT'
      }
    },
    servers: [
      {
        url: 'http://localhost:5000',
        description: 'Development server'
      },
      {
        url: 'https://api.dulletindustries.com',
        description: 'Production server'
      }
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT token obtained from login endpoint'
        }
      },
      schemas: {
        // User Schemas
        User: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'User unique identifier'
            },
            employeeId: {
              type: 'string',
              description: 'Auto-generated employee ID (EMP0001, EMP0002, etc.)'
            },
            firstName: {
              type: 'string',
              description: 'User first name'
            },
            lastName: {
              type: 'string',
              description: 'User last name'
            },
            fullName: {
              type: 'string',
              description: 'Full name (virtual field)'
            },
            email: {
              type: 'string',
              format: 'email',
              description: 'User email address'
            },
            phone: {
              type: 'string',
              description: 'User phone number'
            },
            profilePhoto: {
              type: 'string',
              description: 'Base64 encoded profile photo'
            },
            role: {
              $ref: '#/components/schemas/Role'
            },
            department: {
              type: 'string',
              enum: ['Sales', 'Production', 'Management', 'Admin', 'Warehouse', 'Finance'],
              description: 'User department'
            },
            position: {
              type: 'string',
              description: 'User position/designation'
            },
            isActive: {
              type: 'boolean',
              description: 'User active status'
            },
            isTwoFactorEnabled: {
              type: 'boolean',
              description: 'Two-factor authentication status'
            },
            lastLogin: {
              type: 'string',
              format: 'date-time',
              description: 'Last login timestamp'
            },
            lastLoginIP: {
              type: 'string',
              description: 'Last login IP address'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        CreateUser: {
          type: 'object',
          required: ['firstName', 'lastName', 'email', 'phone', 'password', 'roleId', 'department', 'position'],
          properties: {
            firstName: {
              type: 'string',
              example: 'John'
            },
            lastName: {
              type: 'string',
              example: 'Doe'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@dulletindustries.com'
            },
            phone: {
              type: 'string',
              example: '9876543210'
            },
            password: {
              type: 'string',
              minLength: 6,
              example: 'securePassword123'
            },
            roleId: {
              type: 'string',
              example: '507f1f77bcf86cd799439011'
            },
            department: {
              type: 'string',
              enum: ['Sales', 'Production', 'Management', 'Admin', 'Warehouse', 'Finance'],
              example: 'Sales'
            },
            position: {
              type: 'string',
              example: 'Sales Executive'
            },
            profilePhoto: {
              type: 'string',
              format: 'binary',
              description: 'Profile photo file'
            }
          }
        },
        UpdateUser: {
          type: 'object',
          properties: {
            firstName: {
              type: 'string',
              example: 'John'
            },
            lastName: {
              type: 'string',
              example: 'Doe'
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'john.doe@dulletindustries.com'
            },
            phone: {
              type: 'string',
              example: '9876543210'
            },
            roleId: {
              type: 'string',
              example: '507f1f77bcf86cd799439011'
            },
            department: {
              type: 'string',
              enum: ['Sales', 'Production', 'Management', 'Admin', 'Warehouse', 'Finance'],
              example: 'Sales'
            },
            position: {
              type: 'string',
              example: 'Sales Executive'
            },
            isActive: {
              type: 'boolean',
              example: true
            },
            profilePhoto: {
              type: 'string',
              format: 'binary',
              description: 'Profile photo file'
            }
          }
        },
        // Role Schemas
        Role: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Role unique identifier'
            },
            name: {
              type: 'string',
              description: 'Role name'
            },
            description: {
              type: 'string',
              description: 'Role description'
            },
            permissions: {
              type: 'array',
              items: {
                $ref: '#/components/schemas/Permission'
              }
            },
            isDefault: {
              type: 'boolean',
              description: 'Is system default role'
            },
            isActive: {
              type: 'boolean',
              description: 'Role active status'
            },
            createdAt: {
              type: 'string',
              format: 'date-time'
            },
            updatedAt: {
              type: 'string',
              format: 'date-time'
            }
          }
        },
        CreateRole: {
          type: 'object',
          required: ['name', 'description'],
          properties: {
            name: {
              type: 'string',
              example: 'Assistant Manager'
            },
            description: {
              type: 'string',
              example: 'Assistant manager with limited administrative access'
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
            }
          }
        },
        UpdateRole: {
          type: 'object',
          properties: {
            name: {
              type: 'string',
              example: 'Assistant Manager'
            },
            description: {
              type: 'string',
              example: 'Assistant manager with limited administrative access'
            },
            permissions: {
              type: 'array',
              items: {
                type: 'string'
              },
              example: ['507f1f77bcf86cd799439011', '507f1f77bcf86cd799439012']
            }
          }
        },
        // Permission Schema
        Permission: {
          type: 'object',
          properties: {
            _id: {
              type: 'string',
              description: 'Permission unique identifier'
            },
            name: {
              type: 'string',
              description: 'Permission name (e.g., users.create)'
            },
            module: {
              type: 'string',
              enum: ['users', 'roles', 'orders', 'billing', 'stock', 'production', 'godowns', 'customers', 'employees', 'reports', 'settings'],
              description: 'Module name'
            },
            action: {
              type: 'string',
              enum: ['create', 'read', 'update', 'delete', 'approve', 'manage'],
              description: 'Action type'
            },
            description: {
              type: 'string',
              description: 'Permission description'
            },
            isActive: {
              type: 'boolean',
              description: 'Permission active status'
            }
          }
        },
        // Authentication Schemas
        LoginRequest: {
          type: 'object',
          required: ['email', 'password'],
          properties: {
            email: {
              type: 'string',
              format: 'email',
              example: 'admin@dulletindustries.com'
            },
            password: {
              type: 'string',
              example: 'admin123'
            },
            faceImage: {
              type: 'string',
              format: 'binary',
              description: 'Face image for attendance verification'
            }
          }
        },
        LoginResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'Login successful'
            },
            data: {
              type: 'object',
              properties: {
                user: {
                  $ref: '#/components/schemas/User'
                },
                token: {
                  type: 'string',
                  description: 'JWT authentication token'
                },
                session: {
                  type: 'object',
                  properties: {
                    id: {
                      type: 'string'
                    },
                    loginTime: {
                      type: 'string',
                      format: 'date-time'
                    }
                  }
                }
              }
            }
          }
        },
        ChangePasswordRequest: {
          type: 'object',
          required: ['currentPassword', 'newPassword'],
          properties: {
            currentPassword: {
              type: 'string',
              example: 'currentPassword123'
            },
            newPassword: {
              type: 'string',
              minLength: 6,
              example: 'newSecurePassword123'
            }
          }
        },
        // Generic Response Schemas
        SuccessResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            message: {
              type: 'string',
              example: 'Operation completed successfully'
            },
            data: {
              type: 'object',
              description: 'Response data'
            }
          }
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: false
            },
            message: {
              type: 'string',
              example: 'Error message'
            },
            errors: {
              type: 'array',
              items: {
                type: 'string'
              },
              description: 'Validation errors (if any)'
            }
          }
        },
        PaginationResponse: {
          type: 'object',
          properties: {
            success: {
              type: 'boolean',
              example: true
            },
            data: {
              type: 'object',
              properties: {
                pagination: {
                  type: 'object',
                  properties: {
                    currentPage: {
                      type: 'integer',
                      example: 1
                    },
                    totalPages: {
                      type: 'integer',
                      example: 5
                    },
                    totalUsers: {
                      type: 'integer',
                      example: 50
                    },
                    hasNext: {
                      type: 'boolean',
                      example: true
                    },
                    hasPrev: {
                      type: 'boolean',
                      example: false
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    tags: [
      {
        name: 'Authentication',
        description: 'Authentication and session management endpoints'
      },
      {
        name: 'User Management',
        description: 'User CRUD operations with role-based access control'
      },
      {
        name: 'Role Management',
        description: 'Role and permission management for dynamic access control'
      },
      {
        name: 'System',
        description: 'System health and utility endpoints'
      }
    ],
    security: [
      {
        bearerAuth: []
      }
    ]
  },
  apis: ['./routes/*.js', './index.js'] // Path to the API files
};

const specs = swaggerJsdoc(options);

module.exports = { specs, swaggerUi };
