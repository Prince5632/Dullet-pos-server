const mongoose = require('mongoose');

const orderItemSchema = new mongoose.Schema({
  productName: {
    type: String,
    required: true
  },
  grade: {
    type: String,
    required: false // For wheat flour grades
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  unit: {
    type: String,
    required: true,
    enum: ['KG', 'Quintal', 'Ton', 'Bags'],
    default: 'KG'
  },
  ratePerUnit: {
    type: Number,
    required: true,
    min: 0
  },
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  // Additional specifications
  packaging: {
    type: String,
    enum: ['Standard', 'Custom', '5kg Bags', '10kg Bags', '25kg Bags', '50kg Bags','40kg Bag', '40kg Bags', 'Loose'],
    default: 'Standard'
  },
  isBagSelection: {
    type: Boolean,
    default: false
  },
});

const orderSchema = new mongoose.Schema({
  // Type field to distinguish between orders and visits
  type: {
    type: String,
    enum: ['order', 'visit'],   
    default: 'order',
    required: true
  },
  orderNumber: {
    type: String,
    unique: true,
    required: true
  },
  customer: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true
  },
  // Godown
  godown: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Godown',
    required: false
  },
  // Order Items (required for orders, not for visits)
  items: {
    type: [orderItemSchema],
    required: function() { return this.type === 'order'; },
    validate: {
      validator: function(items) {
        // For orders, must have at least one item
        if (this.type === 'order') {
          return items && items.length > 0;
        }
        return true;
      },
      message: 'Orders must have at least one item'
    }
  },
  // Order Totals (required for orders, not for visits)
  subtotal: {
    type: Number,
    required: function() { return this.type === 'order'; },
    min: 0
  },
  discount: {
    type: Number,
    default: 0,
    min: 0
  },
  discountPercentage: {
    type: Number,
    default: 0,
    min: 0,
    max: 100
  },
  taxAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  isTaxable: {
    type: Boolean,
    default: false
  },
  taxPercentage: {
    type: Number,
    default: 5,
    min: 0,
    max: 100
  },
  totalAmount: {
    type: Number,
    required: function() { return this.type === 'order'; },
    min: 0
  },
  // Order Status
  status: {
    type: String,
    enum: [
      'pending',
      'approved',
      'driver_assigned',
      'out_for_delivery',
      'delivered',
      'completed',
      'cancelled',
      'rejected',
      'processing',
      'ready',
      'dispatched'
    ],
    default: 'pending'
  },
  priority: {
    type: String,
    enum: ['low', 'normal', 'high', 'urgent'],
    default: 'normal'
  },
  // Dates
  orderDate: {
    type: Date,
    default: Date.now
  },
  requiredDate: {
    type: Date,
    required: false
  },
  managerApproval: {
    type: {
      approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      approvedAt: { type: Date },
      notes: { type: String }
    },
    default: {}
  },
  driverAssignment: {
    type: {
      driver: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      assignedAt: { type: Date },
      pickupAt: { type: Date },
      deliveryAt: { type: Date },
      pickupLocation: {
        latitude: Number,
        longitude: Number,
        address: String
      },
      deliveryLocation: {
        latitude: Number,
        longitude: Number,
        address: String
      },
      driverNotes: { type: String },
      vehicleNumber: { type: String }
    },
    default: {}
  },
  signatures: {
    type: {
      pickupProof: { type: String },
      driver: { type: String },
      receiver: { type: String }
    },
    default: {}
  },
  settlements: [
    {
      amountCollected: { type: Number, default: 0 },
      notes: { type: String },
      recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      recordedAt: { type: Date, default: Date.now }
    }
  ],
  // Payment Information (for orders only)
  paymentTerms: {
    type: String,
    enum: ['Cash', 'Credit', 'Advance'],
    default: function() { return this.type === 'order' ? 'Cash' : undefined; },
    required: function() { return this.type === 'order'; }
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'overdue'],
    default: function() { return this.type === 'order' ? 'pending' : undefined; },
    required: function() { return this.type === 'order'; }
  },
  paidAmount: {
    type: Number,
    default: 0,
    min: 0
  },
  // Delivery Information
  deliveryAddress: {
    street: String,
    city: String,
    state: String,
    pincode: String,
    country: { type: String, default: 'India' }
  },
  deliveryInstructions: {
    type: String,
    default: ''
  },
  // System Information
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  createdByRole: {
    type: String,
    required: false
  },
  approvedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Additional Information
  notes: {
    type: String,
    default: ''
  },
  internalNotes: {
    type: String,
    default: ''
  },
  // visit-specific fields
  scheduleDate: {
    type: Date,
    required: function() { return this.type === 'visit'; }
  },
  capturedImage: {
    type: String, // Base64 encoded image
    required: true
  },
  captureLocation: {
    latitude: {
      type: Number,
      required: true
    },
    longitude: {
      type: Number,
      required: true
    },
    address: {
      type: String,
      required: true
    },
    timestamp: { type: Date, default: Date.now }
  }
}, {
  timestamps: true
});

// Indexes
orderSchema.index({ orderNumber: 1 }, { unique: true });
orderSchema.index({ customer: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderDate: -1 });
orderSchema.index({ createdBy: 1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ type: 1 });
orderSchema.index({ scheduleDate: 1 });

