const mongoose = require('mongoose');

const deliveryTimePdfChangesSchema = new mongoose.Schema({
  // Reference to the related order
  orderId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    required: true,
    index: true
  },
  
  // Reference to the customer
  customerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Customer',
    required: true,
    index: true
  },
  
  // Items from the order (same structure as order items)
  items: [{
    productName: {
      type: String,
      required: true
    },
    grade: {
      type: String,
      required: false
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
    packaging: {
      type: String,
      enum: ['Standard', 'Custom', '5kg Bags', '10kg Bags', '25kg Bags', '50kg Bags','40kg Bag', '40kg Bags', 'Loose'],
      default: 'Standard'
    },
    isBagSelection: {
      type: Boolean,
      default: false
    }
  }],
  
  // Subtotal before tax (same as in order)
  subTotal: {
    type: Number,
    required: true,
    min: 0
  },
  
  // Total tax amount (same as in order)
  taxAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  
  // Customer's remaining balance before updating paidAmount in the order
  previousBalance: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Total amount (same as in order)
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  
  // The new paid amount (order.paidAmount old + new paidAmount)
  paidAmount: {
    type: Number,
    required: true,
    min: 0,
    default: 0
  },
  
  // Remaining balance after updating paidAmount in the order
  netBalanceRemaining: {
    type: Number,
    required: true,
    default: 0
  },
  
  // Timestamp when this record was created/updated
  recordedAt: {
    type: Date,
    default: Date.now
  },
  
  // User who triggered this change
  recordedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
deliveryTimePdfChangesSchema.index({ orderId: 1 }, { unique: true });
deliveryTimePdfChangesSchema.index({ customerId: 1 });
deliveryTimePdfChangesSchema.index({ recordedAt: -1 });

// Virtual to calculate the payment difference
deliveryTimePdfChangesSchema.virtual('paymentDifference').get(function() {
  return this.totalAmount - this.paidAmount;
});

// Virtual to check if order is fully paid
deliveryTimePdfChangesSchema.virtual('isFullyPaid').get(function() {
  return this.paidAmount >= this.totalAmount;
});

// Include virtuals when converting to JSON
deliveryTimePdfChangesSchema.set('toJSON', { virtuals: true });
deliveryTimePdfChangesSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('DeliveryTimePdfChanges', deliveryTimePdfChangesSchema);