const TimeLeave = require('../models/TimeLeave');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { todayLocal, zonedInstant } = require('../utils/dateUtils');
const { checkGrant, checkRequest } = require('../utils/timeLeave');
const { dayPlan } = require('../utils/schedule');
const logger = require('../config/logger');
const { refreshDay } = require('../utils/attendanceDay');
const notifyEvents = require('../utils/notifyEvents');

const EARLY_MS = 15 * 60e3;

// A leave approved after the fact: tie it to the check-out (and check-in back)
// the employee already made in its time window
const linkPastPunches = (leave, record) => {
  if (leave.type === 'start' || !record) return;
  const from = zonedInstant(leave.date, leave.from).getTime() - EARLY_MS;
  const to = zonedInstant(leave.date, leave.to).getTime();
  const sessions = record.sessions;
  if (!leave.departedAt) {
    const i = sessions.findIndex((s) => s.punchOut?.time && !s.punchOut.auto && +s.punchOut.time >= from && +s.punchOut.time <= to);
    if (i < 0) return;
    leave.departedAt = sessions[i].punchOut.time;
    sessions[i].punchOut.leave = leave._id;
  }
  if (leave.type === 'during' && !leave.returnedAt) {
    const back = sessions.find((s) => +s.punchIn.time > +leave.departedAt);
    if (back) {
      leave.returnedAt = back.punchIn.time;
      back.punchIn.leave = leave._id;
    }
  }
};

// Recomputes the employee's day after a leave's approval changed
const refreshRecord = async (leave) => {
  const record = await Attendance.findOne({ user: leave.user._id || leave.user, date: leave.date });
  if (record) record.adoptLegacySession();
  if (leave.status === 'Approved') {
    linkPastPunches(leave, record);
    await leave.save();
  }
  if (!record) return;
  await refreshDay(record);
  await record.save();
};

// A leave moved to another day: the old day forgets it (the check-out/in it
// was tied to) and is recomputed without it
const detachFromDay = async (leave, date) => {
  const record = await Attendance.findOne({ user: leave.user._id || leave.user, date });
  if (!record) return;
  record.adoptLegacySession();
  for (const s of record.sessions) {
    if (String(s.punchIn?.leave) === String(leave._id)) s.punchIn.leave = undefined;
    if (String(s.punchOut?.leave) === String(leave._id)) s.punchOut.leave = undefined;
  }
  await refreshDay(record);
  await record.save();
};

// @desc  Employee asks for a time leave
// @route POST /api/time-leaves
// @access Private (employee)
const requestLeave = asyncHandler(async (req, res) => {
  const { date, type, from, to, reason } = req.body;
  const existing = await TimeLeave.find({ user: req.user._id, date }).lean();
  const minutes = checkRequest(req.user, req.body, existing);
  const leave = await TimeLeave.create({ user: req.user._id, date, type, from, to, minutes, reason });
  await notifyEvents.timeLeaveRequested(leave, req.user);
  res.status(201).json({ success: true, leave });
});

// @desc  The signed-in employee's time leaves, newest first
// @route GET /api/time-leaves/me
// @access Private
const getMyLeaves = asyncHandler(async (req, res) => {
  const leaves = await TimeLeave.find({ user: req.user._id })
    .sort({ date: -1, from: -1 })
    .limit(200)
    .populate('reviewedBy', 'name')
    .populate('addedBy', 'name');
  res.json({ success: true, leaves });
});

// @desc  Employee withdraws a pending or approved leave they haven't used
// @route PATCH /api/time-leaves/:id/cancel
// @access Private (owner)
const cancelLeave = asyncHandler(async (req, res) => {
  const leave = await TimeLeave.findOne({ _id: req.params.id, user: req.user._id });
  if (!leave) throw new ApiError(404, 'الزمنية غير موجودة');
  if (!['Pending', 'Approved'].includes(leave.status)) throw new ApiError(409, 'لا يمكن إلغاء زمنية مرفوضة أو ملغاة');
  if (leave.departedAt) throw new ApiError(409, 'خرجت بهذه الزمنية فعلاً، فلا يمكن إلغاؤها');
  if (leave.date < todayLocal()) throw new ApiError(409, 'لا يمكن إلغاء زمنية ليوم مضى');
  const wasApproved = leave.status === 'Approved';
  leave.status = 'Cancelled';
  await leave.save();
  if (wasApproved) await refreshRecord(leave);
  await notifyEvents.timeLeaveCancelled(leave, req.user, wasApproved);
  res.json({ success: true, leave });
});

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

// The requested period, the current month by default
const periodOf = (query) => {
  const today = todayLocal();
  const from = query.from || `${today.slice(0, 8)}01`;
  const to =
    query.to || new Date(Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0)).toISOString().slice(0, 10);
  if (!DATE_RE.test(from) || !DATE_RE.test(to)) throw new ApiError(400, 'صيغة التاريخ غير صحيحة');
  if (from > to) throw new ApiError(400, 'تاريخ البداية يجب أن يسبق تاريخ النهاية');
  if ((Date.parse(to) - Date.parse(from)) / 864e5 + 1 > MAX_RANGE_DAYS) {
    throw new ApiError(400, `الفترة طويلة جداً؛ اختر ${MAX_RANGE_DAYS} يوماً كحد أقصى`);
  }
  return { from, to };
};

