const IST_TIMEZONE = 'Asia/Kolkata';

// Returns "today" as YYYY-MM-DD in India Standard Time, regardless of the
// server host's own timezone (most cloud hosts run in UTC, and using
// toISOString() there shifts the calendar day for anything punched in
// before 5:30 AM IST onto the previous date).
const todayIST = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: IST_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

module.exports = { todayIST, IST_TIMEZONE };
