import { isIos, isStandalone } from './installPrompt';

// Push messages on this device (Web Push). The service worker shows them
// (public/push-sw.js); the server only learns this browser's subscription.
// A user turns them on once per device; the choice is remembered for that
// user, so signing in again (sessions end every few minutes) keeps them on,
// while signing out explicitly stops them on this device.

const OPT_IN_PREFIX = 'pushOptIn:';
const SW_TIMEOUT_MS = 10000;
const PING_TIMEOUT_MS = 2000;

export class PushError extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

const optInKey = (userId) => `${OPT_IN_PREFIX}${userId}`;
const readOptIn = (userId) => {
  try {
    return localStorage.getItem(optInKey(userId)) === '1';
  } catch {
    return false;
  }
};
const writeOptIn = (userId, on) => {
  try {
    if (on) localStorage.setItem(optInKey(userId), '1');
    else localStorage.removeItem(optInKey(userId));
  } catch {
    // private mode: it just won't be remembered
  }
};

// 'supported', or why this device can't receive push messages:
//   insecure     the app is opened over plain http (e.g. a LAN address)
//   ios-install  iPhone/iPad: only an app added to the home screen (iOS 16.4+)
//   unsupported  the browser has no Web Push
export const pushSupport = () => {
  if (!window.isSecureContext) return 'insecure';
  if (isIos() && !isStandalone()) return 'ios-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) return 'unsupported';
  return 'supported';
};

export const pushPermission = () => (typeof Notification === 'undefined' ? 'default' : Notification.permission);

const withTimeout = (promise, ms, reason) =>
  Promise.race([promise, new Promise((_, fail) => setTimeout(() => fail(new PushError(reason)), ms))]);

const readyRegistration = async () => {
  const registration = await navigator.serviceWorker.getRegistration();
  if (!registration) throw new PushError('no-sw');
  return withTimeout(navigator.serviceWorker.ready, SW_TIMEOUT_MS, 'no-sw');
};

// The installed service worker answers only if it includes push-sw.js; an
// older version waits for the "update now" button
const handlesPush = (registration) =>
  new Promise((resolve) => {
    const worker = registration.active;
    if (!worker) return resolve(false);
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(false), PING_TIMEOUT_MS);
    channel.port1.onmessage = (event) => {
      clearTimeout(timer);
      resolve(!!event.data?.ok);
    };
    worker.postMessage({ type: 'etijah:push-ping' }, [channel.port2]);
  });

const keyBytes = (base64url) => {
  const base64 = (base64url + '='.repeat((4 - (base64url.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
};

const sameKey = (subscription, publicKey) => {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true; // the browser doesn't say: keep it
  const a = new Uint8Array(current);
  const b = keyBytes(publicKey);
  return a.length === b.length && a.every((v, i) => v === b[i]);
};

// This browser's subscription for the server's key, made if needed
const subscribe = async (registration, publicKey) => {
  let subscription = await registration.pushManager.getSubscription();
  // The server's keys changed: the old subscription can't be used any more
  if (subscription && !sameKey(subscription, publicKey)) {
    await subscription.unsubscribe().catch(() => {});
    subscription = null;
  }
  return subscription || registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(publicKey) });
};

const forServer = (subscription) => {
  const { endpoint, keys } = subscription.toJSON();
  return { endpoint, keys: { p256dh: keys?.p256dh, auth: keys?.auth } };
};

// Turns push on for this user on this device. Call it from a click: browsers
// only ask for permission after a user action. `save` sends the
// subscription to the server (an RTK mutation trigger).
export const enablePush = async ({ userId, publicKey, save }) => {
  const support = pushSupport();
  if (support !== 'supported') throw new PushError(support);
  if (!publicKey) throw new PushError('not-configured');
  // First, before anything asynchronous, or Safari won't show the question
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new PushError(permission === 'denied' ? 'denied' : 'dismissed');
  const registration = await readyRegistration();
  if (!(await handlesPush(registration))) throw new PushError('update-needed');
  const subscription = await subscribe(registration, publicKey);
  await save(forServer(subscription)).unwrap();
  writeOptIn(userId, true);
};

// Turns push off on this device (for whoever is signed in) and tells the server
export const disablePush = async ({ userId, remove }) => {
  writeOptIn(userId, false);
  const registration = await navigator.serviceWorker?.getRegistration();
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) return;
  await Promise.resolve(remove({ endpoint: subscription.endpoint }).unwrap()).catch(() => {});
  await subscription.unsubscribe().catch(() => {});
};

// Signing out: this device stops receiving the user's push messages. The
// choice stays remembered, so they resume when the same user signs in again.
export const stopPushOnSignOut = async (remove) => {
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return;
    await withTimeout(Promise.resolve(remove({ endpoint: subscription.endpoint }).unwrap()), 3000, 'timeout').catch(() => {});
    await subscription.unsubscribe().catch(() => {});
  } catch {
    // signing out never waits on push
  }
};

// This browser's fingerprint in the server's device list (the server sends
// the same short SHA-256 of each endpoint), or null without a subscription
export const currentDeviceKey = async () => {
  try {
    if (pushSupport() !== 'supported') return null;
    const registration = await navigator.serviceWorker.getRegistration();
    const subscription = await registration?.pushManager?.getSubscription();
    if (!subscription) return null;
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint));
    return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0'))
      .join('')
      .slice(0, 16);
  } catch {
    return null;
  }
};

export const pushOptedIn = readOptIn;

// After signing in. If this user turned push on here before, make sure the
// server has this browser's current subscription (it changes from time to
// time, and the server drops ones the push service rejects). Otherwise a
// subscription left here belongs to someone who used this browser before, so
// it is stopped: this device only ever receives the signed-in user's
// messages. Silent.
export const syncPush = async ({ userId, publicKey, save, remove }) => {
  try {
    if (pushSupport() !== 'supported') return;
    const registration = await navigator.serviceWorker.getRegistration();
    if (!registration) return;
    const existing = await registration.pushManager.getSubscription();
    const wanted = readOptIn(userId) && pushPermission() === 'granted';
    if (!wanted) {
      if (existing) {
        await Promise.resolve(remove({ endpoint: existing.endpoint }).unwrap()).catch(() => {});
        await existing.unsubscribe().catch(() => {});
      }
      return;
    }
    if (!publicKey) return; // push is switched off on the server for now
    await withTimeout(navigator.serviceWorker.ready, SW_TIMEOUT_MS, 'no-sw');
    if (!(await handlesPush(registration))) return;
    const subscription = await subscribe(registration, publicKey);
    await save(forServer(subscription)).unwrap();
  } catch {
    // tried again at the next sign-in; the settings screen shows the state
  }
};
