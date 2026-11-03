const { body } = require('express-validator');
const ApiError = require('./ApiError');
const { addDays, localMinutes, todayLocal, zonedInstant } = require('./dateUtils');
const { dayPlan, planShifts, toMinutes } = require('./schedule');

// Rules for time leaves (زمنيات), see models/TimeLeave.js

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MIN_MINUTES = 15;
const MAX_MINUTES = 4 * 60;
const MAX_PER_DAY = 3;
const DAYS_AHEAD = 60;
// The employee may confirm leaving this long before the leave starts
const EARLY_DEPARTURE_MINUTES = 15;

const TYPE_LABELS = { during: 'خروج والعودة', end: 'انصراف قبل نهاية الدوام', start: 'تأخير عن بداية الدوام' };

const requestRules = [
  body('date', 'صيغة التاريخ غير صحيحة').matches(DATE_RE),
  body('type', 'نوع الزمنية غير صحيح').isIn(Object.keys(TYPE_LABELS)),
  body('from', 'وقت بداية الزمنية غير صحيح').matches(TIME_RE),
  body('to', 'وقت نهاية الزمنية غير صحيح').matches(TIME_RE),
  body('reason', 'اكتب سبب الزمنية').isString().trim().isLength({ min: 3, max: 300 }),
];

const durationText = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return [h && `${h} س`, m && `${m} د`].filter(Boolean).join(' ');
};

// Checks a new request against the employee's day; returns its length in minutes
const checkRequest = (user, { date, type, from, to }, existing) => {
  const today = todayLocal();
  if (date < today) throw new ApiError(400, 'لا يمكن طلب زمنية ليوم مضى');
  if (date > addDays(today, DAYS_AHEAD)) throw new ApiError(400, `يمكن طلب الزمنية قبل ${DAYS_AHEAD} يوماً كحد أقصى`);

  const minutes = toMinutes(to) - toMinutes(from);
  if (minutes <= 0) throw new ApiError(400, 'وقت نهاية الزمنية يجب أن يكون بعد وقت بدايتها');
  if (minutes < MIN_MINUTES) throw new ApiError(400, `أقل مدة للزمنية ${MIN_MINUTES} دقيقة`);
  if (minutes > MAX_MINUTES) throw new ApiError(400, `أطول مدة للزمنية ${durationText(MAX_MINUTES)}؛ للمدد الأطول اطلب إجازة`);

  const plan = dayPlan(user, date);
  if (plan.dayOff) throw new ApiError(400, 'هذا اليوم إجازتك الأسبوعية، فلا حاجة لزمنية');
  const shifts = planShifts(plan);
  if (shifts.length) {
    const first = toMinutes(shifts[0].start);
    const last = toMinutes(shifts[shifts.length - 1].end);
    if (toMinutes(from) < first || toMinutes(to) > last) {
      throw new ApiError(400, `الزمنية يجب أن تكون ضمن ساعات دوامك (${shifts[0].start}–${shifts[shifts.length - 1].end})`);
    }
  }
  if (date === today && type !== 'start' && toMinutes(from) < localMinutes(new Date()) - 30) {
    throw new ApiError(400, 'وقت بداية الزمنية مضى؛ اختر وقتاً من الآن فصاعداً');
  }

  const active = existing.filter((l) => ['Pending', 'Approved'].includes(l.status));
  if (active.length >= MAX_PER_DAY) throw new ApiError(409, `${MAX_PER_DAY} زمنيات في اليوم كحد أقصى`);
  const overlap = active.find((l) => toMinutes(from) < toMinutes(l.to) && toMinutes(l.from) < toMinutes(to));
  if (overlap) throw new ApiError(409, `يتداخل هذا الوقت مع زمنية أخرى في اليوم نفسه (${overlap.from}–${overlap.to})`);
  return minutes;
};

// The approved leave a check-out right now starts, if any: given explicitly,
// or the only one whose time has (nearly) come
const departureLeave = (leaves, date, leaveId, now = new Date()) => {
  const usable = leaves.filter((l) => l.type !== 'start' && !l.departedAt);
  const opensAt = (l) => zonedInstant(date, l.from).getTime() - EARLY_DEPARTURE_MINUTES * 60e3;
  const endsAt = (l) => zonedInstant(date, l.to).getTime();
  if (leaveId) {
    const leave = leaves.find((l) => String(l._id) === String(leaveId));
    if (!leave) throw new ApiError(404, 'لا توجد زمنية معتمدة بهذا الرقم لليوم');
    if (leave.type === 'start') throw new ApiError(400, 'زمنية التأخير لا تحتاج تأكيد خروج');
    if (leave.departedAt) throw new ApiError(409, 'أكّدت خروجك لهذه الزمنية مسبقاً');
    if (now.getTime() < opensAt(leave)) {
      throw new ApiError(400, `تبدأ زمنيتك الساعة ${leave.from}؛ يمكنك تأكيد الخروج قبلها بـ ${EARLY_DEPARTURE_MINUTES} دقيقة على الأكثر`);
    }
    if (now.getTime() > endsAt(leave)) throw new ApiError(400, 'انتهى وقت هذه الزمنية');
    return leave;
  }
  const due = usable.filter((l) => now.getTime() >= opensAt(l) && now.getTime() <= endsAt(l));
  return due.length === 1 ? due[0] : null;
};

module.exports = {
  TYPE_LABELS,
  MAX_MINUTES,
  requestRules,
  checkRequest,
  departureLeave,
  durationText,
};
