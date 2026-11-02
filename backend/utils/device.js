const crypto = require('crypto');
const { body } = require('express-validator');
const User = require('../models/User');
const ApiError = require('./ApiError');

// Each account is tied to the first device it signs in from. The browser
// keeps a random device ID (sent at sign-in and on every request); only its
// SHA-256 is stored, so the database never holds the ID itself.

const OTHER_DEVICE_MESSAGE =
  'هذا الحساب مسجّل على جهاز آخر، ولا يمكن الدخول إليه إلا من ذلك الجهاز. تواصل مع مسؤول النظام لتغيير الجهاز المسجّل.';

const hashDeviceId = (deviceId) => crypto.createHash('sha256').update(String(deviceId || '')).digest('hex');

// True when the account has no registered device yet, or deviceId is that device.
const isRegisteredDevice = (deviceIdHash, deviceId) => {
  if (!deviceIdHash) return true;
  const given = Buffer.from(hashDeviceId(deviceId));
  const stored = Buffer.from(deviceIdHash);
  return given.length === stored.length && crypto.timingSafeEqual(given, stored);
};

// The message applies to every check in the chain (withMessage would only
// cover the last one). A missing ID usually means an old cached app version.
const deviceIdRule = body('deviceId', 'تعذر التعرف على هذا الجهاز. حدّث الصفحة ثم حاول مرة أخرى.')
  .isString()
  .isLength({ min: 16, max: 200 });

// Short label for the admin's users table, e.g. "Android · Chrome".
const describeDevice = (ua = '') => {
  const os = /iphone/i.test(ua)
    ? 'iPhone'
    : /ipad/i.test(ua)
      ? 'iPad'
      : /android/i.test(ua)
        ? 'Android'
        : /windows/i.test(ua)
          ? 'Windows'
          : /mac os x/i.test(ua)
            ? 'Mac'
            : /linux/i.test(ua)
              ? 'Linux'
              : 'جهاز غير معروف';
  const browser = /edg/i.test(ua)
    ? 'Edge'
    : /crios|chrome/i.test(ua)
      ? 'Chrome'
      : /fxios|firefox/i.test(ua)
        ? 'Firefox'
        : /safari/i.test(ua)
          ? 'Safari'
          : '';
  return browser ? `${os} · ${browser}` : os;
};

// Registers this device on the account's first sign-in (atomically, so two
// devices racing for a new account can't both win); afterwards only that
// device is accepted. Returns the up-to-date user.
const claimDevice = async (userId, deviceId, userAgent) => {
  const bound = await User.findOneAndUpdate(
    { _id: userId, deviceIdHash: null },
    {
      $set: {
        deviceIdHash: hashDeviceId(deviceId),
        deviceLabel: describeDevice(userAgent),
        deviceRegisteredAt: new Date(),
      },
    },
    { new: true }
  );
  if (bound) return bound;

  const user = await User.findById(userId).select('+deviceIdHash');
  if (!isRegisteredDevice(user.deviceIdHash, deviceId)) throw new ApiError(403, OTHER_DEVICE_MESSAGE);
  return user;
};

module.exports = { OTHER_DEVICE_MESSAGE, deviceIdRule, isRegisteredDevice, claimDevice };
