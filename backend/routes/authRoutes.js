const express = require('express');
const { body } = require('express-validator');
const { register, login, deviceAccounts, faceLogin, getMe } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { newUserRules } = require('../utils/userAccount');
const { deviceIdRule } = require('../utils/device');
const { faceRule } = require('../utils/faceData');

const router = express.Router();

router.post('/register', [...newUserRules, deviceIdRule], validate, register);

router.post(
  '/login',
  [
    body('email').isEmail().withMessage('أدخل بريداً إلكترونياً صحيحاً'),
    body('password').notEmpty().withMessage('كلمة المرور مطلوبة'),
    deviceIdRule,
  ],
  validate,
  login
);

// Face login (the main way in) and who it is offered to on this device
router.post('/device', [deviceIdRule], validate, deviceAccounts);
router.post('/face-login', [deviceIdRule, faceRule], validate, faceLogin);

router.get('/me', protect, getMe);

module.exports = router;
