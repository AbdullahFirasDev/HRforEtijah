const crypto = require('crypto');
const mongoose = require('mongoose');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const NotificationPreference = require('../models/NotificationPreference');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { categoriesFor, notificationsReady } = require('../utils/notify');
const { pushConfigured, pushPublicKey, sendToUser } = require('../utils/push');
const { kickSweep, sweepOnce } = require('../utils/notificationSweep');

// Every query below is limited to the signed-in user's own notifications,
// preferences and devices: nobody can read or change anyone else's.

const PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;
// Old browsers a user no longer uses are dropped beyond this many
const MAX_DEVICES_PER_USER = 10;
const TEST_EVERY_MS = 20e3;

const NOT_READY = 'الإشعارات غير مفعّلة بعد. يجب أن يكمل مسؤول النظام إعدادها أولاً.';

const requireReady = async () => {
  if (!(await notificationsReady())) throw new ApiError(503, NOT_READY);
};

const view = (n) => ({
  id: n._id,
  type: n.type,
  category: n.category,
  title: n.title,
  body: n.body,
  link: n.link,
  at: n.availableAt,
  read: !!n.readAt,
});

const unreadCount = (userId) =>
  Notification.countDocuments({ user: userId, readAt: null, availableAt: { $lte: new Date() } });

// @desc  How many unread notifications the signed-in user has. Open apps ask
//        every minute, which also runs the reminders on Vercel.
// @route GET /api/notifications/unread-count
// @access Private
const getUnreadCount = asyncHandler(async (req, res) => {
  if (!(await notificationsReady())) return res.json({ success: true, enabled: false, count: 0 });
  const sweep = kickSweep();
  // Vercel stops the function once it answers, so let the sweep finish first
  // (it is short; never more than a few seconds)
  if (process.env.VERCEL) await Promise.race([sweep, new Promise((r) => setTimeout(r, 4000))]);
  res.json({ success: true, enabled: true, count: await unreadCount(req.user._id) });
});

