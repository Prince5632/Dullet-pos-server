const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  date: {
    type: Date,
    required: true,
    index: true
  },
  checkInTime: {
    type: Date,
    required: true
  },
  checkOutTime: {
    type: Date,
    default: null
  },
  checkInImage: {
    type: String, // Base64 or file path to stored image
    required: true
  },
  checkOutImage: {
    type: String, // Base64 or file path to stored image
    default: null
  },
  checkInLocation: {
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String }
  },
  checkOutLocation: {
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String }
  },
  godown: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Godown',
    default: null
  },
  status: {
    type: String,
    enum: ['present', 'late', 'half_day', 'absent'],
    default: 'present'
  },
  workingHours: {
    type: Number, // in hours (calculated from check-in to check-out)
    default: 0
  },
  notes: {
    type: String,
    default: ''
  },
  isAutoMarked: {
    type: Boolean,
    default: false // true if marked automatically on login
  },
  markedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true // who marked the attendance (self or manager)
  },
  ipAddress: {
    type: String,
    default: null
  },
  userAgent: {
    type: String,
    default: null
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

// Compound index for user and date (unique attendance per user per day)
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

// Index for efficient queries
attendanceSchema.index({ godown: 1, date: 1 });
attendanceSchema.index({ status: 1, date: 1 });
attendanceSchema.index({ markedBy: 1, date: 1 });

// Virtual field for formatted date
attendanceSchema.virtual('dateFormatted').get(function() {
  return this.date.toISOString().split('T')[0]; // YYYY-MM-DD format
});

// Static method to get today's attendance for a user
attendanceSchema.statics.getTodaysAttendance = async function(userId) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  
  return await this.findOne({
    user: userId,
    date: {
      $gte: today,
      $lt: tomorrow
    }
  }).populate('user', 'firstName lastName email employeeId')
    .populate('godown', 'name location')
    .populate('markedBy', 'firstName lastName');
};

// Static method to check if user has attendance for today
attendanceSchema.statics.hasAttendanceToday = async function(userId) {
  const attendance = await this.getTodaysAttendance(userId);
  return !!attendance;
};

// Instance method to calculate working hours
attendanceSchema.methods.calculateWorkingHours = function() {
  if (this.checkInTime && this.checkOutTime) {
    const diffMs = this.checkOutTime.getTime() - this.checkInTime.getTime();
    this.workingHours = diffMs / (1000 * 60 * 60); // Convert to hours
  }
  return this.workingHours;
};

// Instance method to determine status based on check-in time
attendanceSchema.methods.determineStatus = function(standardCheckInTime = '09:30') {
  if (!this.checkInTime) return 'absent';
  
  const [hours, minutes] = standardCheckInTime.split(':').map(Number);
  const standardTime = new Date(this.checkInTime);
  standardTime.setHours(hours, minutes, 0, 0);
  
  // Late if checked in after standard time + 15 minutes grace period
  const graceTime = new Date(standardTime);
  graceTime.setMinutes(graceTime.getMinutes() + 15);
  
  if (this.checkInTime > graceTime) {
    this.status = 'late';
  } else {
    this.status = 'present';
  }
  
  // Check for half day (less than 4 hours)
  if (this.workingHours > 0 && this.workingHours < 4) {
    this.status = 'half_day';
  }
  
  return this.status;
};

// Pre-save middleware to calculate working hours and determine status
attendanceSchema.pre('save', function(next) {
  if (this.checkOutTime) {
    this.calculateWorkingHours();
  }
  this.determineStatus();
  next();
});

module.exports = mongoose.model('Attendance', attendanceSchema);
