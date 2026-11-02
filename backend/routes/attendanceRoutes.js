const express = require('express');
const { body } = require('express-validator');
const {
  punchIn,
  punchOut,
  getMyAttendance,
  getTodayStatus,
  getTeamAttendance,
  getAllAttendance,
  validateAttendance,
} = require('../controllers/attendanceController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.use(protect);

const punchValidators = [
  body('selfie').notEmpty().withMessage('Selfie image is required'),
  body('lat').isFloat().withMessage('lat must be a number'),
  body('lng').isFloat().withMessage('lng must be a number'),
];

router.post('/punch-in', punchValidators, validate, punchIn);
router.post('/punch-out', punchValidators, validate, punchOut);
router.get('/today', getTodayStatus);
router.get('/me', getMyAttendance);

router.get('/team', authorize('manager', 'admin'), getTeamAttendance);
router.get('/all', authorize('admin'), getAllAttendance);

router.patch(
  '/:id/validate',
  authorize('manager', 'admin'),
  [body('status').isIn(['Valid', 'Invalid']).withMessage("status must be 'Valid' or 'Invalid'")],
  validate,
  validateAttendance
);

module.exports = router;
