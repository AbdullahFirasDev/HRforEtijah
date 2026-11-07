const Attendance = require('../models/Attendance');
const TimeLeave = require('../models/TimeLeave');
const User = require('../models/User');
const logger = require('../config/logger');
const { AUTO_CLOSE_GRACE_MINUTES, closeOverduePeriods } = require('./attendanceDay');
const { dayPlan, planShifts } = require('./schedule');
const { APP_TIMEZONE, addDays, todayLocal, zonedInstant } = require('./dateUtils');
const { notificationsReady, retryPendingPush } = require('./notify');
const events = require('./notifyEvents');

// Notifications that depend on the clock rather than on a request:
//   - the reminder to check out when a period reaches its end (during the
//     existing grace minutes before it closes by itself);
//   - closing overdue periods, which the system already does before every
//     attendance request, so the employee hears about it without waiting for
//     one (the recorded time is the same either way);
//   - the reminder to check in when a work period starts without a check-in;
//   - push messages that are due and not sent yet.
// It runs once a minute on a server that stays up (a LAN server, `npm run
// dev`), and on Vercel whenever an open app asks for its unread count
// (Vercel stops a function between requests). Running twice at once is safe:
// every notification has a unique key and every push is claimed once.

const SWEEP_EVERY_MS = Number(process.env.NOTIFICATION_SWEEP_MS) || 60e3;
const MINUTE = 60e3;

// The day's work periods (frozen on the record after the first check-in)
const sessionsOf = (record) => {
  if (!record) return [];
  if (record.sessions?.length) return record.sessions;
  return record.punchIn?.time ? [{ punchIn: record.punchIn, punchOut: record.punchOut }] : [];
};

const remindCheckOut = async (now) => {
  const grace = AUTO_CLOSE_GRACE_MINUTES * MINUTE;
  const records = await Attendance.find({ autoCloseAt: { $lte: now, $gt: new Date(now.getTime() - grace) } })
    .select('user date autoCloseAt sessions')
    .lean();
  for (const record of records) {
    const open = record.sessions?.[record.sessions.length - 1];
    if (!open?.punchIn?.time || open.punchOut?.time) continue;
    await events.checkOutReminder(record, {
      extended: !!(open.extendedAt || open.extendedUntil),
      closesAt: new Date(new Date(record.autoCloseAt).getTime() + grace),
      graceMinutes: AUTO_CLOSE_GRACE_MINUTES,
    });
  }
};

// Work periods that have started (and not ended) right now
const periodsInProgress = (plan, date, now) => {
  if (!plan || plan.dayOff) return [];
  const tz = plan.timezone || APP_TIMEZONE;
  const shifts = planShifts(plan);
  return shifts
    .map((shift, index) => ({
      shift,
      index,
      start: zonedInstant(date, shift.start, tz),
      end: zonedInstant(date, shift.end, tz),
      // Check-ins from here on belong to this period
      from: index ? zonedInstant(date, shifts[index - 1].end, tz) : null,
      tz,
    }))
    .filter((p) => p.start <= now && now < p.end);
};

const remindCheckIn = async (now) => {
  const today = todayLocal();
  const employees = await User.find({ role: 'employee', isActive: true }).select('workSchedule weeklyOffDays').lean();
  const candidates = employees.filter((u) => periodsInProgress(dayPlan(u, today), today, now).length);
  if (!candidates.length) return;
  const ids = candidates.map((u) => u._id);

  const [records, carried, leaves] = await Promise.all([
    Attendance.find({ user: { $in: ids }, date: today }).select('user schedule sessions punchIn punchOut').lean(),
    // Still checked in from yesterday (an extended period past midnight)
    Attendance.find({ user: { $in: ids }, date: addDays(today, -1), autoCloseAt: { $ne: null } }).select('user').lean(),
    TimeLeave.find({ user: { $in: ids }, date: today, status: 'Approved' }).select('user from to').lean(),
  ]);
  const recordOf = new Map(records.map((r) => [String(r.user), r]));
  const stillIn = new Set(carried.map((r) => String(r.user)));
  const leavesOf = new Map();
  leaves.forEach((l) => leavesOf.set(String(l.user), [...(leavesOf.get(String(l.user)) || []), l]));

  for (const user of candidates) {
    const id = String(user._id);
    const record = recordOf.get(id);
    const sessions = sessionsOf(record);
    if (stillIn.has(id) || sessions.some((s) => !s.punchOut?.time)) continue; // checked in now
    // Once the day has started, its frozen plan is what lateness is measured against
    const plan = record?.schedule?.hours != null ? record.schedule : dayPlan(user, today);
    for (const period of periodsInProgress(plan, today, now)) {
      const attended = sessions.some((s) => (!period.from || s.punchIn.time >= period.from) && s.punchIn.time < period.end);
      // An approved time leave covers the start of the period
      const excused = (leavesOf.get(id) || []).some(
        (l) => zonedInstant(today, l.from, period.tz) <= period.start && period.start < zonedInstant(today, l.to, period.tz)
      );
      if (!attended && !excused) await events.checkInReminder(user._id, today, period.index, period.shift, period.end);
    }
  }
};

const step = async (name, fn) => {
  try {
    await fn();
  } catch (err) {
    logger.warn(`Notification sweep (${name}) failed: ${err.message}`);
  }
};

const sweepOnce = async () => {
  if (!(await notificationsReady())) return false;
  const now = new Date();
  await step('check-out reminders', () => remindCheckOut(now));
  await step('overdue periods', () => closeOverduePeriods());
  await step('check-in reminders', () => remindCheckIn(now));
  await step('push retries', () => retryPendingPush());
  return true;
};

// At most once per SWEEP_EVERY_MS per server; a call while one runs joins it
let lastRun = 0;
let running = null;
const kickSweep = () => {
  if (running) return running;
  if (Date.now() - lastRun < SWEEP_EVERY_MS) return Promise.resolve(false);
  lastRun = Date.now();
  running = sweepOnce()
    .catch((err) => logger.warn(`Notification sweep failed: ${err.message}`))
    .finally(() => {
      running = null;
    });
  return running;
};

// On a server that stays up. Vercel freezes functions between requests, so
// there the sweep runs from requests instead (see notificationController).
const startSweepTimer = () => {
  if (process.env.VERCEL || process.env.NOTIFICATION_TIMER === 'off') return;
  setInterval(kickSweep, SWEEP_EVERY_MS).unref();
};

module.exports = { kickSweep, startSweepTimer, sweepOnce };
