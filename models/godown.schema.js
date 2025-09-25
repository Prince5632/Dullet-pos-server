const mongoose = require('mongoose');

const godownSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    unique: true
  },
  code: {
    type: String,
    trim: true,
    unique: true,
    sparse: true
  },
  location: {
    city: { type: String, required: true, trim: true },
    state: { type: String, required: true, trim: true },
    area: { type: String, trim: true } // e.g., East/West for Delhi
  },
  allowedProducts: [{
    type: String,
    trim: true
  }],
  managers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

godownSchema.index({ name: 1 });
godownSchema.index({ 'location.city': 1, 'location.state': 1, isActive: 1 });

// Static seeding method (must be declared before compiling the model)
godownSchema.statics.seedDefaultGodowns = async function() {
  const defaults = [
    { name: 'Delhi (East)', code: 'DEL-E', location: { city: 'Delhi', state: 'Delhi', area: 'East' } },
    { name: 'Delhi (West)', code: 'DEL-W', location: { city: 'Delhi', state: 'Delhi', area: 'West' } },
    { name: 'Jalandhar', code: 'JAL', location: { city: 'Jalandhar', state: 'Punjab' } },
    { name: 'Ludhiana', code: 'LDH', location: { city: 'Ludhiana', state: 'Punjab' } },
    { name: 'Fatehgarh Sahib', code: 'FGS', location: { city: 'Fatehgarh Sahib', state: 'Punjab' } },
    { name: 'Jammu', code: 'JAM', location: { city: 'Jammu', state: 'Jammu & Kashmir' } },
    { name: 'Ambala', code: 'AMB', location: { city: 'Ambala', state: 'Haryana' } },
  ];

  for (const g of defaults) {
    await this.findOneAndUpdate(
      { code: g.code },
      { $setOnInsert: { ...g, isActive: true } },
      { upsert: true, new: true }
    );
  }
};

module.exports = mongoose.model('Godown', godownSchema);