// @desc  Time leaves of the people the reviewer oversees, optionally of one
//        employee and/or within a period
// @route GET /api/time-leaves/review?status=Pending&userId&from&to
// @access Private (manager: their team, admin: everyone)
const getLeavesForReview = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === 'manager') {
    const team = await User.find({ manager: req.user._id }).select('_id');
    filter.user = { $in: team.map((u) => u._id) };
  }
  if (req.query.userId) {
    if (filter.user && !filter.user.$in.some((id) => String(id) === String(req.query.userId))) {
      throw new ApiError(403, 'يمكنك عرض زمنيات أعضاء فريقك فقط');
    }
    filter.user = req.query.userId;
  }
  if (req.query.from || req.query.to) {
    const { from, to } = periodOf(req.query);
    filter.date = { $gte: from, $lte: to };
  }
  if (req.query.status) filter.status = req.query.status;
  const leaves = await TimeLeave.find(filter)
    .populate('user', 'name email manager')
    .populate('reviewedBy', 'name')
    .populate('addedBy', 'name')
    .populate('edits.by', 'name')
    .sort({ date: -1, from: -1 })
    .limit(300);
  res.json({ success: true, leaves });
});

// @desc  Approve or reject a time leave
// @route PATCH /api/time-leaves/:id/review
// @access Private (the employee's manager, or an admin)
const reviewLeave = asyncHandler(async (req, res) => {
  const { status, reviewRemarks } = req.body;
  const leave = await TimeLeave.findById(req.params.id).populate('user', 'name manager');
  if (!leave) throw new ApiError(404, 'الزمنية غير موجودة');
  assertOversees(req.user, leave.user);
  if (leave.status !== 'Pending') throw new ApiError(409, 'تمت مراجعة هذه الزمنية مسبقاً أو أُلغيت');
  leave.status = status;
  leave.reviewRemarks = reviewRemarks || '';
  leave.reviewedBy = req.user._id;
  leave.reviewedAt = new Date();
  await leave.save();
  if (status === 'Approved') await refreshRecord(leave);
  await notifyEvents.timeLeaveReviewed(leave, req.user);
  res.json({ success: true, leave });
});

// @desc  How many time leaves each employee had in a period, by status and
//        type, with the approved time in minutes
// @route GET /api/time-leaves/stats?from&to (the current month by default)
// @access Private (manager: their team, admin: every employee)
const getLeaveStats = asyncHandler(async (req, res) => {
  const { from, to } = periodOf(req.query);
  const scope = req.user.role === 'admin' ? { role: 'employee' } : { manager: req.user._id };
  const users = await User.find(scope).select('name email isActive').sort({ name: 1 }).lean();
  const leaves = await TimeLeave.find({ user: { $in: users.map((u) => u._id) }, date: { $gte: from, $lte: to } })
    .select('user type minutes status addedBy')
    .lean();

  const blank = () => ({
    approved: 0,
    approvedMinutes: 0,
    during: 0,
    end: 0,
    start: 0,
    added: 0,
    pending: 0,
    rejected: 0,
    cancelled: 0,
  });
  const byUser = new Map(users.map((u) => [String(u._id), blank()]));
  for (const l of leaves) {
    const s = byUser.get(String(l.user));
    if (!s) continue;
    if (l.status === 'Approved') {
      s.approved += 1;
      s.approvedMinutes += l.minutes || 0;
      s[l.type] += 1;
      if (l.addedBy) s.added += 1;
    } else if (l.status === 'Pending') s.pending += 1;
    else if (l.status === 'Rejected') s.rejected += 1;
    else if (l.status === 'Cancelled') s.cancelled += 1;
  }
  const employees = users.map((u) => ({
    user: { id: u._id, name: u.name, email: u.email, isActive: u.isActive },
    ...byUser.get(String(u._id)),
  }));
  const totals = employees.reduce((sum, e) => {
    for (const k of Object.keys(blank())) sum[k] += e[k];
    return sum;
  }, blank());
  res.json({ success: true, from, to, employees, totals });
});

// Managers act for their own team only; admins for everyone
const assertOversees = (reviewer, employee) => {
  if (reviewer.role === 'manager' && String(employee.manager) !== String(reviewer._id)) {
    throw new ApiError(403, 'يمكنك إدارة زمنيات أعضاء فريقك فقط');
  }
};

// The plan a leave is checked against: the one frozen on the day's record,
// or the employee's current schedule for a day without one
const planFor = async (user, date) => {
  const record = await Attendance.findOne({ user: user._id, date }).select('schedule').lean();
  return record?.schedule?.hours != null ? record.schedule : dayPlan(user, date);
};

