const Settings = require('../models/Settings');
const asyncHandler = require('../utils/asyncHandler');
const { loadGeofence } = require('../utils/geofence');

// @desc  Current office geofence (saved settings, or the server's defaults)
// @route GET /api/settings/geofence
// @access Private (admin)
const getGeofence = asyncHandler(async (req, res) => {
  res.json({ success: true, geofence: await loadGeofence() });
});

// @desc  Admin sets the office location, allowed radius and on/off switch
// @route PUT /api/settings/geofence
// @access Private (admin)
const updateGeofence = asyncHandler(async (req, res) => {
  const { enabled, lat, lng, radius, maxAccuracy } = req.body;
  await Settings.findByIdAndUpdate(
    'app',
    {
      $set: {
        geofence: {
          enabled,
          lat: lat ?? null,
          lng: lng ?? null,
          radius,
          maxAccuracy,
          updatedBy: req.user._id,
          updatedAt: new Date(),
        },
      },
    },
    { upsert: true }
  );
  res.json({ success: true, geofence: await loadGeofence() });
});

module.exports = { getGeofence, updateGeofence };
