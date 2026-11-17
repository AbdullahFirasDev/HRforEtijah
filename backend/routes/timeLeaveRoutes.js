const express = require('express');
const { body } = require('express-validator');
const {
  requestLeave,
  getMyLeaves,
  cancelLeave,
  getLeavesForReview,
  reviewLeave,
  grantLeave,
  updateLeave,
  revokeLeave,
} = require('../controllers/timeLeaveController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const closeOverdue = require('../middleware/closeOverdue');
const { requestRules, grantRules, editRules } = require('../utils/timeLeave');

const router = express.Router();

router.use(protect, closeOverdue);

router.post('/', authorize('employee'), requestRules, validate, requestLeave);
router.get('/me', getMyLeaves);
router.patch('/:id/cancel', cancelLeave);
router.get('/review', authorize('manager', 'admin'), getLeavesForReview);
// Managers and admins add a leave for an employee (past days too), correct or withdraw one
router.post('/grant', authorize('manager', 'admin'), grantRules, validate, grantLeave);
router.patch('/:id', authorize('manager', 'admin'), editRules, validate, updateLeave);
router.patch(
  '/:id/revoke',
  authorize('manager', 'admin'),
  [body('reviewRemarks', 'الملاحظة طويلة جداً').optional({ values: 'null' }).isString().isLength({ max: 300 })],
  validate,
  revokeLeave
);
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
