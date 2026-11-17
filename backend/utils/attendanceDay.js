const Attendance = require('../models/Attendance');
const Overtime = require('../models/Overtime');
const TimeLeave = require('../models/TimeLeave');
const { calculateHours, deriveStatus, STANDARD_SHIFT_HOURS } = require('./hours');
const { CALC_VERSION, dayMetrics } = require('./dayMetrics');
const { APP_TIMEZONE, addDays, localMinutes, todayLocal, zonedInstant, endOfLocalDay } = require('./dateUtils');
const { dayPlan, planShifts, samePlan, targetHours, toMinutes } = require('./schedule');
const notifyEvents = require('./notifyEvents');

// Day maths for one attendance record: worked hours, lateness, early leave,
// overtime, approved time leaves (زمنيات), and closing a period nobody
// checked out of. Each open period has an automatic closing time
// (`autoCloseAt`): the end of its work period or the start of an approved
// early-departure leave. The period stays open for a few minutes after it, so
// someone leaving on time can still check out; after that it is closed at that
// time and the day is marked as a missed check-out.
//
// An extended period has no end of its own: it runs until the employee checks
// out, past midnight if need be. Its `autoCloseAt` is only a backstop for
// someone who forgets, see closeOverduePeriods.

const HOUR = 3600e3;
const MINUTE = 60e3;
const AUTO_CLOSE_GRACE_MINUTES = 5;
// Overtime requests start at half an hour (see models/Overtime.js)
const MIN_AUTO_OVERTIME_MINUTES = 30;
// How long after the period's end a forgotten extension is closed
const EXTENSION_LIMIT_HOURS = 12;

const tzOf = (plan) => plan?.timezone || APP_TIMEZONE;

// The work period a check-in at `instant` belongs to: the first that hasn't
// ended yet (-1 after the last one)
const shiftIndexAt = (shifts, instant, timeZone) => {
  const minutes = localMinutes(instant, timeZone);
  return shifts.findIndex((s) => toMinutes(s.end) > minutes);
};

// The record a punch applies to: today's, or yesterday's while it still has a
// period open (an extended one past midnight, or the last minutes of a day)
const currentRecord = async (userId) => {
  const today = todayLocal();
  const carried = await Attendance.findOne({ user: userId, date: addDays(today, -1), autoCloseAt: { $ne: null } });
  return carried || Attendance.findOne({ user: userId, date: today });
};

// Approved time leaves of the record's day
const loadLeaves = (record) =>
  TimeLeave.find({ user: record.user?._id || record.user, date: record.date, status: 'Approved' }).lean();

// Recomputes the day's totals from its periods and approved time leaves
// (see utils/dayMetrics.js for how each minute is counted). Returns the
// day's full breakdown.
const recalcDay = (record, leaves = []) => {
  const plan = record.schedule;
  const { sessions } = record;

  const worked = sessions.reduce(
    (sum, s) => sum + (s.punchOut?.time ? calculateHours(s.punchIn.time, s.punchOut.time) : 0),
    0
  );
  record.missedPunchOut = sessions.some((s) => s.punchOut?.auto);

  const metrics = dayMetrics({ date: record.date, plan, sessions, leaves });
  record.lateMinutes = metrics.lateMinutes;
  record.earlyLeaveMinutes = metrics.earlyLeaveMinutes;
  record.earlyArrivalMinutes = metrics.earlyArrivalMinutes;
  record.overtimeMinutes = metrics.overtimeMinutes;
  record.leaveMinutes = metrics.excusedMinutes;
  record.calcVersion = CALC_VERSION;

  record.totalHours = Math.round(worked * 100) / 100;
  // Excused time counts towards completing the day, but not as overtime
  record.status = deriveStatus(record.totalHours + metrics.excusedMinutes / 60, targetHours(plan));
  return metrics;
};

// When a period opened at `start` closes by itself if nobody checks out: the
// end of its work period; on a day without fixed hours, after the hours still
// expected that day (a full day on a day off). Checking in after the last work
// period counts as extra time: one hour unless extended. An approved leave to
// go home early brings it forward to the leave's start. Never later than the
// end of the record's day.
const autoCloseTime = (record, start, leaves = []) => {
  const plan = record.schedule;
  const shifts = planShifts(plan);
  let at;
  if (shifts.length && !plan?.dayOff) {
    const i = shiftIndexAt(shifts, start, tzOf(plan));
    at = i >= 0 ? zonedInstant(record.date, shifts[i].end, tzOf(plan)) : new Date(start.getTime() + HOUR);
  } else {
    const remaining = plan?.dayOff ? STANDARD_SHIFT_HOURS : targetHours(plan) - (record.totalHours || 0);
    at = new Date(start.getTime() + Math.max(remaining, 1) * HOUR);
  }
  for (const leave of leaves) {
    if (leave.type !== 'end' || leave.departedAt) continue;
    const from = zonedInstant(record.date, leave.from, tzOf(plan));
    if (from > start && from < at) at = from;
  }
  return new Date(Math.min(at.getTime(), endOfLocalDay(record.date).getTime()));
};

