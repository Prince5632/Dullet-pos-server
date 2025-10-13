const mongoose = require('mongoose');

const productionSchema = new mongoose.Schema({
  batchId: {
    type: String,
    unique: true,
    sparse: true
  },
  productionDate: {
    type: String,
    required: true,
    trim: true
  },
  shift: {
    type: String,
    required: true,
    enum: ['Morning', 'Afternoon', 'Night'],
    default: 'Morning'
  },
  location: {
    type: String,
    required: true,
    trim: true
  },
  machine: {
    type: String,
    required: false,
    trim: true
  },
  operator: {
    type: String,
    required: true,
    trim: true
  },
  inputType: {
    type: String,
    required: true,
    trim: true
  },
  inputQty: {
    type: Number,
    required: true,
    min: 0
  },
  inputUnit: {
    type: String,
    required: true,
    enum: ['KG', 'Quintal', 'Ton'],
    default: 'KG'
  },
  outputDetails: [{
    itemName: {
      type: String,
      required: true,
      enum: ['Atta', 'Chokar']
    },
    productQty: {
      type: Number,
      required: true,
      min: 0
    },
    productUnit: {
      type: String,
      required: true,
      enum: ['KG', 'Quintal', 'Ton'],
      default: 'KG'
    },
    notes: {
      type: String,
      required: false,
      trim: true
    }
  }],
  attachments: [
    {
      fileName: { type: String, required: true },
      fileType: { type: String, required: true },
      fileSize: { type: Number, required: true },
      base64Data: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now },
    },
  ],
  remarks: {
    type: String,
    required: false,
    trim: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true
});
// Generate batch ID before saving
productionSchema.pre('save', async function(next) {
  if (!this.batchId) {
    try {
      // Use a more robust approach to prevent duplicate IDs
      let batchId;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        // Get the current highest batch ID number
        const lastBatch = await this.constructor
          .findOne({ batchId: { $regex: /^BATCH\d{3}$/ } })
          .sort({ batchId: -1 })
          .select('batchId')
          .lean();

        let nextNumber = 1;
        if (lastBatch && lastBatch.batchId) {
          const lastNumber = parseInt(lastBatch.batchId.replace('BATCH', ''));
          nextNumber = lastNumber + 1;
        }

        batchId = `BATCH${String(nextNumber).padStart(3, '0')}`;

        // Check if this ID already exists
        const existingBatch = await this.constructor.findOne({ batchId }).lean();
        if (!existingBatch) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        // Fallback: use timestamp-based ID if we can't generate a unique sequential ID
        const timestamp = Date.now().toString().slice(-6);
        batchId = `BATCH${timestamp}`;
      }

      this.batchId = batchId;
    } catch (error) {
      console.error('Error generating batch ID:', error);
      // Fallback: use timestamp-based ID
      const timestamp = Date.now().toString().slice(-6);
      this.batchId = `BATCH${timestamp}`;
    }
  }
  next();
});


// Index for better query performance
productionSchema.index({ productionDate: 1 });
productionSchema.index({ shift: 1 });
productionSchema.index({ location: 1 });
productionSchema.index({ operator: 1 });
productionSchema.index({ createdBy: 1 });
productionSchema.index({ batchId: 1 });

// Virtual for calculating total output quantity
productionSchema.virtual('totalOutputQty').get(function() {
  return this.outputDetails.reduce((total, output) => total + output.productQty, 0);
});

// Virtual for calculating conversion efficiency
productionSchema.virtual('conversionEfficiency').get(function() {
  const totalOutput = this.totalOutputQty;
  return this.inputQty > 0 ? ((totalOutput / this.inputQty) * 100).toFixed(2) : 0;
});

// Ensure virtual fields are serialized
productionSchema.set('toJSON', { virtuals: true });
productionSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('Production', productionSchema);