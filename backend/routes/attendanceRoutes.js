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
  deleteAttendance,
} = require('../controllers/attendanceController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.use(protect);

const punchValidators = [
  body('selfie').notEmpty().withMessage('صورة السيلفي مطلوبة'),
  body('lat', 'إحداثيات الموقع غير صحيحة').isFloat({ min: -90, max: 90 }).toFloat(),
  body('lng', 'إحداثيات الموقع غير صحيحة').isFloat({ min: -180, max: 180 }).toFloat(),
  body('accuracy', 'دقة الموقع غير صحيحة').optional({ values: 'null' }).isFloat({ min: 0 }).toFloat(),
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

// Deleting records is for admins only
router.post(
  '/delete',
  authorize('admin'),
  [
    body('ids', 'اختر سجلاً واحداً على الأقل للحذف (200 سجل كحد أقصى في المرة)').isArray({ min: 1, max: 200 }),
    body('ids.*', 'معرّف سجل الحضور غير صحيح').isMongoId(),
  ],
  validate,
  deleteAttendance
);

module.exports = router;
