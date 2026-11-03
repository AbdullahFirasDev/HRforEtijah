const mongoose = require('mongoose');

// A time leave (زمنية): permission to be away for part of a working day.
//   during: step out and come back (e.g. 11:00–13:00)
//   end:    leave before the end of the day
//   start:  arrive after the start of the day
// The employee asks, their manager (or an admin) decides, and on the day the
// employee confirms leaving and coming back with their usual check-out/in.
const timeLeaveSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    date: { type: String, required: true }, // YYYY-MM-DD, office calendar
    type: { type: String, enum: ['during', 'end', 'start'], required: true },
    from: { type: String, required: true }, // "HH:mm"
    to: { type: String, required: true },
    minutes: { type: Number, required: true },
    reason: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
    },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewRemarks: { type: String, default: '' },
    reviewedAt: { type: Date, default: null },
    // Confirmed by the employee's check-out / check-in on the day
    departedAt: { type: Date, default: null },
    returnedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

timeLeaveSchema.index({ user: 1, date: 1 });

module.exports = mongoose.model('TimeLeave', timeLeaveSchema);
