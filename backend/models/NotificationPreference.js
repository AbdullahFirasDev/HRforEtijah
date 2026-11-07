const mongoose = require('mongoose');

// What a user switched off (everything is on by default): categories they
// don't want in the app at all, and categories they want in the app but not
// as push messages. _id is the user's id. Created by the migration script only
// (see Notification).
const notificationPreferenceSchema = new mongoose.Schema(
  {
    _id: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    off: { type: [String], default: [] },
    pushOff: { type: [String], default: [] },
  },
  { timestamps: true, autoCreate: false, autoIndex: false }
);

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
