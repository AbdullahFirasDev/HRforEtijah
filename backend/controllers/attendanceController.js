const Attendance = require('../models/Attendance');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { calculateHours, deriveStatus } = require('../utils/hours');
const { checkPunchLocation, loadGeofence } = require('../utils/geofence');
const { todayLocal } = require('../utils/dateUtils');
const { MAX_SESSIONS_PER_DAY, dayPlan, targetHours, lateMinutesAt, earlyLeaveMinutesAt } = require('../utils/schedule');

const todayStr = todayLocal;

// @desc  Punch in for today (again, for staff allowed several periods a day)
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

  const { sessions } = record;
  if (sessions.length) {
    if (!sessions[sessions.length - 1].punchOut?.time) {
      throw new ApiError(409, 'حضورك مسجّل حالياً. سجّل الانصراف أولاً.');
    }
    if (!req.user.allowMultiplePunches) {
      throw new ApiError(409, 'لقد سجّلت حضورك اليوم مسبقاً');
    }
    if (sessions.length >= MAX_SESSIONS_PER_DAY) {
      throw new ApiError(409, `وصلت إلى الحد الأقصى لفترات الحضور في اليوم (${MAX_SESSIONS_PER_DAY} فترات)`);
    }
    // Back at work: the day has no last check-out yet
    record.punchOut = undefined;
    record.earlyLeaveMinutes = 0;
  } else {
    record.schedule = dayPlan(req.user, date);
    record.punchIn = { time: now, location };
    record.lateMinutes = lateMinutesAt(record.schedule, now);
  }

  sessions.push({ punchIn: { time: now, selfie, location } });
  await record.save();

  res.status(201).json({ success: true, attendance: record });
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
  if (open.punchOut?.time) {
    throw new ApiError(
      409,
      req.user.allowMultiplePunches
        ? 'لقد سجّلت انصرافك. إن عدت إلى العمل فسجّل حضوراً جديداً أولاً.'
        : 'لقد سجّلت انصرافك اليوم مسبقاً'
    );
  }

  const now = new Date();
  open.punchOut = { time: now, selfie, location };
  record.punchOut = { time: now, location };
  record.totalHours =
    Math.round(record.sessions.reduce((sum, s) => sum + calculateHours(s.punchIn.time, s.punchOut.time), 0) * 100) / 100;
  record.status = deriveStatus(record.totalHours, targetHours(record.schedule));
  record.earlyLeaveMinutes = earlyLeaveMinutesAt(record.schedule, now);
  await record.save();

  res.json({ success: true, attendance: record });
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

  res.json({
    success: true,
    attendance: record || null,
    today: {
      date,
      start: plan.start || null,
      end: plan.end || null,
      targetHours: targetHours(plan),
      dayOff: !!plan.dayOff,
      allowMultiplePunches: !!req.user.allowMultiplePunches,
      maxSessions: MAX_SESSIONS_PER_DAY,
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

module.exports = {
  punchIn,
  punchOut,
  getMyAttendance,
  getTodayStatus,
  getTeamAttendance,
  getAllAttendance,
  validateAttendance,
};
