const mongoose = require('mongoose');

// A kind of leave (إجازة اعتيادية، مرضية…), defined by an admin. Nothing is
// built in: each setting below is the company's policy for that kind, and a
// request copies it when submitted (see LeaveRequest.policy), so a later
// change never rewrites requests already made.
//
// Created by the migration script only (npm run leaves:migrate), like every
// leave collection; see utils/leaves.js leavesReady.
const changeSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String },
    at: { type: Date },
    before: { type: mongoose.Schema.Types.Mixed },
    after: { type: mongoose.Schema.Types.Mixed },
  },
  { _id: false }
);

const leaveTypeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 60 },
    description: { type: String, trim: true, maxlength: 300, default: '' },
    // Information shown on requests and reports (there is no payroll here)
    paid: { type: Boolean, default: true },
    // Approved requests use up the employee's yearly balance of this type,
    // which only an admin grants (see LeaveBalanceEntry)
    deductsBalance: { type: Boolean, default: false },
    // working: the employee's weekly days off are not counted; calendar: every day is
    countMode: { type: String, enum: ['working', 'calendar'], default: 'working' },
    requiresAttachment: { type: Boolean, default: false },
    // Longest single request in counted days (null: no limit)
    maxDaysPerRequest: { type: Number, default: null },
    // How many days back a request may start (0: from today on)
    allowPastDays: { type: Number, default: 0 },
    isActive: { type: Boolean, default: true },
    order: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    changes: [changeSchema],
  },
  { timestamps: true, autoCreate: false, autoIndex: false }
);

module.exports = mongoose.model('LeaveType', leaveTypeSchema);
