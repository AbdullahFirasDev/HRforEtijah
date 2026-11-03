import { formatClock, formatHours } from './format';

// Days of the week as stored by the API (0 = Sunday … 6 = Saturday). The
// list starts on Sunday so a Friday–Saturday weekend reads "الجمعة، السبت".
export const DAY_NAMES = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
export const WEEK_ORDER = [0, 1, 2, 3, 4, 5, 6];

// Mirror MAX_SESSIONS_PER_DAY / MAX_SHIFTS_PER_DAY in backend/utils/schedule.js
export const MAX_SESSIONS_PER_DAY = 6;
export const MAX_SHIFTS_PER_DAY = 3;

export const dayNamesText = (days = []) =>
  WEEK_ORDER.filter((d) => days.includes(d))
    .map((d) => DAY_NAMES[d])
    .join('، ');

// e.g. "09:00 ص – 05:00 م", or null without fixed hours
export const hoursText = (shift) =>
  shift?.start && shift?.end ? `${formatClock(shift.start)} – ${formatClock(shift.end)}` : null;

// A day's work periods, e.g. "09:00 ص – 03:00 م، 05:00 م – 11:00 م"
export const shiftsText = (shifts = []) => shifts.map(hoursText).filter(Boolean).join('، ') || null;

// Length of a work period from "HH:mm" to "HH:mm", e.g. 8.5
export const clockHours = (start, end) => {
  const minutes = (hhmm) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
  return Math.round(((minutes(end) - minutes(start)) / 60) * 100) / 100;
};

const complete = (s) => s.start && s.end && s.end > s.start;
const shiftsTotal = (shifts) => shifts.filter(complete).reduce((sum, s) => sum + clockHours(s.start, s.end), 0);

const EMPTY_SHIFT = { start: '', end: '' };

// The form holds all seven days: off, or working with one or more periods
// (a working day whose only period is empty has flexible hours)
export const EMPTY_WORK_FORM = {
  days: WEEK_ORDER.map((day) => ({ day, off: false, shifts: [EMPTY_SHIFT] })),
  allowMultiple: false,
};

export const workFormFrom = (user) => {
  const periods = user?.workSchedule?.days || [];
  const off = user?.weeklyOffDays || [];
  return {
    days: WEEK_ORDER.map((day) => {
      const shifts = periods.filter((p) => p.day === day).map(({ start, end }) => ({ start, end }));
      return { day, off: off.includes(day), shifts: shifts.length ? shifts : [EMPTY_SHIFT] };
    }),
    allowMultiple: !!user?.allowMultiplePunches,
  };
};

// The admin enters wall-clock hours, so the server reads them in the admin's
// own timezone (the office's) when measuring lateness.
export const workPayload = (form) => ({
  workSchedule: {
    days: form.days.flatMap((d) =>
      d.off ? [] : d.shifts.filter((s) => s.start && s.end).map(({ start, end }) => ({ day: d.day, start, end }))
    ),
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  },
  weeklyOffDays: form.days.filter((d) => d.off).map((d) => d.day),
  allowMultiplePunches: form.allowMultiple,
});

export const dayFormHours = (d) => Math.round(shiftsTotal(d.shifts) * 100) / 100;
export const formWeeklyTotal = (form) =>
  Math.round(form.days.filter((d) => !d.off).reduce((sum, d) => sum + shiftsTotal(d.shifts), 0) * 100) / 100;

// One line per day from a week plan [{ day, off, shifts }]
export const weekLines = (week) =>
  week.map(({ day, off, shifts }) => ({
    day,
    name: DAY_NAMES[day],
    off,
    text: off ? 'إجازة' : shiftsText(shifts) || 'دوام مرن (بلا ساعات محددة)',
  }));

// A user's week [{ day, off, shifts }] from their saved settings
export const userWeek = (user) => {
  const periods = user.workSchedule?.days || [];
  const off = user.weeklyOffDays || [];
  return WEEK_ORDER.map((day) => ({
    day,
    off: off.includes(day),
    shifts: periods.filter((p) => p.day === day),
  }));
};

// Users-table summary of someone's week
export const scheduleSummary = (user) => {
  const week = userWeek(user);
  const working = week.filter((d) => !d.off && d.shifts.length);
  const signature = (d) => d.shifts.map((s) => `${s.start}-${s.end}`).join(',');
  const same = working.length && working.every((d) => signature(d) === signature(working[0]));
  const off = user.weeklyOffDays || [];
  const total = Math.round(working.reduce((sum, d) => sum + shiftsTotal(d.shifts), 0) * 100) / 100;
  return {
    hours: !working.length ? 'بدون دوام ثابت' : same ? shiftsText(working[0].shifts) : 'دوام متغير حسب اليوم',
    details: [
      working.length ? `${formatHours(total)} أسبوعياً` : null,
      off.length ? `الإجازة: ${dayNamesText(off)}` : 'بلا يوم إجازة',
      user.allowMultiplePunches && 'حضور متعدد',
    ]
      .filter(Boolean)
      .join(' · '),
    breakdown: weekLines(week)
      .map((l) => `${l.name}: ${l.text}`)
      .join('\n'),
  };
};
