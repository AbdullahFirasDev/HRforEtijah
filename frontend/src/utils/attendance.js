import { formatClockTime, formatDistance, formatMinutes } from './format';

// The day's work periods. Records saved before multiple periods existed
// keep their only pair in punchIn/punchOut.
export const sessionsOf = (record) => {
  if (record?.sessions?.length) return record.sessions;
  return record?.punchIn?.time ? [{ punchIn: record.punchIn, punchOut: record.punchOut }] : [];
};

// Length of a closed period, rounded like the server's totals
export const periodHours = (s) =>
  Math.round(((new Date(s.punchOut.time) - new Date(s.punchIn.time)) / 3600000) * 100) / 100;

export const openSessionOf = (record) => {
  const sessions = sessionsOf(record);
  const last = sessions[sessions.length - 1];
  return last && !last.punchOut?.time ? last : null;
};

export const faceVerifiedOf = (record) => sessionsOf(record).some((s) => s.punchIn?.faceDistance != null);

export const isExtended = (session) => !!(session?.extendedAt || session?.extendedUntil);

// What the employee is doing now, or how their day ended
export const dayState = (record) => {
  const sessions = sessionsOf(record);
  const last = sessions[sessions.length - 1];
  if (last && !last.punchOut?.time) {
    return isExtended(last)
      ? { key: 'extended', text: 'وقت ممدد جارٍ', variant: 'warning' }
      : { key: 'working', text: 'ما زال في الدوام', variant: 'info' };
  }
  if (last?.punchOut?.auto) return { key: 'auto', text: 'انصراف تلقائي', variant: 'danger' };
  if (last?.punchOut?.leave) return { key: 'leave', text: 'خرج بزمنية', variant: 'info' };
  return { key: 'left', text: 'انصرف', variant: 'success' };
};

// Hours so far, counting the period still open
export const runningHours = (record, now) => {
  const open = openSessionOf(record);
  const running = open ? Math.max(0, now - new Date(open.punchIn.time)) / 3600000 : 0;
  return Math.round(((record.totalHours || 0) + running) * 100) / 100;
};

// Minutes past the end of an open extended period
export const runningExtraMinutes = (session, now) =>
  session?.extendedFrom ? Math.max(0, Math.floor((now - new Date(session.extendedFrom)) / 60000)) : 0;

// e.g. "09:00 ص - 03:00 م، 05:00 م - الآن"
export const periodsText = (record) =>
  sessionsOf(record)
    .map((s) => `${formatClockTime(s.punchIn?.time)} - ${s.punchOut?.time ? formatClockTime(s.punchOut.time) : 'الآن'}`)
    .join('، ');

// Badges for anything unusual about the day. Works on attendance records and
// on report rows (which carry sessionsCount and dayOff instead).
export const attendanceNotes = (r) => {
  const periods = r.sessionsCount ?? sessionsOf(r).length;
  return [
    (r.dayOff ?? r.schedule?.dayOff) && { key: 'off', text: 'عمل في يوم إجازة', variant: 'info' },
    r.lateMinutes > 0 && { key: 'late', text: `تأخر ${formatMinutes(r.lateMinutes)}`, variant: 'warning' },
    r.earlyLeaveMinutes > 0 && {
      key: 'early',
      text: `انصراف مبكر ${formatMinutes(r.earlyLeaveMinutes)}`,
      variant: 'warning',
    },
    r.missedPunchOut && { key: 'missed', text: 'انصراف تلقائي', variant: 'danger' },
    sessionsOf(r).some((s) => s.punchOut?.auto && isExtended(s)) && {
      key: 'unclosed',
      text: 'تمديد لم يُغلق',
      variant: 'danger',
    },
    r.overtimeMinutes > 0 && { key: 'overtime', text: `إضافي ${formatMinutes(r.overtimeMinutes)}`, variant: 'info' },
    r.leaveMinutes > 0 && { key: 'leave', text: `زمنية ${formatMinutes(r.leaveMinutes)}`, variant: 'info' },
    (r.edited ?? r.edits?.length > 0) && { key: 'edited', text: 'معدّل يدوياً', variant: 'muted' },
    periods > 1 && { key: 'periods', text: periods === 2 ? 'فترتان' : `${periods} فترات`, variant: 'muted' },
  ].filter(Boolean);
};

export const notesText = (r) =>
  attendanceNotes(r)
    .map((n) => n.text)
    .join('، ');

// e.g. "33.312, 44.361"
export const coordsText = (location) =>
  location?.lat != null ? `${location.lat.toFixed(3)}, ${location.lng.toFixed(3)}` : '-';

// e.g. "40 م من المقر"; empty when the office location isn't configured
export const distanceText = (location) =>
  location?.distance != null ? `${formatDistance(location.distance)} من المقر` : '';

export const locationText = (location) => [coordsText(location), distanceText(location)].filter(Boolean).join(' · ');

// The punch of the day farthest from the office, e.g. a check-out from home
const farthestDistance = (record) => {
  const distances = sessionsOf(record)
    .flatMap((s) => [s.punchIn?.location?.distance, s.punchOut?.location?.distance])
    .filter((d) => d != null);
  return distances.length ? Math.max(...distances) : null;
};

export const farthestText = (record) => {
  const farthest = farthestDistance(record);
  const first = record?.punchIn?.location?.distance;
  return farthest != null && farthest > (first ?? -1) ? `أبعد نقطة: ${formatDistance(farthest)}` : '';
};
