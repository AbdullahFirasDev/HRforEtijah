// Human-readable date/time helpers in Arabic with Latin digits, so dates, times
// and hours read the same everywhere (no raw ISO "T"/"Z" strings in the UI).

const LOCALE = 'ar-u-nu-latn';

const toDate = (value) => {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const d = new Date(`${value}T00:00:00`);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
};

// e.g. "2025-05-27" (also used for date comparisons, so keep this format)
export const formatDate = (value) => {
  const d = toDate(value);
  if (!d) return '-';
  return d.toLocaleDateString('en-CA');
};

// e.g. "10:00:01 ص"
export const formatTime = (value) => {
  const d = toDate(value);
  if (!d) return '-';
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
};

// e.g. "05:00 م" (no seconds), for times people plan around
export const formatClockTime = (value) => {
  const d = toDate(value);
  if (!d) return '-';
  return d.toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: true });
};

// e.g. "2025-05-27 10:00:01 ص"
export const formatDateTime = (value) => {
  const d = toDate(value);
  if (!d) return '-';
  return `${formatDate(d)} ${formatTime(d)}`;
};

// e.g. "27 مايو 2025" - used for friendlier prose/labels
export const formatDateLong = (value) => {
  const d = toDate(value);
  if (!d) return '-';
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'long', year: 'numeric' });
};

// e.g. "الثلاثاء، 27 مايو 2025"
export const formatDayLong = (value) => {
  const d = toDate(value);
  if (!d) return '-';
  return d.toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
};

// e.g. "مايو 2025"
export const formatMonthYear = (year, month) =>
  new Date(year, month - 1, 1).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });

// e.g. "8.5 س" (س = ساعة)
export const formatHours = (value) => `${value || 0} س`;

// A wall-clock "HH:mm" (working hours), e.g. "09:00 ص"
export const formatClock = (hhmm) => {
  if (!hhmm) return '-';
  const [h, m] = hhmm.split(':').map(Number);
  return new Date(2000, 0, 1, h, m).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit', hour12: true });
};

// e.g. "45 د", "1 س 15 د"
export const formatMinutes = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} د`;
  return m ? `${h} س ${m} د` : `${h} س`;
};

// A running timer, e.g. "01:05:09"
export const formatTimer = (ms) => {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return [seconds / 3600, (seconds % 3600) / 60, seconds % 60]
    .map((part) => String(Math.floor(part)).padStart(2, '0'))
    .join(':');
};

// e.g. "350 م", "2.4 كم"
export const formatDistance = (meters) => (meters < 1000 ? `${meters} م` : `${(meters / 1000).toFixed(1)} كم`);

export const todayStr = () => new Date().toLocaleDateString('en-CA');
