const mongoose = require('mongoose');

const punchSchema = new mongoose.Schema(
  {
    time: { type: Date },
    selfie: { type: String }, // base64 data URL captured from live camera
    location: {
      lat: { type: Number },
      lng: { type: Number },
    },
  },
  { _id: false }
);

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Store the calendar date (server local, YYYY-MM-DD) so we can enforce
    // one attendance record per user per day.
    date: { type: String, required: true },

    punchIn: punchSchema,
    punchOut: punchSchema,

    totalHours: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Incomplete', 'Completed', 'Absent'],
      default: 'Incomplete',
    },

    overtimeRequested: { type: Boolean, default: false },
    overtime: { type: mongoose.Schema.Types.ObjectId, ref: 'Overtime', default: null },

    validation: {
      status: {
        type: String,
        enum: ['Pending', 'Valid', 'Invalid'],
        default: 'Pending',
      },
      remarks: { type: String, default: '' },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      verifiedAt: { type: Date, default: null },
    },
  },
  { timestamps: true }
);

// One attendance record per user per calendar day
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
