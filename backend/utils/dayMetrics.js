const { APP_TIMEZONE, localMinutes, zonedInstant } = require('./dateUtils');
const { planShifts, targetHours, toMinutes } = require('./schedule');

// How one day went, worked out from time intervals: the planned work periods
// (shifts), the time the employee was checked in, and the windows of their
// approved time leaves (زمنيات). Pure: used both to save a record's totals
// (utils/attendanceDay.js recalcDay) and to build the monthly sheet live
// from the punches (utils/timesheet.js), so old records are always counted
// by the current rules.
//
// Every minute of a planned period the employee wasn't checked in is a hole:
//   late   before the first check-in of the period (also: coming back
//          later than a time leave allowed)
//   early  after the last check-out of the period
//   gap    stepping out in the middle of the period without a time leave
//   missed a whole period with no check-in at all
// The part of a hole inside an approved time leave is excused, whatever the
// leave's type and whether or not the employee confirmed it in the app.
// Every minute worked outside the planned periods is a plus:
//   earlyArrival  before the start of the period the check-in belongs to
//   overtime      everything else (after the end, between periods, days off)
//
// So, for a finished day:  worked + excused − target
//   = earlyArrival + overtime − late − earlyLeave − short
// (short = gaps + missed periods, or the hours missing on a flexible day),
// which is the day's balance (الفرق).

const MINUTE = 60e3;

const tzOf = (plan) => plan?.timezone || APP_TIMEZONE;
const overlap = (a0, a1, b0, b1) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0));
const toMin = (ms) => Math.round(ms / MINUTE);
const leaveLength = (l) => Math.max(0, toMinutes(l.to) - toMinutes(l.from));

// Sorted, non-overlapping copy of [start, end] intervals
const merge = (list) => {
  const sorted = list.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of sorted) {
    const last = out[out.length - 1];
    if (last && a <= last[1]) last[1] = Math.max(last[1], b);
    else out.push([a, b]);
  }
  return out;
};

const clockOf = (ms, tz) => {
  const m = localMinutes(new Date(ms), tz);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};

const periodsOf = (sessions) =>
  (sessions || [])
    .filter((s) => s.punchIn?.time)
    .map((s) => ({ in: +new Date(s.punchIn.time), out: s.punchOut?.time ? +new Date(s.punchOut.time) : null }));

const empty = () => ({
  workedMinutes: 0,
  targetMinutes: 0,
  earlyArrivalMinutes: 0,
  lateMinutes: 0,
  earlyLeaveMinutes: 0,
  overtimeMinutes: 0,
  gapMinutes: 0,
  missedMinutes: 0,
  shortMinutes: 0,
  excusedMinutes: 0,
  balanceMinutes: 0,
  // Unexcused holes, for an admin to turn into a time leave
  uncovered: [],
});

// `sessions`: the day's check-in/out pairs; `leaves`: its approved time
// leaves; `now`: holes of periods that haven't started yet aren't counted
const dayMetrics = ({ date, plan, sessions, leaves = [], now = Date.now() }) => {
  const m = empty();
  const periods = periodsOf(sessions);
  const workedMs = periods.reduce((sum, p) => sum + (p.out != null ? Math.max(0, p.out - p.in) : 0), 0);
  m.workedMinutes = toMin(workedMs);
  m.targetMinutes = Math.round(targetHours(plan) * 60);

  // A day off: everything worked is extra
  if (plan?.dayOff) {
    m.targetMinutes = 0;
    m.overtimeMinutes = m.workedMinutes;
    m.balanceMinutes = m.overtimeMinutes;
    return m;
  }

  const shifts = planShifts(plan);
  // No fixed hours: only the day's total counts. A time leave fills a
  // shortfall but never makes overtime.
  if (!shifts.length) {
    const missing = Math.max(0, m.targetMinutes - m.workedMinutes);
    m.excusedMinutes = Math.min(missing, leaves.reduce((sum, l) => sum + leaveLength(l), 0));
    m.overtimeMinutes = Math.max(0, m.workedMinutes - m.targetMinutes);
    m.shortMinutes = missing - m.excusedMinutes;
    m.balanceMinutes = m.overtimeMinutes - m.shortMinutes;
    return m;
  }

  const tz = tzOf(plan);
  const shiftIv = shifts.map((s) => [+zonedInstant(date, s.start, tz), +zonedInstant(date, s.end, tz)]);
  const leaveIv = merge(leaves.map((l) => [+zonedInstant(date, l.from, tz), +zonedInstant(date, l.to, tz)]));
  // A period still open covers the rest of the day
  const cover = merge(periods.map((p) => [p.in, p.out ?? Infinity]));
  const excusedIn = (a, b) => leaveIv.reduce((sum, [x, y]) => sum + overlap(a, b, x, y), 0);
  const bucket = { late: 0, early: 0, gap: 0, missed: 0 };
  let excusedMs = 0;

  shiftIv.forEach(([s, e]) => {
    const inside = merge(cover.map(([a, b]) => [Math.max(a, s), Math.min(b, e)]));
    const holes = [];
    if (!inside.length) {
      if (s < now) holes.push([s, e, 'missed']);
    } else {
      if (inside[0][0] > s) holes.push([s, inside[0][0], 'late']);
      for (let k = 1; k < inside.length; k++) holes.push([inside[k - 1][1], inside[k][0], 'gap']);
      const lastEnd = inside[inside.length - 1][1];
      if (lastEnd < e) holes.push([lastEnd, e, 'early']);
    }
    for (const [a, b, kind] of holes) {
      const excused = excusedIn(a, b);
      const left = b - a - excused;
      // Back later than a leave allowed: that's lateness, not a free gap
      const counted = kind === 'gap' && excused > 0 ? 'late' : kind;
      excusedMs += excused;
      bucket[counted] += left;
      if (left >= MINUTE) {
        m.uncovered.push({ kind: counted, from: clockOf(a, tz), to: clockOf(b, tz), minutes: toMin(left), excused: toMin(excused) });
      }
    }
  });

  // Time worked outside the planned periods
  let earlyMs = 0;
  let outsideMs = 0;
  for (const p of periods) {
    const end = p.out ?? Math.max(p.in, now);
    const next = shiftIv.find(([, e]) => e > p.in);
    const early = next && p.in < next[0] ? Math.max(0, Math.min(end, next[0]) - p.in) : 0;
    earlyMs += early;
    // Overtime only once the period is closed
    if (p.out != null) {
      const inShifts = shiftIv.reduce((sum, [s, e]) => sum + overlap(p.in, p.out, s, e), 0);
      outsideMs += Math.max(0, p.out - p.in - inShifts - early);
    }
  }

  m.earlyArrivalMinutes = toMin(earlyMs);
  m.overtimeMinutes = toMin(outsideMs);
  m.lateMinutes = toMin(bucket.late);
  m.earlyLeaveMinutes = toMin(bucket.early);
  m.gapMinutes = toMin(bucket.gap);
  m.missedMinutes = toMin(bucket.missed);
  m.shortMinutes = m.gapMinutes + m.missedMinutes;
  m.excusedMinutes = toMin(excusedMs);
  m.balanceMinutes = m.earlyArrivalMinutes + m.overtimeMinutes - m.lateMinutes - m.earlyLeaveMinutes - m.shortMinutes;
  return m;
};

module.exports = { dayMetrics, leaveLength };
