const express = require('express');
const { body } = require('express-validator');
const { register, login, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { newUserRules } = require('../utils/userAccount');

const router = express.Router();

router.post('/register', newUserRules, validate, register);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('أدخل بريداً إلكترونياً صحيحاً'),
    body('password').notEmpty().withMessage('كلمة المرور مطلوبة'),
  ],
  validate,
  login
);

router.get('/me', protect, getMe);

module.exports = router;
