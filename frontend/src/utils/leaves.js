import { store } from '../app/store';
import { getDeviceId } from './deviceId';
import { formatDateLong } from './format';

// Leave requests (إجازات): labels, day counts and attachment files.

export const LEAVE_STATUS = {
  Pending: { label: 'قيد المراجعة', variant: 'warning' },
  Approved: { label: 'مقبول', variant: 'success' },
  Rejected: { label: 'مرفوض', variant: 'danger' },
  Cancelled: { label: 'ملغي', variant: 'muted' },
};
export const leaveStatusLabel = (s) => LEAVE_STATUS[s]?.label || s || '-';

export const COUNT_MODES = {
  working: { label: 'أيام العمل', hint: 'لا تُحسب أيام الإجازة الأسبوعية للموظف' },
  calendar: { label: 'أيام تقويمية', hint: 'يُحسب كل يوم في الفترة' },
};

export const HISTORY_ACTIONS = {
  submitted: 'قدّم الطلب',
  attachmentAdded: 'أضاف مرفقاً',
  attachmentRemoved: 'حذف مرفقاً',
  approved: 'وافق على الطلب',
  rejected: 'رفض الطلب',
  cancelled: 'ألغى الطلب',
  revoked: 'ألغى الإجازة المقبولة',
};

// e.g. "يوم واحد"، "يومان"، "5 أيام"، "12 يوماً"، "2.5 يوم"
export const daysText = (n) => {
  const v = Number(n) || 0;
  if (!Number.isInteger(v)) return `${v} يوم`;
  if (v === 0) return '0 يوم';
  if (v === 1) return 'يوم واحد';
  if (v === 2) return 'يومان';
  if (v >= 3 && v <= 10) return `${v} أيام`;
  return `${v} يوماً`;
};

// "من 9 نوفمبر 2026 إلى 13 نوفمبر 2026", or one day
export const rangeText = (r) =>
  r.startDate === r.endDate ? formatDateLong(r.startDate) : `من ${formatDateLong(r.startDate)} إلى ${formatDateLong(r.endDate)}`;

// The period in one short line for tables, e.g. "2026-11-15 إلى 2026-11-19"
export const periodShort = (r) => (r.startDate === r.endDate ? r.startDate : `${r.startDate} إلى ${r.endDate}`);

export const fileSizeText = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} ك.ب` : `${(bytes / 1024 / 1024).toFixed(1)} م.ب`;

export const MAX_FILES = 3;
export const MAX_FILE_BYTES = 2 * 1024 * 1024;
export const ACCEPTED_FILES = 'application/pdf,image/jpeg,image/png,image/webp';
const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_IMAGE_SIDE = 2000;

// Phone photos are large: shrink them before upload (the server takes 2 MB).
// PDFs are sent as they are.
export const prepareFile = async (file) => {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (isPdf) {
    if (file.size > MAX_FILE_BYTES) throw new Error(`حجم «${file.name}» أكبر من 2 ميغابايت`);
    return { file, name: file.name };
  }
  if (!IMAGE_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
    throw new Error(`نوع «${file.name}» غير مدعوم. أرفق ملف PDF أو صورة.`);
  }
  if (IMAGE_TYPES.includes(file.type) && file.size <= 1.5 * 1024 * 1024) return { file, name: file.name };
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error(`تعذرت قراءة الصورة «${file.name}». جرّب صورة JPG أو PNG.`);
  }
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  for (const quality of [0.85, 0.72, 0.6]) {
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
    if (blob && blob.size <= MAX_FILE_BYTES) {
      return { file: blob, name: `${file.name.replace(/\.[^.]+$/, '') || 'صورة'}.jpg` };
    }
  }
  throw new Error(`الصورة «${file.name}» كبيرة جداً حتى بعد ضغطها`);
};

// Attachments need the session's headers, so they are fetched rather than
// linked. Returns an object URL; revoke it when done.
export const fetchAttachmentUrl = async (requestId, attId) => {
  const base = import.meta.env.VITE_API_URL || '/api';
  const res = await fetch(`${base}/leaves/${requestId}/attachments/${attId}`, {
    headers: { authorization: `Bearer ${store.getState().auth.token}`, 'x-device-id': getDeviceId() },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || 'تعذر فتح المرفق');
  }
  return URL.createObjectURL(await res.blob());
};

export const currentYear = () => new Date().getFullYear();
