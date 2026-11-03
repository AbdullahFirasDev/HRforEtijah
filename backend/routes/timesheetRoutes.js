const express = require('express');
const { getSummary, getUserTimesheet, reapplyUserSchedule } = require('../controllers/timesheetController');
const { protect, authorize } = require('../middleware/auth');
const closeOverdue = require('../middleware/closeOverdue');

const router = express.Router();

router.use(protect, closeOverdue);

router.get('/summary', authorize('manager', 'admin'), getSummary);
router.get('/me', getUserTimesheet);
router.get('/user/:id', getUserTimesheet);
router.post('/user/:id/reapply', authorize('admin'), reapplyUserSchedule);

module.exports = router;
