import { formatClock } from './format';

// Days of the week as stored by the API (0 = Sunday … 6 = Saturday). The
// list starts on Sunday so a Friday–Saturday weekend reads "الجمعة، السبت".
export const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEK_ORDER = [0, 1, 2, 3, 4, 5, 6];

// Mirrors MAX_SESSIONS_PER_DAY in backend/utils/schedule.js
export const MAX_SESSIONS_PER_DAY = 6;

export const dayNamesText = (days = []) =>
  WEEK_ORDER.filter((d) => days.includes(d))
    .map((d) => DAY_NAMES[d])
    .join('، ');

// e.g. "09:00 ص – 05:00 م", or null without fixed hours
export const hoursText = (schedule) =>
  schedule?.start && schedule?.end ? `${formatClock(schedule.start)} – ${formatClock(schedule.end)}` : null;

export const EMPTY_WORK_FORM = { start: '', end: '', offDays: [], allowMultiple: false };

export const workFormFrom = (user) => ({
  start: user?.workSchedule?.start || '',
  end: user?.workSchedule?.end || '',
  offDays: user?.weeklyOffDays || [],
  allowMultiple: !!user?.allowMultiplePunches,
});

// The admin enters wall-clock hours, so the server reads them in the admin's
// own timezone (the office's) when measuring lateness.
export const workPayload = (form) => ({
  workSchedule: {
    start: form.start || null,
    end: form.end || null,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  weeklyOffDays: form.offDays,
  allowMultiplePunches: form.allowMultiple,
});
