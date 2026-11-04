const { body } = require('express-validator');
const ApiError = require('./ApiError');
const { APP_TIMEZONE, addDays, localMinutes, todayLocal, zonedInstant } = require('./dateUtils');
const { MAX_SESSIONS_PER_DAY, planShifts, toMinutes } = require('./schedule');
const { autoCloseTime, recalcDay } = require('./attendanceDay');

// Admin corrections of a day's check-in/check-out times. Times are wall-clock
// "HH:mm" in the office's timezone on the record's date. A period that keeps
// its minute keeps its exact original time and location; anything an admin
// changes or adds is marked `manual`, and every correction is logged.

const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

// An extended period may end after midnight: its check-out is then earlier on
// the clock than its check-in, on the next calendar day
const isOvernight = (period, session) =>
  !!session?.extendedAt && !!period.out && toMinutes(period.out) <= toMinutes(period.in);

const hhmm = (instant) => {
  const m = localMinutes(instant, APP_TIMEZONE);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

// The day's periods as the edit form shows them
const periodsOf = (record) =>
  record.sessions.map((s, index) => ({
    index,
    in: hhmm(s.punchIn.time),
    out: s.punchOut?.time ? hhmm(s.punchOut.time) : null,
    auto: !!s.punchOut?.auto,
    manual: !!(s.punchIn.manual || s.punchOut?.manual),
    extended: !!s.extendedAt,
  }));

const periodRules = [
  body('periods', `أضف فترة حضور واحدة على الأقل (${MAX_SESSIONS_PER_DAY} فترات كحد أقصى)`).isArray({
    min: 1,
    max: MAX_SESSIONS_PER_DAY,
  }),
  body('periods.*.in', 'وقت الحضور غير صحيح').matches(TIME_RE),
  body('periods.*.out', 'وقت الانصراف غير صحيح').optional({ values: 'falsy' }).matches(TIME_RE),
  body('periods.*.index', 'رقم الفترة غير صحيح').optional({ values: 'null' }).isInt({ min: 0 }).toInt(),
  body('reason', 'اكتب سبب التعديل (3 أحرف على الأقل)').isString().trim().isLength({ min: 3, max: 300 }),
];

// Checks the order and timing of the periods for `date`; returns them sorted
const checkPeriods = (periods, date, existing) => {
  const today = todayLocal();
  if (date > today) throw new ApiError(400, 'لا يمكن تسجيل حضور ليوم لم يأتِ بعد');
  const nowMinutes = localMinutes(new Date(), APP_TIMEZONE);
  const sorted = [...periods].sort((a, b) => toMinutes(a.in) - toMinutes(b.in));
  const used = new Set();

  sorted.forEach((p, i) => {
    const n = i + 1;
    if (p.index != null) {
      if (p.index >= existing.length || used.has(p.index)) throw new ApiError(400, 'رقم الفترة غير صحيح');
      used.add(p.index);
    }
    if (!p.out) {
      if (i !== sorted.length - 1 || date !== today) {
        throw new ApiError(400, `حدّد وقت الانصراف للفترة ${n}`);
      }
    } else if (i === sorted.length - 1 && isOvernight(p, existing[p.index])) {
      if (zonedInstant(addDays(date, 1), p.out, APP_TIMEZONE) > new Date()) {
        throw new ApiError(400, 'لا يمكن تسجيل وقت لم يحن بعد');
      }
    } else if (toMinutes(p.out) <= toMinutes(p.in)) {
      throw new ApiError(400, `وقت الانصراف يجب أن يكون بعد وقت الحضور (الفترة ${n})`);
    }
    if (i > 0 && toMinutes(p.in) < toMinutes(sorted[i - 1].out)) {
      throw new ApiError(400, `الفترة ${n} تبدأ قبل انتهاء الفترة ${i}`);
    }
    if (date === today && Math.max(toMinutes(p.in), p.out ? toMinutes(p.out) : 0) > nowMinutes) {
      throw new ApiError(400, 'لا يمكن تسجيل وقت لم يحن بعد');
    }
  });
  return sorted;
};

// Replaces the record's periods with the admin's, logging who changed what
const applyPeriods = (record, periods, { by, reason }) => {
  const sorted = checkPeriods(periods, record.date, record.sessions);
  const old = record.sessions.map((s) => (s.toObject ? s.toObject() : s));
  const before = old.map((s) => ({ in: s.punchIn.time, out: s.punchOut?.time || null }));
  const at = (time) => zonedInstant(record.date, time, APP_TIMEZONE);

  record.sessions = sorted.map((p) => {
    const prev = p.index != null ? old[p.index] : null;
    const keepIn = prev && hhmm(prev.punchIn.time) === p.in;
    const punchIn = keepIn ? prev.punchIn : { ...(prev?.punchIn || {}), time: at(p.in), manual: true };
    const session = { punchIn };
    if (p.out) {
      const keepOut = prev?.punchOut?.time && hhmm(prev.punchOut.time) === p.out;
      session.punchOut = keepOut
        ? prev.punchOut
        : {
            ...(prev?.punchOut || {}),
            time: isOvernight(p, prev) ? zonedInstant(addDays(record.date, 1), p.out, APP_TIMEZONE) : at(p.out),
            auto: false,
            manual: true,
          };
    }
    for (const field of ['extendedAt', 'extendedFrom', 'extendedUntil', 'extendReason']) {
      if (prev?.[field]) session[field] = prev[field];
    }
    return session;
  });

  const first = record.sessions[0];
  const last = record.sessions[record.sessions.length - 1];
  record.punchIn = { time: first.punchIn.time, location: first.punchIn.location, manual: first.punchIn.manual };
  record.punchOut = last.punchOut?.time ? { time: last.punchOut.time, location: last.punchOut.location } : undefined;
  recalcDay(record);
  // A period left open (today only) still closes by itself, unless it's extended
  if (last.punchOut?.time) record.autoCloseAt = null;
  else if (!last.extendedAt) record.autoCloseAt = autoCloseTime(record, last.punchIn.time);
  record.edits = [
    ...(record.edits || []),
    { by, at: new Date(), reason, before, after: record.sessions.map((s) => ({ in: s.punchIn.time, out: s.punchOut?.time || null })) },
  ];
};

// What the admin's edit window shows for a record
const editView = (record) => {
  const clock = (p) => ({ in: hhmm(p.in), out: p.out ? hhmm(p.out) : null });
  return {
    id: record._id,
    date: record.date,
    user: record.user?.name ? { id: record.user._id, name: record.user.name } : { id: record.user },
    shifts: planShifts(record.schedule),
    dayOff: !!record.schedule?.dayOff,
    totalHours: record.totalHours,
    status: record.status,
    missedPunchOut: !!record.missedPunchOut,
    periods: periodsOf(record),
    edits: (record.edits || []).map((e) => ({
      by: e.by?.name || null,
      at: e.at,
      reason: e.reason,
      before: e.before.map(clock),
      after: e.after.map(clock),
    })),
  };
};

module.exports = { periodRules, periodsOf, applyPeriods, editView };
