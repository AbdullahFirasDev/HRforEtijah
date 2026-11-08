const mongoose = require('mongoose');

// A supporting document for a leave request (PDF or photo), stored in the
// database so the app needs no file service. A file uploaded while the
// employee is still filling the form is a draft: it belongs to nobody's
// request yet and is deleted automatically after a day unless a request
// claims it. Created by the migration script only (npm run leaves:migrate).
const leaveAttachmentSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    request: { type: mongoose.Schema.Types.ObjectId, ref: 'LeaveRequest', default: null },
    name: { type: String, required: true },
    type: { type: String, required: true }, // checked against the file's first bytes
    size: { type: Number, required: true },
    data: { type: Buffer, required: true },
    // Drafts only: removed by MongoDB after this moment
    draftExpiresAt: { type: Date },
  },
  { timestamps: true, autoCreate: false, autoIndex: false }
);

leaveAttachmentSchema.index({ request: 1 });
leaveAttachmentSchema.index({ owner: 1, request: 1 });
leaveAttachmentSchema.index({ draftExpiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LeaveAttachment', leaveAttachmentSchema);
