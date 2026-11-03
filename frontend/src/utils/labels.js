// Arabic display labels for values the API stores in English (enums).

export const STATUS_LABELS = {
  Completed: 'مكتمل',
  Incomplete: 'غير مكتمل',
  Absent: 'غائب',
  Valid: 'صحيح',
  Invalid: 'غير صحيح',
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
