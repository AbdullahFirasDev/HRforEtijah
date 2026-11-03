const Attendance = require('../models/Attendance');
const Overtime = require('../models/Overtime');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { todayLocal } = require('../utils/dateUtils');
const { TIMESHEET_FIELDS, buildTimesheet } = require('../utils/timesheet');
const { reapplySchedule } = require('../utils/attendanceDay');
const logger = require('../config/logger');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_DAYS = 93;

// The requested period, the current month by default
const rangeOf = (query) => {
  const today = todayLocal();
  const monthStart = `${today.slice(0, 8)}01`;
  const from = query.from || monthStart;
  const to = query.to || new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new ApiError(400, 'صيغة التاريخ غير صحيحة');
  if (from > to) throw new ApiError(400, 'تاريخ البداية يجب أن يسبق تاريخ النهاية');
  if ((Date.parse(to) - Date.parse(from)) / 864e5 + 1 > MAX_DAYS) {
    throw new ApiError(400, `الفترة طويلة جداً؛ اختر ${MAX_DAYS} يوماً كحد أقصى`);
  }
  return { from, to, today };
};

const sheetsFor = async (users, { from, to, today }) => {
  const ids = users.map((u) => u._id);
  const [records, overtime] = await Promise.all([
    Attendance.find({ user: { $in: ids }, date: { $gte: from, $lte: to } }).select(TIMESHEET_FIELDS).lean(),
    Overtime.find({ user: { $in: ids }, date: { $gte: from, $lte: to } }).lean(),
  ]);
  return users.map((user) => {
    const mine = (list) => list.filter((x) => String(x.user) === String(user._id));
    return { user, ...buildTimesheet({ user, records: mine(records), overtime: mine(overtime), from, to, today }) };
  });
};

const userInfo = (u) => ({ id: u._id, name: u.name, email: u.email, role: u.role, isActive: u.isActive });

// @desc  Period totals for every employee the requester oversees
// @route GET /api/timesheets/summary?from&to
// @access Private (manager: their team, admin: all employees)
const getSummary = asyncHandler(async (req, res) => {
  const range = rangeOf(req.query);
  const scope = req.user.role === 'admin' ? { role: 'employee' } : { manager: req.user._id };
  const users = await User.find(scope).sort({ name: 1 });
  const sheets = await sheetsFor(users, range);
  res.json({
    success: true,
    from: range.from,
    to: range.to,
    employees: sheets.map((s) => ({ user: userInfo(s.user), totals: s.totals })),
  });
});

// @desc  One employee's day-by-day timesheet
// @route GET /api/timesheets/user/:id?from&to  (and /api/timesheets/me)
// @access Private (self; manager for their team; admin for anyone)
const getUserTimesheet = asyncHandler(async (req, res) => {
  const range = rangeOf(req.query);
  const id = req.params.id || String(req.user._id);
  const user = await User.findById(id);
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');
  const self = user._id.equals(req.user._id);
  const ownTeam = req.user.role === 'manager' && String(user.manager) === String(req.user._id);
  if (!self && !ownTeam && req.user.role !== 'admin') {
    throw new ApiError(403, 'يمكنك عرض الكشف الشهري لأعضاء فريقك فقط');
  }
  const [sheet] = await sheetsFor([user], range);
  res.json({ success: true, from: range.from, to: range.to, user: userInfo(user), days: sheet.days, totals: sheet.totals });
});

// @desc  Recalculate an employee's recorded days in a period on their
//        current schedule (e.g. days recorded before it was set or changed)
// @route POST /api/timesheets/user/:id/reapply  { from, to }
// @access Private (admin)
const reapplyUserSchedule = asyncHandler(async (req, res) => {
  const range = rangeOf(req.body || {});
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');
  const to = range.to > range.today ? range.today : range.to;
  const changed = await reapplySchedule(user, range.from, to);
  logger.info(`${req.user.email} recalculated ${changed} day(s) of ${user.email} (${range.from}..${to}) on the current schedule`);
  res.json({ success: true, changed });
});

module.exports = { getSummary, getUserTimesheet, reapplyUserSchedule };
