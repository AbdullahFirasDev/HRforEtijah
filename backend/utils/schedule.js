const { body } = require('express-validator');
const { APP_TIMEZONE } = require('./dateUtils');
const { STANDARD_SHIFT_HOURS } = require('./hours');

// Per-employee weekly schedule: working hours for each day of the week
// ("HH:mm", same day, read in the timezone of the admin who set them), weekly
// days off (0 = Sunday … 6 = Saturday), and the exception that lets someone
// check in and out more than once a day. A working day without hours has no
// fixed time: the default daily target applies and lateness isn't tracked.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
// Every check-in/out stores two selfies, so the day's record stays bounded
const MAX_SESSIONS_PER_DAY = 6;

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

const hoursBetween = (start, end) => Math.round(((toMinutes(end) - toMinutes(start)) / 60) * 100) / 100;

const isValidTimeZone = (timeZone) => {
  try {
    new Intl.DateTimeFormat('en', { timeZone });
    return true;
  } catch {
    return false;
  }
};

// Minutes since local midnight of an instant in the given timezone
const localMinutes = (instant, timeZone) => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(instant);
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return get('hour') * 60 + get('minute');
};

const weekdayOf = (date) => new Date(`${date}T00:00:00Z`).getUTCDay();

// Fixed hours per weekday, sorted by day. Users saved before per-day hours
// existed have one start/end for every working day.
const weeklyHours = (user) => {
  const { days, start, end } = user.workSchedule || {};
  if (days?.length) return days.map((d) => ({ day: d.day, start: d.start, end: d.end })).sort((a, b) => a.day - b.day);
  if (!start || !end) return [];
  const off = user.weeklyOffDays || [];
  return ALL_DAYS.filter((day) => !off.includes(day)).map((day) => ({ day, start, end }));
};

// The plan for one calendar day. It is copied onto that day's attendance
// record at the first check-in, so later schedule changes don't rewrite history.
const dayPlan = (user, date) => {
  const weekday = weekdayOf(date);
  const dayOff = (user.weeklyOffDays || []).includes(weekday);
  const fixed = dayOff ? null : weeklyHours(user).find((d) => d.day === weekday);
  return {
    start: fixed ? fixed.start : null,
    end: fixed ? fixed.end : null,
    timezone: fixed ? user.workSchedule?.timezone || APP_TIMEZONE : null,
    hours: fixed ? hoursBetween(fixed.start, fixed.end) : STANDARD_SHIFT_HOURS,
    dayOff,
  };
};

// The whole week as the employee sees it
const weekPlan = (user) => {
  const off = user.weeklyOffDays || [];
  const fixed = weeklyHours(user);
  return ALL_DAYS.map((day) => {
    const hours = fixed.find((d) => d.day === day);
    return { day, off: off.includes(day), start: hours?.start || null, end: hours?.end || null };
  });
};

// Hours needed for a "Completed" day; nothing is expected on a day off.
// Records from before schedules existed have no plan and keep the old target.
const targetHours = (plan) => (plan?.dayOff ? 0 : plan?.hours ?? STANDARD_SHIFT_HOURS);

const lateMinutesAt = (plan, instant) =>
  plan?.start && !plan.dayOff ? Math.max(0, localMinutes(instant, plan.timezone) - toMinutes(plan.start)) : 0;

const earlyLeaveMinutesAt = (plan, instant) =>
  plan?.end && !plan.dayOff ? Math.max(0, toMinutes(plan.end) - localMinutes(instant, plan.timezone)) : 0;

// Admin input for the fields above, on both "add employee" and "update user"
const workSettingsRules = [
  body('workSchedule', 'بيانات الدوام غير صحيحة').optional({ values: 'null' }).isObject(),
  body('workSchedule.days').custom((days, { req }) => {
    if (days === undefined) return true;
    if (!Array.isArray(days) || days.length > 7) throw new Error('ساعات أيام الدوام غير صحيحة');
    const off = Array.isArray(req.body.weeklyOffDays) ? req.body.weeklyOffDays.map(Number) : [];
    const seen = new Set();
    for (const d of days) {
      if (!d || !Number.isInteger(d.day) || d.day < 0 || d.day > 6 || seen.has(d.day)) {
        throw new Error('يوم الدوام غير صحيح');
      }
      seen.add(d.day);
      const name = DAY_NAMES[d.day];
      if (!TIME_RE.test(d.start || '') || !TIME_RE.test(d.end || '')) {
        throw new Error(`حدّد وقتي بداية الدوام ونهايته ليوم ${name}`);
      }
      if (toMinutes(d.end) <= toMinutes(d.start)) {
        throw new Error(`وقت نهاية الدوام يجب أن يكون بعد وقت البداية (يوم ${name})`);
      }
      if (off.includes(d.day)) throw new Error(`يوم ${name} محدد إجازة، فلا تُحدَّد له ساعات دوام`);
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
    const perDay = days
      ? days.map((d) => ({ day: d.day, start: d.start, end: d.end })).sort((a, b) => a.day - b.day)
      : start && end
        ? ALL_DAYS.filter((day) => !(off || []).includes(day)).map((day) => ({ day, start, end }))
        : [];
    settings.workSchedule = { start: null, end: null, timezone: perDay.length ? timezone || null : null, days: perDay };
  }
  if (off !== undefined) settings.weeklyOffDays = off;
  if (allowMultiplePunches !== undefined) settings.allowMultiplePunches = allowMultiplePunches;
  return settings;
};

module.exports = {
  MAX_SESSIONS_PER_DAY,
  weeklyHours,
  dayPlan,
  weekPlan,
  targetHours,
  lateMinutesAt,
  earlyLeaveMinutesAt,
  workSettingsRules,
  workSettingsFrom,
};
