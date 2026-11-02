const ApiError = require('./ApiError');
const Settings = require('../models/Settings');

// Office geofence. An admin sets it from the dashboard (Settings.geofence);
// until then the GEOFENCE_* environment variables apply. When the office
// location is known, every punch also records how far from the office it
// was, so managers can see it even with enforcement off.

const ENABLED_VALUES = ['true', '1', 'yes', 'on'];
const DEFAULT_RADIUS = 500;
// Readings vaguer than this can't tell inside from outside (e.g. IP-based
// location on a PC without GPS), so they are refused while enforcing
const DEFAULT_MAX_ACCURACY = 200;

const numberOrNull = (value) => (value === undefined || value === null || value === '' ? null : Number(value));

const fromEnv = () => {
  const lat = numberOrNull(process.env.GEOFENCE_LAT);
  const lng = numberOrNull(process.env.GEOFENCE_LNG);
  return {
    enabled: ENABLED_VALUES.includes(String(process.env.GEOFENCE_ENABLED || '').trim().toLowerCase()),
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    radius: Number(process.env.GEOFENCE_RADIUS_METERS) || DEFAULT_RADIUS,
    maxAccuracy: Number(process.env.GEOFENCE_MAX_ACCURACY_METERS) || DEFAULT_MAX_ACCURACY,
  };
};

// The geofence in force, with where it came from ('settings' or 'env')
const loadGeofence = async () => {
  const doc = await Settings.findById('app').populate('geofence.updatedBy', 'name').lean();
  const saved = doc?.geofence;
  if (!saved?.updatedAt) return { ...fromEnv(), source: 'env' };
  return {
    enabled: !!saved.enabled,
    lat: saved.lat ?? null,
    lng: saved.lng ?? null,
    radius: saved.radius || DEFAULT_RADIUS,
    maxAccuracy: saved.maxAccuracy || DEFAULT_MAX_ACCURACY,
    source: 'settings',
    updatedAt: saved.updatedAt,
    updatedBy: saved.updatedBy?.name || null,
  };
};

// Haversine distance in meters
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

const formatDistance = (meters) => (meters < 1000 ? `${meters} م` : `${(meters / 1000).toFixed(1)} كم`);

// Enforces the geofence when it is on, and returns the location to store
// with the punch. `action` completes the sentence, e.g. "لتسجيل الحضور".
const checkPunchLocation = (fence, { lat, lng, accuracy }, action) => {
  const hasOffice = fence.lat != null && fence.lng != null;
  const distance = hasOffice ? Math.round(distanceInMeters(lat, lng, fence.lat, fence.lng)) : null;

  if (fence.enabled) {
    // Fail closed: a half-configured fence must not let everyone through
    if (!hasOffice) throw new Error('Geofence is enabled but the office location is missing or invalid');
    if (accuracy != null && accuracy > fence.maxAccuracy) {
      throw new ApiError(
        400,
        `تعذر تحديد موقعك بدقة كافية ${action} (الدقة الحالية ± ${formatDistance(Math.round(accuracy))}). شغّل خدمة الموقع الدقيق (GPS) وانتظر قليلاً ثم حاول مرة أخرى.`
      );
    }
    if (distance > fence.radius) {
      throw new ApiError(
        400,
        `أنت خارج النطاق الجغرافي المسموح ${action}: تبعد نحو ${formatDistance(distance)} عن مقر العمل، والمسموح ${formatDistance(fence.radius)}.`
      );
    }
  }

  return { lat, lng, accuracy: accuracy == null ? null : Math.round(accuracy), distance };
};

module.exports = { loadGeofence, checkPunchLocation };
