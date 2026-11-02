require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const connectDB = require('./config/db');
const logger = require('./config/logger');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const ApiError = require('./utils/ApiError');

const authRoutes = require('./routes/authRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const overtimeRoutes = require('./routes/overtimeRoutes');
const userRoutes = require('./routes/userRoutes');
const reportRoutes = require('./routes/reportRoutes');
const settingsRoutes = require('./routes/settingsRoutes');

connectDB();

const app = express();

app.use(helmet());

// Selfie images are sent as base64 strings, so allow a larger JSON body.
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// On Vercel the request arrives through Vercel's proxy, so take the client IP
// from X-Forwarded-For (otherwise the rate limiter puts every user in one bucket).
if (process.env.VERCEL) app.set('trust proxy', 1);

// The frontend normally shares the API's domain (Vercel, or a LAN server), so
// a request from the page's own origin is always allowed. Other origins must
// be listed in CLIENT_URL; Vercel's own deployment URLs are added for safety.
const vercelOrigins = [process.env.VERCEL_URL, process.env.VERCEL_BRANCH_URL, process.env.VERCEL_PROJECT_PRODUCTION_URL]
  .filter(Boolean)
  .map((host) => `https://${host}`);
const allowedOrigins = [...(process.env.CLIENT_URL || '').split(','), ...vercelOrigins].map((o) => o.trim());

// The host the browser asked for; behind Vercel's proxy it is in X-Forwarded-Host.
const requestHost = (req) => (req.app.get('trust proxy') && req.get('x-forwarded-host')) || req.get('host');
const isSameOrigin = (req, origin) => {
  try {
    return new URL(origin).host === requestHost(req);
  } catch {
    return false;
  }
};

app.use(
  cors((req, callback) => {
    const origin = req.get('origin');
    if (!origin || isSameOrigin(req, origin) || allowedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, { origin: true, credentials: true });
    } else {
      callback(new ApiError(403, 'هذا الموقع غير مسموح له بالاتصال بالنظام'));
    }
  })
);

// Log HTTP requests through morgan, piped into winston
app.use(
  morgan('combined', {
    stream: { write: (message) => logger.info(message.trim()) },
  })
);

// Basic rate limiting to slow down brute-force login attempts. Only failed
// requests count, so staff behind one office IP signing in again every
// session don't lock each other out.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  skipSuccessfulRequests: true,
  message: { success: false, message: 'محاولات كثيرة، يرجى المحاولة بعد قليل' },
});
app.use('/api/auth', authLimiter);

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'Attendance API is running', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/overtime', overtimeRoutes);
app.use('/api/users', userRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/settings', settingsRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  logger.info(`Server running in ${process.env.NODE_ENV || 'development'} mode on port ${PORT}`);
});

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Rejection: ${err.message}`);
});
