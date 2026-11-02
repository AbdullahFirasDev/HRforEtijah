const mongoose = require('mongoose');
const logger = require('./logger');

const connectDB = async () => {
  try {
    // Fail a request after 10s (default 30s) when the database is unreachable,
    // so users see an error instead of a login button spinning for half a minute.
    const conn = await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 10000 });
    logger.info(`MongoDB connected: ${conn.connection.host}`);
  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;
