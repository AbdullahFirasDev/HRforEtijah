const TimeLeave = require('../models/TimeLeave');
const Attendance = require('../models/Attendance');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { todayLocal, zonedInstant } = require('../utils/dateUtils');
const { checkRequest } = require('../utils/timeLeave');
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
  const leaves = await TimeLeave.find({ user: req.user._id }).sort({ date: -1, from: -1 }).limit(200).populate('reviewedBy', 'name');
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

// @desc  Time leaves of the people the reviewer oversees
// @route GET /api/time-leaves/review?status=Pending
// @access Private (manager: their team, admin: everyone)
const getLeavesForReview = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role === 'manager') {
    const team = await User.find({ manager: req.user._id }).select('_id');
    filter.user = { $in: team.map((u) => u._id) };
  }
  if (req.query.status) filter.status = req.query.status;
  const leaves = await TimeLeave.find(filter)
    .populate('user', 'name email manager')
    .populate('reviewedBy', 'name')
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
  if (req.user.role === 'manager' && String(leave.user.manager) !== String(req.user._id)) {
    throw new ApiError(403, 'يمكنك مراجعة زمنيات أعضاء فريقك فقط');
  }
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

module.exports = { requestLeave, getMyLeaves, cancelLeave, getLeavesForReview, reviewLeave };