// @desc  The signed-in user's notifications, newest first
// @route GET /api/notifications?limit=20&before=<id>&unread=1
// @access Private
const getNotifications = asyncHandler(async (req, res) => {
  if (!(await notificationsReady())) return res.json({ success: true, enabled: false, notifications: [], hasMore: false, unread: 0 });
  const limit = Math.min(Math.max(Number(req.query.limit) || PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const now = new Date();
  const filter = { user: req.user._id, availableAt: { $lte: now } };
  if (req.query.unread === '1') filter.readAt = null;
  if (req.query.before) {
    if (!mongoose.isValidObjectId(req.query.before)) throw new ApiError(400, 'قيمة غير صالحة للحقل \'before\'');
    const last = await Notification.findOne({ _id: req.query.before, user: req.user._id }).select('availableAt').lean();
    if (last) {
      filter.$or = [{ availableAt: { $lt: last.availableAt } }, { availableAt: last.availableAt, _id: { $lt: last._id } }];
    }
  }
  const [items, unread] = await Promise.all([
    Notification.find(filter).sort({ availableAt: -1, _id: -1 }).limit(limit + 1).lean(),
    unreadCount(req.user._id),
  ]);
  res.json({
    success: true,
    enabled: true,
    notifications: items.slice(0, limit).map(view),
    hasMore: items.length > limit,
    unread,
  });
});

// @desc  Mark one notification as read
// @route POST /api/notifications/:id/read
// @access Private (its recipient)
const markRead = asyncHandler(async (req, res) => {
  await requireReady();
  if (!mongoose.isValidObjectId(req.params.id)) throw new ApiError(404, 'الإشعار غير موجود');
  const found = await Notification.findOne({ _id: req.params.id, user: req.user._id }).select('readAt').lean();
  if (!found) throw new ApiError(404, 'الإشعار غير موجود');
  if (!found.readAt) await Notification.updateOne({ _id: found._id, readAt: null }, { $set: { readAt: new Date() } });
  res.json({ success: true, unread: await unreadCount(req.user._id) });
});

// @desc  Mark every notification as read
// @route POST /api/notifications/read-all
// @access Private
const markAllRead = asyncHandler(async (req, res) => {
  await requireReady();
  await Notification.updateMany(
    { user: req.user._id, readAt: null, availableAt: { $lte: new Date() } },
    { $set: { readAt: new Date() } }
  );
  res.json({ success: true, unread: 0 });
});

// A short fingerprint of a browser's endpoint, so the page can tell which
// device in the list is itself without the endpoint (a secret) being shown
const deviceKey = (endpoint) => crypto.createHash('sha256').update(endpoint).digest('hex').slice(0, 16);

const devicesOf = async (userId) =>
  (await PushSubscription.find({ user: userId }).select('endpoint label createdAt lastSuccessAt').sort({ createdAt: -1 }).lean()).map(
    (d) => ({ id: d._id, key: deviceKey(d.endpoint), label: d.label, since: d.createdAt, lastSuccessAt: d.lastSuccessAt })
  );

// @desc  The user's notification settings: per category, in the app and as push
// @route GET /api/notifications/settings
// @access Private
const getSettings = asyncHandler(async (req, res) => {
  if (!(await notificationsReady())) return res.json({ success: true, enabled: false });
  const [pref, devices] = await Promise.all([NotificationPreference.findById(req.user._id).lean(), devicesOf(req.user._id)]);
  res.json({
    success: true,
    enabled: true,
    categories: categoriesFor(req.user.role).map((id) => ({
      id,
      inApp: !pref?.off?.includes(id),
      push: !pref?.pushOff?.includes(id),
    })),
    push: { configured: pushConfigured(), publicKey: pushPublicKey() },
    devices,
  });
});

// @desc  Save which categories the user wants, in the app and as push
// @route PUT /api/notifications/settings   { categories: [{ id, inApp, push }] }
// @access Private
const updateSettings = asyncHandler(async (req, res) => {
  await requireReady();
  const allowed = categoriesFor(req.user.role);
  const chosen = new Map((req.body.categories || []).map((c) => [c.id, c]));
  const unknown = [...chosen.keys()].find((id) => !allowed.includes(id));
  if (unknown) throw new ApiError(400, 'نوع إشعار غير معروف');
  const current = (await NotificationPreference.findById(req.user._id).lean()) || { off: [], pushOff: [] };
  // Categories not sent keep their current setting
  const pick = (list, field) =>
    allowed.filter((id) => (chosen.has(id) ? chosen.get(id)[field] === false : list.includes(id)));
  const off = pick(current.off || [], 'inApp');
  const pushOff = pick(current.pushOff || [], 'push');
  await NotificationPreference.updateOne({ _id: req.user._id }, { $set: { off, pushOff } }, { upsert: true });
  res.json({
    success: true,
    categories: allowed.map((id) => ({ id, inApp: !off.includes(id), push: !pushOff.includes(id) })),
  });
});

// e.g. "Chrome على Android", for the list of the user's devices (order matters:
// Edge and Opera also say Chrome, every iOS browser says Safari)
const BROWSERS = [
  [/Edg(A|iOS)?\//, 'Edge'],
  [/SamsungBrowser/, 'Samsung Internet'],
  [/OPR\//, 'Opera'],
  [/Firefox\/|FxiOS/, 'Firefox'],
  [/Chrome\/|CriOS/, 'Chrome'],
  [/Safari\//, 'Safari'],
];
const SYSTEMS = [
  [/Android/, 'Android'],
  [/iPhone|iPad|iPod/, 'iOS'],
  [/Windows/, 'Windows'],
  [/Mac OS X/, 'macOS'],
  [/Linux/, 'Linux'],
];
const firstMatch = (list, ua) => list.find(([re]) => re.test(ua))?.[1];
const deviceLabel = (ua = '') => {
  const browser = firstMatch(BROWSERS, ua) || 'متصفح';
  const system = firstMatch(SYSTEMS, ua);
  return system ? `${browser} على ${system}` : browser;
};

// @desc  This browser agreed to push messages: save (or move to this user)
//        its subscription
// @route POST /api/notifications/subscriptions   { endpoint, keys: { p256dh, auth } }
// @access Private
const saveSubscription = asyncHandler(async (req, res) => {
  await requireReady();
  if (!pushConfigured()) throw new ApiError(503, 'إشعارات الجهاز غير مفعّلة على الخادم بعد.');
  const { endpoint, keys } = req.body;
  // The same browser used by another account before now belongs to this one
  await PushSubscription.updateOne(
    { endpoint },
    {
      $set: { user: req.user._id, keys: { p256dh: keys.p256dh, auth: keys.auth }, label: deviceLabel(req.get('user-agent')), failures: 0 },
      $setOnInsert: { lastSuccessAt: null },
    },
    { upsert: true }
  );
  const extra = await PushSubscription.find({ user: req.user._id }).sort({ updatedAt: -1 }).skip(MAX_DEVICES_PER_USER).select('_id').lean();
  if (extra.length) await PushSubscription.deleteMany({ _id: { $in: extra.map((d) => d._id) } });
  res.status(201).json({ success: true, devices: await devicesOf(req.user._id) });
});

// @desc  Stop push messages to a browser: this one, by its endpoint (whoever
//        subscribed it: only the browser itself knows its endpoint, e.g. a
//        colleague used it before), or one of the user's own by id
// @route DELETE /api/notifications/subscriptions   { endpoint } | { id }
// @access Private
const deleteSubscription = asyncHandler(async (req, res) => {
  await requireReady();
  const { endpoint, id } = req.body || {};
  if (endpoint) await PushSubscription.deleteOne({ endpoint });
  else if (id && mongoose.isValidObjectId(id)) await PushSubscription.deleteOne({ _id: id, user: req.user._id });
  else throw new ApiError(400, 'حدّد الجهاز المطلوب إيقاف الإشعارات عنه');
  res.json({ success: true, devices: await devicesOf(req.user._id) });
});

// @desc  Send a test push message to the user's own devices
// @route POST /api/notifications/test
// @access Private
const lastTest = new Map();
const sendTest = asyncHandler(async (req, res) => {
  await requireReady();
  if (!pushConfigured()) throw new ApiError(503, 'إشعارات الجهاز غير مفعّلة على الخادم بعد.');
  const id = String(req.user._id);
  if (Date.now() - (lastTest.get(id) || 0) < TEST_EVERY_MS) throw new ApiError(429, 'انتظر قليلاً قبل إرسال تجربة أخرى');
  lastTest.set(id, Date.now());
  const result = await sendToUser(
    req.user._id,
    { title: 'تجربة الإشعارات', body: 'وصلت الإشعارات إلى هذا الجهاز بنجاح.', url: '/', tag: 'test' },
    { ttl: 600, urgency: 'high' }
  );
  if (!result.total) throw new ApiError(409, 'لم تفعّل إشعارات الجهاز على أي جهاز بعد');
  res.json({ success: true, sent: result.sent, total: result.total, devices: await devicesOf(req.user._id) });
});

// @desc  Runs the reminders and push retries now, for a scheduler (Vercel Cron
//        or any service calling it every minute) where no server stays up.
//        Off unless CRON_SECRET is set; the caller sends
//        "Authorization: Bearer <CRON_SECRET>" (Vercel Cron does this itself).
// @route GET /api/notifications/sweep
// @access The scheduler (secret)
const runSweep = asyncHandler(async (req, res) => {
  const secret = process.env.CRON_SECRET || '';
  const given = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(secret).digest();
  if (!secret || !crypto.timingSafeEqual(a, b)) throw new ApiError(404, `المسار غير موجود - ${req.originalUrl}`);
  res.json({ success: true, ran: await sweepOnce() });
});

module.exports = {
  runSweep,
  getUnreadCount,
  getNotifications,
  markRead,
  markAllRead,
  getSettings,
  updateSettings,
  saveSubscription,
  deleteSubscription,
  sendTest,
};
