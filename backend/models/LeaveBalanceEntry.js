const mongoose = require('mongoose');

// One line of an employee's leave balance for a type and a calendar year,
// written by an admin: the yearly grant, or an adjustment (+/-) such as a
// carry-over or a correction. Entries are never edited or deleted; a mistake
// is corrected by another adjustment, so the ledger is the audit trail.
//
// Days used are not stored here: they are the approved requests themselves
// (see utils/leaves.js balancesFor), so re-processing a request can never
// deduct it twice. Created by the migration script only (npm run leaves:migrate).
const leaveBalanceEntrySchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    leaveType: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveType', required: true },
    year: { type: Number, required: true },
    kind: { type: String, enum: ['grant', 'adjustment'], required: true },
    days: { type: Number, required: true },
    reason: { type: String, required: true, trim: true },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    byName: { type: String },
    // A grant is given once per employee, type and year ("grant:<user>:<type>:<year>")
    key: { type: String },
  },
  { timestamps: true, autoCreate: false, autoIndex: false }
);

leaveBalanceEntrySchema.index({ user: 1, leaveType: 1, year: 1 });
leaveBalanceEntrySchema.index({ key: 1 }, { unique: true, partialFilterExpression: { key: { $type: 'string' } } });

module.exports = mongoose.model('LeaveBalanceEntry', leaveBalanceEntrySchema);