// @desc  A manager or admin adds an approved time leave for an employee, on
//        any day including past ones (e.g. time the employee was away and
//        didn't ask for in the app). The day is recalculated at once.
// @route POST /api/time-leaves/grant
// @access Private (manager: their team, admin: everyone)
const grantLeave = asyncHandler(async (req, res) => {
  const { userId, date, type, from, to, reason } = req.body;
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'الموظف غير موجود');
  assertOversees(req.user, user);
  const existing = await TimeLeave.find({ user: user._id, date }).lean();
  const minutes = checkGrant(await planFor(user, date), req.body, existing);
  const now = new Date();
  const leave = await TimeLeave.create({
    user: user._id,
    date,
    type,
    from,
    to,
    minutes,
    reason,
    status: 'Approved',
    reviewedBy: req.user._id,
    reviewedAt: now,
    addedBy: req.user._id,
  });
  await refreshRecord(leave);
  logger.info(`${req.user.email} added a time leave for ${user.email}@${date} ${from}-${to}: ${reason}`);
  await notifyEvents.timeLeaveGranted(leave, req.user);
  res.status(201).json({ success: true, leave });
});

// @desc  A manager or admin corrects a pending or approved leave: its type,
//        times, day (e.g. it was added on the wrong day) and own reason. Every
//        change is logged with who made it and why, and the days involved are
//        recalculated.
// @route PATCH /api/time-leaves/:id
// @access Private (manager: their team, admin: everyone)
const updateLeave = asyncHandler(async (req, res) => {
  const { type, from, to, reason, leaveReason } = req.body;
  const leave = await TimeLeave.findById(req.params.id).populate('user', 'name email manager workSchedule weeklyOffDays');
  if (!leave) throw new ApiError(404, 'الزمنية غير موجودة');
  assertOversees(req.user, leave.user);
  if (!['Pending', 'Approved'].includes(leave.status)) throw new ApiError(409, 'لا يمكن تعديل زمنية مرفوضة أو ملغاة');
  const date = req.body.date || leave.date;
  const oldDate = leave.date;
  const moved = date !== oldDate;
  const newReason = leaveReason?.trim() || leave.reason;
  if (!moved && type === leave.type && from === leave.from && to === leave.to && newReason === leave.reason) {
    throw new ApiError(400, 'لم تغيّر شيئاً في الزمنية');
  }
  const others = await TimeLeave.find({ user: leave.user._id, date, _id: { $ne: leave._id } }).lean();
  const minutes = checkGrant(await planFor(leave.user, date), { date, from, to }, others);
  leave.edits = [
    ...(leave.edits || []),
    {
      by: req.user._id,
      at: new Date(),
      reason,
      before: { date: oldDate, type: leave.type, from: leave.from, to: leave.to, reason: leave.reason },
    },
  ];
  Object.assign(leave, { date, type, from, to, minutes, reason: newReason });
  // On another day it hasn't been used yet
  if (moved) {
    leave.departedAt = null;
    leave.returnedAt = null;
  }
  await leave.save();
  if (moved) await detachFromDay(leave, oldDate);
  if (leave.status === 'Approved') await refreshRecord(leave);
  logger.info(
    `${req.user.email} changed time leave ${leave._id} of ${leave.user.email} from ${oldDate} to ${date} ${from}-${to}: ${reason}`
  );
  await notifyEvents.timeLeaveGranted(leave, req.user, { edited: true, reason });
  res.json({ success: true, leave });
});

// @desc  A manager or admin withdraws a pending or approved leave (any day);
//        the time it excused counts again
// @route PATCH /api/time-leaves/:id/revoke
// @access Private (manager: their team, admin: everyone)
const revokeLeave = asyncHandler(async (req, res) => {
  const leave = await TimeLeave.findById(req.params.id).populate('user', 'name email manager');
  if (!leave) throw new ApiError(404, 'الزمنية غير موجودة');
  assertOversees(req.user, leave.user);
  if (!['Pending', 'Approved'].includes(leave.status)) throw new ApiError(409, 'هذه الزمنية مرفوضة أو ملغاة مسبقاً');
  const wasApproved = leave.status === 'Approved';
  leave.status = 'Cancelled';
  leave.reviewRemarks = req.body?.reviewRemarks || leave.reviewRemarks;
  leave.reviewedBy = req.user._id;
  leave.reviewedAt = new Date();
  await leave.save();
  if (wasApproved) await refreshRecord(leave);
  logger.info(`${req.user.email} withdrew time leave ${leave._id} of ${leave.user.email}@${leave.date}`);
  await notifyEvents.timeLeaveRevoked(leave, req.user);
  res.json({ success: true, leave });
});

module.exports = {
  requestLeave,
  getMyLeaves,
  cancelLeave,
  getLeavesForReview,
  getLeaveStats,
  reviewLeave,
  grantLeave,
  updateLeave,
  revokeLeave,
};