// Closes the open period at `at`. Without a verified face it is an automatic
// close: the employee never checked out.
const closeOpenSession = (record, at, { faceDistance, location, leave } = {}, leaves = []) => {
  const open = record.sessions[record.sessions.length - 1];
  const auto = faceDistance === undefined;
  open.punchOut = auto ? { time: at, auto: true } : { time: at, faceDistance, location, leave };
  record.punchOut = auto ? { time: at, auto: true } : { time: at, location };
  record.autoCloseAt = null;
  recalcDay(record, leaves);
};

// The employee keeps working past the end of the open period, for as long as
// it takes
const extendOpenSession = (record, open, now = new Date()) => {
  if (open.extendedAt) return;
  const end = record.autoCloseAt || now;
  open.extendedAt = now;
  open.extendedFrom = end;
  record.autoCloseAt = new Date(Math.max(end.getTime(), now.getTime()) + EXTENSION_LIMIT_HOURS * HOUR);
};

// After something outside the record changed (a leave approved or
// cancelled): recompute the day and, if a period is open and not extended,
// its closing time
const refreshDay = async (record) => {
  const leaves = await loadLeaves(record);
  recalcDay(record, leaves);
  const open = record.sessions[record.sessions.length - 1];
  if (open && !open.punchOut?.time && !open.extendedUntil && !open.extendedAt) {
    record.autoCloseAt = autoCloseTime(record, open.punchIn.time, leaves);
  }
};

// Recomputes a user's recorded days from `from` to `to` on their current
// schedule (days are otherwise frozen on the plan of their first check-in).
// Returns how many days changed plan.
const reapplySchedule = async (user, from, to) => {
  const records = await Attendance.find({ user: user._id, date: { $gte: from, $lte: to } });
  let changed = 0;
  for (const record of records) {
    const plan = dayPlan(user, record.date);
    const hadPlan = record.schedule?.hours != null;
    if (hadPlan && samePlan(record.schedule, plan)) continue;
    record.adoptLegacySession();
    record.schedule = plan;
    await refreshDay(record);
    await record.save();
    changed += 1;
  }
  return changed;
};

// Closes every period whose closing time (plus the grace minutes) has passed.
// Runs before attendance is read or changed, so nobody sees (or extends) a
// period that has ended. The recorded time is the closing time itself: the
// grace is a chance to check out, not extra paid minutes. A forgotten extension
// is recorded at the end it had before, so hours nobody confirmed aren't
// counted; an admin can correct the time if they were really worked.
const closeOverduePeriods = async () => {
  const due = await Attendance.find({ autoCloseAt: { $lte: new Date(Date.now() - AUTO_CLOSE_GRACE_MINUTES * MINUTE) } });
  for (const record of due) {
    record.adoptLegacySession();
    const at = record.sessions[record.sessions.length - 1]?.extendedFrom || record.autoCloseAt;
    const leaves = await loadLeaves(record);
    // Closed at the start of an approved early departure: that leave was taken
    const leave = leaves.find(
      (l) => l.type === 'end' && !l.departedAt && +zonedInstant(record.date, l.from, tzOf(record.schedule)) === +at
    );
    if (leave) {
      await TimeLeave.updateOne({ _id: leave._id }, { $set: { departedAt: at } });
      leave.departedAt = at;
    }
    const extended = !!record.sessions[record.sessions.length - 1]?.extendedAt;
    closeOpenSession(record, at, {}, leaves);
    try {
      await record.save();
    } catch (err) {
      // Another request closed or changed it at the same moment (and tells the employee)
      if (err.name !== 'VersionError') throw err;
      continue;
    }
    await notifyEvents.autoClosed(record, at, { extended });
  }
  return due.length;
};

// Time worked past the plan after the employee extended their period becomes
// an overtime request for the manager (unless the day already has one)
const requestExtendedOvertime = async (record) => {
  const extended = record.sessions.filter((s) => s.extendedAt || s.extendedUntil);
  // What the day gives beyond its target, after any lateness is made up
  const net = Math.max(0, Math.round((record.totalHours - targetHours(record.schedule)) * 60));
  if (!extended.length || record.overtimeRequested || net < MIN_AUTO_OVERTIME_MINUTES) return null;
  const reasons = extended.map((s) => s.extendReason).filter(Boolean);
  const overtime = await Overtime.create({
    user: record.user,
    attendance: record._id,
    date: record.date,
    requestedHours: Math.round((net / 60) * 100) / 100,
    reason: `تمديد الوقت بعد نهاية الدوام${reasons.length ? `: ${reasons.join('، ')}` : ''}`,
  });
  record.overtimeRequested = true;
  record.overtime = overtime._id;
  return overtime;
};

module.exports = {
  EXTENSION_LIMIT_HOURS,
  AUTO_CLOSE_GRACE_MINUTES,
  currentRecord,
  extendOpenSession,
  loadLeaves,
  recalcDay,
  autoCloseTime,
  closeOpenSession,
  refreshDay,
  reapplySchedule,
  closeOverduePeriods,
  requestExtendedOvertime,
};
