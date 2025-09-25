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
    enum: ['Standard', 'Custom', '5kg Bags', '10kg Bags', '25kg Bags', '50kg Bags', 'Loose'],
    default: 'Standard'
  }
});

const orderSchema = new mongoose.Schema({
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
  // Order Items
  items: [orderItemSchema],
  // Order Totals
  subtotal: {
    type: Number,
    required: true,
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
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  // Order Status
  status: {
    type: String,
    enum: [
      'pending',      // Created by Sales Executive
      'approved',     // Approved by Manager
      'rejected',     // Rejected by Manager
      'processing',   // In production
      'ready',        // Ready for dispatch
      'dispatched',   // Sent to godown
      'delivered',    // Delivered to customer
      'completed',    // Order completed
      'cancelled'     // Cancelled
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
  approvedDate: {
    type: Date,
    required: false
  },
  dispatchDate: {
    type: Date,
    required: false
  },
  deliveryDate: {
    type: Date,
    required: false
  },
  // Payment Information
  paymentTerms: {
    type: String,
    enum: ['Cash', 'Credit', 'Advance'],
    default: 'Cash'
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'partial', 'paid', 'overdue'],
    default: 'pending'
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
  }
}, {
  timestamps: true
});

// Indexes
orderSchema.index({ orderNumber: 1 });
orderSchema.index({ customer: 1 });
orderSchema.index({ status: 1 });
orderSchema.index({ orderDate: -1 });
orderSchema.index({ createdBy: 1 });
orderSchema.index({ paymentStatus: 1 });

// Generate order number before validation
orderSchema.pre('validate', async function(next) {
  if (this.isNew && !this.orderNumber) {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    
    const datePrefix = `ORD${year}${month}${day}`;
    
    // Find the last order number for today
    const lastOrder = await this.constructor
      .findOne({ orderNumber: new RegExp(`^${datePrefix}`) })
      .sort({ orderNumber: -1 });
    
    let sequence = 1;
    if (lastOrder) {
      const lastSequence = parseInt(lastOrder.orderNumber.slice(-3));
      sequence = lastSequence + 1;
    }
    
    this.orderNumber = `${datePrefix}${String(sequence).padStart(3, '0')}`;
  }
  next();
});

// Calculate totals before validation
orderSchema.pre('validate', function(next) {
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