// Custom validation for type-specific requirements
orderSchema.pre('validate', function(next) {
  if (this.type === 'visit') {
    // visit-specific validations
    if (!this.scheduleDate) {
      this.invalidate('scheduleDate', 'Schedule date is required for visits');
    }
    if (!this.capturedImage) {
      this.invalidate('capturedImage', 'Captured image is required for visits');
    }
    if (!this.captureLocation || !this.captureLocation.latitude || !this.captureLocation.longitude) {
      this.invalidate('captureLocation', 'Capture location (latitude and longitude) is required for visits'); 
    }
  } else if (this.type === 'order') {
    // Order-specific validations
    if (!this.items || this.items.length === 0) {
      this.invalidate('items', 'At least one item is required for orders');
    }
    if (this.subtotal === undefined || this.subtotal === null) {
      this.invalidate('subtotal', 'Subtotal is required for orders');
    }
    if (this.totalAmount === undefined || this.totalAmount === null) {
      this.invalidate('totalAmount', 'Total amount is required for orders');
    }
  }
  next();
});

// Counter schema for atomic sequence generation
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  sequence: { type: Number, default: 0 }
});

const Counter = mongoose.model('Counter', counterSchema);

// Generate order number before validation
orderSchema.pre('validate', async function(next) {
  if (this.isNew && !this.orderNumber) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    const prefix = this.type === 'visit' ? 'VST' : 'ORD';
    const datePrefix = `${prefix}${year}${month}${day}`;
    const counterId = `${datePrefix}_${this.type}`;
    
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        // Check if counter exists, if not, initialize it with existing data
        let counter = await Counter.findById(counterId);
        
        if (!counter) {
          // Find the highest sequence number for today of this type
          const lastRecord = await this.constructor
            .findOne({ 
              orderNumber: new RegExp(`^${datePrefix}`),
              type: this.type 
            })
            .sort({ orderNumber: -1 });
          
          let startSequence = 0;
          if (lastRecord) {
            const lastSequence = parseInt(lastRecord.orderNumber.slice(-3));
            startSequence = lastSequence;
          }
          
          // Initialize counter with the current max sequence
          counter = await Counter.findOneAndUpdate(
            { _id: counterId },
            { $setOnInsert: { sequence: startSequence } },
            { 
              new: true, 
              upsert: true 
            }
          );
        }
        
        // Use atomic findOneAndUpdate to get next sequence number
        counter = await Counter.findOneAndUpdate(
          { _id: counterId },
          { $inc: { sequence: 1 } },
          { new: true }
        );
        
        const sequence = counter.sequence;
        this.orderNumber = `${datePrefix}${String(sequence).padStart(3, '0')}`;
        
        // Verify the generated number doesn't already exist (extra safety check)
        const existingOrder = await this.constructor.findOne({ 
          orderNumber: this.orderNumber,
          type: this.type 
        });
        
        if (!existingOrder) {
          break; // Success, unique number generated
        } else {
          // If somehow the number exists, increment counter and try again
          attempts++;
          if (attempts >= maxAttempts) {
            throw new Error(`Failed to generate unique order number after ${maxAttempts} attempts`);
          }
        }
      } catch (error) {
        attempts++;
        if (attempts >= maxAttempts) {
          return next(new Error(`Failed to generate order number: ${error.message}`));
        }
        // Wait a small amount before retrying
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
  }
  next();
});

// Calculate totals before validation
orderSchema.pre('validate', function(next) {
  // Skip calculations for visits
  if (this.type === 'visit') {
    this.subtotal = 0;
    this.totalAmount = 0;
    return next();
  }

  // Ensure each item's totalAmount is set
  if (Array.isArray(this.items)) {
    this.items = this.items.map((item) => {
      if (item && (item.totalAmount === undefined || item.totalAmount === null)) {
        const qty = Number(item.quantity || 0);
        const rate = Number(item.ratePerUnit || 0);
        item.totalAmount = qty * rate;
      }
      return item;
    });
  }

  // Calculate subtotal from items
  this.subtotal = (this.items || []).reduce((sum, item) => sum + (item.totalAmount || 0), 0);
  
  // Apply discount
  let discountAmount = 0;
  if (this.discountPercentage > 0) {
    discountAmount = (this.subtotal * this.discountPercentage) / 100;
  } else {
    discountAmount = this.discount || 0;
  }
  
  // Calculate tax amount based on isTaxable flag
  if (this.isTaxable) {
    const taxableAmount = this.subtotal - discountAmount;
    this.taxAmount = (taxableAmount * (this.taxPercentage || 5)) / 100;
  } else {
    this.taxAmount = 0;
  }
  
  // Calculate total
  this.totalAmount = this.subtotal - discountAmount + (this.taxAmount || 0);
  
  next();
});

// Virtual for remaining amount
orderSchema.virtual('remainingAmount').get(function() {
  return this.totalAmount - this.paidAmount;
});

// Virtual for order age in days
orderSchema.virtual('orderAge').get(function() {
  const today = new Date();
  const diffTime = today - this.orderDate;
  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
});

// Ensure virtual fields are serialized
orderSchema.set('toJSON', { virtuals: true });
orderSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Order', orderSchema);

