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
    const count = await this.constructor.countDocuments();
    this.customerId = `CUST${String(count + 1).padStart(4, '0')}`;
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
