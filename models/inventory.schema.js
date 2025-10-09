const mongoose = require('mongoose');

const inventorySchema = new mongoose.Schema(
  {
    stockId: {
      type: String,
      unique: true,
      sparse: true
    },
    inventoryType: {
      type: String,
      enum: ['New Stock', 'Stock Sold', 'Damaged / Return'],
      required: true,
    },

    dateOfStock: {
      type: Date,
      required: true,
    },

    quantity: {
      type: Number,
      required: true,
    },

    unit: {
      type: String,
      enum: ['Kg', 'Quintal', '40Kg Bag'],
      required: true,
    },

    godown: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Godown',
      required: false,
    },

    pricePerKg: {
      type: Number,
      required: false,
    },

    additionalNotes: {
      type: String,
      trim: true,
    },

    loggedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false }, // auto store creation time
  }
);

// Indexes
inventorySchema.index({ stockId: 1 });
inventorySchema.index({ inventoryType: 1 });
inventorySchema.index({ dateOfStock: 1 });
inventorySchema.index({ godown: 1 });
inventorySchema.index({ loggedBy: 1 });

// Generate stock ID before saving
inventorySchema.pre('save', async function(next) {
  if (!this.stockId) {
    try {
      // Use a more robust approach to prevent duplicate IDs
      let stockId;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        // Get the current highest stock ID number
        const lastStock = await this.constructor
          .findOne({ stockId: { $regex: /^STK\d{4}$/ } })
          .sort({ stockId: -1 })
          .select('stockId')
          .lean();

        let nextNumber = 1;
        if (lastStock && lastStock.stockId) {
          const lastNumber = parseInt(lastStock.stockId.replace('STK', ''));
          nextNumber = lastNumber + 1;
        }

        stockId = `STK${String(nextNumber).padStart(4, '0')}`;

        // Check if this ID already exists
        const existingStock = await this.constructor.findOne({ stockId }).lean();
        if (!existingStock) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        // Fallback: use timestamp-based ID if we can't generate a unique sequential ID
        const timestamp = Date.now().toString().slice(-6);
        stockId = `STK${timestamp}`;
      }

      this.stockId = stockId;
    } catch (error) {
      console.error('Error generating stock ID:', error);
      // Fallback: use timestamp-based ID
      const timestamp = Date.now().toString().slice(-6);
      this.stockId = `STK${timestamp}`;
    }
  }
  next();
});

// Optional virtual field to combine quantity + unit
inventorySchema.virtual('quantityWithUnit').get(function () {
  return `${this.quantity} ${this.unit}`;
});

// Optional: convert Quintal to Kg if needed (for consistency)
inventorySchema.methods.getQuantityInKg = function () {
  return this.unit === 'Quintal' ? this.quantity * 100 : this.quantity;
};

// Ensure virtual fields are serialized
inventorySchema.set('toJSON', { virtuals: true });
inventorySchema.set('toObject', { virtuals: true });

const Inventory = mongoose.model('Inventory', inventorySchema);
module.exports = Inventory;