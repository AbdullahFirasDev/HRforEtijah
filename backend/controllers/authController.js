const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const generateToken = require('../utils/generateToken');

// @desc  Register a new user
// @route POST /api/auth/register
// @access Public
const register = asyncHandler(async (req, res) => {
  const { name, email, password, role, managerId } = req.body;

  const existing = await User.findOne({ email: email?.toLowerCase() });
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const allowedSelfRoles = ['employee', 'manager', 'admin'];
  const finalRole = allowedSelfRoles.includes(role) ? role : 'employee';

  let manager = null;
  if (finalRole === 'employee') {
    if (!managerId) throw new ApiError(400, 'Please select a manager to continue');
    const managerDoc = await User.findOne({ _id: managerId, role: { $in: ['manager', 'admin'] } });
    if (!managerDoc) throw new ApiError(400, 'Selected manager does not exist');
    manager = managerDoc._id;
  }

  const user = await User.create({ name, email, password, role: finalRole, manager });

  const token = generateToken(user._id, user.role);
  res.status(201).json({ success: true, token, user: user.toSafeObject() });
});

// @desc  Login
// @route POST /api/auth/login
// @access Public
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email: email?.toLowerCase() }).select('+password');
  if (!user || !(await user.matchPassword(password))) {
    throw new ApiError(401, 'Invalid email or password');
  }
  if (!user.isActive) {
    throw new ApiError(403, 'This account has been deactivated');
  }

  const token = generateToken(user._id, user.role);
  res.json({ success: true, token, user: user.toSafeObject() });
});

// @desc  Get current logged-in user
// @route GET /api/auth/me
// @access Private
const getMe = asyncHandler(async (req, res) => {
  res.json({ success: true, user: req.user.toSafeObject() });
});

module.exports = { register, login, getMe };
