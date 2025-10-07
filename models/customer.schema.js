const mongoose = require('mongoose');

const customerSchema = new mongoose.Schema({
  customerId: {
    type: String,
    unique: true,
    sparse: true
  },
  businessName: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: false,
    lowercase: true,
    trim: true
  },
  phone: {
    type: String,
    required: true
  },
  alternatePhone: {
    type: String,
    required: false
  },
  location: {
    type: String,
    required: false,
    trim: true
  },
  // Address Information
  address: {
    street: {
      type: String,
      required: true
    },
    city: {
      type: String,
      required: true
    },
    state: {
      type: String,
      required: true,
      default: 'Punjab'
    },
    pincode: {
      type: String,
      required: true
    },
    country: {
      type: String,
      default: 'India'
    }
  },
  // Business Information
  gstNumber: {
    type: String,
    required: false,
    uppercase: true
  },
  panNumber: {
    type: String,
    required: false,
    uppercase: true
  },
  // Credit Information
  creditLimit: {
    type: Number,
    default: 0
  },
  creditDays: {
    type: Number,
    default: 0 // 0 means cash payment
  },
  outstandingAmount: {
    type: Number,
    default: 0
  },
  // Customer Status
  isActive: {
    type: Boolean,
    default: true
  },
  customerType: {
    type: String,
    enum: ['Retailer', 'Distributor', 'Wholesaler'],
    default: 'Retailer'
  },
  // Tracking Information
  lastOrderDate: {
    type: Date,
    default: null
  },
  totalOrders: {
    type: Number,
    default: 0
  },
  totalOrderValue: {
    type: Number,
    default: 0
  },
  // System Information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Notes
  notes: {
    type: String,
    default: ''
  },
  assignedGodownId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Godown',
    required: false
  }
}, {
  timestamps: true
});

// Indexes
customerSchema.index({ businessName: 1 });
customerSchema.index({ phone: 1 });
customerSchema.index({ isActive: 1 });
customerSchema.index({ customerType: 1 });
customerSchema.index({ createdBy: 1 });

// Generate customer ID before saving
customerSchema.pre('save', async function(next) {
  if (!this.customerId) {
    try {
      // Use a more robust approach to prevent duplicate IDs
      let customerId;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        // Get the current highest customer ID number
        const lastCustomer = await this.constructor
          .findOne({ customerId: { $regex: /^CUST\d{4}$/ } })
          .sort({ customerId: -1 })
          .select('customerId')
          .lean();

        let nextNumber = 1;
        if (lastCustomer && lastCustomer.customerId) {
          const lastNumber = parseInt(lastCustomer.customerId.replace('CUST', ''));
          nextNumber = lastNumber + 1;
        }

        customerId = `CUST${String(nextNumber).padStart(4, '0')}`;

        // Check if this ID already exists
        const existingCustomer = await this.constructor.findOne({ customerId }).lean();
        if (!existingCustomer) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        // Fallback: use timestamp-based ID if we can't generate a unique sequential ID
        const timestamp = Date.now().toString().slice(-6);
        customerId = `CUST${timestamp}`;
      }

      this.customerId = customerId;
    } catch (error) {
      console.error('Error generating customer ID:', error);
      // Fallback: use timestamp-based ID
      const timestamp = Date.now().toString().slice(-6);
      this.customerId = `CUST${timestamp}`;
    }
  }
  next();
});

// Virtual for full address
customerSchema.virtual('fullAddress').get(function() {
  return `${this.address.street}, ${this.address.city}, ${this.address.state} - ${this.address.pincode}`;
});

// Virtual for credit utilization percentage
customerSchema.virtual('creditUtilization').get(function() {
  if (this.creditLimit <= 0) return 0;
  return (this.outstandingAmount / this.creditLimit) * 100;
});

// Ensure virtual fields are serialized
customerSchema.set('toJSON', { virtuals: true });
customerSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Customer', customerSchema);
