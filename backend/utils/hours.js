const STANDARD_SHIFT_HOURS = Number(process.env.STANDARD_SHIFT_HOURS) || 8;

// Returns total worked hours (rounded to 2 decimals) between two Date objects.
const calculateHours = (punchInTime, punchOutTime) => {
  const ms = new Date(punchOutTime) - new Date(punchInTime);
  const hours = ms / (1000 * 60 * 60);
  return Math.max(0, Math.round(hours * 100) / 100);
};

const deriveStatus = (totalHours, targetHours = STANDARD_SHIFT_HOURS) => {
  return totalHours >= targetHours ? 'Completed' : 'Incomplete';
};

module.exports = { calculateHours, deriveStatus, STANDARD_SHIFT_HOURS };
