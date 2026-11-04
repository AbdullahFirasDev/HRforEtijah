const Attendance = require('../models/Attendance');
const Overtime = require('../models/Overtime');
const TimeLeave = require('../models/TimeLeave');
const { calculateHours, deriveStatus, STANDARD_SHIFT_HOURS } = require('./hours');
const { APP_TIMEZONE, localMinutes, zonedInstant, endOfLocalDay } = require('./dateUtils');
const { dayPlan, planShifts, samePlan, targetHours, toMinutes } = require('./schedule');

// Day maths for one attendance record: worked hours, lateness, early leave,
// overtime, approved time leaves (زمنيات), and closing a period nobody
// checked out of. Each open period has an automatic closing time
// (`autoCloseAt`): the end of its work period, the start of an approved
// early-departure leave, or the time the employee extended it to. The period
// stays open for a few minutes after it, so someone leaving on time can still
// check out; after that it is closed at that time and the day is marked as a
// missed check-out.

const HOUR = 3600e3;
const MINUTE = 60e3;
const AUTO_CLOSE_GRACE_MINUTES = 5;
// Overtime requests start at half an hour (see models/Overtime.js)
const MIN_AUTO_OVERTIME_MINUTES = 30;
const MAX_EXTEND_HOURS = 4;

const tzOf = (plan) => plan?.timezone || APP_TIMEZONE;
const leaveLength = (l) => toMinutes(l.to) - toMinutes(l.from);
const minutesBetween = (a, b) => Math.max(0, Math.round((new Date(b) - new Date(a)) / MINUTE));

// The work period a check-in at `instant` belongs to: the first that hasn't
// ended yet (-1 after the last one)
const shiftIndexAt = (shifts, instant, timeZone) => {
  const minutes = localMinutes(instant, timeZone);
  return shifts.findIndex((s) => toMinutes(s.end) > minutes);
};

// Approved time leaves of the record's day
const loadLeaves = (record) =>
  TimeLeave.find({ user: record.user?._id || record.user, date: record.date, status: 'Approved' }).lean();

// Recomputes the day's totals from its periods and approved time leaves
const recalcDay = (record, leaves = []) => {
  const plan = record.schedule;
  const shifts = planShifts(plan);
  const tz = tzOf(plan);
  const { sessions } = record;

  const worked = sessions.reduce(
    (sum, s) => sum + (s.punchOut?.time ? calculateHours(s.punchIn.time, s.punchOut.time) : 0),
    0
  );
  record.missedPunchOut = sessions.some((s) => s.punchOut?.auto);

  // Lateness and early leave per work period: the first check-in of a period
  // against its start, its last check-out against its end
  let late = 0;
  let early = 0;
  if (shifts.length && !plan?.dayOff) {
    shifts.forEach((shift, i) => {
      const inShift = sessions.filter((s) => shiftIndexAt(shifts, s.punchIn.time, tz) === i);
      if (!inShift.length) return;
      late += Math.max(0, localMinutes(inShift[0].punchIn.time, tz) - toMinutes(shift.start));
      const last = inShift[inShift.length - 1];
      if (last.punchOut?.time && !last.punchOut.auto) {
        early += Math.max(0, toMinutes(shift.end) - localMinutes(last.punchOut.time, tz));
      }
    });
  }

  // Approved time leaves excuse the time they cover. Coming back later than
  // allowed counts as lateness; not coming back at all is early leave beyond
  // the permitted time.
  let excused = 0;
  let lateExcuse = 0;
  let earlyExcuse = 0;
  let overstay = 0;
  for (const leave of leaves) {
    const length = leaveLength(leave);
    if (leave.type === 'start') {
      const used = Math.min(length, late);
      lateExcuse += used;
      excused += used;
    } else if (leave.departedAt) {
      if (leave.type === 'during' && leave.returnedAt) {
        excused += Math.min(length, minutesBetween(leave.departedAt, leave.returnedAt));
        overstay += minutesBetween(zonedInstant(record.date, leave.to, tz), leave.returnedAt);
      } else {
        excused += length;
        earlyExcuse += length;
      }
    }
  }
  record.lateMinutes = Math.max(0, late - lateExcuse) + overstay;
  record.earlyLeaveMinutes = Math.max(0, early - earlyExcuse);
  record.leaveMinutes = excused;

  record.totalHours = Math.round(worked * 100) / 100;
  // Excused time counts towards completing the day, but not as overtime
  record.status = deriveStatus(record.totalHours + excused / 60, targetHours(plan));
  record.overtimeMinutes = Math.max(0, Math.round((worked - targetHours(plan)) * 60));
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

// After something outside the record changed (a leave approved or
// cancelled): recompute the day and, if a period is open and not extended,
// its closing time
const refreshDay = async (record) => {
  const leaves = await loadLeaves(record);
  recalcDay(record, leaves);
  const open = record.sessions[record.sessions.length - 1];
  if (open && !open.punchOut?.time && !open.extendedUntil) {
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
// grace is a chance to check out, not extra paid minutes.
const closeOverduePeriods = async () => {
  const due = await Attendance.find({ autoCloseAt: { $lte: new Date(Date.now() - AUTO_CLOSE_GRACE_MINUTES * MINUTE) } });
  for (const record of due) {
    record.adoptLegacySession();
    const at = record.autoCloseAt;
    const leaves = await loadLeaves(record);
    // Closed at the start of an approved early departure: that leave was taken
    const leave = leaves.find(
      (l) => l.type === 'end' && !l.departedAt && +zonedInstant(record.date, l.from, tzOf(record.schedule)) === +at
    );
    if (leave) {
      await TimeLeave.updateOne({ _id: leave._id }, { $set: { departedAt: at } });
      leave.departedAt = at;
    }
    closeOpenSession(record, at, {}, leaves);
    try {
      await record.save();
    } catch (err) {
      // Another request closed or changed it at the same moment
      if (err.name !== 'VersionError') throw err;
    }
  }
  return due.length;
};

// Time worked past the plan after the employee extended their period becomes
// an overtime request for the manager (unless the day already has one)
const requestExtendedOvertime = async (record) => {
  const extended = record.sessions.filter((s) => s.extendedUntil);
  if (!extended.length || record.overtimeRequested || record.overtimeMinutes < MIN_AUTO_OVERTIME_MINUTES) return null;
  const reasons = extended.map((s) => s.extendReason).filter(Boolean);
  const overtime = await Overtime.create({
    user: record.user,
    attendance: record._id,
    date: record.date,
    requestedHours: Math.round((record.overtimeMinutes / 60) * 100) / 100,
    reason: `تمديد الوقت بعد نهاية الدوام${reasons.length ? `: ${reasons.join('، ')}` : ''}`,
  });
  record.overtimeRequested = true;
  record.overtime = overtime._id;
  return overtime;
};

module.exports = {
  MAX_EXTEND_HOURS,
  AUTO_CLOSE_GRACE_MINUTES,
  loadLeaves,
  recalcDay,
  autoCloseTime,
  closeOpenSession,
  refreshDay,
  reapplySchedule,
  closeOverduePeriods,
  requestExtendedOvertime,
};
