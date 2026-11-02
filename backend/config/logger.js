const { createLogger, format, transports } = require('winston');

const logTransports = [new transports.Console()];

// Vercel's filesystem is read-only; its runtime logs capture console output instead.
if (!process.env.VERCEL) {
  logTransports.push(
    new transports.File({ filename: 'logs/error.log', level: 'error' }),
    new transports.File({ filename: 'logs/combined.log' })
  );
}

const logger = createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
  format: format.combine(
    format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    format.errors({ stack: true }),
    format.printf(({ timestamp, level, message, stack }) => {
      return `[${timestamp}] ${level.toUpperCase()}: ${stack || message}`;
    })
  ),
  transports: logTransports,
  exceptionHandlers: [new transports.Console()],
});

module.exports = logger;
