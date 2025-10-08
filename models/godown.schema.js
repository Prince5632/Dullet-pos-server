const mongoose = require("mongoose");

const godownSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
    },
    code: {
      type: String,
      trim: true,
      unique: true,
      sparse: true,
    },
    location: {
      city: { type: String, required: true, trim: true },
      state: { type: String, required: true, trim: true },
      area: { type: String, trim: true }, // e.g., East/West for Delhi
    },
    allowedProducts: [
      {
        type: String,
        trim: true,
      },
    ],
    contact: {
      phone: { type: String, trim: true },
      email: { type: String, trim: true, lowercase: true },
    },
    managers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],
    isActive: {
      type: Boolean,
      default: true,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
  },
  {
    timestamps: true,
  }
);

godownSchema.index({ name: 1 });
godownSchema.index({ "location.city": 1, "location.state": 1, isActive: 1 });

// Static seeding method (must be declared before compiling the model)
godownSchema.statics.seedDefaultGodowns = async function () {
  const defaults = [
    {
      name: "Delhi (East)",
      code: "DEL-E",
      location: { city: "Delhi", state: "Delhi", area: "East" },
      contact: {
        phone: "+91 76969 12132",
      },
    },
    {
      name: "Delhi (West)",
      code: "DEL-W",
      location: { city: "Delhi", state: "Delhi", area: "West" },
      contact: {
        phone: "+91 90419 83039",
      },
    },
    {
      name: "Jalandhar",
      code: "JAL",
      location: { city: "Jalandhar", state: "Punjab" },
      contact: {
        phone: "+91 76969 83151",
      },
    },
    {
      name: "Ludhiana",
      code: "LDH",
      location: { city: "Ludhiana", state: "Punjab" },
      contact: {
        phone: "+91 76969 83151",
      },
    },
    {
      name: "Fatehgarh Sahib",
      code: "FGS",
      location: { city: "Fatehgarh Sahib", state: "Punjab" },
      contact: {
        phone: "+91 90419 83039",
      },
    },
    {
      name: "Jammu",
      code: "JAM",
      location: { city: "Jammu", state: "Jammu & Kashmir" },
      contact: {
        phone: "+91 76969 83151",
      },
    },
    {
      name: "Ambala",
      code: "AMB",
      location: { city: "Ambala", state: "Haryana" },
      contact: {
        phone: "+91 90565 48729,+91 76967 42284",
      },
    },
  ];

  console.log('Seeding default godowns...');
  let created = 0;
  let updated = 0;

  for (const g of defaults) {
    try {
      const existingGodown = await this.findOne({ code: g.code });
      
      if (existingGodown) {
        // Update existing godown with new data while preserving certain fields
        const updatedGodown = await this.findOneAndUpdate(
          { code: g.code },
          {
            $set: {
              name: g.name,
              location: g.location,
              contact: g.contact,
              // Preserve existing managers, createdBy, updatedBy, and isActive status
            }
          },
          { new: true }
        );
        console.log(`✅ Updated godown: ${g.name} (${g.code}) - Contact: ${g.contact.phone}`);
        updated++;
      } else {
        // Create new godown
        const newGodown = await this.create({ ...g, isActive: true });
        console.log(`✅ Created godown: ${g.name} (${g.code}) - Contact: ${g.contact.phone}`);
        created++;
      }
    } catch (error) {
      console.error(`❌ Error seeding godown ${g.name} (${g.code}):`, error.message);
    }
  }
  
  console.log(`Godown seeding completed: ${created} created, ${updated} updated`);
};

module.exports = mongoose.model("Godown", godownSchema);
