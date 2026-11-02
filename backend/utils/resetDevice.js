// Run with: npm run reset-device -- someone@company.com
// Frees an account's registered device from the command line, for when the
// only admin can no longer sign in from their own device (e.g. a new phone).
require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const run = async () => {
  const email = (process.argv[2] || '').trim().toLowerCase();
  if (!email) {
    console.error('Usage: npm run reset-device -- <email>');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findOneAndUpdate(
    { email },
    { $set: { deviceIdHash: null, deviceLabel: null, deviceRegisteredAt: null } }
  );
  console.log(
    user
      ? `Device reset for ${email}. The next sign-in will register a new device.`
      : `No account with email ${email}.`
  );
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
