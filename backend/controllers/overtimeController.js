const Overtime = require('../models/Overtime');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { todayIST } = require('../utils/dateUtils');

const todayStr = todayIST;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// @desc  Employee requests overtime for a given day's attendance (defaults to today)
// @route POST /api/overtime/request
// @access Private (employee)
const requestOvertime = asyncHandler(async (req, res) => {
  const { requestedHours, reason } = req.body;
  const date = req.body.date || todayStr();

  if (!requestedHours || requestedHours <= 0) {
    throw new ApiError(400, 'requestedHours must be a positive number');
  }
  if (!reason || !reason.trim()) {
    throw new ApiError(400, 'A reason is required for the overtime request');
  }
  if (!DATE_RE.test(date)) {
    throw new ApiError(400, 'date must be in YYYY-MM-DD format');
  }
  if (date > todayStr()) {
    throw new ApiError(400, 'Cannot request overtime for a future date');
  }

  const attendance = await Attendance.findOne({ user: req.user._id, date });
  if (!attendance || !attendance.punchIn?.time) {
    throw new ApiError(400, 'You must punch in on that date before requesting overtime');
  }
  if (attendance.overtimeRequested) {
    throw new ApiError(409, 'Overtime has already been requested for that date');
  }

  const overtime = await Overtime.create({
    user: req.user._id,
    attendance: attendance._id,
    date,
    requestedHours,
    reason,
  });

  attendance.overtimeRequested = true;
  attendance.overtime = overtime._id;
  await attendance.save();

  res.status(201).json({ success: true, overtime });
});

// @desc  Employee edits their own overtime request while it is still Pending
// @route PATCH /api/overtime/:id
// @access Private (owner)
const updateOvertime = asyncHandler(async (req, res) => {
  const { requestedHours, reason, date } = req.body;

  const overtime = await Overtime.findById(req.params.id);
  if (!overtime) throw new ApiError(404, 'Overtime request not found');
  if (String(overtime.user) !== String(req.user._id)) {
    throw new ApiError(403, 'You can only edit your own overtime requests');
  }
  if (overtime.status !== 'Pending') {
    throw new ApiError(409, 'Only pending requests can be edited');
  }

  if (requestedHours !== undefined) {
    if (!requestedHours || requestedHours <= 0) {
      throw new ApiError(400, 'requestedHours must be a positive number');
    }
    overtime.requestedHours = requestedHours;
  }
  if (reason !== undefined) {
    if (!reason.trim()) {
      throw new ApiError(400, 'A reason is required for the overtime request');
    }
    overtime.reason = reason;
  }

  if (date !== undefined && date !== overtime.date) {
    if (!DATE_RE.test(date)) {
      throw new ApiError(400, 'date must be in YYYY-MM-DD format');
    }
    if (date > todayStr()) {
      throw new ApiError(400, 'Cannot request overtime for a future date');
    }

    const newAttendance = await Attendance.findOne({ user: req.user._id, date });
    if (!newAttendance || !newAttendance.punchIn?.time) {
      throw new ApiError(400, 'You must punch in on that date before requesting overtime');
    }
    if (newAttendance.overtimeRequested && String(newAttendance._id) !== String(overtime.attendance)) {
      throw new ApiError(409, 'Overtime has already been requested for that date');
    }

    const oldAttendance = await Attendance.findById(overtime.attendance);
    if (oldAttendance && String(oldAttendance._id) !== String(newAttendance._id)) {
      oldAttendance.overtimeRequested = false;
      oldAttendance.overtime = null;
      await oldAttendance.save();
    }

    newAttendance.overtimeRequested = true;
    newAttendance.overtime = overtime._id;
    await newAttendance.save();

    overtime.date = date;
    overtime.attendance = newAttendance._id;
  }

  await overtime.save();
  res.json({ success: true, overtime });
});

// @desc  Get my own overtime requests
// @route GET /api/overtime/me
// @access Private
const getMyOvertime = asyncHandler(async (req, res) => {
  const requests = await Overtime.find({ user: req.user._id }).sort({ createdAt: -1 });
  res.json({ success: true, count: requests.length, requests });
});

// @desc  Get pending overtime requests for manager's team (or all, for admin)
// @route GET /api/overtime/pending
// @access Private (manager, admin)
const getPendingOvertime = asyncHandler(async (req, res) => {
  let userFilter = {};
  if (req.user.role === 'manager') {
    const team = await User.find({ manager: req.user._id }).select('_id');
    userFilter = { user: { $in: team.map((u) => u._id) } };
  }

  const requests = await Overtime.find({ status: 'Pending', ...userFilter })
    .populate('user', 'name email role manager')
    .sort({ createdAt: -1 });

  res.json({ success: true, count: requests.length, requests });
});

// @desc  Get all overtime requests (any status) visible to this manager/admin
// @route GET /api/overtime/all
// @access Private (manager, admin)
const getAllOvertimeForReviewer = asyncHandler(async (req, res) => {
  let userFilter = {};
  if (req.user.role === 'manager') {
    const team = await User.find({ manager: req.user._id }).select('_id');
    userFilter = { user: { $in: team.map((u) => u._id) } };
  }

  const requests = await Overtime.find({ ...userFilter })
    .populate('user', 'name email role manager')
    .sort({ createdAt: -1 });

  res.json({ success: true, count: requests.length, requests });
});

// @desc  Approve or reject an overtime request
// @route PATCH /api/overtime/:id/review
// @access Private (manager, admin)
const reviewOvertime = asyncHandler(async (req, res) => {
  const { status, reviewRemarks } = req.body;
  if (!['Approved', 'Rejected'].includes(status)) {
    throw new ApiError(400, "Status must be 'Approved' or 'Rejected'");
  }

  const overtime = await Overtime.findById(req.params.id).populate('user', 'manager');
  if (!overtime) throw new ApiError(404, 'Overtime request not found');

  if (req.user.role === 'manager' && String(overtime.user.manager) !== String(req.user._id)) {
    throw new ApiError(403, 'You can only review overtime requests for your own team');
  }
  if (overtime.status !== 'Pending') {
    throw new ApiError(409, 'This request has already been reviewed');
  }

  overtime.status = status;
  overtime.reviewRemarks = reviewRemarks || '';
  overtime.reviewedBy = req.user._id;
  overtime.reviewedAt = new Date();
  await overtime.save();

  res.json({ success: true, overtime });
});

module.exports = {
  requestOvertime,
  updateOvertime,
  getMyOvertime,
  getPendingOvertime,
  getAllOvertimeForReviewer,
  reviewOvertime,
};
