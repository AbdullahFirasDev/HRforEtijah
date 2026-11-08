const mongoose = require('mongoose');

// Running numbers, one document per sequence (e.g. "leaveRequest:2026").
// Created by the leaves migration script only (npm run leaves:migrate).
const counterSchema = new mongoose.Schema(
  {
    _id: { type: String },
    seq: { type: Number, default: 0 },
  },
  { versionKey: false, autoCreate: false, autoIndex: false }
);

counterSchema.statics.next = async function next(name) {
  const doc = await this.findOneAndUpdate({ _id: name }, { $inc: { seq: 1 } }, { upsert: true, new: true }).lean();
  return doc.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
