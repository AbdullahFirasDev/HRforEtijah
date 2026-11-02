// Run with: npm run seed
// Creates one Admin, one Manager, and one Employee (assigned to the manager)
// so you can log in immediately and demo every role.
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const logger = require('../config/logger');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  logger.info('Connected to MongoDB for seeding');

  await User.deleteMany({ email: { $in: ['admin@demo.com', 'manager@demo.com', 'employee@demo.com'] } });

  const admin = await User.create({
    name: 'Admin User',
    email: 'admin@demo.com',
    password: 'password123',
    role: 'admin',
  });

  const manager = await User.create({
    name: 'Manager User',
    email: 'manager@demo.com',
    password: 'password123',
    role: 'manager',
  });

  const employee = await User.create({
    name: 'Employee User',
    email: 'employee@demo.com',
    password: 'password123',
    role: 'employee',
    manager: manager._id,
  });

  logger.info('Seed complete:');
  logger.info(`  Admin:    admin@demo.com / password123`);
  logger.info(`  Manager:  manager@demo.com / password123`);
  logger.info(`  Employee: employee@demo.com / password123`);

  await mongoose.disconnect();
  process.exit(0);
};

run().catch((err) => {
  logger.error(err);
  process.exit(1);
});
