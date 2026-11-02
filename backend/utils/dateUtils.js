// The office's timezone decides which calendar day a punch belongs to.
// Cloud hosts run in UTC, so "today" must not come from the server clock.
// Set APP_TIMEZONE (an IANA name such as Asia/Riyadh) for another office.
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Baghdad';

// Returns "today" as YYYY-MM-DD in the office's timezone
const todayLocal = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: APP_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(new Date());
  const map = Object.fromEntries(parts.map((p) => [p.type, p.value]));
  return `${map.year}-${map.month}-${map.day}`;
};

module.exports = { todayLocal, APP_TIMEZONE };
