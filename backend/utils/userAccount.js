const { body } = require('express-validator');
const User = require('../models/User');
const ApiError = require('./ApiError');

const ROLES = ['employee', 'manager', 'admin'];

// Input checks shared by public signup and the admin "Add Employee" form.
const newUserRules = [
  body('name').trim().notEmpty().withMessage('الاسم الكامل مطلوب'),
  body('email').isEmail().withMessage('أدخل بريداً إلكترونياً صحيحاً'),
  body('password').isLength({ min: 6 }).withMessage('كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  body('role').optional().isIn(ROLES).withMessage('الدور المحدد غير صحيح'),
  body('managerId').custom((value, { req }) => {
    const role = ROLES.includes(req.body.role) ? req.body.role : 'employee';
    if (role === 'employee' && !value) {
      throw new Error('اختر المدير المسؤول');
    }
    return true;
  }),
];

// Creates an account with a unique email; employees must report to an
// existing manager or admin.
const createUserAccount = async ({ name, email, password, role, managerId }) => {
  const existing = await User.findOne({ email: email?.toLowerCase() });
  if (existing) {
    throw new ApiError(409, 'يوجد حساب بهذا البريد الإلكتروني مسبقاً');
  }

  const finalRole = ROLES.includes(role) ? role : 'employee';

  let manager = null;
  if (finalRole === 'employee') {
    if (!managerId) throw new ApiError(400, 'اختر المدير المسؤول للمتابعة');
    const managerDoc = await User.findOne({ _id: managerId, role: { $in: ['manager', 'admin'] } });
    if (!managerDoc) throw new ApiError(400, 'المدير المحدد غير موجود');
    manager = managerDoc._id;
  }

  return User.create({ name, email, password, role: finalRole, manager });
};

module.exports = { newUserRules, createUserAccount };
