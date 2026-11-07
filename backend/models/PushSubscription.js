const mongoose = require('mongoose');

// A browser that agreed to receive push messages for a user. A user can have
// several (one per browser/device); a browser belongs to whoever subscribed it
// last. Removed when the browser's push service says it is gone, after
// repeated failures, when the user signs out on it, or when an admin resets
// the user's device. Created by the migration script only (see Notification).
const pushSubscriptionSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    label: { type: String, default: null }, // e.g. "Chrome على Android"
    failures: { type: Number, default: 0 },
    lastSuccessAt: { type: Date, default: null },
  },
  { timestamps: true, autoCreate: false, autoIndex: false }
);

pushSubscriptionSchema.index({ endpoint: 1 }, { unique: true });
pushSubscriptionSchema.index({ user: 1 });

module.exports = mongoose.model('PushSubscription', pushSubscriptionSchema);
