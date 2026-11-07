// Arabic display labels for values the API stores in English (enums).

export const STATUS_LABELS = {
  Completed: 'مكتمل',
  Incomplete: 'غير مكتمل',
  Absent: 'غائب',
  Pending: 'قيد الانتظار',
  Approved: 'مقبول',
  Rejected: 'مرفوض',
  Cancelled: 'ملغاة',
};

export const ROLE_LABELS = {
  employee: 'موظف',
  manager: 'مدير',
  admin: 'مسؤول النظام',
};

export const statusLabel = (status) => STATUS_LABELS[status] || status || '-';
export const roleLabel = (role) => ROLE_LABELS[role] || role || '-';

// Kinds of notifications a person can switch off (backend/utils/notify.js CATEGORIES)
export const NOTIFICATION_CATEGORIES = {
  requests: { label: 'طلبات بانتظار مراجعتك', hint: 'طلبات الزمنيات والعمل الإضافي من موظفيك، وإلغاء الزمنيات' },
  team: { label: 'تأخر أعضاء الفريق', hint: 'عندما يسجّل أحد موظفيك حضوره متأخراً عن بداية دوامه' },
  decisions: { label: 'الرد على طلباتي', hint: 'قبول زمنياتك وطلبات العمل الإضافي أو رفضها' },
  attendance: { label: 'سجل حضوري وجدول دوامي', hint: 'إغلاق فترة تلقائياً، وتعديل المسؤول لأوقاتك، وتغيير جدول دوامك' },
  reminders: {
    label: 'تذكير الحضور والانصراف',
    hint: 'عند بداية فترة دوامك دون تسجيل حضور، وعند نهايتها قبل الإغلاق التلقائي',
  },
  announcements: { label: 'رسائل الإدارة', hint: 'الرسائل والتعميمات التي يرسلها مسؤول النظام' },
};
