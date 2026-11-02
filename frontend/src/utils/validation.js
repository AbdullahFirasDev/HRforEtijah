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
