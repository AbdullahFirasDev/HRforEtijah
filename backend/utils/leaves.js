const express = require('express');
const { body } = require('express-validator');
const ApiError = require('./ApiError');
const { addDays, todayLocal } = require('./dateUtils');
const { weekdayOf } = require('./schedule');
const LeaveType = require('../models/LeaveType');
const LeaveRequest = require('../models/LeaveRequest');
const LeaveAttachment = require('../models/LeaveAttachment');
const LeaveBalanceEntry = require('../models/LeaveBalanceEntry');
const Counter = require('../models/Counter');

// Rules for leave requests (إجازات), see models/LeaveRequest.js. Company
// policy (kinds of leave, what is paid, what uses a balance, how days are
// counted) lives in the admin-defined leave types, not here. This file only
// holds limits that keep the data sane.

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366; // longest single request, in calendar days
const MAX_DAYS_AHEAD = 365; // how far ahead a leave may start
const MAX_PAST_DAYS = 90; // ceiling for a type's allowPastDays
const ACTIVE = ['Pending', 'Approved'];
const STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled'];

const MAX_FILE_BYTES = 2 * 1024 * 1024;
const MAX_FILES = 3;
const MAX_DRAFTS = 10;
const DRAFT_HOURS = 24;

const NOT_READY = 'قسم الإجازات غير مفعّل بعد. يجب أن يكمل مسؤول النظام إعداده أولاً.';

// ---------- Readiness ----------
// Like notifications, the feature stays off until the migration created its
// collections and indexes (npm run leaves:migrate): nothing is written before.
const REQUIRED_INDEXES = [
  [LeaveType, '_id_'],
  [LeaveRequest, 'number_1'],
  [LeaveAttachment, 'draftExpiresAt_1'],
  [LeaveBalanceEntry, 'key_1'],
  [Counter, '_id_'],
];
const READY_RECHECK_MS = 60e3;
let ready = false;
let checkedAt = 0;
let checking = null;

const leavesReady = async () => {
  if (ready) return true;
  if (checking) return checking;
  if (Date.now() - checkedAt < READY_RECHECK_MS) return false;
  checking = (async () => {
    try {
      const found = await Promise.all(REQUIRED_INDEXES.map(([Model, name]) => Model.collection.indexExists(name)));
      ready = found.every(Boolean);
    } catch {
      ready = false; // a collection doesn't exist yet
    }
    checkedAt = Date.now();
    checking = null;
    return ready;
  })();
  return checking;
};

// The next check asks the database again (after the migration ran in-process)
const forgetReadyState = () => {
  ready = false;
  checkedAt = 0;
};

const requireLeaves = (req, res, next) => {
  leavesReady()
    .then((ok) => (ok ? next() : next(new ApiError(503, NOT_READY))))
    .catch(next);
};

// ---------- Dates and days ----------
const isValidDate = (value) => {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
};

const datesBetween = (start, end) => {
  const out = [];
  for (let d = start; d <= end && out.length <= MAX_RANGE_DAYS; d = addDays(d, 1)) out.push(d);
  return out;
};

// e.g. "يوم واحد"، "يومان"، "5 أيام"، "12 يوماً"
const daysText = (n) => {
  if (!Number.isInteger(n)) return `${n} يوم`;
  if (n === 1) return 'يوم واحد';
  if (n === 2) return 'يومان';
  if (n >= 3 && n <= 10) return `${n} أيام`;
  return `${n} يوماً`;
};

// The days a leave counts: every day of the range, or only the employee's
// working days (their weekly days off from the schedule set by an admin)
const countDays = (user, countMode, start, end) => {
  const all = datesBetween(start, end);
  const off = user.weeklyOffDays || [];
  const counted = countMode === 'calendar' ? all : all.filter((d) => !off.includes(weekdayOf(d)));
  return { all, counted };
};

const daysByYear = (dates) => {
  const map = new Map();
  for (const d of dates) {
    const y = Number(d.slice(0, 4));
    map.set(y, (map.get(y) || 0) + 1);
  }
  return map;
};

