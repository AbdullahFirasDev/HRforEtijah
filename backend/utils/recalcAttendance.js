// Brings saved attendance days up to the current counting rules
// (utils/dayMetrics.js CALC_VERSION). The monthly sheet always counts live
// from the punches; this keeps the counts saved on each day (used by the
// attendance lists and reports) in step with it.
//
//   automatically: a batch before attendance is read (middleware/closeOverdue.js),
//                  until no day is left on an older version
//   npm run attendance:recalc            recalculate every saved day now
//
// Only the counts change: punches, plans and open periods are left as they are.
const path = require('path');
const Attendance = require('../models/Attendance');
const logger = require('../config/logger');
const { CALC_VERSION } = require('./dayMetrics');
const { loadLeaves, recalcDay } = require('./attendanceDay');

// Small batches: it runs before the request, so it never races a save of the same day
const BATCH = 50;
const stale = { $or: [{ calcVersion: { $exists: false } }, { calcVersion: { $lt: CALC_VERSION } }] };

const recalcRecord = async (record) => {
  record.adoptLegacySession();
  recalcDay(record, await loadLeaves(record));
  try {
    await record.save();
    return true;
  } catch (err) {
    // Changed by someone else at the same moment: their save recalculated it
    if (err.name === 'VersionError') return false;
    throw err;
  }
};

// Once a process has found nothing stale it stops asking
let upToDate = false;
let running = null;
const recalcStaleDays = async () => {
  if (upToDate) return 0;
  if (!running) {
    running = (async () => {
      const records = await Attendance.find(stale).limit(BATCH);
      if (!records.length) {
        upToDate = true;
        return 0;
      }
      let done = 0;
      for (const record of records) if (await recalcRecord(record)) done += 1;
      logger.info(`Recalculated ${done} attendance day(s) on counting rules v${CALC_VERSION}`);
      return done;
    })().finally(() => {
      running = null;
    });
  }
  return running;
};

const main = async () => {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
  const mongoose = require('mongoose');
  await mongoose.connect(process.env.MONGO_URI);
  let done = 0;
  for await (const record of Attendance.find({}).cursor()) {
    if (await recalcRecord(record)) done += 1;
  }
  console.log(`Done: ${done} attendance day(s) recalculated on counting rules v${CALC_VERSION}.`);
  await mongoose.disconnect();
};

if (require.main === module) {
  main().catch((err) => {
    console.error(`Recalculation failed: ${err.message}`);
    process.exit(1);
  });
}

module.exports = { recalcStaleDays, recalcRecord };
