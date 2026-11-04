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
  deleteAttendance,
  getAttendanceRecord,
  editAttendancePeriods,
  addManualAttendance,
  enrollFace,
} = require('../controllers/attendanceController');
const { periodRules } = require('../utils/attendanceEdit');
const { faceRule } = require('../utils/faceData');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const closeOverdue = require('../middleware/closeOverdue');

const router = express.Router();

router.use(protect, closeOverdue);

const punchValidators = [
  faceRule,
  body('lat', 'إحداثيات الموقع غير صحيحة').isFloat({ min: -90, max: 90 }).toFloat(),
  body('lng', 'إحداثيات الموقع غير صحيحة').isFloat({ min: -180, max: 180 }).toFloat(),
  body('accuracy', 'دقة الموقع غير صحيحة').optional({ values: 'null' }).isFloat({ min: 0 }).toFloat(),
  body('leaveId', 'رقم الزمنية غير صحيح').optional({ values: 'null' }).isMongoId(),
];

router.post(
  '/face',
  [faceRule, body('consent', 'يلزم الموافقة على تسجيل بصمة الوجه').custom((value) => value === true)],
  validate,
  enrollFace
);
router.post('/punch-in', punchValidators, validate, punchIn);
router.post('/punch-out', punchValidators, validate, punchOut);
router.post('/extend', extendSession);
router.get('/today', getTodayStatus);
router.get('/me', getMyAttendance);

router.get('/team', authorize('manager', 'admin'), getTeamAttendance);
router.get('/all', authorize('admin'), getAllAttendance);

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
