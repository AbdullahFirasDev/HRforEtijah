const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const NotificationPreference = require('../models/NotificationPreference');
const User = require('../models/User');
const logger = require('../config/logger');
const { pushConfigured, sendToUser } = require('./push');

// Notifications: one record per person in the app's notification centre, and
// a push message to their devices when they allowed it. Business code calls
// notify() (through utils/notifyEvents.js) after its own change is saved;
// notify() never throws, so a notification problem can't fail a check-in, a
// request or an approval. Push is sent in the background after the record is
// saved; whatever didn't go out is retried by utils/notificationSweep.js.

// What each person can switch off, and who it concerns
const CATEGORIES = {
  requests: ['manager', 'admin'], // requests waiting for their review
  team: ['manager', 'admin'], // a team member checked in late
  decisions: ['employee'], // the answer to their own requests
  attendance: ['employee'], // their record or schedule changed
  reminders: ['employee'], // check in / check out
  announcements: ['employee', 'manager', 'admin'], // messages from the administration
};

// Every kind of notification. `push` is the only text a push message carries:
// a generic line without names, times or decisions (lock screens are public).
const TYPES = {
  'timeLeave.requested': { category: 'requests', push: 'طلب زمنية جديد بانتظار مراجعتك' },
  'timeLeave.cancelled': { category: 'requests', push: 'أُلغي طلب زمنية' },
  'overtime.requested': { category: 'requests', push: 'طلب عمل إضافي جديد بانتظار مراجعتك' },
  'attendance.late': { category: 'team', push: 'تنبيه حضور لأحد أعضاء فريقك' },
  'timeLeave.reviewed': { category: 'decisions', push: 'تمت مراجعة طلب الزمنية' },
  'overtime.reviewed': { category: 'decisions', push: 'تمت مراجعة طلب العمل الإضافي' },
  'attendance.autoClosed': { category: 'attendance', push: 'تحديث على سجل حضورك' },
  'attendance.edited': { category: 'attendance', push: 'تحديث على سجل حضورك' },
  'schedule.changed': { category: 'attendance', push: 'تحديث على جدول دوامك' },
  'reminder.checkIn': { category: 'reminders', push: 'تذكير بتسجيل الحضور', urgency: 'high' },
  'reminder.checkOut': { category: 'reminders', push: 'تذكير بتسجيل الانصراف', urgency: 'high' },
  message: { category: 'announcements', push: 'رسالة جديدة من الإدارة' },
};

const PUSH_BODY = 'افتح التطبيق للاطلاع على التفاصيل.';
const DAY_MS = 24 * 3600e3;
const MAX_PUSH_ATTEMPTS = 3;
const STALE_SENDING_MS = 5 * 60e3;
const READY_RECHECK_MS = 60e3;

const categoriesFor = (role) => Object.keys(CATEGORIES).filter((c) => CATEGORIES[c].includes(role));

// The feature stays off until the migration created its collections and
// indexes (npm run notifications:migrate): nothing is written before that.
// Checked once a minute until it is there.
let ready = false;
let checkedAt = 0;
let checking = null;
const notificationsReady = async () => {
  if (ready) return true;
  if (checking) return checking;
  if (Date.now() - checkedAt < READY_RECHECK_MS) return false;
  checking = (async () => {
    try {
      const found = await Promise.all([
        Notification.collection.indexExists('user_1_key_1'),
        PushSubscription.collection.indexExists('endpoint_1'),
        NotificationPreference.collection.indexExists('_id_'),
      ]);
      ready = found.every(Boolean);
    } catch {
      ready = false; // a collection doesn't exist yet
    }
    checkedAt = Date.now();
    checking = null;
    return ready;
  })();
  return checking;
};

