// Captures the browser's install prompt as early as possible (it fires once,
// usually before any component that wants it has mounted) and shares it.
let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault(); // we show our own Arabic install button instead of the browser's bar
  deferredPrompt = e;
  notify();
});
window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  notify();
});

export const subscribeInstall = (fn) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};
export const getInstallPrompt = () => deferredPrompt;

export async function promptInstall() {
  const prompt = deferredPrompt;
  if (!prompt) return 'unavailable';
  deferredPrompt = null; // a prompt can only be shown once
  notify();
  prompt.prompt();
  const { outcome } = await prompt.userChoice;
  return outcome;
}

export const isStandalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

// iPhone/iPad have no install prompt; the app is added from the Share menu.
export const isIos = () =>
  /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
  (window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1);
