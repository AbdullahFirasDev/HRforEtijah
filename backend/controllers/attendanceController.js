const Attendance = require('../models/Attendance');
const Overtime = require('../models/Overtime');
const User = require('../models/User');
const logger = require('../config/logger');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { checkPunchLocation, loadGeofence } = require('../utils/geofence');
const { todayLocal, addDays, endOfLocalDay, clockText } = require('../utils/dateUtils');
const { MAX_SESSIONS_PER_DAY, dayPlan, planShifts, weekPlan, targetHours, allowedSessions } = require('../utils/schedule');
const TimeLeave = require('../models/TimeLeave');
const {
  autoCloseTime,
  closeOpenSession,
  loadLeaves,
  recalcDay,
  refreshDay,
  requestExtendedOvertime,
} = require('../utils/attendanceDay');
const { applyPeriods, editView } = require('../utils/attendanceEdit');
const { departureLeave } = require('../utils/timeLeave');

const todayStr = todayLocal;
const HOUR = 3600e3;

// @desc  Punch in for today (again for the next work period, or for staff
//        allowed several periods a day)
// @route POST /api/attendance/punch-in
// @access Private (employee)
const punchIn = asyncHandler(async (req, res) => {
  const { selfie, lat, lng, accuracy } = req.body;

  if (!selfie) throw new ApiError(400, 'يلزم التقاط صورة مباشرة لتسجيل الحضور');
  if (lat === undefined || lng === undefined) {
    throw new ApiError(400, 'يلزم تحديد موقعك لتسجيل الحضور');
  }
  const location = checkPunchLocation(await loadGeofence(), { lat, lng, accuracy }, 'لتسجيل الحضور');

  const date = todayStr();
  const now = new Date();
  const record = (await Attendance.findOne({ user: req.user._id, date })) || new Attendance({ user: req.user._id, date });
  record.adoptLegacySession();
  const leaves = await loadLeaves(record);
  // Coming back from an approved "step out" leave is always allowed
  const returning = leaves.find((l) => l.type === 'during' && l.departedAt && !l.returnedAt);

  const { sessions } = record;
  if (sessions.length) {
    if (!sessions[sessions.length - 1].punchOut?.time) {
      throw new ApiError(409, 'حضورك مسجّل حالياً. سجّل الانصراف أولاً.');
    }
    const allowed = allowedSessions(req.user, record.schedule);
    if (sessions.length >= allowed && !returning) {
      throw new ApiError(
        409,
        req.user.allowMultiplePunches
          ? `وصلت إلى الحد الأقصى لفترات الحضور في اليوم (${MAX_SESSIONS_PER_DAY} فترات)`
          : allowed > 1
            ? 'سجّلت حضورك في كل فترات دوام اليوم'
            : 'لقد سجّلت حضورك اليوم مسبقاً'
      );
    }
    // Back at work: the day has no last check-out yet
    record.punchOut = undefined;
  } else {
    record.schedule = dayPlan(req.user, date);
    record.punchIn = { time: now, location };
  }

  sessions.push({ punchIn: { time: now, selfie, location, leave: returning?._id } });
  if (returning) returning.returnedAt = now;
  recalcDay(record, leaves);
  record.autoCloseAt = autoCloseTime(record, now, leaves);
  await record.save();
  if (returning) await TimeLeave.updateOne({ _id: returning._id }, { $set: { returnedAt: now } });

  res.status(201).json({ success: true, attendance: record, returnedFrom: returning || null });
});

// @desc  Punch out of the open period for today
// @route POST /api/attendance/punch-out
// @access Private (employee)
const punchOut = asyncHandler(async (req, res) => {
  const { selfie, lat, lng, accuracy } = req.body;

  if (!selfie) throw new ApiError(400, 'يلزم التقاط صورة مباشرة لتسجيل الانصراف');
  if (lat === undefined || lng === undefined) {
    throw new ApiError(400, 'يلزم تحديد موقعك لتسجيل الانصراف');
  }
  const location = checkPunchLocation(await loadGeofence(), { lat, lng, accuracy }, 'لتسجيل الانصراف');

  const date = todayStr();
  const record = await Attendance.findOne({ user: req.user._id, date });
  record?.adoptLegacySession();
  const open = record?.sessions[record.sessions.length - 1];
  if (!open) {
    throw new ApiError(400, 'يجب تسجيل الحضور قبل تسجيل الانصراف');
  }
  if (open.punchOut?.auto) {
    const more = record.sessions.length < allowedSessions(req.user, record.schedule);
    throw new ApiError(
      409,
      `أُغلقت فترة حضورك تلقائياً الساعة ${clockText(open.punchOut.time)} لأنك لم تسجّل الانصراف قبل نهايتها ولم تمدد الوقت. ` +
        (more ? 'إن عدت إلى العمل فسجّل حضوراً جديداً.' : 'إن كنت ما زلت تعمل فأبلغ مديرك.')
    );
  }
  if (open.punchOut?.time) {
    throw new ApiError(
      409,
      req.user.allowMultiplePunches
        ? 'لقد سجّلت انصرافك. إن عدت إلى العمل فسجّل حضوراً جديداً أولاً.'
        : 'لقد سجّلت انصرافك اليوم مسبقاً'
    );
  }

  // Leaving for an approved time leave (chosen, or the one due right now)
  const now = new Date();
  const leaves = await loadLeaves(record);
  const leave = departureLeave(leaves, date, req.body.leaveId, now);
  if (leave) leave.departedAt = now;
  closeOpenSession(record, now, { selfie, location, leave: leave?._id }, leaves);
  const overtime = await requestExtendedOvertime(record);
  try {
    await record.save();
  } catch (err) {
    if (overtime) await overtime.deleteOne();
    throw err;
  }
  if (leave) await TimeLeave.updateOne({ _id: leave._id }, { $set: { departedAt: now } });

  res.json({ success: true, attendance: record, overtime, leave: leave || null });
});

