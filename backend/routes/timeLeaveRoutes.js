const express = require('express');
const { body } = require('express-validator');
const {
  requestLeave,
  getMyLeaves,
  cancelLeave,
  getLeavesForReview,
  reviewLeave,
} = require('../controllers/timeLeaveController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const closeOverdue = require('../middleware/closeOverdue');
const { requestRules } = require('../utils/timeLeave');

const router = express.Router();

router.use(protect, closeOverdue);

router.post('/', authorize('employee'), requestRules, validate, requestLeave);
router.get('/me', getMyLeaves);
router.patch('/:id/cancel', cancelLeave);
router.get('/review', authorize('manager', 'admin'), getLeavesForReview);
router.patch(
  '/:id/review',
  authorize('manager', 'admin'),
  [
    body('status', 'القرار يجب أن يكون "مقبول" أو "مرفوض"').isIn(['Approved', 'Rejected']),
    body('reviewRemarks', 'الملاحظة طويلة جداً').optional({ values: 'null' }).isString().isLength({ max: 300 }),
  ],
  validate,
  reviewLeave
);

module.exports = router;
