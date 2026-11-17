const { closeOverduePeriods } = require('../utils/attendanceDay');
const { recalcStaleDays } = require('../utils/recalcAttendance');

// Before attendance is read or changed, close the periods whose time ran out
// with nobody checking out, so every screen and total sees them closed, and
// bring days saved under older counting rules up to date.
const closeOverdue = async (req, res, next) => {
  try {
    await closeOverduePeriods();
    await recalcStaleDays();
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = closeOverdue;
