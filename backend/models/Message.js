const mongoose = require('mongoose');

// A message from an admin, shown as a popup when the people it is addressed
// to open the app: once a day per person, from `from` to `to` (office dates).
const readSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    date: { type: String }, // the day it was read (YYYY-MM-DD)
    at: { type: Date },
  },
  { _id: false }
);

const messageSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    body: { type: String, required: true, trim: true },
    from: { type: String, required: true },
    to: { type: String, required: true },
    // Everyone with an active account, or only `recipients`
    toAll: { type: Boolean, default: false },
    recipients: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    reads: [readSchema],
  },
  { timestamps: true }
);

messageSchema.index({ to: 1, from: 1 });

module.exports = mongoose.model('Message', messageSchema);