// @desc  Keep working past the end of the open period: it then closes by
//        itself only at the extended time. The extra time becomes an
//        overtime request when the employee checks out.
// @route POST /api/attendance/extend
// @access Private (employee)
const extendSession = asyncHandler(async (req, res) => {
  const { hours, reason } = req.body;
  const date = todayStr();
  const record = await Attendance.findOne({ user: req.user._id, date });
  record?.adoptLegacySession();
  const open = record?.sessions[record.sessions.length - 1];
  if (!open || open.punchOut?.time) {
    throw new ApiError(400, 'لست مسجّل حضور حالياً، فلا يوجد وقت لتمديده. سجّل حضورك أولاً.');
  }

  const endOfDay = endOfLocalDay(date).getTime();
  const from = Math.max(Date.now(), record.autoCloseAt?.getTime() || 0);
  if (from >= endOfDay) {
    throw new ApiError(409, 'وقتك ممدد حتى نهاية اليوم، ولا يمكن تمديده أكثر من ذلك.');
  }
  const until = new Date(Math.min(from + hours * HOUR, endOfDay));
  open.extendedUntil = until;
  if (reason?.trim()) open.extendReason = reason.trim();
  record.autoCloseAt = until;
  await record.save();

  res.json({ success: true, attendance: record, extendedUntil: until });
});

// @desc  Get my own attendance history
// @route GET /api/attendance/me
// @access Private
const getMyAttendance = asyncHandler(async (req, res) => {
  const { from, to, page = 1, limit = 20 } = req.query;
  const query = { user: req.user._id };
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  const records = await Attendance.find(query)
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Attendance.countDocuments(query);

  res.json({ success: true, count: records.length, total, page: Number(page), records });
});

// @desc  Get today's status for the logged in employee (for punch UI)
// @route GET /api/attendance/today
// @access Private
const getTodayStatus = asyncHandler(async (req, res) => {
  const date = todayStr();
  const record = await Attendance.findOne({ user: req.user._id, date });
  // Once the day has started, its frozen plan is what lateness was measured against
  const plan = record?.schedule?.hours != null ? record.schedule : dayPlan(req.user, date);
  // Recent days the system had to close because nobody checked out
  const missed = await Attendance.find({ user: req.user._id, date: { $gte: addDays(date, -7) }, missedPunchOut: true })
    .select('date sessions.punchOut.time sessions.punchOut.auto')
    .sort({ date: -1 })
    .lean();
  // Today's time leaves, so the page can offer "leaving for my leave" / "back"
  const leaves = await TimeLeave.find({ user: req.user._id, date, status: { $ne: 'Cancelled' } })
    .sort({ from: 1 })
    .lean();

  res.json({
    success: true,
    attendance: record || null,
    today: {
      date,
      start: plan.start || null,
      end: plan.end || null,
      shifts: planShifts(plan),
      targetHours: targetHours(plan),
      dayOff: !!plan.dayOff,
      allowMultiplePunches: !!req.user.allowMultiplePunches,
      maxSessions: allowedSessions(req.user, plan),
      week: weekPlan(req.user),
      leaves,
      recentMissed: missed.map((r) => ({
        id: r._id,
        date: r.date,
        closedAt: r.sessions.filter((s) => s.punchOut?.auto).map((s) => s.punchOut.time),
      })),
    },
  });
});

// @desc  Get attendance for the manager's team
// @route GET /api/attendance/team
// @access Private (manager, admin)
const getTeamAttendance = asyncHandler(async (req, res) => {
  const { date, from, to, page = 1, limit = 20, userId } = req.query;

  const teamMembers = await User.find({ manager: req.user._id }).select('_id');
  const teamIds = teamMembers.map((u) => u._id);

  const query = { user: { $in: teamIds } };
  if (userId) query.user = userId;
  if (date) {
    query.date = date;
  } else if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  const records = await Attendance.find(query)
    .populate('user', 'name email role')
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Attendance.countDocuments(query);

  res.json({ success: true, count: records.length, total, page: Number(page), records });
});

