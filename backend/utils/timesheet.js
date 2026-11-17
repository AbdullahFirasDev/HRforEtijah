const { dayPlan, planShifts, samePlan, targetHours, weekdayOf } = require('./schedule');
const { addDays, localDate, zonedInstant } = require('./dateUtils');
const { leaveOn } = require('./leaves');
const { dayMetrics } = require('./dayMetrics');

// Timesheets: one row per calendar day for one employee, with what was
// planned, what happened and the period's totals. Days with a record use the
// plan frozen on it at the first check-in; other days use the employee's
// current schedule. Recorded days whose plan no longer matches the schedule
// are flagged so an admin can recalculate them (utils/attendanceDay.js
// reapplySchedule).

const round2 = (n) => Math.round(n * 100) / 100;

// The sheet doesn't need where each punch happened
const TIMESHEET_FIELDS = '-sessions.punchIn.location -sessions.punchOut.location';

const sessionsOf = (r) => {
  if (r.sessions?.length) return r.sessions;
  return r.punchIn?.time ? [{ punchIn: r.punchIn, punchOut: r.punchOut }] : [];
};

// Day states: present, offWorked (worked on a day off), absent (a working day
// with no check-in), onLeave (مجاز: an approved leave, utils/leaves.js
// leaveOn), off, pending (today, not checked in yet), upcoming (future) and
// beforeJoin (before the account existed). A leave day asks for no hours;
// working on it anyway counts as usual.
//
// Every minute is counted live from the punches and the approved time leaves
// (utils/dayMetrics.js), so the breakdown always adds up:
//   balance = earlyArrival + overtime − late − earlyLeave − short − absent
// Only finished days count in the totals: past days, and today once its last
// work period has ended with nobody checked in.
const buildTimesheet = ({ user, records, overtime, leaves = [], timeLeaves = [], from, to, today, now = Date.now() }) => {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const overtimeByDate = new Map(overtime.map((o) => [o.date, o]));
  const timeLeavesByDate = new Map();
  for (const l of timeLeaves) timeLeavesByDate.set(l.date, [...(timeLeavesByDate.get(l.date) || []), l]);
  const joined = user.createdAt ? localDate(user.createdAt) : from;

  const totals = {
    workingDays: 0,
    presentDays: 0,
    absentDays: 0,
    onLeaveDays: 0,
    offDays: 0,
    targetHours: 0,
    monthTargetHours: 0,
    workedHours: 0,
    earlyArrivalDays: 0,
    earlyArrivalMinutes: 0,
    lateDays: 0,
    lateMinutes: 0,
    earlyLeaveDays: 0,
    earlyLeaveMinutes: 0,
    overtimeDays: 0,
    overtimeMinutes: 0,
    shortDays: 0,
    shortMinutes: 0,
    absentMinutes: 0,
    leaveMinutes: 0,
    timeLeaveCount: 0,
    balanceMinutes: 0,
    overtimeApprovedHours: 0,
    overtimePendingHours: 0,
    missedPunchOuts: 0,
    autoCloses: 0,
    outdatedDays: 0,
    wrongDays: 0,
    todayInProgress: false,
  };

  const days = [];
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const r = byDate.get(date);
    const current = dayPlan(user, date);
    const frozen = r?.schedule?.hours != null;
    const plan = frozen ? r.schedule : current;
    // A recorded day calculated on a different (older) plan than the
    // employee's schedule now, or recorded before plans were kept at all
    const planOutdated = !!r && (!frozen || !samePlan(r.schedule, current));
    const sessions = r ? sessionsOf(r) : [];
    // Check-ins made before the office timezone was fixed could land on the
    // next calendar day
    const wrongDay = !!sessions[0]?.punchIn?.time && localDate(new Date(sessions[0].punchIn.time)) !== date;
    const last = sessions[sessions.length - 1];
    const open = !!last && !last.punchOut?.time;
    // A period still open on a past day was never closed (records from
    // before automatic closing existed)
    const missed = !!r?.missedPunchOut || (open && date < today);
    const autoCloses = sessions.filter((x) => x.punchOut?.auto).length + (open && date < today ? 1 : 0);
    const leave = leaveOn(leaves, date, !!plan.dayOff);
    const dayTimeLeaves = timeLeavesByDate.get(date) || [];
    const approvedTimeLeaves = dayTimeLeaves.filter((l) => l.status === 'Approved');

    let state;
    if (date > today) state = 'upcoming';
    else if (date < joined && !sessions.length) state = 'beforeJoin';
    else if (sessions.length) state = plan.dayOff ? 'offWorked' : 'present';
    else if (leave) state = 'onLeave';
    else if (plan.dayOff) state = 'off';
    else if (date === today) state = 'pending';
    else state = 'absent';

    const tracked = ['present', 'offWorked', 'absent'].includes(state);
    const shifts = planShifts(plan);
    // Today counts once its last work period is over and nobody is checked in
    const lastEnd = shifts.length ? +zonedInstant(date, shifts[shifts.length - 1].end, plan.timezone || undefined) : null;
    const finished = date < today || (!open && !plan.dayOff && lastEnd != null && now >= lastEnd);
    const counted = tracked && finished;
    if (tracked && !finished) totals.todayInProgress = true;

    const metrics = tracked ? dayMetrics({ date, plan, sessions, leaves: approvedTimeLeaves, now }) : null;
    // A day with no check-in at all: its missing hours are absence
    const absentMinutes = state === 'absent' ? metrics.shortMinutes : 0;
    const short = state === 'absent' ? 0 : metrics?.shortMinutes || 0;
    const worked = r?.totalHours || 0;
    const target = tracked ? targetHours(plan) : 0;
    const ot = overtimeByDate.get(date);

    // What the whole period asks for, days still to come included (but not
    // the days of an approved leave, unless worked)
    if (state !== 'beforeJoin' && !(leave && !sessions.length)) totals.monthTargetHours += targetHours(plan);
    if (planOutdated) totals.outdatedDays += 1;
    if (wrongDay) totals.wrongDays += 1;
    if (state === 'present' || state === 'absent') totals.workingDays += 1;
    if (state === 'present' || state === 'offWorked') totals.presentDays += 1;
    if (state === 'absent') totals.absentDays += 1;
    if (state === 'onLeave') totals.onLeaveDays += 1;
    if (state === 'off' || state === 'offWorked') totals.offDays += 1;
    if (missed) totals.missedPunchOuts += 1;
    totals.autoCloses += autoCloses;
    if (ot?.status === 'Approved') totals.overtimeApprovedHours += ot.requestedHours;
    if (ot?.status === 'Pending') totals.overtimePendingHours += ot.requestedHours;

    if (counted) {
      const add = (key, minutes) => {
        if (minutes > 0) {
          totals[`${key}Days`] += 1;
          totals[`${key}Minutes`] += minutes;
        }
      };
      totals.targetHours += target;
      totals.workedHours += worked;
      add('earlyArrival', metrics.earlyArrivalMinutes);
      add('late', metrics.lateMinutes);
      add('earlyLeave', metrics.earlyLeaveMinutes);
      add('overtime', metrics.overtimeMinutes);
      add('short', short);
      totals.absentMinutes += absentMinutes;
      totals.leaveMinutes += metrics.excusedMinutes;
      totals.timeLeaveCount += approvedTimeLeaves.length;
      totals.balanceMinutes += metrics.balanceMinutes;
    }

    days.push({
      date,
      weekday: weekdayOf(date),
      state,
      dayOff: !!plan.dayOff,
      shifts,
      targetHours: target,
      recordId: r?._id || null,
      firstIn: sessions[0]?.punchIn?.time || null,
      lastOut: last?.punchOut?.time || null,
      periods: sessions.length,
      workedHours: worked,
      status: r?.status || null,
      // Part of the totals (false while today is still going on)
      counted,
      earlyArrivalMinutes: metrics?.earlyArrivalMinutes || 0,
      lateMinutes: metrics?.lateMinutes || 0,
      earlyLeaveMinutes: metrics?.earlyLeaveMinutes || 0,
      overtimeMinutes: metrics?.overtimeMinutes || 0,
      shortMinutes: short,
      absentMinutes,
      leaveMinutes: metrics?.excusedMinutes || 0,
      balanceMinutes: metrics?.balanceMinutes || 0,
      // Unexcused time an admin may turn into a time leave
      uncovered: metrics?.uncovered || [],
      autoCloses,
      extended: sessions.some((x) => x.extendedAt || x.extendedUntil),
      missedPunchOut: missed,
      edited: !!r?.edits?.length,
      planOutdated,
      wrongDay,
      currentShifts: planOutdated ? planShifts(current) : undefined,
      currentDayOff: planOutdated ? !!current.dayOff : undefined,
      overtimeRequest: ot ? { id: ot._id, hours: ot.requestedHours, status: ot.status } : null,
      timeLeaves: dayTimeLeaves.map((l) => ({
        id: l._id,
        type: l.type,
        from: l.from,
        to: l.to,
        minutes: l.minutes,
        reason: l.reason,
        status: l.status,
        added: !!l.addedBy,
        edited: !!l.edits?.length,
      })),
      leave: leave
        ? { id: leave._id, number: leave.number, typeName: leave.typeName, paid: leave.policy?.paid !== false }
        : null,
    });
  }

  totals.targetHours = round2(totals.targetHours);
  totals.monthTargetHours = round2(totals.monthTargetHours);
  totals.workedHours = round2(totals.workedHours);
  totals.balanceHours = round2(totals.balanceMinutes / 60);
  totals.overtimeApprovedHours = round2(totals.overtimeApprovedHours);
  totals.overtimePendingHours = round2(totals.overtimePendingHours);
  return { days, totals };
};

module.exports = { TIMESHEET_FIELDS, buildTimesheet };
