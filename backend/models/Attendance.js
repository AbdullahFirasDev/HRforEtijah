const mongoose = require('mongoose');

const punchSchema = new mongoose.Schema(
  {
    time: { type: Date },
    // How close the face print was to the employee's; no image is kept
    faceDistance: { type: Number },
    location: {
      lat: { type: Number },
      lng: { type: Number },
      accuracy: { type: Number }, // meters, as reported by the device
      distance: { type: Number }, // meters from the office (when configured)
    },
    // Closed by the system at the period's closing time: nobody checked out
    auto: { type: Boolean },
    // Time set or corrected by an admin (see `edits` for who and why)
    manual: { type: Boolean },
    // The approved time leave this check-out started / check-in ended
    leave: { type: mongoose.Schema.Types.ObjectId, ref: 'TimeLeave' },
  },
  { _id: false }
);

// One admin correction of a day's times, kept as an audit trail
const editSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    at: { type: Date },
    reason: { type: String },
    before: [{ in: Date, out: Date, _id: false }],
    after: [{ in: Date, out: Date, _id: false }],
  },
  { _id: false }
);

const sessionSchema = new mongoose.Schema(
  {
    punchIn: punchSchema,
    punchOut: punchSchema,
    // Pressed "extend": the period now runs until the employee checks out.
    // extendedFrom is the end it had before, where extra time starts.
    extendedAt: { type: Date },
    extendedFrom: { type: Date },
    // Extensions of a fixed length, from before they became open-ended
    extendedUntil: { type: Date },
    extendReason: { type: String },
  },
  { _id: false }
);

const shiftSchema = new mongoose.Schema({ start: String, end: String }, { _id: false });

const attendanceSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // Store the calendar date (server local, YYYY-MM-DD) so we can enforce
    // one attendance record per user per day.
    date: { type: String, required: true },

    // Every check-in/check-out pair of the day. Most staff have one; staff
    // allowed multiple punches can have several (see utils/schedule.js).
    sessions: [sessionSchema],
    // Summary of the day: first check-in and last check-out (none while a
    // period is open). Records saved before `sessions` existed keep their
    // only pair here.
    punchIn: punchSchema,
    punchOut: punchSchema,

    totalHours: { type: Number, default: 0 },
    status: {
      type: String,
      enum: ['Incomplete', 'Completed', 'Absent'],
      default: 'Incomplete',
    },

    // The employee's plan for this day, copied at the first check-in.
    // start/end are the first and last times of its work periods.
    schedule: {
      start: { type: String },
      end: { type: String },
      shifts: { type: [shiftSchema], default: undefined },
      timezone: { type: String },
      hours: { type: Number },
      dayOff: { type: Boolean },
    },
    lateMinutes: { type: Number, default: 0 },
    earlyLeaveMinutes: { type: Number, default: 0 },
    overtimeMinutes: { type: Number, default: 0 }, // worked beyond the day's target
    leaveMinutes: { type: Number, default: 0 }, // excused by approved time leaves
    // When the open period ends if nobody checks out: it is closed at this
    // time, a few minutes later (see utils/attendanceDay.js); null once closed
    autoCloseAt: { type: Date, default: null },
    missedPunchOut: { type: Boolean, default: false },
    edits: { type: [editSchema], default: undefined },

    overtimeRequested: { type: Boolean, default: false },
    overtime: { type: mongoose.Schema.Types.ObjectId, ref: 'Overtime', default: null },
  },
  // A double-tapped punch must not add two periods: the second save fails
  { timestamps: true, optimisticConcurrency: true }
);

// One attendance record per user per calendar day
attendanceSchema.index({ user: 1, date: 1 }, { unique: true });
// Finds periods whose closing time has passed; only open periods are indexed
attendanceSchema.index({ autoCloseAt: 1 }, { partialFilterExpression: { autoCloseAt: { $type: 'date' } } });

// The day's work periods, including the single pair of an older record
attendanceSchema.methods.workSessions = function () {
  if (this.sessions?.length) return this.sessions;
  return this.punchIn?.time ? [{ punchIn: this.punchIn, punchOut: this.punchOut }] : [];
};

// Moves an older record's pair into `sessions` before a new punch is added
attendanceSchema.methods.adoptLegacySession = function () {
  if (this.sessions.length || !this.punchIn?.time) return;
  const pair = { punchIn: this.punchIn.toObject() };
  if (this.punchOut?.time) pair.punchOut = this.punchOut.toObject();
  this.sessions.push(pair);
};

module.exports = mongoose.model('Attendance', attendanceSchema);
