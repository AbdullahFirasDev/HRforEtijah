const { body } = require('express-validator');
const { APP_TIMEZONE } = require('./dateUtils');
const { STANDARD_SHIFT_HOURS } = require('./hours');

// Per-employee weekly schedule: for each day of the week, one or more work
// periods ("shifts", "HH:mm", same day, read in the timezone of the admin who
// set them) — e.g. 09:00–15:00 and 17:00–23:00 around a break — plus weekly
// days off (0 = Sunday … 6 = Saturday) and the exception that lets someone
// check in and out freely during the day. A working day without periods has
// no fixed time: the default daily target applies and lateness isn't tracked.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const MAX_SHIFTS_PER_DAY = 3;
// Keeps one day's record small; older records hold photos as well
const MAX_SESSIONS_PER_DAY = 6;

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const hoursBetween = (start, end) => (toMinutes(end) - toMinutes(start)) / 60;
const round2 = (n) => Math.round(n * 100) / 100;

const isValidTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
};

const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

// Every work period of the week, sorted by day then start time. Users saved
// before per-day hours existed have one start/end for every working day.
const weeklyHours = (user) => {
  const { days, start, end } = user.workSchedule || {};
  if (days?.length) {
    return days
      .map((d) => ({ day: d.day, start: d.start, end: d.end }))
      .sort((a, b) => a.day - b.day || toMinutes(a.start) - toMinutes(b.start));
  }
  if (!start || !end) return [];
  const off = user.weeklyOffDays || [];
  return ALL_DAYS.filter((day) => !off.includes(day)).map((day) => ({ day, start, end }));
};

const shiftsOn = (user, weekday) =>
  weeklyHours(user)
    .filter((d) => d.day === weekday)
    .map(({ start, end }) => ({ start, end }));

// The plan for one calendar day. It is copied onto that day's attendance
// record at the first check-in, so later schedule changes don't rewrite history.
const dayPlan = (user, date) => {
  const weekday = weekdayOf(date);
  const dayOff = (user.weeklyOffDays || []).includes(weekday);
  const shifts = dayOff ? [] : shiftsOn(user, weekday);
  return {
    start: shifts[0]?.start || null,
    end: shifts[shifts.length - 1]?.end || null,
    shifts,
    timezone: shifts.length ? user.workSchedule?.timezone || APP_TIMEZONE : null,
    hours: shifts.length ? round2(shifts.reduce((sum, s) => sum + hoursBetween(s.start, s.end), 0)) : STANDARD_SHIFT_HOURS,
    dayOff,
  };
};

// The work periods of a frozen plan; plans saved before split shifts have one
const planShifts = (plan) => {
  if (plan?.shifts?.length) return plan.shifts.map(({ start, end }) => ({ start, end }));
  return plan?.start && plan?.end ? [{ start: plan.start, end: plan.end }] : [];
};

// Same plan? Compares the day off and the work periods (not the timezone)
const samePlan = (a, b) => {
  const periods = (p) => JSON.stringify(planShifts(p).map((s) => [s.start, s.end]));
  return !!a?.dayOff === !!b?.dayOff && periods(a) === periods(b);
};

// The whole week as the employee sees it
const weekPlan = (user) => {
  const off = user.weeklyOffDays || [];
  return ALL_DAYS.map((day) => ({ day, off: off.includes(day), shifts: off.includes(day) ? [] : shiftsOn(user, day) }));
};

// Hours needed for a "Completed" day; nothing is expected on a day off.
// Records from before schedules existed have no plan and keep the old target.
const targetHours = (plan) => (plan?.dayOff ? 0 : plan?.hours ?? STANDARD_SHIFT_HOURS);

// How many check-ins a day allows: one per work period, or up to the
// maximum for staff with the multiple check-in exception
const allowedSessions = (user, plan) =>
  user.allowMultiplePunches ? MAX_SESSIONS_PER_DAY : Math.max(1, planShifts(plan).length);

