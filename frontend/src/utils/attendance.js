import { formatDistance, formatMinutes } from './format';

// The day's work periods. Records saved before multiple periods existed
// keep their only pair (selfies included) in punchIn/punchOut.
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

// Every selfie of the day with a label, in punch order
export const selfiesOf = (record) => {
  const sessions = sessionsOf(record);
  const numbered = sessions.length > 1;
  return sessions.flatMap((s, i) => {
    const n = numbered ? ` ${i + 1}` : '';
    return [
      s.punchIn?.selfie && { src: s.punchIn.selfie, label: `صورة الحضور${n}` },
      s.punchOut?.selfie && { src: s.punchOut.selfie, label: `صورة الانصراف${n}` },
    ].filter(Boolean);
  });
};

// Punches confirmed by face match keep no photo
export const faceVerifiedOf = (record) => sessionsOf(record).some((s) => s.punchIn?.faceDistance != null);

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
