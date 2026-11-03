const express = require('express');
const {
  getAllUsers,
  createUser,
  getManagersList,
  getMyTeam,
  updateUser,
  resetDevice,
  changePassword,
  deleteUser,
} = require('../controllers/userController');
const { body } = require('express-validator');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { newUserRules } = require('../utils/userAccount');
const { workSettingsRules } = require('../utils/schedule');

const router = express.Router();

// Public - used by the signup form to let an employee pick their manager
router.get('/managers', getManagersList);

router.use(protect);

router.get('/', authorize('admin'), getAllUsers);
router.post('/', authorize('admin'), [...newUserRules, ...workSettingsRules], validate, createUser);
router.get('/team', authorize('manager', 'admin'), getMyTeam);
router.patch(
  '/:id',
  authorize('admin'),
  [...workSettingsRules, body('applyFrom', 'تاريخ تطبيق الدوام غير صحيح').optional({ values: 'falsy' }).matches(/^\d{4}-\d{2}-\d{2}$/)],
  validate,
  updateUser
);
router.patch('/:id/reset-device', authorize('admin'), resetDevice);
// Passwords are changed and accounts deleted by admins only
router.patch(
  '/:id/password',
  authorize('admin'),
  [body('password', 'كلمة المرور يجب أن تكون 6 أحرف على الأقل').isString().isLength({ min: 6 })],
  validate,
  changePassword
);
router.delete('/:id', authorize('admin'), deleteUser);

module.exports = router;
