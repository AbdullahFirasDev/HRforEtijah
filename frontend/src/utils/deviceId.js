// A random ID for this browser / installed app, kept in localStorage. The
// server ties each account to the first device ID it signs in with, so it is
// never cleared on logout.
const KEY = 'deviceId';
let memoryId = null;

const newId = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');

export function getDeviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      id = newId();
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    // Storage blocked (some private modes): this visit only
    memoryId = memoryId || newId();
    return memoryId;
  }
}
