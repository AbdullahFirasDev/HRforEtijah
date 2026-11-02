const { body } = require('express-validator');
const { APP_TIMEZONE } = require('./dateUtils');
const { STANDARD_SHIFT_HOURS } = require('./hours');

// Per-employee working hours ("HH:mm", same day, read in the timezone of the
// admin who set them), weekly days off (0 = Sunday … 6 = Saturday), and the
// exception that lets someone check in and out more than once a day.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
// Every check-in/out stores two selfies, so the day's record stays bounded
const MAX_SESSIONS_PER_DAY = 6;

const toMinutes = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

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

// The plan for one calendar day. It is copied onto that day's attendance
// record at the first check-in, so later schedule changes don't rewrite history.
const dayPlan = (user, date) => {
  const { start, end, timezone } = user.workSchedule || {};
  const fixed = Boolean(start && end);
  return {
    start: fixed ? start : null,
    end: fixed ? end : null,
    timezone: fixed ? timezone || APP_TIMEZONE : null,
    hours: fixed ? Math.round(((toMinutes(end) - toMinutes(start)) / 60) * 100) / 100 : STANDARD_SHIFT_HOURS,
    dayOff: (user.weeklyOffDays || []).includes(weekdayOf(date)),
  };
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
  if (workSchedule !== undefined) {
    const { start, end, timezone } = workSchedule || {};
    settings.workSchedule =
      start && end ? { start, end, timezone: timezone || null } : { start: null, end: null, timezone: null };
  }
  if (weeklyOffDays !== undefined) settings.weeklyOffDays = [...new Set(weeklyOffDays)].sort((a, b) => a - b);
  if (allowMultiplePunches !== undefined) settings.allowMultiplePunches = allowMultiplePunches;
  return settings;
};

module.exports = {
  MAX_SESSIONS_PER_DAY,
  dayPlan,
  targetHours,
  lateMinutesAt,
  earlyLeaveMinutesAt,
  workSettingsRules,
  workSettingsFrom,
};
