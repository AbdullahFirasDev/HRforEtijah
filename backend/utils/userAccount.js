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
// existing manager or admin. `extra` holds fields only an admin may set.
const createUserAccount = async ({ name, email, password, role, managerId }, extra = {}) => {
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

  return User.create({ name, email, password, role: finalRole, manager, ...extra });
};

// Optional HR details (admin only): employee number, department, job title.
// An empty value removes the detail.
const PROFILE_FIELDS = { employeeNumber: 40, department: 80, jobTitle: 80 };
const PROFILE_LABELS = { employeeNumber: 'الرقم الوظيفي', department: 'القسم', jobTitle: 'المسمى الوظيفي' };

const profileRules = Object.entries(PROFILE_FIELDS).map(([field, max]) =>
  body(field, `${PROFILE_LABELS[field]}: ${max} حرفاً كحد أقصى`).optional({ values: 'null' }).isString().trim().isLength({ max })
);

// The details present in a request body, and a clash with another account's number
const profileFrom = async (bodyIn, exceptId = null) => {
  const out = {};
  for (const field of Object.keys(PROFILE_FIELDS)) {
    if (bodyIn[field] === undefined) continue;
    out[field] = bodyIn[field] === null ? undefined : String(bodyIn[field]).trim() || undefined;
  }
  if (out.employeeNumber) {
    const re = new RegExp(`^${out.employeeNumber.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const taken = await User.findOne({ employeeNumber: re, ...(exceptId && { _id: { $ne: exceptId } }) }).select('name').lean();
    if (taken) throw new ApiError(409, `الرقم الوظيفي ${out.employeeNumber} مستخدم لحساب ${taken.name}`);
  }
  return out;
};

module.exports = { newUserRules, createUserAccount, profileRules, profileFrom };