// Everything about the dates that doesn't depend on other requests
const checkDates = (user, type, startDate, endDate) => {
  const today = todayLocal();
  if (endDate < startDate) throw new ApiError(400, 'تاريخ نهاية الإجازة يجب أن يكون في يوم بدايتها أو بعده');
  const back = type.allowPastDays || 0;
  if (startDate < addDays(today, -back)) {
    throw new ApiError(
      400,
      back ? `يمكن أن تبدأ «${type.name}» قبل ${daysText(back)} من اليوم على الأكثر` : 'لا يمكن أن تبدأ الإجازة في يوم مضى'
    );
  }
  if (startDate > addDays(today, MAX_DAYS_AHEAD)) throw new ApiError(400, 'يمكن طلب الإجازة قبل سنة من بدايتها على الأكثر');
  if (endDate > addDays(startDate, MAX_RANGE_DAYS - 1)) throw new ApiError(400, `أطول مدة للطلب الواحد ${daysText(MAX_RANGE_DAYS)}`);

  const { all, counted } = countDays(user, type.countMode, startDate, endDate);
  if (!counted.length) {
    throw new ApiError(400, 'كل أيام هذه الفترة من أيام إجازتك الأسبوعية، فلا يُحسب منها أي يوم');
  }
  if (type.maxDaysPerRequest && counted.length > type.maxDaysPerRequest) {
    throw new ApiError(400, `أطول «${type.name}» في الطلب الواحد ${daysText(type.maxDaysPerRequest)}، والفترة المختارة ${daysText(counted.length)}`);
  }
  return { all, counted };
};

// Another pending or approved request of the employee on any of these days
const findOverlap = (userId, startDate, endDate, exceptId = null) =>
  LeaveRequest.findOne({
    user: userId,
    status: { $in: ACTIVE },
    startDate: { $lte: endDate },
    endDate: { $gte: startDate },
    ...(exceptId && { _id: { $ne: exceptId } }),
  })
    .select('number startDate endDate status')
    .lean();

// ---------- Balances ----------
const round2 = (n) => Math.round(n * 100) / 100;
const yearRange = (year) => [`${year}-01-01`, `${year}-12-31`];
const keyOf = (userId, typeId) => `${userId}:${typeId}`;

// Balance of each (employee, type) for a calendar year:
//   granted      the yearly grant
//   adjustments  admin corrections, carry-overs (+/-)
//   total        granted + adjustments
//   used         days of approved requests that use the balance
//   pending      days of requests still waiting for a decision
//   remaining    total - used;  available: remaining - pending
// Used and pending come from the requests themselves, never from a stored
// deduction, so nothing can be deducted twice.
const balancesFor = async ({ userIds, typeIds, year }) => {
  const [from, to] = yearRange(year);
  const [entries, requests] = await Promise.all([
    LeaveBalanceEntry.aggregate([
      { $match: { user: { $in: userIds }, leaveType: { $in: typeIds }, year } },
      { $group: { _id: { user: '$user', type: '$leaveType', kind: '$kind' }, days: { $sum: '$days' } } },
    ]),
    LeaveRequest.find({
      user: { $in: userIds },
      leaveType: { $in: typeIds },
      status: { $in: ACTIVE },
      'policy.deductsBalance': true,
      countedDates: { $elemMatch: { $gte: from, $lte: to } },
    })
      .select('user leaveType status countedDates')
      .lean(),
  ]);
  const map = new Map();
  const get = (u, t) => {
    const k = keyOf(u, t);
    if (!map.has(k)) map.set(k, { granted: 0, adjustments: 0, used: 0, pending: 0 });
    return map.get(k);
  };
  for (const e of entries) {
    const b = get(e._id.user, e._id.type);
    if (e._id.kind === 'grant') b.granted += e.days;
    else b.adjustments += e.days;
  }
  for (const r of requests) {
    const days = r.countedDates.filter((d) => d >= from && d <= to).length;
    const b = get(r.user, r.leaveType);
    if (r.status === 'Approved') b.used += days;
    else b.pending += days;
  }
  for (const b of map.values()) {
    b.granted = round2(b.granted);
    b.adjustments = round2(b.adjustments);
    b.total = round2(b.granted + b.adjustments);
    b.remaining = round2(b.total - b.used);
    b.available = round2(b.remaining - b.pending);
  }
  return {
    get: (u, t) => {
      const b = map.get(keyOf(u, t));
      return b ? { ...b } : { granted: 0, adjustments: 0, total: 0, used: 0, pending: 0, remaining: 0, available: 0 };
    },
  };
};

// Throws when the balance can't cover these days. `ownPending` are this
// request's own days, already counted as pending (when approving it).
const checkBalance = async (userId, type, countedDates, { ownPending = false } = {}) => {
  for (const [year, days] of daysByYear(countedDates)) {
    const balances = await balancesFor({ userIds: [userId], typeIds: [type._id], year });
    const b = balances.get(userId, type._id);
    const available = round2(b.available + (ownPending ? days : 0));
    if (days > available) {
      throw new ApiError(
        409,
        b.total
          ? `رصيد «${type.name || type.typeName}» لسنة ${year} لا يكفي: المتاح ${daysText(Math.max(0, available))} والمطلوب ${daysText(days)}`
          : `لا يوجد رصيد «${type.name || type.typeName}» لسنة ${year}. تواصل مع الإدارة لإضافة الرصيد.`
      );
    }
  }
};

