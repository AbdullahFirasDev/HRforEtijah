const crypto = require('crypto');
const { body } = require('express-validator');
const User = require('../models/User');
const ApiError = require('./ApiError');

// Face prints: the 128 numbers a recognition model produces for a face. They
// are computed in the employee's browser, so no photo ever reaches the server.
// A print is biometric data: it is stored encrypted, never sent back to a
// browser, and only ever compared here on the server.

const PRINT_LENGTH = 128;
// Prints of the same person are closer than this (the library's default is 0.6)
const MATCH_DISTANCE = 0.5;
// Registering a face this close to another account's is refused
const DUPLICATE_DISTANCE = 0.45;

const encryptionKey = () =>
  crypto
    .createHash('sha256')
    .update(`face-print:${process.env.FACE_DATA_KEY || process.env.JWT_SECRET}`)
    .digest();

const encryptPrint = (print) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const data = Buffer.concat([cipher.update(Buffer.from(Float32Array.from(print).buffer)), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64')).join('.');
};

const decryptPrint = (stored) => {
  const [iv, tag, data] = stored.split('.').map((part) => Buffer.from(part, 'base64'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), iv);
  decipher.setAuthTag(tag);
  const bytes = Buffer.concat([decipher.update(data), decipher.final()]);
  return Array.from(new Float32Array(bytes.buffer, bytes.byteOffset, PRINT_LENGTH));
};

const printDistance = (a, b) => Math.sqrt(a.reduce((sum, value, i) => sum + (value - b[i]) ** 2, 0));

const isPrint = (value) =>
  Array.isArray(value) && value.length === PRINT_LENGTH && value.every((n) => typeof n === 'number' && Number.isFinite(n));

const faceRule = body('face', 'يلزم التحقق من وجهك. إن استمرت هذه الرسالة فحدّث التطبيق.').custom((value) => {
  if (!isPrint(value)) throw new Error();
  return true;
});

// Compares a punch's print with the employee's; returns the distance to keep
// on the punch, which says how close the match was without being biometric
const verifyFace = async (userId, print) => {
  const user = await User.findById(userId).select('+faceDescriptor');
  if (!user.faceDescriptor) throw new ApiError(409, 'سجّل بصمة وجهك أولاً من صفحة تسجيل الحضور.');
  const distance = printDistance(print, decryptPrint(user.faceDescriptor));
  if (distance >= MATCH_DISTANCE) {
    throw new ApiError(403, 'لم يتطابق الوجه مع بصمة هذا الحساب. أعد المحاولة في إضاءة جيدة، وإن استمرت المشكلة فراجع مسؤول النظام.');
  }
  return Math.round(distance * 1000) / 1000;
};

// One face, one account: stops someone registering for a colleague too
const isFaceTaken = async (userId, print) => {
  const others = await User.find({ _id: { $ne: userId }, faceDescriptor: { $ne: null } }).select('+faceDescriptor');
  return others.some((other) => printDistance(print, decryptPrint(other.faceDescriptor)) < DUPLICATE_DISTANCE);
};

module.exports = { faceRule, encryptPrint, verifyFace, isFaceTaken };
