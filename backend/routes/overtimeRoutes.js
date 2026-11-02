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
    body('requestedHours').isFloat({ gt: 0 }).withMessage('requestedHours must be greater than 0'),
    body('reason').trim().notEmpty().withMessage('reason is required'),
    body('date').optional().isISO8601().withMessage('date must be a valid date'),
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
    body('requestedHours').optional().isFloat({ gt: 0 }).withMessage('requestedHours must be greater than 0'),
    body('reason').optional().trim().notEmpty().withMessage('reason cannot be empty'),
    body('date').optional().isISO8601().withMessage('date must be a valid date'),
  ],
  validate,
  updateOvertime
);

router.patch(
  '/:id/review',
  authorize('manager', 'admin'),
  [body('status').isIn(['Approved', 'Rejected']).withMessage("status must be 'Approved' or 'Rejected'")],
  validate,
  reviewOvertime
);

module.exports = router;