// ---------- Request numbers ----------
// e.g. "2026-0007"; a number skipped by a failed save is not reused
const nextRequestNumber = async () => {
  const year = todayLocal().slice(0, 4);
  const seq = await Counter.next(`leaveRequest:${year}`);
  return `${year}-${String(seq).padStart(4, '0')}`;
};

// ---------- History ----------
const historyEntry = (action, user, note = '') => ({
  action,
  by: user._id,
  byName: user.name,
  byRole: user.role,
  at: new Date(),
  note: note || '',
});

// ---------- Attachments ----------
const sniffType = (buf) => {
  if (!buf || buf.length < 12) return null;
  if (buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.subarray(0, 4).toString('latin1') === 'RIFF' && buf.subarray(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
};
const EXTENSIONS = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// The name sent in X-File-Name (URI-encoded), without path or control characters
const cleanFileName = (raw, type) => {
  let name = '';
  try {
    name = decodeURIComponent(String(raw || ''));
  } catch {
    name = '';
  }
  // eslint-disable-next-line no-control-regex
  name = name.replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '').trim();
  if (name.length > 120) name = name.slice(name.length - 120);
  return name || `مرفق.${EXTENSIONS[type]}`;
};

// The uploaded file's bytes (the body is the file itself, not a form)
const rawFile = express.raw({ type: () => true, limit: MAX_FILE_BYTES });
const readFile = (req, res, next) =>
  rawFile(req, res, (err) => {
    if (err) {
      return next(
        new ApiError(err.status === 413 ? 413 : 400, err.status === 413 ? 'حجم الملف أكبر من 2 ميغابايت' : 'تعذرت قراءة الملف')
      );
    }
    const data = Buffer.isBuffer(req.body) ? req.body : null;
    if (!data || !data.length) return next(new ApiError(400, 'الملف فارغ'));
    const type = sniffType(data);
    if (!type) return next(new ApiError(415, 'نوع الملف غير مدعوم. أرفق ملف PDF أو صورة (JPG أو PNG أو WebP).'));
    req.file = { data, type, size: data.length, name: cleanFileName(req.get('x-file-name'), type) };
    next();
  });

const attachmentView = (a) => ({ id: a._id, name: a.name, type: a.type, size: a.size, at: a.at || a.createdAt });

// ---------- Input checks ----------
const yearRule = (field, where = body) =>
  where(field, 'السنة غير صحيحة').optional().isInt({ min: 2000, max: 2100 }).toInt();

const typeRules = (creating) => {
  const opt = (chain) => (creating ? chain : chain.optional());
  return [
    opt(body('name', 'اكتب اسم نوع الإجازة (2 إلى 60 حرفاً)')).isString().trim().isLength({ min: 2, max: 60 }),
    body('description', 'الوصف طويل جداً (300 حرف كحد أقصى)').optional({ values: 'null' }).isString().trim().isLength({ max: 300 }),
    body('paid', 'حدّد هل الإجازة مدفوعة').optional().isBoolean({ strict: true }),
    body('deductsBalance', 'قيمة الخصم من الرصيد غير صحيحة').optional().isBoolean({ strict: true }),
    body('countMode', 'طريقة احتساب الأيام غير صحيحة').optional().isIn(['working', 'calendar']),
    body('requiresAttachment', 'قيمة إلزام المرفق غير صحيحة').optional().isBoolean({ strict: true }),
    body('maxDaysPerRequest', 'الحد الأقصى للأيام يجب أن يكون بين 1 و366')
      .optional({ values: 'null' })
      .isInt({ min: 1, max: MAX_RANGE_DAYS })
      .toInt(),
    body('allowPastDays', `أيام الطلب بأثر رجعي يجب أن تكون بين 0 و${MAX_PAST_DAYS}`)
      .optional()
      .isInt({ min: 0, max: MAX_PAST_DAYS })
      .toInt(),
    body('isActive', 'قيمة التفعيل غير صحيحة').optional().isBoolean({ strict: true }),
    body('order', 'الترتيب غير صحيح').optional().isInt({ min: 0, max: 999 }).toInt(),
  ];
};

const requestRules = [
  body('leaveType', 'اختر نوع الإجازة').isMongoId(),
  body('startDate', 'تاريخ بداية الإجازة غير صحيح').custom(isValidDate),
  body('endDate', 'تاريخ نهاية الإجازة غير صحيح').custom(isValidDate),
  body('reason', 'اكتب سبب الإجازة (3 أحرف على الأقل، 500 كحد أقصى)').isString().trim().isLength({ min: 3, max: 500 }),
  body('notes', 'الملاحظات طويلة جداً (1000 حرف كحد أقصى)').optional({ values: 'null' }).isString().trim().isLength({ max: 1000 }),
  body('attachments', `يمكن إرفاق ${MAX_FILES} ملفات كحد أقصى`).optional().isArray({ max: MAX_FILES }),
  body('attachments.*', 'المرفق غير صحيح').isMongoId(),
];

const previewRules = [
  body('leaveType', 'اختر نوع الإجازة').isMongoId(),
  body('startDate', 'تاريخ بداية الإجازة غير صحيح').custom(isValidDate),
  body('endDate', 'تاريخ نهاية الإجازة غير صحيح').custom(isValidDate),
];

const reviewRules = [
  body('status', 'القرار يجب أن يكون "مقبول" أو "مرفوض"').isIn(['Approved', 'Rejected']),
  body('remarks', 'الملاحظات طويلة جداً (500 حرف كحد أقصى)').optional({ values: 'null' }).isString().trim().isLength({ max: 500 }),
  body('remarks').custom((remarks, { req }) => {
    if (req.body.status === 'Rejected' && String(remarks || '').trim().length < 3) {
      throw new Error('اكتب سبب الرفض (3 أحرف على الأقل)');
    }
    return true;
  }),
];

const cancelRules = [
  body('reason', 'سبب الإلغاء طويل جداً (300 حرف كحد أقصى)').optional({ values: 'null' }).isString().trim().isLength({ max: 300 }),
];

const revokeRules = [
  body('reason', 'اكتب سبب إلغاء الإجازة المقبولة (3 أحرف على الأقل)').isString().trim().isLength({ min: 3, max: 300 }),
];

const balanceDaysRule = (field) =>
  body(field, 'عدد الأيام يجب أن يكون بين -365 و365، بخطوات نصف يوم')
    .isFloat({ min: -365, max: 365 })
    .bail()
    .custom((v) => Number(v) !== 0 && Number.isInteger(Number(v) * 2))
    .withMessage('عدد الأيام يجب ألا يكون صفراً، وبخطوات نصف يوم')
    .toFloat();

const balanceEntryRules = [
  body('user', 'اختر الموظف').isMongoId(),
  body('leaveType', 'اختر نوع الإجازة').isMongoId(),
  body('year', 'السنة غير صحيحة').isInt({ min: 2000, max: 2100 }).toInt(),
  body('kind', 'نوع القيد غير صحيح').isIn(['grant', 'adjustment']),
  balanceDaysRule('days'),
  body('days').custom((v, { req }) => {
    if (req.body.kind === 'grant' && Number(v) <= 0) throw new Error('رصيد المنح يجب أن يكون أكبر من صفر');
    return true;
  }),
  body('reason', 'اكتب سبب القيد (3 أحرف على الأقل)').isString().trim().isLength({ min: 3, max: 300 }),
];

const bulkGrantRules = [
  body('leaveType', 'اختر نوع الإجازة').isMongoId(),
  body('year', 'السنة غير صحيحة').isInt({ min: 2000, max: 2100 }).toInt(),
  balanceDaysRule('days'),
  body('days').custom((v) => {
    if (Number(v) <= 0) throw new Error('رصيد المنح يجب أن يكون أكبر من صفر');
    return true;
  }),
  body('reason', 'اكتب سبب المنح (3 أحرف على الأقل)').isString().trim().isLength({ min: 3, max: 300 }),
  body('users', 'قائمة الموظفين غير صحيحة').optional().isArray({ min: 1, max: 500 }),
  body('users.*', 'الموظف غير صحيح').isMongoId(),
];

module.exports = {
  ACTIVE,
  STATUSES,
  MAX_FILES,
  MAX_DRAFTS,
  DRAFT_HOURS,
  MAX_FILE_BYTES,
  NOT_READY,
  leavesReady,
  forgetReadyState,
  requireLeaves,
  isValidDate,
  daysText,
  countDays,
  daysByYear,
  checkDates,
  findOverlap,
  balancesFor,
  checkBalance,
  nextRequestNumber,
  historyEntry,
  readFile,
  attachmentView,
  yearRule,
  typeRules,
  requestRules,
  previewRules,
  reviewRules,
  cancelRules,
  revokeRules,
  balanceEntryRules,
  bulkGrantRules,
};
