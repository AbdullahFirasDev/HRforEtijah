const express = require('express');
const { body } = require('express-validator');
const {
  punchIn,
  punchOut,
  extendSession,
  getMyAttendance,
  getTodayStatus,
  getTeamAttendance,
  getAllAttendance,
  validateAttendance,
  deleteAttendance,
  getAttendanceRecord,
  editAttendancePeriods,
  addManualAttendance,
} = require('../controllers/attendanceController');
const { periodRules } = require('../utils/attendanceEdit');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const closeOverdue = require('../middleware/closeOverdue');
const { MAX_EXTEND_HOURS } = require('../utils/attendanceDay');

const router = express.Router();

router.use(protect, closeOverdue);

const punchValidators = [
  body('selfie').notEmpty().withMessage('صورة السيلفي مطلوبة'),
  body('lat', 'إحداثيات الموقع غير صحيحة').isFloat({ min: -90, max: 90 }).toFloat(),
  body('lng', 'إحداثيات الموقع غير صحيحة').isFloat({ min: -180, max: 180 }).toFloat(),
  body('accuracy', 'دقة الموقع غير صحيحة').optional({ values: 'null' }).isFloat({ min: 0 }).toFloat(),
  body('leaveId', 'رقم الزمنية غير صحيح').optional({ values: 'null' }).isMongoId(),
];

router.post('/punch-in', punchValidators, validate, punchIn);
router.post('/punch-out', punchValidators, validate, punchOut);
router.post(
  '/extend',
  [
    body('hours', `مدة التمديد يجب أن تكون من 1 إلى ${MAX_EXTEND_HOURS} ساعات`).isInt({ min: 1, max: MAX_EXTEND_HOURS }).toInt(),
    body('reason', 'سبب التمديد طويل جداً (200 حرف كحد أقصى)').optional({ values: 'null' }).isString().isLength({ max: 200 }),
  ],
  validate,
  extendSession
);
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

// Correcting times and adding missed days are for admins only
router.post(
  '/manual',
  authorize('admin'),
  [
    body('userId', 'اختر الموظف').isMongoId(),
    body('date', 'صيغة التاريخ غير صحيحة').matches(/^\d{4}-\d{2}-\d{2}$/),
    ...periodRules,
  ],
  validate,
  addManualAttendance
);
router.get('/:id', authorize('admin'), getAttendanceRecord);
router.patch('/:id/periods', authorize('admin'), periodRules, validate, editAttendancePeriods);

module.exports = router;
