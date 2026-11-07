const User = require('../models/User');
const Notification = require('../models/Notification');
const PushSubscription = require('../models/PushSubscription');
const NotificationPreference = require('../models/NotificationPreference');
const { notify, whenReady } = require('./notify');
const { clockText, todayLocal, zonedInstant, endOfLocalDay } = require('./dateUtils');

// The notifications of the system's existing events: who hears about what,
// and the text they see in the app. Each function is called after the event
// was saved and never throws (see utils/notify.js).

const LEAVE_TYPES = {
  during: 'خروج والعودة',
  end: 'انصراف قبل نهاية الدوام',
  start: 'تأخير عن بداية الدوام',
};
// A message that starts on a later day is announced that morning
const MESSAGE_ANNOUNCE_TIME = '08:00';

const idOf = (ref) => ref?._id || ref;
const clip = (text = '', max = 150) => {
  const t = String(text).trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
};
// "YYYY-MM-DD" → e.g. "الأحد، 8 نوفمبر"
const dayText = (date) =>
  new Intl.DateTimeFormat('ar-u-nu-latn', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(
    new Date(`${date}T00:00:00Z`)
  );
// "HH:mm" → e.g. "9:30 ص"
const hhmmText = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return new Intl.DateTimeFormat('ar-u-nu-latn', { hour: 'numeric', minute: '2-digit', timeZone: 'UTC' }).format(Date.UTC(2000, 0, 1, h, m));
};
const minutesText = (minutes) => {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m} دقيقة`;
  return m ? `${h} ساعة و${m} دقيقة` : `${h} ساعة`;
};
const remarksText = (remarks, reviewer) => (remarks?.trim() ? ` ملاحظة ${reviewer?.name || 'المراجع'}: ${clip(remarks)}` : '');
const leaveDetails = (l) => `${LEAVE_TYPES[l.type] || 'زمنية'} يوم ${dayText(l.date)}، من ${hhmmText(l.from)} إلى ${hhmmText(l.to)}.`;

// Who reviews an employee's requests: their manager, or every admin when
// they have none (the same people the approval pages show the request to)
const reviewersOf = async (employee) => {
  const managerId = idOf(employee.manager);
  if (managerId) {
    const manager = await User.findOne({ _id: managerId, isActive: true, role: { $in: ['manager', 'admin'] } })
      .select('_id')
      .lean();
    if (manager) return [manager._id];
  }
  const admins = await User.find({ role: 'admin', isActive: true }).select('_id').lean();
  return admins.map((a) => a._id);
};

const safely = async (fn) => {
  try {
    return await fn();
  } catch {
    return 0; // notify() logs its own failures; this covers looking up recipients
  }
};

// ----- Time leaves (زمنيات) -----

const timeLeaveRequested = (leave, employee) =>
  safely(async () =>
    notify({
      to: await reviewersOf(employee),
      type: 'timeLeave.requested',
      key: `timeLeave.requested:${leave._id}`,
      title: `طلب زمنية من ${employee.name}`,
      body: `${leaveDetails(leave)} السبب: ${clip(leave.reason)}`,
      link: (u) => `/${u.role}/time-leaves`,
      actor: employee._id,
    })
  );

const timeLeaveCancelled = (leave, employee, wasApproved) =>
  safely(async () =>
    notify({
      to: await reviewersOf(employee),
      type: 'timeLeave.cancelled',
      key: `timeLeave.cancelled:${leave._id}`,
      title: `ألغى ${employee.name} ${wasApproved ? 'زمنية مقبولة' : 'طلب زمنية'}`,
      body: leaveDetails(leave),
      link: (u) => `/${u.role}/time-leaves`,
      actor: employee._id,
    })
  );

const timeLeaveReviewed = (leave, reviewer) =>
  safely(() =>
    notify({
      to: [idOf(leave.user)],
      type: 'timeLeave.reviewed',
      key: `timeLeave.reviewed:${leave._id}`,
      title: leave.status === 'Approved' ? 'قُبلت زمنيتك' : 'رُفضت زمنيتك',
      body: leaveDetails(leave) + remarksText(leave.reviewRemarks, reviewer),
      link: '/employee/time-leaves',
      actor: reviewer._id,
    })
  );

// ----- Overtime -----

const overtimeRequested = (overtime, employee, { auto = false } = {}) =>
  safely(async () =>
    notify({
      to: await reviewersOf(employee),
      type: 'overtime.requested',
      key: `overtime.requested:${overtime._id}`,
      title: `طلب عمل إضافي من ${employee.name}`,
      body: `${overtime.requestedHours} ساعة يوم ${dayText(overtime.date)}${auto ? ' بعد تمديد الوقت' : ''}. السبب: ${clip(overtime.reason)}`,
      link: (u) => `/${u.role}/overtime`,
      actor: employee._id,
    })
  );

const overtimeReviewed = (overtime, reviewer) =>
  safely(() =>
    notify({
      to: [idOf(overtime.user)],
      type: 'overtime.reviewed',
      key: `overtime.reviewed:${overtime._id}`,
      title: overtime.status === 'Approved' ? 'قُبل طلب العمل الإضافي' : 'رُفض طلب العمل الإضافي',
      body: `${overtime.requestedHours} ساعة يوم ${dayText(overtime.date)}.${remarksText(overtime.reviewRemarks, reviewer)}`,
      link: '/employee/overtime',
      actor: reviewer._id,
    })
  );

// ----- Attendance -----

// A check-in counted as late by the existing rules (lateness per work period,
// late return from a time leave)
const lateArrival = (record, employee, minutes, at, { returning = false } = {}) =>
  safely(async () =>
    notify({
      to: await reviewersOf(employee),
      type: 'attendance.late',
      key: `attendance.late:${record._id}:${record.sessions.length - 1}`,
      title: `تأخر ${employee.name}`,
      body: returning
        ? `عاد من الزمنية الساعة ${clockText(at)}، متأخراً ${minutesText(minutes)}.`
        : `سجّل حضوره الساعة ${clockText(at)}، متأخراً ${minutesText(minutes)} عن بداية الدوام.`,
      link: (u) => (u.role === 'manager' ? '/manager' : '/admin/attendance'),
      actor: employee._id,
    })
  );

// The system closed a period nobody checked out of
const autoClosed = (record, at, { extended = false } = {}) =>
  safely(() =>
    notify({
      to: [idOf(record.user)],
      type: 'attendance.autoClosed',
      key: `attendance.autoClosed:${record._id}:${record.sessions.length - 1}`,
      title: 'أُغلقت فترة حضورك تلقائياً',
      body:
        `يوم ${dayText(record.date)} الساعة ${clockText(at)}، لأنك لم تسجّل الانصراف${extended ? ' بعد تمديد الوقت' : ''}. ` +
        'إن كنت قد عملت بعد هذا الوقت فأبلغ مديرك لتصحيحه.',
      link: '/employee/history',
    })
  );

const attendanceEdited = (record, admin, { manual = false, reason = '' } = {}) =>
  safely(() =>
    notify({
      to: [idOf(record.user)],
      type: 'attendance.edited',
      key: `attendance.edited:${record._id}:${record.edits?.length || 0}`,
      title: manual ? 'أضاف المسؤول حضوراً لك' : 'عدّل المسؤول أوقات حضورك',
      body: `يوم ${dayText(record.date)}. السبب: ${clip(reason)}`,
      link: '/employee/history',
      actor: admin._id,
    })
  );

const scheduleChanged = (user, admin) =>
  safely(() =>
    notify({
      to: user.role === 'employee' ? [user._id] : [],
      type: 'schedule.changed',
      key: `schedule.changed:${user._id}:${user.updatedAt?.getTime?.() || Date.now()}`,
      title: 'تم تحديث جدول دوامك',
      body: 'غيّر المسؤول أيام دوامك أو ساعاته. راجع «دوامك الأسبوعي» في صفحة تسجيل الحضور.',
      link: '/employee',
      actor: admin._id,
    })
  );

// A work period started and the employee hasn't checked in
const checkInReminder = (userId, date, index, shift, periodEnd) =>
  safely(() =>
    notify({
      to: [userId],
      type: 'reminder.checkIn',
      key: `reminder.checkIn:${date}:${index}`,
      title: 'لم تسجّل حضورك بعد',
      body: `بدأت فترة دوامك الساعة ${hhmmText(shift.start)}. سجّل حضورك من صفحة تسجيل الحضور والانصراف.`,
      link: '/employee',
      pushUntil: periodEnd,
    })
  );

// The open period reached its end: the grace minutes to check out are running
const checkOutReminder = (record, { extended = false, closesAt, graceMinutes }) =>
  safely(() =>
    notify({
      to: [idOf(record.user)],
      type: 'reminder.checkOut',
      key: `reminder.checkOut:${record._id}:${new Date(record.autoCloseAt).getTime()}`,
      title: extended ? 'ما زالت فترتك الممددة مفتوحة' : 'انتهى وقت فترة دوامك',
      body: extended
        ? `سجّل انصرافك الآن، وإلا ستُغلق الفترة تلقائياً خلال ${graceMinutes} دقائق دون احتساب الوقت الممدد.`
        : `سجّل انصرافك، أو مدّد الوقت إن كنت ما زلت تعمل. ستُغلق الفترة تلقائياً خلال ${graceMinutes} دقائق.`,
      link: '/employee',
      pushUntil: closesAt,
    })
  );

// ----- Messages from the administration -----

const messageSent = (message, sender) =>
  safely(async () => {
    const to = message.toAll
      ? (await User.find({ isActive: true, _id: { $ne: sender._id } }).select('_id').lean()).map((u) => u._id)
      : message.recipients;
    const later = message.from > todayLocal();
    const availableAt = later ? zonedInstant(message.from, MESSAGE_ANNOUNCE_TIME) : null;
    const start = availableAt || new Date();
    return notify({
      to,
      type: 'message',
      key: `message:${message._id}`,
      title: clip(message.title, 100),
      body: clip(message.body, 400),
      actor: sender._id,
      availableAt,
      pushUntil: new Date(Math.min(start.getTime() + 24 * 3600e3, endOfLocalDay(message.to).getTime())),
    });
  });

// A deleted message stops appearing everywhere, the notification centre too
const messageDeleted = (messageId) =>
  whenReady('message deleted', () => Notification.deleteMany({ type: 'message', key: `message:${messageId}` }));

// ----- Accounts -----

// A new device is registered next: the old one must stop receiving pushes
const deviceReset = (userId) => whenReady('device reset', () => PushSubscription.deleteMany({ user: userId }));

const userDeleted = (userId) =>
  whenReady('user deleted', () =>
    Promise.all([
      Notification.deleteMany({ user: userId }),
      PushSubscription.deleteMany({ user: userId }),
      NotificationPreference.deleteOne({ _id: userId }),
    ])
  );

module.exports = {
  timeLeaveRequested,
  timeLeaveCancelled,
  timeLeaveReviewed,
  overtimeRequested,
  overtimeReviewed,
  lateArrival,
  autoClosed,
  attendanceEdited,
  scheduleChanged,
  checkInReminder,
  checkOutReminder,
  messageSent,
  messageDeleted,
  deviceReset,
  userDeleted,
};
