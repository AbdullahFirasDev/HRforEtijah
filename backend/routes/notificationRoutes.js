const express = require('express');
const { body } = require('express-validator');
const {
  getUnreadCount,
  getNotifications,
  markRead,
  markAllRead,
  getSettings,
  updateSettings,
  saveSubscription,
  deleteSubscription,
  sendTest,
  runSweep,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');
const validate = require('../middleware/validate');
const { isPushEndpoint } = require('../utils/push');

// Base64url, as browsers give the subscription keys
const KEY_RE = /^[A-Za-z0-9_-]+={0,2}$/;
const BAD_SUBSCRIPTION = 'بيانات اشتراك الإشعارات غير صحيحة';

const router = express.Router();

// For a scheduler, with its own secret (see the controller); not a user route
router.get('/sweep', runSweep);

// Every other route is about the signed-in user's own notifications (any role)
router.use(protect);

router.get('/', getNotifications);
router.get('/unread-count', getUnreadCount);
router.post('/read-all', markAllRead);
router.post('/:id/read', markRead);

router.get('/settings', getSettings);
router.put(
  '/settings',
  [
    body('categories', 'إعدادات الإشعارات غير صحيحة').isArray({ max: 20 }),
    body('categories.*.id', 'إعدادات الإشعارات غير صحيحة').isString(),
    body('categories.*.inApp', 'إعدادات الإشعارات غير صحيحة').isBoolean({ strict: true }),
    body('categories.*.push', 'إعدادات الإشعارات غير صحيحة').isBoolean({ strict: true }),
  ],
  validate,
  updateSettings
);

router.post(
  '/subscriptions',
  [
    body('endpoint', BAD_SUBSCRIPTION)
      .isString()
      .isLength({ max: 1024 })
      .custom((endpoint) => {
        // Only the browsers' own push services: the server posts to this address
        if (!isPushEndpoint(endpoint)) throw new Error('هذا المتصفح يستخدم خدمة إشعارات غير مدعومة');
        return true;
      }),
    body('keys.p256dh', BAD_SUBSCRIPTION).isString().isLength({ min: 40, max: 200 }).matches(KEY_RE),
    body('keys.auth', BAD_SUBSCRIPTION).isString().isLength({ min: 16, max: 64 }).matches(KEY_RE),
  ],
  validate,
  saveSubscription
);
router.delete(
  '/subscriptions',
  [body('endpoint', BAD_SUBSCRIPTION).optional().isString().isLength({ max: 1024 })],
  validate,
  deleteSubscription
);
router.post('/test', sendTest);

module.exports = router;
