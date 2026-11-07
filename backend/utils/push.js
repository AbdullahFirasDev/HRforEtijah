const webpush = require('web-push');
const PushSubscription = require('../models/PushSubscription');
const logger = require('../config/logger');

// Push messages to the browsers people subscribed (Web Push with VAPID keys).
// Push is optional: without VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY and
// VAPID_SUBJECT nothing is sent and the in-app notification centre works as
// usual. Generate the keys with `npm run vapid-keys`.
//
// A push message never carries personal or attendance details: only a generic
// line for its kind of notification and the page to open. The details stay in
// the app, behind sign-in. Endpoints (they contain device tokens) and payloads
// are never logged.

const SEND_TIMEOUT_MS = 10000;
// A browser that keeps failing (without saying it is gone) is dropped
const MAX_FAILURES = 10;

// The push services of the major browsers. A subscription must point at one
// of them, so the server never posts to an address a user made up (SSRF).
// PUSH_ENDPOINT_HOSTS adds others (comma-separated host names).
const PUSH_HOSTS = [
  'fcm.googleapis.com', // Chrome, Edge on Android, Samsung Internet, Opera
  'android.googleapis.com',
  'push.services.mozilla.com', // Firefox
  'notify.windows.com', // Edge on Windows
  'push.apple.com', // Safari (macOS, iOS 16.4+ home-screen apps)
  ...(process.env.PUSH_ENDPOINT_HOSTS || '')
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean),
];

const isPushEndpoint = (endpoint) => {
  try {
    const url = new URL(endpoint);
    const host = url.hostname.toLowerCase();
    return url.protocol === 'https:' && !url.username && !url.password && PUSH_HOSTS.some((h) => host === h || host.endsWith(`.${h}`));
  } catch {
    return false;
  }
};

let vapid; // undefined: not read yet; null: not configured
const vapidDetails = () => {
  if (vapid !== undefined) return vapid;
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  vapid = null;
  if (!publicKey || !privateKey || !subject) return vapid;
  try {
    // Validates the keys and the subject (mailto: or https:)
    webpush.setVapidDetails(subject, publicKey, privateKey);
    vapid = { subject, publicKey, privateKey };
  } catch (err) {
    logger.warn(`Push notifications are off: invalid VAPID settings (${err.message})`);
  }
  return vapid;
};

const pushConfigured = () => !!vapidDetails();
const pushPublicKey = () => vapidDetails()?.publicKey || null;

// Sends one payload to every browser of a user. Returns how many browsers
// there were, how many got it, and whether a failure is worth retrying.
const sendToUser = async (userId, payload, { ttl = 24 * 3600, urgency = 'normal', topic } = {}) => {
  const details = vapidDetails();
  if (!details) return { total: 0, sent: 0, retry: false };
  const subscriptions = await PushSubscription.find({ user: userId }).lean();
  const body = JSON.stringify(payload);
  let sent = 0;
  let retry = false;

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification({ endpoint: sub.endpoint, keys: sub.keys }, body, {
          TTL: Math.max(0, Math.round(ttl)),
          urgency,
          topic,
          timeout: SEND_TIMEOUT_MS,
          vapidDetails: details,
        });
        sent += 1;
        await PushSubscription.updateOne({ _id: sub._id }, { $set: { failures: 0, lastSuccessAt: new Date() } });
      } catch (err) {
        const status = err.statusCode;
        // The browser unsubscribed or the subscription expired
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
          return;
        }
        logger.warn(`Push to one browser failed${status ? ` (HTTP ${status})` : ` (${err.message})`}`);
        const updated = await PushSubscription.findOneAndUpdate({ _id: sub._id }, { $inc: { failures: 1 } }, { new: true }).lean();
        if (updated && updated.failures >= MAX_FAILURES) await PushSubscription.deleteOne({ _id: sub._id });
        // Rate limits, outages and timeouts may pass; a rejected request won't
        if (!status || status === 429 || status >= 500) retry = true;
      }
    })
  );

  return { total: subscriptions.length, sent, retry };
};

module.exports = { isPushEndpoint, pushConfigured, pushPublicKey, sendToUser };
