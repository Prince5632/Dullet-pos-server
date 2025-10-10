const mongoose = require("mongoose");
const { Schema } = mongoose;

const transactionSchema = new Schema(
  {
    transactionId: {
      type: String,
      required: false, // Auto-generated in pre-save middleware
      unique: true,
    },

    transactionDate: {
      type: Date,
      required: true,
      default: Date.now,
    },

    transactionMode: {
      type: String,
      enum: ["Cash", "Credit", "Cheque", "Online"],
      required: true,
    },

    // Reference model type (either "Order" or "Customer")
    transactionForModel: {
      type: String,
      required: true,
      enum: ["Order", "Customer"],
    },

    // Reference ID dynamically linked to above model
    transactionFor: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      refPath: "transactionForModel", // dynamically reference Order or Customer
    },

    // Optional: also store customerId to make queries faster
    customer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
      required: false, // optional; helps when transactionForModel = "Order"
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    amountPaid: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { timestamps: true }
);

// Auto-generate sequential transactionId
transactionSchema.pre("save", async function (next) {
  if (!this.transactionId) {
    try {
      let transactionId;
      let isUnique = false;
      let attempts = 0;
      const maxAttempts = 10;

      while (!isUnique && attempts < maxAttempts) {
        const lastTransaction = await this.constructor
          .findOne({ transactionId: { $regex: /^TRANS\d{4}$/ } })
          .sort({ transactionId: -1 })
          .select("transactionId")
          .lean();

        let nextNumber = 1;
        if (lastTransaction && lastTransaction.transactionId) {
          const lastNumber = parseInt(lastTransaction.transactionId.replace("TRANS", ""));
          nextNumber = lastNumber + 1;
        }

        transactionId = `TRANS${String(nextNumber).padStart(4, "0")}`;
        const exists = await this.constructor.findOne({ transactionId }).lean();
        if (!exists) isUnique = true;
        attempts++;
      }

      if (!isUnique) {
        const timestamp = Date.now().toString().slice(-6);
        transactionId = `TRANS${timestamp}`;
      }

      this.transactionId = transactionId;
    } catch (error) {
      console.error("Error generating transaction ID:", error);
      const timestamp = Date.now().toString().slice(-6);
      this.transactionId = `TRANS${timestamp}`;
    }
  }
  next();
});

module.exports = mongoose.model("Transaction", transactionSchema);
