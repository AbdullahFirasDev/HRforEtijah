const STANDARD_SHIFT_HOURS = Number(process.env.STANDARD_SHIFT_HOURS) || 8;

// Returns total worked hours (rounded to 2 decimals) between two Date objects.
const calculateHours = (punchInTime, punchOutTime) => {
  const ms = new Date(punchOutTime) - new Date(punchInTime);
  const hours = ms / (1000 * 60 * 60);
  return Math.max(0, Math.round(hours * 100) / 100);
};

const deriveStatus = (totalHours) => {
  return totalHours >= STANDARD_SHIFT_HOURS ? 'Completed' : 'Incomplete';
};

// Haversine distance in meters, used for optional geofencing.
const distanceInMeters = (lat1, lng1, lat2, lng2) => {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

const isWithinGeofence = (lat, lng) => {
  if (process.env.GEOFENCE_ENABLED !== 'true') return true;
  const centerLat = Number(process.env.GEOFENCE_LAT);
  const centerLng = Number(process.env.GEOFENCE_LNG);
  const radius = Number(process.env.GEOFENCE_RADIUS_METERS) || 500;
  const dist = distanceInMeters(lat, lng, centerLat, centerLng);
  return dist <= radius;
};

module.exports = { calculateHours, deriveStatus, isWithinGeofence, STANDARD_SHIFT_HOURS };
