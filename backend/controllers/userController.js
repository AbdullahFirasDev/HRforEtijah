const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');

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

// @desc  Admin updates a user's role, manager assignment, or active state
// @route PATCH /api/users/:id
// @access Private (admin)
const updateUser = asyncHandler(async (req, res) => {
  const { role, managerId, isActive } = req.body;
  const user = await User.findById(req.params.id);
  if (!user) throw new ApiError(404, 'User not found');

  if (role) user.role = role;
  if (managerId !== undefined) user.manager = managerId || null;
  if (isActive !== undefined) user.isActive = isActive;

  await user.save();
  res.json({ success: true, user: user.toSafeObject() });
});

module.exports = { getAllUsers, getManagersList, getMyTeam, updateUser };
