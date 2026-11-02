const logger = require('../config/logger');

const notFound = (req, res, next) => {
  res.status(404);
  next(new Error(`المسار غير موجود - ${req.originalUrl}`));
};

// eslint-disable-next-line no-unused-vars
const errorHandler = (err, req, res, next) => {
  let statusCode = err.statusCode && err.statusCode !== 200 ? err.statusCode : res.statusCode;
  if (!statusCode || statusCode < 400) statusCode = 500;

  let message = err.message || 'حدث خطأ في الخادم';

  // Mongoose bad ObjectId
  if (err.name === 'CastError') {
    statusCode = 400;
    message = `قيمة غير صالحة للحقل '${err.path}'`;
  }

  // Mongoose duplicate key
  if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0];
    message = field === 'email' ? 'يوجد حساب بهذا البريد الإلكتروني مسبقاً' : 'هذا السجل موجود مسبقاً';
  }

  // Two requests changed the same record at once (e.g. a double-tapped punch)
  if (err.name === 'VersionError') {
    statusCode = 409;
    message = 'تغيّر هذا السجل للتو بطلب آخر. حدّث الصفحة ثم حاول مرة أخرى.';
  }

  // Mongoose validation error
  if (err.name === 'ValidationError') {
    statusCode = 400;
    message = Object.values(err.errors)
      .map((e) => e.message)
      .join(', ');
  }

  if (statusCode >= 500) {
    logger.error(`${req.method} ${req.originalUrl} - ${err.stack || err.message}`);
    // Internal details (e.g. "connect ECONNREFUSED ...") stay in the log, not on screen
    message = 'تعذر إتمام الطلب بسبب مشكلة في الخادم. حاول مرة أخرى بعد قليل، وإن تكررت المشكلة فتواصل مع مسؤول النظام.';
  } else {
    logger.warn(`${req.method} ${req.originalUrl} - ${message}`);
  }

  res.status(statusCode).json({
    success: false,
    message,
    stack: process.env.NODE_ENV === 'production' ? undefined : err.stack,
  });
};

module.exports = { notFound, errorHandler };
