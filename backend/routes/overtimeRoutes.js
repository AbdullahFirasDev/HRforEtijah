const express = require('express');
const { body } = require('express-validator');
const {
  requestOvertime,
  updateOvertime,
  getMyOvertime,
  getPendingOvertime,
  getAllOvertimeForReviewer,
  reviewOvertime,
} = require('../controllers/overtimeController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const router = express.Router();

router.use(protect);

router.post(
  '/request',
  [
    body('requestedHours').isFloat({ gt: 0 }).withMessage('عدد الساعات يجب أن يكون أكبر من صفر'),
    body('reason').trim().notEmpty().withMessage('سبب الطلب مطلوب'),
    body('date').optional().isISO8601().withMessage('التاريخ غير صحيح'),
  ],
  validate,
  requestOvertime
);

router.get('/me', getMyOvertime);
router.get('/pending', authorize('manager', 'admin'), getPendingOvertime);
router.get('/all', authorize('manager', 'admin'), getAllOvertimeForReviewer);

router.patch(
  '/:id',
  [
    body('requestedHours').optional().isFloat({ gt: 0 }).withMessage('عدد الساعات يجب أن يكون أكبر من صفر'),
    body('reason').optional().trim().notEmpty().withMessage('سبب الطلب لا يمكن أن يكون فارغاً'),
    body('date').optional().isISO8601().withMessage('التاريخ غير صحيح'),
  ],
  validate,
  updateOvertime
);

router.patch(
  '/:id/review',
  authorize('manager', 'admin'),
  [body('status').isIn(['Approved', 'Rejected']).withMessage('الحالة يجب أن تكون "مقبول" أو "مرفوض"')],
  validate,
  reviewOvertime
);

module.exports = router;