// Admin input for the fields above, on both "add employee" and "update user"
const workSettingsRules = [
  body('workSchedule', 'بيانات الدوام غير صحيحة').optional({ values: 'null' }).isObject(),
  body('workSchedule.days').custom((days, { req }) => {
    if (days === undefined) return true;
    if (!Array.isArray(days) || days.length > 7 * MAX_SHIFTS_PER_DAY) throw new Error('ساعات أيام الدوام غير صحيحة');
    const off = Array.isArray(req.body.weeklyOffDays) ? req.body.weeklyOffDays.map(Number) : [];
    const byDay = new Map();
    for (const d of days) {
      if (!d || !Number.isInteger(d.day) || d.day < 0 || d.day > 6) throw new Error('يوم الدوام غير صحيح');
      const name = DAY_NAMES[d.day];
      if (!TIME_RE.test(d.start || '') || !TIME_RE.test(d.end || '')) {
        throw new Error(`حدّد وقتي بداية الدوام ونهايته ليوم ${name}`);
      }
      if (toMinutes(d.end) <= toMinutes(d.start)) {
        throw new Error(`وقت نهاية الدوام يجب أن يكون بعد وقت البداية (يوم ${name})`);
      }
      if (off.includes(d.day)) throw new Error(`يوم ${name} محدد إجازة، فلا تُحدَّد له ساعات دوام`);
      byDay.set(d.day, [...(byDay.get(d.day) || []), d]);
    }
    for (const [day, shifts] of byDay) {
      const name = DAY_NAMES[day];
      if (shifts.length > MAX_SHIFTS_PER_DAY) throw new Error(`يوم ${name}: ${MAX_SHIFTS_PER_DAY} فترات دوام كحد أقصى`);
      const sorted = [...shifts].sort((a, b) => toMinutes(a.start) - toMinutes(b.start));
      for (let i = 1; i < sorted.length; i++) {
        if (toMinutes(sorted[i].start) < toMinutes(sorted[i - 1].end)) {
          throw new Error(`فترات الدوام في يوم ${name} متداخلة`);
        }
      }
    }
    return true;
  }),
  // One start/end for every working day: sent by app versions from before per-day hours
  body('workSchedule.start', 'وقت بداية الدوام غير صحيح')
    .optional({ values: 'falsy' })
    .matches(TIME_RE)
    .bail()
    .custom((start, { req }) => {
      if (!req.body.workSchedule.end) throw new Error('حدّد وقت نهاية الدوام أيضاً');
      return true;
    }),
  body('workSchedule.end', 'وقت نهاية الدوام غير صحيح')
    .optional({ values: 'falsy' })
    .matches(TIME_RE)
    .bail()
    .custom((end, { req }) => {
      const { start } = req.body.workSchedule;
      if (!start) throw new Error('حدّد وقت بداية الدوام أيضاً');
      if (TIME_RE.test(start) && toMinutes(end) <= toMinutes(start)) {
        throw new Error('وقت نهاية الدوام يجب أن يكون بعد وقت البداية');
      }
      return true;
    }),
  body('workSchedule.timezone', 'المنطقة الزمنية غير صحيحة').optional({ values: 'falsy' }).custom(isValidTimeZone),
  body('weeklyOffDays', 'أيام الإجازة غير صحيحة')
    .optional()
    .isArray()
    .bail()
    .custom((days) => {
      if (new Set(days).size > 6) throw new Error('لا يمكن أن تكون كل أيام الأسبوع إجازة');
      return true;
    }),
  body('weeklyOffDays.*', 'يوم الإجازة غير صحيح').isInt({ min: 0, max: 6 }).toInt(),
  body('allowMultiplePunches', 'قيمة السماح بتعدد الحضور غير صحيحة').optional().isBoolean({ strict: true }),
];

// The fields from a validated request body that should be saved on the user
const workSettingsFrom = ({ workSchedule, weeklyOffDays, allowMultiplePunches }) => {
  const settings = {};
  const off = weeklyOffDays === undefined ? undefined : [...new Set(weeklyOffDays)].sort((a, b) => a - b);
  if (workSchedule !== undefined) {
    const { days, start, end, timezone } = workSchedule || {};
    const periods = days
      ? days
          .map((d) => ({ day: d.day, start: d.start, end: d.end }))
          .sort((a, b) => a.day - b.day || toMinutes(a.start) - toMinutes(b.start))
      : start && end
        ? ALL_DAYS.filter((day) => !(off || []).includes(day)).map((day) => ({ day, start, end }))
        : [];
    settings.workSchedule = { start: null, end: null, timezone: periods.length ? timezone || null : null, days: periods };
  }
  if (off !== undefined) settings.weeklyOffDays = off;
  if (allowMultiplePunches !== undefined) settings.allowMultiplePunches = allowMultiplePunches;
  return settings;
};

module.exports = {
  MAX_SESSIONS_PER_DAY,
  MAX_SHIFTS_PER_DAY,
  toMinutes,
  weekdayOf,
  weeklyHours,
  dayPlan,
  planShifts,
  samePlan,
  weekPlan,
  targetHours,
  allowedSessions,
  workSettingsRules,
  workSettingsFrom,
};
