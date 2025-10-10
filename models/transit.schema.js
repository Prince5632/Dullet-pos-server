const mongoose = require("mongoose");

const productDetailSchema = new mongoose.Schema(
  {
    productName: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 0,
    },
    unit: {
      type: String,
      enum:  ['KG', 'Quintal', 'Ton', 'Bags'],
      required: true,
    },
    additionalNote: {
      type: String,
      trim: true,
    },
  },
  { _id: false }
);

const transitSchema = new mongoose.Schema(
  {
    transitId: {
      type: String,
      unique: true,
      index: true,
    },
    fromLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Godown",
      required: true,
    },
    toLocation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Godown",
      required: true,
    },
    dateOfDispatch: {
      type: Date,
      required: true,
    },
    expectedArrivalDate: {
      type: Date,
    },
    vehicleNumber: {
      type: String,
      required: true,
      trim: true,
    },
    vehicleType: {
      type: String,
      enum: ["Truck", "Mini Truck", "Van", "Other"],
    },
    driverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
   
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    productDetails: {
      type: [productDetailSchema],
      required: true,
      validate: [
        (val) => val.length > 0,
        "At least one product detail is required.",
      ],
    },
    transporterName: {
      type: String,
      trim: true,
    },
    remarks: {
      type: String,
      trim: true,
    },
    attachments: [
      {
        fileName: { type: String, required: true },
        fileType: { type: String, required: true },
        fileSize: { type: Number, required: true },
        base64Data: { type: String, required: true },
        uploadedAt: { type: Date, default: Date.now },
      },
    ],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["New", "In Transit", "Received", "Partially Received", "Cancelled"],
      default: "New",
    },
  },
  {
    timestamps: { createdAt: "createdAt", updatedAt: "updatedAt" },
  }
);
// Generate transit ID before saving
transitSchema.pre('save', async function(next) {
  if (!this.transitId) {
    try {
      // Use a more robust approach to prevent duplicate IDs
      let transitId;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        // Get the current highest customer ID number
        const lastTransit = await this.constructor
          .findOne({ transitId: { $regex: /^T\d{5}$/ } })
          .sort({ transitId: -1 })
          .select('transitId')
          .lean();

        let nextNumber = 1;
        if (lastTransit && lastTransit.transitId) {
          const lastNumber = parseInt(lastTransit.transitId.replace('T', ''));
          nextNumber = lastNumber + 1;
        }

        transitId = `T${String(nextNumber).padStart(5, '0')}`;

        // Check if this ID already exists
        const existingTransit = await this.constructor.findOne({ transitId }).lean();
        if (!existingTransit) {
          isUnique = true;
        }
        attempts++;
      }

      if (!isUnique) {
        // Fallback: use timestamp-based ID if we can't generate a unique sequential ID
        const timestamp = Date.now().toString().slice(-6);
        transitId = `T${timestamp}`;
      }

      this.transitId = transitId;
    } catch (error) {
      console.error('Error generating transit ID:', error);
      // Fallback: use timestamp-based ID
      const timestamp = Date.now().toString().slice(-6);
      this.transitId = `T${timestamp}`;
    }
  }
  next();
});

module.exports = mongoose.model('Transit', transitSchema);
