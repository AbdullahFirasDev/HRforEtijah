// Coordinates helpers for the office geofence settings.

const ARABIC_DIGITS = /[٠-٩]/g;

// Reads "33.3152, 44.3661" (also with Arabic digits/comma) or a Google Maps
// link, and returns { lat, lng } or null.
export const parseCoords = (text) => {
  const s = String(text || '')
    .replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/٫/g, '.');
  // Place links carry the exact pin as !3d<lat>!4d<lng>
  const m = s.match(/!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/) || s.match(/(-?\d+(?:\.\d+)?)\s*[,،]\s*(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  if (!(Math.abs(lat) <= 90 && Math.abs(lng) <= 180)) return null;
  return { lat, lng };
};

export const coordsInput = ({ lat, lng }) => `${lat.toFixed(6)}, ${lng.toFixed(6)}`;

// Haversine distance in meters (same formula as the server)
export const distanceMeters = (a, b) => {
  const R = 6371000;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)));
};

export const googleMapsUrl = ({ lat, lng }) => `https://www.google.com/maps?q=${lat},${lng}`;

// OpenStreetMap embed centred on the office, wide enough to show the radius
export const mapEmbedUrl = ({ lat, lng }, radius) => {
  const dLat = (Math.max(radius, 100) * 2.2) / 111320;
  const dLng = dLat / Math.cos((lat * Math.PI) / 180);
  const bbox = [lng - dLng, lat - dLat, lng + dLng, lat + dLat].map((n) => n.toFixed(6)).join(',');
  return `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${lat},${lng}`;
};
