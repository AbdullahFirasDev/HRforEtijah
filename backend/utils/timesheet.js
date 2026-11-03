const { dayPlan, planShifts, samePlan, targetHours, weekdayOf } = require('./schedule');
const { addDays, localDate } = require('./dateUtils');

// Timesheets: one row per calendar day for one employee, with what was
// planned, what happened and the period's totals. Days with a record use the
// plan frozen on it at the first check-in; other days use the employee's
// current schedule. Recorded days whose plan no longer matches the schedule
// are flagged so an admin can recalculate them (utils/attendanceDay.js
// reapplySchedule).

const round2 = (n) => Math.round(n * 100) / 100;

// Attendance projection without the (large) selfies
const TIMESHEET_FIELDS =
  '-sessions.punchIn.selfie -sessions.punchOut.selfie -punchIn.selfie -punchOut.selfie -sessions.punchIn.location -sessions.punchOut.location';

const sessionsOf = (r) => {
  if (r.sessions?.length) return r.sessions;
  return r.punchIn?.time ? [{ punchIn: r.punchIn, punchOut: r.punchOut }] : [];
};

// Day states: present, offWorked (worked on a day off), absent (a working day
// with no check-in), off, pending (today, not checked in yet), upcoming
// (future) and beforeJoin (before the account existed). Only the first four
// count in the totals.
const buildTimesheet = ({ user, records, overtime, from, to, today }) => {
  const byDate = new Map(records.map((r) => [r.date, r]));
  const overtimeByDate = new Map(overtime.map((o) => [o.date, o]));
  const joined = user.createdAt ? localDate(user.createdAt) : from;

  const totals = {
    workingDays: 0,
    presentDays: 0,
    absentDays: 0,
    offDays: 0,
    targetHours: 0,
    monthTargetHours: 0,
    workedHours: 0,
    lateDays: 0,
    lateMinutes: 0,
    earlyLeaveDays: 0,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
    leaveMinutes: 0,
    overtimeApprovedHours: 0,
    overtimePendingHours: 0,
    missedPunchOuts: 0,
    outdatedDays: 0,
    wrongDays: 0,
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
    // A period still open on a past day was never closed (records from
    // before automatic closing existed)
    const missed = !!r?.missedPunchOut || (!!last && !last.punchOut?.time && date < today);
    const worked = r?.totalHours || 0;

    let state;
    if (date > today) state = 'upcoming';
    else if (date < joined && !sessions.length) state = 'beforeJoin';
    else if (sessions.length) state = plan.dayOff ? 'offWorked' : 'present';
    else if (plan.dayOff) state = 'off';
    else if (date === today) state = 'pending';
    else state = 'absent';

    const counted = ['present', 'offWorked', 'absent'].includes(state);
    const target = counted ? targetHours(plan) : 0;
    const ot = overtimeByDate.get(date);
    // What the whole period asks for, days still to come included
    if (state !== 'beforeJoin') totals.monthTargetHours += targetHours(plan);
    if (planOutdated) totals.outdatedDays += 1;
    if (wrongDay) totals.wrongDays += 1;

    if (state === 'present' || state === 'absent') totals.workingDays += 1;
    if (state === 'present' || state === 'offWorked') totals.presentDays += 1;
    if (state === 'absent') totals.absentDays += 1;
    if (state === 'off' || state === 'offWorked') totals.offDays += 1;
    totals.targetHours += target;
    totals.workedHours += worked;
    if (r?.lateMinutes > 0) {
      totals.lateDays += 1;
      totals.lateMinutes += r.lateMinutes;
    }
    if (r?.earlyLeaveMinutes > 0) {
      totals.earlyLeaveDays += 1;
      totals.earlyLeaveMinutes += r.earlyLeaveMinutes;
    }
    totals.overtimeMinutes += r?.overtimeMinutes || 0;
    totals.leaveMinutes += r?.leaveMinutes || 0;
    if (missed) totals.missedPunchOuts += 1;
    if (ot?.status === 'Approved') totals.overtimeApprovedHours += ot.requestedHours;
    if (ot?.status === 'Pending') totals.overtimePendingHours += ot.requestedHours;

    days.push({
      date,
      weekday: weekdayOf(date),
      state,
      dayOff: !!plan.dayOff,
      shifts: planShifts(plan),
      targetHours: target,
      recordId: r?._id || null,
      firstIn: sessions[0]?.punchIn?.time || null,
      lastOut: last?.punchOut?.time || null,
      periods: sessions.length,
      workedHours: worked,
      status: r?.status || null,
      lateMinutes: r?.lateMinutes || 0,
      earlyLeaveMinutes: r?.earlyLeaveMinutes || 0,
      overtimeMinutes: r?.overtimeMinutes || 0,
      leaveMinutes: r?.leaveMinutes || 0,
      extended: sessions.some((s) => s.extendedUntil),
      missedPunchOut: missed,
      edited: !!r?.edits?.length,
      planOutdated,
      wrongDay,
      currentShifts: planOutdated ? planShifts(current) : undefined,
      currentDayOff: planOutdated ? !!current.dayOff : undefined,
      overtimeRequest: ot ? { id: ot._id, hours: ot.requestedHours, status: ot.status } : null,
    });
  }

  totals.targetHours = round2(totals.targetHours);
  totals.monthTargetHours = round2(totals.monthTargetHours);
  totals.workedHours = round2(totals.workedHours);
  // Time away on approved time leaves isn't a shortfall
  totals.balanceHours = round2(totals.workedHours + totals.leaveMinutes / 60 - totals.targetHours);
  totals.overtimeApprovedHours = round2(totals.overtimeApprovedHours);
  totals.overtimePendingHours = round2(totals.overtimePendingHours);
  return { days, totals };
};

module.exports = { TIMESHEET_FIELDS, buildTimesheet };
