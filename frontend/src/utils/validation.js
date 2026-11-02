// Client-side checks that mirror the API rules, so problems show in Arabic
// next to the field before anything is sent. The API re-checks everything.

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export const MIN_PASSWORD = 6;
export const MIN_OVERTIME_HOURS = 0.5;

export const hasErrors = (errors) => Object.values(errors).some(Boolean);

const checkEmail = (email) => {
  if (!email.trim()) return 'البريد الإلكتروني مطلوب';
  if (!EMAIL_RE.test(email.trim())) return 'صيغة البريد الإلكتروني غير صحيحة، مثال: name@company.com';
  return undefined;
};

export function validateLoginForm({ email, password }) {
  return {
    email: checkEmail(email),
    password: password ? undefined : 'كلمة المرور مطلوبة',
  };
}

export function validateAccountForm({ name, email, password, role, managerId }) {
  let passwordError;
  if (!password) passwordError = 'كلمة المرور مطلوبة';
  else if (password.length < MIN_PASSWORD) passwordError = `كلمة المرور يجب أن تكون ${MIN_PASSWORD} أحرف على الأقل`;

  return {
    name: name.trim() ? undefined : 'الاسم الكامل مطلوب',
    email: checkEmail(email),
    password: passwordError,
    managerId: role === 'employee' && !managerId ? 'اختر المدير المسؤول عن هذا الموظف' : undefined,
  };
}

export function validateNewPassword({ password, confirm }) {
  let passwordError;
  if (!password) passwordError = 'كلمة المرور الجديدة مطلوبة';
  else if (password.length < MIN_PASSWORD) passwordError = `كلمة المرور يجب أن تكون ${MIN_PASSWORD} أحرف على الأقل`;

  let confirmError;
  if (!confirm) confirmError = 'أعد كتابة كلمة المرور للتأكيد';
  else if (confirm !== password) confirmError = 'كلمتا المرور غير متطابقتين';

  return { password: passwordError, confirm: confirmError };
}

// Each working day may have hours (both ends, same day) or none (flexible)
export function validateWorkSchedule({ days }) {
  const errors = {};
  for (const d of days) {
    let message;
    if (!d.off) {
      if (d.start && !d.end) message = 'حدّد وقت نهاية الدوام';
      else if (d.end && !d.start) message = 'حدّد وقت بداية الدوام';
      else if (d.start && d.end && d.end <= d.start) message = 'وقت النهاية يجب أن يكون بعد وقت البداية';
    }
    errors[`day${d.day}`] = message;
  }
  errors.offDays = days.every((d) => d.off) ? 'لا يمكن أن تكون كل أيام الأسبوع إجازة' : undefined;
  return errors;
}

// Office geofence form; `coords` is what parseCoords made of the location field
export function validateGeofenceForm({ enabled, location, coords, radius, maxAccuracy }) {
  let locationError;
  if (location.trim() && !coords) locationError = 'اكتب الإحداثيات بالصيغة: خط العرض، خط الطول. مثال: 33.3152, 44.3661';
  else if (enabled && !coords) locationError = 'حدّد موقع مقر العمل قبل تفعيل التحقق من الموقع';

  return {
    location: locationError,
    radius: isIntBetween(radius, 20, 20000) ? undefined : 'نطاق الحضور يجب أن يكون بين 20 و20000 متر',
    maxAccuracy: isIntBetween(maxAccuracy, 10, 5000) ? undefined : 'هامش الدقة يجب أن يكون بين 10 و5000 متر',
  };
}

const isIntBetween = (value, min, max) => {
  if (value === '' || value === null) return false;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max;
};

// Applies one field change; switching away from "employee" clears the
// manager, since managers and admins don't report to anyone.
export const updateAccountForm = (form, { name, value }) =>
  name === 'role' && value !== 'employee' ? { ...form, role: value, managerId: '' } : { ...form, [name]: value };

export function validateOvertimeForm({ date, requestedHours, reason }, today) {
  let dateError;
  if (!date) dateError = 'التاريخ مطلوب';
  else if (date > today) dateError = 'لا يمكن طلب عمل إضافي لتاريخ مستقبلي';

  let hoursError;
  if (requestedHours === '' || requestedHours === null) hoursError = 'عدد الساعات مطلوب';
  else if (!(Number(requestedHours) >= MIN_OVERTIME_HOURS)) hoursError = `أقل عدد ساعات مسموح به هو ${MIN_OVERTIME_HOURS} ساعة`;

  return {
    date: dateError,
    requestedHours: hoursError,
    reason: String(reason || '').trim() ? undefined : 'سبب العمل الإضافي مطلوب',
  };
}
