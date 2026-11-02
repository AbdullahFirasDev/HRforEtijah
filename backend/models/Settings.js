const mongoose = require('mongoose');

// System-wide settings an admin manages from the dashboard. A single
// document (_id "app") holds them.
const settingsSchema = new mongoose.Schema(
  {
    _id: { type: String, default: 'app' },
    // Office geofence (see utils/geofence.js). Until an admin saves it the
    // GEOFENCE_* environment variables apply.
    geofence: {
      enabled: { type: Boolean },
      lat: { type: Number },
      lng: { type: Number },
      radius: { type: Number },
      maxAccuracy: { type: Number },
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      updatedAt: { type: Date },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Settings', settingsSchema);
