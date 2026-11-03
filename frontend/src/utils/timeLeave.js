import { formatClock, formatClockTime, formatMinutes } from './format';

// Time leaves (زمنيات): labels and small helpers shared by the request,
// approval and check-in pages. Mirrors backend/utils/timeLeave.js.

export const LEAVE_TYPES = {
  during: { label: 'خروج والعودة', hint: 'تخرج أثناء الدوام ثم تعود، مثل مراجعة دائرة رسمية' },
  end: { label: 'انصراف قبل نهاية الدوام', hint: 'تغادر قبل نهاية الدوام ولا تعود في اليوم نفسه' },
  start: { label: 'تأخير عن بداية الدوام', hint: 'تصل بعد بداية الدوام بإذن مسبق' },
};

export const MIN_LEAVE_MINUTES = 15;
export const MAX_LEAVE_MINUTES = 240;
// The employee may confirm leaving this long before the leave starts
export const EARLY_DEPARTURE_MINUTES = 15;

export const leaveTypeLabel = (type) => LEAVE_TYPES[type]?.label || type;

export const toMinutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
export const fromMinutes = (m) => {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, m));
  return `${String(Math.floor(clamped / 60)).padStart(2, '0')}:${String(clamped % 60).padStart(2, '0')}`;
};

// e.g. "11:00 ص – 01:00 م (2 س)"
export const leaveTimeText = (l) => `${formatClock(l.from)} – ${formatClock(l.to)} (${formatMinutes(l.minutes)})`;

// What happened on the day, e.g. "خرج 11:05 ص · عاد 12:50 م"
export const leaveUseText = (l) => {
  if (l.type === 'start') return l.status === 'Approved' ? 'تأخير مسموح' : '-';
  if (!l.departedAt) return l.status === 'Approved' ? 'لم يُستخدم بعد' : '-';
  const out = `خرج ${formatClockTime(l.departedAt)}`;
  if (l.type === 'end') return out;
  return l.returnedAt ? `${out} · عاد ${formatClockTime(l.returnedAt)}` : `${out} · لم يسجّل عودته`;
};

// Minutes since local midnight now (the office runs on the browser's clock)
export const nowMinutes = () => {
  const d = new Date();
  return d.getHours() * 60 + d.getMinutes();
};

// The approved leave a check-out right now would start, if any
export const dueDeparture = (leaves = []) => {
  const now = nowMinutes();
  return leaves.find(
    (l) =>
      l.status === 'Approved' &&
      l.type !== 'start' &&
      !l.departedAt &&
      now >= toMinutes(l.from) - EARLY_DEPARTURE_MINUTES &&
      now <= toMinutes(l.to)
  );
};

// The approved "step out" leave the employee hasn't come back from
export const pendingReturn = (leaves = []) =>
  leaves.find((l) => l.status === 'Approved' && l.type === 'during' && l.departedAt && !l.returnedAt);
