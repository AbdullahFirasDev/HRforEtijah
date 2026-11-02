import { formatClock, formatHours } from './format';

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

// Length of a working day from "HH:mm" to "HH:mm", e.g. 8.5
export const clockHours = (start, end) => {
  const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  return Math.round(((minutes(end) - minutes(start)) / 60) * 100) / 100;
};

// The form holds all seven days: off, or working with optional hours
export const EMPTY_WORK_FORM = {
  days: WEEK_ORDER.map((day) => ({ day, off: false, start: '', end: '' })),
  allowMultiple: false,
};

export const workFormFrom = (user) => {
  const hours = user?.workSchedule?.days || [];
  const off = user?.weeklyOffDays || [];
  return {
    days: WEEK_ORDER.map((day) => {
      const fixed = hours.find((d) => d.day === day);
      return { day, off: off.includes(day), start: fixed?.start || '', end: fixed?.end || '' };
    }),
    allowMultiple: !!user?.allowMultiplePunches,
  };
};

// The admin enters wall-clock hours, so the server reads them in the admin's
// own timezone (the office's) when measuring lateness.
export const workPayload = (form) => ({
  workSchedule: {
    days: form.days.filter((d) => !d.off && d.start && d.end).map(({ day, start, end }) => ({ day, start, end })),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  weeklyOffDays: form.days.filter((d) => d.off).map((d) => d.day),
  allowMultiplePunches: form.allowMultiple,
});

const weeklyTotal = (days) =>
  Math.round(days.reduce((sum, d) => sum + (d.start && d.end && d.end > d.start ? clockHours(d.start, d.end) : 0), 0) * 100) / 100;

export const formWeeklyTotal = (form) => weeklyTotal(form.days.filter((d) => !d.off));

// One line per day, e.g. "الأحد: 09:00 ص – 05:00 م" / "الجمعة: إجازة"
export const weekLines = ({ days = [], off = [] }) =>
  WEEK_ORDER.map((day) => {
    const fixed = days.find((d) => d.day === day);
    const text = off.includes(day) ? 'إجازة' : hoursText(fixed) || 'دوام مرن (بلا ساعات محددة)';
    return { day, name: DAY_NAMES[day], text, off: off.includes(day) };
  });

// Users-table summary of someone's week
export const scheduleSummary = (user) => {
  const days = user.workSchedule?.days || [];
  const off = user.weeklyOffDays || [];
  const offText = off.length ? `الإجازة: ${dayNamesText(off)}` : 'بلا يوم إجازة';
  const same = days.length && days.every((d) => d.start === days[0].start && d.end === days[0].end);
  return {
    hours: !days.length ? 'بدون دوام ثابت' : same ? hoursText(days[0]) : 'دوام متغير حسب اليوم',
    details: [days.length ? `${formatHours(weeklyTotal(days))} أسبوعياً` : null, offText, user.allowMultiplePunches && 'حضور متعدد']
      .filter(Boolean)
      .join(' · '),
    breakdown: weekLines({ days, off })
      .map((l) => `${l.name}: ${l.text}`)
      .join('\n'),
  };
};
