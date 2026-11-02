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
  body('selfie').notEmpty().withMessage('صورة السيلفي مطلوبة'),
  body('lat').isFloat().withMessage('إحداثيات الموقع غير صحيحة'),
  body('lng').isFloat().withMessage('إحداثيات الموقع غير صحيحة'),
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
  [body('status').isIn(['Valid', 'Invalid']).withMessage('نتيجة التحقق يجب أن تكون "صحيح" أو "غير صحيح"')],
  validate,
  validateAttendance
);

module.exports = router;