// A few at a time, so a message to everyone doesn't open hundreds of requests
const eachLimited = async (items, limit, fn) => {
  let next = 0;
  const worker = async () => {
    while (next < items.length) await fn(items[next++]);
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
};

const pushPayload = (n) => ({
  title: TYPES[n.type]?.push || 'إشعار جديد',
  body: PUSH_BODY,
  url: n.link || '/',
  tag: n.category,
});

// Sends the push message of each notification that is due, once: a
// notification is claimed before sending, so two servers (or a retry) never
// send it twice.
const deliverPush = async (ids) => {
  if (!ids.length || !pushConfigured()) return;
  await eachLimited(ids, 4, async (id) => {
    try {
      const now = new Date();
      const n = await Notification.findOneAndUpdate(
        { _id: id, 'push.state': 'pending', availableAt: { $lte: now } },
        { $set: { 'push.state': 'sending', 'push.at': now }, $inc: { 'push.attempts': 1 } },
        { new: true }
      ).lean();
      if (!n) return;
      let state;
      if (n.push.until && n.push.until <= now) {
        state = 'expired';
      } else {
        const until = n.push.until ? n.push.until.getTime() : now.getTime() + DAY_MS;
        const result = await sendToUser(n.user, pushPayload(n), {
          ttl: Math.min(DAY_MS, until - now.getTime()) / 1000,
          urgency: TYPES[n.type]?.urgency || 'normal',
          topic: n.category, // the push service keeps only the latest per category
        });
        if (result.sent) state = 'sent';
        else if (!result.total) state = 'none';
        else state = result.retry && n.push.attempts < MAX_PUSH_ATTEMPTS ? 'pending' : 'failed';
      }
      await Notification.updateOne({ _id: id, 'push.state': 'sending' }, { $set: { 'push.state': state, 'push.at': new Date() } });
    } catch (err) {
      logger.warn(`Push delivery failed: ${err.message}`);
    }
  });
};

// Pushes that are due and not sent yet: a server stopped mid-way, a push
// service was down, or a message that starts on a later day
const retryPendingPush = async () => {
  if (!pushConfigured()) return;
  const stale = new Date(Date.now() - STALE_SENDING_MS);
  await Notification.updateMany(
    { 'push.state': 'sending', 'push.at': { $lt: stale }, 'push.attempts': { $gte: MAX_PUSH_ATTEMPTS } },
    { $set: { 'push.state': 'failed' } }
  );
  await Notification.updateMany({ 'push.state': 'sending', 'push.at': { $lt: stale } }, { $set: { 'push.state': 'pending' } });
  const due = await Notification.find({ 'push.state': 'pending', availableAt: { $lte: new Date() } })
    .select('_id')
    .sort({ availableAt: 1 })
    .limit(100)
    .lean();
  await deliverPush(due.map((d) => d._id));
};

const forRecipient = (value, user) => (typeof value === 'function' ? value(user) : value);

// Records one notification for each recipient (active accounts only, never
// the person who caused it, and not if they switched its category off).
// `key` identifies the event: the same key never notifies a person twice.
// Text and link may be functions of the recipient ({ _id, role }).
// Returns how many new notifications were saved.
const notify = async ({ to, type, key, title, body = '', link = null, actor = null, availableAt = null, pushUntil = null }) => {
  try {
    if (!(await notificationsReady())) return 0;
    const spec = TYPES[type];
    if (!spec) throw new Error(`unknown notification type "${type}"`);
    const ids = [...new Set((to || []).filter(Boolean).map(String))].filter((id) => !actor || id !== String(actor));
    if (!ids.length) return 0;

    const [users, prefs] = await Promise.all([
      User.find({ _id: { $in: ids }, isActive: true }).select('role').lean(),
      NotificationPreference.find({ _id: { $in: ids } }).lean(),
    ]);
    const prefsOf = new Map(prefs.map((p) => [String(p._id), p]));
    const now = new Date();
    const at = availableAt && availableAt > now ? availableAt : now;
    const until = pushUntil || new Date(at.getTime() + DAY_MS);
    const canPush = pushConfigured();

    const ops = [];
    for (const user of users) {
      const pref = prefsOf.get(String(user._id));
      if (pref?.off?.includes(spec.category)) continue;
      const pushOn = canPush && !pref?.pushOff?.includes(spec.category);
      const doc = {
        user: user._id,
        type,
        category: spec.category,
        title: String(forRecipient(title, user)),
        body: String(forRecipient(body, user) || ''),
        link: forRecipient(link, user) || null,
        key,
        availableAt: at,
        readAt: null,
        push: { state: pushOn ? 'pending' : 'off', until, attempts: 0 },
        createdAt: now,
        updatedAt: now,
      };
      ops.push({ updateOne: { filter: { user: user._id, key }, update: { $setOnInsert: doc }, upsert: true } });
    }
    if (!ops.length) return 0;

    let upserted = {};
    try {
      upserted = (await Notification.collection.bulkWrite(ops, { ordered: false })).upsertedIds || {};
    } catch (err) {
      // Two requests saved the same event at once: the other one counts
      const errors = err.writeErrors ? [].concat(err.writeErrors) : [];
      if (!errors.length || errors.some((e) => e.code !== 11000)) throw err;
      upserted = err.result?.upsertedIds || err.result?.result?.upsertedIds || {};
    }
    const fresh = Object.values(upserted);
    if (fresh.length && canPush) {
      deliverPush(fresh).catch((err) => logger.warn(`Push delivery failed: ${err.message}`));
    }
    return fresh.length;
  } catch (err) {
    logger.warn(`Notification "${type}" not saved: ${err.message}`);
    return 0;
  }
};

// Runs a clean-up only once the feature is set up; never throws
const whenReady = async (label, fn) => {
  try {
    if (await notificationsReady()) await fn();
  } catch (err) {
    logger.warn(`Notification clean-up (${label}) failed: ${err.message}`);
  }
};

module.exports = {
  CATEGORIES,
  TYPES,
  categoriesFor,
  notificationsReady,
  notify,
  deliverPush,
  retryPendingPush,
  whenReady,
};
