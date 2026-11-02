const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const generateToken = require('../utils/generateToken');
const { createUserAccount } = require('../utils/userAccount');
const { claimDevice } = require('../utils/device');

// @desc  Register a new user (signing up also registers this device)
// @route POST /api/auth/register
// @access Public
const register = asyncHandler(async (req, res) => {
  const created = await createUserAccount(req.body);
  const user = await claimDevice(created._id, req.body.deviceId, req.get('user-agent'));

  const token = generateToken(user._id, user.role);
  res.status(201).json({ success: true, token, user: user.toSafeObject() });
});

// @desc  Login (the first successful login registers the device; after that
//        only that device can log in)
// @route POST /api/auth/login
// @access Public
const login = asyncHandler(async (req, res) => {
  const { email, password, deviceId } = req.body;

  const found = await User.findOne({ email: email?.toLowerCase() }).select('+password');
  if (!found || !(await found.matchPassword(password))) {
    throw new ApiError(401, 'البريد الإلكتروني أو كلمة المرور غير صحيحة');
  }
  if (!found.isActive) {
    throw new ApiError(403, 'هذا الحساب معطّل. تواصل مع مسؤول النظام');
  }
  // Only after the password is right, so the device rule reveals nothing to guessers.
  const user = await claimDevice(found._id, deviceId, req.get('user-agent'));

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
