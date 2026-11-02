// Run with: node utils/new_seed.js
// Wipes ALL data from every collection (User, Attendance, Overtime) so you
// can start end-to-end testing on a clean database. Nothing is recreated —
// you'll need to /register or run `npm run seed` again afterwards.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const Attendance = require('../models/Attendance');
const Overtime = require('../models/Overtime');
const logger = require('../config/logger');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB — wiping all collections');

  const [users, attendance, overtime] = await Promise.all([
    User.deleteMany({}),
    Attendance.deleteMany({}),
    Overtime.deleteMany({}),
  ]);

  logger.info(`Deleted ${users.deletedCount} users`);
  logger.info(`Deleted ${attendance.deletedCount} attendance records`);
  logger.info(`Deleted ${overtime.deletedCount} overtime records`);
  logger.info('Database is now empty.');

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  logger.error(err);
  process.exit(1);
});
