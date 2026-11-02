const { body } = require('express-validator');
const User = require('../models/User');
const ApiError = require('./ApiError');

const ROLES = ['employee', 'manager', 'admin'];

// Input checks shared by public signup and the admin "Add Employee" form.
const newUserRules = [
  body('name').trim().notEmpty().withMessage('Name is required'),
  body('email').isEmail().withMessage('A valid email is required'),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters'),
  body('role').optional().isIn(ROLES).withMessage('Invalid role'),
  body('managerId').custom((value, { req }) => {
    const role = ROLES.includes(req.body.role) ? req.body.role : 'employee';
    if (role === 'employee' && !value) {
      throw new Error('Please select a manager');
    }
    return true;
  }),
];

// Creates an account with a unique email; employees must report to an
// existing manager or admin.
const createUserAccount = async ({ name, email, password, role, managerId }) => {
  const existing = await User.findOne({ email: email?.toLowerCase() });
  if (existing) {
    throw new ApiError(409, 'An account with this email already exists');
  }

  const finalRole = ROLES.includes(role) ? role : 'employee';

  let manager = null;
  if (finalRole === 'employee') {
    if (!managerId) throw new ApiError(400, 'Please select a manager to continue');
    const managerDoc = await User.findOne({ _id: managerId, role: { $in: ['manager', 'admin'] } });
    if (!managerDoc) throw new ApiError(400, 'Selected manager does not exist');
    manager = managerDoc._id;
  }

  return User.create({ name, email, password, role: finalRole, manager });
};

module.exports = { newUserRules, createUserAccount };
