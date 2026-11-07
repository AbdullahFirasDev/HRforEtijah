/* Push messages for Etijah HR. Imported into the service worker that
   vite-plugin-pwa generates (workbox.importScripts in vite.config.js), so the
   app's offline caching stays exactly as it is.

   A push message carries only a generic line and the page to open (no names,
   times or decisions): the details are read in the app after signing in. */

const FALLBACK_TITLE = 'الاتجاه — إشعار جديد';
const FALLBACK_BODY = 'افتح التطبيق للاطلاع على التفاصيل.';

// Only pages of this app, never another site
const appPath = (url) => (typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : '/');

const appWindows = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true });

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = {};
  }
  const url = appPath(data.url);
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(String(data.title || FALLBACK_TITLE), {
        body: String(data.body || FALLBACK_BODY),
        icon: '/pwa-192x192.png',
        lang: 'ar',
        dir: 'rtl',
        // One per kind on the lock screen; a newer one replaces it
        tag: String(data.tag || 'etijah'),
        renotify: true,
        data: { url },
      }),
      // An open app refreshes its notification count right away
      appWindows().then((list) => list.forEach((client) => client.postMessage({ type: 'etijah:push' }))),
    ])
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = appPath(event.notification.data && event.notification.data.url);
  event.waitUntil(
    appWindows().then((list) => {
      const client = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (client) {
        // The open app moves to the page itself, without reloading (a check-in
        // in progress isn't lost)
        client.postMessage({ type: 'etijah:open', url });
        return client.focus();
      }
      return self.clients.openWindow(url);
    })
  );
});

// The browser replaced the subscription: make a new one now; the app sends it
// to the server the next time it opens (the worker has no sign-in of its own)
self.addEventListener('pushsubscriptionchange', (event) => {
  const options = event.oldSubscription && event.oldSubscription.options;
  if (!options || !options.applicationServerKey) return;
  event.waitUntil(
    self.registration.pushManager
      .subscribe({ userVisibleOnly: true, applicationServerKey: options.applicationServerKey })
      .catch(() => {})
  );
});

// The app asks whether this version of the worker handles push messages
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'etijah:push-ping' && event.ports && event.ports[0]) {
    event.ports[0].postMessage({ ok: true });
  }
});