// @desc  Get all attendance records system-wide
// @route GET /api/attendance/all
// @access Private (admin)
const getAllAttendance = asyncHandler(async (req, res) => {
  const { date, userId, from, to, page = 1, limit = 20 } = req.query;

  const query = {};
  if (userId) query.user = userId;
  if (date) query.date = date;
  if (from || to) {
    query.date = query.date || {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  const records = await Attendance.find(query)
    .populate('user', 'name email role manager')
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Attendance.countDocuments(query);

  res.json({ success: true, count: records.length, total, page: Number(page), records });
});

// @desc  Manager/Admin validates an attendance record (verify selfie authenticity)
// @route PATCH /api/attendance/:id/validate
// @access Private (manager, admin)
const validateAttendance = asyncHandler(async (req, res) => {
  const { status, remarks } = req.body;
  if (!['Valid', 'Invalid'].includes(status)) {
    throw new ApiError(400, 'نتيجة التحقق يجب أن تكون "صحيح" أو "غير صحيح"');
  }

  const record = await Attendance.findById(req.params.id).populate('user', 'name manager');
  if (!record) throw new ApiError(404, 'سجل الحضور غير موجود');

  // A manager may only validate their own team's records
  if (req.user.role === 'manager' && String(record.user.manager) !== String(req.user._id)) {
    throw new ApiError(403, 'يمكنك التحقق من حضور أعضاء فريقك فقط');
  }

  record.validation = {
    status,
    remarks: remarks || '',
    verifiedBy: req.user._id,
    verifiedAt: new Date(),
  };
  await record.save();

  res.json({ success: true, attendance: record });
});

// @desc  Admin permanently deletes attendance records, with their selfies and
//        any overtime request filed against them
// @route POST /api/attendance/delete
// @access Private (admin)
const deleteAttendance = asyncHandler(async (req, res) => {
  const records = await Attendance.find({ _id: { $in: req.body.ids } })
    .select('user date')
    .populate('user', 'email')
    .lean();
  if (!records.length) throw new ApiError(404, 'لم يُعثر على سجلات الحضور المحددة، ربما حُذفت مسبقاً');

  const ids = records.map((r) => r._id);
  const overtime = await Overtime.deleteMany({ attendance: { $in: ids } });
  const attendance = await Attendance.deleteMany({ _id: { $in: ids } });
  // Deletions can't be undone, so keep a trail of who removed what
  logger.info(
    `${req.user.email} deleted ${attendance.deletedCount} attendance record(s) and ${overtime.deletedCount} overtime request(s): ` +
      records.map((r) => `${r.user?.email || r.user}@${r.date}`).join(', ')
  );

  res.json({ success: true, deleted: { attendance: attendance.deletedCount, overtime: overtime.deletedCount } });
});

// @desc  One record's periods and correction history, for the admin's edit window
// @route GET /api/attendance/:id
// @access Private (admin)
const getAttendanceRecord = asyncHandler(async (req, res) => {
  const record = await Attendance.findById(req.params.id)
    .select('-sessions.punchIn.selfie -sessions.punchOut.selfie -punchIn.selfie -punchOut.selfie')
    .populate('user', 'name email')
    .populate('edits.by', 'name');
  if (!record) throw new ApiError(404, 'سجل الحضور غير موجود');
  record.adoptLegacySession();
  res.json({ success: true, attendance: editView(record) });
});

// @desc  Admin corrects a day's check-in/check-out times (e.g. a forgotten
//        check-out that the system closed at the end of the period)
// @route PATCH /api/attendance/:id/periods
// @access Private (admin)
const editAttendancePeriods = asyncHandler(async (req, res) => {
  const record = await Attendance.findById(req.params.id).populate('user', 'name email');
  if (!record) throw new ApiError(404, 'سجل الحضور غير موجود');
  record.adoptLegacySession();
  applyPeriods(record, req.body.periods, { by: req.user._id, reason: req.body.reason });
  await refreshDay(record); // approved time leaves of that day
  await record.save();
  logger.info(`${req.user.email} corrected the times of ${record.user?.email}@${record.date}: ${req.body.reason}`);
  res.json({ success: true, attendance: editView(record) });
});

// @desc  Admin records attendance for a day with no check-in at all
// @route POST /api/attendance/manual
// @access Private (admin)
const addManualAttendance = asyncHandler(async (req, res) => {
  const { userId, date, periods, reason } = req.body;
  const user = await User.findById(userId);
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');
  if (await Attendance.exists({ user: user._id, date })) {
    throw new ApiError(409, 'يوجد سجل حضور لهذا اليوم مسبقاً، فعدّل أوقاته بدلاً من إضافة سجل جديد');
  }
  const record = new Attendance({ user: user._id, date, schedule: dayPlan(user, date) });
  applyPeriods(record, periods, { by: req.user._id, reason });
  await refreshDay(record);
  await record.save();
  logger.info(`${req.user.email} added attendance for ${user.email}@${date}: ${reason}`);
  res.status(201).json({ success: true, attendance: editView(record) });
});

module.exports = {
  getAttendanceRecord,
  editAttendancePeriods,
  addManualAttendance,
  punchIn,
  punchOut,
  extendSession,
  getMyAttendance,
  getTodayStatus,
  getTeamAttendance,
  getAllAttendance,
  validateAttendance,
  deleteAttendance,
};
