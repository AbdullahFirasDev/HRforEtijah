const { closeOverduePeriods } = require('../utils/attendanceDay');

// Before attendance is read or changed, close the periods whose time ran out
// with nobody checking out, so every screen and total sees them closed.
const closeOverdue = async (req, res, next) => {
  try {
    await closeOverduePeriods();
    next();
  } catch (err) {
    next(err);
  }
};

module.exports = closeOverdue;
