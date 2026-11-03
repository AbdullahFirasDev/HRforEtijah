// The office's timezone decides which calendar day a punch belongs to.
// Cloud hosts run in UTC, so "today" must not come from the server clock.
// Set APP_TIMEZONE (an IANA name such as Asia/Riyadh) for another office.
const APP_TIMEZONE = process.env.APP_TIMEZONE || 'Asia/Baghdad';

const zonedParts = (instant, timeZone) =>
  Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(instant)
      .map((p) => [p.type, p.value])
  );

// YYYY-MM-DD of an instant in the office's timezone
const localDate = (instant, timeZone = APP_TIMEZONE) => {
  const p = zonedParts(instant, timeZone);
  return `${p.year}-${p.month}-${p.day}`;
};

// Returns "today" as YYYY-MM-DD in the office's timezone
const todayLocal = () => localDate(new Date());

// Minutes since local midnight of an instant in the given timezone
const localMinutes = (instant, timeZone = APP_TIMEZONE) => {
  const p = zonedParts(instant, timeZone);
  return Number(p.hour) * 60 + Number(p.minute);
};

// The instant a wall-clock "HH:mm" (or "24:00") happens on a date in a timezone
const zonedInstant = (date, hhmm, timeZone = APP_TIMEZONE) => {
  const [y, mo, d] = date.split('-').map(Number);
  const [h, mi] = hhmm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  const p = zonedParts(new Date(guess), timeZone);
  const seenAsUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return new Date(guess - (seenAsUtc - guess));
};

// Last moment of a calendar day in the office's timezone
const endOfLocalDay = (date) => new Date(zonedInstant(date, '24:00').getTime() - 1000);

// YYYY-MM-DD shifted by whole days
const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 864e5).toISOString().slice(0, 10);

// Wall-clock time of an instant for messages, e.g. "5:00 م"
const clockText = (instant, timeZone = APP_TIMEZONE) =>
  new Intl.DateTimeFormat('ar-u-nu-latn', { timeZone, hour: 'numeric', minute: '2-digit' }).format(instant);

module.exports = { APP_TIMEZONE, todayLocal, localDate, localMinutes, zonedInstant, endOfLocalDay, addDays, clockText };
