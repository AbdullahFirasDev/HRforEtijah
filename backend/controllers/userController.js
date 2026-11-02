const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Overtime = require('../models/Overtime');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { createUserAccount } = require('../utils/userAccount');
const { workSettingsFrom } = require('../utils/schedule');

// @desc  Get all users (admin) with optional role filter
// @route GET /api/users
// @access Private (admin)
const getAllUsers = asyncHandler(async (req, res) => {
  const { role, page = 1, limit = 50 } = req.query;
  const query = {};
  if (role) query.role = role;

  const users = await User.find(query)
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(Number(limit));
  const total = await User.countDocuments(query);

  res.json({ success: true, count: users.length, total, users: users.map((u) => u.toSafeObject()) });
});

// @desc  Admin adds a new user (employee, manager or admin) without signing in as them
// @route POST /api/users
// @access Private (admin)
const createUser = asyncHandler(async (req, res) => {
  const user = await createUserAccount(req.body, workSettingsFrom(req.body));
  res.status(201).json({ success: true, user: user.toSafeObject() });
});

// @desc  Get list of managers/admins (used by signup form to assign a manager)
// @route GET /api/users/managers
// @access Public
const getManagersList = asyncHandler(async (req, res) => {
  const managers = await User.find({ role: { $in: ['manager', 'admin'] } }).select('name email role');
  res.json({ success: true, managers });
});

// @desc  Get the logged-in manager's team members
// @route GET /api/users/team
// @access Private (manager, admin)
const getMyTeam = asyncHandler(async (req, res) => {
  const team = await User.find({ manager: req.user._id });
  res.json({ success: true, count: team.length, team: team.map((u) => u.toSafeObject()) });
});

// @desc  Admin updates a user's role, manager assignment, active state,
//        working hours, days off, or the multiple check-in exception
// @route PATCH /api/users/:id
// @access Private (admin)
const updateUser = asyncHandler(async (req, res) => {
  const { role, managerId, isActive } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');

  // An admin locking themselves out could leave the system with no admin at all.
  if (user._id.equals(req.user._id) && (isActive === false || (role && role !== 'admin'))) {
    throw new ApiError(400, 'لا يمكنك تعطيل حسابك أو إزالة صلاحية المسؤول عن نفسك. اطلب ذلك من مسؤول آخر.');
  }

  if (role) user.role = role;
  if (managerId !== undefined) user.manager = managerId || null;
  if (isActive !== undefined) user.isActive = isActive;
  user.set(workSettingsFrom(req.body));

  await user.save();
  res.json({ success: true, user: user.toSafeObject() });
});

// @desc  Admin frees a user's registered device (new phone, cleared browser);
//        their next sign-in registers the device they use then
// @route PATCH /api/users/:id/reset-device
// @access Private (admin)
const resetDevice = asyncHandler(async (req, res) => {
  const user = await User.findByIdAndUpdate(
    req.params.id,
    { $set: { deviceIdHash: null, deviceLabel: null, deviceRegisteredAt: null } },
    { new: true }
  );
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');
  res.json({ success: true, user: user.toSafeObject() });
});

// @desc  Admin sets a new password for a user. Sessions opened with the old
//        password stop working right away (see protect).
// @route PATCH /api/users/:id/password
// @access Private (admin)
const changePassword = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');

  user.password = req.body.password;
  user.passwordChangedAt = new Date();
  await user.save();
  res.json({ success: true, user: user.toSafeObject() });
});

// @desc  Admin deletes an account together with its attendance and overtime
//        records. Employees reporting to it move to `transferTo` (required
//        when there are any). Use deactivation instead to keep the records.
// @route DELETE /api/users/:id?transferTo=<managerId>
// @access Private (admin)
const deleteUser = asyncHandler(async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'المستخدم غير موجود');
  if (user._id.equals(req.user._id)) {
    throw new ApiError(400, 'لا يمكنك حذف حسابك بنفسك. اطلب ذلك من مسؤول آخر.');
  }

  const teamSize = await User.countDocuments({ manager: user._id });
  let transferTo = null;
  if (teamSize > 0) {
    const { transferTo: transferId } = req.query;
    transferTo =
      transferId && !user._id.equals(transferId)
        ? await User.findOne({ _id: transferId, role: { $in: ['manager', 'admin'] } })
        : null;
    if (!transferTo) {
      throw new ApiError(409, `يتبع لهذا المستخدم ${teamSize} من الموظفين. اختر مديراً يُنقلون إليه قبل حذف الحساب.`);
    }
    await User.updateMany({ manager: user._id }, { $set: { manager: transferTo._id } });
  }

  const overtime = await Overtime.deleteMany({ user: user._id });
  const attendance = await Attendance.deleteMany({ user: user._id });
  // Records this user reviewed stay, without pointing at a deleted account
  await Overtime.updateMany({ reviewedBy: user._id }, { $set: { reviewedBy: null } });
  await Attendance.updateMany({ 'validation.verifiedBy': user._id }, { $set: { 'validation.verifiedBy': null } });
  await user.deleteOne();

  res.json({
    success: true,
    deleted: { attendance: attendance.deletedCount, overtime: overtime.deletedCount },
    transferred: teamSize,
  });
});

module.exports = {
  getAllUsers,
  createUser,
  getManagersList,
  getMyTeam,
  updateUser,
  resetDevice,
  changePassword,
  deleteUser,
};
