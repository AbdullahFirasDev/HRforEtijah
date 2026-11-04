const express = require('express');
const { body } = require('express-validator');
const { getInbox, markRead, getMessages, sendMessage, deleteMessage } = require('../controllers/messageController');
const { protect, authorize } = require('../middleware/auth');
const validate = require('../middleware/validate');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const router = express.Router();

router.use(protect);

router.get('/inbox', getInbox);
router.post('/:id/read', markRead);

router.get('/', authorize('admin'), getMessages);
router.post(
  '/',
  authorize('admin'),
  [
    body('title', 'اكتب عنوان الرسالة (100 حرف كحد أقصى)').isString().trim().isLength({ min: 1, max: 100 }),
    body('body', 'اكتب نص الرسالة (2000 حرف كحد أقصى)').isString().trim().isLength({ min: 1, max: 2000 }),
    body('from', 'تاريخ البداية غير صحيح').matches(DATE_RE),
    body('to', 'تاريخ النهاية غير صحيح').matches(DATE_RE),
    body('toAll', 'قيمة الإرسال للجميع غير صحيحة').optional().isBoolean({ strict: true }),
    body('recipients', 'قائمة الموظفين غير صحيحة').optional().isArray({ max: 1000 }),
    body('recipients.*', 'قائمة الموظفين غير صحيحة').isMongoId(),
  ],
  validate,
  sendMessage
);
router.delete('/:id', authorize('admin'), deleteMessage);

module.exports = router;
