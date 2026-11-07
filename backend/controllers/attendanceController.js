const Attendance = require('../models/Attendance');
const Overtime = require('../models/Overtime');
const User = require('../models/User');
const logger = require('../config/logger');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { checkPunchLocation, loadGeofence } = require('../utils/geofence');
const { todayLocal, addDays, clockText } = require('../utils/dateUtils');
const { MAX_SESSIONS_PER_DAY, dayPlan, planShifts, weekPlan, targetHours, allowedSessions } = require('../utils/schedule');
const TimeLeave = require('../models/TimeLeave');
const {
  AUTO_CLOSE_GRACE_MINUTES,
  EXTENSION_LIMIT_HOURS,
  autoCloseTime,
  closeOpenSession,
  currentRecord,
  extendOpenSession,
  loadLeaves,
  recalcDay,
  refreshDay,
  requestExtendedOvertime,
} = require('../utils/attendanceDay');
const { applyPeriods, editView } = require('../utils/attendanceEdit');
const { departureLeave } = require('../utils/timeLeave');
const { encryptPrint, isFaceTaken, verifyFace } = require('../utils/faceData');
const notifyEvents = require('../utils/notifyEvents');

const todayStr = todayLocal;
// A year of days is the most one screen asks for
const MAX_DAYS = 366;

