const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    unique: true,
    sparse: true,
    lowercase: true,
    trim: true
  },
  employeeId: {
    type: String,
    unique: true,
    sparse: true
  },
  firstName: {
    type: String,
    required: true,
    trim: true
  },
  lastName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: false,
    unique: true,
    lowercase: true,
    sparse: true,
    trim: true
  },
  phone: {
    type: String,
    required: true,
    unique: true,
    sparse: true
  },
  password: {
    type: String,
    required: true,
    minlength: 6
  },
  profilePhoto: {
    type: String, // URL to stored image
    default: null
  },
  role: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role',
    required: true
  },
  department: {
    type: String,
    enum: ['Sales', 'Production', 'Management', 'Admin', 'Warehouse', 'Finance'],
    required: true
  },
  position: {
    type: String,
    required: true
  },
  // Godown assignments
  primaryGodown: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Godown',
    required: false
  },
  accessibleGodowns: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Godown'
  }],
  address: {
    line1: { type: String, trim: true },
    line2: { type: String, trim: true },
    city: { type: String, trim: true },
    state: { type: String, trim: true },
    pincode: { type: String, trim: true },
    country: { type: String, trim: true }
  },
  aadhaarNumber: {
    type: String,
    trim: true
  },
  panNumber: {
    type: String,
    trim: true,
    uppercase: true
  },
  documents: [{
    type: {
      type: String,
      enum: ['aadhaar', 'pan', 'other'],
      required: true
    },
    label: {
      type: String,
      trim: true
    },
    fileName: {
      type: String,
      trim: true
    },
    mimeType: {
      type: String
    },
    url: {
      type: String,
      required: true
    },
    uploadedAt: {
      type: Date,
      default: Date.now
    }
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  isTwoFactorEnabled: {
    type: Boolean,
    default: false
  },
  lastLogin: {
    type: Date,
    default: null
  },
  lastLoginIP: {
    type: String,
    default: null
  },
  loginAttempts: {
    type: Number,
    default: 0
  },
  lockUntil: {
    type: Date,
    default: null
  },
  passwordResetToken: {
    type: String,
    default: null
  },
  passwordResetExpires: {
    type: Date,
    default: null
  },
  // Temporary permissions (time-based access)
  temporaryPermissions: [{
    permission: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Permission'
    },
    expiresAt: {
      type: Date,
      required: true
    },
    grantedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }
  }],
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Indexes (only for non-unique fields)
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
  return `${this.firstName} ${this.lastName}`;
});

// Virtual for account locked status
userSchema.virtual('isLocked').get(function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// Pre-save middleware to hash password
userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(12);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Pre-save middleware to generate employee ID
userSchema.pre('save', async function(next) {
  if (!this.employeeId && this.isNew) {
    try {
      // Find the highest existing employee ID to ensure uniqueness
      const lastUser = await mongoose.model('User')
        .findOne({ employeeId: { $exists: true, $ne: null } })
        .sort({ employeeId: -1 })
        .select('employeeId')
        .lean();
      
      let nextNumber = 1;
      if (lastUser && lastUser.employeeId) {
        // Extract number from employeeId (e.g., "EMP0001" -> 1)
        const match = lastUser.employeeId.match(/EMP(\d+)/);
        if (match) {
          nextNumber = parseInt(match[1]) + 1;
        }
      }
      
      // Keep trying until we find a unique ID (in case of race conditions)
      let attempts = 0;
      while (attempts < 10) {
        const candidateId = `EMP${nextNumber.toString().padStart(4, '0')}`;
        const existing = await mongoose.model('User').findOne({ employeeId: candidateId }).lean();
        
        if (!existing) {
          this.employeeId = candidateId;
          break;
        }
        
        nextNumber++;
        attempts++;
      }
      
      if (!this.employeeId) {
        throw new Error('Unable to generate unique employee ID after multiple attempts');
      }
    } catch (error) {
      return next(error);
    }
  }
  next();
});

// Instance method to compare password
userSchema.methods.comparePassword = async function(candidatePassword) {
  if (!candidatePassword) return false;
  return await bcrypt.compare(candidatePassword, this.password);
};

// Instance method to increment login attempts
userSchema.methods.incLoginAttempts = function() {
  // If we have a previous lock that has expired, restart at 1
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $unset: { lockUntil: 1 },
      $set: { loginAttempts: 1 }
    });
  }
  
  const updates = { $inc: { loginAttempts: 1 } };
  
  // Lock account after 5 failed attempts for 2 hours
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2 hours
  }
  
  return this.updateOne(updates);
};

// Instance method to reset login attempts
userSchema.methods.resetLoginAttempts = function() {
  return this.updateOne({
    $unset: { loginAttempts: 1, lockUntil: 1 }
  });
};

// Instance method to check if user has specific permission
userSchema.methods.hasPermission = async function(permissionName) {
  await this.populate('role');
  await this.populate('role.permissions');
  
  // Check role permissions
  const hasRolePermission = this.role.permissions.some(permission => 
    permission.name === permissionName
  );
  
  if (hasRolePermission) return true;
  
  // Check temporary permissions
  const now = new Date();
  const hasTempPermission = this.temporaryPermissions.some(tempPerm => 
    tempPerm.permission.name === permissionName && tempPerm.expiresAt > now
  );
  
  return hasTempPermission;
};

// Static method to create default super admin
userSchema.statics.createDefaultSuperAdmin = async function() {
  const Role = mongoose.model('Role');
  const superAdminRole = await Role.findOne({ name: 'Super Admin' });
  
  if (!superAdminRole) {
    throw new Error('Super Admin role not found. Please seed roles first.');
  }
  
  const existingSuperAdmin = await this.findOne({ 
    role: superAdminRole._id,
    email: 'admin@dulletindustries.com'
  });
  
  if (!existingSuperAdmin) {
    const superAdmin = new this({
      firstName: 'Super',
      lastName: 'Admin',
      email: 'admin@dulletindustries.com',
      phone: '9999999999',
      password: 'admin123',
      role: superAdminRole._id,
      department: 'Admin',
      position: 'Super Administrator',
      isActive: true
    });
    
    await superAdmin.save();
    console.log('Default Super Admin created successfully');
    return superAdmin;
  }
  
  return existingSuperAdmin;
};

module.exports = mongoose.model('User', userSchema);
