const mongoose = require('mongoose');

// A request for whole days of leave (إجازة). Time leaves of a few hours
// within one day are a separate thing (models/TimeLeave.js).
//
// The employee asks, their manager (or an admin) decides; the request keeps
// its own history of every step. Created by the migration script only
// (npm run leaves:migrate); see utils/leaves.js leavesReady.

// One step in the request's life, kept for audit
const historySchema = new mongoose.Schema(
  {
    action: {
      type: String,
      enum: ['submitted', 'attachmentAdded', 'attachmentRemoved', 'approved', 'rejected', 'cancelled', 'revoked'],
      required: true,
    },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    // Kept as written then, so the trail still reads right if the account goes
    byName: { type: String },
    byRole: { type: String },
    at: { type: Date, required: true },
    note: { type: String, default: '' },
  },
  { _id: false }
);

const attachmentRefSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, required: true }, // the LeaveAttachment
    name: { type: String },
    type: { type: String },
    size: { type: Number },
    at: { type: Date },
  },
  { _id: false }
);

const leaveRequestSchema = new mongoose.Schema(
  {
    // e.g. "2026-0007": year of submission and a running number
    number: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    // The type's name and settings when the request was made
    typeName: { type: String, required: true },
    policy: {
      paid: { type: Boolean },
      deductsBalance: { type: Boolean },
      countMode: { type: String },
      requiresAttachment: { type: Boolean },
    },
    startDate: { type: String, required: true }, // YYYY-MM-DD, office calendar
    endDate: { type: String, required: true },
    // The days that count (working days, or every day for calendar types)
    countedDates: [{ type: String }],
    days: { type: Number, required: true },
    calendarDays: { type: Number, required: true },
    reason: { type: String, required: true, trim: true },
    notes: { type: String, trim: true, default: '' },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected', 'Cancelled'],
      default: 'Pending',
    },
    attachments: [attachmentRefSchema],
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedByName: { type: String, default: null },
    reviewedAt: { type: Date, default: null },
    reviewRemarks: { type: String, default: '' },
    cancelledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    cancelledByName: { type: String, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, default: '' },
    history: [historySchema],
  },
  { timestamps: true, autoCreate: false, autoIndex: false }
);

leaveRequestSchema.index({ number: 1 }, { unique: true });
leaveRequestSchema.index({ user: 1, startDate: -1 });
leaveRequestSchema.index({ status: 1, startDate: -1 });

module.exports = mongoose.model('LeaveRequest', leaveRequestSchema);