// One page of records: `limit` records, or with `days` the latest whole days,
// so a screen grouped by day never shows part of one
const pageOfRecords = async (query, { page = 1, limit = 20, days }, userFields) => {
  const wanted = Math.min(Number(days) || 0, MAX_DAYS);
  if (wanted) {
    const dates = (await Attendance.distinct('date', query)).sort().reverse();
    const records = await Attendance.find({ ...query, date: { $in: dates.slice(0, wanted) } })
      .populate(userFields ? { path: 'user', select: userFields } : [])
      .sort({ date: -1, 'punchIn.time': 1 });
    return { success: true, count: records.length, hasMore: dates.length > wanted, records };
  }
  const records = await Attendance.find(query)
    .populate(userFields ? { path: 'user', select: userFields } : [])
    .sort({ date: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await Attendance.countDocuments(query);
  return { success: true, count: records.length, total, page: Number(page), records };
};

// @desc  Punch in for today (again for the next work period, or for staff
//        allowed several periods a day)
// @route POST /api/attendance/punch-in
// @access Private (employee)
const punchIn = asyncHandler(async (req, res) => {
  const { face, lat, lng, accuracy } = req.body;

  if (lat === undefined || lng === undefined) {
    throw new ApiError(400, 'يلزم تحديد موقعك لتسجيل الحضور');
  }
  const location = checkPunchLocation(await loadGeofence(), { lat, lng, accuracy }, 'لتسجيل الحضور');
  const faceDistance = await verifyFace(req.user._id, face);

  const date = todayStr();
  const now = new Date();
  const current = await currentRecord(req.user._id);
  if (current && current.date !== date) {
    throw new ApiError(409, 'حضورك مسجّل حالياً. سجّل الانصراف أولاً.');
  }
  const record = current || new Attendance({ user: req.user._id, date });
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

  sessions.push({ punchIn: { time: now, faceDistance, location, leave: returning?._id } });
  if (returning) returning.returnedAt = now;
  const lateBefore = record.lateMinutes || 0;
  recalcDay(record, leaves);
  record.autoCloseAt = autoCloseTime(record, now, leaves);
  await record.save();
  if (returning) await TimeLeave.updateOne({ _id: returning._id }, { $set: { returnedAt: now } });
  // Lateness this check-in added (by the existing rules): the manager hears of it
  const lateBy = (record.lateMinutes || 0) - lateBefore;
  if (lateBy > 0) await notifyEvents.lateArrival(record, req.user, lateBy, now, { returning: !!returning });

  res.status(201).json({ success: true, attendance: record, returnedFrom: returning || null });
});

// @desc  Punch out of the open period for today
// @route POST /api/attendance/punch-out
// @access Private (employee)
const punchOut = asyncHandler(async (req, res) => {
  const { face, lat, lng, accuracy } = req.body;

  if (lat === undefined || lng === undefined) {
    throw new ApiError(400, 'يلزم تحديد موقعك لتسجيل الانصراف');
  }
  const location = checkPunchLocation(await loadGeofence(), { lat, lng, accuracy }, 'لتسجيل الانصراف');
  const faceDistance = await verifyFace(req.user._id, face);

  const record = await currentRecord(req.user._id);
  record?.adoptLegacySession();
  const open = record?.sessions[record.sessions.length - 1];
  if (!open) {
    throw new ApiError(400, 'يجب تسجيل الحضور قبل تسجيل الانصراف');
  }
  if (open.punchOut?.auto) {
    const more = record.sessions.length < allowedSessions(req.user, record.schedule);
    throw new ApiError(
      409,
      `أُغلقت فترة حضورك تلقائياً الساعة ${clockText(open.punchOut.time)} ` +
        (open.extendedAt ? 'لأنك لم تسجّل الانصراف بعد تمديد الوقت. ' : 'لأنك لم تسجّل الانصراف قبل نهايتها ولم تمدد الوقت. ') +
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
  const leave = departureLeave(leaves, record.date, req.body.leaveId, now);
  if (leave) leave.departedAt = now;
  closeOpenSession(record, now, { faceDistance, location, leave: leave?._id }, leaves);
  const overtime = await requestExtendedOvertime(record);
  try {
    await record.save();
  } catch (err) {
    if (overtime) await overtime.deleteOne();
    throw err;
  }
  if (leave) await TimeLeave.updateOne({ _id: leave._id }, { $set: { departedAt: now } });
  if (overtime) await notifyEvents.overtimeRequested(overtime, req.user, { auto: true });

  res.json({ success: true, attendance: record, overtime, leave: leave || null });
});

// @desc  Keep working past the end of the open period: time then counts until
//        the employee checks out, and the extra time becomes an overtime
//        request. Pressing it twice changes nothing.
// @route POST /api/attendance/extend
// @access Private (employee)
const extendSession = asyncHandler(async (req, res) => {
  const record = await currentRecord(req.user._id);
  record?.adoptLegacySession();
  const open = record?.sessions[record.sessions.length - 1];
  if (!open || open.punchOut?.time) {
    throw new ApiError(400, 'لست مسجّل حضور حالياً، فلا يوجد وقت لتمديده. سجّل حضورك أولاً.');
  }

  extendOpenSession(record, open);
  await record.save();

  res.json({ success: true, attendance: record });
});

// @desc  Get my own attendance history
// @route GET /api/attendance/me
// @access Private
const getMyAttendance = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const query = { user: req.user._id };
  if (from || to) {
    query.date = {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  res.json(await pageOfRecords(query, req.query));
});

// @desc  Get today's status for the logged in employee (for punch UI)
// @route GET /api/attendance/today
// @access Private
const getTodayStatus = asyncHandler(async (req, res) => {
  const date = todayStr();
  const record = await currentRecord(req.user._id);
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
      faceEnrolled: !!req.user.faceEnrolledAt,
      maxSessions: allowedSessions(req.user, plan),
      closeGraceMinutes: AUTO_CLOSE_GRACE_MINUTES,
      extensionLimitHours: EXTENSION_LIMIT_HOURS,
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
  const { date, from, to, userId } = req.query;

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

  res.json(await pageOfRecords(query, req.query, 'name email role'));
});

// @desc  Get all attendance records system-wide
// @route GET /api/attendance/all
// @access Private (admin)
const getAllAttendance = asyncHandler(async (req, res) => {
  const { date, userId, from, to } = req.query;

  const query = {};
  if (userId) query.user = userId;
  if (date) query.date = date;
  if (from || to) {
    query.date = query.date || {};
    if (from) query.date.$gte = from;
    if (to) query.date.$lte = to;
  }

  res.json(await pageOfRecords(query, req.query, 'name email role manager'));
});

// @desc  Admin permanently deletes attendance records, with any overtime
//        request filed against them
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
  await notifyEvents.attendanceEdited(record, req.user, { reason: req.body.reason });
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
  await notifyEvents.attendanceEdited(record, req.user, { manual: true, reason });
  res.status(201).json({ success: true, attendance: editView(record) });
});

// @desc  The employee registers their face print (once; an admin can reset it)
// @route POST /api/attendance/face
// @access Private
const enrollFace = asyncHandler(async (req, res) => {
  const { face } = req.body;
  if (req.user.faceEnrolledAt) {
    throw new ApiError(409, 'بصمة وجهك مسجّلة مسبقاً. لتغييرها اطلب من مسؤول النظام إعادة تعيينها.');
  }
  if (await isFaceTaken(req.user._id, face)) {
    throw new ApiError(409, 'هذا الوجه مسجّل لحساب آخر. راجع مسؤول النظام.');
  }
  const claimed = await User.updateOne(
    { _id: req.user._id, faceEnrolledAt: null },
    { $set: { faceDescriptor: encryptPrint(face), faceEnrolledAt: new Date() } }
  );
  if (!claimed.modifiedCount) throw new ApiError(409, 'بصمة وجهك مسجّلة مسبقاً.');
  logger.info(`${req.user.email} registered a face print`);
  res.status(201).json({ success: true });
});

module.exports = {
  enrollFace,
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
  deleteAttendance,
};
