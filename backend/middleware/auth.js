const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const User = require('../models/User');
const { SESSION_TIMEOUT_MINUTES } = require('../config/session');
const { OTHER_DEVICE_MESSAGE, isRegisteredDevice } = require('../utils/device');

// Verifies the JWT sent in the Authorization header and attaches the
// authenticated user (without password) to req.user.
const protect = asyncHandler(async (req, res, next) => {
  let token;
  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  if (!token) {
    throw new ApiError(401, 'يجب تسجيل الدخول أولاً');
  }

  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new ApiError(401, 'انتهت الجلسة، يرجى تسجيل الدخول من جديد');
  }

  // Also covers tokens issued before the timeout was shortened.
  if (Date.now() / 1000 - decoded.iat > SESSION_TIMEOUT_MINUTES * 60) {
    throw new ApiError(401, 'انتهت الجلسة، يرجى تسجيل الدخول من جديد');
  }

  const user = await User.findById(decoded.id).select('+deviceIdHash');
  if (!user || !user.isActive) {
    throw new ApiError(401, 'الحساب غير موجود أو معطّل');
  }

  // A password change ends every session opened before it.
  if (user.passwordChangedAt && decoded.iat < Math.floor(user.passwordChangedAt.getTime() / 1000)) {
    throw new ApiError(401, 'تم تغيير كلمة مرور هذا الحساب. سجّل الدخول بكلمة المرور الجديدة.');
  }

  // The session only works from the account's registered device, so a token
  // copied to another phone is useless.
  if (!isRegisteredDevice(user.deviceIdHash, req.get('x-device-id'))) {
    throw new ApiError(401, OTHER_DEVICE_MESSAGE);
  }

  req.user = user;
  next();
});

// Role-based access control guard. Usage: authorize('admin', 'manager')
const authorize = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) {
    throw new ApiError(403, 'ليست لديك صلاحية لتنفيذ هذا الإجراء');
  }
  next();
};

module.exports = { protect, authorize };
