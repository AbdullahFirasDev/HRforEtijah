const Message = require('../models/Message');
const User = require('../models/User');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { todayLocal } = require('../utils/dateUtils');
const notifyEvents = require('../utils/notifyEvents');

const MAX_DAYS = 31;

const addressedTo = (user) => ({ $or: [{ toAll: true }, { recipients: user._id }] });

// @desc  Today's messages the signed-in user hasn't read yet today
// @route GET /api/messages/inbox
// @access Private
const getInbox = asyncHandler(async (req, res) => {
  const today = todayLocal();
  const messages = await Message.find({
    ...addressedTo(req.user),
    from: { $lte: today },
    to: { $gte: today },
    createdBy: { $ne: req.user._id },
    reads: { $not: { $elemMatch: { user: req.user._id, date: today } } },
  })
    .select('title body createdAt createdBy')
    .populate('createdBy', 'name')
    .sort({ createdAt: 1 });

  res.json({
    success: true,
    messages: messages.map((m) => ({
      id: m._id,
      title: m.title,
      body: m.body,
      sender: m.createdBy?.name || null,
      sentAt: m.createdAt,
    })),
  });
});

// @desc  The signed-in user closes a message for today
// @route POST /api/messages/:id/read
// @access Private (people it is addressed to)
const markRead = asyncHandler(async (req, res) => {
  const today = todayLocal();
  const message = await Message.findOne({ _id: req.params.id, ...addressedTo(req.user) }).select('_id');
  if (!message) throw new ApiError(404, 'الرسالة غير موجودة');
  await Message.updateOne(
    { _id: message._id, reads: { $not: { $elemMatch: { user: req.user._id, date: today } } } },
    { $push: { reads: { user: req.user._id, date: today, at: new Date() } } }
  );
  res.json({ success: true });
});

// @desc  Sent messages with who has and hasn't read them
// @route GET /api/messages
// @access Private (admin)
const getMessages = asyncHandler(async (req, res) => {
  const [messages, users] = await Promise.all([
    Message.find().sort({ createdAt: -1 }).limit(100).lean(),
    User.find().select('name isActive').lean(),
  ]);
  const names = new Map(users.map((u) => [String(u._id), u.name]));

  res.json({
    success: true,
    messages: messages.map((m) => {
      const audience = m.toAll
        ? users.filter((u) => u.isActive && String(u._id) !== String(m.createdBy)).map((u) => String(u._id))
        : m.recipients.map(String);
      const lastRead = new Map(m.reads.map((r) => [String(r.user), r.at]));
      const people = audience.map((id) => ({ id, name: names.get(id) || 'مستخدم محذوف', readAt: lastRead.get(id) || null }));
      return {
        id: m._id,
        title: m.title,
        body: m.body,
        from: m.from,
        to: m.to,
        toAll: m.toAll,
        sender: names.get(String(m.createdBy)) || null,
        createdAt: m.createdAt,
        people,
        readCount: people.filter((p) => p.readAt).length,
      };
    }),
  });
});

// @desc  Send a message to everyone or to chosen people
// @route POST /api/messages
// @access Private (admin)
const sendMessage = asyncHandler(async (req, res) => {
  const { title, body, from, to, toAll, recipients = [] } = req.body;
  if (from < todayLocal()) throw new ApiError(400, 'لا يمكن إرسال رسالة ليوم مضى');
  if (to < from) throw new ApiError(400, 'تاريخ النهاية يجب ألا يسبق تاريخ البداية');
  if ((Date.parse(to) - Date.parse(from)) / 864e5 + 1 > MAX_DAYS) {
    throw new ApiError(400, `تظهر الرسالة ${MAX_DAYS} يوماً كحد أقصى`);
  }

  let chosen = [];
  if (!toAll) {
    const found = await User.find({ _id: { $in: recipients }, isActive: true }).select('_id');
    chosen = found.map((u) => u._id);
    if (!chosen.length) throw new ApiError(400, 'اختر موظفاً واحداً على الأقل');
  }

  const message = await Message.create({ title, body, from, to, toAll: !!toAll, recipients: chosen, createdBy: req.user._id });
  await notifyEvents.messageSent(message, req.user);
  res.status(201).json({ success: true, id: message._id });
});

// @desc  Delete a message (it stops appearing for everyone)
// @route DELETE /api/messages/:id
// @access Private (admin)
const deleteMessage = asyncHandler(async (req, res) => {
  const message = await Message.findByIdAndDelete(req.params.id);
  if (!message) throw new ApiError(404, 'الرسالة غير موجودة');
  await notifyEvents.messageDeleted(message._id);
  res.json({ success: true });
});

module.exports = { getInbox, markRead, getMessages, sendMessage, deleteMessage };
