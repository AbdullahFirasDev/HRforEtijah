const Overtime = require('../models/Overtime');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { todayLocal } = require('../utils/dateUtils');

const todayStr = todayLocal;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// @desc  Employee requests overtime for a given day's attendance (defaults to today)
// @route POST /api/overtime/request
// @access Private (employee)
const requestOvertime = asyncHandler(async (req, res) => {
  const { requestedHours, reason } = req.body;
  const date = req.body.date || todayStr();

  if (!requestedHours || requestedHours <= 0) {
    throw new ApiError(400, 'عدد الساعات يجب أن يكون رقماً أكبر من صفر');
  }
  if (!reason || !reason.trim()) {
    throw new ApiError(400, 'يجب كتابة سبب طلب العمل الإضافي');
  }
  if (!DATE_RE.test(date)) {
    throw new ApiError(400, 'صيغة التاريخ غير صحيحة');
  }
  if (date > todayStr()) {
    throw new ApiError(400, 'لا يمكن طلب عمل إضافي لتاريخ مستقبلي');
  }

  const attendance = await Attendance.findOne({ user: req.user._id, date });
  if (!attendance || !attendance.punchIn?.time) {
    throw new ApiError(400, 'لا يوجد تسجيل حضور لك في هذا التاريخ، ويجب تسجيل الحضور قبل طلب العمل الإضافي');
  }
  if (attendance.overtimeRequested) {
    throw new ApiError(409, 'يوجد طلب عمل إضافي لهذا التاريخ مسبقاً');
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
  if (!overtime) throw new ApiError(404, 'طلب العمل الإضافي غير موجود');
  if (String(overtime.user) !== String(req.user._id)) {
    throw new ApiError(403, 'يمكنك تعديل طلباتك فقط');
  }
  if (overtime.status !== 'Pending') {
    throw new ApiError(409, 'يمكن تعديل الطلبات التي ما زالت قيد الانتظار فقط');
  }

  if (requestedHours !== undefined) {
    if (!requestedHours || requestedHours <= 0) {
      throw new ApiError(400, 'عدد الساعات يجب أن يكون رقماً أكبر من صفر');
    }
    overtime.requestedHours = requestedHours;
  }
  if (reason !== undefined) {
    if (!reason.trim()) {
      throw new ApiError(400, 'يجب كتابة سبب طلب العمل الإضافي');
    }
    overtime.reason = reason;
  }

  if (date !== undefined && date !== overtime.date) {
    if (!DATE_RE.test(date)) {
      throw new ApiError(400, 'صيغة التاريخ غير صحيحة');
    }
    if (date > todayStr()) {
      throw new ApiError(400, 'لا يمكن طلب عمل إضافي لتاريخ مستقبلي');
    }

    const newAttendance = await Attendance.findOne({ user: req.user._id, date });
    if (!newAttendance || !newAttendance.punchIn?.time) {
      throw new ApiError(400, 'لا يوجد تسجيل حضور لك في هذا التاريخ، ويجب تسجيل الحضور قبل طلب العمل الإضافي');
    }
    if (newAttendance.overtimeRequested && String(newAttendance._id) !== String(overtime.attendance)) {
      throw new ApiError(409, 'يوجد طلب عمل إضافي لهذا التاريخ مسبقاً');
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
    throw new ApiError(400, 'الحالة يجب أن تكون "مقبول" أو "مرفوض"');
  }

  const overtime = await Overtime.findById(req.params.id).populate('user', 'manager');
  if (!overtime) throw new ApiError(404, 'طلب العمل الإضافي غير موجود');

  if (req.user.role === 'manager' && String(overtime.user.manager) !== String(req.user._id)) {
    throw new ApiError(403, 'يمكنك مراجعة طلبات أعضاء فريقك فقط');
  }
  if (overtime.status !== 'Pending') {
    throw new ApiError(409, 'تمت مراجعة هذا الطلب مسبقاً');
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
