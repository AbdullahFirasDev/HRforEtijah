// Human-readable date/time helpers (India-friendly, no raw ISO "T"/"Z" strings anywhere in the UI).

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

// e.g. "2025-05-27"
export const formatDate = (value) => {
  const d = toDate(value);
  if (!d) return '-';
  return d.toLocaleDateString('en-CA');
};

// e.g. "10:00:01 AM"
export const formatTime = (value) => {
  const d = toDate(value);
  if (!d) return '-';
  return d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
};

// e.g. "2025-05-27 10:00:01 AM"
export const formatDateTime = (value) => {
  const d = toDate(value);
  if (!d) return '-';
  return `${formatDate(d)} ${formatTime(d)}`;
};

// e.g. "27 May 2025" - used for friendlier prose/labels
export const formatDateLong = (value) => {
  const d = toDate(value);
  if (!d) return '-';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export const todayStr = () => new Date().toLocaleDateString('en-CA');
