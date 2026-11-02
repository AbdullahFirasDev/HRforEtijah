const Attendance = require('../models/Attendance');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { calculateHours, deriveStatus, isWithinGeofence } = require('../utils/hours');
const { todayIST } = require('../utils/dateUtils');

const todayStr = todayIST;

// @desc  Punch in for today
// @route POST /api/attendance/punch-in
// @access Private (employee)
const punchIn = asyncHandler(async (req, res) => {
  const { selfie, lat, lng } = req.body;

  if (!selfie) throw new ApiError(400, 'A live selfie is required to punch in');
  if (lat === undefined || lng === undefined) {
    throw new ApiError(400, 'Location (lat, lng) is required to punch in');
  }
  if (!isWithinGeofence(lat, lng)) {
    throw new ApiError(400, 'You are outside the allowed attendance location radius');
  }

  const date = todayStr();
  const existing = await Attendance.findOne({ user: req.user._id, date });
  if (existing && existing.punchIn?.time) {
    throw new ApiError(409, 'You have already punched in today');
  }

  const record =
    existing ||
    new Attendance({
      user: req.user._id,
      date,
    });

  record.punchIn = { time: new Date(), selfie, location: { lat, lng } };
  await record.save();

  res.status(201).json({ success: true, attendance: record });
});

// @desc  Punch out for today
// @route POST /api/attendance/punch-out
// @access Private (employee)
const punchOut = asyncHandler(async (req, res) => {
  const { selfie, lat, lng } = req.body;

  if (!selfie) throw new ApiError(400, 'A live selfie is required to punch out');
  if (lat === undefined || lng === undefined) {
    throw new ApiError(400, 'Location (lat, lng) is required to punch out');
  }

  const date = todayStr();
  const record = await Attendance.findOne({ user: req.user._id, date });
  if (!record || !record.punchIn?.time) {
    throw new ApiError(400, 'You must punch in before punching out');
  }
  if (record.punchOut?.time) {
    throw new ApiError(409, 'You have already punched out today');
  }

  const now = new Date();
  record.punchOut = { time: now, selfie, location: { lat, lng } };
  record.totalHours = calculateHours(record.punchIn.time, now);
  record.status = deriveStatus(record.totalHours);
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
  const record = await Attendance.findOne({ user: req.user._id, date: todayStr() });
  res.json({ success: true, attendance: record || null });
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
    throw new ApiError(400, "Validation status must be 'Valid' or 'Invalid'");
  }

  const record = await Attendance.findById(req.params.id).populate('user', 'name manager');
  if (!record) throw new ApiError(404, 'Attendance record not found');

  // A manager may only validate their own team's records
  if (req.user.role === 'manager' && String(record.user.manager) !== String(req.user._id)) {
    throw new ApiError(403, 'You can only validate attendance for your own team');
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
