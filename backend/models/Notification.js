const mongoose = require('mongoose');

// One notification for one person: shown in the app's notification centre and,
// where the person allowed it, sent to their devices as a push message.
//
// The collection and its indexes are created only by the migration script
// (npm run notifications:migrate), never automatically when the app starts:
// the database is shared with the live system. Until then the feature is off
// (see utils/notify.js notificationsReady).
const notificationSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, required: true }, // e.g. timeLeave.requested (see utils/notify.js TYPES)
    category: { type: String, required: true }, // what the person can switch off
    title: { type: String, required: true },
    body: { type: String, default: '' },
    link: { type: String, default: null }, // a page of the app
    // The same event never notifies the same person twice (retries, sweeps)
    key: { type: String, required: true },
    // Hidden until then (a message that starts on a later day)
    availableAt: { type: Date, default: Date.now },
    readAt: { type: Date, default: null },
    push: {
      // pending → sending → sent | none (no device) | failed | expired;
      // off: the person turned push off for this category, or push isn't set up
      state: { type: String, default: 'pending' },
      until: { type: Date }, // not worth sending after this
      attempts: { type: Number, default: 0 },
      at: { type: Date },
    },
  },
  { timestamps: true, autoCreate: false, autoIndex: false }
);

// The history is kept for a year
const KEEP_SECONDS = 365 * 24 * 3600;

notificationSchema.index({ user: 1, key: 1 }, { unique: true });
notificationSchema.index({ user: 1, availableAt: -1 });
notificationSchema.index({ user: 1, readAt: 1, availableAt: 1 });
notificationSchema.index({ 'push.state': 1, availableAt: 1 });
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: KEEP_SECONDS });

module.exports = mongoose.model('Notification', notificationSchema);
